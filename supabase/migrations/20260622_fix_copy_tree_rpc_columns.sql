-- ══════════════════════════════════════════════════
-- copy_tree RPC (20260616) の INSERT 列リストが
-- 20260617 (situation/my_approach/orientation) 以降に
-- 追加されたカラムをコピーしておらず、公開ツリーの
-- コピー時に内容が無言で欠落していたため修正
-- Supabase の SQL Editor で実行してください
-- ══════════════════════════════════════════════════

create or replace function public.copy_tree(p_source_tree_id uuid, p_new_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid := auth.uid();
  v_src         record;
  v_new_tree_id uuid;
begin
  if v_user_id is null then
    raise exception 'ログインが必要です';
  end if;

  select * into v_src from public.trees where id = p_source_tree_id;
  if v_src is null then
    raise exception 'ツリーが見つかりません';
  end if;
  if not v_src.is_public and v_src.user_id <> v_user_id then
    raise exception 'このツリーはコピーできません';
  end if;

  -- 新しいツリーを作成
  insert into public.trees (user_id, name, tags, active)
  values (v_user_id, coalesce(p_new_name, v_src.name || '（コピー）'), coalesce(v_src.tags, '[]'::jsonb), true)
  returning id into v_new_tree_id;

  -- 旧ノードID → 新ノードID の対応表
  create temporary table tmp_copy_tree_id_map (
    old_id uuid primary key,
    new_id uuid not null default gen_random_uuid()
  ) on commit drop;

  insert into tmp_copy_tree_id_map (old_id)
  select id from public.nodes where tree_id = p_source_tree_id;

  -- ノードを一括コピー（親ID・合流元IDは対応表で新IDに変換）
  insert into public.nodes (
    id, tree_id, user_id, parent_id, label, status, approach_type,
    board, stamps, memo, is_root, sort_order,
    hand_sente, hand_gote, tags, kifu, kifu_imported,
    branch_from_move_index, usage_level, win_rate,
    is_merge_target, merge_parent_ids,
    situation, my_approach, orientation,
    like_level, aim, caution, next_study, comment_tags
  )
  select
    m.new_id, v_new_tree_id, v_user_id, pm.new_id,
    n.label, n.status, n.approach_type,
    n.board, n.stamps, n.memo, n.is_root, n.sort_order,
    n.hand_sente, n.hand_gote, n.tags, n.kifu, n.kifu_imported,
    n.branch_from_move_index, n.usage_level, n.win_rate,
    coalesce(n.is_merge_target, false),
    coalesce((
      select jsonb_agg(map2.new_id)
      from jsonb_array_elements_text(coalesce(n.merge_parent_ids, '[]'::jsonb)) as mp(val)
      join tmp_copy_tree_id_map map2 on map2.old_id = mp.val::uuid
    ), '[]'::jsonb),
    n.situation, n.my_approach, n.orientation,
    n.like_level, n.aim, n.caution, n.next_study, n.comment_tags
  from public.nodes n
  join tmp_copy_tree_id_map m  on m.old_id = n.id
  left join tmp_copy_tree_id_map pm on pm.old_id = n.parent_id;

  return v_new_tree_id;
end;
$$;

grant execute on function public.copy_tree(uuid, text) to authenticated;
