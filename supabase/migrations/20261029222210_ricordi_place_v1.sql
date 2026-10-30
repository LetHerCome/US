-- Mappa dei Ricordi (founder, 29/10/2026, D1–D7): one place per Ricordo, from
-- the photo (EXIF GPS, with consent) or searched by hand. The column type keeps
-- three decimals, about 100 m, whoever writes. The place is a column of the
-- Ricordo, so moments_select_same_couple already shows it only to the couple.
-- The author can save it with the photo (moments_insert_own); either member
-- places, moves or clears it later through set_moment_place (D6: old Ricordi
-- are placed by hand, also those the other person uploaded).

alter table public.moments
  add column if not exists place_lat numeric(5,3),
  add column if not exists place_lon numeric(6,3),
  add column if not exists place_label text,
  add column if not exists place_source text;

alter table public.moments drop constraint if exists moments_place_check;
alter table public.moments add constraint moments_place_check check (
  (place_lat is null and place_lon is null and place_label is null and place_source is null)
  or (
    place_lat is not null and place_lon is not null and place_label is not null and place_source is not null
    and place_lat between -90 and 90
    and place_lon between -180 and 180
    and char_length(btrim(place_label)) between 1 and 120
    and place_source in ('photo', 'search')
  )
);

create or replace function public.set_moment_place(
  p_moment uuid,
  p_lat double precision,
  p_lon double precision,
  p_label text,
  p_source text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := private.current_couple_id();
  label text := nullif(btrim(coalesce(p_label, '')), '');
  saved public.moments;
begin
  if auth.uid() is null or cid is null then raise exception 'not a couple member'; end if;
  if p_lat is null and p_lon is null then
    label := null;
  elsif p_lat is null or p_lon is null
    or p_lat not between -90 and 90 or p_lon not between -180 and 180
    or label is null or char_length(label) > 120
    or p_source is null or p_source not in ('photo', 'search') then
    raise exception 'invalid place';
  end if;
  update public.moments m
     set place_lat = p_lat,
         place_lon = p_lon,
         place_label = label,
         place_source = case when label is null then null else p_source end
   where m.id = p_moment and m.couple_id = cid
  returning m.* into saved;
  if saved.id is null then raise exception 'moment not found'; end if;
  return jsonb_build_object('id', saved.id, 'lat', saved.place_lat, 'lon', saved.place_lon, 'label', saved.place_label, 'source', saved.place_source);
end;
$$;
revoke all on function public.set_moment_place(uuid, double precision, double precision, text, text) from public, anon, authenticated, service_role;
grant execute on function public.set_moment_place(uuid, double precision, double precision, text, text) to authenticated;
