// kifuStats.js の集計ユニットテスト（Nodeで直接実行）。
//   実行: node test-harness/kifuStats.test.mjs
//
// ここが壊れても**画面は落ちない。数字が静かに変わるだけ**なので、
// 目でもE2Eでも見つけられない。とくに次の2つは、崩れると
// 「傾向」がそれらしい顔をしたまま嘘をつく。
//   ・母数が足りない粒度を採用しないこと（＝2局2勝が上位に来ないこと）
//   ・ウィルソン区間が 0〜1 に収まり、母数が増えるほど狭くなること
import { wilson, groupBy, bestGranularity, analyzeGames, analyzeSwingTiming, LEVELS, BRANCH_VIEWS } from "../src/kifuStats.js";

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (detail ? "  — " + detail : "")); }
}

/** 集計に渡す1局分。features は集計軸で使うぶんだけ持たせる */
let gameSeq = 0;
const g = (outcome, features = {}) => ({
  id: `g${++gameSeq}`,
  name: "対局",
  side: "sente",
  outcome,
  features: {
    oppStrategy: "四間飛車", myStrategy: "居飛車",
    myCastle: null, oppCastle: null,
    moveCount: 100,
    ...features,
  },
});
/** 同じ内容の対局を n 局ぶん */
const many = (n, outcome, features) => Array.from({ length: n }, () => g(outcome, features));

// ══════════════════════════════════════════════════
// ウィルソン信頼区間
// ══════════════════════════════════════════════════
{
  const w = wilson(2, 0, 2);
  check("2局2勝でも上限は1を超えず、下限は1未満（＝100%扱いしない）",
    w.rate === 1 && w.lower < 1 && w.upper <= 1, JSON.stringify(w));

  const few  = wilson(3, 0, 6);
  const lots = wilson(30, 0, 60);
  check("同じ勝率なら、母数が多いほど区間は狭い",
    (lots.upper - lots.lower) < (few.upper - few.lower),
    `6局=${(few.upper - few.lower).toFixed(3)} 60局=${(lots.upper - lots.lower).toFixed(3)}`);

  check("勝率は 引き分け=0.5勝 で数える", wilson(1, 2, 4).rate === 0.5, String(wilson(1, 2, 4).rate));

  const zero = wilson(0, 0, 0);
  check("0局でも壊れない（0除算しない）",
    Number.isFinite(zero.rate) && zero.lower === 0 && zero.upper === 1, JSON.stringify(zero));

  const allLose = wilson(0, 0, 10);
  check("全敗でも下限が負にならない", allLose.lower >= 0 && allLose.rate === 0, JSON.stringify(allLose));
}

// ══════════════════════════════════════════════════
// groupBy — 軸の値の取り出し
// ══════════════════════════════════════════════════
{
  const games = [
    ...many(3, "win",  { oppStrategy: "四間飛車" }),
    ...many(2, "lose", { oppStrategy: "中飛車" }),
  ];
  const rows = groupBy(games, ["oppStrategy"]).sort((a, b) => b.games - a.games);
  check("軸ごとに分かれ、局数が数えられる",
    rows.length === 2 && rows[0].label === "四間飛車" && rows[0].games === 3 && rows[1].games === 2,
    JSON.stringify(rows.map((r) => [r.label, r.games])));
  check("勝ち負けの内訳が正しい", rows[0].wins === 3 && rows[1].losses === 2);

  // 囲いは name を持つオブジェクト。未判定は「不明」に寄せる（軸ごと消えると集計から落ちるため）
  const noCastle = groupBy(many(2, "win", { myCastle: null }), ["myCastle"]);
  check("囲いが判定できていない対局は『不明』にまとまる（黙って消えない）",
    noCastle.length === 1 && noCastle[0].label === "不明" && noCastle[0].games === 2,
    JSON.stringify(noCastle.map((r) => [r.label, r.games])));

  const done = groupBy([
    ...many(2, "win",  { myCastle: { name: "舟囲い", completeness: 1 } }),
    ...many(2, "lose", { myCastle: { name: "舟囲い", completeness: 0.5 } }),
  ], ["castleDone"]);
  check("囲いが間に合ったかで2つに割れる", done.length === 2, JSON.stringify(done.map((r) => r.label)));

  const swing = groupBy([
    ...many(1, "win",  { swingTiming: "先発" }),
    ...many(1, "win",  { swingTiming: "対応" }),
    ...many(1, "win",  { swingTiming: null }),
  ], ["swingTiming"]);
  check("飛車を振っていない対局は『居飛車のまま』に寄る（先発／対応に混ざらない）",
    swing.length === 3 && swing.some((r) => r.label === "居飛車のまま"),
    JSON.stringify(swing.map((r) => r.label)));

  // 平均完成度は「囲いを持つ対局」だけで割る。持たない対局を0として混ぜると数字が下振れする
  const mixed = groupBy([
    g("win",  { myCastle: { name: "舟囲い", completeness: 1 } }),
    g("lose", { myCastle: null }),
  ], ["oppStrategy"]);
  check("囲いの平均完成度は、囲いが判定できた対局だけで平均する",
    mixed[0].castleCompleteness === 1, String(mixed[0].castleCompleteness));
}

// ══════════════════════════════════════════════════
// bestGranularity — 母数が足りている一番細かい粒度
//   ここが本丸。細かくしすぎると偶然の偏りを「傾向」として出してしまう
// ══════════════════════════════════════════════════
{
  // 四間飛車10局。うち自分の戦法は居飛車1局・振り飛車9局。
  // 細かい粒度（相手×自分）で minGames=6 を満たすのは振り飛車の9局だけ＝1グループ。
  const games = [
    ...many(9, "win",  { oppStrategy: "四間飛車", myStrategy: "振り飛車" }),
    ...many(1, "lose", { oppStrategy: "四間飛車", myStrategy: "居飛車" }),
  ];
  const rows = bestGranularity(games, { minGames: 6 });
  check("細かい側が1グループにしかならないときは、粗いままにする（情報が増えていないため）",
    rows.length === 1 && rows[0].label === "四間飛車" && rows[0].games === 10,
    JSON.stringify(rows.map((r) => [r.label, r.games])));

  // 同じ四間飛車16局が、自分の戦法で8局ずつに割れる場合は細かい側を採用する
  const split = [
    ...many(8, "win",  { oppStrategy: "四間飛車", myStrategy: "振り飛車" }),
    ...many(8, "lose", { oppStrategy: "四間飛車", myStrategy: "居飛車" }),
  ];
  const rows2 = bestGranularity(split, { minGames: 6 });
  check("細かい側が2つ以上に割れて母数も足りるなら、細かい粒度に置き換える",
    rows2.length === 2 && rows2.every((r) => r.games === 8),
    JSON.stringify(rows2.map((r) => [r.label, r.games])));
  check("置き換えたときは、その粒度の名前が level に入る",
    rows2.every((r) => r.level === LEVELS[1].label),
    JSON.stringify(rows2.map((r) => r.level)));

  check("母数に満たないグループは載せない（2局2勝を傾向として出さない）",
    bestGranularity(many(2, "win"), { minGames: 6 }).length === 0);

  check("0局でも落ちない", bestGranularity([], { minGames: 6 }).length === 0);

  // 細かい側でカバーされない粗いグループは、粗いまま残さないと集計から消える
  const mixedDepth = [
    ...many(8, "win",  { oppStrategy: "四間飛車", myStrategy: "振り飛車" }),
    ...many(8, "lose", { oppStrategy: "四間飛車", myStrategy: "居飛車" }),
    ...many(7, "win",  { oppStrategy: "中飛車",   myStrategy: "居飛車" }),
  ];
  const rows3 = bestGranularity(mixedDepth, { minGames: 6 });
  const total = rows3.reduce((s, r) => s + r.games, 0);
  check("粒度を混ぜても、どのグループも取りこぼさない（合計が元の局数と合う）",
    total === 23, `合計=${total} 内訳=${JSON.stringify(rows3.map((r) => [r.label, r.games]))}`);
}

// ══════════════════════════════════════════════════
// analyzeGames — よく勝てる／よく負ける
// ══════════════════════════════════════════════════
{
  const games = [
    ...many(10, "win",  { oppStrategy: "四間飛車" }),
    ...many(10, "lose", { oppStrategy: "中飛車" }),
  ];
  const a = analyzeGames(games, { minGames: 6 });
  check("全体の勝率が出る", a.total === 20 && a.overall.rate === 0.5, String(a.overall.rate));
  check("よく勝てる＝全体より確実に上（下限が全体の勝率を超える）",
    a.strong.length === 1 && a.strong[0].label === "四間飛車",
    JSON.stringify(a.strong.map((r) => r.label)));
  check("よく負ける＝全体より確実に下（上限が全体の勝率を下回る）",
    a.weak.length === 1 && a.weak[0].label === "中飛車",
    JSON.stringify(a.weak.map((r) => r.label)));

  // 局数が多いほうを先に直したい。5局で2割より、20局で3割のほうが取りこぼしが大きい
  const lopsided = [
    ...many(20, "win",  { oppStrategy: "相掛かり" }),
    ...many(4,  "win",  { oppStrategy: "中飛車" }), ...many(16, "lose", { oppStrategy: "中飛車" }),
    ...many(1,  "win",  { oppStrategy: "角換わり" }), ...many(7, "lose", { oppStrategy: "角換わり" }),
  ];
  const b = analyzeGames(lopsided, { minGames: 6 });
  check("よく負けるの並びは勝率の低い順ではなく、取りこぼした局数の多い順",
    b.weak[0].label === "中飛車",
    JSON.stringify(b.weak.map((r) => [r.label, r.games, r.rate.toFixed(2)])));

  // features や outcome が欠けた対局が混ざっても、集計を壊さず除外する
  const dirty = [...many(6, "win"), null, { id: "x", outcome: "win" }, { id: "y", features: {} }];
  check("features / outcome が欠けた対局は除外される（落ちない）",
    analyzeGames(dirty, { minGames: 6 }).total === 6,
    String(analyzeGames(dirty, { minGames: 6 }).total));

  // 回帰テスト：グループが1つだけのとき、全体＝そのグループなので比較相手が自分自身になる。
  // ウィルソン上限は全勝でも丸めでわずかに1を割ることがあり、そのぶんだけ
  // 「よく負ける：勝率100%」が出ていた。しかも丸めの結果は局数しだいで、
  // 6局では出て8局では出ない（＝手で試して再現しない）壊れ方をしていた。
  const oneSided = [6, 7, 8, 10, 12, 20].filter((n) => {
    const won  = analyzeGames(many(n, "win"),  { minGames: 6 });
    const lost = analyzeGames(many(n, "lose"), { minGames: 6 });
    return won.weak.length > 0 || won.strong.length > 0
        || lost.weak.length > 0 || lost.strong.length > 0;
  });
  check("グループが1つだけなら、全勝でも全敗でも strong / weak には入らない",
    oneSided.length === 0, `出てしまう局数: ${oneSided.join(", ")}`);
}

// ══════════════════════════════════════════════════
// analyzeSwingTiming — 先発／対応
// ══════════════════════════════════════════════════
{
  const out = analyzeSwingTiming([
    ...many(3, "win",  { swingTiming: "先発" }),
    ...many(2, "lose", { swingTiming: "対応" }),
    ...many(4, "win",  { swingTiming: null }),
  ]);
  check("先発と対応だけを取り出して比べる（居飛車のままは数えない）",
    out["先発"].games === 3 && out["対応"].games === 2 && Object.keys(out).length === 2,
    JSON.stringify(Object.keys(out)));
  check("該当が無い側はキーごと出さない（0局を『勝率0%』と読ませないため）",
    analyzeSwingTiming(many(3, "win", { swingTiming: "先発" }))["対応"] === undefined);

  // 画面はこの行からも実戦へ掘り下げる。groupBy が返す行と同じ形（gameIds を持つ）に
  // そろえておかないと、同じ見た目の行なのに押せるものと押せないものが混ざる
  check("groupBy の行と同じく gameIds を持ち、中身が集計対象と一致する",
    out["先発"].gameIds.length === 3 && out["対応"].gameIds.length === 2
      && new Set([...out["先発"].gameIds, ...out["対応"].gameIds]).size === 5,
    JSON.stringify({ 先発: out["先発"].gameIds, 対応: out["対応"].gameIds }));
}

// ══════════════════════════════════════════════════
// BRANCH_VIEWS — 画面の選択肢がそのまま集計できる形か
//   軸名を打ち間違えても画面は落ちず、全部「不明」に落ちるだけなので気づけない
// ══════════════════════════════════════════════════
{
  const sample = [
    g("win",  { oppStrategy: "四間飛車", myStrategy: "居飛車", myCastle: { name: "舟囲い", completeness: 1 }, oppCastle: { name: "美濃囲い", completeness: 1 }, swingTiming: "対応", bishopExchanged: true }),
    g("lose", { oppStrategy: "中飛車",   myStrategy: "振り飛車", myCastle: { name: "美濃囲い", completeness: 0.5 }, oppCastle: { name: "舟囲い", completeness: 1 }, swingTiming: "先発", bishopExchanged: false }),
  ];
  const broken = BRANCH_VIEWS.filter((v) => {
    const rows = groupBy(sample, v.dims);
    // 2局が別々の値に分かれるはずの標本なので、全部「不明」に落ちたら軸名が効いていない
    return rows.length !== 2 || rows.every((r) => r.label === "不明");
  });
  check("すべての観点が実際に集計できる（軸名の打ち間違いが無い）",
    broken.length === 0, broken.map((v) => v.key).join(", "));
}

console.log(`\n=== ${pass}/${pass + fail} passed ===`);
if (fail > 0) process.exit(1);
