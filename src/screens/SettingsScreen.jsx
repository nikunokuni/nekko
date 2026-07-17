// ══════════════════════════════════════════════════════════════════
// SettingsScreen.jsx  ―  設定画面
// ══════════════════════════════════════════════════════════════════
import { useState } from "react";
import { T } from "../theme";

const FONT_SCALE_OPTIONS = [
  { label: "小",   value: 0.85 },
  { label: "標準", value: 1 },
  { label: "大",   value: 1.15 },
  { label: "特大", value: 1.3 },
];

export function SettingsScreen({ onBack, fontScale, onFontScaleChange, onResetOnboard, onRegenerateRecovery, devStats }) {
  // 開発者向けの3項目はアコーディオンで隠す（デフォルトは閉じた状態）
  const [devOpen, setDevOpen] = useState(false);
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

        {/* 開発者向け（niku のときだけ表示）。3項目はアコーディオンで隠す */}
        {devStats && (
          <div style={{ marginBottom: 28 }}>
            <button
              onClick={() => setDevOpen((v) => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6, width: "100%",
                marginBottom: devOpen ? 10 : 0,
                padding: 0,
                background: "none", border: "none", cursor: "pointer",
                fontSize: T.fontSize.md, color: T.inkMid, letterSpacing: "0.08em",
                fontFamily: T.fontSerif, textAlign: "left",
              }}
            >
              <span style={{ flex: 1 }}>開発者向け</span>
              <i className={`ti ti-chevron-${devOpen ? "up" : "down"}`} style={{ fontSize: "0.8125rem", color: T.inkMid }} />
            </button>
            {devOpen && (
            <div style={{ borderRadius: T.radius.md, border: `0.5px solid ${T.inkLine}`, overflow: "hidden" }}>
              {[
                { icon: "ti-users",        label: "アカウント数", value: Math.max(0, devStats.accounts - 1) },
                { icon: "ti-binary-tree",  label: "ツリー総数",   value: devStats.trees },
                { icon: "ti-point-filled", label: "ノード総数",   value: devStats.nodes },
              ].map((row, i, arr) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "14px 16px",
                    borderBottom: i < arr.length - 1 ? `0.5px solid ${T.inkLineFaint}` : "none",
                  }}
                >
                  <i className={`ti ${row.icon}`} style={{ fontSize: "1rem", color: T.gold }} />
                  <span style={{ flex: 1, fontSize: T.fontSize.lg, color: T.ink, fontFamily: T.fontSerif }}>
                    {row.label}
                  </span>
                  <span style={{ fontSize: T.fontSize.lg, color: T.ink, fontFamily: T.fontSerif, fontWeight: 700 }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
            )}
          </div>
        )}

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
          <button
            onClick={onResetOnboard}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "14px 16px",
              fontSize: T.fontSize.lg,
              color: T.ink,
              fontFamily: T.fontSerif,
              background: "none",
              border: "none",
              borderBottom: `0.5px solid ${T.inkLineFaint}`,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <i className="ti ti-bulb" style={{ fontSize: "1rem", color: T.gold }} />
            <span style={{ flex: 1 }}>使い方のヒントをもう一度見る</span>
            <i className="ti ti-refresh" style={{ fontSize: "0.875rem", color: T.inkFaint }} />
          </button>
          <button
            onClick={() => {
              if (window.confirm("新しいリカバリーコードを発行します。\n古いコード（保存済みのスクリーンショット）は使えなくなります。よろしいですか？")) {
                onRegenerateRecovery?.();
              }
            }}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "14px 16px",
              fontSize: T.fontSize.lg,
              color: T.ink,
              fontFamily: T.fontSerif,
              background: "none",
              border: "none",
              borderBottom: `0.5px solid ${T.inkLineFaint}`,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <i className="ti ti-key" style={{ fontSize: "1rem", color: T.gold }} />
            <span style={{ flex: 1 }}>リカバリーコードを再発行</span>
            <i className="ti ti-refresh" style={{ fontSize: "0.875rem", color: T.inkFaint }} />
          </button>
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
