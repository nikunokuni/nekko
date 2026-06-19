-- ══════════════════════════════════════════════════
-- 好き度・狙い／注意点／次の課題・コメントタグ を追加
-- （db.js の createNode/updateNode が参照しているが
--   テーブルに列が無く、ノード作成（ルートノード含む）が失敗していた）
-- Supabase の SQL Editor で実行してください
-- ══════════════════════════════════════════════════

alter table public.nodes
  add column if not exists like_level smallint
  check (like_level between 1 and 5),
  add column if not exists aim text not null default '',
  add column if not exists caution text not null default '',
  add column if not exists next_study text not null default '',
  add column if not exists comment_tags jsonb not null default '[]'::jsonb;
