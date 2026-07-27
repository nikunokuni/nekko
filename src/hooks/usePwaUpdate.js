// ══════════════════════════════════════════════════════════════════
// usePwaUpdate.js  ―  アプリ更新（新バージョン）の検知フック
//
//   vite-plugin-pwa が生成する Service Worker（/sw.js）を自前で登録し、
//   新しいバージョンが「待機（waiting）」状態になったら needRefresh を立てる。
//   update() を呼ぶと待機中の SW に切り替えを指示し、制御が移った時点で
//   ページを1回だけリロードして新しい資産（JS/CSS/HTML）を読み込む。
//
//   仮想モジュール virtual:pwa-register は使わない：モックQA構成
//   （vite.mock.config.js）には PWA プラグインが無く import 解決に失敗するため。
//   Service Worker が無い環境（開発サーバ・モックQA）では register が失敗
//   するだけで、フックは何もしない（needRefresh は false のまま）。
// ══════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";

// 起動しっぱなしの PWA でも更新に気づけるよう、定期的に更新確認する間隔（1時間）
const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000;

export function usePwaUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const registrationRef = useRef(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let reg = null;
    let cleanedUp = false;
    // 新 SW が制御を奪ったら一度だけリロードする（多重リロード防止）
    let refreshing = false;

    // installing → installed（＝待機）に変わり、かつ既存 SW が制御中なら「更新あり」
    const watchInstalling = (sw) => {
      if (!sw) return;
      sw.addEventListener("statechange", () => {
        if (sw.state === "installed" && navigator.serviceWorker.controller) {
          setNeedRefresh(true);
        }
      });
    };

    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js")
      .then((r) => {
        if (cleanedUp) return;
        reg = r;
        registrationRef.current = r;

        // 起動時点で既に待機中の SW があれば更新あり（前回起動時に降ってきていた等）
        if (r.waiting && navigator.serviceWorker.controller) setNeedRefresh(true);

        // 新しい SW が見つかったら、その installed 待機を監視する
        r.addEventListener("updatefound", () => watchInstalling(r.installing));
      })
      .catch(() => {
        // SW 未生成の環境（開発サーバ・モックQA・preview前など）は何もしない
      });

    // 定期チェック＋タブ復帰時チェック（サーバに新バージョンが出ていれば拾う）
    const check = () => reg && reg.update && reg.update().catch(() => {});
    const interval = setInterval(check, UPDATE_CHECK_INTERVAL);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cleanedUp = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  // 待機中の新 SW に切り替えを指示する。skipWaiting → controllerchange → reload の順で反映。
  const update = () => {
    const waiting = registrationRef.current && registrationRef.current.waiting;
    if (waiting) {
      waiting.postMessage({ type: "SKIP_WAITING" });
    } else {
      // 念のためのフォールバック（待機 SW を取り逃した場合は単純リロード）
      window.location.reload();
    }
  };

  return { needRefresh, update };
}
