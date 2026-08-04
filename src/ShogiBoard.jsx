// ══════════════════════════════════════════════════
// ShogiBoard.jsx  ―  将棋盤ウィジェット
//   Canvas描画 / 駒移動 / 持ち駒 / 成り / スタンプ
//   棋譜記録（録画） / 棋譜再生（←→ナビ）
// ══════════════════════════════════════════════════
import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { PIECE_LABEL, PROMOTED_LABEL, PROMOTABLE } from "./data";
import { detectMilestones } from "./kifuFeatures";

const CELL = 38;
const COLS = 9, ROWS = 9;

const STAMP_COLOR = { maru:'#2471A3', ya:'#6B3FA0', shikaku:'#C0392B', q:'#5F5E5A' };
const STAMP_CHAR  = { maru:'○', ya:'➡', shikaku:'□', q:'？' };

// ── 矢印スタンプを描画（マスの中心→中心へ大きな矢印） ──
function drawArrowStamp(ctx, x1, y1, x2, y2, color, cell) {
  const headLen = cell * 0.34;
  const angle   = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = cell * 0.14; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - headLen * 0.6 * Math.cos(angle), y2 - headLen * 0.6 * Math.sin(angle));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── 駒ユーティリティ ──────────────────────────────
const isSentePiece = (p) => /^\+?[a-z]$/.test(p);
const isPromoted   = (p) => p.startsWith('+');
const baseKey      = (p) => p.replace('+', '').toLowerCase();

const getPieceLabel = (p) => {
  if (isPromoted(p)) return PROMOTED_LABEL[baseKey(p)] ?? p;
  return PIECE_LABEL[p] ?? p;
};

const inPromotionZone = (row, isSente) => isSente ? row <= 2 : row >= 6;
const emptyHand = () => ({ p:0, l:0, n:0, s:0, g:0, b:0, r:0 });

// ── 駒の五角形パス ────────────────────────────────
function shogiPiecePath(ctx, cx, cy, w, h) {
  const x0 = cx - w / 2, x1 = cx + w / 2;
  const y0 = cy - h / 2, y1 = cy + h / 2;
  const shoulder = y0 + h * 0.30;
  const inset = w * 0.06, r = h * 0.10;
  ctx.beginPath();
  ctx.moveTo(cx, y0);
  ctx.lineTo(x1 - inset, shoulder);
  ctx.lineTo(x1, y1 - r);
  ctx.quadraticCurveTo(x1, y1, x1 - r, y1);
  ctx.lineTo(x0 + r, y1);
  ctx.quadraticCurveTo(x0, y1, x0, y1 - r);
  ctx.lineTo(x0 + inset, shoulder);
  ctx.closePath();
}

// ── 駒1枚を Canvas に描く ─────────────────────────
function drawPiece(ctx, cx, cy, cellSize, pieceKey, highlighted) {
  const isSente  = isSentePiece(pieceKey);
  const promoted = isPromoted(pieceKey);
  const label    = getPieceLabel(pieceKey);
  const w = cellSize * 0.76, h = cellSize * 0.84;

  ctx.save();
  if (!isSente) { ctx.translate(cx, cy); ctx.rotate(Math.PI); ctx.translate(-cx, -cy); }

  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 3; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 2;

  shogiPiecePath(ctx, cx, cy, w, h);
  const woodGrad = ctx.createLinearGradient(cx - w/2, cy - h/2, cx + w/2, cy + h*0.6);
  if (highlighted) {
    woodGrad.addColorStop(0, '#ffe97a'); woodGrad.addColorStop(0.45, '#f5c832'); woodGrad.addColorStop(1, '#c8960c');
  } else {
    woodGrad.addColorStop(0, '#f5d87a'); woodGrad.addColorStop(0.45, '#e2a820'); woodGrad.addColorStop(1, '#b87c10');
  }
  ctx.fillStyle = woodGrad; ctx.fill();

  ctx.shadowColor = 'transparent';
  shogiPiecePath(ctx, cx, cy, w, h);
  ctx.strokeStyle = promoted ? 'rgba(140,0,0,0.7)' : 'rgba(80,50,10,0.55)';
  ctx.lineWidth = promoted ? 1.4 : 0.9; ctx.stroke();

  const hilite = ctx.createLinearGradient(cx, cy - h/2, cx, cy - h/2 + h*0.45);
  hilite.addColorStop(0, 'rgba(255,255,200,0.45)'); hilite.addColorStop(1, 'rgba(255,255,200,0)');
  shogiPiecePath(ctx, cx, cy, w, h);
  ctx.fillStyle = hilite; ctx.fill();
  ctx.shadowColor = 'transparent';

  const fontSize = cellSize * 0.46;
  ctx.font = `bold ${fontSize}px 'Noto Serif JP',serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const ty = cy + h * 0.06;
  if (promoted) {
    ctx.lineWidth = fontSize * 0.16; ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.strokeText(label, cx, ty); ctx.fillStyle = '#b00000'; ctx.fillText(label, cx, ty);
  } else {
    ctx.lineWidth = fontSize * 0.12; ctx.strokeStyle = 'rgba(255,240,180,0.4)';
    ctx.strokeText(label, cx, ty); ctx.fillStyle = '#1a0800'; ctx.fillText(label, cx, ty);
  }
  ctx.restore();
}

// ── 盤一面を Canvas に描く ────────────────────────
// 貼り付け用のミニ盤（BoardPeek）でも同じ絵を使うので、マスの大きさを引数にして
// コンポーネントの外に出してある。描画を二重に持つと片方だけ直す事故が起きる。
function drawBoardTo(ctx, { board, stamps = [], cell, selected = null, arrowStart = null }) {
  const W = COLS * cell, H = ROWS * cell;
  ctx.clearRect(0, 0, W, H);

  const boardGrad = ctx.createLinearGradient(0, 0, W, H);
  boardGrad.addColorStop(0, '#d4a84b'); boardGrad.addColorStop(0.5, '#c8971e'); boardGrad.addColorStop(1, '#b87c10');
  ctx.fillStyle = boardGrad; ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(80,50,10,0.6)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(60,35,5,0.45)'; ctx.lineWidth = 0.7;
  for (let i = 0; i <= COLS; i++) { ctx.beginPath(); ctx.moveTo(i*cell,0); ctx.lineTo(i*cell,H); ctx.stroke(); }
  for (let j = 0; j <= ROWS; j++) { ctx.beginPath(); ctx.moveTo(0,j*cell); ctx.lineTo(W,j*cell); ctx.stroke(); }

  if (selected) {
    ctx.fillStyle = 'rgba(255,230,60,0.5)';
    ctx.fillRect(selected.col*cell + 1, selected.row*cell + 1, cell - 2, cell - 2);
  }

  if (arrowStart) {
    ctx.fillStyle = 'rgba(107,63,160,0.35)';
    ctx.fillRect(arrowStart.col*cell + 1, arrowStart.row*cell + 1, cell - 2, cell - 2);
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r]?.[c];
      if (!p || p === ' ') continue;
      drawPiece(ctx, c*cell + cell/2, r*cell + cell/2, cell, p,
        selected?.row === r && selected?.col === c);
    }
  }

  for (const st of stamps) {
    if (!STAMP_COLOR[st.type]) continue;
    const x = st.col*cell + cell/2, y = st.row*cell + cell/2;
    ctx.save();

    if (st.type === 'ya') {
      // 矢印：始点マス中心 → 終点マス中心
      const x2 = st.toCol*cell + cell/2, y2 = st.toRow*cell + cell/2;
      drawArrowStamp(ctx, x, y, x2, y2, STAMP_COLOR.ya, cell);
    } else if (st.type === 'shikaku') {
      // 四角：マスの輪郭を強調（駒が見えるよう枠線のみ）
      const pad = cell * 0.05;
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = STAMP_COLOR.shikaku; ctx.lineWidth = cell * 0.09;
      ctx.strokeRect(st.col*cell + pad, st.row*cell + pad, cell - pad*2, cell - pad*2);
    } else if (st.type === 'maru') {
      // 丸：駒を囲む円（中は塗りつぶさない）
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = STAMP_COLOR.maru; ctx.lineWidth = cell * 0.07;
      ctx.beginPath(); ctx.arc(x, y, cell * 0.46, 0, Math.PI * 2); ctx.stroke();
    } else {
      // ？マーク：マス左上に小さく表示し、駒本体は隠さない
      const bx = st.col*cell + cell*0.20, by = st.row*cell + cell*0.20;
      const fs = cell * 0.34;
      ctx.font = `bold ${fs}px 'Noto Serif JP',serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = 0.92;
      ctx.strokeStyle = 'white'; ctx.lineWidth = fs*0.22; ctx.lineJoin = 'round';
      ctx.strokeText(STAMP_CHAR.q, bx, by);
      ctx.fillStyle = STAMP_COLOR.q; ctx.fillText(STAMP_CHAR.q, bx, by);
    }
    ctx.restore();
  }
}

// ── Canvas の解像度合わせ ─────────────────────────
// canvas は width/height 属性が「実際に絵を持つ画素数」で、CSS の幅高さは引き伸ばし先でしかない。
// 属性を CSS と同じ数にすると、高精細画面（スマホは2〜3倍）では 1/2〜1/3 の絵を拡大することになり、
// 駒の文字が真っ先ににじむ。マスが小さい貼り付け盤では、それだけで読めなくなる。
// 属性を devicePixelRatio 倍にして描画側を同じ倍率で scale すれば、
// 描画コードは CSS ピクセルのまま書けて、絵だけが実解像度になる。
const MAX_DPR = 3;  // 4倍以上は見た目が変わらないのに画素数が16倍になる。3で頭打ちにする
const getDpr = () => Math.min(window.devicePixelRatio || 1, MAX_DPR);

// 実解像度で描ける ctx を返す。cssW/cssH は見た目の大きさ（＝描画時に使う座標系）
function hiDpiContext(canvas, cssW, cssH) {
  const dpr = getDpr();
  const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
  // 同じ大きさへの再代入でも canvas の中身は消えるので、変わったときだけ触る
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

// ── 持ち駒UIパーツ ────────────────────────────────
const HAND_ORDER = ['r','b','g','s','n','l','p'];

// 持ち駒スプライトのキャッシュ。駒種・先後・選択・枚数が同じなら描画結果（オフスクリーンcanvas）を再利用する。
// グラデーション・五角形パス・影の描画はコストが高いため、組み合わせごとに一度だけ描いて使い回す。
// dpr もキーに含める：拡大率が違えば画素数が違う別物になるため（外部モニタへ移すと変わる）
const handPieceCache = new Map();
function getHandPieceSprite(pieceKey, isSelected, count, dpr) {
  const cacheKey = `${pieceKey}|${isSelected ? 1 : 0}|${count}|${dpr}`;
  let off = handPieceCache.get(cacheKey);
  if (off) return off;
  off = document.createElement('canvas');
  off.width = 32 * dpr; off.height = 32 * dpr;
  const ctx = off.getContext('2d');
  ctx.scale(dpr, dpr);
  drawPiece(ctx, 16, 17, 32, pieceKey, isSelected);
  if (count > 1) {
    ctx.font = `bold 9px 'Noto Serif JP',serif`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#a07840'; ctx.fillText(String(count), 31, 31);
  }
  handPieceCache.set(cacheKey, off);
  return off;
}

// size は見た目の大きさ（CSS）だけを変える。スプライトは32px相当のまま縮小して描くので、
// 貼り付け用のミニ盤でもキャッシュを共有できる（種類×先後×選択×枚数の分だけで済む）
function HandPiece({ k, count, isSente, isSelected, onClick, readOnly, boardSelected, size = 32 }) {
  const ref = useRef(null);
  const dpr = getDpr();
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // スプライトは 32×dpr 画素で持っているので、そのまま等倍で貼る（ここで縮めない）
    ctx.drawImage(getHandPieceSprite(isSente ? k : k.toUpperCase(), isSelected, count, dpr), 0, 0);
  }, [k, isSente, isSelected, count, dpr]);
  return (
    // 盤上の駒を選択中は、ここをタップしても駒選択せずエリアのクリック（=持ち駒へ移動）に委ねる
    <canvas ref={ref} width={32 * dpr} height={32 * dpr} onClick={() => { if (readOnly || boardSelected) return; onClick(); }}
      style={{ width: size, height: size, flexShrink: 0,
        cursor: readOnly ? 'default' : 'pointer', borderRadius: 4,
        border: isSelected ? '1.5px solid #a07840' : '1.5px solid transparent',
        background: isSelected ? '#f0e8d4' : 'transparent' }}
    />
  );
}

// ── 貼り付け用のミニ盤（見るだけ）────────────────
//   相手の持ち駒・盤・自分の持ち駒の3つだけを縮めて描く。
//   道具・棋譜ナビ・ヒント文は載せない：載せると「ここでも操作できる」に見えるが、
//   実際に編集できるのは本体の盤だけなので、押しても何も起きない道具が並ぶことになる。
//
// マスの大きさは固定せず、貼り付け帯に残っている幅から決める。
// 固定していた頃は 20px（駒の文字が9px）で、狭い端末に合わせたぶん普通の端末では
// 左右が余っているのに文字だけ小さい、という状態だった。
// 上限を設けるのは、貼り付け盤が画面上部を覆う道具だから：大きくするほど
// 「局面を見ながら下のメモを読む」という目的そのものが潰れる。
const PEEK_CELL_MIN = 20;
const PEEK_CELL_MAX = 24;  // 盤は 24×9 = 216px（駒の文字は11px）。これ以上は下のメモが隠れる
const PEEK_COL_W    = 32;
const PEEK_GAP      = 4;
const PEEK_PAD_X    = 16;  // 貼り付け帯の左右パディング合計（StickyBoardPeek の style と揃える）

function peekCellSize(availWidth) {
  const room = (availWidth || 0) - PEEK_PAD_X - PEEK_COL_W * 2 - PEEK_GAP * 2;
  return Math.max(PEEK_CELL_MIN, Math.min(PEEK_CELL_MAX, Math.floor(room / COLS)));
}

function BoardPeek({ board, stamps, handSente, handGote, availWidth }) {
  const ref = useRef(null);
  const cell = peekCellSize(availWidth);
  const S = COLS * cell;
  useEffect(() => {
    const canvas = ref.current; if (!canvas || !board) return;
    drawBoardTo(hiDpiContext(canvas, S, S), { board, stamps, cell });
  }, [board, stamps, cell, S]);
  if (!board) return null;
  return (
    <div style={{ display:'flex', alignItems:'stretch', gap:PEEK_GAP,
      width: S + PEEK_COL_W * 2 + PEEK_GAP * 2, margin:'0 auto' }}>
      <HandArea hand={handGote} isSente={false} readOnly
        colW={PEEK_COL_W} pieceSize={22} labelSize="0.5625rem" />
      {/* 幅高さは style で指定する。width/height 属性のほうは hiDpiContext が
          devicePixelRatio 倍の画素数に付け替えるので、見た目の大きさには使えない */}
      <canvas ref={ref} data-peek-board
        style={{ display:'block', width:S, height:S, borderRadius:4, alignSelf:'flex-start',
          boxShadow:'0 2px 8px rgba(0,0,0,0.3)' }} />
      <HandArea hand={handSente} isSente={true} readOnly
        colW={PEEK_COL_W} pieceSize={22} labelSize="0.5625rem" />
    </div>
  );
}

// 本体の盤がスクロールで上へ流れたら、ミニ盤を画面上端に貼り付ける。
//   position:sticky を使わないのは、sticky が「親の箱の中」でしか貼り付かないため。
//   盤は BoardSection > ShogiBoard と入れ子になっていて親の箱は高々600px しかなく、
//   少しスクロールしただけで剥がれてしまう。
//   position:fixed をスクロール領域の上端に合わせ、body へ portal で出す。
//   portal にするのは、途中の親に transform が付くと fixed が親基準になって位置が壊れるため。
//   本体の盤は元の場所に残したままなので、貼り付いた瞬間に下の内容がずれ上がることはない。
function StickyBoardPeek({ anchorRef, board, stamps, handSente, handGote }) {
  const [pin, setPin] = useState(null); // 貼り付け位置。null = 貼り付けない

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    // 実際にスクロールしている親を探す
    let sc = anchor.parentElement;
    while (sc && sc !== document.body) {
      const oy = getComputedStyle(sc).overflowY;
      if (oy === 'auto' || oy === 'scroll') break;
      sc = sc.parentElement;
    }
    if (!sc || sc === document.body) return;

    const update = () => {
      const a = anchor.getBoundingClientRect();
      const c = sc.getBoundingClientRect();
      const next = a.top < c.top ? { top: c.top, left: c.left, width: c.width } : null;
      // 位置が変わっていなければ同じオブジェクトを返して再描画を止める。
      // スクロール中は毎フレーム呼ばれるので、ここで止めないと指の動きが重くなる
      setPin(prev => {
        if (!next || !prev) return next === prev ? prev : next;
        return (prev.top === next.top && prev.left === next.left && prev.width === next.width)
          ? prev : next;
      });
    };
    update();
    sc.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // 上にある入力欄が伸びたりキーボードが出たりしても位置がずれないよう、大きさの変化も見る
    const ro = new ResizeObserver(update);
    ro.observe(sc); ro.observe(anchor);
    return () => {
      sc.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, [anchorRef]);

  if (!pin) return null;
  return createPortal(
    // タップは受け取るが何もしない（下の入力欄に吸わせない）。
    // pointerEvents:'none' にすると、盤を押したつもりで裏の入力欄に文字が入る
    <div data-board-peek style={{
      position:'fixed', top:pin.top, left:pin.left, width:pin.width, zIndex:45,
      padding:`6px ${PEEK_PAD_X / 2}px 8px`, background:'#faf4e8', userSelect:'none',
      borderBottom:'0.5px solid rgba(26,15,0,0.15)',
      boxShadow:'0 4px 10px rgba(26,15,0,0.12)',
    }}>
      <BoardPeek board={board} stamps={stamps} handSente={handSente} handGote={handGote}
        availWidth={pin.width} />
    </div>,
    document.body
  );
}

// ── 棋譜ナビボタン ────────────────────────────────
function NavBtn({ onClick, disabled, icon }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width:32, height:32, flexShrink:0, borderRadius:6, border:'0.5px solid rgba(26,15,0,0.18)',
        background:'#faf4e8', cursor: disabled ? 'default' : 'pointer',
        color: disabled ? '#ccc' : '#a07840',
        fontSize:"1rem", display:'flex', alignItems:'center', justifyContent:'center',
      }}
    >
      <i className={`ti ${icon}`}/>
    </button>
  );
}

// 持ち駒の帯の幅。駒スプライト32px＋左右の余白と枠線（box-sizing は border-box）。
// ここを広げたぶんだけ盤が小さくなるので、駒がちょうど収まる最小幅にしてある
const HAND_COL_W = 42;

function HandArea({ hand, isSente, selectedHand, onSelectPiece, readOnly, boardSelected, onDeposit,
                    colW = HAND_COL_W, pieceSize = 32, labelSize = "0.625rem" }) {
  const label = isSente ? '自分の持ち駒' : '相手の持ち駒';
  const pieces = HAND_ORDER.filter(k => hand[k] > 0);
  // 盤上の駒を選択中にこのエリアをタップしたら、その駒を持ち駒へ移す
  const canDeposit = boardSelected && !readOnly;
  return (
    <div
      onClick={canDeposit ? () => onDeposit(isSente) : undefined}
      style={{ width:colW, flexShrink:0, alignSelf:'stretch',
      background:'#f0e6cc', borderRadius:6, padding:'6px 4px',
      display:'flex', flexDirection:'column', alignItems:'center', gap:3,
      border: canDeposit ? '1px dashed #a07840' : '1px solid rgba(120,80,10,0.2)',
      cursor: canDeposit ? 'pointer' : 'default' }}>
      {/* 見出しは縦書き。横書きにすると「相手の持ち駒」の6文字で帯に60px以上必要になり、
          左右あわせて120px を盤から削ることになる。
          縦書きに writing-mode を使わないのは、日本語フォントの取得に失敗した場面
          （オフライン起動）でフォールバック側の縦書き字形metricsが無く、6文字が23pxに
          潰れて重なって読めなくなるため。幅を1文字ぶんに絞って折り返させるやり方なら
          フォントに関係なく1文字ずつ縦に並ぶ */}
      <span style={{ width:'1em', lineHeight:1.15, textAlign:'center', wordBreak:'break-all',
        fontSize:labelSize, color:'rgba(26,15,0,0.45)', flexShrink:0 }}>{label}</span>
      {pieces.length === 0 && <span style={{ fontSize:labelSize, color:'rgba(26,15,0,0.3)' }}>なし</span>}
      {pieces.map(k => (
        <HandPiece key={k} k={k} count={hand[k]} isSente={isSente} size={pieceSize}
          isSelected={selectedHand?.piece === k && selectedHand?.isSente === isSente}
          readOnly={readOnly} boardSelected={boardSelected} onClick={() => onSelectPiece(k, isSente)} />
      ))}
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────
export default function ShogiBoard({
  board: boardProp,
  stamps: stampsProp   = [],
  handSente: hSenteProp = emptyHand(),
  handGote:  hGoteProp  = emptyHand(),
  kifu:      kifuProp   = [],   // [{board, handSente, handGote}, ...]
  onChange,
  onKifuChange,
  onRecordStop,             // (snaps) => void 「記録を終わる」を押したら必ず呼ぶ（0手でも呼ぶ）
  recordOnly = false,       // 棋譜入力モード：開いた瞬間から記録を始め、スタンプ等の道具は出さない
  readOnly = false,
  allowBranch = false,      // true: 棋譜インポート由来のノードで「この局面で分岐」を表示
  onBranchFromHere,         // (snapshot) => void
  onBranchRange,            // (startIdx, endIdx) => void 範囲を選んで棋譜ごと切り出し
  // true: スクロールで盤が上へ流れたら、縮小した「見るだけの盤」を画面上端に貼り付ける。
  //   局面を見ながら下のメモや子ノードを読み書きするための機能なので、それが要る画面
  //   （ノード編集・公開ツリー）だけ on にする。棋譜入力モーダルは盤がすでに一番上にあり不要
  stickyPeek = false,
}) {
  const canvasRef = useRef(null);
  // 貼り付けを始める目印。この行（持ち駒＋盤）の上端が画面から出たら貼り付ける
  const boardRowRef = useRef(null);

  const [board,        setBoard]        = useState(() => boardProp ? JSON.parse(JSON.stringify(boardProp)) : null);
  const [stamps,       setStamps]       = useState(stampsProp);
  const [handSente,    setHandSente]    = useState(hSenteProp);
  const [handGote,     setHandGote]     = useState(hGoteProp);
  const [selected,     setSelected]     = useState(null);
  const [selectedHand, setSelectedHand] = useState(null);
  const [tool,         setTool]         = useState('move');
  const [currentStamp, setCurrentStamp] = useState('maru');
  const [arrowStart,   setArrowStart]   = useState(null); // 矢印スタンプ：始点タップ待ち
  const [promoteModal, setPromoteModal] = useState(null);

  // ── 棋譜記録・再生 ──────────────────────────────
  const [isRecording,   setIsRecording]   = useState(false);
  const [playbackIdx,   setPlaybackIdx]   = useState(null); // null = 通常モード
  // 範囲切り出しの選択位置（再生モード中のみ使用。null = 未選択）
  const [rangeStart,    setRangeStart]    = useState(null);
  const [rangeEnd,      setRangeEnd]      = useState(null);
  // recordingRef: handleClick クロージャからも最新値を参照できるよう Ref で管理
  const recordingRef = useRef({ active: false, snaps: [] });

  // boardProp 変化時のみ内部 state 更新
  const boardPropStr = boardProp ? JSON.stringify(boardProp) : null;
  // 現在の内部 board の文字列表現。自分の指し手で board prop が更新された直後は
  // 内部 state と prop が一致する（自分の指し手は notify→onChange 経由で prop にも反映されるため）。
  const internalBoardStr = board ? JSON.stringify(board) : null;
  useEffect(() => {
    if (boardProp) setBoard(JSON.parse(JSON.stringify(boardProp)));
    // 記録中に盤面が「外部（親コンポーネント）から」書き換えられた場合のみ記録を中断する。
    // 自分の指し手由来（内部 state と一致）の prop 変化では中断しない。
    // ── これを区別しないと、記録中の1手ごとに onChange で board prop が変わり、
    //    自分の指し手を外部変更と誤認して記録が即中断・破棄されてしまう。
    if (recordingRef.current.active && boardPropStr !== internalBoardStr) {
      recordingRef.current = { active: false, snaps: [] };
      setIsRecording(false);
    }
  }, [boardPropStr]); // eslint-disable-line

  const stampsPropStr = JSON.stringify(stampsProp);
  useEffect(() => { setStamps(stampsProp); }, [stampsPropStr]); // eslint-disable-line

  // 棋譜が差し替わったら（同一ノード内での取り込み・削除など）再生位置と
  // 範囲選択をリセットする。残すと別の棋譜に対して古い再生位置を参照してしまう。
  // 手数(length)ではなく配列の同一性で判定する：同じ手数の別棋譜への差し替えでも
  // リセットが必要なため。空棋譜は毎レンダー新しい [] が渡り得るので定数キーに正規化する。
  const kifuIdentity = kifuProp.length === 0 ? "empty" : kifuProp;
  useEffect(() => {
    setPlaybackIdx(null);
    setRangeStart(null);
    setRangeEnd(null);
  }, [kifuIdentity]);

  // 持ち駒も board / stamps と同様に、親から渡される prop の変化を内部 state へ反映する。
  // （ノード切替・テンプレート読込・棋譜削除・盤面の元に戻す 等で駒台だけ古いまま残るのを防ぐ）
  const handSentePropStr = JSON.stringify(hSenteProp);
  useEffect(() => { setHandSente(hSenteProp); }, [handSentePropStr]); // eslint-disable-line
  const handGotePropStr = JSON.stringify(hGoteProp);
  useEffect(() => { setHandGote(hGoteProp); }, [handGotePropStr]); // eslint-disable-line

  // 再生中に表示する盤面・持ち駒（kifu スナップショットを参照）
  const playSnap    = playbackIdx !== null ? kifuProp[playbackIdx] : null;
  const dispBoard   = playSnap ? playSnap.board     : board;
  const dispHSente  = playSnap ? playSnap.handSente : handSente;
  const dispHGote   = playSnap ? playSnap.handGote  : handGote;

  // ── Canvas 描画 ─────────────────────────────────
  // 再生中（playSnap あり）は編集中の選択・矢印待ちを映さない。
  // 再生は閲覧操作なので、別の局面の上に編集途中の印が残ると誤解のもとになる
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dispBoard) return;
    drawBoardTo(canvas.getContext('2d'), {
      board: dispBoard, stamps, cell: CELL,
      selected:   playSnap ? null : selected,
      arrowStart: playSnap ? null : arrowStart,
    });
  }, [dispBoard, stamps, selected, arrowStart, playSnap]);

  useEffect(() => { draw(); }, [draw]);

  // ── onChange 通知 ─────────────────────────────────
  const notify = useCallback((nextBoard, nextHS, nextHG, nextStamps) => {
    onChange?.({ board: nextBoard ?? board, stamps: nextStamps ?? stamps,
      handSente: nextHS ?? handSente, handGote: nextHG ?? handGote });
  }, [board, stamps, handSente, handGote, onChange]);

  // ── 棋譜記録 ─────────────────────────────────────
  const startRecording = useCallback(() => {
    recordingRef.current = {
      active: true,
      snaps: [{ board: JSON.parse(JSON.stringify(board)),
                handSente: { ...handSente }, handGote: { ...handGote } }],
    };
    setIsRecording(true);
    setPlaybackIdx(null);
  }, [board, handSente, handGote]);

  // 棋譜入力モードでは、盤を開いた瞬間から記録を始める。
  // 「棋譜を記録」を押させる作りだと、押し忘れたまま並べた手が丸ごと記録されず、
  // 気づいた時点で最初から並べ直しになる（この画面は棋譜を作るために開いている）。
  useEffect(() => {
    if (recordOnly) startRecording();
    // マウント時の一度だけ。startRecording を依存に入れると、1手ごとに
    // 記録が初期局面から始め直しになる（startRecording は board 依存のため）
  }, []); // eslint-disable-line

  // 記録中の最後の1手を取り消し、直前のスナップショットの局面へ戻す
  const undoRecordedMove = useCallback(() => {
    const rec = recordingRef.current;
    if (!rec.active || rec.snaps.length < 2) return;
    rec.snaps = rec.snaps.slice(0, -1);
    const last = rec.snaps[rec.snaps.length - 1];
    const b  = last.board.map((r) => [...r]);
    const hs = { ...last.handSente };
    const hg = { ...last.handGote };
    setBoard(b); setHandSente(hs); setHandGote(hg);
    setSelected(null); setSelectedHand(null);
    notify(b, hs, hg, stamps);
  }, [notify, stamps]);

  const stopRecording = useCallback(() => {
    recordingRef.current.active = false;
    setIsRecording(false);
    // 初期局面1枚だけ（=1手も指していない）の場合は棋譜として保存しない。
    // 空の記録でバッジ獲得や0手の棋譜ナビが生まれるのを防ぐ。
    const snaps = recordingRef.current.snaps;
    if (snaps.length > 1) onKifuChange?.(snaps);
    // 「終わったこと」自体を知りたい呼び出し側（棋譜入力モーダル）のために、
    // 1手も指していなくても必ず呼ぶ。0手のときに何も起きないと、
    // ボタンを押したのに画面が変わらず、壊れているように見えてしまう
    onRecordStop?.(snaps);
  }, [onKifuChange, onRecordStop]);

  // ── 成り確認モーダルを経て盤面確定 ──────────────
  const confirmPromotion = useCallback((doPromote) => {
    if (!promoteModal) return;
    const { nextBoard, nextHS, nextHG, toRow, toCol } = promoteModal;
    const finalBoard = nextBoard.map(r => [...r]);
    if (doPromote) finalBoard[toRow][toCol] = '+' + finalBoard[toRow][toCol];
    if (recordingRef.current.active) {
      recordingRef.current.snaps = [...recordingRef.current.snaps,
        { board: finalBoard.map(r => [...r]), handSente: { ...nextHS }, handGote: { ...nextHG } }];
    }
    setBoard(finalBoard); setHandSente(nextHS); setHandGote(nextHG);
    setPromoteModal(null);
    notify(finalBoard, nextHS, nextHG, stamps);
  }, [promoteModal, stamps, notify]);

  // ── クリック処理 ─────────────────────────────────
  const handleClick = useCallback((e) => {
    if (readOnly || !board || playbackIdx !== null) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) * (canvas.width  / rect.width)  / CELL);
    const row = Math.floor((e.clientY - rect.top)  * (canvas.height / rect.height) / CELL);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

    if (tool === 'stamp') {
      if (currentStamp === 'ya') {
        if (!arrowStart) {
          setArrowStart({ row, col }); return;
        }
        if (arrowStart.row === row && arrowStart.col === col) {
          setArrowStart(null); return; // 同じマス→キャンセル
        }
        const next = stamps.filter(s => !(s.type==='ya' && s.row===arrowStart.row && s.col===arrowStart.col && s.toRow===row && s.toCol===col));
        next.push({ row: arrowStart.row, col: arrowStart.col, toRow: row, toCol: col, type: 'ya' });
        setArrowStart(null);
        setStamps(next); notify(board, handSente, handGote, next); return;
      }
      const next = stamps.filter(s => !(s.row===row && s.col===col));
      next.push({ row, col, type: currentStamp });
      setStamps(next); notify(board, handSente, handGote, next); return;
    }
    if (tool === 'erase') {
      const next = stamps.filter(s => !(
        (s.row===row && s.col===col) ||
        (s.type==='ya' && s.toRow===row && s.toCol===col)
      ));
      setStamps(next); notify(board, handSente, handGote, next); return;
    }

    if (selectedHand) {
      const { piece, isSente } = selectedHand;
      const target = board[row]?.[col];
      if (target && target !== ' ') { setSelectedHand(null); return; }
      const nextBoard = board.map(r => [...r]);
      nextBoard[row][col] = isSente ? piece : piece.toUpperCase();
      const nextHS = isSente  ? { ...handSente, [piece]: handSente[piece] - 1 } : handSente;
      const nextHG = !isSente ? { ...handGote,  [piece]: handGote[piece]  - 1 } : handGote;
      if (recordingRef.current.active) {
        recordingRef.current.snaps = [...recordingRef.current.snaps,
          { board: nextBoard.map(r => [...r]), handSente: { ...nextHS }, handGote: { ...nextHG } }];
      }
      setBoard(nextBoard); setHandSente(nextHS); setHandGote(nextHG);
      setSelectedHand(null); notify(nextBoard, nextHS, nextHG, stamps); return;
    }

    if (selected) {
      const from = selected; setSelected(null);
      if (from.row === row && from.col === col) return;
      const movingPiece = board[from.row][from.col];
      const isSente = isSentePiece(movingPiece);
      const target  = board[row]?.[col];
      // 玉は取れない（持ち駒に置けず消滅してしまうため）。玉のマスをタップした場合は
      // 取りではなく選択の切り替えとして扱う
      if (target && target !== ' ' && baseKey(target) === 'k') {
        setSelected({ row, col });
        return;
      }
      let nextHS = { ...handSente }, nextHG = { ...handGote };
      if (target && target !== ' ') {
        const capturedBase = baseKey(target);
        if (isSente) nextHS = { ...nextHS, [capturedBase]: (nextHS[capturedBase]??0)+1 };
        else         nextHG = { ...nextHG, [capturedBase]: (nextHG[capturedBase]??0)+1 };
      }
      const nextBoard = board.map(r => [...r]);
      nextBoard[row][col] = movingPiece; nextBoard[from.row][from.col] = ' ';
      const canPromote = !isPromoted(movingPiece) && PROMOTABLE.has(baseKey(movingPiece)) &&
        (inPromotionZone(row, isSente) || inPromotionZone(from.row, isSente));
      if (canPromote) {
        setPromoteModal({ nextBoard, nextHS, nextHG, movedPiece: movingPiece, toRow: row, toCol: col });
      } else {
        if (recordingRef.current.active) {
          recordingRef.current.snaps = [...recordingRef.current.snaps,
            { board: nextBoard.map(r => [...r]), handSente: { ...nextHS }, handGote: { ...nextHG } }];
        }
        setBoard(nextBoard); setHandSente(nextHS); setHandGote(nextHG);
        notify(nextBoard, nextHS, nextHG, stamps);
      }
      return;
    }
    if (board[row]?.[col] && board[row][col] !== ' ') setSelected({ row, col });
  }, [board, stamps, selected, selectedHand, tool, currentStamp, arrowStart, readOnly, handSente, handGote, notify, playbackIdx]);

  // ── 盤上の選択駒を持ち駒へ移す（駒タップ→持ち駒エリアタップ）──
  const depositToHand = useCallback((toSente) => {
    if (readOnly || !board || playbackIdx !== null) return;
    if (!selected) return;
    const piece = board[selected.row]?.[selected.col];
    if (!piece || piece === ' ') { setSelected(null); return; }
    const base = baseKey(piece);
    if (base === 'k') { setSelected(null); return; } // 玉は持ち駒にできない
    const nextBoard = board.map(r => [...r]);
    nextBoard[selected.row][selected.col] = ' ';
    const nextHS = toSente  ? { ...handSente, [base]: (handSente[base] ?? 0) + 1 } : { ...handSente };
    const nextHG = !toSente ? { ...handGote,  [base]: (handGote[base]  ?? 0) + 1 } : { ...handGote };
    if (recordingRef.current.active) {
      recordingRef.current.snaps = [...recordingRef.current.snaps,
        { board: nextBoard.map(r => [...r]), handSente: { ...nextHS }, handGote: { ...nextHG } }];
    }
    setBoard(nextBoard); setHandSente(nextHS); setHandGote(nextHG); setSelected(null);
    notify(nextBoard, nextHS, nextHG, stamps);
  }, [readOnly, board, playbackIdx, selected, handSente, handGote, notify, stamps]);

  // タップとスクロールを区別するため、タッチ開始位置を記録する
  const touchStartRef = useRef(null);
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchStartRef.current = { x: t.clientX, y: t.clientY };
    } else {
      touchStartRef.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (readOnly || !board) return;
    if (e.changedTouches.length !== 1) return;
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const t = e.changedTouches[0];
    // 指が動いていたら（＝ページのスクロール）タップ扱いにしない。
    // これがないと、盤の上を通るスクロールで指を離した位置の駒が選択・移動されてしまう
    if (!start || Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) return;
    e.preventDefault();
    handleClick({ clientX: t.clientX, clientY: t.clientY });
  }, [handleClick, readOnly, board]);

  // ── 棋譜の節目 ──
  // 分岐を作る場所を探すときの手がかり。序盤の駒組みと戦いが始まってからでは
  // 研究したいことが違うので、その境目へ一発で飛べるようにする。
  //
  // ※ 早期 return（下の `if (!board)`）より前に置くこと。
  //   フックは毎レンダリングで同じ順番・同じ個数だけ呼ばれる必要がある。
  //   return のあとに置くと board が null になった瞬間にフック数が減り、
  //   React が "Rendered fewer hooks than expected" で画面ごと落ちる。
  const milestones = useMemo(() => detectMilestones(kifuProp), [kifuProp]);

  if (!board) return null;
  const W = COLS * CELL, H = ROWS * CELL;
  // 盤 ＋ 左右の持ち駒帯 ＋ すき間。全体の幅をこれで止めないと、広い画面では
  // 盤が帯のぶん縮んだままになり、Canvas の実サイズ(342px)より小さく描かれてぼやける
  const BOARD_ROW_W = W + HAND_COL_W * 2 + 10;
  const kifuLen = kifuProp.length;  // 保存済みスナップショット数（0 = 棋譜なし）
  const moveCount = Math.max(0, kifuLen - 1); // 手数 = スナップ数 - 1（初期局面分を引く）
  // 棋譜ナビ上の現在位置。通常表示(null)は最終手と同じ局面なので moveCount とみなす
  const cur = playbackIdx === null ? moveCount : playbackIdx;

  // 棋譜は「現在の盤面とは独立した再生用データ」。録画後に盤面だけを編集すると、
  // 現在の盤面と棋譜の最終局面がズレる。そのズレを検知してユーザーに明示する。
  const kifuLast = kifuLen > 0 ? kifuProp[kifuLen - 1] : null;
  const kifuDiverged = !!kifuLast && (
    JSON.stringify(board)     !== JSON.stringify(kifuLast.board)     ||
    JSON.stringify(handSente) !== JSON.stringify(kifuLast.handSente) ||
    JSON.stringify(handGote)  !== JSON.stringify(kifuLast.handGote)
  );

  const btnStyle = (active) => ({
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '4px 9px', borderRadius: 8, fontSize: "0.6875rem", cursor: 'pointer',
    border: '0.5px solid', fontFamily: "'Noto Serif JP',serif",
    borderColor: active ? '#a07840' : 'rgba(26,15,0,0.18)',
    background:  active ? '#f0e8d4' : '#faf4e8',
    color:       active ? '#1a0f00' : 'rgba(26,15,0,0.5)',
  });

  // ── 記録の操作（棋譜を記録 / 手数・一手戻す・記録を終わる）──
  //   既存の棋譜がある間は出さない（上書き防止。録り直すには先に「棋譜を削除」）。
  //   置き場所は2通り：
  //     通常（ノード編集）  … 道具と同じ行の右端
  //     棋譜入力モード      … 盤の下（盤と持ち駒を画面の一番上に置きたいため）
  //   同じものを2箇所に書くと片方だけ直す事故が起きるので、変数にして置き場所だけ変える。
  const recordControls = (!readOnly && playbackIdx === null && kifuLen === 0) && (
    <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap',
      marginLeft: recordOnly ? 0 : 'auto', marginTop: recordOnly ? 6 : 0 }}>
      {!isRecording ? (
        <button data-onboard="board-kifu" onClick={startRecording} style={{
          ...btnStyle(false), borderColor:'#854F0B', color:'#854F0B', gap:5,
        }}>
          <i className="ti ti-record-mail" style={{fontSize:"0.8125rem"}}/>棋譜を記録
        </button>
      ) : (
        <>
          <span style={{ fontSize:"0.6875rem", color:'#A93226', fontFamily:"'Noto Serif JP',serif", display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:'#A93226', display:'inline-block' }}/>
            {recordingRef.current.snaps.length - 1}手
          </span>
          {/* 記録中の直前の1手だけ取り消す */}
          <button
            onClick={undoRecordedMove}
            disabled={recordingRef.current.snaps.length < 2}
            style={recordingRef.current.snaps.length < 2
              ? { ...btnStyle(false), color:'#ccc', cursor:'default' }
              : { ...btnStyle(false), borderColor:'#854F0B', color:'#854F0B' }}
          >
            <i className="ti ti-arrow-back-up" style={{fontSize:"0.8125rem"}}/>一手戻す
          </button>
          <button onClick={stopRecording} style={{
            ...btnStyle(true), borderColor:'#A93226', background:'#A93226', color:'#fff',
          }}>
            記録を終わる
          </button>
        </>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth: BOARD_ROW_W }}>

      {/* ── ツールバー（再生中・棋譜入力モードでは非表示） ──
          棋譜入力モードで道具を出さないのは、棋譜に残るのは駒の動きだけで、
          スタンプは記録されないため。置けると「記録されたつもり」になる */}
      {!readOnly && playbackIdx === null && !recordOnly && (
        <div style={{ display:'flex', gap:6, marginBottom:6, flexWrap:'wrap', alignItems:'center' }}>
          {[['move','動かす','ti-arrows-move'],['stamp','スタンプ','ti-stamp'],['erase','消す','ti-eraser']].map(([t,lbl,icon]) => (
            <button key={t} data-onboard={`board-${t}`} onClick={() => { setTool(t); setSelected(null); setSelectedHand(null); setArrowStart(null); }} style={btnStyle(tool===t)}>
              <i className={`ti ${icon}`} style={{fontSize:"0.8125rem"}}/>{lbl}
            </button>
          ))}
          {recordControls}
        </div>
      )}

      {/* スタンプ選択 */}
      {!readOnly && tool === 'stamp' && playbackIdx === null && (
        <div style={{ display:'flex', gap:5, marginBottom:6, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{fontSize:"0.625rem",color:'rgba(26,15,0,0.5)'}}>スタンプ：</span>
          {Object.entries(STAMP_CHAR).map(([k,ch]) => (
            <div key={k} onClick={() => { setCurrentStamp(k); setArrowStart(null); }} style={{
              width:28, height:28, borderRadius:'50%', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:"0.875rem", color:STAMP_COLOR[k], background:'#faf4e8',
              border: currentStamp===k ? `1.5px solid ${STAMP_COLOR[k]}` : '1.5px solid transparent',
            }}>{ch}</div>
          ))}
        </div>
      )}

      {/* ── 盤と持ち駒（左：相手の駒台 ／ 中央：盤 ／ 右：自分の駒台）──
          持ち駒を盤の上下ではなく左右に置いている。上下に積むと
          「持ち駒40＋盤342＋持ち駒40」で縦に430px 使い、スマホの可視領域（約790px）の
          半分以上が盤まわりだけで埋まって、局面と下の入力欄を同時に見られない。
          左右に移すと縦は盤の高さだけで済む。盤は帯のぶん少し小さくなる（342→約290）が、
          駒の判別には足りる大きさを保てている */}
      <div ref={boardRowRef} style={{ display:'flex', alignItems:'stretch', gap:5, marginBottom:4 }}>

        {/* 相手（後手）の持ち駒：左 */}
        <HandArea hand={dispHGote} isSente={false} selectedHand={playSnap ? null : selectedHand}
          onSelectPiece={(piece) => {
            if (tool !== 'move') return;
            setSelected(null);
            setSelectedHand(prev => prev?.piece === piece && !prev?.isSente ? null : { piece, isSente: false });
          }}
          readOnly={readOnly || playbackIdx !== null}
          boardSelected={!playSnap && tool === 'move' && !!selected}
          onDeposit={depositToHand}
        />

        {/* 将棋盤 Canvas：帯を除いた残り幅いっぱい（正方形を保つため高さは指定しない）。
            alignSelf:'flex-start' で盤だけ縦に引き伸ばさず、駒台の帯のほうを盤の高さに合わせる。
            駒の種類が多くて帯が盤より長くなったときは、帯の側がこの行の高さを決める */}
        <canvas ref={canvasRef} width={W} height={H}
          onClick={handleClick} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}
          style={{ display:'block', borderRadius:4, cursor: (readOnly || playbackIdx !== null) ? 'default' : 'pointer',
            flex:'1 1 0', minWidth:0, maxWidth:W, alignSelf:'flex-start',
            boxShadow:'0 3px 14px rgba(0,0,0,0.35)' }}
        />

        {/* 自分（先手）の持ち駒：右 */}
        <HandArea hand={dispHSente} isSente={true} selectedHand={playSnap ? null : selectedHand}
          onSelectPiece={(piece) => {
            if (tool !== 'move') return;
            setSelected(null);
            setSelectedHand(prev => prev?.piece === piece && prev?.isSente ? null : { piece, isSente: true });
          }}
          readOnly={readOnly || playbackIdx !== null}
          boardSelected={!playSnap && tool === 'move' && !!selected}
          onDeposit={depositToHand}
        />
      </div>

      {/* 貼り付け用のミニ盤。再生中は再生中の局面を映す（dispBoard を渡している）ので、
          棋譜を送りながら下の子ノードを見比べられる */}
      {stickyPeek && (
        <StickyBoardPeek anchorRef={boardRowRef} board={dispBoard} stamps={stamps}
          handSente={dispHSente} handGote={dispHGote} />
      )}

      {/* 棋譜入力モードの記録操作は盤の下（盤と持ち駒が画面の一番上に来るようにする） */}
      {recordOnly && recordControls}

      {/* ── 棋譜ナビ（保存済み棋譜がある場合）──
          再生は盤面を書き換えない閲覧操作なので、readOnly（公開ツリーのプレビュー等）でも使える */}
      {kifuLen > 0 && !isRecording && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, rowGap: 6,
          flexWrap: 'wrap',
          marginTop: 8, padding: '6px 12px', borderRadius: 8,
          background: playbackIdx !== null ? '#f0e8d4' : '#faf4e8',
          border: `0.5px solid ${playbackIdx !== null ? '#a07840' : 'rgba(26,15,0,0.15)'}`,
        }}>
          {/* 棋譜は「現在の盤面」とは別に保存された再生専用データであることを明示する */}
          <div style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:4, fontSize:"0.625rem", color:'rgba(26,15,0,0.45)', fontFamily:"'Noto Serif JP',serif" }}>
            <i className="ti ti-player-play" style={{fontSize:"0.6875rem"}}/>
            保存した棋譜（現在の盤面とは別の記録）
          </div>

          {/* 通常表示(null)は「最終手の位置」とみなして前後移動を対称にする */}
          {/* 最初に移動 |< */}
          <NavBtn icon="ti-player-skip-back" disabled={cur === 0}
            onClick={() => setPlaybackIdx(0)} />

          {/* 一手前に戻る < */}
          <NavBtn icon="ti-chevron-left" disabled={cur === 0}
            onClick={() => setPlaybackIdx(Math.max(0, cur - 1))} />

          {/* 手数表示 */}
          <div style={{ fontFamily:"'Noto Serif JP',serif", fontSize:"0.75rem", color:'#1a0f00', minWidth:80, flexShrink:0, whiteSpace:'nowrap', textAlign:'center' }}>
            {playbackIdx === null
              ? <span style={{color:'rgba(26,15,0,0.4)'}}>全{moveCount}手（タップで再生）</span>
              : playbackIdx === 0
              ? '初期局面'
              : `第${playbackIdx}手 / ${moveCount}手`
            }
          </div>

          {/* 一手進む > */}
          <NavBtn icon="ti-chevron-right" disabled={cur === moveCount}
            onClick={() => setPlaybackIdx(Math.min(moveCount, cur + 1))} />

          {/* 最後に移動 >| */}
          <NavBtn icon="ti-player-skip-forward" disabled={cur === moveCount}
            onClick={() => setPlaybackIdx(moveCount)} />

          {/* 再生中は「編集にもどる」で再生モードを終了し、盤面編集に戻れる。
              閲覧専用（readOnly）では編集はできないため「再生を終了」と表記する */}
          {playbackIdx !== null && (
            <button onClick={() => { setPlaybackIdx(null); setRangeStart(null); setRangeEnd(null); }} style={{
              display:'flex', alignItems:'center', gap:4,
              padding:'5px 12px', borderRadius:8, border:'none',
              background:'#a07840', cursor:'pointer', fontSize:"0.6875rem", flexShrink:0, whiteSpace:'nowrap',
              color:'#fff', fontFamily:"'Noto Serif JP',serif", fontWeight:600,
            }}>
              <i className={`ti ${readOnly ? "ti-x" : "ti-pencil"}`} style={{fontSize:"0.8125rem"}}/>
              {readOnly ? "再生を終了" : "編集にもどる"}
            </button>
          )}

          {/* ── 節目へ飛ぶ ──
              「どこで分岐を作るか」を探す作業を、印を選ぶ作業に変える。
              エンジンは使わず、盤面だけで決まるものに限っている */}
          {milestones.length > 0 && (
            <div style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:6, flexWrap:'wrap' }}>
              {milestones.map((ms) => (
                <button
                  key={`${ms.ply}-${ms.label}`}
                  onClick={() => setPlaybackIdx(ms.ply)}
                  title={`第${ms.ply}手へ`}
                  style={{
                    padding:'3px 9px', borderRadius:8, cursor:'pointer',
                    border:`0.5px solid ${cur === ms.ply ? '#a07840' : 'rgba(26,15,0,0.18)'}`,
                    background: cur === ms.ply ? '#a07840' : 'transparent',
                    color: cur === ms.ply ? '#fff' : '#5F5E5A',
                    fontSize:"0.625rem", fontFamily:"'Noto Serif JP',serif", whiteSpace:'nowrap',
                  }}
                >
                  {ms.label} <span style={{ opacity: 0.7 }}>{ms.ply}手</span>
                </button>
              ))}
            </div>
          )}

          {/* 現在の盤面が棋譜の最終局面と食い違っているときだけ明示する（Cの割り切り：別データとして共存） */}
          {kifuDiverged && playbackIdx === null && (
            <div style={{ width:'100%', textAlign:'center', fontSize:"0.5625rem", color:'#854F0B', fontFamily:"'Noto Serif JP',serif", lineHeight:1.5 }}>
              <i className="ti ti-info-circle" style={{fontSize:"0.625rem", marginRight:3}}/>
              現在の盤面は棋譜の最終局面とは別に編集されています
            </div>
          )}
        </div>
      )}

      {/* この局面で分岐（インポートした棋譜のみ） */}
      {allowBranch && playbackIdx !== null && playSnap && onBranchFromHere && (
        <button
          onClick={() => onBranchFromHere(playSnap, playbackIdx)}
          style={{
            display:'flex', alignItems:'center', justifyContent:'center', gap:6,
            width:'100%', marginTop:8, padding:'8px 12px', borderRadius:8,
            border:'0.5px solid #a07840', background:'#f0e8d4', color:'#1a0f00',
            fontSize:"0.75rem", cursor:'pointer', fontFamily:"'Noto Serif JP',serif",
          }}
        >
          <i className="ti ti-git-branch" style={{fontSize:"0.8125rem"}}/>この局面で分岐
        </button>
      )}

      {/* 範囲切り出し（インポートした棋譜のみ）：
          再生しながら「ここから」「ここまで」で範囲を選び、その区間の棋譜を持つ子ノードを作る */}
      {allowBranch && playbackIdx !== null && onBranchRange && (() => {
        const idxLabel = (i) => (i === 0 ? '初期局面' : `第${i}手`);
        const rangeReady = rangeStart !== null && rangeEnd !== null;
        const s = rangeReady ? Math.min(rangeStart, rangeEnd) : null;
        const e = rangeReady ? Math.max(rangeStart, rangeEnd) : null;
        const markBtnStyle = (marked) => ({
          display:'flex', alignItems:'center', gap:4,
          padding:'5px 10px', borderRadius:8, fontSize:"0.6875rem", cursor:'pointer',
          border:'0.5px solid #854F0B', fontFamily:"'Noto Serif JP',serif", whiteSpace:'nowrap',
          background: marked ? '#854F0B' : '#faf4e8',
          color:      marked ? '#fff'    : '#854F0B',
        });
        return (
          <div style={{ marginTop:8, padding:'8px 10px', borderRadius:8, border:'0.5px solid rgba(133,79,11,0.4)', background:'#faf4e8' }}>
            <div style={{ fontSize:"0.625rem", color:'#854F0B', fontFamily:"'Noto Serif JP',serif", marginBottom:6, display:'flex', alignItems:'center', gap:4 }}>
              <i className="ti ti-scissors" style={{fontSize:"0.6875rem"}}/>
              範囲を選んで棋譜ごと切り出し（再生位置で指定）
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
              <button onClick={() => setRangeStart(playbackIdx)} style={markBtnStyle(rangeStart !== null)}>
                {rangeStart !== null ? `始点：${idxLabel(rangeStart)}` : 'ここから'}
              </button>
              <button onClick={() => setRangeEnd(playbackIdx)} style={markBtnStyle(rangeEnd !== null)}>
                {rangeEnd !== null ? `終点：${idxLabel(rangeEnd)}` : 'ここまで'}
              </button>
              {(rangeStart !== null || rangeEnd !== null) && (
                <button onClick={() => { setRangeStart(null); setRangeEnd(null); }} title="範囲の選択を解除"
                  style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(26,15,0,0.35)', fontSize:"0.875rem", padding:2, lineHeight:1 }}>
                  <i className="ti ti-x"/>
                </button>
              )}
            </div>
            {rangeReady && (
              <button
                onClick={() => { onBranchRange(s, e); setRangeStart(null); setRangeEnd(null); }}
                style={{
                  display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                  width:'100%', marginTop:8, padding:'8px 12px', borderRadius:8,
                  border:'none', background:'#854F0B', color:'#fff',
                  fontSize:"0.75rem", cursor:'pointer', fontFamily:"'Noto Serif JP',serif", fontWeight:600,
                }}
              >
                <i className="ti ti-git-branch" style={{fontSize:"0.8125rem"}}/>
                {idxLabel(s)}〜{idxLabel(e)}を子ノードに切り出す
              </button>
            )}
          </div>
        );
      })()}

      {/* ヒント文 */}
      {!readOnly && playbackIdx === null && (
        <div style={{fontSize:"0.625rem",color:'#B4B2A9',marginTop:4,textAlign:'center'}}>
          {isRecording
            ? '駒を動かすと手順が記録されます'
            : tool==='move' ? '駒をタップ → 移動先のマス、または持ち駒エリアをタップ'
            : tool==='stamp'
              ? (currentStamp === 'ya'
                  ? (arrowStart ? '矢印の終点のマスをタップ' : '矢印の始点のマスをタップ')
                  : 'スタンプを選んでマスをタップ')
            : 'スタンプが置かれたマスをタップして消す'}
        </div>
      )}

      {/* 再生中のヒント（盤面編集が一時停止していることと復帰方法を明示） */}
      {!readOnly && playbackIdx !== null && (
        <div style={{fontSize:"0.625rem",color:'#a07840',marginTop:4,textAlign:'center'}}>
          再生モード中は盤面を編集できません。「編集にもどる」で編集を再開できます
        </div>
      )}

      {/* 成り確認モーダル */}
      {promoteModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }}>
          <div style={{ background:'#faf4e8', borderRadius:12, padding:'24px 28px',
            textAlign:'center', fontFamily:"'Noto Serif JP',serif",
            boxShadow:'0 4px 24px rgba(0,0,0,0.3)', minWidth:200 }}>
            <div style={{fontSize:"0.9375rem",marginBottom:16,color:'#1a0f00'}}>成りますか？</div>
            <div style={{display:'flex',gap:12,justifyContent:'center'}}>
              <button onClick={() => confirmPromotion(true)} style={{
                padding:'8px 20px', borderRadius:8, border:'none',
                background:'#a07840', color:'#fff', fontSize:"0.8125rem",
                cursor:'pointer', fontFamily:"'Noto Serif JP',serif" }}>成る</button>
              <button onClick={() => confirmPromotion(false)} style={{
                padding:'8px 20px', borderRadius:8, border:'1px solid rgba(26,15,0,0.25)',
                background:'#faf4e8', color:'#1a0f00', fontSize:"0.8125rem",
                cursor:'pointer', fontFamily:"'Noto Serif JP',serif" }}>成らない</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
