import { useState, useEffect, useCallback } from "react";
import AuthScreen  from "./screens/AuthScreen";
import TreeList    from "./screens/TreeList";
import MindMap     from "./screens/MindMap";
import NodeDetail  from "./screens/NodeDetail";
import NewNode     from "./screens/NewNode";
import PublicTrees from "./screens/PublicTrees";
import { supabase } from "./lib/supabase";
import {
  getSession, getProfile, signOut,
  fetchMyTrees, fetchPublicTrees, fetchNodes,
  createTree, updateTree,
  createNode, updateNode,
  buildTreeFromNodes,
} from "./lib/db";

const NAV_TABS = [
  { s: "list",   icon: "ti-layout-list", label: "マイツリー" },
  { s: "public", icon: "ti-world",       label: "みんな"     },
];

export default function App() {
  const [session, setSession]       = useState(undefined);
  const [profile, setProfile]       = useState(null);
  const [screen, setScreen]         = useState("list");
  const [myTrees, setMyTrees]       = useState([]);
  const [pubTrees, setPubTrees]     = useState([]);
  const [activeTree, setActiveTree] = useState(null);
  const [activeNodeId, setActiveNodeId]     = useState(null);
  const [newNodeParentId, setNewNodeParentId] = useState(null);
  const [loading, setLoading]       = useState(false);

  // auth bootstrap
  useEffect(() => {
    getSession().then(s => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    getProfile(session.user.id).then(({ data }) => setProfile(data));
    loadMyTrees();
    loadPublicTrees();
  }, [session]);

  const loadMyTrees = useCallback(async () => {
    if (!session) return;
    const { data } = await fetchMyTrees(session.user.id);
    setMyTrees(data || []);
  }, [session]);

  const loadPublicTrees = useCallback(async () => {
    const { data } = await fetchPublicTrees();
    setPubTrees(data || []);
  }, []);

  const loadTree = useCallback(async (treeId) => {
    setLoading(true);
    const allTrees = [...myTrees, ...pubTrees];
    const treeRow = allTrees.find(t => t.id === treeId);
    if (!treeRow) { setLoading(false); return null; }
    const { data: nodes } = await fetchNodes(treeId);
    const assembled = buildTreeFromNodes(treeRow, nodes || []);
    setActiveTree(assembled);
    setLoading(false);
    return assembled;
  }, [myTrees, pubTrees]);

  const handleAuth = (_user, sess) => setSession(sess);

  const handleSignOut = async () => {
    await signOut();
    setSession(null); setActiveTree(null); setScreen("list");
  };

  const handleOpenTree = async (treeId) => {
    const tree = await loadTree(treeId);
    if (tree) setScreen("map");
  };

  const handleNewTree = async (name, tags = []) => {
    const { data } = await createTree({ userId: session.user.id, name, tags });
    if (!data) return;
    await createNode({
      treeId: data.id, userId: session.user.id,
      parentId: null, label: name, isRoot: true, status: "todo",
    });
    await loadMyTrees();
  };

  const handleNodeSelect = (nodeId) => {
    if (nodeId === "new") {
      setNewNodeParentId(activeTree?.rootId || null);
      setScreen("new"); return;
    }
    setActiveNodeId(nodeId); setScreen("node");
  };

  const handleNodeUpdate = async (nodeId, patch) => {
    await updateNode(nodeId, patch);
    setActiveTree(prev => ({
      ...prev,
      nodes: { ...prev.nodes, [nodeId]: { ...prev.nodes[nodeId], ...patch } },
    }));
  };

  const handleNewNode = (parentId) => {
    setNewNodeParentId(parentId); setScreen("new");
  };

  const handleNewNodeComplete = async (newNodeData) => {
    if (!activeTree || !session) return;
    await createNode({
      treeId: activeTree.id, userId: session.user.id,
      parentId: newNodeParentId,
      label: newNodeData.label, status: newNodeData.status,
      approachType: newNodeData.approachType,
      board: newNodeData.board, stamps: newNodeData.stamps, memo: newNodeData.memo,
    });
    await loadTree(activeTree.id);
    setScreen("map");
  };

  const handleCopyTree = async (pubTreeId) => {
    const pubTreeRow = pubTrees.find(t => t.id === pubTreeId);
    if (!pubTreeRow || !session) return;
    const { data: newTree } = await createTree({
      userId: session.user.id,
      name: pubTreeRow.name + "（コピー）",
      tags: pubTreeRow.tags || [],
    });
    if (!newTree) return;
    const { data: srcNodes } = await fetchNodes(pubTreeId);
    if (!srcNodes) return;
    const idMap = {};
    const rootSrc = srcNodes.find(n => n.is_root);
    if (rootSrc) {
      const { data: nr } = await createNode({
        treeId: newTree.id, userId: session.user.id,
        parentId: null, label: rootSrc.label, isRoot: true,
        status: rootSrc.status, memo: rootSrc.memo || "",
        board: rootSrc.board, stamps: rootSrc.stamps || [],
      });
      if (nr) idMap[rootSrc.id] = nr.id;
    }
    for (const n of srcNodes.filter(n => !n.is_root)) {
      const { data: nn } = await createNode({
        treeId: newTree.id, userId: session.user.id,
        parentId: idMap[n.parent_id] || null,
        label: n.label, status: n.status,
        approachType: n.approach_type, memo: n.memo || "",
        board: n.board, stamps: n.stamps || [],
      });
      if (nn) idMap[n.id] = nn.id;
    }
    await loadMyTrees();
  };

  if (session === undefined) {
    return (
      <div style={{ minHeight:"100dvh", background:"#0d0800", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ color:"rgba(200,169,110,0.4)", fontSize:14, letterSpacing:"0.2em" }}>読み込み中...</div>
      </div>
    );
  }

  if (!session) return <AuthScreen onAuth={handleAuth} />;

  const navActive = (s) => screen === s || (s === "list" && ["map","node","new"].includes(screen));

  return (
    <div style={{ minHeight:"100dvh", background:"#faf4e8", display:"flex", flexDirection:"column" }}>
      <div style={{ flex:1, overflow:"hidden", position:"relative" }}>
        {loading && (
          <div style={{ position:"absolute", inset:0, background:"rgba(250,244,232,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}>
            <div style={{ color:"#a07840", fontSize:13, letterSpacing:"0.15em" }}>読み込み中...</div>
          </div>
        )}
        {screen === "list" && (
          <TreeList trees={myTrees} profile={profile}
            onOpen={handleOpenTree} onPublic={() => setScreen("public")}
            onNewTree={handleNewTree} onSignOut={handleSignOut} />
        )}
        {screen === "map" && activeTree && (
          <MindMap tree={activeTree} onNodeSelect={handleNodeSelect} onBack={() => setScreen("list")} />
        )}
        {screen === "node" && activeTree && activeNodeId && (
          <NodeDetail tree={activeTree} nodeId={activeNodeId}
            onBack={() => setScreen("map")} onNodeSelect={handleNodeSelect}
            onNewNode={handleNewNode} onUpdate={handleNodeUpdate} />
        )}
        {screen === "new" && activeTree && newNodeParentId && (
          <NewNode tree={activeTree} parentNodeId={newNodeParentId}
            onComplete={handleNewNodeComplete}
            onCancel={() => setScreen(activeNodeId ? "node" : "map")} />
        )}
        {screen === "public" && (
          <PublicTrees trees={pubTrees} profile={profile}
            onBack={() => setScreen("list")}
            onCopy={handleCopyTree} onRefresh={loadPublicTrees} />
        )}
      </div>

      <div style={{ display:"flex", background:"#faf4e8", borderTop:"0.5px solid rgba(26,15,0,0.12)", padding:"8px 0 calc(8px + env(safe-area-inset-bottom))" }}>
        {NAV_TABS.map(tab => (
          <div key={tab.s} onClick={() => { setScreen(tab.s); if (tab.s === "public") loadPublicTrees(); }}
            style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4, cursor:"pointer", padding:"6px 0" }}>
            <i className={`ti ${tab.icon}`} style={{ fontSize:22, color: navActive(tab.s) ? "#a07840" : "#B4B2A9", transition:"color 0.15s" }}/>
            <span style={{ fontSize:10, letterSpacing:"0.05em", color: navActive(tab.s) ? "#a07840" : "#B4B2A9", transition:"color 0.15s" }}>{tab.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
