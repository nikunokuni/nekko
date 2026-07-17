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

// 利用規約の本文。画面遷移せずモーダル内で表示する。
// 各節は { title, body } で、body は改行（\n）で段落・箇条書きを分ける。
// 今後の注意事項の追記はこの配列を編集する。
const TOS_INTRO =
  "この規約は、将棋戦法メモアプリ「ねっこ」（以下「本アプリ」）の利用条件を定めるものです。本アプリを利用した時点で、この規約に同意したものとみなします。";
const TOS_SECTIONS = [
  {
    title: "1. 運営について",
    body:
      "本アプリは個人が趣味で運営しています。予告なく仕様の変更・一時停止・提供の終了を行う場合があります。サービスを終了する際も、できる限り事前のお知らせやデータの取り扱いに配慮するよう努めます。",
  },
  {
    title: "2. アカウントの管理",
    body:
      "ログインID・パスワード・リカバリーコードは、ご自身で責任を持って管理してください。\nパスワードを忘れた場合は、リカバリーコードで再設定できます。パスワードとリカバリーコードの両方を失うと、アカウントを復旧できません。\nリカバリーコードはパスワードと同じくらい大切な情報です。SNSや共有アルバムなど、他の人の目に触れる場所に載せないでください。",
  },
  {
    title: "3. 複数の端末での利用",
    body:
      "同じアカウントに複数の端末からログインできます。ただしリアルタイムでの同期ではありません。片方の端末での変更がもう片方にすぐ反映されなかったり、あとから保存した内容で上書きされたりすることがあります。",
  },
  {
    title: "4. 禁止事項",
    body:
      "次の行為は禁止します。\n・他人のIDでのログインや、不正アクセスを試みる行為\n・サーバーに過度な負荷をかける行為、自動化されたアクセス\n・本アプリを解析・改変する行為（リバースエンジニアリング等）\n・法令や公序良俗に反する内容の保存\n・第三者の権利を侵害する行為",
  },
  {
    title: "5. 商用利用・二次利用",
    body:
      "本アプリの商用利用は禁止します。二次利用をご希望の場合はご相談ください。前向きに検討します。",
  },
  {
    title: "6. 退会について",
    body:
      "退会（アカウントの削除）をご希望の場合は、運営者へ直接ご連絡ください。",
  },
  {
    title: "7. データについて",
    body:
      "本アプリには、データのエクスポート・インポート機能はありません（今後も実装の予定はありません）。また、ログインに必要な情報以外の個人情報（メールアドレス等）は取得しません。",
  },
  {
    title: "8. 年齢について",
    body: "未成年の方もご利用いただけます。",
  },
  {
    title: "9. 規約の変更",
    body: "この規約は、必要に応じて予告なく変更することがあります。",
  },
];

export function SettingsScreen({ onBack, fontScale, onFontScaleChange, onResetOnboard, onRegenerateRecovery, username, devStats }) {
  // 開発者向けの3項目はアコーディオンで隠す（デフォルトは閉じた状態）
  const [devOpen, setDevOpen] = useState(false);
  // ログインIDは肩越しに見られないよう既定で伏せ、タップで表示する
  const [idShown, setIdShown] = useState(false);
  // 利用規約は画面遷移せず、アプリ内モーダルで表示を完結させる
  const [tosOpen, setTosOpen] = useState(false);
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

        {/* アカウント：ログインID（パスワード再設定に使う）。既定で伏せる */}
        {username && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: T.fontSize.md, color: T.inkMid, marginBottom: 10, letterSpacing: "0.08em" }}>
              アカウント
            </div>
            <div style={{ borderRadius: T.radius.md, border: `0.5px solid ${T.inkLine}`, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px" }}>
                <i className="ti ti-user" style={{ fontSize: "1rem", color: T.gold }} />
                <span style={{ fontSize: T.fontSize.lg, color: T.ink, fontFamily: T.fontSerif }}>
                  ログインID
                </span>
                <span style={{ flex: 1, textAlign: "right", fontSize: T.fontSize.lg, color: T.ink, fontFamily: T.fontSerif, fontWeight: 600, wordBreak: "break-all", marginRight: 4 }}>
                  {idShown ? username : "••••••••"}
                </span>
                <button
                  onClick={() => setIdShown((v) => !v)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1rem", padding: 2, lineHeight: 1, flexShrink: 0 }}
                  aria-label={idShown ? "IDを隠す" : "IDを表示"}
                >
                  <i className={`ti ${idShown ? "ti-eye-off" : "ti-eye"}`} />
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, padding: "0 16px 14px", fontSize: T.fontSize.base, color: T.inkMid, lineHeight: 1.7 }}>
                <i className="ti ti-alert-triangle" style={{ color: "#A93226", marginTop: 3, flexShrink: 0 }} />
                <span>パスワードの再設定に使います。リカバリーコードと合わせて、他の人に見られないよう注意してください。</span>
              </div>
            </div>
          </div>
        )}

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
            onClick={() => setTosOpen(true)}
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
            <i className="ti ti-file-text" style={{ fontSize: "1rem", color: T.gold }} />
            <span style={{ flex: 1 }}>利用規約</span>
            <i className="ti ti-chevron-right" style={{ fontSize: "0.875rem", color: T.inkFaint }} />
          </button>
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

      {/* 利用規約モーダル：画面遷移せずアプリ内で表示を完結させる。
          今後ここに注意事項を追記していく。 */}
      {tosOpen && (
        <div
          onClick={() => setTosOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(13,8,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "24px 20px",
            fontFamily: T.fontSerif,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="利用規約"
            style={{
              width: "100%", maxWidth: 420,
              maxHeight: "80%",
              display: "flex", flexDirection: "column",
              background: T.cream,
              borderRadius: T.radius.xl,
              border: `0.5px solid ${T.inkLine}`,
              overflow: "hidden",
            }}
          >
            {/* ヘッダー */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 18px 12px", borderBottom: `0.5px solid ${T.inkLine}` }}>
              <div style={{ flex: 1, fontFamily: T.fontTitle, fontSize: "1.125rem", color: T.ink, letterSpacing: "0.1em" }}>
                利用規約
              </div>
              <button
                onClick={() => setTosOpen(false)}
                aria-label="閉じる"
                style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1.125rem", padding: 2, lineHeight: 1 }}
              >
                <i className="ti ti-x" />
              </button>
            </div>

            {/* 本文（今後ここに注意事項を追記していく） */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 18px 24px" }}>
              <div style={{ fontSize: T.fontSize.base, color: T.inkMid, lineHeight: 1.9, marginBottom: 20 }}>
                {TOS_INTRO}
              </div>
              {TOS_SECTIONS.map((sec) => (
                <div key={sec.title} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: T.fontSize.lg, color: T.ink, fontWeight: 700, marginBottom: 6, letterSpacing: "0.04em" }}>
                    {sec.title}
                  </div>
                  <div style={{ fontSize: T.fontSize.base, color: T.inkMid, lineHeight: 1.9, whiteSpace: "pre-line" }}>
                    {sec.body}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
