import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "fs";

// package.json の version をアプリに埋め込み、画面（設定）に表示できるようにする。
// バージョンはここ（package.json）で一元管理する。
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url)));

export default defineConfig({
  // ビルド時にバージョン・ビルド時刻をコードへ差し込む（src/version.js で参照）。
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      // 新バージョンを検知したらユーザーに知らせて、タップで即反映する（prompt）。
      //   autoUpdate はサイレントに次回起動で入れ替わるため、編集中に勝手に
      //   リロードされたり、いつ更新されたか分からなかったりする。prompt にして
      //   「新しいバージョンがあります」バナー（src/hooks/usePwaUpdate.js）から
      //   ユーザー操作で更新する方式にした。
      registerType: "prompt",
      // Service Worker の登録は自前で行う（usePwaUpdate フック）。
      //   仮想モジュール virtual:pwa-register は使わない：モックQA構成
      //   （vite.mock.config.js）に PWA プラグインが無く import 解決に失敗するため。
      injectRegister: null,
      // 手書きの public/manifest.webmanifest をそのまま使う（プラグインは生成しない）
      manifest: false,
      workbox: {
        // ビルド成果物（JS/CSS/HTML/アイコンフォントwoff2/画像）をプリキャッシュ＝オフライン起動可能に。
        // アイコンフォントの woff/ttf は容量が大きい旧ブラウザ用フォールバックなのでプリキャッシュ対象外
        // （現行モバイルブラウザは woff2 で足りる。必要時のみオンライン取得）。
        globPatterns: ["**/*.{js,css,html,woff2,png,webp,ico,svg}"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            // Google Fonts のスタイルシート
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-stylesheets" },
          },
          {
            // Google Fonts の実フォントファイル（初回取得後はオフラインでも使える）
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      // 開発サーバ（通常の npm run dev / モックQA）ではSWを無効化して挙動を単純に保つ
      devOptions: { enabled: false },
    }),
  ],
});
