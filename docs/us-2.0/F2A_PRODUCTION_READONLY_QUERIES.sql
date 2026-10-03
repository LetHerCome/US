-- US 2.0 F2A — read-only production evidence pack.
--
-- Purpose: fill every NOT VERIFIED cell of docs/us-2.0/F2A_BACKEND_SOURCE_OF_TRUTH.md.
-- Every statement is a SELECT on catalogs, ledger, cron, storage metadata or
-- row counts. Nothing writes. The whole file runs inside a READ ONLY
-- transaction that is rolled back, so even an accidental write would fail.
--
-- How to run (either way works):
--   * Supabase Dashboard > SQL Editor: paste one numbered block at a time
--     (with the BEGIN line) and copy the single JSON cell it returns.
--   * CLI: supabase db query --linked -f docs/us-2.0/F2A_PRODUCTION_READONLY_QUERIES.sql
--     (if the CLI prints only the last result, run the blocks one by one).
--
-- Secrets: block 13 lists vault secret NAMES only, never values.
-- Paste the JSON results back in the F2A thread.

begin transaction read only;
set local statement_timeout = '60s';

-- 1. Migration ledger (exact versions and names).
select jsonb_build_object(
  'ledger_count', (select count(*) from supabase_migrations.schema_migrations),
  'ledger', (select jsonb_agg(jsonb_build_object('v', version, 'n', name) order by version)
             from supabase_migrations.schema_migrations)
) as f2a_01_ledger;

-- 2. Object counts.
select jsonb_build_object(
  'tables', (select jsonb_object_agg(nspname, n) from (
      select n.nspname, count(*) n from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r','p') and n.nspname in ('public','private') group by 1) t),
  'views', (select count(*) from pg_views where schemaname in ('public','private')),
  'matviews', (select count(*) from pg_matviews where schemaname in ('public','private')),
  'functions', (select jsonb_object_agg(nspname, n) from (
      select n.nspname, count(*) n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public','private') and p.prokind = 'f' group by 1) t),
  'security_definer', (select jsonb_object_agg(nspname, n) from (
      select n.nspname, count(*) n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public','private') and p.prosecdef group by 1) t),
  'triggers', (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and n.nspname in ('public','private')),
  'policies', (select jsonb_object_agg(schemaname, n) from (
      select schemaname, count(*) n from pg_policies where schemaname in ('public','private','storage') group by 1) t),
  'rls_enabled_public', (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity),
  'column_grants_public', (select count(*) from information_schema.column_privileges
      where table_schema = 'public' and grantee in ('anon','authenticated')
        and (table_schema, table_name, grantee, privilege_type) not in (
          select table_schema, table_name, grantee, privilege_type from information_schema.table_privileges)),
  'enum_types', (select count(*) from pg_type t join pg_namespace n on n.oid = t.typnamespace
      where t.typtype = 'e' and n.nspname in ('public','private'))
) as f2a_02_counts;

-- 3. Tables: RLS, approximate rows, column fingerprint, table ACL.
select jsonb_agg(jsonb_build_object(
  't', n.nspname || '.' || c.relname,
  'rls', c.relrowsecurity, 'force', c.relforcerowsecurity,
  'est_rows', c.reltuples::bigint,
  'cols', (select md5(string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull, ',' order by a.attnum))
           from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
  'ncols', (select count(*) from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
  'acl', c.relacl::text
) order by n.nspname, c.relname) as f2a_03_tables
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','p') and n.nspname in ('public','private');

-- 4. Functions: signature, SECURITY DEFINER, body hash, ACL.
select jsonb_agg(jsonb_build_object(
  'f', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
  'sd', p.prosecdef, 'body_md5', md5(p.prosrc), 'acl', p.proacl::text,
  'cfg', p.proconfig
) order by n.nspname, p.proname) as f2a_04_functions
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public','private') and p.prokind = 'f';

-- 5. RLS policies (public, private, storage).
select jsonb_agg(jsonb_build_object(
  't', schemaname || '.' || tablename, 'p', policyname, 'cmd', cmd, 'roles', roles::text, 'perm', permissive,
  'md5', md5(coalesce(qual, '') || '|' || coalesce(with_check, ''))
) order by schemaname, tablename, policyname) as f2a_05_policies
from pg_policies where schemaname in ('public','private','storage');

-- 6. Triggers and CHECK constraints (definitions, to compare with repo SQL).
select jsonb_build_object(
  'triggers', (select jsonb_agg(jsonb_build_object('t', n.nspname || '.' || c.relname, 'trg', t.tgname,
                 'fn', pf.proname) order by 1)
               from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
               join pg_proc pf on pf.oid = t.tgfoid
               where not t.tgisinternal and n.nspname in ('public','private')),
  'checks', (select jsonb_agg(jsonb_build_object('t', n.nspname || '.' || c.relname, 'con', k.conname,
                 'def', pg_get_constraintdef(k.oid)) order by 1)
             from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
             where k.contype = 'c' and n.nspname in ('public','private'))
) as f2a_06_triggers_checks;

-- 7. Views and enum types.
select jsonb_build_object(
  'views', (select jsonb_agg(schemaname || '.' || viewname order by 1) from pg_views where schemaname in ('public','private')),
  'enums', (select jsonb_agg(n.nspname || '.' || t.typname order by 1) from pg_type t
            join pg_namespace n on n.oid = t.typnamespace where t.typtype = 'e' and n.nspname in ('public','private'))
) as f2a_07_views_types;

-- 8. Realtime publication membership.
select jsonb_agg(schemaname || '.' || tablename order by 1) as f2a_08_realtime
from pg_publication_tables where pubname = 'supabase_realtime';

-- 9. Extensions.
select jsonb_agg(jsonb_build_object('ext', e.extname, 'v', e.extversion, 'schema', n.nspname) order by e.extname) as f2a_09_extensions
from pg_extension e join pg_namespace n on n.oid = e.extnamespace;

-- 10. Storage buckets (metadata) and object counts per bucket.
select jsonb_build_object(
  'buckets', (select jsonb_agg(jsonb_build_object('id', id, 'public', public, 'limit', file_size_limit,
                'mime', allowed_mime_types) order by id) from storage.buckets),
  'objects_per_bucket', (select jsonb_object_agg(bucket_id, n) from (
                select bucket_id, count(*) n from storage.objects group by 1) t)
) as f2a_10_storage;

-- 11. Cron jobs (full definition) and execution summary.
select jsonb_build_object(
  'jobs', (select jsonb_agg(jsonb_build_object('id', jobid, 'name', jobname, 'schedule', schedule,
             'active', active, 'command', command) order by jobid) from cron.job),
  'run_details_total', (select count(*) from cron.job_run_details),
  'run_details_oldest', (select min(start_time) from cron.job_run_details),
  'per_job', (select jsonb_agg(jsonb_build_object('id', jobid, 'runs', runs, 'last_start', last_start,
                'failed_7d', failed_7d, 'last_status', last_status) order by jobid)
              from (select d.jobid, count(*) runs, max(d.start_time) last_start,
                      count(*) filter (where d.status <> 'succeeded' and d.start_time > now() - interval '7 days') failed_7d,
                      (array_agg(d.status order by d.start_time desc))[1] last_status
                    from cron.job_run_details d group by d.jobid) s)
) as f2a_11_cron;

-- 12. pg_net response backlog (if pg_net is installed).
select case when to_regclass('net._http_response') is null then null else
  (xpath('/row/c/text()', query_to_xml('select count(*) as c from net._http_response', false, true, '')))[1]::text::bigint
end as f2a_12_net_http_response_rows;

-- 13. Vault secret names (NAMES ONLY, never values).
select jsonb_agg(name order by name) as f2a_13_vault_secret_names from vault.secrets;

-- 14. Retention / operational accumulation (counts only, no row contents).
--     Each probe names its table so a missing table reports MISSING_TABLE
--     instead of aborting the block.
with q(label, tbl, sql) as (values
  ('left_for_you_total', 'public.left_for_you', 'select count(*) as c from public.left_for_you'),
  ('left_for_you_cleanup_eligible_now', 'public.left_for_you', $q$select count(*) as c from public.left_for_you i
      where i.cleanup_eligible_at is not null and i.seen_at is not null and i.seen_at < now() - interval '30 days'
        and not exists (select 1 from public.conserva_contributions k where k.source_item_id = i.id)$q$),
  ('left_for_you_seen_legacy_null_eligibility', 'public.left_for_you', 'select count(*) as c from public.left_for_you where cleanup_eligible_at is null and seen_at is not null'),
  ('left_for_you_unseen', 'public.left_for_you', 'select count(*) as c from public.left_for_you where seen_at is null'),
  ('left_for_you_oldest_seen', 'public.left_for_you', 'select min(seen_at)::text as c from public.left_for_you'),
  ('left_for_you_cleanup_queue', 'private.left_for_you_cleanup_queue', 'select count(*) as c from private.left_for_you_cleanup_queue'),
  ('push_event_log_total', 'public.push_event_log', 'select count(*) as c from public.push_event_log'),
  ('widget_action_receipts_total', 'public.widget_action_receipts', 'select count(*) as c from public.widget_action_receipts'),
  ('widget_setup_codes_expired_unconsumed', 'public.widget_scriptable_setup_codes', 'select count(*) as c from public.widget_scriptable_setup_codes where consumed_at is null and expires_at < now()'),
  ('widget_installations_expired', 'public.widget_scriptable_installations', 'select count(*) as c from public.widget_scriptable_installations where expires_at < now()'),
  ('widget_tokens_total', 'public.widget_tokens', 'select count(*) as c from public.widget_tokens'),
  ('device_push_tokens_total', 'public.device_push_tokens', 'select count(*) as c from public.device_push_tokens'),
  ('push_subscriptions_total', 'public.push_subscriptions', 'select count(*) as c from public.push_subscriptions'),
  ('couple_invites_total', 'public.couple_invites', 'select count(*) as c from public.couple_invites'),
  ('couple_questions_total', 'public.couple_questions', 'select count(*) as c from public.couple_questions'),
  ('quiz_responses_total', 'public.quiz_responses', 'select count(*) as c from public.quiz_responses'),
  ('partner_knowledge_attempts_total', 'public.partner_knowledge_attempts', 'select count(*) as c from public.partner_knowledge_attempts'),
  ('moods_total', 'public.moods', 'select count(*) as c from public.moods'),
  ('activity_total', 'public.activity', 'select count(*) as c from public.activity'),
  ('relationship_milestones_total', 'public.relationship_milestones', 'select count(*) as c from public.relationship_milestones'),
  ('relationship_milestones_last', 'public.relationship_milestones', 'select max(milestone_date)::text as c from public.relationship_milestones'),
  ('game_sessions_open_total', 'public.game_sessions', 'select count(*) as c from public.game_sessions where completed_at is null'),
  ('auth_anonymous_users', 'auth.users', 'select count(*) as c from auth.users where is_anonymous')
)
select jsonb_object_agg(label, val) as f2a_14_retention from (
  select label,
    case when to_regclass(tbl) is null then 'MISSING_TABLE'
         else coalesce((xpath('/row/c/text()', query_to_xml(sql, false, true, '')))[1]::text, '-') end as val
  from q
) r;

rollback;
