// ══════════════════════════════════════════════════════════════════
// playwright.config.js  ―  UI自動テストの設定
//
//   モック構成（vite.mock.config.js）でアプリを立ち上げてブラウザで操作する。
//   Supabase はローカルモックに差し替わるので、実バックエンドも .env も要らない。
//
//   実行: npm run test:e2e
//         npm run test:e2e -- --headed   （ブラウザを見ながら）
// ══════════════════════════════════════════════════════════════════
import { defineConfig, devices } from "@playwright/test";

const PORT = 5174; // 開発サーバ（5173）とぶつからないようにずらす
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Vite の開発サーバは初回アクセス時にモジュールを変換するため、
  // 画面遷移1回あたりが本番より遅い。余裕を持たせる。
  timeout: 90_000,
  expect: { timeout: 10_000 },
  // 落ちたテストは1回だけ試し直す（描画待ちのゆらぎ対策。CIのみ）
  retries: process.env.CI ? 1 : 0,
  // テストごとに localStorage を分けたいので直列で走らせる
  workers: 1,
  reporter: process.env.CI ? "line" : "list",

  use: {
    baseURL: BASE_URL,
    // 落ちたときだけ証跡を残す
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // スマホ前提のUIなので、既定のビューポートも縦長にする
    viewport: { width: 420, height: 900 },
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 420, height: 900 },
        // ブラウザが既に用意されている環境（クラウド開発環境など）では
        // PLAYWRIGHT_CHROMIUM_PATH でその実行ファイルを指定できる。
        // 未指定なら Playwright が自前で入れたブラウザを使う
        // （初回だけ `npx playwright install chromium` が必要）。
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],

  // モック構成をビルドしてから配信する。開発サーバのままだと画面遷移のたびに
  // Vite の変換が走り、1テスト40秒級まで遅くなる（ビルド版なら数秒）。
  webServer: {
    command: `npx vite build --config vite.mock.config.js && npx vite preview --config vite.mock.config.js --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
