// ══════════════════════════════════════════════════
// kifuParser.js  ―  KIF / CSA 棋譜ファイルのパーサー
//   棋譜テキスト → 盤面スナップショット配列（ShogiBoard の kifu 形式）
// ══════════════════════════════════════════════════
import { INITIAL_BOARD } from "./data";

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

  for (const line of lines) {
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
      if (!m) continue;
      const isSente = m[1] === '+';
      const fromFile = +m[2], fromRank = +m[3];
      const toFile   = +m[4], toRank   = +m[5];
      const resultPiece = CSA_PIECE[m[6]];
      if (!resultPiece) continue;
      const to = { row: toRank - 1, col: 9 - toFile };
      const from = (fromFile === 0 && fromRank === 0) ? null : { row: fromRank - 1, col: 9 - fromFile };
      moves.push({ isSente, from, to, resultPiece });
    }
  }

  return { initialState: { board, handSente, handGote }, moves };
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

  rest = rest.trim();
  let resultPiece;
  if (KIF_PIECE[rest]) {
    resultPiece = KIF_PIECE[rest];
  } else if (rest.endsWith("成") && KIF_PIECE[rest.slice(0, -1)]) {
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

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;

    let body = m[2].replace(/\(\s*\d+:\d+(?:\/[\d:]+)?\s*\)\s*$/, '').trim();
    if (KIF_END_WORDS.test(body)) continue;

    const moveNum = +m[1];
    const isSente = moveNum % 2 === 1;
    const parsed = parseKifMoveText(body, lastTo);
    if (!parsed) { skipped++; continue; }

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
// 形式自動判定 + エクスポート
// ══════════════════════════════════════════════════
function detectFormat(text) {
  if (/^[+-]\d{4}[A-Z]{2}/m.test(text)) return 'csa';
  if (/^P[1-9I+-]/m.test(text)) return 'csa';
  return 'kif';
}

/**
 * 棋譜テキスト（KIF or CSA）を盤面スナップショット配列に変換する。
 * @returns {{snapshots: Array<{board, handSente, handGote}>, skipped: number} | null}
 */
export function importKifuText(text) {
  const format = detectFormat(text);
  const { initialState, moves, skipped = 0 } = format === 'csa' ? parseCSA(text) : parseKIF(text);
  if (moves.length === 0) return null;
  return { snapshots: buildKifuSnapshots(moves, initialState), skipped };
}
