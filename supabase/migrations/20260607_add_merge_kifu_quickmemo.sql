-- ══════════════════════════════════════════════════
-- 合流リンク・棋譜記録・ツリーの一言メモを追加
-- Supabase の SQL Editor で実行してください
-- ══════════════════════════════════════════════════

-- ノードの合流先（他ノードへのリンク）
alter table public.nodes
  add column if not exists merge_target_id uuid references public.nodes(id) on delete set null;

-- ノードに記録する棋譜手順（盤面スナップショットの配列）
alter table public.nodes
  add column if not exists kifu jsonb not null default '[]'::jsonb;

-- ツリーのノードと無関係な「ひとことメモ」
alter table public.trees
  add column if not exists quick_memo text not null default '';

create index if not exists nodes_merge_target_id_idx on public.nodes (merge_target_id);
