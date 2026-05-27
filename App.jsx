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
  const [session, setSession]                   = useState(undefined);
  const [profile, setProfile]                   = useState(null);
  const [screen, setScreen]                     = useState("list");
  const [myTrees, setMyTrees]                   = useState([]);
  const [pubTrees, setPubTrees]                 = useState([]);
  const [activeTree, setActiveTree]             = useState(null);
  const [activeNodeId, setActiveNodeId]         = useState(null);
  const [newNodeParentId, setNewNodeParentId]   = useState(null);
  const [loading, setLoading]                   = useState(false);

  // ─── auth bootstrap ───────────────────────────────────────────
  // auth bootstrap
  useEffect(() => {
    getSession().then(s => setSession(s));
    // 修正：subscriptionを正しく格納し、アンマウント時に購読解除
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 修正：新規ノードの作成が完了した際、登録した新しい実ノードのIDを返すように変更
  const handleNewNodeComplete = async (newNodeData) => {
    if (!activeTree || !session) return null;
    const { data: createdNode, error } = await createNode({
      treeId: activeTree.id, 
      userId: session.user.id,
      parentId: newNodeParentId,
      label: newNodeData.label, 
      status: newNodeData.status,
      approachType: newNodeData.approachType,
      board: newNodeData.board, 
      stamps: newNodeData.stamps, 
      memo: newNodeData.memo,
    });
    
    if (error) {
      console.error("ノード作成失敗:", error);
      return null;
    }

    await loadTree(activeTree.id);
    return createdNode?.id || null; // 新しくDBで発行された実UUIDを返す
  };

  // BUG FIX ①: session が変わるたびに loadMyTrees/loadPublicTrees を
  // 呼ぶが、loadMyTrees 自体が session に依存する useCallback のため
  // 初回レンダー時に session=undefined で空振りする。
  // session が確定した (null でも object でも) タイミングだけ実行する。
  useEffect(() => {
    if (session === undefined) return; // まだ確定していない
    if (!session) return;              // 未ログイン
    getProfile(session.user.id).then(({ data }) => setProfile(data));
    loadMyTrees();
    loadPublicTrees();
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMyTrees = useCallback(async () => {
    if (!session) return;
    const { data } = await fetchMyTrees(session.user.id);
    setMyTrees(data || []);
  }, [session]);

  const loadPublicTrees = useCallback(async () => {
    const { data } = await fetchPublicTrees();
    setPubTrees(data || []);
  }, []);

  // BUG FIX ②: loadTree が myTrees/pubTrees を closure でキャプチャするため
  // handleOpenTree 呼び出し時点のリストが空だと treeRow が見つからず null を返す。
  // treeId を直接 Supabase から引いて確実に取得する。
  const loadTree = useCallback(async (treeId) => {
    setLoading(true);
    try {
      // まず手持ちリストで探し、なければ DB から直接フェッチ
      let treeRow = [...myTrees, ...pubTrees].find(t => t.id === treeId);
      if (!treeRow) {
        const { data } = await fetchMyTrees(session?.user?.id);
        treeRow = (data || []).find(t => t.id === treeId);
      }
      if (!treeRow) return null;

      const { data: nodes } = await fetchNodes(treeId);
      const assembled = buildTreeFromNodes(treeRow, nodes || []);
      setActiveTree(assembled);
      return assembled;
    } finally {
      setLoading(false);
    }
  }, [myTrees, pubTrees, session]);

  const handleAuth = (_user, sess) => setSession(sess);

  const handleSignOut = async () => {
    await signOut();
    // BUG FIX ③: サインアウト後に profile もリセットしないと
    // 再ログイン時に前のユーザーのプロフィールが一瞬表示される
    setSession(null);
    setProfile(null);
    setActiveTree(null);
    setActiveNodeId(null);
    setMyTrees([]);
    setScreen("list");
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
      // BUG FIX ④: rootId が undefined のとき setNewNodeParentId(null) になり
      // NewNode が描画されない（App.jsx 193行目の条件 newNodeParentId が falsy）。
      // root ノードの id を正しく取得する。
      const rootId = activeTree?.rootId ?? Object.values(activeTree?.nodes || {}).find(n => n.isRoot)?.id ?? null;
      setNewNodeParentId(rootId);
      setScreen("new");
      return;
    }
    setActiveNodeId(nodeId);
    setScreen("node");
  };

  const handleNodeUpdate = async (nodeId, patch) => {
    await updateNode(nodeId, patch);
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

  // BUG FIX ⑤: ツリーコピー時、非 root ノードを parent_id 順に処理しないと
  // 親が idMap に登録される前に子を処理してしまい parentId が null になる。
  // BFS (幅優先) 順に並び替えてから insert する。
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

    // BFS 順に並び替え
    const nonRootNodes = srcNodes.filter(n => !n.is_root);
    const ordered = [];
    const queue = [rootSrc?.id].filter(Boolean);
    const visited = new Set(queue);
    while (queue.length) {
      const cur = queue.shift();
      const children = nonRootNodes.filter(n => n.parent_id === cur);
      for (const child of children) {
        if (!visited.has(child.id)) {
          visited.add(child.id);
          ordered.push(child);
          queue.push(child.id);
        }
      }
    }

    for (const n of ordered) {
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
