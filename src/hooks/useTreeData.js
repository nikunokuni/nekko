// ══════════════════════════════════════════════════
// useTreeData.js  ―  ツリーデータの状態（一覧 / 公開 / 開いているツリー）
//   取得（ローダ）と保持をここに集約する。変更操作（ノード追加・削除等）は
//   DB更新＋treeOps＋画面遷移を束ねる App 側のハンドラが setter を通して行う。
// ══════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import {
  fetchMyTrees, fetchPublicTrees, fetchNodes, buildTreeFromNodes,
  countUserNodes, fetchMyLikedTreeIds,
} from "../db";

export function useTreeData(session) {
  const [myTrees,       setMyTrees]       = useState([]);
  const [pubTrees,      setPubTrees]      = useState([]);
  const [activeTree,    setActiveTree]    = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [nodeCount,     setNodeCount]     = useState(0);
  const [likedTreeIds,  setLikedTreeIds]  = useState([]); // ユーザーがいいね済みのツリーID
  const [reparentStack, setReparentStack] = useState([]); // マインドマップの親付け替えUndo用（開いた時点からの履歴）

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

  const refreshNodeCount = useCallback(async () => {
    if (!session) return;
    const cnt = await countUserNodes(session.user.id);
    setNodeCount(cnt);
  }, [session]);

  // ログイン確定後に一覧・ノード数を初期取得する
  useEffect(() => {
    if (!session) return;
    loadMyTrees();
    loadPublicTrees();
    countUserNodes(session.user.id)
      .then(setNodeCount)
      .catch((e) => console.error("countUserNodes error:", e));
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
    likedTreeIds,
    reparentStack, setReparentStack,
    loadMyTrees, loadPublicTrees, loadTree, refreshNodeCount, clearTreeData,
  };
}
