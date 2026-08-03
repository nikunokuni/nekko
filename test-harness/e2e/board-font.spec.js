// 盤の駒が「あとから届いたフォント」で描き直されるかの回帰テスト。
//
//   index.html の日本語フォントは描画をブロックしない読み込みにしてある（画面を先に出すため）。
//   その代わり、盤を最初に描く時点ではまだフォントが来ていないことがある。
//   DOM の文字は届けばブラウザが勝手に描き直すが、**Canvas は描き直さない**。
//   ShogiBoard.jsx の useBoardFontReady が無いと、盤の駒だけがフォールバックの
//   書体で焼き付いたまま、リロードするまで直らない。
//
//   ここでは Google Fonts の応答をこちらで握り、
//   「盤を描いたあとにフォントが届く」順番を意図的に作って確かめる。
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { login, createTree, watchForAppErrors } from "./helpers.js";

// 環境にある日本語フォント。フォールバック（serif）とは見た目が大きく違うものを選ぶ。
// 違う書体でないと「描き直された」ことをピクセルで確かめられない
const LATE_FONT = "/usr/share/fonts/opentype/unifont/unifont_jp.otf";

// 盤のcanvasの中身を文字列で取り出す（描き直しの有無を比べるため）
async function boardPixels(page) {
  return page.locator("canvas[width='342']").evaluate((c) => c.toDataURL());
}

test("あとから届いたフォントで盤の駒が描き直される", async ({ page }) => {
  const errors = watchForAppErrors(page);

  // フォントを送り出す合図。これを呼ぶまで応答を返さない＝「まだ届いていない」状態を保つ
  let release;
  const held = new Promise((r) => { release = r; });

  // login() が入れる遮断より後に登録する（Playwright は後から登録した route を優先する）
  await login(page);

  await page.route(/fonts\.googleapis\.com/, async (route) => {
    await held;
    await route.fulfill({
      status: 200,
      contentType: "text/css",
      body: `@font-face{font-family:'Noto Serif JP';font-style:normal;font-weight:400 700;`
          + `src:url(/late-font.otf) format('opentype');font-display:swap;}`,
    });
  });
  await page.route("**/late-font.otf", (route) =>
    route.fulfill({ status: 200, contentType: "font/otf", body: readFileSync(LATE_FONT) }));

  // index.html を読み直させる。login() の時点の取得はすでに終わっており、
  // SPA の画面遷移では index.html を取り直さないため、ここで開き直さないと
  // 上で仕掛けた route に一度も当たらない
  await page.goto("/");

  // 盤のあるノードを開く
  await createTree(page, "フォントテスト");
  await page.getByText("居飛車", { exact: true }).first().click();
  await page.waitForURL(/\/node\//);
  await page.getByText(/タップして盤面を追加/).click();
  await expect(page.locator("canvas[width='342']")).toBeVisible();
  await page.waitForTimeout(400);

  // ── ① フォントが届く前：フォールバックで描かれている ──
  const before = await boardPixels(page);
  // document.fonts.check() は未登録の書体名にも true を返す（フォールバックで
  // 描けるかを答える仕様）ので使えない。登録済みの書体そのものを見る
  expect(await page.evaluate(() => [...document.fonts].some(
    (f) => f.family.replace(/['"]/g, "") === "Noto Serif JP" && f.status === "loaded"))).toBe(false);

  // ── ② ここでフォントを届ける ──
  release();
  await page.waitForFunction(() => [...document.fonts].some(
    (f) => f.family.replace(/['"]/g, "") === "Noto Serif JP" && f.status === "loaded"),
    null, { timeout: 10_000 });

  // ── ③ 盤が描き直されている ──
  //    useBoardFontReady を外すと、ここで before と同じ絵のままになり落ちる
  await expect.poll(() => boardPixels(page), { timeout: 5_000 })
    .not.toBe(before);

  expect(errors).toEqual([]);
});
