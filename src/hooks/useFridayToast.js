// ══════════════════════════════════════════════════
// useFridayToast.js  ―  金曜夜トースト
//   金曜18時以降の初回ログイン時に、未完成ノードから1つ選んで
//   「この戦法について研究してみよう」と促す（週1回だけ）。
// ══════════════════════════════════════════════════
import { useState, useEffect, useRef } from "react";
import { fetchAllWipNodes } from "../db";
import { shouldShowFridayToast, markFridayToastShown } from "../rewards";

export function useFridayToast(session) {
  const [fridayToast, setFridayToast] = useState("");
  // 自動消去タイマー（アンマウント/再実行時に破棄してリークを防ぐ）
  const fridayTimer = useRef(null);

  useEffect(() => {
    if (!session) return;
    if (!shouldShowFridayToast()) return;
    fetchAllWipNodes(session.user.id)
      .then(({ data }) => {
        if (!data || data.length === 0) return;
        const node = data[Math.floor(Math.random() * data.length)];
        setFridayToast(`「${node.label}」この戦法について研究してみよう`);
        markFridayToastShown();
        if (fridayTimer.current) clearTimeout(fridayTimer.current);
        fridayTimer.current = setTimeout(() => setFridayToast(""), 6000);
      })
      .catch((e) => console.error("fetchAllWipNodes error:", e));
    return () => { if (fridayTimer.current) clearTimeout(fridayTimer.current); };
  }, [session]);

  return fridayToast;
}
