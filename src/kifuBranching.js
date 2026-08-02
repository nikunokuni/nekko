// ══════════════════════════════════════════════════
// kifuBranching.js  ―  ためた棋譜から「分岐の候補」を出す
//
//   ツリー作りで一番手が止まるのは分岐を考えるところ。
//   そこで、実戦で実際に当たった相手を候補として並べる。
//
//   ── 方針 ──
//   ・アプリが出すのは「相手が選ぶ分岐」だけ。
//     自分がどう指すかは枝の中身であって骨格ではないので、利用者に任せる。
//   ・当たったことのない戦法は出さない。定跡表を持たせて「教科書的にはこう」
//     と言わせると、アプリが知識を主張することになり補助の域を超える。
//     実戦に出ていない相手は、その人にとっては対策不要とも言える。
//   ・したがって候補の出どころは自分の棋譜だけ。事実しか言わない。
// ══════════════════════════════════════════════════

// ノードのタグと棋譜の特徴を突き合わせるときの正規化。
// 「美濃囲い」と「美濃」のような表記ゆれを拾えるよう、
// 囲い名の接尾辞「囲い」は落として比べる。
function normalize(name) {
  return String(name || "").trim().replace(/囲い$/, "");
}

function sameName(a, b) {
  const na = normalize(a), nb = normalize(b);
  return !!na && na === nb;
}

/**
 * ノードに対する分岐の候補を、ためた棋譜から作る。
 *
 * 候補の軸はノードの絞り込み具合で自動的に1段深くなる。
 *   ・自分の戦法だけ決まっている → 次に分かれるのは「相手の戦法」
 *   ・相手の戦法まで決まっている → 次に分かれるのは「相手の囲い」
 * これはツリーの2層構造（戦法で横に広げ、その中で縦に深める）と対応する。
 *
 * @param {Object} p
 * @param {string[]} p.myApproach   ノードの「自分の戦法」タグ
 * @param {string[]} p.situation    ノードの「相手の戦法」タグ
 * @param {Array}  p.games          toAnalysisGame 済みの対局（features を持つ）
 * @param {string[]} p.existingNames 既に子ノードになっている名前（候補から除く）
 * @returns {{axis, axisLabel, candidates}}
 *   axis        … 'oppStrategy' | 'oppCastle'
 *   candidates  … [{ name, games, wins, losses, draws }] 局数の多い順
 */
export function branchCandidates({ myApproach = [], situation = [], games = [], existingNames = [] }) {
  // ノードのタグで対局を絞り込む。タグが無い軸は絞り込みに使わない
  const matched = games.filter((g) => {
    const f = g.features;
    if (!f) return false;
    if (myApproach.length && !myApproach.some((t) => sameName(t, f.myStrategy)))  return false;
    if (situation.length  && !situation.some((t) => sameName(t, f.oppStrategy)))  return false;
    return true;
  });

  // 相手の戦法まで決まっているノードでは、次の分かれ目は相手の囲いになる
  const axis = situation.length ? "oppCastle" : "oppStrategy";
  const axisLabel = axis === "oppCastle" ? "相手の囲い" : "相手の戦法";
  const valueOf = (g) => (axis === "oppCastle" ? g.features.oppCastle?.name : g.features.oppStrategy);

  const buckets = new Map();
  for (const g of matched) {
    const name = valueOf(g);
    // 判定できなかったものは候補にしない（「不明」という枝を作っても仕方がない）
    if (!name || name === "不明" || name === "その他") continue;
    if (!buckets.has(name)) buckets.set(name, { name, games: 0, wins: 0, losses: 0, draws: 0 });
    const b = buckets.get(name);
    b.games++;
    if (g.outcome === "win") b.wins++;
    else if (g.outcome === "lose") b.losses++;
    else b.draws++;
  }

  // 既に枝がある相手は候補から外す。枝を作るほど候補が減って、最後は消える
  const candidates = [...buckets.values()]
    .filter((c) => !existingNames.some((n) => sameName(n, c.name)))
    .sort((a, b) => b.games - a.games);

  return { axis, axisLabel, candidates, matchedGames: matched.length };
}

/**
 * 候補から子ノードを作るときの初期値。
 * 相手の戦法／囲いをそのままノード名と「相手の戦法」タグに入れる。
 * 「いつ使う」に一言入れておくと、親から見た子ノード一覧が
 * そのまま「どういうときにどの枝か」の対応表として読める。
 */
export function candidateToNodeFields(candidate, axis) {
  return {
    label: candidate.name,
    situation: [candidate.name],
    whenToUse: axis === "oppCastle"
      ? `相手が${candidate.name}のとき`
      : `相手が${candidate.name}で来たとき`,
  };
}
