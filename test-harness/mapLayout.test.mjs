// mapLayout.js の座標計算ユニットテスト（Nodeで直接実行）。
//   実行: node test-harness/mapLayout.test.mjs
//
// ここで押さえたいのは「絵として破綻しないこと」。とくに
// **子は必ず親より下に来る**は、崩れても画面は落ちず矢印が上を向くだけなので、
// 目で見つけるしかない類の壊れ方をする。
import { layoutTree, findInboxId, NODE_W, NODE_H, BRANCH_STEP } from "../src/mapLayout.js";

let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (detail ? "  — " + detail : "")); }
}

const n = (id, parentId, childIds, extra = {}) =>
  ({ id, parentId, childIds, status: "todo", ...extra });

/** どのエッジも「親（または幹の目盛り）より子が下」になっているか */
function assertAllEdgesPointDown(label, nodes, rootId, inboxId = null, hidden = new Set()) {
  const { positions, edges } = layoutTree(nodes, rootId, inboxId, hidden);
  const bad = edges.filter((e) => {
    const p = positions[e.from], c = positions[e.to];
    return !(e.y2 > e.y1) || !(c.y > p.y);
  });
  check(label, bad.length === 0,
    bad.map((e) => `${e.from}(y=${positions[e.from].y}) → ${e.to}(y=${positions[e.to].y})`).join(", "));
}

// ══════════════════════════════════════════════════
// 普通のツリー（棋譜なし）は今までどおりの格子
// ══════════════════════════════════════════════════
{
  const nodes = {
    root: n("root", null, ["a", "b"], { isRoot: true }),
    a:    n("a", "root", ["c"]),
    b:    n("b", "root", []),
    c:    n("c", "a", []),
  };
  const { positions, edges, trunks } = layoutTree(nodes, "root");

  check("深さがそのまま縦位置になる（棋譜が無ければ段が揃う）",
    positions.a.y === NODE_H + 40 && positions.b.y === NODE_H + 40,
    `a=${positions.a.y} b=${positions.b.y}`);
  check("親は子の中央に来る", positions.root.y === 0 && positions.a.x < positions.b.x);
  check("棋譜が無ければ幹は描かない", trunks.length === 0);
  check("エッジは親子ぶんだけ出る", edges.length === 3, String(edges.length));
  assertAllEdgesPointDown("普通のツリー：矢印はすべて下向き", nodes, "root");
}

// ══════════════════════════════════════════════════
// 棋譜の分岐（幹モード）
//   p は棋譜を持ち、第3手 / 第20手 / 第12手 の順に分岐を作ってある
// ══════════════════════════════════════════════════
function makeTrunk() {
  return {
    root: n("root", null, ["p"], { isRoot: true }),
    p:    n("p", "root", ["c1", "c2", "c3"], { kifu: [{}, {}, {}] }),
    c1:   n("c1", "p", [], { sortOrder: 0, branchFromMoveIndex: 3 }),
    c2:   n("c2", "p", [], { sortOrder: 1, branchFromMoveIndex: 20 }),
    c3:   n("c3", "p", [], { sortOrder: 2, branchFromMoveIndex: 12 }),
  };
}

{
  const nodes = makeTrunk();
  const { positions, trunks } = layoutTree(nodes, "root");

  // これがこの機能の狙い。「20手目の分岐は3手目の分岐より下」
  check("後の手数からの分岐ほど下に来る",
    positions.c1.y < positions.c3.y && positions.c3.y < positions.c2.y,
    `c1(3手)=${positions.c1.y} c3(12手)=${positions.c3.y} c2(20手)=${positions.c2.y}`);
  check("段の差は分岐1つぶん（等間隔）",
    positions.c3.y - positions.c1.y === BRANCH_STEP &&
    positions.c2.y - positions.c3.y === BRANCH_STEP);

  check("幹が1本できる", trunks.length === 1);
  const tr = trunks[0];
  check("幹は親の下辺中央から伸びる",
    tr.x === positions.p.x + NODE_W / 2 && tr.y0 === positions.p.y + NODE_H);
  check("目盛りは分岐の数だけ打つ", tr.ticks.length === 3, String(tr.ticks.length));
  // 幹を上から下へ辿れば手数の順に読める（左右に振り分けても縦順は手数順）
  const labelsTopDown = [...tr.ticks].sort((a, b) => a.y - b.y).map((t) => t.label);
  check("幹を上から下へ辿ると手数順に読める",
    eq(labelsTopDown, ["第3手", "第12手", "第20手"]), JSON.stringify(labelsTopDown));

  // 目盛りは「その枝が出る側」へ突き出す。片側にまとめると、
  // どの目盛りから出た枝か分からなくなる
  const byLabel = Object.fromEntries(tr.ticks.map((t) => [t.label, t]));
  check("目盛りは枝の出る側に突き出す（作った順に 右・左・右）",
    byLabel["第3手"].dir === 1 && byLabel["第20手"].dir === -1 && byLabel["第12手"].dir === 1,
    JSON.stringify(tr.ticks.map((t) => [t.label, t.dir])));
  check("左右に振り分けられている（幹をはさむ）",
    positions.c2.x < positions.p.x && positions.c1.x > positions.p.x,
    `c2=${positions.c2.x} p=${positions.p.x} c1=${positions.c1.x}`);

  // 「初期局面から分岐」は 0 手目。数字ではなく言葉で出す（詳細画面と同じ言い回し）
  const zero = makeTrunk();
  zero.c1.branchFromMoveIndex = 0;
  check("0手目は「初期局面」と出す",
    layoutTree(zero, "root").trunks[0].ticks.some((t) => t.label === "初期局面"));

  assertAllEdgesPointDown("幹モード：矢印はすべて下向き", nodes, "root");
}

// ══════════════════════════════════════════════════
// 縦のずれの累積（ここを忘れると矢印が上を向く）
//
//   分岐が多い親では、下のほうの枝が 4×22=88px、5×22=110px と下がる。
//   段の高さ（38+40=78px）を超えるので、その枝の子に親のずれを引き継がないと、
//   **子が親より上に描かれる**（矢印が上を向く）。
//
//   引き継ぎの経路は2つあるので、両方に「ずれが78pxを超える親」を用意して
//   どちらが欠けても落ちるようにしてある：
//     ・幹モードの親から子へ（c4 → g1）
//     ・普通の親から子へ（c5 → h）
// ══════════════════════════════════════════════════
{
  const nodes = {
    root: n("root", null, ["p"], { isRoot: true }),
    p:    n("p", "root", ["c0", "c1", "c2", "c3", "c4", "c5"], { kifu: [{}, {}, {}] }),
    c0:   n("c0", "p", [], { sortOrder: 0, branchFromMoveIndex: 1 }),
    c1:   n("c1", "p", [], { sortOrder: 1, branchFromMoveIndex: 2 }),
    c2:   n("c2", "p", [], { sortOrder: 2, branchFromMoveIndex: 3 }),
    c3:   n("c3", "p", [], { sortOrder: 3, branchFromMoveIndex: 4 }),
    // 順位4（88px下がる）。それ自身も棋譜を持つ幹＝入れ子の幹
    c4:   n("c4", "p", ["g1", "g2"], { sortOrder: 4, branchFromMoveIndex: 5, kifu: [{}, {}] }),
    g1:   n("g1", "c4", [], { sortOrder: 0, branchFromMoveIndex: 2 }),
    g2:   n("g2", "c4", [], { sortOrder: 1, branchFromMoveIndex: 9 }),
    // 順位5（110px下がる）。こちらは普通の親（手で作った子を持つ）
    c5:   n("c5", "p", ["h"], { sortOrder: 5, branchFromMoveIndex: 6 }),
    h:    n("h", "c5", []),
  };
  const { positions } = layoutTree(nodes, "root");

  check("入れ子の幹でも、子は親のずれを引き継いでさらに下に来る",
    positions.g1.y > positions.c4.y,
    `c4=${positions.c4.y} g1=${positions.g1.y}`);
  check("普通の子も、親のずれを引き継いでさらに下に来る",
    positions.h.y > positions.c5.y,
    `c5=${positions.c5.y} h=${positions.h.y}`);
  assertAllEdgesPointDown("分岐が多い幹：矢印はすべて下向き", nodes, "root");
}

// ══════════════════════════════════════════════════
// 畳み（まとめノード）
// ══════════════════════════════════════════════════
{
  const nodes = {
    root: n("root", null, ["s", "x"], { isRoot: true }),
    s:    n("s", "root", ["y", "w"], { isSummary: true }),
    y:    n("y", "s", ["z"]),
    z:    n("z", "y", []),
    w:    n("w", "s", []),
    x:    n("x", "root", []),
  };
  const hidden = new Set(["y", "z", "w"]);
  const open = layoutTree(nodes, "root");
  check("畳む前は配下も座標を持つ", !!open.positions.y && !!open.positions.z);

  const shut = layoutTree(nodes, "root", null, hidden);
  check("畳むと配下は座標を持たない", !shut.positions.y && !shut.positions.z && !shut.positions.w);
  check("畳んだまとめノード自身は残る", !!shut.positions.s);
  // ここが目的そのもの。束は葉1つぶんの幅（NODE_W + 16）に縮む
  const widthOf = (r) => Math.max(...Object.values(r.positions).map((p) => p.x));
  check("畳むと横幅が縮む（束が葉1つぶんになる）",
    widthOf(shut) === NODE_W + 16 && widthOf(open) === (NODE_W + 16) * 2,
    `open=${widthOf(open)} shut=${widthOf(shut)}`);
  check("畳んだ配下へのエッジは出ない", shut.edges.every((e) => !hidden.has(e.to)));
  assertAllEdgesPointDown("畳んだ状態：矢印はすべて下向き", nodes, "root", null, hidden);
}

// ══════════════════════════════════════════════════
// 「とりあえず」（置き場）は本体の下の島
// ══════════════════════════════════════════════════
{
  const nodes = {
    root: n("root", null, ["a", "box"], { isRoot: true }),
    a:    n("a", "root", []),
    box:  n("box", "root", ["k"], { isInbox: true }),
    k:    n("k", "box", [], { branchFromMoveIndex: 5 }),
  };
  check("findInboxId: ルート直下の置き場を見つける", findInboxId(nodes, "root") === "box");

  const { positions, edges } = layoutTree(nodes, "root", "box");
  check("置き場は本体より下に置く", positions.box.y > positions.a.y,
    `a=${positions.a.y} box=${positions.box.y}`);
  check("ルートから置き場への線は引かない", edges.every((e) => e.to !== "box"));
  check("置き場の中身は描く", !!positions.k);
}

console.log(`\n=== ${pass}/${pass + fail} passed ===`);
process.exit(fail ? 1 : 0);
