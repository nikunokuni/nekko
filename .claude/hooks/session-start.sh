#!/bin/bash
# ══════════════════════════════════════════════════════════════════
# SessionStart フック ― Claude Code on the web 用のセットアップ
#   コンテナは毎回まっさらな clone から始まるため node_modules が無い。
#   ここで依存を入れておくと、セッション開始直後から
#   npm test / npm run build がそのまま通る。
# ══════════════════════════════════════════════════════════════════
set -euo pipefail

# ローカル（手元のマシン）では何もしない。web セッションのときだけ動かす。
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# 依存が入っていれば何もしない（何度実行しても安全）
if [ -d node_modules ] && [ -f node_modules/.package-lock.json ]; then
  echo "依存はインストール済み"
  exit 0
fi

npm install --no-audit --no-fund
