// kifuBranching.js の分岐候補ユニットテスト（Nodeで直接実行）。
//   実行: node test-harness/kifuBranching.test.mjs
//
// ここはアプリのねらい③「勉強の方針が立つ」の本体。
// 壊れても画面は落ちず、**候補が静かに増えたり減ったりするだけ**なので、
// 見た目では正しいかどうか判断できない。とくに押さえたいのは3つ。
//   ・実戦に出ていない相手を候補に出さない（アプリが知識を主張しない）
//   ・既に枝がある相手は候補から消える（枝を作るほど候補が減って最後は空になる）
//   ・ノードの絞り込み具合で、次の分かれ目の軸が1段深くなる
import { branchCandidates, candidateToNodeFields } from "../src/kifuBranching.js";

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log("PASS  " + name); }
  else { fail++; console.log("FAIL  " + name + (detail ? "  — " + detail : "")); }
}

/** 集計対象の1局。囲いは name を持つオブジェクト（kifuFeatures の形） */
let seq = 0;
const game = (outcome, { my = "居飛車", opp = "四間飛車", oppCastle = "美濃囲い" } = {}) => ({
  id: `g${++seq}`,
  outcome,
  features: {
    myStrategy: my,
    oppStrategy: opp,
    oppCastle: oppCastle ? { name: oppCastle, completeness: 1 } : null,
  },
});
const many = (n, outcome, opts) => Array.from({ length: n }, () => game(outcome, opts));
const names = (r) => r.candidates.map((c) => c.name);

// ══════════════════════════════════════════════════
// 軸の切り替わり — ノードが絞り込まれるほど1段深くなる
// ══════════════════════════════════════════════════
{
  const games = [
    ...many(3, "win",  { opp: "四間飛車" }),
    ...many(2, "lose", { opp: "中飛車" }),
  ];

  const top = branchCandidates({ myApproach: ["居飛車"], situation: [], games });
  check("相手の戦法が未指定なら、次の分かれ目は『相手の戦法』",
    top.axis === "oppStrategy" && top.axisLabel === "相手の戦法", top.axis);
  check("候補は局数の多い順に並ぶ",
    names(top).join(",") === "四間飛車,中飛車", names(top).join(","));
  check("勝敗の内訳が候補に付く",
    top.candidates[0].games === 3 && top.candidates[0].wins === 3 && top.candidates[0].losses === 0,
    JSON.stringify(top.candidates[0]));

  const deep = branchCandidates({ myApproach: ["居飛車"], situation: ["四間飛車"], games });
  check("相手の戦法まで決まっていれば、次の分かれ目は『相手の囲い』",
    deep.axis === "oppCastle" && deep.axisLabel === "相手の囲い", deep.axis);
  check("囲いの軸では、絞り込んだ3局だけが対象になる",
    deep.matchedGames === 3 && names(deep).join(",") === "美濃囲い", JSON.stringify(names(deep)));
}

// ══════════════════════════════════════════════════
// 絞り込み — ノードのタグで対局を絞る
// ══════════════════════════════════════════════════
{
  const games = [
    ...many(4, "win",  { my: "居飛車",   opp: "四間飛車" }),
    ...many(3, "lose", { my: "振り飛車", opp: "中飛車" }),
  ];

  const igisha = branchCandidates({ myApproach: ["居飛車"], situation: [], games });
  check("自分の戦法タグで絞り込まれる（他の戦法の対局は混ざらない）",
    igisha.matchedGames === 4 && names(igisha).join(",") === "四間飛車",
    `${igisha.matchedGames}局 ${names(igisha)}`);

  const all = branchCandidates({ myApproach: [], situation: [], games });
  check("タグが無い軸は絞り込みに使わない（全局が対象）",
    all.matchedGames === 7 && all.candidates.length === 2, String(all.matchedGames));

  // 「美濃囲い」と「美濃」のような表記ゆれで枝が二重にできると、ツリーが静かに汚れる
  const yure = branchCandidates({
    myApproach: [], situation: ["四間飛車"], games: many(3, "win", { oppCastle: "美濃囲い" }),
    existingNames: ["美濃"],
  });
  check("囲い名の「囲い」有無は同じ名前として扱う（表記ゆれで枝が二重にならない）",
    yure.candidates.length === 0, JSON.stringify(names(yure)));

  const noMatch = branchCandidates({ myApproach: ["三間飛車"], situation: [], games });
  check("一度も指していない戦法で絞ると、候補は空（対局が無いので事実が無い）",
    noMatch.matchedGames === 0 && noMatch.candidates.length === 0);
}

// ══════════════════════════════════════════════════
// 候補から外すもの
// ══════════════════════════════════════════════════
{
  const games = [
    ...many(5, "win",  { opp: "四間飛車" }),
    ...many(4, "lose", { opp: "中飛車" }),
    ...many(2, "win",  { opp: "三間飛車" }),
  ];

  const some = branchCandidates({ myApproach: [], situation: [], games, existingNames: ["中飛車"] });
  check("既に枝がある相手は候補から消える",
    names(some).join(",") === "四間飛車,三間飛車", names(some).join(","));

  const done = branchCandidates({
    myApproach: [], situation: [], games,
    existingNames: ["四間飛車", "中飛車", "三間飛車"],
  });
  check("全部に枝を作れば候補は空になる（作るほど減って最後は消える）",
    done.candidates.length === 0, JSON.stringify(names(done)));

  // 「不明」「その他」という枝を作っても方針にならないので候補にしない
  const unknown = branchCandidates({
    myApproach: [], situation: [],
    games: [...many(3, "win", { opp: "不明" }), ...many(2, "win", { opp: "その他" }), ...many(1, "win", { opp: "中飛車" })],
  });
  check("『不明』『その他』は候補にしない",
    names(unknown).join(",") === "中飛車", names(unknown).join(","));

  const noCastle = branchCandidates({
    myApproach: [], situation: ["四間飛車"],
    games: many(3, "win", { oppCastle: null }),
  });
  check("囲いが判定できていない対局は候補にならない（対象局数には数える）",
    noCastle.matchedGames === 3 && noCastle.candidates.length === 0, JSON.stringify(names(noCastle)));

  const broken = branchCandidates({ myApproach: [], situation: [], games: [{ id: "x", outcome: "win" }, ...many(2, "win")] });
  check("features が欠けた対局が混ざっても落ちない（除外する）",
    broken.matchedGames === 2, String(broken.matchedGames));

  check("棋譜が1局も無ければ候補も空（初期状態で落ちない）",
    branchCandidates({}).candidates.length === 0);
}

// ══════════════════════════════════════════════════
// 勝敗の数え方
// ══════════════════════════════════════════════════
{
  const r = branchCandidates({
    myApproach: [], situation: [],
    games: [...many(2, "win", { opp: "中飛車" }), ...many(3, "lose", { opp: "中飛車" }), ...many(1, "draw", { opp: "中飛車" })],
  });
  const c = r.candidates[0];
  check("勝ち・負け・引き分けが数え分けられ、合計が局数と合う",
    c.games === 6 && c.wins === 2 && c.losses === 3 && c.draws === 1
      && c.wins + c.losses + c.draws === c.games,
    JSON.stringify(c));
}

// ══════════════════════════════════════════════════
// candidateToNodeFields — 候補から子ノードの初期値を作る
// ══════════════════════════════════════════════════
{
  const c = { name: "中飛車", games: 4, wins: 1, losses: 3, draws: 0 };

  const byStrategy = candidateToNodeFields(c, "oppStrategy");
  check("戦法の候補は、名前がそのままノード名と『相手の戦法』タグになる",
    byStrategy.label === "中飛車" && byStrategy.situation.join(",") === "中飛車",
    JSON.stringify(byStrategy));
  check("『いつ使う』が埋まる（親から見た子一覧が対応表として読めるようにするため）",
    byStrategy.whenToUse === "相手が中飛車で来たとき", byStrategy.whenToUse);

  const byCastle = candidateToNodeFields({ name: "穴熊", games: 2 }, "oppCastle");
  check("囲いの候補では『いつ使う』の言い回しが変わる",
    byCastle.whenToUse === "相手が穴熊のとき", byCastle.whenToUse);
}

console.log(`\n=== ${pass}/${pass + fail} passed ===`);
if (fail > 0) process.exit(1);
