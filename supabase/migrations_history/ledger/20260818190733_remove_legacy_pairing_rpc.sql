-- Production ledger 20260818190733 remove_legacy_pairing_rpc: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 37da087d354783b40c38372020f732e3; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

drop function if exists public.join_us(text,text);
drop function if exists public.current_couple_id();;
