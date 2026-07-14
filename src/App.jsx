// ══════════════════════════════════════════════════
// App.jsx  ―  アプリのルート
//   セッション管理 / 画面遷移 / DB 操作の統括
// ══════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef } from "react";
import { AuthScreen, PublicTrees } from "./screensPublic";
import { TreeList } from "./screens/TreeListScreen";
import { MindMap } from "./screens/MindMapScreen";
import { NodeDetail } from "./screens/NodeDetailScreen";
import { TrophyScreen } from "./screens/TrophyScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import {
  supabase,
  getSession, getProfile, signOut,
  fetchMyTrees, fetchPublicTrees, fetchNodes,
  createTree, createNode, updateNode, updateTree, deleteTree, copyTree,
  buildTreeFromNodes, nodeRowToNode, publishTree, deleteNodes, unpublishTree,
  countUserNodes, getAppStats, likeTree, unlikeTree, collectTreeTags, fetchAllWipNodes,
  fetchMyLikedTreeIds,
} from "./db";

// 新規作成したノード行を、全件再フェッチせずローカルツリーへマージする
function addNodeToTree(prev, row) {
  if (!prev || !row) return prev;
  const node  = nodeRowToNode(row);
  const nodes = { ...prev.nodes, [node.id]: node };
  if (node.parentId && nodes[node.parentId]) {
    nodes[node.parentId] = {
      ...nodes[node.parentId],
      childIds: [...(nodes[node.parentId].childIds || []), node.id],
    };
  }
  return { ...prev, nodes, rootId: prev.rootId ?? (node.isRoot ? node.id : null) };
}
import { recordLogin, getLoginStats, recordAction, getActions, shouldShowFridayToast, markFridayToastShown, shouldShowOnboard, markOnboardSeen, resetOnboard } from "./rewards";
import { cloneBoard } from "./theme";

// 画面ごとの初回オンボーディング文面（その画面に初めて来たとき1度だけ表示する）
// 各画面は配列で、複数枚を順番に（連続で）表示する
const ONBOARD_MESSAGES = {
  list: [
    <span><i className="ti ti-world" />みんなのツリー　公開されているツリーを見れます</span>,
    <span><i className="ti ti-trophy" />トロフィー　獲得したトロフィーを見れます</span>,
    <span><i className="ti ti-settings" />設定　文字サイズ変更、使い方はこちら</span>,
    <span>「<i className="ti ti-plus" />新規」から自分のツリーを作っていきましょう</span>,
  ],
  map: [
    <span>ノードを<b>タップ</b>で編集</span>,
    <span><b>ドラッグ</b>で分岐のつなぎ替え</span>,
    <span>
      <span style={{ display: "inline-flex", flexDirection: "column", gap: 2.5, verticalAlign: "middle", margin: "0 4px" }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ display: "block", width: 3.5, height: 3.5, borderRadius: "50%", background: "#c8a96e" }} />
        ))}
      </span>
      　タップで目次を表示
    </span>,
  ],
  node: [
    <span><b>きほん</b>　相手の戦法と自分の戦法を入力</span>,
    <span><b>ついか</b>　さらに詳細を入力</span>,
    <span><b>子ノード</b>　「ここから分岐を追加」で次の分岐を作成できます</span>,
  ],
  // 盤面を初めて追加したとき、各ボタンの使い方を1つずつ指さしで案内する
  board: [
    <span><b>テンプレート</b>　定番の盤面をワンタップで呼び出せます</span>,
    <span><b>非表示</b>　盤面を非表示にできます（内容はそのまま残る）</span>,
    <span><b>元に戻す</b>　この画面を開いたときの盤面に戻します</span>,
    <span><b>盤面を削除</b>　盤面を消します（非表示と違い中身も消える）</span>,
    <span><b>動かす</b>　駒をタップ → 移動先をタップで駒を動かせます</span>,
    <span><b>スタンプ</b>　マスに目印をつけられます。矢印は始点 → 終点の順にタップ</span>,
    <span><b>消す</b>　つけたスタンプを消せます</span>,
    <span><b>棋譜を記録</b>　その間に動かした手順を記録し、あとで再生できます</span>,
  ],
};

// 各トーストが指さす対象（data-onboard 属性値）。null は指さし対象なし（トーストのみ）
const ONBOARD_TARGETS = {
  list: ["public", "trophy", "settings", "new"],
  map:  ["map-node", "map-node", "map-menu"],
  node: ["kihon", "tsuika", "children"],
  board: ["board-tmpl", "board-hide", "board-undo", "board-delete", "board-move", "board-stamp", "board-erase", "board-kifu"],
};

// 対象ごとの指さし設定。dir: 指の向き（up=下から上 / down=上から下）、block: スクロール位置
const ONBOARD_TARGET_OPTS = {
  tsuika:   { block: "start" },           // 「ついか」を画面上部に出す
  children: { block: "center", dir: "down" }, // 「子ノード」は下にあるので下向きの指で指す
};

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
  const [devStats,         setDevStats]         = useState(null);
  const [loginStats,       setLoginStats]       = useState({ totalDays: 0, streak: 0 });
  const [reparentStack,    setReparentStack]    = useState([]); // マインドマップの親付け替えUndo用（開いた時点からの履歴）
  const [fridayToast,      setFridayToast]      = useState("");
  const [onboard,          setOnboard]          = useState(null); // 表示中の初回トースト { screen, index }（null=非表示）
  const [likedTreeIds,     setLikedTreeIds]     = useState([]); // ユーザーがいいね済みのツリーID
  const [fontScale,        setFontScale]        = useState(() => Number(localStorage.getItem("nekko_font_scale")) || 1);

  const handleFontScaleChange = (scale) => {
    setFontScale(scale);
    localStorage.setItem("nekko_font_scale", String(scale));
  };

  // 文字サイズ設定をルート要素のfont-sizeに反映（rem単位の基準値として使われる）
  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * fontScale}px`;
  }, [fontScale]);

  // ── Auth bootstrap ────────────────────────────
  useEffect(() => {
    getSession().then(s => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // 金曜トーストの自動消去タイマー（アンマウント/再実行時に破棄してリークを防ぐ）
  const fridayTimer = useRef(null);

  // session 確定後にプロフィール・ツリーを取得
  useEffect(() => {
    if (session === undefined) return; // まだ確定していない
    if (!session) return;              // 未ログイン
    getProfile(session.user.id)
      .then(({ data }) => setProfile(data))
      .catch((e) => console.error("getProfile error:", e));
    recordLogin();
    setLoginStats(getLoginStats());
    loadMyTrees();
    loadPublicTrees();
    countUserNodes(session.user.id)
      .then(setNodeCount)
      .catch((e) => console.error("countUserNodes error:", e));

    // 金曜夜トースト
    if (shouldShowFridayToast()) {
      fetchAllWipNodes(session.user.id)
        .then(({ data }) => {
          if (!data || data.length === 0) return;
          const node = data[Math.floor(Math.random() * data.length)];
          setFridayToast(`「${node.label}」この戦法について研究してみよう`);
          markFridayToastShown();
          if (fridayTimer.current) clearTimeout(fridayTimer.current);
          fridayTimer.current = setTimeout(() => setFridayToast(""), 6000);
        })
        .catch((e) => console.error("fetchAllWipNodes error:", e));
    }
    return () => { if (fridayTimer.current) clearTimeout(fridayTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // 開発者（niku）のときだけ、アプリ全体の統計（全ユーザーのアカウント/ツリー/ノード数）を取得
  useEffect(() => {
    if (profile?.username !== "niku") { setDevStats(null); return; }
    getAppStats()
      .then(setDevStats)
      .catch((e) => console.error("devStats error:", e));
  }, [profile]);

  // ── 初回オンボーディング（画面ごとに一度だけ使い方トーストを表示）──
  // 画面に初めて来たら最初の1枚を表示。複数枚ある画面は順番に切り替える。
  const onboardTimer = useRef(null);
  useEffect(() => {
    if (!session) return;
    // map / node はツリーを開いてから表示する
    if ((screen === "map" || screen === "node") && !activeTree) return;
    if (!ONBOARD_MESSAGES[screen]) return;
    if (!shouldShowOnboard(screen)) return;

    // 「表示済み」は全枚数を見終えた時点で記録する（途中で閉じても次回また出す）
    setOnboard({ screen, index: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, session, activeTree]);

  // 盤面を初めて追加したときに、盤面ボタンの使い方トースト（8枚）を開始する
  const startBoardOnboard = useCallback(() => {
    if (!shouldShowOnboard("board")) return;
    setOnboard({ screen: "board", index: 0 });
  }, []);

  // 現在のトーストを次の1枚へ。最後まで見たら「表示済み」にして閉じる。
  const advanceOnboard = () => {
    if (!onboard) return;
    const msgs = ONBOARD_MESSAGES[onboard.screen] || [];
    if (onboard.index + 1 < msgs.length) {
      setOnboard({ ...onboard, index: onboard.index + 1 });
    } else {
      markOnboardSeen(onboard.screen);
      setOnboard(null);
    }
  };

  // 表示中のトーストを一定時間で自動的に次の1枚へ進める
  useEffect(() => {
    if (!onboard) return;
    const list  = ONBOARD_MESSAGES[onboard.screen] || [];
    const delay = list.length > 1 ? 4500 : 8000;
    if (onboardTimer.current) clearTimeout(onboardTimer.current);
    onboardTimer.current = setTimeout(advanceOnboard, delay);
    return () => { if (onboardTimer.current) clearTimeout(onboardTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboard]);

  // ── 指さし（👆）の位置を、対象要素の実際の位置から計算する ──
  const [fingerPos, setFingerPos] = useState(null); // { x, y } 画面座標。null=非表示
  useEffect(() => {
    if (!onboard) { setFingerPos(null); return; }
    const targetName = (ONBOARD_TARGETS[onboard.screen] || [])[onboard.index];
    if (!targetName) { setFingerPos(null); return; }
    const opt = ONBOARD_TARGET_OPTS[targetName] || {};
    const dir = opt.dir || "up";

    // 指を対象の上／下に置く（dir=up は真下から上向き、down は真上から下向き）。画面外なら出さない。
    const measure = () => {
      const el = document.querySelector(`[data-onboard="${targetName}"]`);
      if (!el) { setFingerPos(null); return; }
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) { setFingerPos(null); return; }
      // ノード詳細は見出し（きほん等）が左寄せなので、中央ではなく左の文字あたりを指す
      const x = onboard.screen === "node" ? r.left + 40 : r.left + r.width / 2;
      const y = dir === "down" ? r.top - 2 : r.bottom + 2;
      setFingerPos({ x, y, dir });
    };

    // トーストの文面が切り替わった瞬間に古い指を消す。これをしないと、新しい位置を
    // 計測し終えるまでの間だけ指が前のボタンを指したままになり、文面と指がズレて見える。
    setFingerPos(null);

    const el = document.querySelector(`[data-onboard="${targetName}"]`);
    // ノード詳細・盤面では対象（ついか／子ノードや各盤面ボタン）が画面に映るようスクロールしてから計測する
    const needsScroll = onboard.screen === "node" || onboard.screen === "board";
    if (needsScroll && el) el.scrollIntoView({ block: opt.block || "center", behavior: "smooth" });

    // 対象のレンダリング／スクロール完了を待ってから計測する。
    // 盤面は対象（ボタン群）が既に表示済みでスクロール量も小さいので短め、
    // ノード詳細は離れた見出しまでスクロールするため長めに待つ。
    const delay = onboard.screen === "node" ? 420 : needsScroll ? 180 : 60;
    const t = setTimeout(measure, delay);
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); };
  }, [onboard]);

  // ── ツリー一覧の取得 ─────────────────────────
  const loadMyTrees = useCallback(async () => {
    if (!session) return;
    const { data, error } = await fetchMyTrees(session.user.id);
    if (error) { alert("ツリー一覧の取得に失敗しました。通信環境を確認してください。"); return; }
    setMyTrees(data || []);
  }, [session]);
  const loadPublicTrees = useCallback(async () => {
    const { data, error } = await fetchPublicTrees();
    if (error) { alert("公開ツリーの取得に失敗しました。通信環境を確認してください。"); return; }
    setPubTrees(data || []);
    if (session?.user?.id) {
      setLikedTreeIds(await fetchMyLikedTreeIds(session.user.id));
    }
  }, [session]);

  // ── 個別ツリーの読み込み ─────────────────────
  // ※ myTrees / pubTrees が空のタイミングで呼ばれても DB から直接フェッチして取得する
  const loadTree = useCallback(async (treeId) => {
    setLoading(true);
    setReparentStack([]);
    try {
      let treeRow = [...myTrees, ...pubTrees].find(t => t.id === treeId);
      if (!treeRow && session?.user?.id) {
        const { data, error } = await fetchMyTrees(session.user.id);
        if (error) { alert("ツリーの取得に失敗しました。通信環境を確認してください。"); return null; }
        treeRow = (data || []).find(t => t.id === treeId);
      }
      if (!treeRow) {
        const { data: pubData, error: pubError } = await fetchPublicTrees();
        if (pubError) { alert("ツリーの取得に失敗しました。通信環境を確認してください。"); return null; }
        treeRow = (pubData || []).find(t => t.id === treeId);
      }
      if (!treeRow) return null;

      const { data: nodes, error: nodesError } = await fetchNodes(treeId);
      if (nodesError) { alert("ツリーの取得に失敗しました。通信環境を確認してください。"); return null; }
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
    if (nodeError) console.error("createNode error:", nodeError);

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

  // 保存の成否を返す（呼び出し側が失敗時に表示を元に戻せるように）
  const handleNodeUpdate = async (nodeId, patch) => {
    const { error } = await updateNode(nodeId, patch);
    if (error) { alert("保存に失敗しました。もう一度お試しください。"); return false; }

    // 戦法タグが変わった場合のみ、ツリー全体のタグ（全ノードのタグの集合）を再計算する。
    // 集約値は updater の外（closureのactiveTree）で1回だけ計算し、副作用（DB保存・別state更新）も
    // updater の外で実行する。setActiveTree の更新関数内で副作用を起こすと StrictMode で2回走り、
    // updateTree がDBへ二重書き込みされるため。
    const recomputeTags = !!(patch.situation || patch.myApproach || patch.usageLevel);
    let aggregated = null;
    if (recomputeTags && activeTree) {
      const updatedNodes = { ...activeTree.nodes, [nodeId]: { ...activeTree.nodes[nodeId], ...patch } };
      aggregated = collectTreeTags(updatedNodes);
    }

    // ローカル state も即時反映（純粋な更新のみ）
    setActiveTree(prev => {
      if (!prev) return prev;
      const nodes = { ...prev.nodes, [nodeId]: { ...prev.nodes[nodeId], ...patch } };
      return aggregated ? { ...prev, nodes, tags: aggregated } : { ...prev, nodes };
    });

    if (aggregated && activeTree) {
      const treeId = activeTree.id;
      updateTree(treeId, { tags: aggregated });
      setMyTrees(mt => mt.map(t => t.id === treeId ? { ...t, tags: aggregated } : t));
    }
    return true;
  };

  // ── ノードの親を付け替える（マインドマップのドラッグ操作） ──
  const reparentNode = async (nodeId, newParentId) => {
    // 並び順も新親の末尾に更新する。ローカルでは childIds の末尾に追加されるため、
    // sort_order が旧親時代のままだとリロード時に並び順が変わって位置が跳ねてしまう。
    const sortOrder = nextSortOrder(newParentId);
    const { error } = await updateNode(nodeId, { parentId: newParentId, sortOrder });
    if (error) { alert("移動に失敗しました。もう一度お試しください。"); return; }
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
      nodes[nodeId] = { ...node, parentId: newParentId, sortOrder };
      return { ...prev, nodes };
    });
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

  // 兄弟ノードの sort_order の最大値+1 を返す（新規ノードを常に末尾に並べるため。
  // 全ノード 0 のままだと、リロード時に sort_order:1 を持つ自動生成の「振り飛車」より
  // 前へ割り込んでしまう）
  const nextSortOrder = (parentId) => {
    const sibs = (activeTree?.nodes?.[parentId]?.childIds || [])
      .map((id) => activeTree.nodes[id]?.sortOrder ?? 0);
    return sibs.length ? Math.max(...sibs) + 1 : 0;
  };

  const handleNewNode = async (parentId) => {
    if (!activeTree || !session) return;
    const { data: newNode } = await createNode({
      treeId:   activeTree.id,
      userId:   session.user.id,
      parentId: parentId,
      label:    "新しいノード",
      status:   "wip",
      sortOrder: nextSortOrder(parentId),
    });
    if (!newNode) return;
    // 全件再フェッチせず、作成ノードをローカルツリーへマージ（ネットワーク往復を削減）
    setActiveTree(prev => addNodeToTree(prev, newNode));
    setNodeCount(c => c + 1);
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
      sortOrder: nextSortOrder(parentNodeId),
    });
    if (!newNode) return;
    // 全件再フェッチせず、作成ノードをローカルツリーへマージ（ネットワーク往復を削減）
    setActiveTree(prev => addNodeToTree(prev, newNode));
    setNodeCount(c => c + 1);
    setActiveNodeId(newNode.id);
    setScreen("node");
  };

  const handleDeleteNode = async (idsToDelete, parentId) => {
    try {
      await deleteNodes(idsToDelete);

      // 削除されたノードを「合流親」に持つ残りノードから、その参照を取り除く
      // （放置すると他ノードの merge_parent_ids に削除済みIDが残り続けるため）
      const delSet = new Set(idsToDelete);
      const affected = [];
      for (const n of Object.values(activeTree?.nodes || {})) {
        if (delSet.has(n.id)) continue;
        const refs = n.mergeParentIds || [];
        if (refs.some((id) => delSet.has(id))) {
          affected.push({ id: n.id, cleaned: refs.filter((id) => !delSet.has(id)) });
        }
      }
      await Promise.all(
        affected.map((a) =>
          updateNode(a.id, { mergeParentIds: a.cleaned, isMergeTarget: a.cleaned.length > 0 })
        )
      );

      // ツリーのタグ（頻度の高いノードの「自分の戦法」の集約）を残ったノードで再計算する。
      // 削除したノード由来のタグが一覧カードや公開フィルタに残り続けるのを防ぐ。
      const remaining = { ...(activeTree?.nodes || {}) };
      idsToDelete.forEach((id) => delete remaining[id]);
      const aggregated = collectTreeTags(remaining);
      const tagsChanged = activeTree &&
        JSON.stringify(aggregated) !== JSON.stringify(activeTree.tags || []);
      if (tagsChanged) {
        const treeId = activeTree.id;
        updateTree(treeId, { tags: aggregated });
        setMyTrees((mt) => mt.map((t) => t.id === treeId ? { ...t, tags: aggregated } : t));
      }

      setActiveTree((prev) => {
        const newNodes = { ...prev.nodes };
        idsToDelete.forEach((id) => delete newNodes[id]);
        // 合流参照の掃除をローカルにも反映
        affected.forEach((a) => {
          if (newNodes[a.id]) {
            newNodes[a.id] = { ...newNodes[a.id], mergeParentIds: a.cleaned, isMergeTarget: a.cleaned.length > 0 };
          }
        });
        if (parentId && newNodes[parentId]) {
          newNodes[parentId] = {
            ...newNodes[parentId],
            childIds: (newNodes[parentId].childIds || []).filter(
              (id) => !idsToDelete.includes(id)
            ),
          };
        }
        return tagsChanged ? { ...prev, nodes: newNodes, tags: aggregated } : { ...prev, nodes: newNodes };
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

      {/* 初回オンボーディング・トースト（画面ごとに一度だけ・タップで次へ／閉じる） */}
      {onboard && (ONBOARD_MESSAGES[onboard.screen] || [])[onboard.index] && (() => {
        const msgs  = ONBOARD_MESSAGES[onboard.screen];
        const multi = msgs.length > 1;
        // 指さし対象があるカードは、指の位置が定まるまでトーストを出さない。
        // （切り替え直後の一瞬だけ fingerPos が null になり、中央に表示されてから
        //   指の位置へ移動する「ワープ」を防ぐ）
        const targetName = (ONBOARD_TARGETS[onboard.screen] || [])[onboard.index];
        if (targetName && !fingerPos) return null;
        // 指さしの向きに合わせてトーストを置き、指・ボタンとの重なりを防ぐ。
        //  ・指が上向き(👆 ＝指は対象の下)：トーストは指の下
        //  ・指が下向き(👇 ＝指は対象の上)：トーストは指の上（下端を指の上端に合わせる）
        //  ・指さしが無いトースト：従来どおり画面中央
        let toastTop, toastTransform;
        if (!fingerPos) {
          toastTop = "50%";
          toastTransform = "translate(-50%, -50%)";
        } else if (fingerPos.dir === "down") {
          toastTop = Math.max(fingerPos.y - 48, 150);
          toastTransform = "translate(-50%, -100%)";
        } else {
          toastTop = Math.min(fingerPos.y + 48, window.innerHeight - 150);
          toastTransform = "translateX(-50%)";
        }
        return (
          <div
            onClick={advanceOnboard}
            style={{
              position:     "fixed",
              top:          toastTop,
              left:         "50%",
              transform:    toastTransform,
              zIndex:       200,
              width:        "calc(100% - 32px)",
              maxWidth:     360,
              background:   "rgba(26,15,0,0.9)",
              color:        "#faf4e8",
              fontSize:     "0.8125rem",
              fontFamily:   "'Noto Serif JP', serif",
              lineHeight:   1.7,
              padding:      "12px 16px",
              borderRadius: 16,
              display:      "flex",
              flexDirection: "column",
              gap:          8,
              cursor:       "pointer",
              boxShadow:    "0 4px 20px rgba(26,15,0,0.3)",
            }}
          >
            <div style={{ display: "flex", gap: 8 }}>
              <i className="ti ti-bulb" style={{ fontSize: "0.9375rem", color: "#c8a96e", flexShrink: 0, marginTop: 2 }} />
              <span style={{ flex: 1 }}>{msgs[onboard.index]}</span>
            </div>
            {multi && (
              <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
                {msgs.map((_, i) => (
                  <span key={i} style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: i === onboard.index ? "#c8a96e" : "rgba(200,169,110,0.3)",
                  }} />
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* 指さし：対象の上／下に表示し、対象を指す（dir=up は👆、down は👇）*/}
      {onboard && fingerPos && (
        <div
          style={{
            position:      "fixed",
            left:          fingerPos.x,
            top:           fingerPos.y,
            // up は指の上端を対象下端に、down は指の下端を対象上端に合わせる
            transform:     fingerPos.dir === "down" ? "translate(-50%, -100%)" : "translateX(-50%)",
            zIndex:        201,
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              display:   "block",
              fontSize:  "1.75rem",
              filter:    "drop-shadow(0 2px 3px rgba(26,15,0,0.35))",
              animation: `${fingerPos.dir === "down" ? "nekko-finger-down" : "nekko-finger-up"} 0.9s ease-in-out infinite`,
            }}
          >
            {fingerPos.dir === "down" ? "👇" : "👆"}
          </span>
        </div>
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
            onPublic={() => { setScreen("public"); loadPublicTrees(); }}
            onTrophy={() => setScreen("trophy")}
            onSettings={() => setScreen("settings")}
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
            canUndoReparent={reparentStack.length > 0} onUndoReparent={handleUndoReparent}
            onMemoSave={handleMemoSave}/>
        )}
        {screen==="node" && activeTree && activeNodeId && (
          <NodeDetail tree={activeTree} nodeId={activeNodeId}
            onBack={() => setScreen("map")} onNodeSelect={handleNodeSelect}
            onNewNode={handleNewNode} onUpdate={handleNodeUpdate}
            onDeleteNode={handleDeleteNode} onSetMergeParents={handleSetMergeParents}
            onReparentNode={handleReparentNode}
            onBranchFromKifu={handleBranchFromKifu}
            onBoardFirstShown={startBoardOnboard}/>
        )}
        {screen==="settings" && (
          <SettingsScreen onBack={() => setScreen("list")}
            fontScale={fontScale} onFontScaleChange={handleFontScaleChange}
            onResetOnboard={() => { resetOnboard(); setScreen("list"); }}
            devStats={devStats}/>
        )}
        {screen==="public" && (
          <PublicTrees trees={pubTrees} profile={profile}
            likedTreeIds={likedTreeIds}
            onBack={() => setScreen("list")}
            onCopy={handleCopyTree}
            onLike={(treeId) => session && likeTree(session.user.id, treeId)}
            onUnlike={(treeId) => session && unlikeTree(session.user.id, treeId)}
            onRefresh={loadPublicTrees}/>
        )}
      </div>
    </div>
  );
}
