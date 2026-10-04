-- Production ledger 20260820120559 widget_tokens_service_only_public: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 febcbc31b8e260a445c5d6729327c942; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

alter table private.widget_tokens set schema public;
alter table public.widget_tokens enable row level security;
revoke all on table public.widget_tokens from anon, authenticated;
grant select, insert, update, delete on table public.widget_tokens to service_role;;
