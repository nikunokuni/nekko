-- ══════════════════════════════════════════════════
-- いいね数の自動カウント同期 + ユーザー名の一意制約
-- Supabase の SQL Editor で実行してください
-- ══════════════════════════════════════════════════

-- 同一ユーザーが同じツリーに重複していいねできないようにする
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'likes_user_tree_unique'
  ) then
    alter table public.likes
      add constraint likes_user_tree_unique unique (user_id, tree_id);
  end if;
end $$;

-- likes の増減に合わせて trees.liked_by を同期するトリガー
create or replace function public.sync_tree_liked_by()
returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    update public.trees set liked_by = liked_by + 1 where id = new.tree_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.trees set liked_by = greatest(liked_by - 1, 0) where id = old.tree_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_sync_tree_liked_by on public.likes;
create trigger trg_sync_tree_liked_by
  after insert or delete on public.likes
  for each row execute function public.sync_tree_liked_by();

-- 既存データとの整合性を取るため liked_by を実カウントに合わせ直す
update public.trees t
  set liked_by = (select count(*) from public.likes l where l.tree_id = t.id);

-- ユーザー名の重複を禁止する
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_username_unique'
  ) then
    alter table public.profiles
      add constraint profiles_username_unique unique (username);
  end if;
end $$;
