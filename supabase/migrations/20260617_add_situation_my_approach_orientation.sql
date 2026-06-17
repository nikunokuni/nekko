-- ══════════════════════════════════════════════════
-- ノード1つに「相手の戦法・局面の状況」と「自分の戦法」を
-- まとめて記録できるようにする + 志向（攻め/受け/バランス/不明）
-- Supabase の SQL Editor で実行してください
-- ══════════════════════════════════════════════════

-- situation / my_approach は戦法タグと同じ形式（文字列配列のjsonb）で持つ
alter table public.nodes
  add column if not exists situation jsonb not null default '[]'::jsonb,
  add column if not exists my_approach jsonb not null default '[]'::jsonb,
  add column if not exists orientation text
  check (orientation in ('攻め', '受け', 'バランス', '不明'));
