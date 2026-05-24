import { STATUS_META, APPROACH_META } from "../data/treeData";

export function StatusChip({ status, active, onClick, style = {} }) {
  const m = STATUS_META[status] || STATUS_META.todo;
  return (
    <span onClick={onClick} style={{
      display:'inline-flex', alignItems:'center', gap:4,
      fontSize:11, padding:'4px 10px', borderRadius:12, cursor: onClick ? 'pointer' : 'default',
      background: m.bg, color: m.color,
      border: m.dashed ? `0.5px dashed ${m.dot}` : `0.5px solid ${m.color}33`,
      boxShadow: active ? `0 0 0 2px ${m.color}` : 'none',
      fontFamily:"'Noto Serif JP',serif",
      transition:'box-shadow 0.15s',
      ...style,
    }}>
      <span style={{
        width:6,height:6,borderRadius:'50%',flexShrink:0,
        background: m.dashed ? 'transparent' : m.dot,
        border: m.dashed ? `1px dashed ${m.dot}` : 'none',
      }}/>
      {m.label}
    </span>
  );
}

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

export function Divider({ style = {} }) {
  return <div style={{ height:'0.5px', background:'rgba(26,15,0,0.08)', ...style }} />;
}

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
