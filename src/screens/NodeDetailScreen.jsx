// ══════════════════════════════════════════════════════════════════
// NodeDetailScreen.jsx  ―  ノード詳細編集画面
//   親ノード / きほん / ついか / 子ノード
// ══════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  StatusChip, MergeTag, SummaryTag, Divider, BackBtn, MiniBoard,
} from "../components";
import { orderedChildIds } from "../treeOps";
import {
  STATUS_META, ORIENTATION_META, STRATEGY_GROUPS, WIN_RATE_LEVELS, LIKE_LEVELS, COMMENT_GROUPS, USAGE_LEVELS, USAGE_META,
} from "../data";
import { recordAction, getCustomTagsByGroup, addCustomTag, getCommentCustomTags, addCommentCustomTag, isTsuikaVisible } from "../rewards";
import { T, INPUT_STYLE, MODAL_OVERLAY_STYLE, MODAL_SHEET_STYLE, cloneBoard, parseTags } from "../theme";
import { SectionLabel, BoardSection, MergeLinkList, LinkPicker, TagPickerField, KifuPreviewBoard, IconRating } from "../components/uiParts";
import { fetchMyKifus, fetchKifu, fetchKifusForAnalysis, kifuRowToKifu, fetchAllMyNodes, fetchNode, nodeRowToNode } from "../db";
import { nodeContentPatch } from "../nodeFields";
import { toAnalysisGame } from "../kifuAnalyze";
import { branchCandidates, candidateToNodeFields } from "../kifuBranching";
import { showToast } from "../toast";

// ── 分岐のコツ（子ノードの「ヒント」から開く）────────────
// 分岐で手が止まるのは「どこで分ければいいか」が見えないとき。
// 抽象的なコツを並べるより、棋譜を見返すときの**具体的な着眼点**を並べる。
// 補足（かっこ書き）は下の行に小さく置く。1行が長いと目が滑って読まれない。
const BRANCH_TIPS = [
  { point: "お互いの飛車の位置" },
  { point: "駒交換するかしないか", note: "交換後の打ち込み場所を検討" },
  { point: "仕掛けるか仕掛けを待つか" },
  { point: "相手の仕掛けに応じるか手抜くか" },
  { point: "評価値が大きく動いた手", note: "勝負の決め手になった悪手" },
  { point: "自分が迷った手" },
  { point: "囲いを組みなおしたとき" },
  { point: "他の候補手があるとき" },
  { point: "相手の囲いが決まったとき", note: "囲いの弱点も決まり、攻めやすい場所も決まる" },
  { point: "よくある局面の部分定跡", note: "棋譜で保存して見返せるように" },
];

// ──────────────────────────────────────────
// KifuPickerModal: 棋譜ライブラリから1件選んでノードに取り込む
//   一覧（メタデータのみ）→ タップで snapshots 込み取得 → プレビュー再生 → 取り込み
//   一覧は「同じタグの棋譜」「その他の棋譜」の2段に分けて表示する
//   （研究中の戦法の棋譜から選びやすくする）
// ──────────────────────────────────────────
function KifuPickerModal({ userId, nodeTags = [], hasExistingKifu, onClose, onImport }) {
  const [kifus,     setKifus]     = useState(null); // null = 読み込み中
  const [selected,  setSelected]  = useState(null); // snapshots込みの棋譜（プレビュー表示中）
  const [fetching,  setFetching]  = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMyKifus(userId).then(({ data }) => {
      if (!cancelled) setKifus((data || []).map(kifuRowToKifu));
    });
    return () => { cancelled = true; };
  }, [userId]);

  // タグの一致で「同じタグ」「その他」の2グループに分ける（空のグループは出さない）。
  // その他の中はタグなしを先に、ほかのタグが付いた棋譜を後ろに並べる
  const kifuGroups = useMemo(() => {
    const want = new Set(nodeTags);
    const matched = [], untagged = [], others = [];
    for (const k of kifus || []) {
      const tags = k.tags || [];
      if (tags.length === 0)                    untagged.push(k);
      else if (tags.some((t) => want.has(t)))   matched.push(k);
      else                                      others.push(k);
    }
    return [
      { key: "matched", label: "同じタグの棋譜", items: matched },
      { key: "others",  label: "その他の棋譜",   items: [...untagged, ...others] },
    ].filter((g) => g.items.length > 0);
  }, [kifus, nodeTags]);

  const handlePick = async (kifu) => {
    if (fetching) return;
    setFetching(true);
    const { data, error } = await fetchKifu(kifu.id);
    setFetching(false);
    if (error || !data) {
      showToast("棋譜の読み込みに失敗しました。通信環境を確認してください。",
        { action: { label: "もう一度読む", onClick: () => handlePick(kifu) } });
      return;
    }
    setSelected(kifuRowToKifu(data));
  };

  const handleImport = async () => {
    if (!selected || importing) return;
    setImporting(true);
    await onImport(selected);
    setImporting(false);
    onClose();
  };

  const snaps = selected?.snapshots || [];
  const last  = snaps.length > 0 ? snaps[snaps.length - 1] : null;

  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={onClose}>
      <div style={{ ...MODAL_SHEET_STYLE, maxHeight: "90%", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          {selected && (
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1.125rem", padding: 2, lineHeight: 1 }}>
              <i className="ti ti-chevron-left" />
            </button>
          )}
          <div style={{ flex: 1, fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink }}>
            {selected ? selected.name : "保存済み棋譜から選ぶ"}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: "1.125rem", padding: 2 }}>
            <i className="ti ti-x" />
          </button>
        </div>

        {!selected ? (
          // ── 一覧 ──
          kifus === null ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: T.inkFaint, fontSize: T.fontSize.base }}>
              読み込み中...
            </div>
          ) : kifus.length === 0 ? (
            <div style={{ padding: "24px 0", textAlign: "center", color: T.inkFaint, fontSize: T.fontSize.base, lineHeight: 1.8 }}>
              保存した棋譜がまだありません<br />
              ツリー一覧の「棋譜ライブラリ」から棋譜を保存できます
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {kifuGroups.map((g) => (
                <div key={g.key}>
                  {/* グループが1つだけのときは見出しを出さない（並べ替える意味がないため） */}
                  {kifuGroups.length > 1 && (
                    <SectionLabel style={{ marginBottom: 6 }}>{g.label}</SectionLabel>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {g.items.map((k) => (
                      <div
                        key={k.id}
                        onClick={() => handlePick(k)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: T.radius.sm, border: `0.5px solid ${g.key === "matched" ? T.gold : T.inkLine}`, background: T.cream, cursor: "pointer" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = T.goldLight)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = T.cream)}
                      >
                        <i className="ti ti-chess" style={{ fontSize: "0.875rem", color: T.gold }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: T.fontSize.base, color: T.ink }}>{k.name}</div>
                          {(k.tags || []).length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                              {k.tags.map((tag) => (
                                <span key={tag} style={{ fontSize: T.fontSize.sm, padding: "2px 7px", borderRadius: T.radius.sm, background: T.goldLight, color: T.gold, fontFamily: T.fontSerif }}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: T.fontSize.sm, color: T.inkMid, fontFamily: T.fontSerif }}>{k.moveCount}手</span>
                        <i className="ti ti-chevron-right" style={{ fontSize: "0.875rem", color: T.gray }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          // ── プレビュー + 取り込み ──
          <>
            <KifuPreviewBoard snapshots={snaps} />

            {hasExistingKifu && (
              <div style={{ marginTop: 10, fontSize: T.fontSize.sm, color: T.brown, fontFamily: T.fontSerif, lineHeight: 1.6 }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: "0.75rem", marginRight: 3 }} />
                このノードには棋譜があります。取り込むと今の棋譜・盤面は上書きされます
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={!last || importing}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                width: "100%", marginTop: 10, padding: "11px 12px", borderRadius: T.radius.lg,
                border: "none", background: (!last || importing) ? T.gray : T.gold, color: T.cream,
                fontSize: T.fontSize.lg, fontWeight: 600, cursor: (!last || importing) ? "default" : "pointer",
                fontFamily: T.fontSerif,
              }}
            >
              <i className="ti ti-download" style={{ fontSize: "0.875rem" }} />
              {importing ? "取り込み中..." : "このノードに取り込む"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// NodeRecallModal: 他のノードの中身を呼び出して、今のノードへ写す
//   一覧（全ツリー横断・軽い列だけ）→ タップで確認 → 写す。
//
//   写るのは**中身だけ**で、親子・合流・並び順は動かない（nodeFields.js の
//   structural 印）。位置まで写すと、別のツリーのノードIDが親として入り、
//   マップに線が引けなくなる。
//
//   一覧に検索欄を置いているのは、ノードが増えると名前だけでは見つからないため
//   （ノード名は「次の一手」になりがちで、あとから探しにくい。ノード検索画面と同じ問題）。
// ──────────────────────────────────────────
function NodeRecallModal({ userId, trees = [], currentNodeId, currentLabel, onClose, onRecall }) {
  const [nodes,   setNodes]   = useState(null); // null = 読み込み中
  const [query,   setQuery]   = useState("");
  const [picked,  setPicked]  = useState(null); // 確認中のノード（一覧の軽い行）
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAllMyNodes(userId).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        // 読み込みの失敗は画面に何も出ないので、やり直す手段を添える
        showToast("ノード一覧の取得に失敗しました。通信環境を確認してください。");
        setNodes([]);
        return;
      }
      // 自分自身は呼び出しても何も起きないので候補から外す。
      // 「とりあえず」（置き場）も外す ― 中身を持たせる場所ではないので、
      // 候補に並べても選ぶ理由が無く、ツリーの数だけ一覧に混ざるだけになる
      setNodes((data || []).filter((n) => n.id !== currentNodeId && !n.is_inbox));
    });
    return () => { cancelled = true; };
  }, [userId, currentNodeId]);

  const treeName = useMemo(() => {
    const m = new Map();
    (trees || []).forEach((t) => m.set(t.id, t.name));
    return m;
  }, [trees]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nodes || [];
    return (nodes || []).filter((n) => [
      n.label, n.memo,
      ...(n.situation || []), ...(n.my_approach || []),
      treeName.get(n.tree_id) || "",
    ].join(" ").toLowerCase().includes(q));
  }, [nodes, query, treeName]);

  const handleRecall = async () => {
    if (!picked || running) return;
    setRunning(true);
    const ok = await onRecall(picked);
    setRunning(false);
    if (ok) onClose();
  };

  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={onClose}>
      <div style={{ ...MODAL_SHEET_STYLE, maxHeight: "90%", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          {picked && (
            <button onClick={() => setPicked(null)} aria-label="一覧へ戻る"
              style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1.125rem", padding: 2, lineHeight: 1 }}>
              <i className="ti ti-chevron-left" />
            </button>
          )}
          <div style={{ flex: 1, fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink }}>
            {picked ? "この中身を呼び出しますか" : "どのノードを呼び出しますか"}
          </div>
          <button onClick={onClose} aria-label="閉じる"
            style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: "1.125rem", padding: 2 }}>
            <i className="ti ti-x" />
          </button>
        </div>

        {!picked ? (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ノード名・メモ・戦法名・ツリー名で検索"
              style={{ ...INPUT_STYLE, marginBottom: 10 }}
            />
            {nodes === null ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: T.inkFaint, fontSize: T.fontSize.base }}>
                読み込み中...
              </div>
            ) : results.length === 0 ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: T.inkFaint, fontSize: T.fontSize.base, lineHeight: 1.8 }}>
                {nodes.length === 0
                  ? "呼び出せるノードがまだありません"
                  : "条件に合うノードがありません"}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {results.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setPicked(n)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                      padding: "9px 12px", borderRadius: T.radius.sm,
                      border: `0.5px solid ${T.inkLine}`, background: T.cream, cursor: "pointer",
                      fontFamily: T.fontSerif,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: T.fontSize.sm, color: T.gold, marginBottom: 2 }}>
                        <i className="ti ti-plant" style={{ fontSize: "0.625rem", marginRight: 3 }} />
                        {treeName.get(n.tree_id) || "（不明なツリー）"}
                      </div>
                      <div style={{ fontSize: T.fontSize.base, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {n.label}
                      </div>
                      {n.memo && (
                        <div style={{ fontSize: T.fontSize.sm, color: T.inkMid, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {n.memo}
                        </div>
                      )}
                    </div>
                    {n.board && !n.board_hidden && <MiniBoard board={n.board} size={64} />}
                    <i className="ti ti-chevron-right" style={{ fontSize: "0.875rem", color: T.gray, flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ padding: "10px 12px", borderRadius: T.radius.sm, border: `0.5px solid ${T.inkLine}`, background: T.cream }}>
              <div style={{ fontSize: T.fontSize.sm, color: T.gold, marginBottom: 2, fontFamily: T.fontSerif }}>
                <i className="ti ti-plant" style={{ fontSize: "0.625rem", marginRight: 3 }} />
                {treeName.get(picked.tree_id) || "（不明なツリー）"}
              </div>
              <div style={{ fontSize: T.fontSize.lg, color: T.ink, fontFamily: T.fontSerif }}>{picked.label}</div>
            </div>

            {/* 取り消す道が無い操作なので、何が消えるのかを名指しで出す。
                「上書きされます」だけだと、どのノードのどこが消えるのか読み取れない */}
            <div style={{ marginTop: 10, fontSize: T.fontSize.sm, color: T.brown, fontFamily: T.fontSerif, lineHeight: 1.7 }}>
              <i className="ti ti-alert-triangle" style={{ fontSize: "0.75rem", marginRight: 3 }} />
              いま開いている「{currentLabel}」の中身（ノード名・盤面・棋譜・メモ・タグなど）は
              すべて消えて、呼び出したノードの中身に置き換わります。元に戻せません。
              <br />
              親子・合流・並び順は今のままです。
            </div>

            <button
              onClick={handleRecall}
              disabled={running}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                width: "100%", marginTop: 12, padding: "11px 12px", borderRadius: T.radius.lg,
                border: "none", background: running ? T.gray : T.gold, color: T.cream,
                fontSize: T.fontSize.lg, fontWeight: 600, cursor: running ? "default" : "pointer",
                fontFamily: T.fontSerif,
              }}
            >
              <i className="ti ti-file-import" style={{ fontSize: "0.875rem" }} />
              {running ? "呼び出し中..." : "このノードに呼び出す"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

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
export function NodeDetail({ tree, trees = [], nodeId, userId, collabGuest = false, onBack, onNodeSelect, onNewNode, onUpdate, onDeleteNode, onSetMergeParents, onReparentNode, onBranchFromKifu, onBranchRangeFromKifu, onBoardFirstShown }) {
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
  const [aim,         setAim]         = useState("");
  const [caution,     setCaution]     = useState("");
  const [nextStudy,   setNextStudy]   = useState("");
  const [whenToUse,   setWhenToUse]   = useState(""); // きほん：いつ使う（短文）
  const [openingFocus, setOpeningFocus] = useState(""); // ついか：序盤の意識
  const [summary,     setSummary]     = useState(""); // まとめ：戦型全体の考え方
  // まとめノードでは局面まわり（盤面・手番・棋譜）を畳んでおく。
  // 「ざっくり」を項目を消して表すと、まとめを解除したときに入力済みの値が
  // 画面から消えたように見える。消さずに畳むだけにして、開けば元通りにする
  const [positionOpen, setPositionOpen] = useState(true);
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
  const [recallOpen,             setRecallOpen]             = useState(false);
  const [branchTipOpen,          setBranchTipOpen]          = useState(false);

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

  /** ノードの値を入力欄（ローカルstate）へ流し込む。
   *  画面を開いたときのリセットと、他のノードの中身を呼び出したときの
   *  差し替えで同じ処理を使う。片方だけ足すと、呼び出した項目のうち
   *  1つだけ画面に出ない（保存はされている）という気づけない壊れ方をする。
   *  ※ ここでは pendingPatch を触らない。呼び出し側が保存の前後を決める */
  const applyNodeToForm = useCallback((n) => {
    if (!n) return;
    setLabel(n.label || "");
    setSituation((n.situation || []).join("、"));
    setMyApproach((n.myApproach || []).join("、"));
    setOrientation(n.orientation || "");
    setMemo(n.memo || "");
    setStatus(n.status || "wip");
    setUsageLevel(n.usageLevel || 2);
    setWinRate(n.winRate ?? null);
    setLikeLevel(n.likeLevel ?? null);
    setCommentTags((n.commentTags || []).join("、"));
    setAim(n.aim || "");
    setCaution(n.caution || "");
    setNextStudy(n.nextStudy || "");
    setWhenToUse(n.whenToUse || "");
    setOpeningFocus(n.openingFocus || "");
    setSummary(n.summary || "");
    setPositionOpen(!n.isSummary);
    setBoardVisible(!!n.board && !n.boardHidden);
    setBoardData(n.board || null);
    setStamps(n.stamps || []);
    setTurn(n.turn || null);
    setEvalSign((n.evaluation ?? 0) < 0 ? "-" : "+");
    setEvalValue(n.evaluation != null ? String(Math.abs(n.evaluation)) : "");
    setHandSente(n.handSente || {p:0,l:0,n:0,s:0,g:0,b:0,r:0});
    setHandGote(n.handGote  || {p:0,l:0,n:0,s:0,g:0,b:0,r:0});
  }, []);

  // nodeId が変わったらフォームをリセット
  useEffect(() => {
    if (node) {
      applyNodeToForm(node);
      // 合流はノードの中身ではなくツリーのつながりなので、呼び出しでは動かない。
      // 画面を開いたときだけ、合流があれば親ノードの詳細を開いておく
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
    // node / onUpdate を依存から外すのは意図的。入れると保存のたびに node 参照が変わり、
    // 全 state がリセットされてスクロール位置がトップに戻る。
    // 機械には「書き忘れ」と区別がつかないので、意図であることを明示して警告を出さない
    // （残った警告は本物として扱えるようにしておく）。
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

  // ── ここから下の早期 return より「前」に置くフック群 ──────────
  //   フックは毎レンダリングで同じ順番・同じ個数だけ呼ばれる必要がある。
  //   `if (!node) return null` より後ろに useMemo を置くと、ノードを削除した直後など
  //   node が消えた瞬間にフックの個数が減り、React が
  //   "Rendered fewer hooks than expected" を投げて画面ごと落ちる。
  //   そのため node が無くても計算できる形（node?.）にして前倒ししてある。
  // 並び順は treeOps に一本化する。マップと一覧で順番が食い違うと、
  // どちらが本当の並びなのか分からなくなる（棋譜の分岐はどちらも手数順になる）
  const children = orderedChildIds(tree.nodes, nodeId).map((id) => tree.nodes[id]);

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
  const tsuikaAny = Object.values(tsuikaShow).some(Boolean);
  // 「ついか」の外にあるカスタム対象（一言コメント＝メモの下 / 評価値＝盤面の下 /
  // 合流＝親・子ノードの「その他の操作」内）。
  // 合流OFFで消えるのは編集UIのみ。既存の合流データ（バッジ・マップの合流線）は残る
  const showCommentTags = isTsuikaVisible("commentTags");
  const showEvaluation  = isTsuikaVisible("evaluation");
  const showMerge       = isTsuikaVisible("merge");
  // ミニ盤面（スクロールで盤が流れたら上端に貼り付く盤）。
  // OFFにすると貼り付け自体が起きない（盤そのものの表示には関係しない）
  const showBoardPeek   = isTsuikaVisible("boardPeek");

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

  // ── 手番・評価値 ─────────────────────────────────
  // 手番チップ：タップで選択、選択中をもう一度タップで未設定に戻す
  const handleTurnSelect = (t) => {
    const next = turn === t ? null : t;
    saveField({ turn: next }, () => setTurn(next), () => setTurn(node.turn || null));
  };

  // 評価値の入力を「数字と小数点のみ・小数点1個・整数部4桁・小数第1位まで」に整形する
  // （評価値の形式はソフトによって異なるため、±9999.9 の範囲で自由に記録できるようにする）
  const sanitizeEvalInput = (raw) => {
    const v = raw.replace(/[^0-9.]/g, "");
    const dot = v.indexOf(".");
    if (dot === -1) return v.slice(0, 4);
    return v.slice(0, dot).slice(0, 4) + "." + v.slice(dot + 1).replace(/\./g, "").slice(0, 1);
  };

  // 評価値：符号（選択式）と数値を合成して保留パッチに載せる。数値が空なら未入力（null）。
  // blur を待たず scheduleSave に載せることで、タブ切替・離脱時の flush 安全網
  // （beforeunload/pagehide/visibilitychange）の対象になる
  const scheduleEvaluationSave = (sign, valueStr) => {
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

  // ── 他のノードの中身を呼び出す（上書き）──────────────
  // 中身だけを写し、ツリー上の位置（親子・合流・並び順）は動かさない。
  // 写す項目は nodeFields.js の台帳から作る（nodeContentPatch）ので、
  // 項目を足したときにここへ書き足す必要はない。
  //
  // 一覧は軽い列しか読んでいないので、写す直前に全列で取り直す。
  // 一覧に kifu や aim まで載せると、ノードが増えるほど一覧が重くなる。
  const handleRecallNode = async (pickedRow) => {
    const { data, error } = await fetchNode(pickedRow.id);
    if (error || !data) {
      showToast("呼び出しに失敗しました");
      return false;
    }
    const patch = nodeContentPatch(nodeRowToNode(data));
    // 入力中の内容が呼び出しの後に飛んでくると、写した中身を古い値で塗り替えてしまう
    dropPendingBoardKeys();
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    pendingPatch.current = {};

    const ok = await onUpdate(nodeId, patch);
    if (ok === false) return false;
    applyNodeToForm(patch);
    // 盤面の「元に戻す」の戻り先も呼び出し後に合わせる。
    // 合わせないと、盤面だけ呼び出し前に戻って他の項目は呼び出したまま、という
    // どちらでもないノードが作れてしまう
    setBoardSnapshot({
      boardVisible: !!patch.board && !patch.boardHidden,
      boardHidden:  !!patch.boardHidden,
      boardData:    patch.board ? cloneBoard(patch.board) : null,
      stamps:       patch.stamps || [],
      handSente:    patch.handSente,
      handGote:     patch.handGote,
      kifu:         patch.kifu || [],
    });
    showToast("呼び出しました");
    return true;
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
        {/* 他のノードの中身を呼び出す。「まとめる」と同じくノードそのものを
            作り変える操作なので、下の入力欄には混ぜず名前の隣に置く。
            ルートと「とりあえず」に出さないのは、どちらも名前と役割が決まっている
            置き場で、中身を差し替えるとツリー名や置き場が消えてしまうため */}
        {!node.isRoot && !node.isInbox && (
          <button
            onClick={() => setRecallOpen(true)}
            // アイコンフォントが ::before で文字を差し込むので aria-label で名前を固定する
            aria-label="呼び出し"
            style={{
              flexShrink: 0,
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 10px", borderRadius: T.radius.xl, cursor: "pointer",
              fontFamily: T.fontSerif, fontSize: T.fontSize.sm,
              border: `0.5px dashed ${T.inkLine}`, background: "transparent", color: T.inkMid,
            }}
          >
            <i className="ti ti-file-import" style={{ fontSize: "0.8125rem" }} />
            呼び出し
          </button>
        )}
        {/* まとめノードのトグル。ノード名と同じ高さの右端に置く。
            ノードの性格を決める切り替えなので、下の入力欄に混ぜず名前の隣に出す。
            ルートは畳めない（ツリー全体が消えるため）のでトグルを出さず、
            まとめ欄だけ常に出している。置き場は既に別扱い */}
        {!node.isRoot && !node.isInbox && (
          <button
            onClick={() => {
              const next = !node.isSummary;
              setPositionOpen(!next);
              saveField({ isSummary: next }, () => {}, () => {});
            }}
            // アイコンフォントが ::before で文字を差し込むため、文字を添えていても
            // 名前の計算がそちらへ引っ張られる。aria-label で確実に名前を付ける
            aria-label="まとめる"
            aria-pressed={!!node.isSummary}
            style={{
              flexShrink: 0,
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 10px", borderRadius: T.radius.xl, cursor: "pointer",
              fontFamily: T.fontSerif, fontSize: T.fontSize.sm,
              border: node.isSummary ? `1px solid ${T.gold}` : `0.5px dashed ${T.inkLine}`,
              background: node.isSummary ? T.goldLight : "transparent",
              color: node.isSummary ? T.gold : T.inkMid,
            }}
          >
            {/* 塗りつぶし版（ti-bookmark-filled）は別のフォントで、このアプリは読んでいない。
                指定すると字が出ずに隙間だけが空くので、印は枠と地色で付ける */}
            <i className="ti ti-bookmark" style={{ fontSize: "0.8125rem" }} />
            まとめる
          </button>
        )}
      </div>

      {/* みんなで編集のツリーを直していることを、編集画面でも出しておく。
          マップの帯はノードを開くと隠れるので、書いている場所にも要る */}
      {collabGuest && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
          padding: "6px 14px", background: T.greenBg, color: T.green,
          borderBottom: `0.5px solid ${T.inkLineFaint}`,
          fontSize: T.fontSize.sm, fontFamily: T.fontSerif, lineHeight: 1.6,
        }}>
          <i className="ti ti-users" style={{ fontSize: "0.75rem", flexShrink: 0 }} />
          みんなで編集できるツリーです。直した内容はそのまま全員に見えます
        </div>
      )}

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
                      {(() => {
                        const start = node.branchFromMoveIndex;
                        const startLabel = start === 0 ? "初期局面" : `第${start}手`;
                        // 範囲切り出しノード（棋譜を持つ）は盤面が終点の局面なので、
                        // 「第n手から分岐」ではなく切り出した範囲を表示する
                        if ((node.kifu || []).length > 1) {
                          const end = start + node.kifu.length - 1;
                          return `「${parent.label}」の${startLabel}〜第${end}手を切り出し`;
                        }
                        return `「${parent.label}」の${startLabel}から分岐`;
                      })()}
                    </span>
                  </div>
                )}

                {/* その他の操作（合流・親の変更）── デフォルト非表示 */}
                <div
                  onClick={() => setParentDetailsOpen((v) => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 4px", marginTop: 2, cursor: "pointer", color: T.inkFaint, fontSize: T.fontSize.sm, fontFamily: T.fontSerif }}
                >
                  <i className="ti ti-chevron-right" style={{ fontSize: "0.6875rem", transition: "transform 0.15s", transform: parentDetailsOpen ? "rotate(90deg)" : "none" }} />
                  その他の操作（{showMerge ? "合流・親の変更" : "親の変更"}）
                </div>

                {parentDetailsOpen && (
                  <div style={{ display: "flex", flexDirection: "row", gap: 8, padding: "2px 0 0 4px" }}>
                    {showMerge && onSetMergeParents && (
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

        {/* まとめ（戦型全体の考え方）。まとめノードとルートにだけ出す。
            棋書の章末まとめにあたるもので、局面ではなく戦型に対する方針を書く。
            局面に紐づく「ここでの狙い / 気を付けること」（研究メモ）とは役割が違うので
            列を分けてある（まとめだけを続けて読めるようにするため）。
            局面より先に出すのは、まとめノードでは局面が主役ではないから */}
        {(node.isSummary || node.isRoot) && (
          <div style={{ padding: "0 16px 12px" }}>
            <SectionLabel style={{ marginBottom: 5 }}>
              <i className="ti ti-bookmark" style={{ fontSize: "0.75rem", color: T.gold, marginRight: 4 }} />
              まとめ
            </SectionLabel>
            <textarea
              value={summary}
              onChange={(e) => { setSummary(e.target.value); scheduleSave({ summary: e.target.value }); }}
              onBlur={(e)  => { e.target.style.borderColor = T.inkLine; flushSave(); }}
              onFocus={(e) => (e.target.style.borderColor = T.gold)}
              placeholder="戦型全体の考え方の方針"
              rows={6}
              style={{ width: "100%", border: `0.5px solid ${T.inkLine}`, borderRadius: T.radius.sm, padding: "10px 12px", fontSize: T.fontSize.base, color: T.ink, background: T.cream, resize: "none", fontFamily: T.fontSerif, lineHeight: 1.7, outline: "none", boxSizing: "border-box" }}
            />
          </div>
        )}

        {/* まとめノードでは局面まわりを畳んでおく（開けば今までどおり全部ある）。
            項目を消すのではなく畳むだけにしてあるので、まとめを解除すれば元に戻る */}
        {node.isSummary && (
          <div
            onClick={() => setPositionOpen((v) => !v)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px 8px", cursor: "pointer" }}
          >
            <SectionLabel style={{ marginBottom: 0 }}>局面（盤面・手番・棋譜）</SectionLabel>
            <i className={`ti ti-chevron-${positionOpen ? "up" : "down"}`} style={{ fontSize: "0.8125rem", color: T.inkMid }} />
          </div>
        )}

        {(!node.isSummary || positionOpen) && <>

        {/* 盤面 ―「きほん」の先頭に置く。
            このノードが何の話なのかは局面を見れば分かるので、文字入力欄より先に出す。
            下にあると、ノードを開くたびに盤を探して画面を送ることになっていた。
            手番・評価値・棋譜の取り込みは局面に紐づくので、区切り線までを一続きの塊として扱う */}
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
          stickyPeek={showBoardPeek}
          // 棋譜ライブラリからの取り込み。「棋譜を記録」と同じ行に置く
          // （どちらも「この盤に棋譜を入れる」操作なので隣り合わせにする）。
          // 盤の中の行に混ぜるため、大きさは盤の道具ボタンに合わせる
          kifuImportSlot={userId ? (
            <button
              data-onboard="kifu-import"
              onClick={() => setKifuPickerOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 9px", borderRadius: 8, cursor: "pointer",
                border: `0.5px dashed ${T.brown}`, background: "none",
                color: T.brown, fontSize: T.fontSize.md, fontFamily: T.fontSerif,
              }}
            >
              <i className="ti ti-books" style={{ fontSize: "0.8125rem" }} />保存済み棋譜から取り込む
            </button>
          ) : null}
        />

        {/* 手番・評価値（盤面表示中のみ。局面に紐づく情報のため盤面の直下に置く） */}
        {boardVisible && (
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", padding: "0 16px 12px" }}>
            {/* 手番 */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <SectionLabel>手番</SectionLabel>
              {[["sente", "先手番", T.blue, T.blueBg], ["gote", "後手番", T.redDark, T.redBg]].map(([val, lbl, color, bg]) => {
                const selected = turn === val;
                return (
                  <div
                    key={val}
                    onClick={() => handleTurnSelect(val)}
                    style={{
                      padding: "5px 12px", borderRadius: T.radius.md, cursor: "pointer",
                      fontSize: T.fontSize.base, fontFamily: T.fontSerif, transition: "all 0.15s",
                      border: selected ? `1.5px solid ${color}` : `0.5px solid ${T.inkLine}`,
                      background: selected ? bg : T.cream,
                      color: selected ? color : T.inkMid,
                      fontWeight: selected ? 600 : 400,
                    }}
                  >
                    {lbl}
                  </div>
                );
              })}
            </div>

            {/* 評価値（符号は選択式・数値は入力）。設定でOFFにできる（手番は残る） */}
            {showEvaluation && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <SectionLabel>評価値</SectionLabel>
              {[["+", T.blue, T.blueBg], ["-", T.redDark, T.redBg]].map(([sign, color, bg]) => {
                const selected = evalSign === sign;
                return (
                  <div
                    key={sign}
                    onClick={() => { setEvalSign(sign); scheduleEvaluationSave(sign, evalValue); }}
                    title={sign === "+" ? "先手良し" : "後手良し"}
                    style={{
                      width: 28, height: 28, borderRadius: T.radius.md, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: T.fontSize.lg, fontFamily: T.fontSerif, transition: "all 0.15s",
                      border: selected ? `1.5px solid ${color}` : `0.5px solid ${T.inkLine}`,
                      background: selected ? bg : T.cream,
                      color: selected ? color : T.inkMid,
                      fontWeight: 600,
                    }}
                  >
                    {sign === "+" ? "＋" : "－"}
                  </div>
                );
              })}
              <input
                value={evalValue}
                inputMode="decimal"
                onChange={(e) => {
                  const v = sanitizeEvalInput(e.target.value);
                  setEvalValue(v);
                  scheduleEvaluationSave(evalSign, v);
                }}
                onBlur={(e) => { e.target.style.borderColor = T.inkLine; flushSave(); }}
                onFocus={(e) => (e.target.style.borderColor = T.gold)}
                placeholder="300"
                style={{
                  width: 64, boxSizing: "border-box", border: `0.5px solid ${T.inkLine}`,
                  borderRadius: T.radius.md, padding: "5px 10px", fontSize: T.fontSize.base,
                  color: T.ink, background: T.cream, fontFamily: T.fontSerif, outline: "none",
                }}
              />
            </div>
            )}
          </div>
        )}

        </>}

        <Divider />

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
            style={{ width: "100%", border: `0.5px solid ${T.inkLine}`, borderRadius: T.radius.sm, padding: "10px 12px", fontSize: T.fontSize.base, color: T.ink, background: T.cream, resize: "none", fontFamily: T.fontSerif, lineHeight: 1.7, outline: "none" }}
            onFocus={(e) => (e.target.style.borderColor = T.gold)}
            onBlur={(e)  => { e.target.style.borderColor = T.inkLine; flushSave(); }}
          />
        </div>

        {/* いつ使う（短文）。この戦法・局面をどんなときに使うかを一言で。
            親から子ノード一覧を見たときに、入力があれば各子の下に表示される */}
        <div style={{ padding: "0 16px 10px" }}>
          <SectionLabel style={{ marginBottom: 5 }}>いつ使う</SectionLabel>
          <input
            value={whenToUse}
            onChange={(e) => { setWhenToUse(e.target.value); scheduleSave({ whenToUse: e.target.value }); }}
            onBlur={(e)  => { e.target.style.borderColor = T.inkLine; flushSave(); }}
            onFocus={(e) => (e.target.style.borderColor = T.gold)}
            placeholder="例：相手が急戦できたとき／早く固めたいとき"
            style={INPUT_STYLE}
          />
        </div>

        {/* 一言コメント（感触・課題タグ）
            言葉にするのが難しいときの受け皿なので、「ついか」の奥ではなく
            対局直後に目に入るメモの直下に置く（閉じているときは選択済みタグのみ表示） */}
        {showCommentTags && (
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
        )}

        <SectionDivider />

        {/* ════════════════ ついか ════════════════
            項目は設定でON/OFFできる。全項目OFFのときはセクションごと非表示 */}
        {tsuikaAny && <>
        <div onClick={() => setAddOpen((v) => !v)} style={{ cursor: "pointer" }}>
          <SectionHeader icon="ti-adjustments" dataOnboard="tsuika">
            ついか
            <i className={`ti ti-chevron-${addOpen ? "up" : "down"}`} style={{ fontSize: "0.8125rem", color: T.inkMid, marginLeft: "auto" }} />
          </SectionHeader>
        </div>

        {addOpen && <>

        {/* 志向（攻め / 受け / バランス / 不明）*/}
        {tsuikaShow.orientation && (
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

        {/* 序盤の意識（この局面へ持っていくために序盤で意識すべきこと）*/}
        {tsuikaShow.openingFocus && (
          <div style={{ padding: "0 16px 10px" }}>
            <SectionLabel style={{ marginBottom: 5 }}>
              <i className="ti ti-flag" style={{ fontSize: "0.75rem", color: T.gold, marginRight: 4 }} />
              序盤の意識
            </SectionLabel>
            <textarea
              value={openingFocus}
              onChange={(e) => { setOpeningFocus(e.target.value); scheduleSave({ openingFocus: e.target.value }); }}
              onBlur={(e) => { e.target.style.borderColor = T.inkLine; flushSave(); }}
              onFocus={(e) => (e.target.style.borderColor = T.gold)}
              placeholder="例：銀は68で保留"
              rows={2}
              style={{ width: "100%", border: `0.5px solid ${T.inkLine}`, borderRadius: T.radius.sm, padding: "8px 12px", fontSize: T.fontSize.base, color: T.ink, background: T.cream, resize: "none", fontFamily: T.fontSerif, lineHeight: 1.7, outline: "none", boxSizing: "border-box" }}
            />
          </div>
        )}

        {/* 頻度（炎）／勝率（トロフィー）／好き度（ハート）
            同じ形のラジオが3段並ぶと軸の違いが分かりにくいため、
            軸ごとにアイコンの形と色を変えて視覚で区別する */}
        {tsuikaShow.usage && (
        <div style={{ padding: "0 16px 10px" }}>
          <SectionLabel style={{ marginBottom: 5 }}>
            <i className="ti ti-flame" style={{ fontSize: "0.75rem", color: T.gold, marginRight: 4 }} />
            頻度
          </SectionLabel>
          <IconRating
            icon="ti-flame" color={T.gold} bg={T.goldLight}
            levels={USAGE_LEVELS} value={usageLevel}
            onChange={(lvl) => saveField({ usageLevel: lvl },
              () => setUsageLevel(lvl),
              () => setUsageLevel(node.usageLevel || 2))}
            valueLabel={USAGE_META[usageLevel]?.label ?? "未設定"}
          />
        </div>
        )}

        {tsuikaShow.winRate && (
        <div style={{ padding: "0 16px 10px" }}>
          <SectionLabel style={{ marginBottom: 5 }}>
            <i className="ti ti-trophy" style={{ fontSize: "0.75rem", color: T.green, marginRight: 4 }} />
            勝率
          </SectionLabel>
          <IconRating
            icon="ti-trophy" color={T.green} bg={T.greenBg}
            levels={WIN_RATE_LEVELS} value={winRate} clearable
            onChange={(lvl) => saveField({ winRate: lvl },
              () => setWinRate(lvl),
              () => setWinRate(node.winRate ?? null))}
            valueLabel={winRate != null ? `${winRate}割くらい勝てる` : "未設定"}
          />
        </div>
        )}

        {tsuikaShow.likeLevel && (
        <div style={{ padding: "0 16px 10px" }}>
          <SectionLabel style={{ marginBottom: 5 }}>
            <i className="ti ti-heart" style={{ fontSize: "0.75rem", color: T.red, marginRight: 4 }} />
            好き度
          </SectionLabel>
          <IconRating
            icon="ti-heart" color={T.red} bg={T.redBg}
            levels={LIKE_LEVELS.map((l) => l.value)} value={likeLevel} clearable
            onChange={(lvl) => saveField({ likeLevel: lvl },
              () => setLikeLevel(lvl),
              () => setLikeLevel(node.likeLevel ?? null))}
            valueLabel={LIKE_LEVELS.find((l) => l.value === likeLevel)?.label ?? "未設定"}
          />
        </div>
        )}

        {/* ════ 研究メモ ════
            「ついか」自体がすでに畳んであるので、その中でもう一段畳むと
            開くのに2回押すことになり、書いた内容も一段奥に隠れてしまう。
            まとめの見出しは置かない（各欄に名前が付いていて中身が分かるため）。
            出す・出さないは設定（tsuikaShow.studyMemo）で決められる。
            一言コメントはメモ直下（きほん）へ移動済みで、ここは研究時に書く3欄のみ */}
        {tsuikaShow.studyMemo && <>
        {[
            { label: "ここでの狙い",   value: aim,       set: setAim,       key: "aim",       placeholder: "例：飛車を振りなおす" },
            { label: "気を付けること", value: caution,   set: setCaution,   key: "caution",   placeholder: "例：角を打ち込む隙を作らない" },
            { label: "次に調べること", value: nextStudy, set: setNextStudy, key: "nextStudy", placeholder: "次の研究・深掘りしたい手順" },
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
        </>}

        </>}

        <SectionDivider />
        </>}

        {/* ════════════════ 子ノード ════════════════ */}
        <SectionHeader icon="ti-git-branch" dataOnboard="children">子ノード</SectionHeader>
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {children.map((child) => {
              const m = STATUS_META[child.status] || STATUS_META.todo;
              const childWhenToUse = (child.whenToUse || "").trim();
              // 棋譜から切り出した分岐は、何手目から分かれたかを出す（並びも手数順）。
              // マップでは幹の目盛りが同じことを示している
              const mv = (node.kifu || []).length > 0 ? child.branchFromMoveIndex : null;
              return (
                <div
                  key={child.id}
                  onClick={() => saveAndNavigate(() => onNodeSelect(child.id))}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: T.radius.sm, border: `0.5px solid ${T.inkLine}`, background: T.cream, cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = T.goldLight)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = T.cream)}
                >
                  <div style={{ width: 2, height: childWhenToUse ? 30 : 20, borderRadius: 1, flexShrink: 0, background: m.dashed ? "transparent" : m.dot, border: m.dashed ? "0.5px dashed #B4B2A9" : "none" }} />
                  {mv != null && (
                    <span style={{ fontSize: T.fontSize.xs, color: T.inkMid, fontFamily: T.fontSerif, flexShrink: 0 }}>
                      {mv === 0 ? "初期局面" : `第${mv}手`}
                    </span>
                  )}
                  {/* いつ使うメモがあれば、ノード名の下に小さく表示する */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: T.fontSize.base, color: T.ink }}>{child.label}</span>
                    {childWhenToUse && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2, fontSize: T.fontSize.sm, color: T.inkMid, fontFamily: T.fontSerif }}>
                        <i className="ti ti-player-play" style={{ fontSize: "0.625rem", color: T.gold, flexShrink: 0 }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{childWhenToUse}</span>
                      </div>
                    )}
                  </div>
                  {child.isSummary && <SummaryTag />}
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

            {/* ── 「とりあえず」を作り直す ──
                ルートにだけ出す。置き場を消してしまったときの復活手段 */}
            {node.isRoot && !treeHasInbox && (
              <div
                onClick={() => saveAndNavigate(() => onNewNode(nodeId, {
                  label: "とりあえず", status: "todo", isInbox: true,
                  whenToUse: "どこに置くか決まっていないもの",
                  sortOrder: 9999,
                }))}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: T.radius.sm, border: `0.5px dashed ${T.inkLine}`, cursor: "pointer", color: T.grayText, fontSize: T.fontSize.base }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.goldLight)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <i className="ti ti-inbox" style={{ fontSize: "0.875rem" }} />
                「とりあえず」を作る（置き場）
              </div>
            )}

            {/* ── 分岐のコツ ──
                読みたい人だけが読めるよう、本文は畳んでボタンにする（利用規約と同じ考え方）。
                常に文章が出ていると、毎回読み飛ばす行が分岐ボタンの下に居座ることになる。
                子ノードの有無で出し分けない：迷うのは2つ目以降を足すときも同じ */}
            <button
              onClick={() => setBranchTipOpen(true)}
              style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", marginTop: 2, borderRadius: T.radius.xl, border: `0.5px solid ${T.inkLine}`, background: "none", cursor: "pointer", color: T.inkFaint, fontSize: T.fontSize.sm, fontFamily: T.fontSerif }}
            >
              <i className="ti ti-bulb" style={{ fontSize: "0.75rem" }} />ヒント
            </button>

            {/* ── 実戦で当たった相手から選ぶ ──
                ここが「補助」の本体。押さなければ何も起きず、棋譜も読まない */}
            {hasStrategyTag && (
              <>
                <div
                  onClick={toggleBranchCandidates}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 4px", marginTop: 2, cursor: "pointer", color: T.inkFaint, fontSize: T.fontSize.sm, fontFamily: T.fontSerif }}
                >
                  <i className="ti ti-chevron-right" style={{ fontSize: "0.6875rem", transition: "transform 0.15s", transform: branchOpen ? "rotate(90deg)" : "none" }} />
                  実戦で当たった相手から選ぶ
                </div>

                {branchOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 4 }}>
                    {branchLoading ? (
                      <div style={{ fontSize: T.fontSize.sm, color: T.inkFaint, fontFamily: T.fontSerif, padding: "4px 0" }}>棋譜を読み込み中…</div>
                    ) : branch.candidates.length === 0 ? (
                      <div style={{ fontSize: T.fontSize.sm, color: T.inkFaint, fontFamily: T.fontSerif, padding: "4px 0", lineHeight: 1.7 }}>
                        {branch.matchedGames === 0
                          ? "このノードのタグに一致する棋譜がまだありません。"
                          : "当たった相手はすべて枝になっています。"}
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: T.fontSize.xs, color: T.inkFaint, fontFamily: T.fontSerif }}>
                          {branch.matchedGames}局から、{branch.axisLabel}べつに数えました
                        </div>
                        {branch.candidates.map((c) => (
                          <div
                            key={c.name}
                            onClick={() => saveAndNavigate(() => onNewNode(nodeId, candidateToNodeFields(c, branch.axis)))}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: T.radius.sm, border: `0.5px dashed ${T.gold}`, cursor: "pointer" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = T.goldLight)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            <i className="ti ti-plus" style={{ fontSize: "0.75rem", color: T.gold, flexShrink: 0 }} />
                            <span style={{ flex: 1, minWidth: 0, fontSize: T.fontSize.base, color: T.ink }}>{c.name}</span>
                            <span style={{ fontSize: T.fontSize.sm, color: T.inkMid, fontFamily: T.fontSerif, whiteSpace: "nowrap" }}>
                              {c.games}局 {c.wins}勝{c.losses}敗{c.draws ? `${c.draws}分` : ""}
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {/* その他の操作（合流・子の変更）── デフォルト非表示 */}
            {(onSetMergeParents || onReparentNode) && (
              <div
                onClick={() => setChildDetailsOpen((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 4px", marginTop: 2, cursor: "pointer", color: T.inkFaint, fontSize: T.fontSize.sm, fontFamily: T.fontSerif }}
              >
                <i className="ti ti-chevron-right" style={{ fontSize: "0.6875rem", transition: "transform 0.15s", transform: childDetailsOpen ? "rotate(90deg)" : "none" }} />
                その他の操作（{showMerge ? "合流・子の移動" : "子の移動"}）
              </div>
            )}

            {childDetailsOpen && (
              <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
                {showMerge && !node.isRoot && onSetMergeParents && (
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

      {/* 他のノードの中身を呼び出すモーダル */}
      {recallOpen && (
        <NodeRecallModal
          userId={userId}
          trees={trees}
          currentNodeId={nodeId}
          currentLabel={node.label || "このノード"}
          onClose={() => setRecallOpen(false)}
          onRecall={handleRecallNode}
        />
      )}

      {/* 分岐のコツ。子ノードの「ヒント」から開く */}
      {branchTipOpen && (
        <div style={MODAL_OVERLAY_STYLE} onClick={() => setBranchTipOpen(false)}>
          {/* 項目が多いので、画面に収まらないぶんはシートの中でスクロールさせる
              （画面ごと伸びると、閉じるボタンまで押しに行けなくなる） */}
          <div style={{ ...MODAL_SHEET_STYLE, maxHeight: "85%", overflowY: "auto" }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="分岐のコツ">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ flex: 1, fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink }}>分岐のコツ</div>
              <button
                onClick={() => setBranchTipOpen(false)}
                aria-label="閉じる"
                style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: "1.125rem", padding: 2 }}
              >
                <i className="ti ti-x" />
              </button>
            </div>
            <div style={{ fontSize: T.fontSize.base, color: T.inkMid, fontFamily: T.fontSerif, lineHeight: 1.9, marginBottom: 10 }}>
              以下の観点で棋譜を見てみると見つけやすいです
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {BRANCH_TIPS.map(({ point, note }) => (
                <div key={point} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <i className="ti ti-git-branch" style={{ fontSize: "0.75rem", color: T.gold, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: T.fontSize.base, color: T.ink, fontFamily: T.fontSerif, lineHeight: 1.7 }}>
                      {point}
                    </div>
                    {note && (
                      <div style={{ fontSize: T.fontSize.sm, color: T.inkFaint, fontFamily: T.fontSerif, lineHeight: 1.7 }}>
                        {note}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
