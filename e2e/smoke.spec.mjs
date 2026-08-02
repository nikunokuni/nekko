// ══════════════════════════════════════════════════════════════════
// smoke.spec.mjs  ―  まず落ちてはいけない最小の動線
//   登録できる → ツリーが作れる → 開ける。
// ══════════════════════════════════════════════════════════════════
import { test, expect } from "./fixtures.mjs";
import { signUp, createTree, goToTreeList, openTree } from "./helpers.mjs";

test("新規登録してツリーを作り、開ける", async ({ page }) => {
  // 画面上のエラーは握りつぶさず、テストの失敗として扱う
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await signUp(page);
  await createTree(page, "居飛車の研究");

  // 一覧に戻ってから開き直せること
  await goToTreeList(page);
  await openTree(page, "居飛車の研究");

  // マップ画面まで来ていること（ルートノードが見えている）
  await expect(page.getByText("居飛車の研究").first()).toBeVisible();
  expect(errors).toEqual([]);
});
