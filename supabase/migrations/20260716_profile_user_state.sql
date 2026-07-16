-- ══════════════════════════════════════════════════════════════════
-- profiles にユーザー状態（実績・カスタムタグ）を保存する列を追加
--   これまで端末ローカル（localStorage）に置いていた
--   ログイン日数 / アクション達成 / 獲得バッジ / カスタム戦法タグ /
--   カスタムコメントタグ を DB に移し、端末変更やキャッシュ削除でも
--   失われないようにする。
--   Supabase の SQL Editor で実行してください。
-- ══════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists login_days           jsonb not null default '[]'::jsonb;  -- "YYYY-MM-DD"[]（JST）
alter table public.profiles
  add column if not exists actions               jsonb not null default '{}'::jsonb;  -- { copied:true, ... }
alter table public.profiles
  add column if not exists earned_badges         jsonb not null default '[]'::jsonb;  -- バッジID[]
alter table public.profiles
  add column if not exists custom_strategy_tags  jsonb not null default '[]'::jsonb;  -- { name, group }[]
alter table public.profiles
  add column if not exists custom_comment_tags   jsonb not null default '[]'::jsonb;  -- { name, group }[]

-- 自分の profiles 行を更新できるRLSポリシー（無ければ作成）。
-- ユーザー状態の永続化（updateProfile）はこの更新権限に依存する。
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_own'
  ) then
    create policy profiles_update_own on public.profiles
      for update to authenticated
      using (id = auth.uid())
      with check (id = auth.uid());
  end if;
end $$;
