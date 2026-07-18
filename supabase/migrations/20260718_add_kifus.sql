-- ══════════════════════════════════════════════════
-- 棋譜ライブラリ（kifus テーブル）
--   棋譜をノードから独立したレコードとして保存し、
--   どのツリーからでも参照・取り込みできるようにする。
--   ・snapshots は nodes.kifu と同じ形式（盤面スナップショットの配列）。
--     ノードへの取り込みは参照ではなくコピー（公開/copy_tree との整合のため）。
--   ・source_text に KIF/CSA の原文を保持する（将来のエクスポート・再パース用）。
--   ・公開・共有は対象外。本人のみ読み書きできる。
-- Supabase の SQL Editor で実行してください
-- ══════════════════════════════════════════════════

create table if not exists public.kifus (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  memo        text not null default '',
  snapshots   jsonb not null default '[]'::jsonb,  -- [{board, handSente, handGote}, ...]
  source_text text not null default '',            -- KIF/CSA 原文
  move_count  int not null default 0,              -- 一覧表示用（snapshots.length - 1）
  created_at  timestamptz not null default now()
);

create index if not exists kifus_user_id_idx on public.kifus (user_id);

alter table public.kifus enable row level security;

-- 本人のみ読み書き可能（公開機能はなし）
drop policy if exists "kifus_select_own" on public.kifus;
create policy "kifus_select_own" on public.kifus
  for select using (user_id = auth.uid());

drop policy if exists "kifus_insert_own" on public.kifus;
create policy "kifus_insert_own" on public.kifus
  for insert with check (user_id = auth.uid());

drop policy if exists "kifus_update_own" on public.kifus;
create policy "kifus_update_own" on public.kifus
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "kifus_delete_own" on public.kifus;
create policy "kifus_delete_own" on public.kifus
  for delete using (user_id = auth.uid());
