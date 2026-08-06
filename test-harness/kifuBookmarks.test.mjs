// kifuBookmarks.js の純粋関数ユニットテスト（Nodeで直接実行）。
//   実行: node test-harness/kifuBookmarks.test.mjs
//
// しおりは「見つける作業」と「ノードにする作業」をつなぐ受け皿なので、
// 壊れても画面は落ちず、**印が静かに消える／増える**だけになる。
// 消えたことは、あとで探し直して初めて気づく（そのときには手遅れ）。
import {
  normalizeBookmarks, hasBookmark, toggleBookmark, markBookmarkDone, pendingBookmarks,
} from "../src/kifuBookmarks.js";

let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (detail ? "  — " + detail : "")); }
}

// ── normalize ──
check("normalize: 配列でなければ空", eq(normalizeBookmarks(null), []) && eq(normalizeBookmarks(undefined), []));
check("normalize: 手数の昇順に並べる",
  eq(normalizeBookmarks([{ ply: 30 }, { ply: 4 }, { ply: 12 }]).map((b) => b.ply), [4, 12, 30]));
check("normalize: 数字だけの古い形も受け取る",
  eq(normalizeBookmarks([12, 4]), [{ ply: 4, done: false }, { ply: 12, done: false }]));
check("normalize: 初期局面（0手）は捨てない",
  eq(normalizeBookmarks([{ ply: 0 }]), [{ ply: 0, done: false }]));
check("normalize: 数値でない・負の ply は捨てる",
  eq(normalizeBookmarks([{ ply: "あ" }, { ply: -1 }, { ply: 1.5 }, { ply: 3 }]), [{ ply: 3, done: false }]));

// 重複したときに done を落とすと「ノードにしたのに未処理に見える」状態が残る
check("normalize: 重複は done が立っているほうを残す",
  eq(normalizeBookmarks([{ ply: 8, done: true }, { ply: 8, done: false }]), [{ ply: 8, done: true }]),
  JSON.stringify(normalizeBookmarks([{ ply: 8, done: true }, { ply: 8, done: false }])));

// ── toggle ──
check("toggle: 無ければ付ける", eq(toggleBookmark([], 10), [{ ply: 10, done: false }]));
check("toggle: あれば外す", eq(toggleBookmark([{ ply: 10, done: false }], 10), []));
check("toggle: 済みのしおりも外せる（押し間違いの取り消し）",
  eq(toggleBookmark([{ ply: 10, done: true }], 10), []));
check("toggle: 他の手は動かさない",
  eq(toggleBookmark([{ ply: 4, done: true }, { ply: 20, done: false }], 10).map((b) => b.ply), [4, 10, 20]));
check("toggle: 不正な ply では何も変えない",
  eq(toggleBookmark([{ ply: 4, done: false }], -3), [{ ply: 4, done: false }]));

// ── done ──
check("done: 印を立てる", eq(markBookmarkDone([{ ply: 7, done: false }], 7), [{ ply: 7, done: true }]));
check("done: 二度立てても変わらない", eq(markBookmarkDone([{ ply: 7, done: true }], 7), [{ ply: 7, done: true }]));
// しおりを付けずに直接ノードを作る動線もある。そちらも事実として残す
check("done: しおりの無い手でも記録する",
  eq(markBookmarkDone([], 15), [{ ply: 15, done: true }]));
check("done: 他の手には波及しない",
  eq(markBookmarkDone([{ ply: 3, done: false }, { ply: 9, done: false }], 9),
     [{ ply: 3, done: false }, { ply: 9, done: true }]));

// ── 参照系 ──
check("hasBookmark", hasBookmark([{ ply: 5 }], 5) && !hasBookmark([{ ply: 5 }], 6));
check("pending: 済みを除く",
  eq(pendingBookmarks([{ ply: 1, done: true }, { ply: 2, done: false }]), [{ ply: 2, done: false }]));

// 元の配列は触らない（呼び出し側が state をそのまま渡すため）
{
  const src = [{ ply: 4, done: false }];
  toggleBookmark(src, 9);
  markBookmarkDone(src, 4);
  check("元の配列を書き換えない", eq(src, [{ ply: 4, done: false }]), JSON.stringify(src));
}

console.log(`\n=== ${pass}/${pass + fail} passed ===`);
process.exit(fail ? 1 : 0);
