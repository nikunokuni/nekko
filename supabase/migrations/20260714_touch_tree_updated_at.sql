-- ══════════════════════════════════════════════════
-- ノードの変更を親ツリーの updated_at に反映する
--   一覧カードの「更新日（今日/昨日/N日前）」は trees.updated_at を
--   参照しているが、ノードの追加・編集・削除ではツリー行が更新されず
--   日付が動かなかった。ノード操作時に親ツリーを touch して解消する。
-- Supabase の SQL Editor で実行してください
-- ══════════════════════════════════════════════════

create or replace function public.touch_tree_updated_at()
returns trigger as $$
begin
  update public.trees set updated_at = now()
  where id = coalesce(new.tree_id, old.tree_id);
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

drop trigger if exists trg_touch_tree_updated_at on public.nodes;
create trigger trg_touch_tree_updated_at
  after insert or update or delete on public.nodes
  for each row execute function public.touch_tree_updated_at();
