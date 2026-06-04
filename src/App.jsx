// ══════════════════════════════════════════════════
// App.jsx  ―  アプリのルート
//   セッション管理 / 画面遷移 / DB 操作の統括
// ══════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import {
  AuthScreen, TreeList, MindMap,
  NodeDetail, NewNode, PublicTrees,
} from "./screens";
import {
  supabase,
  getSession, getProfile, signOut,
  fetchMyTrees, fetchPublicTrees, fetchNodes,
  createTree, createNode, updateNode, updateTree, deleteTree,
  buildTreeFromNodes,
} from "./db";

const NAV_TABS = [
  { s:"list",   icon:"ti-layout-list", label:"マイツリー" },
  { s:"public", icon:"ti-world",       label:"みんな"     },
];

export default function App() {
  const [session,          setSession]          = useState(undefined); // undefined = 未確定
  const [profile,          setProfile]          = useState(null);
  const [screen,           setScreen]           = useState("list");
  const [myTrees,          setMyTrees]          = useState([]);
  const [pubTrees,         setPubTrees]         = useState([]);
  const [activeTree,       setActiveTree]       = useState(null);
  const [activeNodeId,     setActiveNodeId]     = useState(null);
  const [newNodeParentId,  setNewNodeParentId]  = useState(null);
  const [loading,          setLoading]          = useState(false);

  // ── Auth bootstrap ────────────────────────────
  useEffect(() => {
    getSession().then(s => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // session 確定後にプロフィール・ツリーを取得
  useEffect(() => {
    if (session === undefined) return; // まだ確定していない
    if (!session) return;              // 未ログイン
    getProfile(session.user.id).then(({ data }) => setProfile(data));
    loadMyTrees();
    loadPublicTrees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // ── ツリー一覧の取得 ─────────────────────────
 const loadMyTrees = useCallback(async () => {
  if (!session) return;
  const { data } = await fetchMyTrees(session.user.id);
  alert('myTrees: ' + JSON.stringify(data?.length));  // ← 追加
  setMyTrees(data || []);
}, [session]);
  const loadPublicTrees = useCallback(async () => {
    const { data } = await fetchPublicTrees();
    setPubTrees(data || []);
  }, []);

  // ── 個別ツリーの読み込み ─────────────────────
  // ※ myTrees が空のタイミングで呼ばれても DB から直接フェッチして取得する
  const loadTree = useCallback(async (treeId) => {
    setLoading(true);
    try {
      let treeRow = [...myTrees, ...pubTrees].find(t => t.id === treeId);
      if (!treeRow) {
        const { data } = await fetchMyTrees(session?.user?.id);
        treeRow = (data || []).find(t => t.id === treeId);
      }
      if (!treeRow) return null;

      const { data: nodes } = await fetchNodes(treeId);
      const assembled = buildTreeFromNodes(treeRow, nodes || []);
      console.log('nodes from DB:', nodes);        // ← 追加
      console.log('assembled tree:', assembled);   // ← 追加
      setActiveTree(assembled);
      return assembled;
    } finally {
      setLoading(false);
    }
  }, [myTrees, pubTrees, session]);

  // ── Auth ハンドラ ────────────────────────────
  const handleAuth     = (_user, sess) => setSession(sess);
  const handleSignOut  = async () => {
    await signOut();
    setSession(null); setProfile(null);
    setActiveTree(null); setActiveNodeId(null);
    setMyTrees([]); setScreen("list");
  };

  // ── ツリー操作 ───────────────────────────────
const handleOpenTree = async (treeId) => {
  alert('開く: ' + treeId);   // ← alertなら必ず出る
  const tree = await loadTree(treeId);
  alert('tree取得: ' + (tree ? 'OK' : 'null'));
  if (tree) setScreen("map");
};

 const handleNewTree = async (name, tags = []) => {
  const { data } = await createTree({ userId: session.user.id, name, tags });
  if (!data) return;
  const nodeResult = await createNode({
    treeId: data.id, userId: session.user.id,
    parentId: null, label: name, isRoot: true, status: "todo"
  });
  console.log('createNode result:', nodeResult); // ← 追加
  await loadMyTrees();
};

  const handleDeleteTree = async (treeId) => {
    await deleteTree(treeId);
    await loadMyTrees();
  };

  const handleEditTree = async (treeId, patch) => {
    await updateTree(treeId, patch);
    await loadMyTrees();
  };

  // ── ノード操作 ───────────────────────────────
  const handleNodeSelect = (nodeId) => {
    if (nodeId === "new") {
      // rootId を確実に取得（rootId が未設定の場合は nodes から探す）
      const rootId = activeTree?.rootId
        ?? Object.values(activeTree?.nodes || {}).find(n => n.isRoot)?.id
        ?? null;
      setNewNodeParentId(rootId);
      setScreen("new");
      return;
    }
    setActiveNodeId(nodeId);
    setScreen("node");
  };

  const handleNodeUpdate = async (nodeId, patch) => {
    await updateNode(nodeId, patch);
    // ローカル state も即時反映
    setActiveTree(prev => ({
      ...prev,
      nodes: { ...prev.nodes, [nodeId]: { ...prev.nodes[nodeId], ...patch } },
    }));
  };

  const handleNewNode = (parentId) => {
    setNewNodeParentId(parentId);
    setScreen("new");
  };

  const handleNewNodeComplete = async (newNodeData) => {
  if (!activeTree || !session) return;
  const { data: newNode } = await createNode({
    treeId:      activeTree.id,
    userId:      session.user.id,
    parentId:    newNodeParentId,
    label:       newNodeData.label,
    status:      newNodeData.status,
    approachType:newNodeData.approachType,
    board:       newNodeData.board,
    stamps:      newNodeData.stamps,
    memo:        newNodeData.memo,
  });
  await loadTree(activeTree.id);
  setScreen("map");
    console.log('tree:', JSON.stringify(tree, null, 2));
  return newNode?.id ?? null;  // ← 追加：IDを返す
};

  // ── 公開ツリーのコピー（BFS 順で parent_id を解決）──
  const handleCopyTree = async (pubTreeId) => {
    const pubTreeRow = pubTrees.find(t => t.id === pubTreeId);
    if (!pubTreeRow || !session) return;

    const { data: newTree } = await createTree({ userId: session.user.id, name: pubTreeRow.name + "（コピー）", tags: pubTreeRow.tags || [] });
    if (!newTree) return;

    const { data: srcNodes } = await fetchNodes(pubTreeId);
    if (!srcNodes) return;

    const idMap = {};
    const rootSrc = srcNodes.find(n => n.is_root);
    if (rootSrc) {
      const { data: nr } = await createNode({ treeId: newTree.id, userId: session.user.id, parentId: null, label: rootSrc.label, isRoot: true, status: rootSrc.status, memo: rootSrc.memo || "", board: rootSrc.board, stamps: rootSrc.stamps || [] });
      if (nr) idMap[rootSrc.id] = nr.id;
    }

    // BFS 順に並び替えて insert（親が先に登録されていることを保証）
    const nonRoot = srcNodes.filter(n => !n.is_root);
    const ordered = [], queue = [rootSrc?.id].filter(Boolean), visited = new Set(queue);
    while (queue.length) {
      const cur = queue.shift();
      for (const child of nonRoot.filter(n => n.parent_id === cur)) {
        if (!visited.has(child.id)) { visited.add(child.id); ordered.push(child); queue.push(child.id); }
      }
    }
    for (const n of ordered) {
      const { data: nn } = await createNode({ treeId: newTree.id, userId: session.user.id, parentId: idMap[n.parent_id] || null, label: n.label, status: n.status, approachType: n.approach_type, memo: n.memo || "", board: n.board, stamps: n.stamps || [] });
      if (nn) idMap[n.id] = nn.id;
    }
    await loadMyTrees();
  };

  // ── ローディング中 / 未ログイン ──────────────
  if (session === undefined) {
    return (
      <div style={{ minHeight:"100dvh", background:"#0d0800", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ color:"rgba(200,169,110,0.4)", fontSize:14, letterSpacing:"0.2em" }}>読み込み中...</div>
      </div>
    );
  }
  if (!session) return <AuthScreen onAuth={handleAuth}/>;

  const navActive = (s) => screen===s || (s==="list" && ["map","node","new"].includes(screen));

  // ── レンダリング ─────────────────────────────
  return (
    <div style={{ minHeight:"100dvh", background:"#faf4e8", display:"flex", flexDirection:"column" }}>
      <div style={{ flex:1, overflow:"hidden", position:"relative" }}>
        {loading && (
          <div style={{ position:"absolute", inset:0, background:"rgba(250,244,232,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}>
            <div style={{ color:"#a07840", fontSize:13, letterSpacing:"0.15em" }}>読み込み中...</div>
          </div>
        )}

        {screen==="list" && (
          <TreeList trees={myTrees} profile={profile}
            onOpen={handleOpenTree} onPublic={() => setScreen("public")}
            onNewTree={handleNewTree} onSignOut={handleSignOut}
            onDeleteTree={handleDeleteTree} onEditTree={handleEditTree}/>
        )}
        {screen==="map" && activeTree && (
          <MindMap tree={activeTree} onNodeSelect={handleNodeSelect} onBack={() => setScreen("list")}/>
        )}
        {screen==="node" && activeTree && activeNodeId && (
          <NodeDetail tree={activeTree} nodeId={activeNodeId}
            onBack={() => setScreen("map")} onNodeSelect={handleNodeSelect}
            onNewNode={handleNewNode} onUpdate={handleNodeUpdate}/>
        )}
        {screen==="new" && activeTree && newNodeParentId && (
  <NewNode tree={activeTree} parentNodeId={newNodeParentId}
    onComplete={handleNewNodeComplete}
    onCancel={() => setScreen(activeNodeId ? "node" : "map")}
    onOpenNode={(id) => { setActiveNodeId(id); setScreen("node"); }}/>
)}
        {screen==="public" && (
          <PublicTrees trees={pubTrees} profile={profile}
            onBack={() => setScreen("list")}
            onCopy={handleCopyTree} onRefresh={loadPublicTrees}/>
        )}
      </div>

      {/* ボトムナビ */}
      <div style={{ display:"flex", background:"#faf4e8", borderTop:"0.5px solid rgba(26,15,0,0.12)", padding:"8px 0 calc(8px + env(safe-area-inset-bottom))" }}>
        {NAV_TABS.map(tab => (
          <div key={tab.s} onClick={() => { setScreen(tab.s); if (tab.s==="public") loadPublicTrees(); }}
            style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4, cursor:"pointer", padding:"6px 0" }}>
            <i className={`ti ${tab.icon}`} style={{ fontSize:22, color: navActive(tab.s)?"#a07840":"#B4B2A9", transition:"color 0.15s" }}/>
            <span style={{ fontSize:10, letterSpacing:"0.05em", color: navActive(tab.s)?"#a07840":"#B4B2A9", transition:"color 0.15s" }}>{tab.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
