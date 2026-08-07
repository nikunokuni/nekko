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
import { KifuList } from "./screens/KifuListScreen";
import { KifuInsight } from "./screens/KifuInsightScreen";
import { NodeSearch } from "./screens/NodeSearchScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import {
  createTree, createNode, updateNode, updateTree, deleteTree, copyTree,
  nodeRowToNode, publishTree, deleteNodes, unpublishTree, setTreeCollaborative,
  likeTree, unlikeTree, ensureInboxNode,
} from "./db";
// ツリー変更ロジック（childIds / merge_parent_ids / tags の整合）を一本化した純粋関数群。
// 各ハンドラは DB 更新後にこれらでローカルツリーを組み替える（手作業の整合を排除）。
import { nextSortOrder, addNode, applyNodePatch, reparent as reparentTree, setMergeParents as setMergeParentsTree, removeNodes, maxDepthFromRows } from "./treeOps";
import { recordAction, getActions, resetOnboard, getKifuPlayerNames } from "./rewards";
import { cloneBoard } from "./theme";
import { useAuth } from "./hooks/useAuth";
import { useTreeData } from "./hooks/useTreeData";
import { useFontScale } from "./hooks/useFontScale";
import { useRecoveryCode } from "./hooks/useRecoveryCode";
import { RecoveryCodeModal } from "./components/RecoveryCodeModal";
import { UpdateBanner } from "./components/UpdateBanner";
import { usePwaUpdate } from "./hooks/usePwaUpdate";
import { useOnboarding, OnboardingLayer } from "./onboarding";
import { showToast, ToastLayer } from "./toast";

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
    if (matchPath("/search",   p)) return { screen: "search",   treeId: null, nodeId: null };
    if (matchPath("/kifus/insight", p)) return { screen: "kifuInsight", treeId: null, nodeId: null };
    if (matchPath("/kifus",    p)) return { screen: "kifus",    treeId: null, nodeId: null };
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
    loading, nodeCount, setNodeCount, kifuCount, likedTreeIds,
    reparentStack, setReparentStack,
    loadMyTrees, loadPublicTrees, loadTree, refreshNodeCount, refreshKifuCount, clearTreeData,
  } = useTreeData(session);
  const [fontScale, handleFontScaleChange] = useFontScale();
  // リカバリーコード：未発行ならログイン直後に発行し、スクショ案内モーダルを表示する
  const { newCode: recoveryCode, regenerate: regenerateRecoveryCode, dismiss: dismissRecoveryCode } =
    useRecoveryCode(session);
  const { onboard, fingerPos, advanceOnboard, startBoardOnboard } =
    useOnboarding({ screen, session, activeTree });
  // 新バージョンの検知（Service Worker）。検知したら画面上部にバナーを出す
  const { needRefresh, update: applyUpdate } = usePwaUpdate();

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

  // トロフィー画面に入るたびに棋譜の件数を取り直す。
  // 棋譜の増減は棋譜ライブラリの中で完結していて、ここには伝わってこないので、
  // 初回取得のままだと「10局ためた直後に見に行ったのにまだ埋まっていない」になる
  useEffect(() => {
    if (session && screen === "trophy") refreshKifuCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, session]);

  // ── 開いているツリーとの関係 ──────────────────────
  // 自分のツリーか、「みんなで編集」の公開ツリーかで、触れる範囲が変わる。
  //   中身（ノードの追加・編集・削除）… 自分のツリー / みんなで編集ツリーの両方
  //   器（ツリー名・公開・一言メモ・削除）… 自分のツリーだけ
  const isOwnTree = !!activeTree && (!activeTree.userId || activeTree.userId === session?.user?.id);
  const isCollabGuest = !!activeTree && !isOwnTree && activeTree.isCollaborative;

  // ノードの持ち主は「開いた人」ではなく「ツリーの持ち主」にそろえる。
  // 編集した人を持ち主にすると、その人のノード検索（自分の全ノード）と
  // トロフィーの数に、他人のツリーのノードが混ざってしまう。
  // 自分のツリーではどちらも同じ値になるので、分岐は要らない。
  const treeOwnerId = (tree) => tree?.userId || session?.user?.id || null;

  // 他人のツリーを編集しているときは、戻り先も「みんなのツリー」にする。
  // 自分のツリー一覧へ戻すと、そこに無いツリーを閉じたことになって迷子になる
  const treeBackPath = isOwnTree ? "/" : "/public";

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

  const handleNewTree = async (name, tags = []) => {
    const { data, error } = await createTree({ userId: session.user.id, name, tags });
    if (error || !data) {
      console.error("createTree error:", error);
      showToast("ツリーの作成に失敗しました。もう一度お試しください。");
      return;
    }

    const { data: rootNode, error: nodeError } = await createNode({
      treeId: data.id, userId: session.user.id,
      parentId: null, label: name, isRoot: true, status: "todo",
      board: cloneBoard(null),
    });
    if (nodeError) {
      console.error("createNode error:", nodeError);
      showToast("ツリーの作成に失敗しました。もう一度お試しください。");
    }

    // 相手の戦法（居飛車 / 振り飛車）の子ノードを2つ自動作成する（並行実行で往復を短縮）。
    // あわせて「とりあえず」（どこに置くか決まっていないものの置き場）も用意する。
    if (rootNode) {
      const [{ error: e0 }, { error: e1 }, { error: e2 }] = await Promise.all([
        createNode({
          treeId: data.id, userId: session.user.id,
          parentId: rootNode.id, label: "とりあえず", status: "todo",
          isInbox: true, whenToUse: "どこに置くか決まっていないもの",
          sortOrder: 9999,
        }),
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
      if (e0) console.error("createNode error(とりあえず):", e0);
      if (e1) console.error("createNode error:", e1);
      if (e2) console.error("createNode error:", e2);
    }

    await loadMyTrees();
    refreshNodeCount(); // 自動生成した子ノード分をトロフィーの数値に反映する
    // 作成したツリーをそのまま開く（手動で探してタップする手間を省く）
    await handleOpenTree(data.id);
  };

  // ── 棋譜からノードを作って「とりあえず」に入れる ──
  // 棋譜を見ていて「これは残しておきたい」と思ったときに、置き場所を決めずに
  // ツリーへ送れるようにする。整理は後から通常のつなぎ替えで行う。
  //
  // range = { start, end }（手数）が来たらその区間だけを切り取る。1局を丸ごと入れても
  // 見返すときにまた同じ所まで再生することになるので、残したい所だけを持たせる。
  // range 無し（未指定）は棋譜全体。
  const handleSendKifuToInbox = async (treeId, kifu, range) => {
    if (!session) return false;
    const inbox = await ensureInboxNode(treeId, session.user.id);
    if (!inbox) { showToast("「とりあえず」を用意できませんでした。もう一度お試しください。"); return false; }

    const all   = kifu.snapshots || [];
    // 範囲は呼び出し側の都合で棋譜の外へはみ出しうるので、ここで棋譜の中へ収める
    const start = Math.max(0, Math.min(range?.start ?? 0, all.length - 1));
    const end   = Math.max(start, Math.min(range?.end ?? all.length - 1, all.length - 1));
    const snaps = all.slice(start, end + 1);
    const last  = snaps[snaps.length - 1];
    // 切り取りが1局面だけになったら棋譜は持たせない
    // （1局面の棋譜は「全0手」となり、再生UIだけが残ってしまうため）
    const hasKifu  = snaps.length > 1;
    // 一部だけを切り取ったことは名前で分かるようにする。
    // ノード一覧では盤面を開かないと中身が見えないので、名前が同じだと元の棋譜と見分けがつかない
    const partial  = start > 0 || end < all.length - 1;
    const baseName = kifu.name || "棋譜から作成";
    const { data: newNode, error } = await createNode({
      treeId, userId: session.user.id, parentId: inbox.id,
      label: partial ? `${baseName}（${start === 0 ? "初期局面" : `第${start}手`}〜第${end}手）` : baseName,
      status: "todo",
      board:     last?.board ?? null,
      handSente: last?.handSente,
      handGote:  last?.handGote,
      kifu: hasKifu ? snaps : [], kifuImported: hasKifu,
      branchFromMoveIndex: start,
      // 棋譜から読み取った戦法をそのままタグに入れておく（分岐の候補の照合にも効く）。
      // 戦法は対局全体から読み取ったものなので、途中を切り取っても付け替えない
      // （その区間だけを見て戦法を判定し直すと、序盤を外した切り取りで「不明」になってしまう）
      situation:  kifu.features?.oppStrategy ? [kifu.features.oppStrategy] : [],
      myApproach: kifu.features?.myStrategy  ? [kifu.features.myStrategy]  : [],
    });
    if (error || !newNode) { showToast("ノードの作成に失敗しました。もう一度お試しください。"); return false; }

    recordAction("toInbox");
    refreshNodeCount();
    await loadMyTrees();
    navigate(`/tree/${treeId}/node/${newNode.id}`);
    return true;
  };

  const handleDeleteTree = async (treeId) => {
    const { error } = await deleteTree(treeId);
    if (error) { showToast("削除に失敗しました。もう一度お試しください。"); return; }
    await loadMyTrees();
    refreshNodeCount(); // ツリーと一緒に消えたノード分をトロフィーの数値に反映する
  };

  const handleEditTree = async (treeId, patch) => {
    const { error } = await updateTree(treeId, patch);
    if (error) { showToast("保存に失敗しました。もう一度お試しください。"); return; }

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
    if (error) { showToast("メモの保存に失敗しました。もう一度お試しください。"); return; }
    setMyTrees((prev) => prev.map((t) => t.id === treeId ? { ...t, quick_memo: memo } : t));
    setActiveTree((prev) => prev && prev.id === treeId ? { ...prev, quickMemo: memo } : prev);
  };

  // 失敗時は例外をそのまま投げ、呼び出し元（EditTreeModal）がエラーメッセージを表示する
  const handlePublishTree = async (treeId, { collaborative = false } = {}) => {
    await publishTree(treeId, { collaborative });
    setMyTrees((prev) =>
      prev.map((t) => (t.id === treeId ? { ...t, is_public: true, is_collaborative: collaborative } : t))
    );
  };

  const handleUnpublishTree = async (treeId) => {
    await unpublishTree(treeId);
    setMyTrees((prev) =>
      prev.map((t) => (t.id === treeId ? { ...t, is_public: false, is_collaborative: false } : t))
    );
  };

  // 公開したあとから「みんなで編集」を切り替える
  const handleSetCollaborative = async (treeId, on) => {
    await setTreeCollaborative(treeId, on);
    setMyTrees((prev) =>
      prev.map((t) => (t.id === treeId ? { ...t, is_collaborative: on } : t))
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
    if (error) { showToast("保存に失敗しました。もう一度お試しください。"); return false; }

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
    if (error) { showToast("移動に失敗しました。もう一度お試しください。"); return; }
    setActiveTree((prev) => reparentTree(prev, nodeId, newParentId, sortOrder));
  };

  const handleReparentNode = async (nodeId, newParentId) => {
    const oldParentId = activeTree?.nodes?.[nodeId]?.parentId ?? null;
    // 「とりあえず」から出したかどうかは、付け替える前にしか分からない
    const fromInbox = !!(oldParentId && activeTree?.nodes?.[oldParentId]?.isInbox);
    await reparentNode(nodeId, newParentId);
    recordAction("reparent");
    // 置き場から本来の枝へ移すのが「整理した」。逆（枝から置き場へ）は数えない
    if (fromInbox && !activeTree?.nodes?.[newParentId]?.isInbox) recordAction("inboxSorted");
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
    if (error) { showToast("保存に失敗しました。もう一度お試しください。"); return; }
    // 合流を「外した」ときは記録しない（触ったこと自体ではなく、使えたことを見たい）
    if (mergeParentIds.length > 0) recordAction("merge");
    setActiveTree((prev) => setMergeParentsTree(prev, nodeId, mergeParentIds));
  };

  // ── 子ノードが親から引き継ぐ戦法タグ ──────────────
  // ツリーは「親の条件を引き継いで細かくする」構造なので、タグも引き継ぐのが
  // 本来の姿。子が分かれる軸はたいてい「相手の囲い」で、そのとき親の
  // 相手の戦法・自分の戦法はそのまま正しい。
  //
  // 手間を減らすためだけの仕掛けではない：branchCandidates は situation /
  // myApproach で対局を絞り込むので、**タグが埋まるほど分岐の候補が当たる**。
  //
  // 引き継いだタグに印は付けない。「継承かどうか」の状態をノードに増やすと、
  // 以後ずっと「これは自分で付けた？引き継いだ？」を気にすることになる。
  // 違っていればその場で外せるので、普通のタグとして扱う。
  //
  // 「とりあえず」（置き場）には引き継がない。中身を持たせる場所ではないので、
  // タグが付くと検索・集計に置き場が混ざるだけになる。
  const inheritedTags = (parentId, extraFields = {}) => {
    if (extraFields.isInbox) return {};
    const parent = activeTree?.nodes?.[parentId];
    if (!parent || parent.isInbox) return {};
    return { situation: parent.situation || [], myApproach: parent.myApproach || [] };
  };

  // extraFields は「分岐の候補」から作るときに、ノード名・相手の戦法・
  // いつ使う を最初から埋めるために渡す（白紙のノードを作る動線と共用）。
  // 引き継ぎより extraFields が優先される（候補は相手の戦法を名指しで決めるため）
  const handleNewNode = async (parentId, extraFields = {}) => {
    if (!activeTree || !session) return;
    const { data: newNode } = await createNode({
      treeId:   activeTree.id,
      userId:   treeOwnerId(activeTree),
      parentId: parentId,
      label:    "新しいノード",
      status:   "wip",
      sortOrder: nextSortOrder(activeTree, parentId),
      ...inheritedTags(parentId, extraFields),
      ...extraFields,
    });
    if (!newNode) { showToast("ノードの追加に失敗しました。もう一度お試しください。"); return; }
    // 全件再フェッチせず、作成ノードをローカルツリーへマージ（ネットワーク往復を削減）
    setActiveTree(prev => addNode(prev, nodeRowToNode(newNode)));
    setNodeCount(c => c + 1);
    navigate(`/tree/${activeTree.id}/node/${newNode.id}`);
  };

  // ── 分岐ノード作成の共通処理（DB作成＋ローカルマージ＋新ノードへ遷移）──
  // 「この局面で分岐」と「範囲切り出し」で共用する。差分は extraFields で渡す
  const createBranchNode = async (parentNodeId, extraFields) => {
    if (!activeTree || !session) return;
    const { data: newNode } = await createNode({
      treeId:    activeTree.id,
      userId:    treeOwnerId(activeTree),
      parentId:  parentNodeId,
      label:     "新しいノード",
      status:    "wip",
      sortOrder: nextSortOrder(activeTree, parentNodeId),
      // 棋譜の途中から分けた枝も、同じ対局の続きなので親の戦法タグを引き継ぐ
      ...inheritedTags(parentNodeId),
      ...extraFields,
    });
    if (!newNode) { showToast("分岐ノードの追加に失敗しました。もう一度お試しください。"); return; }
    // 全件再フェッチせず、作成ノードをローカルツリーへマージ（ネットワーク往復を削減）
    setActiveTree(prev => addNode(prev, nodeRowToNode(newNode)));
    setNodeCount(c => c + 1);
    navigate(`/tree/${activeTree.id}/node/${newNode.id}`);
  };

  // ── 棋譜の途中局面から分岐ノードを作成する ──
  // できる分岐先は通常の新規ノード扱い（元の棋譜は引き継がない）
  const handleBranchFromKifu = (parentNodeId, snapshot, moveIndex) =>
    createBranchNode(parentNodeId, {
      board:     snapshot.board,
      handSente: snapshot.handSente,
      handGote:  snapshot.handGote,
      branchFromMoveIndex: moveIndex ?? null,
    });

  // ── 棋譜の範囲（開始手〜終了手）を切り出して分岐ノードを作成する ──
  // その区間の棋譜スナップショットを子ノードへコピーし、盤面は終了手の局面にする。
  // 切り出し先でも再生・再切り出しできるよう kifuImported を立てる。
  const handleBranchRangeFromKifu = (parentNodeId, startIdx, endIdx) => {
    const snaps = activeTree?.nodes?.[parentNodeId]?.kifu || [];
    const slice = snaps.slice(startIdx, endIdx + 1);
    const last  = slice[slice.length - 1];
    if (!last) return;
    // 1局面だけの切り出しは棋譜を持たない通常の分岐と同じ扱いにする
    // （1局面の棋譜は「全0手」となり再生UIだけが残ってしまうため）
    const hasKifu = slice.length > 1;
    recordAction("kifuRange");
    return createBranchNode(parentNodeId, {
      board:     last.board,
      handSente: last.handSente,
      handGote:  last.handGote,
      kifu:         hasKifu ? slice : [],
      kifuImported: hasKifu,
      branchFromMoveIndex: startIdx,
    });
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
      showToast("ノードの削除に失敗しました。もう一度お試しください。");
    }
  };

  // ── 公開ツリーを開く ────────────────────────────
  // ふつうの公開ツリーは閲覧専用のプレビュー。
  // 「みんなで編集」のツリーは、自分のツリーと同じ編集できる画面をそのまま使う。
  // 閲覧用の画面に編集機能を足していくと、同じことをする画面が2つになり、
  // どちらかに機能を足し忘れる（プレビューの props 渡し忘れで実際に起きている）。
  const handleOpenPublicTree = async (treeId) => {
    const tree = await loadTree(treeId);
    if (!tree) { showToast("ツリーの読み込みに失敗しました。もう一度お試しください。"); return; }
    navigate(tree.isCollaborative ? `/tree/${treeId}` : `/tree/${treeId}/preview`);
  };

  // ── 開いているツリーを読み直す ──────────────────
  // みんなで編集ツリーは、自分が開いている間に他の人が変えていることがある。
  // 変更は自動では降ってこない（後から保存したほうが残る）ので、
  // 最新に追いつく手段を画面に置く。
  const handleReloadTree = async () => {
    if (!activeTree) return;
    const tree = await loadTree(activeTree.id);
    if (!tree) { showToast("読み直しに失敗しました。通信環境を確認してください。"); return; }
    showToast("最新の内容にしました");
  };

  // ── 公開ツリーのコピー（サーバー側RPCで1トランザクション一括コピー）──
  const handleCopyTree = async (pubTreeId) => {
    const pubTreeRow = pubTrees.find(t => t.id === pubTreeId);
    if (!pubTreeRow || !session) return;

    const { data: newTreeId, error } = await copyTree(pubTreeId, pubTreeRow.name + "（コピー）");
    if (error || !newTreeId) {
      console.error("copyTree error:", error);
      showToast("コピーに失敗しました。もう一度お試しください。");
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
  if (!session) return (
    <>
      {needRefresh && <UpdateBanner onUpdate={applyUpdate} />}
      <AuthScreen onAuth={handleAuth}/>
      {/* ログイン前にも失敗の知らせは要る（ここにも置かないと無音で失敗する） */}
      <ToastLayer />
    </>
  );

  // ── レンダリング ─────────────────────────────
  return (
    <div style={{ height:"100dvh", background:"#faf4e8", display:"flex", flexDirection:"column" }}>

      {/* 新バージョン通知バナー（Service Worker が更新を検知したときだけ表示） */}
      {needRefresh && <UpdateBanner onUpdate={applyUpdate} />}

      {/* 初回オンボーディング（使い方トースト＋指さし。実装は onboarding.jsx） */}
      <OnboardingLayer onboard={onboard} fingerPos={fingerPos} onAdvance={advanceOnboard} />

      {/* 失敗の知らせ（押させないトースト。実装は toast.jsx）。
          アプリ内に1つだけ置く ―― 2つ置くと同じ知らせが二重に出る */}
      <ToastLayer />

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
            onSearch={() => navigate("/search")}
            onKifus={() => navigate("/kifus")}
            onTrophy={() => navigate("/trophy")}
            onSettings={() => navigate("/settings")}
            onNewTree={handleNewTree}
            onDeleteTree={handleDeleteTree} onEditTree={handleEditTree}
            onPublish={handlePublishTree} onUnpublish={handleUnpublishTree}
            onSetCollaborative={handleSetCollaborative}
            onMemoSave={handleMemoSave}/>
        )}
        {screen==="trophy" && (() => {
          const acts = getActions();
          // 「完成」の数と掘った深さは、一覧の埋め込みノード
          // （id / status / is_root / parent_id）だけで数えられる。
          // トロフィーのためだけに全ノードを取り直さない
          const doneCount = myTrees.reduce(
            (n, t) => n + (t.nodes || []).filter((x) => !x.is_root && x.status === "done").length, 0);
          const maxDepth = myTrees.reduce(
            (d, t) => Math.max(d, maxDepthFromRows(t.nodes || [])), 0);
          const extraStats = {
            hasPublished: myTrees.some(t => t.is_public),
            hasMemo:      myTrees.some(t => (t.quick_memo || "").trim().length > 0),
            hasTags:      myTrees.some(t => (t.tags || []).length > 0),
            hasCopied:    !!acts.copied,
            hasLiked:     !!acts.liked,
            hasKifu:      !!acts.kifu,
            hasTemplate:  !!acts.template,
            hasCustomTag: !!acts.customTag,
            // ── 継続系 ──
            kifuCount, doneCount, maxDepth,
            hasNextDone:     !!acts.nextDone,
            // ── 認知系 ──
            hasKifuImport:   !!acts.kifuImport,
            hasInsight:      !!acts.insight,
            hasInsightDrill: !!acts.insightDrill,
            hasBranchCand:   !!acts.branchCand,
            hasToInbox:      !!acts.toInbox,
            hasKifuRange:    !!acts.kifuRange,
            hasBookmark:     !!acts.bookmark,
            hasMerge:        !!acts.merge,
            hasSummaryNode:  !!acts.summaryNode,
            hasRecall:       !!acts.recall,
            hasSearch:       !!acts.search,
            hasReparent:     !!acts.reparent,
            hasInboxSorted:  !!acts.inboxSorted,
            // 対局者名だけはアクションではなく登録内容そのものを見る。
            // 「登録した瞬間」ではなく「登録されている」が達成の条件なので、
            // 設定画面に記録用の1行を足さずに済む
            hasPlayerName:   getKifuPlayerNames().length > 0,
          };
          return (
            <TrophyScreen
              onBack={() => navigate("/")}
              treeCount={myTrees.length}
              nodeCount={nodeCount}
              kifuCount={kifuCount}
              doneCount={doneCount}
              loginStats={loginStats}
              extraStats={extraStats}/>
          );
        })()}
        {screen==="map" && activeTree && (
          <MindMap tree={activeTree} onNodeSelect={handleNodeSelect}
            onBack={() => navigate(treeBackPath)} onReparent={handleReparentNode}
            canUndoReparent={reparentStack.length > 0} onUndoReparent={handleUndoReparent}
            onMemoSave={handleMemoSave}
            canEditTree={isOwnTree}
            collabGuest={isCollabGuest} onReload={handleReloadTree}/>
        )}
        {screen==="node" && activeTree && activeNodeId && activeTree.nodes[activeNodeId] && (
          <NodeDetail tree={activeTree} trees={myTrees} nodeId={activeNodeId} userId={session.user.id}
            onBack={() => navigate(`/tree/${activeTree.id}`)} onNodeSelect={handleNodeSelect}
            collabGuest={isCollabGuest}
            onNewNode={handleNewNode} onUpdate={handleNodeUpdate}
            onDeleteNode={handleDeleteNode} onSetMergeParents={handleSetMergeParents}
            onReparentNode={handleReparentNode}
            onBranchFromKifu={handleBranchFromKifu}
            onBranchRangeFromKifu={handleBranchRangeFromKifu}
            onBoardFirstShown={startBoardOnboard}/>
        )}
        {screen==="kifus" && (
          <KifuList
            userId={session.user.id}
            trees={myTrees}
            onBack={() => navigate("/")}
            onInsight={() => navigate("/kifus/insight")}
            onGoSettings={() => navigate("/settings")}
            onSendToInbox={handleSendKifuToInbox} />
        )}
        {screen==="kifuInsight" && (
          <KifuInsight
            userId={session.user.id}
            trees={myTrees}
            onBack={() => navigate("/kifus")}
            onGoSettings={() => navigate("/settings")}
            onSendToInbox={handleSendKifuToInbox} />
        )}
        {screen==="search" && (
          <NodeSearch
            userId={session.user.id}
            trees={myTrees}
            onBack={() => navigate("/")}
            // 結果タップでノード詳細へ直接ジャンプする。
            // ツリーの読み込みはディープリンク用の useEffect（route.treeId 監視）が行う
            onOpenNode={(treeId, nodeId) => navigate(`/tree/${treeId}/node/${nodeId}`)}
          />
        )}
        {screen==="settings" && (
          <SettingsScreen onBack={() => navigate("/")}
            fontScale={fontScale} onFontScaleChange={handleFontScaleChange}
            onResetOnboard={() => { resetOnboard(); navigate("/"); }}
            onRegenerateRecovery={regenerateRecoveryCode}
            onSignOut={handleSignOut}
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
