-- Premi, fase 3a (founder, 25/11/2026: grill D16, D18–D19, D23 and the approved
-- tavola «Premi di Oggi»): the US symbol at the top of Oggi.
-- STAGING ONLY until the founder decides otherwise: never apply to production
-- without an explicit, separate yes.
--
--   Battito (level 2): the reward effect_pulse keeps its id and becomes two beats like a heart.
--   Due colori (level 8, new): your two colours turn inside the letters.
--   Costellazione (level 17): stays as it is, moved up the ladder.
--   Riflesso (effect_shimmer) leaves the catalog (active = false; nothing deleted).

update public.progression_reward_catalog
   set active = false, headline = false
 where id = 'effect_shimmer';

update public.progression_reward_catalog r
   set level_required = v.level_required, headline = v.headline, sort_order = v.sort_order,
       title = v.title, description = v.description, active = true, requires_plus = false
  from (values
    ('effect_pulse',          2, true,  21, 'Battito', 'Il simbolo US batte due volte come un cuore, con un alone nel tuo colore.'),
    ('effect_constellation', 17, true, 170, 'Costellazione', 'Tre stelline si accendono a turno attorno al simbolo US.')
  ) as v(id, level_required, headline, sort_order, title, description)
 where r.id = v.id;

insert into public.progression_reward_catalog
  (id, level_required, category, title, description, token, sort_order, active, announce, headline, requires_plus)
values
  ('effect_duo', 8, 'effect', 'Due colori', 'I vostri due colori girano piano dentro le lettere del simbolo US.', 'effect_duo', 81, true, true, false, false)
on conflict (id) do update set
  level_required = excluded.level_required, category = excluded.category, title = excluded.title,
  description = excluded.description, token = excluded.token, sort_order = excluded.sort_order,
  active = true, announce = excluded.announce, headline = excluded.headline, requires_plus = excluded.requires_plus;

-- What the new levels give each couple now, seen by both: no wave of announcements.
create temporary table premi_simbolo_before on commit drop as
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
 where not exists (select 1 from premi_simbolo_before b where b.couple_id = u.couple_id and b.reward_id = u.reward_id)
on conflict (couple_id, reward_id, profile_id) do nothing;
