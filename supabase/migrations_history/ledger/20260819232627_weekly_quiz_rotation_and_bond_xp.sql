-- Production ledger 20260819232627 weekly_quiz_rotation_and_bond_xp: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 628da54017e750473f54220bd352e2ae; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

alter table public.quiz_responses add column if not exists week_start date;
update public.quiz_responses
set week_start = date_trunc('week', created_at at time zone 'Europe/Rome')::date
where week_start is null;
alter table public.quiz_responses alter column week_start set default date_trunc('week', current_timestamp at time zone 'Europe/Rome')::date;
alter table public.quiz_responses alter column week_start set not null;

alter table public.quiz_responses drop constraint if exists quiz_responses_question_id_user_id_key;
create unique index if not exists quiz_responses_question_user_week_key
  on public.quiz_responses(question_id,user_id,week_start);
create index if not exists quiz_responses_couple_week_idx
  on public.quiz_responses(couple_id,week_start,set_id);

create table if not exists public.weekly_quiz_rewards (
  couple_id uuid not null references public.couples(id) on delete cascade,
  set_id uuid not null references public.quiz_sets(id) on delete cascade,
  week_start date not null,
  score smallint not null check (score between 0 and 10),
  xp_awarded integer not null check (xp_awarded between 0 and 100),
  awarded_at timestamptz not null default now(),
  primary key (couple_id,set_id,week_start)
);
alter table public.weekly_quiz_rewards enable row level security;
drop policy if exists weekly_quiz_rewards_same_couple_select on public.weekly_quiz_rewards;
create policy weekly_quiz_rewards_same_couple_select on public.weekly_quiz_rewards
for select to authenticated
using (exists (
  select 1 from public.profiles p
  where p.id=auth.uid() and p.couple_id=weekly_quiz_rewards.couple_id
));

create or replace function public.get_weekly_quiz_sets()
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  ws date := date_trunc('week', current_timestamp at time zone 'Europe/Rome')::date;
  week_index integer := ((ws - date '2026-08-17') / 7)::integer;
  result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select couple_id into cid from public.profiles where id=uid;
  if cid is null then raise exception 'Profile not linked'; end if;

  with ranked as (
    select id,slug,title,category,
           row_number() over(order by md5(slug)) - 1 as rn,
           count(*) over() as cnt
    from public.quiz_sets
  ), positioned as (
    select id,slug,title,category,cnt,
           mod((rn - mod(week_index * 3, cnt) + cnt), cnt) as pos
    from ranked
  ), chosen as (
    select id,slug,title,category,pos
    from positioned
    where pos < least(3,cnt)
    order by pos
  )
  select jsonb_build_object(
    'week_start', ws,
    'next_refresh', ws + 7,
    'sets', coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'slug',slug,'title',title,'category',category
    ) order by pos),'[]'::jsonb)
  ) into result
  from chosen;

  return result;
end;
$$;

create or replace function public.save_quiz_answer(target_question_id uuid, target_answer_index smallint)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  sid uuid;
  option_count integer;
  ws date := date_trunc('week', current_timestamp at time zone 'Europe/Rome')::date;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select couple_id into cid from public.profiles where id=uid;
  if cid is null then raise exception 'Profile not linked'; end if;
  select set_id, jsonb_array_length(options) into sid, option_count from public.quiz_questions where id=target_question_id;
  if sid is null then raise exception 'Quiz question not found'; end if;
  if target_answer_index < 0 or target_answer_index >= option_count then raise exception 'Invalid answer index'; end if;

  insert into public.quiz_responses(set_id,question_id,user_id,couple_id,answer_index,week_start,updated_at)
  values (sid,target_question_id,uid,cid,target_answer_index,ws,now())
  on conflict (question_id,user_id,week_start)
  do update set answer_index=excluded.answer_index,set_id=excluded.set_id,couple_id=excluded.couple_id,updated_at=now();

  return jsonb_build_object('saved',true,'set_id',sid,'question_id',target_question_id,'week_start',ws);
end;
$$;

create or replace function public.get_quiz_state(target_set_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  ws date := date_trunc('week', current_timestamp at time zone 'Europe/Rome')::date;
  total_count integer := 0;
  my_count integer := 0;
  partner_count integer := 0;
  score integer := null;
  my_answers jsonb := '{}'::jsonb;
  partner_answers jsonb := null;
  reward_xp integer := null;
  inserted_xp integer := null;
  reward_granted_now boolean := false;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select couple_id into cid from public.profiles where id=uid;
  if cid is null then raise exception 'Profile not linked'; end if;

  select count(*) into total_count from public.quiz_questions where set_id=target_set_id;
  if total_count=0 then raise exception 'Quiz set not found or empty'; end if;

  select count(*),coalesce(jsonb_object_agg(question_id::text,answer_index),'{}'::jsonb)
  into my_count,my_answers
  from public.quiz_responses
  where set_id=target_set_id and couple_id=cid and user_id=uid and week_start=ws;

  select count(*) into partner_count
  from public.quiz_responses
  where set_id=target_set_id and couple_id=cid and user_id<>uid and week_start=ws;

  if my_count>=total_count and partner_count>=total_count then
    select coalesce(jsonb_object_agg(question_id::text,answer_index),'{}'::jsonb)
    into partner_answers
    from public.quiz_responses
    where set_id=target_set_id and couple_id=cid and user_id<>uid and week_start=ws;

    select count(*) into score
    from public.quiz_responses mine
    join public.quiz_responses partner
      on partner.question_id=mine.question_id
     and partner.set_id=mine.set_id
     and partner.couple_id=mine.couple_id
     and partner.week_start=mine.week_start
     and partner.user_id<>mine.user_id
    where mine.set_id=target_set_id
      and mine.couple_id=cid
      and mine.user_id=uid
      and mine.week_start=ws
      and mine.answer_index=partner.answer_index;

    reward_xp := score * 5;
    insert into public.weekly_quiz_rewards(couple_id,set_id,week_start,score,xp_awarded)
    values (cid,target_set_id,ws,score,reward_xp)
    on conflict (couple_id,set_id,week_start) do nothing
    returning xp_awarded into inserted_xp;

    if inserted_xp is not null then
      update public.couples
      set bond_xp=coalesce(bond_xp,0)+inserted_xp
      where id=cid;
      reward_granted_now := true;
    end if;

    select xp_awarded into reward_xp
    from public.weekly_quiz_rewards
    where couple_id=cid and set_id=target_set_id and week_start=ws;
  end if;

  return jsonb_build_object(
    'total',total_count,
    'my_count',my_count,
    'partner_count',partner_count,
    'my_complete',my_count>=total_count,
    'partner_complete',partner_count>=total_count,
    'both_complete',my_count>=total_count and partner_count>=total_count,
    'my_answers',my_answers,
    'partner_answers',partner_answers,
    'score',score,
    'week_start',ws,
    'xp_awarded',reward_xp,
    'reward_granted_now',reward_granted_now
  );
end;
$$;;
