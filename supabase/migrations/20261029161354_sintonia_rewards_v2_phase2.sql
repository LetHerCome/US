-- Premi Sintonia V2, Fase 2 (founder, 29/10/2026; images approved the same day).
-- docs/DECISIONS.md «Nuova scala dei premi Sintonia», docs/missions/sintonia-premi-v2.md,
-- docs/missions/sintonia-premi-v2-immagini.md.
--
-- 1. Two new kinds: accessories for the companions and the app icon.
-- 2. The rewards that needed pictures: accessories (9, 12, 19, Gala Plus 10),
--    the Ti penso letter (15), the app icons Notte (13), Oro (18), Neon (Plus 7).
--    Plus extras need the level AND Plus (Phase 1 logic) and are never a headline.
-- 3. Couples already past these levels get them now, marked as seen.
-- Can run again (staging re-apply). Nothing is ever taken back.

alter table public.progression_reward_catalog drop constraint if exists progression_reward_catalog_category_check;
alter table public.progression_reward_catalog add constraint progression_reward_catalog_category_check
  check (category = any (array[
    'frame', 'theme', 'accent', 'effect', 'badge', 'sticker', 'ring',
    'oggi_theme', 'oggi_effect', 'countdown', 'ti_penso', 'sky',
    'pet_accessory', 'app_icon'
  ]));

insert into public.progression_reward_catalog
  (id, level_required, category, title, description, token, sort_order, active, announce, headline, requires_plus)
values
  ('app_icon_neon', 7, 'app_icon', 'Icona «Neon»', 'L''icona di US come un''insegna al neon, rosa e lilla.', 'app_icon_neon', 72, true, true, false, true),
  ('pet_accessory_scarf', 9, 'pet_accessory', 'Sciarpina', 'Una sciarpa di lana per il vostro Compagno.', 'pet_accessory_scarf', 89, true, true, true, false),
  ('pet_accessory_gala', 10, 'pet_accessory', 'Gala', 'Papillon o collana di perle, per le sere speciali del vostro Compagno.', 'pet_accessory_gala', 103, true, true, false, true),
  ('pet_accessory_flowers', 12, 'pet_accessory', 'Coroncina', 'Fiori o alloro sulla testa del vostro Compagno.', 'pet_accessory_flowers', 119, true, true, true, false),
  ('app_icon_night', 13, 'app_icon', 'Icona «Notte»', 'L''icona di US in argento lunare, sul blu della notte.', 'app_icon_night', 130, true, true, true, false),
  ('ti_penso_letter', 15, 'ti_penso', 'Ti penso «lettera»', 'Quando ricevi un Ti penso, si apre una letterina con il sigillo a cuore.', 'ti_penso_letter', 150, true, true, true, false),
  ('app_icon_gold', 18, 'app_icon', 'Icona d''oro', 'L''icona di US in oro, su un fondo prugna.', 'app_icon_gold', 180, true, true, true, false),
  ('pet_accessory_crown', 19, 'pet_accessory', 'Corona', 'Una corona da re o da regina per il vostro Compagno.', 'pet_accessory_crown', 190, true, true, true, false)
on conflict (id) do update set
  level_required = excluded.level_required, category = excluded.category, title = excluded.title,
  description = excluded.description, token = excluded.token, sort_order = excluded.sort_order,
  active = true, announce = excluded.announce, headline = excluded.headline, requires_plus = excluded.requires_plus;

-- 3. What these levels give each couple now, seen by both: no announcements.
create temporary table sintonia_v2_phase2_before on commit drop as
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
 where not exists (select 1 from sintonia_v2_phase2_before b where b.couple_id = u.couple_id and b.reward_id = u.reward_id)
on conflict (couple_id, reward_id, profile_id) do nothing;
