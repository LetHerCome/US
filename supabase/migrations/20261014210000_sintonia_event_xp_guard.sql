-- Sintonia — close the events loophole.
--
-- REVIEW CANDIDATE. Prepared in the repository only: it must not be applied
-- to production Supabase without the founder's separate explicit OK, after
-- review and a staging run (audit 2026-10-14, Sintonia problem 5; founder
-- decision 7 of the same day).
--
-- Before: one partner alone could create an event dated today and mark it
-- done at once for +25 XP (+60 when yearly), without limit. For a yearly event
-- every past year's occurrence was accepted (only day and month are checked),
-- so a direct caller could collect 60 XP per past year.
--
-- After:
-- 1. public.complete_shared_event keeps its signature, SECURITY DEFINER,
--    pinned search_path and grants, the same validations and errors, and the
--    same already-completed answer. It still records the completion of any
--    valid occurrence, but awards Sintonia points only when
--      a. the occurrence was planned ahead: occurrence_date strictly after the
--         event's creation date (Europe/Rome). Same day = 0, any occurrence
--         before the creation date = 0 (this covers the yearly backfill);
--      b. no other event completion of the couple earned points this Rome
--         calendar day. Later completions that day get 0.
--    Amounts are unchanged: 60 yearly, 50 with >= 7 days lead, 35 with >= 2,
--    else 25. The answer keeps every key and adds xp_reason: 'planned',
--    'same_day', 'before_creation' or 'daily_limit'. The activity row stays,
--    with the real xp (0 when none).
-- 2. private.progression_event_trigger records in the progression ledger only
--    completions that earned points, like every other source: a completion
--    without points is no progression event (no ledger row, no Ritmo day).
-- 3. shared_events.created_at, which rule (a) relies on, becomes server-owned:
--    clients may INSERT only the content columns the app already sends (the
--    F1C column-grant pattern already used for UPDATE). Before this, a direct
--    API call could backdate created_at and pass the "planned ahead" rule.
--
-- Nothing is deleted or rewritten: existing events, completions, XP, activity
-- and ledger rows are untouched. Forward-only and idempotent.

-- 1. Event completion: points only for planned occurrences, one per day.
create or replace function public.complete_shared_event(target_event_id uuid, target_occurrence_date date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  cid uuid;
  e public.shared_events%rowtype;
  existing public.shared_event_completions%rowtype;
  today_rome date := (current_timestamp at time zone 'Europe/Rome')::date;
  created_rome date;
  lead_days integer;
  awarded integer := 0;
  reason text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select p.couple_id into cid from public.profiles p where p.id = uid;
  if cid is null then raise exception 'Profile not linked'; end if;
  select * into e from public.shared_events se where se.id = target_event_id and se.couple_id = cid for update;
  if not found then raise exception 'Event not found'; end if;
  if target_occurrence_date is null or target_occurrence_date > today_rome then raise exception 'Event cannot be completed yet'; end if;
  if e.recurs_yearly then
    if extract(month from target_occurrence_date) <> extract(month from e.event_date)
       or extract(day from target_occurrence_date) <> extract(day from e.event_date) then
      raise exception 'Invalid recurring occurrence';
    end if;
  elsif target_occurrence_date <> e.event_date then
    raise exception 'Invalid occurrence date';
  end if;

  select * into existing from public.shared_event_completions c
   where c.event_id = e.id and c.occurrence_date = target_occurrence_date;
  if found then
    return jsonb_build_object('completed', true, 'already_completed', true,
      'xp_awarded', existing.xp_awarded, 'completed_at', existing.completed_at);
  end if;

  -- The progression lock of private.progression_award, taken before reading
  -- today's completions: two completions of the same couple at the same time
  -- (two events, both partners) run one after the other, so only one of them
  -- can be the day's completion with points. The lock order is unchanged:
  -- event row, then progression lock, then couples row.
  perform pg_advisory_xact_lock(hashtextextended('us:progression:' || cid::text, 0));

  created_rome := (e.created_at at time zone 'Europe/Rome')::date;
  if target_occurrence_date = created_rome then
    reason := 'same_day';
  elsif target_occurrence_date < created_rome then
    reason := 'before_creation';
  elsif exists (
    select 1 from public.shared_event_completions c
     where c.couple_id = cid and c.xp_awarded > 0
       and (c.completed_at at time zone 'Europe/Rome')::date = today_rome
  ) then
    reason := 'daily_limit';
  else
    reason := 'planned';
    lead_days := target_occurrence_date - created_rome;
    awarded := case when e.recurs_yearly then 60 when lead_days >= 7 then 50 when lead_days >= 2 then 35 else 25 end;
  end if;

  insert into public.shared_event_completions(event_id, couple_id, occurrence_date, completed_by, xp_awarded)
  values (e.id, cid, target_occurrence_date, uid, awarded);
  if awarded > 0 then
    update public.couples set bond_xp = coalesce(bond_xp, 0) + awarded where id = cid;
  end if;
  insert into public.activity(couple_id, actor_id, type, payload)
  values (cid, uid, 'shared_event_completed', jsonb_build_object('event_id', e.id, 'title', e.title,
    'occurrence_date', target_occurrence_date, 'xp', awarded));
  return jsonb_build_object('completed', true, 'already_completed', false, 'xp_awarded', awarded,
    'occurrence_date', target_occurrence_date, 'xp_reason', reason);
end;
$function$;

-- Same grants as supabase/baseline/70_grants.sql (restated, unchanged).
revoke all on function public.complete_shared_event(target_event_id uuid, target_occurrence_date date) from public, anon, authenticated, service_role;
grant all on function public.complete_shared_event(target_event_id uuid, target_occurrence_date date) to authenticated;
grant all on function public.complete_shared_event(target_event_id uuid, target_occurrence_date date) to service_role;

-- 2. Progression ledger: an event completion is a progression event only when
--    it earned points (bond_xp itself is added by complete_shared_event).
create or replace function private.progression_event_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if coalesce(new.xp_awarded, 0) > 0 then
    perform private.progression_award(new.couple_id, new.completed_by, 'event', new.id::text, new.xp_awarded, new.completed_at, true, false);
  end if;
  return new;
end;
$function$;

-- Same grants as supabase/baseline/70_grants.sql (restated, unchanged).
revoke all on function private.progression_event_trigger() from public, anon, authenticated, service_role;

-- 3. Events: the creation date is the server's. The app inserts exactly these
--    columns (events.js saveEvent); id, created_at and updated_at take their
--    defaults. RLS (shared_events_insert_same_couple) is unchanged; anon never
--    had an insert policy. service_role keeps its full grant.
revoke insert on table public.shared_events from authenticated, anon;
grant insert (couple_id, created_by, title, event_date, event_time, location, note, recurs_yearly)
  on table public.shared_events to authenticated;
