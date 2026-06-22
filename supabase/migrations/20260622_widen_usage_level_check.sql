-- ══════════════════════════════════════════════════
-- usage_level を 5 段階（1〜5）に対応させる
-- UI（USAGE_LEVELS = [1,2,3,4,5]）は既に5段階だが、
-- 20260614 のCHECK制約が 1〜3 のままだったため
-- レベル4・5での保存が失敗していた
-- Supabase の SQL Editor で実行してください
-- ══════════════════════════════════════════════════

alter table public.nodes
  drop constraint if exists nodes_usage_level_check;

alter table public.nodes
  add constraint nodes_usage_level_check check (usage_level between 1 and 5);
