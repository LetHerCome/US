-- Production ledger 20260819002337 add_couple_locations: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 27b9d1f492cbe5b0a6757b34a6b9eba9; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

create table if not exists public.couple_locations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision,
  updated_at timestamptz not null default now()
);

create index if not exists couple_locations_couple_id_idx on public.couple_locations(couple_id);
create index if not exists couple_locations_updated_at_idx on public.couple_locations(updated_at desc);

alter table public.couple_locations enable row level security;

revoke all on table public.couple_locations from anon;
grant select, insert, update on table public.couple_locations to authenticated;

drop policy if exists couple_locations_select_same_couple on public.couple_locations;
create policy couple_locations_select_same_couple
on public.couple_locations
for select
to authenticated
using (couple_id = private.current_couple_id());

drop policy if exists couple_locations_insert_self on public.couple_locations;
create policy couple_locations_insert_self
on public.couple_locations
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and couple_id = private.current_couple_id()
);

drop policy if exists couple_locations_update_self on public.couple_locations;
create policy couple_locations_update_self
on public.couple_locations
for update
to authenticated
using (
  user_id = (select auth.uid())
  and couple_id = private.current_couple_id()
)
with check (
  user_id = (select auth.uid())
  and couple_id = private.current_couple_id()
);;
