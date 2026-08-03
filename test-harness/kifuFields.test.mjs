// kifuFields.js（棋譜の項目台帳）の純粋関数ユニットテスト。
//   実行: node test-harness/kifuFields.test.mjs
//
// 見張りたいのは「台帳に1行足せば、作成・更新・読み込み・一覧の select が同時に追従する」こと。
// とくに一覧の列（KIFU_META_COLUMNS）は、1つ書き漏らすとその項目だけが undefined になり、
// 集計が静かに壊れる（meta_parsed の記載漏れで全棋譜が「未解析」と誤判定された前例がある）。
import {
  KIFU_FIELDS, kifuRowToKifu, kifuToInsertRow, kifuPatchToRow, KIFU_META_COLUMNS,
} from "../src/kifuFields.js";

let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (detail ? "  — " + detail : "")); }
}

// ── 台帳そのものの健全性 ──
{
  const keys = KIFU_FIELDS.map((f) => f.key);
  const cols = KIFU_FIELDS.map((f) => f.column);
  check("キー名に重複が無い", new Set(keys).size === keys.length);
  check("DB列名に重複が無い", new Set(cols).size === cols.length);
  const toSnake = (k) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
  const bad = KIFU_FIELDS.filter((f) => toSnake(f.key) !== f.column);
  check("キー名と列名の綴りが対応している", bad.length === 0,
    bad.map((f) => `${f.key}→${f.column}`).join(","));
}

// ── KIFU_META_COLUMNS（一覧・分析で読む列）──
{
  const cols = KIFU_META_COLUMNS.split(",").map((s) => s.trim());
  check("id を含む", cols.includes("id"));
  // 重い2列は一覧に混ぜない（件数ぶんの転送量になる）
  check("snapshots を含まない", !cols.includes("snapshots"));
  check("source_text を含まない", !cols.includes("source_text"));
  // 「重い2列以外はすべて入っている」が満たすべき条件。
  // ここが崩れた形が、実際に起きた meta_parsed の取りこぼし
  const want = KIFU_FIELDS.filter((f) => !f.heavy).map((f) => f.column);
  const missing = want.filter((c) => !cols.includes(c));
  check("重い列以外はすべて含む", missing.length === 0, "欠け: " + missing.join(","));
  check("meta_parsed を含む（過去に落ちた列）", cols.includes("meta_parsed"));
  check("features を含む（傾向集計に必要）", cols.includes("features"));

  // 取得した行を kifuRowToKifu に通したとき、undefined になる項目が無いこと。
  // 「列は取れているのに変換で落ちる」経路もここで塞ぐ
  const row = Object.fromEntries(cols.map((c) => [c, c === "id" ? "k1" : null]));
  const k = kifuRowToKifu(row);
  const undef = Object.entries(k).filter(([, v]) => v === undefined).map(([n]) => n);
  check("一覧の行を変換して undefined が出ない", undef.length === 0, undef.join(","));
}

// ── kifuToInsertRow ──
{
  const row = kifuToInsertRow({ name: "対局1" });
  check("渡した値はそのまま入る", row.name === "対局1");
  check("省略した項目は既定値（memo=\"\"）", row.memo === "");
  check("配列の既定値が入る（tags=[]）", eq(row.tags, []));
  check("未解析が既定（meta_parsed=false）", row.meta_parsed === false);

  // 手数はスナップ数から数え直すので db.js が入れる。台帳からは送らない
  check("move_count を送らない（db.js が計算する）", !("move_count" in row));
  // 作成日時はDBの既定値に任せる
  check("created_at を送らない（DBが入れる）", !("created_at" in row));
  // 重い列も作成時には必要（ここで保存しないと原文が失われる）
  check("snapshots は作成時には送る", "snapshots" in row);
  check("source_text は作成時には送る", "source_text" in row);

  // 既定値の配列を使い回すと、1件の編集が別の棋譜に漏れる
  const a = kifuToInsertRow({}), b = kifuToInsertRow({});
  a.tags.push("四間飛車");
  check("既定値の配列は使い回されない", eq(b.tags, []), JSON.stringify(b.tags));

  // undefined が来ても既定値に落ちる（it.analysis?.senteName が undefined になる経路がある）
  const u = kifuToInsertRow({ senteName: undefined, result: undefined });
  check("undefined は既定値に落ちる（文字列）", u.sente_name === "");
  check("undefined は既定値に落ちる（null許容）", u.result === null);
}

// ── kifuRowToKifu ──
{
  const k = kifuRowToKifu({ id: "k1", name: "対局1", meta_parsed: true, move_count: 0 });
  check("id は素通し", k.id === "k1");
  check("列名からキー名へ変換される", k.metaParsed === true);
  check("未取得の項目は既定値（snapshots=[]）", eq(k.snapshots, []));
  check("未取得の項目は既定値（tags=[]）", eq(k.tags, []));
  // 0手の棋譜は保存対象外だが、変換で 0 が既定値に化けないことは押さえておく
  check("手数0が既定値に化けない", k.moveCount === 0);
  check("勝敗の未設定は null（'draw' と区別する）", k.result === null);
}

// ── kifuPatchToRow ──
{
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  check("パッチが列名に変換される",
    eq(sorted(kifuPatchToRow({ mySide: "sente", metaParsed: true })),
       sorted({ my_side: "sente", meta_parsed: true })));

  check("台帳に無いキーは捨てる", eq(kifuPatchToRow({ nosuchField: 1 }), {}));
  // 重い2列は「取り込み直し＝別の棋譜」なので更新経路を持たせない
  check("noPatch の項目は捨てる（snapshots）", eq(kifuPatchToRow({ snapshots: [1] }), {}));
  check("noPatch の項目は捨てる（sourceText）", eq(kifuPatchToRow({ sourceText: "x" }), {}));
  check("noPatch の項目は捨てる（moveCount）", eq(kifuPatchToRow({ moveCount: 5 }), {}));

  // 自分の側を「未確定」に戻す・メモを空にする操作は正当なので通す
  check("null を渡せる（未確定に戻す）", eq(kifuPatchToRow({ mySide: null }), { my_side: null }));
  check("空文字を渡せる", eq(kifuPatchToRow({ memo: "" }), { memo: "" }));
  check("false を渡せる", eq(kifuPatchToRow({ metaParsed: false }), { meta_parsed: false }));
  check("渡していない項目は含まれない", Object.keys(kifuPatchToRow({ memo: "m" })).length === 1);
}

console.log(`\n=== ${pass}/${pass + fail} passed ===`);
process.exit(fail ? 1 : 0);
