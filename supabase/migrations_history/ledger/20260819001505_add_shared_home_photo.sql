-- Production ledger 20260819001505 add_shared_home_photo: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 08eb37b33e1ec063dd9d468dc20f0b98; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

alter table public.couples add column if not exists home_photo_path text;

drop policy if exists couples_update_own on public.couples;
create policy couples_update_own on public.couples
for update to authenticated
using (id = private.current_couple_id())
with check (id = private.current_couple_id());;
