// ══════════════════════════════════════════════════
// mapView.js  ―  マップの「見え方」の保存（端末ローカル）
//
//   まとめノードを畳んだか開いたかを localStorage に置く。
//
//   なぜDBに持たないか：
//     ・畳み方はツリーの中身ではなく「今この端末での見え方」でしかない
//     ・nodes を更新するとトリガーで trees.updated_at が動くため
//       （20260714_touch_tree_updated_at.sql）、畳んだだけでツリー一覧の
//       更新日と並び順が変わってしまう
//     ・公開ツリーをコピーした人に、作者の畳み方が正解として付いてくる
//   消えても「開いた状態で出てくる」だけなので、オンボーディングの既読と
//   同じ扱い（rewards.js の LEGACY_KEYS と同じ考え方）にしてある。
//
//   localStorage を直接触るのはこのファイルだけにする。画面に散らすと、
//   キー名の綴り違いが「保存されないけど動く」形で紛れ込む。
// ══════════════════════════════════════════════════

const KEY = (treeId) => `nekko_map_collapsed_${treeId}`;

/** 畳んでいるまとめノードのIDを読む。
 *  nodes を渡すと、消えたノード・まとめでなくなったノードのIDを落として返す
 *  （掃除しないと、削除したノードのIDが端末に残り続ける）。 */
export function readCollapsed(treeId, nodes = null) {
  if (!treeId) return new Set();
  let ids = [];
  try {
    const raw = localStorage.getItem(KEY(treeId));
    if (raw) ids = JSON.parse(raw);
  } catch { ids = []; }
  if (!Array.isArray(ids)) ids = [];
  if (nodes) ids = ids.filter((id) => nodes[id]?.isSummary);
  return new Set(ids);
}

/** 畳んでいるIDを書く。存在するまとめノードだけを残す。 */
export function writeCollapsed(treeId, collapsed, nodes = null) {
  if (!treeId) return;
  let ids = [...(collapsed || [])];
  if (nodes) ids = ids.filter((id) => nodes[id]?.isSummary);
  try {
    localStorage.setItem(KEY(treeId), JSON.stringify(ids));
  } catch {
    // 容量超過やプライベートモードでの失敗。畳み方が次回に残らないだけなので握りつぶす
  }
}
