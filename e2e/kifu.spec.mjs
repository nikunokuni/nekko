// ══════════════════════════════════════════════════════════════════
// kifu.spec.mjs  ―  棋譜ライブラリの動線
//   棋譜を貼り付けて保存 → プレビューを開く → ツリーの「とりあえず」へ送る。
//
//   「ツリーへ送る」は一度、親から props を渡し忘れてボタンごと出なくなって
//   いた（画面は普通に描画されるので気づけなかった）。ここで押さえておく。
// ══════════════════════════════════════════════════════════════════
import { test, expect } from "./fixtures.mjs";
import { signUp, createTree, goToTreeList, openTree } from "./helpers.mjs";

// 横歩取りの短い棋譜（17手で投了）。test-harness のユニットテストと同じ題材
const KIF_SAMPLE = `手合割：平手
先手：わたし
後手：あいて
手数----指手---------消費時間--
   1 ２六歩(27)   ( 0:01/00:00:01)
   2 ３四歩(33)   ( 0:01/00:00:01)
   3 ２五歩(26)   ( 0:01/00:00:02)
   4 ８四歩(83)   ( 0:01/00:00:02)
   5 ７六歩(77)   ( 0:01/00:00:03)
   6 ８五歩(84)   ( 0:01/00:00:03)
   7 ７八金(69)   ( 0:01/00:00:04)
   8 ３二金(41)   ( 0:01/00:00:04)
   9 ２四歩(25)   ( 0:01/00:00:05)
  10 同　歩(23)   ( 0:01/00:00:05)
  11 同　飛(28)   ( 0:01/00:00:06)
  12 ８六歩(85)   ( 0:01/00:00:06)
  13 同　歩(87)   ( 0:01/00:00:07)
  14 同　飛(82)   ( 0:01/00:00:07)
  15 ３四飛(24)   ( 0:01/00:00:08)
  16 ３三角(22)   ( 0:01/00:00:08)
  17 投了         ( 0:01/00:00:09)
`;

/** 棋譜ライブラリを開いて、貼り付けで1件保存する */
async function saveKifu(page) {
  await goToTreeList(page);
  await page.getByRole("button", { name: "棋譜ライブラリ" }).click();
  await expect(page).toHaveURL(/\/kifus/);

  await page.getByRole("button", { name: /棋譜を保存/ }).click();
  await page.getByPlaceholder(/棋譜（KIF\/CSA）を貼り付け/).fill(KIF_SAMPLE);
  await page.getByRole("button", { name: "貼り付けた棋譜を読み込む" }).click();

  // 読み込むと内容の確認欄が出る。自分がどちら側かを選んでから保存する
  await expect(page.getByText(/手を読み込みました/)).toBeVisible();
  await page.getByText("わたし", { exact: true }).last().click();
  await page.getByRole("button", { name: "保存する" }).click();

  // モーダルが閉じて一覧に戻るまで待つ
  await expect(page.getByRole("button", { name: "保存する" })).toBeHidden();
}

test("棋譜を貼り付けて保存できる", async ({ page }) => {
  await signUp(page);
  await saveKifu(page);

  // 一覧に載っていること（読み込んだ棋譜の名前で確かめる）
  await expect(page.getByText("貼り付けた棋譜1")).toBeVisible();
});

test("保存した棋譜をツリーの「とりあえず」へ送れる", async ({ page }) => {
  await signUp(page);
  await createTree(page, "送り先ツリー");
  await saveKifu(page);

  // 一覧のカードをタップしてプレビューを開く
  await page.getByText("貼り付けた棋譜1").click();

  // 「ツリーへ送る」ボタンが出ていること（props 渡し忘れの再発防止）
  const sendBtn = page.getByRole("button", { name: /とりあえず.*に入れる/ });
  await expect(sendBtn).toBeVisible();
  await sendBtn.click();

  // 送り先のツリーを選ぶ
  await page.getByText("送り先ツリー").first().click();

  // ツリーを開くと「とりあえず」の下にノードが増えている
  await goToTreeList(page);
  await openTree(page, "送り先ツリー");
  await expect(page.getByText("とりあえず").first()).toBeVisible();
});
