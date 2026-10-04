-- US Progression — Rewards V2: a 27-piece collection across seven cosmetic slots.
--
-- Forward-only and additive:
--   * existing reward ids, tokens and levels (frame_glow, theme_rose,
--     frame_aurora, theme_midnight, effect_pulse) are kept, so every existing
--     couple_reward_unlocks / progression_reward_views / preferences row stays
--     valid. Only their editorial copy is refreshed;
--   * the XP curve (private.progression_level*) and the award ledger are not
--     touched;
--   * new rewards unlock lazily through the existing
--     private.progression_sync_unlocks (next read or next XP change), with
--     unlocked_at = the moment they become available. History is never
--     back-dated;
--   * each category is one independent slot. Equipping toggles only that slot.
--
-- Tables stay server-only (RLS forced, no client grants). The client keeps
-- talking exclusively to get_progression_v1 / equip_progression_reward /
-- ack_progression_unlock.

alter table public.progression_reward_catalog
  drop constraint if exists progression_reward_catalog_category_check;
alter table public.progression_reward_catalog
  add constraint progression_reward_catalog_category_check
  check (category in ('frame','theme','accent','effect','badge','sticker','ring'));

alter table public.couple_progression_preferences
  add column if not exists accent_reward_id text references public.progression_reward_catalog(id) on delete set null,
  add column if not exists badge_reward_id text references public.progression_reward_catalog(id) on delete set null,
  add column if not exists sticker_reward_id text references public.progression_reward_catalog(id) on delete set null,
  add column if not exists ring_reward_id text references public.progression_reward_catalog(id) on delete set null;

insert into public.progression_reward_catalog
  (id, level_required, category, title, description, token, sort_order, active, announce)
values
  ('badge_day_one',        1, 'badge',   'Day One',          'Una spilla smaltata per il vostro inizio, accanto ai vostri ritratti in Noi.', 'badge_day_one',        10, true, true),
  ('frame_glow',           2, 'frame',   'Controluce',       'Un filo di luce calda attorno alla foto di Oggi, come al tramonto.', 'frame_glow',           20, true, true),
  ('sticker_ours',         2, 'sticker', 'ours',             'Un adesivo scritto a mano sulla foto di Oggi e sull''ultimo ricordo.', 'sticker_ours',         21, true, true),
  ('theme_rose',           3, 'theme',   'Rosé',             'Tutta US si scalda di rosa: sfondo, luce della barra, profondità.', 'theme_rose',           30, true, true),
  ('accent_cherry',        3, 'accent',  'Ciliegia',         'I controlli diventano rosso ciliegia: selezioni, progressi, navigazione.', 'accent_cherry',        31, true, true),
  ('frame_aurora',         4, 'frame',   'Aurora',           'Un bordo iridescente, sottile, attorno alla foto di Oggi.', 'frame_aurora',         40, true, true),
  ('ring_halo',            4, 'ring',    'Alone',            'Un doppio anello sottile attorno ai vostri ritratti.', 'ring_halo',            41, true, true),
  ('theme_midnight',       5, 'theme',   'Mezzanotte',       'Blu notte e viola profondo: US più scura e silenziosa.', 'theme_midnight',       50, true, true),
  ('sticker_ticket',       5, 'sticker', 'Ingresso per due', 'Un biglietto strappato, «ammessi 2», su Oggi e sull''ultimo ricordo.', 'sticker_ticket',       51, true, true),
  ('effect_pulse',         6, 'effect',  'Respiro',          'Il simbolo US respira piano, ogni pochi secondi.', 'effect_pulse',         60, true, true),
  ('badge_still_here',     6, 'badge',   'Still Here',       'Una toppa ricamata a punto filza. Per chi resta.', 'badge_still_here',     61, true, true),
  ('frame_polaroid',       7, 'frame',   'Istantanea',       'Il bordo avorio di una foto istantanea attorno a Oggi.', 'frame_polaroid',       70, true, true),
  ('accent_champagne',     7, 'accent',  'Champagne',        'Controlli e progressi in oro chiaro, come una festa a due.', 'accent_champagne',     71, true, true),
  ('theme_film',           8, 'theme',   'Pellicola',        'Ambra e seppia: US come una foto sviluppata a mano.', 'theme_film',           80, true, true),
  ('sticker_stamp',        8, 'sticker', 'Francobollo',      'Un francobollo dentellato con il simbolo US, timbrato per voi.', 'sticker_stamp',        81, true, true),
  ('effect_constellation', 9, 'effect',  'Costellazione',    'Tre stelle minuscole si accendono attorno al simbolo US.', 'effect_constellation', 90, true, true),
  ('ring_orbit',           9, 'ring',    'Orbita',           'Un punto di luce gira lento attorno a ciascuno di voi.', 'ring_orbit',           91, true, true),
  ('frame_negative',      10, 'frame',   'Negativo',         'Pellicola 35 mm con perforazioni e numeri di fotogramma.', 'frame_negative',      100, true, true),
  ('badge_chaos',         10, 'badge',   'Chaos Together',   'Una stampa risograph fuori registro, imperfetta come voi.', 'badge_chaos',         101, true, true),
  ('theme_blue_hour',     11, 'theme',   'Ora blu',          'Il quarto d''ora dopo il tramonto: blu freddo, luce morbida.', 'theme_blue_hour',     110, true, true),
  ('accent_ice',          11, 'accent',  'Ghiaccio',         'Controlli in azzurro ghiaccio, nitidi e calmi.', 'accent_ice',          111, true, true),
  ('frame_chrome',        12, 'frame',   'Cromo',            'Un profilo di metallo lucido, sottilissimo, che cattura la luce.', 'frame_chrome',        120, true, true),
  ('badge_monday',        12, 'badge',   'Us vs Monday',     'Un timbro a inchiostro: voi due contro l''inizio della settimana.', 'badge_monday',        121, true, true),
  ('effect_shimmer',      13, 'effect',  'Riflesso',         'Ogni tanto un riflesso attraversa il simbolo US, come sul vetro.', 'effect_shimmer',      130, true, true),
  ('frame_scrapbook',     13, 'frame',   'Album di carta',   'Due strisce di nastro di carta tengono ferma la foto di Oggi.', 'frame_scrapbook',     131, true, true),
  ('theme_graphite',      14, 'theme',   'Grafite',          'Nero, carta e argento: US essenziale, da rivista.', 'theme_graphite',      140, true, true),
  ('ring_gold',           15, 'ring',    'Filo d''oro',      'Un filo d''oro attorno ai vostri ritratti, e tra di voi.', 'ring_gold',           150, true, true)
on conflict (id) do update set
  level_required = excluded.level_required,
  category = excluded.category,
  title = excluded.title,
  description = excluded.description,
  token = excluded.token,
  sort_order = excluded.sort_order,
  active = excluded.active,
  announce = excluded.announce;

create or replace function public.get_progression_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- Toggle one slot: equipping the reward already in its slot clears the slot;
-- every other slot is left exactly as it was.
create or replace function public.equip_progression_reward(target_reward_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cid uuid;
  reward public.progression_reward_catalog%rowtype;
  prefs public.couple_progression_preferences%rowtype;
  current_id text;
  next_id text;
begin
  if uid is null then raise exception using errcode = '42501', message = 'authentication required'; end if;
  select p.couple_id into cid from public.profiles p where p.id = uid;
  if cid is null then raise exception using errcode = '42501', message = 'couple membership required'; end if;

  select r.* into reward
    from public.progression_reward_catalog r
   where r.id = target_reward_id and r.active = true;
  if reward.id is null then raise exception using errcode = '22023', message = 'reward unavailable'; end if;

  if not exists (
    select 1
      from public.couple_reward_unlocks u
     where u.couple_id = cid and u.reward_id = reward.id
  ) then
    raise exception using errcode = '42501', message = 'reward not unlocked';
  end if;

  insert into public.couple_progression_preferences(couple_id, updated_by, updated_at)
  values (cid, uid, now())
  on conflict (couple_id) do nothing;

  select pref.* into prefs
    from public.couple_progression_preferences pref
   where pref.couple_id = cid
   for update;

  current_id := case reward.category
    when 'frame' then prefs.frame_reward_id
    when 'theme' then prefs.theme_reward_id
    when 'accent' then prefs.accent_reward_id
    when 'effect' then prefs.effect_reward_id
    when 'badge' then prefs.badge_reward_id
    when 'sticker' then prefs.sticker_reward_id
    when 'ring' then prefs.ring_reward_id
  end;
  next_id := case when current_id = reward.id then null else reward.id end;

  update public.couple_progression_preferences pref set
    frame_reward_id   = case when reward.category = 'frame'   then next_id else pref.frame_reward_id end,
    theme_reward_id   = case when reward.category = 'theme'   then next_id else pref.theme_reward_id end,
    accent_reward_id  = case when reward.category = 'accent'  then next_id else pref.accent_reward_id end,
    effect_reward_id  = case when reward.category = 'effect'  then next_id else pref.effect_reward_id end,
    badge_reward_id   = case when reward.category = 'badge'   then next_id else pref.badge_reward_id end,
    sticker_reward_id = case when reward.category = 'sticker' then next_id else pref.sticker_reward_id end,
    ring_reward_id    = case when reward.category = 'ring'    then next_id else pref.ring_reward_id end,
    updated_by = uid,
    updated_at = now()
  where pref.couple_id = cid;

  return public.get_progression_v1();
end;
$$;

revoke all on function public.get_progression_v1() from public, anon;
revoke all on function public.equip_progression_reward(text) from public, anon;
grant execute on function public.get_progression_v1() to authenticated;
grant execute on function public.equip_progression_reward(text) to authenticated;
