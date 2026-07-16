import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 新バージョンを自動で取り込む（更新後の次回起動で反映）
      registerType: "autoUpdate",
      injectRegister: "auto",
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
