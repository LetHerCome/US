-- M12B.2 — Da vivere: an idea archived without ever being lived releases its
-- Calendario event.
--
-- Bug (live since M7C): archiving a scheduled idea kept bucket_items.
-- calendar_entry_id. The M7C BEFORE DELETE trigger on calendar_entries only
-- un-schedules rows still 'scheduled', the FK is ON DELETE RESTRICT and the
-- M7A delete guard refuses a linked row. So the shared event of an idea that
-- was abandoned before it happened could no longer be deleted by anyone,
-- while the idea itself was hidden in the archive.
--
-- Invariant after this migration (enforced by a CHECK, kept by a trigger):
--   status = 'archived' AND completed_at IS NULL  =>  calendar_entry_id IS NULL
-- i.e. a Calendario event is pinned only by an idea that was really lived
-- (completed_at is set once, by the reciprocal confirm_bucket_item_lived, and
-- is never cleared: lived -> archived keeps it). Everything else is unchanged:
--   scheduled                      link kept; deleting the event -> back to idea (M7C)
--   lived                          link kept; deleting the event is refused (M7A)
--   lived -> archived              link kept; deleting the event is refused (history)
--   archived, never lived          no link; the event is an ordinary shared event,
--                                  deletable by its creator under the M6A RLS
--
-- Changes, additive and forward-only:
-- 1. a BEFORE UPDATE trigger that clears the link when the row is (or stays)
--    archived and was never lived. Postgres fires same-event triggers in name
--    order, so it runs AFTER bucket_items_guard_update ('g' < 'r'): by then the
--    guard has already validated the transition and reset completed_at to the
--    server value, so a client cannot keep the link by sending completed_at.
--    The M7A/M7C/M7D guard, the RPC and every policy are untouched.
-- 2. a one-time backfill of rows already in the broken state (only
--    calendar_entry_id is cleared; no row is deleted, no calendar event is
--    deleted, status/completed/completed_at/lived_proposed_* are untouched).
-- 3. the CHECK above, so the invariant cannot silently regress.
--
-- Concurrency: the link is cleared inside the same row update, under the row
-- lock the archive already takes, so an archive and a Calendario delete
-- serialize on the bucket_items row (either order ends with the event
-- deletable, see tests/m12b-da-vivere-archived-link-race.test.js).
-- Idempotent: re-archiving, or re-running the backfill, changes nothing.
--
-- Not touched: calendar_entries rows and policies, shared_events,
-- shared_event_completions, relationship_milestones, moments, claim_us_role.
--
-- Applied to production as ledger migration 20260930225935.

create or replace function private.bucket_items_release_archived_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'archived' and new.completed_at is null and new.calendar_entry_id is not null then
    new.calendar_entry_id := null;
  end if;
  return new;
end;
$$;

revoke all on function private.bucket_items_release_archived_link() from public, anon, authenticated;

create trigger bucket_items_release_archived_link
before update on public.bucket_items
for each row execute function private.bucket_items_release_archived_link();

do $$
declare
  released integer;
begin
  update public.bucket_items
    set calendar_entry_id = null
    where status = 'archived'
      and completed_at is null
      and calendar_entry_id is not null;
  get diagnostics released = row_count;
  raise notice 'm12b_2: released % archived never-lived Da vivere link(s)', released;
end;
$$;

alter table public.bucket_items
  add constraint bucket_items_archived_unlived_unlinked_check
    check (status <> 'archived' or completed_at is not null or calendar_entry_id is null);
