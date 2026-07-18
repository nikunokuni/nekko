// ══════════════════════════════════════════════════
// kifuFile.js  ―  棋譜ファイルの読み込みユーティリティ
//   新規ツリー作成モーダルと棋譜ライブラリのインポートで共用する
// ══════════════════════════════════════════════════

// ── KIF/CSAファイルを文字列として読み込む（Shift_JIS対応） ──
export async function readKifuFile(file) {
  const buf = await file.arrayBuffer();
  const tryDecode = (label) => {
    try { return new TextDecoder(label, { fatal: false }).decode(buf); }
    catch { return ""; }
  };
  const utf8 = tryDecode("utf-8");
  if (!utf8.includes("�")) return utf8;
  const sjis = tryDecode("shift_jis");
  return sjis || utf8;
}
