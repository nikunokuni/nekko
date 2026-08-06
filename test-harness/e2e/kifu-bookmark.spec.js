// 棋譜の「しおり」（分岐にしたい手の印）の動線テスト。
//
//   しおりは「分岐にしたい手を全部見つける」作業と「1つずつノードにする」作業を
//   つなぐ受け皿。壊れても画面は落ちず、**印が静かに消える**だけになり、
//   あとで探し直したときに初めて気づく（そのときには手遅れ）。
//
//   ここで見張るのは3つ。
//     ・印が保存され、棋譜を開き直しても残ること
//     ・棋譜ライブラリの一覧から「続きがある棋譜」を見つけられること
//     ・ノードにしたら済みになり、しおり自体は消えないこと
//       （消すと「どこを分岐点だと思ったか」の記録が失われる）
import { test, expect } from "@playwright/test";
import { login, createTree, watchForAppErrors, KIF_SAMPLE } from "./helpers.js";

// 棋譜ライブラリ（/kifus を開いた状態）にサンプルを1件保存する
async function saveSample(page) {
  await page.getByRole("button", { name: "棋譜を保存" }).click();
  await page.getByPlaceholder("将棋アプリやサイトからコピーした棋譜").fill(KIF_SAMPLE);
  await page.getByRole("button", { name: "貼り付けた棋譜を読み込む" }).click();
  await page.getByRole("button", { name: "にく", exact: true }).click();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByRole("button", { name: "棋譜を保存" })).toBeVisible();
}

// 保存済み棋譜を開いて、再生を4手目まで進める
async function openAndPlay(page, plies = 4) {
  await page.getByText("貼り付けた棋譜1").first().click();
  await page.getByRole("button", { name: "最初の局面へ" }).click();
  for (let i = 0; i < plies; i++) {
    await page.getByRole("button", { name: "一手すすむ" }).click();
  }
  await expect(page.getByText(`第${plies}手 /`)).toBeVisible();
}

test("しおりをはさむと保存され、一覧から続きのある棋譜を見つけられる", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await createTree(page, "四間飛車");   // ツリーが無いと「ノードを作る」導線が出ない
  await page.goto("/kifus");
  await saveSample(page);

  // ── しおりをはさむ ──
  await openAndPlay(page, 4);
  await page.getByRole("button", { name: "しおりをはさむ" }).click();

  // 押した瞬間に見た目が変わる（保存を待たせない）
  await expect(page.getByRole("button", { name: "しおりを外す" })).toBeVisible();
  // 飛べる印が増え、盤の外にも残り件数が出る
  await expect(page.getByRole("button", { name: "しおり 4手へ" })).toBeVisible();
  await expect(page.getByText(/しおり 1件（ノードにしていない手が1件）/)).toBeVisible();

  // ── 閉じても残る（DBに保存されている）──
  await page.getByRole("button", { name: "閉じる" }).first().click();
  await expect(page.getByText(/しおり1/)).toBeVisible();   // 一覧カードの残り件数

  // 一覧から「続きがある棋譜」だけに絞れる
  const filter = page.getByRole("button", { name: /しおりが残っている/ });
  await expect(filter).toBeVisible();
  await filter.click();
  await expect(page.getByText("貼り付けた棋譜1").first()).toBeVisible();

  // ── 開き直しても消えない ──
  await page.reload();
  await page.getByText("貼り付けた棋譜1").first().click();
  await expect(page.getByRole("button", { name: "しおり 4手へ" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("ノードにするとしおりは済みになるが、印そのものは消えない", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await createTree(page, "中飛車");
  await page.goto("/kifus");
  await saveSample(page);

  await openAndPlay(page, 4);
  await page.getByRole("button", { name: "しおりをはさむ" }).click();
  await expect(page.getByText(/ノードにしていない手が1件/)).toBeVisible();

  // ── その局面からノードを作る ──
  await page.getByRole("button", { name: /この局面からノードを作る/ }).click();
  // 「どこまで入れますか」→ 最後まで（始点は、しおりを付けた第4手）
  await page.getByRole("button", { name: /最後（.*）まで/ }).click();
  await page.getByText("中飛車").last().click();   // 送り先ツリー
  await page.waitForURL(/\/node\//);

  // ── 棋譜へ戻ると、しおりは「済み」になっているが消えてはいない ──
  await page.goto("/kifus");
  await page.getByText("貼り付けた棋譜1").first().click();
  await expect(page.getByRole("button", { name: "しおり 4手へ" })).toBeVisible();
  await expect(page.getByText(/しおり 1件（すべてノードにしました）/)).toBeVisible();

  // 済みだけになったら、一覧の絞り込みは引っ込む（押しても必ず空になるため）
  await page.getByRole("button", { name: "閉じる" }).first().click();
  await expect(page.getByRole("button", { name: /しおりが残っている/ })).toHaveCount(0);

  expect(errors).toEqual([]);
});
