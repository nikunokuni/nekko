// 棋譜プレビューの回帰テスト。
//
//   KifuList が KifuPreviewModal へ onSetSide / trees / onSendToInbox を
//   渡し忘れていたため、「ツリーへ送る」がボタンごと消え、先後の選択も
//   黙って効かなくなっていた。見た目が崩れないので手動では気づけない類の不具合。
//   props を外すとこのテストが落ちるようにしてある。
import { test, expect } from "@playwright/test";
import { login, createTree, watchForAppErrors, KIF_SAMPLE } from "./helpers.js";

// 棋譜を1件貼り付けで保存し、プレビューを開くところまで進む
async function importKifuAndOpenPreview(page) {
  await page.getByRole("button", { name: "棋譜ライブラリ" }).click();
  await page.waitForURL(/\/kifus/);

  await page.getByRole("button", { name: /棋譜を保存/ }).click();
  await page.locator("textarea").fill(KIF_SAMPLE);
  await page.getByRole("button", { name: /貼り付けた棋譜を読み込む/ }).click();
  await page.getByRole("button", { name: /^保存する$/ }).click();

  // 一覧に出た棋譜カードを開く。
  // 保存直後は完了トーストが重なってクリックを吸うので、消えるのを待つ。
  const card = page.getByText(/貼り付けた棋譜/).first();
  await expect(card).toBeVisible();
  await page.waitForTimeout(2500);
  await card.click({ force: true });
}

test("棋譜プレビューに「ツリーへ送る」と先後の選択が出る", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await createTree(page, "送り先ツリー");
  await page.goto("/");

  await importKifuAndOpenPreview(page);

  // ① ツリーへ送る導線（onSendToInbox と trees の両方が届いていないと描画されない）
  await expect(page.getByText(/ツリーへ送る|とりあえず/).first()).toBeVisible();

  // ② 先後の選択（onSetSide が届いていないと押しても何も起きない）
  //    サンプルは対局者名を覚えていないので、先後未確定のまま出るのが正しい
  const sidePicker = page.getByText("← あなたはどちら？");
  await expect(sidePicker).toBeVisible();

  await page.getByRole("button", { name: "にく" }).click();
  await page.waitForTimeout(800);
  // 選べていれば「先手番」に変わり、選択ボタンは消える
  await expect(page.getByText("先手番")).toBeVisible();
  await expect(sidePicker).toHaveCount(0);

  expect(errors).toEqual([]);
});
