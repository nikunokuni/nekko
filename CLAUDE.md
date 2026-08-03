# ねっこ（nekko）

将棋の研究を「木」でまとめる個人用の学習アプリ。相手の戦法ごとに自分の方針を
枝分かれで整理し、実戦の棋譜から傾向を出して次に作るべき分岐を見つける。

- ねらいは3つ：**①相手に合わせた自分の方針をまとめる ②自分の強み弱みを知る ③勉強の方針が立つ**
- 想定ユーザーの棋力は1級前後（＝同じ局面がほとんど再現しない帯）。この前提が棋譜分析の設計を決めている
- 設計の判断記録は `docs/kifu-analysis.md`（「なぜそう決めたか」を残す場所）

---

## コマンド

| やりたいこと | コマンド |
|---|---|
| 開発サーバ（要 Supabase） | `npm run dev` |
| **バックエンド無しで全機能を触る** | `npm run dev:mock` |
| Lint（バグ検出） | `npm run lint` / 自動修正 `npm run lint:fix` |
| ユニットテスト | `npm test` |
| E2E（ブラウザで主要動線） | `npm run test:e2e` / 見ながら `npm run test:e2e:headed` |
| 本番ビルド | `npm run build` |
| **コミット前の一括確認** | `npm run check`（lint → test → build） |
| **E2Eまで通す** | `npm run test:all`（lint → test → e2e） |

`.env` は `.env.example` を写して `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` を入れる。
`npm run dev:mock` なら `.env` 不要（`test-harness/supabaseMock.js` に差し替わり、localStorage で完結する）。

---

## 構成のあらまし

```
src/
  App.jsx            ルート。URL→画面の合成と、変更操作（DB更新＋treeOps＋遷移）の統括
  db.js              Supabase との境界。ここ以外から supabase を直接触らない
  treeOps.js         ツリー変更の純粋関数（childIds / merge_parent_ids / tags の整合）
  data.js            定数・メタ（駒ラベル / 初期盤面 / ステータス表示 など）
  theme.js           色・寸法のトークン
  rewards.js         トロフィーとオンボーディングの進捗記録（localStorage）
  onboarding.jsx     初回の使い方トースト＋指さし（文面・表示ロジック・表示レイヤ）
  ShogiBoard.jsx     盤面の表示・編集・棋譜再生
  screens/           画面ごとのコンポーネント
  components/        画面をまたぐ部品
  hooks/             状態の保持と取得（useAuth / useTreeData / useFontScale ほか）
  kifu*.js           棋譜まわり（下記）
test-harness/        バックエンド無しのQA環境とユニットテスト
supabase/migrations/ スキーマ変更（追記のみ。既存ファイルは書き換えない）
docs/                設計メモ
```

### 棋譜まわりの分担

```
kifuFile.js      ファイル読み込み（Shift_JIS 対応）
kifuParser.js    KIF/CSA テキスト → 盤面スナップショット列＋対局情報
kifuFeatures.js  盤面 → 特徴（飛車の筋・囲い・角交換の有無）
kifuAnalyze.js   上2つをつないで DB の kifus 行の形にする
kifuStats.js     特徴を階層的に集計して傾向を出す
kifuBranching.js ためた棋譜から「次に作るべき分岐」の候補を出す
```

**設計の芯**：級位者の実戦では同じ局面はまず再現しない。だから局面そのものではなく
**局面から読み取れる特徴**をキーに集計する。粗い粒度から細かい粒度まで同時に集計し、
母数が足りている一番細かい粒度を採用する（`kifuStats.js`）。

**機械は「事実と数字」、人間は「理由と狙い」。** 統計はすべてコードで計算し、
形勢判断や指し手の良し悪しは扱わない。

---

## 書き方の約束

### コメントは日本語で、「何を」ではなく「なぜ」を書く

このリポジトリの一番の資産はコメント。コードを読めば分かることは書かず、
**その判断に至った理由と、そうしなかった場合に何が起きるか**を残す。

```js
// 指が動いていたら（＝ページのスクロール）タップ扱いにしない。
// これがないと、盤の上を通るスクロールで指を離した位置の駒が選択・移動されてしまう
if (!start || Math.hypot(...) > 10) return;
```

ファイル先頭には、そのファイルの役割を書いた見出しコメントを置く（既存ファイルに倣う）。

### ツリーの変更は必ず `treeOps.js` を通す

`childIds` / `mergeParentIds` / `tags` の整合を手作業で取らない。
各ハンドラは「DB を更新 → `treeOps` の純粋関数でローカルツリーを組み替える」の順で書く。
純粋関数なので `test-harness/treeOps.test.mjs` でテストできる。

### Supabase は `db.js` の中だけ

画面やフックから `supabase` を直接叩かない。行 ↔ アプリ内オブジェクトの変換も
`nodeRowToNode` / `kifuRowToKifu` に寄せる。

### フックは早期 return より「前」に置く

```js
const something = useMemo(...);   // ← ここ
if (!node) return null;           // ← 早期 return はフックの後
```

逆にすると node が消えた瞬間にフックの個数が変わり、React が
"Rendered fewer hooks than expected" を投げて画面ごと落ちる。`npm run lint` が検出する。

### スタイルはインラインの `style={{}}`＋`theme.js`

CSS-in-JS ライブラリも CSS Modules も使っていない。色と寸法は `theme.js` のトークンを引く。

### アイコンだけのボタンには `aria-label` を付ける

絵しか無いボタンは、読み上げソフトでは「ボタン」としか読まれない。
`title` だけでは足りない（アイコンフォントが `::before` で文字を差し込むため、
名前の計算がそちらに引っ張られる）。`aria-label` は中身より強いので確実に名前が付き、
E2Eテストからも指せるようになる。

### 子コンポーネントに props を渡し忘れない

`onX && ...` で導線ごと出し分けている部品があるため、渡し忘れると
**ボタンが消えるだけで画面は崩れず、静かに機能が死ぬ**。実際に棋譜プレビューで起きた
（`test-harness/e2e/kifu-preview.spec.js` はその回帰テスト）。
`npm run lint` の「未使用の props」警告はこの兆候なので、必ず中身を見る。

### DB スキーマの変更は migration を追記

`supabase/migrations/YYYYMMDD_内容.sql` を**新規に足す**。既存ファイルは書き換えない。

### バージョン

`package.json` の `version` が唯一の出どころ。`vite.config.js` の `define` で
`__APP_VERSION__` として埋め込み、設定画面に出る。上げたら PWA の更新バナーが出る。

---

## テストの方針

- **純粋関数はユニットテストを書く**（`treeOps` / `kifu*`）。`test-harness/*.test.mjs` に置けば
  `npm test` が自動で拾う
- **主要動線はE2Eで見張る**（`test-harness/e2e/*.spec.js`）。モック構成を自動で起動するので
  Supabase の準備は要らない。細かい表示崩れは追わず「押したものが動くか」「落ちないか」だけ
- **バグを直したら、まず落ちるテストを書く**。直したあとに「バグをわざと戻すと落ちるか」まで
  確かめる（通るだけのテストは、効いているかどうか分からない）
- **それ以外は `npm run dev:mock` で手動確認**。任意のID/パスワードで新規登録すれば
  ローカル完結で全機能を触れる
- `src/` から import するときは**拡張子まで書く**（`./treeOps.js`）。
  test-harness が Node で直接実行するため

E2Eは初回の使い方トーストを `localStorage` に「表示済み」を書いて出さないようにしている
（`test-harness/e2e/helpers.js` の `skipOnboarding`）。トーストは画面を覆ってクリックを吸うため。

---

## 触るときの注意

- `src/screens/NodeDetailScreen.jsx` は約1500行あるが機能単位でまとまっている。
  ついでの分割はしない（差分が読めなくなる）
- ユーザー向けの文言はすべて日本語。将棋用語は正式名で（「舟囲い」「四間飛車」など）
- 囲い・戦法の判定条件は実戦の定義に合わせてある（`kifuFeatures.js`）。
  変えるときは `test-harness/kifuAnalysis.test.mjs` のケースも一緒に直す
- `npm run lint` は**エラー0を保つ**。残る警告も「既知だから無視」とは扱わない。
  未使用変数の警告から実際に機能が死んでいたのが見つかっている（上記の props 渡し忘れ）
