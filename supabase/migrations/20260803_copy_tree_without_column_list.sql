-- ══════════════════════════════════════════════════
-- copy_tree RPC から「ノードの列名の一覧」を無くす
--
--   これまでの copy_tree は insert する列を1つずつ書き並べていた。
--   そのため nodes に列を足すたびに、この関数も追従して直す必要があり、
--   忘れると**コピーしたツリーからその項目だけが黙って消える**。
--   実際に一度起きている（20260622_fix_copy_tree_rpc_columns.sql）。
--   画面は壊れず、コピーした本人も気づけないため、直った時にはもう
--   コピー済みのツリーからは失われている。
--
--   そこで、行をまるごと jsonb にして「コピーで変える列」だけを上書きし、
--   jsonb_populate_record で nodes の行型に戻す形にする。
--   以後、nodes に列を足してもこの関数は触らなくてよい。
--
--   上書きするのは、コピー先で必ず変わる5つだけ：
--     id / tree_id / user_id … 新しいツリーの持ち物にする
--     parent_id             … 親も新しいIDに置き換える
--     merge_parent_ids      … 合流元も同様（ツリー内で閉じた参照なので付け替える）
--     created_at            … コピーした日時にする（元の作成日を引き継がない）
--   jsonb_populate_record は nodes に無いキーを黙って捨てるので、
--   created_at が無い環境でも壊れない。
--
--   ※ モック（test-harness/supabaseMock.js）の copy_tree は元から
--     「行を丸ごとコピーして数か所だけ差し替える」実装だった。
--     本番SQLのほうをその挙動に合わせる変更でもある。
--
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

  -- 新しいツリーを作成（trees.tags は text[] 型なので '{}'::text[] で coalesce）
  insert into public.trees (user_id, name, tags, active, copied_from)
  values (v_user_id, coalesce(p_new_name, v_src.name || '（コピー）'), coalesce(v_src.tags, '{}'::text[]), true, p_source_tree_id)
  returning id into v_new_tree_id;

  -- 旧ノードID → 新ノードID の対応表
  create temporary table tmp_copy_tree_id_map (
    old_id uuid primary key,
    new_id uuid not null default gen_random_uuid()
  ) on commit drop;

  insert into tmp_copy_tree_id_map (old_id)
  select id from public.nodes where tree_id = p_source_tree_id;

  -- ノードを一括コピー。
  -- 列を並べずに行ごと写し、コピーで必ず変わる列だけを上書きする。
  insert into public.nodes
  select (jsonb_populate_record(
            null::public.nodes,
            to_jsonb(n) || jsonb_build_object(
              'id',        m.new_id,
              'tree_id',   v_new_tree_id,
              'user_id',   v_user_id,
              'parent_id', pm.new_id,
              'merge_parent_ids', coalesce((
                select jsonb_agg(map2.new_id)
                from jsonb_array_elements_text(coalesce(n.merge_parent_ids, '[]'::jsonb)) as mp(val)
                join tmp_copy_tree_id_map map2 on map2.old_id = mp.val::uuid
              ), '[]'::jsonb),
              'created_at', now()
            )
          )).*
  from public.nodes n
  join tmp_copy_tree_id_map m  on m.old_id = n.id
  left join tmp_copy_tree_id_map pm on pm.old_id = n.parent_id;

  return v_new_tree_id;
end;
$$;

grant execute on function public.copy_tree(uuid, text) to authenticated;
