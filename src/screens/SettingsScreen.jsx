// ══════════════════════════════════════════════════════════════════
// SettingsScreen.jsx  ―  設定画面
// ══════════════════════════════════════════════════════════════════
import { T } from "../theme";

export function SettingsScreen({ onBack }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.cream }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 18px 12px", borderBottom: `0.5px solid ${T.inkLine}` }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: 18, padding: 2, lineHeight: 1 }}>
          <i className="ti ti-chevron-left" />
        </button>
        <div style={{ flex: 1, fontFamily: T.fontTitle, fontSize: 18, color: T.ink, letterSpacing: "0.1em" }}>
          設定
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", alignItems: "center", justifyContent: "center", color: T.inkFaint, fontSize: T.fontSize.lg }}>
        準備中です
      </div>
    </div>
  );
}
