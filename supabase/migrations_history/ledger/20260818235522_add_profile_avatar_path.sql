-- Production ledger 20260818235522 add_profile_avatar_path: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 cc12dfdb39a4a1827fd50134af43f671; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

alter table public.profiles add column if not exists avatar_path text;;
