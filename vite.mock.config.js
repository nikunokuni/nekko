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
});
