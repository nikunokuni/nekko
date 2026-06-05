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
function BoardSection({ boardVisible, boardData, stamps, parentBoard, parentLabel, onToggle, onChange, onDelete }) {
  return (
    <div style={{ padding: "8px 16px 0" }}>
      {/* ヘッダー行 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <SectionLabel>盤面</SectionLabel>
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
            onChange={({ board, stamps: s }) => onChange(board, s)}
          />

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
              marginTop:  6,
            }}
          >
            <i className="ti ti-trash" style={{ fontSize: 11 }} />盤面を削除
          </button>
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
function EditTreeModal({ tree, onClose, onSave }) {
  const [name,   setName]   = useState(tree.name);
  const [tags,   setTags]   = useState((tree.tags || []).join("、"));
  const [active, setActive] = useState(tree.active);
  const [saving, setSaving] = useState(false);

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
export function TreeList({ trees, profile, onOpen, onPublic, onNewTree, onSignOut, onDeleteTree, onEditTree }) {
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

export function MindMap({ tree, onNodeSelect, onBack }) {
  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [canvasOffset, setCanvasOffset] = useState({ x: 20, y: 20 });
  const [dragging,     setDragging]     = useState(false);
  const dragStart = useRef(null);

  const { nodes } = tree;
  const rootId    = tree.rootId ?? Object.values(nodes).find((n) => n.isRoot)?.id ?? null;

  const { positions, edges } = rootId
    ? layoutTree(nodes, rootId)
    : { positions: {}, edges: [] };

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
        ].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: T.fontSize.sm, color: T.inkMid }}>
            <div style={{ width: 18, height: 2, borderRadius: 1, background: l.line }} />{l.label}
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
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════
// NodeDetail: ノード詳細編集画面
// ══════════════════════════════════════════════════════════════════
export function NodeDetail({ tree, nodeId, onBack, onNodeSelect, onNewNode, onUpdate }) {
  const node = tree.nodes[nodeId];

  const [memo,         setMemo]         = useState("");
  const [status,       setStatus]       = useState("todo");
  const [boardVisible, setBoardVisible] = useState(false);
  const [boardData,    setBoardData]    = useState(null);
  const [stamps,       setStamps]       = useState([]);

  // nodeId が変わったらフォームをリセット
  useEffect(() => {
    if (node) {
      setMemo(node.memo || "");
      setStatus(node.status || "todo");
      setBoardVisible(!!node.board);
      setBoardData(node.board || null);
      setStamps(node.stamps || []);
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
          boardData={boardData}
          stamps={stamps}
          parentBoard={parent?.board}
          parentLabel={parent?.label}
          onToggle={handleToggleBoard}
          onChange={(board, s) => { setBoardData(board); setStamps(s); }}
          onDelete={() => { setBoardData(null); setStamps([]); setBoardVisible(false); }}
        />

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
          <span style={{ fontSize: T.fontSize.md, color: T.gold }}>{displayName}</span>
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
            {/* 候補タグ */}
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

            {/* ノード名（自由入力） */}
            <div style={{ padding: "0 16px 14px" }}>
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

            <div style={{ height: "0.5px", background: T.inkLineFaint }} />

            {/* ステータス */}
            <SectionLabel style={{ padding: "12px 16px 8px" }}>ステータス</SectionLabel>
            <div style={{ display: "flex", gap: 6, padding: "0 16px 14px" }}>
              {["todo", "wip", "done"].map((s) => (
                <StatusChip key={s} status={s} active={status === s} onClick={() => setStatus(s)} />
              ))}
            </div>

            <div style={{ height: "0.5px", background: T.inkLineFaint }} />

            {/* 盤面 */}
            <BoardSection
              boardVisible={boardVisible}
              boardData={boardData}
              stamps={stamps}
              parentBoard={parentNode?.board}
              parentLabel={parentNode?.label}
              onToggle={handleToggleBoard}
              onChange={(board, s) => { setBoardData(board); setStamps(s); }}
              onDelete={() => { setBoardData(null); setStamps([]); setBoardVisible(false); }}
            />

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
