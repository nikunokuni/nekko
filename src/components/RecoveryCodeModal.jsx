// ══════════════════════════════════════════════════
// RecoveryCodeModal.jsx  ―  リカバリーコードの保存案内
//   コード発行直後に全画面で表示する。まずパスワードマネージャーへの保存を促し、
//   次善策としてスクリーンショットを案内する。
//
//   セキュリティ上、画面に映すのは「リカバリーコード」ラベルと実コードだけにする
//   （アプリ名・アイコン・ログインIDは載せない）。スクショが漏れても、どのアプリ・
//   誰のアカウントのものか分からないようにするため。ログインIDは設定画面で確認できる。
//   平文コードはこの画面にしか表示されない（閉じると再表示不可・再発行は可能）。
// ══════════════════════════════════════════════════
import { useState } from "react";
import { T } from "../theme";

export function RecoveryCodeModal({ code, onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // clipboard API が使えない環境: 一時テキストエリア経由でコピーを試みる
      try {
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
      } catch {
        alert("コピーできませんでした。コードを手動で控えてください。");
      }
    }
  };

  return (
    <div data-testid="recovery-modal" style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: "#0d0800",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "24px 20px",
      fontFamily: T.fontSerif,
      overflowY: "auto",
    }}>
      {/* ── コード本体（ラベル＋コードのみ。識別情報は一切載せない）── */}
      <div style={{ fontSize: T.fontSize.lg, color: "rgba(200,169,110,0.75)", letterSpacing: "0.15em", marginBottom: 14 }}>
        リカバリーコード
      </div>
      <div style={{
        width: "100%", maxWidth: 400,
        border: "0.5px solid rgba(200,169,110,0.4)",
        borderRadius: T.radius.xl,
        padding: "24px 20px",
        textAlign: "center",
        marginBottom: 22,
      }}>
        <div style={{
          fontSize: "1.5rem", fontWeight: 600, color: "#e8d4a8",
          letterSpacing: "0.12em", lineHeight: 1.5, wordBreak: "break-all",
        }}>
          {code}
        </div>
      </div>

      {/* ── 保存導線：まずパスワードマネージャー、次にスクショ ── */}
      <button
        onClick={handleCopy}
        style={{
          width: "100%", maxWidth: 400,
          padding: "13px", borderRadius: T.radius.lg, border: "none",
          fontSize: T.fontSize.xl, fontWeight: 600, cursor: "pointer",
          background: copied ? "#3B6D11" : T.gold, color: T.cream, fontFamily: T.fontSerif,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          marginBottom: 10, transition: "background 0.15s",
        }}
      >
        <i className={`ti ${copied ? "ti-check" : "ti-copy"}`} />
        {copied ? "コピーしました" : "コピーしてパスワードマネージャーに保存"}
      </button>
      <div style={{ width: "100%", maxWidth: 400, fontSize: T.fontSize.base, color: "rgba(250,244,232,0.7)", lineHeight: 1.9, marginBottom: 22 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <i className="ti ti-camera" style={{ color: "#c8a96e", marginTop: 3, flexShrink: 0 }} />
          <span>パスワードマネージャーが無ければ、<b>この画面をスクリーンショット</b>して保存してください。</span>
        </div>
      </div>

      {/* ── 注意喚起 ── */}
      <div style={{
        width: "100%", maxWidth: 400,
        background: "rgba(169,50,38,0.12)",
        border: "0.5px solid rgba(169,50,38,0.4)",
        borderRadius: T.radius.md,
        padding: "12px 14px",
        fontSize: T.fontSize.base, color: "rgba(250,244,232,0.9)", lineHeight: 1.8,
        marginBottom: 24,
      }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
          <i className="ti ti-alert-triangle" style={{ color: "#e88", marginTop: 3, flexShrink: 0 }} />
          <span>これは<b>パスワードと同じ</b>大切な情報です。他の人に見られないよう保管し、共有アルバムやSNSに載せないでください。</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <i className="ti ti-key" style={{ color: "#c8a96e", marginTop: 3, flexShrink: 0 }} />
          <span>パスワードを忘れたとき、ログイン画面からIDとこのコードで再設定できます。コードは<b>この画面にしか表示されません</b>（設定からいつでも再発行できます）。</span>
        </div>
      </div>

      <button
        onClick={onClose}
        style={{
          width: "100%", maxWidth: 400,
          padding: "13px", borderRadius: T.radius.lg,
          border: "0.5px solid rgba(200,169,110,0.4)",
          fontSize: T.fontSize.lg, fontWeight: 600, cursor: "pointer",
          background: "transparent", color: "#e8d4a8", fontFamily: T.fontSerif,
        }}
      >
        保存しました
      </button>
    </div>
  );
}
