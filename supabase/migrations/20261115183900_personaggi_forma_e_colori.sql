-- Il diario, ma pulito (founder, 15/11/2026, mockup v4.1): the characters and
-- the colours of the couple. STAGING ONLY until the founder decides otherwise:
-- never apply to production without an explicit, separate yes.
--
-- 1. Each person picks the shape of their character (tondo, quadrato,
--    triangolo, goccia, nuvola). Two people may share a shape, never a colour.
--    Without a choice the app keeps the old look: the ball for whoever created
--    the couple, the square for whoever joined.
-- 2. «Un colore, un significato»: honey is time, sky is distance, the heart is
--    the Ti penso. The person palette loses oro, cielo and rubino (too close to
--    them) and gains blu, prugna and menta. Whoever had one of the three moves
--    to the nearest new colour, never onto the partner's.

-- ---------------------------------------------------------------- 1. shape
alter table public.profiles add column if not exists character_shape text
  check (character_shape in ('palla', 'quadrato', 'triangolo', 'goccia', 'nuvola'));

comment on column public.profiles.character_shape is
  'The shape of this person''s character (diario pulito). Null: palla for role francesco, quadrato for role beatrice.';

create or replace function public.set_my_character_shape(p_shape text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'not signed in'; end if;
  if p_shape is not null and p_shape not in ('palla', 'quadrato', 'triangolo', 'goccia', 'nuvola') then
    raise exception 'invalid shape';
  end if;
  update public.profiles set character_shape = p_shape where id = me.id;
  return jsonb_build_object('shape', p_shape);
end;
$$;
revoke all on function public.set_my_character_shape(text) from public, anon, authenticated, service_role;
grant execute on function public.set_my_character_shape(text) to authenticated;

-- ---------------------------------------------------------------- 2. palette
-- The old check would refuse the new names: drop it, move, then check again.
alter table public.profiles drop constraint if exists profiles_person_color_check;

-- Move the three retired colours (nearest: cielo → blu, rubino → prugna,
-- oro → pesca), falling back to menta when the partner already has that one.
update public.profiles p
set person_color = case
  when (case p.person_color when 'cielo' then 'blu' when 'rubino' then 'prugna' else 'pesca' end) = coalesce((
    select coalesce(o.person_color, case o.role when 'francesco' then 'rosa' else 'lilla' end)
    from public.profiles o where o.couple_id = p.couple_id and o.id <> p.id limit 1), '')
  then 'menta'
  else (case p.person_color when 'cielo' then 'blu' when 'rubino' then 'prugna' else 'pesca' end)
end
where p.person_color in ('oro', 'cielo', 'rubino');

alter table public.profiles add constraint profiles_person_color_check
  check (person_color in ('rosa', 'lilla', 'blu', 'salvia', 'pesca', 'prugna', 'menta', 'perla'));

create or replace function public.set_my_color(p_color text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  partner_color text;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.couple_id is null then raise exception 'not a couple member'; end if;
  if p_color is not null then
    if p_color not in ('rosa', 'lilla', 'blu', 'salvia', 'pesca', 'prugna', 'menta', 'perla') then
      raise exception 'invalid color';
    end if;
    -- In beta (Plus not on sale) the colour is free.
    if private.plus_on_sale() and not private.couple_has_plus(me.couple_id) then raise exception 'plus required'; end if;
    select coalesce(p.person_color, case p.role when 'francesco' then 'rosa' else 'lilla' end) into partner_color
    from public.profiles p where p.couple_id = me.couple_id and p.id <> me.id;
    if partner_color = p_color then raise exception 'partner color'; end if;
  end if;
  update public.profiles set person_color = p_color where id = me.id;
  return jsonb_build_object('color', p_color);
end;
$$;
revoke all on function public.set_my_color(text) from public, anon, authenticated, service_role;
grant execute on function public.set_my_color(text) to authenticated;
