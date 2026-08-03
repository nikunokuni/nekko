# test-harness

実バックエンドなしでアプリを動かして手動/自動QAするための道具。アプリ本体（`src/`）は無改変。

- `supabaseMock.js` — `@supabase/supabase-js` 互換の最小モック。
  データは `localStorage`（`nekko_mock_db_v1` / `nekko_mock_auth_v1`）に永続化。
  auth（signUp/signIn/signOut/onAuthStateChange）、`from()` クエリビルダ
  （select/insert/update/delete, eq/in/order/single, count, 埋め込みリレーション
  `nodes(...)`/`profiles(...)`）、RPC（`copy_tree` / `get_app_stats`）、
  likes の一意制約と `liked_by` 同期トリガー相当を実装。

- `treeOps.test.mjs` — ツリー変更ロジックの純粋関数ユニットテスト。

- `kifuAnalysis.test.mjs` — 棋譜解析（対局情報のパース・特徴抽出・傾向集計）の
  ユニットテスト。

  テストは `npm test` でまとめて実行する（`test-harness/**/*.test.mjs` を自動で拾うので、
  新しいテストはこのディレクトリに `〜.test.mjs` の名前で置くだけでよい）。
  1本だけ動かしたいときは `node test-harness/treeOps.test.mjs` のように直接実行する。

- `e2e/` — ブラウザで主要動線を通すテスト（Playwright）。
  `supabaseMock.js` を使ったモック構成を自動で起動するので Supabase の準備は要らない。
  実行: `npm run test:e2e`（画面を見ながらなら `npm run test:e2e:headed`）。
  `helpers.js` に新規登録・ツリー作成などの共通手順と、棋譜のサンプルを置いてある。

- `QA_REPORT.md` — 2026-07-13 実施の全機能QAの結果（バグ・気になる仕様の一覧）。

## 使い方

```bash
npm install
npm run dev:mock   # モック差し替えで起動（ポート5173）
```

ブラウザで http://localhost:5173 を開き、任意のID/パスワードで新規登録すれば
そのままローカル完結で全機能を触れる。通常の `npm run dev` / `npm run build` には影響しない。
