// 局面検索（見ている局面から、同じ形が出た実戦を探す）の動線テスト。
//
//   ここで見張るのは「押したものが動くか」の線だけ。
//   照合そのもの（先後の反転・1局1件・空の指定）は壊れても画面が落ちないので、
//   test-harness/kifuPosition.test.mjs がユニットで見張っている。
//
//   画面側で静かに死ぬのは主に2つ。
//     ・プレビューへ onSearchPosition を渡し忘れる → ボタンごと消えて機能が消える
//       （棋譜プレビューで実際に起きた事故と同じ形。kifu-preview.spec.js 参照）
//     ・一覧から棋譜を開いても、その手数から始まらない
//       （第38手を探し当てたのに、また38回進めることになる）
import { test, expect } from "@playwright/test";
import { login, watchForAppErrors, KIF_SAMPLE } from "./helpers.js";

// 棋譜ライブラリ（/kifus を開いた状態）にサンプルを1件保存する
async function saveSample(page) {
  await page.getByRole("button", { name: "棋譜を保存" }).click();
  await page.getByPlaceholder("将棋アプリやサイトからコピーした棋譜").fill(KIF_SAMPLE);
  await page.getByRole("button", { name: "貼り付けた棋譜を読み込む" }).click();
  await page.getByRole("button", { name: "にく", exact: true }).click();   // 自分＝先手
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByRole("button", { name: "棋譜を保存" })).toBeVisible();
}

// 保存済み棋譜を開いて、局面検索へ持ち込む
async function openSearch(page) {
  await page.getByText("貼り付けた棋譜1").first().click();
  await page.getByRole("button", { name: /に似た将棋を探す/ }).click();
  await expect(page.getByRole("button", { name: /この形で探す/ })).toBeVisible();
}

test("見ている局面から探し、当たった手から再生が開く", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await page.goto("/kifus");
  await saveSample(page);

  await openSearch(page);

  // 持ち込んだ直後は「見ていた局面の駒がぜんぶ一致条件」。
  // その棋譜自身の第20手に当たる（＝自分の局面は必ず見つかる）
  await page.getByRole("button", { name: /この形で探す/ }).click();
  await expect(page.getByText("対象1局中 1件")).toBeVisible();
  const hit = page.getByRole("button", { name: /第20手 ／ 自分は先手/ });
  await expect(hit).toBeVisible();

  // 一覧の1件を押すと、その手数から再生が始まった状態で棋譜が開く
  await hit.click();
  await expect(page.getByText("第20手 / 20手")).toBeVisible();

  expect(errors).toEqual([]);
});

// この機能より前に取り込んだ棋譜には、詰めた盤面（boards_packed）が入っていない。
// 埋め直しが効いていないと、**画面は普通に動いたまま「対象0局中0件」**になる。
// 棋譜は消えていないのに何も出てこない、という一番たちの悪い壊れ方なので見張る。
test("詰めた盤面が無い棋譜も、開いたときに埋め直して探せる", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await page.goto("/kifus");
  await saveSample(page);

  // 列が無かったころに保存した棋譜を作る（モックDBは localStorage が実体）
  await page.evaluate(() => {
    const KEY = "nekko_mock_db_v1";   // test-harness/supabaseMock.js と揃える
    const db = JSON.parse(localStorage.getItem(KEY));
    for (const k of db.kifus) delete k.boards_packed;
    localStorage.setItem(KEY, JSON.stringify(db));
  });
  await page.reload();

  await openSearch(page);
  await page.getByRole("button", { name: /この形で探す/ }).click();
  await expect(page.getByText("対象1局中 1件")).toBeVisible();

  // 埋めた結果は保存される（次に開いたときにまた作り直さない）。
  // 21局面（初期局面＋20手）×81文字
  const packedLength = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem("nekko_mock_db_v1"));
    return (db.kifus[0].boards_packed || "").length;
  });
  expect(packedLength).toBe(21 * 81);

  expect(errors).toEqual([]);
});

test("マスは「駒 → 見ない → 空」と回り、条件を変えると案内が出る", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await page.goto("/kifus");
  await saveSample(page);

  await openSearch(page);

  // 7七には自分の角がいる（7手目 ７七角）。押すたびに状態が変わる
  await page.getByRole("button", { name: "7七 自分の角" }).click();
  await expect(page.getByRole("button", { name: "7七 見ない" })).toBeVisible();

  // 「見ない」にしただけなら、残りの駒で今までどおり当たる
  await page.getByRole("button", { name: /この形で探す/ }).click();
  await expect(page.getByText("対象1局中 1件")).toBeVisible();

  // もう一度押すと「空」。角がいる局面とは両立しないので、当てはまらなくなる
  // （＝「見ない」と「空」が別ものとして効いている）
  await page.getByRole("button", { name: "7七 見ない" }).click();
  await expect(page.getByRole("button", { name: "7七 空" })).toBeVisible();

  // 探し直すまでは、古い一覧を見ていることを知らせる
  await expect(page.getByText(/条件が変わっています/)).toBeVisible();

  await page.getByRole("button", { name: /この形で探す/ }).click();
  await expect(page.getByText(/当てはまる局面はありませんでした/)).toBeVisible();
  await expect(page.getByText(/条件が変わっています/)).toHaveCount(0);

  // さらに押すと元の駒に戻る（3つの状態を一周する）
  await page.getByRole("button", { name: "7七 空" }).click();
  await expect(page.getByRole("button", { name: "7七 自分の角" })).toBeVisible();

  expect(errors).toEqual([]);
});
