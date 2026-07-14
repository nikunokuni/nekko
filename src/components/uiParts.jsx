// ══════════════════════════════════════════════════════════════════
// uiParts.jsx  ―  ツリー編集系画面で共有する小さなUIパーツ
//   InputField / SectionLabel / ModalActionButtons /
//   BoardSection / MergeLinkList
// ══════════════════════════════════════════════════════════════════
import { useState } from "react";
import ShogiBoard from "../ShogiBoard";
import { BOARD_TEMPLATES } from "../data";
import { T, INPUT_STYLE, BTN_CANCEL_STYLE, parseTags } from "../theme";

// ──────────────────────────────────────────
// InputField: ラベル付きテキスト入力フィールド
// ──────────────────────────────────────────
export function InputField({ label, value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: T.fontSize.md, color: T.inkMid, marginBottom: 5 }}>
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={INPUT_STYLE}
        onFocus={(e) => (e.target.style.borderColor = T.gold)}
        onBlur={(e)  => (e.target.style.borderColor = T.inkLine)}
      />
    </div>
  );
}

// ──────────────────────────────────────────
// SectionLabel: セクションの小見出し
// ──────────────────────────────────────────
export function SectionLabel({ children, style }) {
  return (
    <div style={{ fontSize: T.fontSize.md, color: T.inkMid, ...style }}>
      {children}
    </div>
  );
}

// ──────────────────────────────────────────
// ModalActionButtons: モーダル下部のボタン行
// ──────────────────────────────────────────
export function ModalActionButtons({ onCancel, onConfirm, confirmLabel, disabled, danger = false }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <button onClick={onCancel} style={BTN_CANCEL_STYLE}>
        キャンセル
      </button>
      <button
        onClick={onConfirm}
        disabled={disabled}
        style={{
          flex:         2,
          padding:      12,
          borderRadius: T.radius.lg,
          border:       "none",
          fontSize:     T.fontSize.lg,
          fontWeight:   600,
          cursor:       disabled ? "default" : "pointer",
          background:   disabled ? T.gray : danger ? T.red : T.gold,
          color:        T.cream,
          fontFamily:   T.fontSerif,
        }}
      >
        {confirmLabel}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────
// BoardSection: 将棋盤の表示/追加エリア
// ──────────────────────────────────────────
export function BoardSection({ boardVisible, boardData, stamps, handSente, handGote, parentBoard, parentLabel, onToggle, onChange, onDelete, onLoadTemplate, kifu, onKifuChange, onKifuDelete, allowBranch, onBranchFromHere, canUndo, onUndo }){
  const [tmplOpen, setTmplOpen] = useState(false);

  // 盤面操作系ボタンの共通スタイル
  const toolbarBtnStyle = (color, border = color) => ({
    fontSize:     T.fontSize.md,
    padding:      "4px 10px",
    borderRadius: T.radius.sm,
    border:       `0.5px solid ${border}`,
    background:   "none",
    cursor:       "pointer",
    color,
    fontFamily:   T.fontSerif,
    display:      "flex",
    alignItems:   "center",
    gap:          4,
  });

  // 盤面が非表示の場合: プレースホルダーのみ表示する
  // （非表示中の盤面データがあるときは「追加」ではなく「再表示」であることを明示する）
  if (!boardVisible) {
    return (
      <div style={{ padding: "8px 16px 0" }}>
        <div
          onClick={onToggle}
          style={{
            display:        "flex",
            flexDirection:  "column",
            alignItems:     "center",
            justifyContent: "center",
            gap:            8,
            padding:        20,
            border:         `0.5px dashed ${T.inkLine}`,
            borderRadius:   T.radius.md,
            cursor:         "pointer",
            background:     "rgba(26,15,0,0.04)",
            marginBottom:   12,
          }}
        >
          <i className="ti ti-chess" style={{ fontSize: "1.5rem", color: T.gold }} />
          <span style={{ fontSize: T.fontSize.base, color: T.inkMid }}>
            {boardData ? "タップして盤面を再表示" : "タップして盤面を追加"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "8px 16px 0" }}>
      {/* ヘッダー行: 盤面操作系ボタンをまとめて配置 */}
      <div style={{ marginBottom: tmplOpen ? 0 : 8 }}>
        <SectionLabel style={{ marginBottom: 6 }}>盤面</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {/* テンプレートボタン */}
          <button
            data-onboard="board-tmpl"
            onClick={() => setTmplOpen((v) => !v)}
            title="テンプレートから呼び出す"
            style={{
              ...toolbarBtnStyle(tmplOpen ? T.gold : T.inkMid, tmplOpen ? T.gold : T.inkLine),
              background: tmplOpen ? T.goldLight : "none",
            }}
          >
            <i className="ti ti-template" style={{ fontSize: "0.75rem" }} />テンプレート
          </button>

          {/* 非表示 */}
          <button data-onboard="board-hide" onClick={onToggle} style={toolbarBtnStyle(T.gold)}>
            <i className="ti ti-minus" style={{ fontSize: "0.75rem" }} />非表示
          </button>

          {/* 元に戻す（編集開始時点の盤面に戻す） */}
          {canUndo && (
            <button data-onboard="board-undo" onClick={onUndo} title="この画面を開いたときの盤面に戻す" style={toolbarBtnStyle(T.blue)}>
              <i className="ti ti-history" style={{ fontSize: "0.75rem" }} />元に戻す
            </button>
          )}

          {/* 盤面を削除 */}
          <button data-onboard="board-delete" onClick={onDelete} style={toolbarBtnStyle(T.gray, T.inkLine)}>
            <i className="ti ti-trash" style={{ fontSize: "0.75rem" }} />盤面を削除
          </button>

          {/* 棋譜を削除 */}
          {kifu && kifu.length > 0 && (
            <button onClick={onKifuDelete} title="入力前の盤面に戻す" style={toolbarBtnStyle(T.gray, T.inkLine)}>
              <i className="ti ti-arrow-back-up" style={{ fontSize: "0.75rem" }} />棋譜を削除
            </button>
          )}
        </div>
      </div>

      {/* テンプレート選択パネル */}
      {tmplOpen && (
        <div style={{ marginBottom: 10, padding: "10px 0 4px", borderBottom: `0.5px solid ${T.inkLineFaint}` }}>
          {BOARD_TEMPLATES.length === 0 ? (
            <div style={{ fontSize: T.fontSize.sm, color: T.inkFaint, fontFamily: T.fontSerif }}>
              テンプレートがまだありません（data.js に追加してください）
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {BOARD_TEMPLATES.map((t, i) => (
                <div
                  key={i}
                  onClick={() => {
                    onLoadTemplate(t);
                    setTmplOpen(false);
                  }}
                  style={{
                    padding: "7px 14px", borderRadius: 20, cursor: "pointer",
                    border: `0.5px solid ${T.inkLine}`, fontSize: T.fontSize.base,
                    color: T.ink, background: T.cream, fontFamily: T.fontSerif,
                    transition: "all 0.12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = T.goldLight; e.currentTarget.style.borderColor = T.gold; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = T.cream; e.currentTarget.style.borderColor = T.inkLine; }}
                >
                  {t.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 継承バナー + 将棋盤 */}
      <div style={{ marginBottom: 12 }}>
        {parentBoard && (
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:          6,
            padding:      "6px 10px",
            borderRadius: T.radius.sm,
            background:   T.blueBg,
            border:       `0.5px solid ${T.blueLine}`,
            marginBottom: 10,
            fontSize:     T.fontSize.md,
            color:        T.blue,
          }}>
            <i className="ti ti-copy" style={{ fontSize: "0.8125rem" }} />
            親ノード「{parentLabel}」の盤面を引き継いでいます
          </div>
        )}

        <ShogiBoard
          board={boardData}
          stamps={stamps}
          handSente={handSente}
          handGote={handGote}
          kifu={kifu || []}
          onChange={({ board, stamps: s, handSente: hs, handGote: hg }) => onChange(board, s, hs, hg)}
          onKifuChange={onKifuChange}
          allowBranch={allowBranch}
          onBranchFromHere={onBranchFromHere}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// TagPickerField: グループ選択→戦法タグ選択のピッカー
//   groups: [{ label, items }] 形式のグループ配列
// ──────────────────────────────────────────
export function TagPickerField({
  label, text, onSelectTag,
  groups, customTags, onAddCustomTag,
  noToggle = false,
}) {
  const [open,        setOpen]        = useState(noToggle);
  const [activeGroup, setActiveGroup] = useState(null);
  const [addingTag,   setAddingTag]   = useState(false);
  const [newTagInput, setNewTagInput] = useState("");

  const current = parseTags(text);

  const chipStyle = (s) => ({
    padding: "6px 12px", borderRadius: 20, cursor: "pointer",
    border: `0.5px solid ${current.includes(s) ? T.gold : T.inkLine}`,
    fontSize: T.fontSize.base,
    color: current.includes(s) ? T.gold : T.ink,
    fontWeight: current.includes(s) ? 600 : 400,
    background: current.includes(s) ? T.goldLight : T.cream,
    fontFamily: T.fontSerif, transition: "all 0.12s",
  });

  const toggleTag = (s) => {
    const next = current.includes(s) ? current.filter((t) => t !== s) : [...current, s];
    onSelectTag(next);
  };

  const confirmNewTag = () => {
    const tag = newTagInput.trim();
    if (tag) {
      onAddCustomTag(tag, activeGroup ?? null);
      if (!current.includes(tag)) onSelectTag([...current, tag]);
    }
    setAddingTag(false);
    setNewTagInput("");
  };

  const groupItems = activeGroup ? (groups.find((g) => g.label === activeGroup)?.items ?? []) : [];
  // customTags は { name, group }[] 形式。アクティブグループに属するものとそれ以外に分ける
  const groupCustomItems = activeGroup
    ? customTags.filter((t) => t.group === activeGroup).map((t) => t.name)
    : [];
  const ungroupedCustomTags = customTags.filter((t) => !t.group || !groups.some((g) => g.label === t.group)).map((t) => t.name);

  return (
    <div style={{ padding: "0 16px 16px" }}>
      {/* ラベル（noToggle=false のときのみ開閉） */}
      <div
        onClick={noToggle ? undefined : () => { setOpen((v) => !v); if (open) setActiveGroup(null); }}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: noToggle ? "default" : "pointer" }}
      >
        <SectionLabel style={{ marginBottom: 5 }}>{label}</SectionLabel>
        {!noToggle && <i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ fontSize: "0.8125rem", color: T.inkMid }} />}
      </div>

      {/* 選択済みタグ（閉じているときのプレビュー） */}
      {!open && current.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {current.map((tag) => (
            <span key={tag} style={{ fontSize: T.fontSize.sm, padding: "3px 9px", borderRadius: T.radius.sm, background: T.goldLight, color: T.gold, fontFamily: T.fontSerif }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div style={{ marginTop: 8 }}>

          {/* グループボタン：タップでグループ名タグを選択 + サブ一覧を開く */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {groups.map((g) => {
              const open2  = activeGroup === g.label;
              const tagged = !g.noGroupTag && current.includes(g.label);
              return (
                <div
                  key={g.label}
                  onClick={() => {
                    if (!g.noGroupTag) toggleTag(g.label);
                    setActiveGroup(open2 ? null : g.label);
                  }}
                  style={{
                    padding: "5px 8px 5px 16px", borderRadius: T.radius.md, cursor: "pointer",
                    fontSize: T.fontSize.base, fontFamily: T.fontSerif, transition: "all 0.12s",
                    border: (open2 || tagged) ? `1.5px solid ${T.gold}` : `0.5px solid ${T.inkLine}`,
                    background: (open2 || tagged) ? T.goldLight : T.cream,
                    color: (open2 || tagged) ? T.gold : T.inkMid,
                    fontWeight: (open2 || tagged) ? 600 : 400,
                    display: "flex", alignItems: "center", gap: 7,
                  }}
                >
                  {tagged && <i className="ti ti-check" style={{ fontSize: "0.6875rem" }} />}
                  {g.label}
                  {/* 開閉専用の丸ボタン。タグ選択（チップ本体タップ）とは独立して開閉だけ行う */}
                  <span
                    onClick={(e) => { e.stopPropagation(); setActiveGroup(open2 ? null : g.label); }}
                    title={open2 ? "閉じる" : `${g.label}の一覧を開く`}
                    style={{
                      width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      border: `0.5px solid ${open2 ? T.gold : "rgba(26,15,0,0.28)"}`,
                      background: open2 ? "#e7d9b8" : "#ece3cd",
                    }}
                  >
                    <i className={`ti ti-chevron-${open2 ? "up" : "down"}`} style={{ fontSize: "0.8125rem", color: open2 ? T.gold : T.inkMid }} />
                  </span>
                </div>
              );
            })}
          </div>

          {/* 選択グループの戦法チップ + グループ内追加ボタン */}
          {activeGroup && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {groupItems.map((s) => (
                <div key={s} onClick={() => toggleTag(s)} style={chipStyle(s)}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.gold; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = current.includes(s) ? T.gold : T.inkLine; }}
                >{s}</div>
              ))}
              {groupCustomItems.map((s) => (
                <div key={s} onClick={() => toggleTag(s)} style={chipStyle(s)}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.gold; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = current.includes(s) ? T.gold : T.inkLine; }}
                >{s}</div>
              ))}

              {/* グループ内タグ追加 */}
              {!addingTag ? (
                <div
                  onClick={() => { setAddingTag(true); setNewTagInput(""); }}
                  title={`${activeGroup}に新しいタグを追加`}
                  style={{ padding: "6px 10px", borderRadius: 20, cursor: "pointer", border: `0.5px dashed ${T.inkLine}`, fontSize: T.fontSize.sm, color: T.inkFaint, background: "transparent", display: "flex", alignItems: "center", gap: 3 }}
                >
                  <i className="ti ti-plus" style={{ fontSize: "0.6875rem" }} />追加
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    autoFocus
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmNewTag();
                      if (e.key === "Escape") { setAddingTag(false); setNewTagInput(""); }
                    }}
                    placeholder="新しいタグ"
                    style={{ padding: "5px 10px", borderRadius: 20, border: `1px solid ${T.gold}`, fontSize: T.fontSize.base, color: T.ink, background: T.cream, fontFamily: T.fontSerif, outline: "none", width: 120 }}
                  />
                  <button onClick={confirmNewTag} style={{ background: T.gold, border: "none", borderRadius: 20, padding: "5px 12px", color: T.cream, fontSize: T.fontSize.base, cursor: "pointer", fontFamily: T.fontSerif }}>確定</button>
                  <button onClick={() => { setAddingTag(false); setNewTagInput(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: "1rem" }}><i className="ti ti-x" /></button>
                </div>
              )}
            </div>
          )}

          {/* グループ未所属のカスタムタグのみ表示（追加ボタンはグループ内に移動済み） */}
          {ungroupedCustomTags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {ungroupedCustomTags.map((s) => (
                <div key={s} onClick={() => toggleTag(s)} style={chipStyle(s)}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.gold; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = current.includes(s) ? T.gold : T.inkLine; }}
                >{s}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────
// LinkPicker: 「追加」ボタン or 候補一覧から1件選ぶピッカー
//   合流の追加・親ノードの変更など、ノードを1件選ぶUIで共有する
// ──────────────────────────────────────────
export function LinkPicker({ candidates, pickerOpen, setPickerOpen, onPick, label, pickLabel, icon = "ti-arrows-exchange", color = T.purple, hoverBg = T.goldLight }) {
  return !pickerOpen ? (
    <div
      onClick={() => setPickerOpen(true)}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: T.radius.sm, border: `0.5px dashed ${color}`, cursor: "pointer", color, fontSize: T.fontSize.base }}
      onMouseEnter={(e) => (e.currentTarget.style.background = hoverBg)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <i className={`ti ${icon}`} style={{ fontSize: "0.875rem" }} />{label}
    </div>
  ) : (
    <div style={{ border: `0.5px solid ${T.inkLine}`, borderRadius: T.radius.sm, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `0.5px solid ${T.inkLineFaint}`, background: T.goldLight }}>
        <span style={{ fontSize: T.fontSize.sm, color: T.inkMid }}>{pickLabel}</span>
        <button onClick={() => setPickerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: T.gray, fontSize: "0.8125rem" }}>
          <i className="ti ti-x" />
        </button>
      </div>
      <div style={{ maxHeight: 180, overflowY: "auto" }}>
        {candidates.length === 0 ? (
          <div style={{ padding: "12px", fontSize: T.fontSize.sm, color: T.inkFaint, textAlign: "center" }}>
            選べるノードがありません
          </div>
        ) : (
          candidates.map((c) => (
            <div
              key={c.id}
              onClick={() => onPick(c.id)}
              style={{ padding: "9px 12px", fontSize: T.fontSize.base, color: T.ink, cursor: "pointer", borderBottom: `0.5px solid ${T.inkLineFaint}` }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.goldLight)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {c.label}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// MergeLinkList: 合流リンク（親/子）の一覧 + 追加ピッカー
// ──────────────────────────────────────────
export function MergeLinkList({ items, candidates, pickerOpen, setPickerOpen, onAdd, onRemove, addLabel, pickLabel }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((n) => (
        <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: T.radius.sm, border: `0.5px solid ${T.purple}`, background: "#f3edf9" }}>
          <i className="ti ti-arrow-merge" style={{ fontSize: "0.875rem", color: T.purple }} />
          <span style={{ fontSize: T.fontSize.base, color: T.ink, flex: 1 }}>{n.label}</span>
          <button onClick={() => onRemove(n.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.gray, fontSize: "0.875rem", padding: 2 }}>
            <i className="ti ti-x" />
          </button>
        </div>
      ))}

      <LinkPicker
        candidates={candidates}
        pickerOpen={pickerOpen}
        setPickerOpen={setPickerOpen}
        onPick={onAdd}
        label={addLabel}
        pickLabel={pickLabel}
        icon="ti-arrow-merge"
        color={T.purple}
        hoverBg="#f3edf9"
      />
    </div>
  );
}
