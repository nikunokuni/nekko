// 公開ツリーの「みんなで編集」の動線テスト。
//
//   見張りたいのは、公開ツリーが**2種類になった**ことによる取り違え。
//   ふつうの公開ツリーは今までどおり読むだけで、みんなで編集ツリーだけが
//   編集できる画面に入る。ここが入れ替わっても画面は落ちない。
//   読むだけのつもりのツリーを編集できてしまう／編集したいツリーが
//   開けないという形で、押したあとに初めて分かる壊れ方をする。
//
//   ※ モックDBには RLS が無いので、権限そのもの（他人がAPIを直接叩けるか）は
//     ここでは確かめられない。それは DB 側のポリシーの領分
//     （supabase/migrations/20260806_collaborative_public_trees.sql）。
//     ここで見るのは画面の出し分けと、編集がツリーへ届くこと。
import { test, expect } from "@playwright/test";
import { login, createTree, makeForeignTree, watchForAppErrors } from "./helpers.js";

// ツリー一覧から、対象ツリーの編集モーダルを開く
async function openTreeEditModal(page, treeName) {
  await page.goto("/");
  await page.getByRole("button", { name: `${treeName}のメニュー` }).click();
  await page.getByText("編集", { exact: true }).click();
  await expect(page.getByText("ツリーを編集")).toBeVisible();
}

test("みんなで編集の公開ツリーは、みんなのツリーから開いてそのまま編集できる", async ({ page }) => {
  const errors = watchForAppErrors(page);
  const shared = makeForeignTree({
    ownerName: "niku", treeName: "みんなの相居飛車",
    nodeLabels: ["角換わり"], collaborative: true,
  });
  await login(page, { foreignTrees: [shared] });

  // ── 自分のツリー一覧には出ない（持ち主ではないため）──
  await expect(page.getByText("みんなの相居飛車")).toHaveCount(0);

  // ── みんなのツリーには「みんなで編集」の印が付いて並ぶ ──
  await page.getByRole("button", { name: "みんなのツリー" }).click();
  await expect(page.getByText("みんなで編集")).toBeVisible();

  // ── タップすると閲覧専用のプレビューではなく、編集できるマップに入る ──
  await page.getByText("みんなの相居飛車").first().click();
  await page.waitForURL(new RegExp(`/tree/${shared.treeId}$`));
  await expect(page.getByText(/直した内容はそのまま全員に見えます/)).toBeVisible();

  // ── ノードを開いて名前を変えられる ──
  await page.getByText("角換わり", { exact: true }).first().click();
  await page.waitForURL(/\/node\//);
  await page.locator("input").first().fill("角換わり腰掛け銀");
  await page.locator("input").first().blur();
  await page.waitForTimeout(900);

  // ── マップへ戻ると反映されている（＝DBに届いている）──
  await page.goto(`/tree/${shared.treeId}`);
  await expect(page.getByText("角換わり腰掛け銀").first()).toBeVisible();

  // ── 戻る先は「みんなのツリー」。自分の一覧には無いツリーなので、
  //    一覧へ戻すと閉じた先に見当たらず迷子になる ──
  await page.getByRole("button", { name: "読み直す" }).click();
  await expect(page.getByText("角換わり腰掛け銀").first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("公開するとき、みんなで編集にするかを聞かれる（試験運用のアカウントだけ）", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page, { username: "niku" });
  await createTree(page, "共同研究");

  await openTreeEditModal(page, "共同研究");
  await page.getByRole("button", { name: /このツリーを公開する/ }).click();

  // 公開してから設定を探させず、公開の直前に聞く
  await expect(page.getByText("どう公開しますか")).toBeVisible();
  await page.getByRole("button", { name: /みんなで編集にする/ }).click();

  // 一覧のバッジと、編集モーダルの表示が「みんなで編集」になる
  await expect(page.getByText("公開中").first()).toBeVisible();
  await openTreeEditModal(page, "共同研究");
  await expect(page.getByText("公開中（みんなで編集）")).toBeVisible();

  // あとから戻せる（公開したままで編集だけ閉じる）
  await page.getByRole("button", { name: /みんなで編集をやめる/ }).click();
  await expect(page.getByText("公開中（みんなで編集）")).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("試験運用の対象外のアカウントは、今までどおり1タップで公開する", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await createTree(page, "ふつうの研究");

  await openTreeEditModal(page, "ふつうの研究");
  await page.getByRole("button", { name: /このツリーを公開する/ }).click();

  // 選択肢が1つしか無い問いは出さない。押した時点で公開まで済む
  await expect(page.getByText("どう公開しますか")).toHaveCount(0);
  await openTreeEditModal(page, "ふつうの研究");
  await expect(page.getByRole("button", { name: /公開を取り消す/ })).toBeVisible();
  // みんなで編集にはならず、切り替えの導線も出ない
  await expect(page.getByText("公開中（みんなで編集）")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /みんなで編集/ })).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("ふつうの公開ツリーは今までどおり読むだけ", async ({ page }) => {
  const errors = watchForAppErrors(page);
  const readOnlyTree = makeForeignTree({
    ownerName: "taro", treeName: "見せるだけのツリー",
    nodeLabels: ["四間飛車"], collaborative: false,
  });
  await login(page, { foreignTrees: [readOnlyTree] });

  await page.getByRole("button", { name: "みんなのツリー" }).click();
  await expect(page.getByText("みんなで編集")).toHaveCount(0);

  await page.getByText("見せるだけのツリー").first().click();
  // 閲覧専用のプレビューへ入る（/preview）。編集できるマップには入らない
  await page.waitForURL(new RegExp(`/tree/${readOnlyTree.treeId}/preview$`));
  await expect(page.getByRole("button", { name: /このツリーをコピー/ })).toBeVisible();
  await expect(page.getByText(/直した内容はそのまま全員に見えます/)).toHaveCount(0);

  expect(errors).toEqual([]);
});
