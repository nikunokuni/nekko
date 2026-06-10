-- ══════════════════════════════════════════════════
-- 棋譜インポート機能：インポート元ノードのフラグを追加
-- Supabase の SQL Editor で実行してください
-- ══════════════════════════════════════════════════

-- インポートした棋譜を保持しているノードかどうか
-- （true の場合のみ ShogiBoard に「この局面で分岐」ボタンを表示する）
alter table public.nodes
  add column if not exists kifu_imported boolean not null default false;
