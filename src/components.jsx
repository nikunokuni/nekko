// ══════════════════════════════════════════════════
// components.jsx  ―  共通 UI パーツ
//   StatusChip / ApproachTag / MergeTag /
//   Divider / BackBtn / DotMenu / Accordion
// ══════════════════════════════════════════════════
import { useState } from "react";
import { STATUS_META, APPROACH_META } from "./data";

// ── StatusChip ────────────────────────────────────
export function StatusChip({ status, active, onClick, style = {} }) {
  const m = STATUS_META[status] || STATUS_META.todo;
  return (
    <span onClick={onClick} style={{
      display:'inline-flex', alignItems:'center', gap:4,
      fontSize:11, padding:'4px 10px', borderRadius:12,
      cursor: onClick ? 'pointer' : 'default',
      background: m.bg, color: m.color,
      border: m.dashed ? `0.5px dashed ${m.dot}` : `0.5px solid ${m.color}33`,
      boxShadow: active ? `0 0 0 2px ${m.color}` : 'none',
      fontFamily:"'Noto Serif JP',serif",
      transition:'box-shadow 0.15s',
      ...style,
    }}>
      <span style={{
        width:6, height:6, borderRadius:'50%', flexShrink:0,
        background: m.dashed ? 'transparent' : m.dot,
        border: m.dashed ? `1px dashed ${m.dot}` : 'none',
      }}/>
      {m.label}
    </span>
  );
}

// ── ApproachTag ───────────────────────────────────
export function ApproachTag({ type, style = {} }) {
  const m = APPROACH_META[type] || { bg:'#F1EFE8', color:'#5F5E5A' };
  return (
    <span style={{
      fontSize:9, padding:'2px 7px', borderRadius:10,
      background: m.bg, color: m.color,
      fontFamily:"'Noto Serif JP',serif",
      ...style,
    }}>{type}</span>
  );
}

// ── MergeTag ──────────────────────────────────────
export function MergeTag() {
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:3,
      fontSize:9, padding:'1px 5px', borderRadius:8,
      background:'#ede0f8', color:'#6B3FA0',
      border:'0.5px solid rgba(107,63,160,0.3)',
      fontFamily:"'Noto Serif JP',serif",
    }}>
      <i className="ti ti-git-merge" style={{fontSize:8}}/>合流
    </span>
  );
}

// ── Divider ───────────────────────────────────────
export function Divider({ style = {} }) {
  return <div style={{ height:'0.5px', background:'rgba(26,15,0,0.08)', ...style }} />;
}

// ── BackBtn ───────────────────────────────────────
export function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{
      background:'none', border:'none', cursor:'pointer',
      color:'#a07840', fontSize:18, padding:'2px', lineHeight:1,
    }}>
      <i className="ti ti-chevron-left"/>
    </button>
  );
}

// ── DotMenu ───────────────────────────────────────
export function DotMenu({ onClick }) {
  return (
    <div onClick={onClick} style={{
      display:'flex', flexDirection:'column', gap:3.5,
      cursor:'pointer', padding:'6px 4px',
    }}>
      {[0,1,2].map(i => (
        <span key={i} style={{display:'block',width:3.5,height:3.5,borderRadius:'50%',background:'#a07840'}}/>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════
// Accordion  ―  マップの目次ドロワー内ツリー表示
// ══════════════════════════════════════════════════
function AccordionItem({ node, nodes, depth, onSelect }) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = node.childIds && node.childIds.length > 0;
  const m = STATUS_META[node.status] || STATUS_META.todo;
  const pl = 12 + depth * 12;

  return (
    <div style={{ borderBottom:'0.5px solid rgba(26,15,0,0.06)' }}>
      <div
        onClick={() => {
          if (hasChildren) setOpen(o => !o);
          onSelect?.(node.id);
        }}
        style={{
          display:'flex', alignItems:'center', gap:0,
          padding:`9px 12px 9px ${pl}px`,
          cursor:'pointer', transition:'background 0.1s', minHeight:36,
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(160,120,64,0.07)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <div style={{
          width:2, minHeight:14, borderRadius:1, flexShrink:0, marginRight:7, alignSelf:'stretch',
          background: node.isMergeTarget ? '#6B3FA0' : (m.dashed ? 'transparent' : m.dot),
          border: m.dashed ? '0.5px dashed #B4B2A9' : 'none',
        }}/>
        <span style={{fontSize:11,color:'#a07840',marginRight:5,flexShrink:0}}>{node.num}</span>
        <span style={{fontSize:12,color:'#1a0f00',flex:1,lineHeight:1.35}}>{node.label}</span>
        {node.isMergeTarget && <MergeTag/>}
        <StatusChip status={node.status} style={{marginLeft:4}}/>
        {hasChildren && (
          <i className="ti ti-chevron-down" style={{
            fontSize:12, color:'#a07840', marginLeft:4,
            transition:'transform 0.2s',
            transform: open ? 'rotate(180deg)' : 'none',
          }}/>
        )}
      </div>

      {hasChildren && open && (
        <div>
          {node.childIds.map((cid, idx) => {
            const child = nodes[cid];
            if (!child) return null;
            return (
              <AccordionItem
                key={cid}
                node={{ ...child, num: (node.num || '') + '－' + (idx + 1) }}
                nodes={nodes}
                depth={depth + 1}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Accordion({ nodes, rootChildIds, onSelect }) {
  const safeIds = rootChildIds || [];
  return (
    <div>
      {safeIds.map((id, i) => {
        const node = nodes[id];
        if (!node) return null;
        return (
          <AccordionItem
            key={id}
            node={{ ...node, num: String(i + 1) }}
            nodes={nodes}
            depth={0}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}
