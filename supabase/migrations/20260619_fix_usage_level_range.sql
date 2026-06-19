-- ══════════════════════════════════════════════════
-- 「頻度」を5段階評価に変更した際、CHECK制約が
-- 1〜3のまま更新されていなかったバグを修正
-- （フロントは USAGE_LEVELS = [1,2,3,4,5] を使用）
-- Supabase の SQL Editor で実行してください
-- ══════════════════════════════════════════════════

alter table public.nodes
  drop constraint if exists nodes_usage_level_check;

alter table public.nodes
  add constraint nodes_usage_level_check
  check (usage_level between 1 and 5);
