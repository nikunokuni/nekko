-- ══════════════════════════════════════════════════
-- 公開ツリーの「みんなで編集」（試験運用）
--
--   公開ツリーは今まで読むだけだった。これを、ログイン済みの利用者なら
--   誰でもノードを足す・直す・消せるツリーにできるようにする。
--
--   ── なぜ列を1つ足すだけにしたか ──
--   「共同編集ツリー」という別の型を作ると、一覧・コピー・削除・公開の
--   すべてに分岐が増える。実体は公開ツリーのままで、印が1つ増えるだけにする
--   （まとめノード＝is_summary と同じ考え方）。
--
--   ── 権限の線引き ──
--   ノードの追加・変更・削除 … ログイン済みの誰でも
--   ツリーそのもの（名前・公開・みんなで編集の解除・削除・一言メモ）… オーナーだけ
--   ツリー行の update ポリシーは既存の「オーナーのみ」がそのまま効くので、
--   ここでは何も足さない（足すと器まで他人に触られる）。
--
--   ── 試験運用の範囲 ──
--   みんなで編集にできるのは username = 'niku' のツリーだけ。
--   画面側でもボタンを出し分けるが、それだけだと「押せないだけ」で
--   直接APIを叩けば通ってしまうので、DB側にも同じ判定を置く
--   （get_app_stats と同じ形）。
--
-- Supabase の SQL Editor で実行してください
-- ══════════════════════════════════════════════════

alter table public.trees
  add column if not exists is_collaborative boolean not null default false;

-- ── みんなで編集にできるのは niku のツリーだけ ──────────────
--   判定するのは「呼び出した人」ではなく「ツリーの持ち主」。
--   trees を update できるのは元々オーナーだけなので、これで同じことになる。
create or replace function public.guard_collaborative_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- false → true に変わるときだけ見る（解除と、既に true のままの更新は素通し）
  if new.is_collaborative and not coalesce(old.is_collaborative, false) then
    if not exists (
      select 1 from public.profiles
      where id = new.user_id and username = 'niku'
    ) then
      raise exception 'みんなで編集は試験運用中です';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_collaborative_flag on public.trees;
create trigger trg_guard_collaborative_flag
  before insert or update on public.trees
  for each row execute function public.guard_collaborative_flag();

-- ── ノードの追加・変更・削除を全員に開く ────────────────
--   permissive ポリシーは OR で結合されるので、既存の「自分のツリーだけ」
--   ポリシーはそのまま残る。ここで足すのは、みんなで編集ツリーぶんの追加分。
--
--   insert / update の with check で user_id をツリーのオーナーに縛るのは、
--   ノードの持ち主をツリーの持ち主にそろえるため。編集した人を持ち主にすると、
--   その人のノード検索（自分の全ノード）とトロフィーの数に、
--   他人のツリーのノードが混ざってしまう。

drop policy if exists "nodes_insert_collab_trees" on public.nodes;
create policy "nodes_insert_collab_trees" on public.nodes
  for insert to authenticated
  with check (
    exists (
      select 1 from public.trees t
      where t.id = tree_id and t.is_public and t.is_collaborative
        and t.user_id = nodes.user_id
    )
  );

drop policy if exists "nodes_update_collab_trees" on public.nodes;
create policy "nodes_update_collab_trees" on public.nodes
  for update to authenticated
  using (
    exists (
      select 1 from public.trees t
      where t.id = tree_id and t.is_public and t.is_collaborative
    )
  )
  with check (
    exists (
      select 1 from public.trees t
      where t.id = tree_id and t.is_public and t.is_collaborative
        and t.user_id = nodes.user_id
    )
  );

drop policy if exists "nodes_delete_collab_trees" on public.nodes;
create policy "nodes_delete_collab_trees" on public.nodes
  for delete to authenticated
  using (
    exists (
      select 1 from public.trees t
      where t.id = tree_id and t.is_public and t.is_collaborative
    )
  );
