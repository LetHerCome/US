-- US Native Notifications V1 — read-only production preflight pack.
--
-- Purpose: re-read, from production, the facts the forward migration
-- supabase/migrations/20261006200000_native_notifications_v1.sql relies on.
-- Every block is ONE SELECT returning ONE JSON cell. Nothing writes. Nothing
-- reads a token, an endpoint, a secret value or user content: counts, names and
-- ACL booleans only.
--
-- How to run: Supabase connector `execute_sql` (or Dashboard > SQL Editor), one
-- numbered block at a time, BEFORE applying the migration. The BEGIN READ ONLY /
-- ROLLBACK lines make an accidental write fail if the whole file is run at once.
-- Save the cells as docs/native/NATIVE_NOTIFICATIONS_V1_PREFLIGHT.json:
--   {"captured_at": "<UTC>", "blocks": {"n01": <cell>, "n02": <cell>, "n03": <cell>}}
--
-- Expected (the repo baseline = production capture F2A.1, plus the forward
-- migrations already applied):
--   n01.ledger_last  is the newest forward migration applied before this one;
--   n02.rows = 0, n02.has_installation_id = false (the migration aborts otherwise);
--   n02.authenticated_* privileges = true today (baseline grants, RLS decides);
--   n03.register_push_token_exists = true and its client EXECUTE = false (F1B);
--   n03.new_rpcs_exist = false.

begin transaction read only;
set local statement_timeout = '30s';

-- n01. Ledger.
select jsonb_build_object(
  'ledger', (select jsonb_agg(version order by version) from supabase_migrations.schema_migrations),
  'ledger_last', (select max(version) from supabase_migrations.schema_migrations)
) as n01;

-- n02. device_push_tokens: shape, rows, policies, client privileges.
select jsonb_build_object(
  'rows', (select count(*) from public.device_push_tokens),
  'columns', (select jsonb_agg(column_name::text order by ordinal_position) from information_schema.columns
              where table_schema = 'public' and table_name = 'device_push_tokens'),
  'has_installation_id', exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'device_push_tokens' and column_name = 'installation_id'),
  'policies', (select coalesce(jsonb_agg(policyname::text order by policyname), '[]'::jsonb) from pg_policies
              where schemaname = 'public' and tablename = 'device_push_tokens'),
  'rls', (select relrowsecurity from pg_class where oid = 'public.device_push_tokens'::regclass),
  'authenticated_select', has_table_privilege('authenticated', 'public.device_push_tokens', 'SELECT'),
  'authenticated_delete', has_table_privilege('authenticated', 'public.device_push_tokens', 'DELETE'),
  'anon_select', has_table_privilege('anon', 'public.device_push_tokens', 'SELECT')
) as n02;

-- n03. Functions the migration drops or creates.
select jsonb_build_object(
  'register_push_token_exists', to_regprocedure('public.register_push_token(text,text)') is not null,
  'register_push_token_client_execute', coalesce((select has_function_privilege('authenticated', 'public.register_push_token(text,text)', 'EXECUTE')
      where to_regprocedure('public.register_push_token(text,text)') is not null), false),
  'new_rpcs_exist', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('register_native_push_device', 'unregister_native_push_device')),
  'push_event_log_rows_last_day', (select count(*) from public.push_event_log where created_at > now() - interval '1 day')
) as n03;

rollback;
