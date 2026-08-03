// 棋譜の解析（メタ情報パース・特徴抽出・傾向集計）のユニットテスト。
//   実行: node test-harness/kifuAnalysis.test.mjs

import { importKifuText, parseKifuMeta, isEvenGame } from "../src/kifuParser.js";
import { extractGameFeatures, detectCastle, detectMilestones } from "../src/kifuFeatures.js";
import { branchCandidates, candidateToNodeFields } from "../src/kifuBranching.js";
import { analyzeGames, analyzeSwingTiming, wilson, groupBy, BRANCH_VIEWS } from "../src/kifuStats.js";
import { resolveMySide, outcomeFor, resultFromOutcome, analyzeKifu, toAnalysisGame } from "../src/kifuAnalyze.js";

// 先手＝四間飛車＋美濃 / 後手＝居飛車。21手目に先手投了（後手の勝ち）
const KIF_SHIKENBISHA = `# ---- Kifu for Windows ----
開始日時：2026/07/20 10:00:00
手合割：平手
先手：にく
後手：たろう
手数----指手---------消費時間--
   1 ７六歩(77)   ( 0:01/00:00:01)
   2 ３四歩(33)   ( 0:01/00:00:01)
   3 ６六歩(67)   ( 0:01/00:00:02)
   4 ８四歩(83)   ( 0:01/00:00:02)
   5 ６八飛(28)   ( 0:01/00:00:03)
   6 ８五歩(84)   ( 0:01/00:00:03)
   7 ７七角(88)   ( 0:01/00:00:04)
   8 ５四歩(53)   ( 0:01/00:00:04)
   9 ４八玉(59)   ( 0:01/00:00:05)
  10 ６二銀(71)   ( 0:01/00:00:05)
  11 ３八玉(48)   ( 0:01/00:00:06)
  12 ４二玉(51)   ( 0:01/00:00:06)
  13 ２八玉(38)   ( 0:01/00:00:07)
  14 ３二玉(42)   ( 0:01/00:00:07)
  15 ５八金(69)   ( 0:01/00:00:08)
  16 ７四歩(73)   ( 0:01/00:00:08)
  17 ３八銀(39)   ( 0:01/00:00:09)
  18 ２二玉(32)   ( 0:01/00:00:09)
  19 ９六歩(97)   ( 0:01/00:00:10)
  20 ９四歩(93)   ( 0:01/00:00:10)
  21 投了         ( 0:01/00:00:11)
まで20手で後手の勝ち
`;

// 中飛車。「まで〜」行なし・投了のみ（22手目に後手投了 → 先手の勝ち）
const KIF_NAKABISHA = `開始日時：2026/07/21 09:30:00
先手：にく
後手：はなこ
手数----指手---------消費時間--
   1 ５六歩(57)   ( 0:01/00:00:01)
   2 ３四歩(33)   ( 0:01/00:00:01)
   3 ５八飛(28)   ( 0:01/00:00:02)
   4 ８四歩(83)   ( 0:01/00:00:02)
   5 ４八玉(59)   ( 0:01/00:00:03)
   6 ８五歩(84)   ( 0:01/00:00:03)
   7 ３八玉(48)   ( 0:01/00:00:04)
   8 ６二銀(71)   ( 0:01/00:00:04)
   9 ２八玉(38)   ( 0:01/00:00:05)
  10 ５四歩(53)   ( 0:01/00:00:05)
  11 ６八銀(79)   ( 0:01/00:00:06)
  12 ４二玉(51)   ( 0:01/00:00:06)
  13 ３八銀(39)   ( 0:01/00:00:07)
  14 ３二玉(42)   ( 0:01/00:00:07)
  15 ７六歩(77)   ( 0:01/00:00:08)
  16 ７四歩(73)   ( 0:01/00:00:08)
  17 ９六歩(97)   ( 0:01/00:00:09)
  18 ９四歩(93)   ( 0:01/00:00:09)
  19 １六歩(17)   ( 0:01/00:00:10)
  20 １四歩(13)   ( 0:01/00:00:10)
  21 ３六歩(37)   ( 0:01/00:00:11)
  22 投了         ( 0:01/00:00:11)
`;

// CSA形式。%TORYO のみ（4手 → 5手目=先手番が投了 → 後手の勝ち）
const CSA = `V2.2
N+にく
N-じろう
$START_TIME:2026/07/22 20:00:00
PI
+
+7776FU
-3334FU
+2726FU
-8384FU
%TORYO
`;

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "  OK  " : " FAIL "} ${label}: ${JSON.stringify(actual)}${ok ? "" : ` (期待値 ${JSON.stringify(expected)})`}`);
};

console.log("── メタ情報のパース ──");
const m1 = parseKifuMeta(KIF_SHIKENBISHA);
check("KIF 先手名", m1.senteName, "にく");
check("KIF 後手名", m1.goteName, "たろう");
check("KIF 勝敗（まで〜行）", m1.result, "gote");
check("KIF 対局日", m1.playedAt?.slice(0, 10), "2026-07-20");
check("KIF 手合割は平手", isEvenGame(m1.handicap), true);
check("KIF 手数", m1.moveCount, 20);

const m2 = parseKifuMeta(KIF_NAKABISHA);
check("KIF 勝敗（投了のみ・偶数手）", m2.result, "sente");

const m3 = parseKifuMeta(CSA);
check("CSA 先手名", m3.senteName, "にく");
check("CSA 後手名", m3.goteName, "じろう");
check("CSA 勝敗（%TORYO）", m3.result, "gote");
check("CSA 対局日", m3.playedAt?.slice(0, 10), "2026-07-22");

console.log("\n── 特徴抽出 ──");
const r1 = importKifuText(KIF_SHIKENBISHA);
check("スナップショット数（初期局面+20手）", r1.snapshots.length, 21);
check("読み飛ばした手", r1.skipped, 0);

const f1 = extractGameFeatures(r1.snapshots, "sente");
check("先手の戦法", f1.myStrategy, "四間飛車");
check("後手の戦法", f1.oppStrategy, "居飛車");
check("先手の囲い", f1.myCastle.name, "美濃囲い");
check("先手の囲い完成度", f1.myCastle.completeness, 1);
check("飛車を振った手数", f1.swingPly, 5);
check("振り方（先発/対応）", f1.swingTiming, "先発");
check("振りの早さ", f1.swingSpeed, "早い");
check("角交換", f1.bishopExchanged, false);

// 後手視点でも同じ棋譜を読めること（自分＝後手のとき）
const f1g = extractGameFeatures(r1.snapshots, "gote");
check("後手視点：自分の戦法", f1g.myStrategy, "居飛車");
check("後手視点：相手の戦法", f1g.oppStrategy, "四間飛車");

const r2 = importKifuText(KIF_NAKABISHA);
const f2 = extractGameFeatures(r2.snapshots, "sente");
check("中飛車の判定", f2.myStrategy, "中飛車");
// 5八に飛車がいるため5八金は指せず、金1枚＝片美濃になるのが正しい
check("中飛車の囲いは片美濃", f2.myCastle.name, "片美濃囲い");

// 飛車が前線へ出ても戦法を取り違えないこと。
// 居飛車のまま飛車を3四まで進めた形（横歩取りの筋）。
// 盤上のどこでも筋を読むと「その他/三間飛車」と誤判定してしまう。
const KIF_YOKOFU = `手合割：平手
先手：にく
後手：たろう
手数----指手---------消費時間--
   1 ２六歩(27)   ( 0:01/00:00:01)
   2 ３四歩(33)   ( 0:01/00:00:01)
   3 ２五歩(26)   ( 0:01/00:00:02)
   4 ８四歩(83)   ( 0:01/00:00:02)
   5 ７六歩(77)   ( 0:01/00:00:03)
   6 ８五歩(84)   ( 0:01/00:00:03)
   7 ７八金(69)   ( 0:01/00:00:04)
   8 ３二金(41)   ( 0:01/00:00:04)
   9 ２四歩(25)   ( 0:01/00:00:05)
  10 同　歩(23)   ( 0:01/00:00:05)
  11 同　飛(28)   ( 0:01/00:00:06)
  12 ８六歩(85)   ( 0:01/00:00:06)
  13 同　歩(87)   ( 0:01/00:00:07)
  14 同　飛(82)   ( 0:01/00:00:07)
  15 ３四飛(24)   ( 0:01/00:00:08)
  16 ３三角(22)   ( 0:01/00:00:08)
  17 投了         ( 0:01/00:00:09)
`;

{
  const r = importKifuText(KIF_YOKOFU);
  const f = extractGameFeatures(r.snapshots, "sente");
  check("飛車が3四まで出ても居飛車と判定する", f.myStrategy, "居飛車");
  check("後手も居飛車のまま", f.oppStrategy, "居飛車");
  check("前へ出ただけの手は「振った」と数えない", f.swingPly, null);
}

// 片美濃（金1枚）は「美濃囲いの67%」ではなく片美濃として名前が付くこと
{
  const r = importKifuText(KIF_NAKABISHA);
  const f = extractGameFeatures(r.snapshots, "sente");
  check("片美濃は独立した囲いとして判定", f.myCastle.name, "片美濃囲い");
  check("片美濃は完成扱い（組みかけにしない）", f.myCastle.completeness, 1);
}

// 本美濃（金2枚）が揃っていれば、片美濃ではなく美濃囲いと呼ぶ
{
  const r = importKifuText(KIF_SHIKENBISHA);
  const f = extractGameFeatures(r.snapshots, "sente");
  check("金2枚揃えば美濃囲い", f.myCastle.name, "美濃囲い");
  check("美濃囲いは完成", f.myCastle.completeness, 1);
}

// ── 囲いの判定（盤面を直接組んで確かめる）──
// 実戦譜を1局ずつ用意するより、構成駒だけを置いたほうが
// 「どの升にどの駒があればその囲いなのか」が読んで分かる。
console.log("\n── 囲いの判定 ──");
{
  const emptyBoard = () => Array.from({ length: 9 }, () => Array(9).fill(" "));
  // 先手視点の (筋, 段) に駒を置く。board[段-1][9-筋]
  const build = (pieces) => {
    const b = emptyBoard();
    for (const [file, rank, piece] of pieces) b[rank - 1][9 - file] = piece;
    return b;
  };
  const nameOf = (pieces) => {
    const c = detectCastle(build(pieces), "sente");
    return `${c.name}${c.completeness === 1 ? "" : "(組みかけ)"}`;
  };

  check("中住まい（5八玉・3八金・4八銀・7八金）",
    nameOf([[5, 8, "k"], [3, 8, "g"], [4, 8, "s"], [7, 8, "g"]]), "中住まい");
  check("ミレニアム囲い・居飛車（8九玉・8八銀・7九金・7七桂）",
    nameOf([[8, 9, "k"], [8, 8, "s"], [7, 9, "g"], [7, 7, "n"]]), "ミレニアム囲い");
  check("ミレニアム囲い・振り飛車（2九玉・2八銀・3九金・3七桂）",
    nameOf([[2, 9, "k"], [2, 8, "s"], [3, 9, "g"], [3, 7, "n"]]), "ミレニアム囲い");
  check("elmo囲い（7八玉・6八銀・7九金・5九金）",
    nameOf([[7, 8, "k"], [6, 8, "s"], [7, 9, "g"], [5, 9, "g"]]), "elmo囲い");
  check("ボナンザ囲い（7八玉・7七銀・6八金・5八金）",
    nameOf([[7, 8, "k"], [7, 7, "s"], [6, 8, "g"], [5, 8, "g"]]), "ボナンザ囲い");
  check("雁木囲い（6九玉・6七銀・7八金・5八金）",
    nameOf([[6, 9, "k"], [6, 7, "s"], [7, 8, "g"], [5, 8, "g"]]), "雁木囲い");
  check("雁木は7九玉でも判定できる",
    nameOf([[7, 9, "k"], [6, 7, "s"], [7, 8, "g"], [5, 8, "g"]]), "雁木囲い");
  check("舟囲い（6八玉・7八銀・5八金・4九金）",
    nameOf([[6, 8, "k"], [7, 8, "s"], [5, 8, "g"], [4, 9, "g"]]), "舟囲い");

  // 玉の位置が同じ囲い同士が取り違えられないこと
  check("玉6八・7八銀・5八金だけなら舟囲いの組みかけ",
    nameOf([[6, 8, "k"], [7, 8, "s"], [5, 8, "g"]]), "舟囲い(組みかけ)");
  // 玉7八にはボナンザとelmoが同居するが、構成駒が重ならないので混ざらない
  check("玉7八・7七銀・6八金ならボナンザの組みかけ",
    nameOf([[7, 8, "k"], [7, 7, "s"], [6, 8, "g"]]), "ボナンザ囲い(組みかけ)");
  check("玉7八・6八銀・7九金ならelmoの組みかけ",
    nameOf([[7, 8, "k"], [6, 8, "s"], [7, 9, "g"]]), "elmo囲い(組みかけ)");
  // 振り飛車ミレニアム(2九玉)と振り飛車穴熊(1九玉)は玉の位置で分かれる
  check("振り飛車穴熊は1九玉のまま",
    nameOf([[1, 9, "k"], [2, 8, "s"], [3, 9, "g"], [3, 8, "g"]]), "振り飛車穴熊");
  check("居玉は囲いにしない",
    nameOf([[5, 9, "k"], [4, 8, "g"], [6, 8, "g"]]), "居玉(組みかけ)");

  // 後手は盤面を180度回して同じ表で判定する（5八玉 → 5二玉）
  // 5八玉→5二玉 / 3八金→7二金 / 4八銀→6二銀 / 7八金→3二金
  const gote = build([[5, 2, "K"], [7, 2, "G"], [6, 2, "S"], [3, 2, "G"]]);
  check("後手の中住まいも判定できる", detectCastle(gote, "gote").name, "中住まい");
}

console.log("\n── 自分の側の判定 ──");
check("先手が自分", resolveMySide(m1, ["にく"]), "sente");
check("後手が自分", resolveMySide(m1, ["たろう"]), "gote");
check("名前未登録なら判定しない", resolveMySide(m1, []), null);
check("段位付きの表記ゆれを吸収", resolveMySide({ senteName: "にく（三段）", goteName: "たろう" }, ["にく"]), "sente");
check("空白入りの表記ゆれを吸収", resolveMySide({ senteName: "に く", goteName: "たろう" }, ["にく"]), "sente");
check("両者一致なら判定しない", resolveMySide({ senteName: "にく", goteName: "にく" }, ["にく"]), null);
check("複数名の登録に対応", resolveMySide(m1, ["niku2000", "たろう"]), "gote");

check("先手番で先手勝ち → 勝ち", outcomeFor("sente", "sente"), "win");
check("後手番で先手勝ち → 負け", outcomeFor("sente", "gote"), "lose");
check("引き分け", outcomeFor("draw", "gote"), "draw");
check("勝敗不明なら null", outcomeFor(null, "sente"), null);

// 棋譜入力（盤に並べて作る棋譜）は「勝ち／負け」で聞いて、保存の直前に先手視点へ戻す。
// ここがずれると、手入力した棋譜だけ勝敗が裏返って傾向に混ざる
console.log("\n── 自分視点の勝敗 → 先手視点の結果 ──");
check("先手番で勝ち → 先手の勝ち", resultFromOutcome("win",  "sente"), "sente");
check("後手番で勝ち → 後手の勝ち", resultFromOutcome("win",  "gote"),  "gote");
check("先手番で負け → 後手の勝ち", resultFromOutcome("lose", "sente"), "gote");
check("後手番で負け → 先手の勝ち", resultFromOutcome("lose", "gote"),  "sente");
check("引き分けはそのまま",       resultFromOutcome("draw", "gote"),  "draw");
check("結果を記録しないなら null", resultFromOutcome(null,   "sente"), null);
check("自分の側が無いなら null",   resultFromOutcome("win",  null),    null);
// outcomeFor と往復して元に戻る（画面に出す勝敗と、DBに入れる結果が食い違わない）
for (const side of ["sente", "gote"]) {
  for (const oc of ["win", "lose", "draw"]) {
    check(`往復して戻る（${side}・${oc}）`, outcomeFor(resultFromOutcome(oc, side), side), oc);
  }
}

// 自分の側が分かって初めて特徴が付き、集計対象になる
const a1 = analyzeKifu({ sourceText: KIF_SHIKENBISHA, snapshots: r1.snapshots, playerNames: ["にく"] });
check("解析：自分の側", a1.mySide, "sente");
check("解析：自分の戦法", a1.features.myStrategy, "四間飛車");
check("解析：集計レコード化", toAnalysisGame({ id: "k1", name: "x", ...a1 })?.outcome, "lose");

const a2 = analyzeKifu({ sourceText: KIF_SHIKENBISHA, snapshots: r1.snapshots, playerNames: [] });
check("側が不明なら特徴を持たない", a2.features, null);
check("側が不明なら集計対象外", toAnalysisGame({ id: "k2", name: "x", ...a2 }), null);

// 駒落ちは初期配置も先後の扱いも平手と違うため集計から外す
const a3 = analyzeKifu({
  sourceText: KIF_SHIKENBISHA.replace("手合割：平手", "手合割：飛車落ち"),
  snapshots: r1.snapshots, playerNames: ["にく"],
});
check("駒落ちは特徴を持たない", a3.features, null);

// 大量取り込みの中核：1件で名前を答えると、同じ名前の他の棋譜もまとめて解決する。
// （取り込み画面はこの resolveMySide の再適用で一括判定している）
{
  const batch = [
    { senteName: "にく", goteName: "たろう" },
    { senteName: "はなこ", goteName: "にく" },
    { senteName: "にく", goteName: "じろう" },
    { senteName: "よそ", goteName: "ひと" },
  ];
  check("答える前は誰も判定できない", batch.map((m) => resolveMySide(m, [])), [null, null, null, null]);
  // 1件目で「先手のにくが自分」と答えた ＝ 名前「にく」を覚えた
  const learned = ["にく"];
  check("1回答えると同じ名前が全部解決する",
    batch.map((m) => resolveMySide(m, learned)), ["sente", "gote", "sente", null]);
}

console.log("\n── 統計 ──");
check("ウィルソン下限（2局2勝は上位に来ない）", wilson(2, 0, 2).lower < wilson(18, 0, 20).lower, true);

// 四間飛車で居飛車に3勝7敗 / 中飛車で居飛車に7勝3敗、という偏りを作る
const games = [];
const push = (n, myStrategy, outcome) => {
  for (let i = 0; i < n; i++) {
    games.push({
      id: `${myStrategy}-${outcome}-${i}`, outcome, side: "sente",
      features: {
        myStrategy, oppStrategy: "居飛車", moveCount: 100,
        myCastle: { name: "美濃囲い", completeness: 1 },
        oppCastle: { name: "舟囲い", completeness: 1 },
        swingTiming: myStrategy === "四間飛車" ? "対応" : "先発",
      },
    });
  }
};
push(3, "四間飛車", "win"); push(7, "四間飛車", "lose");
push(7, "中飛車",   "win"); push(3, "中飛車",   "lose");

const a = analyzeGames(games, { minGames: 6 });
check("集計対象の局数", a.total, 20);
check("全体勝率", a.overall.rate, 0.5);
check("粒度が自動で細かくなる", a.groups.length, 2);
check("採用された粒度", a.groups[0].level, "相手の戦法 × 自分の戦法");
check("よく勝てる先頭", a.strong[0]?.label, "居飛車 × 中飛車");
check("よく負ける先頭", a.weak[0]?.label, "居飛車 × 四間飛車");

const t = analyzeSwingTiming(games);
check("先発の勝率", t["先発"].rate, 0.7);
check("対応の勝率", t["対応"].rate, 0.3);

// 母数が足りないときは粗い粒度のまま
const aCoarse = analyzeGames(games, { minGames: 15 });
check("母数不足なら粗い粒度に落ちる", aCoarse.groups.map((g) => g.label), ["居飛車"]);

console.log("\n── 棋譜の節目 ──");
{
  // 横歩取りの棋譜は9手目(2四歩)で歩を取り合い、そのあと角交換はしない
  const r = importKifuText(KIF_YOKOFU);
  const ms = detectMilestones(r.snapshots);
  const shikake = ms.find((m) => m.label === "仕掛け");
  check("最初に駒を取った手を仕掛けとする", shikake?.ply, 10);
  check("相居飛車では戦型が決まる印を出さない",
    ms.some((m) => m.label === "戦型が決まる"), false);

  // 四間飛車の棋譜は5手目に振っているので戦型の印が出る
  const r2 = importKifuText(KIF_SHIKENBISHA);
  const ms2 = detectMilestones(r2.snapshots);
  check("飛車を振った手で戦型が決まる", ms2.find((m) => m.label === "戦型が決まる")?.ply, 5);
  check("先手の囲い完成を拾う", ms2.find((m) => m.label === "先手の囲い完成")?.ply, 17);
  check("節目は手数の昇順", ms2.map((m) => m.ply).every((p, i, a) => i === 0 || a[i - 1] <= p), true);
}

console.log("\n── 分岐を探す観点 ──");
{
  const g = (over) => ({
    id: String(Math.random()), outcome: "win", side: "sente",
    features: {
      myStrategy: "四間飛車", oppStrategy: "居飛車", moveCount: 100,
      myCastle: { name: "美濃囲い", completeness: 1 },
      oppCastle: { name: "舟囲い", completeness: 1 },
      swingTiming: "先発", bishopExchanged: false,
      ...over,
    },
  });
  const games = [
    g({}),
    g({ bishopExchanged: true }),
    g({ myCastle: { name: "美濃囲い", completeness: 0.5 } }),
    g({ swingTiming: "対応" }),
    g({ swingTiming: null }),
  ];
  const by = (key) => {
    const v = BRANCH_VIEWS.find((x) => x.key === key);
    return groupBy(games, v.dims).map((x) => x.label).sort();
  };
  check("角交換の有無で分かれる", by("bishopExchange"), ["角交換あり", "角交換なし"]);
  check("囲いが間に合ったかで分かれる", by("castleDone"), ["囲いが間に合った", "囲いが間に合わなかった"]);
  check("自分から決めたかで分かれる", by("swingTiming"),
    ["居飛車のまま", "相手を見てから決めた", "自分から決めた"].sort());
  check("相手の戦法では分かれない（全部同じ）", by("oppStrategy"), ["居飛車"]);
  check("観点はすべて集計できる", BRANCH_VIEWS.every((v) => groupBy(games, v.dims).length > 0), true);
}

console.log("\n── 分岐の候補 ──");
{
  const game = (myStrategy, oppStrategy, oppCastleName, outcome) => ({
    id: `${myStrategy}-${oppStrategy}-${oppCastleName}-${outcome}-${Math.random()}`,
    outcome, side: "sente",
    features: {
      myStrategy, oppStrategy, moveCount: 100,
      myCastle:  { name: "美濃囲い", completeness: 1 },
      oppCastle: { name: oppCastleName, completeness: 1 },
    },
  });
  const games = [
    game("四間飛車", "居飛車", "居飛車穴熊", "lose"),
    game("四間飛車", "居飛車", "居飛車穴熊", "lose"),
    game("四間飛車", "居飛車", "舟囲い",     "win"),
    game("四間飛車", "中飛車", "美濃囲い",   "win"),
    game("中飛車",   "居飛車", "舟囲い",     "win"),
  ];

  // 自分の戦法だけ決まっているノード → 分かれ目は相手の戦法
  const a = branchCandidates({ myApproach: ["四間飛車"], games, existingNames: [] });
  check("軸は相手の戦法", a.axisLabel, "相手の戦法");
  check("自分の戦法で絞り込む", a.matchedGames, 4);
  check("候補は局数の多い順", a.candidates.map((c) => c.name), ["居飛車", "中飛車"]);
  check("勝敗も数える", [a.candidates[0].wins, a.candidates[0].losses], [1, 2]);

  // 既に枝がある相手は候補から消える
  const b = branchCandidates({ myApproach: ["四間飛車"], games, existingNames: ["居飛車"] });
  check("既存の子は候補から外す", b.candidates.map((c) => c.name), ["中飛車"]);

  // 相手の戦法まで決まっているノード → 分かれ目は相手の囲いへ1段深くなる
  const c = branchCandidates({ myApproach: ["四間飛車"], situation: ["居飛車"], games, existingNames: [] });
  check("軸が相手の囲いに深まる", c.axisLabel, "相手の囲い");
  check("囲いべつの候補", c.candidates.map((x) => x.name), ["居飛車穴熊", "舟囲い"]);

  // 「美濃囲い」と「美濃」のような表記ゆれでも既存の子として認識する
  const d = branchCandidates({ myApproach: ["四間飛車"], situation: ["居飛車"], games, existingNames: ["舟"] });
  check("囲い名の表記ゆれを吸収して除外", d.candidates.map((x) => x.name), ["居飛車穴熊"]);

  const fields = candidateToNodeFields({ name: "居飛車穴熊" }, "oppCastle");
  check("候補からノードの初期値を作る", [fields.label, fields.situation], ["居飛車穴熊", ["居飛車穴熊"]]);
}

console.log(failures === 0 ? "\n全テスト成功" : `\n${failures}件 失敗`);
process.exit(failures === 0 ? 0 : 1);
