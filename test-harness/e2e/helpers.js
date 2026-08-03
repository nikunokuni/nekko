// E2E テストの共通手順。
//   各テストは「まっさらな状態で新規登録するところ」から始める。
//   モックDBは localStorage なので、ブラウザコンテキストが分かれていれば互いに干渉しない。
import { expect } from "@playwright/test";

// 実戦の棋譜サンプル（四間飛車 vs 居飛車）。取り込みテストで使う。
// test-harness/kifuAnalysis.test.mjs と同じ内容で、あちらは解析ロジック、こちらは画面を見る。
export const KIF_SAMPLE = `# ---- Kifu for Windows ----
開始日時：2026/07/20 10:00:00
手合割：平手
先手：にく
後手：たろう
手数----指手---------消費時間--
   1 ７六歩(77)   ( 0:01/00:00:01)
   2 ３四歩(33)   ( 0:01/00:00:01)
   3 ６六歩(67)   ( 0:01/00:00:02)
   4 ８四歩(83)   ( 0:01/00:00:02)
   5 ６八飛(28)   ( 0:01/00:00:03)
   6 ８五歩(84)   ( 0:01/00:00:03)
   7 ７七角(88)   ( 0:01/00:00:04)
   8 ５四歩(53)   ( 0:01/00:00:04)
   9 ４八玉(59)   ( 0:01/00:00:05)
  10 ６二銀(71)   ( 0:01/00:00:05)
  11 ３八玉(48)   ( 0:01/00:00:06)
  12 ４二玉(51)   ( 0:01/00:00:06)
  13 ２八玉(38)   ( 0:01/00:00:07)
  14 ３二玉(42)   ( 0:01/00:00:07)
  15 ５八金(69)   ( 0:01/00:00:08)
  16 ７四歩(73)   ( 0:01/00:00:08)
  17 ３八銀(39)   ( 0:01/00:00:09)
  18 ２二玉(32)   ( 0:01/00:00:09)
  19 ９六歩(97)   ( 0:01/00:00:10)
  20 ９四歩(93)   ( 0:01/00:00:10)
  21 投了         ( 0:01/00:00:11)
まで20手で後手の勝ち
`;

// アプリが投げたJSエラーを拾ってテストを落とす。
//   外部フォントの取得失敗は環境要因（オフラインでも動くのが正しい姿）なので除く。
export function watchForAppErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/ERR_CONNECTION_RESET|unsupported MIME type|net::ERR_/.test(t)) return;
    errors.push(`console: ${t}`);
  });
  return errors;
}

// 初回の使い方トーストを最初から「表示済み」にしておく。
//   トーストは画面を覆ってクリックを吸うので、E2Eでは出さないのが素直。
//   トースト自体の見え方は onboarding の専用テストで確かめる領分。
//   キーは src/onboarding.jsx の ONBOARD_MESSAGES と揃える。
const ONBOARD_KEYS = ["list", "kifus", "search", "settings", "map", "node", "board"];

export async function skipOnboarding(page) {
  await page.addInitScript((keys) => {
    const seen = Object.fromEntries(keys.map((k) => [k, true]));
    localStorage.setItem("nekko_onboard_seen", JSON.stringify(seen));
  }, ONBOARD_KEYS);
}

// 新規登録してツリー一覧まで進む。テストごとに別アカウントを作る。
export async function signUp(page) {
  await skipOnboarding(page);
  await page.goto("/");
  await page.getByText("新規登録", { exact: true }).first().click();

  const id = `e2e${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const inputs = page.locator("input");
  for (let i = 0, n = await inputs.count(); i < n; i++) {
    const type = await inputs.nth(i).getAttribute("type");
    await inputs.nth(i).fill(type === "password" ? "pass1234" : id);
  }
  await page.getByRole("button", { name: "アカウントを作成" }).click();

  // 登録直後はリカバリーコードのモーダルが必ず出る（閉じないと他が押せない）
  await page.getByRole("button", { name: /保存しました/ }).click();
  await dismissOnboarding(page);
  await expect(page.getByRole("button", { name: /新規/ })).toBeVisible();
  return id;
}

// 万一トーストが出てしまったときの逃げ道（画面中央を叩くと次に進む作り）。
// 通常は skipOnboarding で出さないので、ここは保険。
export async function dismissOnboarding(page) {
  for (let i = 0; i < 12; i++) {
    if (await page.getByText("👆").count() === 0) break;
    await page.mouse.click(200, 430);
    await page.waitForTimeout(200);
  }
}

// ツリーを1つ作ってマップ画面まで進む。作ったツリーのIDを返す。
export async function createTree(page, name) {
  await page.getByRole("button", { name: /新規/ }).click();
  await page.locator("input[type=text], input:not([type])").first().fill(name);
  await page.getByRole("button", { name: /作成|つくる|保存|OK/ }).last().click();
  await page.waitForURL(/\/tree\/[0-9a-f-]+$/);
  await dismissOnboarding(page);
  return page.url().split("/tree/")[1];
}
