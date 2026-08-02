// テスト専用のVite設定。@supabase/supabase-js をローカルモックへ差し替えて
// 実バックエンドなしでアプリを動かす。通常ビルド（vite.config.js）には影響しない。
// 起動: npx vite --config vite.mock.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@supabase/supabase-js": fileURLToPath(new URL("./test-harness/supabaseMock.js", import.meta.url)),
    },
  },
  // E2Eテスト（npm run test:e2e）はこの構成をビルドして配信する。
  // 開発サーバのままだと画面遷移のたびに変換が走って遅いため。
  build: { outDir: "dist-mock" },
  // ビルド版でも直URL（/tree/xxx）が index.html に落ちるようにする
  preview: { port: 5174, strictPort: true },
});
