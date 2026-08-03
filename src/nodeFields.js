// ══════════════════════════════════════════════════
// nodeFields.js  ―  ノードの項目台帳（キー名 ↔ DB列名 ↔ 既定値の唯一の出どころ）
//
//   ここに1行足すだけで、作成（insert）・更新（update）・読み込み（row→node）の
//   3方向すべてが追従する。
//
//   なぜ台帳にしたか：以前は同じ対応を db.js の中で3回書いていた
//   （createNode の引数リスト／insert オブジェクト／updateNode の map／nodeRowToNode）。
//   ノードは「項目を1つ増やす」変更が最も多く、そのたびに4か所を手で直すことになる。
//   しかも書き漏らしても画面は壊れず、その項目だけが静かに保存されない・読まれない。
//   実際に copy_tree で同じ形の事故が起きている（20260622_fix_copy_tree_rpc_columns.sql）。
//
//   supabase を触らない純粋な変換なので、test-harness からそのままテストできる
//   （db.js は import.meta.env を読むので Node から直接は import できない）。
// ══════════════════════════════════════════════════

import { createFieldMapper } from "./fieldRegistry.js";

// 持ち駒の空の状態。オブジェクトなので、共有せず毎回作る
const emptyHand = () => ({ p: 0, l: 0, n: 0, s: 0, g: 0, b: 0, r: 0 });

// 各項目の定義
//   key      … アプリ内（camelCase）のキー名
//   column   … DBの列名（snake_case）
//   def      … 既定値。作成時に値が無いとき／読み込み時に NULL だったときに使う。
//               関数を書くと呼ばれる（配列・オブジェクトを共有しないため）
//   noPatch  … true なら updateNode では変更できない（作成時にだけ決まる項目）
export const NODE_FIELDS = [
  { key: "label",       column: "label",        def: "" },
  { key: "status",      column: "status",       def: "todo" },
  { key: "parentId",    column: "parent_id",    def: null },
  { key: "board",       column: "board",        def: null },
  { key: "boardHidden", column: "board_hidden", def: false },
  { key: "sortOrder",   column: "sort_order",   def: 0 },
  { key: "stamps",      column: "stamps",       def: () => [] },
  { key: "memo",        column: "memo",         def: "" },
  // ルートと「とりあえず」の別は作成時に決まる。あとから付け替えるものではない
  { key: "isRoot",      column: "is_root",      def: false, noPatch: true },
  { key: "isInbox",     column: "is_inbox",     def: false, noPatch: true },
  { key: "isMergeTarget",  column: "is_merge_target",  def: false },
  { key: "mergeParentIds", column: "merge_parent_ids", def: () => [] },
  { key: "handSente",   column: "hand_sente",   def: emptyHand },
  { key: "handGote",    column: "hand_gote",    def: emptyHand },
  { key: "kifu",        column: "kifu",         def: () => [] },
  { key: "kifuImported", column: "kifu_imported", def: false },
  // 「第n手から分岐」の表示用。棋譜から切り出した時点で決まる
  { key: "branchFromMoveIndex", column: "branch_from_move_index", def: null, noPatch: true },
  { key: "usageLevel",  column: "usage_level",  def: 2 },
  { key: "winRate",     column: "win_rate",     def: null },
  { key: "situation",   column: "situation",    def: () => [] },
  { key: "myApproach",  column: "my_approach",  def: () => [] },
  { key: "orientation", column: "orientation",  def: null },
  { key: "likeLevel",   column: "like_level",   def: null },
  { key: "aim",         column: "aim",          def: "" },
  { key: "caution",     column: "caution",      def: "" },
  { key: "nextStudy",   column: "next_study",   def: "" },
  { key: "commentTags", column: "comment_tags", def: () => [] },
  { key: "turn",        column: "turn",         def: null },
  { key: "evaluation",  column: "evaluation",   def: null },
  { key: "whenToUse",   column: "when_to_use",  def: "" },
  { key: "openingFocus", column: "opening_focus", def: "" },
];

// 変換の中身は kifuFields.js と共通なので fieldRegistry.js に置いてある
const mapper = createFieldMapper(NODE_FIELDS);

/** DBの行 → アプリ内のノード。NULL は台帳の既定値で埋める。
 *  childIds は行には無く、buildTreeFromNodes が親子関係から組み立てる。 */
export function nodeRowToNode(row) {
  const node = { id: row.id, ...mapper.rowToObj(row) };
  node.childIds = [];
  return node;
}

/** createNode の引数 → insert する行。未指定の項目は台帳の既定値で埋める。
 *  tree_id / user_id は呼び出し側（db.js）が足す。 */
export const nodeToInsertRow = mapper.toInsertRow;

/** updateNode のパッチ（camelCase）→ update する行（snake_case）。
 *  台帳に無いキー・noPatch の項目は黙って捨てる（打ち間違いでDBを壊さないため）。 */
export const nodePatchToRow = mapper.patchToRow;
