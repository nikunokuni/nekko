// 棋譜の解析（メタ情報パース・特徴抽出・傾向集計）のユニットテスト。
//   実行: node test-harness/kifuAnalysis.test.mjs

import { importKifuText, parseKifuMeta, isEvenGame } from "../src/kifuParser.js";
import { extractGameFeatures } from "../src/kifuFeatures.js";
import { analyzeGames, analyzeSwingTiming, wilson } from "../src/kifuStats.js";
import { resolveMySide, outcomeFor, analyzeKifu, toAnalysisGame } from "../src/kifuAnalyze.js";

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
check("中飛車＋美濃", f2.myCastle.name, "美濃囲い");

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

console.log(failures === 0 ? "\n全テスト成功" : `\n${failures}件 失敗`);
process.exit(failures === 0 ? 0 : 1);
