// ノード編集画面の「消す前に分かるか」「名前で取り違えないか」の見張り。
//
//   どちらも壊れても画面は落ちない。
//     ・削除の確認に件数が無いと、枝を1本消したつもりで研究を丸ごと消せる（元に戻せない）
//     ・手で入れた自己評価と、棋譜から計算した数字が同じ「勝率」という名前で並ぶと、
//       どちらを見ているのか分からないまま判断することになる
import { test, expect } from "@playwright/test";
import { login, createTree, watchForAppErrors } from "./helpers.js";

// マップの＋から枝を足す
async function addBranch(page, parent, label) {
  await page.getByRole("button", { name: "分岐を追加" }).click();
  await page.locator(`text=${parent}`).first().click({ force: true });
  await page.getByPlaceholder("例：4六銀左急戦").fill(label);
  await page.getByRole("button", { name: "追加する" }).click();
  await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
}

test("削除の確認に、いっしょに消える件数が出る", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await createTree(page, "対抗形の研究");
  await addBranch(page, "居飛車", "角換わり");
  await addBranch(page, "角換わり", "早繰り銀");   // 孫。数え漏らすとここがズレる

  // 配下がある場合：本人＋子＋孫のうち、いっしょに消える2件を数字で出す
  await page.locator("text=居飛車").first().click({ force: true });
  await page.getByRole("button", { name: "このノードを削除する" }).click();
  await expect(page.getByText(/その下の2件/)).toBeVisible();
  await page.getByRole("button", { name: "キャンセル" }).click();

  // 配下が無い場合は件数を出さない（0件と書くと、何かが消えるように読める）
  await page.getByRole("button", { name: /角換わり/ }).first().click();
  await page.getByRole("button", { name: /早繰り銀/ }).first().click();
  await page.getByRole("button", { name: "このノードを削除する" }).click();
  await expect(page.getByText("「早繰り銀」を削除します")).toBeVisible();
  await expect(page.getByText(/その下の/)).toHaveCount(0);

  // 実際に消える
  await page.getByRole("button", { name: "削除する", exact: true }).click();
  await expect(page.getByText("早繰り銀", { exact: true })).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("ノードの自己評価は「手ごたえ」。棋譜から計算する「勝率」と名前を分ける", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await createTree(page, "対抗形の研究");

  await page.locator("text=居飛車").first().click({ force: true });
  await page.getByText("ついか", { exact: true }).click();
  await expect(page.getByText("手ごたえ", { exact: true })).toBeVisible();
  // ノード側に「勝率」は残っていない（同じ名前が2つあるのが元の問題）
  await expect(page.getByText("勝率", { exact: true })).toHaveCount(0);

  // 並べ替えの名前もそろえる
  await page.goto("/search");
  await expect(page.getByText("手ごたえ順")).toBeVisible();

  // 「勝率」は棋譜から計算するほうの名前として残す
  await page.goto("/kifus/insight");
  await expect(page.getByText(/勝率/).first()).toBeVisible();

  expect(errors).toEqual([]);
});
