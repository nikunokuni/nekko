// 棋譜入力（盤に並べて棋譜を作る）の動線テスト。
//
//   棋譜ライブラリ →「棋譜入力」→ 盤に並べる →「記録を終わる」→ 保存 → 一覧に出る、
//   までがつながっているかを見る。盤はCanvasなので、押せているかどうかは
//   記録中の手数表示と、保存後のカードの内容でしか確かめられない。
import { test, expect } from "@playwright/test";
import { signUp, dismissOnboarding, watchForAppErrors } from "./helpers.js";

// 盤のマスをタップする。row/col は board 配列の添字（0行目＝後手陣の一番奥）。
// Canvas は幅いっぱいに引き伸ばされるので、実寸から1マスの大きさを割り出す。
async function tapCell(page, canvas, row, col) {
  // 入力欄に文字を入れると画面が送られて盤が視野の外に出る。
  // 座標でタップする以上、毎回その場で盤を出してから測り直す必要がある
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  const cw = box.width / 9, ch = box.height / 9;
  await page.mouse.click(box.x + cw * (col + 0.5), box.y + ch * (row + 0.5));
}

// 駒を「つかんで置く」＝2タップ
async function movePiece(page, canvas, from, to) {
  await tapCell(page, canvas, from[0], from[1]);
  await tapCell(page, canvas, to[0], to[1]);
}

test("盤に並べて棋譜を作り、棋譜ライブラリに保存できる", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await signUp(page);

  await page.getByRole("button", { name: "棋譜ライブラリ" }).click();
  await page.waitForURL(/\/kifus/);
  await dismissOnboarding(page);

  // ① 開いた時点で記録が始まっている（押し忘れで手が消えないための作り）
  await page.getByRole("button", { name: "棋譜入力" }).click();
  await expect(page.getByRole("button", { name: "記録を終わる" })).toBeVisible();

  // ② 1手も指さずに終えたら棋譜は確定せず、やり直せる
  await page.getByRole("button", { name: "記録を終わる" }).click();
  const emptyWarn = page.getByText(/まだ1手も動かしていません/);
  await expect(emptyWarn).toBeVisible();
  await page.getByRole("button", { name: /棋譜を記録/ }).click();

  // ③ 盤に並べる（▲7六歩 △3四歩）。手数表示が動けばタップが効いている
  const canvas = page.locator("canvas[width='342']");
  await canvas.scrollIntoViewIfNeeded();
  await movePiece(page, canvas, [6, 2], [5, 2]);
  await expect(page.getByText("1手", { exact: true })).toBeVisible();
  // 動かしたら0手の注意は消える（並べ直しているのに残ると矛盾する）
  await expect(emptyWarn).toHaveCount(0);

  // ④ 記録の途中でも下の入力欄を書ける（盤の記録は ref なので、
  //    入力欄の再描画では中断しない）。ここで書いた内容は記録を終えても残る
  await page.locator("input:not([type=date])").first().fill("手入力した対局");
  await page.getByRole("button", { name: "先手", exact: true }).click();
  await page.getByLabel("メモ（自由記入）").fill("並べながら書いたメモ");
  await expect(page.getByText("1手", { exact: true })).toBeVisible();

  // 中断していなければ、続きの手がそのまま2手目として乗る
  await movePiece(page, canvas, [2, 6], [3, 6]);
  await expect(page.getByText("2手", { exact: true })).toBeVisible();

  // ⑤ 並べ終わるまでは保存できない（棋譜が確定していないため）
  const saveBtn = page.getByRole("button", { name: /^保存する$/ });
  await expect(saveBtn).toBeDisabled();

  await page.getByRole("button", { name: "記録を終わる" }).click();
  await expect(page.getByText(/2手を記録しました/)).toBeVisible();

  // ⑥ 結果は自分の側を選んでから出る。対局者名が無いので手で答えるしかない
  await page.getByRole("button", { name: "勝ち", exact: true }).click();
  await saveBtn.click();

  // ⑦ 一覧に出る。勝敗が「勝ち」で出れば、自分の側と結果が保存されている
  //    （後手視点の入れ違いがあると「負け」になる）
  const card = page.getByText("手入力した対局");
  await expect(card).toBeVisible();
  await expect(page.getByText("勝ち", { exact: true })).toBeVisible();
  await expect(page.getByText("2手")).toBeVisible();

  // ⑧ 記録中に書いたメモが保存され、開き直しても読める
  //    （書けても出す場所が無ければ、書いた本人が二度と読めない）
  await page.waitForTimeout(2500);   // 保存直後のトーストが消えるのを待つ
  await card.click({ force: true });
  await expect(page.getByText("並べながら書いたメモ")).toBeVisible();

  expect(errors).toEqual([]);
});
