// 主要動線がブラウザで生きているかを見るテスト。
//   細かい表示崩れは追わない。「押したものが動くか」「落ちないか」だけを見る。
import { test, expect } from "@playwright/test";
import { signUp, login, createTree, watchForAppErrors } from "./helpers.js";

test("新規登録するとツリー一覧に入れる", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await signUp(page);
  await expect(page.getByText("ツリーがまだありません")).toBeVisible();
  expect(errors).toEqual([]);
});

test("ツリーを作るとマップに初期ノードが並ぶ", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await createTree(page, "テスト用ツリー");

  // 新規ツリーはルート＋初期の枝＋置き場（とりあえず）が作られる
  await expect(page.getByText("おおもとの戦法").first()).toBeVisible();
  await expect(page.getByText("居飛車").first()).toBeVisible();
  await expect(page.getByText("とりあえず").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("ノード詳細を開いて名前を変えると保存される", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  const treeId = await createTree(page, "テスト用ツリー");

  await page.getByText("居飛車", { exact: true }).first().click();
  await page.waitForURL(/\/node\//);

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
  await login(page);
  await createTree(page, "テスト用ツリー");

  await page.getByText("居飛車", { exact: true }).first().click();
  await page.waitForURL(/\/node\//);

  await page.getByText(/タップして盤面を追加/).click();
  await page.waitForTimeout(600);
  // 盤が出れば駒が並ぶ
  await expect(page.getByText("相手の持ち駒")).toBeVisible();
  expect(errors).toEqual([]);
});

test("棋譜ライブラリを開ける", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);

  await page.getByRole("button", { name: "棋譜ライブラリ" }).click();
  await page.waitForURL(/\/kifus/);
  await expect(page.getByRole("button", { name: /棋譜を保存/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test("存在しないノードIDを開いても落ちない", async ({ page }) => {
  // フックを早期 return より後ろに書くと、node が消えた瞬間に React が
  // "Rendered fewer hooks than expected" で画面ごと落ちる。その見張り。
  const errors = watchForAppErrors(page);
  await login(page);
  const treeId = await createTree(page, "テスト用ツリー");

  await page.goto(`/tree/${treeId}/node/does-not-exist`);
  await page.waitForTimeout(1200);
  expect(errors).toEqual([]);

  // 落ちていなければ、ツリーに戻って普通に操作を続けられる
  await page.goto(`/tree/${treeId}`);
  await expect(page.getByText("おおもとの戦法").first()).toBeVisible();
});

test("ヘッダーが横にあふれず、アプリ名も1行のまま", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);

  // ヘッダーは flex の space-between。右のボタン列が広いと左のアプリ名が押され、
  // 3文字の「ねっこ」が2行になっていた。アプリ名側に「縮まない・折り返さない」を
  // 付けたので**もう折り返しようがない**ぶん、崩れ方が横あふれに変わる。
  // なので見張るのは1行かどうかだけでなく、**ヘッダーが横にあふれていないか**。
  // ボタンを足したりアイコンを大きくしたりすると、ここで先に落ちる
  const logo = page.getByText(/^ね/).first();
  const header = logo.locator("xpath=ancestor::div[1]/parent::div");

  const ok = async () => {
    const size = await logo.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const box  = await logo.boundingBox();
    // 折り返すと高さが2行ぶんになる（行の高さは文字サイズで変わるので比で見る）
    const oneLine = box.height < size * 1.8;
    const overflow = await header.evaluate((el) => el.scrollWidth - el.clientWidth);
    return { oneLine, overflow };
  };

  await expect(logo).toBeVisible();
  expect(await ok()).toEqual({ oneLine: true, overflow: 0 });

  // 文字サイズ「特大」。アイコンにも上限を付けてあるので、まだ収まる
  await page.evaluate(() => localStorage.setItem("nekko_font_scale", "1.3"));
  await page.reload();
  await expect(logo).toBeVisible();
  expect(await ok()).toEqual({ oneLine: true, overflow: 0 });

  // 幅の狭い端末（320px）でも収まる
  await page.setViewportSize({ width: 320, height: 700 });
  await page.waitForTimeout(200);
  expect(await ok()).toEqual({ oneLine: true, overflow: 0 });

  expect(errors).toEqual([]);
});
