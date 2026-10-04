-- Production ledger 20260820160643 add_moment_album_photos: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 e9eddad94031731926b81012bc08c423; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

create table if not exists public.moment_photos (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.moments(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  caption text,
  position smallint not null default 1,
  created_at timestamptz not null default now(),
  constraint moment_photos_caption_len check (caption is null or char_length(caption) <= 180),
  constraint moment_photos_position_positive check (position >= 1)
);

create index if not exists moment_photos_moment_position_idx
  on public.moment_photos(moment_id, position, created_at);
create index if not exists moment_photos_couple_idx
  on public.moment_photos(couple_id);

alter table public.moment_photos enable row level security;

drop policy if exists moment_photos_select_same_couple on public.moment_photos;
create policy moment_photos_select_same_couple
on public.moment_photos for select
to authenticated
using (
  couple_id = private.current_couple_id()
  and exists (
    select 1 from public.moments m
    where m.id = moment_photos.moment_id
      and m.couple_id = private.current_couple_id()
  )
);

drop policy if exists moment_photos_insert_own on public.moment_photos;
create policy moment_photos_insert_own
on public.moment_photos for insert
to authenticated
with check (
  couple_id = private.current_couple_id()
  and created_by = auth.uid()
  and exists (
    select 1 from public.moments m
    where m.id = moment_photos.moment_id
      and m.couple_id = private.current_couple_id()
  )
);

drop policy if exists moment_photos_update_own on public.moment_photos;
create policy moment_photos_update_own
on public.moment_photos for update
to authenticated
using (
  couple_id = private.current_couple_id()
  and created_by = auth.uid()
)
with check (
  couple_id = private.current_couple_id()
  and created_by = auth.uid()
);

drop policy if exists moment_photos_delete_own on public.moment_photos;
create policy moment_photos_delete_own
on public.moment_photos for delete
to authenticated
using (
  couple_id = private.current_couple_id()
  and created_by = auth.uid()
);

grant select, insert, update, delete on public.moment_photos to authenticated;;
