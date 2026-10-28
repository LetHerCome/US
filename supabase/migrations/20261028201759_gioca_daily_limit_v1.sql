-- Gioca: una partita al giorno (D4 del 28/10/2026, docs/missions/plus-v1-staging.md §1).
--
-- The couple starts one new round per Europe/Rome day, of any mode (Per voi
-- and Questo o quello included): 7 a week instead of 1 Per voi + 2 free.
-- Unchanged: resuming an open round spends nothing, at most 3 rounds stay
-- open, request ids replay, the clock is the server's.
--
-- Only the private budget changes. start_game_round, start_swipe_round and
-- get_game_v2_home already read everything from game_v2_week_usage, so the
-- payload keeps every key and error message the installed clients know
-- ("weekly allowance exhausted", "weekly per voi played"); resets_on is now
-- tomorrow, and 'period' tells the new client the budget is daily.

create or replace function private.game_v2_week_limits()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('day', 1, 'open', 3);
$$;

create or replace function private.game_v2_week_usage(current_couple uuid, at_time timestamptz)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with lim as (
    select private.game_v2_week_limits() l
  ), d as (
    -- The same Europe/Rome day as la domanda di oggi.
    select private.daily_question_day(at_time) today
  ), day_rounds as (
    select count(*)::integer used
    from public.game_sessions s, d
    where s.couple_id = current_couple and s.engine_version = 2
      and s.started_at >= (d.today::timestamp at time zone 'Europe/Rome')
      and s.started_at < ((d.today + 1)::timestamp at time zone 'Europe/Rome')
  ), wk as (
    select s.id, s.game_family, s.started_at, s.completed_at
    from public.game_sessions s, private.game_v2_week_bounds(at_time) b
    where s.couple_id = current_couple and s.engine_version = 2
      and s.started_at >= b.starts_at and s.started_at < b.ends_at
  ), open_rounds as (
    select count(*)::integer open_count from public.game_sessions s
    where s.couple_id = current_couple and s.engine_version = 2 and s.completed_at is null
  ), u as (
    select least(r.used, (lim.l->>'day')::integer) used, (lim.l->>'day')::integer lim,
      r.used < (lim.l->>'day')::integer available
    from day_rounds r, lim
  )
  select jsonb_build_object(
    'period', 'day',
    'day', d.today,
    'week_start', private.game_v2_week_start(at_time),
    'resets_on', d.today + 1,
    'used', u.used,
    'limit', u.lim,
    -- Per voi and the other modes share the one round of the day.
    'per_voi_used', u.used,
    'per_voi_limit', u.lim,
    'free_used', u.used,
    'free_limit', u.lim,
    'per_voi_available', u.available,
    'free_available', u.available,
    'open_count', o.open_count,
    'open_limit', (lim.l->>'open')::integer,
    -- Latest round of each mode started this week: lets the hub show a
    -- played mode as played instead of inviting an immediate repeat.
    'families', coalesce((
      select jsonb_object_agg(x.game_family, jsonb_build_object('session_id', x.id,
        'completed', x.completed_at is not null))
      from (select distinct on (game_family) id, game_family, completed_at from wk
            order by game_family, started_at desc, id desc) x), '{}'::jsonb)
  ) from d, u, lim, open_rounds o;
$$;

revoke all on function private.game_v2_week_limits() from public, anon, authenticated, service_role;
revoke all on function private.game_v2_week_usage(uuid, timestamptz) from public, anon, authenticated, service_role;
