// ══════════════════════════════════════════════════════════════════
// helpers.mjs  ―  E2Eテスト共通の操作
//   「登録してツリーを1つ開く」までは毎テストで必要なので関数にまとめる。
// ══════════════════════════════════════════════════════════════════
import { expect } from "@playwright/test";

/** 使い方トーストの既読を持つ localStorage のキー（src/rewards.js と対応） */
const ONBOARD_KEY = "nekko_onboard_seen";

/** テストごとに衝突しないIDを作る */
export function uniqueId(prefix = "tester") {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

/**
 * 使い方トーストを全画面ぶん「既読」にする。
 *
 * トーストは画面を覆うのでクリックを吸ってしまう。1枚ずつ送って消すのは
 * 枚数が変わるたびにテストが壊れるため、既読フラグを直接立ててから読み直す。
 * 新規登録は既読履歴をリセットする仕様なので、必ず登録の「後」に呼ぶこと。
 */
export async function skipOnboarding(page) {
  await page.evaluate((key) => {
    const seen = { list: true, map: true, node: true, kifus: true, search: true, settings: true, board: true };
    localStorage.setItem(key, JSON.stringify(seen));
  }, ONBOARD_KEY);
  await page.reload();
}

/**
 * 新規登録してツリー一覧まで進む。
 * モックの認証は localStorage 上で完結するので、実際のメール確認などは無い。
 */
export async function signUp(page, username = uniqueId()) {
  await page.goto("/");
  await page.getByText("新規登録", { exact: true }).click();
  await page.getByPlaceholder("例: tsuruga_7dan").fill(username);
  await page.getByPlaceholder("8文字以上").fill("password123");
  await page.getByRole("button", { name: "アカウントを作成" }).click();

  // 登録直後はリカバリーコードの控えを促すモーダルが出る
  await page.getByRole("button", { name: "保存しました" }).click();
  await expect(page.getByRole("button", { name: /新規/ })).toBeVisible();

  await skipOnboarding(page);
  return username;
}

/**
 * ツリーを新規作成する。
 * 作成すると、そのままそのツリーのマップ画面へ入る（一覧には戻らない）。
 */
export async function createTree(page, name) {
  await page.getByRole("button", { name: /新規/ }).click();
  await page.getByPlaceholder("例：中飛車").fill(name);
  await page.getByRole("button", { name: "作成する" }).click();
  await expect(page).toHaveURL(/\/tree\//);
  await expect(page.getByText(name).first()).toBeVisible();
}

/** ツリー一覧へ戻る */
export async function goToTreeList(page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /新規/ })).toBeVisible();
}

/** 一覧からツリーを開いてマップ画面へ入る */
export async function openTree(page, name) {
  await page.getByText(name).first().click();
  await expect(page).toHaveURL(/\/tree\//);
}
