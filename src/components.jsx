// ══════════════════════════════════════════════════
// components.jsx  ―  共通 UI パーツ
//   StatusChip / MergeTag /
//   Divider / BackBtn / DotMenu / Accordion
// ══════════════════════════════════════════════════
import { useState, useMemo } from "react";
import { STATUS_META } from "./data";
import { T } from "./theme";

// ── StatusChip ────────────────────────────────────
export function StatusChip({ status, active, onClick, style = {} }) {
  const m = STATUS_META[status] || STATUS_META.todo;
  return (
    <span onClick={onClick} style={{
      display:'inline-flex', alignItems:'center', gap:4,
      fontSize:T.fontSize.md, padding:'4px 10px', borderRadius:T.radius.lg,
      cursor: onClick ? 'pointer' : 'default',
      background: m.bg, color: m.color,
      border: m.dashed ? `0.5px dashed ${m.dot}` : `0.5px solid ${m.color}33`,
      boxShadow: active ? `0 0 0 2px ${m.color}` : 'none',
      fontFamily:T.fontSerif,
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

// ── MergeTag ──────────────────────────────────────
export function MergeTag() {
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:3,
      fontSize:T.fontSize.xs, padding:'1px 5px', borderRadius:T.radius.sm,
      background:'#ede0f8', color:T.purple,
      border:'0.5px solid rgba(107,63,160,0.3)',
      fontFamily:T.fontSerif,
    }}>
      <i className="ti ti-git-merge" style={{fontSize:"0.5rem"}}/>合流
    </span>
  );
}

// ── Divider ───────────────────────────────────────
export function Divider({ style = {} }) {
  return <div style={{ height:'0.5px', background:T.inkLineFaint, ...style }} />;
}

// ── BackBtn ───────────────────────────────────────
export function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{
      background:'none', border:'none', cursor:'pointer',
      color:T.gold, fontSize:"1.125rem", padding:'2px', lineHeight:1,
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
        <span key={i} style={{display:'block',width:3.5,height:3.5,borderRadius:'50%',background:T.gold}}/>
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
        onClick={() => onSelect?.(node.id)}
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
          background: node.isMergeTarget ? T.purple : (m.dashed ? 'transparent' : m.dot),
          border: m.dashed ? '0.5px dashed #B4B2A9' : 'none',
        }}/>
        <span style={{fontSize:T.fontSize.md,color:T.gold,marginRight:5,flexShrink:0}}>{node.num}</span>
        <span style={{fontSize:T.fontSize.base,color:T.ink,flex:1,lineHeight:1.35}}>{node.label}</span>
        {node.isMergeTarget && <MergeTag/>}
        <StatusChip status={node.status} style={{marginLeft:4}}/>
        {hasChildren && (
          <button
            onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
            style={{
              background:'none', border:'none', padding:'2px 4px',
              cursor:'pointer', display:'flex', alignItems:'center',
              marginLeft:4, borderRadius:4,
            }}
          >
            <i className="ti ti-chevron-down" style={{
              fontSize:T.fontSize.base, color:T.gold,
              transition:'transform 0.2s',
              transform: open ? 'rotate(180deg)' : 'none',
            }}/>
          </button>
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

// ══════════════════════════════════════════════════
// Confetti  ―  バッジ獲得時の紙吹雪演出
// ══════════════════════════════════════════════════
const CONFETTI_COLORS = [T.gold, T.blue, T.green, T.red, T.purple, T.brown];

export function Confetti({ count = 60 }) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => ({
    id:       i,
    left:     Math.random() * 100,
    delay:    Math.random() * 0.4,
    duration: 1.6 + Math.random() * 1.2,
    spin:     360 + Math.random() * 360,
    color:    CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    w:        4 + Math.random() * 5,
    h:        8 + Math.random() * 6,
  })), [count]);

  return (
    <div style={{ position:'fixed', inset:0, pointerEvents:'none', overflow:'hidden', zIndex:200 }}>
      <style>{`
        @keyframes nekko-confetti-fall {
          0%   { transform: translateY(-10vh) rotate(0deg);   opacity: 1; }
          100% { transform: translateY(110vh) rotate(var(--spin)); opacity: 0; }
        }
      `}</style>
      {pieces.map((p) => (
        <div key={p.id} style={{
          position:  'absolute',
          top:       0,
          left:      `${p.left}%`,
          width:     p.w,
          height:    p.h,
          borderRadius: 1,
          background: p.color,
          "--spin":  `${p.spin}deg`,
          animation: `nekko-confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
        }}/>
      ))}
    </div>
  );
}
