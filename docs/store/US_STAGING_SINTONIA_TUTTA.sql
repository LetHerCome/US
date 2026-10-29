-- US-STAGING ONLY (dugmhngrfkuieeletatb). NEVER run on production.
-- Founder, 29/10/2026: «in staging sbloccami anche tutta la sintonia, solo
-- per testare, non va portato in produzione».
-- For every couple on staging: Sintonia points up to the level after the
-- last reward (and the dragon, level 11), every reward and companion
-- unlocked, and marked as seen so the app does not announce them one by
-- one. Safe to run again (new couples get it, the others stay as they are).
-- Where: Supabase › project US-STAGING › SQL Editor.

-- 1. Points: enough for the level after the highest one anything needs.
with target as (
  select greatest(11, (select max(level_required) from public.progression_reward_catalog where active)) + 1 as level_no
), points as (
  select sum(200 + (k - 1) * 150)::integer as total
  from target, generate_series(1, (select level_no from target) - 1) as k
)
update public.couples c
set bond_xp = greatest(coalesce(c.bond_xp, 0), (select total from points));

-- 2. Every Sintonia reward: themes, Noi colours, Oggi looks and effects, countdowns.
insert into public.couple_reward_unlocks (couple_id, reward_id, unlocked_at)
select c.id, r.id, now()
from public.couples c cross join public.progression_reward_catalog r
where r.active
on conflict (couple_id, reward_id) do nothing;

-- 3. Every companion: Maudit, the owl, the goat, the dragon.
insert into public.couple_companion_unlocks (couple_id, companion_id, unlocked_at)
select c.id, x.companion_id, now()
from public.couples c cross join (values ('maudit'), ('owl'), ('goat'), ('dragon')) as x(companion_id)
on conflict (couple_id, companion_id) do nothing;

-- 4. Already seen by both: no wave of «Nuovo …» announcements.
insert into public.progression_reward_views (couple_id, reward_id, profile_id, seen_at)
select u.couple_id, u.reward_id, p.id, now()
from public.couple_reward_unlocks u
join public.profiles p on p.couple_id = u.couple_id
on conflict (couple_id, reward_id, profile_id) do nothing;

-- Check: per couple, the Sintonia points and how many rewards and companions are unlocked.
select c.name, c.bond_xp,
  (select count(*) from public.couple_reward_unlocks u where u.couple_id = c.id) as rewards,
  (select count(*) from public.couple_companion_unlocks k where k.couple_id = c.id) as companions
from public.couples c
order by c.name;
