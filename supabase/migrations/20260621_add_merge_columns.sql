-- ══════════════════════════════════════════════════
-- ノードの合流（複数の親 → 1つの子）に使うカラムを追加
-- copy_tree RPC (20260616) と db.js の updateNode/buildTreeFromNodes が
-- is_merge_target / merge_parent_ids を参照しているが未定義だったため追加
-- Supabase の SQL Editor で実行してください
-- ══════════════════════════════════════════════════

alter table public.nodes
  add column if not exists is_merge_target boolean not null default false;

alter table public.nodes
  add column if not exists merge_parent_ids jsonb not null default '[]'::jsonb;
