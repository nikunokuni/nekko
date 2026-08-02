# ねっこ（nekko）

将棋の定跡ツリーを自分で育てるための PWA。React + Vite + Supabase。
UI 文言・コメント・コミットメッセージはすべて日本語。

---

## よく使うコマンド

```bash
npm install                # 依存インストール
npm run dev                # 開発サーバ（実 Supabase に接続。.env が必要）
npm run dev:mock           # 開発サーバ（Supabase をローカルモックに差し替え／.env 不要）

npm run lint               # 静的チェック（バグになりうる書き方だけを見る）
npm test                   # ロジックのユニットテスト（数秒）
npm run test:e2e           # UI自動テスト（ブラウザで実際に操作。15秒ほど）
npm run test:all           # lint → test → test:e2e を通しで

npm run build              # 本番ビルド
```

E2E は初回だけブラウザの用意がいる：`npx playwright install chromium`。
ブラウザが別の場所にすでにある環境では `PLAYWRIGHT_CHROMIUM_PATH` で指定できる。

**バックエンド無しで動かしたいときは `npm run dev:mock`。** 任意の ID/パスワードで新規登録すれば
localStorage 上で全機能が触れる（`test-harness/supabaseMock.js`）。手動 QA はこれが基本。

`.env` は `.env.example` をコピーして作る（`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`）。

---

## ディレクトリの地図

```
src/
  App.jsx           ルート。URL→画面の合成と、変更操作（DB更新＋treeOps＋遷移）の統括
  main.jsx          エントリ
  db.js             Supabase クライアントと全 DB 操作（★ supabase を触るのはここだけ）
  treeOps.js        ツリー変更の純粋関数（childIds / merge_parent_ids / tags の整合）
  data.js           定数・メタ（駒ラベル / 戦法グループ / ステータス定義 / 盤面テンプレ）
  theme.js          デザイントークン T と共通スタイル
  rewards.js        ご褒美（ログイン記録・バッジ・カスタムタグ）。真実源は profiles テーブル
  onboarding.jsx    初回オンボーディング一式（文面・ロジック・表示レイヤ）
  ShogiBoard.jsx    将棋盤ウィジェット（Canvas 描画 / 駒移動 / 棋譜の録画・再生）
  version.js        バージョン表示（値は vite.config.js の define で埋め込み）

  screens/          画面ごとに1ファイル
    TreeListScreen / MindMapScreen / NodeDetailScreen / NodeSearchScreen
    KifuListScreen / KifuInsightScreen / TrophyScreen / SettingsScreen
    node/           ノード詳細画面のセクション（Parent / TurnEval / Tsuika /
                    Children / KifuPickerModal / sectionParts）
  screensPublic.jsx 認証画面・公開ツリー画面
  components.jsx    共通 UI パーツ（MiniBoard / IconButton / StatusChip / Accordion ほか）
  components/       やや大きめの UI パーツ（uiParts.jsx / 各種モーダル・バナー）
  hooks/            useAuth / useTreeData / useFontScale / useRecoveryCode / usePwaUpdate

  ── 棋譜まわり（純粋ロジック。Node から直接 import できる） ──
  kifuFile.js       KIF/CSA ファイル読み込み（Shift_JIS 対応）
  kifuParser.js     棋譜テキスト → 盤面スナップショット列・対局情報
  kifuFeatures.js   盤面 → 特徴抽出（飛車の筋 / 囲い / 角交換の有無）
  kifuAnalyze.js    棋譜1件の解析（parser + features のまとめ役）
  kifuStats.js      特徴の階層的集計（母数が足りる一番細かい粒度を自動採用）
  kifuBranching.js  ためた棋譜から「分岐の候補」を出す

supabase/migrations/  スキーマ変更（YYYYMMDD_内容.sql）
test-harness/         モック Supabase・ユニットテスト・QA レポート
e2e/                  UI自動テスト（Playwright）
docs/                 設計メモ（「なぜそう決めたか」の記録）
```

---

## 設計の約束ごと

1. **Supabase に触るのは `db.js` だけ。** 画面から直接 `supabase` を呼ばない。
2. **ツリーの組み替えは `treeOps.js` の純粋関数を通す。** `childIds` /
   `mergeParentIds` / `tags` の整合を手作業でやると必ず壊れる（過去に繰り返した）。
   App.jsx のハンドラは「DB 更新 → treeOps でローカルツリーを組み替え → 遷移」の形。
3. **画面は URL から導出する。** `screen` という文字列 state は持たない
   （共有リンク・ブラウザバック・ブックマークを効かせるため）。
4. **棋譜まわりのロジックは純粋関数に保つ。** `kifu*.js` は React にも
   `import.meta.env` にも依存させない。壊すと `npm test` が動かなくなる。
   相対 import は拡張子まで書く（`./data.js`）― Node 直実行で解決するため。
5. **統計は必ずコードで計算する。** LLM に盤面の形勢判断はさせない（設計判断の詳細は
   `docs/kifu-analysis.md`）。
6. **バージョンは `package.json` の version が一次情報。** 画面表示はそこから埋め込む。
7. **色・余白・共通スタイルは `theme.js` から取る。** その場で書いた色や
   `resize:"none"` 一式をコピーしない（`T` / `INPUT_STYLE` / `TEXTAREA_STYLE` /
   `focusBorder` / `blurBorder`）。
8. **アイコンだけのボタンには名前を付ける。** `IconButton` の `label` は必須。
   読み上げソフトに何のボタンか伝わらず、自動テストからも掴めなくなるため。

---

## テスト

**ロジック** — `test-harness/*.test.mjs` に置けば `npm test` が自動で拾う
（依存ゼロ・Node 直実行）。treeOps と棋譜解析をカバーしている。

**UI** — `e2e/*.spec.mjs`（Playwright）。モック構成をビルドしてブラウザで実際に
操作する。実バックエンドも `.env` も要らない。主要動線（登録・ツリー作成・
ノード編集・ついか・分岐追加・棋譜の保存とツリーへの送り込み）を押さえてある。

E2Eを書くときの約束：

- `e2e/fixtures.mjs` から `test` を import する（外部フォントの読み込みを遮断
  する。これを外すと1テスト40秒級まで遅くなる）。
- 共通操作は `e2e/helpers.mjs` に置く。使い方トーストは `skipOnboarding` で
  既読にしてから操作する（画面を覆ってクリックを吸うため）。
- 保存の確認は「画面のstate」ではなく、リロードして**保存された内容**を見る。

見た目そのもの（配置・色）は自動テストの対象外なので、`npm run dev:mock` で
実際に触って確認する。

---

## DB スキーマを変えるとき

1. `supabase/migrations/YYYYMMDD_内容.sql` を追加する（既存ファイルは編集しない）。
2. `src/db.js` の該当関数と行→オブジェクト変換（`nodeRowToNode` など）を合わせる。
3. モック（`test-harness/supabaseMock.js`）も必要なら追随させる。

---

## 変更を出すまで

`npm run test:all`（lint → ユニット → E2E）と `npm run build` が通ることを
確認してからコミットする（CI でも同じことを見る）。
コミットメッセージは日本語で「何ができるようになったか」を書く（例：
`棋譜から勝敗・戦型を読み取り、傾向を集計できるようにした`）。
