# test-harness

実バックエンドなしでアプリを動かして手動/自動QAするための道具。アプリ本体（`src/`）は無改変。

- `supabaseMock.js` — `@supabase/supabase-js` 互換の最小モック。
  データは `localStorage`（`nekko_mock_db_v1` / `nekko_mock_auth_v1`）に永続化。
  auth（signUp/signIn/signOut/onAuthStateChange）、`from()` クエリビルダ
  （select/insert/update/delete, eq/in/order/single, count, 埋め込みリレーション
  `nodes(...)`/`profiles(...)`）、RPC（`copy_tree` / `get_app_stats`）、
  likes の一意制約と `liked_by` 同期トリガー相当を実装。

- `QA_REPORT.md` — 2026-07-13 実施の全機能QAの結果（バグ・気になる仕様の一覧）。

## 使い方

```bash
npm install
npx vite --config vite.mock.config.js   # モック差し替えで起動（ポート5173）
```

ブラウザで http://localhost:5173 を開き、任意のID/パスワードで新規登録すれば
そのままローカル完結で全機能を触れる。通常の `npm run dev` / `npm run build` には影響しない。
