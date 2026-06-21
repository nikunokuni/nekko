// ══════════════════════════════════════════════════════════════════
// SettingsScreen.jsx  ―  設定画面
// ══════════════════════════════════════════════════════════════════
import { T } from "../theme";

const FONT_SCALE_OPTIONS = [
  { label: "小",   value: 0.85 },
  { label: "標準", value: 1 },
  { label: "大",   value: 1.15 },
  { label: "特大", value: 1.3 },
];

export function SettingsScreen({ onBack, fontScale, onFontScaleChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.cream }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 18px 12px", borderBottom: `0.5px solid ${T.inkLine}` }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1.125rem", padding: 2, lineHeight: 1 }}>
          <i className="ti ti-chevron-left" />
        </button>
        <div style={{ flex: 1, fontFamily: T.fontTitle, fontSize: "1.125rem", color: T.ink, letterSpacing: "0.1em" }}>
          設定
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 18px 32px" }}>

        {/* 文字サイズ */}
        <div style={{ fontSize: T.fontSize.md, color: T.inkMid, marginBottom: 10, letterSpacing: "0.08em" }}>
          文字サイズ
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
          {FONT_SCALE_OPTIONS.map((opt) => {
            const active = fontScale === opt.value;
            return (
              <button
                key={opt.label}
                onClick={() => onFontScaleChange(opt.value)}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: T.radius.md,
                  border: `0.5px solid ${active ? T.gold : T.inkLine}`,
                  background: active ? T.gold : "transparent",
                  color: active ? T.cream : T.inkMid,
                  fontFamily: T.fontSerif,
                  fontSize: T.fontSize.lg,
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* その他 */}
        <div style={{ fontSize: T.fontSize.md, color: T.inkMid, marginBottom: 10, letterSpacing: "0.08em" }}>
          その他
        </div>
        <div style={{ borderRadius: T.radius.md, border: `0.5px solid ${T.inkLine}`, overflow: "hidden" }}>
          <a
            href="https://note.com/nikujuku/n/ne1774a6d11a3"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "14px 16px",
              fontSize: T.fontSize.lg,
              color: T.ink,
              fontFamily: T.fontSerif,
              textDecoration: "none",
              borderBottom: `0.5px solid ${T.inkLineFaint}`,
            }}
          >
            <i className="ti ti-help-circle" style={{ fontSize: "1rem", color: T.gold }} />
            <span style={{ flex: 1 }}>使い方</span>
            <i className="ti ti-external-link" style={{ fontSize: "0.875rem", color: T.inkFaint }} />
          </a>
          <a
            href="https://x.com/nikunnokuni"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "14px 16px",
              fontSize: T.fontSize.lg,
              color: T.ink,
              fontFamily: T.fontSerif,
              textDecoration: "none",
              borderBottom: `0.5px solid ${T.inkLineFaint}`,
            }}
          >
            <i className="ti ti-brand-x" style={{ fontSize: "1rem", color: T.gold }} />
            <span style={{ flex: 1 }}>作った人へのリンク</span>
            <i className="ti ti-external-link" style={{ fontSize: "0.875rem", color: T.inkFaint }} />
          </a>
          <a
            href="https://x.gd/xHwM4"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "14px 16px",
              fontSize: T.fontSize.lg,
              color: T.ink,
              fontFamily: T.fontSerif,
              textDecoration: "none",
            }}
          >
            <i className="ti ti-message-2" style={{ fontSize: "1rem", color: T.gold }} />
            <span style={{ flex: 1 }}>ご意見・感想・バグ報告</span>
            <i className="ti ti-external-link" style={{ fontSize: "0.875rem", color: T.inkFaint }} />
          </a>
        </div>
      </div>
    </div>
  );
}
