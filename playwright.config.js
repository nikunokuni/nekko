// E2E（ブラウザで実際に触る）テストの設定。
//   モックQA構成（vite.mock.config.js）を自動で起動するので、Supabase の準備は要らない。
//   実行: npm run test:e2e  /  画面を見ながら: npm run test:e2e:headed
import { existsSync } from "node:fs";
import { join } from "node:path";
import { chromium, defineConfig, devices } from "@playwright/test";

const PORT = 5174; // 手元の npm run dev（5173）と衝突させない

// 使う Chromium を決める。undefined を返したら Playwright の既定に任せる。
//
// 判断の順番に理由がある：
//   ① PLAYWRIGHT_CHROMIUM_PATH … 人が明示したものが最優先
//   ② Playwright が自前で入れたもの … 版が @playwright/test と揃っているので一番安全
//   ③ 環境が先に置いた Chromium … 版は揃わないが、動かないよりはよい
//
// ③が要る理由：Claude Code on the web のコンテナには Chromium が焼き込んであり、
// ダウンロードも止めてある（PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD）。
// @playwright/test を上げると期待する版番号だけが変わって②が消え、
// 「入っているのに Executable doesn't exist」でE2Eが全滅する。
// 版が違っても主要動線を見るには足りるので、そこで諦めずに③へ落とす。
function resolveChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;

  // executablePath() は「入っているはずの場所」を返すだけで、実在は保証しない
  try {
    if (existsSync(chromium.executablePath())) return undefined;
  } catch {
    // 版情報すら引けない状況。③に賭ける
  }

  const shared = join(process.env.PLAYWRIGHT_BROWSERS_PATH || "", "chromium");
  return process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(shared) ? shared : undefined;
}

const executablePath = resolveChromium();

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
