// ══════════════════════════════════════════════════════════════════
// TreeListScreen.jsx  ―  ツリー一覧画面
//   TreeCard / TreeList / CreateTreeModal / EditTreeModal / DeleteTreeModal
// ══════════════════════════════════════════════════════════════════
import { useState } from "react";
import { T, MODAL_OVERLAY_STYLE, MODAL_SHEET_STYLE } from "../theme";
import { InputField, SectionLabel, ModalActionButtons, ConfirmDeleteModal } from "../components/uiParts";

// ──────────────────────────────────────────
// CreateTreeModal: 新規ツリー作成
// ──────────────────────────────────────────
function CreateTreeModal({ onClose, onCreate }) {
  const [name, setName] = useState("");

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim());
    onClose();
  };

  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={onClose}>
      <div style={MODAL_SHEET_STYLE} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink, marginBottom: 20 }}>
          新しいツリーを作成
        </div>
        <InputField label="戦法名"              value={name} onChange={setName} placeholder="例：中飛車" />

        <ModalActionButtons
          onCancel={onClose}
          onConfirm={handleCreate}
          confirmLabel="作成する"
          disabled={!name.trim()}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// EditTreeModal: ツリー編集
// ──────────────────────────────────────────
//   canCollaborate: 「みんなで編集」を選べるか（試験運用中は開発者アカウントだけ）
function EditTreeModal({ tree, onClose, onSave, onPublish, onUnpublish, onSetCollaborative, canCollaborate = false }) {
  const [name,         setName]         = useState(tree.name);
  const [active,       setActive]       = useState(tree.active);
  const [publishing,   setPublishing]   = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  // 公開の直前に「みんなで編集にするか」を聞いている最中かどうか。
  // 公開してから設定を探させると、公開した時点の状態が意図と違ったまま人目に触れる
  const [askMode,      setAskMode]      = useState(false);
  const [collabBusy,   setCollabBusy]   = useState(false);

  // 戦法名：フォーカスを外した時点で保存
  const handleNameBlur = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setName(tree.name); return; }
    if (trimmed !== tree.name) await onSave(tree.id, { name: trimmed, active });
  };

  // ステータス：タップした時点で即時保存
  const handleActiveChange = async (val) => {
    if (val === active) return;
    setActive(val);
    await onSave(tree.id, { name: name.trim() || tree.name, active: val });
  };

  const handlePublish = async (collaborative) => {
    if (publishing || typeof onPublish !== "function") return;
    setPublishing(true);
    setPublishError("");
    try {
      await onPublish(tree.id, { collaborative });
      onClose();
    } catch (e) {
      console.error("公開に失敗しました", e);
      setPublishError("公開に失敗しました。もう一度お試しください。");
      setAskMode(false);
    } finally {
      setPublishing(false);
    }
  };

  const handleToggleCollaborative = async (on) => {
    if (collabBusy || typeof onSetCollaborative !== "function") return;
    setCollabBusy(true);
    setPublishError("");
    try {
      await onSetCollaborative(tree.id, on);
    } catch (e) {
      console.error("みんなで編集の切り替えに失敗しました", e);
      setPublishError("みんなで編集の切り替えに失敗しました。もう一度お試しください。");
    } finally {
      setCollabBusy(false);
    }
  };

  const handleUnpublish = async () => {
    if (unpublishing || typeof onUnpublish !== "function") return;
    setUnpublishing(true);
    setPublishError("");
    try {
      await onUnpublish(tree.id);
      onClose();
    } catch (e) {
      console.error("公開取り消しに失敗しました", e);
      setPublishError("公開取り消しに失敗しました。もう一度お試しください。");
    } finally {
      setUnpublishing(false);
    }
  };

  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={onClose}>
      <div style={MODAL_SHEET_STYLE} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink, marginBottom: 20 }}>
          ツリーを編集
        </div>

        {/* 戦法名：blur 時に自動保存 */}
        <div style={{ marginBottom: 20 }}>
          <SectionLabel style={{ marginBottom: 8 }}>戦法名</SectionLabel>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleNameBlur}
            placeholder="例：中飛車"
            style={{ width: "100%", boxSizing: "border-box", border: `0.5px solid rgba(26,15,0,0.2)`, borderRadius: "10px", padding: "11px 14px", fontSize: "0.9375rem", color: "#1a0f00", background: "#fff8ee", fontFamily: "'Noto Serif JP', serif", outline: "none" }}
            onFocus={(e) => (e.target.style.borderColor = "#c8a96e")}
          />
        </div>

        {/* ステータス：タップ時に即時保存 */}
        <div style={{ marginBottom: 20 }}>
          <SectionLabel style={{ marginBottom: 8 }}>ステータス</SectionLabel>
          <div style={{ display: "flex", gap: 8 }}>
            {[["使用中", true], ["休止中", false]].map(([label, val]) => {
              const selected = active === val;
              return (
                <div
                  key={label}
                  onClick={() => handleActiveChange(val)}
                  style={{
                    flex:       1,
                    textAlign:  "center",
                    padding:    "9px",
                    borderRadius: "10px",
                    cursor:     "pointer",
                    fontSize:   "0.875rem",
                    fontFamily: "'Noto Serif JP', serif",
                    transition: "all 0.15s",
                    border:     selected ? `1.5px solid #c8a96e` : `0.5px solid rgba(26,15,0,0.15)`,
                    background: selected ? "#fdf3dc"             : "#faf4e8",
                    color:      selected ? "#c8a96e"             : "rgba(26,15,0,0.45)",
                    fontWeight: selected ? 600                   : 400,
                  }}
                >
                  {label}
                </div>
              );
            })}
          </div>
        </div>

        {/* 公開ボタン / 公開取り消しボタン */}
        {publishError && (
          <div style={{ fontSize: "0.75rem", color: "#c0392b", marginBottom: 8, textAlign: "center" }}>
            {publishError}
          </div>
        )}
        {!tree.is_public ? (
          // 「みんなで編集」を選べる人だけ、公開の直前に聞く。
          // 選べない人には今までどおり1タップで公開させる（選択肢の無い問いを出さない）
          askMode ? (
            <div style={{ marginBottom: 10 }}>
              <SectionLabel style={{ marginBottom: 8 }}>どう公開しますか</SectionLabel>
              <button
                onClick={() => handlePublish(false)}
                disabled={publishing}
                style={{
                  width: "100%", padding: 11, borderRadius: "12px", marginBottom: 8,
                  border: `0.5px solid #3B6D11`, background: "#EAF3DE", color: "#3B6D11",
                  fontSize: "0.875rem", fontFamily: "'Noto Serif JP', serif", fontWeight: 600,
                  cursor: publishing ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <i className="ti ti-world" style={{ fontSize: "0.875rem" }} />
                見せるだけ（編集は自分だけ）
              </button>
              <button
                onClick={() => handlePublish(true)}
                disabled={publishing}
                style={{
                  width: "100%", padding: 11, borderRadius: "12px",
                  border: `0.5px solid #3B6D11`, background: "#3B6D11", color: "#faf4e8",
                  fontSize: "0.875rem", fontFamily: "'Noto Serif JP', serif", fontWeight: 600,
                  cursor: publishing ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <i className="ti ti-users" style={{ fontSize: "0.875rem" }} />
                みんなで編集にする
              </button>
              <div style={{ fontSize: "0.75rem", color: "rgba(26,15,0,0.45)", fontFamily: "'Noto Serif JP', serif", lineHeight: 1.7, margin: "8px 0 0" }}>
                みんなで編集にすると、ねっこを使っている人なら誰でもノードを足す・直す・消せるようになります。あとから切り替えられます。
              </div>
              <button
                onClick={() => setAskMode(false)}
                style={{
                  width: "100%", padding: 9, marginTop: 8, borderRadius: "12px",
                  border: `0.5px solid rgba(26,15,0,0.15)`, background: "transparent",
                  color: "rgba(26,15,0,0.45)", fontSize: "0.8125rem",
                  fontFamily: "'Noto Serif JP', serif", cursor: "pointer",
                }}
              >
                やめる
              </button>
            </div>
          ) : (
            <button
              onClick={() => (canCollaborate ? setAskMode(true) : handlePublish(false))}
              disabled={publishing || typeof onPublish !== "function"}
              style={{
                width: "100%", padding: 11, borderRadius: "12px",
                border: `0.5px solid #3B6D11`, background: "#EAF3DE", color: "#3B6D11",
                fontSize: "0.875rem", fontFamily: "'Noto Serif JP', serif", fontWeight: 600,
                cursor: publishing ? "default" : "pointer", marginBottom: 10,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <i className="ti ti-world" style={{ fontSize: "0.875rem" }} />
              {publishing ? "公開中..." : "このツリーを公開する"}
            </button>
          )
        ) : (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: "0.75rem", color: "#3B6D11", padding: "4px 0 8px" }}>
              <i className={`ti ti-${tree.is_collaborative ? "users" : "world-check"}`} style={{ fontSize: "0.8125rem" }} />
              {tree.is_collaborative ? "公開中（みんなで編集）" : "公開中"}
            </div>

            {/* 公開したあとから切り替える。試験運用中なので、切り替えられる人にだけ出す */}
            {canCollaborate && (
              <button
                onClick={() => handleToggleCollaborative(!tree.is_collaborative)}
                disabled={collabBusy}
                style={{
                  width: "100%", padding: 9, borderRadius: "12px", marginBottom: 8,
                  border: `0.5px solid ${tree.is_collaborative ? "rgba(26,15,0,0.15)" : "#3B6D11"}`,
                  background: "transparent",
                  color: tree.is_collaborative ? "rgba(26,15,0,0.45)" : "#3B6D11",
                  fontSize: "0.8125rem", fontFamily: "'Noto Serif JP', serif",
                  cursor: collabBusy ? "default" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <i className={`ti ti-${tree.is_collaborative ? "user-off" : "users"}`} style={{ fontSize: "0.8125rem" }} />
                {collabBusy ? "切り替え中..."
                  : tree.is_collaborative ? "みんなで編集をやめる" : "みんなで編集にする"}
              </button>
            )}
            <button
              onClick={handleUnpublish}
              disabled={unpublishing || typeof onUnpublish !== "function"}
              style={{
                width: "100%", padding: 9, borderRadius: "12px",
                border: `0.5px solid rgba(26,15,0,0.15)`, background: "transparent",
                color: "rgba(26,15,0,0.45)", fontSize: "0.8125rem",
                fontFamily: "'Noto Serif JP', serif",
                cursor: unpublishing ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              }}
            >
              <i className="ti ti-world-off" style={{ fontSize: "0.8125rem" }} />
              {unpublishing ? "取り消し中..." : "公開を取り消す"}
            </button>
          </div>
        )}

        {/* 閉じるボタン */}
        <button
          onClick={onClose}
          style={{
            width: "100%", padding: 11, borderRadius: "12px",
            border: `0.5px solid rgba(26,15,0,0.15)`, background: "transparent",
            color: "rgba(26,15,0,0.45)", fontSize: "0.875rem",
            fontFamily: "'Noto Serif JP', serif", cursor: "pointer", marginTop: 4,
          }}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TreeCard: ツリー一覧の1行カード
// ══════════════════════════════════════════════════════════════════
function TreeCard({ tree, onOpen, onEdit, onDelete, onMemoSave }) {
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [memoOpen,  setMemoOpen]  = useState(false);
  const [memoValue, setMemoValue] = useState(tree.quick_memo || "");

  const nodeList      = (Array.isArray(tree.nodes) ? tree.nodes : []).filter((n) => !n.is_root);
  const nodeCount     = nodeList.length;
  const doneCount     = nodeList.filter((n) => n.status === "done").length;
  const completionPct = nodeCount > 0 ? Math.round((doneCount / nodeCount) * 100) : 0;
  const daysAgo       = tree.updated_at
    ? Math.floor((Date.now() - new Date(tree.updated_at)) / 86400000)
    : null;
  const updatedLabel  = daysAgo === null ? "" : daysAgo === 0 ? "今日" : daysAgo === 1 ? "昨日" : `${daysAgo}日前`;

  const handleMenuToggle = (e) => { e.stopPropagation(); setMenuOpen((v) => !v); };
  const handleEdit       = (e) => { e.stopPropagation(); setMenuOpen(false); onEdit(tree); };
  const handleDelete     = (e) => { e.stopPropagation(); setMenuOpen(false); onDelete(tree); };
  const handleMemoToggle = (e) => { e.stopPropagation(); setMemoOpen((v) => !v); };
  const handleMemoBlur   = () => {
    const trimmed = memoValue.trim();
    if (trimmed !== (tree.quick_memo || "").trim()) onMemoSave?.(tree.id, trimmed);
    setMemoOpen(false);
  };

  return (
    <div style={{ position: "relative", marginBottom: 10 }}>
      {/* カード本体 */}
      <div
        onClick={() => onOpen(tree.id)}
        style={{
          padding:      "14px 16px",
          borderRadius: T.radius.lg,
          border:       "0.5px solid rgba(200,169,110,0.35)",
          background:   tree.active ? T.goldBg : T.goldLight,
          cursor:       "pointer",
          transition:   "all 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.gold)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(200,169,110,0.35)")}
      >
        {/* 1行目: 名前 + メモアイコン + ステータスバッジ + 公開バッジ + メニューボタン */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: memoOpen ? 8 : 10 }}>
          <span style={{ fontSize: T.fontSize.xxl, fontWeight: 600, color: T.ink, fontFamily: T.fontTitle, flex: 1 }}>
            {tree.name}
          </span>

          {/* 一言メモボタン */}
          {/* 絵しか無いボタンは title だけでは読み上げソフトに名前が付かない
              （アイコンフォントが ::before で文字を差し込むため）。aria-label で固定する */}
          <button
            onClick={handleMemoToggle}
            aria-label={`${tree.name}の一言メモ`}
            title={memoValue || "一言メモ"}
            style={{ background: "none", border: "none", cursor: "pointer", color: memoValue ? T.gold : T.inkFaint, fontSize: "1rem", padding: "2px 4px", borderRadius: 6, lineHeight: 1 }}
          >
            <i className="ti ti-notes" />
          </button>

          {/* 使用中 / 休止中バッジ */}
          <span style={{
            fontSize:     T.fontSize.sm,
            padding:      "3px 9px",
            borderRadius: T.radius.md,
            background:   tree.active ? T.blueBg : "#e8dcc4",
            color:        tree.active ? T.blue   : "#7a5c2e",
            border:       `0.5px solid ${tree.active ? T.blueLine : "rgba(160,120,64,0.3)"}`,
            fontFamily:   T.fontSerif,
          }}>
            {tree.active ? "使用中" : "休止中"}
          </span>

          {tree.is_public && (
            <span style={{ fontSize: T.fontSize.sm, padding: "3px 8px", borderRadius: T.radius.md, background: T.greenBg, color: T.green, fontFamily: T.fontSerif }}>
              公開中
            </span>
          )}

          {/* みんなのツリーからコピーしたツリーの目印。
              青は「使用中」、緑は「公開中」と被るため紫系にする */}
          {tree.copied_from && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: T.fontSize.sm, padding: "3px 8px", borderRadius: T.radius.md, background: "#ede0f8", color: T.purple, border: "0.5px solid rgba(107,63,160,0.3)", fontFamily: T.fontSerif }}>
              <i className="ti ti-copy" style={{ fontSize: "0.625rem" }} />
              コピー
            </span>
          )}

          <button
            onClick={handleMenuToggle}
            aria-label={`${tree.name}のメニュー`}
            style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: "1rem", padding: "2px 4px", borderRadius: 6, lineHeight: 1 }}
          >
            <i className="ti ti-dots-vertical" />
          </button>
        </div>

        {/* 一言メモ入力欄（展開時） */}
        {memoOpen && (
          <div onClick={(e) => e.stopPropagation()} style={{ marginBottom: 10 }}>
            <textarea
              autoFocus
              value={memoValue}
              onChange={(e) => setMemoValue(e.target.value)}
              onBlur={handleMemoBlur}
              placeholder="時間がないときは、とりあえずここへ（あとで整理すればOK）"
              rows={2}
              style={{
                width: "100%", boxSizing: "border-box",
                border: "0.5px solid rgba(200,169,110,0.6)",
                borderRadius: T.radius.md,
                background: "rgba(255,252,240,0.9)",
                padding: "8px 10px",
                fontSize: T.fontSize.md,
                color: T.ink,
                fontFamily: T.fontSerif,
                resize: "none",
                outline: "none",
              }}
            />
          </div>
        )}

        {/* 2行目: タグ */}
        {(tree.tags || []).length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
            {(tree.tags || []).map((tag) => (
              <span key={tag} style={{ fontSize: T.fontSize.sm, padding: "2px 7px", borderRadius: T.radius.sm, background: "rgba(26,15,0,0.06)", color: T.inkMid, fontFamily: T.fontSerif }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 3行目: ミニバッジ（ノード数 / 完成率 / 更新日） */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: T.fontSize.sm, color: T.inkMid, fontFamily: T.fontSerif }}>
            🌱 {nodeCount}
          </span>
          <span style={{ fontSize: T.fontSize.sm, padding: "1px 7px", borderRadius: T.radius.sm, background: completionPct === 100 ? "#EAF3DE" : "rgba(26,15,0,0.05)", color: completionPct === 100 ? "#3B6D11" : T.inkMid, fontFamily: T.fontSerif }}>
            完成 {completionPct}%
          </span>
          <span style={{ fontSize: T.fontSize.sm, color: T.inkFaint, marginLeft: "auto", fontFamily: T.fontSerif }}>
            {updatedLabel}
          </span>
        </div>
      </div>

      {/* コンテキストメニュー */}
      {menuOpen && (
        <>
          {/* 背景クリックで閉じる透明レイヤー */}
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />

          <div style={{
            position:   "absolute",
            top:        10,
            right:      0,
            zIndex:     50,
            background: T.cream,
            borderRadius: T.radius.md,
            border:     "0.5px solid rgba(200,169,110,0.5)",
            boxShadow:  "0 6px 24px rgba(26,15,0,0.15)",
            overflow:   "hidden",
            minWidth:   140,
          }}>
            <div
              onClick={handleEdit}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", fontSize: T.fontSize.lg, cursor: "pointer", color: T.ink, fontFamily: T.fontSerif }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.goldLight)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <i className="ti ti-pencil" style={{ fontSize: "0.875rem", color: T.gold }} />編集
            </div>
            <div style={{ height: "0.5px", background: T.inkLineFaint }} />
            <div
              onClick={handleDelete}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", fontSize: T.fontSize.lg, cursor: "pointer", color: T.red, fontFamily: T.fontSerif }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.redBg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <i className="ti ti-trash" style={{ fontSize: "0.875rem" }} />削除
            </div>
          </div>
        </>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════
// TreeList: ツリー一覧画面
// ══════════════════════════════════════════════════════════════════
export function TreeList({ trees, profile, onOpen, onPublic, onSearch, onKifus, onTrophy, onSettings, onNewTree, onSignOut, onDeleteTree, onEditTree, onPublish, onUnpublish, onSetCollaborative, onMemoSave }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editTarget,      setEditTarget]      = useState(null);
  const [deleteTarget,    setDeleteTarget]    = useState(null);
  const [signOutConfirm,  setSignOutConfirm]  = useState(false); // 誤タップでの即ログアウトを防ぐ確認

  const activeTrees   = trees.filter((t) =>  t.active);
  const inactiveTrees = trees.filter((t) => !t.active);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.cream }}>
      {/* ── ヘッダー ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px 12px", borderBottom: `0.5px solid rgba(26,15,0,0.12)` }}>
        <div>
          <div style={{ fontFamily: T.fontTitle, fontSize: "1.375rem", color: T.ink, letterSpacing: "0.2em" }}>
            ね<span style={{ color: T.gold }}>っ</span>こ
          </div>
          {profile && (
            <div style={{ fontSize: T.fontSize.md, color: T.inkFaint, marginTop: 2 }}>
              {profile.display_name || profile.username}
            </div>
          )}
        </div>

        {/*
          アイコンだけのボタンには必ず aria-label を付ける。
            見た目は絵しかないので、読み上げソフトでは「ボタン」としか読まれず何なのか分からない。
            title だけでは不十分：アイコンフォントが ::before で文字を差し込むため、
            名前の計算がそちらに引っ張られて title が無視されることがある。
            aria-label は中身より強いので確実に名前が付く（テストからも指せるようになる）。
        */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button data-onboard="search" aria-label="ノード検索" title="ノード検索" onClick={onSearch} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1.25rem", padding: 2 }}>
            <i className="ti ti-search" />
          </button>
          <button data-onboard="public" aria-label="みんなのツリー" title="みんなのツリー" onClick={onPublic} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1.25rem", padding: 2 }}>
            <i className="ti ti-world" />
          </button>
          <button data-onboard="kifus" aria-label="棋譜ライブラリ" title="棋譜ライブラリ" onClick={onKifus} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1.25rem", padding: 2 }}>
            <i className="ti ti-chess" />
          </button>
          <button data-onboard="trophy" aria-label="トロフィー" title="トロフィー" onClick={onTrophy} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1.25rem", padding: 2 }}>
            <i className="ti ti-trophy" />
          </button>
          <button data-onboard="settings" aria-label="設定" title="設定" onClick={onSettings} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1.125rem", padding: 2 }}>
            <i className="ti ti-settings" />
          </button>
          <button
            data-onboard="new"
            onClick={() => setShowCreateModal(true)}
            style={{ background: T.gold, border: "none", cursor: "pointer", color: T.cream, fontSize: T.fontSize.lg, padding: "6px 14px", borderRadius: T.radius.md, fontFamily: T.fontSerif, display: "flex", alignItems: "center", gap: 4 }}
          >
            <i className="ti ti-plus" style={{ fontSize: "0.8125rem" }} /> 新規
          </button>
          <button aria-label="ログアウト" title="ログアウト" onClick={() => setSignOutConfirm(true)} style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: "1.125rem", padding: 2 }}>
            <i className="ti ti-logout" />
          </button>
        </div>
      </div>

      {/* ── リスト ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
        {trees.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: T.inkFaint, fontSize: T.fontSize.lg }}>
            <i className="ti ti-plant" style={{ fontSize: "2.5rem", display: "block", marginBottom: 12 }} />
            ツリーがまだありません<br />
            <span style={{ fontSize: T.fontSize.md }}>「新規」から最初のツリーを作りましょう</span>
          </div>
        ) : (
          <>
            {activeTrees.length > 0 && (
              <>
                <div style={{ fontSize: T.fontSize.sm, color: "rgba(26,15,0,0.4)", letterSpacing: "0.1em", marginBottom: 8 }}>使用中</div>
                {activeTrees.map((t) => (
                  <TreeCard key={t.id} tree={t} onOpen={onOpen} onEdit={setEditTarget} onDelete={setDeleteTarget} onMemoSave={onMemoSave} />
                ))}
              </>
            )}
            {inactiveTrees.length > 0 && (
              <>
                <div style={{ fontSize: T.fontSize.sm, color: "rgba(26,15,0,0.4)", letterSpacing: "0.1em", marginBottom: 8, marginTop: activeTrees.length > 0 ? 16 : 0 }}>休止中</div>
                {inactiveTrees.map((t) => (
                  <TreeCard key={t.id} tree={t} onOpen={onOpen} onEdit={setEditTarget} onDelete={setDeleteTarget} onMemoSave={onMemoSave} />
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* ── モーダル群 ── */}
      {showCreateModal && (
        <CreateTreeModal
          onClose={() => setShowCreateModal(false)}
          onCreate={(name) => onNewTree(name, [])}
        />
      )}
      {editTarget && (
        <EditTreeModal
          // 一覧の最新の行を渡す。開いた時点の写しを持ち続けると、モーダルを閉じずに
          // 状態を変える操作（みんなで編集の切り替え）が画面に反映されず、
          // 押しても何も起きていないように見える（保存は済んでいるので気づけない）
          tree={trees.find((t) => t.id === editTarget.id) || editTarget}
          onClose={() => setEditTarget(null)}
          onSave={onEditTree}
          onPublish={onPublish}
          onUnpublish={onUnpublish}
          onSetCollaborative={onSetCollaborative}
          // 「みんなで編集」は試験運用中。開発者アカウントのツリーだけが選べる。
          // 画面で出し分けるだけでは直接APIを叩けば通ってしまうので、
          // DB側にも同じ判定を置いてある（20260806_collaborative_public_trees.sql）
          canCollaborate={profile?.username === "niku"}
        />
      )}
      {deleteTarget && (
        <ConfirmDeleteModal
          title={`「${deleteTarget.name}」を削除しますか？`}
          message={<>ツリーと全ノードが完全に削除されます。<br />この操作は取り消せません。</>}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => onDeleteTree(deleteTarget.id)}
        />
      )}

      {/* サインアウト確認 */}
      {signOutConfirm && (
        <div
          style={{
            position: "absolute", inset: 0, background: "rgba(26,15,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 50, padding: 20,
          }}
          onClick={() => setSignOutConfirm(false)}
        >
          <div
            style={{ width: "100%", maxWidth: 320, background: T.cream, borderRadius: T.radius.xl, padding: "26px 22px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.xxl, color: T.ink, textAlign: "center", marginBottom: 18 }}>
              ログアウトしますか？
            </div>
            <ModalActionButtons
              onCancel={() => setSignOutConfirm(false)}
              onConfirm={() => { setSignOutConfirm(false); onSignOut(); }}
              confirmLabel="ログアウト"
            />
          </div>
        </div>
      )}
    </div>
  );
}
