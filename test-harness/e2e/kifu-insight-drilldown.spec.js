// 「棋譜の傾向」から実戦をたどってツリーへ入れるまでの動線テスト。
//
//   このアプリのねらいは「勉強の方針が立つ」こと。数字を見て終わりでは方針にならず、
//   傾向 → その戦型の実戦 → 再生 → ツリーの「とりあえず」へ、がひと続きで
//   つながっていて初めて意味を持つ。途中のどれか1本が切れても画面は落ちないので
//   （押しても開かない・ボタンが出ないだけ）、通しで見張る必要がある。
import { test, expect } from "@playwright/test";
import { login, createTree, watchForAppErrors, KIF_SAMPLE } from "./helpers.js";

// 棋譜を1件取り込んで、傾向画面に載る状態（自分の側と勝敗が決まった状態）にする
async function importOneKifu(page) {
  await page.getByRole("button", { name: "棋譜を保存" }).click();
  await page.getByPlaceholder("将棋アプリやサイトからコピーした棋譜").fill(KIF_SAMPLE);
  await page.getByRole("button", { name: "貼り付けた棋譜を読み込む" }).click();
  // 名前が未登録なのでどちらが自分か聞かれる。「にく」＝先手を選ぶ
  await page.getByRole("button", { name: "にく", exact: true }).click();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByRole("button", { name: "棋譜を保存" })).toBeVisible();
}

test("傾向の行から実戦をたどり、ツリーの「とりあえず」に入れられる", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await createTree(page, "対抗形");

  // ツリー一覧まで戻ってから棋譜ライブラリへ（マップからは直接行けない）
  await page.goto("/");
  await page.getByRole("button", { name: "棋譜ライブラリ" }).click();
  await importOneKifu(page);

  // ── 傾向画面へ ──
  await page.getByRole("button", { name: "棋譜の傾向" }).click();
  await expect(page.getByText("分岐を探す")).toBeVisible();

  // ── 行を開くと、その分かれ方の実戦が出る ──
  // 開く前は棋譜が見えていないことまで確かめる（常時展開になっていたら意味が変わるため）
  const kifuRow = page.getByText("貼り付けた棋譜1", { exact: true });
  await expect(kifuRow).toHaveCount(0);
  // 既定の観点は「相手の戦法」。自分は四間飛車、相手（たろう）は居飛車
  await page.getByText("居飛車", { exact: true }).first().click();
  await expect(page.getByText(/この1局/)).toBeVisible();
  await expect(kifuRow).toBeVisible();

  // ── 棋譜をタップすると再生モーダルが開く ──
  await kifuRow.click();
  await expect(page.getByRole("button", { name: /この局面からノードを作る/ })).toBeVisible();

  // ── 範囲を選ぶ段階から「やめる」で降りられる ──
  await page.getByRole("button", { name: /この局面からノードを作る/ }).click();
  await expect(page.getByText("どこまで入れますか")).toBeVisible();
  await page.getByRole("button", { name: "やめる" }).click();
  await expect(page.getByRole("button", { name: /この局面からノードを作る/ })).toBeVisible();

  // ── ツリーを選ぶ段階からも「やめる」で降りられる ──
  await page.getByRole("button", { name: /この局面からノードを作る/ }).click();
  await page.getByRole("button", { name: /最後（第20手）まで/ }).click();
  await expect(page.getByText("どのツリーに入れますか")).toBeVisible();
  await page.getByRole("button", { name: "やめる" }).click();
  await expect(page.getByRole("button", { name: /この局面からノードを作る/ })).toBeVisible();

  // ── もう一度たどって、実際にツリーへ入れる ──
  await page.getByRole("button", { name: /この局面からノードを作る/ }).click();
  await page.getByRole("button", { name: /最後（第20手）まで/ }).click();
  // ツリーは名前で指す。「対抗形」は読み取った戦型としても画面に出るので、
  // 文字ではなくボタンとして指す（同じ将棋用語が別の意味で並ぶことがある）
  await page.getByRole("button", { name: "対抗形" }).click();

  // 作られたノードの画面へ移動する（「とりあえず」に入れたまま迷子にならない）
  await page.waitForURL(/\/tree\/[0-9a-f-]+\/node\/[0-9a-f-]+$/);
  expect(errors).toEqual([]);
});
