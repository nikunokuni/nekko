// ══════════════════════════════════════════════════
// useFontScale.js  ―  文字サイズ設定
//   端末ローカル設定（消えても既定に戻るだけなので localStorage 管理）。
//   ルート要素の font-size に反映し、rem 単位の基準値として全体に効かせる。
// ══════════════════════════════════════════════════
import { useState, useEffect } from "react";

export function useFontScale() {
  const [fontScale, setFontScale] = useState(() => Number(localStorage.getItem("nekko_font_scale")) || 1);

  const handleFontScaleChange = (scale) => {
    setFontScale(scale);
    localStorage.setItem("nekko_font_scale", String(scale));
  };

  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * fontScale}px`;
  }, [fontScale]);

  return [fontScale, handleFontScaleChange];
}
