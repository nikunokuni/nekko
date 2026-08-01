// ══════════════════════════════════════════════════
// kifuFeatures.js  ―  棋譜（盤面スナップショット列）からの特徴抽出
//
//   「まったく同じ局面」は級位者の実戦ではめったに再現しない。
//   そこで局面そのものではなく、局面から読み取れる特徴
//   （飛車の筋・囲い・角交換の有無）をキーにして集計する。
//
//   特徴は必ず名前の付くものだけを採る。距離計算で「なんとなく似た局面」を
//   まとめる方式は、なぜそのグループなのかを利用者に説明できないため採らない。
//
//   ── 盤面の座標系（data.js / kifuParser.js と共通）──
//     board[row][col]   row = 段 - 1   col = 9 - 筋
//     小文字 = 先手 / 大文字 = 後手 / '+' 付き = 成り駒
// ══════════════════════════════════════════════════

// ── 座標ユーティリティ ────────────────────────────
const at = (board, file, rank) => board?.[rank - 1]?.[9 - file] ?? ' ';

// 後手の特徴は盤面を180度回して先手視点に揃える（テンプレートを1組で済ませる）
const mirrorFile = (file) => 10 - file;
const mirrorRank = (rank) => 10 - rank;

// 先手視点の (file, rank) を、指定側の実際のマスへ変換する
function squareFor(side, file, rank) {
  return side === "sente" ? [file, rank] : [mirrorFile(file), mirrorRank(rank)];
}

// そのマスの駒が、指定側の指定駒種かどうか（成り駒は別物として扱う）
function isPiece(board, side, file, rank, type) {
  const [f, r] = squareFor(side, file, rank);
  const cell = at(board, f, r);
  if (!cell || cell === ' ') return false;
  return side === "sente" ? cell === type : cell === type.toUpperCase();
}

// ══════════════════════════════════════════════════
// 飛車の筋 → 戦法名
// ══════════════════════════════════════════════════
// 先手の飛車の定位置は2筋、後手は8筋。後手は筋を反転して同じ表で引く。
const ROOK_HOME_FILE = 2;

const STRATEGY_BY_FILE = {
  2: "居飛車",
  4: "右四間飛車",
  5: "中飛車",
  6: "四間飛車",
  7: "三間飛車",
  8: "向かい飛車",
};

/** 盤上の自分の飛車がある筋を返す（先手視点に正規化）。盤上に無ければ null */
export function rookFile(board, side) {
  const target = side === "sente" ? "r" : "R";
  for (let rank = 1; rank <= 9; rank++) {
    for (let file = 1; file <= 9; file++) {
      const cell = at(board, file, rank);
      // 成り駒（龍）も飛車として数える
      if (cell === target || cell === `+${target}`) {
        return side === "sente" ? file : mirrorFile(file);
      }
    }
  }
  return null;
}

/**
 * 自陣（先手なら7〜9段／後手なら1〜3段）にいるときだけ飛車の筋を返す。
 *
 * 戦法は「自陣で飛車をどの筋に据えたか」で決まる。序盤を過ぎると飛車は
 * 戦いのために前へ出たり横へ動いたりするので、盤上のどこにいても筋を読むと
 * 横歩取りの3四飛を「三間飛車」と取り違えるなど、判定を誤る。
 * 成り駒（龍）はもう序盤ではないので数えない。
 */
export function rookFileInCamp(board, side) {
  const target = side === "sente" ? "r" : "R";
  for (let rank = 1; rank <= 9; rank++) {
    for (let file = 1; file <= 9; file++) {
      if (at(board, file, rank) !== target) continue;
      const inCamp = side === "sente" ? rank >= 7 : rank <= 3;
      if (!inCamp) return null;
      return side === "sente" ? file : mirrorFile(file);
    }
  }
  return null;
}

/** 正規化した飛車の筋 → 戦法名。表に無い筋は「その他」 */
export function strategyFromRookFile(file) {
  if (file == null) return "不明";
  return STRATEGY_BY_FILE[file] || "その他";
}

// ══════════════════════════════════════════════════
// 囲いの判定
// ══════════════════════════════════════════════════
//   すべて先手視点の [筋, 段] で定義する。後手は自動で反転する。
//   kings … 玉の位置の候補。ここに一致しない囲いは候補から外す。
//           雁木のように玉の位置が一通りに決まらない囲いがあるため配列で持つ。
//   parts … 玉以外の構成駒。何枚一致したかが「完成度」になる。
//
//   完成度を持たせるのは、「囲いが未完成のうちに攻められて負けている」
//   という傾向を出せるようにするため（級位者の負け筋として頻出する）。
//
//   並び順は「完成度も構成駒数も同じ」ときの優先順位になる。
//   玉の位置が同じ囲い同士（6八の舟囲い／elmo／ボナンザ／雁木など）では、
//   基本形で出現頻度の高いものを先に置く。
const CASTLE_TEMPLATES = [
  // ── 玉を端に寄せる囲い ──
  { name: "居飛車穴熊",   kings: [[9, 9]], parts: [[9, 8, "l"], [8, 8, "s"], [7, 9, "g"], [7, 8, "g"]] },
  { name: "振り飛車穴熊", kings: [[1, 9]], parts: [[2, 8, "s"], [3, 9, "g"], [3, 8, "g"]] },
  // ミレニアム（トーチカ）は7七に桂が跳ねているのが目印
  { name: "ミレニアム囲い", kings: [[8, 9]], parts: [[8, 8, "s"], [7, 8, "g"], [7, 7, "n"]] },

  // ── 玉が8八の囲い ──
  { name: "矢倉",   kings: [[8, 8]], parts: [[7, 8, "g"], [6, 7, "g"], [7, 7, "s"]] },
  { name: "左美濃", kings: [[8, 8]], parts: [[7, 8, "s"], [6, 9, "g"], [5, 8, "g"]] },

  // ── 玉が6八まわりの囲い ──
  // 舟囲いを先に置く。7八銀＋5八金までは共通で、
  // 4九金なら舟囲い／7九金ならelmo囲いと、金の位置で分かれる
  { name: "舟囲い",     kings: [[6, 8]], parts: [[7, 8, "s"], [5, 8, "g"], [4, 9, "g"]] },
  { name: "elmo囲い",   kings: [[6, 8]], parts: [[7, 8, "s"], [7, 9, "g"], [5, 8, "g"]] },
  { name: "ボナンザ囲い", kings: [[6, 8]], parts: [[5, 8, "g"], [7, 8, "g"], [7, 7, "s"]] },
  // 雁木は6七・7七の二枚銀が目印。玉の位置は6八・7九どちらもある
  { name: "雁木囲い",   kings: [[6, 8], [7, 9]], parts: [[6, 7, "s"], [7, 7, "s"], [7, 8, "g"]] },

  // ── 玉が中央の囲い ──
  { name: "中住まい", kings: [[5, 8]], parts: [[4, 8, "g"], [6, 8, "g"]] },

  // ── 玉が2八まわりの囲い ──
  { name: "銀冠",     kings: [[2, 8]], parts: [[2, 7, "s"], [3, 8, "g"], [5, 8, "g"]] },
  { name: "高美濃",   kings: [[2, 8]], parts: [[3, 8, "s"], [4, 7, "g"], [5, 8, "g"]] },
  { name: "美濃囲い", kings: [[2, 8]], parts: [[3, 8, "s"], [4, 9, "g"], [5, 8, "g"]] },
  // 片美濃（金1枚）は本美濃の作りかけではなく、それ自体が完成形の囲い。
  // 独立させないと「美濃囲い（完成度67%）」と出て、組めていないように見えてしまう。
  { name: "片美濃囲い", kings: [[2, 8]], parts: [[3, 8, "s"], [4, 9, "g"]] },
  { name: "金無双",   kings: [[3, 8]], parts: [[4, 8, "g"], [5, 8, "g"], [2, 8, "s"]] },
];

/**
 * 盤面から囲いを判定する。
 * @returns {{name, completeness, parts}} completeness は 0〜1、
 *   parts はその囲いの構成駒数（同じ完成度でどちらを採るかの比較に使う）。
 *   玉が定位置(5九)のままなら「居玉」、どの型にも当てはまらなければ「その他」
 */
export function detectCastle(board, side) {
  // 玉の位置を先手視点で求める
  const kingChar = side === "sente" ? "k" : "K";
  let kingSq = null;
  for (let rank = 1; rank <= 9 && !kingSq; rank++) {
    for (let file = 1; file <= 9; file++) {
      if (at(board, file, rank) === kingChar) {
        kingSq = side === "sente" ? [file, rank] : [mirrorFile(file), mirrorRank(rank)];
        break;
      }
    }
  }
  if (!kingSq) return { name: "不明", completeness: 0, parts: 0 };
  if (kingSq[0] === 5 && kingSq[1] === 9) return { name: "居玉", completeness: 0, parts: 0 };

  let best = { name: "その他", completeness: 0, parts: 0 };
  for (const tpl of CASTLE_TEMPLATES) {
    if (!tpl.kings.some(([f, r]) => f === kingSq[0] && r === kingSq[1])) continue;
    const hit = tpl.parts.filter(([f, r, t]) => isPiece(board, side, f, r, t)).length;
    const completeness = hit / tpl.parts.length;
    if (completeness < 0.5) continue;   // 玉の位置が合っていても半分未満なら別の囲い
    // 完成度が同じなら構成駒の多いほう（＝より発展した囲い）を採る。
    // 本美濃と片美濃はどちらも成立しうるので、揃っているなら本美濃と呼ぶ。
    const better = completeness > best.completeness
      || (completeness === best.completeness && tpl.parts.length > best.parts);
    if (better) best = { name: tpl.name, completeness, parts: tpl.parts.length };
  }
  // 玉は動いているが型に当てはまらない場合は「その他」（完成度0）
  return best;
}

// ══════════════════════════════════════════════════
// 角交換
// ══════════════════════════════════════════════════
/** 盤上から角が2枚とも消えていれば角交換済みとみなす */
export function isBishopExchanged(board) {
  for (const row of board) {
    for (const cell of row) {
      if (cell === "b" || cell === "B" || cell === "+b" || cell === "+B") return false;
    }
  }
  return true;
}

// ══════════════════════════════════════════════════
// 局面ごとの特徴（Phase 2 の局面別集計でも使う）
// ══════════════════════════════════════════════════
export function positionFeatures(snapshot, side) {
  const board = snapshot?.board;
  if (!board) return null;
  const file = rookFile(board, side);
  return {
    rookFile: file,
    strategy: strategyFromRookFile(file),
    castle:   detectCastle(board, side),
    bishopExchanged: isBishopExchanged(board),
  };
}

// ══════════════════════════════════════════════════
// 対局全体の特徴
// ══════════════════════════════════════════════════
// 戦型が定まるおおよその手数。ここでの飛車の筋を「その対局の戦法」とする。
const STRATEGY_SETTLE_PLY = 40;
// 囲いは戦型より遅れて完成するため、より長く観測する
const CASTLE_OBSERVE_PLY  = 80;
// この手数までに飛車を振っていれば「早い」（自分から戦型を決めにいった目安）
const EARLY_SWING_PLY     = 20;

// 序盤のあいだに飛車が自陣で最後に据えられた筋を返す。
// 途中で前線へ出ても、出る前の筋がその対局の戦法を表す。
// 一度も自陣を離れなければ定位置のまま＝居飛車。
function settledRookFile(snapshots, side, limit) {
  let settled = ROOK_HOME_FILE;
  for (let i = 0; i <= limit; i++) {
    const f = rookFileInCamp(snapshots[i]?.board, side);
    if (f != null) settled = f;
  }
  return settled;
}

// 飛車が定位置の筋を離れた最初の手数を返す（振らなければ null）。
// 前線へ出ただけの手（2六飛・3四飛など）を「振った」と数えないよう、
// 自陣にいるあいだの筋だけを見る。
function findSwingPly(snapshots, side, limit) {
  for (let i = 1; i <= limit; i++) {
    const f = rookFileInCamp(snapshots[i]?.board, side);
    if (f != null && f !== ROOK_HOME_FILE) return i;
  }
  return null;
}

// 観測範囲でもっとも完成度の高かった囲いを採る。
// 終局間際は囲いが崩されているため、最終局面だけを見ると判定を誤る。
function bestCastle(snapshots, side, limit) {
  let best = { name: "居玉", completeness: 0, parts: 0 };
  let sawNonIgyoku = false;
  for (let i = 0; i <= limit; i++) {
    const c = detectCastle(snapshots[i]?.board, side);
    if (c.name !== "居玉" && c.name !== "不明") sawNonIgyoku = true;
    // detectCastle と同じ優先順位（完成度 → 構成駒の多さ）で比べる。
    // 完成度だけで比べると、片美濃のまま本美濃へ発展した対局で
    // 先に見つかった片美濃が残り続けてしまう。
    const better = c.completeness > best.completeness
      || (c.completeness === best.completeness && (c.parts || 0) > (best.parts || 0));
    if (better) best = c;
  }
  // 一度も型にはまらなかった場合、玉が動いていれば「その他」、動いていなければ「居玉」
  if (best.completeness === 0) return { name: sawNonIgyoku ? "その他" : "居玉", completeness: 0, parts: 0 };
  return best;
}

/**
 * 1局分の棋譜から、集計キーに使う特徴をまとめて取り出す。
 * @param {Array} snapshots 盤面スナップショット配列（[0] が初期局面）
 * @param {"sente"|"gote"} mySide 自分がどちら側か
 */
export function extractGameFeatures(snapshots, mySide) {
  if (!Array.isArray(snapshots) || snapshots.length < 2 || !mySide) return null;
  const oppSide  = mySide === "sente" ? "gote" : "sente";
  const lastPly  = snapshots.length - 1;
  const settlePly = Math.min(STRATEGY_SETTLE_PLY, lastPly);
  const castlePly = Math.min(CASTLE_OBSERVE_PLY,  lastPly);

  const myFile  = settledRookFile(snapshots, mySide,  settlePly);
  const oppFile = settledRookFile(snapshots, oppSide, settlePly);

  const mySwing  = findSwingPly(snapshots, mySide,  settlePly);
  const oppSwing = findSwingPly(snapshots, oppSide, settlePly);

  // 「先発」＝自分から戦型を決めた / 「対応」＝相手の戦型を見てから合わせた。
  // 同じ四間飛車でも、この二つは狙いがまったく違うため特徴として分けて持つ。
  // （相手の右四間飛車を受けるために振る、といったケースを取りこぼさない）
  let swingTiming = null;
  if (mySwing != null) {
    swingTiming = (oppSwing == null || mySwing < oppSwing) ? "先発" : "対応";
  }

  return {
    moveCount:   lastPly,
    myStrategy:  strategyFromRookFile(myFile),
    oppStrategy: strategyFromRookFile(oppFile),
    myCastle:    bestCastle(snapshots, mySide,  castlePly),
    oppCastle:   bestCastle(snapshots, oppSide, castlePly),
    bishopExchanged: isBishopExchanged(snapshots[Math.min(60, lastPly)].board),
    swingPly:    mySwing,
    swingTiming,
    swingSpeed:  mySwing == null ? null : (mySwing <= EARLY_SWING_PLY ? "早い" : "遅い"),
  };
}
