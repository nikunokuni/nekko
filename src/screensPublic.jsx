// ══════════════════════════════════════════════════
// screensPublic.jsx  ―  認証・公開ツリー画面
//   AuthScreen / PublicTrees
// ══════════════════════════════════════════════════
import { useState, useEffect, useRef, useMemo } from "react";
import { BackBtn, StatusChip } from "./components";
import { MindMap } from "./screens/MindMapScreen";
import ShogiBoard from "./ShogiBoard";
import { ORIENTATION_META, USAGE_META } from "./data";
import { signIn, signUp, resetPasswordWithRecovery } from "./db";
import { recordAction, resetOnboard } from "./rewards";
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
function AuthInputField({ label, value, setter, type = "text", placeholder = "", nameAttr = "", required = true }) {
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
        required={required}
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
  // mode: "login" | "signup" | "recovery"（リカバリーコードでパスワード再設定）
  const [mode,         setMode]         = useState("login");
  const [username,     setUsername]     = useState("");
  const [password,     setPassword]     = useState("");
  const [displayName,  setDisplayName]  = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");

  // ID に使える文字（半角英数字と _ . -）。
  // これ以外は idToFakeEmail で除去され、不正なメールアドレスになって登録に失敗するため、
  // 入力の時点で弾いて分かりやすいエラーを出す。
  const USERNAME_RE = /^[a-zA-Z0-9_.-]+$/;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("IDとパスワードを入力してください");
      return;
    }
    if (mode === "signup" && !USERNAME_RE.test(username.trim())) {
      setError("IDは半角英数字（と _ . - ）で入力してください");
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

      } else if (mode === "recovery") {
        // リカバリーコードでパスワードを再設定し、そのまま新パスワードでログインする
        if (!recoveryCode.trim()) { setError("リカバリーコードを入力してください"); return; }
        try {
          await resetPasswordWithRecovery({
            username: username.trim(),
            code: recoveryCode,
            newPassword: password,
          });
        } catch (err) {
          const msg = err?.message || "";
          setError(
            msg.includes("password too short")
              ? "パスワードは6文字以上にしてください"
              : "IDまたはリカバリーコードが違います"
          );
          return;
        }
        const { data: loginData, error: loginErr } = await signIn({ email: username, password });
        if (loginErr) {
          setError("再設定は完了しました。新しいパスワードでログインしてください。");
          setMode("login"); setPassword("");
        } else {
          onAuth(loginData.user, loginData.session);
        }

      } else {
        const { error: err } = await signUp({
          username:    username.trim(),
          password,
          displayName: displayName.trim() || username.trim(),
        });
        if (err) { setError(err.message); return; }

        // 新規登録ユーザーには使い方トーストを最初から表示する（端末の既読履歴をリセット）
        resetOnboard();

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
        {/* タブ（再設定モードのときは見出し＋戻るリンクに切り替える） */}
        {mode === "recovery" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 28, paddingBottom: 10, borderBottom: "0.5px solid rgba(26,15,0,0.12)" }}>
            <button
              type="button"
              onClick={() => switchMode("login")}
              style={{ background: "none", border: "none", cursor: "pointer", color: T.gold, fontSize: "1.125rem", padding: 2, lineHeight: 1 }}
            >
              <i className="ti ti-chevron-left" />
            </button>
            <div style={{ flex: 1, fontSize: T.fontSize.lg, color: T.ink, fontWeight: 600 }}>
              パスワードの再設定
            </div>
          </div>
        ) : (
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
        )}

        {mode === "recovery" && (
          <div style={{ fontSize: T.fontSize.base, color: T.inkMid, lineHeight: 1.8, marginBottom: 14 }}>
            登録時に保存したリカバリーコード（スクリーンショット）のIDとコードを入力してください。
          </div>
        )}

        <AuthInputField
          label={mode === "signup" ? "ID（ログイン用・半角英数字）" : "ID（ログイン用ユーザー名）"}
          value={username}
          // 新規登録では使えない文字をその場で取り除く（既存ユーザーのログイン入力には触れない）
          setter={(v) => setUsername(mode === "signup" ? v.replace(/[^a-zA-Z0-9_.-]/g, "") : v)}
          type="text" placeholder="例: tsuruga_7dan" nameAttr="username" />
        {mode === "signup" && (
          // 表示名は任意（未入力ならIDを表示名として使う）。required にすると
          // 空のままではフォームが無言で送信ブロックされ、登録できなくなる
          <AuthInputField label="表示名（任意）"           value={displayName} setter={setDisplayName} type="text"     placeholder="例: 鶴賀 七段"    nameAttr="nickname" required={false} />
        )}
        {mode === "recovery" && (
          <AuthInputField label="リカバリーコード" value={recoveryCode} setter={setRecoveryCode} type="text" placeholder="XXXX-XXXX-XXXX-XXXX" nameAttr="recovery-code" />
        )}
        <AuthInputField
          label={mode === "recovery" ? "新しいパスワード" : "パスワード"}
          value={password} setter={setPassword}
          type="password" placeholder="8文字以上" nameAttr="password" />

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

        {(() => {
          const disabled = loading || !username || !password || (mode === "recovery" && !recoveryCode);
          return (
            <button
              type="submit"
              disabled={disabled}
              style={{
                width: "100%", padding: "13px", borderRadius: T.radius.lg, border: "none",
                fontSize: T.fontSize.xl, fontWeight: 600,
                cursor:     disabled ? "default" : "pointer",
                background: disabled ? T.gray : T.gold,
                color: T.cream, fontFamily: T.fontSerif,
              }}
            >
              {loading ? "処理中..."
                : mode === "login"    ? "ログイン"
                : mode === "recovery" ? "パスワードを再設定"
                :                       "アカウントを作成"}
            </button>
          );
        })()}

        {/* パスワードを忘れた場合（リカバリーコードで再設定） */}
        {mode === "login" && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button
              type="button"
              onClick={() => switchMode("recovery")}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: T.fontSize.base, color: T.inkMid,
                fontFamily: T.fontSerif, textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              パスワードを忘れた場合（リカバリーコードで再設定）
            </button>
          </div>
        )}
      </form>

      <div style={{ marginTop: 20, fontSize: "0.6875rem", color: "rgba(200,169,110,0.25)", textAlign: "center" }}>
        Powered by Supabase
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// NodeViewSheet: プレビュー中のノード内容を閲覧するボトムシート
// ──────────────────────────────────────────────────
function NodeViewSheet({ node, onClose }) {
  const row = (label, content) => content ? (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: T.fontSize.sm, color: T.inkFaint, fontFamily: T.fontSerif, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: T.fontSize.base, color: T.ink, fontFamily: T.fontSerif, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{content}</div>
    </div>
  ) : null;

  const chips = (label, tags) => (tags || []).length > 0 ? (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: T.fontSize.sm, color: T.inkFaint, fontFamily: T.fontSerif, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {tags.map((t) => (
          <span key={t} style={{ fontSize: T.fontSize.sm, padding: "3px 9px", borderRadius: T.radius.sm, background: T.goldLight, color: T.gold, fontFamily: T.fontSerif }}>{t}</span>
        ))}
      </div>
    </div>
  ) : null;

  const orientMeta = node.orientation ? ORIENTATION_META[node.orientation] : null;
  const showBoard  = !!node.board && !node.boardHidden;

  return (
    <div
      onClick={onClose}
      style={{ position: "absolute", inset: 0, background: "rgba(26,15,0,0.45)", zIndex: 40, display: "flex", alignItems: "flex-end" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxHeight: "80%", overflowY: "auto", background: T.cream, borderRadius: "20px 20px 0 0", padding: "18px 18px 28px" }}
      >
        {/* ヘッダー: ノード名 + ステータス + 閉じる */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.h, color: T.ink, flex: 1, minWidth: 0 }}>{node.label}</span>
          {!node.isRoot && <StatusChip status={node.status} />}
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.gray, fontSize: "1.125rem", padding: 4 }}>
            <i className="ti ti-x" />
          </button>
        </div>

        {chips("相手の戦法", node.situation)}
        {chips("自分の戦法", node.myApproach)}
        {orientMeta && row("志向", <span style={{ color: orientMeta.color }}>{node.orientation}</span>)}
        {node.usageLevel != null && USAGE_META[node.usageLevel] && row("頻度", USAGE_META[node.usageLevel].label)}
        {node.winRate != null && row("勝率", `${node.winRate}割くらい勝てる`)}
        {row("メモ", (node.memo || "").trim())}
        {row("ここでの狙い", (node.aim || "").trim())}
        {row("気を付けること", (node.caution || "").trim())}
        {row("次に調べること", (node.nextStudy || "").trim())}
        {chips("一言コメント", node.commentTags)}

        {/* 盤面（閲覧専用。棋譜があれば再生もできる） */}
        {showBoard && (
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: T.fontSize.sm, color: T.inkFaint, fontFamily: T.fontSerif, marginBottom: 6 }}>盤面</div>
            <ShogiBoard
              board={node.board}
              stamps={node.stamps || []}
              handSente={node.handSente}
              handGote={node.handGote}
              kifu={node.kifu || []}
              readOnly
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────
// PublicTreePreview: 公開ツリーの中身（マップ＋ノード）を閲覧する画面
//   編集操作は一切できない。気に入ったらそのままコピーできる
// ──────────────────────────────────────────────────
export function PublicTreePreview({ tree, onBack, onCopy }) {
  const [viewNodeId, setViewNodeId] = useState(null);
  const [copying,    setCopying]    = useState(false);
  const [copied,     setCopied]     = useState(false);
  const node = viewNodeId ? tree.nodes[viewNodeId] : null;

  const handleCopy = async () => {
    if (copying || copied) return;
    setCopying(true);
    try {
      await onCopy();
      setCopied(true);
    } finally {
      setCopying(false);
    }
  };

  return (
    <div style={{ height: "100%", position: "relative" }}>
      <MindMap tree={tree} readOnly onNodeSelect={setViewNodeId} onBack={onBack} />

      {/* コピー（右下フローティング）。凡例バーと重ならない位置に置く */}
      <button
        onClick={handleCopy}
        disabled={copying}
        style={{
          position: "absolute", right: 16, bottom: 52, zIndex: 30,
          display: "flex", alignItems: "center", gap: 6,
          padding: "10px 16px", borderRadius: T.radius.xl, border: "none",
          background: copied ? T.green : T.gold, color: T.cream,
          fontSize: T.fontSize.lg, fontFamily: T.fontSerif, fontWeight: 600,
          cursor: copying || copied ? "default" : "pointer",
          boxShadow: "0 4px 16px rgba(26,15,0,0.25)",
        }}
      >
        <i className={`ti ti-${copied ? "check" : "copy"}`} style={{ fontSize: "0.875rem" }} />
        {copied ? "コピーしました" : copying ? "コピー中..." : "このツリーをコピー"}
      </button>

      {/* ノード閲覧シート */}
      {node && <NodeViewSheet node={node} onClose={() => setViewNodeId(null)} />}
    </div>
  );
}

// ──────────────────────────────────────────────────
// PublicTreeCard: 公開ツリー1件分のカード
// ──────────────────────────────────────────────────
function PublicTreeCard({ tree, isCopied, isCopying, isLiked, likeCount, onCopy, onToggleLike, onOpen }) {
  const author = tree.profiles?.display_name || tree.profiles?.username || "匿名";

  return (
    <div
      onClick={() => onOpen?.(tree.id)}
      style={{ padding: "14px", borderRadius: T.radius.lg, border: "0.5px solid rgba(200,169,110,0.3)", background: T.goldBg, marginBottom: 10, cursor: "pointer" }}
    >
      {/* ヘッダー行 */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: T.fontTitle, fontSize: T.fontSize.xxl, color: T.ink, marginBottom: 2 }}>{tree.name}</div>
          <div style={{ fontSize: T.fontSize.sm, color: "rgba(26,15,0,0.4)" }}>@{author}</div>
        </div>
        {/* いいねボタン（タップでいいね↔解除をトグル）。カードのタップ（プレビュー）とは独立 */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleLike(tree.id); }}
          title={isLiked ? "いいねを取り消す" : "いいね"}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            background: "none", border: "none", cursor: "pointer",
            fontSize: T.fontSize.base, color: isLiked ? T.red : "rgba(26,15,0,0.35)",
            padding: "2px 4px", borderRadius: 6, transition: "color 0.15s",
          }}
        >
          <i className={`ti ti-heart${isLiked ? "-filled" : ""}`} style={{ fontSize: T.fontSize.xxl }} />
          {likeCount}
        </button>
      </div>

      {/* タグ（タグフィルター・検索が何にマッチしたか分かるように表示する） */}
      {(tree.tags || []).length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {(tree.tags || []).map((tag) => (
            <span key={tag} style={{ fontSize: T.fontSize.sm, padding: "2px 7px", borderRadius: T.radius.sm, background: "rgba(26,15,0,0.06)", color: T.inkMid, fontFamily: T.fontSerif }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* コピーボタン行（左側はプレビューできることのヒント） */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: T.fontSize.sm, color: T.inkFaint, fontFamily: T.fontSerif }}>
          タップで中身を見る ›
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onCopy(tree.id); }}
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
export function PublicTrees({ trees, likedTreeIds, onBack, onCopy, onLike, onUnlike, onRefresh, onOpenTree }) {
  const [query,     setQuery]     = useState("");
  const [activeTag, setActiveTag] = useState("すべて");
  const [copiedId,  setCopiedId]  = useState(null);
  const [copying,   setCopying]   = useState(null);
  const [likedIds,  setLikedIds]  = useState(new Set());

  // サーバー上の既存いいね（初期状態）。表示カウントの補正は「初期状態との差分」で行う。
  // 例: 初期いいね済みのツリーを解除したら -1、未いいねを押したら +1、元に戻せば ±0。
  // （tree.liked_by には既存のいいねが既に含まれるため、初期状態を基準にしないと再訪時にズレる）
  const likedTreeIdsStr = JSON.stringify(likedTreeIds || []);
  const initialLikedIds = useMemo(() => new Set(likedTreeIds || []), [likedTreeIdsStr]); // eslint-disable-line react-hooks/exhaustive-deps

  // 初期いいね状態を現在のいいね状態へ反映（画面再訪時の復元／重複いいね防止）
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

  const handleToggleLike = async (id) => {
    const willLike = !likedIds.has(id);
    const setLiked = (like) => setLikedIds((prev) => {
      const next = new Set(prev);
      if (like) next.add(id); else next.delete(id);
      return next;
    });
    setLiked(willLike);
    try {
      if (willLike) {
        await onLike?.(id);
        recordAction("liked");
      } else {
        await onUnlike?.(id);
      }
    } catch {
      // 保存に失敗したらハート表示を元に戻す（表示とDBのズレを防ぐ）
      setLiked(!willLike);
    }
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
          filtered.map((t) => {
            const liked = likedIds.has(t.id);
            // 初期状態との差分でカウントを補正（解除=-1 / 新規=+1 / 元に戻す=±0）
            const delta = (liked ? 1 : 0) - (initialLikedIds.has(t.id) ? 1 : 0);
            return (
              <PublicTreeCard
                key={t.id}
                tree={t}
                isCopied={copiedId === t.id}
                isCopying={copying === t.id}
                isLiked={liked}
                likeCount={Math.max(0, (t.liked_by || 0) + delta)}
                onCopy={handleCopy}
                onToggleLike={handleToggleLike}
                onOpen={onOpenTree}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
