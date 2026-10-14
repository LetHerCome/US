-- US 1.0 — Location A: approximate location only, distance computed here.
-- Founder decision 14/10/2026 (product audit, decision 2).
--
-- Google Play counts a location as approximate only when it identifies an area
-- of at least 3 km2. Every stored reading is snapped to the centre of a grid
-- cell of about 4.9 km2 (0.02 degrees of latitude, and the matching number of
-- degrees of longitude for that latitude band). The app snaps with the same
-- grid before sending (app.js `usLocationCell`), and the trigger below snaps
-- again, so even an old client that still sends precise coordinates is only
-- ever stored at cell precision.
--
-- The partner never reads coordinates: SELECT is limited to the caller's own
-- row, and the distance comes from `public.couple_distance()`, rounded to whole
-- kilometres, or only "near" under 3 km. `public.stop_sharing_location()`
-- deletes the caller's reading.
--
-- Existing readings are snapped in place (precision reduced, rows kept).

create or replace function private.location_cell(lat double precision, lon double precision)
returns table (cell_latitude double precision, cell_longitude double precision)
language plpgsql
immutable
set search_path = ''
as $$
declare
  lat_step constant double precision := 0.02;
  lat_index integer;
  centre_lat double precision;
  lon_cells integer;
  lon_step double precision;
  lon_index integer;
begin
  if lat is null or lon is null or lat < -90 or lat > 90 or lon < -180 or lon > 180 then
    raise exception using errcode = '22023', message = 'invalid coordinates';
  end if;
  lat_index := least(floor((lat + 90) / lat_step)::integer, 8999);
  centre_lat := -90 + (lat_index + 0.5) * lat_step;
  lon_cells := greatest(1, floor(360 * cos(radians(centre_lat)) / lat_step)::integer);
  lon_step := 360.0 / lon_cells;
  lon_index := least(floor((lon + 180) / lon_step)::integer, lon_cells - 1);
  cell_latitude := round(centre_lat::numeric, 6)::double precision;
  cell_longitude := round((-180 + (lon_index + 0.5) * lon_step)::numeric, 6)::double precision;
  return next;
end;
$$;

revoke all on function private.location_cell(double precision, double precision) from public, anon, authenticated;

create or replace function private.couple_locations_coarsen()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cell record;
begin
  select * into cell from private.location_cell(new.latitude, new.longitude);
  new.latitude := cell.cell_latitude;
  new.longitude := cell.cell_longitude;
  -- Accuracy would say more than the cell does.
  new.accuracy_m := null;
  new.updated_at := least(coalesce(new.updated_at, now()), now());
  return new;
end;
$$;

revoke all on function private.couple_locations_coarsen() from public, anon, authenticated;

drop trigger if exists couple_locations_coarsen on public.couple_locations;
create trigger couple_locations_coarsen
  before insert or update on public.couple_locations
  for each row execute function private.couple_locations_coarsen();

-- Snap the readings stored before this migration.
update public.couple_locations set latitude = latitude;

-- Only your own reading is readable; the partner gets a distance.
drop policy if exists couple_locations_select_same_couple on public.couple_locations;
drop policy if exists couple_locations_select_self on public.couple_locations;
create policy couple_locations_select_self on public.couple_locations as permissive for select to authenticated
  using ((user_id = ( select auth.uid() as uid)));

drop policy if exists couple_locations_delete_self on public.couple_locations;
create policy couple_locations_delete_self on public.couple_locations as permissive for delete to authenticated
  using ((user_id = ( select auth.uid() as uid)));

create or replace function public.couple_distance()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cid uuid := private.current_couple_id();
  mine record;
  partner record;
  hav double precision;
  km double precision;
begin
  if uid is null or cid is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  select l.latitude, l.longitude, l.updated_at
    into mine
  from public.couple_locations l
  where l.user_id = uid
    and l.couple_id = cid;

  select l.latitude, l.longitude, l.updated_at
    into partner
  from public.couple_locations l
  join public.profiles p on p.id = l.user_id and p.couple_id = cid
  where l.couple_id = cid
    and l.user_id <> uid
  order by l.updated_at desc
  limit 1;

  if mine.updated_at is null or partner.updated_at is null then
    return jsonb_build_object(
      'sharing', mine.updated_at is not null,
      'my_updated_at', mine.updated_at,
      'partner_sharing', partner.updated_at is not null,
      'partner_updated_at', partner.updated_at,
      'near', null,
      'distance_km', null
    );
  end if;

  hav := power(sin(radians(partner.latitude - mine.latitude) / 2), 2)
    + cos(radians(mine.latitude)) * cos(radians(partner.latitude))
    * power(sin(radians(partner.longitude - mine.longitude) / 2), 2);
  km := 6371 * 2 * atan2(sqrt(hav), sqrt(greatest(0, 1 - hav)));

  return jsonb_build_object(
    'sharing', true,
    'my_updated_at', mine.updated_at,
    'partner_sharing', true,
    'partner_updated_at', partner.updated_at,
    'near', km < 3,
    'distance_km', case when km < 3 then null else round(km)::integer end
  );
end;
$$;

revoke all on function public.couple_distance() from public;
revoke all on function public.couple_distance() from anon;
grant execute on function public.couple_distance() to authenticated;

create or replace function public.stop_sharing_location()
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  removed integer := 0;
begin
  if uid is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  delete from public.couple_locations where user_id = uid;
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

revoke all on function public.stop_sharing_location() from public;
revoke all on function public.stop_sharing_location() from anon;
grant execute on function public.stop_sharing_location() to authenticated;
