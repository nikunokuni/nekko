// nodeSort.js の純粋関数ユニットテスト（Nodeで直接実行）。
//   実行: node test-harness/nodeSort.test.mjs
//
// ノード検索と「呼び出し」が共用する並べ替え。ここが崩れても画面は落ちず、
// 並び順が静かに変わるだけなので、目でもE2Eでも見つけにくい。
// とくに未設定の扱いを外すと `undefined - 5` が NaN になり、比較関数が
// 「どちらが先とも言えない」を返して並びが不定になる（未設定の行が先頭に来る）。
import { NODE_SORTS, sortNodeRows } from "../src/nodeSort.js";

let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (detail ? "  — " + detail : "")); }
}

const ids = (rows) => rows.map((r) => r.id);

// 取得順（created_at 降順）で来た想定の行
const rows = () => [
  { id: "a", usage_level: 1, win_rate: 9, like_level: null },
  { id: "b", usage_level: 5, win_rate: null, like_level: 3 },
  { id: "c", usage_level: null, win_rate: 5, like_level: 5 },
];

// ── 選択肢の台帳 ──
check("NODE_SORTS: recent は列を持たない（取得順そのまま）",
  NODE_SORTS.find((s) => s.key === "recent")?.column === undefined);
check("NODE_SORTS: recent 以外はすべて列を持つ",
  NODE_SORTS.filter((s) => s.key !== "recent").every((s) => !!s.column));

// ── 並べ替え ──
check("recent は取得順のまま", eq(ids(sortNodeRows(rows(), "recent")), ["a", "b", "c"]));
check("知らないキーは取得順のまま", eq(ids(sortNodeRows(rows(), "なにこれ")), ["a", "b", "c"]));

check("頻度順は大きい順", eq(ids(sortNodeRows(rows(), "usageLevel")), ["b", "a", "c"]),
  JSON.stringify(ids(sortNodeRows(rows(), "usageLevel"))));
check("勝率順は大きい順", eq(ids(sortNodeRows(rows(), "winRate")), ["a", "c", "b"]),
  JSON.stringify(ids(sortNodeRows(rows(), "winRate"))));
check("好き度順は大きい順", eq(ids(sortNodeRows(rows(), "likeLevel")), ["c", "b", "a"]),
  JSON.stringify(ids(sortNodeRows(rows(), "likeLevel"))));

// ここが本命。未設定（null / 列そのものが無い）は必ず末尾。
// 「列そのものが無い」行を混ぜてあるのが要で、未設定の置き換えを外すと
// NaN 比較になり、この行が先頭へ飛ぶ（実際に確認済み）
{
  const mixed = [
    { id: "none" },                    // 列そのものが無い
    { id: "null", usage_level: null },
    { id: "low",  usage_level: 1 },
    { id: "high", usage_level: 5 },
  ];
  const got = ids(sortNodeRows(mixed, "usageLevel"));
  check("未設定は必ず末尾（列が無い場合も含む）",
    got[0] === "high" && got[1] === "low" && got.slice(2).sort().join() === "none,null",
    JSON.stringify(got));
}

// 元の配列は触らない（呼び出し側が state をそのまま渡すため、
// 破壊的に並べ替えると React が変化に気づけない）
{
  const src = rows();
  const before = ids(src);
  sortNodeRows(src, "usageLevel");
  check("元の配列を並べ替えない", eq(ids(src), before), JSON.stringify(ids(src)));
}

check("空配列でも落ちない", eq(sortNodeRows([], "usageLevel"), []));
check("引数なしでも落ちない", eq(sortNodeRows(), []));

console.log(`\n=== ${pass}/${pass + fail} passed ===`);
process.exit(fail ? 1 : 0);
