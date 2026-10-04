-- Production ledger 20260930233506 m12b_3_event_completion_history: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 12f977ded90a6046e7db8e192bc5a7b0; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

-- M12B.3 — Completed Events as read-only relationship history.
--
-- An Event lived without a photo is still real relationship history; it is
-- not a Moment and never becomes one by itself. This view reads the existing
-- authority (public.shared_event_completions, one row per lived occurrence)
-- and adds nothing to it: no completion copy, no second completion table, no
-- automatic Moment, no media, no invented text.
--
-- One row per completion of the caller's couple:
--   source_kind / source_ref / source_key  'shared_event_completion', the
--                                          completion id, and the canonical
--                                          provenance key (M12B.3)
--   event_id, occurrence_date, completed_at, completed_by
--                                          straight from the completion
--   title                                  the title when it was completed
--                                          (event_title_snapshot), else the
--                                          live event title for completions
--                                          older than M12B.3
--   title_source                           'snapshot' | 'live' | 'missing':
--                                          the reader knows which one it got
--   current_title                          the event's title today (NULL if
--                                          the event no longer exists)
--   moment_id                              the Moment explicitly kept from
--                                          this completion, if any (NULL is
--                                          the normal case: "Evento vissuto")
--
-- Security: security_invoker, so the caller's own RLS on
-- shared_event_completions, shared_events and living_provenance applies, and
-- an explicit same-couple filter on top (the view can never widen access).
-- SELECT for authenticated only. It is a join, so it is not updatable.
--
-- Existing completions are valid history immediately (no backfill, no
-- provenance row fabricated for them).
--
-- NOT applied in production by this milestone. Apply after
-- 20260930233000_m12b_3_living_provenance.sql.

create view public.relationship_event_history
with (security_invoker = true)
as
select
  'shared_event_completion'::text as source_kind,
  c.id as source_ref,
  'shared_event_completion:' || c.id::text as source_key,
  c.couple_id,
  c.event_id,
  c.occurrence_date,
  c.completed_at,
  c.completed_by,
  coalesce(c.event_title_snapshot, e.title) as title,
  case
    when c.event_title_snapshot is not null then 'snapshot'
    when e.id is not null then 'live'
    else 'missing'
  end as title_source,
  e.title as current_title,
  p.target_ref as moment_id
from public.shared_event_completions c
left join public.shared_events e
  on e.id = c.event_id and e.couple_id = c.couple_id
left join public.living_provenance p
  on p.source_kind = 'shared_event_completion' and p.source_ref = c.id
  and p.target_kind = 'moment' and p.couple_id = c.couple_id
where c.couple_id = private.current_couple_id();

comment on view public.relationship_event_history is
  'M12B.3: read-only history of lived Event occurrences (shared_event_completions stays the authority), with the historical title and the optional kept Moment.';

revoke all on public.relationship_event_history from public, anon, authenticated;
grant select on public.relationship_event_history to authenticated;;
