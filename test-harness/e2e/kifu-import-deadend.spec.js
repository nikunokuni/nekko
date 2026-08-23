// 取り込みで「押したのに何も起きない／黙って集計から外れる」を作らないための見張り。
//
//   どちらも画面は落ちず、エラーも出ない壊れ方をする。
//     ・貼り付けたのに「保存する」が押せない … 灰色のボタンは理由を説明できないので、
//       利用者からは「このアプリは貼り付けに対応していない」に見える
//     ・未回答が「分析しない」の選択色で並ぶ … そのまま保存でき、
//       保存も成功するが、傾向画面は 0局のまま（原因は取り込み画面にあるので気づけない）
import { test, expect } from "@playwright/test";
import { login, watchForAppErrors, KIF_SAMPLE } from "./helpers.js";

// 対局者名だけ差し替えた KIF を作る（自分の名前は毎局同じ、相手だけ変わる）
function kifWith(opponent) {
  return KIF_SAMPLE.replace("後手：たろう", `後手：${opponent}`);
}

async function openSaveModal(page) {
  await page.getByRole("button", { name: "棋譜を保存" }).click();
  await expect(page.getByPlaceholder("将棋アプリやサイトからコピーした棋譜")).toBeVisible();
}

test("貼り付けたまま「保存する」を押しても行き止まりにならない", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await page.getByRole("button", { name: "棋譜ライブラリ" }).click();

  // ── 1回目：名前が未登録なので、押すと読み込んで先後を聞く（黙って保存はしない）──
  // 分からないまま保存すると、その棋譜は集計に載らないまま溜まっていく
  await openSaveModal(page);
  await page.getByPlaceholder("将棋アプリやサイトからコピーした棋譜").fill(KIF_SAMPLE);
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByText("あなたがどちらか選んでから")).toBeVisible();
  await page.getByRole("button", { name: "にく", exact: true }).click();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByRole("button", { name: "棋譜を保存" })).toBeVisible();
  await expect(page.getByText("貼り付けた棋譜1", { exact: true })).toHaveCount(1);

  // ── 2回目：名前を覚えたので、貼って「保存する」だけで保存できる ──
  // 「貼り付けた棋譜を読み込む」を押さないと保存できない形に戻ったら、ここで落ちる
  await openSaveModal(page);
  await page.getByPlaceholder("将棋アプリやサイトからコピーした棋譜").fill(kifWith("じろう"));
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByRole("button", { name: "棋譜を保存" })).toBeVisible();
  await expect(page.getByText("貼り付けた棋譜1", { exact: true })).toHaveCount(2);

  expect(errors).toEqual([]);
});

test("まだ答えていない棋譜は「分析しない」が選ばれた見た目にならず、名前1回でまとめて片付く", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await page.getByRole("button", { name: "棋譜ライブラリ" }).click();

  await openSaveModal(page);
  await page.locator("#kifu-lib-file-input").setInputFiles(
    ["たろう", "じろう", "さぶろう"].map((opponent, i) => ({
      name: `2026-08-0${i + 1}.kif`,
      mimeType: "text/plain",
      buffer: Buffer.from(kifWith(opponent), "utf8"),
    }))
  );
  await expect(page.getByText("3件であなたがどちらか分かりません")).toBeVisible();

  // 未回答の行で「分析しない」が選択色（金）で塗られていないこと。
  // ここが塗られていると、初回の一括取り込みは全行が「分析しないと決めた」状態に見え、
  // そのまま保存されて全件が集計から外れる
  const noAnalysis = page.getByRole("button", { name: "分析しない" }).first();
  await expect(noAnalysis).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  // 名前を1回選ぶだけで3件とも片付く（行ごとに3回選ばせない）
  await page.getByRole("button", { name: "にく（3件）" }).click();
  await expect(page.getByText("であなたがどちらか分かりません")).toHaveCount(0);
  await expect(page.getByText("あなた：にく（先手）")).toHaveCount(3);

  await page.getByRole("button", { name: "3件を保存する" }).click();
  await expect(page.getByRole("button", { name: "棋譜を保存" })).toBeVisible();

  // 3件とも「自分の側」が決まっているので、傾向にそのまま載る
  await page.getByRole("button", { name: "棋譜の傾向" }).click();
  await expect(page.getByText("3局中 0勝3敗")).toBeVisible();
  await expect(page.getByText("自分の側が不明")).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("棋譜が0件のときの傾向画面は、空の機能一式ではなく次の一手だけを出す", async ({ page }) => {
  const errors = watchForAppErrors(page);
  await login(page);
  await page.goto("/kifus/insight");

  await expect(page.getByText("棋譜がまだありません")).toBeVisible();
  // 0局なのに「0%」と言い切らない（勝率0ではなく、まだ数字が無い）
  await expect(page.getByText("0%")).toHaveCount(0);
  // 判定すべき棋譜がまだ無いのに「判定できていません」と言わない
  await expect(page.getByText("棋譜のどちらが自分かを判定できていません")).toHaveCount(0);
  // フィルタや観点の並びも出さない（使えるのに全部空、を作らない）
  await expect(page.getByText("分岐を探す")).toHaveCount(0);

  await page.getByRole("button", { name: "棋譜ライブラリへ" }).click();
  await expect(page.getByRole("button", { name: "棋譜を保存" })).toBeVisible();

  expect(errors).toEqual([]);
});
