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
export function BoardSection({ boardVisible, boardData, stamps, handSente, handGote, parentBoard, parentLabel, onToggle, onChange, onDelete, onLoadTemplate, kifu, onKifuChange, onKifuDelete, allowBranch, onBranchFromHere }){
  const [tmplOpen, setTmplOpen] = useState(false);

  return (
    <div style={{ padding: "8px 16px 0" }}>
      {/* ヘッダー行 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: tmplOpen ? 0 : 8 }}>
        <SectionLabel>盤面</SectionLabel>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {/* テンプレートボタン */}
          <button
            onClick={() => setTmplOpen((v) => !v)}
            title="テンプレートから呼び出す"
            style={{
              fontSize: T.fontSize.md, padding: "4px 10px",
              borderRadius: T.radius.sm,
              border: `0.5px solid ${tmplOpen ? T.gold : T.inkLine}`,
              background: tmplOpen ? T.goldLight : "none",
              cursor: "pointer", color: tmplOpen ? T.gold : T.inkMid,
              fontFamily: T.fontSerif, display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <i className="ti ti-template" style={{ fontSize: 12 }} />テンプレート
          </button>
          <button
            onClick={onToggle}
            style={{
              fontSize:    T.fontSize.md,
              padding:     "4px 10px",
              borderRadius: T.radius.sm,
              border:      `0.5px solid ${T.gold}`,
              background:  "none",
              cursor:      "pointer",
              color:       T.gold,
              fontFamily:  T.fontSerif,
              display:     "flex",
              alignItems:  "center",
              gap:         4,
            }}
          >
            <i className={`ti ti-${boardVisible ? "minus" : "plus"}`} style={{ fontSize: 12 }} />
            {boardVisible ? "非表示" : "追加"}
          </button>
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

      {/* 非表示時: タップ誘導プレースホルダー */}
      {!boardVisible && (
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
      )}

      {/* 表示時: 継承バナー + 将棋盤 + 削除ボタン */}
      {boardVisible && (
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

          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6 }}>
            <button
              onClick={onDelete}
              style={{
                fontSize:   T.fontSize.md,
                color:      T.gray,
                background: "none",
                border:     "none",
                cursor:     "pointer",
                fontFamily: T.fontSerif,
                display:    "flex",
                alignItems: "center",
                gap:        4,
              }}
            >
              <i className="ti ti-trash" style={{ fontSize: 11 }} />盤面を削除
            </button>

            {kifu && kifu.length > 0 && (
              <button
                onClick={onKifuDelete}
                style={{
                  fontSize:   T.fontSize.md,
                  color:      T.gray,
                  background: "none",
                  border:     "none",
                  cursor:     "pointer",
                  fontFamily: T.fontSerif,
                  display:    "flex",
                  alignItems: "center",
                  gap:        4,
                }}
              >
                <i className="ti ti-arrow-back-up" style={{ fontSize: 11 }} />棋譜を削除（入力前の盤面に戻す）
              </button>
            )}
          </div>
        </div>
      )}
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

      {!pickerOpen ? (
        <div
          onClick={() => setPickerOpen(true)}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: T.radius.sm, border: `0.5px dashed ${T.purple}`, cursor: "pointer", color: T.purple, fontSize: T.fontSize.base }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#f3edf9")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <i className="ti ti-arrow-merge" style={{ fontSize: 14 }} />{addLabel}
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
                  onClick={() => onAdd(c.id)}
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
      )}
    </div>
  );
}
