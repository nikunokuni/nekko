// 「次にやりたいこと」を書き残してから読み返すまでの動線テスト。
//
//   この欄は長いあいだ、書けるのに自分の画面のどこにも出てこなかった
//   （表示していたのは公開ツリーのプレビュー＝他人が見る画面だけ）。
//   壊れても画面は落ちず「書いたはずのものが見当たらない」だけになるので、
//   目でもE2Eでも気づきにくい。ここで見張るのは3つ。
//     ・ノード検索の一覧に本文が出ること（＝読み返せること）
//     ・「次にやりたいこと」の絞り込みが、書いていないノードを落とすこと
//     ・「ついか」の歯車から表示項目を切り替えられ、その場で反映されること
//
//   とくに歯車は、見出しのタップ（＝開閉）と同じ場所にある。伝播を止め忘れると
//   モーダルが出ずにセクションが畳まれるだけになり、静かに機能が死ぬ。
import { test, expect } from "@playwright/test";
import { login, createTree, watchForAppErrors } from "./helpers.js";

const NEXT_STUDY = "角交換のあとの飛車先を対策したい";

// ツリーを作り、初期の枝「居飛車」を開いて「ついか」を開いた状態にする
async function openNodeTsuika(page, treeName) {
  await createTree(page, treeName);
  await page.getByText("居飛車", { exact: true }).first().click();
  await page.waitForURL(/\/node\//);
  await page.getByText("ついか", { exact: true }).click();
}

test("「次にやりたいこと」がノード検索で読み返せて、絞り込みで抜き出せる", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await openNodeTsuika(page, "四間飛車");

  const box = page.getByPlaceholder("例：この仕掛けへの対策を用意したい");
  await box.fill(NEXT_STUDY);
  // 保存はデバウンス（800ms）付き。離れる前に確実に送らせる
  await box.blur();
  await page.waitForTimeout(1000);

  // ── ノード検索へ ──
  await page.goto("/search");

  // 絞り込みを押す前から件数が出る（いくつ溜まっているか）
  const filter = page.getByRole("button", { name: /次にやりたいこと/ });
  await expect(filter).toBeVisible();
  await expect(filter).toContainText("1件");

  // 絞り込みOFFでも本文が読める。ここに出ること自体がこの欄の存在理由
  await expect(page.getByText(NEXT_STUDY)).toBeVisible();
  // 書いていないノード（ツリー作成時にできる枝）も並んでいる
  await expect(page.getByText("振り飛車", { exact: true }).first()).toBeVisible();

  // ── 絞り込むと、書いていないノードが落ちる ──
  await filter.click();
  await expect(page.getByText(NEXT_STUDY)).toBeVisible();
  await expect(page.getByText("振り飛車", { exact: true })).toHaveCount(0);
  await expect(page.getByText("とりあえず", { exact: true })).toHaveCount(0);

  // もう一度押すと元に戻る（押しっぱなしで戻れないと、探す画面として使えなくなる）
  await filter.click();
  await expect(page.getByText("振り飛車", { exact: true }).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test("「ついか」の歯車から表示する項目を切り替えると、その場で反映される", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await openNodeTsuika(page, "中飛車");

  const box = page.getByPlaceholder("例：この仕掛けへの対策を用意したい");
  await expect(box).toBeVisible();

  // ── 歯車 → 表示する項目 ──
  // 見出しのタップは開閉なので、歯車で伝播が止まっていないとモーダルは出ず
  // 「ついか」が畳まれるだけになる
  await page.getByRole("button", { name: "表示する項目を選ぶ" }).click();
  const modal = page.getByRole("dialog", { name: "ノード編集画面に表示する項目" });
  await expect(modal).toBeVisible();

  // 「研究メモ」をOFFにすると、モーダルを閉じるのを待たずに欄が消える。
  // 表示可否は React の外（rewards のキャッシュ）にあるので、
  // 再描画のきっかけを作り忘れると閉じるまで消えない
  await modal.getByRole("switch", { name: "研究メモ" }).click();
  await expect(box).toHaveCount(0);

  // ONに戻すと、書いてあった内容ごと戻る（OFFはデータを消さない）
  await modal.getByRole("switch", { name: "研究メモ" }).click();
  await expect(box).toBeVisible();

  await modal.getByRole("button", { name: "閉じる" }).click();
  await expect(modal).toHaveCount(0);

  // ── 全項目をOFFにしても「ついか」の見出しは残る ──
  // 見出しごと消すと歯車も消え、戻す入口が無くなる
  await page.getByRole("button", { name: "表示する項目を選ぶ" }).click();
  for (const sw of await modal.getByRole("switch").all()) {
    if (await sw.getAttribute("aria-checked") === "true") await sw.click();
  }
  await modal.getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByText("ついか", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "表示する項目を選ぶ" })).toBeVisible();
  await expect(page.getByText(/表示する項目がすべてオフ/)).toBeVisible();

  expect(errors).toEqual([]);
});
