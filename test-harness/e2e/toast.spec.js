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
