-- Production ledger 20260818191114 lock_private_helper_schema: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 2f15fc3048463e6d587327e4e219fe28; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on function private.current_couple_id() from public, anon;
grant execute on function private.current_couple_id() to authenticated;;
