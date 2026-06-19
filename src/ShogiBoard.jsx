// ══════════════════════════════════════════════════
// ShogiBoard.jsx  ―  将棋盤ウィジェット
//   Canvas描画 / 駒移動 / 持ち駒 / 成り / スタンプ
//   棋譜記録（録画） / 棋譜再生（←→ナビ）
// ══════════════════════════════════════════════════
import { useRef, useEffect, useState, useCallback } from "react";
import { PIECE_LABEL, PROMOTED_LABEL, PROMOTABLE } from "./data";

const CELL = 38;
const COLS = 9, ROWS = 9;

const STAMP_COLOR = { maru:'#2471A3', ya:'#6B3FA0', shikaku:'#C0392B', q:'#5F5E5A' };
const STAMP_CHAR  = { maru:'○', ya:'➡', shikaku:'□', q:'？' };

// ── 矢印スタンプを描画（マスの中心→中心へ大きな矢印） ──
function drawArrowStamp(ctx, x1, y1, x2, y2, color) {
  const headLen = CELL * 0.34;
  const angle   = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = CELL * 0.14; ctx.lineCap = 'round';
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

// ── 持ち駒UIパーツ ────────────────────────────────
const HAND_ORDER = ['r','b','g','s','n','l','p'];
const HAND_LABEL = { r:'飛',b:'角',g:'金',s:'銀',n:'桂',l:'香',p:'歩' };

function HandPiece({ k, count, isSente, isSelected, onClick, readOnly }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = 32;
    ctx.clearRect(0, 0, size, size);
    drawPiece(ctx, size/2, size/2 + 1, size, isSente ? k : k.toUpperCase(), isSelected);
    if (count > 1) {
      ctx.font = `bold 9px 'Noto Serif JP',serif`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#a07840'; ctx.fillText(String(count), size - 1, size - 1);
    }
  }, [k, isSente, isSelected, count]);
  return (
    <canvas ref={ref} width={32} height={32} onClick={() => !readOnly && onClick()}
      style={{ cursor: readOnly ? 'default' : 'pointer', borderRadius: 4,
        border: isSelected ? '1.5px solid #a07840' : '1.5px solid transparent',
        background: isSelected ? '#f0e8d4' : 'transparent',
        transform: isSente ? 'none' : 'rotate(180deg)' }}
    />
  );
}

// ── 棋譜ナビボタン ────────────────────────────────
function NavBtn({ onClick, disabled, icon }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width:32, height:32, borderRadius:6, border:'0.5px solid rgba(26,15,0,0.18)',
        background:'#faf4e8', cursor: disabled ? 'default' : 'pointer',
        color: disabled ? '#ccc' : '#a07840',
        fontSize:16, display:'flex', alignItems:'center', justifyContent:'center',
      }}
    >
      <i className={`ti ${icon}`}/>
    </button>
  );
}

function HandArea({ hand, isSente, selectedHand, onSelectPiece, readOnly }) {
  const label = isSente ? '自分の持ち駒' : '相手の持ち駒';
  const pieces = HAND_ORDER.filter(k => hand[k] > 0);
  return (
    <div style={{ minHeight:40, background:'#f0e6cc', borderRadius:6, padding:'4px 8px',
      marginBottom:4, display:'flex', alignItems:'center', gap:4, flexWrap:'wrap',
      border:'1px solid rgba(120,80,10,0.2)' }}>
      <span style={{ fontSize:10, color:'rgba(26,15,0,0.45)', minWidth:60 }}>{label}</span>
      {pieces.length === 0 && <span style={{ fontSize:11, color:'rgba(26,15,0,0.3)' }}>なし</span>}
      {pieces.map(k => (
        <HandPiece key={k} k={k} count={hand[k]} isSente={isSente}
          isSelected={selectedHand?.piece === k && selectedHand?.isSente === isSente}
          readOnly={readOnly} onClick={() => onSelectPiece(k, isSente)} />
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
  readOnly = false,
  allowBranch = false,      // true: 棋譜インポート由来のノードで「この局面で分岐」を表示
  onBranchFromHere,         // (snapshot) => void
}) {
  const canvasRef = useRef(null);

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
  // recordingRef: handleClick クロージャからも最新値を参照できるよう Ref で管理
  const recordingRef = useRef({ active: false, snaps: [] });

  // boardProp 変化時のみ内部 state 更新
  const boardPropStr = boardProp ? JSON.stringify(boardProp) : null;
  useEffect(() => {
    if (boardProp) setBoard(JSON.parse(JSON.stringify(boardProp)));
  }, [boardPropStr]); // eslint-disable-line

  const stampsPropStr = JSON.stringify(stampsProp);
  useEffect(() => { setStamps(stampsProp); }, [stampsPropStr]); // eslint-disable-line

  // 再生中に表示する盤面・持ち駒（kifu スナップショットを参照）
  const playSnap    = playbackIdx !== null ? kifuProp[playbackIdx] : null;
  const dispBoard   = playSnap ? playSnap.board     : board;
  const dispHSente  = playSnap ? playSnap.handSente : handSente;
  const dispHGote   = playSnap ? playSnap.handGote  : handGote;

  // ── Canvas 描画 ─────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dispBoard) return;
    const ctx = canvas.getContext('2d');
    const W = COLS * CELL, H = ROWS * CELL;
    ctx.clearRect(0, 0, W, H);

    const boardGrad = ctx.createLinearGradient(0, 0, W, H);
    boardGrad.addColorStop(0, '#d4a84b'); boardGrad.addColorStop(0.5, '#c8971e'); boardGrad.addColorStop(1, '#b87c10');
    ctx.fillStyle = boardGrad; ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(80,50,10,0.6)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(60,35,5,0.45)'; ctx.lineWidth = 0.7;
    for (let i = 0; i <= COLS; i++) { ctx.beginPath(); ctx.moveTo(i*CELL,0); ctx.lineTo(i*CELL,H); ctx.stroke(); }
    for (let j = 0; j <= ROWS; j++) { ctx.beginPath(); ctx.moveTo(0,j*CELL); ctx.lineTo(W,j*CELL); ctx.stroke(); }

    ctx.fillStyle = 'rgba(60,35,5,0.6)';
    for (const [r,c] of [[2,2],[2,6],[6,2],[6,6]]) {
      ctx.beginPath(); ctx.arc(c*CELL, r*CELL, 2.5, 0, Math.PI*2); ctx.fill();
    }

    if (selected && !playSnap) {
      ctx.fillStyle = 'rgba(255,230,60,0.5)';
      ctx.fillRect(selected.col*CELL + 1, selected.row*CELL + 1, CELL - 2, CELL - 2);
    }

    if (arrowStart && !playSnap) {
      ctx.fillStyle = 'rgba(107,63,160,0.35)';
      ctx.fillRect(arrowStart.col*CELL + 1, arrowStart.row*CELL + 1, CELL - 2, CELL - 2);
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = dispBoard[r]?.[c];
        if (!p || p === ' ') continue;
        drawPiece(ctx, c*CELL + CELL/2, r*CELL + CELL/2, CELL, p,
          !playSnap && selected?.row === r && selected?.col === c);
      }
    }

    for (const st of stamps) {
      if (!STAMP_COLOR[st.type]) continue;
      const x = st.col*CELL + CELL/2, y = st.row*CELL + CELL/2;
      ctx.save();

      if (st.type === 'ya') {
        // 矢印：始点マス中心 → 終点マス中心
        const x2 = st.toCol*CELL + CELL/2, y2 = st.toRow*CELL + CELL/2;
        drawArrowStamp(ctx, x, y, x2, y2, STAMP_COLOR.ya);
      } else if (st.type === 'shikaku') {
        // 四角：マスの輪郭を強調（駒が見えるよう枠線のみ）
        const pad = CELL * 0.05;
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = STAMP_COLOR.shikaku; ctx.lineWidth = CELL * 0.09;
        ctx.strokeRect(st.col*CELL + pad, st.row*CELL + pad, CELL - pad*2, CELL - pad*2);
      } else if (st.type === 'maru') {
        // 丸：駒を囲む円（中は塗りつぶさない）
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = STAMP_COLOR.maru; ctx.lineWidth = CELL * 0.07;
        ctx.beginPath(); ctx.arc(x, y, CELL * 0.46, 0, Math.PI * 2); ctx.stroke();
      } else {
        // ？マーク：マス左上に小さく表示し、駒本体は隠さない
        const bx = st.col*CELL + CELL*0.20, by = st.row*CELL + CELL*0.20;
        const fs = CELL * 0.34;
        ctx.font = `bold ${fs}px 'Noto Serif JP',serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = 0.92;
        ctx.strokeStyle = 'white'; ctx.lineWidth = fs*0.22; ctx.lineJoin = 'round';
        ctx.strokeText(STAMP_CHAR.q, bx, by);
        ctx.fillStyle = STAMP_COLOR.q; ctx.fillText(STAMP_CHAR.q, bx, by);
      }
      ctx.restore();
    }
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

  const stopRecording = useCallback(() => {
    recordingRef.current.active = false;
    setIsRecording(false);
    onKifuChange?.(recordingRef.current.snaps);
  }, [onKifuChange]);

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

  const handleTouchEnd = useCallback((e) => {
    if (readOnly || !board) return;
    if (e.changedTouches.length !== 1) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    handleClick({ clientX: t.clientX, clientY: t.clientY });
  }, [handleClick, readOnly, board]);

  if (!board) return null;
  const W = COLS * CELL, H = ROWS * CELL;
  const kifuLen = kifuProp.length;  // 保存済みスナップショット数（0 = 棋譜なし）
  const moveCount = Math.max(0, kifuLen - 1); // 手数 = スナップ数 - 1（初期局面分を引く）

  const btnStyle = (active) => ({
    display: 'flex', alignItems: 'center', gap: 4,
    padding: '4px 9px', borderRadius: 8, fontSize: 11, cursor: 'pointer',
    border: '0.5px solid', fontFamily: "'Noto Serif JP',serif",
    borderColor: active ? '#a07840' : 'rgba(26,15,0,0.18)',
    background:  active ? '#f0e8d4' : '#faf4e8',
    color:       active ? '#1a0f00' : 'rgba(26,15,0,0.5)',
  });

  return (
    <div style={{ maxWidth: 420 }}>

      {/* ── ツールバー（再生中は非表示） ── */}
      {!readOnly && playbackIdx === null && (
        <div style={{ display:'flex', gap:6, marginBottom:6, flexWrap:'wrap', alignItems:'center' }}>
          {[['move','動かす','ti-arrows-move'],['stamp','スタンプ','ti-stamp'],['erase','消す','ti-eraser']].map(([t,lbl,icon]) => (
            <button key={t} onClick={() => { setTool(t); setSelected(null); setSelectedHand(null); setArrowStart(null); }} style={btnStyle(tool===t)}>
              <i className={`ti ${icon}`} style={{fontSize:13}}/>{lbl}
            </button>
          ))}

          {/* 棋譜記録ボタン */}
          <div style={{ marginLeft: 'auto' }}>
            {!isRecording ? (
              <button onClick={startRecording} style={{
                ...btnStyle(false), borderColor:'#854F0B', color:'#854F0B', gap:5,
              }}>
                <i className="ti ti-record-mail" style={{fontSize:13}}/>棋譜を記録
              </button>
            ) : (
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:11, color:'#A93226', fontFamily:"'Noto Serif JP',serif", display:'flex', alignItems:'center', gap:4 }}>
                  <span style={{ width:7, height:7, borderRadius:'50%', background:'#A93226', display:'inline-block' }}/>
                  {recordingRef.current.snaps.length - 1}手
                </span>
                <button onClick={stopRecording} style={{
                  ...btnStyle(true), borderColor:'#A93226', background:'#A93226', color:'#fff',
                }}>
                  記録を終わる
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* スタンプ選択 */}
      {!readOnly && tool === 'stamp' && playbackIdx === null && (
        <div style={{ display:'flex', gap:5, marginBottom:6, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{fontSize:10,color:'rgba(26,15,0,0.5)'}}>スタンプ：</span>
          {Object.entries(STAMP_CHAR).map(([k,ch]) => (
            <div key={k} onClick={() => { setCurrentStamp(k); setArrowStart(null); }} style={{
              width:28, height:28, borderRadius:'50%', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:14, color:STAMP_COLOR[k], background:'#faf4e8',
              border: currentStamp===k ? `1.5px solid ${STAMP_COLOR[k]}` : '1.5px solid transparent',
            }}>{ch}</div>
          ))}
        </div>
      )}

      {/* 後手の持ち駒（上） */}
      <HandArea hand={dispHGote} isSente={false} selectedHand={playSnap ? null : selectedHand}
        onSelectPiece={(piece) => {
          if (tool !== 'move') return;
          setSelected(null);
          setSelectedHand(prev => prev?.piece === piece && !prev?.isSente ? null : { piece, isSente: false });
        }}
        readOnly={readOnly || playbackIdx !== null}
      />

      {/* 将棋盤 Canvas */}
      <canvas ref={canvasRef} width={W} height={H}
        onClick={handleClick} onTouchEnd={handleTouchEnd}
        style={{ display:'block', borderRadius:4, cursor: (readOnly || playbackIdx !== null) ? 'default' : 'pointer',
          width:'100%', maxWidth:W, boxShadow:'0 3px 14px rgba(0,0,0,0.35)' }}
      />

      {/* 先手の持ち駒（下） */}
      <HandArea hand={dispHSente} isSente={true} selectedHand={playSnap ? null : selectedHand}
        onSelectPiece={(piece) => {
          if (tool !== 'move') return;
          setSelected(null);
          setSelectedHand(prev => prev?.piece === piece && prev?.isSente ? null : { piece, isSente: true });
        }}
        readOnly={readOnly || playbackIdx !== null}
      />

      {/* ── 棋譜ナビ（保存済み棋譜がある場合） ── */}
      {!readOnly && kifuLen > 0 && !isRecording && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          marginTop: 8, padding: '6px 12px', borderRadius: 8,
          background: playbackIdx !== null ? '#f0e8d4' : '#faf4e8',
          border: `0.5px solid ${playbackIdx !== null ? '#a07840' : 'rgba(26,15,0,0.15)'}`,
        }}>
          {/* |< 最初へ */}
          <NavBtn icon="ti-player-skip-back" disabled={playbackIdx === 0}
            onClick={() => setPlaybackIdx(0)} />

          {/* < 前へ */}
          <NavBtn icon="ti-chevron-left" disabled={playbackIdx === 0}
            onClick={() => setPlaybackIdx(idx => idx === null ? 0 : Math.max(0, idx - 1))} />

          {/* 手数表示 */}
          <div style={{ fontFamily:"'Noto Serif JP',serif", fontSize:12, color:'#1a0f00', minWidth:80, textAlign:'center' }}>
            {playbackIdx === null
              ? <span style={{color:'rgba(26,15,0,0.4)'}}>棋譜 {moveCount}手</span>
              : playbackIdx === 0
              ? '初期局面'
              : `第${playbackIdx}手 / ${moveCount}手`
            }
          </div>

          {/* 次へ > */}
          <NavBtn icon="ti-chevron-right" disabled={playbackIdx === moveCount}
            onClick={() => setPlaybackIdx(idx => idx === null ? 1 : Math.min(moveCount, idx + 1))} />

          {/* 最後へ >| */}
          <NavBtn icon="ti-player-skip-forward" disabled={playbackIdx === moveCount}
            onClick={() => setPlaybackIdx(moveCount)} />

          {/* 再生中なら「編集に戻る」 */}
          {playbackIdx !== null && (
            <button onClick={() => setPlaybackIdx(null)} style={{
              padding:'3px 8px', borderRadius:6, border:'0.5px solid rgba(26,15,0,0.18)',
              background:'transparent', cursor:'pointer', fontSize:10,
              color:'rgba(26,15,0,0.5)', fontFamily:"'Noto Serif JP',serif",
            }}>
              ✕ 閉じる
            </button>
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
            fontSize:12, cursor:'pointer', fontFamily:"'Noto Serif JP',serif",
          }}
        >
          <i className="ti ti-git-branch" style={{fontSize:13}}/>この局面で分岐
        </button>
      )}

      {/* ヒント文 */}
      {!readOnly && playbackIdx === null && (
        <div style={{fontSize:10,color:'#B4B2A9',marginTop:4,textAlign:'center'}}>
          {isRecording
            ? '駒を動かすと手順が記録されます'
            : tool==='move' ? '駒をタップして選択 → 移動先をタップ'
            : tool==='stamp'
              ? (currentStamp === 'ya'
                  ? (arrowStart ? '矢印の終点のマスをタップ' : '矢印の始点のマスをタップ')
                  : 'スタンプを選んでマスをタップ')
            : 'スタンプが置かれたマスをタップして消す'}
        </div>
      )}

      {/* 成り確認モーダル */}
      {promoteModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)',
          display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }}>
          <div style={{ background:'#faf4e8', borderRadius:12, padding:'24px 28px',
            textAlign:'center', fontFamily:"'Noto Serif JP',serif",
            boxShadow:'0 4px 24px rgba(0,0,0,0.3)', minWidth:200 }}>
            <div style={{fontSize:15,marginBottom:16,color:'#1a0f00'}}>成りますか？</div>
            <div style={{display:'flex',gap:12,justifyContent:'center'}}>
              <button onClick={() => confirmPromotion(true)} style={{
                padding:'8px 20px', borderRadius:8, border:'none',
                background:'#a07840', color:'#fff', fontSize:13,
                cursor:'pointer', fontFamily:"'Noto Serif JP',serif" }}>成る</button>
              <button onClick={() => confirmPromotion(false)} style={{
                padding:'8px 20px', borderRadius:8, border:'1px solid rgba(26,15,0,0.25)',
                background:'#faf4e8', color:'#1a0f00', fontSize:13,
                cursor:'pointer', fontFamily:"'Noto Serif JP',serif" }}>成らない</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
