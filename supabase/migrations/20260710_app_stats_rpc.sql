-- ══════════════════════════════════════════════════════════════════
-- 開発者向けアプリ統計 RPC
--   RLS を回避して全ユーザーの総数を集計する。
--   SECURITY DEFINER で実行するため、呼び出し元が開発者(niku)本人か
--   どうかを関数内で必ず検査し、それ以外は拒否する。
-- ══════════════════════════════════════════════════════════════════
create or replace function public.get_app_stats()
returns table (accounts bigint, trees bigint, nodes bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 呼び出し元が開発者(niku)本人のときだけ許可する
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and username = 'niku'
  ) then
    raise exception 'not authorized';
  end if;

  return query
    select
      (select count(*) from public.profiles)                       as accounts,
      (select count(*) from public.trees)                          as trees,
      (select count(*) from public.nodes where is_root = false)    as nodes;
end;
$$;

-- ログイン済みユーザーのみ実行可能（関数内で更に niku 判定を行う）
revoke all on function public.get_app_stats() from public;
grant execute on function public.get_app_stats() to authenticated;
