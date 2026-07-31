-- ══════════════════════════════════════════════════════════════════
-- 棋譜（kifus）に対局情報を追加し、傾向分析を可能にする
--
--   これまで kifus は指し手（snapshots）しか持っておらず、
--   「勝ったか負けたか」「自分がどちら側か」が分からないため、
--   何局ためても勝てる傾向の分析ができなかった。
--
--   ・result     … 先手から見た結果。'sente' / 'gote' / 'draw' / null(中断等)
--   ・my_side    … その対局で自分がどちら側だったか。'sente' / 'gote' / null
--                  対局者名の照合で自動判定し、外れたときは手動で直せる。
--   ・handicap   … 手合割。駒落ちは初期配置も先後も異なるため集計から除外する。
--
--   既に取り込み済みの棋譜も source_text（KIF/CSA原文）が残っているので、
--   アプリ側から再解析してこれらの列を後追いで埋められる。
--   Supabase の SQL Editor で実行してください。
-- ══════════════════════════════════════════════════════════════════

alter table public.kifus
  add column if not exists sente_name text not null default '';
alter table public.kifus
  add column if not exists gote_name  text not null default '';
alter table public.kifus
  add column if not exists handicap   text not null default '';
alter table public.kifus
  add column if not exists result     text;
alter table public.kifus
  add column if not exists my_side    text;
alter table public.kifus
  add column if not exists played_at  timestamptz;
-- 対局情報を source_text から解析済みかどうか。
-- false の行だけを再解析すればよく、取り込み済み棋譜の一括更新を再実行しても無駄がない。
alter table public.kifus
  add column if not exists meta_parsed boolean not null default false;

-- 盤面から抽出した特徴（飛車の筋・囲い・角交換など）を取り込み時に計算して保存する。
-- 集計のたびに全棋譜の snapshots（1局で数十KB）を取り直すと通信量が実用に耐えないため、
-- 分析画面はこの軽い列だけを読む。
alter table public.kifus
  add column if not exists features jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'kifus_result_check') then
    alter table public.kifus
      add constraint kifus_result_check check (result in ('sente', 'gote', 'draw'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'kifus_my_side_check') then
    alter table public.kifus
      add constraint kifus_my_side_check check (my_side in ('sente', 'gote'));
  end if;
end $$;

-- 対局日順の一覧表示用
create index if not exists kifus_user_played_at_idx on public.kifus (user_id, played_at desc);

-- ── 棋譜での自分の対局者名 ──────────────────────────
--   将棋アプリごとにIDが違う（ウォーズ名・24のID等）ので配列で持つ。
--   棋譜の 先手／後手 名がこのどれかと一致したら「自分の側」と判定する。
alter table public.profiles
  add column if not exists kifu_player_names jsonb not null default '[]'::jsonb;  -- string[]
