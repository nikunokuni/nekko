// ══════════════════════════════════════════════════
// useAuth.js  ―  認証まわりの状態（session / profile / 実績・開発者統計）
//   Supabase Auth のブートストラップと、ログイン確定後のプロフィール取得・
//   ユーザー状態（実績）のハイドレート・ログイン記録をここに集約する。
// ══════════════════════════════════════════════════
import { useState, useEffect } from "react";
import { supabase, getSession, getProfile, signOut, getAppStats } from "../db";
import { initUserState, resetUserState, recordLogin, getLoginStats } from "../rewards";

export function useAuth() {
  const [session,    setSession]    = useState(undefined); // undefined = 未確定
  const [profile,    setProfile]    = useState(null);
  const [loginStats, setLoginStats] = useState({ totalDays: 0, streak: 0 });
  const [devStats,   setDevStats]   = useState(null);

  // ── Auth bootstrap ────────────────────────────
  useEffect(() => {
    getSession().then(s => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  // session 確定後にプロフィール・ユーザー状態を取得
  useEffect(() => {
    if (!session) return;
    getProfile(session.user.id)
      .then(async ({ data }) => {
        setProfile(data);
        // ユーザー状態（実績・カスタムタグ）を profiles からハイドレートしてから
        // ログインを記録する。旧 localStorage データがあればここで一度だけDBへ移行する。
        await initUserState(session.user.id, data);
        recordLogin();
        setLoginStats(getLoginStats());
      })
      .catch((e) => console.error("getProfile error:", e));
  }, [session]);

  // 開発者（niku）のときだけ、アプリ全体の統計（全ユーザーのアカウント/ツリー/ノード数）を取得
  useEffect(() => {
    if (profile?.username !== "niku") { setDevStats(null); return; }
    getAppStats()
      .then(setDevStats)
      .catch((e) => console.error("devStats error:", e));
  }, [profile]);

  const handleAuth = (_user, sess) => setSession(sess);

  // サインアウト（認証側の後始末）。画面側の後始末（ツリー state クリア・遷移）は
  // 呼び出し元（App）が続けて行う。
  const handleSignOutAuth = async () => {
    await signOut();
    resetUserState(); // セッションキャッシュを空にし、次のユーザーへ持ち越さない
    setSession(null);
    setProfile(null);
  };

  return { session, profile, loginStats, devStats, handleAuth, handleSignOutAuth };
}
