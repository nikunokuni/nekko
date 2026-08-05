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

// 特徴の作り方を変えたら上げる。古い解析結果と新しい解析結果は数字の意味が
// 違うので、混ぜて集計すると「静かに間違った傾向」が出る。集計側はこの番号を見て
// 古い棋譜を「再解析が必要」に落とし、傾向画面から作り直せるようにしている。
//   1 … 最初の版
//   2 … 仕掛け／角交換の定義を見直し、戦型の大分類と飛車の振り直しを追加
export const FEATURES_VERSION = 2;

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
// 指し手の復元（盤面の差分から）
// ══════════════════════════════════════════════════
//   スナップショットは盤面と持ち駒しか持っていない（kifuParser.js が
//   board / handSente / handGote だけを積む。再生に要らないものは保存しない）。
//   「どの駒がどこで何を取ったか」が要る判定は、前後の盤面の差分から復元する。
//   平手専用（駒落ちは集計対象外）なので、奇数手＝先手・偶数手＝後手で決まる。

const opposite  = (side) => (side === "sente" ? "gote" : "sente");
const sideOfPly = (ply)  => (ply % 2 === 1 ? "sente" : "gote");

// そのマスの駒が指定側のものか（成り駒も同じ側として数える）
function ownedBy(cell, side) {
  if (!cell || cell === ' ') return false;
  const base = cell.replace('+', '');
  return side === "sente" ? base === base.toLowerCase() : base === base.toUpperCase();
}

/**
 * ply 手目の指し手を、その前後の盤面の差分から復元する。
 * 変化したマスのうち「指した側の駒が新しく現れたマス」が移動先。
 * 移動元は空白になるだけなので、現れたほうだけ見れば手が特定できる。
 * @returns {{side, row, col, piece, captured}|null}
 *   piece    … 指した駒の駒種（成りは落として小文字。'b' なら角・馬）
 *   captured … 取った駒の駒種。取っていなければ null
 */
function moveAt(snapshots, ply) {
  const prev = snapshots[ply - 1]?.board;
  const next = snapshots[ply]?.board;
  if (!prev || !next) return null;
  const side = sideOfPly(ply);
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const before = prev[row][col], after = next[row][col];
      if (before === after || !ownedBy(after, side)) continue;
      return {
        side, row, col,
        piece: after.replace('+', '').toLowerCase(),
        captured: ownedBy(before, opposite(side)) ? before.replace('+', '').toLowerCase() : null,
      };
    }
  }
  return null;
}

// ply 手目が「同じマスで取り返した手」なら、その手を返す
function recaptureAt(snapshots, ply, row, col) {
  const back = moveAt(snapshots, ply);
  return back && back.row === row && back.col === col && back.captured ? back : null;
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

// 居飛車系の戦法。右四間飛車は飛車を右側に据えたまま戦う居飛車の一種なので、
// 筋が2筋でなくても振り飛車には数えない
const STATIC_ROOK_STRATEGIES = new Set(["居飛車", "右四間飛車"]);

/**
 * 自分と相手の戦法から、戦型の大分類を出す。
 *
 * 「相手の戦法＝四間飛車」だけで括ると、自分が居飛車で受けて立った対抗形と、
 * 自分も振った相振り飛車が同じ数字に混ざる。この二つは囲いも狙いも終盤の
 * 入り方も別物なので、まとめた勝率は読んでも次の一手につながらない
 * （振り飛車党が相振りだけ大きく負け越している、という実際に多い形が見えない）。
 *
 * 「相手の戦法 × 自分の戦法」でも分かれはするが、値の組み合わせが増えるぶん
 * 母数が細る。大分類なら値が3つしかないので、級位者の棋譜数でも数字が立つ。
 * @returns {"相居飛車"|"対抗形"|"相振り飛車"|"不明"}
 */
export function formationClass(myStrategy, oppStrategy) {
  const kind = (s) => (!s || s === "不明" || s === "その他") ? null
    : STATIC_ROOK_STRATEGIES.has(s) ? "static" : "ranging";
  const mine = kind(myStrategy), opp = kind(oppStrategy);
  if (!mine || !opp) return "不明";
  if (mine === "static"  && opp === "static")  return "相居飛車";
  if (mine === "ranging" && opp === "ranging") return "相振り飛車";
  return "対抗形";
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
  // ミレニアム（トーチカ）は桂を跳ねて玉頭を守るのが目印。
  // 居飛車と振り飛車で左右が入れ替わるため、同じ名前で2つ登録する
  // （どちらの戦法で使ったかは「自分の戦法」の軸で別に分かれる）。
  { name: "ミレニアム囲い", kings: [[8, 9]], parts: [[8, 8, "s"], [7, 9, "g"], [7, 7, "n"]] },
  { name: "ミレニアム囲い", kings: [[2, 9]], parts: [[2, 8, "s"], [3, 9, "g"], [3, 7, "n"]] },

  // ── 玉が8八の囲い ──
  { name: "矢倉",   kings: [[8, 8]], parts: [[7, 8, "g"], [6, 7, "g"], [7, 7, "s"]] },
  { name: "左美濃", kings: [[8, 8]], parts: [[7, 8, "s"], [6, 9, "g"], [5, 8, "g"]] },

  // ── 玉が7八の囲い ──
  { name: "ボナンザ囲い", kings: [[7, 8]], parts: [[7, 7, "s"], [6, 8, "g"], [5, 8, "g"]] },
  { name: "elmo囲い",     kings: [[7, 8]], parts: [[6, 8, "s"], [7, 9, "g"], [5, 9, "g"]] },

  // ── 玉が下段の囲い ──
  // 雁木は6七銀が目印。玉は6九・7九どちらもある
  { name: "雁木囲い", kings: [[6, 9], [7, 9]], parts: [[6, 7, "s"], [7, 8, "g"], [5, 8, "g"]] },
  { name: "舟囲い",   kings: [[6, 8]], parts: [[7, 8, "s"], [5, 8, "g"], [4, 9, "g"]] },

  // ── 玉が中央の囲い ──
  // 中住まいは玉を5八に据え、金を3八と7八へ左右に開く
  { name: "中住まい", kings: [[5, 8]], parts: [[3, 8, "g"], [4, 8, "s"], [7, 8, "g"]] },

  // ── 玉が2八・3八の囲い ──
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
// 戦型としての角交換が起きるのはここまで。角換わり・角交換振り飛車の角交換は
// 序盤の駒組みの一部として起こる。これより後ろで角が入れ替わるのは中盤の
// 捌き合いであって、狙いも囲いの選び方も変わらない。
const BISHOP_EXCHANGE_PLY = 30;

/**
 * 序盤で角交換が成立した手数を返す（成立しなければ null）。
 *
 * 「角が角を取り、次の手でそのマスを取り返された」という往復だけを角交換と数える。
 * 盤上から角が2枚消えたかどうかで見ると、角と銀を刺し違えた将棋や、
 * 片方が角を只で取った将棋まで「角交換あり」に入ってしまい、
 * 「角交換型の将棋か」という問いの答えにならない。
 */
export function findBishopExchangePly(snapshots) {
  if (!Array.isArray(snapshots)) return null;
  const last = snapshots.length - 1;
  for (let i = 1; i <= Math.min(BISHOP_EXCHANGE_PLY, last); i++) {
    const mv = moveAt(snapshots, i);
    if (!mv || mv.piece !== "b" || mv.captured !== "b") continue;
    const back = recaptureAt(snapshots, i + 1, mv.row, mv.col);
    // 取り返した駒が角（＝馬を取り返した）とは限らないので、取り返しの有無だけ見る
    if (back) return i + 1;
  }
  return null;
}

/** 盤上から角が2枚とも消えていれば角交換済みとみなす（局面ごとの表示用）。
 *  対局全体の「角交換型かどうか」には使わない（上の findBishopExchangePly を使う）。 */
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
// 飛車の振り直しをどこまで見るか。戦型が決まる40手より長く取るのは、
// 「相手の最初の攻めを受け止めてから振り直す」形を拾うため（これが振り直しの本体）。
// かといって上限を外すと、終盤に飛車が自陣へ戻ってくる手まで振り直しに数えてしまう。
const RESWING_OBSERVE_PLY = 60;

/**
 * 自陣の飛車が据えられた筋の移り変わりを返す。
 *
 * 前線へ出ただけの手（2六飛・3四飛など）を「振った」と数えないよう、
 * 自陣にいるあいだの筋だけを見る（`rookFileInCamp`）。前へ出て同じ筋へ戻る手は
 * 筋が変わらないので記録されない。
 * @returns {Array<{ply, file}>} 定位置(2筋)から筋が変わった順。居飛車のままなら空
 */
export function rookSwingHistory(snapshots, side, limit) {
  const out = [];
  let current = ROOK_HOME_FILE;
  for (let i = 1; i <= limit; i++) {
    const f = rookFileInCamp(snapshots[i]?.board, side);
    if (f == null || f === current) continue;
    current = f;
    out.push({ ply: i, file: f });
  }
  return out;
}

// その対局の戦法は「1回目に振った筋」で決まる。最後に据えた筋を採ると、
// 四間飛車から三間飛車へ振り直した将棋が丸ごと「三間飛車」になり、
// 最初にぶつかった戦型（＝相手が対策を立ててきた形）が数字から消える。
function firstSwing(history) { return history.length ? history[0] : null; }

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

// ══════════════════════════════════════════════════
// 仕掛け（戦いが始まった手）
// ══════════════════════════════════════════════════
/**
 * 仕掛けの手と、仕掛けた側を返す（駒がぶつからなければ null）。
 *
 * 「最初に駒を取った手」をそのまま仕掛けとすると、居飛車が当たり前に行う
 * 飛車先の歩交換（▲2四歩△同歩▲同飛）まで仕掛けになる。これは駒組みの一部で、
 * 戦いの始まりではない。しかも歩を取り合ったとき、動いたのは歩を突き捨てて
 * 相手に取らせた側であって、取った側ではない。
 *
 * そこで次のように決める。
 *   ・角交換の取り合いは数えない（角交換は別の特徴として持っている）
 *   ・歩を歩で取り、次の手で同じマスを**飛車が**取り返したら飛車先の歩交換として
 *     数えない。取り返したのが銀・香なら棒銀や端攻めの突破なので仕掛けに数える
 *     （▲2四歩△同歩▲同飛は駒組み、▲2四歩△同歩▲同銀は仕掛け）
 *   ・残った最初の駒取りが「歩を歩で取った手」なら、仕掛けたのは取られた側
 *     （突き捨てた側）。それ以外の駒を取った手は、取った側が仕掛けたと見る
 *
 * @returns {{ply, side}|null} ply は突き捨ての手（分からなければ取り合いの手）
 */
export function detectBreakPoint(snapshots) {
  if (!Array.isArray(snapshots)) return null;
  const last = snapshots.length - 1;
  let skipUntil = 0;

  for (let i = 1; i <= last; i++) {
    if (i <= skipUntil) continue;
    const mv = moveAt(snapshots, i);
    if (!mv || !mv.captured) continue;
    const back = recaptureAt(snapshots, i + 1, mv.row, mv.col);

    // 角交換の往復は丸ごと飛ばす（只取りは飛ばさない。大事件なので仕掛けに数える）
    if (mv.piece === "b" && mv.captured === "b" && back) { skipUntil = i + 1; continue; }
    // 飛車先の歩交換の往復
    if (mv.piece === "p" && mv.captured === "p" && back?.piece === "r") { skipUntil = i + 1; continue; }

    const pawnTrade = mv.piece === "p" && mv.captured === "p";
    const side = pawnTrade ? opposite(mv.side) : mv.side;
    // 突き捨てが直前の手なら、そちらを仕掛けの手数とする。
    // 前から置いてあった歩を取っただけなら、取り合いの手を境目にする
    const push = pawnTrade ? moveAt(snapshots, i - 1) : null;
    const onPush = push && push.piece === "p" && push.row === mv.row && push.col === mv.col;
    return { ply: onPush ? i - 1 : i, side };
  }
  return null;
}

/**
 * 1局分の棋譜から、集計キーに使う特徴をまとめて取り出す。
 * @param {Array} snapshots 盤面スナップショット配列（[0] が初期局面）
 * @param {"sente"|"gote"} mySide 自分がどちら側か
 */
export function extractGameFeatures(snapshots, mySide) {
  if (!Array.isArray(snapshots) || snapshots.length < 2 || !mySide) return null;
  const oppSide  = opposite(mySide);
  const lastPly  = snapshots.length - 1;
  const settlePly = Math.min(STRATEGY_SETTLE_PLY,  lastPly);
  const castlePly = Math.min(CASTLE_OBSERVE_PLY,   lastPly);
  const swingPlyLimit = Math.min(RESWING_OBSERVE_PLY, lastPly);

  // 戦型は40手までの1回目の振りで決め、振り直しはそれより長く見る。
  // 同じ履歴から両方を読むので、戦法と振り直しの数え方がずれない
  const myHistory  = rookSwingHistory(snapshots, mySide,  swingPlyLimit);
  const oppHistory = rookSwingHistory(snapshots, oppSide, swingPlyLimit);
  const inSettle = (h) => h.filter((s) => s.ply <= settlePly);

  const mySwing  = firstSwing(inSettle(myHistory));
  const oppSwing = firstSwing(inSettle(oppHistory));

  // 「先発」＝自分から戦型を決めた / 「対応」＝相手の戦型を見てから合わせた。
  // 同じ四間飛車でも、この二つは狙いがまったく違うため特徴として分けて持つ。
  // （相手の右四間飛車を受けるために振る、といったケースを取りこぼさない）
  let swingTiming = null;
  if (mySwing) {
    swingTiming = (!oppSwing || mySwing.ply < oppSwing.ply) ? "先発" : "対応";
  }

  const myStrategy  = strategyFromRookFile(mySwing  ? mySwing.file  : ROOK_HOME_FILE);
  const oppStrategy = strategyFromRookFile(oppSwing ? oppSwing.file : ROOK_HOME_FILE);
  const breakPoint  = detectBreakPoint(snapshots);
  const bishopPly   = findBishopExchangePly(snapshots);

  return {
    v: FEATURES_VERSION,
    moveCount:   lastPly,
    myStrategy,
    oppStrategy,
    formation:   formationClass(myStrategy, oppStrategy),
    myCastle:    bestCastle(snapshots, mySide,  castlePly),
    oppCastle:   bestCastle(snapshots, oppSide, castlePly),
    bishopExchangePly: bishopPly,
    bishopExchanged:   bishopPly != null,
    swingPly:    mySwing?.ply ?? null,
    swingTiming,
    swingSpeed:  !mySwing ? null : (mySwing.ply <= EARLY_SWING_PLY ? "早い" : "遅い"),
    // 2回目以降の振りが振り直し。相手に振り直させたということは、
    // 相手が最初に用意してきた攻めは受け止められている
    myReswingPly:  myHistory[1]?.ply  ?? null,
    oppReswingPly: oppHistory[1]?.ply ?? null,
    breakPly:  breakPoint?.ply ?? null,
    // 仕掛けたのが自分か相手か。受けに回ると崩れるのか、攻め切れないのかは
    // 直したいところが正反対なので、勝率を分けて見られるようにする
    attackFirst: !breakPoint ? null
      : breakPoint.side === mySide ? "自分から仕掛けた" : "相手から仕掛けられた",
  };
}

// ══════════════════════════════════════════════════
// 棋譜の節目
// ══════════════════════════════════════════════════
//   「どこで分岐を作るか」を探すときの手がかり。
//   序盤の駒組みと、戦いが始まってからでは研究したいことが違うので、
//   その境目を機械で拾って印を出す。
//   ここはエンジンなしで盤面だけから決まるものに限る。

const SIDE_LABEL = { sente: "先手", gote: "後手" };

/**
 * 棋譜から節目の手数を拾う。
 * @returns {Array<{ply, label}>} 手数の昇順。同じ手数に重なったものはまとめない
 */
export function detectMilestones(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length < 2) return [];
  const last = snapshots.length - 1;
  const out = [];

  // ── 仕掛け ──
  // 序盤の駒組みと戦いの境目。範囲切り出しの区切りとして一番使いやすい。
  // 飛車先の歩交換は境目にならない（駒組みの途中で切れてしまう）ので、
  // detectBreakPoint と同じ見かたで拾う
  const breakPoint = detectBreakPoint(snapshots);
  if (breakPoint) out.push({ ply: breakPoint.ply, label: `${SIDE_LABEL[breakPoint.side]}の仕掛け` });

  // ── 角交換が成立した手 ──
  const bishopPly = findBishopExchangePly(snapshots);
  if (bishopPly) out.push({ ply: bishopPly, label: "角交換" });

  // ── 戦型が決まった手（後から飛車を振ったほうに合わせる）──
  // どちらも振らなければ相居飛車なので節目にしない
  const settleLimit = Math.min(STRATEGY_SETTLE_PLY, last);
  const histories = ["sente", "gote"].map((side) => ({
    side, history: rookSwingHistory(snapshots, side, Math.min(RESWING_OBSERVE_PLY, last)),
  }));
  const swings = histories
    .map(({ history }) => firstSwing(history.filter((s) => s.ply <= settleLimit))?.ply)
    .filter((p) => p != null);
  if (swings.length) out.push({ ply: Math.max(...swings), label: "戦型が決まる" });

  // ── 飛車を振り直した手 ──
  // 最初の攻めを受け止めたあと作戦を組み替えた場所。研究したい所が変わる境目
  for (const { side, history } of histories) {
    if (history[1]) out.push({ ply: history[1].ply, label: `${SIDE_LABEL[side]}が飛車を振り直す` });
  }

  // ── 囲いが完成した手（先後それぞれ最初に組み上がった手）──
  for (const side of ["sente", "gote"]) {
    for (let i = 1; i <= Math.min(CASTLE_OBSERVE_PLY, last); i++) {
      const c = detectCastle(snapshots[i].board, side);
      if (c.completeness === 1) {
        out.push({ ply: i, label: `${side === "sente" ? "先手" : "後手"}の囲い完成` });
        break;
      }
    }
  }

  return out.sort((a, b) => a.ply - b.ply);
}
