-- Accoglienza V1 (25/10/2026). Spec: docs/missions/accoglienza-v1.md.
--
-- One question for the couple: "vi vedete spesso o vivete lontani?". The
-- answer is one column of public.couples, near or far, written by either
-- member like the name and the start date (column grant + the existing
-- couples_update_own policy). It chooses the weekly missions only when the
-- two locations are not shared: a shared location still decides.
-- No personal data: it describes the couple, not one person.
-- Re-applying this migration changes nothing.

alter table public.couples add column if not exists distance_mode text;
alter table public.couples drop constraint if exists couples_distance_mode_check;
alter table public.couples add constraint couples_distance_mode_check
  check (distance_mode is null or distance_mode in ('near', 'far'));
comment on column public.couples.distance_mode is 'Accoglienza V1: near (they see each other often) or far (they live apart), set by a member; null until asked. Used for the missions when locations are not shared.';
grant update (distance_mode) on table public.couples to authenticated;

-- The mission mode: the shared locations when both exist (as before), the
-- couple's own answer otherwise, every mission when neither is known.
create or replace function private.bond_mode_for_couple(target_couple_id uuid)
 returns text
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  lat1 double precision;
  lon1 double precision;
  lat2 double precision;
  lon2 double precision;
  hav double precision;
  km double precision;
  answer text;
begin
  select latitude, longitude
    into lat1, lon1
  from public.couple_locations
  where couple_id = target_couple_id
  order by user_id
  limit 1;

  select latitude, longitude
    into lat2, lon2
  from public.couple_locations
  where couple_id = target_couple_id
  order by user_id
  offset 1
  limit 1;

  if lat1 is null or lat2 is null then
    select c.distance_mode into answer from public.couples c where c.id = target_couple_id;
    return coalesce(answer, 'any');
  end if;

  hav :=
    power(sin(radians((lat2 - lat1) / 2.0)), 2)
    + cos(radians(lat1)) * cos(radians(lat2))
      * power(sin(radians((lon2 - lon1) / 2.0)), 2);

  km := 6371.0 * 2.0 * asin(sqrt(least(1.0, greatest(0.0, hav))));
  return case when km > 50.0 then 'far' else 'near' end;
end;
$function$;
revoke all on function private.bond_mode_for_couple(uuid) from public, anon, authenticated, service_role;
