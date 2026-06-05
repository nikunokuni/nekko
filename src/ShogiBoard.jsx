// ══════════════════════════════════════════════════
// ShogiBoard.jsx  ―  将棋盤ウィジェット
//   Canvas描画 / 駒移動 / 持ち駒 / 成り / スタンプ
// ══════════════════════════════════════════════════
import { useRef, useEffect, useState, useCallback } from "react";
import { PIECE_LABEL, PROMOTED_LABEL, PROMOTABLE } from "./data";

const CELL = 32;
const COLS = 9, ROWS = 9;

const STAMP_COLOR = { maru:'#2471A3', ya:'#6B3FA0', hoshi:'#B7950B', tri:'#A93226', q:'#5F5E5A' };
const STAMP_CHAR  = { maru:'○', ya:'→', hoshi:'★', tri:'△', q:'？' };

// ── 駒ユーティリティ ──────────────────────────────
const isSentePiece     = (p) => /^\+?[a-z]$/.test(p);          // 先手判定
const isPromoted       = (p) => p.startsWith('+');              // 成り済み判定
const baseKey          = (p) => p.replace('+', '').toLowerCase(); // 基本キー取得

const getPieceLabel = (p) => {
  if (isPromoted(p)) return PROMOTED_LABEL[baseKey(p)] ?? p;
  return PIECE_LABEL[p] ?? p;
};

// 成りゾーン判定（先手:row0〜2、後手:row6〜8）
const inPromotionZone = (row, isSente) => isSente ? row <= 2 : row >= 6;

// 持ち駒の空オブジェクト
const emptyHand = () => ({ p:0, l:0, n:0, s:0, g:0, b:0, r:0 });

// ── roundRect ────────────────────────────────────
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

// ── 持ち駒UIパーツ ────────────────────────────────
const HAND_ORDER = ['r','b','g','s','n','l','p'];
const HAND_LABEL = { r:'飛',b:'角',g:'金',s:'銀',n:'桂',l:'香',p:'歩' };

function HandArea({ hand, isSente, selectedHand, onSelectPiece, readOnly }) {
  const label = isSente ? '自分の持ち駒' : '相手の持ち駒';
  const pieces = HAND_ORDER.filter(k => hand[k] > 0);

  return (
    <div style={{
      minHeight: 36,
      background: '#f5efe0',
      borderRadius: 6,
      padding: '4px 8px',
      marginBottom: 4,
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
      border: '1px solid rgba(26,15,0,0.12)',
    }}>
      <span style={{ fontSize:10, color:'rgba(26,15,0,0.45)', minWidth:60 }}>{label}</span>
      {pieces.length === 0 && (
        <span style={{ fontSize:11, color:'rgba(26,15,0,0.3)' }}>なし</span>
      )}
      {pieces.map(k => {
        const isSelected = selectedHand?.piece === k && selectedHand?.isSente === isSente;
        return (
          <div
            key={k}
            onClick={() => !readOnly && onSelectPiece(k, isSente)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column',
              width: 28, height: 32,
              background: isSelected ? '#f0e8d4' : '#faf4e8',
              border: isSelected ? '1.5px solid #a07840' : '1px solid rgba(26,15,0,0.2)',
              borderRadius: 4,
              cursor: readOnly ? 'default' : 'pointer',
              fontFamily: "'Noto Serif JP',serif",
              transform: isSente ? 'none' : 'rotate(180deg)',
            }}
          >
            <span style={{ fontSize: 11, color: '#1a0f00', lineHeight: 1 }}>{HAND_LABEL[k]}</span>
            <span style={{ fontSize: 9,  color: '#a07840', lineHeight: 1 }}>{hand[k]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────
export default function ShogiBoard({
  board: boardProp,
  stamps: stampsProp   = [],
  handSente: hSenteProp = emptyHand(),
  handGote:  hGoteProp  = emptyHand(),
  onChange,
  readOnly = false,
}) {
  const canvasRef = useRef(null);

  const [board,        setBoard]        = useState(() => boardProp ? JSON.parse(JSON.stringify(boardProp)) : null);
  const [stamps,       setStamps]       = useState(stampsProp);
  const [handSente,    setHandSente]    = useState(hSenteProp);
  const [handGote,     setHandGote]     = useState(hGoteProp);
  const [selected,     setSelected]     = useState(null);      // {row,col} | null
  const [selectedHand, setSelectedHand] = useState(null);      // {piece, isSente} | null
  const [tool,         setTool]         = useState('move');
  const [currentStamp, setCurrentStamp] = useState('maru');
  const [promoteModal, setPromoteModal] = useState(null);      // {nextBoard,nextHS,nextHG,piece}

  // boardProp 変化時のみ内部 state 更新
  const boardPropStr = boardProp ? JSON.stringify(boardProp) : null;
  useEffect(() => {
    if (boardProp) setBoard(JSON.parse(JSON.stringify(boardProp)));
  }, [boardPropStr]); // eslint-disable-line

  const stampsPropStr = JSON.stringify(stampsProp);
  useEffect(() => { setStamps(stampsProp); }, [stampsPropStr]); // eslint-disable-line

  // ── Canvas 描画 ─────────────────────────────────
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
        const promoted = isPromoted(p);
        const pw = CELL*0.72, ph = CELL*0.78;

        // 駒の形
        ctx.save();
        if (!isSente) { ctx.translate(x,y); ctx.rotate(Math.PI); ctx.translate(-x,-y); }
        ctx.fillStyle = '#faf4e8';
        roundRect(ctx, x-pw/2, y-ph/2, pw, ph, 3);
        ctx.fill();
        ctx.strokeStyle = promoted ? 'rgba(180,0,0,0.6)' : 'rgba(26,15,0,0.3)';
        ctx.lineWidth   = promoted ? 1.2 : 0.5;
        ctx.stroke();
        ctx.restore();

        // 駒の文字
        ctx.save();
        ctx.font = `${CELL*0.38}px 'Noto Serif JP',serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = promoted ? '#c0392b' : (isSente ? '#1a0f00' : '#7B3010');
        if (!isSente) {
          ctx.translate(x,y); ctx.rotate(Math.PI);
          ctx.fillText(getPieceLabel(p), 0, 0);
        } else {
          ctx.fillText(getPieceLabel(p), x, y);
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

  // ── 盤面・持ち駒を onChange に通知 ──────────────
  const notify = useCallback((nextBoard, nextHS, nextHG, nextStamps) => {
    onChange?.({
      board:     nextBoard  ?? board,
      stamps:    nextStamps ?? stamps,
      handSente: nextHS     ?? handSente,
      handGote:  nextHG     ?? handGote,
    });
  }, [board, stamps, handSente, handGote, onChange]);

  // ── 成り確認モーダルを経て盤面確定 ──────────────
  const confirmPromotion = useCallback((doPromote) => {
    if (!promoteModal) return;
    const { nextBoard, nextHS, nextHG, movedPiece, toRow, toCol } = promoteModal;
    const finalBoard = nextBoard.map(r => [...r]);

    if (doPromote) {
      const p = finalBoard[toRow][toCol];
      finalBoard[toRow][toCol] = isSentePiece(p) ? '+' + p : '+' + p;
    }

    setBoard(finalBoard);
    setHandSente(nextHS);
    setHandGote(nextHG);
    setPromoteModal(null);
    notify(finalBoard, nextHS, nextHG, stamps);
  }, [promoteModal, stamps, notify]);

  // ── クリック処理 ─────────────────────────────────
  const handleClick = useCallback((e) => {
    if (readOnly || !board) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) * (canvas.width  / rect.width)  / CELL);
    const row = Math.floor((e.clientY - rect.top)  * (canvas.height / rect.height) / CELL);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;

    // ── スタンプ・消しゴムモード ──
    if (tool === 'stamp') {
      const next = stamps.filter(s => !(s.row===row && s.col===col));
      next.push({ row, col, type: currentStamp });
      setStamps(next);
      notify(board, handSente, handGote, next);
      return;
    }
    if (tool === 'erase') {
      const next = stamps.filter(s => !(s.row===row && s.col===col));
      setStamps(next);
      notify(board, handSente, handGote, next);
      return;
    }

    // ── 持ち駒を打つモード（持ち駒が選択済み）──
    if (selectedHand) {
      const { piece, isSente } = selectedHand;
      const target = board[row]?.[col];
      if (target && target !== ' ') {
        // 駒がある場所には打てない → 選択解除
        setSelectedHand(null);
        return;
      }
      const nextBoard = board.map(r => [...r]);
      nextBoard[row][col] = isSente ? piece : piece.toUpperCase();
      const nextHS = isSente  ? { ...handSente, [piece]: handSente[piece] - 1 } : handSente;
      const nextHG = !isSente ? { ...handGote,  [piece]: handGote[piece]  - 1 } : handGote;
      setBoard(nextBoard);
      setHandSente(nextHS);
      setHandGote(nextHG);
      setSelectedHand(null);
      notify(nextBoard, nextHS, nextHG, stamps);
      return;
    }

    // ── 移動モード ──
    if (selected) {
      const from = selected;
      setSelected(null);
      if (from.row === row && from.col === col) return; // 同じマスは選択解除のみ

      const movingPiece = board[from.row][from.col];
      const isSente = isSentePiece(movingPiece);
      const target  = board[row]?.[col];

      // 相手駒を取る → 持ち駒に加算（成りを剥がしてbaseKeyで）
      let nextHS = { ...handSente };
      let nextHG = { ...handGote };
      if (target && target !== ' ') {
        const capturedBase = baseKey(target);
        if (isSente) nextHS = { ...nextHS, [capturedBase]: (nextHS[capturedBase] ?? 0) + 1 };
        else         nextHG = { ...nextHG, [capturedBase]: (nextHG[capturedBase] ?? 0) + 1 };
      }

      const nextBoard = board.map(r => [...r]);
      nextBoard[row][col]       = movingPiece;
      nextBoard[from.row][from.col] = ' ';

      // 成り判定：未成駒 && 成れる種類 && 成りゾーン
      const canPromote =
        !isPromoted(movingPiece) &&
        PROMOTABLE.has(baseKey(movingPiece)) &&
        (inPromotionZone(row, isSente) || inPromotionZone(from.row, isSente));

      if (canPromote) {
        // 成り確認モーダルを表示
        setPromoteModal({ nextBoard, nextHS, nextHG, movedPiece: movingPiece, toRow: row, toCol: col });
      } else {
        setBoard(nextBoard);
        setHandSente(nextHS);
        setHandGote(nextHG);
        notify(nextBoard, nextHS, nextHG, stamps);
      }
      return;
    }

    // 駒を選択
    if (board[row]?.[col] && board[row][col] !== ' ') {
      setSelected({ row, col });
    }
  }, [board, stamps, selected, selectedHand, tool, currentStamp, readOnly, handSente, handGote, notify]);

  // タッチ対応
  const handleTouchEnd = useCallback((e) => {
    if (readOnly || !board) return;
    if (e.changedTouches.length !== 1) return;
    e.preventDefault();
    const t = e.changedTouches[0];
    handleClick({ clientX: t.clientX, clientY: t.clientY });
  }, [handleClick, readOnly, board]);

  if (!board) return null;

  const W = COLS * CELL, H = ROWS * CELL;

  return (
    <div style={{ maxWidth: 400 }}>

      {/* 後手の持ち駒（上） */}
      <HandArea
        hand={handGote}
        isSente={false}
        selectedHand={selectedHand}
        onSelectPiece={(piece) => {
          if (tool !== 'move') return;
          setSelected(null);
          setSelectedHand(prev =>
            prev?.piece === piece && !prev?.isSente ? null : { piece, isSente: false }
          );
        }}
        readOnly={readOnly}
      />

      {/* ツールバー */}
      {!readOnly && (
        <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
          {[['move','動かす','ti-arrows-move'],['stamp','スタンプ','ti-stamp'],['erase','消す','ti-eraser']].map(([t,lbl,icon]) => (
            <button key={t} onClick={() => { setTool(t); setSelected(null); setSelectedHand(null); }} style={{
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
            }}>{ch}</div>
          ))}
        </div>
      )}

      {/* 将棋盤 Canvas */}
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

      {/* 先手の持ち駒（下） */}
      <HandArea
        hand={handSente}
        isSente={true}
        selectedHand={selectedHand}
        onSelectPiece={(piece) => {
          if (tool !== 'move') return;
          setSelected(null);
          setSelectedHand(prev =>
            prev?.piece === piece && prev?.isSente ? null : { piece, isSente: true }
          );
        }}
        readOnly={readOnly}
      />

      {/* ヒント文 */}
      {!readOnly && (
        <div style={{fontSize:10,color:'#B4B2A9',marginTop:4,textAlign:'center'}}>
          {tool==='move'  ? '駒をタップして選択 → 移動先をタップ' :
           tool==='stamp' ? 'スタンプを選んでマスをタップ' :
                            'スタンプが置かれたマスをタップして消す'}
        </div>
      )}

      {/* 成り確認モーダル */}
      {promoteModal && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.45)',
          display:'flex', alignItems:'center', justifyContent:'center',
          zIndex: 9999,
        }}>
          <div style={{
            background:'#faf4e8', borderRadius:12, padding:'24px 28px',
            textAlign:'center', fontFamily:"'Noto Serif JP',serif",
            boxShadow:'0 4px 24px rgba(0,0,0,0.3)', minWidth:200,
          }}>
            <div style={{fontSize:15,marginBottom:16,color:'#1a0f00'}}>成りますか？</div>
            <div style={{display:'flex',gap:12,justifyContent:'center'}}>
              <button
                onClick={() => confirmPromotion(true)}
                style={{
                  padding:'8px 20px', borderRadius:8, border:'none',
                  background:'#a07840', color:'#fff', fontSize:13,
                  cursor:'pointer', fontFamily:"'Noto Serif JP',serif",
                }}
              >成る</button>
              <button
                onClick={() => confirmPromotion(false)}
                style={{
                  padding:'8px 20px', borderRadius:8,
                  border:'1px solid rgba(26,15,0,0.25)',
                  background:'#faf4e8', color:'#1a0f00', fontSize:13,
                  cursor:'pointer', fontFamily:"'Noto Serif JP',serif",
                }}
              >成らない</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
