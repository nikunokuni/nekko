// トロフィーの回帰テスト。
//
//   トロフィーの目的は「続けて使ってもらうこと」と「奥にある機能に
//   気づいてもらうこと」の2つで、後者は**画面を通ったことを記録できて
//   初めて成り立つ**。記録の呼び出しを1つ書き忘れても画面は落ちず、
//   そのバッジが永久に取れないだけなので、目でもE2Eでも気づけない。
//
//   ここでは「奥の画面を通ると獲得数が増える」ことと、バッジの条件に
//   使っている数字が画面に出ていることを見張る。
//   数え方そのもの（何段掘ったか）は test-harness/treeOps.test.mjs の領分。
import { test, expect } from "@playwright/test";
import { login, createTree, watchForAppErrors } from "./helpers.js";

// ヘッダーの「獲得数 / 全体数」から獲得数だけを取り出す
async function earnedCount(page) {
  await page.goto("/trophy");
  const text = await page.getByText(/^\d+ \/ \d+$/).first().innerText();
  return Number(text.split("/")[0].trim());
}

test("奥の画面を通るとトロフィーの獲得数が増える", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await createTree(page, "四間飛車");

  // ツリーを1つ作った時点で「はじめの一歩」だけ
  const start = await earnedCount(page);
  expect(start).toBeGreaterThanOrEqual(1);

  // ノード検索（＝全ツリーから探せることに気づいた）
  await page.goto("/search");
  await expect(page.getByText("ノード検索")).toBeVisible();
  const afterSearch = await earnedCount(page);
  expect(afterSearch).toBe(start + 1);

  // 棋譜の傾向（＝棋譜ライブラリの1段下にある画面に気づいた）
  await page.goto("/kifus/insight");
  await page.waitForTimeout(400);
  const afterInsight = await earnedCount(page);
  expect(afterInsight).toBe(start + 2);

  // 記録は端末ではなく profiles に持つので、読み直しても減らない
  await page.reload();
  await page.waitForTimeout(400);
  expect(await earnedCount(page)).toBe(start + 2);

  expect(errors).toEqual([]);
});

test("バッジの条件に使っている数字がトロフィー画面に出ている", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await createTree(page, "中飛車");
  await page.goto("/trophy");

  // 数が見えないバッジは「あと何回で取れるか」が分からず、追いかけようがない。
  // 棋譜・できたの2つは、あとから足したバッジの条件そのもの
  for (const label of ["ツリー", "ノード", "棋譜", "できた", "累計ログイン", "連続ログイン"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }

  // 未獲得バッジの説明文が、そのまま機能の紹介文になっていること
  await expect(page.getByText("実戦で当たった相手の候補から子ノードを作る")).toBeVisible();
  await expect(page.getByText("ためた棋譜から自分の傾向を見る")).toBeVisible();

  expect(errors).toEqual([]);
});
