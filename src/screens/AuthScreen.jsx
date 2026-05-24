import { useState } from "react";
import { signIn, signUp } from "../lib/db";

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    setError(""); setLoading(true);
    if (mode === "login") {
      const { data, error } = await signIn({ email, password });
      if (error) { setError(error.message); setLoading(false); return; }
      onAuth(data.user, data.session);
    } else {
      if (!username.trim()) { setError("IDを入力してください"); setLoading(false); return; }
      const { data, error } = await signUp({ email, password, username, displayName: displayName || username });
      if (error) { setError(error.message); setLoading(false); return; }
      setDone(true);
    }
    setLoading(false);
  };

  const field = (label, value, setter, type = "text", placeholder = "") => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: "rgba(26,15,0,0.5)", marginBottom: 5, fontFamily: "'Noto Serif JP',serif" }}>
        {label}
      </div>
      <input
        type={type} value={value}
        onChange={e => setter(e.target.value)}
        placeholder={placeholder}
        autoComplete={type === "password" ? "current-password" : "off"}
        style={{
          width: "100%", border: "0.5px solid rgba(26,15,0,0.2)", borderRadius: 10,
          padding: "11px 14px", fontSize: 14, color: "#1a0f00",
          background: "#fff8ee", fontFamily: "'Noto Serif JP',serif", outline: "none",
          transition: "border-color 0.15s",
        }}
        onFocus={e => e.target.style.borderColor = "#a07840"}
        onBlur={e => e.target.style.borderColor = "rgba(26,15,0,0.2)"}
      />
    </div>
  );

  return (
    <div style={{
      minHeight: "100dvh", background: "#0d0800",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "24px 20px", fontFamily: "'Noto Serif JP',serif",
    }}>
      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{
          fontFamily: "'Shippori Mincho B1',serif", fontSize: 42,
          color: "#e8d4a8", letterSpacing: "0.4em", marginBottom: 6,
        }}>
          ね<span style={{ color: "#c8a96e" }}>っ</span>こ
        </div>
        <div style={{ fontSize: 12, color: "rgba(200,169,110,0.45)", letterSpacing: "0.2em" }}>
          将棋研究ノート
        </div>
      </div>

      {/* Card */}
      <div style={{
        width: "100%", maxWidth: 400,
        background: "#faf4e8", borderRadius: 20,
        padding: "32px 28px",
        boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
        border: "0.5px solid rgba(200,169,110,0.3)",
      }}>
        {done ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>📬</div>
            <div style={{ fontFamily: "'Shippori Mincho B1',serif", fontSize: 16, color: "#1a0f00", marginBottom: 10 }}>
              確認メールを送りました
            </div>
            <div style={{ fontSize: 12, color: "rgba(26,15,0,0.5)", lineHeight: 1.7 }}>
              {email} に届いたリンクをクリックして<br />アカウントを有効化してください
            </div>
            <button onClick={() => { setMode("login"); setDone(false); }} style={{
              marginTop: 24, padding: "10px 24px", borderRadius: 12,
              border: "none", background: "#a07840", color: "#faf4e8",
              fontSize: 13, cursor: "pointer", fontFamily: "'Noto Serif JP',serif",
            }}>
              ログイン画面へ
            </button>
          </div>
        ) : (
          <>
            {/* Tab */}
            <div style={{ display: "flex", gap: 0, marginBottom: 28, borderBottom: "0.5px solid rgba(26,15,0,0.12)" }}>
              {[["login", "ログイン"], ["signup", "新規登録"]].map(([m, lbl]) => (
                <div key={m} onClick={() => { setMode(m); setError(""); }} style={{
                  flex: 1, textAlign: "center", padding: "10px 0",
                  fontSize: 13, cursor: "pointer",
                  color: mode === m ? "#1a0f00" : "rgba(26,15,0,0.4)",
                  fontWeight: mode === m ? 600 : 400,
                  borderBottom: mode === m ? "2px solid #a07840" : "2px solid transparent",
                  marginBottom: -1, transition: "all 0.15s",
                }}>{lbl}</div>
              ))}
            </div>

            {mode === "signup" && (
              <>
                {field("ID（ユーザー名）", username, setUsername, "text", "例: tsuruga_7dan")}
                {field("表示名", displayName, setDisplayName, "text", "例: 鶴賀 七段")}
              </>
            )}
            {field("メールアドレス", email, setEmail, "email", "your@email.com")}
            {field("パスワード", password, setPassword, "password", "8文字以上")}

            {error && (
              <div style={{
                fontSize: 12, color: "#A93226", background: "#fdedec",
                border: "0.5px solid rgba(169,50,38,0.3)",
                borderRadius: 8, padding: "8px 12px", marginBottom: 14,
              }}>{error}</div>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading || !email || !password}
              style={{
                width: "100%", padding: "13px", borderRadius: 12,
                border: "none", fontSize: 14, fontWeight: 600,
                cursor: loading || !email || !password ? "default" : "pointer",
                background: loading || !email || !password ? "#B4B2A9" : "#a07840",
                color: "#faf4e8", fontFamily: "'Noto Serif JP',serif",
                transition: "background 0.15s",
              }}
            >
              {loading ? "処理中..." : mode === "login" ? "ログイン" : "アカウントを作成"}
            </button>
          </>
        )}
      </div>

      <div style={{ marginTop: 20, fontSize: 11, color: "rgba(200,169,110,0.25)", textAlign: "center" }}>
        Powered by Supabase
      </div>
    </div>
  );
}
