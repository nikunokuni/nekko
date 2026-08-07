// E2E テストの共通手順。
//   各テストは「まっさらな状態で新規登録するところ」から始める。
//   モックDBは localStorage なので、ブラウザコンテキストが分かれていれば互いに干渉しない。
import { expect } from "@playwright/test";
import { readFileSync } from "node:fs";

// 実戦の棋譜サンプル（四間飛車 vs 居飛車）。取り込みテストで使う。
// test-harness/kifuAnalysis.test.mjs と同じ内容で、あちらは解析ロジック、こちらは画面を見る。
export const KIF_SAMPLE = `# ---- Kifu for Windows ----
開始日時：2026/07/20 10:00:00
手合割：平手
先手：にく
後手：たろう
手数----指手---------消費時間--
   1 ７六歩(77)   ( 0:01/00:00:01)
   2 ３四歩(33)   ( 0:01/00:00:01)
   3 ６六歩(67)   ( 0:01/00:00:02)
   4 ８四歩(83)   ( 0:01/00:00:02)
   5 ６八飛(28)   ( 0:01/00:00:03)
   6 ８五歩(84)   ( 0:01/00:00:03)
   7 ７七角(88)   ( 0:01/00:00:04)
   8 ５四歩(53)   ( 0:01/00:00:04)
   9 ４八玉(59)   ( 0:01/00:00:05)
  10 ６二銀(71)   ( 0:01/00:00:05)
  11 ３八玉(48)   ( 0:01/00:00:06)
  12 ４二玉(51)   ( 0:01/00:00:06)
  13 ２八玉(38)   ( 0:01/00:00:07)
  14 ３二玉(42)   ( 0:01/00:00:07)
  15 ５八金(69)   ( 0:01/00:00:08)
  16 ７四歩(73)   ( 0:01/00:00:08)
  17 ３八銀(39)   ( 0:01/00:00:09)
  18 ２二玉(32)   ( 0:01/00:00:09)
  19 ９六歩(97)   ( 0:01/00:00:10)
  20 ９四歩(93)   ( 0:01/00:00:10)
  21 投了         ( 0:01/00:00:11)
まで20手で後手の勝ち
`;

// アプリが投げたJSエラーを拾ってテストを落とす。
//   外部フォントの取得失敗は環境要因（オフラインでも動くのが正しい姿）なので除く。
export function watchForAppErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/ERR_CONNECTION_RESET|unsupported MIME type|net::ERR_/.test(t)) return;
    errors.push(`console: ${t}`);
  });
  return errors;
}

// ── 外部フォントの取得を遮断する ─────────────────
// 外に出られない環境で、届かないフォントの取得を延々と待たせないための遮断。
//
// 以前は index.html が Google Fonts を描画をブロックする形で読んでいたため、
// これが**E2Eの時間のほとんど**だった（1回の遷移に約13秒 → 遮断で約0.35秒）。
// 今は index.html 側を描画をブロックしない読み込みに直したので、遮断しなくても
// 表示は待たされない（実測 290ms）。それでも遮断を残しているのは、
// 外部への接続試行をテストから無くして結果を環境に左右されなくするため。
//
// アプリはフォントが無くても serif フォールバックで動く前提なので（index.html のコメント）、
// E2Eでは取らない。フォントが「あとから届いた」ときの挙動だけは board-font.spec.js が
// この遮断を上書きして確かめている。
export async function blockExternalFonts(page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
}

// 初回の使い方トーストを最初から「表示済み」にしておく。
//   トーストは画面を覆ってクリックを吸うので、E2Eでは出さないのが素直。
//   ただし新規登録はこの既読履歴を意図的にリセットする（初めての人に使い方を見せるため）ので、
//   登録後の画面では効かない。そちらは dismissOnboarding で送り切る。
//   login() は登録を通らないぶんリセットされず、これだけでトーストが出なくなる。
//   トースト自体の見え方は onboarding の専用テストで確かめる領分。
//
// 画面の名前は src/onboarding.jsx の ONBOARD_MESSAGES から**読み取る**。
//   ここに手で書き写していたときは、画面を1つ足すたびに写し忘れる余地があった。
//   写し忘れるとその画面だけトーストが出てクリックを吸い、E2Eが
//   「押したはずのボタンが効かない」という原因の分かりにくい落ち方をする。
//   onboarding.jsx は JSX なので Node から import できない。テキストとして読む。
function readOnboardKeys() {
  const src = readFileSync(new URL("../../src/onboarding.jsx", import.meta.url), "utf8");
  const start = src.indexOf("export const ONBOARD_MESSAGES = {");
  const body  = src.slice(start, src.indexOf("\n};", start));
  // 2字下げの「キー: [」だけを拾う（入れ子の JSX や ONBOARD_TARGETS を巻き込まない）
  const keys = [...body.matchAll(/^ {2}(\w+):\s*\[/gm)].map((m) => m[1]);
  // 読めなくなったら黙って素通りさせない。0個だとトーストが出っぱなしになり、
  // 原因が分からないままE2Eが落ち続ける
  if (start < 0 || keys.length === 0) {
    throw new Error("src/onboarding.jsx から画面名を読み取れませんでした（書式が変わった？）");
  }
  return keys;
}
const ONBOARD_KEYS = readOnboardKeys();

export async function skipOnboarding(page) {
  await page.addInitScript((keys) => {
    const seen = Object.fromEntries(keys.map((k) => [k, true]));
    localStorage.setItem("nekko_onboard_seen", JSON.stringify(seen));
  }, ONBOARD_KEYS);
}

// 新規登録してツリー一覧まで進む。テストごとに別アカウントを作る。
//   画面を実際に操作するので遅い（1本あたり10秒前後）。登録動線そのものを見張る
//   テストだけがこれを使い、他は login() を使う。
export async function signUp(page) {
  await blockExternalFonts(page);
  await skipOnboarding(page);
  await page.goto("/");
  await page.getByText("新規登録", { exact: true }).first().click();

  const id = `e2e${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const inputs = page.locator("input");
  for (let i = 0, n = await inputs.count(); i < n; i++) {
    const type = await inputs.nth(i).getAttribute("type");
    await inputs.nth(i).fill(type === "password" ? "pass1234" : id);
  }
  await page.getByRole("button", { name: "アカウントを作成" }).click();

  // 登録直後はリカバリーコードのモーダルが必ず出る（閉じないと他が押せない）
  await page.getByRole("button", { name: /保存しました/ }).click();
  await dismissOnboarding(page);
  await expect(page.getByRole("button", { name: "新しいツリーを作る" })).toBeVisible();
  return id;
}

// ── ログイン済みの状態から始める ───────────────────
// モックDBは localStorage が実体なので、登録画面を操作する代わりに
// 「登録直後と同じ中身」を直接書いてから開く。
//
// これをやる理由：登録動線は毎回同じで、しかも遅い。フォーム入力・リカバリーコード
// モーダル・使い方トーストの送り切りで1本あたり10秒以上を使っていた。
// 見張りたいのはその先の機能なので、そこに毎回10秒払うとテストを増やせなくなる。
// 登録動線そのものは signUp() を使う専用テストが1本見ている。
//
// 一方、ツリーの中身（ルート＋初期の枝＋「とりあえず」）は**ここで作らない**。
// 作ってしまうと App.jsx の handleNewTree が変わってもテスト側は古い形のまま通り、
// 「壊れているのに緑」になる。ツリーは createTree() で今までどおり画面から作る。
const MOCK_DB_KEY   = "nekko_mock_db_v1";   // test-harness/supabaseMock.js と揃える
const MOCK_AUTH_KEY = "nekko_mock_auth_v1";

// ── 他人の公開ツリーを1本ぶん、モックDBの行として組み立てる ──
// 「みんなで編集」は他の利用者のツリーを触る機能なので、テストには
// **自分ではないアカウントのツリー**が要る。1つのブラウザで2人分ログインは
// できないので、相手のツリーだけを実データとして置く。
//
// ツリーの中身を seed で作らないのが原則（App.jsx の作成処理が変わっても
// テストが古い形のまま通ってしまうため）だが、ここで作るのは
// **試験の対象ではない他人の持ち物**＝ただの前提条件なので seed でよい。
// 自分のツリーは今までどおり createTree() で画面から作る。
export function makeForeignTree({ ownerName, treeName, nodeLabels = [], collaborative = false }) {
  const ownerId = crypto.randomUUID();
  const treeId  = crypto.randomUUID();
  const rootId  = crypto.randomUUID();
  const now     = new Date().toISOString();

  const nodes = [
    { id: rootId, tree_id: treeId, user_id: ownerId, parent_id: null, label: treeName,
      is_root: true, status: "todo", sort_order: 0, created_at: now },
    ...nodeLabels.map((label, i) => ({
      id: crypto.randomUUID(), tree_id: treeId, user_id: ownerId, parent_id: rootId,
      label, is_root: false, status: "todo", sort_order: i, created_at: now,
    })),
  ];

  return {
    treeId,
    profile: { id: ownerId, username: ownerName, display_name: ownerName, created_at: now },
    tree: {
      id: treeId, user_id: ownerId, name: treeName, tags: [], active: true,
      is_public: true, is_collaborative: collaborative, liked_by: 0, quick_memo: "",
      created_at: now, updated_at: now,
    },
    nodes,
  };
}

// foreignTrees … makeForeignTree() の戻り値の配列。他人の公開ツリーを最初から置く
// username     … ログインするアカウントのID。開発者だけの機能（みんなで編集）を
//                 見るテストで "niku" を渡す。既定はテストごとに別のランダムID
export async function login(page, { foreignTrees = [], username } = {}) {
  const id     = username || `e2e${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const userId = crypto.randomUUID();
  // src/db.js の idToFakeEmail と同じ変換（Supabase Auth が email 必須なため）
  const email  = `${id}@nekko.local`;
  const now    = new Date().toISOString();

  const user = {
    id: userId, email, created_at: now,
    user_metadata: { username: id, display_name: id },
  };
  const db = {
    users:    [{ ...user, password: "pass1234" }],
    // profiles 行は本番ではDBトリガーが作る。モックの signUp と同じ形にする
    profiles: [{ id: userId, username: id, display_name: id, created_at: now },
               ...foreignTrees.map((f) => f.profile)],
    trees: foreignTrees.map((f) => f.tree),
    nodes: foreignTrees.flatMap((f) => f.nodes),
    likes: [], kifus: [],
    // 発行済みにしておく。未発行だと useRecoveryCode がログイン直後に
    // 「スクショしてね」モーダルを出し、閉じるまで他が押せない
    recovery_codes: [{ user_id: userId, code: "ABCD2345EFGH6789" }],
  };

  await blockExternalFonts(page);
  await skipOnboarding(page);
  await page.addInitScript(({ dbKey, authKey, db, user }) => {
    // addInitScript は遷移のたびに走る。無条件に書くとテスト中に作ったツリーが
    // ページ遷移で消えるので、まだ何も無いときだけ書き込む
    if (!localStorage.getItem(dbKey))   localStorage.setItem(dbKey, JSON.stringify(db));
    if (!localStorage.getItem(authKey)) localStorage.setItem(authKey, JSON.stringify(user));
  }, { dbKey: MOCK_DB_KEY, authKey: MOCK_AUTH_KEY, db, user });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "新しいツリーを作る" })).toBeVisible();
  return id;
}

// 出てしまったトーストを最後の1枚まで送って消す。
//   新規登録は「使い方を最初から見せる」ために既読履歴をリセットするので（screensPublic.jsx）、
//   skipOnboarding を入れていても登録直後の画面ではトーストが出る。ここが実質の本命。
//   指さし（👆）の有無で判定すると、指さしの無い説明に来た時点で抜けてしまい、
//   トーストだけが画面に残ってクリックを吸う。トースト本体が消えるまで送り切る。
export async function dismissOnboarding(page) {
  const toast = page.locator("[data-onboard-toast]");
  // 指さしの位置を測っている一瞬だけトーストが消えるので、
  // 「2回続けて出ていない」を終了の合図にする
  let gone = 0;
  for (let i = 0; i < 20 && gone < 2; i++) {
    if (await toast.count() === 0) {
      gone++;
      await page.waitForTimeout(250);
      continue;
    }
    gone = 0;
    await toast.click({ force: true }).catch(() => {});
    await page.waitForTimeout(200);
  }
}

// トロフィー画面のヘッダー「獲得数 / 全体数」から獲得数だけを読む。
//   奥の画面を通ったことが記録されているか（＝認知系バッジが効いているか）を
//   前後で比べるために使う。この画面へ移動するので、開いていたモーダルは閉じる。
export async function earnedTrophyCount(page) {
  await page.goto("/trophy");
  const text = await page.getByText(/^\d+ \/ \d+$/).first().innerText();
  return Number(text.split("/")[0].trim());
}

// ツリーを1つ作ってマップ画面まで進む。作ったツリーのIDを返す。
export async function createTree(page, name) {
  await page.getByRole("button", { name: "新しいツリーを作る" }).click();
  await page.locator("input[type=text], input:not([type])").first().fill(name);
  await page.getByRole("button", { name: /作成|つくる|保存|OK/ }).last().click();
  await page.waitForURL(/\/tree\/[0-9a-f-]+$/);
  await dismissOnboarding(page);
  return page.url().split("/tree/")[1];
}
