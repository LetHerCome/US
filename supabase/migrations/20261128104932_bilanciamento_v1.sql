-- Il grande bilanciamento v1 (founder, 28/11/2026: analysis, simulation and
-- the approved tavola https://claude.ai/artifact/SzTShSWnhTgxafLeU75vdw).
-- STAGING ONLY until the founder decides otherwise: never apply to production
-- without an explicit, separate yes. The app is in beta: what a couple already
-- unlocked is not protected by this pass (nothing is deleted either).
--
-- 1. Points per source: la domanda di oggi 15 (was 10); partite a turni 15 the
--    first of the Rome day, 8 the second and the third, 0 after (US Plus means
--    more play, not more points); Play Us 25 the first of the day, 0 after
--    (was 30), and its memory no longer gives the +10 of a photo; Ti penso 3
--    per person and day (was 2); Il vostro mese +20 when the couple first
--    opens the pack of a month (new source 'mese', key = the pack). Photos,
--    calendar events and milestones do not change.
-- 2. The level curve is a table (one reward per level): levels 2..26 start at
--    150, 300, 475, 675, 875, 1100, 1350, 1625, 1975, 2375, 2800, 3250, 3750,
--    4275, 4825, 5425, 6050, 6700, 7400, 8125, 8875, 9675, 12075, 15475, 20075
--    points; after 26, +5000 a level. It lives once in
--    private.progression_level_start; the app keeps the same table
--    (app.js bondLevelStart, us-widget-state).
-- 3. One ladder, a reward per level, the wardrobe inside it (by level now,
--    not by points): 2 Occhiali, 3 Battito, 4 Cappello, 5 Countdown Post-it,
--    6 Soffioni, 7 Fiocco, 8 Ti penso Cuori, 9 Sciarpina, 10 Ora d’oro,
--    11 Neve, 12 Occhiali da sole, 13 Due colori, 14 Gala, 15 Countdown
--    Biglietto, 16 Foglie, 17 Cuffie, 18 Stagioni, 19 Stelle cadenti,
--    20 Coroncina, 21 Ti penso Lettera, 22 Lanterne, 23 Costellazione,
--    24 Countdown Filo rosso, 25 Corona, 26 Ricordi in volo. The moments of the
--    wardrobe (macchinetta, cento, festa) stay as they are.
-- 4. The app icons Neon, Notte and Oro are US Plus only, out of the ladder
--    (level 1 + requires_plus).
-- 5. What a couple gets at once from the new curve is marked as seen by both:
--    no wave of announcements. What someone wears and is no longer unlocked
--    comes off. Re-applying changes nothing.

-- ---------------------------------------------------------------- 2. the curve
create or replace function private.progression_level_start(target_level integer)
 returns integer
 language sql
 immutable
 set search_path to ''
as $function$
  select case
    when coalesce(target_level, 1) <= 1 then 0
    when target_level <= 26 then ('{0,150,300,475,675,875,1100,1350,1625,1975,2375,2800,3250,3750,4275,4825,5425,6050,6700,7400,8125,8875,9675,12075,15475,20075}'::integer[])[target_level]
    else 20075 + (least(target_level, 1000) - 26) * 5000
  end
$function$;
revoke all on function private.progression_level_start(integer) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.progression_level(total_xp integer)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  total integer := greatest(0, coalesce(total_xp, 0));
  level_no integer := 1;
begin
  -- After the ladder (26): one level every 5000 points.
  if total >= private.progression_level_start(26) then
    return least(999, 26 + (total - private.progression_level_start(26)) / 5000);
  end if;
  while total >= private.progression_level_start(level_no + 1) loop
    level_no := level_no + 1;
  end loop;
  return level_no;
end;
$function$;

CREATE OR REPLACE FUNCTION private.progression_level_info(total_xp integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  total integer := greatest(0, coalesce(total_xp, 0));
  level_no integer := private.progression_level(total);
  floor_xp integer := private.progression_level_start(level_no);
  needed integer := private.progression_level_start(level_no + 1) - private.progression_level_start(level_no);
  current_xp integer := total - floor_xp;
begin
  return jsonb_build_object(
    'total_xp', total,
    'level', level_no,
    'current_xp', current_xp,
    'needed_xp', needed,
    'remaining_xp', greatest(0, needed - current_xp),
    'progress', case when needed > 0 then (current_xp::numeric / needed::numeric) else 0 end
  );
end;
$function$;

-- ---------------------------------------------------------------- 1. the sources
alter table public.progression_events drop constraint if exists progression_events_source_kind_check;
alter table public.progression_events add constraint progression_events_source_kind_check
  check (source_kind = any (array['quest'::text, 'event'::text, 'milestone'::text, 'daily'::text, 'game'::text, 'think'::text, 'moment'::text, 'challenge'::text, 'play_us'::text, 'mese'::text]));

-- Same function as 20261128101816_play_us_punti, with 'mese'.
create or replace function private.progression_award(target_couple uuid, target_actor uuid, target_source_kind text, target_source_key text, target_xp integer, target_action_at timestamp with time zone default now(), target_counts_rhythm boolean default true, add_to_bond boolean default true)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  inserted_id uuid;
  current_xp integer;
  action_day date := (coalesce(target_action_at, now()) at time zone 'Europe/Rome')::date;
begin
  if target_couple is null or not exists (select 1 from public.couples c where c.id = target_couple) then
    raise exception using errcode = '22023', message = 'progression_couple_required';
  end if;
  if target_source_kind not in ('quest','event','milestone','daily','game','think','moment','challenge','play_us','mese') then
    raise exception using errcode = '22023', message = 'progression_source_invalid';
  end if;
  if target_source_key is null or btrim(target_source_key) = '' or char_length(target_source_key) > 180 then
    raise exception using errcode = '22023', message = 'progression_source_key_invalid';
  end if;
  if coalesce(target_xp, 0) < 0 then
    raise exception using errcode = '22023', message = 'progression_xp_invalid';
  end if;
  if target_actor is not null and not exists (
    select 1 from public.profiles p where p.id = target_actor and p.couple_id = target_couple
  ) then
    raise exception using errcode = '42501', message = 'progression_actor_outside_couple';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('us:progression:' || target_couple::text, 0));

  insert into public.progression_events(
    couple_id, actor_id, source_kind, source_key, xp_awarded, counts_rhythm, action_day, created_at
  )
  values (
    target_couple, target_actor, target_source_kind, btrim(target_source_key),
    greatest(0, coalesce(target_xp, 0)), coalesce(target_counts_rhythm, true),
    action_day, coalesce(target_action_at, now())
  )
  on conflict (couple_id, source_kind, source_key) do nothing
  returning id into inserted_id;

  if inserted_id is not null and add_to_bond and coalesce(target_xp, 0) > 0 then
    update public.couples
       set bond_xp = coalesce(bond_xp, 0) + target_xp
     where id = target_couple
    returning bond_xp into current_xp;
  else
    select coalesce(c.bond_xp, 0) into current_xp from public.couples c where c.id = target_couple;
  end if;

  perform private.progression_sync_unlocks(target_couple, current_xp);

  return jsonb_build_object(
    'recorded', inserted_id is not null,
    'xp_added', case when inserted_id is not null and add_to_bond then greatest(0, coalesce(target_xp, 0)) else 0 end,
    'total_xp', coalesce(current_xp, 0),
    'level', private.progression_level(coalesce(current_xp, 0)),
    'action_day', action_day
  );
end;
$function$;
revoke all on function private.progression_award(uuid, uuid, text, text, integer, timestamp with time zone, boolean, boolean) from public, anon, authenticated, service_role;

-- La domanda di oggi: 15 when both answered (was 10).
CREATE OR REPLACE FUNCTION private.progression_daily_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  answered integer;
begin
  select count(distinct a.user_id)::integer into answered
    from public.daily_answers a
   where a.couple_id = new.couple_id and a.question_id = new.question_id;
  if answered >= 2 then
    perform private.progression_award(
      new.couple_id, new.user_id, 'daily', new.question_id::text, 15,
      coalesce(new.updated_at, new.created_at, now()), true, true
    );
  end if;
  return new;
end;
$function$;

-- Partite a turni: the first finished round of the Rome day 15, the second and
-- the third 8, any other 0 (still recorded for the Ritmo). Counted on the
-- rounds already awarded that day, under the progression lock of the couple.
CREATE OR REPLACE FUNCTION private.progression_game_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  done_day date;
  before_today integer;
begin
  if old.completed_at is null and new.completed_at is not null then
    perform pg_advisory_xact_lock(hashtextextended('us:progression:' || new.couple_id::text, 0));
    done_day := (new.completed_at at time zone 'Europe/Rome')::date;
    select count(*)::integer into before_today
      from public.progression_events e
     where e.couple_id = new.couple_id and e.source_kind = 'game'
       and e.action_day = done_day and e.source_key <> new.id::text;
    perform private.progression_award(
      new.couple_id, null, 'game', new.id::text,
      case when before_today = 0 then 15 when before_today <= 2 then 8 else 0 end,
      new.completed_at, true, true
    );
  end if;
  return new;
end;
$function$;

-- Ti penso: 3 per person and day (was 2).
CREATE OR REPLACE FUNCTION private.progression_think_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  day_rome date;
begin
  if new.kind = 'think' then
    day_rome := (new.created_at at time zone 'Europe/Rome')::date;
    perform private.progression_award(
      new.couple_id, new.sender_id, 'think', new.sender_id::text || ':' || day_rome::text,
      3, new.created_at, true, true
    );
  end if;
  return new;
end;
$function$;

-- A memory: 10, once per person and day; the memory Play Us writes at its end
-- is not a photo more (the game already gave its points).
CREATE OR REPLACE FUNCTION private.progression_moment_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  day_rome date;
begin
  if exists (select 1 from public.play_us_sessions ps where ps.couple_id = new.couple_id and ps.moment_id = new.id) then
    return new;
  end if;
  day_rome := (new.created_at at time zone 'Europe/Rome')::date;
  perform private.progression_award(
    new.couple_id, new.created_by, 'moment', new.created_by::text || ':' || day_rome::text,
    10, new.created_at, true, true
  );
  return new;
end;
$function$;

-- Play Us: 25 for the first game finished that day, 0 for any other (US Plus
-- may raise private.play_us_daily_limit: more play, not more points). The
-- session names its memory before the memory is written, so the moment
-- trigger above knows it. Otherwise the same as 20261128090123_play_us_v1.
create or replace function private.play_us_finish(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.play_us_sessions%rowtype;
  intesa integer := 0;
  scores jsonb := '{}'::jsonb;
  guessed jsonb := '{}'::jsonb;
  winner uuid := null;
  top integer := -1;
  ties integer := 0;
  member record;
  edits text[];
  mid uuid;
  months text[] := array['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
  caption text;
  xp integer := 25;
begin
  select * into s from public.play_us_sessions where id = p_session for update;
  if s.id is null or s.result ? 'finished_at' then return; end if;

  -- Same answer to the same quick question.
  select count(*) into intesa from (
    select a.slot from public.play_us_moves a
      join public.play_us_moves b on b.session_id = a.session_id and b.step = 1 and b.kind = 'answer' and b.slot = a.slot and b.user_id <> a.user_id
     where a.session_id = s.id and a.step = 1 and a.kind = 'answer' and a.user_id = s.invited_by
       and a.payload->'i' = b.payload->'i') same;

  for member in select p.id from public.profiles p where p.couple_id = s.couple_id loop
    scores := scores || pg_catalog.jsonb_build_object(member.id::text, coalesce((select (m.payload->>'score')::integer from public.play_us_moves m
      where m.session_id = s.id and m.user_id = member.id and m.step = 6 and m.kind = 'score' order by m.created_at desc limit 1), 0));
    guessed := guessed || pg_catalog.jsonb_build_object(member.id::text, (select count(*) from public.play_us_moves g
      join public.play_us_moves t on t.session_id = g.session_id and t.step = 4 and t.kind = 'guess' and t.slot = g.slot and t.user_id <> g.user_id
      where g.session_id = s.id and g.user_id = member.id and g.step = 4 and g.kind = 'guess' and g.payload->'guess' = t.payload->'self'));
  end loop;
  for member in select key, value::integer as v from pg_catalog.jsonb_each_text(scores) loop
    if member.v > top then top := member.v; winner := member.key::uuid; ties := 1;
    elsif member.v = top then ties := ties + 1; end if;
  end loop;
  if ties > 1 or top <= 0 then winner := null; end if;

  -- The memory: the retouched photos (the inviter's work first).
  select pg_catalog.array_agg(m.payload->>'path' order by (m.user_id = s.invited_by) desc, m.created_at) into edits
    from public.play_us_moves m where m.session_id = s.id and m.step = 3 and m.kind = 'edit' and m.payload ? 'path';
  if edits is not null and pg_catalog.array_length(edits, 1) > 0 then
    mid := gen_random_uuid();
    caption := 'Play Us · ' || pg_catalog.date_part('day', s.day)::integer || ' ' || months[pg_catalog.date_part('month', s.day)::integer];
    update public.play_us_sessions set moment_id = mid where id = s.id;
    insert into public.moments (id, couple_id, created_by, storage_path, caption, moment_date, created_at)
    values (mid, s.couple_id, s.invited_by, edits[1], caption, s.day, pg_catalog.now());
    if pg_catalog.array_length(edits, 1) > 1 then
      insert into public.moment_photos (id, moment_id, couple_id, created_by, storage_path, caption, position, created_at)
      values (gen_random_uuid(), mid, s.couple_id, s.invited_by, edits[2], null, 1, pg_catalog.now());
    end if;
  end if;

  -- +25 to the couple's level for the first game finished that day, once per game.
  if exists (select 1 from public.play_us_sessions o
              where o.couple_id = s.couple_id and o.day = s.day and o.id <> s.id and o.result ? 'finished_at') then
    xp := 0;
  end if;
  begin
    perform private.progression_award(s.couple_id, s.invited_by, 'play_us', s.id::text, xp);
  exception when others then
    raise warning 'play_us award skipped: %', sqlerrm;
  end;

  update public.play_us_sessions
     set moment_id = mid,
         result = pg_catalog.jsonb_build_object('intesa', intesa, 'scores', scores, 'guessed', guessed, 'winner', winner, 'xp', xp, 'finished_at', pg_catalog.now()),
         updated_at = pg_catalog.now()
   where id = s.id;
end;
$$;
revoke all on function private.play_us_finish(uuid) from public, anon, authenticated;

-- Il vostro mese: +20 the first time the couple opens the pack of a month
-- (either of the two; the key is the pack). Otherwise the same as
-- 20261127202326_il_vostro_mese.
create or replace function public.apri_pacchetto_v1(p_pack uuid) returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare
  me uuid := auth.uid();
  cid uuid := private.current_couple_id();
  pack_kind text;
begin
  if me is null or cid is null or p_pack is null then return null; end if;
  select x.kind into pack_kind from public.us_mese_pacchi x where x.id = p_pack and x.couple_id = cid;
  if pack_kind is null then return null; end if;
  insert into public.us_mese_aperti (pack_id, user_id) values (p_pack, me) on conflict do nothing;
  if pack_kind = 'mese' then
    perform private.progression_award(cid, me, 'mese', p_pack::text, 20);
  end if;
  return pg_catalog.jsonb_build_object('opened', true,
    'partner_opened', exists (select 1 from public.us_mese_aperti o join public.profiles p on p.id = o.user_id and p.couple_id = cid where o.pack_id = p_pack and o.user_id <> me));
end;
$fn$;
revoke all on function public.apri_pacchetto_v1(uuid) from public, anon;
grant execute on function public.apri_pacchetto_v1(uuid) to authenticated;

-- ---------------------------------------------------------------- 3–4. the ladder
-- Points still needed for the next headline: from the same table.
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
      'xp_needed', greatest(0, private.progression_level_start(reward.level_required) - total)
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

-- The rewards of the catalog on the ladder (ids, titles and texts unchanged).
update public.progression_reward_catalog r
   set level_required = v.level_required, sort_order = v.level_required * 10, active = true, requires_plus = false
  from (values
    ('effect_pulse',            3), ('frame_aurora',          5), ('oggi_effect_dandelions',  6),
    ('ti_penso_hearts',         8), ('oggi_theme_golden',    10), ('oggi_effect_snow',       11),
    ('effect_duo',             13), ('ring_orbit',           15), ('oggi_effect_leaves',     16),
    ('oggi_theme_seasonal',    18), ('oggi_effect_shooting', 19), ('ti_penso_letter',        21),
    ('oggi_effect_lanterns',   22), ('effect_constellation', 23), ('frame_chrome',           24),
    ('oggi_effect_memories',   26)
  ) as v(id, level_required)
 where r.id = v.id;

-- The app icons: US Plus only, out of the ladder.
update public.progression_reward_catalog
   set level_required = 1, requires_plus = true, headline = false
 where id in ('app_icon_neon', 'app_icon_night', 'app_icon_gold');

-- The wardrobe on the same ladder: an accessory comes with its level.
create or replace function private.character_unlocks(p_couple uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select private.progression_level(coalesce(bond_xp, 0)) as level_no, created_at from public.couples where id = p_couple
  ), bylevel(item, need) as (
    values ('occhiali', 2), ('cappello', 4), ('fiocco', 7), ('sciarpina', 9), ('sole', 12),
           ('gala', 14), ('cuffie', 17), ('coroncina', 20), ('corona', 25)
  )
  select coalesce(array_agg(item order by item), '{}'::text[]) from (
    select b.item from bylevel b, c where c.level_no >= b.need
    union all
    select 'macchinetta' where exists (select 1 from public.moments m where m.couple_id = p_couple)
    union all
    select 'cento' from c where c.created_at <= now() - interval '100 days'
    union all
    select 'festa' from c where c.created_at <= now() - interval '365 days'
  ) u;
$$;
revoke all on function private.character_unlocks(uuid) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------- 5. no wave of announcements
-- What the new curve gives each couple now, seen by both.
create temporary table bilanciamento_before on commit drop as
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
 where not exists (select 1 from bilanciamento_before b where b.couple_id = u.couple_id and b.reward_id = u.reward_id)
on conflict (couple_id, reward_id, profile_id) do nothing;

-- What someone already wears and is no longer unlocked comes off: otherwise
-- set_my_character_look would refuse every change of the other place.
update public.profiles p
   set character_head = case when p.character_head = any(u.items) then p.character_head end,
       character_face = case when p.character_face = any(u.items) then p.character_face end
  from (
    select pr.id, private.character_unlocks(pr.couple_id) as items
      from public.profiles pr
     where pr.couple_id is not null
       and (pr.character_head is not null or pr.character_face is not null)
  ) u
 where u.id = p.id
   and ((p.character_head is not null and not (p.character_head = any(u.items)))
     or (p.character_face is not null and not (p.character_face = any(u.items))));
