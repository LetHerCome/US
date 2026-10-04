-- Production ledger 20260930233501 m12b_3_living_provenance: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 9b35bb503164f7a18812db5ec52e2d74; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

-- M12B.3 — Living Loop provenance foundation.
--
-- US must be able to say, durably and explicitly, "this artifact came from
-- this source" without turning a lived fact into a fake Moment and without
-- copying any domain authority. Two things are added:
--
-- 1. shared_event_completions.event_title_snapshot: the event title as it was
--    when the occurrence was completed. Written only by a BEFORE INSERT
--    trigger from the couple's own shared_events row (client values are
--    ignored) and frozen on every later UPDATE. The completion row stays the
--    one authority of "this occurrence was lived" (event_id, occurrence_date,
--    completed_by, completed_at, xp_awarded are untouched); only the name of
--    what was lived is kept, so renaming an event later cannot rewrite its
--    history. Existing completions keep NULL: we do not know what the title
--    was when they were completed, so nothing is invented (readers fall back
--    to the live title and say so, see the M12B.3 history view).
--
-- 2. public.living_provenance: one row = one explicit derivation
--      source (source_kind, source_ref)  ->  target (target_kind, target_ref)
--    Targeted, not generic: every supported kind has its own typed foreign
--    key, and the CHECKs only accept the kinds this batch needs:
--      source_kind 'shared_event_completion'  public.shared_event_completions
--      source_kind 'da_vivere'                public.bucket_items, lived only
--      target_kind 'moment'                   public.moments (photo-backed)
--    source_kind || ':' || source_ref is the canonical source key (stored,
--    generated). 'da_vivere:<bucket_item id>' is by design the exact Game V2
--    source key of the Da vivere adapter, so a Moment and the lived fact it
--    came from are one real-life source for Rivivete (M12B.3 Game V2 file).
--    The source identity (kind, ref, snapshot title/date) is immutable; the
--    typed FK may only drop to NULL when the source row itself is deleted, and
--    the canonical key keeps the Moment explainable after that.
--
--    Cardinality: a source produces at most ONE Moment (more photos go into
--    that Moment's album, moment_photos), and a Moment has at most one
--    source. A second link request for the same pair is a no-op ('existing');
--    a different Moment for a source already kept, or a different source for
--    a Moment already linked, is refused with 23505.
--
--    Deletion: deleting the Moment deletes only its provenance row (FK
--    CASCADE); the completion, the event and the Da vivere item are never
--    touched, and the source can be kept again. Deleting a source (not a
--    client path today) sets the typed FK to NULL and keeps the row.
--
--    Writes: only public.link_moment_to_source (SECURITY DEFINER). No client
--    INSERT/UPDATE/DELETE grant, RLS enabled and forced, one SELECT policy for
--    the caller's own couple. The RPC checks auth, couple membership (M11A.1
--    locked actor, re-pair safe), that the Moment is the caller's own and in
--    the couple, that the source is in the same couple and really lived, and
--    writes the snapshot itself from the source (never from the client).
--    Ownership is couple + role (linked_by_role), never a profile UID, so
--    claim_us_role needs no change.
--
-- Not implemented here (designed for, not accepted by the CHECKs): a
-- 'daily_question_reveal' source and a Daily Question keepsake target. They
-- will be added by the Conserva batch together with its reveal-gated RPC.
--
-- Additive and forward-only. No row is updated or deleted, nothing is
-- backfilled, no provenance row is fabricated for historical completions.
-- Not touched: moments (columns, policies, storage_path NOT NULL),
-- moment_photos, bucket_items, calendar_entries, shared_events rows,
-- complete_shared_event, daily_*, left_for_you, claim_us_role, Edge Functions.
--
-- NOT applied in production by this milestone.

-- 0. Preconditions: the production shape this file relies on. Fails before any
--    change if production differs from what was verified.
do $$
declare
  expected record;
  missing text[] := '{}';
begin
  for expected in
    select * from (values
      ('shared_event_completions', 'id', 'uuid'),
      ('shared_event_completions', 'couple_id', 'uuid'),
      ('shared_event_completions', 'event_id', 'uuid'),
      ('shared_event_completions', 'occurrence_date', 'date'),
      ('shared_event_completions', 'completed_at', 'timestamp with time zone'),
      ('shared_events', 'id', 'uuid'),
      ('shared_events', 'couple_id', 'uuid'),
      ('shared_events', 'title', 'text'),
      ('moments', 'id', 'uuid'),
      ('moments', 'couple_id', 'uuid'),
      ('moments', 'created_by', 'uuid'),
      ('bucket_items', 'id', 'uuid'),
      ('bucket_items', 'couple_id', 'uuid'),
      ('bucket_items', 'completed_at', 'timestamp with time zone'),
      ('bucket_items', 'calendar_entry_id', 'uuid')
    ) as t(table_name, column_name, data_type)
  loop
    if not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = expected.table_name
        and c.column_name = expected.column_name and c.data_type = expected.data_type
    ) then
      missing := missing || format('%s.%s %s', expected.table_name, expected.column_name, expected.data_type);
    end if;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_constraint k
    join pg_catalog.pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    where k.conrelid = to_regclass('public.shared_event_completions')
      and k.contype in ('p', 'u') and cardinality(k.conkey) = 1 and a.attname = 'id'
  ) then
    missing := missing || 'unique shared_event_completions(id)'::text;
  end if;

  if to_regprocedure('private.current_couple_id()') is null then
    missing := missing || 'private.current_couple_id()'::text;
  end if;
  if to_regprocedure('private.m11a_actor_locked()') is null then
    missing := missing || 'private.m11a_actor_locked()'::text;
  end if;

  if cardinality(missing) > 0 then
    raise exception 'm12b_3 precondition failed, nothing changed: %', array_to_string(missing, ', ');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Historical event title on the completion authority.
-- ---------------------------------------------------------------------------

alter table public.shared_event_completions add column if not exists event_title_snapshot text;

comment on column public.shared_event_completions.event_title_snapshot is
  'M12B.3: shared_events.title when this occurrence was completed. Server-written on insert, immutable. NULL for completions older than M12B.3 (unknown, never guessed).';

create or replace function private.shared_event_completions_title_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Same couple only: a completion can never carry another couple's title.
    -- No match leaves NULL (SELECT INTO assigns NULL when no row is found).
    select e.title into new.event_title_snapshot
      from public.shared_events e
      where e.id = new.event_id and e.couple_id = new.couple_id;
  else
    new.event_title_snapshot := old.event_title_snapshot;
  end if;
  return new;
end;
$$;

revoke all on function private.shared_event_completions_title_snapshot() from public, anon, authenticated;

drop trigger if exists shared_event_completions_title_snapshot on public.shared_event_completions;
create trigger shared_event_completions_title_snapshot
before insert or update on public.shared_event_completions
for each row execute function private.shared_event_completions_title_snapshot();

-- ---------------------------------------------------------------------------
-- 2. Provenance: explicit source -> target derivations.
-- ---------------------------------------------------------------------------

create table public.living_provenance (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  source_kind text not null,
  source_ref uuid not null,
  source_key text generated always as (source_kind || ':' || source_ref::text) stored,
  source_event_completion_id uuid references public.shared_event_completions(id) on delete set null,
  source_bucket_item_id uuid references public.bucket_items(id) on delete set null,
  source_title text,
  source_date date,
  target_kind text not null,
  target_ref uuid not null,
  target_moment_id uuid references public.moments(id) on delete cascade,
  linked_by_role text not null,
  created_at timestamptz not null default now(),

  constraint living_provenance_source_kind_check
    check (source_kind in ('shared_event_completion', 'da_vivere')),
  constraint living_provenance_target_kind_check
    check (target_kind in ('moment')),
  -- Exactly the typed FK of the kind, equal to source_ref while the source
  -- exists (NULL only after the source row was deleted).
  constraint living_provenance_source_fk_check check (
    (source_kind = 'shared_event_completion' and source_bucket_item_id is null
      and (source_event_completion_id is null or source_event_completion_id = source_ref))
    or (source_kind = 'da_vivere' and source_event_completion_id is null
      and (source_bucket_item_id is null or source_bucket_item_id = source_ref))
  ),
  constraint living_provenance_target_fk_check
    check (target_kind = 'moment' and target_moment_id = target_ref),
  constraint living_provenance_linked_by_role_check
    check (linked_by_role in ('francesco', 'beatrice')),
  constraint living_provenance_source_title_check
    check (source_title is null or char_length(source_title) <= 200),
  -- One Moment per lived source, one source per Moment.
  constraint living_provenance_one_target_per_source unique (source_kind, source_ref, target_kind),
  constraint living_provenance_one_source_per_target unique (target_kind, target_ref)
);

create index living_provenance_couple_idx on public.living_provenance (couple_id);
create index living_provenance_completion_idx on public.living_provenance (source_event_completion_id)
  where source_event_completion_id is not null;
create index living_provenance_bucket_item_idx on public.living_provenance (source_bucket_item_id)
  where source_bucket_item_id is not null;

comment on table public.living_provenance is
  'M12B.3: explicit Living Loop derivations (lived source -> Moment). Written only by link_moment_to_source; readable by the same couple; immutable.';

alter table public.living_provenance enable row level security;
alter table public.living_provenance force row level security;
revoke all on public.living_provenance from public, anon, authenticated;
grant select on public.living_provenance to authenticated;

create policy living_provenance_select_same_couple on public.living_provenance
  for select to authenticated
  using (couple_id = private.current_couple_id());

-- Immutable after insert. The only accepted change is the FK action ON DELETE
-- SET NULL of a deleted source (typed FK -> NULL, everything else equal).
create or replace function private.living_provenance_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id <> old.id or new.couple_id <> old.couple_id
     or new.source_kind <> old.source_kind or new.source_ref <> old.source_ref
     or new.source_title is distinct from old.source_title or new.source_date is distinct from old.source_date
     or new.target_kind <> old.target_kind or new.target_ref <> old.target_ref
     or new.target_moment_id is distinct from old.target_moment_id
     or new.linked_by_role <> old.linked_by_role or new.created_at <> old.created_at
     or (new.source_event_completion_id is distinct from old.source_event_completion_id and new.source_event_completion_id is not null)
     or (new.source_bucket_item_id is distinct from old.source_bucket_item_id and new.source_bucket_item_id is not null)
  then
    raise exception using errcode = '42501', message = 'living_provenance_immutable';
  end if;
  return new;
end;
$$;

revoke all on function private.living_provenance_guard_update() from public, anon, authenticated;

create trigger living_provenance_guard_update
before update on public.living_provenance
for each row execute function private.living_provenance_guard_update();

-- ---------------------------------------------------------------------------
-- 3. The only writer: an explicit "this Moment came from this lived fact".
--    Called after the Moment itself was created by the existing photo flow.
-- ---------------------------------------------------------------------------

create or replace function public.link_moment_to_source(target_moment_id uuid, source_kind text, source_ref uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  target public.moments%rowtype;
  completion record;
  item record;
  snap_title text;
  snap_date date;
  link_row public.living_provenance%rowtype;
begin
  select * into actor from private.m11a_actor_locked();
  if target_moment_id is null or source_ref is null or source_kind is null then
    raise exception using errcode = '22004', message = 'living_provenance_arguments_required';
  end if;
  if source_kind not in ('shared_event_completion', 'da_vivere') then
    raise exception using errcode = '22023', message = 'living_provenance_unsupported_source_kind';
  end if;

  -- Same error for "does not exist" and "belongs to another couple".
  select m.* into target from public.moments m
    where m.id = link_moment_to_source.target_moment_id and m.couple_id = actor.caller_couple;
  if not found then
    raise exception using errcode = 'P0002', message = 'living_provenance_moment_not_found';
  end if;
  if target.created_by is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'living_provenance_moment_not_own';
  end if;

  if source_kind = 'shared_event_completion' then
    select c.id, c.occurrence_date, coalesce(c.event_title_snapshot, e.title) as title into completion
      from public.shared_event_completions c
      left join public.shared_events e on e.id = c.event_id and e.couple_id = c.couple_id
      where c.id = link_moment_to_source.source_ref and c.couple_id = actor.caller_couple;
    if not found then
      raise exception using errcode = 'P0002', message = 'living_provenance_source_not_found';
    end if;
    snap_title := completion.title;
    snap_date := completion.occurrence_date;
  else
    select b.id, b.title, b.completed_at,
        coalesce((ce.starts_at at time zone 'Europe/Rome')::date, ce.start_date,
          (b.completed_at at time zone 'Europe/Rome')::date) as lived_on
      into item
      from public.bucket_items b
      left join public.calendar_entries ce on ce.id = b.calendar_entry_id and ce.couple_id = b.couple_id
      where b.id = link_moment_to_source.source_ref and b.couple_id = actor.caller_couple;
    if not found then
      raise exception using errcode = 'P0002', message = 'living_provenance_source_not_found';
    end if;
    -- Lived means confirmed by both (M7D); completed_at is server-owned and
    -- survives lived -> archived. Scheduled or abandoned ideas are refused.
    if item.completed_at is null then
      raise exception using errcode = '22023', message = 'living_provenance_source_not_lived';
    end if;
    snap_title := item.title;
    snap_date := item.lived_on;
  end if;

  insert into public.living_provenance (couple_id, source_kind, source_ref,
    source_event_completion_id, source_bucket_item_id, source_title, source_date,
    target_kind, target_ref, target_moment_id, linked_by_role)
  values (actor.caller_couple, link_moment_to_source.source_kind, link_moment_to_source.source_ref,
    case when link_moment_to_source.source_kind = 'shared_event_completion' then link_moment_to_source.source_ref end,
    case when link_moment_to_source.source_kind = 'da_vivere' then link_moment_to_source.source_ref end,
    left(snap_title, 200), snap_date,
    'moment', link_moment_to_source.target_moment_id, link_moment_to_source.target_moment_id, actor.caller_role)
  on conflict do nothing
  returning * into link_row;

  if link_row.id is null then
    -- A concurrent or earlier link won; it is committed by now.
    select p.* into link_row from public.living_provenance p
      where p.target_kind = 'moment' and p.target_ref = link_moment_to_source.target_moment_id;
    if found then
      if link_row.source_kind = link_moment_to_source.source_kind and link_row.source_ref = link_moment_to_source.source_ref then
        return jsonb_build_object('status', 'existing', 'id', link_row.id, 'source_key', link_row.source_key,
          'moment_id', link_row.target_ref, 'source_title', link_row.source_title, 'source_date', link_row.source_date);
      end if;
      raise exception using errcode = '23505', message = 'living_provenance_moment_already_linked';
    end if;
    raise exception using errcode = '23505', message = 'living_provenance_source_already_kept';
  end if;

  return jsonb_build_object('status', 'linked', 'id', link_row.id, 'source_key', link_row.source_key,
    'moment_id', link_row.target_ref, 'source_title', link_row.source_title, 'source_date', link_row.source_date);
end;
$$;

revoke all on function public.link_moment_to_source(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.link_moment_to_source(uuid, text, uuid) to authenticated;;
