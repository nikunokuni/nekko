// ══════════════════════════════════════════════════
// treeOps.js  ―  ツリー（ノードマップ）の純粋な変更ロジック
//
//   childIds / merge_parent_ids / tags の整合をここ1箇所で扱う。
//   以前は各ハンドラ（App.jsx）が setActiveTree の中で手作業に組み替えて
//   おり、並び順・合流参照残り・タグ再計算漏れといった不整合バグが繰り返し
//   発生していた。その整合ロジックを純粋関数へ集約して再発を防ぐ。
//
//   すべて副作用のない純粋関数（tree in → 新tree out）。DBアクセスは含まない。
//   tree は { id, name, tags, nodes:{[id]:node}, rootId, ... }、
//   node は { id, parentId, childIds, mergeParentIds, isMergeTarget,
//            sortOrder, usageLevel, myApproach, isRoot, ... }（内部camelCase形式）。
// ══════════════════════════════════════════════════

// タグ配列の同値判定（順序込み。従来の JSON.stringify 比較と同じ基準）
function tagsEqual(a, b) {
  return JSON.stringify(a || []) === JSON.stringify(b || []);
}

// ══════════════════════════════════════════════════
// まとめノード（束ね）と、棋譜分岐の並び
//
//   どちらも「マップをどう見せるか」の計算だが、画面（MindMapScreen）に
//   置かずここに集めてある。SVGの座標計算に混ぜると、条件が合っているか
//   目で追うしかなくなる。純粋関数にしておけば test-harness から直接叩ける。
// ══════════════════════════════════════════════════

/** 畳んだまとめノードの配下として隠れるIDの集合。
 *
 *  入れ子のまとめノードも含めて配下は全部隠す。「次のまとめが出るまで」で
 *  止めると、畳んだのに孫のまとめノードだけが画面に残り、親を失った島が浮く。
 *  「次のまとめまで」という境界は chapterOf（章の帰属）の側で使う。
 *
 *  実子（childIds）だけを辿る。合流（mergeParentIds）は線であって所属ではないので、
 *  合流先まで巻き込んで隠すと、関係のない枝が消える。
 *
 *  まとめでなくなったノード・消えたノードのIDは黙って無視する
 *  （畳み状態は端末ローカルに残るため、ツリー側と食い違うことがある）。 */
export function collapsedHiddenIds(nodes, collapsedIds) {
  const hidden = new Set();
  if (!nodes) return hidden;
  for (const id of collapsedIds || []) {
    const node = nodes[id];
    if (!node || !node.isSummary) continue;
    const stack = [...(node.childIds || [])];
    while (stack.length) {
      const cur = stack.pop();
      if (hidden.has(cur) || !nodes[cur]) continue;
      hidden.add(cur);
      stack.push(...(nodes[cur].childIds || []));
    }
  }
  return hidden;
}

/** 各ノードが属する章（＝ルート方向へ遡って最初に見つかるまとめノード）。
 *  自分がまとめなら自分自身。見つからなければ null。
 *  畳みには使わない（まとめ一覧・章ごとの件数用）。 */
export function chapterOf(nodes, rootId) {
  const out = new Map();
  if (!nodes) return out;
  const walk = (id, chapter) => {
    const n = nodes[id];
    if (!n || out.has(id)) return;   // out.has は循環したツリーでの無限再帰よけ
    const own = n.isSummary ? id : chapter;
    out.set(id, own);
    for (const cid of n.childIds || []) walk(cid, own);
  };
  walk(rootId, null);
  return out;
}

/** 見えている最も近い祖先を返す（自分が見えていれば自分自身）。
 *  畳んだ束の中に端点がある合流線を、束の代表（まとめノード）へ寄せるために使う。
 *  寄せずに描画側で positions を引くと、端点が無いぶんの線が黙って消える。 */
export function visibleAnchor(nodes, id, hiddenIds) {
  let cur = id;
  const seen = new Set();
  while (cur && hiddenIds?.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = nodes?.[cur]?.parentId ?? null;
  }
  return cur ?? null;
}

/** 部分木（自分を含まない子孫）のノード数とステータス内訳。
 *  畳んだノードのバッジに出す。中が見えなくても「未完成が何件あるか」が
 *  分かるようにしておかないと、畳んだ枝がそのまま忘れられる。 */
export function subtreeCounts(nodes, id) {
  const out = { total: 0, done: 0, wip: 0, todo: 0 };
  if (!nodes?.[id]) return out;
  const stack = [...(nodes[id].childIds || [])];
  const seen  = new Set();
  while (stack.length) {
    const cur = stack.pop();
    const n = nodes[cur];
    if (!n || seen.has(cur)) continue;
    seen.add(cur);
    out.total++;
    out[n.status === "done" || n.status === "wip" ? n.status : "todo"]++;
    stack.push(...(n.childIds || []));
  }
  return out;
}

/** 棋譜の分岐が並ぶ「幹」を描く親かどうか。
 *
 *  条件は「親が棋譜を持つ」こと。branchFromMoveIndex は**親の棋譜の中での
 *  インデックス**なので、親が棋譜を持っているときだけ同じ時間軸に乗る。
 *  子の側の有無で判定してはいけない ——「とりあえず」配下のノードも棋譜から
 *  作られて branchFromMoveIndex を持つが、あれは別々の対局の切り出しであって、
 *  第3手と第20手を縦に並べても意味が無い（「とりあえず」自身は棋譜を持たない）。 */
export function isTrunkParent(nodes, parentId) {
  const parent = nodes?.[parentId];
  if (!parent || (parent.kifu || []).length === 0) return false;
  const branched = (parent.childIds || [])
    .filter((cid) => nodes[cid] && nodes[cid].branchFromMoveIndex != null);
  return branched.length >= 2;
}

/** 子ノードの表示順。マップの縦位置と詳細画面の子一覧はこの1つの関数から作る。
 *  （2箇所で別々に並べると、マップと一覧で順番が食い違う）
 *
 *  childIds は既に sort_order → created_at 順（db.js の fetch）なので、
 *  幹モードでないときはそのまま返す。幹モードでは手数順に並べ替える。
 *  手で作ったノード（branchFromMoveIndex が null）は手数軸に乗らないので先頭。 */
export function orderedChildIds(nodes, parentId) {
  const parent = nodes?.[parentId];
  if (!parent) return [];
  const ids = (parent.childIds || []).filter((id) => nodes[id]);
  if (!isTrunkParent(nodes, parentId)) return ids;
  return ids
    .map((id, i) => ({ id, i }))   // 同着のときに元の順を保つ（sort の安定性に頼らない）
    .sort((a, b) => {
      const ma = nodes[a.id].branchFromMoveIndex ?? -1;
      const mb = nodes[b.id].branchFromMoveIndex ?? -1;
      return ma !== mb ? ma - mb : a.i - b.i;
    })
    .map((e) => e.id);
}

/** 各子の分岐順位（0始まり）。マップの縦オフセットに使う。
 *  手数を持たない子・幹モードでない親では全員 0（＝今までどおりの位置）。
 *
 *  順位は等間隔に振る。実際の手数に比例させると、第3手と第120手の分岐で
 *  巨大な空白の幹ができる。実際の手数は目盛りの文字で読ませる（路線図と同じ）。 */
export function branchRanks(nodes, parentId) {
  const out = new Map();
  const parent = nodes?.[parentId];
  if (!parent) return out;
  const trunk = isTrunkParent(nodes, parentId);
  let rank = 0;
  for (const id of orderedChildIds(nodes, parentId)) {
    const hasMove = nodes[id].branchFromMoveIndex != null;
    out.set(id, trunk && hasMove ? rank++ : 0);
  }
  return out;
}

/** 各子を幹の左右どちらに出すか。隣り合う手数の枝が必ず反対側へ離れるので、
 *  縦の間隔を詰めても「どの目盛りから出た枝か」を追える。
 *
 *  数えるのは**作った順**（childIds の並び＝sort_order 順）であって手数順ではない。
 *  手数順で数えると、あとから間の手数に枝を足したときに以降の枝が全部反対側へ飛び、
 *  マップが勝手に組み替わる。棋譜は前から見るので普段は両者が一致し、
 *  食い違うのは「後から間に足したとき」＝いちばんマップに動いてほしくないときになる。 */
export function branchSides(nodes, parentId) {
  const out = new Map();
  const parent = nodes?.[parentId];
  if (!parent) return out;
  (parent.childIds || []).filter((id) => nodes[id]).forEach((id, i) => {
    out.set(id, i % 2 === 0 ? "R" : "L");
  });
  return out;
}

// 頻度4以上のノードの「自分の戦法(myApproach)」を頻度降順で集約し上位4個を返す。
// （一覧カード・公開フィルタに出すツリー全体のタグ）
export function collectTreeTags(nodeMap) {
  const sorted = Object.values(nodeMap)
    .filter((n) => !n.isRoot && (n.usageLevel || 0) >= 4)
    .sort((a, b) => (b.usageLevel || 0) - (a.usageLevel || 0));

  const seen = new Set();
  const tags = [];
  for (const n of sorted) {
    for (const t of n.myApproach || []) {
      if (!seen.has(t)) {
        seen.add(t);
        tags.push(t);
        if (tags.length >= 4) return tags;
      }
    }
  }
  return tags;
}

// 兄弟ノードの sort_order の最大値+1 を返す（新規ノードを常に末尾に並べるため。
// 全ノード 0 のままだと、リロード時に sort_order を持つ既存ノードより前へ割り込む）
export function nextSortOrder(tree, parentId) {
  const childIds = tree?.nodes?.[parentId]?.childIds || [];
  const sibs = childIds.map((id) => tree.nodes[id]?.sortOrder ?? 0);
  return sibs.length ? Math.max(...sibs) + 1 : 0;
}

// ノード（内部形式）を追加し、親の childIds 末尾へ連結する。
// ルート未設定なら、追加ノードがルートのとき rootId を確定する。
export function addNode(tree, node) {
  if (!tree || !node) return tree;
  const nodes = { ...tree.nodes, [node.id]: node };
  if (node.parentId && nodes[node.parentId]) {
    nodes[node.parentId] = {
      ...nodes[node.parentId],
      childIds: [...(nodes[node.parentId].childIds || []), node.id],
    };
  }
  return { ...tree, nodes, rootId: tree.rootId ?? (node.isRoot ? node.id : null) };
}

// ノードのフィールドを更新する。
// recomputeTags=true のときはツリータグを再計算し、変化していれば tree.tags も更新する。
// 戻り値: { tree, tags }  tags は「変化した新タグ配列」または null（未変化＝DB保存不要）。
export function applyNodePatch(tree, nodeId, patch, { recomputeTags = false } = {}) {
  if (!tree || !tree.nodes[nodeId]) return { tree, tags: null };
  const nodes = { ...tree.nodes, [nodeId]: { ...tree.nodes[nodeId], ...patch } };
  let tags = null;
  if (recomputeTags) {
    const next = collectTreeTags(nodes);
    if (!tagsEqual(next, tree.tags)) tags = next;
  }
  const newTree = tags ? { ...tree, nodes, tags } : { ...tree, nodes };
  return { tree: newTree, tags };
}

// ノードの親を付け替える。旧親の childIds から外し、新親の childIds 末尾へ入れ、
// sort_order を更新する。
export function reparent(tree, nodeId, newParentId, sortOrder) {
  if (!tree || !tree.nodes[nodeId]) return tree;
  const nodes = { ...tree.nodes };
  const node = nodes[nodeId];
  const oldParentId = node.parentId;
  if (oldParentId && nodes[oldParentId]) {
    nodes[oldParentId] = {
      ...nodes[oldParentId],
      childIds: (nodes[oldParentId].childIds || []).filter((id) => id !== nodeId),
    };
  }
  if (nodes[newParentId]) {
    nodes[newParentId] = {
      ...nodes[newParentId],
      childIds: [...(nodes[newParentId].childIds || []), nodeId],
    };
  }
  nodes[nodeId] = { ...node, parentId: newParentId, sortOrder };
  return { ...tree, nodes };
}

// 合流（複数の親→1つの子）の親リストを更新する。
export function setMergeParents(tree, nodeId, mergeParentIds) {
  if (!tree || !tree.nodes[nodeId]) return tree;
  return {
    ...tree,
    nodes: {
      ...tree.nodes,
      [nodeId]: { ...tree.nodes[nodeId], mergeParentIds, isMergeTarget: mergeParentIds.length > 0 },
    },
  };
}

// ノード群を削除する。以下を一括で整合させる：
//   ・削除ノードを childIds に持つ親（parentId）の childIds から除く
//   ・残りノードの merge_parent_ids から削除IDを掃除する
//   ・ツリータグを残ったノードで再計算する
// 戻り値: { tree, mergeCleanups, tags }
//   mergeCleanups … [{ id, mergeParentIds, isMergeTarget }] 呼び出し側がDBへ保存する
//   tags          … 変化した新タグ配列 or null（未変化＝DB保存不要）
export function removeNodes(tree, idsToDelete, parentId = null) {
  if (!tree) return { tree, mergeCleanups: [], tags: null };
  const delSet = new Set(idsToDelete);

  // 残りノードの合流参照の掃除対象を先に洗い出す
  const mergeCleanups = [];
  for (const n of Object.values(tree.nodes)) {
    if (delSet.has(n.id)) continue;
    const refs = n.mergeParentIds || [];
    if (refs.some((id) => delSet.has(id))) {
      const cleaned = refs.filter((id) => !delSet.has(id));
      mergeCleanups.push({ id: n.id, mergeParentIds: cleaned, isMergeTarget: cleaned.length > 0 });
    }
  }

  const nodes = { ...tree.nodes };
  idsToDelete.forEach((id) => delete nodes[id]);
  // 合流参照の掃除を反映
  mergeCleanups.forEach((c) => {
    if (nodes[c.id]) {
      nodes[c.id] = { ...nodes[c.id], mergeParentIds: c.mergeParentIds, isMergeTarget: c.isMergeTarget };
    }
  });
  // 親の childIds から削除ノードを外す
  if (parentId && nodes[parentId]) {
    nodes[parentId] = {
      ...nodes[parentId],
      childIds: (nodes[parentId].childIds || []).filter((id) => !delSet.has(id)),
    };
  }

  const nextTags = collectTreeTags(nodes);
  const tags = tagsEqual(nextTags, tree.tags) ? null : nextTags;
  const newTree = tags ? { ...tree, nodes, tags } : { ...tree, nodes };
  return { tree: newTree, mergeCleanups, tags };
}
