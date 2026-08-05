// nodeFields.js（ノードの項目台帳）の純粋関数ユニットテスト。
//   実行: node test-harness/nodeFields.test.mjs
//
// 見張りたいのは「台帳に1行足せば、作成・更新・読み込みの3方向すべてが追従する」こと。
// ここが崩れると、その項目だけが静かに保存されない／読まれない状態になる
// （画面は壊れないので手動では気づけない）。
import {
  NODE_FIELDS, nodeRowToNode, nodeToInsertRow, nodePatchToRow, nodeContentPatch,
} from "../src/nodeFields.js";

let pass = 0, fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (detail ? "  — " + detail : "")); }
}

// ── 台帳そのものの健全性 ──
{
  const keys = NODE_FIELDS.map((f) => f.key);
  const cols = NODE_FIELDS.map((f) => f.column);
  check("キー名に重複が無い", new Set(keys).size === keys.length);
  check("DB列名に重複が無い", new Set(cols).size === cols.length);
  check("列名は snake_case（大文字が混ざっていない）", cols.every((c) => !/[A-Z]/.test(c)),
    cols.filter((c) => /[A-Z]/.test(c)).join(","));
  // camelCase のキーを機械的に snake_case にしたものと列名が一致するか。
  // 「whenToUse を when_to_used と書いた」類の打ち間違いはこれで落ちる
  const toSnake = (k) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
  const mismatched = NODE_FIELDS.filter((f) => toSnake(f.key) !== f.column);
  check("キー名と列名の綴りが対応している", mismatched.length === 0,
    mismatched.map((f) => `${f.key}→${f.column}`).join(","));
}

// ── nodeToInsertRow：省略した項目は既定値で埋まる ──
{
  const row = nodeToInsertRow({ label: "四間飛車" });
  check("渡した値はそのまま入る", row.label === "四間飛車");
  check("省略した項目は既定値（status=todo）", row.status === "todo");
  check("省略した項目は既定値（usage_level=2）", row.usage_level === 2);
  check("配列の既定値が入る（situation=[]）", eq(row.situation, []));
  check("持ち駒の既定値が入る", eq(row.hand_sente, { p:0,l:0,n:0,s:0,g:0,b:0,r:0 }));
  check("キーはすべてDB列名になっている", eq(Object.keys(row).sort(), NODE_FIELDS.map((f) => f.column).sort()));

  // 既定値のオブジェクト・配列を共有すると、1つのノードを編集した結果が
  // 別のノードに漏れる。毎回新しく作られていることを確かめる
  const a = nodeToInsertRow({}), b = nodeToInsertRow({});
  a.situation.push("居飛車");
  a.hand_sente.p = 9;
  check("既定値の配列は使い回されない", eq(b.situation, []), JSON.stringify(b.situation));
  check("既定値のオブジェクトは使い回されない", b.hand_sente.p === 0);

  // null を明示的に渡しても既定値に落とす（旧 createNode の `?? 既定値` と同じ挙動）。
  // ここが素通りすると DB に NULL が入り、配列を期待している画面側が落ちる
  const n = nodeToInsertRow({ situation: null, usageLevel: null, handGote: null });
  check("null は既定値に落ちる（配列）", eq(n.situation, []));
  check("null は既定値に落ちる（数値）", n.usage_level === 2);
  check("null は既定値に落ちる（持ち駒）", n.hand_gote.p === 0);
}

// ── nodeRowToNode：DBの NULL を既定値で埋める ──
{
  const node = nodeRowToNode({ id: "n1", label: "棒銀", my_approach: ["棒銀"] });
  check("id は素通し", node.id === "n1");
  check("列名からキー名へ変換される", eq(node.myApproach, ["棒銀"]));
  check("NULL/未設定は既定値（memo=\"\"）", node.memo === "");
  check("NULL/未設定は既定値（mergeParentIds=[]）", eq(node.mergeParentIds, []));
  check("childIds は空で始まる（親子は buildTreeFromNodes が組む）", eq(node.childIds, []));

  // 0 / "" / false は「値が入っている」ので既定値で上書きしてはいけない。
  // ここを || で書くと、勝率0%・評価値0・並び順0 が静かに書き換わる
  const zero = nodeRowToNode({ id: "n2", win_rate: 0, evaluation: 0, sort_order: 0, memo: "", board_hidden: false });
  check("勝率0%が既定値に化けない", zero.winRate === 0);
  check("評価値0が既定値に化けない", zero.evaluation === 0);
  check("並び順0が既定値に化けない", zero.sortOrder === 0);
}

// ── 往復：作成時に渡した値が、読み込んでも同じ形で戻る ──
{
  const input = {
    label: "四間飛車", status: "wip", memo: "メモ", usageLevel: 5, winRate: 0,
    situation: ["居飛車"], myApproach: ["四間飛車"], whenToUse: "急戦のとき",
    commentTags: ["得意"], evaluation: 0, turn: "sente",
  };
  const back = nodeRowToNode({ id: "x", ...nodeToInsertRow(input) });
  const diffs = Object.keys(input).filter((k) => !eq(back[k], input[k]));
  check("作成→読み込みで値が変わらない", diffs.length === 0,
    diffs.map((k) => `${k}: ${JSON.stringify(input[k])}→${JSON.stringify(back[k])}`).join(", "));
}

// ── nodePatchToRow：知らないキーは捨てる ──
{
  // 出来上がりのキーの並びは台帳の順なので、比較はキーを揃えてから行う
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  const row = nodePatchToRow({ whenToUse: "序盤", memo: "m" });
  check("パッチが列名に変換される", eq(sorted(row), sorted({ when_to_use: "序盤", memo: "m" })),
    JSON.stringify(row));

  check("台帳に無いキーは捨てる", eq(nodePatchToRow({ nosuchField: 1 }), {}));
  // 作成時にだけ決まる項目は、あとから更新できない（旧 updateNode の map にも無かった）
  check("noPatch の項目は捨てる（isRoot）", eq(nodePatchToRow({ isRoot: true }), {}));
  check("noPatch の項目は捨てる（isInbox）", eq(nodePatchToRow({ isInbox: true }), {}));

  // null で消す・空文字にする操作は正当なパッチなので通す。
  // ここを truthy 判定で書くと「メモを空にする」が保存されなくなる
  check("null を渡せる（項目を消す）", eq(nodePatchToRow({ board: null }), { board: null }));
  check("空文字を渡せる", eq(nodePatchToRow({ memo: "" }), { memo: "" }));
  check("false を渡せる", eq(nodePatchToRow({ boardHidden: false }), { board_hidden: false }));
  check("0 を渡せる", eq(nodePatchToRow({ winRate: 0 }), { win_rate: 0 }));

  // 渡していない項目を勝手に含めない（update が他の列を既定値で塗り潰さないこと）
  check("渡していない項目は含まれない", Object.keys(nodePatchToRow({ memo: "m" })).length === 1);
}

// ── nodeContentPatch：他のノードの「中身」だけを写す（呼び出し機能）──
//   ここが崩れても画面は落ちない。位置まで写せば別ツリーのノードIDが親に入って
//   マップから消え、逆に写す項目が抜ければ、その項目だけ写し先の古い値が残った
//   「どちらでもないノード」ができる。しかも上書きなので元の中身は戻らない。
{
  const source = nodeRowToNode({
    id: "src",
    label: "四間飛車", memo: "もとのメモ", aim: "捌く", situation: ["居飛車"],
    is_summary: true, summary: "まとめ", win_rate: 0, kifu: [{ board: [] }],
    // 以下はツリー上の位置。写ってはいけない
    parent_id: "other-tree-node", sort_order: 7,
    is_merge_target: true, merge_parent_ids: ["other-tree-node-2"],
    // 作成時にだけ決まる項目（noPatch）も写らない
    is_root: true, is_inbox: true, branch_from_move_index: 12,
  });
  const patch = nodeContentPatch(source);

  check("中身は写る（label）",    patch.label === "四間飛車");
  check("中身は写る（memo）",     patch.memo === "もとのメモ");
  check("中身は写る（配列）",     eq(patch.situation, ["居飛車"]));
  check("中身は写る（まとめ印）", patch.isSummary === true);
  check("0 も写る（勝率0%が消えない）", patch.winRate === 0);
  check("棋譜も写る",             eq(patch.kifu, [{ board: [] }]));

  for (const key of ["parentId", "sortOrder", "isMergeTarget", "mergeParentIds"]) {
    check(`ツリー上の位置は写さない（${key}）`, !Object.hasOwn(patch, key), JSON.stringify(patch[key]));
  }
  for (const key of ["isRoot", "isInbox", "branchFromMoveIndex"]) {
    check(`作成時にだけ決まる項目は写さない（${key}）`, !Object.hasOwn(patch, key), JSON.stringify(patch[key]));
  }

  // 上書きなので、写し元が空の項目も既定値で「明示的に」含める。
  // 含めないとその項目だけ写し先の古い値が残り、混ざったノードになる
  const empty = nodeContentPatch(nodeRowToNode({ id: "empty" }));
  const copyable = NODE_FIELDS.filter((f) => !f.noPatch && !f.structural).map((f) => f.key);
  check("写せる項目はすべてパッチに含まれる（空でも省略しない）",
    eq(Object.keys(empty).sort(), copyable.sort()),
    copyable.filter((k) => !Object.hasOwn(empty, k)).join(","));
  check("空の写し元は既定値で埋まる（memo）",   empty.memo === "");
  check("空の写し元は既定値で埋まる（配列）",   eq(empty.situation, []));
  check("空の写し元は既定値で埋まる（持ち駒）", eq(empty.handSente, { p:0,l:0,n:0,s:0,g:0,b:0,r:0 }));

  // パッチがそのまま updateNode に渡せること（列名に変換でき、捨てられないこと）
  const row = nodePatchToRow(patch);
  check("パッチはそのまま update に渡せる", Object.keys(row).length === copyable.length,
    `${Object.keys(row).length} / ${copyable.length}`);

  // 既定値のオブジェクト・配列を使い回すと、写した先を編集した結果が別のノードに漏れる
  const a = nodeContentPatch({}), b = nodeContentPatch({});
  a.situation.push("中飛車");
  a.handSente.p = 9;
  check("既定値の配列は使い回されない",       eq(b.situation, []));
  check("既定値のオブジェクトは使い回されない", b.handSente.p === 0);
}

console.log(`\n=== ${pass}/${pass + fail} passed ===`);
process.exit(fail ? 1 : 0);
