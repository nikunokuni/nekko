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
