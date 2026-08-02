// ══════════════════════════════════════════════════════════════════
// fixtures.mjs  ―  E2Eテスト共通の下ごしらえ
//
//   index.html は Google Fonts を外部から読む。テスト環境では外に出られない
//   ことがあり、そのたびに読み込み待ちで数十秒とられる（テストが遅い原因の
//   ほとんどがこれ）。見た目のフォントはテストの対象ではないので、
//   外部ホストへのリクエストは最初から遮断する。
//
//   各 spec はここから test / expect を import する。
// ══════════════════════════════════════════════════════════════════
import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("**/*", (route) => {
      const url = route.request().url();
      const isLocal = url.startsWith("http://localhost") || url.startsWith("http://127.0.0.1");
      return isLocal ? route.continue() : route.abort();
    });
    await use(page);
  },
});

export { expect };
