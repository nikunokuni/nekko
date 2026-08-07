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

test("ツリー一覧のヘッダーは、押しやすい大きさで横幅いっぱいに並ぶ", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);

  // 以前はアプリ名とボタンを1行に押し込んでいて、アプリ名に押されたボタンが
  // 17px まで縮み、指では押しにくかった（アプリ名も3文字で2行に折り返していた）。
  // 行を分けて幅を等分したので、ここで見張るのは
  //   ・アプリ名が1行のまま     ・的が指で押せる大きさ（44px角が目安）
  //   ・ボタン列が横幅いっぱい  ・ヘッダーが横にあふれない
  const logo   = page.getByText(/^ね/).first();
  const first  = page.getByRole("button", { name: "ノード検索" });
  const last   = page.getByRole("button", { name: "新しいツリーを作る" });
  const header = logo.locator("xpath=parent::div");

  const measure = async () => {
    const size = await logo.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const lb = await logo.boundingBox();
    const fb = await first.boundingBox();
    const lastB = await last.boundingBox();
    const hb = await header.boundingBox();
    return {
      // 折り返すと高さが2行ぶんになる（行の高さは文字サイズで変わるので比で見る）
      oneLine:  lb.height < size * 1.8,
      tall:     fb.height >= 44,
      wide:     fb.width  >= 40,
      // 左端から右端まで使えているか（左右の余白18pxぶんだけ内側）
      fullWidth: fb.x <= 20 && Math.abs((lastB.x + lastB.width) - (hb.x + hb.width - 18)) < 2,
      overflow: await header.evaluate((el) => el.scrollWidth - el.clientWidth),
    };
  };

  const expected = { oneLine: true, tall: true, wide: true, fullWidth: true, overflow: 0 };
  expect(await measure()).toEqual(expected);

  // 文字サイズを変えても、押しやすさは変わらない（的の大きさは px で決めている）
  await page.evaluate(() => localStorage.setItem("nekko_font_scale", "1.3"));
  await page.reload();
  await expect(logo).toBeVisible();
  expect(await measure()).toEqual(expected);

  // 幅の狭い端末（320px）でも6つ並ぶ
  await page.setViewportSize({ width: 320, height: 700 });
  await page.waitForTimeout(200);
  expect(await measure()).toEqual(expected);

  expect(errors).toEqual([]);
});

test("ログアウトは設定画面の一番下から、確認をはさんで行う", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);

  // ツリー一覧のヘッダーには置かない。1日に何度も押すものではないうえ、
  // 行き先のボタンに混ざっていると押し間違えて全部が見えなくなる
  await expect(page.getByRole("button", { name: "ログアウト" })).toHaveCount(0);

  await page.getByRole("button", { name: "設定" }).click();
  const signOut = page.getByRole("button", { name: "ログアウト" });
  await signOut.scrollIntoViewIfNeeded();
  await expect(signOut).toBeVisible();

  // 取り消せない操作なので、必ず一度受け止める
  await signOut.click();
  await expect(page.getByText("ログアウトしますか？")).toBeVisible();

  // やめれば設定画面に残る
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(page.getByText("ログアウトしますか？")).toHaveCount(0);

  // 進めればログイン画面へ戻る
  await signOut.click();
  await page.getByRole("button", { name: "ログアウト" }).last().click();
  await expect(page.getByText("新規登録", { exact: true }).first()).toBeVisible();

  expect(errors).toEqual([]);
});
