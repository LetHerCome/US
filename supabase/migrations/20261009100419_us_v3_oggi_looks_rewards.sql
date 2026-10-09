-- US V3 — Sintonia rewards: Oggi themes and Oggi effects.
--
-- REVIEW CANDIDATE. Prepared in the repository only; it must not be applied to
-- production Supabase without its own separate review (see
-- docs/missions/us-ui-refinement-personalization-v3.md).
--
-- Product decision: frames and stickers are no longer rewards. Badges and rings
-- lost their only visible place when Noi V2 hid the couple header, so they are
-- retired with them. Desirable personalisation — Oggi themes and effects — is
-- what Sintonia unlocks now.
--
-- Safety contract:
-- * Nothing is deleted. couple_reward_unlocks, progression_reward_views,
--   bond_xp, progression_events and couple_progression_preferences keep every
--   row. Retired catalog rows only become inactive, which already excludes
--   them from get_progression_v1 (rewards, pending_unlocks, next_reward) and
--   from private.progression_sync_unlocks (no future unlock).
-- * Countdown styles stay entitled: save_countdown_oggi_v1 checks that
--   frame_aurora / ring_orbit / frame_chrome are unlocked AND active. Those
--   three rows keep id, token, level and active = true; only their category
--   and copy change to what they really grant now: a countdown style.
-- * Device-local cosmetics (localStorage) are a client concern: the client
--   already stops painting retired slots and keeps the stored values.
-- * Forward-only and idempotent: re-running converges to the same state.
-- * No RLS, grant, function or table shape changes.

do $guard$
begin
  if (select count(*) from public.progression_reward_catalog
       where id in ('frame_aurora', 'ring_orbit', 'frame_chrome')) <> 3 then
    raise exception 'us_v3_oggi_looks_rewards: countdown-entitling rewards missing; refusing to continue';
  end if;
end;
$guard$;

-- 1. Three new presentation categories in the same catalog.
alter table public.progression_reward_catalog
  drop constraint if exists progression_reward_catalog_category_check;
alter table public.progression_reward_catalog
  add constraint progression_reward_catalog_category_check
  check (category = any (array[
    'frame', 'theme', 'accent', 'effect', 'badge', 'sticker', 'ring',
    'oggi_theme', 'oggi_effect', 'countdown'
  ]::text[]));

-- 2. The rewards that entitle a countdown style say so (ids/levels unchanged).
update public.progression_reward_catalog set
  category = 'countdown',
  title = case id
    when 'frame_aurora' then 'Countdown Aurora'
    when 'ring_orbit' then 'Countdown Orbita'
    when 'frame_chrome' then 'Countdown Cromo'
  end,
  description = case id
    when 'frame_aurora' then 'Uno stile per il countdown di Oggi: la luce dentro le cifre.'
    when 'ring_orbit' then 'Uno stile per il countdown di Oggi: un giro di luce ogni minuto.'
    when 'frame_chrome' then 'Uno stile per il countdown di Oggi: il tempo diventa materia.'
  end,
  active = true
where id in ('frame_aurora', 'ring_orbit', 'frame_chrome');

-- 3. Retire the remaining frames, stickers, badges and rings.
update public.progression_reward_catalog
   set active = false
 where category in ('frame', 'sticker', 'badge', 'ring')
   and active;

-- 4. Oggi themes and effects that Sintonia unlocks. Free looks (US Original,
--    Romantic, Pastel Dream, Nessuno, Cuori delicati, Stelle luminose) need no
--    row. Ids are the contract with oggi-look.js; levels fill the steps the
--    retired rewards leave free.
insert into public.progression_reward_catalog
  (id, level_required, category, title, description, token, sort_order, active, announce)
values
  ('oggi_effect_petals',    2, 'oggi_effect', 'Petali fluttuanti', 'Petali rosa scendono piano sopra la vostra foto di Oggi.', 'oggi_effect_petals', 22, true, true),
  ('oggi_theme_cinematic',  4, 'oggi_theme',  'Cinematic',         'Oggi come un film: bande, grana e il vostro tempo come titoli di testa.', 'oggi_theme_cinematic', 42, true, true),
  ('oggi_effect_fireflies', 6, 'oggi_effect', 'Lucciole',          'Punti di luce calda vagano lenti sopra la vostra foto.', 'oggi_effect_fireflies', 62, true, true),
  ('oggi_theme_moonlight',  7, 'oggi_theme',  'Moonlight',         'Oggi di notte: blu profondo, stelle e un riflesso di luna.', 'oggi_theme_moonlight', 72, true, true),
  ('oggi_effect_bokeh',    10, 'oggi_effect', 'Bokeh romantico',   'Luci sfocate che respirano piano, come una sera in città.', 'oggi_effect_bokeh', 102, true, true),
  ('oggi_theme_seasonal',  12, 'oggi_theme',  'Autunno',           'Il primo tema delle stagioni: ambra, foglie e luce bassa di ottobre.', 'oggi_theme_seasonal', 122, true, true),
  ('oggi_effect_snow',     13, 'oggi_effect', 'Neve',              'Fiocchi leggeri sopra la vostra foto, mai una bufera.', 'oggi_effect_snow', 132, true, true)
on conflict (id) do update set
  level_required = excluded.level_required,
  category = excluded.category,
  title = excluded.title,
  description = excluded.description,
  token = excluded.token,
  sort_order = excluded.sort_order,
  active = true,
  announce = excluded.announce;
