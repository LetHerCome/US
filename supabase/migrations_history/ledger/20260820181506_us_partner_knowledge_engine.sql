-- Production ledger 20260820181506 us_partner_knowledge_engine: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 0d7c51779652fbec30017cfdf5c1bc66; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

create table if not exists public.partner_knowledge_attempts (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  deck smallint not null check(deck between 1 and 3),
  guesses jsonb not null,
  score smallint not null check(score between 0 and 5),
  xp_awarded integer not null check(xp_awarded between 0 and 50),
  completed_at timestamptz not null default now(),
  unique(couple_id,user_id,week_start,deck)
);
alter table public.partner_knowledge_attempts enable row level security;
drop policy if exists partner_knowledge_attempts_read_own on public.partner_knowledge_attempts;
create policy partner_knowledge_attempts_read_own on public.partner_knowledge_attempts for select using(user_id=auth.uid());

create or replace function public.get_partner_knowledge_hub()
returns jsonb language plpgsql security definer set search_path='public' as $$
declare uid uuid:=auth.uid(); cid uuid; pid uuid; partner_name text; ws date:=date_trunc('week',current_timestamp at time zone 'Europe/Rome')::date; decks jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select couple_id into cid from public.profiles where id=uid;
  if cid is null then raise exception 'Profile not linked'; end if;
  select id,display_name into pid,partner_name from public.profiles where couple_id=cid and id<>uid limit 1;
  if pid is null then raise exception 'Partner not linked'; end if;
  with latest as (
    select distinct on(qr.question_id) qr.question_id,qr.answer_index
    from public.quiz_responses qr join public.quiz_sets qs on qs.id=qr.set_id
    where qr.user_id=pid and qr.couple_id=cid and qs.mode='match'
    order by qr.question_id,qr.updated_at desc
  ), ranked as (
    select q.id question_id,q.question,q.options,row_number() over(order by md5(q.id::text||ws::text||uid::text)) rn
    from latest l join public.quiz_questions q on q.id=l.question_id
  ), selected as (
    select *,((rn-1)/5+1)::int deck from ranked where rn<=15
  ), deck_rows as (
    select s.deck,jsonb_agg(jsonb_build_object('id',s.question_id,'question',s.question,'options',s.options) order by s.rn) questions,count(*) cnt
    from selected s group by s.deck
  )
  select coalesce(jsonb_agg(jsonb_build_object('deck',d.deck,'questions',d.questions,'count',d.cnt,'completed',a.id is not null,'score',a.score,'xp_awarded',a.xp_awarded) order by d.deck),'[]'::jsonb)
  into decks
  from deck_rows d left join public.partner_knowledge_attempts a on a.couple_id=cid and a.user_id=uid and a.week_start=ws and a.deck=d.deck;
  return jsonb_build_object('week_start',ws,'next_refresh',ws+7,'partner_name',partner_name,'decks',decks);
end; $$;

create or replace function public.complete_partner_knowledge_deck(target_deck smallint,target_guesses jsonb)
returns jsonb language plpgsql security definer set search_path='public' as $$
declare
  uid uuid:=auth.uid(); cid uuid; pid uuid; partner_name text; ws date:=date_trunc('week',current_timestamp at time zone 'Europe/Rome')::date;
  required_count integer; valid_count integer; score_count integer; awarded integer; inserted_id uuid; stored public.partner_knowledge_attempts%rowtype; details jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if target_deck not between 1 and 3 then raise exception 'Invalid deck'; end if;
  if jsonb_typeof(target_guesses)<>'object' then raise exception 'Invalid guesses'; end if;
  select couple_id into cid from public.profiles where id=uid;
  if cid is null then raise exception 'Profile not linked'; end if;
  select id,display_name into pid,partner_name from public.profiles where couple_id=cid and id<>uid limit 1;
  if pid is null then raise exception 'Partner not linked'; end if;
  select * into stored from public.partner_knowledge_attempts where couple_id=cid and user_id=uid and week_start=ws and deck=target_deck;
  if not found then
    with latest as (
      select distinct on(qr.question_id) qr.question_id,qr.answer_index from public.quiz_responses qr join public.quiz_sets qs on qs.id=qr.set_id where qr.user_id=pid and qr.couple_id=cid and qs.mode='match' order by qr.question_id,qr.updated_at desc
    ), ranked as (
      select q.id question_id,q.options,l.answer_index,row_number() over(order by md5(q.id::text||ws::text||uid::text)) rn from latest l join public.quiz_questions q on q.id=l.question_id
    ), selected as (
      select *,((rn-1)/5+1)::int deck from ranked where rn<=15
    )
    select count(*),count(*) filter(where target_guesses ? question_id::text and (target_guesses->>question_id::text) ~ '^[0-9]+$' and (target_guesses->>question_id::text)::int>=0 and (target_guesses->>question_id::text)::int<jsonb_array_length(options)),count(*) filter(where target_guesses ? question_id::text and (target_guesses->>question_id::text) ~ '^[0-9]+$' and (target_guesses->>question_id::text)::int=answer_index)
    into required_count,valid_count,score_count from selected where deck=target_deck;
    if required_count=0 then raise exception 'Knowledge deck unavailable'; end if;
    if valid_count<>required_count then raise exception 'Complete every answer first'; end if;
    awarded:=least(50,score_count*10);
    insert into public.partner_knowledge_attempts(couple_id,user_id,week_start,deck,guesses,score,xp_awarded) values(cid,uid,ws,target_deck,target_guesses,score_count,awarded) on conflict(couple_id,user_id,week_start,deck) do nothing returning id into inserted_id;
    if inserted_id is not null then
      update public.couples set bond_xp=coalesce(bond_xp,0)+awarded where id=cid;
      insert into public.activity(couple_id,actor_id,type,payload) values(cid,uid,'partner_knowledge_completed',jsonb_build_object('deck',target_deck,'partner_name',partner_name,'score',score_count,'xp',awarded));
    end if;
    select * into stored from public.partner_knowledge_attempts where couple_id=cid and user_id=uid and week_start=ws and deck=target_deck;
  end if;
  with latest as (
    select distinct on(qr.question_id) qr.question_id,qr.answer_index from public.quiz_responses qr join public.quiz_sets qs on qs.id=qr.set_id where qr.user_id=pid and qr.couple_id=cid and qs.mode='match' order by qr.question_id,qr.updated_at desc
  ), ranked as (
    select q.id question_id,q.question,q.options,l.answer_index,row_number() over(order by md5(q.id::text||ws::text||uid::text)) rn from latest l join public.quiz_questions q on q.id=l.question_id
  ), selected as (
    select *,((rn-1)/5+1)::int deck from ranked where rn<=15
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',question_id,'question',question,'options',options,'your_answer',(stored.guesses->>question_id::text)::int,'partner_answer',answer_index,'correct',((stored.guesses->>question_id::text)::int=answer_index)) order by rn),'[]'::jsonb) into details from selected where deck=target_deck;
  return jsonb_build_object('completed',true,'partner_name',partner_name,'deck',target_deck,'score',stored.score,'xp_awarded',stored.xp_awarded,'reward_granted_now',inserted_id is not null,'questions',details);
end; $$;
revoke all on function public.get_partner_knowledge_hub() from public;
revoke all on function public.complete_partner_knowledge_deck(smallint,jsonb) from public;
grant execute on function public.get_partner_knowledge_hub() to authenticated;
grant execute on function public.complete_partner_knowledge_deck(smallint,jsonb) to authenticated;;
