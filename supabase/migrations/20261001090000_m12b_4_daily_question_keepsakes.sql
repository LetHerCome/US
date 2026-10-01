-- M12B.4 — Daily Question → Conserva (Living Archive).
--
-- A Daily Question is a live couple ritual. After both partners answered and
-- the reveal is open, either partner may now explicitly KEEP that exchange
-- (D2 = A). Answering is not keeping: nothing here reacts to daily_answers,
-- no trigger, no cron, no backfill (completed Daily ≠ archived Daily).
--
-- Authorities reused, never duplicated:
--   public.daily_questions          the question instance of a Europe/Rome day (M9E)
--   public.get_daily_state(uuid)    answers + reveal (production authority, unchanged)
--   private.m11a_actor_locked()     auth + couple + role, membership-race safe (M11A.1)
--   private.current_couple_id()     couple boundary of the SELECT policy
--
-- Why a new table and not a living_provenance row (M12B.3):
--   living_provenance records "this photo-backed Moment came from this lived
--   source". A kept Daily is not a Moment (D3 = A: moments.storage_path stays
--   NOT NULL, no fake Moments), so its target_kind 'moment' + typed FK cannot
--   hold it. Its source uniqueness is also global (source_kind, source_ref),
--   which is right for couple-owned sources (completions, Da vivere items) but
--   wrong for daily_questions, which are ONE row per day shared by every couple:
--   a second couple keeping the same day would collide. Loosening that
--   constraint would change an M12B.3 invariant in production. And the kept
--   exchange has content of its own (the revealed answers), which provenance
--   must never carry. So the keepsake row is itself the source record: it
--   follows the M12B.3 provenance contract (source_kind / generated source_key
--   'kind:ref' / snapshot title+date / role ownership / forced RLS, one
--   same-couple SELECT policy / one SECURITY DEFINER writer / immutable) and
--   leaves living_provenance, its CHECKs, its view and Game V2 untouched.
--
-- Identity: the Daily experience is (couple, daily question). Canonical
-- source key 'daily_question:<daily_questions.id>', unique per couple. The
-- question id is the M9E day instance (question_date UNIQUE), never text.
--
-- Snapshot (written by the server, never by the client, frozen forever):
--   question_text / question_date  daily_questions as it was when kept
--   francesco_answer / beatrice_answer
--                                  exactly what get_daily_state revealed to the
--                                  keeper (my_answer + partner_answer), mapped
--                                  to the stable couple roles
--   revealed_at                    when the second answer arrived, i.e. when
--                                  the reveal opened (latest daily_answers
--                                  created_at of the couple for the question;
--                                  read only AFTER the reveal gate, timestamps
--                                  only, never answer text)
--   kept_by_role / kept_at         who kept it and when
-- Not copied: reactions and reveal receipts (M10.2), reflections (M3),
-- template/theme, profile UIDs. Later edits of answers or of the question row
-- never rewrite a keepsake.
--
-- Privacy: the RPC asks get_daily_state and refuses before both_answered, so
-- no answer is ever read earlier than the reveal permits; the browser never
-- reads the partner's daily_answers row. Rows are visible only to the same
-- couple; no client INSERT/UPDATE/DELETE grant.
--
-- Deletion: no removal path in this batch. The question FK is RESTRICT
-- (daily_questions are never deleted, M9E), the couple FK CASCADE.
--
-- Additive and forward-only. Not touched: daily_questions, daily_answers,
-- get_daily_state, daily_question_outcomes, daily_question_reveal_states,
-- living_provenance, relationship_event_history, moments, Game V2,
-- claim_us_role, Edge Functions.
--
-- NOT applied in production. Apply after 20260930233506 (no dependency on the
-- M12B.3 objects; ordering only).

-- 0. Preconditions: the production shape this file relies on. Fails before any
--    change if production differs from what was verified.
do $$
declare
  expected record;
  missing text[] := '{}';
begin
  for expected in
    select * from (values
      ('daily_questions', 'id', 'uuid'),
      ('daily_questions', 'question_date', 'date'),
      ('daily_questions', 'question', 'text'),
      ('daily_answers', 'question_id', 'uuid'),
      ('daily_answers', 'couple_id', 'uuid'),
      ('daily_answers', 'created_at', 'timestamp with time zone'),
      ('profiles', 'couple_id', 'uuid'),
      ('profiles', 'role', 'text')
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

  if to_regprocedure('public.get_daily_state(uuid)') is null then
    missing := missing || 'public.get_daily_state(uuid)'::text;
  end if;
  if to_regprocedure('private.current_couple_id()') is null then
    missing := missing || 'private.current_couple_id()'::text;
  end if;
  if to_regprocedure('private.m11a_actor_locked()') is null then
    missing := missing || 'private.m11a_actor_locked()'::text;
  end if;

  if cardinality(missing) > 0 then
    raise exception 'm12b_4 precondition failed, nothing changed: %', array_to_string(missing, ', ');
  end if;
end;
$$;

-- 1. The kept Daily exchange.
create table public.daily_question_keepsakes (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  source_kind text not null default 'daily_question',
  question_id uuid not null references public.daily_questions(id) on delete restrict,
  source_key text generated always as (source_kind || ':' || question_id::text) stored,
  question_text text not null,
  question_date date not null,
  francesco_answer text not null,
  beatrice_answer text not null,
  revealed_at timestamptz not null,
  kept_by_role text not null,
  kept_at timestamptz not null default now(),

  constraint daily_question_keepsakes_source_kind_check check (source_kind = 'daily_question'),
  constraint daily_question_keepsakes_kept_by_role_check check (kept_by_role in ('francesco', 'beatrice')),
  constraint daily_question_keepsakes_question_text_check check (char_length(btrim(question_text)) between 1 and 500),
  -- One kept exchange per couple and Daily: retries, double taps and both
  -- partners keeping at once all resolve to this row.
  constraint daily_question_keepsakes_one_per_couple_question unique (couple_id, question_id)
);

create index daily_question_keepsakes_couple_date_idx
  on public.daily_question_keepsakes (couple_id, question_date desc);

comment on table public.daily_question_keepsakes is
  'M12B.4: a revealed Daily Question exchange explicitly kept by one partner (Living Archive). Server-written snapshot via keep_daily_question; same-couple read; immutable.';
comment on column public.daily_question_keepsakes.source_key is
  'Canonical source identity daily_question:<daily_questions.id>, unique per couple (M12B.3 kind:ref convention).';
comment on column public.daily_question_keepsakes.revealed_at is
  'When the reveal opened: the latest answer creation time of the couple for this question, read after the reveal gate.';

alter table public.daily_question_keepsakes enable row level security;
alter table public.daily_question_keepsakes force row level security;
revoke all on public.daily_question_keepsakes from public, anon, authenticated;
grant select on public.daily_question_keepsakes to authenticated;

create policy daily_question_keepsakes_select_same_couple on public.daily_question_keepsakes
  for select to authenticated
  using (couple_id = private.current_couple_id());

-- Immutable after insert (defence in depth: no client UPDATE grant exists).
create or replace function private.daily_question_keepsakes_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'daily_question_keepsake_immutable';
end;
$$;

revoke all on function private.daily_question_keepsakes_guard_update() from public, anon, authenticated;

create trigger daily_question_keepsakes_guard_update
before update on public.daily_question_keepsakes
for each row execute function private.daily_question_keepsakes_guard_update();

-- 2. The only writer.
create or replace function private.daily_question_keepsake_json(k public.daily_question_keepsakes, status text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'status', status,
    'id', k.id,
    'source_key', k.source_key,
    'question_id', k.question_id,
    'question_date', k.question_date,
    'question_text', k.question_text,
    'revealed_at', k.revealed_at,
    'kept_by_role', k.kept_by_role,
    'kept_at', k.kept_at
  );
$$;

revoke all on function private.daily_question_keepsake_json(public.daily_question_keepsakes, text) from public, anon, authenticated;

create or replace function public.keep_daily_question(target_question_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor record;
  question public.daily_questions%rowtype;
  kept public.daily_question_keepsakes%rowtype;
  daily_state jsonb;
  mine text;
  theirs text;
  opened_at timestamptz;
begin
  select * into actor from private.m11a_actor_locked();
  if target_question_id is null then
    raise exception using errcode = '22004', message = 'daily_question_id_required';
  end if;

  -- Retry / reconnect / double tap: the kept row answers as it is.
  select k.* into kept from public.daily_question_keepsakes k
    where k.couple_id = actor.caller_couple and k.question_id = target_question_id;
  if found then
    return private.daily_question_keepsake_json(kept, 'existing');
  end if;

  select q.* into question from public.daily_questions q where q.id = target_question_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'daily_question_not_found';
  end if;

  -- The reveal authority decides. Nothing is read before both_answered.
  daily_state := public.get_daily_state(target_question_id);
  if not coalesce((daily_state->>'both_answered')::boolean, false) then
    raise exception using errcode = '42501', message = 'daily_question_reveal_not_ready';
  end if;
  mine := daily_state->>'my_answer';
  theirs := daily_state->>'partner_answer';
  if mine is null or theirs is null then
    raise exception using errcode = '55000', message = 'daily_question_answers_unavailable';
  end if;

  select max(a.created_at) into opened_at from public.daily_answers a
    where a.question_id = target_question_id and a.couple_id = actor.caller_couple;

  -- Both partners may keep at the same moment: serialize per couple + Daily.
  perform pg_advisory_xact_lock(hashtextextended(
    'us:daily_keepsake:' || actor.caller_couple::text || ':' || target_question_id::text, 0));

  insert into public.daily_question_keepsakes (couple_id, question_id, question_text, question_date,
    francesco_answer, beatrice_answer, revealed_at, kept_by_role)
  values (actor.caller_couple, target_question_id, left(question.question, 500), question.question_date,
    case when actor.caller_role = 'francesco' then mine else theirs end,
    case when actor.caller_role = 'beatrice' then mine else theirs end,
    coalesce(opened_at, now()), actor.caller_role)
  on conflict (couple_id, question_id) do nothing
  returning * into kept;

  if kept.id is null then
    -- The other partner (or an earlier tap) won; it is committed by now.
    select k.* into kept from public.daily_question_keepsakes k
      where k.couple_id = actor.caller_couple and k.question_id = target_question_id;
    return private.daily_question_keepsake_json(kept, 'existing');
  end if;

  return private.daily_question_keepsake_json(kept, 'kept');
end;
$$;

revoke all on function public.keep_daily_question(uuid) from public, anon, authenticated;
grant execute on function public.keep_daily_question(uuid) to authenticated;

comment on function public.keep_daily_question(uuid) is
  'M12B.4: keep the revealed Daily exchange of the caller''s couple (Conserva). Refuses before get_daily_state.both_answered; idempotent per couple + question; returns status kept|existing, never answer text.';
