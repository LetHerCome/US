-- Production ledger 20260820181437 us_quiz_modes_engine: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 f9713c2c92402335d2408eb453ef2403; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

alter table public.quiz_sets add column if not exists mode text not null default 'match';
update public.quiz_sets set mode='match' where mode is null or mode='';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='quiz_sets_mode_check' and conrelid='public.quiz_sets'::regclass) then
    alter table public.quiz_sets add constraint quiz_sets_mode_check check(mode in ('match','never_have_i','agree_disagree','would_you_rather'));
  end if;
end $$;

create or replace function public.get_weekly_quiz_sets()
returns jsonb language plpgsql security definer set search_path='public' as $$
declare uid uuid := auth.uid(); cid uuid; ws date := date_trunc('week', current_timestamp at time zone 'Europe/Rome')::date; week_index integer := ((ws - date '2026-08-17') / 7)::integer; result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select couple_id into cid from public.profiles where id=uid;
  if cid is null then raise exception 'Profile not linked'; end if;
  with ranked as (
    select id,slug,title,category,row_number() over(order by md5(slug))-1 rn,count(*) over() cnt from public.quiz_sets where mode='match'
  ), positioned as (
    select id,slug,title,category,cnt,mod((rn-mod(week_index*3,cnt)+cnt),cnt) pos from ranked
  ), chosen as (
    select id,slug,title,category,pos from positioned where pos<least(3,cnt) order by pos
  )
  select jsonb_build_object('week_start',ws,'next_refresh',ws+7,'sets',coalesce(jsonb_agg(jsonb_build_object('id',id,'slug',slug,'title',title,'category',category,'mode','match') order by pos),'[]'::jsonb)) into result from chosen;
  return result;
end; $$;

create or replace function public.get_weekly_game_sets()
returns jsonb language plpgsql security definer set search_path='public' as $$
declare uid uuid := auth.uid(); cid uuid; ws date := date_trunc('week', current_timestamp at time zone 'Europe/Rome')::date; week_index integer := ((ws-date '2026-08-17')/7)::integer; result jsonb := '{}'::jsonb; mode_name text; arr jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select couple_id into cid from public.profiles where id=uid;
  if cid is null then raise exception 'Profile not linked'; end if;
  foreach mode_name in array array['never_have_i','agree_disagree','would_you_rather'] loop
    with ranked as (
      select id,slug,title,category,mode,row_number() over(order by md5(slug))-1 rn,count(*) over() cnt from public.quiz_sets where mode=mode_name
    ), positioned as (
      select id,slug,title,category,mode,cnt,mod((rn-mod(week_index*3,cnt)+cnt),cnt) pos from ranked
    )
    select coalesce(jsonb_agg(jsonb_build_object('id',id,'slug',slug,'title',title,'category',category,'mode',mode) order by pos),'[]'::jsonb) into arr from positioned where pos<least(3,cnt);
    result := result || jsonb_build_object(mode_name,arr);
  end loop;
  return result || jsonb_build_object('week_start',ws,'next_refresh',ws+7);
end; $$;
grant execute on function public.get_weekly_game_sets() to authenticated;

create or replace function public.get_quiz_state(target_set_id uuid)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare
  uid uuid := auth.uid(); cid uuid; ws date := date_trunc('week', current_timestamp at time zone 'Europe/Rome')::date;
  total_count integer:=0; my_count integer:=0; partner_count integer:=0; score integer:=null;
  my_answers jsonb:='{}'::jsonb; partner_answers jsonb:=null; reward_xp integer:=null; inserted_xp integer:=null; reward_granted_now boolean:=false; set_mode text:='match';
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select couple_id into cid from public.profiles where id=uid;
  if cid is null then raise exception 'Profile not linked'; end if;
  select coalesce(mode,'match') into set_mode from public.quiz_sets where id=target_set_id;
  if set_mode is null then raise exception 'Quiz set not found'; end if;
  select count(*) into total_count from public.quiz_questions where set_id=target_set_id;
  if total_count=0 then raise exception 'Quiz set not found or empty'; end if;
  select count(*),coalesce(jsonb_object_agg(question_id::text,answer_index),'{}'::jsonb) into my_count,my_answers from public.quiz_responses where set_id=target_set_id and couple_id=cid and user_id=uid and week_start=ws;
  select count(*) into partner_count from public.quiz_responses where set_id=target_set_id and couple_id=cid and user_id<>uid and week_start=ws;
  if my_count>=total_count and partner_count>=total_count then
    select coalesce(jsonb_object_agg(question_id::text,answer_index),'{}'::jsonb) into partner_answers from public.quiz_responses where set_id=target_set_id and couple_id=cid and user_id<>uid and week_start=ws;
    select count(*) into score from public.quiz_responses mine join public.quiz_responses partner on partner.question_id=mine.question_id and partner.set_id=mine.set_id and partner.couple_id=mine.couple_id and partner.week_start=mine.week_start and partner.user_id<>mine.user_id where mine.set_id=target_set_id and mine.couple_id=cid and mine.user_id=uid and mine.week_start=ws and mine.answer_index=partner.answer_index;
    reward_xp := case when set_mode='match' then score*5 else 20+score*3 end;
    insert into public.weekly_quiz_rewards(couple_id,set_id,week_start,score,xp_awarded) values(cid,target_set_id,ws,score,reward_xp) on conflict(couple_id,set_id,week_start) do nothing returning xp_awarded into inserted_xp;
    if inserted_xp is not null then update public.couples set bond_xp=coalesce(bond_xp,0)+inserted_xp where id=cid; reward_granted_now:=true; end if;
    select xp_awarded into reward_xp from public.weekly_quiz_rewards where couple_id=cid and set_id=target_set_id and week_start=ws;
  end if;
  return jsonb_build_object('mode',set_mode,'total',total_count,'my_count',my_count,'partner_count',partner_count,'my_complete',my_count>=total_count,'partner_complete',partner_count>=total_count,'both_complete',my_count>=total_count and partner_count>=total_count,'my_answers',my_answers,'partner_answers',partner_answers,'score',score,'week_start',ws,'xp_awarded',reward_xp,'reward_granted_now',reward_granted_now);
end; $$;;
