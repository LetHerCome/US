-- Avvisi di US vi ricorda e personaggi sempre aggiornati (founder, 27/11/2026).
--
-- 1. «US vi ricorda» and the bacheca reach the phone. The characters' lines
--    were seen only by opening US. Now the strongest dated ones become a push:
--    a birthday in 7 days and on the day, the anniversary in 7 days, «un anno
--    fa», and a memory US hung on the bacheca today. At most one a day per
--    person (the Edge worker claims us-ricorda:<user>:<day> in push_event_log),
--    only at two daytime hours in Rome (10 and 18: never at night), never a
--    line already seen in the app, never a muted kind («Non dirmelo più»,
--    «Le voci dei personaggi» = '*'), and only with the new switch
--    notification_preferences.ricorda on (default on).
--    The lines stay the ones get_my_battuta_v1 plans (rules, no AI): this file
--    only plans the day for every couple of two (the same functions the app
--    calls lazily) and lists what is due. The worker writes the words.
-- 2. The other person's character live. A change of colour, shape or outfit
--    moves public.couple_sync (kind 'looks'), so the open app of the partner
--    hears it over the existing Realtime channel within seconds and reads the
--    looks again (UsCoupleContext.refreshLooks). The widgets of a closed app
--    get a silent data push from send-web-push (type partner_look), keyed on
--    this revision.
-- Staging first, with the founder's go-ahead. Re-applying changes nothing.

-- ---------------------------------------------------------------- 1. the switch
alter table public.notification_preferences add column if not exists ricorda boolean not null default true;

-- Same two functions as 20261103205050_lavagna_v1, plus the ricorda key;
-- create or replace keeps their grants.
CREATE OR REPLACE FUNCTION public.get_notification_preferences()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  prefs public.notification_preferences%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into prefs from public.notification_preferences where user_id = uid;
  if not found then
    insert into public.notification_preferences(user_id) values(uid)
    on conflict(user_id) do nothing;
    select * into prefs from public.notification_preferences where user_id = uid;
  end if;
  return jsonb_build_object(
    'think', prefs.think,
    'today', prefs.today,
    'bond', prefs.bond,
    'relationship', prefs.relationship,
    'left_for_you', prefs.left_for_you,
    'games', prefs.games,
    'lavagna', prefs.lavagna,
    'ricorda', prefs.ricorda
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_notification_preference(target_key text, target_value boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  uid uuid := auth.uid();
  prefs public.notification_preferences%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if target_key not in ('think', 'today', 'bond', 'relationship', 'left_for_you', 'games', 'lavagna', 'ricorda') then
    raise exception 'Invalid preference';
  end if;
  insert into public.notification_preferences(user_id) values(uid)
  on conflict(user_id) do nothing;
  if target_key = 'think' then
    update public.notification_preferences set think = target_value, updated_at = now() where user_id = uid;
  elsif target_key = 'today' then
    update public.notification_preferences set today = target_value, updated_at = now() where user_id = uid;
  elsif target_key = 'bond' then
    update public.notification_preferences set bond = target_value, updated_at = now() where user_id = uid;
  elsif target_key = 'relationship' then
    update public.notification_preferences set relationship = target_value, updated_at = now() where user_id = uid;
  elsif target_key = 'left_for_you' then
    update public.notification_preferences set left_for_you = target_value, updated_at = now() where user_id = uid;
  elsif target_key = 'lavagna' then
    update public.notification_preferences set lavagna = target_value, updated_at = now() where user_id = uid;
  elsif target_key = 'ricorda' then
    update public.notification_preferences set ricorda = target_value, updated_at = now() where user_id = uid;
  else
    update public.notification_preferences set games = target_value, updated_at = now() where user_id = uid;
  end if;
  select * into prefs from public.notification_preferences where user_id = uid;
  return jsonb_build_object(
    'think', prefs.think,
    'today', prefs.today,
    'bond', prefs.bond,
    'relationship', prefs.relationship,
    'left_for_you', prefs.left_for_you,
    'games', prefs.games,
    'lavagna', prefs.lavagna,
    'ricorda', prefs.ricorda
  );
end;
$function$;

-- ---------------------------------------------------------------- 1. what is due
-- For the Edge worker us-ricorda-push-worker only (service_role). p_slot:
-- 'mattina' (10 in Rome: birthdays, the anniversary in a week) or 'sera'
-- (18: «un anno fa», then the bacheca for whoever got nothing that day).
-- p_day is for the tests; the worker leaves it null (today in Rome).
-- One row per person at most: {user_id, couple_id, day, type, vars}; vars
-- carry only what the sentence needs (a name, years, a place or a title),
-- never a storage path.
create or replace function public.us_ricorda_push_due_v1(p_slot text, p_day date default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  today date := coalesce(p_day, (pg_catalog.now() at time zone 'Europe/Rome')::date);
  c record;
  due jsonb;
begin
  if p_slot is null or p_slot not in ('mattina', 'sera') then return '[]'::jsonb; end if;
  -- Plan the day for every couple of two, as the first open of the app would.
  for c in
    select p.couple_id from public.profiles p where p.couple_id is not null
     group by p.couple_id having pg_catalog.count(*) = 2
  loop
    perform private.us_ricorda_plan_couple(c.couple_id, today);
    if p_slot = 'sera' then perform private.us_bacheca_plan(c.couple_id, today); end if;
  end loop;

  with people as (
    select p.id as user_id, p.couple_id
      from public.profiles p
     where p.couple_id is not null
       and (select pg_catalog.count(*) from public.profiles o where o.couple_id = p.couple_id) = 2
       and coalesce((select np.ricorda from public.notification_preferences np where np.user_id = p.id), true)
       and not exists (select 1 from public.us_battute_mute mu where mu.user_id = p.id and mu.kind = '*')
  ),
  lines as (
    select pe.user_id, pe.couple_id, 1 as prio, b.ref_key,
           case
             when b.kind = 'compleanno' and b.vars->>'days' = '7' then 'ricorda_birthday_week'
             when b.kind = 'compleanno' and b.vars->>'days' = '0' then 'ricorda_birthday'
             when b.kind = 'anniversario' then 'ricorda_anniversary_week'
             else 'ricorda_year_ago'
           end as type,
           case
             when b.kind = 'compleanno' then pg_catalog.jsonb_build_object('name', b.vars->>'name')
             when b.kind = 'anniversario' then pg_catalog.jsonb_build_object('years', b.vars->'years')
             else pg_catalog.jsonb_build_object('source', b.vars->>'source', 'place', b.vars->>'place', 'title', b.vars->>'title')
           end as vars
      from people pe
      join public.us_battute b on b.recipient_id = pe.user_id and b.day = today
     where b.seen_at is null and b.slot = p_slot
       and not exists (select 1 from public.us_battute_mute mu where mu.user_id = pe.user_id and mu.kind = b.kind)
       and ((b.kind = 'compleanno' and b.vars->>'days' in ('7', '0'))
            or (b.kind = 'anniversario' and b.vars->>'days' = '7')
            or b.kind = 'un_anno_fa')
  ),
  board as (
    -- A memory US hung today (not the first fill, not the anniversary stamp:
    -- the anniversary has its own push, «Ricorrenze»).
    select pe.user_id, pe.couple_id, 2 as prio, x.ref_key, 'ricorda_bacheca'::text as type,
           pg_catalog.jsonb_build_object('reason', x.reason, 'place', x.vars->>'place', 'what', x.vars->>'what', 'count', x.vars->'count') as vars
      from people pe
      join public.us_bacheca_pins x on x.couple_id = pe.couple_id
     where p_slot = 'sera' and x.pinned_by is null
       and x.created_at >= (today::timestamp at time zone 'Europe/Rome')
       and x.created_at < ((today + 1)::timestamp at time zone 'Europe/Rome')
       and x.reason in ('un_anno_fa', 'traguardo', 'settimana', 'tenuta')
       and not (x.reason = 'traguardo' and x.vars->>'what' = 'anni')
       and not exists (select 1 from public.us_bacheca_planned pl where pl.couple_id = pe.couple_id and pl.day = today and pl.first_fill)
       and not exists (select 1 from public.us_battute_mute mu where mu.user_id = pe.user_id and mu.kind = 'bacheca')
  ),
  best as (
    select distinct on (a.user_id) a.user_id, a.couple_id, a.type, a.vars
      from (select * from lines union all select * from board) a
     order by a.user_id, a.prio, a.ref_key
  )
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'user_id', best.user_id, 'couple_id', best.couple_id, 'day', today, 'type', best.type, 'vars', best.vars)
           order by best.user_id)
    into due
    from best;
  return coalesce(due, '[]'::jsonb);
end;
$fn$;
revoke all on function public.us_ricorda_push_due_v1(text, date) from public, anon, authenticated, service_role;
grant execute on function public.us_ricorda_push_due_v1(text, date) to service_role;

-- The worker's key (created by 20261127093507_ricorda_push_cron only where
-- the crons run; US-STAGING keeps them off).
create or replace function public.get_internal_ricorda_push_cron_key()
 returns text
 language sql
 security definer
 set search_path to ''
as $function$
  select decrypted_secret from vault.decrypted_secrets where name = 'us_ricorda_push_cron_key' limit 1
$function$;
revoke all on function public.get_internal_ricorda_push_cron_key() from public, anon, authenticated, service_role;
grant execute on function public.get_internal_ricorda_push_cron_key() to service_role;

-- ---------------------------------------------------------------- 2. the looks
alter table public.couple_sync drop constraint if exists couple_sync_kind;
alter table public.couple_sync add constraint couple_sync_kind
  check (kind in ('moments', 'notes', 'events', 'stories', 'calendar', 'looks'));

-- One revision more for the couple when someone's colour, shape or outfit
-- really changed. couple_sync holds no look: the app reads profiles again.
create or replace function private.couple_sync_bump_looks() returns trigger
language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.couple_id is null or not exists (select 1 from public.couples k where k.id = new.couple_id) then
    return null;
  end if;
  insert into public.couple_sync as s (couple_id, kind, revision, changed_at)
  values (new.couple_id, 'looks', 1, pg_catalog.now())
  on conflict (couple_id, kind) do update set
    revision = s.revision + 1,
    changed_at = excluded.changed_at;
  return null;
end;
$fn$;
revoke all on function private.couple_sync_bump_looks() from public, anon, authenticated;

drop trigger if exists profiles_looks_couple_sync on public.profiles;
create trigger profiles_looks_couple_sync
  after update of person_color, character_shape, character_head, character_face on public.profiles
  for each row
  when (old.person_color is distinct from new.person_color
        or old.character_shape is distinct from new.character_shape
        or old.character_head is distinct from new.character_head
        or old.character_face is distinct from new.character_face)
  execute function private.couple_sync_bump_looks();

comment on column public.notification_preferences.ricorda is 'US vi ricorda (27/11/2026): the push of the strongest dated lines and of the bacheca, at most one a day.';
