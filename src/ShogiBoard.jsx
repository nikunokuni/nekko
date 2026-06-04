// ══════════════════════════════════════════════════
// ShogiBoard.jsx  ―  将棋盤ウィジェット
//   Canvas 描画 / 駒の移動 / スタンプ操作
// ══════════════════════════════════════════════════
import { useRef, useEffect, useState, useCallback } from "react";
import { PIECE_LABEL } from "./data";

const CELL = 32;
const COLS = 9, ROWS = 9;

const STAMP_COLOR = { maru:'#2471A3', ya:'#6B3FA0', hoshi:'#B7950B', tri:'#A93226', q:'#5F5E5A' };
const STAMP_CHAR  = { maru:'○', ya:'→', hoshi:'★', tri:'△', q:'？' };

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

// 先手判定：小文字アルファベットのみ先手（大文字=後手）
const isSentePiece = (p) => /^[a-z]$/.test(p);

export default function ShogiBoard({ board: boardProp, stamps: stampsProp = [], onChange, readOnly = false }) {
  const canvasRef = useRef(null);
  const [board,        setBoard]        = useState(() => boardProp ? JSON.parse(JSON.stringify(boardProp)) : null);
  const [stamps,       setStamps]       = useState(stampsProp);
  const [selected,     setSelected]     = useState(null);
  const [tool,         setTool]         = useState('move');
  const [currentStamp, setCurrentStamp] = useState('maru');

  // boardProp が変化したときのみ内部 state を更新（JSON 文字列比較で無限ループ防止）
  const boardPropStr = boardProp ? JSON.stringify(boardProp) : null;
  useEffect(() => {
    if (boardProp) setBoard(JSON.parse(JSON.stringify(boardProp)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardPropStr]);

  const stampsPropStr = JSON.stringify(stampsProp);
  useEffect(() => {
    setStamps(stampsProp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stampsPropStr]);

  // ── Canvas 描画 ───────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !board) return;
    const ctx = canvas.getContext('2d');
    const W = COLS * CELL, H = ROWS * CELL;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#c8a447';
    ctx.fillRect(0, 0, W, H);

    // グリッド線
    ctx.strokeStyle = 'rgba(26,15,0,0.55)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i <= COLS; i++) { ctx.beginPath(); ctx.moveTo(i*CELL,0); ctx.lineTo(i*CELL,H); ctx.stroke(); }
    for (let j = 0; j <= ROWS; j++) { ctx.beginPath(); ctx.moveTo(0,j*CELL); ctx.lineTo(W,j*CELL); ctx.stroke(); }

    // 選択マスのハイライト
    if (selected) {
      ctx.fillStyle = 'rgba(255,220,80,0.45)';
      ctx.fillRect(selected.col*CELL, selected.row*CELL, CELL, CELL);
    }

    // 駒の描画
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = board[r]?.[c];
        if (!p || p === ' ') continue;
        const x = c*CELL+CELL/2, y = r*CELL+CELL/2;
        const isSente = isSentePiece(p);
        const pw = CELL*0.72, ph = CELL*0.78;

        ctx.save();
        if (!isSente) { ctx.translate(x,y); ctx.rotate(Math.PI); ctx.translate(-x,-y); }
        ctx.fillStyle = '#faf4e8';
        roundRect(ctx, x-pw/2, y-ph/2, pw, ph, 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(26,15,0,0.3)'; ctx.lineWidth = 0.5; ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.font = `${CELL*0.38}px 'Noto Serif JP',serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = isSente ? '#1a0f00' : '#7B3010';
        if (!isSente) {
          ctx.translate(x,y); ctx.rotate(Math.PI);
          ctx.fillText(PIECE_LABEL[p.toLowerCase()] || p, 0, 0);
        } else {
          ctx.fillText(PIECE_LABEL[p] || p, x, y);
        }
        ctx.restore();
      }
    }

    // スタンプの描画
    for (const st of stamps) {
      if (!STAMP_COLOR[st.type]) continue;
      const x = st.col*CELL+CELL/2, y = st.row*CELL+CELL/2;
      ctx.save();
      ctx.font = `bold ${CELL*0.52}px 'Noto Serif JP',serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = STAMP_COLOR[st.type];
      ctx.globalAlpha = 0.88;
      ctx.fillText(STAMP_CHAR[st.type], x, y);
      ctx.restore();
    }
  }, [board, stamps, selected]);

  useEffect(() => { draw(); }, [draw]);

  // ── クリック / タップ処理 ─────────────────────
  const handleClick = useCallback((e) => {
    if (readOnly || !board) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) * (canvas.width  / rect.width)  / CELL);
    const row = Math.floor((e.clientY - rect.top)  * (canvas.height / rect.height) / CELL);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

    if (tool === 'stamp') {
      const next = stamps.filter(s => !(s.row===row && s.col===col));
      next.push({ row, col, type: currentStamp });
      setStamps(next);
      onChange?.({ board, stamps: next });
      return;
    }
    if (tool === 'erase') {
      const next = stamps.filter(s => !(s.row===row && s.col===col));
      setStamps(next);
      onChange?.({ board, stamps: next });
      return;
    }
    // move モード
    if (selected) {
      const from = selected;
      setSelected(null);
      if (from.row === row && from.col === col) return;
      const next = board.map(r => [...r]);
      next[row][col] = next[from.row][from.col];
      next[from.row][from.col] = ' ';
      setBoard(next);
      onChange?.({ board: next, stamps });
    } else {
      if (board[row]?.[col] && board[row][col] !== ' ') setSelected({ row, col });
    }
  }, [board, stamps, selected, tool, currentStamp, readOnly, onChange]);

  // タッチ端末で onClick が発火しないブラウザへの対応
  const handleTouchEnd = useCallback((e) => {
    if (readOnly || !board) return;
    if (e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0];
    handleClick({ clientX: t.clientX, clientY: t.clientY });
  }, [handleClick, readOnly, board]);

  if (!board) return null;

  const W = COLS * CELL, H = ROWS * CELL;

  return (
    <div>
      {/* ツールバー */}
      {!readOnly && (
        <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
          {[['move','動かす','ti-arrows-move'],['stamp','スタンプ','ti-stamp'],['erase','消す','ti-eraser']].map(([t,lbl,icon]) => (
            <button key={t} onClick={() => setTool(t)} style={{
              display:'flex', alignItems:'center', gap:4,
              padding:'4px 9px', borderRadius:8, fontSize:11, cursor:'pointer',
              border:'0.5px solid', fontFamily:"'Noto Serif JP',serif",
              borderColor: tool===t ? '#a07840' : 'rgba(26,15,0,0.18)',
              background:  tool===t ? '#f0e8d4' : '#faf4e8',
              color:       tool===t ? '#1a0f00' : 'rgba(26,15,0,0.5)',
            }}>
              <i className={`ti ${icon}`} style={{fontSize:13}}/>{lbl}
            </button>
          ))}
        </div>
      )}

      {/* スタンプ選択 */}
      {!readOnly && tool === 'stamp' && (
        <div style={{ display:'flex', gap:5, marginBottom:8, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{fontSize:10,color:'rgba(26,15,0,0.5)'}}>スタンプ：</span>
          {Object.entries(STAMP_CHAR).map(([k,ch]) => (
            <div key={k} onClick={() => setCurrentStamp(k)} style={{
              width:28, height:28, borderRadius:'50%', cursor:'pointer',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:14, color:STAMP_COLOR[k], background:'#faf4e8',
              border: currentStamp===k ? `1.5px solid ${STAMP_COLOR[k]}` : '1.5px solid transparent',
              transition:'all 0.15s',
            }}>{ch}</div>
          ))}
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={W} height={H}
        onClick={handleClick}
        onTouchEnd={handleTouchEnd}
        style={{
          display:'block', borderRadius:4,
          cursor: readOnly ? 'default' : 'pointer',
          width:'100%', maxWidth: W,
        }}
      />

      {!readOnly && (
        <div style={{fontSize:10,color:'#B4B2A9',marginTop:5,textAlign:'center'}}>
          {tool==='move'  ? '駒をタップして選択 → 移動先をタップ' :
           tool==='stamp' ? 'スタンプを選んでマスをタップ' :
                            'スタンプが置かれたマスをタップして消す'}
        </div>
      )}
    </div>
  );
}
