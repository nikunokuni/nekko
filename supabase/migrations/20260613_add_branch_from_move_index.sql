-- ══════════════════════════════════════════════════
-- 棋譜分岐：親ノードの棋譜の何手目から分岐したかを記録
-- Supabase の SQL Editor で実行してください
-- ══════════════════════════════════════════════════

-- 親ノードの kifu 配列における分岐元のインデックス（手数）
-- 0 = 初期局面、null = 棋譜分岐で作られたノードではない
alter table public.nodes
  add column if not exists branch_from_move_index integer;
