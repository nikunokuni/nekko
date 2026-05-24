import { useState } from "react";
import { STATUS_META } from "../data/treeData";

function TreeCard({ tree, onOpen }) {
  const nodeCount = tree.node_count || 0;
  return (
    <div onClick={() => onOpen(tree.id)} style={{
      padding:"14px 16px", borderRadius:12,
      border:"0.5px solid rgba(200,169,110,0.35)",
      background: tree.active ? "#f5edd8" : "#f0e8d4",
      cursor:"pointer", transition:"all 0.15s", marginBottom:10,
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor="#a07840"}
      onMouseLeave={e => e.currentTarget.style.borderColor="rgba(200,169,110,0.35)"}
    >
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <span style={{ fontSize:15, fontWeight:600, color:"#1a0f00", fontFamily:"'Shippori Mincho B1',serif", flex:1 }}>{tree.name}</span>
        <span style={{
          fontSize:10, padding:"3px 9px", borderRadius:10,
          background: tree.active ? "#d6eaf8" : "#e8dcc4",
          color: tree.active ? "#1a5276" : "#7a5c2e",
          border:`0.5px solid ${tree.active ? "rgba(26,82,118,0.2)" : "rgba(160,120,64,0.3)"}`,
          fontFamily:"'Noto Serif JP',serif",
        }}>{tree.active ? "使用中" : "休止中"}</span>
        {tree.is_public && (
          <span style={{ fontSize:10, padding:"3px 8px", borderRadius:10, background:"#EAF3DE", color:"#3B6D11", fontFamily:"'Noto Serif JP',serif" }}>公開中</span>
        )}
      </div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        {(tree.tags||[]).map(t => (
          <span key={t} style={{ fontSize:10, padding:"2px 7px", borderRadius:8, background:"rgba(26,15,0,0.06)", color:"rgba(26,15,0,0.5)", fontFamily:"'Noto Serif JP',serif" }}>{t}</span>
        ))}
        <span style={{fontSize:10,color:"rgba(26,15,0,0.3)",marginLeft:"auto"}}>
          {new Date(tree.updated_at).toLocaleDateString("ja-JP")}
        </span>
      </div>
    </div>
  );
}

export default function TreeList({ trees, profile, onOpen, onPublic, onNewTree, onSignOut }) {
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTags, setNewTags] = useState("");

  const active   = trees.filter(t => t.active);
  const inactive = trees.filter(t => !t.active);

  const handleCreate = () => {
    if (!newName.trim()) return;
    const tags = newTags.split(/[,、\s]+/).map(s=>s.trim()).filter(Boolean);
    onNewTree(newName.trim(), tags);
    setNewName(""); setNewTags(""); setShowNewModal(false);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"#faf4e8" }}>
      {/* header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 18px 12px", borderBottom:"0.5px solid rgba(26,15,0,0.12)" }}>
        <div>
          <div style={{ fontFamily:"'Shippori Mincho B1',serif", fontSize:22, color:"#1a0f00", letterSpacing:"0.2em" }}>
            ね<span style={{color:"#a07840"}}>っ</span>こ
          </div>
          {profile && (
            <div style={{ fontSize:11, color:"rgba(26,15,0,0.4)", marginTop:2 }}>
              {profile.display_name || profile.username}
            </div>
          )}
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <button onClick={onPublic} style={{ background:"none", border:"none", cursor:"pointer", color:"#a07840", fontSize:20, padding:2 }}>
            <i className="ti ti-world"/>
          </button>
          <button onClick={() => setShowNewModal(true)} style={{
            background:"#a07840", border:"none", cursor:"pointer",
            color:"#faf4e8", fontSize:13, padding:"6px 14px",
            borderRadius:10, fontFamily:"'Noto Serif JP',serif",
            display:"flex", alignItems:"center", gap:4,
          }}>
            <i className="ti ti-plus" style={{fontSize:13}}/> 新規
          </button>
          <button onClick={onSignOut} style={{ background:"none", border:"none", cursor:"pointer", color:"rgba(26,15,0,0.3)", fontSize:18, padding:2 }}>
            <i className="ti ti-logout"/>
          </button>
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"14px 16px" }}>
        {trees.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:"rgba(26,15,0,0.3)", fontSize:13 }}>
            <i className="ti ti-plant" style={{fontSize:40,display:"block",marginBottom:12}}/>
            ツリーがまだありません<br/>
            <span style={{fontSize:11}}>「新規」から最初のツリーを作りましょう</span>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <>
                <div style={{fontSize:10,color:"rgba(26,15,0,0.4)",letterSpacing:"0.1em",marginBottom:8}}>使用中</div>
                {active.map(t => <TreeCard key={t.id} tree={t} onOpen={onOpen}/>)}
              </>
            )}
            {inactive.length > 0 && (
              <>
                <div style={{fontSize:10,color:"rgba(26,15,0,0.4)",letterSpacing:"0.1em",marginBottom:8,marginTop:active.length>0?16:0}}>休止中</div>
                {inactive.map(t => <TreeCard key={t.id} tree={t} onOpen={onOpen}/>)}
              </>
            )}
          </>
        )}
      </div>

      {/* new tree modal */}
      {showNewModal && (
        <div style={{ position:"absolute", inset:0, background:"rgba(26,15,0,0.5)", display:"flex", alignItems:"flex-end", zIndex:50 }}
          onClick={() => setShowNewModal(false)}>
          <div style={{ width:"100%", background:"#faf4e8", borderRadius:"20px 20px 0 0", padding:"24px 20px 32px" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily:"'Shippori Mincho B1',serif", fontSize:16, color:"#1a0f00", marginBottom:20 }}>新しいツリーを作成</div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:"rgba(26,15,0,0.5)",marginBottom:5}}>戦法名</div>
              <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="例：中飛車"
                style={{ width:"100%", border:"0.5px solid rgba(26,15,0,0.2)", borderRadius:10, padding:"11px 14px", fontSize:14, color:"#1a0f00", background:"#fff8ee", fontFamily:"'Noto Serif JP',serif", outline:"none" }}
                onFocus={e=>e.target.style.borderColor="#a07840"} onBlur={e=>e.target.style.borderColor="rgba(26,15,0,0.2)"}
              />
            </div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,color:"rgba(26,15,0,0.5)",marginBottom:5}}>タグ（カンマ区切り）</div>
              <input value={newTags} onChange={e=>setNewTags(e.target.value)} placeholder="例：振り飛車, 中飛車"
                style={{ width:"100%", border:"0.5px solid rgba(26,15,0,0.2)", borderRadius:10, padding:"11px 14px", fontSize:14, color:"#1a0f00", background:"#fff8ee", fontFamily:"'Noto Serif JP',serif", outline:"none" }}
                onFocus={e=>e.target.style.borderColor="#a07840"} onBlur={e=>e.target.style.borderColor="rgba(26,15,0,0.2)"}
              />
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setShowNewModal(false)} style={{ flex:1, padding:12, borderRadius:12, border:"0.5px solid rgba(26,15,0,0.18)", background:"transparent", fontSize:13, cursor:"pointer", fontFamily:"'Noto Serif JP',serif", color:"rgba(26,15,0,0.5)" }}>キャンセル</button>
              <button onClick={handleCreate} disabled={!newName.trim()} style={{ flex:2, padding:12, borderRadius:12, border:"none", fontSize:13, fontWeight:600, cursor:newName.trim()?"pointer":"default", background:newName.trim()?"#a07840":"#B4B2A9", color:"#faf4e8", fontFamily:"'Noto Serif JP',serif" }}>作成する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
