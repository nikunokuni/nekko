// 子ノードが親の戦法タグを引き継ぐことの回帰テスト。
//
//   ねらいは入力の手間を減らすことだけではない。branchCandidates は
//   situation / myApproach で対局を絞り込むので、**タグが埋まるほど
//   分岐の候補が当たる**。逆に引き継ぎが壊れると、手間が戻るだけでなく
//   候補の精度が静かに落ちる ―― どちらも画面は正常に見える。
//
//   確かめ方はノード検索の「戦法タグで絞り込み」。ノード編集画面で目視すると、
//   画面上部の「親ノード」欄に親の名前とタグが出ているため、**引き継いでいなくても
//   同じ文字が見えてしまう**（実際、最初はそれで通ってしまった）。
//   検索で絞り込めば、子ノード自身にタグが保存されたことまで確かめられる。
import { test, expect } from "@playwright/test";
import { login, createTree, watchForAppErrors } from "./helpers.js";

// 「ここから分岐を追加」で子を作り、名前を付ける。
// URL は親も子も /node/ なので waitForURL では切り替わりを待てない。
// 新しいノードの名前が入るのが、子に着いた合図
async function addChild(page, name) {
  await page.getByText("ここから分岐を追加").click();
  await expect(page.locator("input").first()).toHaveValue("新しいノード");
  await page.locator("input").first().fill(name);
  await page.waitForTimeout(900);   // 保存はデバウンス（800ms）付き
}

// ノード検索で戦法タグを1つ選び、絞り込んだ結果を見る
async function filterByTag(page, tag) {
  await page.goto("/search");
  await page.getByText("戦法タグで絞り込み").click();
  // 絞り込みのチップは button。結果一覧に出る同じ名前のタグ（span）とは別物なので、
  // role で指すと取り違えない
  await page.getByRole("button", { name: tag, exact: true }).click();
}

test("子ノードは親の戦法タグを引き継ぎ、孫までつながる", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await createTree(page, "四間飛車");

  // ツリーを作った時点の「居飛車」には situation:["居飛車"] が入っている
  await page.getByText("居飛車", { exact: true }).first().click();
  await page.waitForURL(/\/node\//);

  await addChild(page, "子ノード");
  // 引き継いだタグは普通のタグとして扱うので、そのまま孫へも渡る
  await addChild(page, "孫ノード");

  // ── 「居飛車」で絞り込むと、子も孫も残る ──
  await filterByTag(page, "居飛車");
  await expect(page.getByText("子ノード", { exact: true })).toBeVisible();
  await expect(page.getByText("孫ノード", { exact: true })).toBeVisible();
  // タグを持たないノードは落ちる（＝絞り込みが効いていることの裏取り）
  await expect(page.getByText("とりあえず", { exact: true })).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("自分の戦法も引き継ぐ（相手の戦法だけではない）", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await createTree(page, "中飛車");
  await page.getByText("居飛車", { exact: true }).first().click();
  await page.waitForURL(/\/node\//);

  // 親に「自分の戦法」を付ける（開く → グループ → タグ の3タップ。
  // この手間を子で繰り返さずに済むのが、引き継ぎのねらい）。
  // 「囲い」グループを使うのは、画面の他の場所に同じ言葉が出ないため
  await page.getByText("自分の戦法").click();
  await page.getByText("囲い", { exact: true }).click();
  await page.getByText("美濃囲い", { exact: true }).click();
  await page.waitForTimeout(900);

  await addChild(page, "受け継いだ子");

  // ── 自分の戦法（美濃囲い）でも絞り込める ──
  await filterByTag(page, "美濃囲い");
  await expect(page.getByText("受け継いだ子", { exact: true })).toBeVisible();

  expect(errors).toEqual([]);
});
