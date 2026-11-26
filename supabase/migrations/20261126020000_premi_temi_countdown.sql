-- Temi e countdown di Oggi (founder, 26/11/2026: the approved tavola
-- «Temi e countdown di Oggi», https://claude.ai/artifact/Gh85EKBZ7bsKTJ72qNnZUY).
-- STAGING ONLY until the founder decides otherwise: never apply to production
-- without an explicit, separate yes.
--
-- Themes of Oggi: Originale and Pellicola are free in the app (no row);
-- Ora d'oro at 6 (new), Stagioni at 12 drawn again. Chiaro di luna leaves the
-- catalog (active = false: what a couple already unlocked stays in its
-- history, nothing is deleted; the app shows Originale instead).
-- Countdown styles: the ids stay (save_countdown_oggi_v1 validates them), the
-- art and the names change: frame_aurora = Post-it at 3, ring_orbit =
-- Biglietto at 9, frame_chrome = Filo rosso at 18.

update public.progression_reward_catalog
   set active = false, headline = false
 where id = 'oggi_theme_moonlight';

update public.progression_reward_catalog r
   set level_required = v.level_required, headline = v.headline, sort_order = v.sort_order,
       title = v.title, description = v.description, active = true, requires_plus = false
  from (values
    ('frame_aurora',          3, false,  31, 'Countdown Post-it', 'Uno stile per il countdown di Oggi: un post-it nel tuo colore attaccato con lo scotch, e sotto quello dell''altra persona.'),
    ('ring_orbit',            9, false,  91, 'Countdown Biglietto', 'Uno stile per il countdown di Oggi: un biglietto del treno piccolo, andata per due, col posto e il codice a barre.'),
    ('oggi_theme_seasonal',  12, true,  120, 'Tema delle stagioni', 'Oggi cambia con l''anno: i ciliegi in fiore, il sole e il mare, le castagne e le foglie, il vetro ghiacciato e la neve.'),
    ('frame_chrome',         18, false, 181, 'Countdown Filo rosso', 'Uno stile per il countdown di Oggi: voi due ai capi di un filo rosso che si accorcia man mano che il giorno si avvicina.')
  ) as v(id, level_required, headline, sort_order, title, description)
 where r.id = v.id;

insert into public.progression_reward_catalog
  (id, level_required, category, title, description, token, sort_order, active, announce, headline, requires_plus)
values
  ('oggi_theme_golden', 6, 'oggi_theme', 'Ora d''oro', 'La luce calda del tramonto su qualsiasi foto di Oggi, con un riflesso di sole che si muove piano.', 'oggi_theme_golden', 60, true, true, true, false)
on conflict (id) do update set
  level_required = excluded.level_required, category = excluded.category, title = excluded.title,
  description = excluded.description, token = excluded.token, sort_order = excluded.sort_order,
  active = true, announce = excluded.announce, headline = excluded.headline, requires_plus = excluded.requires_plus;

-- What the new levels give each couple now, seen by both: no wave of announcements.
create temporary table premi_temi_before on commit drop as
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
 where not exists (select 1 from premi_temi_before b where b.couple_id = u.couple_id and b.reward_id = u.reward_id)
on conflict (couple_id, reward_id, profile_id) do nothing;
