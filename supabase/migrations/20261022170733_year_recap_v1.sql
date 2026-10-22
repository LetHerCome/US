-- Il vostro anno V1 (22/10/2026, D5 exception). Spec:
-- docs/missions/year-recap-v1.md.
--
-- One read-only RPC, public.get_couple_year_recap(): the caller's couple and
-- the period from its last anniversary before today (on the anniversary
-- itself: the full year that just ended; before the first one: since the
-- start of the relationship), with counts of what the two of them did in it
-- and the storage paths of the first and last memory. Never any written
-- text (answers, messages, captions, titles). No table, no write, no change
-- to grants of existing objects. Re-applying this migration changes nothing.

-- The anniversary in a given year: a start on 29 February is celebrated on
-- the 28th in common years (the Eventi rule).
create or replace function private.year_recap_anniversary(p_started date, p_year integer) returns date
language sql immutable set search_path = ''
as $fn$
  select pg_catalog.make_date(p_year, extract(month from p_started)::integer,
    least(extract(day from p_started)::integer,
          extract(day from (pg_catalog.make_date(p_year, extract(month from p_started)::integer, 1) + interval '1 month - 1 day'))::integer));
$fn$;
revoke all on function private.year_recap_anniversary(date, integer) from public, anon, authenticated, service_role;

-- The recap of one couple on one civil day (Europe/Rome). Kept apart from
-- the RPC so the period rules can be tested on any day.
create or replace function private.couple_year_recap(p_couple uuid, p_today date) returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare
  started date;
  this_year date;
  period_start date;
  first_year boolean;
  years integer;
  months integer;
  roles jsonb;
  m jsonb;
begin
  select c.started_on into started from public.couples c where c.id = p_couple;
  if started is null then
    raise exception using errcode = 'P0002', message = 'couple_not_found';
  end if;
  started := least(started, p_today);
  this_year := private.year_recap_anniversary(started, extract(year from p_today)::integer);
  period_start := case when this_year < p_today then this_year
    else private.year_recap_anniversary(started, extract(year from p_today)::integer - 1) end;
  first_year := p_today < private.year_recap_anniversary(started, extract(year from started)::integer + 1);
  period_start := greatest(period_start, started);
  years := greatest(0, extract(year from p_today)::integer - extract(year from started)::integer
    - case when this_year > p_today then 1 else 0 end);
  months := greatest(0, (extract(year from p_today)::integer - extract(year from started)::integer) * 12
    + extract(month from p_today)::integer - extract(month from started)::integer
    - case when extract(day from p_today) < extract(day from started) then 1 else 0 end);

  -- Who sent each Ti penso, by role (a departed sender counts in the total only).
  select pg_catalog.jsonb_build_object(
      'total', pg_catalog.count(*),
      'francesco', pg_catalog.count(*) filter (where p.role = 'francesco'),
      'beatrice', pg_catalog.count(*) filter (where p.role = 'beatrice'))
    into roles
    from public.shared_messages s
    left join public.profiles p on p.id = s.sender_id
   where s.couple_id = p_couple and s.kind = 'think'
     and (s.created_at at time zone 'Europe/Rome')::date between period_start and p_today;

  with mo as (
    select x.id, x.moment_date, x.created_at, x.storage_path, x.thumbnail_path
      from public.moments x
     where x.couple_id = p_couple and x.moment_date between period_start and p_today
  ), top as (
    select pg_catalog.to_char(mo.moment_date, 'YYYY-MM') as ym, pg_catalog.count(*) as n
      from mo group by 1 order by 2 desc, 1 asc limit 1
  )
  select pg_catalog.jsonb_build_object(
      'count', (select pg_catalog.count(*) from mo),
      'photos', (select pg_catalog.count(*) from mo)
        + (select pg_catalog.count(*) from public.moment_photos ph join mo on mo.id = ph.moment_id where ph.couple_id = p_couple),
      'top_month', (select top.ym from top),
      'top_month_count', coalesce((select top.n from top), 0),
      'first', (select pg_catalog.jsonb_build_object('moment_date', mo.moment_date, 'storage_path', mo.storage_path, 'thumbnail_path', mo.thumbnail_path)
                  from mo order by mo.moment_date, mo.created_at limit 1),
      'last', (select pg_catalog.jsonb_build_object('moment_date', mo.moment_date, 'storage_path', mo.storage_path, 'thumbnail_path', mo.thumbnail_path)
                 from mo order by mo.moment_date desc, mo.created_at desc limit 1))
    into m;

  return pg_catalog.jsonb_build_object(
    'period', pg_catalog.jsonb_build_object('start', period_start, 'end', p_today,
      'full_year', p_today = this_year and p_today > started, 'first_year', first_year, 'years', years, 'months', months),
    'days_together', p_today - started,
    'moments', m,
    'think', roles,
    'daily', pg_catalog.jsonb_build_object(
      'answered_together', (select pg_catalog.count(*) from (
          select a.question_id from public.daily_answers a
            join public.daily_questions dq on dq.id = a.question_id
           where a.couple_id = p_couple and dq.question_date between period_start and p_today
           group by a.question_id having pg_catalog.count(distinct a.user_id) >= 2) both_answered),
      'kept', (select pg_catalog.count(*) from public.daily_question_keepsakes k
                where k.couple_id = p_couple and k.question_date between period_start and p_today)),
    'games', pg_catalog.jsonb_build_object('completed', (select pg_catalog.count(*) from public.game_sessions g
        where g.couple_id = p_couple and g.completed_at is not null
          and (g.completed_at at time zone 'Europe/Rome')::date between period_start and p_today)),
    'missions', pg_catalog.jsonb_build_object('completed', (select pg_catalog.count(*) from public.bond_weekly_quests b
        where b.couple_id = p_couple and b.completed_at is not null
          and (b.completed_at at time zone 'Europe/Rome')::date between period_start and p_today)),
    'events', pg_catalog.jsonb_build_object('lived', (select pg_catalog.count(*) from public.shared_event_completions e
        where e.couple_id = p_couple and e.occurrence_date between period_start and p_today)),
    'left_for_you', pg_catalog.jsonb_build_object('count', (select pg_catalog.count(*) from public.left_for_you l
        where l.couple_id = p_couple and (l.created_at at time zone 'Europe/Rome')::date between period_start and p_today))
  );
end;
$fn$;
revoke all on function private.couple_year_recap(uuid, date) from public, anon, authenticated, service_role;

create or replace function public.get_couple_year_recap() returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare actor record;
begin
  select * into actor from private.m11a_actor();
  return private.couple_year_recap(actor.caller_couple, (pg_catalog.now() at time zone 'Europe/Rome')::date);
end;
$fn$;
comment on function public.get_couple_year_recap() is 'Il vostro anno V1: counts of the caller couple''s year (from the last anniversary before today; the full year on the anniversary) and the paths of its first and last memory. No written text.';
revoke all on function public.get_couple_year_recap() from public, anon, authenticated, service_role;
grant execute on function public.get_couple_year_recap() to authenticated;
