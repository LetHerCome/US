-- Premi Sintonia V2, Fase 1 (founder, 29/10/2026).
-- docs/DECISIONS.md «Nuova scala dei premi Sintonia», docs/missions/sintonia-premi-v2.md.
--
-- 1. The catalog gets two flags: headline (one strong reward per level) and
--    requires_plus (a few curated extras on levels 2–12 that need the level
--    AND Plus of either partner; once taken they stay, D4).
-- 2. Today's 21 rewards move down to levels 2–12 as the small ones; the
--    headlines of Phase 1 are added (Ti penso animato 5, Tema delle stagioni
--    10, Il vostro cielo 20) with the first Plus extra (Aurora, 4).
--    Phase 2 rows (images) come later. Nothing is ever taken back.
-- 3. progression_sync_unlocks honours requires_plus; get_progression_v1 also
--    returns each reward's flags, the next headline with the points it
--    needs, and the couple's points of the last 14 days.
-- 4. Couples get what the new levels give them now, already marked as seen:
--    no wave of announcements.

alter table public.progression_reward_catalog add column if not exists headline boolean not null default false;
alter table public.progression_reward_catalog add column if not exists requires_plus boolean not null default false;
-- Two new kinds: the animated Ti penso and Il vostro cielo.
alter table public.progression_reward_catalog drop constraint if exists progression_reward_catalog_category_check;
alter table public.progression_reward_catalog add constraint progression_reward_catalog_category_check
  check (category = any (array[
    'frame', 'theme', 'accent', 'effect', 'badge', 'sticker', 'ring',
    'oggi_theme', 'oggi_effect', 'countdown', 'ti_penso', 'sky'
  ]));

update public.progression_reward_catalog r
   set level_required = v.level_required, headline = v.headline, sort_order = v.sort_order
  from (values
    ('oggi_effect_petals',     2, true,  20), ('effect_pulse',          2, false, 21),
    ('theme_rose',             3, false, 30), ('accent_cherry',         3, false, 31),
    ('oggi_theme_cinematic',   4, true,  40), ('frame_aurora',          4, false, 41), ('oggi_effect_fireflies', 4, false, 42),
    ('theme_midnight',         5, false, 51),
    ('accent_champagne',       6, false, 60), ('oggi_theme_moonlight',  6, false, 61),
    ('theme_film',             7, false, 70), ('effect_constellation',  7, false, 71),
    ('ring_orbit',             8, false, 80), ('oggi_effect_bokeh',     8, false, 81),
    ('theme_blue_hour',        9, false, 90), ('accent_ice',            9, false, 91),
    ('oggi_theme_seasonal',   10, true, 100), ('frame_chrome',         10, false, 101), ('effect_shimmer', 10, false, 102),
    ('oggi_effect_snow',      11, false, 110),
    ('theme_graphite',        12, false, 120)
  ) as v(id, level_required, headline, sort_order)
 where r.id = v.id;

update public.progression_reward_catalog
   set title = 'Tema delle stagioni',
       description = 'Oggi cambia con l''anno: fiori a primavera, luce d''estate, foglie d''autunno, neve d''inverno.'
 where id = 'oggi_theme_seasonal';

insert into public.progression_reward_catalog
  (id, level_required, category, title, description, token, sort_order, active, announce, headline, requires_plus)
values
  ('oggi_effect_aurora', 4, 'oggi_effect', 'Aurora', 'Una luce che danza sopra la vostra foto di Oggi, come un''aurora boreale.', 'oggi_effect_aurora', 43, true, true, false, true),
  ('ti_penso_hearts', 5, 'ti_penso', 'Ti penso animato', 'Quando mandi un Ti penso, all''altro arriva un''esplosione di cuori nei vostri colori.', 'ti_penso_hearts', 50, true, true, true, false),
  ('sky_ours', 20, 'oggi_theme', 'Il vostro cielo', 'Le stelle della sera in cui vi siete messi insieme, sopra la vostra città.', 'sky_ours', 200, true, true, true, false)
on conflict (id) do update set
  level_required = excluded.level_required, category = excluded.category, title = excluded.title,
  description = excluded.description, token = excluded.token, sort_order = excluded.sort_order,
  active = true, announce = excluded.announce, headline = excluded.headline, requires_plus = excluded.requires_plus;

CREATE OR REPLACE FUNCTION private.progression_sync_unlocks(target_couple uuid, supplied_xp integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  total integer;
  level_no integer;
begin
  if target_couple is null then return; end if;
  if supplied_xp is null then
    select coalesce(c.bond_xp, 0) into total from public.couples c where c.id = target_couple;
  else
    total := greatest(0, supplied_xp);
  end if;
  if total is null then return; end if;
  level_no := private.progression_level(total);
  insert into public.couple_reward_unlocks(couple_id, reward_id)
  select target_couple, reward.id
    from public.progression_reward_catalog reward
   where reward.active = true and reward.level_required <= level_no
     -- V2: a Plus extra needs Plus too; once inserted it stays (D4).
     and (not reward.requires_plus or private.couple_has_plus(target_couple))
  on conflict (couple_id, reward_id) do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_progression_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid := auth.uid();
  cid uuid;
  total integer;
  level_data jsonb;
  today_rome date := (now() at time zone 'Europe/Rome')::date;
  last_day date;
  rhythm integer := 0;
  rewards jsonb := '[]'::jsonb;
  pending jsonb := '[]'::jsonb;
  next_reward jsonb;
  next_headline jsonb;
  recent_xp integer := 0;
  prefs public.couple_progression_preferences%rowtype;
  slots jsonb;
begin
  if uid is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  select p.couple_id into cid from public.profiles p where p.id = uid;
  if cid is null then
    raise exception using errcode = '42501', message = 'couple membership required';
  end if;

  select coalesce(c.bond_xp, 0) into total from public.couples c where c.id = cid;
  if total is null then
    raise exception using errcode = 'P0002', message = 'couple not found';
  end if;
  perform private.progression_sync_unlocks(cid, total);
  level_data := private.progression_level_info(total);

  select pref.* into prefs from public.couple_progression_preferences pref where pref.couple_id = cid;
  slots := jsonb_build_object(
    'frame', prefs.frame_reward_id,
    'theme', prefs.theme_reward_id,
    'accent', prefs.accent_reward_id,
    'effect', prefs.effect_reward_id,
    'badge', prefs.badge_reward_id,
    'sticker', prefs.sticker_reward_id,
    'ring', prefs.ring_reward_id
  );

  select max(e.action_day) into last_day
    from public.progression_events e
   where e.couple_id = cid and e.counts_rhythm = true and e.action_day <= today_rome;

  if last_day is not null and last_day >= today_rome - 1 then
    with days as (
      select distinct e.action_day
        from public.progression_events e
       where e.couple_id = cid and e.counts_rhythm = true and e.action_day <= last_day
    ), ranked as (
      select d.action_day, row_number() over(order by d.action_day desc) as rn from days d
    )
    select count(*)::integer into rhythm
      from ranked r
     where r.action_day = last_day - ((r.rn - 1)::integer);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', reward.id,
      'level_required', reward.level_required,
      'category', reward.category,
      'title', reward.title,
      'description', reward.description,
      'token', reward.token,
      'unlocked', unlock.reward_id is not null,
      'requires_plus', reward.requires_plus,
      'headline', reward.headline,
      'equipped', unlock.reward_id is not null and (slots ->> reward.category) = reward.id
    ) order by reward.sort_order), '[]'::jsonb)
    into rewards
    from public.progression_reward_catalog reward
    left join public.couple_reward_unlocks unlock
      on unlock.couple_id = cid and unlock.reward_id = reward.id
   where reward.active = true;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', reward.id,
      'level_required', reward.level_required,
      'category', reward.category,
      'title', reward.title,
      'description', reward.description,
      'token', reward.token
    ) order by reward.sort_order), '[]'::jsonb)
    into pending
    from public.progression_reward_catalog reward
    join public.couple_reward_unlocks unlock
      on unlock.couple_id = cid and unlock.reward_id = reward.id
    left join public.progression_reward_views seen
      on seen.couple_id = cid and seen.reward_id = reward.id and seen.profile_id = uid
   where reward.active = true and reward.announce = true and seen.reward_id is null;

  select jsonb_build_object(
      'id', reward.id,
      'level_required', reward.level_required,
      'category', reward.category,
      'title', reward.title,
      'description', reward.description,
      'token', reward.token
    )
    into next_reward
    from public.progression_reward_catalog reward
   where reward.active = true
     and reward.level_required > private.progression_level(total)
   order by reward.level_required, reward.sort_order
   limit 1;

  -- V2: the next headline reward (Noi shows it with a day estimate) and the
  -- couple's points of the last 14 days, the pace of that estimate.
  select jsonb_build_object(
      'id', reward.id,
      'level_required', reward.level_required,
      'category', reward.category,
      'title', reward.title,
      'description', reward.description,
      'token', reward.token,
      'requires_plus', reward.requires_plus,
      'xp_needed', greatest(0, (select coalesce(sum(200 + (k - 1) * 150), 0) from generate_series(1, reward.level_required - 1) k)::integer - total)
    )
    into next_headline
    from public.progression_reward_catalog reward
   where reward.active = true and reward.headline = true
     and reward.level_required > private.progression_level(total)
   order by reward.level_required, reward.sort_order
   limit 1;
  select coalesce(sum(e.xp_awarded), 0)::integer into recent_xp
    from public.progression_events e
   where e.couple_id = cid and e.action_day > today_rome - 14 and e.action_day <= today_rome;

  return jsonb_build_object(
    'total_xp', total,
    'level', (level_data->>'level')::integer,
    'current_xp', (level_data->>'current_xp')::integer,
    'needed_xp', (level_data->>'needed_xp')::integer,
    'remaining_xp', (level_data->>'remaining_xp')::integer,
    'progress', (level_data->>'progress')::numeric,
    'rhythm_days', coalesce(rhythm, 0),
    'rhythm_today', exists(
      select 1 from public.progression_events e
       where e.couple_id = cid and e.counts_rhythm = true and e.action_day = today_rome
    ),
    'today', today_rome,
    'rewards', rewards,
    'pending_unlocks', pending,
    'next_reward', next_reward,
    'next_headline', next_headline,
    'xp_last_14_days', recent_xp,
    'preferences', jsonb_build_object(
      'frame_reward_id', prefs.frame_reward_id,
      'theme_reward_id', prefs.theme_reward_id,
      'accent_reward_id', prefs.accent_reward_id,
      'effect_reward_id', prefs.effect_reward_id,
      'badge_reward_id', prefs.badge_reward_id,
      'sticker_reward_id', prefs.sticker_reward_id,
      'ring_reward_id', prefs.ring_reward_id
    )
  );
end;
$function$;

-- 4. What the new levels give each couple now, seen by both: no announcements.
create temporary table sintonia_v2_before on commit drop as
  select couple_id, reward_id from public.couple_reward_unlocks;
do $$
declare c record;
begin
  for c in select id, coalesce(bond_xp, 0) xp from public.couples loop
    perform private.progression_sync_unlocks(c.id, c.xp);
  end loop;
end $$;
insert into public.progression_reward_views (couple_id, reward_id, profile_id, seen_at)
select u.couple_id, u.reward_id, p.id, now()
  from public.couple_reward_unlocks u
  join public.profiles p on p.couple_id = u.couple_id
 where not exists (select 1 from sintonia_v2_before b where b.couple_id = u.couple_id and b.reward_id = u.reward_id)
on conflict (couple_id, reward_id, profile_id) do nothing;

-- 5. Il vostro cielo: the couple's city (an id of sky.js CITIES) and hour
--    (minutes after midnight in Rome; null is the usual 22:00), set by either
--    partner once the couple has the reward. The stars are computed in the
--    app from «Insieme dal», the city and the hour; nothing else is stored.
alter table public.couples add column if not exists sky_city text;
alter table public.couples drop constraint if exists couples_sky_city_check;
alter table public.couples add constraint couples_sky_city_check check (sky_city is null or sky_city ~ '^[a-z_]{2,40}$');
alter table public.couples add column if not exists sky_minutes smallint;
alter table public.couples drop constraint if exists couples_sky_minutes_check;
alter table public.couples add constraint couples_sky_minutes_check check (sky_minutes is null or sky_minutes between 0 and 1439);

-- The first version (staging only, 29/10) took the city alone.
drop function if exists public.set_sky_city(text);

create or replace function public.set_sky(p_city text, p_minutes integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid;
begin
  select p.couple_id into cid from public.profiles p where p.id = auth.uid();
  if cid is null then raise exception 'not a couple member'; end if;
  if p_city is null or p_city !~ '^[a-z_]{2,40}$' then raise exception 'invalid city'; end if;
  if p_minutes is not null and (p_minutes < 0 or p_minutes > 1439) then raise exception 'invalid hour'; end if;
  if not exists (select 1 from public.couple_reward_unlocks u where u.couple_id = cid and u.reward_id = 'sky_ours') then
    raise exception 'sky locked';
  end if;
  update public.couples set sky_city = p_city, sky_minutes = p_minutes where id = cid;
  return jsonb_build_object('city', p_city, 'minutes', p_minutes);
end;
$$;
revoke all on function public.set_sky(text, integer) from public, anon, authenticated, service_role;
grant execute on function public.set_sky(text, integer) to authenticated;
