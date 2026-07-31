// ══════════════════════════════════════════════════
// kifuStats.js  ―  棋譜の特徴を階層的に集計して傾向を出す
//
//   粗いキー（相手の戦法だけ）から細かいキー（囲いまで含む）まで
//   すべての粒度で同時に集計し、「母数が足りている一番細かい粒度」を
//   採用する。母数が足りなければ自動的に粗い粒度へ落ちるので、
//   少ない棋譜でも数字が壊れない。
//
//   生の勝率をそのまま並べると「2局2勝＝勝率100%」が上位に来て
//   ランキングが意味を失うため、順位付けにはウィルソン信頼区間を使う。
// ══════════════════════════════════════════════════

// ── 集計の粒度（粗い順）──────────────────────────
//   先手／後手は集計軸ではなく絞り込み（filter）で扱う。
//   軸に入れると母数が半分になり、級位者の棋譜数では統計が成立しないため。
export const LEVELS = [
  { key: "opp",        label: "相手の戦法",           dims: ["oppStrategy"] },
  { key: "matchup",    label: "相手の戦法 × 自分の戦法", dims: ["oppStrategy", "myStrategy"] },
  { key: "castle",     label: "＋ 自分の囲い",         dims: ["oppStrategy", "myStrategy", "myCastle"] },
  { key: "oppCastle",  label: "＋ 相手の囲い",         dims: ["oppStrategy", "myStrategy", "myCastle", "oppCastle"] },
];

// ウィルソン信頼区間の z 値。1.0（約68%）は 95%（1.96）より緩く、
// 10〜30局という現実的な母数でも「ほぼ全部が判定不能」にならない。
const Z = 1.0;

/**
 * ウィルソン信頼区間。持将棋・千日手は 0.5勝として数える。
 * @returns {{rate, lower, upper}} いずれも 0〜1
 */
export function wilson(wins, draws, total) {
  if (!total) return { rate: 0, lower: 0, upper: 1 };
  const p = (wins + draws * 0.5) / total;
  const z2n = (Z * Z) / total;
  const center = (p + z2n / 2) / (1 + z2n);
  const margin = (Z / (1 + z2n)) * Math.sqrt((p * (1 - p)) / total + z2n / (4 * total));
  return {
    rate:  p,
    lower: Math.max(0, center - margin),
    upper: Math.min(1, center + margin),
  };
}

// 特徴オブジェクトから、集計軸の値を取り出す
function dimValue(game, dim) {
  const f = game.features;
  switch (dim) {
    case "oppStrategy": return f.oppStrategy;
    case "myStrategy":  return f.myStrategy;
    case "myCastle":    return f.myCastle?.name || "不明";
    case "oppCastle":   return f.oppCastle?.name || "不明";
    default:            return "不明";
  }
}

// 1グループ分の成績をまとめる
function summarize(games) {
  let wins = 0, losses = 0, draws = 0;
  let castleSum = 0, castleCount = 0;
  for (const g of games) {
    if (g.outcome === "win")  wins++;
    else if (g.outcome === "lose") losses++;
    else draws++;
    if (g.features.myCastle) { castleSum += g.features.myCastle.completeness; castleCount++; }
  }
  const total = games.length;
  const w = wilson(wins, draws, total);
  return {
    games: total, wins, losses, draws,
    rate: w.rate, lower: w.lower, upper: w.upper,
    // 囲いの平均完成度。低いほど「囲い切る前に戦いになっている」
    castleCompleteness: castleCount ? castleSum / castleCount : null,
    avgMoveCount: total ? games.reduce((s, g) => s + (g.features.moveCount || 0), 0) / total : 0,
  };
}

/**
 * 指定の粒度でグループ化して集計する。
 * @returns {Array} [{ key, label, values, ...summarize結果, sampleGameIds }]
 */
export function groupBy(games, dims) {
  const buckets = new Map();
  for (const g of games) {
    const values = dims.map((d) => dimValue(g, d));
    const key = values.join("");
    if (!buckets.has(key)) buckets.set(key, { values, games: [] });
    buckets.get(key).games.push(g);
  }
  return [...buckets.entries()].map(([key, b]) => ({
    key,
    label: b.values.join(" × "),
    values: b.values,
    ...summarize(b.games),
    gameIds: b.games.map((g) => g.id),
  }));
}

/**
 * 母数が足りている一番細かい粒度のグループを集める。
 *
 * 粗い粒度から順に見ていき、より細かい粒度で minGames を満たすグループが
 * 作れる場合は、粗い側のグループを細かい側で置き換える。これにより
 * 「四間飛車には勝てているが、四間飛車＋穴熊には負けている」といった
 * 粒度の出し分けが自動で決まる。
 */
export function bestGranularity(games, { minGames = 6 } = {}) {
  // 最も粗い粒度から開始し、細かい粒度で置き換え可能なものを差し替える
  let current = groupBy(games, LEVELS[0].dims).filter((g) => g.games >= minGames);
  let levelOf = new Map(current.map((g) => [g.key, LEVELS[0]]));

  for (let i = 1; i < LEVELS.length; i++) {
    const finer = groupBy(games, LEVELS[i].dims).filter((g) => g.games >= minGames);
    if (finer.length === 0) break;
    const next = [];
    const nextLevel = new Map();
    // 細かい側でカバーされる粗いグループは捨て、カバーされない分だけ残す
    for (const coarse of current) {
      const covered = finer.filter((f) => f.values.slice(0, coarse.values.length).join("") === coarse.key);
      // 細かい側が2つ以上に割れたときだけ置き換える。
      // 1つしか無いなら情報が増えていないので、粗いままのほうが読みやすい
      if (covered.length >= 2) {
        for (const f of covered) { next.push(f); nextLevel.set(f.key, LEVELS[i]); }
      } else {
        next.push(coarse); nextLevel.set(coarse.key, levelOf.get(coarse.key));
      }
    }
    current = next;
    levelOf = nextLevel;
  }
  return current.map((g) => ({ ...g, level: levelOf.get(g.key)?.label || "" }));
}

/**
 * 棋譜の傾向をまとめて算出する。
 *
 * @param {Array} games [{ id, name, outcome:'win'|'lose'|'draw', side, features }]
 * @param {Object} opts minGames … この局数に満たないグループは統計に載せない
 * @returns {{ total, overall, groups, frequent, strong, weak }}
 */
export function analyzeGames(games, { minGames = 6 } = {}) {
  const valid = games.filter((g) => g && g.features && g.outcome);
  const overall = summarize(valid);
  const groups  = bestGranularity(valid, { minGames });

  // ── よく出てくる ── 単純に局数の多い順
  const frequent = [...groups].sort((a, b) => b.games - a.games);

  // ── よく勝てる ── 勝率の下限が全体を上回っているものを、下限の高い順に
  const strong = groups
    .filter((g) => g.lower > overall.rate)
    .sort((a, b) => b.lower - a.lower);

  // ── よく負ける ──
  // 単に勝率が低い順ではなく「全体より確実に低い」ものだけを残し、
  // 取りこぼしている局数（＝影響の大きさ）の順に並べる。
  // 5局で勝率2割より、20局で勝率3割のほうが優先して直すべきという判断。
  const weak = groups
    .filter((g) => g.upper < overall.rate)
    .map((g) => ({ ...g, lostGames: (overall.rate - g.rate) * g.games }))
    .sort((a, b) => b.lostGames - a.lostGames);

  return { total: valid.length, overall, groups, frequent, strong, weak };
}

/**
 * 「先発（自分から振った）」と「対応（相手を見てから振った）」の勝率を比べる。
 * ねっこの目的である「相手の呼吸に合わせた方針」が機能しているかを見るための軸。
 */
export function analyzeSwingTiming(games) {
  const out = {};
  for (const timing of ["先発", "対応"]) {
    const subset = games.filter((g) => g.features?.swingTiming === timing);
    if (subset.length) out[timing] = summarize(subset);
  }
  return out;
}
