-- M11F — Game V2 weekly rhythm: a server-authoritative weekly play allowance.
--
-- Candidate only. NOT applied to production by this mission.
--
-- Contract, per couple and per Game V2 week (Monday 00:00 Europe/Rome, the
-- same private.game_v2_week_start() the weekly question already uses):
--   1 Per voi round + 2 free-choice rounds (any of the six families)
--   = 3 new five-question rounds.
--
-- THE PLAY ALLOWANCE RESETS. THE MEMORY DOES NOT.
--   * Usage is DERIVED from the immutable game_sessions rows: a Game V2
--     round counts for the week of its server-written started_at. There is
--     no counter to drift, repair or reset, and nothing is ever deleted.
--   * History, answers, predictions, receipts, cooldowns, couple questions,
--     context provenance and longitudinal history are untouched.
--   * A round already created never expires: a round started on Sunday stays
--     open and playable after Monday, and resuming it never spends allowance.
--   * The weekly couple question ("Domanda della settimana") is separate and
--     spends nothing.
--
-- No pending pile: resuming the open round of the same mode already comes
-- first (M11B unique open index); a NEW round is refused while the couple
-- already has three open rounds (one full week's worth), so unfinished
-- rounds can never accumulate across weeks.
--
-- Concurrency: every new-round path takes one per-couple budget advisory
-- lock after the existing per-mode lock (always in that order, so no lock
-- cycle); usage is re-read under it, so two partners starting different
-- modes at the same instant cannot exceed the allowance. Request-id replays
-- and same-mode resumes are answered before the budget check, so a retry is
-- idempotent even after the allowance is spent or the week has changed.
--
-- Additive and forward-only: new private helpers, replaced public function
-- bodies with unchanged signatures and grants. No table, column or row
-- change. Applied migrations 20260930153745 / 153749 / 153755 are untouched.

-- ---------------------------------------------------------------------------
-- 1. Weekly usage (derived, read-only).
-- ---------------------------------------------------------------------------

-- Allowance constants in one place.
create function private.game_v2_week_limits()
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('per_voi', 1, 'free', 2, 'total', 3, 'open', 3);
$$;
revoke all on function private.game_v2_week_limits() from public, anon, authenticated;

-- Monday 00:00 Europe/Rome of the week containing at_time, as an instant.
-- Built from the Rome wall clock, so a DST week (167 or 169 hours) is exact.
create function private.game_v2_week_bounds(at_time timestamptz, out starts_at timestamptz, out ends_at timestamptz)
language sql stable set search_path = '' as $$
  select (private.game_v2_week_start(at_time)::timestamp at time zone 'Europe/Rome'),
         ((private.game_v2_week_start(at_time) + 7)::timestamp at time zone 'Europe/Rome');
$$;
revoke all on function private.game_v2_week_bounds(timestamptz) from public, anon, authenticated;

create function private.game_v2_week_usage(current_couple uuid, at_time timestamptz)
returns jsonb language sql stable set search_path = '' as $$
  with b as (
    select * from private.game_v2_week_bounds(at_time)
  ), lim as (
    select private.game_v2_week_limits() l
  ), wk as (
    select s.id, s.game_family, s.started_at, s.completed_at
    from public.game_sessions s, b
    where s.couple_id = current_couple and s.engine_version = 2
      and s.started_at >= b.starts_at and s.started_at < b.ends_at
  ), counts as (
    select count(*) filter (where game_family = 'per_voi')::integer per_voi_used,
           count(*) filter (where game_family <> 'per_voi')::integer free_used
    from wk
  ), open_rounds as (
    select count(*)::integer open_count from public.game_sessions s
    where s.couple_id = current_couple and s.engine_version = 2 and s.completed_at is null
  )
  select jsonb_build_object(
    'week_start', private.game_v2_week_start(at_time),
    'resets_on', private.game_v2_week_start(at_time) + 7,
    'per_voi_used', least(c.per_voi_used, (lim.l->>'per_voi')::integer),
    'per_voi_limit', (lim.l->>'per_voi')::integer,
    'free_used', least(c.free_used, (lim.l->>'free')::integer),
    'free_limit', (lim.l->>'free')::integer,
    'used', least(c.per_voi_used, (lim.l->>'per_voi')::integer) + least(c.free_used, (lim.l->>'free')::integer),
    'limit', (lim.l->>'total')::integer,
    'per_voi_available', c.per_voi_used < (lim.l->>'per_voi')::integer,
    'free_available', c.free_used < (lim.l->>'free')::integer,
    'open_count', o.open_count,
    'open_limit', (lim.l->>'open')::integer,
    -- Latest round of each mode started this week: lets the hub show a
    -- played mode as played instead of inviting an immediate repeat.
    'families', coalesce((
      select jsonb_object_agg(x.game_family, jsonb_build_object('session_id', x.id,
        'completed', x.completed_at is not null))
      from (select distinct on (game_family) id, game_family, completed_at from wk
            order by game_family, started_at desc, id desc) x), '{}'::jsonb)
  ) from counts c, lim, open_rounds o;
$$;
revoke all on function private.game_v2_week_usage(uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. start_game_round with the weekly budget (replaces the M11C body; same
--    signature, same locking, replay and resume contract).
-- ---------------------------------------------------------------------------

create or replace function public.start_game_round(target_family text, request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor record; sid uuid; existing_family text; at_time timestamptz := private.game_v2_clock();
  ordinal integer; heavy text; items jsonb; e jsonb; pos integer := 0; subject text;
  sources text[]; source_kind text; usage jsonb;
begin
  select * into actor from private.m11a_actor_locked();
  if request_id is null then raise exception using errcode = '22023', message = 'request id required'; end if;
  if target_family is null or not (target_family = 'per_voi' or target_family = any (private.game_v2_families())) then
    raise exception using errcode = '22023', message = 'invalid family';
  end if;

  -- Replay of an earlier request: always the original round, whatever the
  -- allowance or the week is now.
  select s.id, s.game_family into sid, existing_family from public.game_sessions s
    where s.couple_id = actor.caller_couple and s.started_by_role = actor.caller_role
      and s.create_request_id = start_game_round.request_id;
  if sid is not null then
    if existing_family is distinct from target_family then
      raise exception using errcode = '22023', message = 'request already used';
    end if;
    return private.m11a_session_state(sid, actor.caller_couple, actor.caller_role) || jsonb_build_object('resumed', true);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('game_v2_round:' || actor.caller_couple::text || ':' || target_family, 0));
  select s.id into sid from public.game_sessions s
    where s.couple_id = actor.caller_couple and s.started_by_role = actor.caller_role
      and s.create_request_id = start_game_round.request_id and s.game_family = target_family;
  if sid is not null then
    return private.m11a_session_state(sid, actor.caller_couple, actor.caller_role) || jsonb_build_object('resumed', true);
  end if;
  -- An open round of the same mode (from this week or an earlier one) is
  -- resumed and spends nothing.
  select s.id into sid from public.game_sessions s
    where s.couple_id = actor.caller_couple and s.engine_version = 2 and s.game_family = target_family
      and s.completed_at is null;
  if sid is not null then
    return private.m11a_session_state(sid, actor.caller_couple, actor.caller_role) || jsonb_build_object('resumed', true);
  end if;

  -- Weekly budget. Taken after the per-mode lock on every path, so the lock
  -- order is fixed; usage is read again under it (READ COMMITTED: a new
  -- snapshot per statement sees a concurrent start that just committed).
  perform pg_advisory_xact_lock(hashtextextended('game_v2_budget:' || actor.caller_couple::text, 0));
  usage := private.game_v2_week_usage(actor.caller_couple, at_time);
  if target_family = 'per_voi' and not (usage->>'per_voi_available')::boolean then
    raise exception using errcode = 'P0001', message = 'weekly per voi played',
      detail = 'resets_on=' || (usage->>'resets_on');
  end if;
  if target_family <> 'per_voi' and not (usage->>'free_available')::boolean then
    raise exception using errcode = 'P0001', message = 'weekly allowance exhausted',
      detail = 'resets_on=' || (usage->>'resets_on');
  end if;
  if (usage->>'open_count')::integer >= (usage->>'open_limit')::integer then
    raise exception using errcode = 'P0001', message = 'too many open rounds';
  end if;

  select count(*) into ordinal from public.game_sessions s
    where s.couple_id = actor.caller_couple and s.engine_version = 2;
  select case when count(*) % 2 = 0 then 'beatrice' else 'francesco' end into heavy
    from public.game_sessions s
    where s.couple_id = actor.caller_couple and s.engine_version = 2 and s.subject_heavy_role is not null;

  items := private.game_v2_select_items(actor.caller_couple, target_family, at_time, ordinal);
  if jsonb_array_length(items) < 5 then
    raise exception using errcode = 'P0001', message = 'not enough content';
  end if;
  items := private.game_v2_assign_subjects(actor.caller_couple, items, heavy);
  select array_agg(distinct x->>'source_type' order by x->>'source_type') into sources from jsonb_array_elements(items) x;
  source_kind := case when sources = array['curated'] then 'curated'
    when sources = array['couple_custom'] then 'couple_custom' else 'mixed' end;

  -- started_at follows the server clock: it is what the weekly usage counts.
  insert into public.game_sessions(couple_id, game_family, content_source, started_by_role, create_request_id,
    engine_version, subject_heavy_role, started_at)
  values (actor.caller_couple, target_family, source_kind, actor.caller_role, start_game_round.request_id, 2,
    case when exists (select 1 from jsonb_array_elements(items) x where x->>'mechanic' = 'prediction') then heavy end,
    at_time)
  returning id into sid;

  for e in select value from jsonb_array_elements(items) loop
    pos := pos + 1;
    subject := e->>'subject_role';
    insert into public.game_session_items(session_id, position, source_question_id, source_version,
      question_text, answer_kind, options, mechanic, subject_role, predict_text, family, source_type,
      source_ref, recipe_id, recipe_version, topic, perspective, depth, fingerprint, context)
    values (sid, pos, (e->>'source_question_id')::uuid, (e->>'source_version')::integer,
      private.game_v2_render(e->>'question_text', subject), e->>'answer_kind',
      private.game_v2_render_options(e->'options', subject), e->>'mechanic', subject,
      case when subject is not null then private.game_v2_render(e->>'predict_text', subject) end,
      e->>'family', e->>'source_type', e->>'source_ref', e->>'recipe_id', (e->>'recipe_version')::integer,
      e->>'topic', coalesce('subject:' || subject, 'mutual'), (e->>'depth')::smallint, e->>'candidate_key',
      coalesce(e->'context', '{}'::jsonb));
  end loop;
  insert into public.game_session_sides(session_id, actor_role) values (sid, 'francesco'), (sid, 'beatrice');
  return private.m11a_session_state(sid, actor.caller_couple, actor.caller_role) || jsonb_build_object('resumed', false);
end;
$$;

revoke all on function public.start_game_round(text, uuid) from public, anon;
grant execute on function public.start_game_round(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Gioca home with the weekly allowance (replaces the M11B body; same
--    signature; read-only and lock-free).
-- ---------------------------------------------------------------------------

create or replace function public.get_game_v2_home()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor record; open_rounds jsonb; recent jsonb; per_voi jsonb; usage jsonb;
  at_time timestamptz := private.game_v2_clock();
begin
  select * into actor from private.m11a_actor();
  usage := private.game_v2_week_usage(actor.caller_couple, at_time);
  select coalesce(jsonb_agg(private.game_v2_session_summary(s.id, actor.caller_couple, actor.caller_role)
      order by s.started_at desc), '[]'::jsonb)
    into open_rounds from public.game_sessions s
    where s.couple_id = actor.caller_couple and s.engine_version = 2 and s.completed_at is null;
  select coalesce(jsonb_agg(x.summary order by x.completed_at desc), '[]'::jsonb) into recent from (
    select s.completed_at, private.game_v2_session_summary(s.id, actor.caller_couple, actor.caller_role) summary
    from public.game_sessions s
    where s.couple_id = actor.caller_couple and s.engine_version = 2 and s.completed_at is not null
    order by s.completed_at desc limit 6) x;
  -- Per voi control: restrained personal state, never a counter. Once this
  -- week's round is revealed and seen it reads "played" until Monday.
  select case
      when r.id is null and not (usage->>'per_voi_available')::boolean then jsonb_build_object('state', 'played',
        'session_id', usage->'families'->'per_voi'->>'session_id', 'resets_on', usage->>'resets_on')
      when r.id is null then jsonb_build_object('state', 'idle')
      when r.completed_at is not null then jsonb_build_object('state', 'reveal_ready', 'session_id', r.id)
      when r.my_done then jsonb_build_object('state', 'waiting', 'session_id', r.id)
      when r.partner_done or r.started_by_role <> actor.caller_role then jsonb_build_object('state', 'pending', 'session_id', r.id)
      else jsonb_build_object('state', 'in_progress', 'session_id', r.id) end
    into per_voi
    from (select null::integer) seed
    left join lateral (
      select s.id, s.completed_at, s.started_by_role, mine.completed_at is not null my_done,
        partner.completed_at is not null partner_done
      from public.game_sessions s
      join public.game_session_sides mine on mine.session_id = s.id and mine.actor_role = actor.caller_role
      join public.game_session_sides partner on partner.session_id = s.id and partner.actor_role <> actor.caller_role
      where s.couple_id = actor.caller_couple and s.engine_version = 2 and s.game_family = 'per_voi'
        and (s.completed_at is null or mine.reveal_seen_at is null)
      order by (s.completed_at is null) desc, s.started_at desc limit 1
    ) r on true;
  return jsonb_build_object(
    'my_role', actor.caller_role,
    'partner_role', private.game_v2_partner_role(actor.caller_role),
    'weekly', private.game_v2_weekly_state(actor.caller_couple, actor.caller_role, at_time),
    'allowance', usage,
    'per_voi', per_voi,
    'open_rounds', open_rounds,
    'recent', recent);
end;
$$;

revoke all on function public.get_game_v2_home() from public, anon;
grant execute on function public.get_game_v2_home() to authenticated;
