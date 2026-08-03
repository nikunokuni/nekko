// 盤の貼り付け（スクロールしても局面が見える）の回帰テスト。
//   盤より下にあるメモや子ノードを、局面を見ながら読み書きするための機能なので、
//   「スクロールしたら出る／戻したら消える／盤が非表示なら出ない」の3点だけ見張る。
import { test, expect } from "@playwright/test";
import { login, createTree, watchForAppErrors } from "./helpers.js";

// スクロール領域（ノード編集画面の本文）を下まで送る
async function scrollBody(page, dy) {
  await page.evaluate((d) => {
    const el = [...document.querySelectorAll("div")].find(
      (e) => e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY === "auto"
    );
    if (el) el.scrollTop += d;
  }, dy);
  await page.waitForTimeout(300);
}

async function openNodeWithBoard(page) {
  await login(page);
  await createTree(page, "貼り付けテスト");
  await page.getByText("居飛車", { exact: true }).first().click();
  await page.waitForURL(/\/node\//);
  await page.getByText(/タップして盤面を追加/).click();
  await page.waitForTimeout(600);
}

test("スクロールで盤が流れると、縮小した盤が上端に貼り付く", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await openNodeWithBoard(page);

  const peek = page.locator("[data-board-peek]");
  // 盤が見えている間は貼り付けない（同じものが二重に出ると邪魔なだけ）
  await expect(peek).toHaveCount(0);

  await scrollBody(page, 900);
  await expect(peek).toHaveCount(1);

  // 貼り付いた盤は本体より小さく、スクロール領域の上端にいる
  const peekBox = await peek.boundingBox();
  const containerTop = await page.evaluate(() => {
    const el = [...document.querySelectorAll("div")].find(
      (e) => e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY === "auto"
    );
    return el.getBoundingClientRect().top;
  });
  expect(Math.abs(peekBox.y - containerTop)).toBeLessThan(2);
  // 本体の盤（286px）より確実に小さいこと。ここが縮まないと画面の半分を占める
  expect(peekBox.height).toBeLessThan(260);

  // 実解像度で描けていること。canvas は width/height 属性がそのまま画素数なので、
  // 見た目の大きさと同じ数にすると高精細画面（スマホは2〜3倍）では拡大表示になり、
  // マスの小さい貼り付け盤では駒の文字が真っ先ににじんで読めなくなる（実際にそうなっていた）
  const res = await peek.locator("[data-peek-board]").evaluate((c) => ({
    pixels: c.width,
    css: c.getBoundingClientRect().width,
    dpr: Math.min(window.devicePixelRatio || 1, 3),
  }));
  expect(res.dpr).toBeGreaterThan(1); // 等倍の端末で試すと素通りしてしまうので、前提を明示しておく
  expect(res.pixels).toBeGreaterThanOrEqual(Math.floor(res.css * res.dpr) - 1);
  // 盤そのものも、文字が読める大きさ（1マス20px＝9マスで180px）を下回らないこと
  expect(res.css).toBeGreaterThanOrEqual(180);

  // 相手・自分の持ち駒も一緒に貼り付いている（局面は駒台まで見えて初めて分かる）
  await expect(peek.getByText("相手の持ち駒")).toBeVisible();
  await expect(peek.getByText("自分の持ち駒")).toBeVisible();

  // 棋譜ナビや道具は貼り付けない（押せないボタンが並ぶだけになるため）
  await expect(peek.getByText("動かす")).toHaveCount(0);

  // 戻せば消える
  await scrollBody(page, -900);
  await expect(peek).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("盤を非表示にすると貼り付かない", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await openNodeWithBoard(page);

  await page.getByRole("button", { name: /非表示/ }).click();
  await page.waitForTimeout(400);
  await scrollBody(page, 900);

  await expect(page.locator("[data-board-peek]")).toHaveCount(0);
  expect(errors).toEqual([]);
});
