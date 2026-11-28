-- Gioca più piena (founder, grill del 27/11/2026, D3, D4 e D18: «l'intesa
-- della coppia, mai una gara»; i giorni giocati insieme).
--
-- get_game_intesa_v1(): one read-only summary of the caller's couple, counts
-- and dates only, never an answer text:
--   compared / same: over the LAST 20 comparable answers of finished rounds
--     (choice questions both of you answered the same way, «reciprocal»;
--     «Quanto mi conosci?» predictions stay out: a guess is not an answer),
--     how many times you chose the same option;
--   week_start / days: the Europe/Rome days of this week (Monday first) on
--     which at least one round was finished by both of you;
--   families: per game mode, when it was last finished and, over its last 20
--     comparable answers, how many were the same.
-- Same-couple only (private.m11a_actor: the caller's profile decides the
-- couple and role, never a parameter). SECURITY DEFINER with an empty
-- search_path; executable by authenticated only. No table or row changes.

create or replace function public.get_game_intesa_v1()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  actor record;
  at_time timestamptz := private.game_v2_clock();
  week record;
  overall jsonb;
  per_family jsonb;
  week_days jsonb;
begin
  select * into actor from private.m11a_actor();
  select * into week from private.game_v2_week_bounds(at_time);

  with comparable as (
    select s.game_family, s.completed_at, i.position,
      (mine.answer_index = theirs.answer_index) as same
    from public.game_sessions s
    join public.game_session_items i on i.session_id = s.id
    join public.game_session_answers mine on mine.item_id = i.id and mine.actor_role = actor.caller_role
    join public.game_session_answers theirs on theirs.item_id = i.id and theirs.actor_role <> actor.caller_role
    where s.couple_id = actor.caller_couple and s.engine_version = 2 and s.completed_at is not null
      and i.answer_kind = 'choice' and i.mechanic = 'reciprocal'
      and mine.answer_index is not null and theirs.answer_index is not null
  ), last_twenty as (
    select c.same from comparable c order by c.completed_at desc, c.position limit 20
  ), ranked as (
    select c.game_family, c.same,
      row_number() over (partition by c.game_family order by c.completed_at desc, c.position) as n
    from comparable c
  ), family_rows as (
    select f.game_family, max(f.completed_at) as last_at
    from public.game_sessions f
    where f.couple_id = actor.caller_couple and f.engine_version = 2 and f.completed_at is not null
    group by f.game_family
  )
  select
    (select jsonb_build_object('compared', count(*)::int, 'same', count(*) filter (where l.same)::int) from last_twenty l),
    coalesce((select jsonb_object_agg(fr.game_family, jsonb_build_object(
        'last_at', fr.last_at,
        'compared', coalesce((select count(*)::int from ranked r where r.game_family = fr.game_family and r.n <= 20), 0),
        'same', coalesce((select count(*)::int from ranked r where r.game_family = fr.game_family and r.n <= 20 and r.same), 0)))
      from family_rows fr), '{}'::jsonb)
  into overall, per_family;

  select coalesce(jsonb_agg(d.day order by d.day), '[]'::jsonb) into week_days
  from (
    select distinct ((s.completed_at at time zone 'Europe/Rome')::date)::text as day
    from public.game_sessions s
    where s.couple_id = actor.caller_couple and s.engine_version = 2
      and s.completed_at >= week.starts_at and s.completed_at < week.ends_at
  ) d;

  return jsonb_build_object(
    'compared', overall->'compared',
    'same', overall->'same',
    'week_start', private.game_v2_week_start(at_time)::text,
    'days', week_days,
    'families', per_family);
end;
$function$;

revoke all on function public.get_game_intesa_v1() from public, anon, authenticated, service_role;
grant execute on function public.get_game_intesa_v1() to authenticated;
