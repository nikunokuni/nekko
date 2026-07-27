// ══════════════════════════════════════════════════════════════════
// UpdateBanner.jsx  ―  新バージョン通知バナー
//   usePwaUpdate が新しいバージョンを検知したときに画面上部へ出す。
//   「更新」をタップすると待機中の Service Worker に切り替え、
//   ページがリロードされて新しいアプリが読み込まれる。
// ══════════════════════════════════════════════════════════════════
import { T } from "../theme";

export function UpdateBanner({ onUpdate }) {
  return (
    <div
      style={{
        position: "fixed",
        top: "max(12px, env(safe-area-inset-top))",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 400,
        width: "calc(100% - 32px)",
        maxWidth: 420,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px 10px 16px",
        background: "rgba(26,15,0,0.92)",
        color: T.cream,
        borderRadius: T.radius.xl,
        boxShadow: "0 6px 20px rgba(26,15,0,0.35)",
        fontFamily: T.fontSerif,
      }}
      role="status"
    >
      <i className="ti ti-sparkles" style={{ fontSize: "1rem", color: T.gold, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: T.fontSize.base, lineHeight: 1.5 }}>
        新しいバージョンがあります
      </span>
      <button
        onClick={onUpdate}
        style={{
          flexShrink: 0,
          background: T.gold,
          color: T.cream,
          border: "none",
          borderRadius: 20,
          padding: "7px 16px",
          fontSize: T.fontSize.base,
          fontFamily: T.fontSerif,
          fontWeight: 700,
          letterSpacing: "0.06em",
          cursor: "pointer",
        }}
      >
        更新
      </button>
    </div>
  );
}
