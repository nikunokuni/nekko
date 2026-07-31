// ══════════════════════════════════════════════════
// kifuParser.js  ―  KIF / CSA 棋譜ファイルのパーサー
//   棋譜テキスト → 盤面スナップショット配列（ShogiBoard の kifu 形式）
// ══════════════════════════════════════════════════
// 拡張子まで書くのは、test-harness の Node 直実行（ローダ無し）で解決できるようにするため。
// Vite は拡張子の有無どちらでも解決するため、アプリ側の挙動は変わらない。
import { INITIAL_BOARD } from "./data.js";

const emptyHand = () => ({ p:0, l:0, n:0, s:0, g:0, b:0, r:0 });

// ── 全角／漢数字 → 数値 ──────────────────────────
const FILE_ZEN = {
  '１':1,'２':2,'３':3,'４':4,'５':5,'６':6,'７':7,'８':8,'９':9,
  '0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
};
const RANK_KANJI = {
  '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,
  '１':1,'２':2,'３':3,'４':4,'５':5,'６':6,'７':7,'８':8,'９':9,
  '1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
};

// ── 駒種マッピング ────────────────────────────────
// KIF の駒名 → 内部表記（小文字=先手 / '+'付き=成り駒）
const KIF_PIECE = {
  '歩':'p', '香':'l', '桂':'n', '銀':'s', '金':'g', '角':'b', '飛':'r', '玉':'k', '王':'k',
  'と':'+p', '成香':'+l', '成桂':'+n', '成銀':'+s', '馬':'+b', '龍':'+r', '竜':'+r',
};
const PROMOTE_MAP = { p:'+p', l:'+l', n:'+n', s:'+s', b:'+b', r:'+r' };

// CSA の駒種コード → 内部表記
const CSA_PIECE = {
  FU:'p', KY:'l', KE:'n', GI:'s', KI:'g', KA:'b', HI:'r', OU:'k',
  TO:'+p', NY:'+l', NK:'+n', NG:'+s', UM:'+b', RY:'+r',
};

// ── 盤面に1手を適用する ───────────────────────────
// move: { isSente, from:{row,col}|null, to:{row,col}, resultPiece }
function applyMove(state, move) {
  const board = state.board.map(r => [...r]);
  const handSente = { ...state.handSente };
  const handGote  = { ...state.handGote };

  const cell = move.isSente ? move.resultPiece : move.resultPiece.toUpperCase();

  if (!move.from) {
    // 駒打ち
    const base = move.resultPiece.replace('+', '');
    if (move.isSente) handSente[base] = Math.max(0, (handSente[base] ?? 0) - 1);
    else              handGote[base]  = Math.max(0, (handGote[base]  ?? 0) - 1);
  } else {
    const captured = board[move.to.row]?.[move.to.col];
    if (captured && captured !== ' ') {
      const capBase = captured.replace('+', '').toLowerCase();
      if (move.isSente) handSente[capBase] = (handSente[capBase] ?? 0) + 1;
      else              handGote[capBase]  = (handGote[capBase]  ?? 0) + 1;
    }
    board[move.from.row][move.from.col] = ' ';
  }
  board[move.to.row][move.to.col] = cell;

  return { board, handSente, handGote };
}

// ── 指し手列から盤面スナップショット列を構築 ───────
function buildKifuSnapshots(moves, initialState) {
  let state = initialState;
  const snaps = [{
    board:     state.board.map(r => [...r]),
    handSente: { ...state.handSente },
    handGote:  { ...state.handGote },
  }];
  for (const mv of moves) {
    state = applyMove(state, mv);
    snaps.push({
      board:     state.board.map(r => [...r]),
      handSente: { ...state.handSente },
      handGote:  { ...state.handGote },
    });
  }
  return snaps;
}

// ══════════════════════════════════════════════════
// CSA形式パース
// ══════════════════════════════════════════════════
function parseCSA(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let board = INITIAL_BOARD.map(r => [...r]);
  let handSente = emptyHand();
  let handGote  = emptyHand();
  const moves = [];
  // 読み取れない指し手が出た時点で以降の手を捨てる。
  // 1手でも欠けるとそれ以降の局面がすべて崩れるため、途中までで打ち切る。
  let stopped = false;
  let skipped = 0;
  // 指し手らしき行か（"+"/"-" 単独行は手番指定なので除く）
  const looksLikeMove = (l) => l.length > 1 && /^[+-]/.test(l) && !/^P[+-]/.test(l);

  for (const line of lines) {
    if (stopped) {
      if (looksLikeMove(line)) skipped++;
      continue;
    }
    if (line.startsWith("PI")) {
      // 平手初期配置から、指定マスの駒を取り除く（駒落ち）
      board = INITIAL_BOARD.map(r => [...r]);
      const rest = line.slice(2);
      for (let i = 0; i + 4 <= rest.length; i += 4) {
        const tok = rest.slice(i, i + 4);
        const file = +tok[0], rank = +tok[1];
        if (!file || !rank) continue;
        board[rank - 1][9 - file] = ' ';
      }
    } else if (/^P[1-9]/.test(line)) {
      // 盤面の各段を直接指定
      const rank = +line[1];
      const body = line.slice(2);
      for (let i = 0; i < 9; i++) {
        const tok = body.slice(i * 3, i * 3 + 3);
        if (tok.length < 3) continue;
        const sign = tok[0];
        if (sign === '*' || tok.trim() === '*' || tok.trim() === '') {
          board[rank - 1][i] = ' ';
          continue;
        }
        const code = tok.slice(1);
        const base = CSA_PIECE[code];
        if (!base) continue;
        board[rank - 1][i] = sign === '+' ? base : base.toUpperCase();
      }
    } else if (/^P[+-]/.test(line)) {
      // 持ち駒指定
      const isSente = line[1] === '+';
      const rest = line.slice(2);
      for (let i = 0; i + 4 <= rest.length; i += 4) {
        const tok = rest.slice(i, i + 4);
        const file = +tok[0], rank = +tok[1];
        const code = tok.slice(2);
        const base = CSA_PIECE[code];
        if (!base) continue;
        const baseKey = base.replace('+', '');
        if (file === 0 && rank === 0) {
          if (isSente) handSente[baseKey] = (handSente[baseKey] ?? 0) + 1;
          else         handGote[baseKey]  = (handGote[baseKey]  ?? 0) + 1;
        } else {
          board[rank - 1][9 - file] = isSente ? base : base.toUpperCase();
        }
      }
    } else {
      const m = line.match(/^([+-])(\d)(\d)(\d)(\d)([A-Z]{2})/);
      if (!m) {
        // 指し手のはずの行が解析できなければ、そこで打ち切る
        if (looksLikeMove(line)) { skipped++; stopped = true; }
        continue;
      }
      const isSente = m[1] === '+';
      const fromFile = +m[2], fromRank = +m[3];
      const toFile   = +m[4], toRank   = +m[5];
      const resultPiece = CSA_PIECE[m[6]];
      if (!resultPiece) { skipped++; stopped = true; continue; }
      const to = { row: toRank - 1, col: 9 - toFile };
      const from = (fromFile === 0 && fromRank === 0) ? null : { row: fromRank - 1, col: 9 - fromFile };
      moves.push({ isSente, from, to, resultPiece });
    }
  }

  return { initialState: { board, handSente, handGote }, moves, skipped };
}

// ══════════════════════════════════════════════════
// KIF形式パース
// ══════════════════════════════════════════════════
const KIF_END_WORDS = /^(中断|投了|千日手|持将棋|切れ負け|反則勝ち|反則負け|入玉勝ち|詰み|まで)/;

function parseKifMoveText(text, lastTo) {
  let rest = text;
  let to;

  if (rest.startsWith("同")) {
    rest = rest.slice(1).replace(/^[\s　]+/, '');
    if (!lastTo) return null;
    to = lastTo;
  } else {
    const fileCh = rest[0], rankCh = rest[1];
    const file = FILE_ZEN[fileCh], rank = RANK_KANJI[rankCh];
    if (!file || !rank) return null;
    to = { row: rank - 1, col: 9 - file };
    rest = rest.slice(2);
  }

  let from = null;
  const fromMatch = rest.match(/\((\d)(\d)\)\s*$/);
  if (fromMatch) {
    const ff = +fromMatch[1], fr = +fromMatch[2];
    from = { row: fr - 1, col: 9 - ff };
    rest = rest.slice(0, fromMatch.index);
  } else if (rest.endsWith("打")) {
    rest = rest.slice(0, -1);
  }

  // 相対位置・動作の修飾（右/左/直/上/引/寄/行）は移動元座標から特定できる
  // 冗長情報なので取り除く（「５八金右(49)」等を読めるようにする）
  rest = rest.replace(/[右左直上引寄行]/g, "").trim();

  let resultPiece;
  let noPromote = false;
  if (rest.endsWith("不成")) {
    // 「銀不成」等：成らずにそのまま動く
    rest = rest.slice(0, -2);
    noPromote = true;
  }
  if (KIF_PIECE[rest]) {
    resultPiece = KIF_PIECE[rest];
  } else if (!noPromote && rest.endsWith("成") && KIF_PIECE[rest.slice(0, -1)]) {
    const base = KIF_PIECE[rest.slice(0, -1)];
    resultPiece = PROMOTE_MAP[base] || base;
  } else {
    return null;
  }

  return { to, from, resultPiece };
}

function parseKIF(text) {
  const lines = text.split(/\r?\n/);
  const moves = [];
  let lastTo = null;
  let skipped = 0;
  // 読み取れない手が出たら、それ以降の手はすべて捨てる（skipped に数えるだけ）。
  // 1手でも欠けるとそれ以降の局面がすべて崩れるため、途中までで打ち切る。
  let stopped = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // 「変化：n手」以降は分岐（別ライン）の手なので読み込まない。
    // 本譜に連結すると盤面が壊れるため、本譜のみで打ち切る。
    if (/^変化/.test(line)) break;
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;

    let body = m[2].replace(/\(\s*\d+:\d+(?:\/[\d:]+)?\s*\)\s*$/, '').trim();
    if (KIF_END_WORDS.test(body)) continue;

    if (stopped) { skipped++; continue; }

    const moveNum = +m[1];
    const isSente = moveNum % 2 === 1;
    const parsed = parseKifMoveText(body, lastTo);
    if (!parsed) { skipped++; stopped = true; continue; }

    moves.push({ isSente, from: parsed.from, to: parsed.to, resultPiece: parsed.resultPiece });
    lastTo = parsed.to;
  }

  return {
    initialState: { board: INITIAL_BOARD.map(r => [...r]), handSente: emptyHand(), handGote: emptyHand() },
    moves,
    skipped,
  };
}

// ══════════════════════════════════════════════════
// 対局情報（メタ）のパース
//   対局者名・対局日・勝敗を棋譜テキストから読み取る。
//
//   指し手のパース（parseKIF / parseCSA）とは独立に生テキストを走査する。
//   指し手側は読めない手が出た時点で打ち切る仕様のため、そこに相乗りすると
//   途中で壊れた棋譜から勝敗を取り出せなくなるため。
//
//   勝敗の判定は「まで◯手で先手の勝ち」行を最優先し、無い場合のみ
//   終局マーク（投了・詰み等）と、その時点の手番から導出する。
// ══════════════════════════════════════════════════

// 終局マークと、それを「指す番だった側」から見た結果の対応。
//   lose … その手番の側が負け（投了・詰み＝詰まされた側が手番）
//   win  … その手番の側が勝ち
//   draw … 引き分け扱い
const KIF_END_RESULT = {
  '投了': 'lose', '詰み': 'lose', '切れ負け': 'lose', '反則負け': 'lose', '時間切れ': 'lose',
  '反則勝ち': 'win', '入玉勝ち': 'win',
  '千日手': 'draw', '持将棋': 'draw', '引き分け': 'draw',
};

const CSA_END_RESULT = {
  TORYO: 'lose', TSUMI: 'lose', TIME_UP: 'lose', ILLEGAL_MOVE: 'lose', ILLEGAL_ACTION: 'lose',
  KACHI: 'win',
  SENNICHITE: 'draw', JISHOGI: 'draw', HIKIWAKE: 'draw',
};

// 「その手番の側から見た結果」を「先手から見た勝敗」へ変換する。
//   ply … 終局マークの手数（1始まり。奇数=先手の手番）
function resultFromMover(kind, ply) {
  if (kind === 'draw') return 'draw';
  const moverIsSente = ply % 2 === 1;
  if (kind === 'lose') return moverIsSente ? 'gote' : 'sente';
  if (kind === 'win')  return moverIsSente ? 'sente' : 'gote';
  return null;
}

// 「2026/07/20 10:00:00」形式を ISO 文字列へ。読めなければ null
function parseKifuDate(raw) {
  const m = String(raw).trim().match(/(\d{4})[/\-年](\d{1,2})[/\-月](\d{1,2})/);
  if (!m) return null;
  const t = String(raw).match(/(\d{1,2}):(\d{2})/);
  const d = new Date(+m[1], +m[2] - 1, +m[3], t ? +t[1] : 0, t ? +t[2] : 0);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseKifMeta(text) {
  const meta = { senteName: "", goteName: "", playedAt: null, result: null, handicap: "" };
  let lastMovePly = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    // ── ヘッダー（全角・半角どちらのコロンも許容）──
    const h = line.match(/^(先手|後手|下手|上手|開始日時|対局日|手合割)\s*[：:]\s*(.*)$/);
    if (h) {
      const value = h[2].trim();
      // 駒落ちの下手／上手も、指し手の先後と同じ扱いで記録する
      if (h[1] === '先手' || h[1] === '下手') meta.senteName = value;
      else if (h[1] === '後手' || h[1] === '上手') meta.goteName = value;
      else if (h[1] === '手合割') meta.handicap = value;
      else meta.playedAt = parseKifuDate(value) ?? meta.playedAt;
      continue;
    }

    // ── 「まで112手で先手の勝ち」（最も信頼できるので最優先）──
    const fin = line.match(/まで\s*(\d+)\s*手で(先手|後手|下手|上手)の(勝ち|反則勝ち)/);
    if (fin) {
      meta.result = (fin[2] === '先手' || fin[2] === '下手') ? 'sente' : 'gote';
      continue;
    }
    if (/まで\s*\d+\s*手で(千日手|持将棋|引き分け)/.test(line)) { meta.result = 'draw'; continue; }

    // ── 手数付きの行（指し手 or 終局マーク）──
    const m = line.match(/^(\d+)\s+(\S+)/);
    if (!m) continue;
    const ply  = +m[1];
    const body = m[2];
    const kind = Object.keys(KIF_END_RESULT).find((w) => body.startsWith(w));
    if (kind) {
      // 「まで◯手で〜」行が既にあればそちらを優先する
      if (!meta.result) meta.result = resultFromMover(KIF_END_RESULT[kind], ply);
    } else {
      lastMovePly = Math.max(lastMovePly, ply);
    }
  }

  meta.moveCount = lastMovePly;
  return meta;
}

function parseCsaMeta(text) {
  const meta = { senteName: "", goteName: "", playedAt: null, result: null, handicap: "" };
  let moveCount = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('N+')) { meta.senteName = line.slice(2).trim(); continue; }
    if (line.startsWith('N-')) { meta.goteName  = line.slice(2).trim(); continue; }
    const st = line.match(/^\$(?:START_TIME|END_TIME)\s*:\s*(.+)$/);
    if (st) { meta.playedAt = meta.playedAt ?? parseKifuDate(st[1]); continue; }

    // 指し手（+7776FU 形式）。手数から終局時の手番を割り出す
    if (/^[+-]\d{4}[A-Z]{2}/.test(line)) { moveCount++; continue; }

    // 終局コマンド（%TORYO 等。手番記号が前置される場合もある）
    const end = line.match(/^[+-]?%([A-Z_]+)/);
    if (end) {
      const kind = CSA_END_RESULT[end[1]];
      // 終局マークは「次に指す番だった側」の行為なので手数は moveCount + 1
      if (kind && !meta.result) meta.result = resultFromMover(kind, moveCount + 1);
    }
  }

  meta.moveCount = moveCount;
  return meta;
}

// ══════════════════════════════════════════════════
// 形式自動判定 + エクスポート
// ══════════════════════════════════════════════════
function detectFormat(text) {
  if (/^[+-]\d{4}[A-Z]{2}/m.test(text)) return 'csa';
  if (/^P[1-9I+-]/m.test(text)) return 'csa';
  return 'kif';
}

/**
 * 棋譜テキストから対局情報（対局者名・対局日・勝敗）だけを取り出す。
 * 既に取り込み済みの棋譜も source_text から後追いで解析できるよう、
 * 指し手のパースとは独立して呼べるようにしてある。
 * @returns {{senteName, goteName, playedAt, result, handicap, moveCount}}
 *   result … 'sente' | 'gote' | 'draw' | null（null = 中断・判定不能）
 */
export function parseKifuMeta(text) {
  return detectFormat(text) === 'csa' ? parseCsaMeta(text) : parseKifMeta(text);
}

/**
 * 平手の対局かどうか。駒落ちは初期配置も先後の扱いも異なるため、
 * 傾向分析の集計からは除外する。
 */
export function isEvenGame(handicap) {
  const h = (handicap || "").trim();
  return h === "" || h === "平手";
}

/**
 * 棋譜テキスト（KIF or CSA）を盤面スナップショット配列に変換する。
 * @returns {{snapshots, skipped: number, meta} | null}
 */
export function importKifuText(text) {
  const format = detectFormat(text);
  const { initialState, moves, skipped = 0 } = format === 'csa' ? parseCSA(text) : parseKIF(text);
  if (moves.length === 0) return null;
  return {
    snapshots: buildKifuSnapshots(moves, initialState),
    skipped,
    meta: parseKifuMeta(text),
  };
}
