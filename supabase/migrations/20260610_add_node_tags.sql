-- ══════════════════════════════════════════════════
-- ノードごとの戦法タグを追加
-- Supabase の SQL Editor で実行してください
-- ══════════════════════════════════════════════════

-- ノードが持つ戦法タグ（ツリー全体のタグは各ノードのタグの集合になる）
alter table public.nodes
  add column if not exists tags jsonb not null default '[]'::jsonb;
