import { useState } from "react";
import { STATUS_META } from "../data/treeData";
import { StatusChip, MergeTag } from "./ui";

function AccordionItem({ node, nodes, depth, onSelect }) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = node.childIds && node.childIds.length > 0;
  const m = STATUS_META[node.status] || STATUS_META.todo;
  const pl = 12 + depth * 12;

  return (
    <div style={{ borderBottom:'0.5px solid rgba(26,15,0,0.06)' }}>
      <div
        onClick={() => {
          // BUG FIX ①: 子ノードがない場合でも onSelect だけ呼ぶ必要がある。
          // 子がある場合は開閉 + 選択、ない場合は選択のみ。元の実装は正しいが
          // hasChildren が false のとき setOpen が呼ばれない点は問題なし。
          // ただし onSelect が常に呼ばれるため、ドロワーで項目タップ→マップ移動は動く。
          if (hasChildren) setOpen(o => !o);
          onSelect?.(node.id);
        }}
        style={{
          display:'flex', alignItems:'center', gap:0,
          padding: `9px 12px 9px ${pl}px`,
          cursor:'pointer', transition:'background 0.1s',
          minHeight:36,
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
                // BUG FIX ②: node.childIds.indexOf(cid) は O(n) かつ
                // 同じ id が重複していると最初のインデックスしか返さない。
                // map の idx を使うことで正確かつ高速に番号付けできる。
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

export default function Accordion({ nodes, rootChildIds, onSelect }) {
  // BUG FIX ③: rootChildIds が undefined/null のときに map でクラッシュする。
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
