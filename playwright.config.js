// E2E（ブラウザで実際に触る）テストの設定。
//   モックQA構成（vite.mock.config.js）を自動で起動するので、Supabase の準備は要らない。
//   実行: npm run test:e2e  /  画面を見ながら: npm run test:e2e:headed
import { defineConfig, devices } from "@playwright/test";

const PORT = 5174; // 手元の npm run dev（5173）と衝突させない

// ブラウザが既に用意されている環境（CIのキャッシュ済みイメージなど）では、
// PLAYWRIGHT_CHROMIUM_PATH に実行ファイルを指すとダウンロードを省ける。
// 未設定なら Playwright が自前で入れたものを使う（通常はこちら）。
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./test-harness/e2e",
  // 1本が長引いたら設計を疑う。E2Eは「主要動線が生きているか」だけを見る道具。
  timeout: 60_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  // CI で .only の消し忘れを混入させない
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",

  use: {
    baseURL: `http://localhost:${PORT}`,
    // 落ちたときだけ痕跡を残す（成功時に成果物を溜めない）
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  // ねっこはスマホで使う前提のアプリなので、既定の視野もスマホに合わせる
  projects: [
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], launchOptions: { executablePath } } },
  ],

  webServer: {
    command: `npx vite --config vite.mock.config.js --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
