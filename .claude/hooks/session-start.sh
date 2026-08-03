#!/bin/bash
# Claude Code on the web のセッション開始時に依存関係を入れる。
#   これが無いと、毎回まず `npm install` から始まることになり、
#   lint / test / build のどれもすぐには実行できない。
#   ローカル（自分のPC）では何もしない：手元の node_modules を勝手に触らないため。
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# npm ci ではなく npm install を使う：
#   コンテナはフック完了後の状態がキャッシュされるので、差分がなければ2回目以降は一瞬で終わる。
#   （npm ci は毎回 node_modules を消して入れ直すためキャッシュが効かない）
npm install --no-audit --no-fund

echo "nekko: 依存関係の準備が完了しました（npm run lint / npm test / npm run build が使えます）"
