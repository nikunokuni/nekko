// ══════════════════════════════════════════════════
// kifuPosition.js  ―  局面検索（ためた棋譜から「この形」を探す）
//
//   利用者が盤の上で指定した駒の配置に一致する局面を、ためた棋譜の中から探して
//   「どの棋譜の何手目か」を返す。指定されていないマスは見ない（何があってもよい）。
//
//   ── 「似ている」をアプリが決めない ──
//   局面同士の距離を測って「なんとなく似た局面」をまとめる方式は採らない
//   （kifuFeatures.js 冒頭と同じ理由：なぜそのグループなのかを説明できない）。
//   代わりに **どこが同じなら似ているかを利用者が盤の上で指定する**。
//   条件がそのまま画面に見えているので、外れたときも理由が読み取れる。
//   形を決めるのが人間、数えるのが機械、という分担はここでも変わらない。
//
//   ── 盤を81文字に詰めて持つ ──
//   snapshots（JSON）は1局面あたり464バイトあり、300局なら約16MB になる。
//   検索のたびに全件読むことはできない。1マス1文字に詰めると81バイト（約1/5.7）で、
//   300局でも3MB弱。**検索を始めるときに一度だけ読めば、あとは端末の中だけで
//   探せる**ようになる。詰めた文字列は kifus.boards_packed に持つ。
//
//   ── 先後は「条件のほう」を反転させる ──
//   盤面はどれも先手を手前にした絶対座標で保存されている。条件も、持ち込んだ
//   棋譜の盤をそのまま使うので同じ絶対座標。**画面はどこも回さない**
//   （入力盤・一覧のサムネイル・再生がぜんぶ同じ向きになる）。
//
//   ただし探したいのは「自分から見た形」なので、自分が反対側だった棋譜には
//   条件を180度回して当てる。どちら側から作った条件かは querySide で受け取る
//   （＝持ち込んだ棋譜で自分がどちらだったか）。
//     ・棋譜の mySide が querySide と同じ → そのまま当てる
//     ・違う                              → 反転して当てる
//
//   棋譜側を正規化して持たない理由は2つ。
//     ・反転する量が桁違い（条件は81マス×2回／棋譜側は150万マス）
//     ・先後は取り込みのあとで決まることがある（db.js の fetchKifusMissingSide）。
//       棋譜側を正規化していると、決まるたびに詰め直しが要る
//
//   **2つの条件を全棋譜へ無差別に当ててはいけない。** 自分と同じ側の棋譜に
//   反転した条件まで当てると、「相手の囲い」が「自分の囲い」として当たる。
//
//   ── 盤の座標系（data.js / kifuParser.js と共通）──
//     board[row][col]   row = 段 - 1   col = 9 - 筋
//     小文字 = 先手 / 大文字 = 後手 / '+' 付き = 成り駒
// ══════════════════════════════════════════════════

/** 1局面あたりの文字数（9×9） */
export const SQUARES = 81;

// ── 条件盤だけで使う印 ────────────────────────────
//   条件盤は board と同じ 9×9 の配列だが、駒以外に2つの状態を持つ。
//   **この2つを持った配列を board として扱ってはいけない**（盤の描画や
//   kifuParser の applyMove に渡ると静かに壊れる）。検索画面とこのファイルの
//   中だけで使い、DBにも保存しない。だから変数名も board ではなく query にする。
/** 見ない（そのマスは何があってもよい）。board の空マスと同じ文字 */
export const ANY_MARK = " ";
/** 空（どちらの駒も無いことを条件にする）。ここでしか使わない駒 */
export const EMPTY_MARK = "_";

// 詰めた文字列での空マス
const PACKED_EMPTY = ".";

// ── 駒 → 1文字コード ──────────────────────────────
// 成り駒は2文字（'+p'）なので、そのままでは1マス1文字にならない。
// 小文字＝先手／大文字＝後手の対応を保ったまま、成り駒だけ別の字を割り当てる。
//   t=と金 y=成香 u=成桂 e=成銀 h=馬(horse) d=龍(dragon)
const PACK_CODE = {
  p: "p", l: "l", n: "n", s: "s", g: "g", b: "b", r: "r", k: "k",
  "+p": "t", "+l": "y", "+n": "u", "+s": "e", "+b": "h", "+r": "d",
  P: "P", L: "L", N: "N", S: "S", G: "G", B: "B", R: "R", K: "K",
  "+P": "T", "+L": "Y", "+N": "U", "+S": "E", "+B": "H", "+R": "D",
};
// 読み取れない駒は空マスにしない。空にすると「そこには何も無かった」という
// 事実を作ってしまい、空の指定に誤って当たる。どの条件にも当たらない字を置く
const UNKNOWN_CODE = "?";

const UNPACK_CODE = Object.fromEntries(
  Object.entries(PACK_CODE).map(([piece, code]) => [code, piece])
);

/** 駒（board のマスの値）→ 1文字コード */
export function codeOf(cell) {
  if (!cell || cell === " ") return PACKED_EMPTY;
  return PACK_CODE[cell] ?? UNKNOWN_CODE;
}

/**
 * 盤面スナップショット列 → 詰めた文字列（1局面81文字を手数ぶん連結）。
 * 先頭81文字が初期局面（0手目）。
 */
export function packBoards(snapshots) {
  if (!Array.isArray(snapshots)) return "";
  let out = "";
  for (const snap of snapshots) {
    const board = snap?.board;
    if (!Array.isArray(board)) continue;
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) out += codeOf(board[row]?.[col]);
    }
  }
  return out;
}

/** 詰めた文字列が持っている局面の数（0手目を含む） */
export function plyCountOf(packed) {
  return Math.floor((packed?.length ?? 0) / SQUARES);
}

/** 詰めた文字列から ply 手目の盤面を取り出す（サムネイル表示用）。
 *  無ければ null。snapshots を取り直さずに一覧の盤を描くために使う。 */
export function boardAt(packed, ply) {
  const offset = ply * SQUARES;
  if (!packed || ply < 0 || offset + SQUARES > packed.length) return null;
  const board = [];
  for (let row = 0; row < 9; row++) {
    const line = [];
    for (let col = 0; col < 9; col++) {
      const code = packed[offset + row * 9 + col];
      line.push(UNPACK_CODE[code] ?? " ");
    }
    board.push(line);
  }
  return board;
}

/** 条件盤で「指定されている」マスの数（見ないマスは数えない） */
export function countMarks(query) {
  let n = 0;
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if ((query?.[row]?.[col] ?? ANY_MARK) !== ANY_MARK) n++;
    }
  }
  return n;
}

/** 条件盤のその駒が「自分の駒」か。
 *  盤はどちらの棋譜から持ち込んでも絶対座標のままなので、小文字＝自分とは限らない
 *  （自分が後手だった棋譜から持ち込めば、自分の駒は大文字になる）。
 *  入力盤のマスに名前を付けるときに使う。 */
export function isMyPiece(mark, querySide = "sente") {
  if (!mark || mark === ANY_MARK || mark === EMPTY_MARK) return false;
  const base = mark.startsWith("+") ? mark.slice(1) : mark;
  const sentePiece = base === base.toLowerCase();
  return querySide === "gote" ? !sentePiece : sentePiece;
}

/** 駒の先後を入れ替える（'+p' → '+P'）。印はそのまま返す */
function swapSide(mark) {
  if (mark === ANY_MARK || mark === EMPTY_MARK) return mark;
  const promoted = mark.startsWith("+");
  const base = promoted ? mark.slice(1) : mark;
  const flipped = base === base.toLowerCase() ? base.toUpperCase() : base.toLowerCase();
  return promoted ? `+${flipped}` : flipped;
}

/**
 * 条件盤を180度回し、駒の先後も入れ替える（自分が後手だった棋譜に当てる形）。
 *
 * 座標を回すだけで先後を入れ替え忘れると、**画面は何も壊れないまま
 * 結果が静かに0件になる**。「空」は駒ではないので入れ替えない。
 */
export function flipQuery(query) {
  const out = [];
  for (let row = 0; row < 9; row++) {
    const line = [];
    for (let col = 0; col < 9; col++) {
      line.push(swapSide(query?.[8 - row]?.[8 - col] ?? ANY_MARK));
    }
    out.push(line);
  }
  return out;
}

/**
 * 条件盤 → 照合用の [マス番号, 期待する文字] の並び。
 * 見ないマスは落とすので、指定が少ないほど比較の回数も減る。
 */
export function compileQuery(query) {
  const out = [];
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const mark = query?.[row]?.[col] ?? ANY_MARK;
      if (mark === ANY_MARK) continue;
      out.push([row * 9 + col, mark === EMPTY_MARK ? PACKED_EMPTY : codeOf(mark)]);
    }
  }
  return out;
}

/** ply 手目の局面が条件に一致するか */
function matchesAt(packed, ply, compiled) {
  const offset = ply * SQUARES;
  for (const [idx, code] of compiled) {
    if (packed[offset + idx] !== code) return false;
  }
  return true;
}

/**
 * 条件に最初に一致した手数を返す（見つからなければ -1）。
 *
 * 同じ棋譜から1件しか出さないのは、玉の周りだけを指定したような条件では
 * その形が崩れるまでの何十手ぶんが全部一致してしまい、一覧が同じ将棋で
 * 埋まるため。最初の手数は「その形になった瞬間」なので、しおりを付けたい
 * 場所とも一致する。
 *
 * fromPly の既定が1なのは初期局面（0手目）を外すため。初期局面は全棋譜で
 * 同じなので、指定が緩いと全局が0手目で当たる。分岐の起点にもならない。
 */
export function findFirstMatch(packed, compiled, fromPly = 1) {
  if (!packed || compiled.length === 0) return -1;
  const plies = plyCountOf(packed);
  for (let ply = Math.max(0, fromPly); ply < plies; ply++) {
    if (matchesAt(packed, ply, compiled)) return ply;
  }
  return -1;
}

/**
 * ためた棋譜から条件に合う局面を探す。
 *
 * @param {Object} p
 * @param {Array}  p.games  [{ id, mySide, boardsPacked }]（他の項目は表示用にそのまま持つ）
 * @param {Array}  p.query  条件盤（9×9。ANY_MARK / EMPTY_MARK / 駒）
 * @param {"sente"|"gote"} p.querySide 条件を作った棋譜で、自分がどちらだったか。
 *   同じ側の棋譜にはそのまま、反対側の棋譜には反転して当てる
 * @param {number} p.fromPly 何手目から探すか（既定1＝初期局面を外す）
 * @returns {{results, marks, targets, noSide}}
 *   results … [{ kifuId, ply }] games の並び順のまま
 *   targets … 実際に探した棋譜の数（＝件数の分母）
 *   noSide  … 先後が未確定で探せなかった棋譜の数。**黙って母数から落とさない**
 *             ために返す（「あの将棋が出てこない」の理由が画面から読み取れる）
 */
export function searchPositions({ games = [], query, querySide = "sente", fromPly = 1 } = {}) {
  const marks = countMarks(query);
  if (marks === 0) return { results: [], marks: 0, targets: 0, noSide: 0 };

  // 自分が同じ側だった棋譜にはそのまま、反対側だった棋譜には反転した条件を当てる。
  // 両方を全部に当てると、自分と相手を取り違えた形まで当たってしまう
  const direct  = compileQuery(query);
  const flipped = compileQuery(flipQuery(query));

  const results = [];
  let targets = 0, noSide = 0;
  for (const g of games) {
    if (g?.mySide !== "sente" && g?.mySide !== "gote") { noSide++; continue; }
    if (!g.boardsPacked) continue;
    targets++;
    const ply = findFirstMatch(g.boardsPacked, g.mySide === querySide ? direct : flipped, fromPly);
    if (ply >= 0) results.push({ kifuId: g.id, ply });
  }
  return { results, marks, targets, noSide };
}
