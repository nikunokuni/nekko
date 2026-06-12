-- ══════════════════════════════════════════════════
-- 「よく使う」3段階フラグを追加
-- Supabase の SQL Editor で実行してください
-- ══════════════════════════════════════════════════

-- 1: あまり使わない / 2: ふつう / 3: よく使う（デフォルト: ふつう）
alter table public.nodes
  add column if not exists usage_level smallint not null default 2
  check (usage_level between 1 and 3);
