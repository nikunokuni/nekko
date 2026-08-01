# ねっこ（nekko）

将棋の戦法をツリー（マインドマップ）で整理する、モバイル向けの研究ノートアプリ。

## 目的

**1級くらいの人が、序中盤の戦法の使い分けをできるようになること。**
すなわち「**相手の出方に合わせて、有効な方針を選べる**」状態を作る。

- **ツリー作りは目的ではなく手段。** 分岐図を書くこと自体がゴールではなく、
  「相手がこう来たら自分はこう」という判断の引き出しが増えることがゴール。
- **ねっこは「研究ノートを書く道具」。** 強さを判定する道具でも、局面を評価する道具でもない。
  エンジンは積んでいない（評価値は手入力）。
- **棋譜の読み込み・分析は、そのノート書きを助ける補助機能。** 主役ではない。

### ターゲット

級位者〜有段者手前（1級前後）。定跡書を1冊読み通すより、
自分の実戦から「自分用の分かれ道」を作るほうが早く効く層。

### 設計の芯 ―― 何を自動化し、何を自動化しないか

ノードの主要項目（`situation` / `myApproach` / `usageLevel` / `winRate` /
`likeLevel` / `orientation` / `studyMemo` / `openingFocus` / 一言コメント）は
**ほぼ全てが主観の記録**であり、ここがこのアプリの価値の中心。

- **自動化しない**：ノードの中身（狙い・意識・好き嫌い・方針の言語化）。
  手で並べ替え、自分の言葉で書く過程そのものが商品。
- **自動化してよい**：面倒なだけで機械が確実にできること。
  すなわち「この棋譜は既存のどのノードの続きか」の**照合**と、
  「複数の実戦を重ねたとき、どこで相手の手が割れているか」の**分岐地点の検出**。

自動生成の出力は**必ず「候補」として提示し、ユーザーが1件ずつ採用する**。
ツリーへ直接生やさない（精度が低くても成立し、掃除の手間を生まないため）。

構造の原則：**相手の出方＝ノードの分かれ目、自分の方針＝ノードの中身。**
これは `situation`（相手の戦法）/ `myApproach`（自分の戦法）に対応する。

> 棋譜の一括読み込みと自動ツリー生成の設計は `docs/kifu-auto-tree.md` を参照。

## 技術構成

- React 18 + Vite 5 + react-router-dom 7（SPA / PWA）
- Supabase（Auth + Postgres、RLS で本人のみ読み書き）
- ホスティングは Vercel（SPA のディープリンクは `vercel.json` で rewrite）
- 依存は最小限。UIライブラリは使わず、`src/theme.js` のトークンとインラインスタイルで構築
- アイコンは `@tabler/icons-webfont` を自ホスト読み込み（CDN依存なし）

## コマンド

```bash
npm install
npm run dev      # 通常起動（Supabase 接続。.env に VITE_SUPABASE_* が必要）
npm run build
npm run preview

# バックエンドなしで全機能を触る（QA用。localStorage に永続化）
npx vite --config vite.mock.config.js

# 純粋関数のテスト
node test-harness/treeOps.test.mjs
```

環境変数は `.env.example` を参照（`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`）。

## 構成

```
src/
  App.jsx              ルート。URL→画面の合成と、変更操作（DB更新＋treeOps＋遷移）の統括
  db.js                Supabase アクセスと行↔オブジェクトの変換を集約
  treeOps.js           ツリー変更の純粋関数群（tree in → 新tree out。DBアクセスなし）
  data.js              定数・メタ（駒ラベル / 初期盤面 / 戦法タグ / 表示メタ / 盤面テンプレ）
  kifuParser.js        KIF・CSA → 盤面スナップショット配列
  kifuFile.js          棋譜ファイル読み込み（Shift_JIS 対応）
  ShogiBoard.jsx       盤面の表示・編集・棋譜再生
  rewards.js           ログイン記録・バッジ・カスタムタグ（真実源は profiles テーブル）
  onboarding.jsx       初回オンボーディング（使い方トースト＋指さし）
  theme.js             デザイントークン
  screens/             画面ごとのコンポーネント
  hooks/               useAuth / useTreeData / useFontScale / usePwaUpdate ほか
supabase/migrations/   スキーマ変更（Supabase の SQL Editor で手動実行）
test-harness/          Supabase モックと QA レポート
```

### 主要な概念

- **ツリー / ノード** … ツリーは `rootId` を持ち、ルートノードのラベルはツリー名と同一。
  ノードは `parentId` / `childIds` の木構造に加え、`mergeParentIds`（合流＝追加の親子リンク）を持つ。
- **棋譜ライブラリ（`kifus` テーブル）** … ノードから独立した棋譜置き場。
  ノードへの取り込みは参照ではなく**コピー**（公開・`copy_tree` との整合のため）。
- **`branchFromMoveIndex`** … そのノードが親の棋譜の何手目から分岐（切り出し）されたか。
- **表示項目カスタマイズ** … `TSUIKA_ITEMS` の項目を設定でON/OFFできる。
  OFFは表示を消すだけで、入力済みデータは消さない（DB列名は歴史的経緯で `tsuika_visibility`）。

## 規約

- **コメント・UI文言・コミットメッセージはすべて日本語。**
  モジュール先頭には `═` 罫線のヘッダコメントで役割を書く（既存ファイルの体裁に合わせる）。
- コメントは「何をしているか」より**「なぜそうしたか」**を書く。既存コードはその密度で書かれている。
- **ツリーの構造変更は必ず `treeOps.js` の純粋関数を通す。**
  `childIds` / `mergeParentIds` / `tags` の整合を1箇所に集約するための設計で、
  各ハンドラが手作業で組み替えていた頃は不整合バグが繰り返し起きていた。
- **DBスキーマの変更は `supabase/migrations/` にファイルを追加**する（既存ファイルは編集しない）。
  `nodes` に列を追加したら、`copy_tree` RPC の列リストも併せて更新すること
  （過去に更新漏れによる不具合が複数回発生している）。
- バージョンは `package.json` が一次情報。`vite.config.js` の `define` で埋め込む。
- モバイル前提。タップ領域・文字サイズ（`useFontScale`）・オフライン動作（PWA）を壊さない。
