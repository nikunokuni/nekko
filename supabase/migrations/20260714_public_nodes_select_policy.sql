-- ══════════════════════════════════════════════════
-- 公開ツリーのノードを誰でも閲覧できるようにする SELECT ポリシー
--   「みんなのツリー」のプレビュー機能（タップで中身を見る）は
--   クライアントから他ユーザーの公開ツリーの nodes を直接 select する。
--   これまでコピーは SECURITY DEFINER の copy_tree RPC 経由だったため
--   このポリシーがなくても動いていたが、プレビューには必要になる。
--   （permissive ポリシーは OR 結合なので、既存の所有者向けポリシーには影響しない）
-- Supabase の SQL Editor で実行してください
-- ══════════════════════════════════════════════════

drop policy if exists "nodes_select_public_trees" on public.nodes;
create policy "nodes_select_public_trees" on public.nodes
  for select
  using (
    exists (
      select 1 from public.trees t
      where t.id = tree_id
        and t.is_public
    )
  );
