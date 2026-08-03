// ESLint 設定（Flat Config）。
//   目的は「体裁の統一」ではなく「バグの機械検出」。
//   見た目の好み（インデント・クォート・セミコロン）には一切口を出さない設定にしてある。
//   既存コードの書き味を変えずに、React フックの依存漏れ・未定義変数・
//   リストの key 忘れといった“動くけど時々おかしい”系だけを拾う。
//
//   実行: npm run lint  /  自動修正: npm run lint:fix
import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    // 生成物・依存は対象外
    ignores: ["dist/", "dev-dist/", "node_modules/", "public/"],
  },

  // ── アプリ本体（ブラウザで動く src/） ──
  {
    files: ["src/**/*.{js,jsx}"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        // vite.config.js の define で差し込む定数（src/version.js が参照）
        __APP_VERSION__: "readonly",
        __BUILD_TIME__: "readonly",
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: "18.3" } },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...js.configs.recommended.rules,

      // ── フック（ここが本命）──
      // 条件分岐やループの中でフックを呼ぶと状態がずれる。必ずエラー。
      "react-hooks/rules-of-hooks": "error",
      // useEffect / useMemo の依存配列漏れ。既存箇所が多いのでまずは警告から。
      // 落ち着いたら "error" に上げる。
      "react-hooks/exhaustive-deps": "warn",

      // ── JSX の実バグ ──
      // JSX 内で使われている変数を「使用済み」と数える。
      //   これが無いと <TreeCard /> のような自作コンポーネントが全部
      //   「未使用」と誤検出される（no-unused-vars は JSX を読まないため）。
      "react/jsx-uses-vars": "error",
      // リストの key 忘れ（再描画時に入力欄の中身が別行に飛ぶ原因になる）
      "react/jsx-key": "error",
      // 存在しない props / 重複した props / 誤った DOM 属性名
      "react/jsx-no-duplicate-props": "error",
      "react/no-children-prop": "error",
      "react/no-direct-mutation-state": "error",
      // target="_blank" の rel 抜け（セキュリティ）
      "react/jsx-no-target-blank": "error",

      // ── 素の JS ──
      // 使われていない変数・import。ただし _ 始まりは「意図的に捨てている」印として許可。
      "no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      // 本番コードに console.log を残さない（warn/error は意図的な出力なので許可）
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // == ではなく ===（null 比較だけは慣用なので許す）
      eqeqeq: ["warn", "always", { null: "ignore" }],
      // 全角スペースは日本語の文章として意図的に使っている（コメント・画面文言）。
      // コード本体に紛れ込んだものだけを検出したいので、文章側は除外する。
      "no-irregular-whitespace": ["error", {
        skipComments: true, skipStrings: true, skipTemplates: true,
        skipJSXText: true, skipRegExps: true,  // KIF形式は全角スペース区切りなので正規表現にも出てくる
      }],
      // catch で握りつぶすのは「失敗しても続行してよい」という意思表示なので許可。
      // それ以外の空ブロック（if / for など）は書き忘れの疑いがあるので検出する。
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  // ── Node で動くファイル（設定・テスト・モック）──
  {
    files: [
      "*.config.js",
      "test-harness/**/*.{js,mjs}",
    ],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      // テストとモックは結果を標準出力に出すのが仕事なので console 自由
      "no-console": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-irregular-whitespace": ["error", {
        skipComments: true, skipStrings: true, skipTemplates: true,
      }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
