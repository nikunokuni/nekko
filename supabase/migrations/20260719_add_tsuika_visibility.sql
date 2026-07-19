-- ══════════════════════════════════════════════════════════════════
-- profiles にノード詳細「ついか」欄の表示設定を追加
--   { orientation:false, winRate:false, ... } のように false のキーだけ
--   非表示（既定＝全項目表示）。表示を消すだけでノードのデータは消えない。
--   端末をまたいで設定が同期されるよう profiles（DB）を真実源にする。
--   Supabase の SQL Editor で実行してください。
-- ══════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists tsuika_visibility jsonb not null default '{}'::jsonb;
