// treeOps.js の純粋関数ユニットテスト（Nodeで直接実行）。
//   実行: node test-harness/treeOps.test.mjs
// childIds / merge_parent_ids / tags の整合ロジックを検証する。
import {
  collectTreeTags, nextSortOrder, addNode, applyNodePatch,
  reparent, setMergeParents, removeNodes,
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

console.log(`\n=== ${pass}/${pass + fail} passed ===`);
process.exit(fail ? 1 : 0);
