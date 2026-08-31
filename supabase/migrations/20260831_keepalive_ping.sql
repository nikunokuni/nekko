-- ══════════════════════════════════════════════════
-- 一時停止よけの ping を「読み」から「書き」に変えるための置き場
--
--   これまで keep-alive（.github/workflows/keepalive.yml）は trees を
--   1行読むだけだった。読みは毎日 HTTP 200 で成功していたのに、
--   Supabase からは「nekko は7日以上まともな活動が無く、近いうちに
--   一時停止する予定」という予告メールが届いた（2026-08-31）。
--   anon キーの読みは RLS に弾かれて空配列が返るので、向こうの数え方では
--   「十分な活動」に入らないらしい。届いていることと、活動と見なされる
--   ことは別だった。
--
--   そこで、毎日1行だけ書き換える。書き込みはデータが実際に変わるので、
--   どんな数え方をしても「何も起きていない」とは見なされない。
--
--   テーブルを直接叩かせず関数越しにするのは、anon キーが公開値だから。
--   （フロントのバンドルに埋め込まれて配布されているので、鍵と呼べない）
--   テーブルに anon の書き込みポリシーを置くと、誰でも好きな値を入れられる
--   口が1つ増える。関数だけを許せば、外から起こせるのは「1行の時刻を
--   進める」ことだけになる。行は増えず、他のテーブルにも触れない。
--
--   ping_count は「本当に書けているか」を後から目で確かめるためのもの。
--   止まってから「実は書けていなかった」と分かるのが一番まずいので、
--   ダッシュボードで1行見れば分かるようにしておく。
--
-- Supabase の SQL Editor で実行してください
-- ══════════════════════════════════════════════════

-- 1行しか持たないテーブル。id = 1 の縛りで、行が増えることを型で防ぐ
create table if not exists public.keepalive (
  id         smallint primary key default 1 check (id = 1),
  pinged_at  timestamptz not null default now(),
  ping_count bigint      not null default 0
);

insert into public.keepalive (id) values (1) on conflict (id) do nothing;

-- RLS を有効にしてポリシーを1つも置かない＝PostgREST 経由では誰も読めない・書けない。
-- 触れるのは下の関数（security definer）からだけになる
alter table public.keepalive enable row level security;
revoke all on table public.keepalive from anon, authenticated;

-- ping 本体。1行の時刻を進めて、その時刻を返す。
-- 返り値があるのは、呼んだ側（ワークフロー）が「書けた」ことを
-- 応答だけで確かめられるようにするため
create or replace function public.ping()
returns timestamptz
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.keepalive
     set pinged_at  = now(),
         ping_count = ping_count + 1
   where id = 1
  returning pinged_at;
$$;

-- 既定で public に付く実行権限を外してから、呼ばせたい相手にだけ渡す
revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
