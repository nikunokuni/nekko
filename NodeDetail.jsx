import { useState, useEffect } from "react";
import ShogiBoard from "../components/ShogiBoard";
import { StatusChip, ApproachTag, MergeTag, Divider, BackBtn } from "../components/ui";
import { STATUS_META, INITIAL_BOARD } from "../data/treeData";

export default function NodeDetail({ tree, nodeId, onBack, onNodeSelect, onNewNode, onUpdate }) {
  const node = tree.nodes[nodeId];

  // BUG FIX ①: nodeId が変わっても useState の初期値は再評価されないため
  // 別ノードに遷移しても前ノードのメモ・ステータスが残り続ける。
  // useEffect で nodeId 変化を検知してリセットする。
  const [memo, setMemo]               = useState(node?.memo || '');
  const [status, setStatus]           = useState(node?.status || 'todo');
  const [boardVisible, setBoardVisible] = useState(!!node?.board);
  const [boardData, setBoardData]     = useState(node?.board || null);
  const [stamps, setStamps]           = useState(node?.stamps || []);
  const [saving, setSaving]           = useState(false);

  useEffect(() => {
    if (!node) return;
    setMemo(node.memo || '');
    setStatus(node.status || 'todo');
    setBoardVisible(!!node.board);
    setBoardData(node.board || null);
    setStamps(node.stamps || []);
  }, [nodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!node) return null;

  const parent = node.parentId ? tree.nodes[node.parentId] : null;
  const children = (node.childIds || []).map(id => tree.nodes[id]).filter(Boolean);

  const breadcrumb = (() => {
    const parts = [];
    let cur = node;
    while (cur.parentId) {
      cur = tree.nodes[cur.parentId];
      if (cur) parts.unshift(cur.label);
    }
    return parts.join(' › ');
  })();

  const handleBoardChange = ({ board, stamps: s }) => {
    setBoardData(board);
    setStamps(s);
  };

  const handleToggleBoard = () => {
    if (!boardVisible && !boardData) {
      const parentBoard = parent?.board || null;
      setBoardData(parentBoard
        ? JSON.parse(JSON.stringify(parentBoard))
        : JSON.parse(JSON.stringify(INITIAL_BOARD)));
    }
    // BUG FIX ②: 「盤面を削除」ボタンが handleToggleBoard を再利用しているが、
    // boardData をクリアせずに boardVisible だけ false にするため、
    // 再度「追加」すると前の boardData が残る（削除されない）。
    // 非表示 → 表示への切り替えと、削除は別関数に分ける。
    setBoardVisible(v => !v);
  };

  const handleDeleteBoard = () => {
    setBoardData(null);
    setStamps([]);
    setBoardVisible(false);
  };

  // BUG FIX ③: onUpdate が呼ばれていない（保存ボタンがなく編集が揮発する）。
  // 保存ボタンを追加し、memo・status・board の変更を永続化する。
  const handleSave = async () => {
    setSaving(true);
    await onUpdate(nodeId, {
      memo,
      status,
      board: boardVisible ? boardData : null,
      stamps: boardVisible ? stamps : [],
    });
    setSaving(false);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#faf4e8' }}>

      {/* topbar */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'4px 14px 10px',borderBottom:'0.5px solid rgba(26,15,0,0.18)'}}>
        <BackBtn onClick={onBack}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:600,color:'#1a0f00',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
            {node.label}
          </div>
          {breadcrumb && (
            <div style={{fontSize:10,color:'rgba(26,15,0,0.5)',marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
              {tree.name} › {breadcrumb}
            </div>
          )}
        </div>
        {node.isMergeTarget && <MergeTag/>}
        {/* 保存ボタン */}
        <button onClick={handleSave} disabled={saving} style={{
          fontSize:11, padding:'5px 12px', borderRadius:8,
          border:'none', background: saving ? '#B4B2A9' : '#a07840',
          color:'#faf4e8', cursor: saving ? 'default' : 'pointer',
          fontFamily:"'Noto Serif JP',serif", flexShrink:0,
        }}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>

      {/* scrollable body */}
      <div style={{flex:1,overflowY:'auto'}}>

        {node.approachType && (
          <div style={{padding:'8px 16px 0'}}>
            <ApproachTag type={node.approachType}/>
          </div>
        )}

        {/* status */}
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',borderBottom:'0.5px solid rgba(26,15,0,0.08)'}}>
          <span style={{fontSize:11,color:'rgba(26,15,0,0.5)'}}>ステータス</span>
          <div style={{display:'flex',gap:6}}>
            {['done','wip','todo'].map(s => (
              <StatusChip key={s} status={s} active={status===s} onClick={() => setStatus(s)}/>
            ))}
          </div>
        </div>

        {/* memo */}
        <div style={{padding:'10px 16px 0'}}>
          <div style={{fontSize:11,color:'rgba(26,15,0,0.5)',marginBottom:6}}>メモ</div>
          <textarea
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="気づき・方針・手順のポイントなど"
            rows={4}
            style={{
              width:'100%', border:'0.5px solid rgba(26,15,0,0.18)',
              borderRadius:8, padding:'10px 12px',
              fontSize:12, color:'#1a0f00', background:'#faf4e8',
              resize:'none', fontFamily:"'Noto Serif JP',serif",
              lineHeight:1.7, outline:'none',
            }}
            onFocus={e => e.target.style.borderColor='#a07840'}
            onBlur={e => e.target.style.borderColor='rgba(26,15,0,0.18)'}
          />
        </div>

        <Divider style={{margin:'10px 0 0'}}/>

        {/* board section */}
        <div style={{padding:'8px 16px 0'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <span style={{fontSize:11,color:'rgba(26,15,0,0.5)'}}>盤面</span>
            <button onClick={handleToggleBoard} style={{
              fontSize:11, padding:'4px 10px', borderRadius:8,
              border:'0.5px solid #a07840', background:'none',
              cursor:'pointer', color:'#a07840',
              fontFamily:"'Noto Serif JP',serif", display:'flex', alignItems:'center', gap:4,
            }}>
              <i className={`ti ti-${boardVisible ? 'minus' : 'plus'}`} style={{fontSize:12}}/>
              {boardVisible ? '非表示' : '追加'}
            </button>
          </div>

          {!boardVisible ? (
            <div onClick={handleToggleBoard} style={{
              display:'flex', flexDirection:'column', alignItems:'center',
              justifyContent:'center', gap:8, padding:20,
              border:'0.5px dashed rgba(26,15,0,0.18)', borderRadius:10,
              cursor:'pointer', background:'rgba(26,15,0,0.04)', marginBottom:12,
            }}>
              <i className="ti ti-chess" style={{fontSize:24,color:'#a07840'}}/>
              <span style={{fontSize:12,color:'rgba(26,15,0,0.5)'}}>タップして盤面を追加</span>
            </div>
          ) : (
            <div style={{marginBottom:12}}>
              {parent?.board && (
                <div style={{
                  display:'flex', alignItems:'center', gap:6,
                  padding:'6px 10px', borderRadius:8,
                  background:'#d6eaf8', border:'0.5px solid rgba(26,82,118,0.2)',
                  marginBottom:10, fontSize:11, color:'#1a5276',
                }}>
                  <i className="ti ti-copy" style={{fontSize:13}}/>
                  親ノード「{parent.label}」の盤面を引き継いでいます
                </div>
              )}
              <ShogiBoard board={boardData} stamps={stamps} onChange={handleBoardChange}/>
              <button onClick={handleDeleteBoard} style={{
                fontSize:11, color:'#B4B2A9', background:'none', border:'none',
                cursor:'pointer', fontFamily:"'Noto Serif JP',serif",
                display:'flex', alignItems:'center', gap:4, marginTop:6,
              }}>
                <i className="ti ti-trash" style={{fontSize:11}}/>盤面を削除
              </button>
            </div>
          )}
        </div>

        <Divider/>

        {/* branches */}
        <div style={{padding:'8px 16px 16px'}}>
          <div style={{fontSize:11,color:'rgba(26,15,0,0.5)',marginBottom:8}}>分岐</div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {children.map(child => {
              const m = STATUS_META[child.status] || STATUS_META.todo;
              return (
                <div key={child.id} onClick={() => onNodeSelect(child.id)} style={{
                  display:'flex', alignItems:'center', gap:10,
                  padding:'9px 12px', borderRadius:8,
                  border:'0.5px solid rgba(26,15,0,0.18)',
                  background:'#faf4e8', cursor:'pointer',
                }}
                  onMouseEnter={e => e.currentTarget.style.background='#f0e8d4'}
                  onMouseLeave={e => e.currentTarget.style.background='#faf4e8'}
                >
                  <div style={{
                    width:2, height:20, borderRadius:1, flexShrink:0,
                    background: m.dashed ? 'transparent' : m.dot,
                    border: m.dashed ? '0.5px dashed #B4B2A9' : 'none',
                  }}/>
                  <span style={{fontSize:12,color:'#1a0f00',flex:1}}>{child.label}</span>
                  {child.isMergeTarget && <MergeTag/>}
                  <StatusChip status={child.status}/>
                  <i className="ti ti-chevron-right" style={{fontSize:14,color:'#B4B2A9'}}/>
                </div>
              );
            })}
            <div onClick={() => onNewNode(nodeId)} style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'8px 12px', borderRadius:8,
              border:'0.5px dashed rgba(26,15,0,0.18)',
              cursor:'pointer', color:'#a07840', fontSize:12,
            }}
              onMouseEnter={e => e.currentTarget.style.background='#f0e8d4'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}
            >
              <i className="ti ti-git-branch" style={{fontSize:14}}/>
              ここから分岐を追加
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
