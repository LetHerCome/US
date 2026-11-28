-- Personaggi: il guardaroba (founder, 20/11/2026, grill-me D6–D10, D18–D19;
-- tavola approvata il 21/11/2026). STAGING ONLY until the founder decides
-- otherwise: never apply to production without an explicit, separate yes. It
-- needs 20261115183900_personaggi_forma_e_colori (character_shape) first.
--
-- Each person dresses their own character in two places: one thing on the
-- head and one on the face or at the neck. Everything is free (no currency,
-- no US Plus). An accessory is unlocked:
--   * by the couple's Sintonia points (couples.bond_xp), on thresholds of their
--     own, apart from the levels: occhiali 150, cappello 400, fiocco 700,
--     sciarpina 1000, sole 1350, gala 1700, cuffie 2100, coroncina 2550,
--     corona 3000 (D19: measured on the real pace of the couples, 21/11/2026);
--   * by a real moment: macchinetta = the first Ricordo, cento = 100 days in
--     US, festa = the first anniversary in US.
-- The partner sees the outfit (it is in the profile, read like the shape).

-- ---------------------------------------------------------------- columns
alter table public.profiles add column if not exists character_head text
  check (character_head in ('cappello', 'fiocco', 'cuffie', 'corona', 'coroncina', 'festa', 'cento'));
alter table public.profiles add column if not exists character_face text
  check (character_face in ('occhiali', 'sole', 'sciarpina', 'gala', 'macchinetta'));

comment on column public.profiles.character_head is
  'What this person''s character wears on the head (personaggi, guardaroba). Null: nothing.';
comment on column public.profiles.character_face is
  'What this person''s character wears on the face or at the neck (personaggi, guardaroba). Null: nothing.';

-- ---------------------------------------------------------------- what is unlocked
-- The accessories a couple has unlocked, from its own data only.
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
           ('gala', 1700), ('cuffie', 2100), ('coroncina', 2550), ('corona', 3000)
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

-- ---------------------------------------------------------------- dressing my character
-- Only my own profile, only accessories of the right place, only unlocked ones.
-- Null takes it off. Returns what I wear and what the couple has unlocked.
create or replace function public.set_my_character_look(p_head text, p_face text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  unlocked text[];
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'not signed in'; end if;
  if me.couple_id is null then raise exception 'no couple'; end if;
  if p_head is not null and p_head not in ('cappello', 'fiocco', 'cuffie', 'corona', 'coroncina', 'festa', 'cento') then
    raise exception 'invalid head';
  end if;
  if p_face is not null and p_face not in ('occhiali', 'sole', 'sciarpina', 'gala', 'macchinetta') then
    raise exception 'invalid face';
  end if;
  unlocked := private.character_unlocks(me.couple_id);
  if p_head is not null and not (p_head = any(unlocked)) then raise exception 'locked'; end if;
  if p_face is not null and not (p_face = any(unlocked)) then raise exception 'locked'; end if;
  update public.profiles set character_head = p_head, character_face = p_face where id = me.id;
  return jsonb_build_object('head', p_head, 'face', p_face, 'unlocked', to_jsonb(unlocked));
end;
$$;
revoke all on function public.set_my_character_look(text, text) from public, anon, authenticated, service_role;
grant execute on function public.set_my_character_look(text, text) to authenticated;

-- What my couple has unlocked (for the wardrobe; the same rule as above).
create or replace function public.my_character_unlocks()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null or me.couple_id is null then return '[]'::jsonb; end if;
  return to_jsonb(private.character_unlocks(me.couple_id));
end;
$$;
revoke all on function public.my_character_unlocks() from public, anon, authenticated, service_role;
grant execute on function public.my_character_unlocks() to authenticated;
