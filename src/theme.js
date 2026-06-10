// ══════════════════════════════════════════════════════════════════
// theme.js  ―  デザイントークン / 共通スタイル / 共通ユーティリティ
// ══════════════════════════════════════════════════════════════════
import { INITIAL_BOARD } from "./data";

// ══════════════════════════════════════════════════════════════════
// デザイントークン
// ══════════════════════════════════════════════════════════════════

/** アプリ全体で使う色・フォント・サイズの定数 */
export const T = {
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
export const INPUT_STYLE = {
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
export const MODAL_OVERLAY_STYLE = {
  position:   "absolute",
  inset:      0,
  background: "rgba(26,15,0,0.5)",
  display:    "flex",
  alignItems: "flex-end",
  zIndex:     50,
};

/** モーダルのボトムシート本体 */
export const MODAL_SHEET_STYLE = {
  width:        "100%",
  background:   T.cream,
  borderRadius: "20px 20px 0 0",
  padding:      "24px 20px 32px",
};

/** キャンセルボタン（モーダル共通） */
export const BTN_CANCEL_STYLE = {
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
export const parseTags = (str) =>
  str.split(/[,、\s]+/).map((s) => s.trim()).filter(Boolean);

/**
 * 将棋盤データをディープコピーする
 * board が null の場合は INITIAL_BOARD のコピーを返す
 */
export const cloneBoard = (board) =>
  JSON.parse(JSON.stringify(board ?? INITIAL_BOARD));
