import { useRef, useCallback, useState } from "react";
import Accordion from "../components/Accordion";
import { STATUS_META } from "../data/treeData";

const NODE_W = 110, NODE_H = 38;

const STATUS_NODE = {
  done: { fill:'#EAF3DE', stroke:'#3B6D11', text:'#27500A' },
  wip:  { fill:'#fadbd8', stroke:'#7B3010', text:'#7B3010' },
  todo: { fill:'#F1EFE8', stroke:'#B4B2A9', text:'#5F5E5A', dashed:true },
};

const APPROACH_LINE = {
  '自分の選択': '#1a5276',
  '相手の戦法': '#7B3010',
  '自分の志向': '#1a5276',
  '局面の状況': '#854F0B',
};

function layoutTree(nodes, rootId) {
  const positions = {};
  const edges = [];

  let yCounter = 0;
  function assign(id, depth) {
    const node = nodes[id];
    if (!node) return 0;
    const children = (node.childIds || []).filter(c => nodes[c]);
    if (children.length === 0) {
      positions[id] = { x: depth * (NODE_W + 40), y: yCounter * (NODE_H + 22) };
      yCounter++;
      return 1;
    }
    const start = yCounter;
    children.forEach(cid => assign(cid, depth + 1));
    const end = yCounter - 1;
    // BUG FIX ①: ノードが1つしかない場合 start===end で midY が正しく計算されない
    // → (start + end) / 2 はそのままでOKだが、yCounter が増えていないとき
    //   (子が全員 leaf でない場合など) end が start-1 になることがある。
    //   Math.max(start, end) で負の midY を防ぐ。
    const midY = ((start + Math.max(start, end)) / 2) * (NODE_H + 22);
    positions[id] = { x: depth * (NODE_W + 40), y: midY };
    return yCounter - start;
  }

  assign(rootId, 0);

  // BUG FIX ②: buildEdges で dashed フラグを計算しているが
  //   push 時に `dashed: false` とハードコードされており、
  //   dashed 変数が使われていない。正しく渡す。
  function buildEdges(id) {
    const node = nodes[id];
    if (!node) return;
    (node.childIds || []).forEach(cid => {
      const child = nodes[cid];
      if (!child) return;
      const fromPos = positions[id];
      const toPos   = positions[cid];
      if (!fromPos || !toPos) return; // BUG FIX ③: position が存在しない場合クラッシュ防止
      const lineColor = APPROACH_LINE[child.approachType] || '#7B3010';
      const dashed = child.approachType === '相手の戦法' || child.approachType === '局面の状況';
      edges.push({
        from: id, to: cid,
        x1: fromPos.x + NODE_W, y1: fromPos.y + NODE_H / 2,
        x2: toPos.x,            y2: toPos.y   + NODE_H / 2,
        color: lineColor,
        dashed,          // ← 修正: false ハードコードを削除
        isMerge: false,
      });
      buildEdges(cid);
    });
  }
  buildEdges(rootId);

  return { positions, edges };
}

export default function MindMap({ tree, onNodeSelect, onBack }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [canvasOffset, setCanvasOffset] = useState({ x: 20, y: 20 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(null);

  const { nodes } = tree;
  const { positions, edges } = layoutTree(nodes, 'root');

  const posValues = Object.values(positions);
  // BUG FIX ④: positions が空（ノードなし）のとき Math.max(...[]) = -Infinity になりクラッシュ
  const totalW = posValues.length ? Math.max(...posValues.map(p => p.x)) + NODE_W + 40 : NODE_W + 40;
  const totalH = posValues.length ? Math.max(...posValues.map(p => p.y)) + NODE_H + 40 : NODE_H + 40;

  const onMouseDown = useCallback((e) => {
    if (e.target.closest('.node-g')) return;
    setDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: canvasOffset.x, oy: canvasOffset.y };
  }, [canvasOffset]);

  const onMouseMove = useCallback((e) => {
    if (!dragging || !dragStart.current) return;
    setCanvasOffset({
      x: dragStart.current.ox + e.clientX - dragStart.current.mx,
      y: dragStart.current.oy + e.clientY - dragStart.current.my,
    });
  }, [dragging]);

  const onMouseUp = useCallback(() => { setDragging(false); }, []);

  const onTouchStart = useCallback((e) => {
    if (e.target.closest('.node-g')) return;
    const t = e.touches[0];
    dragStart.current = { mx: t.clientX, my: t.clientY, ox: canvasOffset.x, oy: canvasOffset.y };
  }, [canvasOffset]);

  const onTouchMove = useCallback((e) => {
    if (!dragStart.current) return;
    e.preventDefault();
    const t = e.touches[0];
    setCanvasOffset({
      x: dragStart.current.ox + t.clientX - dragStart.current.mx,
      y: dragStart.current.oy + t.clientY - dragStart.current.my,
    });
  }, []);

  const jumpTo = useCallback((nodeId) => {
    setDrawerOpen(false);
    const pos = positions[nodeId];
    if (!pos) return;
    setCanvasOffset({ x: 140 - pos.x - NODE_W / 2, y: 200 - pos.y - NODE_H / 2 });
  }, [positions]);

  const rootNode = nodes['root'];

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#faf4e8', position:'relative' }}>

      {/* topbar */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'4px 14px 10px',borderBottom:'0.5px solid rgba(26,15,0,0.18)'}}>
        <button onClick={onBack} style={{background:'none',border:'none',cursor:'pointer',color:'#a07840',fontSize:18,padding:2,lineHeight:1}}>
          <i className="ti ti-chevron-left"/>
        </button>
        <div style={{flex:1}}>
          <div style={{fontFamily:"'Shippori Mincho B1',serif",fontSize:14,color:'#1a0f00'}}>{tree.name}</div>
        </div>
        <div onClick={() => setDrawerOpen(true)} style={{display:'flex',flexDirection:'column',gap:3.5,cursor:'pointer',padding:'6px 4px'}}>
          {[0,1,2].map(i => <span key={i} style={{display:'block',width:3.5,height:3.5,borderRadius:'50%',background:'#a07840'}}/>)}
        </div>
      </div>

      {/* map area */}
      <div
        style={{ flex:1, overflow:'hidden', position:'relative', cursor: dragging ? 'grabbing' : 'grab', background:'#faf4e8' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={() => { dragStart.current = null; }}
      >
        <div style={{ position:'absolute', left: canvasOffset.x, top: canvasOffset.y, transition: dragging ? 'none' : 'left 0.35s, top 0.35s' }}>
          <svg width={totalW} height={totalH} style={{overflow:'visible'}}>
            <defs>
              {['#1a5276','#7B3010','#854F0B','#6B3FA0'].map((color, i) => (
                <marker key={i} id={`arr${i}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="4" markerHeight="4" orient="auto">
                  <path d="M1 1.5L6.5 4L1 6.5" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </marker>
              ))}
              <marker id="arrMerge" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="4" markerHeight="4" orient="auto">
                <path d="M1 1.5L6.5 4L1 6.5" fill="none" stroke="#6B3FA0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </marker>
            </defs>

            {/* edges */}
            {edges.map((e, i) => {
              const mid = (e.x1 + e.x2) / 2;
              const d = `M${e.x1},${e.y1} C${mid},${e.y1} ${mid},${e.y2} ${e.x2},${e.y2}`;
              const mIdx = e.color === '#1a5276' ? 0 : e.color === '#7B3010' ? 1 : e.color === '#854F0B' ? 2 : 3;
              return (
                <path key={i} d={d} fill="none" stroke={e.color} strokeWidth={1.2}
                  strokeDasharray={e.dashed ? '5 2.5' : 'none'}
                  markerEnd={`url(#arr${mIdx})`}/>
              );
            })}

            {/* nodes */}
            {Object.entries(positions).map(([id, pos]) => {
              const node = nodes[id];
              if (!node) return null;
              const s = STATUS_NODE[node.status] || STATUS_NODE.todo;
              const isRoot = id === 'root';
              return (
                <g key={id} className="node-g" onClick={() => onNodeSelect(id)} style={{ cursor:'pointer' }}>
                  <rect
                    x={pos.x} y={pos.y} width={NODE_W} height={NODE_H} rx={isRoot ? 9 : 6}
                    fill={isRoot ? '#f0e8d4' : s.fill}
                    stroke={node.isMergeTarget ? '#6B3FA0' : (isRoot ? '#a07840' : s.stroke)}
                    strokeWidth={isRoot ? 1.5 : node.isMergeTarget ? 1.5 : 0.9}
                    strokeDasharray={s.dashed ? '5 2.5' : 'none'}
                  />
                  {!isRoot && node.status !== 'todo' && (
                    <circle cx={pos.x + NODE_W - 8} cy={pos.y + 7} r={3.5}
                      fill={STATUS_META[node.status]?.dot || '#B4B2A9'}/>
                  )}
                  <text
                    x={pos.x + NODE_W / 2} y={pos.y + (isRoot ? NODE_H / 2 - 5 : NODE_H / 2)}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={isRoot ? 14 : 11} fontWeight={isRoot ? 600 : 500}
                    fill={isRoot ? '#3d2000' : s.text}
                    fontFamily="'Noto Serif JP',serif"
                  >{node.label}</text>
                  {isRoot && (
                    <text x={pos.x + NODE_W / 2} y={pos.y + NODE_H / 2 + 10}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={9} fill="#a07840" fontFamily="'Noto Serif JP',serif"
                    >おおもとの戦法</text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* FAB */}
        <button
          onClick={() => onNodeSelect('new')}
          style={{
            position:'absolute', bottom:14, right:14, width:42, height:42,
            borderRadius:'50%', background:'#a07840', border:'none', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
            color:'#faf4e8', fontSize:20, zIndex:5,
          }}
          aria-label="ノードを追加"
        >
          <i className="ti ti-plus"/>
        </button>

        {/* drawer overlay */}
        {drawerOpen && (
          <div onClick={() => setDrawerOpen(false)}
            style={{ position:'absolute', inset:0, background:'rgba(26,15,0,0.38)', zIndex:20 }}/>
        )}

        {/* drawer */}
        <div style={{
          position:'absolute', top:0, right:0, bottom:0, width:235,
          background:'#faf4e8', borderLeft:'0.5px solid rgba(26,15,0,0.18)',
          transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
          transition:'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          zIndex:21, display:'flex', flexDirection:'column',
        }}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
            padding:'14px 14px 10px',borderBottom:'0.5px solid rgba(26,15,0,0.18)',flexShrink:0}}>
            <span style={{fontFamily:"'Shippori Mincho B1',serif",fontSize:14,color:'#1a0f00',letterSpacing:'0.2em'}}>目次</span>
            <button onClick={() => setDrawerOpen(false)} style={{background:'none',border:'none',cursor:'pointer',color:'#a07840',fontSize:16}}>
              <i className="ti ti-x"/>
            </button>
          </div>
          <div style={{flex:1,overflowY:'auto'}}>
            <Accordion nodes={nodes} rootChildIds={rootNode?.childIds || []} onSelect={jumpTo}/>
          </div>
        </div>
      </div>

      {/* legend */}
      <div style={{display:'flex',gap:10,flexWrap:'wrap',padding:'8px 16px',borderTop:'0.5px solid rgba(26,15,0,0.18)',background:'#f0e8d4'}}>
        {[
          { line: '#1a5276', label:'自分の手' },
          { line: '#7B3010', label:'相手の手' },
        ].map(l => (
          <div key={l.label} style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:'rgba(26,15,0,0.5)'}}>
            <div style={{width:18,height:2,borderRadius:1,background:l.line}}/>{l.label}
          </div>
        ))}
        {[
          { color:'#3B6D11', label:'完成' },
          { color:'#854F0B', label:'研究中' },
          { color:'#B4B2A9', label:'未定', dashed:true },
        ].map(s => (
          <div key={s.label} style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:'rgba(26,15,0,0.5)'}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:s.color,border: s.dashed ? '1px dashed #888':undefined}}/>{s.label}
          </div>
        ))}
      </div>
    </div>
  );
}
