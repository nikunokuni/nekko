// ══════════════════════════════════════════════════
// kifuFields.js  ―  棋譜の項目台帳（キー名 ↔ DB列名 ↔ 既定値の唯一の出どころ）
//
//   nodeFields.js の棋譜版。ここに1行足せば、作成・更新・読み込み・
//   一覧の select 列がすべて追従する。
//
//   なぜ台帳にしたか：以前は同じ対応を db.js の中で**5回**書いていた
//   （createKifu の引数／insert オブジェクト／updateKifu の map ／
//     kifuRowToKifu ／ KIFU_META_COLUMNS）。
//   棋譜は列が増え続けている領域で（kifus 追加 → タグ → 勝敗・戦型）、
//   そのたびに5か所を手で直すことになる。
//   しかも書き漏らしても画面は壊れず、その項目だけが静かに落ちる。
//   実際に KIFU_META_COLUMNS で起きている：meta_parsed の記載漏れで
//   全棋譜が「未解析」と誤判定されていた（db.js の当時のコメントに記録あり）。
// ══════════════════════════════════════════════════

import { createFieldMapper } from "./fieldRegistry.js";

// 各項目の定義（意味は fieldRegistry.js を参照）
export const KIFU_FIELDS = [
  { key: "name",       column: "name",        def: "" },
  { key: "memo",       column: "memo",        def: "" },
  { key: "tags",       column: "tags",        def: () => [] },

  // ── 重い列。一覧・分析では読まない（heavy）──
  // 局面のスナップショット列と KIF/CSA の原文。どちらも数KB〜あり、
  // 一覧に混ぜると件数ぶんの転送量になる。
  // 中身の差し替えは「取り込み直し」＝別の棋譜として作る操作なので更新もしない
  { key: "snapshots",  column: "snapshots",   def: () => [], heavy: true, noPatch: true },
  { key: "sourceText", column: "source_text", def: "",       heavy: true, noPatch: true },

  // 手数はスナップ数から決まる（createKifu が計算して入れる）ので、
  // 呼び出し側から受け取らない＝noInsert。あとから変わるものでもない
  { key: "moveCount",  column: "move_count",  def: 0, noInsert: true, noPatch: true },

  // ── 対局情報（傾向分析用）──
  { key: "senteName",  column: "sente_name",  def: "" },
  { key: "goteName",   column: "gote_name",   def: "" },
  { key: "handicap",   column: "handicap",    def: "" },
  { key: "result",     column: "result",      def: null },   // 'sente' | 'gote' | 'draw' | null
  { key: "mySide",     column: "my_side",     def: null },   // 'sente' | 'gote' | null
  { key: "playedAt",   column: "played_at",   def: null },
  { key: "features",   column: "features",    def: null },
  { key: "metaParsed", column: "meta_parsed", def: false },

  // 作成日時はDBの既定値が入れる。送らないし、あとから変えない
  { key: "createdAt",  column: "created_at",  def: null, noInsert: true, noPatch: true },
];

const mapper = createFieldMapper(KIFU_FIELDS);

/** DBの棋譜行（snake_case）→ 内部形式（camelCase）。
 *  一覧取得（snapshots なし）と単体取得（snapshots あり）の両方に対応する
 *  ―― 取っていない列は台帳の既定値で埋まる。 */
export function kifuRowToKifu(row) {
  return { id: row.id, ...mapper.rowToObj(row) };
}

/** createKifu の引数 → insert する行。user_id と move_count は db.js が足す。 */
export const kifuToInsertRow = mapper.toInsertRow;

/** updateKifu のパッチ（camelCase）→ update する行（snake_case）。 */
export const kifuPatchToRow = mapper.patchToRow;

/** 一覧・分析で読む列（重い snapshots / source_text を除いたすべて）。
 *  手で並べない：1つ書き漏らすとその項目だけが静かに落ちる。 */
export const KIFU_META_COLUMNS = mapper.columnList({ includeHeavy: false, extra: ["id"] });
