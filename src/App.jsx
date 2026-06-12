// ══════════════════════════════════════════════════
// App.jsx  ―  アプリのルート
//   セッション管理 / 画面遷移 / DB 操作の統括
// ══════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { AuthScreen, PublicTrees } from "./screensPublic";
import { TreeList } from "./screens/TreeListScreen";
import { MindMap } from "./screens/MindMapScreen";
import { NodeDetail } from "./screens/NodeDetailScreen";
import { TrophyScreen } from "./screens/TrophyScreen";
import {
  supabase,
  getSession, getProfile, signOut,
  fetchMyTrees, fetchPublicTrees, fetchNodes,
  createTree, createNode, updateNode, updateTree, deleteTree,
  buildTreeFromNodes, publishTree, deleteNodes, unpublishTree,
  countUserNodes, likeTree, collectTreeTags,
} from "./db";
import { recordLogin, getLoginStats, recordAction, getActions } from "./rewards";

export default function App() {
  const [session,          setSession]          = useState(undefined); // undefined = 未確定
  const [profile,          setProfile]          = useState(null);
  const [screen,           setScreen]           = useState("list");
  const [myTrees,          setMyTrees]          = useState([]);
  const [pubTrees,         setPubTrees]         = useState([]);
  const [activeTree,       setActiveTree]       = useState(null);
  const [activeNodeId,     setActiveNodeId]     = useState(null);
  const [loading,          setLoading]          = useState(false);
  const [nodeCount,        setNodeCount]        = useState(0);
  const [loginStats,       setLoginStats]       = useState({ totalDays: 0, streak: 0 });
  const [lastReparent,     setLastReparent]     = useState(null); // マインドマップの親付け替えUndo用

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
    recordLogin();
    setLoginStats(getLoginStats());
    loadMyTrees();
    loadPublicTrees();
    countUserNodes(session.user.id).then(setNodeCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // ── ツリー一覧の取得 ─────────────────────────
  const loadMyTrees = useCallback(async () => {
    if (!session) return;
    const { data } = await fetchMyTrees(session.user.id);
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
    setLastReparent(null);
    try {
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
    const tree = await loadTree(treeId);
    if (!tree) return;

    // ルートノードがなければ自動作成
    if (!tree.rootId) {
      const treeRow = myTrees.find(t => t.id === treeId);
      await createNode({
        treeId,
        userId: session.user.id,
        parentId: null,
        label: treeRow?.name || "戦法",
        isRoot: true,
        status: "todo",
      });
      const fixed = await loadTree(treeId);
      if (fixed) setScreen("map");
    } else {
      setScreen("map");
    }
  };

  const handleNewTree = async (name, tags = [], kifuSnapshots = null) => {
    const { data, error } = await createTree({ userId: session.user.id, name, tags });
    if (error || !data) { console.error("createTree error:", error); return; }

    const hasKifu = kifuSnapshots && kifuSnapshots.length > 0;
    const last = hasKifu ? kifuSnapshots[kifuSnapshots.length - 1] : null;

    const { error: nodeError } = await createNode({
      treeId: data.id, userId: session.user.id,
      parentId: null, label: name, isRoot: true, status: "todo",
      // 棋譜インポートがあれば、ルートノードに最終局面・棋譜を反映する
      board:        hasKifu ? last.board     : null,
      handSente:    hasKifu ? last.handSente : undefined,
      handGote:     hasKifu ? last.handGote  : undefined,
      kifu:         hasKifu ? kifuSnapshots  : [],
      kifuImported: hasKifu,
    });
    if (nodeError) console.error("createNode error:", nodeError);

    await loadMyTrees();
    // 作成したツリーをそのまま開く（手動で探してタップする手間を省く）
    await handleOpenTree(data.id);
  };

  const handleDeleteTree = async (treeId) => {
    await deleteTree(treeId);
    await loadMyTrees();
  };

  const handleEditTree = async (treeId, patch) => {
    await updateTree(treeId, patch);
    await loadMyTrees();
  };

  const handleMemoSave = async (treeId, memo) => {
    await updateTree(treeId, { quick_memo: memo });
    setMyTrees((prev) => prev.map((t) => t.id === treeId ? { ...t, quick_memo: memo } : t));
    if (memo.trim()) recordAction("memo");
  };

  const handlePublishTree = async (treeId) => {
    try {
      await publishTree(treeId);
      setMyTrees((prev) =>
        prev.map((t) => (t.id === treeId ? { ...t, is_public: true } : t))
      );
      recordAction("published");
    } catch (e) {
      console.error("公開失敗", e);
    }
  };

  const handleUnpublishTree = async (treeId) => {
    try {
      await unpublishTree(treeId);
      setMyTrees((prev) =>
        prev.map((t) => (t.id === treeId ? { ...t, is_public: false } : t))
      );
    } catch (e) {
      console.error("公開取り消し失敗", e);
    }
  };

  // ── ノード操作 ───────────────────────────────
  const handleNodeSelect = (nodeId) => {
    if (nodeId === "new") {
      const rootId = activeTree?.rootId
        ?? Object.values(activeTree?.nodes || {}).find(n => n.isRoot)?.id
        ?? null;
      handleNewNode(rootId);
      return;
    }
    setActiveNodeId(nodeId);
    setScreen("node");
  };

  const handleNodeUpdate = async (nodeId, patch) => {
    await updateNode(nodeId, patch);
    // ローカル state も即時反映
    setActiveTree(prev => {
      const nodes = { ...prev.nodes, [nodeId]: { ...prev.nodes[nodeId], ...patch } };
      const next = { ...prev, nodes };
      // 戦法タグが変わった場合、ツリー全体のタグ（全ノードのタグの集合）を再計算して保存する
      if (patch.tags) {
        const aggregated = collectTreeTags(nodes);
        next.tags = aggregated;
        updateTree(prev.id, { tags: aggregated });
        setMyTrees(mt => mt.map(t => t.id === prev.id ? { ...t, tags: aggregated } : t));
      }
      return next;
    });
  };

  // ── ノードの親を付け替える（マインドマップのドラッグ操作） ──
  const reparentNode = useCallback(async (nodeId, newParentId) => {
    await updateNode(nodeId, { parentId: newParentId });
    setActiveTree((prev) => {
      const nodes = { ...prev.nodes };
      const node  = nodes[nodeId];
      if (!node) return prev;
      const oldParentId = node.parentId;
      // 旧親の childIds から外す
      if (oldParentId && nodes[oldParentId]) {
        nodes[oldParentId] = {
          ...nodes[oldParentId],
          childIds: (nodes[oldParentId].childIds || []).filter((id) => id !== nodeId),
        };
      }
      // 新親の childIds に追加
      if (nodes[newParentId]) {
        nodes[newParentId] = {
          ...nodes[newParentId],
          childIds: [...(nodes[newParentId].childIds || []), nodeId],
        };
      }
      nodes[nodeId] = { ...node, parentId: newParentId };
      return { ...prev, nodes };
    });
  }, []);

  const handleReparentNode = async (nodeId, newParentId) => {
    const oldParentId = activeTree?.nodes?.[nodeId]?.parentId ?? null;
    await reparentNode(nodeId, newParentId);
    setLastReparent({ nodeId, oldParentId, newParentId });
  };

  // ── 直前の親付け替えを1回だけ取り消す ──
  const handleUndoReparent = async () => {
    if (!lastReparent) return;
    const { nodeId, oldParentId } = lastReparent;
    await reparentNode(nodeId, oldParentId);
    setLastReparent(null);
  };

  // ── 合流（複数の親→1つの子）の親リストを更新する ──
  const handleSetMergeParents = async (nodeId, mergeParentIds) => {
    await updateNode(nodeId, {
      mergeParentIds,
      isMergeTarget: mergeParentIds.length > 0,
    });
    setActiveTree((prev) => ({
      ...prev,
      nodes: {
        ...prev.nodes,
        [nodeId]: {
          ...prev.nodes[nodeId],
          mergeParentIds,
          isMergeTarget: mergeParentIds.length > 0,
        },
      },
    }));
  };

  const handleNewNode = async (parentId) => {
    if (!activeTree || !session) return;
    const { data: newNode } = await createNode({
      treeId:   activeTree.id,
      userId:   session.user.id,
      parentId: parentId,
      label:    "新しいノード",
      status:   "wip",
    });
    if (!newNode) return;
    await loadTree(activeTree.id);
    refreshNodeCount();
    setActiveNodeId(newNode.id);
    setScreen("node");
  };

  // ── 棋譜の途中局面から分岐ノードを作成する ──
  // できる分岐先は通常の新規ノード扱い（元の棋譜は引き継がない）
  const handleBranchFromKifu = async (parentNodeId, snapshot, moveIndex) => {
    if (!activeTree || !session) return;
    const { data: newNode } = await createNode({
      treeId:    activeTree.id,
      userId:    session.user.id,
      parentId:  parentNodeId,
      label:     "新しいノード",
      status:    "wip",
      board:     snapshot.board,
      handSente: snapshot.handSente,
      handGote:  snapshot.handGote,
      branchFromMoveIndex: moveIndex ?? null,
    });
    if (!newNode) return;
    await loadTree(activeTree.id);
    refreshNodeCount();
    setActiveNodeId(newNode.id);
    setScreen("node");
  };

  const handleDeleteNode = async (idsToDelete, parentId) => {
    try {
      await deleteNodes(idsToDelete);
      setActiveTree((prev) => {
        const newNodes = { ...prev.nodes };
        idsToDelete.forEach((id) => delete newNodes[id]);
        if (parentId && newNodes[parentId]) {
          newNodes[parentId] = {
            ...newNodes[parentId],
            childIds: (newNodes[parentId].childIds || []).filter(
              (id) => !idsToDelete.includes(id)
            ),
          };
        }
        return { ...prev, nodes: newNodes };
      });
      // 削除後、親ノードか（なければ）マップに戻る
      if (parentId) {
        setActiveNodeId(parentId);
        setScreen("node");
      } else {
        setScreen("map");
      }
      refreshNodeCount();
    } catch (e) {
      console.error("ノード削除失敗", e);
    }
  };
  const refreshNodeCount = useCallback(async () => {
    if (!session) return;
    const cnt = await countUserNodes(session.user.id);
    setNodeCount(cnt);
  }, [session]);

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
      const { data: nr } = await createNode({ treeId: newTree.id, userId: session.user.id, parentId: null, label: rootSrc.label, isRoot: true, status: rootSrc.status, approachType: rootSrc.approach_type, memo: rootSrc.memo || "", board: rootSrc.board, stamps: rootSrc.stamps || [], tags: rootSrc.tags || [], handSente: rootSrc.hand_sente, handGote: rootSrc.hand_gote, kifu: rootSrc.kifu || [], kifuImported: rootSrc.kifu_imported || false, usageLevel: rootSrc.usage_level ?? 2, winRate: rootSrc.win_rate ?? null, sortOrder: rootSrc.sort_order || 0 });
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
      const { data: nn } = await createNode({ treeId: newTree.id, userId: session.user.id, parentId: idMap[n.parent_id] || null, label: n.label, status: n.status, approachType: n.approach_type, memo: n.memo || "", board: n.board, stamps: n.stamps || [], tags: n.tags || [], handSente: n.hand_sente, handGote: n.hand_gote, kifu: n.kifu || [], kifuImported: n.kifu_imported || false, branchFromMoveIndex: n.branch_from_move_index ?? null, usageLevel: n.usage_level ?? 2, winRate: n.win_rate ?? null, sortOrder: n.sort_order || 0 });
      if (nn) idMap[n.id] = nn.id;
    }

    // 合流関係（isMergeTarget / mergeParentIds）を新IDで復元
    for (const n of srcNodes) {
      const mergeParentIds = (n.merge_parent_ids || []).map(pid => idMap[pid]).filter(Boolean);
      if (n.is_merge_target || mergeParentIds.length > 0) {
        await updateNode(idMap[n.id], { isMergeTarget: !!n.is_merge_target, mergeParentIds });
      }
    }

    recordAction("copied");
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

  // ── レンダリング ─────────────────────────────
  return (
    <div style={{ height:"100dvh", background:"#faf4e8", display:"flex", flexDirection:"column" }}>
      <div style={{ flex:1, overflow:"hidden", position:"relative", minHeight:0 }}>
        {loading && (
          <div style={{ position:"absolute", inset:0, background:"rgba(250,244,232,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}>
            <div style={{ color:"#a07840", fontSize:13, letterSpacing:"0.15em" }}>読み込み中...</div>
          </div>
        )}

        {screen==="list" && (
          <TreeList trees={myTrees} profile={profile}
            onOpen={handleOpenTree}
            onPublic={() => { setScreen("public"); loadPublicTrees(); }}
            onTrophy={() => setScreen("trophy")}
            onNewTree={handleNewTree} onSignOut={handleSignOut}
            onDeleteTree={handleDeleteTree} onEditTree={handleEditTree}
            onPublish={handlePublishTree} onUnpublish={handleUnpublishTree}
            onMemoSave={handleMemoSave}/>
        )}
        {screen==="trophy" && (() => {
          const acts = getActions();
          const extraStats = {
            hasPublished: myTrees.some(t => t.is_public),
            hasMemo:      myTrees.some(t => (t.quick_memo || "").trim().length > 0),
            hasTags:      myTrees.some(t => (t.tags || []).length > 0),
            hasCopied:    !!acts.copied,
            hasLiked:     !!acts.liked,
            hasApproach:  !!acts.approach,
            hasKifu:      !!acts.kifu,
            hasTemplate:  !!acts.template,
            hasCustomTag: !!acts.customTag,
          };
          return (
            <TrophyScreen
              onBack={() => setScreen("list")}
              treeCount={myTrees.length}
              nodeCount={nodeCount}
              loginStats={loginStats}
              extraStats={extraStats}/>
          );
        })()}
        {screen==="map" && activeTree && (
          <MindMap tree={activeTree} onNodeSelect={handleNodeSelect}
            onBack={() => setScreen("list")} onReparent={handleReparentNode}
            canUndoReparent={!!lastReparent} onUndoReparent={handleUndoReparent}/>
        )}
        {screen==="node" && activeTree && activeNodeId && (
          <NodeDetail tree={activeTree} nodeId={activeNodeId}
            onBack={() => setScreen("map")} onNodeSelect={handleNodeSelect}
            onNewNode={handleNewNode} onUpdate={handleNodeUpdate}
            onDeleteNode={handleDeleteNode} onSetMergeParents={handleSetMergeParents}
            onBranchFromKifu={handleBranchFromKifu}/>
        )}
        {screen==="public" && (
          <PublicTrees trees={pubTrees} profile={profile}
            onBack={() => setScreen("list")}
            onCopy={handleCopyTree}
            onLike={(treeId) => session && likeTree(session.user.id, treeId)}
            onRefresh={loadPublicTrees}/>
        )}
      </div>
    </div>
  );
}
