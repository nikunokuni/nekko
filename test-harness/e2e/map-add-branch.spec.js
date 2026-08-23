// マップの上で木を育てられるかの見張り。
//
//   枝を1本足すのはこのアプリでいちばん回数の多い操作なのに、以前はマップに
//   その導線が無く「ノードを開く → 下までスクロール → 分岐を追加 → 名前を直す」の
//   4手だった。導線が切れても画面は落ちず、ボタンが無いだけなので気づけない。
//
//   あわせて、開いた瞬間に全体が見えているか（＝端の枝が画面の外に出ていないか）も見る。
//   切れていても画面は落ちず、枝が「無い」ように見えるだけの壊れ方をする。
import { test, expect } from "@playwright/test";
import { login, createTree, watchForAppErrors } from "./helpers.js";

// ＋ →（親をタップ）→ 名前 → 追加する
async function addBranch(page, { parent, label, whenToUse }) {
  await page.getByRole("button", { name: "分岐を追加" }).click();
  await expect(page.getByText("どのノードから分岐しますか")).toBeVisible();
  await page.locator(`text=${parent}`).first().click({ force: true });
  await page.getByPlaceholder("例：4六銀左急戦").fill(label);
  if (whenToUse) await page.getByPlaceholder("例：相手が急戦できたとき").fill(whenToUse);
  await page.getByRole("button", { name: "追加する" }).click();
  await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
}

test("マップの＋から、ノード名だけで分岐を足せる", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await createTree(page, "対抗形の研究");

  // 名前は必須。空のままでは作れない（名前の無いノードがマップに並ぶのを防ぐ）
  await page.getByRole("button", { name: "分岐を追加" }).click();
  await page.locator("text=居飛車").first().click({ force: true });
  await expect(page.getByRole("button", { name: "追加する" })).toBeDisabled();
  await page.getByPlaceholder("例：4六銀左急戦").fill("角換わり");
  await expect(page.getByRole("button", { name: "追加する" })).toBeEnabled();
  await page.getByRole("button", { name: "追加する" }).click();

  // 追加してもマップから出ない（続けて足せる）
  await expect(page).toHaveURL(/\/tree\/[0-9a-f-]+$/);
  await expect(page.getByText("角換わり", { exact: true }).first()).toBeVisible();

  // 「いつ使う」も一緒に入れられる。作った瞬間がいちばん覚えているため
  await addBranch(page, { parent: "居飛車", label: "相掛かり", whenToUse: "先に飛先を切られたとき" });
  await page.locator("text=相掛かり").first().click({ force: true });
  await expect(page.getByPlaceholder("例：相手が急戦できたとき／早く固めたいとき")).toHaveValue("先に飛先を切られたとき");

  // 詳細画面の要所は button でできている（div のままだとキーボードで到達できず、
  // 読み上げでもボタンとして読まれない。見た目は同じなので目では気づけない）
  await expect(page.getByRole("button", { name: "ここから分岐を追加" })).toBeVisible();
  // 名前を正規表現で見るのは、アイコンフォントが ::before で差し込む文字が
  // ボタン名に混ざるため（完全一致では引けない）
  await page.getByRole("button", { name: /居飛車/ }).first().click();          // 親ノード行
  await expect(page.getByRole("button", { name: /相掛かり/ })).toBeVisible(); // 子ノード行

  expect(errors).toEqual([]);
});

test("文字サイズの設定は、マップのノード名にも効く", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  const treeId = await createTree(page, "対抗形の研究");

  // マップの文字はSVGの数値指定なので、rem で書いた画面の文字と違って
  // 設定（ルートの font-size）が自動では効かない。効かなくなっても画面は落ちず、
  // 「特大にしたのにノード名だけ小さいまま」になるだけで、原因にたどり着けない
  const label = () => page.locator("svg text").filter({ hasText: "居飛車" }).first();
  const before = Number(await label().getAttribute("font-size"));

  await page.goto("/settings");
  await page.getByText("特大", { exact: true }).click();
  await page.goto(`/tree/${treeId}`);
  const after = Number(await label().getAttribute("font-size"));

  expect(after).toBeGreaterThan(before);
  expect(errors).toEqual([]);
});

test("枝が増えても、開いた時点で全体が画面に入っている", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  const treeId = await createTree(page, "対抗形の研究");

  // 横に4枚。以前は等倍固定だったので、この時点で端が画面の外にあった
  for (const label of ["角換わり", "相掛かり", "矢倉"]) {
    await addBranch(page, { parent: "居飛車", label });
  }
  await addBranch(page, { parent: "振り飛車", label: "四間飛車" });

  // 開き直す（初期表示を見たいので、追加直後の寄せ方ではなくマウント時の状態を見る）
  await page.goto(`/tree/${treeId}`);
  await expect(page.locator("text=四間飛車").first()).toBeVisible();
  await page.waitForTimeout(700);   // 寄せる動きが終わってから測る（移動中は途中の座標が返る）

  // 全ノードの矩形が、マップ領域の中に収まっているか
  const overflow = await page.evaluate(() => {
    const svg = document.querySelector("svg");
    const area = svg.closest("div[style*='overflow']").getBoundingClientRect();
    return [...document.querySelectorAll(".node-g rect")].filter((r) => {
      const b = r.getBoundingClientRect();
      return b.left < area.left - 1 || b.right > area.right + 1 || b.bottom > area.bottom + 1;
    }).length;
  });
  expect(overflow).toBe(0);

  expect(errors).toEqual([]);
});

test("目次は「目次」と書いたボタンから開く", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await createTree(page, "対抗形の研究");

  // 3点ドットは「その他メニュー」の記号で、目次だとは読まれない。
  // 押す前と後で呼び名をそろえる（ドロワーの中のタブ名も「目次」）
  const menu = page.locator("[data-onboard='map-menu']");
  await expect(menu).toHaveText("目次");

  // ドロワーは閉じていても DOM にはある（画面の外へずらしてある）。
  // 「見えているか」で確かめないと、開かなくてもテストが通ってしまう
  const summaryTab = page.getByRole("button", { name: "まとめ" });
  await expect(summaryTab).not.toBeInViewport();
  await menu.click();
  await expect(summaryTab).toBeInViewport();
  await expect(page.getByText("居飛車", { exact: true }).first()).toBeVisible();

  expect(errors).toEqual([]);
});
