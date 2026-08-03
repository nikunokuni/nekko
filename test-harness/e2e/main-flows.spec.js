// 主要動線がブラウザで生きているかを見るテスト。
//   細かい表示崩れは追わない。「押したものが動くか」「落ちないか」だけを見る。
import { test, expect } from "@playwright/test";
import { signUp, createTree, dismissOnboarding, watchForAppErrors } from "./helpers.js";

test("新規登録するとツリー一覧に入れる", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await signUp(page);
  await expect(page.getByText("ツリーがまだありません")).toBeVisible();
  expect(errors).toEqual([]);
});

test("ツリーを作るとマップに初期ノードが並ぶ", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await signUp(page);
  await createTree(page, "テスト用ツリー");

  // 新規ツリーはルート＋初期の枝＋置き場（とりあえず）が作られる
  await expect(page.getByText("おおもとの戦法").first()).toBeVisible();
  await expect(page.getByText("居飛車").first()).toBeVisible();
  await expect(page.getByText("とりあえず").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("ノード詳細を開いて名前を変えると保存される", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await signUp(page);
  const treeId = await createTree(page, "テスト用ツリー");

  await page.getByText("居飛車", { exact: true }).first().click();
  await page.waitForURL(/\/node\//);
  await dismissOnboarding(page);

  const nameField = page.locator("input").first();
  await nameField.fill("居飛車（変更後）");
  await nameField.blur();
  await page.waitForTimeout(600);

  // マップへ戻って反映を確かめる（＝DBに入っている）
  await page.goto(`/tree/${treeId}`);
  await expect(page.getByText("居飛車（変更後）").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("ノード詳細で盤面を出せる", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await signUp(page);
  await createTree(page, "テスト用ツリー");

  await page.getByText("居飛車", { exact: true }).first().click();
  await page.waitForURL(/\/node\//);
  await dismissOnboarding(page);

  await page.getByText(/タップして盤面を追加/).click();
  await page.waitForTimeout(600);
  // 盤が出れば駒が並ぶ
  await expect(page.getByText("相手の持ち駒")).toBeVisible();
  expect(errors).toEqual([]);
});

test("棋譜ライブラリを開ける", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await signUp(page);

  await page.getByRole("button", { name: "棋譜ライブラリ" }).click();
  await page.waitForURL(/\/kifus/);
  await dismissOnboarding(page);
  await expect(page.getByRole("button", { name: /棋譜を保存/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("存在しないノードIDを開いても落ちない", async ({ page }) => {
  // フックを早期 return より後ろに書くと、node が消えた瞬間に React が
  // "Rendered fewer hooks than expected" で画面ごと落ちる。その見張り。
  const errors = watchForAppErrors(page);
  await signUp(page);
  const treeId = await createTree(page, "テスト用ツリー");

  await page.goto(`/tree/${treeId}/node/does-not-exist`);
  await page.waitForTimeout(1200);
  expect(errors).toEqual([]);

  // 落ちていなければ、ツリーに戻って普通に操作を続けられる
  await page.goto(`/tree/${treeId}`);
  await expect(page.getByText("おおもとの戦法").first()).toBeVisible();
});
