-- Batteria del partner (founder, grill del 31/10/2026).
--
-- Each phone reports its own battery level (percentage, charging) only while
-- US is in use: at launch and on return to the foreground, at most every 15
-- minutes (client side). No background work, no push. The partner sees it in
-- Noi and in the Android widget "Noi" with how long ago it was read.
--
-- * One row per person, personal data: user_id cascades from profiles, so
--   leaving the couple or deleting the account removes it.
-- * Readable only by the couple, and only while the owner still belongs to
--   that couple; writable only by the owner through report_battery().
-- * The time is the server's (a phone cannot date a reading in the future);
--   a retry within a minute with the same values writes nothing, so it sends
--   no Realtime event.
-- * Realtime: in the supabase_realtime publication, filtered by couple_id;
--   postgres_changes respects the SELECT policy below.
-- Re-applying this migration changes nothing.

create table if not exists public.couple_batteries (
  user_id uuid not null,
  couple_id uuid not null,
  level smallint not null,
  charging boolean not null default false,
  updated_at timestamp with time zone not null default now(),
  constraint couple_batteries_pkey primary key (user_id),
  constraint couple_batteries_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint couple_batteries_couple_id_fkey foreign key (couple_id) references public.couples(id) on delete cascade,
  constraint couple_batteries_level_check check (level between 0 and 100)
);
comment on table public.couple_batteries is 'Batteria del partner (31/10/2026): last battery level each member reported while US was open. Personal data, seen by the couple only.';
create index if not exists couple_batteries_couple_id_idx on public.couple_batteries (couple_id);

alter table public.couple_batteries enable row level security;

revoke all on table public.couple_batteries from public, anon, authenticated;
grant select, insert, update, delete on table public.couple_batteries to authenticated;
grant all on table public.couple_batteries to service_role;

-- Your own row always (to report and delete it); the partner's while both are
-- in the same couple.
drop policy if exists couple_batteries_select_same_couple on public.couple_batteries;
create policy couple_batteries_select_same_couple on public.couple_batteries as permissive for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      couple_id = private.current_couple_id()
      and exists (select 1 from public.profiles p where p.id = couple_batteries.user_id and p.couple_id = couple_batteries.couple_id)
    )
  );
drop policy if exists couple_batteries_insert_self on public.couple_batteries;
create policy couple_batteries_insert_self on public.couple_batteries as permissive for insert to authenticated
  with check (user_id = (select auth.uid()) and couple_id = private.current_couple_id());
drop policy if exists couple_batteries_update_self on public.couple_batteries;
create policy couple_batteries_update_self on public.couple_batteries as permissive for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and couple_id = private.current_couple_id());
drop policy if exists couple_batteries_delete_self on public.couple_batteries;
create policy couple_batteries_delete_self on public.couple_batteries as permissive for delete to authenticated
  using (user_id = (select auth.uid()));

-- Never a time in the future.
create or replace function private.couple_batteries_clamp_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := least(coalesce(new.updated_at, pg_catalog.now()), pg_catalog.now());
  return new;
end;
$$;
revoke all on function private.couple_batteries_clamp_time() from public, anon, authenticated;

drop trigger if exists couple_batteries_clamp_time on public.couple_batteries;
create trigger couple_batteries_clamp_time
  before insert or update on public.couple_batteries
  for each row execute function private.couple_batteries_clamp_time();

-- The only write the app makes. Returns the stored reading.
create or replace function public.report_battery(p_level integer, p_charging boolean)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cid uuid := private.current_couple_id();
  saved record;
begin
  if uid is null or cid is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_level is null or p_level < 0 or p_level > 100 then
    raise exception using errcode = '22023', message = 'battery level invalid';
  end if;

  insert into public.couple_batteries as b (user_id, couple_id, level, charging, updated_at)
  values (uid, cid, p_level, coalesce(p_charging, false), pg_catalog.now())
  on conflict (user_id) do update
    set couple_id = excluded.couple_id, level = excluded.level, charging = excluded.charging, updated_at = excluded.updated_at
    where b.couple_id is distinct from excluded.couple_id
      or b.level is distinct from excluded.level
      or b.charging is distinct from excluded.charging
      or b.updated_at < pg_catalog.now() - interval '1 minute';

  select b.level, b.charging, b.updated_at into saved
  from public.couple_batteries b
  where b.user_id = uid;

  return pg_catalog.jsonb_build_object('level', saved.level, 'charging', saved.charging, 'updated_at', saved.updated_at);
end;
$$;
revoke all on function public.report_battery(integer, boolean) from public, anon;
grant execute on function public.report_battery(integer, boolean) to authenticated;

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'couple_batteries'
     ) then
    alter publication supabase_realtime add table public.couple_batteries;
  end if;
end;
$$;
