-- ══════════════════════════════════════════════════════════════════
-- リカバリーコードによるパスワード再設定
--
--   メールアドレスを持たない本アプリ（username@nekko.local の偽メール認証）で、
--   パスワードを忘れたユーザーが自力で再設定できるようにする。
--
--   設計:
--   ・コードはサーバー側で生成し、DB には bcrypt ハッシュのみ保存する
--     （開発者が SQL を見てもコードは分からない。パスワードと同じ扱い）。
--   ・テーブルは RLS 有効・ポリシーなし＝ PostgREST から直接読み書き不可。
--     アクセスは下記の SECURITY DEFINER 関数経由のみ。
--   ・総当たり対策はコードのエントロピーで担保する
--     （31文字アルファベット×16文字 ≒ 79bit。オンライン総当たりは非現実的）。
--
--   Supabase の SQL Editor で実行してください。
-- ══════════════════════════════════════════════════════════════════

create table if not exists public.recovery_codes (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  code_hash  text not null,
  updated_at timestamptz not null default now()
);

alter table public.recovery_codes enable row level security;
revoke all on table public.recovery_codes from anon, authenticated;

-- ── ログイン中ユーザーがコードを発行済みかどうか ──
create or replace function public.has_recovery_code()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.recovery_codes where user_id = auth.uid());
$$;

-- ── リカバリーコードを発行（再発行時は上書き）し、平文コードを一度だけ返す ──
-- 返り値の形式: XXXX-XXXX-XXXX-XXXX（紛らわしい 0/O/1/I/L を除いた31文字）
create or replace function public.generate_recovery_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_bytes bytea;
  v_raw   text := '';
  i       int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  v_bytes := extensions.gen_random_bytes(16);
  for i in 0..15 loop
    v_raw := v_raw || substr(v_alphabet, (get_byte(v_bytes, i) % 31) + 1, 1);
  end loop;
  -- ハッシュは区切りなしの生コードに対して作る（照合時も区切りを除去して比較）
  insert into public.recovery_codes (user_id, code_hash, updated_at)
  values (auth.uid(), extensions.crypt(v_raw, extensions.gen_salt('bf')), now())
  on conflict (user_id)
  do update set code_hash = excluded.code_hash, updated_at = now();

  return substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4) || '-' ||
         substr(v_raw, 9, 4) || '-' || substr(v_raw, 13, 4);
end;
$$;

-- ── ユーザー名＋リカバリーコードでパスワードを再設定する（未ログインで呼べる）──
-- ユーザー不存在とコード不一致は同じエラーにして、ID の存在を漏らさない。
create or replace function public.reset_password_with_recovery(
  p_username     text,
  p_code         text,
  p_new_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_hash    text;
  v_norm    text;
begin
  -- Supabase Auth の既定（6文字以上）に合わせる。直接 auth.users を更新するため
  -- GoTrue の API バリデーションを通らず、ここで自前検査する必要がある。
  if length(coalesce(p_new_password, '')) < 6 then
    raise exception 'password too short';
  end if;

  -- 入力コードの正規化（区切り・空白を除去して大文字化）
  v_norm := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));

  select p.id into v_user_id
  from public.profiles p
  where p.username = trim(p_username);

  if v_user_id is not null then
    select rc.code_hash into v_hash
    from public.recovery_codes rc
    where rc.user_id = v_user_id;
  end if;

  if v_hash is null or v_hash <> extensions.crypt(v_norm, v_hash) then
    raise exception 'invalid recovery code';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_user_id;
end;
$$;

-- ── 実行権限 ──
revoke all on function public.has_recovery_code() from public;
grant execute on function public.has_recovery_code() to authenticated;

revoke all on function public.generate_recovery_code() from public;
grant execute on function public.generate_recovery_code() to authenticated;

-- 再設定は未ログイン（anon）から呼べる必要がある
revoke all on function public.reset_password_with_recovery(text, text, text) from public;
grant execute on function public.reset_password_with_recovery(text, text, text) to anon, authenticated;
