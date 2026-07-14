// ══════════════════════════════════════════════════════════════════
// NodeDetailScreen.jsx  ―  ノード詳細編集画面
//   親ノード / きほん / ついか / 子ノード
// ══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  StatusChip, MergeTag, Divider, BackBtn,
} from "../components";
import {
  STATUS_META, ORIENTATION_META, STRATEGY_GROUPS, WIN_RATE_LEVELS, LIKE_LEVELS, COMMENT_GROUPS, USAGE_LEVELS, USAGE_META,
} from "../data";
import { recordAction, getCustomTagsByGroup, addCustomTag, getCommentCustomTags, addCommentCustomTag } from "../rewards";
import { T, INPUT_STYLE, cloneBoard } from "../theme";
import { SectionLabel, BoardSection, MergeLinkList, LinkPicker, TagPickerField } from "../components/uiParts";

// ── セクション見出し ──────────────────────────────
function SectionHeader({ icon, children, dataOnboard }) {
  return (
    <div data-onboard={dataOnboard} style={{ display: "flex", alignItems: "center", gap: 6, padding: "14px 16px 8px", fontSize: T.fontSize.base, fontWeight: 600, color: T.inkMid, letterSpacing: "0.04em", fontFamily: T.fontSerif }}>
      <i className={`ti ${icon}`} style={{ fontSize: "0.8125rem", color: T.gold }} />{children}
    </div>
  );
}

// ── セクション間の太い区切り線 ──────────────────────
function SectionDivider() {
  return <div style={{ height: 3, background: "rgba(26,15,0,0.18)" }} />;
}

// ══════════════════════════════════════════════════════════════════
// NodeDetail: ノード詳細編集画面
// ══════════════════════════════════════════════════════════════════
export function NodeDetail({ tree, nodeId, onBack, onNodeSelect, onNewNode, onUpdate, onDeleteNode, onSetMergeParents, onReparentNode, onBranchFromKifu, onBoardFirstShown }) {
  const node = tree.nodes[nodeId];

  const [label,        setLabel]        = useState("");
  const [situation,    setSituation]    = useState("");
  const [myApproach,   setMyApproach]   = useState("");
  const [orientation,  setOrientation]  = useState("");
  const [memo,         setMemo]         = useState("");
  const [status,       setStatus]       = useState("wip");
  const [usageLevel,   setUsageLevel]   = useState(2);
  const [winRate,      setWinRate]      = useState(null);
  const [likeLevel,    setLikeLevel]    = useState(null);
  const [boardVisible, setBoardVisible] = useState(false);
  const [boardData,    setBoardData]    = useState(null);
  const [stamps,       setStamps]       = useState([]);
  const [handSente,   setHandSente]   = useState({p:0,l:0,n:0,s:0,g:0,b:0,r:0});
  const [handGote,    setHandGote]    = useState({p:0,l:0,n:0,s:0,g:0,b:0,r:0});
  const [toast,        setToast]        = useState("");
  const [customTags,        setCustomTags]        = useState(() => getCustomTagsByGroup());
  const [commentTags,       setCommentTags]       = useState("");
  const [commentCustomTags, setCommentCustomTags] = useState(() => getCommentCustomTags());
  const [commentOpen,       setCommentOpen]       = useState(false);
  const [aim,         setAim]         = useState("");
  const [caution,     setCaution]     = useState("");
  const [nextStudy,   setNextStudy]   = useState("");
  const [mergePickerOpen,        setMergePickerOpen]        = useState(false);
  const [mergeChildPickerOpen,   setMergeChildPickerOpen]   = useState(false);
  const [parentDetailsOpen,      setParentDetailsOpen]      = useState(false);
  const [parentChangePickerOpen, setParentChangePickerOpen] = useState(false);
  const [childDetailsOpen,       setChildDetailsOpen]       = useState(false);
  const [childChangePickerOpen,  setChildChangePickerOpen]  = useState(false);
  const [deleteConfirm,          setDeleteConfirm]          = useState(false);
  const [boardSnapshot,          setBoardSnapshot]          = useState(null);
  const [addOpen,                setAddOpen]                = useState(false);

  // デバウンス付き自動保存（ノード名・メモ・タグなど、入力ごとに即時送信したくないフィールド用）
  const pendingPatch = useRef({});
  const saveTimer    = useRef(null);
  const toastTimer   = useRef(null);
  const labelInputRef = useRef(null);
  // beforeunload 用に最新の nodeId / onUpdate を ref で保持
  const nodeIdRef    = useRef(nodeId);
  const onUpdateRef  = useRef(onUpdate);
  useEffect(() => { nodeIdRef.current = nodeId; }, [nodeId]);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

  // タブ閉じ・ブラウザ戻るなどアプリを経由しない離脱でも pending patch を保存する
  useEffect(() => {
    const flushPending = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const patch = pendingPatch.current;
      pendingPatch.current = {};
      if (Object.keys(patch).length > 0) onUpdateRef.current(nodeIdRef.current, patch);
    };
    // beforeunload はページが本当に閉じる直前にしか発火せず、非同期保存が完了する前に
    // 通信が中断されることがある。visibilitychange（タブ切替・バックグラウンド化）は
    // ページがまだ生きている状態で発火するため、保存リクエストが完了する時間を確保できる。
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") flushPending(); };
    window.addEventListener("beforeunload", flushPending);
    window.addEventListener("pagehide", flushPending);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", flushPending);
      window.removeEventListener("pagehide", flushPending);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const flushSave = async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const patch = pendingPatch.current;
    pendingPatch.current = {};
    if (Object.keys(patch).length === 0) return;
    await onUpdate(nodeId, patch);
  };

  const scheduleSave = (patch) => {
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 800);
  };

  // nodeId が変わったらフォームをリセット
  useEffect(() => {
    if (node) {
      setLabel(node.label || "");
      setSituation((node.situation || []).join("、"));
      setMyApproach((node.myApproach || []).join("、"));
      setOrientation(node.orientation || "");
      setMemo(node.memo || "");
      setStatus(node.status || "wip");
      setUsageLevel(node.usageLevel || 2);
      setWinRate(node.winRate ?? null);
      setLikeLevel(node.likeLevel ?? null);
      setCommentTags((node.commentTags || []).join("、"));
      setAim(node.aim || "");
      setCaution(node.caution || "");
      setNextStudy(node.nextStudy || "");
      setBoardVisible(!!node.board && !node.boardHidden);
      setBoardData(node.board || null);
      setStamps(node.stamps || []);
      setHandSente(node.handSente || {p:0,l:0,n:0,s:0,g:0,b:0,r:0});
      setHandGote(node.handGote  || {p:0,l:0,n:0,s:0,g:0,b:0,r:0});
      setParentDetailsOpen((node.mergeParentIds || []).length > 0);
      if (node.label === "新しいノード") {
        labelInputRef.current?.focus();
        labelInputRef.current?.select();
      }
    }
    return () => {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      const patch = pendingPatch.current;
      pendingPatch.current = {};
      if (Object.keys(patch).length > 0) onUpdate(nodeId, patch);
    };
  }, [nodeId]); // node を外す：保存のたびに node 参照が変わり全 state がリセットされスクロール位置がトップに戻るため

  // 編集開始時点の盤面状態を記録する（盤面の「元に戻す」用スナップショット）
  useEffect(() => {
    if (node) {
      setBoardSnapshot({
        boardVisible: !!node.board && !node.boardHidden,
        boardHidden:  !!node.boardHidden,
        // 盤面なしは null のまま保持する。cloneBoard(null) は初期配置を返すため、
        // ここで cloneBoard を通すと「開いた時は盤面なし」が「初期配置」にすり替わってしまう。
        boardData:    node.board ? cloneBoard(node.board) : null,
        stamps:       node.stamps || [],
        handSente:    node.handSente || {p:0,l:0,n:0,s:0,g:0,b:0,r:0},
        handGote:     node.handGote  || {p:0,l:0,n:0,s:0,g:0,b:0,r:0},
        kifu:         node.kifu || [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  /** 「保存しました」トーストを一定時間表示する */
  const showToast = useCallback((msg = "保存しました") => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1600);
  }, []);

  // アンマウント時に未発火のトーストタイマーを破棄する（unmount後のsetState警告を防ぐ）
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  /** タグピッカーから新しいカスタムタグを追加する（戦法タグ系の入力欄で共有） */
  const handleAddCustomTag = (tag, group) => {
    addCustomTag(tag, group);
    setCustomTags(getCustomTagsByGroup());
    recordAction("customTag");
    showToast("タグを追加しました");
  };

  // ── 合流（追加の親子リンク）候補をメモ化（O(n²)の毎レンダリング再計算を防ぐ）──
  // 子→親（合流）の逆引きマップを1回だけ構築し、到達集合の算出を共有する。
  const { mergeChildren, mergeParentCandidates, mergeChildCandidates } = useMemo(() => {
    const allNodes = Object.values(tree.nodes);
    const cur = tree.nodes[nodeId];

    // 合流子の逆引きマップ：親ID → その親へ合流している子IDの配列
    const mergeChildrenMap = new Map();
    for (const n of allNodes) {
      for (const pid of (n.mergeParentIds || [])) {
        const arr = mergeChildrenMap.get(pid);
        if (arr) arr.push(n.id); else mergeChildrenMap.set(pid, [n.id]);
      }
    }

    // startId から実子＋合流子をたどって到達できるノードID集合（循環判定用）
    const reach = (startId) => {
      const seen  = new Set();
      const stack = [startId];
      while (stack.length) {
        const c    = stack.pop();
        const real = tree.nodes[c]?.childIds || [];
        const mrg  = mergeChildrenMap.get(c) || [];
        for (const cid of real) if (!seen.has(cid)) { seen.add(cid); stack.push(cid); }
        for (const cid of mrg)  if (!seen.has(cid)) { seen.add(cid); stack.push(cid); }
      }
      return seen;
    };

    const mergeParentIdsLocal = cur?.mergeParentIds || [];
    const downstream = reach(nodeId);

    // このノードに合流させる「親」候補：自分・実親・既存の合流親・下流（子孫）を除く
    // （親ノードの変更先候補も同じ条件のため共用）
    const parentCands = allNodes.filter((n) =>
      n.id !== nodeId &&
      n.id !== cur?.parentId &&
      !mergeParentIdsLocal.includes(n.id) &&
      !downstream.has(n.id)
    );

    // このノードを親とする「子」候補：自分・実子・既存の合流子・このノードを下流に持つノード(=祖先)を除く
    const childCands = allNodes.filter((n) =>
      n.id !== nodeId &&
      n.parentId !== nodeId &&
      !(n.mergeParentIds || []).includes(nodeId) &&
      !reach(n.id).has(nodeId)
    );

    // このノードへ合流している子（逆引き）
    const children = (mergeChildrenMap.get(nodeId) || []).map((id) => tree.nodes[id]).filter(Boolean);

    return { mergeChildren: children, mergeParentCandidates: parentCands, mergeChildCandidates: childCands };
  }, [tree.nodes, nodeId]);

  // 盤面を編集開始時点の状態に戻せるか（毎レンダリングの JSON.stringify 比較をメモ化）
  const canUndoBoard = useMemo(() => !!boardSnapshot && (
    boardVisible !== boardSnapshot.boardVisible ||
    JSON.stringify(boardData)         !== JSON.stringify(boardSnapshot.boardData) ||
    JSON.stringify(stamps)            !== JSON.stringify(boardSnapshot.stamps) ||
    JSON.stringify(handSente)         !== JSON.stringify(boardSnapshot.handSente) ||
    JSON.stringify(handGote)          !== JSON.stringify(boardSnapshot.handGote) ||
    JSON.stringify(node?.kifu || [])  !== JSON.stringify(boardSnapshot.kifu)
  ), [boardSnapshot, boardVisible, boardData, stamps, handSente, handGote, node]);

  if (!node) return null;

  const parent   = node.parentId ? tree.nodes[node.parentId] : null;
  const children = (node.childIds || []).map((id) => tree.nodes[id]).filter(Boolean);

  // 「親ノードの盤面を引き継いでいます」バナーは、実際に親と同一局面（＝引き継いだまま
  // 編集していない）ときだけ表示する。テンプレート読込や編集で局面が変わったら消す。
  const EMPTY_HAND = { p:0, l:0, n:0, s:0, g:0, b:0, r:0 };
  const boardInherited = !!(parent?.board && boardData) &&
    JSON.stringify(boardData)  === JSON.stringify(parent.board) &&
    JSON.stringify(handSente)  === JSON.stringify(parent.handSente || EMPTY_HAND) &&
    JSON.stringify(handGote)   === JSON.stringify(parent.handGote  || EMPTY_HAND);

  /** ルートまでのパスを「 › 」区切りで構築する */
  const breadcrumb = (() => {
    const parts = [];
    let cur = node;
    // 親が欠けている（参照先が見つからない）場合に undefined.parentId で落ちないよう ?. で防御する
    while (cur?.parentId) {
      cur = tree.nodes[cur.parentId];
      if (cur) parts.unshift(cur.label);
    }
    return parts.join(" › ");
  })();

  // 保留中のデバウンス保存から盤面系のキーを取り除く。
  // 盤面の削除・テンプレート読込・元に戻す等の即時保存の直後に、
  // 古い盤面を含む保留パッチが flush されて上書きし返すのを防ぐ。
  const dropPendingBoardKeys = () => {
    const p = pendingPatch.current;
    delete p.board; delete p.stamps; delete p.handSente; delete p.handGote;
  };

  const handleToggleBoard = () => {
    if (!boardVisible && !boardData) {
      const newBoard = cloneBoard(parent?.board ?? null);
      let hs = handSente, hg = handGote;
      // 前回（親ノード）の盤面を引き継ぐときは、持ち駒も併せて引き継ぐ。
      // 親に盤面があるときだけ引き継ぎ、盤面なし（＝初期配置に化ける）ときは
      // 持ち駒も初期状態のままにする。
      if (parent?.board) {
        hs = { ...(parent.handSente || {p:0,l:0,n:0,s:0,g:0,b:0,r:0}) };
        hg = { ...(parent.handGote  || {p:0,l:0,n:0,s:0,g:0,b:0,r:0}) };
        setHandSente(hs);
        setHandGote(hg);
      }
      setBoardData(newBoard);
      // 追加した盤面はその場で保存する（駒を動かさずに離れても消えないように）
      onUpdate(nodeId, { board: newBoard, handSente: hs, handGote: hg, boardHidden: false });
    } else if (!boardVisible) {
      // 非表示だった盤面を再表示（表示状態も保存する）
      onUpdate(nodeId, { boardHidden: false });
    } else {
      // 非表示にする（開き直しても非表示が保たれるよう保存する）
      onUpdate(nodeId, { boardHidden: true });
    }
    // 非表示 → 表示へ切り替わるとき（＝盤面を出したとき）に初回の使い方トーストを促す
    if (!boardVisible) onBoardFirstShown?.();
    setBoardVisible((v) => !v);
  };

  /** 盤面まわり（盤面・コマ台・棋譜）を編集開始時点に戻す */
  const handleUndoBoard = async () => {
    if (!boardSnapshot) return;
    dropPendingBoardKeys();
    setBoardVisible(boardSnapshot.boardVisible);
    // 開いた時が盤面なし（null）なら、そのまま盤面なしへ戻す（初期配置に化けさせない）
    setBoardData(boardSnapshot.boardData ? cloneBoard(boardSnapshot.boardData) : null);
    setStamps(boardSnapshot.stamps);
    setHandSente(boardSnapshot.handSente);
    setHandGote(boardSnapshot.handGote);
    await onUpdate(nodeId, {
      // 「開いた時に非表示の盤面があった」状態も含めてそのまま戻す
      board:       boardSnapshot.boardData,
      boardHidden: boardSnapshot.boardHidden,
      stamps:      boardSnapshot.boardData ? boardSnapshot.stamps : [],
      handSente:   boardSnapshot.handSente,
      handGote:    boardSnapshot.handGote,
      kifu:        boardSnapshot.kifu,
    });
    showToast("盤面をもとに戻しました");
  };

  /** 未保存の変更をflushしてから画面遷移する（他のフィールドは入力時に即時保存済み） */
  const saveAndNavigate = async (navigateFn) => {
    await flushSave();
    navigateFn();
  };

  /** 即時保存フィールドの共通処理。表示を先に更新し、保存に失敗したら元へ戻す
      （失敗しても選択済みのままになり、表示とDBがズレるのを防ぐ） */
  const saveField = async (patch, apply, revert) => {
    apply();
    const ok = await onUpdate(nodeId, patch);
    if (ok === false) revert();
  };

  // ── 合流（追加の親子リンク）操作 ──────────────────
  // モデル: 子ノードが mergeParentIds に「追加の親」を持つ。
  //   ・親 → 子（mergeChildren）も同じデータから算出できる（双方向参照）
  //   ・実子＋合流子をたどった到達集合で循環（双方が親になる等）を防ぐ
  const mergeParentIds = node.mergeParentIds || [];

  const addMergeParent = async (pid) => {
    setMergePickerOpen(false);
    if (typeof onSetMergeParents !== "function") return;
    await onSetMergeParents(nodeId, [...mergeParentIds, pid]);
    showToast("合流を追加しました");
  };
  const removeMergeParent = async (pid) => {
    if (typeof onSetMergeParents !== "function") return;
    await onSetMergeParents(nodeId, mergeParentIds.filter((id) => id !== pid));
    showToast("合流を解除しました");
  };
  const addMergeChild = async (cid) => {
    setMergeChildPickerOpen(false);
    if (typeof onSetMergeParents !== "function") return;
    const target = tree.nodes[cid];
    if (!target) return;
    await onSetMergeParents(cid, [...(target.mergeParentIds || []), nodeId]);
    showToast("合流を追加しました");
  };
  const removeMergeChild = async (cid) => {
    if (typeof onSetMergeParents !== "function") return;
    const target = tree.nodes[cid];
    if (!target) return;
    await onSetMergeParents(cid, (target.mergeParentIds || []).filter((id) => id !== nodeId));
    showToast("合流を解除しました");
  };

  // ── 親ノードの変更 ──────────────────────────────
  const handleChangeParent = async (newParentId) => {
    setParentChangePickerOpen(false);
    if (typeof onReparentNode !== "function") return;
    await onReparentNode(nodeId, newParentId);
    showToast("親ノードを変更しました");
  };

  // ── 子ノードの移動（既存ノードをこのノードの子として移動する）──────
  const handleChangeChild = async (childId) => {
    setChildChangePickerOpen(false);
    if (typeof onReparentNode !== "function") return;
    await onReparentNode(childId, nodeId);
    showToast("子ノードに移動しました");
  };

  // 「ついか」内の未入力項目が残っているか（志向・勝率）
  const addIncomplete = (!node.isRoot && !orientation) || winRate == null;

  /** 子孫IDを再帰的に収集してノード削除 */
  const collectDescendantIds = (id) => {
    const n = tree.nodes[id];
    if (!n) return [];
    return (n.childIds || []).flatMap((cid) => [cid, ...collectDescendantIds(cid)]);
  };

  const handleDeleteNode = async () => {
    const idsToDelete = [nodeId, ...collectDescendantIds(nodeId)];
    try {
      await onDeleteNode(idsToDelete, node.parentId);
    } catch (e) {
      console.error("ノード削除に失敗しました", e);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.cream, position: "relative" }}>
      {/* 保存トースト */}
      {toast && (
        <div style={{
          position:     "absolute",
          top:          12,
          left:         "50%",
          transform:    "translateX(-50%)",
          zIndex:       60,
          background:   "rgba(26,15,0,0.85)",
          color:        T.cream,
          fontSize:     T.fontSize.base,
          fontFamily:   T.fontSerif,
          padding:      "7px 16px",
          borderRadius: 20,
          display:      "flex",
          alignItems:   "center",
          gap:          6,
          boxShadow:    "0 4px 16px rgba(26,15,0,0.25)",
        }}>
          <i className="ti ti-check" style={{ fontSize: "0.8125rem" }} />{toast}
        </div>
      )}

      {/* ── トップバー ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 14px 10px", borderBottom: `0.5px solid ${T.inkLine}` }}>
        <BackBtn onClick={() => saveAndNavigate(onBack)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: T.fontSize.xl, fontWeight: 600, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {node.label}
          </div>
          {/* パスの先頭はルートノード名（＝ツリー名と同一）なので、ツリー名は重ねて表示しない */}
          {breadcrumb && (
            <div style={{ fontSize: T.fontSize.sm, color: T.inkMid, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {breadcrumb}
            </div>
          )}
        </div>
        {node.isMergeTarget && <MergeTag />}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* ════════════════ 親ノード ════════════════ */}
        {!node.isRoot && (
          <>
            <SectionHeader icon="ti-corner-left-up">親ノード</SectionHeader>
            <div style={{ padding: "0 16px 12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {parent && (
                  <div
                    onClick={() => saveAndNavigate(() => onNodeSelect(parent.id))}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: T.radius.sm, border: `0.5px solid ${T.inkLine}`, background: T.cream, cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = T.goldLight)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = T.cream)}
                  >
                    <i className="ti ti-corner-left-up" style={{ fontSize: "0.875rem", color: T.gray }} />
                    <span style={{ fontSize: T.fontSize.base, color: T.ink, flex: 1 }}>{parent.label}</span>
                    <i className="ti ti-chevron-right" style={{ fontSize: "0.875rem", color: T.gray }} />
                  </div>
                )}
                {parent && node.branchFromMoveIndex != null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px" }}>
                    <i className="ti ti-git-branch" style={{ fontSize: "0.8125rem", color: T.gray }} />
                    <span style={{ fontSize: T.fontSize.sm, color: T.gray }}>
                      {node.branchFromMoveIndex === 0
                        ? `「${parent.label}」の初期局面から分岐`
                        : `「${parent.label}」の第${node.branchFromMoveIndex}手から分岐`}
                    </span>
                  </div>
                )}

                {/* その他の操作（合流・親の変更）── デフォルト非表示 */}
                <div
                  onClick={() => setParentDetailsOpen((v) => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 4px", marginTop: 2, cursor: "pointer", color: T.inkFaint, fontSize: T.fontSize.sm, fontFamily: T.fontSerif }}
                >
                  <i className="ti ti-chevron-right" style={{ fontSize: "0.6875rem", transition: "transform 0.15s", transform: parentDetailsOpen ? "rotate(90deg)" : "none" }} />
                  その他の操作（合流・親の変更）
                </div>

                {parentDetailsOpen && (
                  <div style={{ display: "flex", flexDirection: "row", gap: 8, padding: "2px 0 0 4px" }}>
                    {onSetMergeParents && (
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <MergeLinkList
                          items={mergeParentIds.map((pid) => tree.nodes[pid]).filter(Boolean)}
                          candidates={mergeParentCandidates}
                          pickerOpen={mergePickerOpen}
                          setPickerOpen={setMergePickerOpen}
                          onAdd={addMergeParent}
                          onRemove={removeMergeParent}
                          addLabel="合流元を追加"
                          pickLabel="親にするノードを選択"
                        />
                      </div>
                    )}
                    {onReparentNode && (
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <LinkPicker
                          candidates={mergeParentCandidates}
                          pickerOpen={parentChangePickerOpen}
                          setPickerOpen={setParentChangePickerOpen}
                          onPick={handleChangeParent}
                          label="親ノードを変更"
                          pickLabel="新しい親ノードを選択"
                          icon="ti-arrows-exchange"
                          color={T.blue}
                          hoverBg={T.blueBg}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <SectionDivider />
          </>
        )}

        {/* ════════════════ きほん ════════════════ */}
        <SectionHeader icon="ti-pencil" dataOnboard="kihon">きほん</SectionHeader>

        {/* ノード名 + ステータス */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", padding: "0 16px 10px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SectionLabel style={{ marginBottom: 5 }}>ノード名</SectionLabel>
            {/* ルートノード名はツリー名と連動しているため、ここでは編集できない */}
            <input
              ref={labelInputRef}
              value={label}
              disabled={node.isRoot}
              onChange={(e) => { setLabel(e.target.value); scheduleSave({ label: e.target.value }); }}
              onBlur={(e) => {
                e.target.style.borderColor = T.inkLine;
                const next = label.trim() || node.label;
                if (next !== label) setLabel(next);
                scheduleSave({ label: next });
                flushSave();
              }}
              placeholder="例：▲４六銀型"
              style={node.isRoot ? { ...INPUT_STYLE, color: T.inkMid, background: T.goldLight } : INPUT_STYLE}
              onFocus={(e) => (e.target.style.borderColor = T.gold)}
            />
            {node.isRoot && (
              <div style={{ fontSize: T.fontSize.sm, color: T.inkFaint, marginTop: 4, fontFamily: T.fontSerif }}>
                ツリー名と連動しています（ツリー一覧の「編集」から変更できます）
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {["done", "wip"].map((s) => (
              <StatusChip
                key={s}
                status={s}
                active={status === s}
                onClick={() => saveField({ status: s }, () => setStatus(s), () => setStatus(node.status || "wip"))}
              />
            ))}
          </div>
        </div>

        {/* 相手の戦法・局面の状況 / 自分の戦法 */}
        {!node.isRoot && (
          <>
            <TagPickerField
              label="相手の戦法"
              text={situation}
              onSelectTag={(next) => saveField({ situation: next },
                () => setSituation(next.join("、")),
                () => setSituation((node.situation || []).join("、")))}
              groups={STRATEGY_GROUPS}
              customTags={customTags}
              onAddCustomTag={handleAddCustomTag}
            />

            <TagPickerField
              label="自分の戦法"
              text={myApproach}
              onSelectTag={(next) => saveField({ myApproach: next },
                () => setMyApproach(next.join("、")),
                () => setMyApproach((node.myApproach || []).join("、")))}
              groups={STRATEGY_GROUPS}
              customTags={customTags}
              onAddCustomTag={handleAddCustomTag}
            />
          </>
        )}

        {/* メモ */}
        <div style={{ padding: "0 16px 10px" }}>
          <SectionLabel style={{ marginBottom: 6 }}>メモ</SectionLabel>
          <textarea
            value={memo}
            onChange={(e) => { setMemo(e.target.value); scheduleSave({ memo: e.target.value }); }}
            placeholder="気づき・方針・手順のポイントなど"
            rows={4}
            style={{ width: "100%", border: `0.5px solid ${T.inkLine}`, borderRadius: T.radius.sm, padding: "10px 12px", fontSize: T.fontSize.base, color: T.ink, background: T.cream, resize: "none", fontFamily: T.fontSerif, lineHeight: 1.7, outline: "none" }}
            onFocus={(e) => (e.target.style.borderColor = T.gold)}
            onBlur={(e)  => { e.target.style.borderColor = T.inkLine; flushSave(); }}
          />
        </div>

        <Divider />

        {/* 盤面 */}
        <BoardSection
          boardVisible={boardVisible}
          boardData={boardData}
          stamps={stamps}
          parentBoard={boardInherited ? parent?.board : null}
          parentLabel={parent?.label}
          onToggle={handleToggleBoard}
          handSente={handSente}
          handGote={handGote}
          // 駒を動かすたびに即DBへ書くと編集中の書き込みが連発するため、
          // ローカル反映のみ即時にしてデバウンス保存（画面遷移・タブ非表示時はflush）
          onChange={(board, s, hs, hg) => {
            setBoardData(board); setStamps(s); setHandSente(hs); setHandGote(hg);
            scheduleSave({ board, stamps: s, handSente: hs, handGote: hg });
          }}
          onDelete={() => {
            // 盤面を削除するときは局面ごと消えるので、持ち駒も併せてクリアする。
            // （残すと、盤面なしの親から初期配置を引き継いだ際に古い持ち駒が残ってしまう）
            dropPendingBoardKeys();
            const emptyHand = {p:0,l:0,n:0,s:0,g:0,b:0,r:0};
            setBoardData(null); setStamps([]); setBoardVisible(false);
            setHandSente({ ...emptyHand }); setHandGote({ ...emptyHand });
            onUpdate(nodeId, { board: null, boardHidden: false, stamps: [], kifu: [], handSente: emptyHand, handGote: emptyHand });
          }}
          onLoadTemplate={(t) => {
            dropPendingBoardKeys();
            const b = t.board.map(r => [...r]);
            setBoardData(b);
            setHandSente({ ...t.handSente });
            setHandGote({ ...t.handGote });
            setStamps([]);
            setBoardVisible(true);
            onUpdate(nodeId, { board: b, stamps: [], handSente: t.handSente, handGote: t.handGote, boardHidden: false });
            recordAction("template");
            showToast("テンプレートを読み込みました");
          }}
          kifu={node.kifu || []}
          onKifuChange={async (newKifu) => { await onUpdate(nodeId, { kifu: newKifu }); if (newKifu.length > 0) recordAction("kifu"); showToast("棋譜を保存しました"); }}
          onKifuDelete={async () => {
            dropPendingBoardKeys();
            const initial = (node.kifu || [])[0];
            const board = initial ? cloneBoard(initial.board) : boardData;
            const hs = initial ? { ...initial.handSente } : handSente;
            const hg = initial ? { ...initial.handGote }  : handGote;
            setBoardData(board);
            setHandSente(hs);
            setHandGote(hg);
            setStamps([]);
            await onUpdate(nodeId, { board, stamps: [], handSente: hs, handGote: hg, kifu: [] });
            showToast("棋譜を削除しました");
          }}
          allowBranch={!!node.kifuImported}
          onBranchFromHere={(snapshot, moveIndex) => onBranchFromKifu?.(nodeId, snapshot, moveIndex)}
          canUndo={canUndoBoard}
          onUndo={handleUndoBoard}
        />

        <SectionDivider />

        {/* ════════════════ ついか ════════════════ */}
        <div onClick={() => setAddOpen((v) => !v)} style={{ cursor: "pointer" }}>
          <SectionHeader icon="ti-adjustments" dataOnboard="tsuika">
            {addIncomplete && <span style={{ color: T.gold, marginRight: 4 }}>・</span>}ついか
            <i className={`ti ti-chevron-${addOpen ? "up" : "down"}`} style={{ fontSize: "0.8125rem", color: T.inkMid, marginLeft: "auto" }} />
          </SectionHeader>
        </div>

        {addOpen && <>

        {/* 志向（攻め / 受け / バランス / 不明）*/}
        {!node.isRoot && (
          <div style={{ padding: "0 16px 10px" }}>
            <SectionLabel style={{ marginBottom: 5 }}>志向</SectionLabel>
            <div style={{ display: "flex", gap: 6 }}>
              {["攻め", "受け", "バランス", "不明"].map((o) => {
                const selected = orientation === o;
                const meta = ORIENTATION_META[o] || {};
                return (
                  <div
                    key={o}
                    onClick={() => saveField({ orientation: o },
                      () => setOrientation(o),
                      () => setOrientation(node.orientation || ""))}
                    style={{
                      flex:         1,
                      textAlign:    "center",
                      padding:      "8px 4px",
                      borderRadius: T.radius.md,
                      cursor:       "pointer",
                      fontSize:     T.fontSize.base,
                      fontFamily:   T.fontSerif,
                      transition:   "all 0.15s",
                      border:       selected ? `1.5px solid ${meta.color || T.gold}` : `0.5px solid ${T.inkLine}`,
                      background:   selected ? (meta.bg || T.goldLight) : T.cream,
                      color:        selected ? (meta.color || T.gold)   : T.inkMid,
                      fontWeight:   selected ? 600 : 400,
                    }}
                  >
                    {o}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 頻度 */}
        <div style={{ padding: "0 16px 10px" }}>
          <SectionLabel style={{ marginBottom: 5 }}>頻度</SectionLabel>
          <div style={{ display: "flex", alignItems: "center" }}>
            {USAGE_LEVELS.map((lvl, i) => (
              <div key={lvl} style={{ display: "flex", alignItems: "center", flex: i < USAGE_LEVELS.length - 1 ? 1 : "0 0 auto" }}>
                <input
                  type="radio"
                  name="usageLevel"
                  value={lvl}
                  checked={usageLevel === lvl}
                  onChange={() => saveField({ usageLevel: lvl },
                    () => setUsageLevel(lvl),
                    () => setUsageLevel(node.usageLevel || 2))}
                  style={{ width: 15, height: 15, margin: 0, accentColor: T.gold, cursor: "pointer", flexShrink: 0 }}
                />
                {i < USAGE_LEVELS.length - 1 && <div style={{ flex: 1, height: 1, background: T.inkLine, margin: "0 3px" }} />}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: T.fontSize.xs, color: T.inkMid, fontFamily: T.fontSerif }}>{USAGE_META[USAGE_LEVELS[0]].label}</span>
            <span style={{ fontSize: T.fontSize.xs, color: T.inkMid, fontFamily: T.fontSerif }}>{USAGE_META[USAGE_LEVELS[USAGE_LEVELS.length - 1]].label}</span>
          </div>
        </div>

        {/* 勝率 */}
        <div style={{ padding: "0 16px 10px" }}>
          <SectionLabel style={{ marginBottom: 5 }}>勝率</SectionLabel>
          <div style={{ display: "flex", alignItems: "center" }}>
            {WIN_RATE_LEVELS.map((lvl, i) => (
              <div key={lvl} style={{ display: "flex", alignItems: "center", flex: i < WIN_RATE_LEVELS.length - 1 ? 1 : "0 0 auto" }}>
                <input
                  type="radio"
                  name="winRate"
                  value={lvl}
                  checked={winRate === lvl}
                  onChange={() => saveField({ winRate: lvl },
                    () => setWinRate(lvl),
                    () => setWinRate(node.winRate ?? null))}
                  style={{ width: 15, height: 15, margin: 0, accentColor: T.gold, cursor: "pointer", flexShrink: 0 }}
                />
                {i < WIN_RATE_LEVELS.length - 1 && <div style={{ flex: 1, height: 1, background: T.inkLine, margin: "0 3px" }} />}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: T.fontSize.xs, color: T.inkMid, fontFamily: T.fontSerif }}>勝てない</span>
            <span style={{ fontSize: T.fontSize.xs, color: T.inkMid, fontFamily: T.fontSerif }}>勝ちやすい</span>
          </div>
          <div style={{ fontSize: T.fontSize.xs, color: T.inkMid, marginTop: 3, fontFamily: T.fontSerif }}>
            {winRate != null ? `${winRate}割くらい勝てる` : "未設定"}
          </div>
        </div>

        {/* 好き度 */}
        <div style={{ padding: "0 16px 10px" }}>
          <SectionLabel style={{ marginBottom: 5 }}>好き度</SectionLabel>
          <div style={{ display: "flex", alignItems: "center" }}>
            {LIKE_LEVELS.map((lvl, i) => (
              <div key={lvl.value} style={{ display: "flex", alignItems: "center", flex: i < LIKE_LEVELS.length - 1 ? 1 : "0 0 auto" }}>
                <input
                  type="radio"
                  name="likeLevel"
                  value={lvl.value}
                  checked={likeLevel === lvl.value}
                  onChange={() => saveField({ likeLevel: lvl.value },
                    () => setLikeLevel(lvl.value),
                    () => setLikeLevel(node.likeLevel ?? null))}
                  style={{ width: 15, height: 15, margin: 0, accentColor: T.gold, cursor: "pointer", flexShrink: 0 }}
                />
                {i < LIKE_LEVELS.length - 1 && <div style={{ flex: 1, height: 1, background: T.inkLine, margin: "0 3px" }} />}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: T.fontSize.xs, color: T.inkMid, fontFamily: T.fontSerif }}>{LIKE_LEVELS[0].label}</span>
            <span style={{ fontSize: T.fontSize.xs, color: T.inkMid, fontFamily: T.fontSerif }}>{LIKE_LEVELS[LIKE_LEVELS.length - 1].label}</span>
          </div>
        </div>

        {/* ════ コメント（折りたたみ） ════ */}
        <div
          onClick={() => setCommentOpen((v) => !v)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 16px 6px", cursor: "pointer" }}
        >
          <SectionLabel style={{ marginBottom: 0 }}>コメント</SectionLabel>
          <i className={`ti ti-chevron-${commentOpen ? "up" : "down"}`} style={{ fontSize: "0.8125rem", color: T.inkMid }} />
        </div>

        {commentOpen && <>
          {[
            { label: "ここでの狙い",   value: aim,       set: setAim,       key: "aim",       placeholder: "この局面・戦法で目指すこと" },
            { label: "気を付けること", value: caution,   set: setCaution,   key: "caution",   placeholder: "ミスしやすい点・落とし穴" },
            { label: "次に調べること", value: nextStudy, set: setNextStudy, key: "nextStudy", placeholder: "宿題・深掘りしたい手順" },
          ].map(({ label, value, set, key, placeholder }) => (
            <div key={key} style={{ padding: "0 16px 10px" }}>
              <SectionLabel style={{ marginBottom: 5 }}>{label}</SectionLabel>
              <textarea
                value={value}
                onChange={(e) => { set(e.target.value); scheduleSave({ [key]: e.target.value }); }}
                onBlur={(e) => { e.target.style.borderColor = T.inkLine; flushSave(); }}
                placeholder={placeholder}
                rows={2}
                style={{ width: "100%", border: `0.5px solid ${T.inkLine}`, borderRadius: T.radius.sm, padding: "8px 12px", fontSize: T.fontSize.base, color: T.ink, background: T.cream, resize: "none", fontFamily: T.fontSerif, lineHeight: 1.7, outline: "none", boxSizing: "border-box" }}
                onFocus={(e) => (e.target.style.borderColor = T.gold)}
              />
            </div>
          ))}

          <TagPickerField
            label="一言コメント"
            text={commentTags}
            onSelectTag={(next) => saveField({ commentTags: next },
              () => setCommentTags(next.join("、")),
              () => setCommentTags((node.commentTags || []).join("、")))}
            groups={COMMENT_GROUPS}
            customTags={commentCustomTags}
            onAddCustomTag={(tag, group) => {
              addCommentCustomTag(tag, group);
              setCommentCustomTags(getCommentCustomTags());
            }}
            noToggle
          />
        </>}

        </>}

        <SectionDivider />

        {/* ════════════════ 子ノード ════════════════ */}
        <SectionHeader icon="ti-git-branch" dataOnboard="children">子ノード</SectionHeader>
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {children.map((child) => {
              const m = STATUS_META[child.status] || STATUS_META.todo;
              return (
                <div
                  key={child.id}
                  onClick={() => saveAndNavigate(() => onNodeSelect(child.id))}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: T.radius.sm, border: `0.5px solid ${T.inkLine}`, background: T.cream, cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = T.goldLight)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = T.cream)}
                >
                  <div style={{ width: 2, height: 20, borderRadius: 1, flexShrink: 0, background: m.dashed ? "transparent" : m.dot, border: m.dashed ? "0.5px dashed #B4B2A9" : "none" }} />
                  <span style={{ fontSize: T.fontSize.base, color: T.ink, flex: 1 }}>{child.label}</span>
                  {child.isMergeTarget && <MergeTag />}
                  <StatusChip status={child.status} />
                  <i className="ti ti-chevron-right" style={{ fontSize: "0.875rem", color: T.gray }} />
                </div>
              );
            })}

           {/* 分岐追加ボタン */}
            <div
              onClick={() => saveAndNavigate(() => onNewNode(nodeId))}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: T.radius.sm, border: `0.5px dashed ${T.inkLine}`, cursor: "pointer", color: T.gold, fontSize: T.fontSize.base }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.goldLight)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <i className="ti ti-git-branch" style={{ fontSize: "0.875rem" }} />ここから分岐を追加
            </div>

            {/* その他の操作（合流・子の変更）── デフォルト非表示 */}
            {(onSetMergeParents || onReparentNode) && (
              <div
                onClick={() => setChildDetailsOpen((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 4px", marginTop: 2, cursor: "pointer", color: T.inkFaint, fontSize: T.fontSize.sm, fontFamily: T.fontSerif }}
              >
                <i className="ti ti-chevron-right" style={{ fontSize: "0.6875rem", transition: "transform 0.15s", transform: childDetailsOpen ? "rotate(90deg)" : "none" }} />
                その他の操作（合流・子の移動）
              </div>
            )}

            {childDetailsOpen && (
              <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
                {!node.isRoot && onSetMergeParents && (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <MergeLinkList
                      items={mergeChildren}
                      candidates={mergeChildCandidates}
                      pickerOpen={mergeChildPickerOpen}
                      setPickerOpen={setMergeChildPickerOpen}
                      onAdd={addMergeChild}
                      onRemove={removeMergeChild}
                      addLabel="合流する子を追加"
                      pickLabel="子にするノードを選択"
                    />
                  </div>
                )}
                {onReparentNode && (
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <LinkPicker
                      candidates={mergeChildCandidates}
                      pickerOpen={childChangePickerOpen}
                      setPickerOpen={setChildChangePickerOpen}
                      onPick={handleChangeChild}
                      label="既存ノードを子に移動"
                      pickLabel="子にするノードを選択"
                      icon="ti-arrows-exchange"
                      color={T.blue}
                      hoverBg={T.blueBg}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── ノード削除 ── */}
          {!node.isRoot && onDeleteNode && (
            <div style={{ padding: "16px 0 0", marginTop: 10, borderTop: `0.5px solid ${T.inkLineFaint}` }}>
              {!deleteConfirm ? (
                <button
                  onClick={() => setDeleteConfirm(true)}
                  style={{ width: "100%", padding: "9px", borderRadius: T.radius.md, border: `0.5px solid ${T.red}`, background: T.redBg, color: T.red, fontSize: T.fontSize.base, fontFamily: T.fontSerif, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  <i className="ti ti-trash" style={{ fontSize: "0.8125rem" }} />
                  このノードを削除する
                </button>
              ) : (
                <div>
                  <div style={{ fontSize: T.fontSize.md, color: T.red, marginBottom: 10, textAlign: "center", lineHeight: 1.6 }}>
                    「{node.label}」と子ノードをすべて削除します。<br />元に戻せません。
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setDeleteConfirm(false)}
                      style={{ flex: 1, padding: 9, borderRadius: T.radius.md, border: `0.5px solid ${T.inkLine}`, background: "transparent", fontSize: T.fontSize.base, fontFamily: T.fontSerif, cursor: "pointer", color: T.inkMid }}
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={handleDeleteNode}
                      style={{ flex: 2, padding: 9, borderRadius: T.radius.md, border: "none", background: T.red, color: T.cream, fontSize: T.fontSize.base, fontFamily: T.fontSerif, fontWeight: 600, cursor: "pointer" }}
                    >
                      削除する
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
