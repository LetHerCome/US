-- Compagni V1 (22/10/2026, D5 exception). Spec: docs/missions/companions-v1.md.
--
-- At the start a couple has no companion. They arrive with the couple's
-- Sintonia level (private.progression_level of couples.bond_xp, the same
-- level that unlocks the Oggi themes and effects): Maudit at 3, the owl at 5,
-- the goat at 8, the dragon at 11. A companion never grows or changes.
--
-- * One table, couple_companion_unlocks: what the couple has unlocked and
--   when. RPC-only; grants are written out in full because from 2026-10-30
--   Supabase no longer exposes new public tables by default.
-- * An unlock is recorded the first time the level is reached and is never
--   removed.
-- * Lifecycle: the rows go with the couple (FK ON DELETE CASCADE). A couple
--   formed after a separation starts again with no companion. No personal
--   data: which companion each member shows stays on their device.
-- * The answer has no counts and no thresholds.
-- Re-applying this migration changes nothing.

create table if not exists public.couple_companion_unlocks (
  couple_id uuid not null references public.couples(id) on delete cascade,
  companion_id text not null,
  unlocked_at timestamptz not null default pg_catalog.now(),
  primary key (couple_id, companion_id)
);
alter table public.couple_companion_unlocks drop constraint if exists couple_companion_unlocks_companion_id_check;
alter table public.couple_companion_unlocks add constraint couple_companion_unlocks_companion_id_check
  check (companion_id in ('maudit', 'owl', 'goat', 'dragon'));
comment on table public.couple_companion_unlocks is 'Compagni V1: the companions a couple has unlocked with its Sintonia level (Maudit 3, owl 5, goat 8, dragon 11). RPC-only, never removed, deleted with the couple.';
alter table public.couple_companion_unlocks enable row level security;
revoke all on table public.couple_companion_unlocks from public, anon, authenticated, service_role;
grant select on table public.couple_companion_unlocks to service_role;

-- Records the companions the couple's level has reached. Idempotent.
create or replace function private.companion_sync(p_couple uuid) returns void
language plpgsql security definer set search_path = ''
as $fn$
declare reached integer;
begin
  select private.progression_level(c.bond_xp) into reached from public.couples c where c.id = p_couple;
  insert into public.couple_companion_unlocks(couple_id, companion_id)
  select p_couple, x.id
    from (values ('maudit', 3), ('owl', 5), ('goat', 8), ('dragon', 11)) as x(id, at_level)
   where x.at_level <= coalesce(reached, 1)
  on conflict do nothing;
end;
$fn$;
revoke all on function private.companion_sync(uuid) from public, anon, authenticated, service_role;

-- The caller couple's companions, in the order they arrive. Records what is
-- newly unlocked first, so the answer is always current.
create or replace function public.get_companions_v1() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $fn$
declare actor record;
begin
  select * into actor from private.m11a_actor();
  perform private.companion_sync(actor.caller_couple);
  return pg_catalog.jsonb_build_object('companions', (
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', c.id,
        'unlocked', u.companion_id is not null,
        'unlocked_at', u.unlocked_at) order by c.ord)
      from (values ('maudit', 1), ('owl', 2), ('goat', 3), ('dragon', 4)) as c(id, ord)
      left join public.couple_companion_unlocks u
        on u.couple_id = actor.caller_couple and u.companion_id = c.id));
end;
$fn$;
comment on function public.get_companions_v1() is 'Compagni V1: records the companions the caller couple''s Sintonia level has reached and returns the four with unlocked and unlocked_at. No counts.';
revoke all on function public.get_companions_v1() from public, anon, authenticated, service_role;
grant execute on function public.get_companions_v1() to authenticated;
