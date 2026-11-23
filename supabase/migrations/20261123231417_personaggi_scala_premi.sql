-- Personaggi: the wardrobe on the empty levels of the Sintonia (founder,
-- 24/11/2026, redesign definitivo, «proposta A»). STAGING ONLY until the
-- founder decides otherwise: never apply to production without an explicit,
-- separate yes. It needs 20261120232852_personaggi_guardaroba first.
--
-- After Atmosfere, Colore di Noi and the companions left, levels 8, 11, 14 and
-- 19 had no reward. The first five accessories keep their points (occhiali 150,
-- cappello 400, fiocco 700, sciarpina 1000, sole 1350); the last four move to
-- the start of those levels (bondLevelInfo: level n starts at
-- 200·(n−1) + 150·(n−1)(n−2)/2 points): gala 4550 (level 8), cuffie 8750
-- (level 11), coroncina 14300 (level 14), corona 26550 (level 19). The moments
-- (macchinetta, cento, festa) do not change.

create or replace function private.character_unlocks(p_couple uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select coalesce(bond_xp, 0) as xp, created_at from public.couples where id = p_couple
  ), byxp(item, need) as (
    values ('occhiali', 150), ('cappello', 400), ('fiocco', 700), ('sciarpina', 1000), ('sole', 1350),
           ('gala', 4550), ('cuffie', 8750), ('coroncina', 14300), ('corona', 26550)
  )
  select coalesce(array_agg(item order by item), '{}'::text[]) from (
    select b.item from byxp b, c where c.xp >= b.need
    union all
    select 'macchinetta' where exists (select 1 from public.moments m where m.couple_id = p_couple)
    union all
    select 'cento' from c where c.created_at <= now() - interval '100 days'
    union all
    select 'festa' from c where c.created_at <= now() - interval '365 days'
  ) u;
$$;
revoke all on function private.character_unlocks(uuid) from public, anon, authenticated, service_role;

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
