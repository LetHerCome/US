-- Couple sync V1 (audit della produzione, 05/11/2026, punto 2): the other
-- phone learns that something was deleted, and that the calendar changed.
--
-- * Realtime cannot filter DELETE events by couple_id while a table keeps the
--   default replica identity (Supabase docs, Postgres Changes › Delete
--   events): realtime.is_visible_through_filters finds no couple_id in the
--   deleted row (only the id) and drops the event. So the app never saw the
--   partner remove a Ricordo, a photo, a post-it, an event or a story.
-- * The lavagna already solves it with lavagna_boards: an AFTER DELETE
--   trigger updates a row of the couple and the app listens to that UPDATE,
--   which passes RLS. This does the same for the rest of the couple's content.
-- * calendar_entries was not in Realtime at all: every change of the
--   calendar becomes one signal of kind 'calendar'.
-- * public.couple_sync holds no user data: per couple and kind, a revision
--   and when it last moved. The couple reads its own rows (RLS); only the
--   triggers below write (security definer), nobody else.
-- * A couple being erased (cascade) is skipped, as the lavagna does.
-- * REPLICA IDENTITY FULL is not used on purpose: RLS does not apply to
--   DELETE events.

create table public.couple_sync (
  couple_id uuid not null references public.couples(id) on delete cascade,
  kind text not null,
  revision bigint not null default 1,
  changed_at timestamptz not null default now(),
  primary key (couple_id, kind),
  constraint couple_sync_kind check (kind in ('moments', 'notes', 'events', 'stories', 'calendar'))
);

alter table public.couple_sync enable row level security;
create policy couple_sync_read_same_couple on public.couple_sync as permissive for select to authenticated
  using (couple_id = (select private.current_couple_id()));

revoke all on table public.couple_sync from public, anon, authenticated;
grant select on table public.couple_sync to authenticated;
grant all on table public.couple_sync to service_role;

-- One row per couple touched by the statement (the transition table is
-- always called «changed»). TG_ARGV[0] is the kind.
create or replace function private.couple_sync_bump() returns trigger
language plpgsql security definer set search_path = ''
as $fn$
begin
  insert into public.couple_sync as s (couple_id, kind, revision, changed_at)
  select distinct c.couple_id, tg_argv[0], 1, pg_catalog.now()
  from changed c
  where c.couple_id is not null
    and exists (select 1 from public.couples k where k.id = c.couple_id)
  on conflict (couple_id, kind) do update set
    revision = s.revision + 1,
    changed_at = excluded.changed_at;
  return null;
end;
$fn$;
revoke all on function private.couple_sync_bump() from public, anon, authenticated;

create trigger moments_couple_sync after delete on public.moments
  referencing old table as changed for each statement execute function private.couple_sync_bump('moments');
create trigger moment_photos_couple_sync after delete on public.moment_photos
  referencing old table as changed for each statement execute function private.couple_sync_bump('moments');
create trigger couple_notes_couple_sync after delete on public.couple_notes
  referencing old table as changed for each statement execute function private.couple_sync_bump('notes');
create trigger shared_events_couple_sync after delete on public.shared_events
  referencing old table as changed for each statement execute function private.couple_sync_bump('events');
create trigger stories_couple_sync after delete on public.stories
  referencing old table as changed for each statement execute function private.couple_sync_bump('stories');

-- A trigger with a transition table has one event: three for the calendar.
create trigger calendar_entries_couple_sync_insert after insert on public.calendar_entries
  referencing new table as changed for each statement execute function private.couple_sync_bump('calendar');
create trigger calendar_entries_couple_sync_update after update on public.calendar_entries
  referencing new table as changed for each statement execute function private.couple_sync_bump('calendar');
create trigger calendar_entries_couple_sync_delete after delete on public.calendar_entries
  referencing old table as changed for each statement execute function private.couple_sync_bump('calendar');

alter publication supabase_realtime add table only public.couple_sync;
