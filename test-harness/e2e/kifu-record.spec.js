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

  // ② 1手も指さずに終えたら保存フォームへは進まず、やり直せる
  await page.getByRole("button", { name: "記録を終わる" }).click();
  await expect(page.getByText(/まだ1手も動かしていません/)).toBeVisible();
  await page.getByRole("button", { name: /棋譜を記録/ }).click();

  // ③ 盤に並べる（▲7六歩 △3四歩）。手数表示が動けばタップが効いている
  const canvas = page.locator("canvas[width='342']");
  await canvas.scrollIntoViewIfNeeded();
  await movePiece(page, canvas, [6, 2], [5, 2]);
  await movePiece(page, canvas, [2, 6], [3, 6]);
  await expect(page.getByText("2手", { exact: true })).toBeVisible();

  // ④ 記録を終えると保存フォームに変わる
  await page.getByRole("button", { name: "記録を終わる" }).click();
  await expect(page.getByText(/2手を記録しました/)).toBeVisible();

  // ⑤ 対局者名が無いので、自分の側と結果は手で答える。
  //    ここを答えないと保存できない（傾向分析に載らない棋譜になるため）
  const saveBtn = page.getByRole("button", { name: /^保存する$/ });
  await expect(saveBtn).toBeDisabled();

  await page.locator("input:not([type=date])").first().fill("手入力した対局");
  await page.getByRole("button", { name: "先手", exact: true }).click();
  await page.getByRole("button", { name: "勝ち", exact: true }).click();
  await saveBtn.click();

  // ⑥ 一覧に出る。勝敗が「勝ち」で出れば、自分の側と結果が保存されている
  //    （後手視点の入れ違いがあると「負け」になる）
  await expect(page.getByText("手入力した対局")).toBeVisible();
  await expect(page.getByText("勝ち", { exact: true })).toBeVisible();
  await expect(page.getByText("2手")).toBeVisible();

  expect(errors).toEqual([]);
});
