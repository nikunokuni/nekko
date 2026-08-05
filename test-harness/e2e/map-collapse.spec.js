// まとめノード（束ね）がブラウザで生きているかを見るテスト。
//   見るのは「押したものが動くか」だけ。見た目の細かさは追わない。
//
//   ここで見張っている事故は3つ：
//     ・畳んだ枝がリロードで開き直ってしまう（畳み方は端末ローカルに残す仕様）
//     ・目次から「畳んだ束の中のノード」へ飛べない（＝目次に出ているのに飛べない）
//     ・まとめタブに何も出ない
import { test, expect } from "@playwright/test";
import { login, createTree, watchForAppErrors } from "./helpers.js";

// マップ（SVG）の中だけを見る。目次ドロワーは畳んでいても常に全ノードを持っている
// （探すための場所なので連動させない仕様）ため、画面全体で数えると必ず1件見つかる。
const onMap = (page, name) => page.locator("svg").getByText(name, { exact: true });

/** 「居飛車」の下に子ノードを1つ作り、「居飛車」をまとめノードにする */
async function makeSummaryWithChild(page, treeId) {
  await page.getByText("居飛車", { exact: true }).first().click();
  await page.waitForURL(/\/node\//);

  // 子ノードを1つ作る（作成後は新しいノードの画面へ移る）
  await page.getByText("ここから分岐を追加").click();
  await page.waitForTimeout(400);
  const nameField = page.locator("input").first();
  await nameField.fill("急戦");
  await nameField.blur();
  await page.waitForTimeout(600);

  // 「居飛車」へ戻ってまとめノードにする
  await page.goto(`/tree/${treeId}`);
  await page.getByText("居飛車", { exact: true }).first().click();
  await page.waitForURL(/\/node\//);
  // ボタンの文字は状態で変わらないので、押せたかは aria-pressed で見る
  const summaryBtn = page.getByRole("button", { name: "まとめる" });
  await summaryBtn.click();
  await expect(summaryBtn).toHaveAttribute("aria-pressed", "true");

  await page.goto(`/tree/${treeId}`);
}

test("まとめノードでマップの枝を畳める（リロードしても畳んだまま）", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  const treeId = await createTree(page, "テスト用ツリー");
  await makeSummaryWithChild(page, treeId);

  // 畳む前は子が見えている
  await expect(onMap(page, "急戦")).toBeVisible();

  await page.getByLabel("「居飛車」の枝を畳む").click();
  await expect(onMap(page, "急戦")).toHaveCount(0);
  // 中身が見えなくても件数が分かる（畳んだ枝を忘れないための表示）
  await expect(onMap(page, "＋1")).toBeVisible();

  // 畳み方は端末に残る。ここが緑でないと、畳んでも開き直るので機能として意味が無い
  await page.reload();
  await expect(onMap(page, "居飛車")).toBeVisible();
  await expect(onMap(page, "急戦")).toHaveCount(0);

  // 開けば戻る
  await page.getByLabel("「居飛車」の枝を開く").click();
  await expect(onMap(page, "急戦")).toBeVisible();

  expect(errors).toEqual([]);
});

test("畳んだ束の中のノードへも目次から飛べる", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  const treeId = await createTree(page, "テスト用ツリー");
  await makeSummaryWithChild(page, treeId);

  await page.getByLabel("「居飛車」の枝を畳む").click();
  await expect(onMap(page, "急戦")).toHaveCount(0);

  // 目次はマップの畳み状態と連動しない（探すための場所なので常に全部見える）
  await page.locator("[data-onboard='map-menu']").click();
  await page.getByText("急戦", { exact: true }).click();

  // 祖先の畳みが自動で開いてマップに戻る。
  // ここが赤なら「目次に出ているのに飛べないノード」がある状態
  await expect(onMap(page, "急戦")).toBeVisible();
  expect(errors).toEqual([]);
});

test("まとめタブにまとめノードが並ぶ", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  const treeId = await createTree(page, "テスト用ツリー");
  await makeSummaryWithChild(page, treeId);

  // まとめ本文を書く
  await page.getByText("居飛車", { exact: true }).first().click();
  await page.waitForURL(/\/node\//);
  const summaryBox = page.getByPlaceholder("例：この戦型は角道を止めるかどうかで方針が変わる", { exact: false });
  await summaryBox.fill("急戦には位を取らせない");
  await summaryBox.blur();
  await page.waitForTimeout(600);

  await page.goto(`/tree/${treeId}`);
  await page.locator("[data-onboard='map-menu']").click();
  await page.getByText("まとめ", { exact: true }).first().click();
  await expect(page.getByText("急戦には位を取らせない")).toBeVisible();

  expect(errors).toEqual([]);
});
