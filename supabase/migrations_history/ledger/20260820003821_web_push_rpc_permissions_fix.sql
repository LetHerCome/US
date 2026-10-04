-- Production ledger 20260820003821 web_push_rpc_permissions_fix: the SQL supabase_migrations.schema_migrations
-- recorded for this version before the F2A.2 ledger repair. HISTORY ONLY: never apply.
-- 1 statement(s); unmasked md5 6e0616b6370823c5f81f446e30556635; 0 secret-shaped value(s) masked in the database.
-- Exported read-only by docs/us-2.0/F2A_2_LEDGER_EXPORT.sql; written by scripts/build-supabase-baseline.mjs.

revoke execute on function public.register_web_push_subscription(text,text,text,bigint,text) from anon;
revoke execute on function public.remove_web_push_subscription(text) from anon;
revoke execute on function public.get_web_push_status() from anon;
grant execute on function public.register_web_push_subscription(text,text,text,bigint,text) to authenticated;
grant execute on function public.remove_web_push_subscription(text) to authenticated;
grant execute on function public.get_web_push_status() to authenticated;;
