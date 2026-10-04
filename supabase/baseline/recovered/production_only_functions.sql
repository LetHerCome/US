-- US backend recovered source: production_only_functions.sql
-- The 18 functions that existed only in production before F2A.1.
-- GENERATED from the production capture by scripts/build-supabase-baseline.mjs.
-- A documentation slice of supabase/baseline (same text, same order). It is not
-- a migration and is not applied by itself; the baseline files are.

-- from 30_functions.sql
-- private.current_couple_id()
CREATE OR REPLACE FUNCTION private.current_couple_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select couple_id from public.profiles where id = auth.uid()
$function$;

-- private.us_touch_updated_at()
CREATE OR REPLACE FUNCTION private.us_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- public.award_relationship_milestone(target_couple_id uuid, target_milestone_date date, target_months integer, target_kind text, target_xp integer)
CREATE OR REPLACE FUNCTION public.award_relationship_milestone(target_couple_id uuid, target_milestone_date date, target_months integer, target_kind text, target_xp integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare inserted_id uuid;
begin
  if target_months<=0 or target_xp<0 or target_xp>500 or target_kind not in ('monthiversary','anniversary') then raise exception 'Invalid milestone'; end if;
  insert into public.relationship_milestones(couple_id,milestone_date,kind,months_together,xp_awarded)
  values(target_couple_id,target_milestone_date,target_kind,target_months,target_xp)
  on conflict(couple_id,milestone_date,kind) do nothing
  returning id into inserted_id;
  if inserted_id is null then return false; end if;
  update public.couples set bond_xp=coalesce(bond_xp,0)+target_xp where id=target_couple_id;
  insert into public.activity(couple_id,actor_id,type,payload)
  values(target_couple_id,null,'relationship_milestone',jsonb_build_object('date',target_milestone_date,'months',target_months,'kind',target_kind,'xp',target_xp));
  return true;
end; $function$;

-- public.calendar_reminder_offset_valid(p_entry_id uuid, p_offset_minutes integer)
CREATE OR REPLACE FUNCTION public.calendar_reminder_offset_valid(p_entry_id uuid, p_offset_minutes integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select not exists (
    select 1 from public.calendar_entries
    where id = p_entry_id and is_all_day and p_offset_minutes <> 1440
  );
$function$;

-- public.complete_partner_knowledge_deck(target_deck smallint, target_guesses jsonb)
CREATE OR REPLACE FUNCTION public.complete_partner_knowledge_deck(target_deck smallint, target_guesses jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end; $function$;
comment on function public.complete_partner_knowledge_deck(target_deck smallint, target_guesses jsonb) is 'RETIRED (US 2.0 F1B): Gioca v1 partner knowledge, no client caller since M11B. EXECUTE revoked from public/anon/authenticated.';

-- public.complete_shared_event(target_event_id uuid, target_occurrence_date date)
CREATE OR REPLACE FUNCTION public.complete_shared_event(target_event_id uuid, target_occurrence_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth'
AS $function$
declare
  uid uuid := auth.uid(); cid uuid; e public.shared_events%rowtype; existing public.shared_event_completions%rowtype;
  awarded integer; lead_days integer; today_rome date := (current_timestamp at time zone 'Europe/Rome')::date;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select couple_id into cid from public.profiles where id=uid;
  if cid is null then raise exception 'Profile not linked'; end if;
  select * into e from public.shared_events where id=target_event_id and couple_id=cid for update;
  if not found then raise exception 'Event not found'; end if;
  if target_occurrence_date is null or target_occurrence_date > today_rome then raise exception 'Event cannot be completed yet'; end if;
  if e.recurs_yearly then
    if extract(month from target_occurrence_date) <> extract(month from e.event_date) or extract(day from target_occurrence_date) <> extract(day from e.event_date) then raise exception 'Invalid recurring occurrence'; end if;
  elsif target_occurrence_date <> e.event_date then raise exception 'Invalid occurrence date'; end if;
  select * into existing from public.shared_event_completions where event_id=e.id and occurrence_date=target_occurrence_date;
  if found then return jsonb_build_object('completed',true,'already_completed',true,'xp_awarded',existing.xp_awarded,'completed_at',existing.completed_at); end if;
  lead_days := greatest(0, target_occurrence_date - (e.created_at at time zone 'Europe/Rome')::date);
  awarded := case when e.recurs_yearly then 60 when lead_days >= 7 then 50 when lead_days >= 2 then 35 else 25 end;
  insert into public.shared_event_completions(event_id,couple_id,occurrence_date,completed_by,xp_awarded) values(e.id,cid,target_occurrence_date,uid,awarded);
  update public.couples set bond_xp=coalesce(bond_xp,0)+awarded where id=cid;
  insert into public.activity(couple_id,actor_id,type,payload) values(cid,uid,'shared_event_completed',jsonb_build_object('event_id',e.id,'title',e.title,'occurrence_date',target_occurrence_date,'xp',awarded));
  return jsonb_build_object('completed',true,'already_completed',false,'xp_awarded',awarded,'occurrence_date',target_occurrence_date);
end; $function$;

-- public.get_daily_state(target_question_id uuid)
CREATE OR REPLACE FUNCTION public.get_daily_state(target_question_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  cid uuid;
  mine text;
  partner_answer text;
  answered_count integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select couple_id into cid from public.profiles where id = uid;
  if cid is null then raise exception 'Profile not linked'; end if;

  select answer into mine
  from public.daily_answers
  where question_id = target_question_id and couple_id = cid and user_id = uid;

  select count(*) into answered_count
  from public.daily_answers
  where question_id = target_question_id and couple_id = cid;

  if answered_count >= 2 then
    select answer into partner_answer
    from public.daily_answers
    where question_id = target_question_id and couple_id = cid and user_id <> uid
    limit 1;
  end if;

  return jsonb_build_object(
    'my_answer', mine,
    'partner_has_answer', exists(
      select 1 from public.daily_answers
      where question_id = target_question_id and couple_id = cid and user_id <> uid
    ),
    'both_answered', answered_count >= 2,
    'partner_answer', partner_answer
  );
end;
$function$;

-- public.get_internal_monthiversary_cron_key()
CREATE OR REPLACE FUNCTION public.get_internal_monthiversary_cron_key()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
  select decrypted_secret from vault.decrypted_secrets where name='us_monthiversary_cron_key' limit 1
$function$;

-- public.get_internal_vapid_private_key()
CREATE OR REPLACE FUNCTION public.get_internal_vapid_private_key()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
declare
  secret_value text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not allowed';
  end if;
  select decrypted_secret into secret_value
  from vault.decrypted_secrets
  where name = 'us_web_push_vapid_private'
  limit 1;
  if secret_value is null then raise exception 'VAPID secret missing'; end if;
  return secret_value;
end;
$function$;

-- public.get_partner_knowledge_hub()
CREATE OR REPLACE FUNCTION public.get_partner_knowledge_hub()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end; $function$;
comment on function public.get_partner_knowledge_hub() is 'RETIRED (US 2.0 F1B): Gioca v1 partner knowledge, no client caller since M11B. EXECUTE revoked from public/anon/authenticated.';

-- public.get_quiz_state(target_set_id uuid)
CREATE OR REPLACE FUNCTION public.get_quiz_state(target_set_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end; $function$;
comment on function public.get_quiz_state(target_set_id uuid) is 'RETIRED (US 2.0 F1B): Gioca v1, no client caller since M11B. EXECUTE revoked from public/anon/authenticated.';

-- public.get_web_push_status()
CREATE OR REPLACE FUNCTION public.get_web_push_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  subscription_count integer := 0;
begin
  if uid is null then return jsonb_build_object('active',false,'count',0); end if;
  select count(*) into subscription_count from public.push_subscriptions where user_id = uid;
  return jsonb_build_object('active',subscription_count > 0,'count',subscription_count);
end;
$function$;
comment on function public.get_web_push_status() is 'RETIRED (US 2.0 F1B): no caller. EXECUTE revoked from public/anon/authenticated.';

-- public.get_weekly_game_sets()
CREATE OR REPLACE FUNCTION public.get_weekly_game_sets()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end; $function$;
comment on function public.get_weekly_game_sets() is 'RETIRED (US 2.0 F1B): Gioca v1, no client caller since M11B. EXECUTE revoked from public/anon/authenticated.';

-- public.get_weekly_quiz_sets()
CREATE OR REPLACE FUNCTION public.get_weekly_quiz_sets()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end; $function$;
comment on function public.get_weekly_quiz_sets() is 'RETIRED (US 2.0 F1B): Gioca v1, no client caller since M11B. EXECUTE revoked from public/anon/authenticated.';

-- public.register_push_token(push_token text, push_platform text)
CREATE OR REPLACE FUNCTION public.register_push_token(push_token text, push_platform text DEFAULT 'android'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  uid uuid := auth.uid();
  cid uuid;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;
  if push_token is null or length(trim(push_token)) < 16 then
    raise exception 'Invalid push token';
  end if;
  if push_platform not in ('android','ios') then
    raise exception 'Invalid push platform';
  end if;

  select couple_id into cid from public.profiles where id = uid;
  if cid is null then
    raise exception 'Profile not paired';
  end if;

  insert into public.device_push_tokens(user_id,couple_id,token,platform,last_seen_at)
  values(uid,cid,trim(push_token),push_platform,now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        couple_id = excluded.couple_id,
        platform = excluded.platform,
        last_seen_at = now();
end;
$function$;
comment on function public.register_push_token(push_token text, push_platform text) is 'RETIRED (US 2.0 F1B): native push token RPC, never wired. EXECUTE revoked from public/anon/authenticated.';

-- public.register_web_push_subscription(target_endpoint text, target_p256dh text, target_auth text, target_expiration_time bigint, target_user_agent text)
CREATE OR REPLACE FUNCTION public.register_web_push_subscription(target_endpoint text, target_p256dh text, target_auth text, target_expiration_time bigint DEFAULT NULL::bigint, target_user_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  cid uuid;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if coalesce(length(trim(target_endpoint)),0) < 20 then raise exception 'Invalid push endpoint'; end if;
  if coalesce(length(trim(target_p256dh)),0) < 20 then raise exception 'Invalid p256dh key'; end if;
  if coalesce(length(trim(target_auth)),0) < 8 then raise exception 'Invalid auth key'; end if;

  select couple_id into cid from public.profiles where id = uid;
  if cid is null then raise exception 'Profile not linked'; end if;

  insert into public.push_subscriptions(user_id,couple_id,endpoint,p256dh,auth_key,expiration_time,user_agent,updated_at)
  values(uid,cid,target_endpoint,target_p256dh,target_auth,target_expiration_time,left(target_user_agent,500),now())
  on conflict(endpoint) do update set
    user_id = excluded.user_id,
    couple_id = excluded.couple_id,
    p256dh = excluded.p256dh,
    auth_key = excluded.auth_key,
    expiration_time = excluded.expiration_time,
    user_agent = excluded.user_agent,
    updated_at = now();

  return jsonb_build_object('active',true);
end;
$function$;

-- public.remove_web_push_subscription(target_endpoint text)
CREATE OR REPLACE FUNCTION public.remove_web_push_subscription(target_endpoint text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  removed_count integer := 0;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  delete from public.push_subscriptions where user_id = uid and endpoint = target_endpoint;
  get diagnostics removed_count = row_count;
  return jsonb_build_object('removed',removed_count > 0);
end;
$function$;

-- public.save_quiz_answer(target_question_id uuid, target_answer_index smallint)
CREATE OR REPLACE FUNCTION public.save_quiz_answer(target_question_id uuid, target_answer_index smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
comment on function public.save_quiz_answer(target_question_id uuid, target_answer_index smallint) is 'RETIRED (US 2.0 F1B): Gioca v1, no client caller since M11B. EXECUTE revoked from public/anon/authenticated.';

-- from 70_grants.sql
revoke all on function private.current_couple_id() from public, anon, authenticated, service_role;
grant all on function private.current_couple_id() to authenticated;
revoke all on function private.us_touch_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.award_relationship_milestone(target_couple_id uuid, target_milestone_date date, target_months integer, target_kind text, target_xp integer) from public, anon, authenticated, service_role;
grant all on function public.award_relationship_milestone(target_couple_id uuid, target_milestone_date date, target_months integer, target_kind text, target_xp integer) to service_role;
revoke all on function public.calendar_reminder_offset_valid(p_entry_id uuid, p_offset_minutes integer) from public, anon, authenticated, service_role;
grant all on function public.calendar_reminder_offset_valid(p_entry_id uuid, p_offset_minutes integer) to authenticated;
grant all on function public.calendar_reminder_offset_valid(p_entry_id uuid, p_offset_minutes integer) to service_role;
revoke all on function public.complete_partner_knowledge_deck(target_deck smallint, target_guesses jsonb) from public, anon, authenticated, service_role;
grant all on function public.complete_partner_knowledge_deck(target_deck smallint, target_guesses jsonb) to service_role;
revoke all on function public.complete_shared_event(target_event_id uuid, target_occurrence_date date) from public, anon, authenticated, service_role;
grant all on function public.complete_shared_event(target_event_id uuid, target_occurrence_date date) to authenticated;
grant all on function public.complete_shared_event(target_event_id uuid, target_occurrence_date date) to service_role;
revoke all on function public.get_daily_state(target_question_id uuid) from public, anon, authenticated, service_role;
grant all on function public.get_daily_state(target_question_id uuid) to authenticated;
grant all on function public.get_daily_state(target_question_id uuid) to service_role;
revoke all on function public.get_internal_monthiversary_cron_key() from public, anon, authenticated, service_role;
grant all on function public.get_internal_monthiversary_cron_key() to service_role;
revoke all on function public.get_internal_vapid_private_key() from public, anon, authenticated, service_role;
grant all on function public.get_internal_vapid_private_key() to service_role;
revoke all on function public.get_partner_knowledge_hub() from public, anon, authenticated, service_role;
grant all on function public.get_partner_knowledge_hub() to service_role;
revoke all on function public.get_quiz_state(target_set_id uuid) from public, anon, authenticated, service_role;
grant all on function public.get_quiz_state(target_set_id uuid) to service_role;
revoke all on function public.get_web_push_status() from public, anon, authenticated, service_role;
grant all on function public.get_web_push_status() to service_role;
revoke all on function public.get_weekly_game_sets() from public, anon, authenticated, service_role;
grant all on function public.get_weekly_game_sets() to service_role;
revoke all on function public.get_weekly_quiz_sets() from public, anon, authenticated, service_role;
grant all on function public.get_weekly_quiz_sets() to service_role;
revoke all on function public.register_push_token(push_token text, push_platform text) from public, anon, authenticated, service_role;
grant all on function public.register_push_token(push_token text, push_platform text) to service_role;
revoke all on function public.register_web_push_subscription(target_endpoint text, target_p256dh text, target_auth text, target_expiration_time bigint, target_user_agent text) from public, anon, authenticated, service_role;
grant all on function public.register_web_push_subscription(target_endpoint text, target_p256dh text, target_auth text, target_expiration_time bigint, target_user_agent text) to authenticated;
grant all on function public.register_web_push_subscription(target_endpoint text, target_p256dh text, target_auth text, target_expiration_time bigint, target_user_agent text) to service_role;
revoke all on function public.remove_web_push_subscription(target_endpoint text) from public, anon, authenticated, service_role;
grant all on function public.remove_web_push_subscription(target_endpoint text) to authenticated;
grant all on function public.remove_web_push_subscription(target_endpoint text) to service_role;
revoke all on function public.save_quiz_answer(target_question_id uuid, target_answer_index smallint) from public, anon, authenticated, service_role;
grant all on function public.save_quiz_answer(target_question_id uuid, target_answer_index smallint) to service_role;
