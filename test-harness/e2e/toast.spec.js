// 失敗の知らせ（トースト）の動線テスト。
//
//   以前は失敗のたびに alert() でOKを押させていた。今は押さずに消える
//   トーストにしてあるが、**読み込みの失敗だけは別扱い**にしている。
//   保存の失敗と違って画面には何も出ておらず、利用者から見ると
//   「空のまま固まっている」のと区別がつかないので、その場でやり直せる
//   「もう一度読む」を必ず添える。
//
//   ここが壊れても画面は落ちない。知らせが出ないだけ・押しても何も起きない
//   だけなので、**失敗したことに気づけないまま操作を続ける**ことになる。
import { test, expect } from "@playwright/test";
import { login, watchForAppErrors, KIF_SAMPLE } from "./helpers.js";

const MOCK_DB_KEY = "nekko_mock_db_v1";   // test-harness/supabaseMock.js と揃える

test("読み込みに失敗したら、やり直せる知らせが出る", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);

  // ── 棋譜を1件ためる ──
  await page.getByRole("button", { name: "棋譜ライブラリ" }).click();
  await page.getByRole("button", { name: "棋譜を保存" }).click();
  await page.getByPlaceholder("将棋アプリやサイトからコピーした棋譜").fill(KIF_SAMPLE);
  await page.getByRole("button", { name: "貼り付けた棋譜を読み込む" }).click();
  await page.getByRole("button", { name: "にく", exact: true }).click();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByText("貼り付けた棋譜1")).toBeVisible();

  // ── 一覧を読んだあとに実体を消し、「開こうとしたら取れない」状態を作る ──
  // 画面の一覧はもう手元にあるので、カードは出たままタップだけが失敗する。
  // 通信が切れた状況とちょうど同じ形になる
  await page.evaluate((key) => {
    const db = JSON.parse(localStorage.getItem(key));
    db.kifus = [];
    localStorage.setItem(key, JSON.stringify(db));
  }, MOCK_DB_KEY);

  await page.getByText("貼り付けた棋譜1").click();

  // 知らせと、次にすべきことが一緒に出る
  const toast = page.getByRole("alert");
  await expect(toast).toContainText("棋譜の読み込みに失敗しました");
  await expect(toast.getByRole("button", { name: "もう一度読む" })).toBeVisible();

  // ── 「もう一度読む」が実際にやり直している ──
  // 棋譜はまだ消えたままなので、押せばもう一度同じ知らせが出る。
  // 押しても何も起きない（ラベルだけの飾り）ならここで落ちる
  await toast.getByRole("button", { name: "もう一度読む" }).click();
  await expect(page.getByRole("alert")).toContainText("棋譜の読み込みに失敗しました");

  // ── 閉じられる ──
  // やり直せる知らせは勝手に消えない（消えたら押せなくなる）ので、
  // 閉じる手段がないと画面に residue が残り続ける
  await page.getByRole("alert").getByRole("button", { name: "この知らせを閉じる" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);

  // 失敗しても画面は生きている（alert で止まらない）
  await expect(page.getByRole("button", { name: "棋譜を保存" })).toBeVisible();

  // このテストはわざと読み込みを失敗させているので、db.js が出す
  // fetchKifu のログはあって当然。それ以外が出ていないことだけを見る
  const unexpected = errors.filter((e) => !e.includes("fetchKifu error"));
  expect(unexpected).toEqual([]);
});

test("棋譜の一覧が読めなかったときは、空にせず知らせる", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);

  // 棋譜の select だけを失敗させる。
  // 本物でこの形になるのは「列を1つ足して migration を流し忘れた」とき。
  // このとき件数だけを取る問い合わせは通るので、**トロフィーには件数が出ているのに
  // 一覧と傾向画面だけが空**という、原因の分からない状態になる（実際に起きた）
  await page.evaluate(() => localStorage.setItem("nekko_mock_fail_select", "kifus"));

  // ── 棋譜ライブラリ ──
  await page.goto("/kifus");
  // 開発ビルドは StrictMode で effect が2回走るため、同じ知らせが2枚出る
  // （本番ビルドでは1枚）。ここで見たいのは中身なので先頭だけを見る
  const toast = page.getByRole("alert").first();
  await expect(toast).toContainText("棋譜の取得に失敗しました");
  await expect(toast.getByRole("button", { name: "もう一度読む" })).toBeVisible();
  // 「まだ1件も無い」と読ませない。ここが一番まずい間違い方で、
  // DBには残っているのに消えたと読まれ、直す手がかりも無くなる
  await expect(page.getByText("保存した棋譜がまだありません")).toHaveCount(0);
  await expect(page.getByText("棋譜を読み込めませんでした")).toBeVisible();
  await expect(page.getByText("保存した棋譜が消えたわけではありません")).toBeVisible();

  // ── 傾向画面 ──
  // ここも空にせず知らせる。この画面が空だと「棋譜がまだ足りない」と読めてしまい、
  // 取れているはずの傾向が出ない理由にたどり着けない
  await page.goto("/kifus/insight");
  await expect(page.getByRole("alert").first()).toContainText("棋譜の取得に失敗しました");
  await expect(page.getByText("棋譜を読み込めませんでした")).toBeVisible();

  // ── 直ったら、もう一度読むで戻る ──
  await page.evaluate(() => localStorage.removeItem("nekko_mock_fail_select"));
  await page.getByRole("button", { name: "もう一度読む" }).first().click();
  await expect(page.getByText("棋譜を読み込めませんでした")).toHaveCount(0);

  // わざと失敗させているので、db.js が出すログはあって当然
  const unexpected = errors.filter((e) => !/fetchMyKifus error|fetchKifusForAnalysis error/.test(e));
  expect(unexpected).toEqual([]);
});
