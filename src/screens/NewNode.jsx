import { useState } from "react";
import ShogiBoard from "../components/ShogiBoard";
import { StatusChip } from "../components/ui";
import { SUGGESTIONS, INITIAL_BOARD, newId } from "../data/treeData";

const STEPS = ['切り口','候補','盤面','メモ'];

const APPROACHES = [
  { key:'相手の戦法', icon:'ti-swords',    iconColor:'#7B3010', bg:'#fadbd8',
    title:'相手の戦法', sub:'居飛車 / 三間飛車 / 穴熊 など\n相手の出方によって分岐する' },
  { key:'自分の志向', icon:'ti-user',      iconColor:'#1a5276', bg:'#d6eaf8',
    title:'自分の志向', sub:'受け志向 / 攻め志向 / バランス型\n自分のスタイルで分岐する' },
  { key:'局面の状況', icon:'ti-chart-dots', iconColor:'#854F0B', bg:'#FAEEDA',
    title:'局面の状況', sub:'銀が間に合った / 穴熊に組まれた\n局面の条件によって分岐する' },
];

export default function NewNode({ tree, parentNodeId, onComplete, onCancel }) {
  const parentNode = tree.nodes[parentNodeId];
  const [step, setStep] = useState(0);
  const [approach, setApproach] = useState(null);
  const [suggestion, setSuggestion] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState('todo');
  const [memo, setMemo] = useState('');
  const [boardData, setBoardData] = useState(null);
  const [stamps, setStamps] = useState([]);
  const [done, setDone] = useState(false);

  const displayName = name || suggestion || '新しいノード';

  const canNext = () => {
    if (step === 0) return !!approach;
    if (step === 1) return !!(name.trim() || suggestion);
    return true;
  };

  const handleNext = () => {
    if (step === 1 && suggestion && !name.trim()) setName(suggestion);
    if (step === 2 && !boardData) {
      // init board from parent or initial
      const pb = parentNode?.board || null;
      setBoardData(pb ? JSON.parse(JSON.stringify(pb)) : JSON.parse(JSON.stringify(INITIAL_BOARD)));
    }
    if (step < STEPS.length - 1) { setStep(s => s + 1); return; }
    // finalize
    const finalName = name.trim() || suggestion;
    const newNode = {
      id: newId(),
      label: finalName,
      status,
      approachType: approach,
      parentId: parentNodeId,
      board: boardData,
      stamps,
      memo,
      childIds: [],
    };
    onComplete(newNode);
    setDone(true);
  };

  const handleBack = () => {
    if (step === 0) { onCancel(); return; }
    setStep(s => s - 1);
  };

  const pct = ((step + 1) / STEPS.length) * 100;

  if (done) {
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#faf4e8' }}>
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px 24px',gap:16,textAlign:'center'}}>
          <div style={{
            width:56,height:56,borderRadius:'50%',
            background:'#f0e8d4',border:'1.5px solid #a07840',
            display:'flex',alignItems:'center',justifyContent:'center',fontSize:26,
          }}>
            <i className="ti ti-check" style={{color:'#a07840'}}/>
          </div>
          <div style={{fontFamily:"'Shippori Mincho B1',serif",fontSize:16,color:'#1a0f00',letterSpacing:'0.15em'}}>
            ノードを作成しました
          </div>
          <div style={{fontSize:12,color:'rgba(26,15,0,0.5)',lineHeight:1.7}}>
            「{parentNode?.label}」からの<br/>分岐がツリーに追加されました
          </div>
          <div style={{
            width:'100%',border:'0.5px solid #a07840',borderRadius:10,
            padding:'12px 14px',background:'#f0e8d4',textAlign:'left',
          }}>
            <div style={{fontSize:10,color:'#a07840',marginBottom:3}}>新しいノード</div>
            <div style={{fontSize:15,fontWeight:600,color:'#1a0f00',marginBottom:8,fontFamily:"'Shippori Mincho B1',serif"}}>
              {name.trim() || suggestion}
            </div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              <span style={{fontSize:10,padding:'2px 7px',borderRadius:8,background:'#fadbd8',color:'#7B3010',fontFamily:"'Noto Serif JP',serif"}}>{approach}</span>
              <StatusChip status={status} style={{fontSize:10}}/>
            </div>
          </div>
          <div style={{display:'flex',gap:8,width:'100%'}}>
            <button onClick={onCancel} style={{
              flex:1,padding:10,borderRadius:10,fontSize:12,cursor:'pointer',
              background:'#faf4e8',color:'rgba(26,15,0,0.5)',
              border:'0.5px solid rgba(26,15,0,0.18)',fontFamily:"'Noto Serif JP',serif",
            }}>ツリーに戻る</button>
            <button onClick={onCancel} style={{
              flex:2,padding:10,borderRadius:10,fontSize:13,cursor:'pointer',
              background:'#a07840',color:'#faf4e8',border:'none',
              fontFamily:"'Noto Serif JP',serif",fontWeight:600,
            }}>ノードを開く</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#faf4e8' }}>

      {/* topbar */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'4px 14px 10px',borderBottom:'0.5px solid rgba(26,15,0,0.18)'}}>
        <button onClick={handleBack} style={{background:'none',border:'none',cursor:'pointer',color:'#a07840',fontSize:18,padding:2,lineHeight:1}}>
          <i className="ti ti-chevron-left"/>
        </button>
        <div style={{flex:1,fontSize:14,fontWeight:600,color:'#1a0f00',textAlign:'center'}}>
          {['分岐を追加','候補を選ぶ','盤面を確認','メモを追加'][step]}
        </div>
        <button onClick={onCancel} style={{background:'none',border:'none',cursor:'pointer',fontSize:12,color:'rgba(26,15,0,0.5)',fontFamily:"'Noto Serif JP',serif"}}>
          キャンセル
        </button>
      </div>

      {/* progress */}
      <div style={{padding:'10px 20px 0'}}>
        <div style={{height:3,background:'rgba(26,15,0,0.08)',borderRadius:2,overflow:'hidden'}}>
          <div style={{height:'100%',background:'#a07840',borderRadius:2,width:`${pct}%`,transition:'width 0.35s'}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',marginTop:5,padding:'0 2px'}}>
          {STEPS.map((lbl,i) => (
            <span key={i} style={{fontSize:9,color: i===step ? '#a07840' : '#B4B2A9',fontWeight: i===step ? 600 : 400}}>
              {lbl}
            </span>
          ))}
        </div>
      </div>

      {/* context */}
      <div style={{display:'flex',alignItems:'center',gap:6,padding:'10px 16px 6px',borderBottom:'0.5px solid rgba(26,15,0,0.08)'}}>
        <span style={{fontSize:10,color:'rgba(26,15,0,0.5)'}}>分岐元：</span>
        <span style={{fontSize:11,color:'#1a0f00',fontWeight:600}}>{parentNode?.label}</span>
        <i className="ti ti-arrow-right" style={{fontSize:10,color:'#B4B2A9'}}/>
        <span style={{fontSize:11,color:'#a07840'}}>{displayName}</span>
      </div>

      {/* step body */}
      <div style={{flex:1,overflowY:'auto'}}>

        {/* STEP 0: 切り口 */}
        {step === 0 && (
          <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:8}}>
            <div style={{fontSize:11,color:'rgba(26,15,0,0.5)',marginBottom:4}}>どの切り口で分岐しますか？</div>
            {APPROACHES.map(a => (
              <div key={a.key} onClick={() => setApproach(a.key)} style={{
                display:'flex',alignItems:'center',gap:12,
                padding:'13px 14px',borderRadius:10,cursor:'pointer',
                border: approach===a.key ? '0.5px solid #a07840' : '0.5px solid rgba(26,15,0,0.18)',
                background: approach===a.key ? '#f0e8d4' : '#faf4e8',
                boxShadow: approach===a.key ? '0 0 0 1.5px #a07840' : 'none',
                transition:'all 0.15s',
              }}>
                <div style={{
                  width:36,height:36,borderRadius:'50%',background:a.bg,flexShrink:0,
                  display:'flex',alignItems:'center',justifyContent:'center',
                }}>
                  <i className={`ti ${a.icon}`} style={{fontSize:18,color:a.iconColor}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#1a0f00',marginBottom:2}}>{a.title}</div>
                  <div style={{fontSize:10,color:'rgba(26,15,0,0.5)',lineHeight:1.4,whiteSpace:'pre-line'}}>{a.sub}</div>
                </div>
                <i className="ti ti-check" style={{fontSize:16,color:'#a07840',opacity: approach===a.key ? 1 : 0,transition:'opacity 0.15s'}}/>
              </div>
            ))}
          </div>
        )}

        {/* STEP 1: 候補 */}
        {step === 1 && approach && (
          <div>
            <div style={{fontSize:11,color:'rgba(26,15,0,0.5)',padding:'14px 16px 8px'}}>
              {approach === '相手の戦法' ? '相手の戦法から選ぶ' : approach === '自分の志向' ? '志向から選ぶ' : '局面の状況から選ぶ'}
            </div>
            <div style={{display:'flex',flexWrap:'wrap',gap:7,padding:'0 16px 12px'}}>
              {(SUGGESTIONS[approach]||[]).map(s => (
                <div key={s} onClick={() => { setSuggestion(s); setName(s); }} style={{
                  padding:'7px 12px',borderRadius:20,cursor:'pointer',
                  border: suggestion===s ? '0.5px solid #a07840' : '0.5px solid rgba(26,15,0,0.18)',
                  fontSize:12,color:'#1a0f00',
                  background: suggestion===s ? '#f0e8d4' : '#faf4e8',
                  fontWeight: suggestion===s ? 600 : 400,
                  fontFamily:"'Noto Serif JP',serif",
                  transition:'all 0.15s',
                }}>{s}</div>
              ))}
            </div>
            <div style={{padding:'0 16px 16px'}}>
              <div style={{fontSize:11,color:'rgba(26,15,0,0.5)',marginBottom:5}}>ノード名（自由入力）</div>
              <input
                value={name}
                onChange={e => { setName(e.target.value); setSuggestion(''); }}
                placeholder="例：▲４六銀型"
                style={{
                  width:'100%',border:'0.5px solid rgba(26,15,0,0.18)',borderRadius:8,
                  padding:'9px 12px',fontSize:13,color:'#1a0f00',
                  background:'#faf4e8',fontFamily:"'Noto Serif JP',serif",outline:'none',
                }}
                onFocus={e => e.target.style.borderColor='#a07840'}
                onBlur={e => e.target.style.borderColor='rgba(26,15,0,0.18)'}
              />
            </div>
          </div>
        )}

        {/* STEP 2: 盤面 */}
        {step === 2 && (
          <div style={{padding:'14px 16px'}}>
            {parentNode?.board && (
              <div style={{
                display:'flex',alignItems:'center',gap:6,padding:'6px 10px',
                borderRadius:8,background:'#d6eaf8',
                border:'0.5px solid rgba(26,82,118,0.2)',marginBottom:10,
                fontSize:11,color:'#1a5276',
              }}>
                <i className="ti ti-copy" style={{fontSize:13}}/>
                親ノード「{parentNode.label}」の盤面を引き継いでいます
              </div>
            )}
            <ShogiBoard
              board={boardData || (parentNode?.board || INITIAL_BOARD)}
              stamps={stamps}
              onChange={({ board, stamps: s }) => { setBoardData(board); setStamps(s); }}
            />
            <div style={{fontSize:10,color:'#B4B2A9',marginTop:6,textAlign:'center'}}>
              盤面は後から編集できます。スキップも可。
            </div>
          </div>
        )}

        {/* STEP 3: ステータス・メモ */}
        {step === 3 && (
          <div>
            <div style={{fontSize:11,color:'rgba(26,15,0,0.5)',padding:'14px 16px 8px'}}>ステータスを設定</div>
            <div style={{display:'flex',gap:6,padding:'0 16px 14px'}}>
              {['todo','wip','done'].map(s => (
                <StatusChip key={s} status={s} active={status===s} onClick={() => setStatus(s)}/>
              ))}
            </div>
            <div style={{height:'0.5px',background:'rgba(26,15,0,0.08)'}}/>
            <div style={{fontSize:11,color:'rgba(26,15,0,0.5)',padding:'12px 16px 6px'}}>メモ（任意）</div>
            <div style={{padding:'0 16px 16px'}}>
              <textarea
                value={memo}
                onChange={e => setMemo(e.target.value)}
                placeholder="気づき・方針・手順のポイントなど"
                rows={4}
                style={{
                  width:'100%',border:'0.5px solid rgba(26,15,0,0.18)',borderRadius:8,
                  padding:'10px 12px',fontSize:12,color:'#1a0f00',
                  background:'#faf4e8',resize:'none',
                  fontFamily:"'Noto Serif JP',serif",lineHeight:1.7,outline:'none',
                }}
                onFocus={e => e.target.style.borderColor='#a07840'}
                onBlur={e => e.target.style.borderColor='rgba(26,15,0,0.18)'}
              />
            </div>
          </div>
        )}

      </div>

      {/* bottom nav */}
      <div style={{display:'flex',gap:8,padding:'12px 16px 20px',borderTop:'0.5px solid rgba(26,15,0,0.18)'}}>
        {step > 0 && (
          <button onClick={handleBack} style={{
            flex:1,padding:10,borderRadius:10,fontSize:13,cursor:'pointer',
            border:'0.5px solid rgba(26,15,0,0.18)',background:'#faf4e8',
            color:'rgba(26,15,0,0.5)',fontFamily:"'Noto Serif JP',serif",
          }}>前へ</button>
        )}
        <button onClick={handleNext} disabled={!canNext()} style={{
          flex: step > 0 ? 2 : 1, padding:10, borderRadius:10, fontSize:13,
          cursor: canNext() ? 'pointer' : 'default',
          border:'none',
          background: canNext() ? '#a07840' : '#B4B2A9',
          color:'#faf4e8', fontFamily:"'Noto Serif JP',serif", fontWeight:600,
          transition:'background 0.15s',
        }}>
          {step === STEPS.length - 1 ? '作成する' : step === 2 ? '次へ（スキップ可）' : '次へ'}
        </button>
      </div>
    </div>
  );
}
