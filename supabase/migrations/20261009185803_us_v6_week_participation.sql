-- Mission 2: receipts and read model only. Never backfill, award XP or change Game allowance.
begin;

-- Refuse an unknown/unprotected substrate rather than silently creating an API over it.
do $$
begin
  if exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in
      ('daily_answers','daily_questions','game_sessions','game_session_sides','progression_events')
      and not c.relrowsecurity) then
    raise exception 'week participation requires existing RLS';
  end if;
  if exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('game_sessions','game_session_sides') and
      (pg_catalog.has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
       or pg_catalog.has_any_column_privilege('authenticated',c.oid,'INSERT,UPDATE'))) then
    raise exception 'week participation requires server-only Game mutations';
  end if;
  if pg_catalog.has_table_privilege('authenticated','public.couples','TRUNCATE') or
     pg_catalog.has_table_privilege('authenticated','public.profiles','TRUNCATE') then
    raise exception 'week participation requires protected membership parents';
  end if;
end $$;

alter table public.daily_answers add column server_answered_at timestamptz;
comment on column public.daily_answers.server_answered_at is
  'First server-authorized INSERT instant; immutable including legacy NULL. Not derived from client timestamps or XP.';

create function private.us_v6_daily_answer_receipt()
returns trigger language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); cid uuid;
begin
  if actor is null or not exists (select 1 from auth.users u where u.id=actor and not u.is_anonymous) then
    raise exception using errcode='42501',message='authentication required';
  end if;
  select p.couple_id into cid from public.profiles p where p.id=actor;
  if cid is null or new.user_id is distinct from actor or new.couple_id is distinct from cid then
    raise exception using errcode='42501',message='daily answer unavailable';
  end if;
  if tg_op='UPDATE' then
    if row(new.id,new.user_id,new.couple_id,new.question_id) is distinct from
       row(old.id,old.user_id,old.couple_id,old.question_id) then
      raise exception using errcode='42501',message='daily answer identity is immutable';
    end if;
    new.server_answered_at:=old.server_answered_at;
  else
    -- BEFORE INSERT also runs for an upsert. Its UPDATE branch above preserves OLD.
    new.server_answered_at:=pg_catalog.transaction_timestamp();
  end if;
  if new.answer is null or pg_catalog.btrim(new.answer)='' then
    raise exception using errcode='22023',message='answer required';
  end if;
  if not exists (select 1 from public.daily_questions q where q.id=new.question_id) then
    raise exception using errcode='42501',message='daily question unavailable';
  end if;
  return new;
end $$;
revoke all on function private.us_v6_daily_answer_receipt() from public,anon,authenticated;
create trigger us_v6_daily_answer_receipt before insert or update on public.daily_answers
  for each row execute function private.us_v6_daily_answer_receipt();

-- TRUNCATE ignores RLS. Parent DELETE/TRUNCATE could also erase receipts via CASCADE.
-- SELECT and the existing authorized answer INSERT/UPDATE remain compatible with upsert.
revoke delete,truncate,references,trigger,maintain on public.daily_answers from anon,authenticated;
revoke insert,update on public.daily_answers from anon;
revoke insert,update,delete,truncate,references,trigger,maintain on public.daily_questions from anon,authenticated;

create index us_week_game_completed_idx on public.game_sessions(couple_id,completed_at)
  where completed_at is not null;
create index us_week_progression_day_idx on public.progression_events(couple_id,action_day)
  include(xp_awarded);

-- Internal aggregate accepts a date for deterministic owner-only validation. It is NOT an API.
-- SECURITY INVOKER: only the authorized facade below may call it with owner privileges.
create function private.couple_week_participation_v1(target_couple uuid,target_today date)
returns jsonb language sql stable security invoker set search_path='' as $$
with bounds as (
  select pg_catalog.date_trunc('week',target_today::timestamp)::date as monday
), members as (
  select p.id,p.role from public.profiles p where p.couple_id=target_couple
    and p.role in ('francesco','beatrice')
), dates as (
  select b.monday+i as day,
    (b.monday+i)::timestamp at time zone 'Europe/Rome' as lo,
    (b.monday+i+1)::timestamp at time zone 'Europe/Rome' as hi
  from bounds b cross join pg_catalog.generate_series(0,6) i
), facts as (
  select d.day,
    (select count(*) from members)=2 and (select count(distinct a.user_id)
      from public.daily_answers a join members m on m.id=a.user_id
      join public.daily_questions q on q.id=a.question_id
      where a.couple_id=target_couple and q.question_date=d.day
        and a.server_answered_at>=d.lo and a.server_answered_at<d.hi
        and pg_catalog.btrim(a.answer)<>'')=2 as daily_complete,
    exists(select 1 from public.daily_answers a join members m on m.id=a.user_id
      join public.daily_questions q on q.id=a.question_id
      where a.couple_id=target_couple and q.question_date=d.day and a.server_answered_at is null
        and pg_catalog.btrim(a.answer)<>'') as unverifiable,
    (select count(*) from members)=2 and exists(select 1 from public.game_sessions s
      where s.couple_id=target_couple and s.completed_at>=d.lo and s.completed_at<d.hi
        and not exists(select 1 from members m where not exists(
          select 1 from public.game_session_sides side where side.session_id=s.id and side.actor_role=m.role
            and side.completed_at>=d.lo and side.completed_at<d.hi))) as game_complete
  from dates d
), days as (
  select day,daily_complete,game_complete,daily_complete and game_complete as complete,
    case when daily_complete and game_complete then 'complete'
      when unverifiable then 'unverifiable' else 'incomplete' end as status
  from facts
)
select pg_catalog.jsonb_build_object(
  'week_start',b.monday,'week_end',b.monday+6,'today',target_today,'timezone','Europe/Rome',
  'days',(select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('date',day,
    'daily_complete',daily_complete,'game_complete',game_complete,'complete',complete,'status',status) order by day) from days),
  'completed_days',(select count(*) from days where complete),
  'weekly_xp_awarded',(select coalesce(sum(e.xp_awarded),0) from public.progression_events e
    where e.couple_id=target_couple and e.action_day>=b.monday and e.action_day<=b.monday+6)
) from bounds b
$$;
revoke all on function private.couple_week_participation_v1(uuid,date) from public,anon,authenticated,service_role;

-- Needs both sealed Daily rows and the private ledger, intentionally bypassing their SELECT RLS.
-- Authorization precedes the aggregate; no couple/date/JWT metadata is accepted from the client.
create function public.get_couple_week_participation_v1()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); cid uuid;
begin
  if actor is null or not exists(select 1 from auth.users u where u.id=actor and not u.is_anonymous) then
    raise exception using errcode='42501',message='authentication required';
  end if;
  select p.couple_id into cid from public.profiles p
    where p.id=actor and p.role in ('francesco','beatrice');
  if cid is null then
    raise exception using errcode='42501',message='couple membership required';
  end if;
  return private.couple_week_participation_v1(cid,
    (pg_catalog.transaction_timestamp() at time zone 'Europe/Rome')::date);
end $$;
revoke all on function public.get_couple_week_participation_v1() from public,anon,authenticated,service_role;
grant execute on function public.get_couple_week_participation_v1() to authenticated;

notify pgrst,'reload schema';
commit;
