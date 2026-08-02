// ══════════════════════════════════════════════════════════════════
// NodeDetailScreen.jsx  ―  ノード詳細編集画面
//   親ノード / きほん / ついか / 子ノード
//
//   このファイルが持つのは「状態と保存」だけ。各セクションの見た目は
//   screens/node/ に分けてある：
//     ParentSection    親ノード（親リンク・合流・親の変更）
//     TurnEvalSection  手番・評価値（盤面の直下）
//     TsuikaSection    ついか（志向・レーティング・研究メモ）
//     ChildrenSection  子ノード（一覧・分岐追加・実戦候補・合流）
//     KifuPickerModal  棋譜ライブラリからの取り込み
//   「きほん」だけは保存の作法が項目ごとに違うため、ここに残している。
// ══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  StatusChip, MergeTag, Divider, BackBtn,
} from "../components";
import { STRATEGY_GROUPS, COMMENT_GROUPS } from "../data";
import { recordAction, getCustomTagsByGroup, addCustomTag, getCommentCustomTags, addCommentCustomTag, isTsuikaVisible } from "../rewards";
import { T, TEXTAREA_STYLE, INPUT_STYLE, cloneBoard, parseTags, focusBorder, blurBorder } from "../theme";
import { SectionLabel, BoardSection, TagPickerField } from "../components/uiParts";
import { fetchKifusForAnalysis, kifuRowToKifu } from "../db";
import { toAnalysisGame } from "../kifuAnalyze";
import { branchCandidates, candidateToNodeFields } from "../kifuBranching";
import { KifuPickerModal } from "./node/KifuPickerModal";
import { SectionHeader, SectionDivider } from "./node/sectionParts";
import { TsuikaSection } from "./node/TsuikaSection";
import { TurnEvalSection } from "./node/TurnEvalSection";
import { ParentSection } from "./node/ParentSection";
import { ChildrenSection } from "./node/ChildrenSection";

// ══════════════════════════════════════════════════════════════════
// NodeDetail: ノード詳細編集画面
// ══════════════════════════════════════════════════════════════════
export function NodeDetail({ tree, nodeId, userId, onBack, onNodeSelect, onNewNode, onUpdate, onDeleteNode, onSetMergeParents, onReparentNode, onBranchFromKifu, onBranchRangeFromKifu, onBoardFirstShown }) {
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
  const [turn,         setTurn]         = useState(null); // 'sente' | 'gote' | null
  const [evalSign,     setEvalSign]     = useState("+");  // 評価値の符号（選択式）
  const [evalValue,    setEvalValue]    = useState("");   // 評価値の絶対値（文字列）
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
  const [whenToUse,   setWhenToUse]   = useState(""); // きほん：いつ使う（短文）
  const [openingFocus, setOpeningFocus] = useState(""); // ついか：序盤の意識
  // 分岐の候補（実戦で当たった相手）。開いたときだけ棋譜を読む
  const [branchOpen,     setBranchOpen]     = useState(false);
  const [branchGames,    setBranchGames]    = useState(null);  // null = 未取得
  const [branchLoading,  setBranchLoading]  = useState(false);
  const [mergePickerOpen,        setMergePickerOpen]        = useState(false);
  const [mergeChildPickerOpen,   setMergeChildPickerOpen]   = useState(false);
  const [parentDetailsOpen,      setParentDetailsOpen]      = useState(false);
  const [parentChangePickerOpen, setParentChangePickerOpen] = useState(false);
  const [childDetailsOpen,       setChildDetailsOpen]       = useState(false);
  const [childChangePickerOpen,  setChildChangePickerOpen]  = useState(false);
  const [deleteConfirm,          setDeleteConfirm]          = useState(false);
  const [boardSnapshot,          setBoardSnapshot]          = useState(null);
  const [addOpen,                setAddOpen]                = useState(false);
  const [kifuPickerOpen,         setKifuPickerOpen]         = useState(false);

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
      setWhenToUse(node.whenToUse || "");
      setOpeningFocus(node.openingFocus || "");
      setBoardVisible(!!node.board && !node.boardHidden);
      setBoardData(node.board || null);
      setStamps(node.stamps || []);
      setTurn(node.turn || null);
      setEvalSign((node.evaluation ?? 0) < 0 ? "-" : "+");
      setEvalValue(node.evaluation != null ? String(Math.abs(node.evaluation)) : "");
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
    // node / onUpdate を依存から意図的に外す：保存のたびに node 参照が変わり、
    // 全 state がリセットされてスクロール位置がトップに戻ってしまうため。
    // 最新値が要る箇所は nodeIdRef / onUpdateRef を通して読む。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

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

  // このノードの戦法タグ（相手の戦法＋自分の戦法）。棋譜ピッカーの並べ替えに使う
  const nodeTags = useMemo(
    () => [...new Set([...parseTags(situation), ...parseTags(myApproach)])],
    [situation, myApproach],
  );

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

  // ── フックは早期 return より前にまとめる ──────────────────
  //   React のフックは毎レンダーで同じ順序・同じ回数だけ呼ぶ必要がある。
  //   `if (!node) return null` の後ろに useMemo を置くと、ノード削除直後など
  //   node が一瞬 undefined になったレンダーでフックの数が変わり、React が
  //   「Rendered fewer hooks than expected」で落ちる。
  const children = useMemo(
    () => (node?.childIds || []).map((id) => tree.nodes[id]).filter(Boolean),
    [node, tree.nodes],
  );

  // ── 分岐の候補 ────────────────────────────────────
  // 実戦で当たった相手を候補として出す。アプリが出すのは「相手が選ぶ分岐」だけで、
  // 自分がどう指すかは枝の中身なので候補にしない。
  // 当たったことのない戦法も出さない（その人にとっては対策不要とも言えるため）。
  const branch = useMemo(() => branchCandidates({
    myApproach: parseTags(myApproach),
    situation:  parseTags(situation),
    games:      branchGames || [],
    // 既に枝がある相手は候補から外す。ノード名と「相手の戦法」タグの両方で照合する
    existingNames: children.flatMap((c) => [c.label, ...(c.situation || [])]),
  }), [myApproach, situation, branchGames, children]);

  // ── 「とりあえず」の作り直し ────────────────────────
  // 置き場は普通のノードなので削除できてしまう。消したあと戻す道が
  // どこにも無いと詰むため、ルートの子ノード欄から作り直せるようにする。
  const treeHasInbox = useMemo(
    () => Object.values(tree.nodes).some((n) => n.isInbox),
    [tree.nodes],
  );

  if (!node) return null;

  const parent = node.parentId ? tree.nodes[node.parentId] : null;

  const toggleBranchCandidates = async () => {
    const next = !branchOpen;
    setBranchOpen(next);
    // 開いたときに一度だけ読む。棋譜は軽い列だけ（盤面は読まない）
    if (!next || branchGames !== null || !userId) return;
    setBranchLoading(true);
    const { data } = await fetchKifusForAnalysis(userId);
    setBranchGames((data || []).map(kifuRowToKifu).map(toAnalysisGame).filter(Boolean));
    setBranchLoading(false);
  };

  const hasStrategyTag = parseTags(myApproach).length > 0 || parseTags(situation).length > 0;

  // 「ついか」内の各項目の表示可否（設定でON/OFF可能。OFFでもデータは残る）。
  // 全項目OFFなら「ついか」セクション自体を出さない
  const tsuikaShow = {
    orientation:  !node.isRoot && isTsuikaVisible("orientation"),
    openingFocus: isTsuikaVisible("openingFocus"),
    usage:        isTsuikaVisible("usage"),
    winRate:      isTsuikaVisible("winRate"),
    likeLevel:    isTsuikaVisible("likeLevel"),
    studyMemo:    isTsuikaVisible("studyMemo"),
  };
  // 「ついか」の外にあるカスタム対象（一言コメント＝メモの下 / 評価値＝盤面の下 /
  // 合流＝親・子ノードの「その他の操作」内）。
  // 合流OFFで消えるのは編集UIのみ。既存の合流データ（バッジ・マップの合流線）は残る
  const showCommentTags = isTsuikaVisible("commentTags");
  const showEvaluation  = isTsuikaVisible("evaluation");
  const showMerge       = isTsuikaVisible("merge");

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

  // ── 「ついか」欄の保存 ──────────────────────────────
  // 項目ごとに setter を書き並べる代わりに、キー→setter の対応表を1つ持つ。
  // 項目を増やすときはこの表と TsuikaSection の描画だけを足せばよい。
  const tsuikaSetters = {
    orientation:  setOrientation,
    openingFocus: setOpeningFocus,
    usageLevel:   setUsageLevel,
    winRate:      setWinRate,
    likeLevel:    setLikeLevel,
    aim:          setAim,
    caution:      setCaution,
    nextStudy:    setNextStudy,
  };
  // 保存に失敗したときに戻す値（node に値が無い項目の既定値）
  const TSUIKA_DEFAULTS = { orientation: "", usageLevel: 2, winRate: null, likeLevel: null };

  /** 選択式（志向・頻度・勝率・好き度）：タップで即保存し、失敗したら元に戻す */
  const pickTsuikaField = (key, value) => saveField(
    { [key]: value },
    () => tsuikaSetters[key](value),
    () => tsuikaSetters[key](node[key] ?? TSUIKA_DEFAULTS[key]),
  );

  /** 入力式（序盤の意識・研究メモ）：打っている間はデバウンス保存 */
  const editTsuikaField = (key, value) => {
    tsuikaSetters[key](value);
    scheduleSave({ [key]: value });
  };

  // ── 手番・評価値 ─────────────────────────────────
  // 手番チップ：タップで選択、選択中をもう一度タップで未設定に戻す
  const handleTurnSelect = (t) => {
    const next = turn === t ? null : t;
    saveField({ turn: next }, () => setTurn(next), () => setTurn(node.turn || null));
  };

  // 評価値：符号（選択式）と数値を合成して保留パッチに載せる。数値が空なら未入力（null）。
  // blur を待たず scheduleSave に載せることで、タブ切替・離脱時の flush 安全網
  // （beforeunload/pagehide/visibilitychange）の対象になる
  const handleEvalChange = (sign, valueStr) => {
    setEvalSign(sign);
    setEvalValue(valueStr);
    const num = parseFloat(valueStr);
    const evaluation = Number.isNaN(num) ? null : (sign === "-" ? -num : num);
    scheduleSave({ evaluation });
  };

  // ── 棋譜ライブラリからの取り込み ──────────────────
  // 棋譜スナップショットをノードへコピーし、盤面を最終局面に合わせる。
  // 参照ではなくコピーなので、ライブラリ側の削除・編集はノードに影響しない。
  const handleImportKifu = async (kifu) => {
    const snaps = kifu.snapshots || [];
    const lastSnap = snaps[snaps.length - 1];
    if (!lastSnap) return;
    dropPendingBoardKeys();
    const board = cloneBoard(lastSnap.board);
    const hs = { ...lastSnap.handSente };
    const hg = { ...lastSnap.handGote };
    setBoardData(board);
    setHandSente(hs);
    setHandGote(hg);
    setStamps([]);
    setBoardVisible(true);
    await onUpdate(nodeId, {
      board, handSente: hs, handGote: hg, stamps: [],
      kifu: snaps, kifuImported: true, boardHidden: false,
    });
    recordAction("kifu");
    showToast("棋譜を取り込みました");
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
          <ParentSection
            node={node} parent={parent}
            onOpenParent={() => saveAndNavigate(() => onNodeSelect(parent.id))}
            detailsOpen={parentDetailsOpen}
            onToggleDetails={() => setParentDetailsOpen((v) => !v)}
            showMerge={showMerge}
            mergeParents={mergeParentIds.map((pid) => tree.nodes[pid]).filter(Boolean)}
            mergeCandidates={mergeParentCandidates}
            mergePickerOpen={mergePickerOpen} setMergePickerOpen={setMergePickerOpen}
            onAddMergeParent={onSetMergeParents ? addMergeParent : null}
            onRemoveMergeParent={removeMergeParent}
            onReparent={onReparentNode ? handleChangeParent : null}
            reparentPickerOpen={parentChangePickerOpen}
            setReparentPickerOpen={setParentChangePickerOpen}
          />
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
              onFocus={focusBorder}
            />
            {node.isRoot && (
              <div style={{ fontSize: T.fontSize.sm, color: T.inkFaint, marginTop: 4, fontFamily: T.fontSerif }}>
                ツリー名と連動しています（ツリー一覧の「編集」から変更できます）
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {/* 未定（todo）にも戻せるよう3ステータスすべてを選択肢にする */}
            {["done", "wip", "todo"].map((s) => (
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
            placeholder="この局面の気づき・方針を自由に（迷ったらまずここに）"
            rows={4}
            style={{ ...TEXTAREA_STYLE, padding: "10px 12px" }}
            onFocus={focusBorder}
            onBlur={(e) => { blurBorder(e); flushSave(); }}
          />
        </div>

        {/* いつ使う（短文）。この戦法・局面をどんなときに使うかを一言で。
            親から子ノード一覧を見たときに、入力があれば各子の下に表示される */}
        <div style={{ padding: "0 16px 10px" }}>
          <SectionLabel style={{ marginBottom: 5 }}>いつ使う</SectionLabel>
          <input
            value={whenToUse}
            onChange={(e) => { setWhenToUse(e.target.value); scheduleSave({ whenToUse: e.target.value }); }}
            onBlur={(e) => { blurBorder(e); flushSave(); }}
            onFocus={focusBorder}
            placeholder="例：相手が急戦できたとき／早く固めたいとき"
            style={INPUT_STYLE}
          />
        </div>

        {/* 一言コメント（感触・課題タグ）
            言葉にするのが難しいときの受け皿なので、「ついか」の奥ではなく
            対局直後に目に入るメモの直下に置く（閉じているときは選択済みタグのみ表示） */}
        {showCommentTags && (
        <TagPickerField
          label="一言コメント（タップで気軽に記録）"
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
        )}

        <Divider />

        {/* 盤面 */}
        {/* key=nodeId: ノード移動時に ShogiBoard ごと再マウントし、
            再生モード・記録中・選択ツールなどの内部 state を持ち越さない */}
        <BoardSection
          key={nodeId}
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
          onBranchRange={(startIdx, endIdx) => onBranchRangeFromKifu?.(nodeId, startIdx, endIdx)}
          canUndo={canUndoBoard}
          onUndo={handleUndoBoard}
        />

        {/* 手番・評価値（盤面表示中のみ。局面に紐づく情報のため盤面の直下に置く） */}
        {boardVisible && (
          <TurnEvalSection
            turn={turn} onTurnSelect={handleTurnSelect}
            showEvaluation={showEvaluation}
            evalSign={evalSign} evalValue={evalValue}
            onEvalChange={handleEvalChange} onEvalEnd={flushSave}
          />
        )}

        {/* 棋譜ライブラリからの取り込み */}
        {userId && (
          <div style={{ padding: "0 16px 12px" }}>
            <div
              data-onboard="kifu-import"
              onClick={() => setKifuPickerOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: T.radius.sm, border: `0.5px dashed ${T.brown}`, cursor: "pointer", color: T.brown, fontSize: T.fontSize.base }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.goldLight)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <i className="ti ti-books" style={{ fontSize: "0.875rem" }} />保存済み棋譜から取り込む
            </div>
          </div>
        )}

        <SectionDivider />

        {/* ════════════════ ついか ════════════════
            項目は設定でON/OFFできる。全項目OFFのときはセクションごと非表示 */}
        <TsuikaSection
          show={tsuikaShow}
          values={{ orientation, openingFocus, usageLevel, winRate, likeLevel, aim, caution, nextStudy }}
          open={addOpen}          onToggleOpen={() => setAddOpen((v) => !v)}
          memoOpen={commentOpen}  onToggleMemo={() => setCommentOpen((v) => !v)}
          onPick={pickTsuikaField}
          onEdit={editTsuikaField}
          onEditEnd={flushSave}
        />

        {/* ════════════════ 子ノード ════════════════ */}
        <SectionHeader icon="ti-git-branch" dataOnboard="children">子ノード</SectionHeader>
        <div style={{ padding: "0 16px 16px" }}>
          <ChildrenSection
            nodes={children}
            onOpenChild={(id) => saveAndNavigate(() => onNodeSelect(id))}
            onAddBranch={() => saveAndNavigate(() => onNewNode(nodeId))}
            isRoot={!!node.isRoot}
            showInboxButton={!treeHasInbox}
            onCreateInbox={() => saveAndNavigate(() => onNewNode(nodeId, {
              label: "とりあえず", status: "todo", isInbox: true,
              whenToUse: "どこに置くか決まっていないもの",
              sortOrder: 9999,
            }))}
            showCandidates={hasStrategyTag}
            candidatesOpen={branchOpen}
            onToggleCandidates={toggleBranchCandidates}
            candidatesLoading={branchLoading}
            branch={branch}
            onPickCandidate={(c) => saveAndNavigate(() => onNewNode(nodeId, candidateToNodeFields(c, branch.axis)))}
            showMerge={showMerge}
            detailsOpen={childDetailsOpen}
            onToggleDetails={() => setChildDetailsOpen((v) => !v)}
            mergeChildren={mergeChildren}
            mergeCandidates={mergeChildCandidates}
            mergePickerOpen={mergeChildPickerOpen} setMergePickerOpen={setMergeChildPickerOpen}
            onAddMergeChild={onSetMergeParents ? addMergeChild : null}
            onRemoveMergeChild={removeMergeChild}
            onMoveChild={onReparentNode ? handleChangeChild : null}
            movePickerOpen={childChangePickerOpen} setMovePickerOpen={setChildChangePickerOpen}
          />

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

      {/* 棋譜ライブラリからの取り込みモーダル */}
      {kifuPickerOpen && (
        <KifuPickerModal
          userId={userId}
          nodeTags={nodeTags}
          hasExistingKifu={(node.kifu || []).length > 0}
          onClose={() => setKifuPickerOpen(false)}
          onImport={handleImportKifu}
        />
      )}
    </div>
  );
}
