-- ══════════════════════════════════════════════════
-- 勝率（◯割くらい勝てる）を追加
-- Supabase の SQL Editor で実行してください
-- ══════════════════════════════════════════════════

-- 0〜10割。未設定の場合は null
alter table public.nodes
  add column if not exists win_rate smallint
  check (win_rate between 0 and 10);
