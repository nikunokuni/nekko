// ══════════════════════════════════════════════════
// RecoveryCodeModal.jsx  ―  リカバリーコードのスクリーンショット案内
//   コード発行直後に全画面で表示する。ユーザーはこの画面をスクショして保存する。
//   後からスクショを見返したとき何のコードか分かるよう、アプリ名
//   「将棋戦法メモアプリ ねっこ」とアイコン、ログインIDを画面内に含める。
//   平文コードはこの画面にしか表示されない（閉じると再表示不可・再発行は可能）。
// ══════════════════════════════════════════════════
import { T } from "../theme";

export function RecoveryCodeModal({ code, username, onClose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: "#0d0800",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "24px 20px",
      fontFamily: T.fontSerif,
      overflowY: "auto",
    }}>
      {/* ── スクショに映る本体（アプリ名・アイコン・ID・コード）── */}
      <img
        src="/icon.png"
        alt=""
        style={{ width: 64, height: 64, borderRadius: 16, marginBottom: 14 }}
      />
      <div style={{ fontFamily: T.fontTitle, fontSize: "1.25rem", color: "#e8d4a8", letterSpacing: "0.15em", marginBottom: 4 }}>
        将棋戦法メモアプリ ねっこ
      </div>
      <div style={{ fontSize: T.fontSize.base, color: "rgba(200,169,110,0.6)", letterSpacing: "0.2em", marginBottom: 28 }}>
        リカバリーコード
      </div>

      <div style={{
        width: "100%", maxWidth: 400,
        border: "0.5px solid rgba(200,169,110,0.4)",
        borderRadius: T.radius.xl,
        padding: "22px 20px",
        textAlign: "center",
        marginBottom: 24,
      }}>
        <div style={{ fontSize: T.fontSize.md, color: "rgba(200,169,110,0.6)", marginBottom: 6 }}>
          ログインID
        </div>
        <div style={{ fontSize: T.fontSize.xxl, color: "#faf4e8", marginBottom: 18, wordBreak: "break-all" }}>
          {username}
        </div>
        <div style={{ fontSize: T.fontSize.md, color: "rgba(200,169,110,0.6)", marginBottom: 6 }}>
          リカバリーコード
        </div>
        <div style={{
          fontSize: "1.375rem", fontWeight: 600, color: "#e8d4a8",
          letterSpacing: "0.1em", lineHeight: 1.5, wordBreak: "break-all",
        }}>
          {code}
        </div>
      </div>

      {/* ── 説明 ── */}
      <div style={{
        width: "100%", maxWidth: 400,
        fontSize: T.fontSize.lg, color: "rgba(250,244,232,0.85)", lineHeight: 1.9,
        marginBottom: 28,
      }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <i className="ti ti-camera" style={{ color: "#c8a96e", marginTop: 4, flexShrink: 0 }} />
          <span>この画面の<b>スクリーンショットを撮って保存</b>してください。</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <i className="ti ti-key" style={{ color: "#c8a96e", marginTop: 4, flexShrink: 0 }} />
          <span>パスワードを忘れたとき、ログイン画面からIDとこのコードで再設定できます。</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <i className="ti ti-eye-off" style={{ color: "#c8a96e", marginTop: 4, flexShrink: 0 }} />
          <span>コードは<b>この画面にしか表示されません</b>（設定からいつでも再発行できます）。</span>
        </div>
      </div>

      <button
        onClick={onClose}
        style={{
          width: "100%", maxWidth: 400,
          padding: "13px", borderRadius: T.radius.lg, border: "none",
          fontSize: T.fontSize.xl, fontWeight: 600,
          cursor: "pointer",
          background: T.gold, color: T.cream, fontFamily: T.fontSerif,
        }}
      >
        スクリーンショットを保存しました
      </button>
    </div>
  );
}
