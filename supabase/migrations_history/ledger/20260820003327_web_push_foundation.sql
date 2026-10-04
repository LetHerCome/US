-- Production ledger 20260820003327 web_push_foundation: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 f0075d26167a7337a088944ff1b1c37c; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  expiration_time bigint,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
create index if not exists push_subscriptions_couple_idx on public.push_subscriptions(couple_id);

alter table public.push_subscriptions enable row level security;

create table if not exists public.push_event_log (
  dedupe_key text primary key,
  couple_id uuid not null references public.couples(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_event_log_created_idx on public.push_event_log(created_at desc);
alter table public.push_event_log enable row level security;

create or replace function public.register_web_push_subscription(
  target_endpoint text,
  target_p256dh text,
  target_auth text,
  target_expiration_time bigint default null,
  target_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if coalesce(length(trim(target_endpoint)),0) < 20 then raise exception 'Invalid push endpoint'; end if;
  if coalesce(length(trim(target_p256dh)),0) < 20 then raise exception 'Invalid p256dh key'; end if;
  if coalesce(length(trim(target_auth)),0) < 8 then raise exception 'Invalid auth key'; end if;

  select couple_id into cid from public.profiles where id = uid;
  if cid is null then raise exception 'Profile not linked'; end if;

  insert into public.push_subscriptions(user_id,couple_id,endpoint,p256dh,auth_key,expiration_time,user_agent,updated_at)
  values(uid,cid,target_endpoint,target_p256dh,target_auth,target_expiration_time,left(target_user_agent,500),now())
  on conflict(endpoint) do update set
    user_id = excluded.user_id,
    couple_id = excluded.couple_id,
    p256dh = excluded.p256dh,
    auth_key = excluded.auth_key,
    expiration_time = excluded.expiration_time,
    user_agent = excluded.user_agent,
    updated_at = now();

  return jsonb_build_object('active',true);
end;
$$;

create or replace function public.remove_web_push_subscription(target_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  removed_count integer := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  delete from public.push_subscriptions where user_id = uid and endpoint = target_endpoint;
  get diagnostics removed_count = row_count;
  return jsonb_build_object('removed',removed_count > 0);
end;
$$;

create or replace function public.get_web_push_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  subscription_count integer := 0;
begin
  if uid is null then return jsonb_build_object('active',false,'count',0); end if;
  select count(*) into subscription_count from public.push_subscriptions where user_id = uid;
  return jsonb_build_object('active',subscription_count > 0,'count',subscription_count);
end;
$$;

revoke all on function public.register_web_push_subscription(text,text,text,bigint,text) from public;
revoke all on function public.remove_web_push_subscription(text) from public;
revoke all on function public.get_web_push_status() from public;
grant execute on function public.register_web_push_subscription(text,text,text,bigint,text) to authenticated;
grant execute on function public.remove_web_push_subscription(text) to authenticated;
grant execute on function public.get_web_push_status() to authenticated;;
