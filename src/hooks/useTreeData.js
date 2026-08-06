// ══════════════════════════════════════════════════
// useTreeData.js  ―  ツリーデータの状態（一覧 / 公開 / 開いているツリー）
//   取得（ローダ）と保持をここに集約する。変更操作（ノード追加・削除等）は
//   DB更新＋treeOps＋画面遷移を束ねる App 側のハンドラが setter を通して行う。
// ══════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import {
  fetchMyTrees, fetchPublicTrees, fetchNodes, buildTreeFromNodes,
  countUserNodes, countUserKifus, fetchMyLikedTreeIds,
} from "../db";
import { showToast } from "../toast";

// 読み込みの失敗だけは「伝えるだけ」で終われない。
// 保存の失敗と違って画面には何も出ておらず、利用者から見ると
// 空の一覧が出たまま固まっているのと区別がつかないため、
// その場でやり直せる手段（もう一度読む）を必ず添える。
function showLoadError(message, retry) {
  showToast(message, { action: { label: "もう一度読む", onClick: retry } });
}

export function useTreeData(session) {
  const [myTrees,       setMyTrees]       = useState([]);
  const [pubTrees,      setPubTrees]      = useState([]);
  const [activeTree,    setActiveTree]    = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [nodeCount,     setNodeCount]     = useState(0);
  const [kifuCount,     setKifuCount]     = useState(0); // トロフィー用（棋譜は別テーブルなので件数だけ取る）
  const [likedTreeIds,  setLikedTreeIds]  = useState([]); // ユーザーがいいね済みのツリーID
  const [reparentStack, setReparentStack] = useState([]); // マインドマップの親付け替えUndo用（開いた時点からの履歴）

  // ── ツリー一覧の取得 ─────────────────────────
  const loadMyTrees = useCallback(async () => {
    if (!session) return;
    const { data, error } = await fetchMyTrees(session.user.id);
    if (error) { showLoadError("ツリー一覧の取得に失敗しました。通信環境を確認してください。", loadMyTrees); return; }
    setMyTrees(data || []);
  }, [session]);

  const loadPublicTrees = useCallback(async () => {
    const { data, error } = await fetchPublicTrees();
    if (error) { showLoadError("公開ツリーの取得に失敗しました。通信環境を確認してください。", loadPublicTrees); return; }
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
        if (error) { showLoadError("ツリーの取得に失敗しました。通信環境を確認してください。", () => loadTree(treeId)); return null; }
        treeRow = (data || []).find(t => t.id === treeId);
      }
      if (!treeRow) {
        const { data: pubData, error: pubError } = await fetchPublicTrees();
        if (pubError) { showLoadError("ツリーの取得に失敗しました。通信環境を確認してください。", () => loadTree(treeId)); return null; }
        treeRow = (pubData || []).find(t => t.id === treeId);
      }
      if (!treeRow) return null;

      const { data: nodes, error: nodesError } = await fetchNodes(treeId);
      if (nodesError) { showLoadError("ツリーの取得に失敗しました。通信環境を確認してください。", () => loadTree(treeId)); return null; }
      const assembled = buildTreeFromNodes(treeRow, nodes || []);
      setActiveTree(assembled);
      return assembled;
    } finally {
      setLoading(false);
    }
  }, [myTrees, pubTrees, session]);

  const refreshNodeCount = useCallback(async () => {
    if (!session) return;
    const cnt = await countUserNodes(session.user.id);
    setNodeCount(cnt);
  }, [session]);

  // 棋譜の増減は棋譜ライブラリの中で完結していて、こちらには伝わってこない。
  // トロフィー画面に入るたびに取り直す（数字1つなので head: true で軽い）
  const refreshKifuCount = useCallback(async () => {
    if (!session) return;
    const cnt = await countUserKifus(session.user.id);
    setKifuCount(cnt);
  }, [session]);

  // ログイン確定後に一覧・ノード数を初期取得する
  useEffect(() => {
    if (!session) return;
    loadMyTrees();
    loadPublicTrees();
    countUserNodes(session.user.id)
      .then(setNodeCount)
      .catch((e) => console.error("countUserNodes error:", e));
    countUserKifus(session.user.id)
      .then(setKifuCount)
      .catch((e) => console.error("countUserKifus error:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // サインアウト時などに画面側から一括クリアする
  const clearTreeData = useCallback(() => {
    setActiveTree(null);
    setMyTrees([]);
  }, []);

  return {
    myTrees, setMyTrees,
    pubTrees,
    activeTree, setActiveTree,
    loading,
    nodeCount, setNodeCount,
    kifuCount,
    likedTreeIds,
    reparentStack, setReparentStack,
    loadMyTrees, loadPublicTrees, loadTree, refreshNodeCount, refreshKifuCount, clearTreeData,
  };
}
