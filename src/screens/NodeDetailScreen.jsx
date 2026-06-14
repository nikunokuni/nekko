// ══════════════════════════════════════════════════════════════════
// NodeDetailScreen.jsx  ―  ノード詳細編集画面
//   親ノード / きほん / ついか / 子ノード
// ══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef } from "react";
import {
  StatusChip, MergeTag, Divider, BackBtn,
} from "../components";
import {
  STATUS_META, APPROACH_META, SUGGESTIONS, WIN_RATE_LEVELS,
} from "../data";
import { recordAction, getCustomTags, addCustomTag } from "../rewards";
import { T, INPUT_STYLE, parseTags, cloneBoard } from "../theme";
import { SectionLabel, BoardSection, MergeLinkList, LinkPicker } from "../components/uiParts";

// ── セクション見出し ──────────────────────────────
function SectionHeader({ icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "14px 16px 8px", fontSize: T.fontSize.base, fontWeight: 600, color: T.inkMid, letterSpacing: "0.04em", fontFamily: T.fontSerif }}>
      <i className={`ti ${icon}`} style={{ fontSize: 13, color: T.gold }} />{children}
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
export function NodeDetail({ tree, nodeId, onBack, onNodeSelect, onNewNode, onUpdate, onDeleteNode, onSetMergeParents, onReparentNode, onBranchFromKifu }) {
  const node = tree.nodes[nodeId];

  const [label,        setLabel]        = useState("");
  const [tags,         setTags]         = useState("");
  const [approach,     setApproach]     = useState("");
  const [memo,         setMemo]         = useState("");
  const [status,       setStatus]       = useState("wip");
  const [usageLevel,   setUsageLevel]   = useState(2);
  const [winRate,      setWinRate]      = useState(null);
  const [boardVisible, setBoardVisible] = useState(false);
  const [boardData,    setBoardData]    = useState(null);
  const [stamps,       setStamps]       = useState([]);
  const [handSente,   setHandSente]   = useState({p:0,l:0,n:0,s:0,g:0,b:0,r:0});
  const [handGote,    setHandGote]    = useState({p:0,l:0,n:0,s:0,g:0,b:0,r:0});
  const [toast,        setToast]        = useState("");
  const [suggOpen,     setSuggOpen]     = useState(false);
  const [customTags,   setCustomTags]   = useState(() => getCustomTags());
  const [addingTag,    setAddingTag]    = useState(false);
  const [newTagInput,  setNewTagInput]  = useState("");
  const [mergePickerOpen,        setMergePickerOpen]        = useState(false);
  const [mergeChildPickerOpen,   setMergeChildPickerOpen]   = useState(false);
  const [parentDetailsOpen,      setParentDetailsOpen]      = useState(false);
  const [parentChangePickerOpen, setParentChangePickerOpen] = useState(false);
  const [deleteConfirm,          setDeleteConfirm]          = useState(false);
  const [boardSnapshot,          setBoardSnapshot]          = useState(null);

  // デバウンス付き自動保存（ノード名・メモ・タグなど、入力ごとに即時送信したくないフィールド用）
  const pendingPatch = useRef({});
  const saveTimer    = useRef(null);

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
      setTags((node.tags || []).join("、"));
      setApproach(node.approachType || "");
      setMemo(node.memo || "");
      setStatus(node.status || "wip");
      setUsageLevel(node.usageLevel || 2);
      setWinRate(node.winRate ?? null);
      setBoardVisible(!!node.board);
      setBoardData(node.board || null);
      setStamps(node.stamps || []);
      setHandSente(node.handSente || {p:0,l:0,n:0,s:0,g:0,b:0,r:0});
      setHandGote(node.handGote  || {p:0,l:0,n:0,s:0,g:0,b:0,r:0});
      setParentDetailsOpen((node.mergeParentIds || []).length > 0);
    }
    return () => {
      if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
      const patch = pendingPatch.current;
      pendingPatch.current = {};
      if (Object.keys(patch).length > 0) onUpdate(nodeId, patch);
    };
  }, [nodeId, node]);

  // 編集開始時点の盤面状態を記録する（盤面の「元に戻す」用スナップショット）
  useEffect(() => {
    if (node) {
      setBoardSnapshot({
        boardVisible: !!node.board,
        boardData:    cloneBoard(node.board || null),
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
    setTimeout(() => setToast(""), 1600);
  }, []);

  if (!node) return null;

  const parent   = node.parentId ? tree.nodes[node.parentId] : null;
  const children = (node.childIds || []).map((id) => tree.nodes[id]).filter(Boolean);

  /** ルートまでのパスを「 › 」区切りで構築する */
  const breadcrumb = (() => {
    const parts = [];
    let cur = node;
    while (cur.parentId) {
      cur = tree.nodes[cur.parentId];
      if (cur) parts.unshift(cur.label);
    }
    return parts.join(" › ");
  })();

  const handleToggleBoard = () => {
    if (!boardVisible && !boardData) {
      setBoardData(cloneBoard(parent?.board ?? null));
    }
    setBoardVisible((v) => !v);
  };

  // 盤面を編集開始時点の状態に戻せるか
  const canUndoBoard = !!boardSnapshot && (
    boardVisible !== boardSnapshot.boardVisible ||
    JSON.stringify(boardData)       !== JSON.stringify(boardSnapshot.boardData) ||
    JSON.stringify(stamps)          !== JSON.stringify(boardSnapshot.stamps) ||
    JSON.stringify(handSente)       !== JSON.stringify(boardSnapshot.handSente) ||
    JSON.stringify(handGote)        !== JSON.stringify(boardSnapshot.handGote) ||
    JSON.stringify(node.kifu || []) !== JSON.stringify(boardSnapshot.kifu)
  );

  /** 盤面まわり（盤面・コマ台・棋譜）を編集開始時点に戻す */
  const handleUndoBoard = async () => {
    if (!boardSnapshot) return;
    setBoardVisible(boardSnapshot.boardVisible);
    setBoardData(cloneBoard(boardSnapshot.boardData));
    setStamps(boardSnapshot.stamps);
    setHandSente(boardSnapshot.handSente);
    setHandGote(boardSnapshot.handGote);
    await onUpdate(nodeId, {
      board:     boardSnapshot.boardVisible ? boardSnapshot.boardData : null,
      stamps:    boardSnapshot.boardVisible ? boardSnapshot.stamps    : [],
      handSente: boardSnapshot.handSente,
      handGote:  boardSnapshot.handGote,
      kifu:      boardSnapshot.kifu,
    });
    showToast("盤面をもとに戻しました");
  };

  /** 未保存の変更をflushしてから画面遷移する（他のフィールドは入力時に即時保存済み） */
  const saveAndNavigate = async (navigateFn) => {
    await flushSave();
    navigateFn();
  };

  // ── 合流（追加の親子リンク）操作 ──────────────────
  // モデル: 子ノードが mergeParentIds に「追加の親」を持つ。
  //   ・親 → 子（mergeChildren）も同じデータから算出できる（双方向参照）
  //   ・実子＋合流子をたどった到達集合で循環（双方が親になる等）を防ぐ
  const mergeParentIds = node.mergeParentIds || [];
  const mergeChildren  = Object.values(tree.nodes).filter((n) => (n.mergeParentIds || []).includes(nodeId));

  /** id から実子＋合流子をたどって到達できるノードID集合（循環判定用） */
  const reachableFrom = (startId) => {
    const seen  = new Set();
    const stack = [startId];
    while (stack.length) {
      const cur  = stack.pop();
      const real = tree.nodes[cur]?.childIds || [];
      const mrg  = Object.values(tree.nodes).filter((n) => (n.mergeParentIds || []).includes(cur)).map((n) => n.id);
      [...real, ...mrg].forEach((cid) => { if (!seen.has(cid)) { seen.add(cid); stack.push(cid); } });
    }
    return seen;
  };

  // このノードに合流させる「親」候補：自分・実親・既存の合流親・下流（子孫）を除く
  // （親ノードの変更先候補も同じ条件のため共用する）
  const mergeParentCandidates = (() => {
    const downstream = reachableFrom(nodeId);
    return Object.values(tree.nodes).filter((n) =>
      n.id !== nodeId &&
      n.id !== node.parentId &&
      !mergeParentIds.includes(n.id) &&
      !downstream.has(n.id)
    );
  })();

  // このノードを親とする「子」候補：自分・実子・既存の合流子・このノードを下流に持つノード(=祖先)を除く
  const mergeChildCandidates = Object.values(tree.nodes).filter((n) =>
    n.id !== nodeId &&
    n.parentId !== nodeId &&
    !(n.mergeParentIds || []).includes(nodeId) &&
    !reachableFrom(n.id).has(nodeId)
  );

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

  // 「ついか」内の未入力項目が残っているか（切り口・勝率・戦法タグ）
  const addIncomplete = (!node.isRoot && !approach) || winRate == null || parseTags(tags).length === 0;

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
          <i className="ti ti-check" style={{ fontSize: 13 }} />{toast}
        </div>
      )}

      {/* ── トップバー ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 14px 10px", borderBottom: `0.5px solid ${T.inkLine}` }}>
        <BackBtn onClick={() => saveAndNavigate(onBack)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: T.fontSize.xl, fontWeight: 600, color: T.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {node.label}
          </div>
          {breadcrumb && (
            <div style={{ fontSize: T.fontSize.sm, color: T.inkMid, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {tree.name} › {breadcrumb}
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
                    <i className="ti ti-corner-left-up" style={{ fontSize: 14, color: T.gray }} />
                    <span style={{ fontSize: T.fontSize.base, color: T.ink, flex: 1 }}>{parent.label}</span>
                    <i className="ti ti-chevron-right" style={{ fontSize: 14, color: T.gray }} />
                  </div>
                )}
                {parent && node.branchFromMoveIndex != null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px" }}>
                    <i className="ti ti-git-branch" style={{ fontSize: 13, color: T.gray }} />
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
                  <i className="ti ti-chevron-right" style={{ fontSize: 11, transition: "transform 0.15s", transform: parentDetailsOpen ? "rotate(90deg)" : "none" }} />
                  その他の操作（合流・親の変更）
                </div>

                {parentDetailsOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "2px 0 0 4px" }}>
                    {onSetMergeParents && (
                      <div>
                        <SectionLabel style={{ marginBottom: 5 }}>合流元</SectionLabel>
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
                      <div>
                        <SectionLabel style={{ marginBottom: 5 }}>親を変更</SectionLabel>
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
        <SectionHeader icon="ti-pencil">きほん</SectionHeader>

        {/* ノード名 + ステータス */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", padding: "0 16px 10px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <SectionLabel style={{ marginBottom: 5 }}>ノード名</SectionLabel>
            <input
              value={label}
              onChange={(e) => { setLabel(e.target.value); scheduleSave({ label: e.target.value }); }}
              onBlur={(e) => {
                e.target.style.borderColor = T.inkLine;
                const next = label.trim() || node.label;
                if (next !== label) setLabel(next);
                scheduleSave({ label: next });
                flushSave();
              }}
              placeholder="例：▲４六銀型"
              style={INPUT_STYLE}
              onFocus={(e) => (e.target.style.borderColor = T.gold)}
            />
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            {["done", "wip"].map((s) => (
              <StatusChip
                key={s}
                status={s}
                active={status === s}
                onClick={async () => { setStatus(s); await onUpdate(nodeId, { status: s }); }}
              />
            ))}
          </div>
        </div>

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
          parentBoard={parent?.board}
          parentLabel={parent?.label}
          onToggle={handleToggleBoard}
          handSente={handSente}
          handGote={handGote}
         onChange={(board, s, hs, hg) => { setBoardData(board); setStamps(s); onUpdate(nodeId, { board, stamps: s, handSente: hs, handGote: hg }); }}
          onDelete={() => { setBoardData(null); setStamps([]); setBoardVisible(false); onUpdate(nodeId, { board: null, stamps: [] }); }}
          onLoadTemplate={(t) => {
            const b = t.board.map(r => [...r]);
            setBoardData(b);
            setHandSente({ ...t.handSente });
            setHandGote({ ...t.handGote });
            setStamps([]);
            setBoardVisible(true);
            onUpdate(nodeId, { board: b, stamps: [], handSente: t.handSente, handGote: t.handGote });
            recordAction("template");
            showToast("テンプレートを読み込みました");
          }}
          kifu={node.kifu || []}
          onKifuChange={async (newKifu) => { await onUpdate(nodeId, { kifu: newKifu }); if (newKifu.length > 0) recordAction("kifu"); showToast("棋譜を保存しました"); }}
          onKifuDelete={async () => {
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
        <SectionHeader icon="ti-adjustments">
          {addIncomplete && <span style={{ color: T.gold, marginRight: 4 }}>・</span>}ついか
        </SectionHeader>

        {/* 切り口（自分の戦法 / 相手の戦法 / 局面の状況）*/}
        {!node.isRoot && (
          <div style={{ padding: "0 16px 10px" }}>
            <SectionLabel style={{ marginBottom: 5 }}>切り口</SectionLabel>
            <div style={{ display: "flex", gap: 6 }}>
              {["自分の戦法", "相手の戦法", "局面の状況"].map((a) => {
                const selected = approach === a;
                const meta = APPROACH_META[a] || {};
                return (
                  <div
                    key={a}
                    onClick={async () => {
                      setApproach(a);
                      await onUpdate(nodeId, { approachType: a });
                      recordAction("approach");
                    }}
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
                    {a}
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
            {[1, 2, 3].map((lvl) => (
              <div key={lvl} style={{ display: "flex", alignItems: "center", flex: lvl < 3 ? 1 : "0 0 auto" }}>
                <input
                  type="radio"
                  name="usageLevel"
                  checked={usageLevel === lvl}
                  onChange={async () => {
                    setUsageLevel(lvl);
                    await onUpdate(nodeId, { usageLevel: lvl });
                  }}
                  style={{ width: 15, height: 15, margin: 0, accentColor: T.gold, cursor: "pointer", flexShrink: 0 }}
                />
                {lvl < 3 && <div style={{ flex: 1, height: 1, background: T.inkLine, margin: "0 3px" }} />}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: T.fontSize.xs, color: T.inkMid, fontFamily: T.fontSerif }}>たまに</span>
            <span style={{ fontSize: T.fontSize.xs, color: T.inkMid, fontFamily: T.fontSerif }}>よくでる</span>
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
                  checked={winRate === lvl}
                  onChange={async () => {
                    setWinRate(lvl);
                    await onUpdate(nodeId, { winRate: lvl });
                  }}
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

        {/* 戦法タグ */}
        <div style={{ padding: "0 16px 16px" }}>
          <SectionLabel style={{ marginBottom: 5 }}>戦法タグ（カンマ区切り）</SectionLabel>
          <div style={{ position: "relative" }}>
            <input
              value={tags}
              onChange={(e) => { setTags(e.target.value); scheduleSave({ tags: parseTags(e.target.value) }); }}
              onBlur={(e) => { e.target.style.borderColor = T.inkLine; flushSave(); }}
              placeholder="例：振り飛車, 中飛車"
              style={{ ...INPUT_STYLE, paddingRight: 40 }}
              onFocus={(e) => (e.target.style.borderColor = T.gold)}
            />
            <button
              onClick={() => setSuggOpen((v) => !v)}
              title="候補から選ぶ"
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                background: suggOpen ? T.goldLight : "none",
                border: `0.5px solid ${suggOpen ? T.gold : "transparent"}`,
                borderRadius: 6, cursor: "pointer",
                color: suggOpen ? T.gold : T.inkFaint,
                fontSize: 17, lineHeight: 1, padding: "3px 5px",
              }}
            >
              <i className="ti ti-list" />
            </button>
          </div>

          {/* タグプレビュー */}
          {parseTags(tags).length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {parseTags(tags).map((tag) => (
                <span key={tag} style={{ fontSize: T.fontSize.sm, padding: "3px 9px", borderRadius: T.radius.sm, background: T.goldLight, color: T.gold, fontFamily: T.fontSerif }}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* 候補リスト */}
          {suggOpen && (() => {
            const cats = approach
              ? { [approach]: SUGGESTIONS[approach] || [] }
              : SUGGESTIONS;

            const current = parseTags(tags);

            const chipStyle = (s) => ({
              padding: "6px 12px", borderRadius: 20, cursor: "pointer",
              border: `0.5px solid ${current.includes(s) ? T.gold : T.inkLine}`,
              fontSize: T.fontSize.base, color: T.ink,
              background: current.includes(s) ? T.goldLight : T.cream,
              fontFamily: T.fontSerif, transition: "all 0.12s",
            });
            const onSelectSugg = async (s) => {
              if (current.includes(s)) return;
              const next = [...current, s];
              setTags(next.join("、"));
              await onUpdate(nodeId, { tags: next });
            };

            return (
              <div style={{ marginTop: 8 }}>
                {/* プリセット候補 */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {Object.entries(cats).map(([cat, items]) =>
                    items.map((s) => (
                      <div key={`${cat}-${s}`} onClick={() => onSelectSugg(s)} style={chipStyle(s)}
                        onMouseEnter={(e) => { e.currentTarget.style.background = T.goldLight; e.currentTarget.style.borderColor = T.gold; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = current.includes(s) ? T.goldLight : T.cream; e.currentTarget.style.borderColor = current.includes(s) ? T.gold : T.inkLine; }}
                      >{s}</div>
                    ))
                  )}
                </div>

                {/* カスタムタグ + 追加エリア */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: customTags.length > 0 ? 8 : 6, alignItems: "center" }}>
                  {customTags.map((s) => (
                    <div key={`custom-${s}`} onClick={() => onSelectSugg(s)} style={chipStyle(s)}
                      onMouseEnter={(e) => { e.currentTarget.style.background = T.goldLight; e.currentTarget.style.borderColor = T.gold; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = current.includes(s) ? T.goldLight : T.cream; e.currentTarget.style.borderColor = current.includes(s) ? T.gold : T.inkLine; }}
                    >{s}</div>
                  ))}

                  {/* ＋ボタン or 入力欄 */}
                  {!addingTag ? (
                    <div
                      onClick={() => { setAddingTag(true); setNewTagInput(""); }}
                      style={{ padding: "6px 10px", borderRadius: 20, cursor: "pointer", border: `0.5px dashed ${T.gold}`, fontSize: T.fontSize.base, color: T.gold, background: "transparent", display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <i className="ti ti-plus" style={{ fontSize: 13 }} />追加
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input
                        autoFocus
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newTagInput.trim()) {
                            addCustomTag(newTagInput.trim());
                            setCustomTags(getCustomTags());
                            recordAction("customTag");
                            setAddingTag(false); setNewTagInput("");
                            showToast("タグを追加しました");
                          }
                          if (e.key === "Escape") { setAddingTag(false); setNewTagInput(""); }
                        }}
                        placeholder="新しい戦法タグ"
                        style={{ padding: "5px 10px", borderRadius: 20, border: `1px solid ${T.gold}`, fontSize: T.fontSize.base, color: T.ink, background: T.cream, fontFamily: T.fontSerif, outline: "none", width: 120 }}
                      />
                      <button
                        onClick={() => {
                          if (newTagInput.trim()) {
                            addCustomTag(newTagInput.trim());
                            setCustomTags(getCustomTags());
                            recordAction("customTag");
                            showToast("タグを追加しました");
                          }
                          setAddingTag(false); setNewTagInput("");
                        }}
                        style={{ background: T.gold, border: "none", borderRadius: 20, padding: "5px 12px", color: T.cream, fontSize: T.fontSize.base, cursor: "pointer", fontFamily: T.fontSerif }}
                      >確定</button>
                      <button
                        onClick={() => { setAddingTag(false); setNewTagInput(""); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: 16 }}
                      ><i className="ti ti-x" /></button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>

        <SectionDivider />

        {/* ════════════════ 子ノード ════════════════ */}
        <SectionHeader icon="ti-git-branch">子ノード</SectionHeader>
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
                  <i className="ti ti-chevron-right" style={{ fontSize: 14, color: T.gray }} />
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
              <i className="ti ti-git-branch" style={{ fontSize: 14 }} />ここから分岐を追加
            </div>

            {/* 合流先（このノードが合流する子） */}
            {!node.isRoot && onSetMergeParents && (
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
                  <i className="ti ti-trash" style={{ fontSize: 13 }} />
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
