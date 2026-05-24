-- ================================================================
-- ねっこ — Supabase スキーマ定義
-- Supabase ダッシュボード > SQL Editor で実行してください
-- ================================================================

-- ── ユーザープロフィール ──
create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  username    text unique not null,
  display_name text,
  avatar_url  text,
  created_at  timestamptz default now()
);

-- ── ツリー ──
create table if not exists trees (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete cascade not null,
  name        text not null,
  active      boolean default true,
  is_public   boolean default false,
  tags        text[] default '{}',
  liked_by    integer default 0,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ── ノード ──
create table if not exists nodes (
  id            uuid primary key default gen_random_uuid(),
  tree_id       uuid references trees(id) on delete cascade not null,
  user_id       uuid references profiles(id) on delete cascade not null,
  parent_id     uuid references nodes(id) on delete cascade,
  label         text not null,
  status        text default 'todo' check (status in ('done','wip','todo')),
  approach_type text,
  board         jsonb,
  stamps        jsonb default '[]',
  memo          text default '',
  is_root       boolean default false,
  is_merge_target boolean default false,
  sort_order    integer default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── いいね ──
create table if not exists likes (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid references profiles(id) on delete cascade,
  tree_id  uuid references trees(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id, tree_id)
);

-- ================================================================
-- RLS (Row Level Security)
-- ================================================================

alter table profiles enable row level security;
alter table trees    enable row level security;
alter table nodes    enable row level security;
alter table likes    enable row level security;

-- profiles: 自分のみ編集、全員読み取り可
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- trees: 自分のものは全操作、公開ツリーは全員読み取り
create policy "trees_select_own"    on trees for select using (auth.uid() = user_id);
create policy "trees_select_public" on trees for select using (is_public = true);
create policy "trees_insert"        on trees for insert with check (auth.uid() = user_id);
create policy "trees_update"        on trees for update using (auth.uid() = user_id);
create policy "trees_delete"        on trees for delete using (auth.uid() = user_id);

-- nodes: 自分のものは全操作、公開ツリーのノードは全員読み取り
create policy "nodes_select_own" on nodes for select
  using (auth.uid() = user_id);
create policy "nodes_select_public" on nodes for select
  using (exists (select 1 from trees where trees.id = nodes.tree_id and trees.is_public = true));
create policy "nodes_insert" on nodes for insert
  with check (auth.uid() = user_id);
create policy "nodes_update" on nodes for update
  using (auth.uid() = user_id);
create policy "nodes_delete" on nodes for delete
  using (auth.uid() = user_id);

-- likes: 自分のいいねを管理
create policy "likes_select" on likes for select using (true);
create policy "likes_insert" on likes for insert with check (auth.uid() = user_id);
create policy "likes_delete" on likes for delete using (auth.uid() = user_id);

-- ================================================================
-- updated_at 自動更新トリガー
-- ================================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trees_updated_at before update on trees
  for each row execute function update_updated_at();
create trigger nodes_updated_at before update on nodes
  for each row execute function update_updated_at();

-- ================================================================
-- プロフィール自動作成トリガー（サインアップ時）
-- ================================================================
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
