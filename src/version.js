// ══════════════════════════════════════════════════════════════════
// version.js  ―  アプリのバージョン情報
//   値は vite.config.js の define でビルド時に埋め込む（一次情報は
//   package.json の version）。モックQA構成（vite.mock.config.js）では
//   define が無いため、typeof でガードしてフォールバックする。
// ══════════════════════════════════════════════════════════════════

export const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

export const BUILD_TIME =
  typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "";
