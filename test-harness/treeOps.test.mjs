// treeOps.js の純粋関数ユニットテスト（Nodeで直接実行）。
//   実行: node test-harness/treeOps.test.mjs
// childIds / merge_parent_ids / tags の整合ロジックを検証する。
import {
  collectTreeTags, nextSortOrder, addNode, applyNodePatch,
  reparent, setMergeParents, removeNodes,
  collapsedHiddenIds, chapterOf, visibleAnchor, subtreeCounts,
  isTrunkParent, orderedChildIds, branchRanks, branchSides,
} from "../src/treeOps.js";

let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (detail ? "  — " + detail : "")); }
}

// ── フィクスチャ生成（毎テストで新規） ──
function makeTree() {
  return {
    // tags はこのツリーの正しい集約値（a:4→棒銀, b:5→四間飛車 を頻度降順）で初期化する。
    // これにより「変化なしパッチ」で tags=null（再保存不要）が正しく判定できる。
    id: "t1", name: "居飛車", tags: ["四間飛車", "棒銀"],
    rootId: "root",
    nodes: {
      root: { id: "root", parentId: null, childIds: ["a", "b"], isRoot: true, usageLevel: 2, myApproach: [] },
      a:    { id: "a", parentId: "root", childIds: ["c"], sortOrder: 0, usageLevel: 4, myApproach: ["棒銀"], mergeParentIds: [] },
      b:    { id: "b", parentId: "root", childIds: [],    sortOrder: 1, usageLevel: 5, myApproach: ["四間飛車"], mergeParentIds: [] },
      c:    { id: "c", parentId: "a", childIds: [], sortOrder: 0, usageLevel: 2, myApproach: ["穴熊"], mergeParentIds: ["b"], isMergeTarget: true },
    },
  };
}

// ── nextSortOrder ──
{
  const t = makeTree();
  check("nextSortOrder: 子2つ(0,1)の親→2", nextSortOrder(t, "root") === 2);
  check("nextSortOrder: 子なしの親→0", nextSortOrder(t, "b") === 0);
}

// ── addNode ──
{
  const t = makeTree();
  const d = { id: "d", parentId: "a", childIds: [], sortOrder: 1, usageLevel: 2, myApproach: [] };
  const nt = addNode(t, d);
  check("addNode: ノードが追加される", !!nt.nodes.d);
  check("addNode: 親の childIds 末尾へ連結", eq(nt.nodes.a.childIds, ["c", "d"]));
  check("addNode: 元ツリーは不変（純粋）", eq(t.nodes.a.childIds, ["c"]));
}

// ── applyNodePatch ──
{
  const t = makeTree();
  const r1 = applyNodePatch(t, "c", { label: "新ラベル" });
  check("applyNodePatch: フィールド更新", r1.tree.nodes.c.label === "新ラベル");
  check("applyNodePatch: 再計算なしなら tags=null", r1.tags === null);

  // c を頻度4・戦法'右四間飛車'にするとツリータグに乗る
  const r2 = applyNodePatch(t, "c", { usageLevel: 4, myApproach: ["右四間飛車"] }, { recomputeTags: true });
  check("applyNodePatch: タグ変化で tags 返る", Array.isArray(r2.tags) && r2.tags.length > 0, JSON.stringify(r2.tags));
  check("applyNodePatch: 頻度降順（b:5が先頭）", r2.tags[0] === "四間飛車", JSON.stringify(r2.tags));
  check("applyNodePatch: 新戦法がタグに含まれる", r2.tags.includes("右四間飛車"), JSON.stringify(r2.tags));

  // 変化しないパッチ（ラベルのみ）＋recompute → tags は現状(空)と同じなので null
  const r3 = applyNodePatch(t, "c", { label: "x" }, { recomputeTags: true });
  check("applyNodePatch: タグ未変化なら tags=null", r3.tags === null);
}

// ── reparent ──
{
  const t = makeTree();
  const nt = reparent(t, "c", "root", 9);
  check("reparent: 旧親 a の childIds から外れる", eq(nt.nodes.a.childIds, []));
  check("reparent: 新親 root の childIds 末尾へ", eq(nt.nodes.root.childIds, ["a", "b", "c"]));
  check("reparent: parentId / sortOrder 更新", nt.nodes.c.parentId === "root" && nt.nodes.c.sortOrder === 9);
  check("reparent: 元ツリーは不変", t.nodes.c.parentId === "a");
}

// ── setMergeParents ──
{
  const t = makeTree();
  const nt = setMergeParents(t, "a", ["b"]);
  check("setMergeParents: mergeParentIds 設定", eq(nt.nodes.a.mergeParentIds, ["b"]));
  check("setMergeParents: isMergeTarget=true", nt.nodes.a.isMergeTarget === true);
  const nt2 = setMergeParents(t, "c", []);
  check("setMergeParents: 空なら isMergeTarget=false", nt2.nodes.c.isMergeTarget === false);
}

// ── removeNodes（整合の要）──
{
  const t = makeTree();
  // b を削除（c が b を合流親に持つ）
  const { tree, mergeCleanups, tags } = removeNodes(t, ["b"], "root");
  check("removeNodes: 対象ノードが消える", !tree.nodes.b);
  check("removeNodes: 親 root の childIds から外れる", eq(tree.nodes.root.childIds, ["a"]));
  check("removeNodes: 残ノード c の合流参照が掃除される", eq(tree.nodes.c.mergeParentIds, []) && tree.nodes.c.isMergeTarget === false);
  check("removeNodes: mergeCleanups に c が含まれDB反映用", mergeCleanups.length === 1 && mergeCleanups[0].id === "c");
  // b(5,四間飛車) が消え、残る頻度4以上は a(棒銀) のみ → tags 変化
  check("removeNodes: タグ再計算（['棒銀']）", eq(tags, ["棒銀"]), JSON.stringify(tags));
  check("removeNodes: 元ツリーは不変", !!t.nodes.b && eq(t.nodes.c.mergeParentIds, ["b"]));
}

// ── collectTreeTags 単体 ──
{
  const t = makeTree();
  // a(4,棒銀) b(5,四間飛車) が対象。頻度降順で b→a
  check("collectTreeTags: 頻度4以上を降順集約", eq(collectTreeTags(t.nodes), ["四間飛車", "棒銀"]));
  check("collectTreeTags: ルートは除外", !collectTreeTags(t.nodes).includes(undefined));
}

// ══════════════════════════════════════════════════
// まとめノード（束ね）
// ══════════════════════════════════════════════════

// root ─ a(まとめ) ─ b ─ d
//        │          └ c(まとめ) ─ e
//        └ f
function makeSummaryTree() {
  const n = (id, parentId, childIds, extra = {}) =>
    ({ id, parentId, childIds, status: "todo", ...extra });
  return {
    root: n("root", null, ["a", "f"], { isRoot: true }),
    a:    n("a", "root", ["b", "c"], { isSummary: true, status: "wip" }),
    b:    n("b", "a", ["d"], { status: "done" }),
    d:    n("d", "b", [], { status: "done" }),
    c:    n("c", "a", ["e"], { isSummary: true }),
    e:    n("e", "c", [], { status: "wip" }),
    f:    n("f", "root", []),
  };
}

// ── collapsedHiddenIds ──
{
  const nodes = makeSummaryTree();
  const hidden = collapsedHiddenIds(nodes, ["a"]);
  check("collapsedHiddenIds: 配下を全部隠す", eq([...hidden].sort(), ["b", "c", "d", "e"]),
    JSON.stringify([...hidden]));
  // 入れ子のまとめ(c)も隠す。残すと親を失った島が浮いてレイアウトが壊れる
  check("collapsedHiddenIds: 入れ子のまとめも隠す", hidden.has("c") && hidden.has("e"));
  check("collapsedHiddenIds: 畳んだノード自身は隠さない", !hidden.has("a"));
  check("collapsedHiddenIds: 別の枝は隠さない", !hidden.has("f"));

  check("collapsedHiddenIds: 畳み指定なしなら空", collapsedHiddenIds(nodes, []).size === 0);
  // 端末ローカルの畳み状態はツリーと食い違いうる（削除・まとめ解除）
  check("collapsedHiddenIds: 消えたIDは無視", collapsedHiddenIds(nodes, ["nosuch"]).size === 0);
  check("collapsedHiddenIds: まとめでないノードの畳みは効かない",
    collapsedHiddenIds(nodes, ["b"]).size === 0);

  // 入れ子を両方畳んでも結果は変わらない（重複して数えない）
  check("collapsedHiddenIds: 入れ子を両方畳んでも同じ",
    eq([...collapsedHiddenIds(nodes, ["a", "c"])].sort(), ["b", "c", "d", "e"]));
}

// ── chapterOf ──
{
  const nodes = makeSummaryTree();
  const ch = chapterOf(nodes, "root");
  check("chapterOf: まとめ自身は自分の章", ch.get("a") === "a" && ch.get("c") === "c");
  check("chapterOf: 配下は直近のまとめに属す", ch.get("b") === "a" && ch.get("d") === "a");
  check("chapterOf: 入れ子は内側のまとめに属す", ch.get("e") === "c", ch.get("e"));
  check("chapterOf: まとめの外は null", ch.get("root") === null && ch.get("f") === null);
}

// ── visibleAnchor ──
{
  const nodes  = makeSummaryTree();
  const hidden = collapsedHiddenIds(nodes, ["a"]);
  check("visibleAnchor: 見えているノードは自分自身", visibleAnchor(nodes, "f", hidden) === "f");
  // 合流線が黙って消えないよう、隠れた端点は束の代表へ寄せる
  check("visibleAnchor: 隠れたノードは見える祖先へ寄る", visibleAnchor(nodes, "d", hidden) === "a");
  check("visibleAnchor: 入れ子の奥からも寄る", visibleAnchor(nodes, "e", hidden) === "a");
  check("visibleAnchor: 隠していなければそのまま",
    visibleAnchor(nodes, "e", new Set()) === "e");
}

// ── subtreeCounts ──
{
  const nodes = makeSummaryTree();
  const c = subtreeCounts(nodes, "a");
  check("subtreeCounts: 子孫を数える（自分は含まない）", c.total === 4, JSON.stringify(c));
  check("subtreeCounts: ステータス内訳", c.done === 2 && c.wip === 1 && c.todo === 1, JSON.stringify(c));
  check("subtreeCounts: 葉は0", subtreeCounts(nodes, "d").total === 0);
}

// ══════════════════════════════════════════════════
// 棋譜分岐の幹（縦＝手数）
// ══════════════════════════════════════════════════

// p(棋譜あり) の子を、作った順（sort_order順）に childIds へ並べたもの。
// 手数は 3 → 20 → 12 の順に作られている（あとから間の手数を足した形）
function makeTrunkTree() {
  const kifu = [{}, {}, {}];   // 中身は使わない。「棋譜を持っている」ことだけが条件
  return {
    p:  { id: "p",  parentId: null, childIds: ["c1", "c2", "c3"], kifu },
    c1: { id: "c1", parentId: "p", childIds: [], sortOrder: 0, branchFromMoveIndex: 3 },
    c2: { id: "c2", parentId: "p", childIds: [], sortOrder: 1, branchFromMoveIndex: 20 },
    c3: { id: "c3", parentId: "p", childIds: [], sortOrder: 2, branchFromMoveIndex: 12 },
  };
}

// ── isTrunkParent ──
{
  const nodes = makeTrunkTree();
  check("isTrunkParent: 棋譜を持ち分岐が2つ以上なら幹", isTrunkParent(nodes, "p") === true);

  // 「とりあえず」配下は別々の対局の切り出し。同じ時間軸に乗せてはいけない
  const inbox = {
    box: { id: "box", parentId: "root", childIds: ["k1", "k2"], isInbox: true, kifu: [] },
    k1:  { id: "k1", parentId: "box", childIds: [], branchFromMoveIndex: 3 },
    k2:  { id: "k2", parentId: "box", childIds: [], branchFromMoveIndex: 20 },
  };
  check("isTrunkParent: 親が棋譜を持たなければ幹にしない（とりあえず配下）",
    isTrunkParent(inbox, "box") === false);

  const one = makeTrunkTree();
  one.p.childIds = ["c1"];
  check("isTrunkParent: 分岐が1つだけなら幹にしない", isTrunkParent(one, "p") === false);

  const manual = makeTrunkTree();
  manual.c2.branchFromMoveIndex = null;
  manual.c3.branchFromMoveIndex = null;
  check("isTrunkParent: 手で作った子ばかりなら幹にしない", isTrunkParent(manual, "p") === false);
}

// ── orderedChildIds ──
{
  const nodes = makeTrunkTree();
  check("orderedChildIds: 幹モードは手数順", eq(orderedChildIds(nodes, "p"), ["c1", "c3", "c2"]),
    JSON.stringify(orderedChildIds(nodes, "p")));

  // 手で作ったノードは手数軸に乗らないので先頭（作った順のまま）
  const mixed = makeTrunkTree();
  mixed.p.childIds = ["c1", "c2", "c3", "m"];
  mixed.m = { id: "m", parentId: "p", childIds: [], sortOrder: 3, branchFromMoveIndex: null };
  check("orderedChildIds: 手数なしは先頭", eq(orderedChildIds(mixed, "p"), ["m", "c1", "c3", "c2"]),
    JSON.stringify(orderedChildIds(mixed, "p")));

  // 幹モードでないときは childIds の並び（sort_order順）をそのまま使う
  const flat = makeTrunkTree();
  flat.p.kifu = [];
  check("orderedChildIds: 幹モードでなければ並べ替えない",
    eq(orderedChildIds(flat, "p"), ["c1", "c2", "c3"]));
}

// ── branchRanks ──
{
  const nodes = makeTrunkTree();
  const r = branchRanks(nodes, "p");
  check("branchRanks: 手数順に 0,1,2", r.get("c1") === 0 && r.get("c3") === 1 && r.get("c2") === 2,
    `c1=${r.get("c1")} c3=${r.get("c3")} c2=${r.get("c2")}`);

  const mixed = makeTrunkTree();
  mixed.p.childIds = ["c1", "c2", "c3", "m"];
  mixed.m = { id: "m", parentId: "p", childIds: [], sortOrder: 3, branchFromMoveIndex: null };
  check("branchRanks: 手数なしは0", branchRanks(mixed, "p").get("m") === 0);

  const flat = makeTrunkTree();
  flat.p.kifu = [];
  const rf = branchRanks(flat, "p");
  check("branchRanks: 幹モードでなければ全員0",
    rf.get("c1") === 0 && rf.get("c2") === 0 && rf.get("c3") === 0);
}

// ── branchSides ──
{
  const nodes = makeTrunkTree();
  const s = branchSides(nodes, "p");
  check("branchSides: 作った順に右・左・右", s.get("c1") === "R" && s.get("c2") === "L" && s.get("c3") === "R",
    `c1=${s.get("c1")} c2=${s.get("c2")} c3=${s.get("c3")}`);

  // ここが本命の回帰テスト。あとから「間の手数」に枝を足したとき、
  // 既存の枝が反対側へ飛ぶ（＝マップが勝手に組み替わる）ことがあってはいけない
  const added = makeTrunkTree();
  added.p.childIds = ["c1", "c2", "c3", "c4"];
  added.c4 = { id: "c4", parentId: "p", childIds: [], sortOrder: 3, branchFromMoveIndex: 5 };
  const s2 = branchSides(added, "p");
  check("branchSides: 間の手数を足しても既存の左右が変わらない",
    s2.get("c1") === "R" && s2.get("c2") === "L" && s2.get("c3") === "R",
    `c1=${s2.get("c1")} c2=${s2.get("c2")} c3=${s2.get("c3")}`);
  check("branchSides: 追加分は末尾のパリティで決まる", s2.get("c4") === "L", s2.get("c4"));
  // 一方で縦の順（手数順）はちゃんと入れ替わる
  check("branchSides: 縦順は手数順に入れ替わる",
    eq(orderedChildIds(added, "p"), ["c1", "c4", "c3", "c2"]),
    JSON.stringify(orderedChildIds(added, "p")));
}

console.log(`\n=== ${pass}/${pass + fail} passed ===`);
process.exit(fail ? 1 : 0);
