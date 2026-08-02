// ══════════════════════════════════════════════════════════════════
// eslint.config.js  ―  静的チェックの設定
//
//   目的は「動かしてみて初めて気づくバグ」をコミット前に出すこと。
//   見た目の好み（クォート・セミコロン・インデント）は一切見ない。
//   このコードベースは1行に詰める書き方を意図的に使っている箇所が多く、
//   整形ルールを入れると本当に見たい警告が埋もれるため。
//
//   実行: npm run lint
// ══════════════════════════════════════════════════════════════════
import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "dev-dist/**", "node_modules/**", "public/**"],
  },

  // ── アプリ本体（ブラウザで動く） ──
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        // vite.config.js の define で埋め込む値（src/version.js が参照）
        __APP_VERSION__: "readonly",
        __BUILD_TIME__: "readonly",
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { react, "react-hooks": reactHooks },
    settings: { react: { version: "detect" } },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,

      // ── React 17+ の新しい JSX 変換を使うので不要なルール ──
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      // props の型宣言（PropTypes）はこのプロジェクトでは使わない方針
      "react/prop-types": "off",
      // 文字列中の ' や " をエスケープさせるルール。日本語UIでは実害がない
      "react/no-unescaped-entities": "off",

      // ── ここからが本命：実害のあるバグを捕まえるルール ──
      // useEffect / useCallback / useMemo の依存配列の漏れ。
      // 「古い値を掴んだまま再実行されない」系のバグの主因。
      "react-hooks/exhaustive-deps": "warn",
      // フックの呼び出し順序違反（条件分岐の中で呼ぶ等）は即バグなので error
      "react-hooks/rules-of-hooks": "error",

      // 未使用の変数・import。消し忘れや、書いたのに使っていない値の検出。
      //   _ 始まりの引数は「意図的に使わない」印として許可する。
      "no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      // console.log の消し忘れ（warn / error は残してよい）
      "no-console": ["warn", { allow: ["warn", "error"] }],

      // localStorage が使えない環境（プライベートモード等）を黙って無視する
      // `catch {}` はこのコードベースの定型なので、空の catch だけは許可する。
      "no-empty": ["error", { allowEmptyCatch: true }],

      // 全角スペース（　）は日本語UIの文面・正規表現で意図的に使う。
      // 「コードのインデントに紛れ込んだ全角スペース」だけを検出したいので、
      // 文字列・テンプレート・正規表現・JSXの地の文は対象から外す。
      "no-irregular-whitespace": ["error", {
        skipStrings: true, skipTemplates: true, skipRegExps: true,
        skipJSXText: true, skipComments: true,
      }],
    },
  },

  // ── Node で動くもの（設定ファイル・テスト・フック） ──
  {
    files: ["*.config.js", "test-harness/**/*.{js,mjs}", "e2e/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-irregular-whitespace": ["error", {
        skipStrings: true, skipTemplates: true, skipRegExps: true,
        skipJSXText: true, skipComments: true,
      }],
    },
  },
];
