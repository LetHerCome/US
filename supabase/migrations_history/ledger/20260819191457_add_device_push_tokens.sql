-- Production ledger 20260819191457 add_device_push_tokens: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 477c464fbada062d0478ca9fa82d7857; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('android','ios')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.device_push_tokens enable row level security;

create policy device_push_tokens_select_own
on public.device_push_tokens for select
to authenticated
using (user_id = auth.uid());

create policy device_push_tokens_delete_own
on public.device_push_tokens for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.register_push_token(push_token text, push_platform text default 'android')
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;
  if push_token is null or length(trim(push_token)) < 16 then
    raise exception 'Invalid push token';
  end if;
  if push_platform not in ('android','ios') then
    raise exception 'Invalid push platform';
  end if;

  select couple_id into cid from public.profiles where id = uid;
  if cid is null then
    raise exception 'Profile not paired';
  end if;

  insert into public.device_push_tokens(user_id,couple_id,token,platform,last_seen_at)
  values(uid,cid,trim(push_token),push_platform,now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        couple_id = excluded.couple_id,
        platform = excluded.platform,
        last_seen_at = now();
end;
$$;

revoke all on function public.register_push_token(text,text) from public;
grant execute on function public.register_push_token(text,text) to authenticated;

create index if not exists device_push_tokens_couple_id_idx on public.device_push_tokens(couple_id);
create index if not exists device_push_tokens_user_id_idx on public.device_push_tokens(user_id);;
