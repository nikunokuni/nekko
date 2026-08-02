// ══════════════════════════════════════════════════════════════════
// run-all.mjs  ―  test-harness/*.test.mjs をまとめて実行する
//   実行: npm test
//   1件でも失敗したら終了コード1（CIが赤くなる）。
//   新しいテストは *.test.mjs という名前で置くだけで自動的に拾われる。
// ══════════════════════════════════════════════════════════════════
import { readdirSync } from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith(".test.mjs")).sort();

if (files.length === 0) {
  console.error("テストファイルが見つかりません（test-harness/*.test.mjs）");
  process.exit(1);
}

const failed = [];
for (const file of files) {
  console.log(`\n━━━ ${file} ━━━`);
  const r = spawnSync(process.execPath, [join(here, file)], { stdio: "inherit" });
  if (r.status !== 0) failed.push(file);
}

console.log("\n══════════════════════════════════════");
if (failed.length === 0) {
  console.log(`全 ${files.length} ファイル成功`);
  process.exit(0);
}
console.log(`${failed.length}/${files.length} ファイル失敗: ${failed.join(", ")}`);
process.exit(1);
