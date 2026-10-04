-- Production ledger 20260923112428 harden_conserva_contribution_grants: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 88fab7573a20fe594a12accf27f2cc13; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.


revoke all on table public.conserva_contributions from public, anon, authenticated;
grant select on table public.conserva_contributions to authenticated;;
