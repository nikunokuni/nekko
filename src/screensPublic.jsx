// ══════════════════════════════════════════════════
// screensPublic.jsx  ―  認証・公開ツリー画面
//   AuthScreen / PublicTrees
// ══════════════════════════════════════════════════
import { useState } from "react";
import { BackBtn } from "./components";
import { signIn, signUp } from "./db";

// ──────────────────────────────────────────────────
// 共通スタイル定数
// ──────────────────────────────────────────────────
const AUTH_INPUT_STYLE = {
  width: "100%",
  border: "0.5px solid rgba(26,15,0,0.2)",
  borderRadius: 10,
  padding: "11px 14px",
  fontSize: 14,
  color: "#1a0f00",
  background: "#fff8ee",
  fontFamily: "'Noto Serif JP',serif",
  outline: "none",
};

// ──────────────────────────────────────────────────
// AuthInputField: ラベル付き入力フィールド（Auth専用）
// ──────────────────────────────────────────────────
function AuthInputField({ label, value, setter, type = "text", placeholder = "", nameAttr = "" }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: "rgba(26,15,0,0.5)", marginBottom: 5, fontFamily: "'Noto Serif JP',serif" }}>
        {label}
      </div>
      <input
        type={type}
        value={value}
        name={nameAttr}
        onChange={(e) => setter(e.target.value)}
        placeholder={placeholder}
        required
        autoComplete={type === "password" ? "current-password" : "username"}
        style={AUTH_INPUT_STYLE}
        onFocus={(e) => (e.target.style.borderColor = "#a07840")}
        onBlur={(e)  => (e.target.style.borderColor = "rgba(26,15,0,0.2)")}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════
// AuthScreen
// ══════════════════════════════════════════════════
export function AuthScreen({ onAuth }) {
  const [mode,        setMode]        = useState("login");
  const [username,    setUsername]    = useState("");
  const [password,    setPassword]    = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("IDとパスワードを入力してください");
      return;
    }
    setLoading(true);

    try {
      if (mode === "login") {
        const { data, error: err } = await signIn({ email: username, password });
        if (err) {
          setError(err.message === "Invalid login credentials" ? "IDまたはパスワードが違います" : err.message);
          return;
        }
        onAuth(data.user, data.session);

      } else {
        const { error: err } = await signUp({
          username:    username.trim(),
          password,
          displayName: displayName.trim() || username.trim(),
        });
        if (err) { setError(err.message); return; }

        const { data: loginData, error: loginErr } = await signIn({ email: username, password });
        if (loginErr) {
          setError("自動ログインに失敗しました。ログイン画面からお試しください。");
          setMode("login");
        } else {
          onAuth(loginData.user, loginData.session);
        }
      }
    } catch (e) {
      setError("通信エラーが発生しました。時間をおいて再度お試しください。");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m) => { setMode(m); setError(""); };

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0d0800",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "24px 20px",
      fontFamily: "'Noto Serif JP',serif",
    }}>
      {/* ロゴ */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontFamily: "'Shippori Mincho B1',serif", fontSize: 42, color: "#e8d4a8", letterSpacing: "0.4em", marginBottom: 6 }}>
          ね<span style={{ color: "#c8a96e" }}>っ</span>こ
        </div>
        <div style={{ fontSize: 12, color: "rgba(200,169,110,0.45)", letterSpacing: "0.2em" }}>将棋研究ノート</div>
      </div>

      {/* フォームカード */}
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%", maxWidth: 400,
          background: "#faf4e8", borderRadius: 20,
          padding: "32px 28px",
          boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          border: "0.5px solid rgba(200,169,110,0.3)",
        }}
      >
        {/* タブ */}
        <div style={{ display: "flex", gap: 0, marginBottom: 28, borderBottom: "0.5px solid rgba(26,15,0,0.12)" }}>
          {[["login", "ログイン"], ["signup", "新規登録"]].map(([m, lbl]) => (
            <div
              key={m}
              onClick={() => switchMode(m)}
              style={{
                flex: 1, textAlign: "center", padding: "10px 0", fontSize: 13, cursor: "pointer",
                color:       mode === m ? "#1a0f00"          : "rgba(26,15,0,0.4)",
                fontWeight:  mode === m ? 600                : 400,
                borderBottom: mode === m ? "2px solid #a07840" : "2px solid transparent",
                marginBottom: -1, transition: "all 0.15s",
              }}
            >
              {lbl}
            </div>
          ))}
        </div>

        <AuthInputField label="ID（ログイン用ユーザー名）" value={username}    setter={setUsername}    type="text"     placeholder="例: tsuruga_7dan" nameAttr="username" />
        {mode === "signup" && (
          <AuthInputField label="表示名"                   value={displayName} setter={setDisplayName} type="text"     placeholder="例: 鶴賀 七段"    nameAttr="nickname" />
        )}
        <AuthInputField   label="パスワード"               value={password}    setter={setPassword}    type="password" placeholder="8文字以上"         nameAttr="password" />

        {/* エラー表示 */}
        {error && (
          <div style={{
            fontSize: 12, color: "#A93226",
            background: "#fdedec",
            border: "0.5px solid rgba(169,50,38,0.3)",
            borderRadius: 8, padding: "8px 12px", marginBottom: 14,
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !username || !password}
          style={{
            width: "100%", padding: "13px", borderRadius: 12, border: "none",
            fontSize: 14, fontWeight: 600,
            cursor:     loading || !username || !password ? "default" : "pointer",
            background: loading || !username || !password ? "#B4B2A9" : "#a07840",
            color: "#faf4e8", fontFamily: "'Noto Serif JP',serif",
          }}
        >
          {loading ? "処理中..." : mode === "login" ? "ログイン" : "アカウントを作成"}
        </button>
      </form>

      <div style={{ marginTop: 20, fontSize: 11, color: "rgba(200,169,110,0.25)", textAlign: "center" }}>
        Powered by Supabase
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// PublicTreeCard: 公開ツリー1件分のカード
// ──────────────────────────────────────────────────
function PublicTreeCard({ tree, isCopied, isCopying, onCopy }) {
  const author = tree.profiles?.display_name || tree.profiles?.username || "匿名";

  return (
    <div style={{ padding: "14px", borderRadius: 12, border: "0.5px solid rgba(200,169,110,0.3)", background: "#f5edd8", marginBottom: 10 }}>
      {/* ヘッダー行 */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: "'Shippori Mincho B1',serif", fontSize: 15, color: "#1a0f00", marginBottom: 2 }}>{tree.name}</div>
          <div style={{ fontSize: 10, color: "rgba(26,15,0,0.4)" }}>@{author}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "rgba(26,15,0,0.4)" }}>
          <i className="ti ti-heart" style={{ fontSize: 14 }} />{tree.liked_by || 0}
        </div>
      </div>

      {/* タグ・コピーボタン行 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {(tree.tags || []).map((tg) => (
            <span key={tg} style={{ fontSize: 9, padding: "2px 7px", borderRadius: 8, background: "rgba(26,15,0,0.06)", color: "rgba(26,15,0,0.5)", fontFamily: "'Noto Serif JP',serif" }}>
              {tg}
            </span>
          ))}
        </div>
        <button
          onClick={() => onCopy(tree.id)}
          disabled={isCopying}
          style={{
            fontSize: 11, padding: "5px 12px", borderRadius: 8,
            cursor:     isCopying ? "default" : "pointer",
            border:     "0.5px solid #a07840",
            background: isCopied ? "#a07840" : "transparent",
            color:      isCopied ? "#faf4e8" : "#a07840",
            fontFamily: "'Noto Serif JP',serif",
            display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s",
          }}
        >
          <i className={`ti ti-${isCopied ? "check" : isCopying ? "loader" : "copy"}`} style={{ fontSize: 12 }} />
          {isCopied ? "コピーしました" : isCopying ? "コピー中..." : "コピー"}
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// TagFilter: タグ絞り込みバー
// ──────────────────────────────────────────────────
const ALL_TAGS = ["すべて", "居飛車", "振り飛車", "角換わり", "矢倉", "雁木", "石田流", "中飛車", "四間飛車"];

function TagFilter({ activeTag, onSelect }) {
  return (
    <div style={{ display: "flex", gap: 6, padding: "10px 16px", overflowX: "auto", flexShrink: 0 }}>
      {ALL_TAGS.map((tag) => (
        <div
          key={tag}
          onClick={() => onSelect(tag)}
          style={{
            whiteSpace: "nowrap", fontSize: 11, padding: "5px 12px", borderRadius: 20, cursor: "pointer",
            fontFamily: "'Noto Serif JP',serif",
            border:      activeTag === tag ? "0.5px solid #a07840"           : "0.5px solid rgba(26,15,0,0.15)",
            background:  activeTag === tag ? "#f0e8d4"                        : "#faf4e8",
            color:       activeTag === tag ? "#1a0f00"                        : "rgba(26,15,0,0.45)",
            fontWeight:  activeTag === tag ? 600                              : 400,
            transition: "all 0.15s",
          }}
        >
          {tag}
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════
// PublicTrees
// ══════════════════════════════════════════════════
export function PublicTrees({ trees, profile, onBack, onCopy, onRefresh }) {
  const [query,     setQuery]     = useState("");
  const [activeTag, setActiveTag] = useState("すべて");
  const [copiedId,  setCopiedId]  = useState(null);
  const [copying,   setCopying]   = useState(null);

  const filtered = (trees || []).filter((t) => {
    const matchTag = activeTag === "すべて" || (t.tags || []).includes(activeTag);
    const matchQ   = !query || t.name.includes(query) || (t.tags || []).some((tg) => tg.includes(query));
    return matchTag && matchQ;
  });

  const handleCopy = async (id) => {
    setCopying(id);
    try {
      await onCopy(id);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch (e) {
      console.error("コピーに失敗しました", e);
    } finally {
      setCopying(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#faf4e8" }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 14px 12px", borderBottom: "0.5px solid rgba(26,15,0,0.12)" }}>
        <BackBtn onClick={onBack} />
        <div style={{ fontFamily: "'Shippori Mincho B1',serif", fontSize: 16, color: "#1a0f00", flex: 1 }}>みんなのツリー</div>
        <button onClick={onRefresh} style={{ background: "none", border: "none", cursor: "pointer", color: "#a07840", fontSize: 18 }}>
          <i className="ti ti-refresh" />
        </button>
      </div>

      {/* 検索バー */}
      <div style={{ padding: "10px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, border: "0.5px solid rgba(26,15,0,0.15)", borderRadius: 10, padding: "9px 12px", background: "#f0e8d4" }}>
          <i className="ti ti-search" style={{ fontSize: 15, color: "#B4B2A9" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="戦法名・タグで検索"
            style={{ flex: 1, border: "none", background: "transparent", fontSize: 13, color: "#1a0f00", outline: "none", fontFamily: "'Noto Serif JP',serif" }}
          />
          {query && (
            <i className="ti ti-x" style={{ fontSize: 14, color: "#B4B2A9", cursor: "pointer" }} onClick={() => setQuery("")} />
          )}
        </div>
      </div>

      {/* タグフィルター */}
      <TagFilter activeTag={activeTag} onSelect={setActiveTag} />

      {/* ツリー一覧 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 0", fontSize: 12, color: "#B4B2A9", fontFamily: "'Noto Serif JP',serif" }}>
            <i className="ti ti-mood-empty" style={{ fontSize: 32, display: "block", marginBottom: 10 }} />
            見つかりませんでした
          </div>
        ) : (
          filtered.map((t) => (
            <PublicTreeCard
              key={t.id}
              tree={t}
              isCopied={copiedId === t.id}
              isCopying={copying === t.id}
              onCopy={handleCopy}
            />
          ))
        )}
      </div>
    </div>
  );
}
