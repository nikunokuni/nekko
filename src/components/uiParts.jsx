// ══════════════════════════════════════════════════════════════════
// uiParts.jsx  ―  ツリー編集系画面で共有する小さなUIパーツ
//   InputField / SectionLabel / ModalActionButtons /
//   BoardSection / MergeLinkList
// ══════════════════════════════════════════════════════════════════
import { useState } from "react";
import ShogiBoard from "../ShogiBoard";
import { BOARD_TEMPLATES } from "../data";
import { T, INPUT_STYLE, BTN_CANCEL_STYLE } from "../theme";

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

  // 盤面がまだ追加されていない場合: プレースホルダーのみ表示する
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
          <i className="ti ti-chess" style={{ fontSize: 24, color: T.gold }} />
          <span style={{ fontSize: T.fontSize.base, color: T.inkMid }}>タップして盤面を追加</span>
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
            onClick={() => setTmplOpen((v) => !v)}
            title="テンプレートから呼び出す"
            style={{
              ...toolbarBtnStyle(tmplOpen ? T.gold : T.inkMid, tmplOpen ? T.gold : T.inkLine),
              background: tmplOpen ? T.goldLight : "none",
            }}
          >
            <i className="ti ti-template" style={{ fontSize: 12 }} />テンプレート
          </button>

          {/* 非表示 */}
          <button onClick={onToggle} style={toolbarBtnStyle(T.gold)}>
            <i className="ti ti-minus" style={{ fontSize: 12 }} />非表示
          </button>

          {/* 元に戻す（編集開始時点の盤面に戻す） */}
          {canUndo && (
            <button onClick={onUndo} title="この画面を開いたときの盤面に戻す" style={toolbarBtnStyle(T.blue)}>
              <i className="ti ti-history" style={{ fontSize: 12 }} />元に戻す
            </button>
          )}

          {/* 盤面を削除 */}
          <button onClick={onDelete} style={toolbarBtnStyle(T.gray, T.inkLine)}>
            <i className="ti ti-trash" style={{ fontSize: 12 }} />盤面を削除
          </button>

          {/* 棋譜を削除 */}
          {kifu && kifu.length > 0 && (
            <button onClick={onKifuDelete} title="入力前の盤面に戻す" style={toolbarBtnStyle(T.gray, T.inkLine)}>
              <i className="ti ti-arrow-back-up" style={{ fontSize: 12 }} />棋譜を削除
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
            <i className="ti ti-copy" style={{ fontSize: 13 }} />
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
      <i className={`ti ${icon}`} style={{ fontSize: 14 }} />{label}
    </div>
  ) : (
    <div style={{ border: `0.5px solid ${T.inkLine}`, borderRadius: T.radius.sm, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: `0.5px solid ${T.inkLineFaint}`, background: T.goldLight }}>
        <span style={{ fontSize: T.fontSize.sm, color: T.inkMid }}>{pickLabel}</span>
        <button onClick={() => setPickerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: T.gray, fontSize: 13 }}>
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
          <i className="ti ti-arrow-merge" style={{ fontSize: 14, color: T.purple }} />
          <span style={{ fontSize: T.fontSize.base, color: T.ink, flex: 1 }}>{n.label}</span>
          <button onClick={() => onRemove(n.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.gray, fontSize: 14, padding: 2 }}>
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
