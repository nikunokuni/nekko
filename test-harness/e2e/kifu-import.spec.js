// 棋譜の取り込みで「自分がどちら側か」をどう決めるかの動線テスト。
//
//   決め方は2通りあり、利用者から見た手数がまったく違う。
//     ・登録済みの名前と一致した棋譜 … 聞かずに確定する（黙って決めて、結果だけ見せる）
//     ・一致しなかった棋譜         … その場で名前を選んでもらう
//   ここが壊れても画面は落ちない。**毎回全部聞かれるようになる**か、
//   **聞かずに間違った側で確定する**かのどちらかで、どちらも見た目は正常に見える。
import { test, expect } from "@playwright/test";
import { login, watchForAppErrors, KIF_SAMPLE } from "./helpers.js";

// 棋譜ライブラリを開いて「棋譜を保存」モーダルにサンプルを貼り付ける
async function pasteSample(page) {
  await page.getByRole("button", { name: "棋譜を保存" }).click();
  await page.getByPlaceholder("将棋アプリやサイトからコピーした棋譜").fill(KIF_SAMPLE);
  await page.getByRole("button", { name: "貼り付けた棋譜を読み込む" }).click();
}

test("名前が未登録なら先後を聞き、一度答えれば次からは聞かずに決まる", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await page.getByRole("button", { name: "棋譜ライブラリ" }).click();

  // ── 1回目：名前を1つも登録していないので、どちらが自分か聞かれる ──
  await pasteSample(page);
  await expect(page.getByRole("button", { name: "にく", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "たろう", exact: true })).toBeVisible();

  // 聞くだけで終わらせず、次から聞かれなくする方法（設定への案内）も出す。
  // 別の将棋アプリの棋譜を混ぜている人は、ここに気づけないと毎回選ばされ続ける
  await expect(page.getByText("将棋アプリごとに名前が違う場合")).toBeVisible();

  await page.getByRole("button", { name: "にく", exact: true }).click();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByRole("button", { name: "棋譜を保存" })).toBeVisible();

  // 「にく」は先手。サンプルは後手の勝ちなので、一覧では自分から見た「負け」になる
  await expect(page.getByText("負け").first()).toBeVisible();

  // ── 2回目：同じ名前の棋譜なので、もう聞かない ──
  await pasteSample(page);
  await expect(page.getByText("あなた：にく（先手）")).toBeVisible();
  await expect(page.getByRole("button", { name: "たろう", exact: true })).toHaveCount(0);
  // 案内も引っ込む（聞いていないのに「名前を登録しては」と言われても意味がない）
  await expect(page.getByText("将棋アプリごとに名前が違う場合")).toHaveCount(0);

  // 黙って決めた結果は、押せば選び直せる（自分同士の対局などで取り違えたとき用）
  await page.getByRole("button", { name: "変更" }).click();
  await expect(page.getByRole("button", { name: "たろう", exact: true })).toBeVisible();

  expect(errors).toEqual([]);
});
