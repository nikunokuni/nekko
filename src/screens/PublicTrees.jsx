import { useState } from "react";
import { BackBtn } from "../components/ui";

const ALL_TAGS = ["すべて","居飛車","振り飛車","角換わり","矢倉","雁木","石田流","中飛車","四間飛車"];

export default function PublicTrees({ trees, profile, onBack, onCopy, onRefresh }) {
  const [query, setQuery]       = useState("");
  const [activeTag, setActiveTag] = useState("すべて");
  const [copiedId, setCopiedId] = useState(null);
  const [copying, setCopying]   = useState(null);

  const filtered = (trees || []).filter(t => {
    const matchTag = activeTag === "すべて" || (t.tags||[]).includes(activeTag);
    const matchQ   = !query || t.name.includes(query) || (t.tags||[]).some(tg => tg.includes(query));
    return matchTag && matchQ;
  });

  const handleCopy = async (id) => {
    setCopying(id);
    await onCopy(id);
    setCopiedId(id);
    setCopying(null);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"#faf4e8" }}>
      {/* header */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"16px 14px 12px", borderBottom:"0.5px solid rgba(26,15,0,0.12)" }}>
        <BackBtn onClick={onBack}/>
        <div style={{ fontFamily:"'Shippori Mincho B1',serif", fontSize:16, color:"#1a0f00", flex:1 }}>みんなのツリー</div>
        <button onClick={onRefresh} style={{ background:"none", border:"none", cursor:"pointer", color:"#a07840", fontSize:18 }}>
          <i className="ti ti-refresh"/>
        </button>
      </div>

      {/* search */}
      <div style={{ padding:"10px 16px 0" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, border:"0.5px solid rgba(26,15,0,0.15)", borderRadius:10, padding:"9px 12px", background:"#f0e8d4" }}>
          <i className="ti ti-search" style={{ fontSize:15, color:"#B4B2A9" }}/>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="戦法名・タグで検索"
            style={{ flex:1, border:"none", background:"transparent", fontSize:13, color:"#1a0f00", outline:"none", fontFamily:"'Noto Serif JP',serif" }}/>
          {query && <i className="ti ti-x" style={{ fontSize:14, color:"#B4B2A9", cursor:"pointer" }} onClick={()=>setQuery("")}/>}
        </div>
      </div>

      {/* tag filter */}
      <div style={{ display:"flex", gap:6, padding:"10px 16px", overflowX:"auto", flexShrink:0 }}>
        {ALL_TAGS.map(tag => (
          <div key={tag} onClick={()=>setActiveTag(tag)} style={{
            whiteSpace:"nowrap", fontSize:11, padding:"5px 12px", borderRadius:20,
            cursor:"pointer", fontFamily:"'Noto Serif JP',serif",
            border: activeTag===tag ? "0.5px solid #a07840" : "0.5px solid rgba(26,15,0,0.15)",
            background: activeTag===tag ? "#f0e8d4" : "#faf4e8",
            color: activeTag===tag ? "#1a0f00" : "rgba(26,15,0,0.45)",
            fontWeight: activeTag===tag ? 600 : 400, transition:"all 0.15s",
          }}>{tag}</div>
        ))}
      </div>

      {/* list */}
      <div style={{ flex:1, overflowY:"auto", padding:"0 16px 16px" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign:"center", padding:"50px 0", fontSize:12, color:"#B4B2A9", fontFamily:"'Noto Serif JP',serif" }}>
            <i className="ti ti-mood-empty" style={{fontSize:32,display:"block",marginBottom:10}}/>
            見つかりませんでした
          </div>
        ) : filtered.map(t => {
          const author = t.profiles?.display_name || t.profiles?.username || "匿名";
          const isCopied  = copiedId === t.id;
          const isCopying = copying  === t.id;
          return (
            <div key={t.id} style={{ padding:"14px", borderRadius:12, border:"0.5px solid rgba(200,169,110,0.3)", background:"#f5edd8", marginBottom:10 }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:8 }}>
                <div>
                  <div style={{ fontFamily:"'Shippori Mincho B1',serif", fontSize:15, color:"#1a0f00", marginBottom:2 }}>{t.name}</div>
                  <div style={{ fontSize:10, color:"rgba(26,15,0,0.4)" }}>@{author}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:"rgba(26,15,0,0.4)" }}>
                  <i className="ti ti-heart" style={{fontSize:14}}/>
                  {t.liked_by || 0}
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:8 }}>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                  {(t.tags||[]).map(tg => (
                    <span key={tg} style={{ fontSize:9, padding:"2px 7px", borderRadius:8, background:"rgba(26,15,0,0.06)", color:"rgba(26,15,0,0.5)", fontFamily:"'Noto Serif JP',serif" }}>{tg}</span>
                  ))}
                </div>
                <button onClick={() => handleCopy(t.id)} disabled={isCopying} style={{
                  fontSize:11, padding:"5px 12px", borderRadius:8, cursor: isCopying ? "default" : "pointer",
                  border:"0.5px solid #a07840",
                  background: isCopied ? "#a07840" : "transparent",
                  color: isCopied ? "#faf4e8" : "#a07840",
                  fontFamily:"'Noto Serif JP',serif",
                  display:"flex", alignItems:"center", gap:4, transition:"all 0.2s",
                }}>
                  <i className={`ti ti-${isCopied ? "check" : isCopying ? "loader" : "copy"}`} style={{fontSize:12}}/>
                  {isCopied ? "コピーしました" : isCopying ? "コピー中..." : "コピー"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
