// ══════════════════════════════════════════════════
// App.jsx  ―  アプリのルート
//   URL→画面の合成 / 変更操作（DB更新＋treeOps＋遷移）の統括。
//   状態の保持・取得は hooks/（useAuth / useTreeData 等）と
//   onboarding.jsx に分解してある。
// ══════════════════════════════════════════════════
import { useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation, matchPath } from "react-router-dom";
import { AuthScreen, PublicTrees, PublicTreePreview } from "./screensPublic";
import { TreeList } from "./screens/TreeListScreen";
import { MindMap } from "./screens/MindMapScreen";
import { NodeDetail } from "./screens/NodeDetailScreen";
import { TrophyScreen } from "./screens/TrophyScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import {
  createTree, createNode, updateNode, updateTree, deleteTree, copyTree,
  nodeRowToNode, publishTree, deleteNodes, unpublishTree,
  likeTree, unlikeTree,
} from "./db";
// ツリー変更ロジック（childIds / merge_parent_ids / tags の整合）を一本化した純粋関数群。
// 各ハンドラは DB 更新後にこれらでローカルツリーを組み替える（手作業の整合を排除）。
import { nextSortOrder, addNode, applyNodePatch, reparent as reparentTree, setMergeParents as setMergeParentsTree, removeNodes } from "./treeOps";
import { recordAction, getActions, resetOnboard } from "./rewards";
import { cloneBoard } from "./theme";
import { useAuth } from "./hooks/useAuth";
import { useTreeData } from "./hooks/useTreeData";
import { useFridayToast } from "./hooks/useFridayToast";
import { useFontScale } from "./hooks/useFontScale";
import { useRecoveryCode } from "./hooks/useRecoveryCode";
import { RecoveryCodeModal } from "./components/RecoveryCodeModal";
import { useOnboarding, OnboardingLayer } from "./onboarding";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // ── 画面はURLから導出する（screen 文字列stateは廃止）──
  // URL ↔ 画面を一致させることで、局面の共有リンク・ブラウザの戻る・ブックマークが効く。
  // 画面名（screen）はオンボーディング等の既存ロジックがそのまま使える形で算出する。
  const route = useMemo(() => {
    const p = location.pathname;
    let m;
    if ((m = matchPath("/tree/:treeId/node/:nodeId", p))) return { screen: "node",          treeId: m.params.treeId, nodeId: m.params.nodeId };
    if ((m = matchPath("/tree/:treeId/preview",      p))) return { screen: "publicPreview",  treeId: m.params.treeId, nodeId: null };
    if ((m = matchPath("/tree/:treeId",              p))) return { screen: "map",            treeId: m.params.treeId, nodeId: null };
    if (matchPath("/public",   p)) return { screen: "public",   treeId: null, nodeId: null };
    if (matchPath("/trophy",   p)) return { screen: "trophy",   treeId: null, nodeId: null };
    if (matchPath("/settings", p)) return { screen: "settings", treeId: null, nodeId: null };
    return { screen: "list", treeId: null, nodeId: null };
  }, [location.pathname]);
  const screen       = route.screen;
  const activeNodeId = route.nodeId;

  // ── 状態は関心ごとのフックに分解してある ──
  const { session, profile, loginStats, devStats, handleAuth, handleSignOutAuth } = useAuth();
  const {
    myTrees, setMyTrees, pubTrees, activeTree, setActiveTree,
    loading, nodeCount, setNodeCount, likedTreeIds,
    reparentStack, setReparentStack,
    loadMyTrees, loadPublicTrees, loadTree, refreshNodeCount, clearTreeData,
  } = useTreeData(session);
  const fridayToast = useFridayToast(session);
  const [fontScale, handleFontScaleChange] = useFontScale();
  // リカバリーコード：未発行ならログイン直後に発行し、スクショ案内モーダルを表示する
  const { newCode: recoveryCode, regenerate: regenerateRecoveryCode, dismiss: dismissRecoveryCode } =
    useRecoveryCode(session);
  const { onboard, fingerPos, advanceOnboard, startBoardOnboard } =
    useOnboarding({ screen, session, activeTree });

  // ── ディープリンク：URL の treeId に対応するツリーを読み込む ──
  // URL直打ち・ブックマーク・リロードでも該当ツリー（/ノード）を表示できるようにする。
  // 既読み込み済み・読み込み中は再取得しない（多重防止）。
  const loadingTreeRef = useRef(null);
  useEffect(() => {
    if (!session) return;
    const treeId = route.treeId;
    if (!treeId) return;
    if (activeTree && activeTree.id === treeId) return;
    if (loadingTreeRef.current === treeId) return;
    loadingTreeRef.current = treeId;
    loadTree(treeId)
      .then((t) => { loadingTreeRef.current = null; if (!t) navigate("/", { replace: true }); })
      .catch(() => { loadingTreeRef.current = null; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.treeId, session, activeTree]);

  // みんなのツリー画面に入ったら最新の公開一覧を取得する（ディープリンク対応）
  useEffect(() => {
    if (session && screen === "public") loadPublicTrees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, session]);

  // ── Auth ハンドラ ────────────────────────────
  // 認証側の後始末（signOut・実績キャッシュ・session/profile クリア）は useAuth、
  // 画面側の後始末（ツリー state クリア・一覧へ遷移）はここで行う。
  const handleSignOut = async () => {
    await handleSignOutAuth();
    clearTreeData();
    navigate("/");
  };

  // ── ツリー操作 ───────────────────────────────
  const handleOpenTree = async (treeId) => {
    const tree = await loadTree(treeId);
    if (!tree) return;
    setReparentStack([]);

    // ルートノードがなければ自動作成
    if (!tree.rootId) {
      // ラベルは読み込んだツリーの名前を使う。myTrees に限定すると公開ツリー経由や
      // 一覧未ロード時に名前が取れず "戦法" 固定になってしまうため。
      await createNode({
        treeId,
        userId: session.user.id,
        parentId: null,
        label: tree.name || "戦法",
        isRoot: true,
        status: "todo",
        board: cloneBoard(null),
      });
      const fixed = await loadTree(treeId);
      if (fixed) navigate(`/tree/${treeId}`);
    } else {
      navigate(`/tree/${treeId}`);
    }
  };

  const handleNewTree = async (name, tags = [], kifuSnapshots = null) => {
    const { data, error } = await createTree({ userId: session.user.id, name, tags });
    if (error || !data) {
      console.error("createTree error:", error);
      alert("ツリーの作成に失敗しました。もう一度お試しください。");
      return;
    }

    const hasKifu = kifuSnapshots && kifuSnapshots.length > 0;
    const last = hasKifu ? kifuSnapshots[kifuSnapshots.length - 1] : null;

    const { data: rootNode, error: nodeError } = await createNode({
      treeId: data.id, userId: session.user.id,
      parentId: null, label: name, isRoot: true, status: "todo",
      // 棋譜インポートがあれば、ルートノードに最終局面・棋譜を反映する
      board:        hasKifu ? last.board     : cloneBoard(null),
      handSente:    hasKifu ? last.handSente : undefined,
      handGote:     hasKifu ? last.handGote  : undefined,
      kifu:         hasKifu ? kifuSnapshots  : [],
      kifuImported: hasKifu,
    });
    if (nodeError) {
      console.error("createNode error:", nodeError);
      alert("ツリーの作成に失敗しました。もう一度お試しください。");
    }

    // 相手の戦法（居飛車 / 振り飛車）の子ノードを2つ自動作成する（並行実行で往復を短縮）
    if (rootNode) {
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        createNode({
          treeId: data.id, userId: session.user.id,
          parentId: rootNode.id, label: "居飛車", status: "todo",
          situation: ["居飛車"], sortOrder: 0,
        }),
        createNode({
          treeId: data.id, userId: session.user.id,
          parentId: rootNode.id, label: "振り飛車", status: "todo",
          situation: ["振り飛車"], sortOrder: 1,
        }),
      ]);
      if (e1) console.error("createNode error:", e1);
      if (e2) console.error("createNode error:", e2);
    }

    await loadMyTrees();
    refreshNodeCount(); // 自動生成した子ノード分をトロフィーの数値に反映する
    // 作成したツリーをそのまま開く（手動で探してタップする手間を省く）
    await handleOpenTree(data.id);
  };

  const handleDeleteTree = async (treeId) => {
    const { error } = await deleteTree(treeId);
    if (error) { alert("削除に失敗しました。もう一度お試しください。"); return; }
    await loadMyTrees();
    refreshNodeCount(); // ツリーと一緒に消えたノード分をトロフィーの数値に反映する
  };

  const handleEditTree = async (treeId, patch) => {
    const { error } = await updateTree(treeId, patch);
    if (error) { alert("保存に失敗しました。もう一度お試しください。"); return; }

    // ルートノード名はツリー名と常に同一に保つ（ルート名はツリー名からのみ変更できる仕様）。
    // ツリー名が変わったときだけ、ルートノードのラベルも追従させる。
    const treeRow = myTrees.find((t) => t.id === treeId);
    if (patch.name && treeRow && patch.name !== treeRow.name) {
      const rootRow = (treeRow.nodes || []).find((n) => n.is_root);
      if (rootRow) {
        await updateNode(rootRow.id, { label: patch.name });
        setActiveTree((prev) =>
          prev && prev.id === treeId && prev.nodes[rootRow.id]
            ? { ...prev, name: patch.name, nodes: { ...prev.nodes, [rootRow.id]: { ...prev.nodes[rootRow.id], label: patch.name } } }
            : prev
        );
      }
    }
    await loadMyTrees();
  };

  const handleMemoSave = async (treeId, memo) => {
    const { error } = await updateTree(treeId, { quick_memo: memo });
    if (error) { alert("メモの保存に失敗しました。もう一度お試しください。"); return; }
    setMyTrees((prev) => prev.map((t) => t.id === treeId ? { ...t, quick_memo: memo } : t));
    setActiveTree((prev) => prev && prev.id === treeId ? { ...prev, quickMemo: memo } : prev);
  };

  // 失敗時は例外をそのまま投げ、呼び出し元（EditTreeModal）がエラーメッセージを表示する
  const handlePublishTree = async (treeId) => {
    await publishTree(treeId);
    setMyTrees((prev) =>
      prev.map((t) => (t.id === treeId ? { ...t, is_public: true } : t))
    );
  };

  const handleUnpublishTree = async (treeId) => {
    await unpublishTree(treeId);
    setMyTrees((prev) =>
      prev.map((t) => (t.id === treeId ? { ...t, is_public: false } : t))
    );
  };

  // ── ノード操作 ───────────────────────────────
  const handleNodeSelect = (nodeId) => {
    if (!activeTree) return;
    navigate(`/tree/${activeTree.id}/node/${nodeId}`);
  };

  // 保存の成否を返す（呼び出し側が失敗時に表示を元に戻せるように）
  const handleNodeUpdate = async (nodeId, patch) => {
    const { error } = await updateNode(nodeId, patch);
    if (error) { alert("保存に失敗しました。もう一度お試しください。"); return false; }

    // 戦法タグが変わった場合のみ、ツリー全体のタグを再計算する。
    // タグは updater の外（closureのactiveTree）で1回だけ算出し、副作用（DB保存・別state更新）も
    // updater の外で実行する。setActiveTree の更新関数内で副作用を起こすと StrictMode で2回走り、
    // updateTree がDBへ二重書き込みされるため。
    const recomputeTags = !!(patch.situation || patch.myApproach || patch.usageLevel);
    const tags = recomputeTags && activeTree
      ? applyNodePatch(activeTree, nodeId, patch, { recomputeTags: true }).tags
      : null;

    // ローカル state も即時反映（純粋な更新のみ。タグは事前算出値を上書き）
    setActiveTree(prev => {
      if (!prev) return prev;
      const { tree } = applyNodePatch(prev, nodeId, patch);
      return tags ? { ...tree, tags } : tree;
    });

    if (tags && activeTree) {
      const treeId = activeTree.id;
      updateTree(treeId, { tags });
      setMyTrees(mt => mt.map(t => t.id === treeId ? { ...t, tags } : t));
    }
    return true;
  };

  // ── ノードの親を付け替える（マインドマップのドラッグ操作） ──
  const reparentNode = async (nodeId, newParentId) => {
    // 並び順も新親の末尾に更新する。ローカルでは childIds の末尾に追加されるため、
    // sort_order が旧親時代のままだとリロード時に並び順が変わって位置が跳ねてしまう。
    const sortOrder = nextSortOrder(activeTree, newParentId);
    const { error } = await updateNode(nodeId, { parentId: newParentId, sortOrder });
    if (error) { alert("移動に失敗しました。もう一度お試しください。"); return; }
    setActiveTree((prev) => reparentTree(prev, nodeId, newParentId, sortOrder));
  };

  const handleReparentNode = async (nodeId, newParentId) => {
    const oldParentId = activeTree?.nodes?.[nodeId]?.parentId ?? null;
    await reparentNode(nodeId, newParentId);
    setReparentStack((prev) => [...prev, { nodeId, oldParentId, newParentId }]);
  };

  // ── マインドマップを開いてからの親付け替えを1手ずつ取り消す ──
  const handleUndoReparent = async () => {
    if (reparentStack.length === 0) return;
    const { nodeId, oldParentId } = reparentStack[reparentStack.length - 1];
    await reparentNode(nodeId, oldParentId);
    setReparentStack((prev) => prev.slice(0, -1));
  };

  // ── 合流（複数の親→1つの子）の親リストを更新する ──
  const handleSetMergeParents = async (nodeId, mergeParentIds) => {
    const { error } = await updateNode(nodeId, {
      mergeParentIds,
      isMergeTarget: mergeParentIds.length > 0,
    });
    if (error) { alert("保存に失敗しました。もう一度お試しください。"); return; }
    setActiveTree((prev) => setMergeParentsTree(prev, nodeId, mergeParentIds));
  };

  const handleNewNode = async (parentId) => {
    if (!activeTree || !session) return;
    const { data: newNode } = await createNode({
      treeId:   activeTree.id,
      userId:   session.user.id,
      parentId: parentId,
      label:    "新しいノード",
      status:   "wip",
      sortOrder: nextSortOrder(activeTree, parentId),
    });
    if (!newNode) { alert("ノードの追加に失敗しました。もう一度お試しください。"); return; }
    // 全件再フェッチせず、作成ノードをローカルツリーへマージ（ネットワーク往復を削減）
    setActiveTree(prev => addNode(prev, nodeRowToNode(newNode)));
    setNodeCount(c => c + 1);
    navigate(`/tree/${activeTree.id}/node/${newNode.id}`);
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
      sortOrder: nextSortOrder(activeTree, parentNodeId),
    });
    if (!newNode) { alert("分岐ノードの追加に失敗しました。もう一度お試しください。"); return; }
    // 全件再フェッチせず、作成ノードをローカルツリーへマージ（ネットワーク往復を削減）
    setActiveTree(prev => addNode(prev, nodeRowToNode(newNode)));
    setNodeCount(c => c + 1);
    navigate(`/tree/${activeTree.id}/node/${newNode.id}`);
  };

  const handleDeleteNode = async (idsToDelete, parentId) => {
    try {
      await deleteNodes(idsToDelete);

      // childIds掃除・合流参照掃除・タグ再計算を treeOps で一括整合する。
      // 副作用（DB保存・別state更新）は StrictMode 二重実行を避けるため updater の外で行う。
      const { tree, mergeCleanups, tags } = removeNodes(activeTree, idsToDelete, parentId);

      // 削除ノードを「合流親」に持っていた残りノードの参照掃除をDBへ反映する
      // （放置すると他ノードの merge_parent_ids に削除済みIDが残り続けるため）
      await Promise.all(
        mergeCleanups.map((c) =>
          updateNode(c.id, { mergeParentIds: c.mergeParentIds, isMergeTarget: c.isMergeTarget })
        )
      );

      // タグが変化していれば、一覧カード・公開フィルタ向けのツリータグをDBへ反映する
      if (tags) {
        const treeId = activeTree.id;
        updateTree(treeId, { tags });
        setMyTrees((mt) => mt.map((t) => t.id === treeId ? { ...t, tags } : t));
      }

      setActiveTree(tree);
      // 削除後、親ノードか（なければ）マップに戻る
      if (parentId) {
        navigate(`/tree/${activeTree.id}/node/${parentId}`);
      } else {
        navigate(`/tree/${activeTree.id}`);
      }
      refreshNodeCount();
    } catch (e) {
      console.error("ノード削除失敗", e);
      alert("ノードの削除に失敗しました。もう一度お試しください。");
    }
  };

  // ── 公開ツリーのプレビュー（閲覧専用でマップ・ノードの中身を見る）──
  const handleOpenPublicTree = async (treeId) => {
    const tree = await loadTree(treeId);
    if (!tree) { alert("ツリーの読み込みに失敗しました。もう一度お試しください。"); return; }
    navigate(`/tree/${treeId}/preview`);
  };

  // ── 公開ツリーのコピー（サーバー側RPCで1トランザクション一括コピー）──
  const handleCopyTree = async (pubTreeId) => {
    const pubTreeRow = pubTrees.find(t => t.id === pubTreeId);
    if (!pubTreeRow || !session) return;

    const { data: newTreeId, error } = await copyTree(pubTreeId, pubTreeRow.name + "（コピー）");
    if (error || !newTreeId) {
      console.error("copyTree error:", error);
      alert("コピーに失敗しました。もう一度お試しください。");
      return;
    }

    recordAction("copied");
    await loadMyTrees();
    refreshNodeCount(); // コピーで増えたノード分をトロフィーの数値に反映する
  };

  // ── ローディング中 / 未ログイン ──────────────
  if (session === undefined) {
    return (
      <div style={{ minHeight:"100dvh", background:"#0d0800", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ color:"rgba(200,169,110,0.4)", fontSize:"0.875rem", letterSpacing:"0.2em" }}>読み込み中...</div>
      </div>
    );
  }
  if (!session) return <AuthScreen onAuth={handleAuth}/>;

  // ── レンダリング ─────────────────────────────
  return (
    <div style={{ height:"100dvh", background:"#faf4e8", display:"flex", flexDirection:"column" }}>

      {/* 金曜夜トースト（全画面共通） */}
      {fridayToast && (
        <div style={{
          position:     "fixed",
          top:          16,
          left:         "50%",
          transform:    "translateX(-50%)",
          zIndex:       200,
          background:   "rgba(26,15,0,0.88)",
          color:        "#faf4e8",
          fontSize:     "0.875rem",
          fontFamily:   "'Noto Serif JP', serif",
          padding:      "10px 20px",
          borderRadius: 24,
          whiteSpace:   "nowrap",
          display:      "flex",
          alignItems:   "center",
          gap:          8,
          boxShadow:    "0 4px 20px rgba(26,15,0,0.3)",
        }}>
          <i className="ti ti-book" style={{ fontSize: "0.875rem" }} />
          {fridayToast}
        </div>
      )}

      {/* 初回オンボーディング（使い方トースト＋指さし。実装は onboarding.jsx） */}
      <OnboardingLayer onboard={onboard} fingerPos={fingerPos} onAdvance={advanceOnboard} />

      {/* リカバリーコードの保存案内（発行直後のみ・全画面。ラベル＋コードのみ表示） */}
      {recoveryCode && (
        <RecoveryCodeModal code={recoveryCode} onClose={dismissRecoveryCode} />
      )}

      <div style={{ flex:1, overflow:"hidden", position:"relative", minHeight:0 }}>
        {loading && (
          <div style={{ position:"absolute", inset:0, background:"rgba(250,244,232,0.8)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100 }}>
            <div style={{ color:"#a07840", fontSize:"0.8125rem", letterSpacing:"0.15em" }}>読み込み中...</div>
          </div>
        )}

        {screen==="list" && (
          <TreeList trees={myTrees} profile={profile}
            onOpen={handleOpenTree}
            onPublic={() => navigate("/public")}
            onTrophy={() => navigate("/trophy")}
            onSettings={() => navigate("/settings")}
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
            hasKifu:      !!acts.kifu,
            hasTemplate:  !!acts.template,
            hasCustomTag: !!acts.customTag,
          };
          return (
            <TrophyScreen
              onBack={() => navigate("/")}
              treeCount={myTrees.length}
              nodeCount={nodeCount}
              loginStats={loginStats}
              extraStats={extraStats}/>
          );
        })()}
        {screen==="map" && activeTree && (
          <MindMap tree={activeTree} onNodeSelect={handleNodeSelect}
            onBack={() => navigate("/")} onReparent={handleReparentNode}
            canUndoReparent={reparentStack.length > 0} onUndoReparent={handleUndoReparent}
            onMemoSave={handleMemoSave}/>
        )}
        {screen==="node" && activeTree && activeNodeId && activeTree.nodes[activeNodeId] && (
          <NodeDetail tree={activeTree} nodeId={activeNodeId}
            onBack={() => navigate(`/tree/${activeTree.id}`)} onNodeSelect={handleNodeSelect}
            onNewNode={handleNewNode} onUpdate={handleNodeUpdate}
            onDeleteNode={handleDeleteNode} onSetMergeParents={handleSetMergeParents}
            onReparentNode={handleReparentNode}
            onBranchFromKifu={handleBranchFromKifu}
            onBoardFirstShown={startBoardOnboard}/>
        )}
        {screen==="settings" && (
          <SettingsScreen onBack={() => navigate("/")}
            fontScale={fontScale} onFontScaleChange={handleFontScaleChange}
            onResetOnboard={() => { resetOnboard(); navigate("/"); }}
            onRegenerateRecovery={regenerateRecoveryCode}
            username={profile?.username}
            devStats={devStats}/>
        )}
        {screen==="public" && (
          <PublicTrees trees={pubTrees}
            likedTreeIds={likedTreeIds}
            onBack={() => navigate("/")}
            onCopy={handleCopyTree}
            onLike={(treeId) => session && likeTree(session.user.id, treeId)}
            onUnlike={(treeId) => session && unlikeTree(session.user.id, treeId)}
            onRefresh={loadPublicTrees}
            onOpenTree={handleOpenPublicTree}/>
        )}
        {screen==="publicPreview" && activeTree && (
          <PublicTreePreview tree={activeTree}
            onBack={() => navigate("/public")}
            onCopy={() => handleCopyTree(activeTree.id)}/>
        )}
      </div>
    </div>
  );
}
