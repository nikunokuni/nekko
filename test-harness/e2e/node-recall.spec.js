// 「呼び出し」（他のノードの中身を今のノードへ写す）の動線テスト。
//
//   写すのは**中身だけ**で、ツリー上の位置（親子・並び順）は動かない。
//   ここが崩れても画面は落ちない。写した項目が1つ抜けても、位置が動いても、
//   その場では「それらしい」ノードが出来上がってしまい、あとから見返したときに
//   初めて気づく。しかも上書きなので、気づいたときには元の中身が残っていない。
import { test, expect } from "@playwright/test";
import { login, createTree, watchForAppErrors } from "./helpers.js";

// ツリーを作り、初期の枝「居飛車」を開いて名前とメモを入れる。
// 入力は保存にデバウンスが挟まるので、書いたあと少し待ってから離れる
async function makeNode(page, treeName, nodeName, memo) {
  await page.goto("/");
  const treeId = await createTree(page, treeName);
  await page.getByText("居飛車", { exact: true }).first().click();
  await page.waitForURL(/\/node\//);

  await page.locator("input").first().fill(nodeName);
  await page.getByPlaceholder("この局面の気づき・方針を自由に（迷ったらまずここに）").fill(memo);
  await page.waitForTimeout(900);
  return treeId;
}

test("他のツリーのノードの中身を呼び出して上書きできる", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);

  // ── 呼び出す元（ツリーA）と、呼び出す先（ツリーB）を作る ──
  await makeNode(page, "ツリーA", "呼び出しのもと", "もとのメモです");
  const treeB = await makeNode(page, "ツリーB", "書き換えられる側", "消えるメモです");

  // ── 呼び出し ──
  await page.getByRole("button", { name: "呼び出し" }).click();
  await expect(page.getByText("どのノードを呼び出しますか")).toBeVisible();

  // 自分自身は候補に出さない（呼び出しても何も起きないため）
  await expect(page.getByRole("button", { name: /書き換えられる側/ })).toHaveCount(0);
  // 置き場（とりあえず）も出さない。中身を持たせる場所ではないので、
  // ツリーの数だけ候補に混ざるだけになる
  await expect(page.getByRole("button", { name: /とりあえず/ })).toHaveCount(0);

  await page.getByPlaceholder("ノード名・メモ・戦法名・ツリー名で検索").fill("呼び出しのもと");
  await page.getByRole("button", { name: /呼び出しのもと/ }).click();

  // 取り消せない操作なので、何が消えるかを名指しで出してから確認を取る
  await expect(page.getByText(/「書き換えられる側」の中身/)).toBeVisible();
  await page.getByRole("button", { name: "このノードに呼び出す" }).click();

  // ── 画面が写した中身に入れ替わる ──
  await expect(page.locator("input").first()).toHaveValue("呼び出しのもと");
  await expect(page.getByPlaceholder("この局面の気づき・方針を自由に（迷ったらまずここに）"))
    .toHaveValue("もとのメモです");

  // ── 位置は動かない：ツリーBのマップにそのまま残っている ──
  // 親を写してしまうと、別ツリーのノードIDが親に入って線が引けなくなる
  await page.goto(`/tree/${treeB}`);
  await expect(page.getByText("呼び出しのもと").first()).toBeVisible();

  // ── 呼び出し元は消えない（移動ではなく写し）──
  await page.goto("/");
  await page.getByText("ツリーA", { exact: true }).first().click();
  await expect(page.getByText("呼び出しのもと").first()).toBeVisible();

  expect(errors).toEqual([]);
});
