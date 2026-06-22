// ══════════════════════════════════════════════════
// screensPublic.jsx  ―  認証・公開ツリー画面
//   AuthScreen / PublicTrees
// ══════════════════════════════════════════════════
import { useState, useEffect, useRef } from "react";
import { BackBtn } from "./components";
import { signIn, signUp } from "./db";
import { recordAction } from "./rewards";
import { T } from "./theme";

// ──────────────────────────────────────────────────
// 共通スタイル定数
// ──────────────────────────────────────────────────
const AUTH_INPUT_STYLE = {
  width: "100%",
  border: "0.5px solid rgba(26,15,0,0.2)",
  borderRadius: T.radius.md,
  padding: "11px 14px",
  fontSize: T.fontSize.xl,
  color: T.ink,
  background: "#fff8ee",
  fontFamily: T.fontSerif,
  outline: "none",
};

// ──────────────────────────────────────────────────
// AuthInputField: ラベル付き入力フィールド（Auth専用）
// ──────────────────────────────────────────────────
function AuthInputField({ label, value, setter, type = "text", placeholder = "", nameAttr = "" }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: T.fontSize.md, color: T.inkMid, marginBottom: 5, fontFamily: T.fontSerif }}>
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
        onFocus={(e) => (e.target.style.borderColor = T.gold)}
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
      fontFamily: T.fontSerif,
    }}>
      {/* ロゴ */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{ fontFamily: T.fontTitle, fontSize: "2.625rem", color: "#e8d4a8", letterSpacing: "0.4em", marginBottom: 6 }}>
          ね<span style={{ color: "#c8a96e" }}>っ</span>こ
        </div>
        <div style={{ fontSize: T.fontSize.base, color: "rgba(200,169,110,0.45)", letterSpacing: "0.2em" }}>将棋研究ノート</div>
      </div>

      {/* フォームカード */}
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%", maxWidth: 400,
          background: T.cream, borderRadius: T.radius.xl,
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
                flex: 1, textAlign: "center", padding: "10px 0", fontSize: T.fontSize.lg, cursor: "pointer",
                color:       mode === m ? T.ink          : "rgba(26,15,0,0.4)",
                fontWeight:  mode === m ? 600                : 400,
                borderBottom: mode === m ? `2px solid ${T.gold}` : "2px solid transparent",
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
            fontSize: T.fontSize.base, color: T.red,
            background: T.redBg,
            border: "0.5px solid rgba(169,50,38,0.3)",
            borderRadius: T.radius.sm, padding: "8px 12px", marginBottom: 14,
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !username || !password}
          style={{
            width: "100%", padding: "13px", borderRadius: T.radius.lg, border: "none",
            fontSize: T.fontSize.xl, fontWeight: 600,
            cursor:     loading || !username || !password ? "default" : "pointer",
            background: loading || !username || !password ? T.gray : T.gold,
            color: T.cream, fontFamily: T.fontSerif,
          }}
        >
          {loading ? "処理中..." : mode === "login" ? "ログイン" : "アカウントを作成"}
        </button>
      </form>

      <div style={{ marginTop: 20, fontSize: "0.6875rem", color: "rgba(200,169,110,0.25)", textAlign: "center" }}>
        Powered by Supabase
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// PublicTreeCard: 公開ツリー1件分のカード
// ──────────────────────────────────────────────────
function PublicTreeCard({ tree, isCopied, isCopying, isLiked, justLiked, onCopy, onLike }) {
  const author = tree.profiles?.display_name || tree.profiles?.username || "匿名";

  return (
    <div style={{ padding: "14px", borderRadius: T.radius.lg, border: "0.5px solid rgba(200,169,110,0.3)", background: T.goldBg, marginBottom: 10 }}>
      {/* ヘッダー行 */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.xxl, color: T.ink, marginBottom: 2 }}>{tree.name}</div>
          <div style={{ fontSize: T.fontSize.sm, color: "rgba(26,15,0,0.4)" }}>@{author}</div>
        </div>
        {/* いいねボタン */}
        <button
          onClick={() => !isLiked && onLike(tree.id)}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "none", border: "none", cursor: isLiked ? "default" : "pointer",
            fontSize: T.fontSize.base, color: isLiked ? T.red : "rgba(26,15,0,0.35)",
            padding: "2px 4px", borderRadius: 6, transition: "color 0.15s",
          }}
        >
          <i className={`ti ti-heart${isLiked ? "-filled" : ""}`} style={{ fontSize: T.fontSize.xxl }} />
          {(tree.liked_by || 0) + (justLiked ? 1 : 0)}
        </button>
      </div>

      {/* コピーボタン行 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 8 }}>
        <button
          onClick={() => onCopy(tree.id)}
          disabled={isCopying}
          style={{
            fontSize: T.fontSize.md, padding: "5px 12px", borderRadius: T.radius.sm,
            cursor:     isCopying ? "default" : "pointer",
            border:     `0.5px solid ${T.gold}`,
            background: isCopied ? T.gold : "transparent",
            color:      isCopied ? T.cream : T.gold,
            fontFamily: T.fontSerif,
            display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s",
          }}
        >
          <i className={`ti ti-${isCopied ? "check" : isCopying ? "loader" : "copy"}`} style={{ fontSize: T.fontSize.base }} />
          {isCopied ? "コピーしました" : isCopying ? "コピー中..." : "コピー"}
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// TagFilter: タグ絞り込みバー
// ──────────────────────────────────────────────────
function TagFilter({ trees, activeTag, onSelect }) {
  const allTags = ["すべて", ...new Set((trees || []).flatMap((t) => t.tags || []))];

  return (
    <div style={{ display: "flex", gap: 6, padding: "10px 16px", overflowX: "auto", flexShrink: 0 }}>
      {allTags.map((tag) => (
        <div
          key={tag}
          onClick={() => onSelect(tag)}
          style={{
            whiteSpace: "nowrap", fontSize: T.fontSize.md, padding: "5px 12px", borderRadius: T.radius.xl, cursor: "pointer",
            fontFamily: T.fontSerif,
            border:      activeTag === tag ? `0.5px solid ${T.gold}`         : "0.5px solid rgba(26,15,0,0.15)",
            background:  activeTag === tag ? T.goldLight                      : T.cream,
            color:       activeTag === tag ? T.ink                            : "rgba(26,15,0,0.45)",
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
export function PublicTrees({ trees, profile, likedTreeIds, onBack, onCopy, onLike, onRefresh }) {
  const [query,     setQuery]     = useState("");
  const [activeTag, setActiveTag] = useState("すべて");
  const [copiedId,  setCopiedId]  = useState(null);
  const [copying,   setCopying]   = useState(null);
  const [likedIds,  setLikedIds]  = useState(new Set());
  // この画面で新しく押したいいねだけを別管理する。
  // サーバの liked_by には既存（復元）のいいねが既に含まれるため、表示の +1 補正は
  // 「今セッションで押した分」だけに限定しないと、再訪時に常に1多く表示されてしまう。
  const [justLikedIds, setJustLikedIds] = useState(new Set());

  // サーバー上の既存いいねを反映（画面再訪時に「未いいね」へ戻る／重複いいねを防ぐ）
  const likedTreeIdsStr = JSON.stringify(likedTreeIds || []);
  useEffect(() => {
    setLikedIds((prev) => new Set([...prev, ...(likedTreeIds || [])]));
  }, [likedTreeIdsStr]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = (trees || []).filter((t) => {
    const matchTag = activeTag === "すべて" || (t.tags || []).includes(activeTag);
    const matchQ   = !query || t.name.includes(query) || (t.tags || []).some((tg) => tg.includes(query));
    return matchTag && matchQ;
  });

  const copiedTimer = useRef(null);
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  const handleCopy = async (id) => {
    setCopying(id);
    try {
      await onCopy(id);
      setCopiedId(id);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedId(null), 2500);
    } catch (e) {
      console.error("コピーに失敗しました", e);
    } finally {
      setCopying(null);
    }
  };

  const handleLike = async (id) => {
    if (likedIds.has(id)) return;
    setLikedIds((prev) => new Set([...prev, id]));
    setJustLikedIds((prev) => new Set([...prev, id]));
    recordAction("liked");
    try { await onLike?.(id); } catch {}
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.cream }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 14px 12px", borderBottom: "0.5px solid rgba(26,15,0,0.12)" }}>
        <BackBtn onClick={onBack} />
        <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink, flex: 1 }}>みんなのツリー</div>
        <button onClick={onRefresh} style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1.125rem" }}>
          <i className="ti ti-refresh" />
        </button>
      </div>

      {/* 検索バー */}
      <div style={{ padding: "10px 16px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, border: "0.5px solid rgba(26,15,0,0.15)", borderRadius: T.radius.md, padding: "9px 12px", background: T.goldLight }}>
          <i className="ti ti-search" style={{ fontSize: T.fontSize.xxl, color: T.gray }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="戦法名・タグで検索"
            style={{ flex: 1, border: "none", background: "transparent", fontSize: T.fontSize.lg, color: T.ink, outline: "none", fontFamily: T.fontSerif }}
          />
          {query && (
            <i className="ti ti-x" style={{ fontSize: T.fontSize.xl, color: T.gray, cursor: "pointer" }} onClick={() => setQuery("")} />
          )}
        </div>
      </div>

      {/* タグフィルター */}
      <TagFilter trees={trees} activeTag={activeTag} onSelect={setActiveTag} />

      {/* ツリー一覧 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 0", fontSize: T.fontSize.base, color: T.gray, fontFamily: T.fontSerif }}>
            <i className="ti ti-mood-empty" style={{ fontSize: "2rem", display: "block", marginBottom: 10 }} />
            見つかりませんでした
          </div>
        ) : (
          filtered.map((t) => (
            <PublicTreeCard
              key={t.id}
              tree={t}
              isCopied={copiedId === t.id}
              isCopying={copying === t.id}
              isLiked={likedIds.has(t.id)}
              justLiked={justLikedIds.has(t.id)}
              onCopy={handleCopy}
              onLike={handleLike}
            />
          ))
        )}
      </div>
    </div>
  );
}
