// ══════════════════════════════════════════════════
// screens.jsx  ―  全画面コンポーネント
//   AuthScreen / TreeList / MindMap /
//   NodeDetail / NewNode / PublicTrees
// ══════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from "react";
import ShogiBoard from "./ShogiBoard";
import {
  StatusChip, ApproachTag, MergeTag, Divider, BackBtn, Accordion,
} from "./components";
import {
  STATUS_META, APPROACH_META, INITIAL_BOARD, SUGGESTIONS,
} from "./data";
import { signIn, signUp } from "./db";

// ══════════════════════════════════════════════════
// AuthScreen
// ══════════════════════════════════════════════════
export function AuthScreen({ onAuth }) {
  const [mode,        setMode]        = useState("login");
  const [username,    setUsername]    = useState("");
  const [password,    setPassword]    = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) { setError("IDとパスワードを入力してください"); return; }
    setLoading(true);

    if (mode === "login") {
      const { data, error: err } = await signIn({ email: username, password });
      if (err) {
        setError(err.message === "Invalid login credentials" ? "IDまたはパスワードが違います" : err.message);
        setLoading(false); return;
      }
      onAuth(data.user, data.session);
    } else {
      const { error: err } = await signUp({ username: username.trim(), password, displayName: displayName.trim() || username.trim() });
      if (err) { setError(err.message); setLoading(false); return; }
      const { data: loginData, error: loginErr } = await signIn({ email: username, password });
      if (loginErr) { setError("自動ログインに失敗しました。ログイン画面からお試しください。"); setMode("login"); }
      else onAuth(loginData.user, loginData.session);
    }
    setLoading(false);
  };

  const field = (label, value, setter, type = "text", placeholder = "", nameAttr = "") => (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:11, color:"rgba(26,15,0,0.5)", marginBottom:5, fontFamily:"'Noto Serif JP',serif" }}>{label}</div>
      <input
        type={type} value={value} name={nameAttr}
        onChange={e => setter(e.target.value)}
        placeholder={placeholder} required
        autoComplete={type === "password" ? "current-password" : "username"}
        style={{
          width:"100%", border:"0.5px solid rgba(26,15,0,0.2)", borderRadius:10,
          padding:"11px 14px", fontSize:14, color:"#1a0f00",
          background:"#fff8ee", fontFamily:"'Noto Serif JP',serif", outline:"none",
        }}
        onFocus={e => e.target.style.borderColor="#a07840"}
        onBlur={e  => e.target.style.borderColor="rgba(26,15,0,0.2)"}
      />
    </div>
  );

  return (
    <div style={{
      minHeight:"100dvh", background:"#0d0800",
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      padding:"24px 20px", fontFamily:"'Noto Serif JP',serif",
    }}>
      <div style={{ textAlign:"center", marginBottom:40 }}>
        <div style={{ fontFamily:"'Shippori Mincho B1',serif", fontSize:42, color:"#e8d4a8", letterSpacing:"0.4em", marginBottom:6 }}>
          ね<span style={{color:"#c8a96e"}}>っ</span>こ
        </div>
        <div style={{ fontSize:12, color:"rgba(200,169,110,0.45)", letterSpacing:"0.2em" }}>将棋研究ノート</div>
      </div>

      <form onSubmit={handleSubmit} style={{
        width:"100%", maxWidth:400,
        background:"#faf4e8", borderRadius:20,
        padding:"32px 28px",
        boxShadow:"0 24px 60px rgba(0,0,0,0.6)",
        border:"0.5px solid rgba(200,169,110,0.3)",
      }}>
        <div style={{ display:"flex", gap:0, marginBottom:28, borderBottom:"0.5px solid rgba(26,15,0,0.12)" }}>
          {[["login","ログイン"],["signup","新規登録"]].map(([m,lbl]) => (
            <div key={m} onClick={() => { setMode(m); setError(""); }} style={{
              flex:1, textAlign:"center", padding:"10px 0", fontSize:13, cursor:"pointer",
              color: mode===m ? "#1a0f00" : "rgba(26,15,0,0.4)",
              fontWeight: mode===m ? 600 : 400,
              borderBottom: mode===m ? "2px solid #a07840" : "2px solid transparent",
              marginBottom:-1, transition:"all 0.15s",
            }}>{lbl}</div>
          ))}
        </div>

        {field("ID（ログイン用ユーザー名）", username, setUsername, "text", "例: tsuruga_7dan", "username")}
        {mode === "signup" && field("表示名", displayName, setDisplayName, "text", "例: 鶴賀 七段", "nickname")}
        {field("パスワード", password, setPassword, "password", "8文字以上", "password")}

        {error && (
          <div style={{
            fontSize:12, color:"#A93226", background:"#fdedec",
            border:"0.5px solid rgba(169,50,38,0.3)",
            borderRadius:8, padding:"8px 12px", marginBottom:14,
          }}>{error}</div>
        )}

        <button type="submit" disabled={loading || !username || !password} style={{
          width:"100%", padding:"13px", borderRadius:12, border:"none",
          fontSize:14, fontWeight:600,
          cursor: loading || !username || !password ? "default" : "pointer",
          background: loading || !username || !password ? "#B4B2A9" : "#a07840",
          color:"#faf4e8", fontFamily:"'Noto Serif JP',serif",
        }}>
          {loading ? "処理中..." : mode==="login" ? "ログイン" : "アカウントを作成"}
        </button>
      </form>

      <div style={{ marginTop:20, fontSize:11, color:"rgba(200,169,110,0.25)", textAlign:"center" }}>
        Powered by Supabase
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// TreeList
// ══════════════════════════════════════════════════
function TreeCard({ tree, onOpen, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleMenuToggle = (e) => {
    e.stopPropagation();
    setMenuOpen(v => !v);
  };
  const handleEdit = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    onEdit(tree);
  };
  const handleDelete = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    onDelete(tree);
  };

  return (
    <div style={{ position:"relative", marginBottom:10 }}>
      <div onClick={() => onOpen(tree.id)} style={{
        padding:"14px 16px", borderRadius:12,
        border:"0.5px solid rgba(200,169,110,0.35)",
        background: tree.active ? "#f5edd8" : "#f0e8d4",
        cursor:"pointer", transition:"all 0.15s",
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
          <button onClick={handleMenuToggle} style={{
            background:"none", border:"none", cursor:"pointer",
            color:"rgba(26,15,0,0.35)", fontSize:16, padding:"2px 4px",
            borderRadius:6, lineHeight:1,
          }}>
            <i className="ti ti-dots-vertical"/>
          </button>
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

      {menuOpen && (
        <>
          <div style={{ position:"fixed", inset:0, zIndex:40 }} onClick={() => setMenuOpen(false)}/>
          <div style={{
            position:"absolute", top:10, right:0, zIndex:50,
            background:"#faf4e8", borderRadius:10,
            border:"0.5px solid rgba(200,169,110,0.5)",
            boxShadow:"0 6px 24px rgba(26,15,0,0.15)",
            overflow:"hidden", minWidth:140,
          }}>
            <div onClick={handleEdit} style={{
              display:"flex", alignItems:"center", gap:8,
              padding:"11px 16px", fontSize:13, cursor:"pointer",
              color:"#1a0f00", fontFamily:"'Noto Serif JP',serif",
            }}
              onMouseEnter={e => e.currentTarget.style.background="#f0e8d4"}
              onMouseLeave={e => e.currentTarget.style.background="transparent"}
            >
              <i className="ti ti-pencil" style={{fontSize:14, color:"#a07840"}}/>編集
            </div>
            <div style={{height:"0.5px", background:"rgba(26,15,0,0.08)"}}/>
            <div onClick={handleDelete} style={{
              display:"flex", alignItems:"center", gap:8,
              padding:"11px 16px", fontSize:13, cursor:"pointer",
              color:"#A93226", fontFamily:"'Noto Serif JP',serif",
            }}
              onMouseEnter={e => e.currentTarget.style.background="#fdedec"}
              onMouseLeave={e => e.currentTarget.style.background="transparent"}
            >
              <i className="ti ti-trash" style={{fontSize:14}}/>削除
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function TreeList({ trees, profile, onOpen, onPublic, onNewTree, onSignOut, onDeleteTree, onEditTree }) {
  const [showModal,    setShowModal]    = useState(false);
  const [newName,      setNewName]      = useState("");
  const [newTags,      setNewTags]      = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting,     setDeleting]     = useState(false);
  const [editTarget,   setEditTarget]   = useState(null);
  const [editName,     setEditName]     = useState("");
  const [editTags,     setEditTags]     = useState("");
  const [editActive,   setEditActive]   = useState(true);
  const [saving,       setSaving]       = useState(false);

  const active   = trees.filter(t =>  t.active);
  const inactive = trees.filter(t => !t.active);

  const handleCreate = () => {
    if (!newName.trim()) return;
    const tags = newTags.split(/[,、\s]+/).map(s=>s.trim()).filter(Boolean);
    onNewTree(newName.trim(), tags);
    setNewName(""); setNewTags(""); setShowModal(false);
  };

  const openEdit = (tree) => {
    setEditTarget(tree);
    setEditName(tree.name);
    setEditTags((tree.tags||[]).join("、"));
    setEditActive(tree.active);
  };
  const handleEditSave = async () => {
    if (!editName.trim() || !editTarget) return;
    setSaving(true);
    const tags = editTags.split(/[,、\s]+/).map(s=>s.trim()).filter(Boolean);
    await onEditTree(editTarget.id, { name: editName.trim(), tags, active: editActive });
    setSaving(false);
    setEditTarget(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await onDeleteTree(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
  };

  const inputStyle = { width:"100%", border:"0.5px solid rgba(26,15,0,0.2)", borderRadius:10, padding:"11px 14px", fontSize:14, color:"#1a0f00", background:"#fff8ee", fontFamily:"'Noto Serif JP',serif", outline:"none" };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"#faf4e8" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 18px 12px", borderBottom:"0.5px solid rgba(26,15,0,0.12)" }}>
        <div>
          <div style={{ fontFamily:"'Shippori Mincho B1',serif", fontSize:22, color:"#1a0f00", letterSpacing:"0.2em" }}>
            ね<span style={{color:"#a07840"}}>っ</span>こ
          </div>
          {profile && <div style={{ fontSize:11, color:"rgba(26,15,0,0.4)", marginTop:2 }}>{profile.display_name || profile.username}</div>}
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <button onClick={onPublic} style={{ background:"none", border:"none", cursor:"pointer", color:"#a07840", fontSize:20, padding:2 }}>
            <i className="ti ti-world"/>
          </button>
          <button onClick={() => setShowModal(true)} style={{
            background:"#a07840", border:"none", cursor:"pointer",
            color:"#faf4e8", fontSize:13, padding:"6px 14px", borderRadius:10,
            fontFamily:"'Noto Serif JP',serif", display:"flex", alignItems:"center", gap:4,
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
            {active.length > 0 && <>
              <div style={{fontSize:10,color:"rgba(26,15,0,0.4)",letterSpacing:"0.1em",marginBottom:8}}>使用中</div>
              {active.map(t => <TreeCard key={t.id} tree={t} onOpen={onOpen} onEdit={openEdit} onDelete={setDeleteTarget}/>)}
            </>}
            {inactive.length > 0 && <>
              <div style={{fontSize:10,color:"rgba(26,15,0,0.4)",letterSpacing:"0.1em",marginBottom:8,marginTop:active.length>0?16:0}}>休止中</div>
              {inactive.map(t => <TreeCard key={t.id} tree={t} onOpen={onOpen} onEdit={openEdit} onDelete={setDeleteTarget}/>)}
            </>}
          </>
        )}
      </div>

      {/* 新規作成モーダル */}
      {showModal && (
        <div style={{ position:"absolute", inset:0, background:"rgba(26,15,0,0.5)", display:"flex", alignItems:"flex-end", zIndex:50 }}
          onClick={() => setShowModal(false)}>
          <div style={{ width:"100%", background:"#faf4e8", borderRadius:"20px 20px 0 0", padding:"24px 20px 32px" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily:"'Shippori Mincho B1',serif", fontSize:16, color:"#1a0f00", marginBottom:20 }}>新しいツリーを作成</div>
            {[["戦法名",newName,setNewName,"例：中飛車"],["タグ（カンマ区切り）",newTags,setNewTags,"例：振り飛車, 中飛車"]].map(([lbl,val,setter,ph]) => (
              <div key={lbl} style={{marginBottom:14}}>
                <div style={{fontSize:11,color:"rgba(26,15,0,0.5)",marginBottom:5}}>{lbl}</div>
                <input value={val} onChange={e=>setter(e.target.value)} placeholder={ph} style={inputStyle}
                  onFocus={e=>e.target.style.borderColor="#a07840"} onBlur={e=>e.target.style.borderColor="rgba(26,15,0,0.2)"}/>
              </div>
            ))}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setShowModal(false)} style={{ flex:1, padding:12, borderRadius:12, border:"0.5px solid rgba(26,15,0,0.18)", background:"transparent", fontSize:13, cursor:"pointer", fontFamily:"'Noto Serif JP',serif", color:"rgba(26,15,0,0.5)" }}>キャンセル</button>
              <button onClick={handleCreate} disabled={!newName.trim()} style={{ flex:2, padding:12, borderRadius:12, border:"none", fontSize:13, fontWeight:600, cursor:newName.trim()?"pointer":"default", background:newName.trim()?"#a07840":"#B4B2A9", color:"#faf4e8", fontFamily:"'Noto Serif JP',serif" }}>作成する</button>
            </div>
          </div>
        </div>
      )}

      {/* 編集モーダル */}
      {editTarget && (
        <div style={{ position:"absolute", inset:0, background:"rgba(26,15,0,0.5)", display:"flex", alignItems:"flex-end", zIndex:50 }}
          onClick={() => setEditTarget(null)}>
          <div style={{ width:"100%", background:"#faf4e8", borderRadius:"20px 20px 0 0", padding:"24px 20px 32px" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily:"'Shippori Mincho B1',serif", fontSize:16, color:"#1a0f00", marginBottom:20 }}>ツリーを編集</div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:"rgba(26,15,0,0.5)",marginBottom:5}}>戦法名</div>
              <input value={editName} onChange={e=>setEditName(e.target.value)} placeholder="例：中飛車" style={inputStyle}
                onFocus={e=>e.target.style.borderColor="#a07840"} onBlur={e=>e.target.style.borderColor="rgba(26,15,0,0.2)"}/>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:"rgba(26,15,0,0.5)",marginBottom:5}}>タグ（カンマ区切り）</div>
              <input value={editTags} onChange={e=>setEditTags(e.target.value)} placeholder="例：振り飛車, 中飛車" style={inputStyle}
                onFocus={e=>e.target.style.borderColor="#a07840"} onBlur={e=>e.target.style.borderColor="rgba(26,15,0,0.2)"}/>
            </div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,color:"rgba(26,15,0,0.5)",marginBottom:8}}>ステータス</div>
              <div style={{display:"flex",gap:8}}>
                {[["使用中",true],["休止中",false]].map(([lbl,val]) => (
                  <div key={lbl} onClick={()=>setEditActive(val)} style={{
                    flex:1, textAlign:"center", padding:"9px", borderRadius:10, cursor:"pointer",
                    fontSize:13, fontFamily:"'Noto Serif JP',serif", transition:"all 0.15s",
                    border: editActive===val ? "1.5px solid #a07840" : "0.5px solid rgba(26,15,0,0.18)",
                    background: editActive===val ? "#f5edd8" : "#faf4e8",
                    color: editActive===val ? "#a07840" : "rgba(26,15,0,0.5)",
                    fontWeight: editActive===val ? 600 : 400,
                  }}>{lbl}</div>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setEditTarget(null)} style={{ flex:1, padding:12, borderRadius:12, border:"0.5px solid rgba(26,15,0,0.18)", background:"transparent", fontSize:13, cursor:"pointer", fontFamily:"'Noto Serif JP',serif", color:"rgba(26,15,0,0.5)" }}>キャンセル</button>
              <button onClick={handleEditSave} disabled={!editName.trim()||saving} style={{ flex:2, padding:12, borderRadius:12, border:"none", fontSize:13, fontWeight:600, cursor:editName.trim()&&!saving?"pointer":"default", background:editName.trim()&&!saving?"#a07840":"#B4B2A9", color:"#faf4e8", fontFamily:"'Noto Serif JP',serif" }}>
                {saving ? "保存中..." : "保存する"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 削除確認モーダル */}
      {deleteTarget && (
        <div style={{ position:"absolute", inset:0, background:"rgba(26,15,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50, padding:"20px" }}
          onClick={() => setDeleteTarget(null)}>
          <div style={{ width:"100%", maxWidth:360, background:"#faf4e8", borderRadius:20, padding:"28px 24px" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:16 }}>
              <div style={{ width:48, height:48, borderRadius:24, background:"#fdedec", display:"flex", alignItems:"center", justifyContent:"center" }}>
                <i className="ti ti-trash" style={{ fontSize:22, color:"#A93226" }}/>
              </div>
            </div>
            <div style={{ fontFamily:"'Shippori Mincho B1',serif", fontSize:15, color:"#1a0f00", textAlign:"center", marginBottom:8 }}>
              「{deleteTarget.name}」を削除しますか？
            </div>
            <div style={{ fontSize:12, color:"rgba(26,15,0,0.45)", textAlign:"center", marginBottom:24, fontFamily:"'Noto Serif JP',serif", lineHeight:1.7 }}>
              ツリーと全ノードが完全に削除されます。<br/>この操作は取り消せません。
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setDeleteTarget(null)} style={{ flex:1, padding:12, borderRadius:12, border:"0.5px solid rgba(26,15,0,0.18)", background:"transparent", fontSize:13, cursor:"pointer", fontFamily:"'Noto Serif JP',serif", color:"rgba(26,15,0,0.5)" }}>キャンセル</button>
              <button onClick={handleDeleteConfirm} disabled={deleting} style={{ flex:2, padding:12, borderRadius:12, border:"none", fontSize:13, fontWeight:600, cursor:deleting?"default":"pointer", background:deleting?"#B4B2A9":"#A93226", color:"#faf4e8", fontFamily:"'Noto Serif JP',serif" }}>
                {deleting ? "削除中..." : "削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════
// MindMap
// ══════════════════════════════════════════════════
const NODE_W = 110, NODE_H = 38;

const STATUS_NODE = {
  done: { fill:'#EAF3DE', stroke:'#3B6D11', text:'#27500A' },
  wip:  { fill:'#fadbd8', stroke:'#7B3010', text:'#7B3010' },
  todo: { fill:'#F1EFE8', stroke:'#B4B2A9', text:'#5F5E5A', dashed:true },
};

const APPROACH_LINE = {
  '自分の選択':'#1a5276', '相手の戦法':'#7B3010',
  '自分の志向':'#1a5276', '局面の状況':'#854F0B',
};

function layoutTree(nodes, rootId) {
  const positions = {}, edges = [];
  let yCounter = 0;

  function assign(id, depth) {
    const node = nodes[id];
    if (!node) return 0;
    const children = (node.childIds || []).filter(c => nodes[c]);
    if (children.length === 0) {
      positions[id] = { x: depth*(NODE_W+40), y: yCounter*(NODE_H+22) };
      yCounter++; return 1;
    }
    const start = yCounter;
    children.forEach(cid => assign(cid, depth+1));
    const end = yCounter - 1;
    const midY = ((start + Math.max(start, end)) / 2) * (NODE_H+22);
    positions[id] = { x: depth*(NODE_W+40), y: midY };
    return yCounter - start;
  }
  assign(rootId, 0);

  function buildEdges(id) {
    const node = nodes[id];
    if (!node) return;
    (node.childIds || []).forEach(cid => {
      const child = nodes[cid];
      if (!child) return;
      const fromPos = positions[id], toPos = positions[cid];
      if (!fromPos || !toPos) return;
      const lineColor = APPROACH_LINE[child.approachType] || '#7B3010';
      const dashed = child.approachType === '相手の戦法' || child.approachType === '局面の状況';
      edges.push({
        from: id, to: cid,
        x1: fromPos.x+NODE_W, y1: fromPos.y+NODE_H/2,
        x2: toPos.x,          y2: toPos.y+NODE_H/2,
        color: lineColor, dashed, isMerge: false,
      });
      buildEdges(cid);
    });
  }
  buildEdges(rootId);
  return { positions, edges };
}

export function MindMap({ tree, onNodeSelect, onBack }) {
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [canvasOffset, setCanvasOffset] = useState({ x:20, y:20 });
  const [dragging,     setDragging]     = useState(false);
  const dragStart = useRef(null);
console.log('MindMap tree:', tree); 
  const { nodes } = tree;
  const rootId = tree.rootId ?? Object.values(nodes).find(n => n.isRoot)?.id ?? null;
  const { positions, edges } = rootId ? layoutTree(nodes, rootId) : { positions:{}, edges:[] };
  const posValues = Object.values(positions);
  const totalW = posValues.length ? Math.max(...posValues.map(p=>p.x))+NODE_W+40 : NODE_W+40;
  const totalH = posValues.length ? Math.max(...posValues.map(p=>p.y))+NODE_H+40 : NODE_H+40;

  const onMouseDown  = useCallback((e) => {
    if (e.target.closest('.node-g')) return;
    setDragging(true);
    dragStart.current = { mx:e.clientX, my:e.clientY, ox:canvasOffset.x, oy:canvasOffset.y };
  }, [canvasOffset]);
  const onMouseMove  = useCallback((e) => {
    if (!dragging || !dragStart.current) return;
    setCanvasOffset({ x: dragStart.current.ox+e.clientX-dragStart.current.mx, y: dragStart.current.oy+e.clientY-dragStart.current.my });
  }, [dragging]);
  const onMouseUp    = useCallback(() => setDragging(false), []);
  const onTouchStart = useCallback((e) => {
    if (e.target.closest('.node-g')) return;
    const t = e.touches[0];
    dragStart.current = { mx:t.clientX, my:t.clientY, ox:canvasOffset.x, oy:canvasOffset.y };
  }, [canvasOffset]);
  const onTouchMove  = useCallback((e) => {
    if (!dragStart.current) return;
    e.preventDefault();
    const t = e.touches[0];
    setCanvasOffset({ x: dragStart.current.ox+t.clientX-dragStart.current.mx, y: dragStart.current.oy+t.clientY-dragStart.current.my });
  }, []);

  const jumpTo = useCallback((nodeId) => {
    setDrawerOpen(false);
    const pos = positions[nodeId];
    if (!pos) return;
    setCanvasOffset({ x: 140-pos.x-NODE_W/2, y: 200-pos.y-NODE_H/2 });
  }, [positions]);

  const rootNode = rootId ? nodes[rootId] : null;

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

      {/* マップエリア */}
      <div style={{ flex:1, overflow:'hidden', position:'relative', cursor: dragging?'grabbing':'grab', background:'#faf4e8' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={() => { dragStart.current = null; }}
      >
        <div style={{ position:'absolute', left:canvasOffset.x, top:canvasOffset.y, transition: dragging?'none':'left 0.35s, top 0.35s' }}>
          <svg width={totalW} height={totalH} style={{overflow:'visible'}}>
            <defs>
              {['#1a5276','#7B3010','#854F0B','#6B3FA0'].map((color,i) => (
                <marker key={i} id={`arr${i}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="4" markerHeight="4" orient="auto">
                  <path d="M1 1.5L6.5 4L1 6.5" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </marker>
              ))}
            </defs>

            {edges.map((e,i) => {
              const mid = (e.x1+e.x2)/2;
              const d = `M${e.x1},${e.y1} C${mid},${e.y1} ${mid},${e.y2} ${e.x2},${e.y2}`;
              const mIdx = e.color==='#1a5276'?0 : e.color==='#7B3010'?1 : e.color==='#854F0B'?2 : 3;
              return <path key={i} d={d} fill="none" stroke={e.color} strokeWidth={1.2} strokeDasharray={e.dashed?'5 2.5':'none'} markerEnd={`url(#arr${mIdx})`}/>;
            })}

            {Object.entries(positions).map(([id,pos]) => {
              const node = nodes[id];
              if (!node) return null;
              const s = STATUS_NODE[node.status] || STATUS_NODE.todo;
              const isRoot = id === rootId;
              return (
                <g key={id} className="node-g" onClick={() => onNodeSelect(id)} style={{cursor:'pointer'}}>
                  <rect x={pos.x} y={pos.y} width={NODE_W} height={NODE_H} rx={isRoot?9:6}
                    fill={isRoot?'#f0e8d4':s.fill}
                    stroke={node.isMergeTarget?'#6B3FA0':(isRoot?'#a07840':s.stroke)}
                    strokeWidth={isRoot?1.5:node.isMergeTarget?1.5:0.9}
                    strokeDasharray={s.dashed?'5 2.5':'none'}/>
                  {!isRoot && node.status!=='todo' && (
                    <circle cx={pos.x+NODE_W-8} cy={pos.y+7} r={3.5} fill={STATUS_META[node.status]?.dot||'#B4B2A9'}/>
                  )}
                  <text x={pos.x+NODE_W/2} y={pos.y+(isRoot?NODE_H/2-5:NODE_H/2)}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={isRoot?14:11} fontWeight={isRoot?600:500}
                    fill={isRoot?'#3d2000':s.text} fontFamily="'Noto Serif JP',serif">
                    {node.label}
                  </text>
                  {isRoot && (
                    <text x={pos.x+NODE_W/2} y={pos.y+NODE_H/2+10}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={9} fill="#a07840" fontFamily="'Noto Serif JP',serif">
                      おおもとの戦法
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* FAB */}
        <button onClick={() => onNodeSelect('new')} style={{
          position:'absolute', bottom:14, right:14, width:42, height:42,
          borderRadius:'50%', background:'#a07840', border:'none', cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center',
          color:'#faf4e8', fontSize:20, zIndex:5,
        }} aria-label="ノードを追加">
          <i className="ti ti-plus"/>
        </button>

        {drawerOpen && <div onClick={() => setDrawerOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(26,15,0,0.38)', zIndex:20 }}/>}

        {/* 目次ドロワー */}
        <div style={{
          position:'absolute', top:0, right:0, bottom:0, width:235,
          background:'#faf4e8', borderLeft:'0.5px solid rgba(26,15,0,0.18)',
          transform: drawerOpen?'translateX(0)':'translateX(100%)',
          transition:'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          zIndex:21, display:'flex', flexDirection:'column',
        }}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 14px 10px',borderBottom:'0.5px solid rgba(26,15,0,0.18)',flexShrink:0}}>
            <span style={{fontFamily:"'Shippori Mincho B1',serif",fontSize:14,color:'#1a0f00',letterSpacing:'0.2em'}}>目次</span>
            <button onClick={() => setDrawerOpen(false)} style={{background:'none',border:'none',cursor:'pointer',color:'#a07840',fontSize:16}}>
              <i className="ti ti-x"/>
            </button>
          </div>
          <div style={{flex:1,overflowY:'auto'}}>
            <Accordion nodes={nodes} rootChildIds={rootNode?.childIds||[]} onSelect={jumpTo}/>
          </div>
        </div>
      </div>

      {/* 凡例 */}
      <div style={{display:'flex',gap:10,flexWrap:'wrap',padding:'8px 16px',borderTop:'0.5px solid rgba(26,15,0,0.18)',background:'#f0e8d4'}}>
        {[{line:'#1a5276',label:'自分の手'},{line:'#7B3010',label:'相手の手'}].map(l => (
          <div key={l.label} style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:'rgba(26,15,0,0.5)'}}>
            <div style={{width:18,height:2,borderRadius:1,background:l.line}}/>{l.label}
          </div>
        ))}
        {[{color:'#3B6D11',label:'完成'},{color:'#854F0B',label:'研究中'},{color:'#B4B2A9',label:'未定',dashed:true}].map(s => (
          <div key={s.label} style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:'rgba(26,15,0,0.5)'}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:s.color,border:s.dashed?'1px dashed #888':undefined}}/>{s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// NodeDetail
// ══════════════════════════════════════════════════
export function NodeDetail({ tree, nodeId, onBack, onNodeSelect, onNewNode, onUpdate }) {
  const node = tree.nodes[nodeId];
  const [memo,         setMemo]         = useState('');
  const [status,       setStatus]       = useState('todo');
  const [boardVisible, setBoardVisible] = useState(false);
  const [boardData,    setBoardData]    = useState(null);
  const [stamps,       setStamps]       = useState([]);

  // ノード切り替え時にリセット
  useEffect(() => {
    if (node) {
      setMemo(node.memo || '');
      setStatus(node.status || 'todo');
      setBoardVisible(!!node.board);
      setBoardData(node.board || null);
      setStamps(node.stamps || []);
    }
  }, [nodeId, node]);

  if (!node) return null;

  const parent   = node.parentId ? tree.nodes[node.parentId] : null;
  const children = (node.childIds || []).map(id => tree.nodes[id]).filter(Boolean);

  const breadcrumb = (() => {
    const parts = []; let cur = node;
    while (cur.parentId) { cur = tree.nodes[cur.parentId]; if (cur) parts.unshift(cur.label); }
    return parts.join(' › ');
  })();

  const handleToggleBoard = () => {
    if (!boardVisible && !boardData) {
      const pb = parent?.board || null;
      setBoardData(pb ? JSON.parse(JSON.stringify(pb)) : JSON.parse(JSON.stringify(INITIAL_BOARD)));
    }
    setBoardVisible(v => !v);
  };

  const saveAndGo = async (fn) => {
    await onUpdate(nodeId, { status, memo, board: boardVisible ? boardData : null, stamps: boardVisible ? stamps : [] });
    fn();
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#faf4e8' }}>
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'4px 14px 10px',borderBottom:'0.5px solid rgba(26,15,0,0.18)'}}>
        <BackBtn onClick={() => saveAndGo(onBack)}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:600,color:'#1a0f00',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{node.label}</div>
          {breadcrumb && (
            <div style={{fontSize:10,color:'rgba(26,15,0,0.5)',marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
              {tree.name} › {breadcrumb}
            </div>
          )}
        </div>
        {node.isMergeTarget && <MergeTag/>}
      </div>

      <div style={{flex:1,overflowY:'auto'}}>
        {node.approachType && <div style={{padding:'8px 16px 0'}}><ApproachTag type={node.approachType}/></div>}

        {/* ステータス */}
        <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 16px',borderBottom:'0.5px solid rgba(26,15,0,0.08)'}}>
          <span style={{fontSize:11,color:'rgba(26,15,0,0.5)'}}>ステータス</span>
          <div style={{display:'flex',gap:6}}>
            {['done','wip','todo'].map(s => <StatusChip key={s} status={s} active={status===s} onClick={() => setStatus(s)}/>)}
          </div>
        </div>

        {/* メモ */}
        <div style={{padding:'10px 16px 0'}}>
          <div style={{fontSize:11,color:'rgba(26,15,0,0.5)',marginBottom:6}}>メモ</div>
          <textarea value={memo} onChange={e => setMemo(e.target.value)}
            placeholder="気づき・方針・手順のポイントなど" rows={4}
            style={{ width:'100%', border:'0.5px solid rgba(26,15,0,0.18)', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#1a0f00', background:'#faf4e8', resize:'none', fontFamily:"'Noto Serif JP',serif", lineHeight:1.7, outline:'none' }}
            onFocus={e => e.target.style.borderColor='#a07840'}
            onBlur={e  => e.target.style.borderColor='rgba(26,15,0,0.18)'}/>
        </div>

        <Divider style={{margin:'10px 0 0'}}/>

        {/* 盤面 */}
        <div style={{padding:'8px 16px 0'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <span style={{fontSize:11,color:'rgba(26,15,0,0.5)'}}>盤面</span>
            <button onClick={handleToggleBoard} style={{ fontSize:11, padding:'4px 10px', borderRadius:8, border:'0.5px solid #a07840', background:'none', cursor:'pointer', color:'#a07840', fontFamily:"'Noto Serif JP',serif", display:'flex', alignItems:'center', gap:4 }}>
              <i className={`ti ti-${boardVisible?'minus':'plus'}`} style={{fontSize:12}}/>{boardVisible?'非表示':'追加'}
            </button>
          </div>
          {!boardVisible ? (
            <div onClick={handleToggleBoard} style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, padding:20, border:'0.5px dashed rgba(26,15,0,0.18)', borderRadius:10, cursor:'pointer', background:'rgba(26,15,0,0.04)', marginBottom:12 }}>
              <i className="ti ti-chess" style={{fontSize:24,color:'#a07840'}}/>
              <span style={{fontSize:12,color:'rgba(26,15,0,0.5)'}}>タップして盤面を追加</span>
            </div>
          ) : (
            <div style={{marginBottom:12}}>
              {parent?.board && (
                <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:8, background:'#d6eaf8', border:'0.5px solid rgba(26,82,118,0.2)', marginBottom:10, fontSize:11, color:'#1a5276' }}>
                  <i className="ti ti-copy" style={{fontSize:13}}/>親ノード「{parent.label}」の盤面を引き継いでいます
                </div>
              )}
              <ShogiBoard board={boardData} stamps={stamps}
                onChange={({ board, stamps: s }) => { setBoardData(board); setStamps(s); }}/>
              <button onClick={() => { setBoardData(null); setStamps([]); setBoardVisible(false); }}
                style={{ fontSize:11, color:'#B4B2A9', background:'none', border:'none', cursor:'pointer', fontFamily:"'Noto Serif JP',serif", display:'flex', alignItems:'center', gap:4, marginTop:6 }}>
                <i className="ti ti-trash" style={{fontSize:11}}/>盤面を削除
              </button>
            </div>
          )}
        </div>

        <Divider/>

        {/* 分岐 */}
        <div style={{padding:'8px 16px 16px'}}>
          <div style={{fontSize:11,color:'rgba(26,15,0,0.5)',marginBottom:8}}>分岐</div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {children.map(child => {
              const m = STATUS_META[child.status] || STATUS_META.todo;
              return (
                <div key={child.id} onClick={() => saveAndGo(() => onNodeSelect(child.id))}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:8, border:'0.5px solid rgba(26,15,0,0.18)', background:'#faf4e8', cursor:'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background='#f0e8d4'}
                  onMouseLeave={e => e.currentTarget.style.background='#faf4e8'}>
                  <div style={{ width:2, height:20, borderRadius:1, flexShrink:0, background:m.dashed?'transparent':m.dot, border:m.dashed?'0.5px dashed #B4B2A9':'none' }}/>
                  <span style={{fontSize:12,color:'#1a0f00',flex:1}}>{child.label}</span>
                  {child.isMergeTarget && <MergeTag/>}
                  <StatusChip status={child.status}/>
                  <i className="ti ti-chevron-right" style={{fontSize:14,color:'#B4B2A9'}}/>
                </div>
              );
            })}
            <div onClick={() => saveAndGo(() => onNewNode(nodeId))}
              style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:8, border:'0.5px dashed rgba(26,15,0,0.18)', cursor:'pointer', color:'#a07840', fontSize:12 }}
              onMouseEnter={e => e.currentTarget.style.background='#f0e8d4'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}>
              <i className="ti ti-git-branch" style={{fontSize:14}}/>ここから分岐を追加
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// NewNode  ―  ノード追加ウィザード（4ステップ）
// ══════════════════════════════════════════════════
const STEPS = ['切り口','候補','盤面','メモ'];

const APPROACHES = [
  { key:'相手の戦法', icon:'ti-swords',     iconColor:'#7B3010', bg:'#fadbd8', title:'相手の戦法', sub:'居飛車 / 三間飛車 / 穴熊 など\n相手の出方によって分岐する' },
  { key:'自分の志向', icon:'ti-user',       iconColor:'#1a5276', bg:'#d6eaf8', title:'自分の志向', sub:'受け志向 / 攻め志向 / バランス型\n自分のスタイルで分岐する' },
  { key:'局面の状況', icon:'ti-chart-dots', iconColor:'#854F0B', bg:'#FAEEDA', title:'局面の状況', sub:'銀が間に合った / 穴熊に組まれた\n局面の条件によって分岐する' },
];

export function NewNode({ tree, parentNodeId, onComplete, onCancel, onOpenNode }) {
  const parentNode = tree.nodes[parentNodeId];
  const [step,       setStep]       = useState(0);
  const [approach,   setApproach]   = useState(null);
  const [suggestion, setSuggestion] = useState('');
  const [name,       setName]       = useState('');
  const [status,     setStatus]     = useState('todo');
  const [memo,       setMemo]       = useState('');
  const [boardData,  setBoardData]  = useState(null);
  const [stamps,     setStamps]     = useState([]);
  const [done,       setDone]       = useState(false);
  const [newNodeId,  setNewNodeId]  = useState(null);

  const displayName = name || suggestion || '新しいノード';
  const canNext = () => {
    if (step === 0) return !!approach;
    if (step === 1) return !!(name.trim() || suggestion);
    return true;
  };

  const handleNext = async () => {
    if (step === 1 && suggestion && !name.trim()) setName(suggestion);
    if (step === 2 && !boardData) {
      const pb = parentNode?.board || null;
      setBoardData(pb ? JSON.parse(JSON.stringify(pb)) : JSON.parse(JSON.stringify(INITIAL_BOARD)));
    }
    if (step < STEPS.length - 1) { setStep(s => s+1); return; }

    const createdId = await onComplete({
  label: name.trim() || suggestion,
  status, approachType: approach,
  parentId: parentNodeId,
  board: boardData, stamps, memo,
});
setNewNodeId(createdId);
setDone(true);

  const pct = ((step+1) / STEPS.length) * 100;

  if (done) {
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#faf4e8' }}>
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px 24px',gap:16,textAlign:'center'}}>
          <div style={{ width:56, height:56, borderRadius:'50%', background:'#f0e8d4', border:'1.5px solid #a07840', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26 }}>
            <i className="ti ti-check" style={{color:'#a07840'}}/>
          </div>
          <div style={{fontFamily:"'Shippori Mincho B1',serif",fontSize:16,color:'#1a0f00',letterSpacing:'0.15em'}}>ノードを作成しました</div>
          <div style={{fontSize:12,color:'rgba(26,15,0,0.5)',lineHeight:1.7}}>
            「{parentNode?.label}」からの<br/>分岐がツリーに追加されました
          </div>
          <div style={{ width:'100%', border:'0.5px solid #a07840', borderRadius:10, padding:'12px 14px', background:'#f0e8d4', textAlign:'left' }}>
            <div style={{fontSize:10,color:'#a07840',marginBottom:3}}>新しいノード</div>
            <div style={{fontSize:15,fontWeight:600,color:'#1a0f00',marginBottom:8,fontFamily:"'Shippori Mincho B1',serif"}}>{name.trim()||suggestion}</div>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              <span style={{fontSize:10,padding:'2px 7px',borderRadius:8,background:'#fadbd8',color:'#7B3010',fontFamily:"'Noto Serif JP',serif"}}>{approach}</span>
              <StatusChip status={status} style={{fontSize:10}}/>
            </div>
          </div>
          <div style={{display:'flex',gap:8,width:'100%'}}>
  <button onClick={onCancel} style={{ flex:1, padding:10, borderRadius:10, fontSize:12, cursor:'pointer', background:'#faf4e8', color:'rgba(26,15,0,0.5)', border:'0.5px solid rgba(26,15,0,0.18)', fontFamily:"'Noto Serif JP',serif" }}>ツリーに戻る</button>
  <button onClick={() => newNodeId ? onOpenNode(newNodeId) : onCancel()} style={{ flex:2, padding:10, borderRadius:10, fontSize:13, cursor:'pointer', background:'#a07840', color:'#faf4e8', border:'none', fontFamily:"'Noto Serif JP',serif", fontWeight:600 }}>ノードを開く</button>
</div>
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'#faf4e8' }}>
      {/* topbar */}
      <div style={{display:'flex',alignItems:'center',gap:8,padding:'4px 14px 10px',borderBottom:'0.5px solid rgba(26,15,0,0.18)'}}>
        <button onClick={() => step===0 ? onCancel() : setStep(s=>s-1)} style={{background:'none',border:'none',cursor:'pointer',color:'#a07840',fontSize:18,padding:2,lineHeight:1}}>
          <i className="ti ti-chevron-left"/>
        </button>
        <div style={{flex:1,fontSize:14,fontWeight:600,color:'#1a0f00',textAlign:'center'}}>
          {['分岐を追加','候補を選ぶ','盤面を確認','メモを追加'][step]}
        </div>
        <button onClick={onCancel} style={{background:'none',border:'none',cursor:'pointer',fontSize:12,color:'rgba(26,15,0,0.5)',fontFamily:"'Noto Serif JP',serif"}}>キャンセル</button>
      </div>

      {/* プログレスバー */}
      <div style={{padding:'10px 20px 0'}}>
        <div style={{height:3,background:'rgba(26,15,0,0.08)',borderRadius:2,overflow:'hidden'}}>
          <div style={{height:'100%',background:'#a07840',borderRadius:2,width:`${pct}%`,transition:'width 0.35s'}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',marginTop:5,padding:'0 2px'}}>
          {STEPS.map((lbl,i) => (
            <span key={i} style={{fontSize:9,color:i===step?'#a07840':'#B4B2A9',fontWeight:i===step?600:400}}>{lbl}</span>
          ))}
        </div>
      </div>

      {/* 文脈表示 */}
      <div style={{display:'flex',alignItems:'center',gap:6,padding:'10px 16px 6px',borderBottom:'0.5px solid rgba(26,15,0,0.08)'}}>
        <span style={{fontSize:10,color:'rgba(26,15,0,0.5)'}}>分岐元：</span>
        <span style={{fontSize:11,color:'#1a0f00',fontWeight:600}}>{parentNode?.label}</span>
        <i className="ti ti-arrow-right" style={{fontSize:10,color:'#B4B2A9'}}/>
        <span style={{fontSize:11,color:'#a07840'}}>{displayName}</span>
      </div>

      {/* ステップ本体 */}
      <div style={{flex:1,overflowY:'auto'}}>
        {/* STEP 0: 切り口 */}
        {step===0 && (
          <div style={{padding:'14px 16px',display:'flex',flexDirection:'column',gap:8}}>
            <div style={{fontSize:11,color:'rgba(26,15,0,0.5)',marginBottom:4}}>どの切り口で分岐しますか？</div>
            {APPROACHES.map(a => (
              <div key={a.key} onClick={() => setApproach(a.key)} style={{
                display:'flex', alignItems:'center', gap:12, padding:'13px 14px', borderRadius:10, cursor:'pointer',
                border: approach===a.key ? '0.5px solid #a07840' : '0.5px solid rgba(26,15,0,0.18)',
                background: approach===a.key ? '#f0e8d4' : '#faf4e8',
                boxShadow: approach===a.key ? '0 0 0 1.5px #a07840' : 'none', transition:'all 0.15s',
              }}>
                <div style={{width:36,height:36,borderRadius:'50%',background:a.bg,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <i className={`ti ${a.icon}`} style={{fontSize:18,color:a.iconColor}}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#1a0f00',marginBottom:2}}>{a.title}</div>
                  <div style={{fontSize:10,color:'rgba(26,15,0,0.5)',lineHeight:1.4,whiteSpace:'pre-line'}}>{a.sub}</div>
                </div>
                <i className="ti ti-check" style={{fontSize:16,color:'#a07840',opacity:approach===a.key?1:0,transition:'opacity 0.15s'}}/>
              </div>
            ))}
          </div>
        )}

        {/* STEP 1: 候補 */}
        {step===1 && approach && (
          <div>
            <div style={{fontSize:11,color:'rgba(26,15,0,0.5)',padding:'14px 16px 8px'}}>
              {approach==='相手の戦法'?'相手の戦法から選ぶ':approach==='自分の志向'?'志向から選ぶ':'局面の状況から選ぶ'}
            </div>
            <div style={{display:'flex',flexWrap:'wrap',gap:7,padding:'0 16px 12px'}}>
              {(SUGGESTIONS[approach]||[]).map(s => (
                <div key={s} onClick={() => { setSuggestion(s); setName(s); }} style={{
                  padding:'7px 12px', borderRadius:20, cursor:'pointer',
                  border: suggestion===s?'0.5px solid #a07840':'0.5px solid rgba(26,15,0,0.18)',
                  fontSize:12, color:'#1a0f00',
                  background: suggestion===s?'#f0e8d4':'#faf4e8',
                  fontWeight: suggestion===s?600:400,
                  fontFamily:"'Noto Serif JP',serif", transition:'all 0.15s',
                }}>{s}</div>
              ))}
            </div>
            <div style={{padding:'0 16px 16px'}}>
              <div style={{fontSize:11,color:'rgba(26,15,0,0.5)',marginBottom:5}}>ノード名（自由入力）</div>
              <input value={name} onChange={e => { setName(e.target.value); setSuggestion(''); }}
                placeholder="例：▲４六銀型"
                style={{ width:'100%', border:'0.5px solid rgba(26,15,0,0.18)', borderRadius:8, padding:'9px 12px', fontSize:13, color:'#1a0f00', background:'#faf4e8', fontFamily:"'Noto Serif JP',serif", outline:'none' }}
                onFocus={e => e.target.style.borderColor='#a07840'}
                onBlur={e  => e.target.style.borderColor='rgba(26,15,0,0.18)'}/>
            </div>
          </div>
        )}

        {/* STEP 2: 盤面 */}
        {step===2 && (
          <div style={{padding:'14px 16px'}}>
            {parentNode?.board && (
              <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:8, background:'#d6eaf8', border:'0.5px solid rgba(26,82,118,0.2)', marginBottom:10, fontSize:11, color:'#1a5276' }}>
                <i className="ti ti-copy" style={{fontSize:13}}/>親ノード「{parentNode.label}」の盤面を引き継いでいます
              </div>
            )}
            <ShogiBoard board={boardData||(parentNode?.board||INITIAL_BOARD)} stamps={stamps}
              onChange={({ board, stamps: s }) => { setBoardData(board); setStamps(s); }}/>
            <div style={{fontSize:10,color:'#B4B2A9',marginTop:6,textAlign:'center'}}>盤面は後から編集できます。スキップも可。</div>
          </div>
        )}

        {/* STEP 3: ステータス・メモ */}
        {step===3 && (
          <div>
            <div style={{fontSize:11,color:'rgba(26,15,0,0.5)',padding:'14px 16px 8px'}}>ステータスを設定</div>
            <div style={{display:'flex',gap:6,padding:'0 16px 14px'}}>
              {['todo','wip','done'].map(s => <StatusChip key={s} status={s} active={status===s} onClick={() => setStatus(s)}/>)}
            </div>
            <div style={{height:'0.5px',background:'rgba(26,15,0,0.08)'}}/>
            <div style={{fontSize:11,color:'rgba(26,15,0,0.5)',padding:'12px 16px 6px'}}>メモ（任意）</div>
            <div style={{padding:'0 16px 16px'}}>
              <textarea value={memo} onChange={e => setMemo(e.target.value)}
                placeholder="気づき・方針・手順のポイントなど" rows={4}
                style={{ width:'100%', border:'0.5px solid rgba(26,15,0,0.18)', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#1a0f00', background:'#faf4e8', resize:'none', fontFamily:"'Noto Serif JP',serif", lineHeight:1.7, outline:'none' }}
                onFocus={e => e.target.style.borderColor='#a07840'}
                onBlur={e  => e.target.style.borderColor='rgba(26,15,0,0.18)'}/>
            </div>
          </div>
        )}
      </div>

      {/* ボトムナビ */}
      <div style={{display:'flex',gap:8,padding:'12px 16px 20px',borderTop:'0.5px solid rgba(26,15,0,0.18)'}}>
        {step>0 && (
          <button onClick={() => setStep(s=>s-1)} style={{ flex:1, padding:10, borderRadius:10, fontSize:13, cursor:'pointer', border:'0.5px solid rgba(26,15,0,0.18)', background:'#faf4e8', color:'rgba(26,15,0,0.5)', fontFamily:"'Noto Serif JP',serif" }}>前へ</button>
        )}
        <button onClick={handleNext} disabled={!canNext()} style={{
          flex: step>0?2:1, padding:10, borderRadius:10, fontSize:13,
          cursor: canNext()?'pointer':'default', border:'none',
          background: canNext()?'#a07840':'#B4B2A9',
          color:'#faf4e8', fontFamily:"'Noto Serif JP',serif", fontWeight:600, transition:'background 0.15s',
        }}>
          {step===STEPS.length-1?'作成する':step===2?'次へ（スキップ可）':'次へ'}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════
// PublicTrees
// ══════════════════════════════════════════════════
const ALL_TAGS = ["すべて","居飛車","振り飛車","角換わり","矢倉","雁木","石田流","中飛車","四間飛車"];

export function PublicTrees({ trees, profile, onBack, onCopy, onRefresh }) {
  const [query,     setQuery]     = useState("");
  const [activeTag, setActiveTag] = useState("すべて");
  const [copiedId,  setCopiedId]  = useState(null);
  const [copying,   setCopying]   = useState(null);

  const filtered = (trees||[]).filter(t => {
    const matchTag = activeTag==="すべて" || (t.tags||[]).includes(activeTag);
    const matchQ   = !query || t.name.includes(query) || (t.tags||[]).some(tg => tg.includes(query));
    return matchTag && matchQ;
  });

  const handleCopy = async (id) => {
    setCopying(id);
    await onCopy(id);
    setCopiedId(id); setCopying(null);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"#faf4e8" }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"16px 14px 12px", borderBottom:"0.5px solid rgba(26,15,0,0.12)" }}>
        <BackBtn onClick={onBack}/>
        <div style={{ fontFamily:"'Shippori Mincho B1',serif", fontSize:16, color:"#1a0f00", flex:1 }}>みんなのツリー</div>
        <button onClick={onRefresh} style={{ background:"none", border:"none", cursor:"pointer", color:"#a07840", fontSize:18 }}>
          <i className="ti ti-refresh"/>
        </button>
      </div>

      <div style={{ padding:"10px 16px 0" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, border:"0.5px solid rgba(26,15,0,0.15)", borderRadius:10, padding:"9px 12px", background:"#f0e8d4" }}>
          <i className="ti ti-search" style={{ fontSize:15, color:"#B4B2A9" }}/>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="戦法名・タグで検索"
            style={{ flex:1, border:"none", background:"transparent", fontSize:13, color:"#1a0f00", outline:"none", fontFamily:"'Noto Serif JP',serif" }}/>
          {query && <i className="ti ti-x" style={{ fontSize:14, color:"#B4B2A9", cursor:"pointer" }} onClick={()=>setQuery("")}/>}
        </div>
      </div>

      <div style={{ display:"flex", gap:6, padding:"10px 16px", overflowX:"auto", flexShrink:0 }}>
        {ALL_TAGS.map(tag => (
          <div key={tag} onClick={()=>setActiveTag(tag)} style={{
            whiteSpace:"nowrap", fontSize:11, padding:"5px 12px", borderRadius:20, cursor:"pointer",
            fontFamily:"'Noto Serif JP',serif",
            border: activeTag===tag?"0.5px solid #a07840":"0.5px solid rgba(26,15,0,0.15)",
            background: activeTag===tag?"#f0e8d4":"#faf4e8",
            color: activeTag===tag?"#1a0f00":"rgba(26,15,0,0.45)",
            fontWeight: activeTag===tag?600:400, transition:"all 0.15s",
          }}>{tag}</div>
        ))}
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"0 16px 16px" }}>
        {filtered.length===0 ? (
          <div style={{ textAlign:"center", padding:"50px 0", fontSize:12, color:"#B4B2A9", fontFamily:"'Noto Serif JP',serif" }}>
            <i className="ti ti-mood-empty" style={{fontSize:32,display:"block",marginBottom:10}}/>見つかりませんでした
          </div>
        ) : filtered.map(t => {
          const author    = t.profiles?.display_name || t.profiles?.username || "匿名";
          const isCopied  = copiedId===t.id;
          const isCopying = copying===t.id;
          return (
            <div key={t.id} style={{ padding:"14px", borderRadius:12, border:"0.5px solid rgba(200,169,110,0.3)", background:"#f5edd8", marginBottom:10 }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:8 }}>
                <div>
                  <div style={{ fontFamily:"'Shippori Mincho B1',serif", fontSize:15, color:"#1a0f00", marginBottom:2 }}>{t.name}</div>
                  <div style={{ fontSize:10, color:"rgba(26,15,0,0.4)" }}>@{author}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:"rgba(26,15,0,0.4)" }}>
                  <i className="ti ti-heart" style={{fontSize:14}}/>{t.liked_by||0}
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                  {(t.tags||[]).map(tg => (
                    <span key={tg} style={{ fontSize:9, padding:"2px 7px", borderRadius:8, background:"rgba(26,15,0,0.06)", color:"rgba(26,15,0,0.5)", fontFamily:"'Noto Serif JP',serif" }}>{tg}</span>
                  ))}
                </div>
                <button onClick={()=>handleCopy(t.id)} disabled={isCopying} style={{
                  fontSize:11, padding:"5px 12px", borderRadius:8, cursor:isCopying?"default":"pointer",
                  border:"0.5px solid #a07840",
                  background: isCopied?"#a07840":"transparent",
                  color: isCopied?"#faf4e8":"#a07840",
                  fontFamily:"'Noto Serif JP',serif",
                  display:"flex", alignItems:"center", gap:4, transition:"all 0.2s",
                }}>
                  <i className={`ti ti-${isCopied?"check":isCopying?"loader":"copy"}`} style={{fontSize:12}}/>
                  {isCopied?"コピーしました":isCopying?"コピー中...":"コピー"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
