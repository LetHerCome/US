-- Come stai (founder, 02/11/2026; docs/missions/widget-come-stai-v1.md).
--
-- Each member picks how they are from a fixed list of twelve (no free text),
-- in Oggi; the partner sees it in the app and in the Android widget "Come
-- stai". It lasts twelve hours, then it is gone. No history, no push.
--
-- * One row per person, personal data: user_id cascades from profiles, so
--   leaving the couple or deleting the account removes it.
-- * form: how the words are said for this person ('m' innamorato, 'f'
--   innamorata, null the undeclined word). Chosen once in Settings.
-- * set_at and expires_at are the server's: a phone cannot date a state, nor
--   make it last longer than twelve hours.
-- * Readable only by the couple, and only while the owner still belongs to
--   that couple; writable only by the owner (set_member_status, set_member_form).
-- * Realtime: in the supabase_realtime publication, filtered by couple_id;
--   postgres_changes respects the SELECT policy below.
-- Re-applying this migration changes nothing.

create table if not exists public.member_status (
  user_id uuid not null,
  couple_id uuid not null,
  status text,
  form text,
  set_at timestamp with time zone,
  expires_at timestamp with time zone,
  updated_at timestamp with time zone not null default now(),
  constraint member_status_pkey primary key (user_id),
  constraint member_status_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint member_status_couple_id_fkey foreign key (couple_id) references public.couples(id) on delete cascade,
  constraint member_status_status_check check (status is null or status in (
    'innamorato', 'felice', 'stanco', 'giu', 'nervoso', 'malato',
    'festa', 'lavoro', 'studio', 'palestra', 'viaggio', 'tavola')),
  constraint member_status_form_check check (form is null or form in ('m', 'f')),
  constraint member_status_times_check check ((status is null) = (set_at is null) and (set_at is null) = (expires_at is null))
);
comment on table public.member_status is 'Come stai (02/11/2026): the state each member chose (one of twelve), for twelve hours, and how its words are said. Personal data, seen by the couple only; no history.';
create index if not exists member_status_couple_id_idx on public.member_status (couple_id);

alter table public.member_status enable row level security;

revoke all on table public.member_status from public, anon, authenticated;
grant select, insert, update, delete on table public.member_status to authenticated;
grant all on table public.member_status to service_role;

-- Your own row always; the partner's while both are in the same couple.
drop policy if exists member_status_select_same_couple on public.member_status;
create policy member_status_select_same_couple on public.member_status as permissive for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      couple_id = private.current_couple_id()
      and exists (select 1 from public.profiles p where p.id = member_status.user_id and p.couple_id = member_status.couple_id)
    )
  );
drop policy if exists member_status_insert_self on public.member_status;
create policy member_status_insert_self on public.member_status as permissive for insert to authenticated
  with check (user_id = (select auth.uid()) and couple_id = private.current_couple_id());
drop policy if exists member_status_update_self on public.member_status;
create policy member_status_update_self on public.member_status as permissive for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and couple_id = private.current_couple_id());
drop policy if exists member_status_delete_self on public.member_status;
create policy member_status_delete_self on public.member_status as permissive for delete to authenticated
  using (user_id = (select auth.uid()));

-- The times are the server's: a new state, or one chosen again after it
-- expired, starts now and lasts twelve hours; the same state still showing
-- keeps its time; no state, no time.
create or replace function private.member_status_server_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is null then
    new.set_at := null;
    new.expires_at := null;
  elsif tg_op = 'INSERT' or new.status is distinct from old.status
        or old.expires_at is null or old.expires_at <= pg_catalog.now() then
    new.set_at := pg_catalog.now();
    new.expires_at := pg_catalog.now() + interval '12 hours';
  else
    new.set_at := old.set_at;
    new.expires_at := old.expires_at;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
revoke all on function private.member_status_server_time() from public, anon, authenticated;

drop trigger if exists member_status_server_time on public.member_status;
create trigger member_status_server_time
  before insert or update on public.member_status
  for each row execute function private.member_status_server_time();

-- How I am now (one of the twelve), or null to take it away.
create or replace function public.set_member_status(p_status text)
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
  if p_status is not null and p_status not in (
    'innamorato', 'felice', 'stanco', 'giu', 'nervoso', 'malato',
    'festa', 'lavoro', 'studio', 'palestra', 'viaggio', 'tavola') then
    raise exception using errcode = '22023', message = 'status invalid';
  end if;

  insert into public.member_status as s (user_id, couple_id, status)
  values (uid, cid, p_status)
  on conflict (user_id) do update
    set couple_id = excluded.couple_id, status = excluded.status;

  select s.status, s.form, s.set_at, s.expires_at into saved
  from public.member_status s
  where s.user_id = uid;

  return pg_catalog.jsonb_build_object('status', saved.status, 'form', saved.form, 'set_at', saved.set_at, 'expires_at', saved.expires_at);
end;
$$;
revoke all on function public.set_member_status(text) from public, anon;
grant execute on function public.set_member_status(text) to authenticated;

-- How my words are said: 'm', 'f' or null (the undeclined word).
create or replace function public.set_member_form(p_form text)
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
  if p_form is not null and p_form not in ('m', 'f') then
    raise exception using errcode = '22023', message = 'form invalid';
  end if;

  insert into public.member_status as s (user_id, couple_id, form)
  values (uid, cid, p_form)
  on conflict (user_id) do update
    set couple_id = excluded.couple_id, form = excluded.form;

  select s.status, s.form, s.set_at, s.expires_at into saved
  from public.member_status s
  where s.user_id = uid;

  return pg_catalog.jsonb_build_object('status', saved.status, 'form', saved.form, 'set_at', saved.set_at, 'expires_at', saved.expires_at);
end;
$$;
revoke all on function public.set_member_form(text) from public, anon;
grant execute on function public.set_member_form(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'member_status'
     ) then
    alter publication supabase_realtime add table public.member_status;
  end if;
end;
$$;
