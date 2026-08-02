// ══════════════════════════════════════════════════════════════════
// nodeEdit.spec.mjs  ―  ノード編集画面（きほん / ついか / 子ノード）
//
//   この画面は入力してから自動保存されるまでに間がある（デバウンス）。
//   「入力した内容が本当にDBに入ったか」は画面を離れて戻るまで分からないので、
//   各テストは必ず一度画面を離れてから確かめる。
// ══════════════════════════════════════════════════════════════════
import { test, expect } from "./fixtures.mjs";
import { signUp, createTree } from "./helpers.mjs";

/** 新しいツリーを作り、既定の子ノード「居飛車」を開いた状態にする */
async function openSampleNode(page) {
  await signUp(page);
  await createTree(page, "テスト戦法");
  await page.getByText("居飛車", { exact: true }).first().click();
  await expect(page).toHaveURL(/\/node\//);
}

/**
 * 自動保存が走るのを待ってから画面を読み直す。
 * 入力は800msのデバウンスで保存されるので、それを越えて待ってからリロードし、
 * 「画面のstate」ではなく「保存された内容」を見にいく。
 */
async function reloadAfterSave(page) {
  await page.waitForTimeout(1200);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/node\//);
}

test("きほん：ノード名とメモを直すと保存される", async ({ page }) => {
  await openSampleNode(page);

  await page.getByRole("textbox").first().fill("居飛車（対振り）");
  await page.getByPlaceholder(/この局面の気づき/).fill("玉を固めてから動く");

  await reloadAfterSave(page);

  await expect(page.getByRole("textbox").first()).toHaveValue("居飛車（対振り）");
  await expect(page.getByPlaceholder(/この局面の気づき/)).toHaveValue("玉を固めてから動く");
});

test("ついか：志向と頻度を選ぶと保存される", async ({ page }) => {
  await openSampleNode(page);

  await page.getByText("ついか", { exact: true }).click();
  await page.getByText("攻め", { exact: true }).first().click();

  await reloadAfterSave(page);

  await page.getByText("ついか", { exact: true }).click();
  // 選択中の項目は太字＋色付きになる。見た目ではなく「選ばれている」ことを
  // 確かめたいので、保存済みデータが復元されているかを font-weight で見る
  const attack = page.getByText("攻め", { exact: true }).first();
  await expect(attack).toBeVisible();
  await expect(attack).toHaveCSS("font-weight", "600");
});

test("子ノード：分岐を追加すると一覧に出る", async ({ page }) => {
  await openSampleNode(page);

  await page.getByText("ここから分岐を追加").click();
  // 追加直後は新しいノードの編集画面に移り、名前が選択状態になっている
  await expect(page).toHaveURL(/\/node\//);
  await page.getByRole("textbox").first().fill("四間飛車");

  // 親へ戻ると、子ノード一覧に追加したノードが並ぶ
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "戻る" }).click();
  await expect(page.getByText("四間飛車").first()).toBeVisible();
});
