// ══════════════════════════════════════════════════════════════════
// screensTree.jsx  ―  ツリー編集系画面
//
// 画面コンポーネント一覧:
//   TreeCard    … ツリー一覧の1行カード
//   TreeList    … ツリー一覧画面（ヘッダー + カード群 + モーダル管理）
//   MindMap     … SVGマインドマップ（ドラッグ操作・目次ドロワー付き）
//   NodeDetail  … ノード詳細編集画面
//   NewNode     … 新規ノード追加ウィザード（2ステップ）
//
// 内部コンポーネント（このファイル限定）:
//   InputField        … ラベル付きテキスト入力
//   BoardSection      … 将棋盤の表示/非表示トグルエリア
//   ModalActionButtons… モーダルのキャンセル/実行ボタン行
//   CreateTreeModal   … 新規ツリー作成モーダル
//   EditTreeModal     … ツリー編集モーダル
//   DeleteTreeModal   … ツリー削除確認モーダル
// ══════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from "react";
import ShogiBoard from "./ShogiBoard";
import {
  StatusChip, ApproachTag, MergeTag, Divider, BackBtn, Accordion,
} from "./components";
import {
  STATUS_META, APPROACH_META, INITIAL_BOARD, SUGGESTIONS,
} from "./data";
import { BADGE_DEFS, getLoginStats, getEarnedBadgeIds } from "./rewards";


// ══════════════════════════════════════════════════════════════════
// デザイントークン
// ══════════════════════════════════════════════════════════════════

/** アプリ全体で使う色・フォント・サイズの定数 */
const T = {
  // ── 色 ──────────────────────────────────────────
  ink:        "#1a0f00",          // メインテキスト（墨）
  inkMid:     "rgba(26,15,0,0.5)",// サブテキスト
  inkFaint:   "rgba(26,15,0,0.3)",// 極薄テキスト
  inkLine:    "rgba(26,15,0,0.18)",// ボーダー標準
  inkLineFaint:"rgba(26,15,0,0.08)",// ボーダー極薄

  gold:       "#a07840",          // アクセント（金）
  goldLight:  "#f0e8d4",          // アクセント背景
  goldBg:     "#f5edd8",          // カードアクティブ背景
  goldBgSub:  "#fde8cc",          // カードサブ背景
  cream:      "#faf4e8",          // 画面ベース背景

  blue:       "#1a5276",          // 自分の手・使用中
  blueBg:     "#d6eaf8",          // 使用中バッジ背景
  blueLine:   "rgba(26,82,118,0.2)",

  red:        "#A93226",          // 削除・警告
  redBg:      "#fdedec",          // 削除バッジ背景
  redDark:    "#7B3010",          // 相手の手

  brown:      "#854F0B",          // 局面の状況
  purple:     "#6B3FA0",          // マージノード

  gray:       "#B4B2A9",          // 非活性
  grayText:   "#5F5E5A",

  green:      "#3B6D11",          // 完成ステータス
  greenBg:    "#EAF3DE",

  // ── フォント ────────────────────────────────────
  fontSerif:  "'Noto Serif JP', serif",
  fontTitle:  "'Shippori Mincho B1', serif",

  // ── 角丸・サイズ ─────────────────────────────────
  radius:     { sm: 8, md: 10, lg: 12, xl: 20 },
  fontSize:   { xs: 9, sm: 10, md: 11, base: 12, lg: 13, xl: 14, xxl: 15, h: 16 },
};


// ══════════════════════════════════════════════════════════════════
// 共通スタイルオブジェクト
// ══════════════════════════════════════════════════════════════════

/** テキスト入力フィールドの基本スタイル */
const INPUT_STYLE = {
  width:       "100%",
  border:      `0.5px solid ${T.inkLine}`,
  borderRadius: T.radius.md,
  padding:     "11px 14px",
  fontSize:    T.fontSize.lg,
  color:       T.ink,
  background:  T.cream,
  fontFamily:  T.fontSerif,
  outline:     "none",
};

/** モーダル背景オーバーレイ（下揃え） */
const MODAL_OVERLAY_STYLE = {
  position:   "absolute",
  inset:      0,
  background: "rgba(26,15,0,0.5)",
  display:    "flex",
  alignItems: "flex-end",
  zIndex:     50,
};

/** モーダルのボトムシート本体 */
const MODAL_SHEET_STYLE = {
  width:        "100%",
  background:   T.cream,
  borderRadius: "20px 20px 0 0",
  padding:      "24px 20px 32px",
};

/** キャンセルボタン（モーダル共通） */
const BTN_CANCEL_STYLE = {
  flex:        1,
  padding:     12,
  borderRadius: T.radius.lg,
  border:      `0.5px solid ${T.inkLine}`,
  background:  "transparent",
  fontSize:    T.fontSize.lg,
  cursor:      "pointer",
  fontFamily:  T.fontSerif,
  color:       T.inkMid,
};


// ══════════════════════════════════════════════════════════════════
// ユーティリティ
// ══════════════════════════════════════════════════════════════════

/**
 * タグ文字列（カンマ・読点・スペース区切り）を配列に変換する
 * @example parseTags("振り飛車、中飛車") → ["振り飛車", "中飛車"]
 */
const parseTags = (str) =>
  str.split(/[,、\s]+/).map((s) => s.trim()).filter(Boolean);

/**
 * 将棋盤データをディープコピーする
 * board が null の場合は INITIAL_BOARD のコピーを返す
 */
const cloneBoard = (board) =>
  JSON.parse(JSON.stringify(board ?? INITIAL_BOARD));


// ══════════════════════════════════════════════════════════════════
// 内部共通パーツ
// ══════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────
// InputField: ラベル付きテキスト入力フィールド
// ──────────────────────────────────────────
function InputField({ label, value, onChange, placeholder }) {
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
function SectionLabel({ children, style }) {
  return (
    <div style={{ fontSize: T.fontSize.md, color: T.inkMid, ...style }}>
      {children}
    </div>
  );
}

// ──────────────────────────────────────────
// ModalActionButtons: モーダル下部のボタン行
// ──────────────────────────────────────────
function ModalActionButtons({ onCancel, onConfirm, confirmLabel, disabled, danger = false }) {
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
function BoardSection({ boardVisible, boardData, stamps, handSente, handGote, parentBoard, parentLabel, onToggle, onChange, onDelete, readOnly = false }){
  return (
    <div style={{ padding: "8px 16px 0" }}>
      {/* ヘッダー行 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <SectionLabel>盤面{readOnly && <span style={{ color: T.purple, fontSize: T.fontSize.sm, marginLeft: 6 }}>（棋譜再生中）</span>}</SectionLabel>
        {!readOnly && <button
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
        </button>}
      </div>

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
          {parentBoard && !readOnly && (
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
  readOnly={readOnly}
  onChange={({ board, stamps: s, handSente: hs, handGote: hg }) => onChange(board, s, hs, hg)}
/>

          {!readOnly && <button
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
              marginTop:  6,
            }}
          >
            <i className="ti ti-trash" style={{ fontSize: 11 }} />盤面を削除
          </button>}
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════
// モーダルコンポーネント群
// ══════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────
// CreateTreeModal: 新規ツリー作成
// ──────────────────────────────────────────
function CreateTreeModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), parseTags(tags));
    onClose();
  };

  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={onClose}>
      <div style={MODAL_SHEET_STYLE} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink, marginBottom: 20 }}>
          新しいツリーを作成
        </div>
        <InputField label="戦法名"              value={name} onChange={setName} placeholder="例：中飛車" />
        <InputField label="タグ（カンマ区切り）" value={tags} onChange={setTags} placeholder="例：振り飛車, 中飛車" />
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
function EditTreeModal({ tree, onClose, onSave, onPublish, onUnpublish }) {
  const [name,         setName]         = useState(tree.name);
  const [tags,         setTags]         = useState((tree.tags || []).join("、"));
  const [active,       setActive]       = useState(tree.active);
  const [saving,       setSaving]       = useState(false);
  const [publishing,   setPublishing]   = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [publishError, setPublishError] = useState("");

  const handlePublish = async () => {
    if (publishing || typeof onPublish !== "function") return;
    setPublishing(true);
    setPublishError("");
    try {
      await onPublish(tree.id);
      onClose();
    } catch (e) {
      console.error("公開に失敗しました", e);
      setPublishError("公開に失敗しました。もう一度お試しください。");
    } finally {
      setPublishing(false);
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

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave(tree.id, { name: name.trim(), tags: parseTags(tags), active });
    setSaving(false);
    onClose();
  };

  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={onClose}>
      <div style={MODAL_SHEET_STYLE} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink, marginBottom: 20 }}>
          ツリーを編集
        </div>

        <InputField label="戦法名"              value={name} onChange={setName} placeholder="例：中飛車" />
        <InputField label="タグ（カンマ区切り）" value={tags} onChange={setTags} placeholder="例：振り飛車, 中飛車" />

        {/* ステータス切り替え */}
        <div style={{ marginBottom: 20 }}>
          <SectionLabel style={{ marginBottom: 8 }}>ステータス</SectionLabel>
          <div style={{ display: "flex", gap: 8 }}>
            {[["使用中", true], ["休止中", false]].map(([label, val]) => {
              const selected = active === val;
              return (
                <div
                  key={label}
                  onClick={() => setActive(val)}
                  style={{
                    flex:       1,
                    textAlign:  "center",
                    padding:    "9px",
                    borderRadius: T.radius.md,
                    cursor:     "pointer",
                    fontSize:   T.fontSize.lg,
                    fontFamily: T.fontSerif,
                    transition: "all 0.15s",
                    border:     selected ? `1.5px solid ${T.gold}`  : `0.5px solid ${T.inkLine}`,
                    background: selected ? T.goldLight               : T.cream,
                    color:      selected ? T.gold                    : T.inkMid,
                    fontWeight: selected ? 600                       : 400,
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
          <div style={{ fontSize: T.fontSize.sm, color: T.red, marginBottom: 8, textAlign: "center" }}>
            {publishError}
          </div>
        )}
        {!tree.is_public ? (
          <button
            onClick={handlePublish}
            disabled={publishing || typeof onPublish !== "function"}
            style={{
              width:          "100%",
              padding:        11,
              borderRadius:   T.radius.lg,
              border:         `0.5px solid ${T.green}`,
              background:     T.greenBg,
              color:          T.green,
              fontSize:       T.fontSize.lg,
              fontFamily:     T.fontSerif,
              fontWeight:     600,
              cursor:         publishing ? "default" : "pointer",
              marginBottom:   10,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              gap:            6,
            }}
          >
            <i className="ti ti-world" style={{ fontSize: 14 }} />
            {publishing ? "公開中..." : "このツリーを公開する"}
          </button>
        ) : (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: T.fontSize.md, color: T.green, padding: "4px 0 8px" }}>
              <i className="ti ti-world-check" style={{ fontSize: 13 }} /> 公開中
            </div>
            <button
              onClick={handleUnpublish}
              disabled={unpublishing || typeof onUnpublish !== "function"}
              style={{
                width:          "100%",
                padding:        9,
                borderRadius:   T.radius.lg,
                border:         `0.5px solid ${T.inkLine}`,
                background:     "transparent",
                color:          T.inkMid,
                fontSize:       T.fontSize.base,
                fontFamily:     T.fontSerif,
                cursor:         unpublishing ? "default" : "pointer",
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                gap:            6,
              }}
            >
              <i className="ti ti-world-off" style={{ fontSize: 13 }} />
              {unpublishing ? "取り消し中..." : "公開を取り消す"}
            </button>
          </div>
        )}

        <ModalActionButtons
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel={saving ? "保存中..." : "保存する"}
          disabled={!name.trim() || saving}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────
// DeleteTreeModal: ツリー削除確認
// ──────────────────────────────────────────
function DeleteTreeModal({ tree, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    setDeleting(true);
    await onConfirm(tree.id);
    setDeleting(false);
    onClose();
  };

  return (
    <div
      style={{
        position:       "absolute",
        inset:          0,
        background:     "rgba(26,15,0,0.5)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        zIndex:         50,
        padding:        "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{ width: "100%", maxWidth: 360, background: T.cream, borderRadius: T.radius.xl, padding: "28px 24px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ゴミ箱アイコン */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 24, background: T.redBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className="ti ti-trash" style={{ fontSize: 22, color: T.red }} />
          </div>
        </div>

        <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.xxl, color: T.ink, textAlign: "center", marginBottom: 8 }}>
          「{tree.name}」を削除しますか？
        </div>
        <div style={{ fontSize: T.fontSize.base, color: "rgba(26,15,0,0.45)", textAlign: "center", marginBottom: 24, fontFamily: T.fontSerif, lineHeight: 1.7 }}>
          ツリーと全ノードが完全に削除されます。<br />この操作は取り消せません。
        </div>

        <ModalActionButtons
          onCancel={onClose}
          onConfirm={handleConfirm}
          confirmLabel={deleting ? "削除中..." : "削除する"}
          disabled={deleting}
          danger
        />
      </div>
    </div>
  );
}


// ──────────────────────────────────────────
// QuickMemoModal: ツリーの「ひとことメモ」編集
// ──────────────────────────────────────────
function QuickMemoModal({ tree, onClose, onSave }) {
  const [text,   setText]   = useState(tree.quickMemo || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(tree.id, text.trim()); } finally { setSaving(false); onClose(); }
  };

  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={onClose}>
      <div style={MODAL_SHEET_STYLE} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink, marginBottom: 6 }}>
          ひとことメモ
        </div>
        <div style={{ fontSize: T.fontSize.md, color: T.inkMid, marginBottom: 14, lineHeight: 1.6 }}>
          ノードと関係なく、ふと思ったことをさっと書き留められます。
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="例：終盤の3一玉型、もう少し研究したい"
          rows={4}
          autoFocus
          style={{ width: "100%", border: `0.5px solid ${T.inkLine}`, borderRadius: T.radius.md, padding: "11px 14px", fontSize: T.fontSize.lg, color: T.ink, background: T.cream, resize: "none", fontFamily: T.fontSerif, lineHeight: 1.7, outline: "none", marginBottom: 16 }}
          onFocus={(e) => (e.target.style.borderColor = T.gold)}
          onBlur={(e)  => (e.target.style.borderColor = T.inkLine)}
        />
        <ModalActionButtons
          onCancel={onClose}
          onConfirm={handleSave}
          confirmLabel={saving ? "保存中..." : "保存する"}
          disabled={saving}
        />
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════
// TreeCard: ツリー一覧の1行カード
// ══════════════════════════════════════════════════════════════════
export function TreeCard({ tree, onOpen, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleMenuToggle = (e) => { e.stopPropagation(); setMenuOpen((v) => !v); };
  const handleEdit       = (e) => { e.stopPropagation(); setMenuOpen(false); onEdit(tree); };
  const handleDelete     = (e) => { e.stopPropagation(); setMenuOpen(false); onDelete(tree); };

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
        {/* 1行目: 名前 + ステータスバッジ + 公開バッジ + メニューボタン */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: T.fontSize.xxl, fontWeight: 600, color: T.ink, fontFamily: T.fontTitle, flex: 1 }}>
            {tree.name}
          </span>

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

          <button
            onClick={handleMenuToggle}
            style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: 16, padding: "2px 4px", borderRadius: 6, lineHeight: 1 }}
          >
            <i className="ti ti-dots-vertical" />
          </button>
        </div>

        {/* 2行目: タグ + 更新日 */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {(tree.tags || []).map((tag) => (
            <span key={tag} style={{ fontSize: T.fontSize.sm, padding: "2px 7px", borderRadius: T.radius.sm, background: "rgba(26,15,0,0.06)", color: T.inkMid, fontFamily: T.fontSerif }}>
              {tag}
            </span>
          ))}
          <span style={{ fontSize: T.fontSize.sm, color: T.inkFaint, marginLeft: "auto" }}>
            {new Date(tree.updated_at).toLocaleDateString("ja-JP")}
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
              <i className="ti ti-pencil" style={{ fontSize: 14, color: T.gold }} />編集
            </div>
            <div style={{ height: "0.5px", background: T.inkLineFaint }} />
            <div
              onClick={handleDelete}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 16px", fontSize: T.fontSize.lg, cursor: "pointer", color: T.red, fontFamily: T.fontSerif }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.redBg)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <i className="ti ti-trash" style={{ fontSize: 14 }} />削除
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
export function TreeList({ trees, profile, onOpen, onPublic, onNewTree, onSignOut, onDeleteTree, onEditTree, onPublish, onUnpublish, onOpenRewards }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editTarget,      setEditTarget]      = useState(null);
  const [deleteTarget,    setDeleteTarget]    = useState(null);

  const activeTrees   = trees.filter((t) =>  t.active);
  const inactiveTrees = trees.filter((t) => !t.active);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.cream }}>
      {/* ── ヘッダー ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px 12px", borderBottom: `0.5px solid rgba(26,15,0,0.12)` }}>
        <div>
          <div style={{ fontFamily: T.fontTitle, fontSize: 22, color: T.ink, letterSpacing: "0.2em" }}>
            ね<span style={{ color: T.gold }}>っ</span>こ
          </div>
          {profile && (
            <div style={{ fontSize: T.fontSize.md, color: T.inkFaint, marginTop: 2 }}>
              {profile.display_name || profile.username}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {onOpenRewards && (
            <button onClick={onOpenRewards} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: 20, padding: 2 }} title="ご褒美">
              <i className="ti ti-award" />
            </button>
          )}
          <button onClick={onPublic} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: 20, padding: 2 }}>
            <i className="ti ti-world" />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{ background: T.gold, border: "none", cursor: "pointer", color: T.cream, fontSize: T.fontSize.lg, padding: "6px 14px", borderRadius: T.radius.md, fontFamily: T.fontSerif, display: "flex", alignItems: "center", gap: 4 }}
          >
            <i className="ti ti-plus" style={{ fontSize: 13 }} /> 新規
          </button>
          <button onClick={onSignOut} style={{ background: "none", border: "none", cursor: "pointer", color: T.inkFaint, fontSize: 18, padding: 2 }}>
            <i className="ti ti-logout" />
          </button>
        </div>
      </div>

      {/* ── リスト ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
        {trees.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: T.inkFaint, fontSize: T.fontSize.lg }}>
            <i className="ti ti-plant" style={{ fontSize: 40, display: "block", marginBottom: 12 }} />
            ツリーがまだありません<br />
            <span style={{ fontSize: T.fontSize.md }}>「新規」から最初のツリーを作りましょう</span>
          </div>
        ) : (
          <>
            {activeTrees.length > 0 && (
              <>
                <div style={{ fontSize: T.fontSize.sm, color: "rgba(26,15,0,0.4)", letterSpacing: "0.1em", marginBottom: 8 }}>使用中</div>
                {activeTrees.map((t) => (
                  <TreeCard key={t.id} tree={t} onOpen={onOpen} onEdit={setEditTarget} onDelete={setDeleteTarget} />
                ))}
              </>
            )}
            {inactiveTrees.length > 0 && (
              <>
                <div style={{ fontSize: T.fontSize.sm, color: "rgba(26,15,0,0.4)", letterSpacing: "0.1em", marginBottom: 8, marginTop: activeTrees.length > 0 ? 16 : 0 }}>休止中</div>
                {inactiveTrees.map((t) => (
                  <TreeCard key={t.id} tree={t} onOpen={onOpen} onEdit={setEditTarget} onDelete={setDeleteTarget} />
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
          onCreate={(name, tags) => onNewTree(name, tags)}
        />
      )}
      {editTarget && (
        <EditTreeModal
          tree={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={onEditTree}
          onPublish={onPublish}
          onUnpublish={onUnpublish}
        />
      )}
      {deleteTarget && (
        <DeleteTreeModal
          tree={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={onDeleteTree}
        />
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════
// MindMap: SVGマインドマップ
// ══════════════════════════════════════════════════════════════════

/** ノードの矩形サイズ */
const NODE_W = 110;
const NODE_H = 38;

/** ステータス別のノード枠線・テキスト色 */
const STATUS_NODE = {
  done: { stroke: T.green,  text: "#27500A" },
  wip:  { stroke: T.redDark, text: T.redDark },
  todo: { stroke: T.gray,   text: T.grayText, dashed: true },
};

/** アプローチ種別ごとのエッジ色 */
const APPROACH_LINE_COLOR = {
  "自分の戦法": T.blue,
  "相手の戦法": T.redDark,
  "局面の状況": T.brown,
};

/**
 * ツリー構造からSVG描画用の座標・エッジ情報を計算する
 *
 * ロジック:
 *   - 葉ノードを左から順番に配置（xCounter）
 *   - 親ノードは子ノード群の中央に配置
 *   - エッジは親の下端→子の上端へのベジェ曲線
 *
 * @param {Object} nodes  - ノードID→ノードオブジェクトのマップ
 * @param {string} rootId - ルートノードのID
 * @returns {{ positions: Object, edges: Array }}
 */
function layoutTree(nodes, rootId) {
  const positions = {};
  const edges     = [];
  let xCounter    = 0;

  /** 再帰的に各ノードの x/y 座標を割り当てる */
  function assignPositions(id, depth) {
    const node = nodes[id];
    if (!node) return;

    const children = (node.childIds || []).filter((cid) => nodes[cid]);

    if (children.length === 0) {
      // 葉ノード: 左から順に配置
      positions[id] = { x: xCounter * (NODE_W + 16), y: depth * (NODE_H + 40) };
      xCounter++;
      return;
    }

    // 中間ノード: 子を先に配置してから中央に合わせる
    const startX = xCounter;
    children.forEach((cid) => assignPositions(cid, depth + 1));
    const endX  = xCounter - 1;
    const midX  = ((startX + endX) / 2) * (NODE_W + 16);
    positions[id] = { x: midX, y: depth * (NODE_H + 40) };
  }

  /** 再帰的にエッジ情報を構築する */
  function buildEdges(id) {
    const node = nodes[id];
    if (!node) return;

    (node.childIds || []).forEach((cid) => {
      const child   = nodes[cid];
      const fromPos = positions[id];
      const toPos   = positions[cid];
      if (!child || !fromPos || !toPos) return;

      edges.push({
        from:    id,
        to:      cid,
        x1:      fromPos.x + NODE_W / 2,  // 親ノードの下辺中央
        y1:      fromPos.y + NODE_H,
        x2:      toPos.x   + NODE_W / 2,  // 子ノードの上辺中央
        y2:      toPos.y,
        color:   APPROACH_LINE_COLOR[child.approachType] || T.redDark,
        dashed:  child.approachType === "相手の戦法" || child.approachType === "局面の状況",
        isMerge: false,
      });

      buildEdges(cid);
    });
  }

  assignPositions(rootId, 0);
  buildEdges(rootId);

  return { positions, edges };
}

export function MindMap({ tree, onNodeSelect, onBack, onUpdateQuickMemo }) {
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [canvasOffset, setCanvasOffset] = useState({ x: 20, y: 20 });
  const [dragging,     setDragging]     = useState(false);
  const [memoOpen,     setMemoOpen]     = useState(false);
  const dragStart = useRef(null);

  const { nodes } = tree;
  const rootId    = tree.rootId ?? Object.values(nodes).find((n) => n.isRoot)?.id ?? null;

  const { positions, edges } = rootId
    ? layoutTree(nodes, rootId)
    : { positions: {}, edges: [] };

  // 合流リンク（ノード→合流先ノードの破線）
  const mergeEdges = Object.values(nodes)
    .filter((n) => n.mergeTargetId && positions[n.id] && positions[n.mergeTargetId])
    .map((n) => {
      const fromPos = positions[n.id];
      const toPos   = positions[n.mergeTargetId];
      return {
        x1: fromPos.x + NODE_W / 2, y1: fromPos.y + NODE_H / 2,
        x2: toPos.x   + NODE_W / 2, y2: toPos.y   + NODE_H / 2,
      };
    });

  // キャンバスサイズ = 全ノード座標の最大値 + 余白
  const posValues = Object.values(positions);
  const totalW = posValues.length ? Math.max(...posValues.map((p) => p.x)) + NODE_W + 60 : NODE_W + 60;
  const totalH = posValues.length ? Math.max(...posValues.map((p) => p.y)) + NODE_H + 80 : NODE_H + 80;

  // ── ドラッグ操作（マウス） ──────────────────────
  const onMouseDown = useCallback((e) => {
    if (e.target.closest(".node-g")) return;
    setDragging(true);
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: canvasOffset.x, oy: canvasOffset.y };
  }, [canvasOffset]);

  const onMouseMove = useCallback((e) => {
    if (!dragging || !dragStart.current) return;
    setCanvasOffset({
      x: dragStart.current.ox + e.clientX - dragStart.current.mx,
      y: dragStart.current.oy + e.clientY - dragStart.current.my,
    });
  }, [dragging]);

  const onMouseUp = useCallback(() => setDragging(false), []);

  // ── ドラッグ操作（タッチ） ─────────────────────
  const onTouchStart = useCallback((e) => {
    if (e.target.closest(".node-g")) return;
    const t = e.touches[0];
    dragStart.current = { mx: t.clientX, my: t.clientY, ox: canvasOffset.x, oy: canvasOffset.y };
  }, [canvasOffset]);

  const onTouchMove = useCallback((e) => {
    if (!dragStart.current) return;
    e.preventDefault();
    const t = e.touches[0];
    setCanvasOffset({
      x: dragStart.current.ox + t.clientX - dragStart.current.mx,
      y: dragStart.current.oy + t.clientY - dragStart.current.my,
    });
  }, []);

  /** 目次からノードを選んだとき、そのノードが画面中央に来るようにオフセットを調整する */
  const jumpToNode = useCallback((nodeId) => {
    setDrawerOpen(false);
    const pos = positions[nodeId];
    if (!pos) return;
    setCanvasOffset({
      x: 140 - pos.x - NODE_W / 2,
      y: 200 - pos.y - NODE_H / 2,
    });
  }, [positions]);

  // エッジ色→マーカーインデックスのマッピング
  const MARKER_COLORS = [T.blue, T.redDark, T.brown, T.purple];
  const markerIndex = (color) => {
    const i = MARKER_COLORS.indexOf(color);
    return i >= 0 ? i : 3;
  };

  const rootNode = rootId ? nodes[rootId] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.cream, position: "relative" }}>
      {/* ── トップバー ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 14px 10px", borderBottom: `0.5px solid ${T.inkLine}` }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: 18, padding: 2, lineHeight: 1 }}>
          <i className="ti ti-chevron-left" />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.xl, color: T.ink }}>{tree.name}</div>
        </div>
        {/* ひとことメモ */}
        {onUpdateQuickMemo && (
          <button
            onClick={() => setMemoOpen(true)}
            style={{ background: "none", border: "none", cursor: "pointer", color: tree.quickMemo ? T.gold : T.gray, fontSize: 18, padding: "6px 4px", lineHeight: 1, position: "relative" }}
            title="ひとことメモ"
          >
            <i className="ti ti-note" />
            {tree.quickMemo && (
              <span style={{ position: "absolute", top: 4, right: 1, width: 6, height: 6, borderRadius: "50%", background: T.gold }} />
            )}
          </button>
        )}
        {/* 目次ドロワーを開く3点ドット */}
        <div
          onClick={() => setDrawerOpen(true)}
          style={{ display: "flex", flexDirection: "column", gap: 3.5, cursor: "pointer", padding: "6px 4px" }}
        >
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ display: "block", width: 3.5, height: 3.5, borderRadius: "50%", background: T.gold }} />
          ))}
        </div>
      </div>

      {/* ── マップエリア ── */}
      <div
        style={{ flex: 1, overflow: "hidden", position: "relative", cursor: dragging ? "grabbing" : "grab", background: T.cream }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={() => { dragStart.current = null; }}
      >
        {/* パンするキャンバス */}
        <div style={{ position: "absolute", left: canvasOffset.x, top: canvasOffset.y, transition: dragging ? "none" : "left 0.35s, top 0.35s" }}>
          <svg width={totalW} height={totalH} style={{ overflow: "visible" }}>

            {/* 矢印マーカー定義 */}
            <defs>
              {MARKER_COLORS.map((color, i) => (
                <marker key={i} id={`arr${i}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="4" markerHeight="4" orient="auto">
                  <path d="M1 1.5L6.5 4L1 6.5" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </marker>
              ))}
            </defs>

            {/* 合流リンク（ノード中心同士を結ぶ破線・矢印なし） */}
            {mergeEdges.map((edge, i) => {
              const midX = (edge.x1 + edge.x2) / 2;
              const midY = (edge.y1 + edge.y2) / 2 - 26;
              const d    = `M${edge.x1},${edge.y1} Q${midX},${midY} ${edge.x2},${edge.y2}`;
              return (
                <path
                  key={`merge-${i}`} d={d} fill="none"
                  stroke={T.purple} strokeWidth={1.2}
                  strokeDasharray="3 3" opacity={0.6}
                />
              );
            })}

            {/* エッジ（ベジェ曲線） */}
            {edges.map((edge, i) => {
              const midY = (edge.y1 + edge.y2) / 2;
              const d    = `M${edge.x1},${edge.y1} C${edge.x1},${midY} ${edge.x2},${midY} ${edge.x2},${edge.y2}`;
              return (
                <path
                  key={i} d={d} fill="none"
                  stroke={edge.color} strokeWidth={1.2}
                  strokeDasharray={edge.dashed ? "5 2.5" : "none"}
                  markerEnd={`url(#arr${markerIndex(edge.color)})`}
                />
              );
            })}

            {/* ノード */}
            {Object.entries(positions).map(([id, pos]) => {
              const node   = nodes[id];
              if (!node) return null;

              const isRoot  = id === rootId;
              const s       = STATUS_NODE[node.status] || STATUS_NODE.todo;
              const isMine  = node.approachType === "自分の戦法";

              // ルート・自分・相手でノード色を変える
              const nodeColor = isRoot
                ? { fill: T.goldLight, stroke: T.gold    }
                : isMine
                ? { fill: T.blueBg,   stroke: T.blue    }
                : { fill: T.goldBgSub, stroke: T.blue   };

              return (
                <g key={id} className="node-g" onClick={() => onNodeSelect(id)} style={{ cursor: "pointer" }}>
                  <rect
                    x={pos.x} y={pos.y} width={NODE_W} height={NODE_H}
                    rx={isRoot ? 9 : 6}
                    fill={nodeColor.fill}
                    stroke={node.isMergeTarget ? T.purple : nodeColor.stroke}
                    strokeWidth={isRoot || node.isMergeTarget ? 1.5 : 0.9}
                    strokeDasharray={s.dashed ? "5 2.5" : "none"}
                  />

                  {/* ステータスドット（ルート・todo 以外） */}
                  {!isRoot && node.status !== "todo" && (
                    <circle cx={pos.x + NODE_W - 8} cy={pos.y + 7} r={3.5} fill={STATUS_META[node.status]?.dot || T.gray} />
                  )}

                  {/* ノード名テキスト */}
                  <text
                    x={pos.x + NODE_W / 2}
                    y={pos.y + (isRoot ? NODE_H / 2 - 5 : NODE_H / 2)}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={isRoot ? 14 : 11}
                    fontWeight={isRoot ? 600 : 500}
                    fill={isRoot ? "#3d2000" : s.text}
                    fontFamily={T.fontSerif}
                  >
                    {node.label}
                  </text>

                  {/* ルートノードのサブラベル */}
                  {isRoot && (
                    <text
                      x={pos.x + NODE_W / 2} y={pos.y + NODE_H / 2 + 10}
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={9} fill={T.gold} fontFamily={T.fontSerif}
                    >
                      おおもとの戦法
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* 目次ドロワー背景オーバーレイ */}
        {drawerOpen && (
          <div
            onClick={() => setDrawerOpen(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(26,15,0,0.38)", zIndex: 20 }}
          />
        )}

        {/* 目次ドロワー */}
        <div style={{
          position:   "absolute",
          top: 0, right: 0, bottom: 0,
          width:      235,
          background: T.cream,
          borderLeft: `0.5px solid ${T.inkLine}`,
          transform:  drawerOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
          zIndex:     21,
          display:    "flex",
          flexDirection: "column",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 14px 10px", borderBottom: `0.5px solid ${T.inkLine}`, flexShrink: 0 }}>
            <span style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.xl, color: T.ink, letterSpacing: "0.2em" }}>目次</span>
            <button onClick={() => setDrawerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: 16 }}>
              <i className="ti ti-x" />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <Accordion nodes={nodes} rootChildIds={rootNode?.childIds || []} onSelect={jumpToNode} />
          </div>
        </div>
      </div>

      {/* ── 凡例 ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: "8px 16px", borderTop: `0.5px solid ${T.inkLine}`, background: T.goldLight }}>
        {[
          { line: T.blue,    label: "自分の手" },
          { line: T.redDark, label: "相手の手" },
          { line: T.purple,  label: "合流", dashed: true },
        ].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: T.fontSize.sm, color: T.inkMid }}>
            <div style={{ width: 18, height: 2, borderRadius: 1, background: l.dashed ? "transparent" : l.line, borderTop: l.dashed ? `1.5px dashed ${l.line}` : "none" }} />{l.label}
          </div>
        ))}
        {[
          { color: T.green,   label: "完成" },
          { color: T.brown,   label: "研究中" },
          { color: T.gray,    label: "未定", dashed: true },
        ].map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: T.fontSize.sm, color: T.inkMid }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, border: s.dashed ? "1px dashed #888" : undefined }} />{s.label}
          </div>
        ))}
      </div>

      {memoOpen && (
        <QuickMemoModal
          tree={tree}
          onClose={() => setMemoOpen(false)}
          onSave={onUpdateQuickMemo}
        />
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════
// NodeDetail: ノード詳細編集画面
// ══════════════════════════════════════════════════════════════════
export function NodeDetail({ tree, nodeId, onBack, onNodeSelect, onNewNode, onUpdate, onDeleteNode, onSetMergeTarget, onClearMergeTarget }) {
  const node = tree.nodes[nodeId];

  const [memo,         setMemo]         = useState("");
  const [status,       setStatus]       = useState("todo");
  const [boardVisible, setBoardVisible] = useState(false);
  const [boardData,    setBoardData]    = useState(null);
  const [stamps,       setStamps]       = useState([]);
  const [handSente,   setHandSente]   = useState({p:0,l:0,n:0,s:0,g:0,b:0,r:0});
  const [handGote,    setHandGote]    = useState({p:0,l:0,n:0,s:0,g:0,b:0,r:0});

  // ── 棋譜記録 ──────────────────────────────────
  const [kifu,         setKifu]         = useState([]);
  const [recording,    setRecording]    = useState(false);
  const [viewIndex,    setViewIndex]    = useState(null); // null = ライブ盤面

  // ── 合流リンク ────────────────────────────────
  const [mergePickerOpen, setMergePickerOpen] = useState(false);

  // nodeId が変わったらフォームをリセット
  useEffect(() => {
    if (node) {
      setMemo(node.memo || "");
      setStatus(node.status || "todo");
      setBoardVisible(!!node.board);
      setBoardData(node.board || null);
      setStamps(node.stamps || []);
      setHandSente(node.handSente || {p:0,l:0,n:0,s:0,g:0,b:0,r:0});
      setHandGote(node.handGote   || {p:0,l:0,n:0,s:0,g:0,b:0,r:0});
      setKifu(node.kifu || []);
      setRecording(false);
      setViewIndex(null);
      setMergePickerOpen(false);
    }
  }, [nodeId, node]);

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

  /** 盤面の変更を受け取る。記録中は「指し手」とみなせる変化のみ棋譜に追加する */
  const handleBoardChange = (board, s, hs, hg) => {
    const moved =
      JSON.stringify(board) !== JSON.stringify(boardData) ||
      JSON.stringify(hs)    !== JSON.stringify(handSente)  ||
      JSON.stringify(hg)    !== JSON.stringify(handGote);

    let nextKifu = kifu;
    if (recording && moved) {
      nextKifu = [...kifu, { board: cloneBoard(board), handSente: { ...hs }, handGote: { ...hg } }];
      setKifu(nextKifu);
    }

    setBoardData(board);
    setStamps(s);
    setHandSente(hs);
    setHandGote(hg);
    onUpdate(nodeId, { board, stamps: s, handSente: hs, handGote: hg, kifu: nextKifu });
  };

  // ── 棋譜記録の操作 ────────────────────────────
  const handleStartRecording = () => {
    const startSnap = { board: cloneBoard(boardData), handSente: { ...handSente }, handGote: { ...handGote } };
    setKifu([startSnap]);
    setRecording(true);
    setViewIndex(null);
    onUpdate(nodeId, { kifu: [startSnap] });
  };
  const handleStopRecording = () => setRecording(false);
  const handleResetKifu = () => {
    setKifu([]);
    setRecording(false);
    setViewIndex(null);
    onUpdate(nodeId, { kifu: [] });
  };
  const handleStartViewing = () => { setRecording(false); setViewIndex(0); };
  const handleExitViewing  = () => setViewIndex(null);
  const handlePrevMove = () => setViewIndex((i) => (i === null ? null : Math.max(0, i - 1)));
  const handleNextMove = () => setViewIndex((i) => (i === null ? null : Math.min(kifu.length - 1, i + 1)));

  const viewing        = viewIndex !== null;
  const displayBoard     = viewing ? (kifu[viewIndex]?.board     ?? boardData) : boardData;
  const displayHandSente = viewing ? (kifu[viewIndex]?.handSente ?? handSente) : handSente;
  const displayHandGote  = viewing ? (kifu[viewIndex]?.handGote  ?? handGote)  : handGote;

  // ── 合流リンクの操作 ──────────────────────────
  const mergeTargetNode  = node.mergeTargetId ? tree.nodes[node.mergeTargetId] : null;
  const mergeSourceNodes = Object.values(tree.nodes).filter((n) => n.mergeTargetId === nodeId);

  const handleSelectMergeTarget = async (targetId) => {
    setMergePickerOpen(false);
    await onSetMergeTarget?.(nodeId, targetId);
  };
  const handleClearMerge = async () => {
    await onClearMergeTarget?.(nodeId);
  };

  /** 変更を保存してから画面遷移する（保存忘れ防止） */
 const saveAndNavigate = async (navigateFn) => {
    await onUpdate(nodeId, {
      status,
      memo,
      board:  boardVisible ? boardData : null,
      stamps: boardVisible ? stamps    : [],
    });
    navigateFn();
  };

  /** 子孫IDを再帰的に収集してノード削除 */
  const [deleteConfirm, setDeleteConfirm] = useState(false);

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
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.cream }}>
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
        {/* アプローチタグ */}
        {node.approachType && (
          <div style={{ padding: "8px 16px 0" }}>
            <ApproachTag type={node.approachType} />
          </div>
        )}

        {/* ── ステータス ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: `0.5px solid ${T.inkLineFaint}` }}>
          <SectionLabel>ステータス</SectionLabel>
          <div style={{ display: "flex", gap: 6 }}>
            {["done", "wip", "todo"].map((s) => (
              <StatusChip key={s} status={s} active={status === s} onClick={() => setStatus(s)} />
            ))}
          </div>
        </div>

        {/* ── メモ ── */}
        <div style={{ padding: "10px 16px 0" }}>
          <SectionLabel style={{ marginBottom: 6 }}>メモ</SectionLabel>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="気づき・方針・手順のポイントなど"
            rows={4}
            style={{ width: "100%", border: `0.5px solid ${T.inkLine}`, borderRadius: T.radius.sm, padding: "10px 12px", fontSize: T.fontSize.base, color: T.ink, background: T.cream, resize: "none", fontFamily: T.fontSerif, lineHeight: 1.7, outline: "none" }}
            onFocus={(e) => (e.target.style.borderColor = T.gold)}
            onBlur={(e)  => (e.target.style.borderColor = T.inkLine)}
          />
        </div>

        <Divider style={{ margin: "10px 0 0" }} />

        {/* ── 盤面 ── */}
        <BoardSection
          boardVisible={boardVisible}
          boardData={displayBoard}
          stamps={stamps}
          parentBoard={parent?.board}
          parentLabel={parent?.label}
          onToggle={handleToggleBoard}
          handSente={displayHandSente}
          handGote={displayHandGote}
          readOnly={viewing}
          onChange={handleBoardChange}
          onDelete={() => { setBoardData(null); setStamps([]); setBoardVisible(false); setKifu([]); setRecording(false); setViewIndex(null); onUpdate(nodeId, { kifu: [] }); }}
        />

        {boardVisible && boardData && (
          <KifuControls
            kifu={kifu}
            recording={recording}
            viewing={viewing}
            viewIndex={viewIndex}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            onResetKifu={handleResetKifu}
            onStartViewing={handleStartViewing}
            onExitViewing={handleExitViewing}
            onPrev={handlePrevMove}
            onNext={handleNextMove}
          />
        )}

        <Divider />

        {/* ── 合流 ── */}
        <div style={{ padding: "10px 16px" }}>
          <SectionLabel style={{ marginBottom: 8 }}>合流</SectionLabel>

          {mergeTargetNode ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                onClick={() => saveAndNavigate(() => onNodeSelect(mergeTargetNode.id))}
                style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: T.radius.sm, border: `0.5px solid ${T.purple}55`, background: "#f6f0fb", cursor: "pointer" }}
              >
                <i className="ti ti-git-merge" style={{ fontSize: 14, color: T.purple }} />
                <span style={{ fontSize: T.fontSize.base, color: T.ink, flex: 1 }}>「{mergeTargetNode.label}」に合流</span>
                <i className="ti ti-chevron-right" style={{ fontSize: 14, color: T.gray }} />
              </div>
              <button
                onClick={handleClearMerge}
                style={{ padding: "9px 12px", borderRadius: T.radius.sm, border: `0.5px solid ${T.inkLine}`, background: "transparent", color: T.inkMid, fontSize: T.fontSize.md, cursor: "pointer", fontFamily: T.fontSerif }}
              >解除</button>
            </div>
          ) : (
            <div
              onClick={() => setMergePickerOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: T.radius.sm, border: `0.5px dashed ${T.inkLine}`, cursor: "pointer", color: T.purple, fontSize: T.fontSize.base }}
              onMouseEnter={(e) => (e.currentTarget.style.background = T.goldLight)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <i className="ti ti-git-merge" style={{ fontSize: 14 }} />他のノードに合流させる
            </div>
          )}

          {mergeSourceNodes.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: T.fontSize.sm, color: T.inkFaint, marginBottom: 6 }}>このノードに合流してくる変化</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {mergeSourceNodes.map((src) => (
                  <div
                    key={src.id}
                    onClick={() => saveAndNavigate(() => onNodeSelect(src.id))}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: T.radius.sm, border: `0.5px solid ${T.inkLineFaint}`, cursor: "pointer" }}
                  >
                    <i className="ti ti-corner-down-right" style={{ fontSize: 13, color: T.purple }} />
                    <span style={{ fontSize: T.fontSize.base, color: T.ink, flex: 1 }}>{src.label}</span>
                    <i className="ti ti-chevron-right" style={{ fontSize: 14, color: T.gray }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <Divider />

        {/* ── 分岐リスト ── */}
        <div style={{ padding: "8px 16px 16px" }}>
          <SectionLabel style={{ marginBottom: 8 }}>分岐</SectionLabel>
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
          </div>

          {/* ── ノード削除 ── */}
          {!node.isRoot && onDeleteNode && (
            <div style={{ padding: "16px 16px 8px", borderTop: `0.5px solid ${T.inkLineFaint}` }}>
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

      {mergePickerOpen && (
        <MergeTargetModal
          tree={tree}
          excludeIds={[nodeId, ...collectDescendantIds(nodeId)]}
          onClose={() => setMergePickerOpen(false)}
          onSelect={handleSelectMergeTarget}
        />
      )}
    </div>
  );
}


// ──────────────────────────────────────────
// MergeTargetModal: 合流先ノードを選ぶ
// ──────────────────────────────────────────
function MergeTargetModal({ tree, excludeIds, onClose, onSelect }) {
  const candidates = Object.values(tree.nodes).filter((n) => !excludeIds.includes(n.id));

  return (
    <div style={MODAL_OVERLAY_STYLE} onClick={onClose}>
      <div style={{ ...MODAL_SHEET_STYLE, maxHeight: "70vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink, marginBottom: 6 }}>
          合流先のノードを選ぶ
        </div>
        <div style={{ fontSize: T.fontSize.md, color: T.inkMid, marginBottom: 14, lineHeight: 1.6 }}>
          このノードがどの変化に合流するかを選びます。
        </div>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {candidates.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", fontSize: T.fontSize.base, color: T.inkFaint }}>
              合流できるノードがありません
            </div>
          ) : (
            candidates.map((n) => (
              <div
                key={n.id}
                onClick={() => onSelect(n.id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: T.radius.sm, border: `0.5px solid ${T.inkLine}`, cursor: "pointer" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = T.goldLight)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {n.isRoot && <i className="ti ti-flag-2" style={{ fontSize: 13, color: T.gold }} />}
                <span style={{ fontSize: T.fontSize.base, color: T.ink, flex: 1 }}>{n.label}</span>
                <StatusChip status={n.status} />
              </div>
            ))
          )}
        </div>
        <ModalActionButtons onCancel={onClose} onConfirm={onClose} confirmLabel="閉じる" />
      </div>
    </div>
  );
}


// ──────────────────────────────────────────
// KifuControls: 棋譜の記録・再生コントロール
// ──────────────────────────────────────────
function KifuControls({ kifu, recording, viewing, viewIndex, onStartRecording, onStopRecording, onResetKifu, onStartViewing, onExitViewing, onPrev, onNext }) {
  const hasKifu = kifu.length > 1;

  return (
    <div style={{ padding: "0 16px 8px" }}>
      <div style={{
        border: `0.5px solid ${recording ? T.red : T.inkLine}`,
        borderRadius: T.radius.md,
        padding: "10px 12px",
        background: recording ? T.redBg : "rgba(26,15,0,0.03)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <i className="ti ti-history-toggle" style={{ fontSize: 14, color: recording ? T.red : T.gold }} />
          <span style={{ fontSize: T.fontSize.md, color: T.inkMid, flex: 1 }}>
            {recording ? `記録中… ${kifu.length}手目`
              : viewing  ? `棋譜を再生中：${viewIndex + 1} / ${kifu.length} 手目`
              : hasKifu  ? `棋譜を記録済み（全 ${kifu.length} 手）`
              : "棋譜（指し手の記録）"}
          </span>
        </div>

        {/* 記録中: 終了ボタン */}
        {recording && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={onStopRecording} style={{ flex: 1, padding: "8px 0", borderRadius: T.radius.sm, border: "none", background: T.red, color: T.cream, fontSize: T.fontSize.base, fontFamily: T.fontSerif, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <i className="ti ti-player-stop" style={{ fontSize: 13 }} />記録を終える
            </button>
          </div>
        )}

        {/* 再生中: ←→ と終了 */}
        {viewing && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <button onClick={onPrev} disabled={viewIndex <= 0} style={{ width: 38, height: 34, borderRadius: T.radius.sm, border: `0.5px solid ${T.inkLine}`, background: T.cream, color: viewIndex <= 0 ? T.gray : T.gold, fontSize: 16, cursor: viewIndex <= 0 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-chevron-left" />
            </button>
            <button onClick={onNext} disabled={viewIndex >= kifu.length - 1} style={{ width: 38, height: 34, borderRadius: T.radius.sm, border: `0.5px solid ${T.inkLine}`, background: T.cream, color: viewIndex >= kifu.length - 1 ? T.gray : T.gold, fontSize: 16, cursor: viewIndex >= kifu.length - 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-chevron-right" />
            </button>
            <button onClick={onExitViewing} style={{ flex: 1, padding: "8px 0", borderRadius: T.radius.sm, border: `0.5px solid ${T.inkLine}`, background: "transparent", color: T.inkMid, fontSize: T.fontSize.base, fontFamily: T.fontSerif, cursor: "pointer" }}>
              ライブ盤面に戻る
            </button>
          </div>
        )}

        {/* 通常時: 記録開始 / 見返す / 撮り直す */}
        {!recording && !viewing && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {hasKifu && (
              <button onClick={onStartViewing} style={{ flex: 1, padding: "8px 0", borderRadius: T.radius.sm, border: `0.5px solid ${T.gold}`, background: "transparent", color: T.gold, fontSize: T.fontSize.base, fontFamily: T.fontSerif, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <i className="ti ti-player-play" style={{ fontSize: 13 }} />棋譜を見返す
              </button>
            )}
            <button onClick={onStartRecording} style={{ flex: 1, padding: "8px 0", borderRadius: T.radius.sm, border: "none", background: T.gold, color: T.cream, fontSize: T.fontSize.base, fontFamily: T.fontSerif, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <i className="ti ti-player-record" style={{ fontSize: 13 }} />{hasKifu ? "撮り直す" : "棋譜を記録する"}
            </button>
          </div>
        )}

        {!recording && !viewing && hasKifu && (
          <div onClick={onResetKifu} style={{ marginTop: 8, textAlign: "center", fontSize: T.fontSize.sm, color: T.gray, cursor: "pointer" }}>
            棋譜を消去する
          </div>
        )}

        <div style={{ fontSize: T.fontSize.sm, color: T.inkFaint, marginTop: 6, lineHeight: 1.5 }}>
          {recording ? "盤面を動かすと、その手順が記録されます。" : "「記録する」を押してから盤面を動かすと、指し手の流れを保存できます。"}
        </div>
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════
// NewNode: ノード追加ウィザード（2ステップ）
//
// STEP 0: 切り口を選ぶ（相手の戦法 / 自分の戦法 / 局面の状況）
// STEP 1: ノード名・ステータス・盤面・メモを入力
// ══════════════════════════════════════════════════════════════════

const WIZARD_STEPS = ["切り口", "詳細入力"];

const APPROACHES = [
  {
    key:       "相手の戦法",
    icon:      "ti-swords",
    iconColor: T.redDark,
    bg:        "#fadbd8",
    title:     "相手の戦法",
    sub:       "居飛車 / 三間飛車 / 穴熊 など\n相手の出方によって分岐する",
  },
  {
    key:       "自分の戦法",
    icon:      "ti-user",
    iconColor: "#c87820",
    bg:        T.goldBgSub,
    title:     "自分の戦法",
    sub:       "四間飛車 / 角換わり / 矢倉 など\n自分が指す戦法で分岐する",
  },
  {
    key:       "局面の状況",
    icon:      "ti-chart-dots",
    iconColor: T.brown,
    bg:        "#FAEEDA",
    title:     "局面の状況",
    sub:       "銀が間に合った / 穴熊に組まれた\n局面の条件によって分岐する",
  },
];

export function NewNode({ tree, parentNodeId, onComplete, onCancel, onOpenNode }) {
  const parentNode = tree.nodes[parentNodeId];

  const [step,        setStep]        = useState(0);
  const [approach,    setApproach]    = useState(null);
  const [suggestion,  setSuggestion]  = useState("");
  const [name,        setName]        = useState("");
  const [status,      setStatus]      = useState("todo");
  const [memo,        setMemo]        = useState("");
  const [boardData,   setBoardData]   = useState(null);
  const [stamps,      setStamps]      = useState([]);
  const [boardVisible, setBoardVisible] = useState(false);
  const [tendency,    setTendency]    = useState("");
  const [done,        setDone]        = useState(false);
  const [newNodeId,   setNewNodeId]   = useState(null);

  const displayName = name || suggestion || "新しいノード";
  const progressPct = ((step + 1) / WIZARD_STEPS.length) * 100;
  const canSubmit   = step === 1 && !!(name.trim() || suggestion);

  // 切り口タップ → 即 STEP 1 へ
  const handleApproachSelect = (key) => {
    setApproach(key);
    setStep(1);
  };

  const handleToggleBoard = () => {
    if (!boardVisible && !boardData) {
      setBoardData(cloneBoard(parentNode?.board ?? null));
    }
    setBoardVisible((v) => !v);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const createdId = await onComplete({
      label:        name.trim() || suggestion,
      status,
      approachType: approach,
      tendency,
      parentId:     parentNodeId,
      board:        boardVisible ? boardData : null,
      stamps:       boardVisible ? stamps    : [],
      memo,
    });
    setNewNodeId(createdId);
    setDone(true);
  };

  // ── 作成完了画面 ──────────────────────────────────
  if (done) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.cream }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px", gap: 16, textAlign: "center" }}>
          {/* チェックアイコン */}
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: T.goldLight, border: `1.5px solid ${T.gold}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>
            <i className="ti ti-check" style={{ color: T.gold }} />
          </div>

          <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink, letterSpacing: "0.15em" }}>ノードを作成しました</div>
          <div style={{ fontSize: T.fontSize.base, color: T.inkMid, lineHeight: 1.7 }}>
            「{parentNode?.label}」からの<br />分岐がツリーに追加されました
          </div>

          {/* 作成したノードの概要カード */}
          <div style={{ width: "100%", border: `0.5px solid ${T.gold}`, borderRadius: T.radius.md, padding: "12px 14px", background: T.goldLight, textAlign: "left" }}>
            <div style={{ fontSize: T.fontSize.sm, color: T.gold, marginBottom: 3 }}>新しいノード</div>
            <div style={{ fontSize: T.fontSize.xxl, fontWeight: 600, color: T.ink, marginBottom: 8, fontFamily: T.fontTitle }}>
              {name.trim() || suggestion}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: T.fontSize.sm, padding: "2px 7px", borderRadius: T.radius.sm, background: "#fadbd8", color: T.redDark, fontFamily: T.fontSerif }}>{approach}</span>
              <StatusChip status={status} style={{ fontSize: T.fontSize.sm }} />
            </div>
          </div>

          {/* アクションボタン */}
          <div style={{ display: "flex", gap: 8, width: "100%" }}>
            <button
              onClick={onCancel}
              style={{ flex: 1, padding: 10, borderRadius: T.radius.md, fontSize: T.fontSize.base, cursor: "pointer", background: T.cream, color: T.inkMid, border: `0.5px solid ${T.inkLine}`, fontFamily: T.fontSerif }}
            >
              ツリーに戻る
            </button>
            <button
              onClick={() => newNodeId ? onOpenNode(newNodeId) : onCancel()}
              style={{ flex: 2, padding: 10, borderRadius: T.radius.md, fontSize: T.fontSize.lg, cursor: "pointer", background: T.gold, color: T.cream, border: "none", fontFamily: T.fontSerif, fontWeight: 600 }}
            >
              ノードを開く
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── ウィザード本体 ────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.cream }}>
      {/* トップバー */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 14px 10px", borderBottom: `0.5px solid ${T.inkLine}` }}>
        <button
          onClick={() => step === 0 ? onCancel() : setStep(0)}
          style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: 18, padding: 2, lineHeight: 1 }}
        >
          <i className="ti ti-chevron-left" />
        </button>
        <div style={{ flex: 1, fontSize: T.fontSize.xl, fontWeight: 600, color: T.ink, textAlign: "center" }}>
          {["分岐を追加", "詳細を入力"][step]}
        </div>
        <button
          onClick={onCancel}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: T.fontSize.base, color: T.inkMid, fontFamily: T.fontSerif }}
        >
          キャンセル
        </button>
      </div>

      {/* プログレスバー */}
      <div style={{ padding: "10px 20px 0" }}>
        <div style={{ height: 3, background: T.inkLineFaint, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", background: T.gold, borderRadius: 2, width: `${progressPct}%`, transition: "width 0.35s" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, padding: "0 2px" }}>
          {WIZARD_STEPS.map((lbl, i) => (
            <span key={i} style={{ fontSize: T.fontSize.xs, color: i === step ? T.gold : T.gray, fontWeight: i === step ? 600 : 400 }}>
              {lbl}
            </span>
          ))}
        </div>
      </div>

      {/* STEP 1: 分岐元→入力中ノード名のブレッドクラム */}
     {step === 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px 6px", borderBottom: `0.5px solid ${T.inkLineFaint}` }}>
          <span style={{ fontSize: T.fontSize.sm, color: T.inkMid }}>分岐元：</span>
          <span style={{ fontSize: T.fontSize.md, color: T.ink, fontWeight: 600 }}>{parentNode?.label}</span>
          <i className="ti ti-arrow-right" style={{ fontSize: 10, color: T.gray }} />
          <span style={{ fontSize: T.fontSize.md, color: T.gold, flex: 1 }}>{displayName}</span>
          {/* ステータスを右端に移動 */}
          <div style={{ display: "flex", gap: 4 }}>
            {["todo", "wip", "done"].map((s) => (
              <StatusChip key={s} status={s} active={status === s} onClick={() => setStatus(s)} />
            ))}
          </div>
        </div>
      )}

      {/* ステップ本体 */}
      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* ── STEP 0: 切り口選択 ── */}
        {step === 0 && (
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
            <SectionLabel style={{ marginBottom: 4 }}>どの切り口で分岐しますか？</SectionLabel>
            {APPROACHES.map((a) => (
              <div
                key={a.key}
                onClick={() => handleApproachSelect(a.key)}
                style={{
                  display:    "flex",
                  alignItems: "center",
                  gap:        12,
                  padding:    "13px 14px",
                  borderRadius: T.radius.md,
                  cursor:     "pointer",
                  border:     `0.5px solid ${T.inkLine}`,
                  background: T.cream,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = T.goldLight; e.currentTarget.style.borderColor = T.gold; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = T.cream;     e.currentTarget.style.borderColor = T.inkLine; }}
              >
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: a.bg, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className={`ti ${a.icon}`} style={{ fontSize: 18, color: a.iconColor }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: T.fontSize.lg, fontWeight: 600, color: T.ink, marginBottom: 2 }}>{a.title}</div>
                  <div style={{ fontSize: T.fontSize.sm, color: T.inkMid, lineHeight: 1.4, whiteSpace: "pre-line" }}>{a.sub}</div>
                </div>
                <i className="ti ti-chevron-right" style={{ fontSize: 16, color: T.gray }} />
              </div>
            ))}
          </div>
        )}
        {/* ── STEP 1: 詳細入力 ── */}
        {step === 1 && (
          <div>
            {/* 候補タグ（自分の戦法から選ぶ） */}
            <SectionLabel style={{ padding: "14px 16px 8px" }}>
              {approach === "相手の戦法" ? "相手の戦法から選ぶ" : approach === "自分の戦法" ? "自分の戦法から選ぶ" : "局面の状況から選ぶ"}
            </SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, padding: "0 16px 12px" }}>
              {(SUGGESTIONS[approach] || []).map((s) => {
                const selected = suggestion === s;
                return (
                  <div
                    key={s}
                    onClick={() => { setSuggestion(s); setName(s); }}
                    style={{
                      padding:      "7px 12px",
                      borderRadius: 20,
                      cursor:       "pointer",
                      border:       `0.5px solid ${selected ? T.gold : T.inkLine}`,
                      fontSize:     T.fontSize.base,
                      color:        T.ink,
                      background:   selected ? T.goldLight : T.cream,
                      fontWeight:   selected ? 600 : 400,
                      fontFamily:   T.fontSerif,
                      transition:   "all 0.15s",
                    }}
                  >
                    {s}
                  </div>
                );
              })}
            </div>

            <div style={{ height: "0.5px", background: T.inkLineFaint }} />

            {/* ノード名（自由入力）← 志向の前に移動 */}
            <div style={{ padding: "12px 16px 14px" }}>
              <SectionLabel style={{ marginBottom: 5 }}>ノード名（自由入力）</SectionLabel>
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); setSuggestion(""); }}
                placeholder="例：▲４六銀型"
                style={{ width: "100%", border: `0.5px solid ${T.inkLine}`, borderRadius: T.radius.sm, padding: "9px 12px", fontSize: T.fontSize.lg, color: T.ink, background: T.cream, fontFamily: T.fontSerif, outline: "none" }}
                onFocus={(e) => (e.target.style.borderColor = T.gold)}
                onBlur={(e)  => (e.target.style.borderColor = T.inkLine)}
              />
            </div>

            {/* 自分の志向（「自分の戦法」選択時のみ） */}
            {approach === "自分の戦法" && (
              <div>
                <div style={{ height: "0.5px", background: T.inkLineFaint }} />
                <SectionLabel style={{ padding: "12px 16px 8px" }}>自分の志向</SectionLabel>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7, padding: "0 16px 10px" }}>
                  {["攻め重視", "守り重視", "バランス", "速攻", "持久戦"].map((t) => {
                    const selected = tendency === t;
                    return (
                      <div
                        key={t}
                        onClick={() => setTendency(t)}
                        style={{
                          padding:      "7px 12px",
                          borderRadius: 20,
                          cursor:       "pointer",
                          border:       `0.5px solid ${selected ? T.gold : T.inkLine}`,
                          fontSize:     T.fontSize.base,
                          color:        T.ink,
                          background:   selected ? T.goldLight : T.cream,
                          fontWeight:   selected ? 600 : 400,
                          fontFamily:   T.fontSerif,
                          transition:   "all 0.15s",
                        }}
                      >
                        {t}
                      </div>
                    );
                  })}
                </div>
                {/* 自由入力 */}
                <div style={{ padding: "0 16px 12px" }}>
                  <input
                    value={tendency}
                    onChange={(e) => setTendency(e.target.value)}
                    placeholder="例：穴熊志向、急戦好き"
                    style={{ width: "100%", border: `0.5px solid ${T.inkLine}`, borderRadius: T.radius.sm, padding: "9px 12px", fontSize: T.fontSize.lg, color: T.ink, background: T.cream, fontFamily: T.fontSerif, outline: "none" }}
                    onFocus={(e) => (e.target.style.borderColor = T.gold)}
                    onBlur={(e)  => (e.target.style.borderColor = T.inkLine)}
                  />
                </div>
              </div>
            )}

            <div style={{ height: "0.5px", background: T.inkLineFaint }} />

            {/* メモ */}
            <SectionLabel style={{ padding: "12px 16px 6px" }}>メモ（任意）</SectionLabel>
            <div style={{ padding: "0 16px 16px" }}>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="気づき・方針・手順のポイントなど"
                rows={4}
                style={{ width: "100%", border: `0.5px solid ${T.inkLine}`, borderRadius: T.radius.sm, padding: "10px 12px", fontSize: T.fontSize.base, color: T.ink, background: T.cream, resize: "none", fontFamily: T.fontSerif, lineHeight: 1.7, outline: "none" }}
                onFocus={(e) => (e.target.style.borderColor = T.gold)}
                onBlur={(e)  => (e.target.style.borderColor = T.inkLine)}
              />
            </div>
          </div>
        )}
      </div>

      {/* ボトムナビ（STEP 1 のみ表示） */}
      {step === 1 && (
        <div style={{ display: "flex", gap: 8, padding: "12px 16px 20px", borderTop: `0.5px solid ${T.inkLine}` }}>
          <button
            onClick={() => setStep(0)}
            style={{ flex: 1, padding: 10, borderRadius: T.radius.md, fontSize: T.fontSize.lg, cursor: "pointer", border: `0.5px solid ${T.inkLine}`, background: T.cream, color: T.inkMid, fontFamily: T.fontSerif }}
          >
            前へ
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              flex:         2,
              padding:      10,
              borderRadius: T.radius.md,
              fontSize:     T.fontSize.lg,
              cursor:       canSubmit ? "pointer" : "default",
              border:       "none",
              background:   canSubmit ? T.gold : T.gray,
              color:        T.cream,
              fontFamily:   T.fontSerif,
              fontWeight:   600,
              transition:   "background 0.15s",
            }}
          >
            作成する
          </button>
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════
// RewardsScreen: ご褒美（スタンプ・実績）画面
// ══════════════════════════════════════════════════════════════════

/** 達成済みスタンプ。判子（ハンコ）風に角丸枠＋アイコンで表現する */
function RewardBadge({ badge, earned }) {
  return (
    <div
      style={{
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        gap:            8,
        padding:        "16px 8px 14px",
        borderRadius:   T.radius.lg,
        border:         `${earned ? 1.5 : 0.5}px solid ${earned ? badge.color : T.inkLine}`,
        background:     earned ? T.cream : "rgba(26,15,0,0.03)",
        opacity:        earned ? 1 : 0.45,
        transition:     "opacity 0.2s",
      }}
    >
      <div
        style={{
          width:          52,
          height:         52,
          borderRadius:   "50%",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontSize:       24,
          color:          earned ? badge.color : T.gray,
          border:         `2px solid ${earned ? badge.color : T.gray}`,
          background:     earned ? `${badge.color}14` : "transparent",
        }}
      >
        <i className={`ti ${badge.icon}`} />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: T.fontSize.lg, fontWeight: 600, color: earned ? T.ink : T.inkMid }}>
          {badge.label}
        </div>
        <div style={{ fontSize: T.fontSize.sm, color: T.inkMid, marginTop: 2 }}>
          {badge.desc}
        </div>
      </div>
      {earned && (
        <div style={{ fontSize: T.fontSize.xs, color: badge.color, fontWeight: 600, letterSpacing: 1 }}>
          達成 ✓
        </div>
      )}
    </div>
  );
}

/** 数値を大きく見せる統計カード */
function StatCard({ icon, label, value, unit, color }) {
  return (
    <div
      style={{
        flex:           1,
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        gap:            4,
        padding:        "14px 8px",
        borderRadius:   T.radius.lg,
        border:         `0.5px solid ${T.inkLine}`,
        background:     T.cream,
      }}
    >
      <i className={`ti ${icon}`} style={{ fontSize: 18, color }} />
      <div style={{ fontSize: 22, fontWeight: 700, color: T.ink, fontFamily: T.fontTitle }}>
        {value}
        <span style={{ fontSize: T.fontSize.sm, fontWeight: 400, color: T.inkMid, marginLeft: 2 }}>{unit}</span>
      </div>
      <div style={{ fontSize: T.fontSize.sm, color: T.inkMid }}>{label}</div>
    </div>
  );
}

/**
 * ご褒美画面 ― ツリー数・ノード数・ログイン日数を集計し、
 * 達成済みスタンプ（バッジ）を判子風に並べて表示する
 */
export function RewardsScreen({ treeCount, nodeCount, onBack }) {
  const [loginStats, setLoginStats] = useState({ totalDays: 0, streak: 0 });

  useEffect(() => {
    setLoginStats(getLoginStats());
  }, []);

  const stats = {
    treeCount,
    nodeCount,
    totalDays: loginStats.totalDays,
    streak:    loginStats.streak,
  };
  const earnedIds = getEarnedBadgeIds(stats);
  const earnedCount = earnedIds.size;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.cream }}>
      {/* ── トップバー ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 14px 10px", borderBottom: `0.5px solid ${T.inkLine}` }}>
        <BackBtn onClick={onBack} />
        <div style={{ fontSize: T.fontSize.xl, fontWeight: 600, color: T.ink }}>ご褒美</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 32px" }}>
        {/* ── 統計サマリー ── */}
        <SectionLabel style={{ marginBottom: 8 }}>これまでの記録</SectionLabel>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <StatCard icon="ti-seedling"  label="ツリー" value={treeCount}        unit="個" color={T.green} />
          <StatCard icon="ti-sitemap"   label="ノード" value={nodeCount}        unit="個" color={T.blue} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <StatCard icon="ti-calendar"  label="累計ログイン" value={loginStats.totalDays} unit="日" color={T.brown} />
          <StatCard icon="ti-flame"     label="連続ログイン" value={loginStats.streak}    unit="日" color={T.brown} />
        </div>

        {/* ── スタンプ一覧 ── */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
          <SectionLabel>獲得スタンプ</SectionLabel>
          <div style={{ fontSize: T.fontSize.sm, color: T.inkMid }}>
            {earnedCount} / {BADGE_DEFS.length} 個達成
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {BADGE_DEFS.map((badge) => (
            <RewardBadge key={badge.id} badge={badge} earned={earnedIds.has(badge.id)} />
          ))}
        </div>

        <div style={{ marginTop: 20, fontSize: T.fontSize.sm, color: T.inkFaint, lineHeight: 1.7 }}>
          ※ ログイン日数はこの端末に記録されます。アプリを開くたびに自動でカウントされます。
        </div>
      </div>
    </div>
  );
}
