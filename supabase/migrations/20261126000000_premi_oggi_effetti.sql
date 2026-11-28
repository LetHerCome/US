-- Premi di Oggi, fase 1 (founder, 25/11/2026: grill D1–D25 and the approved
-- tavola «Premi di Oggi», https://claude.ai/artifact/M8dY8C3Rvu4Mwvb6Rnw362).
-- STAGING ONLY until the founder decides otherwise: never apply to production
-- without an explicit, separate yes.
--
-- The effects of Oggi grow in three steps with the level:
--   Base (free in the app, no row): Cuori, Petali.
--   Natura: Soffioni 4, Neve 7, Foglie 10.
--   Vostri: Stelle cadenti 13, Lanterne 16, Ricordi in volo 20 (the top).
-- Themes: Chiaro di luna 6, Stagioni 12. Leaving the catalog (active = false;
-- what a couple already unlocked stays in its history, nothing is deleted):
-- Petali as a reward (it is free now), Lucciole, Luci sfocate, Aurora, Cinema,
-- Il vostro cielo. The columns couples.sky_city/sky_minutes stay unused.
-- Only Oggi's looks change here; the other rewards follow in their own phases.

update public.progression_reward_catalog
   set active = false, headline = false
 where id in ('oggi_effect_petals', 'oggi_effect_fireflies', 'oggi_effect_bokeh', 'oggi_effect_aurora', 'oggi_theme_cinematic', 'sky_ours');

update public.progression_reward_catalog r
   set level_required = v.level_required, headline = v.headline, sort_order = v.sort_order,
       title = v.title, description = v.description, active = true, requires_plus = false
  from (values
    ('oggi_theme_moonlight',  6, true,  60, 'Chiaro di luna', 'Notte blu, stelle e un riflesso di luna sopra la vostra foto.'),
    ('oggi_effect_snow',      7, true,  70, 'Neve', 'Fiocchi disegnati su tre profondità sopra la vostra foto. In Foto a fuoco un tocco è un soffio sul vetro.'),
    ('oggi_theme_seasonal',  12, true, 120, 'Tema delle stagioni', 'Oggi cambia con l''anno: fiori a primavera, luce d''estate, foglie d''autunno, neve d''inverno.')
  ) as v(id, level_required, headline, sort_order, title, description)
 where r.id = v.id;

insert into public.progression_reward_catalog
  (id, level_required, category, title, description, token, sort_order, active, announce, headline, requires_plus)
values
  ('oggi_effect_dandelions', 4, 'oggi_effect', 'Soffioni', 'Semi di tarassaco nei vostri due colori salgono piano sopra la vostra foto. In Foto a fuoco li soffi via col dito.', 'oggi_effect_dandelions', 40, true, true, true, false),
  ('oggi_effect_leaves', 10, 'oggi_effect', 'Foglie', 'Foglie d''acero e d''autunno ondeggiano sopra la vostra foto. In Foto a fuoco le fai saltare col dito.', 'oggi_effect_leaves', 100, true, true, true, false),
  ('oggi_effect_shooting', 13, 'oggi_effect', 'Stelle cadenti', 'Un cielo che brilla piano e ogni tanto una scia nei vostri colori. In Foto a fuoco le lanci tu.', 'oggi_effect_shooting', 130, true, true, true, false),
  ('oggi_effect_lanterns', 16, 'oggi_effect', 'Lanterne', 'Lanterne di carta salgono, ognuna con la luce di uno di voi due. In Foto a fuoco ne liberi una e fai vento.', 'oggi_effect_lanterns', 160, true, true, true, false),
  ('oggi_effect_memories', 20, 'oggi_effect', 'Ricordi in volo', 'Le vostre foto, piccole polaroid col nastro di chi le ha aggiunte, galleggiano su Oggi. In Foto a fuoco una si apre al tocco.', 'oggi_effect_memories', 200, true, true, true, false)
on conflict (id) do update set
  level_required = excluded.level_required, category = excluded.category, title = excluded.title,
  description = excluded.description, token = excluded.token, sort_order = excluded.sort_order,
  active = true, announce = excluded.announce, headline = excluded.headline, requires_plus = excluded.requires_plus;

-- What the new levels give each couple now, seen by both: no wave of announcements.
create temporary table premi_oggi_before on commit drop as
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
 where not exists (select 1 from premi_oggi_before b where b.couple_id = u.couple_id and b.reward_id = u.reward_id)
on conflict (couple_id, reward_id, profile_id) do nothing;
