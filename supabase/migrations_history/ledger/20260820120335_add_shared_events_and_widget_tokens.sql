-- Production ledger 20260820120335 add_shared_events_and_widget_tokens: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 692c99a26b92bc80e76d095348acf5a9; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

create table if not exists public.shared_events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  event_date date not null,
  event_time time without time zone,
  location text check (location is null or char_length(location) <= 160),
  note text check (note is null or char_length(note) <= 500),
  recurs_yearly boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shared_events_couple_date_idx on public.shared_events(couple_id, event_date, event_time);

alter table public.shared_events enable row level security;

drop policy if exists shared_events_select_same_couple on public.shared_events;
create policy shared_events_select_same_couple on public.shared_events
for select to authenticated
using (couple_id = private.current_couple_id());

drop policy if exists shared_events_insert_same_couple on public.shared_events;
create policy shared_events_insert_same_couple on public.shared_events
for insert to authenticated
with check (couple_id = private.current_couple_id() and created_by = auth.uid());

drop policy if exists shared_events_update_same_couple on public.shared_events;
create policy shared_events_update_same_couple on public.shared_events
for update to authenticated
using (couple_id = private.current_couple_id())
with check (couple_id = private.current_couple_id());

drop policy if exists shared_events_delete_same_couple on public.shared_events;
create policy shared_events_delete_same_couple on public.shared_events
for delete to authenticated
using (couple_id = private.current_couple_id());

create or replace function private.us_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shared_events_touch_updated_at on public.shared_events;
create trigger shared_events_touch_updated_at
before update on public.shared_events
for each row execute function private.us_touch_updated_at();

create table if not exists private.widget_tokens (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  device_label text not null default 'Widget',
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists widget_tokens_profile_idx on private.widget_tokens(profile_id) where revoked_at is null;

revoke all on table private.widget_tokens from anon, authenticated;
grant select, insert, update, delete on table private.widget_tokens to service_role;

grant select, insert, update, delete on table public.shared_events to authenticated;;
