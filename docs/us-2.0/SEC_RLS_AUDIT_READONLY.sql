-- US 2.0 Security / RLS hardening — read-only production audit pack.
--
-- Purpose: re-read, from production itself, every catalog fact the security
-- audit (docs/us-2.0/SEC_RLS_AUDIT.md) relies on, plus the data preconditions
-- of the candidate migration 20261004150000_sec_rls_hardening.sql. The repo
-- test tests/sec-rls-hardening.test.js runs the SAME blocks on an empty
-- PostgreSQL rebuilt from supabase/migrations (baseline + F2C) and compares.
--
-- Every block is ONE SELECT returning ONE JSON cell. Nothing writes. Nothing
-- reads a secret value, a token, an answer, a message body or a storage path:
-- s10 returns counts and booleans only.
--
-- How to run (same as F2A / F2A.1):
--   * Supabase connector `execute_sql` (or Dashboard > SQL Editor): run ONE
--     numbered block at a time and copy the single JSON cell it returns.
--   * The BEGIN READ ONLY / ROLLBACK lines around the file make an accidental
--     write fail if the whole file is run at once.
--   * Run it BEFORE applying 20261004150000 (it describes the audited state).
--
-- Save the results as docs/us-2.0/SEC_RLS_AUDIT_PRODUCTION.json:
--   {"captured_at": "<UTC>", "project_id": "<ref>",
--    "blocks": {"s01": <cell>, "s02": <cell>, ...}}
-- and the security advisors (Supabase get_advisors type=security, or
-- Dashboard > Advisors > Security) as docs/us-2.0/SEC_RLS_AUDIT_ADVISORS.json.

begin transaction read only;
set local statement_timeout = '60s';

-- s01. Server, migration ledger, exposed API schemas.
select jsonb_build_object(
  'server_version', current_setting('server_version'),
  'ledger', (select jsonb_agg(jsonb_build_object('v', version, 'n', name) order by version)
             from supabase_migrations.schema_migrations),
  -- PostgREST exposed schemas live in the authenticator role settings.
  'authenticator_config', (select to_jsonb(r.rolconfig) from pg_roles r where r.rolname = 'authenticator'),
  'api_roles', (select jsonb_agg(jsonb_build_object('role', r.rolname, 'bypassrls', r.rolbypassrls,
                  'super', r.rolsuper, 'inherit', r.rolinherit) order by r.rolname)
                from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role', 'authenticator'))
) as sec_s01_meta;

-- s02. Every table / view in public and private: RLS flags and what each client role may do.
select jsonb_agg(jsonb_build_object(
    't', n.nspname || '.' || c.relname, 'kind', c.relkind,
    'rls', c.relrowsecurity, 'force', c.relforcerowsecurity,
    'policies', (select count(*) from pg_policy p where p.polrelid = c.oid),
    'anon', concat_ws(',',
      case when has_table_privilege('anon', c.oid, 'SELECT') then 'S' end,
      case when has_table_privilege('anon', c.oid, 'INSERT') then 'I' end,
      case when has_table_privilege('anon', c.oid, 'UPDATE') then 'U' end,
      case when has_table_privilege('anon', c.oid, 'DELETE') then 'D' end,
      case when has_table_privilege('anon', c.oid, 'TRUNCATE') then 'T' end),
    'authenticated', concat_ws(',',
      case when has_table_privilege('authenticated', c.oid, 'SELECT') then 'S' end,
      case when has_table_privilege('authenticated', c.oid, 'INSERT') then 'I' end,
      case when has_table_privilege('authenticated', c.oid, 'UPDATE') then 'U' end,
      case when has_table_privilege('authenticated', c.oid, 'DELETE') then 'D' end,
      case when has_table_privilege('authenticated', c.oid, 'TRUNCATE') then 'T' end)
  ) order by n.nspname, c.relname) as sec_s02_tables
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'private') and c.relkind in ('r', 'p', 'v', 'm', 'f');

-- s03. Every RLS policy in public and storage.
select jsonb_agg(jsonb_build_object(
    't', schemaname || '.' || tablename, 'p', policyname, 'cmd', cmd, 'permissive', permissive,
    'roles', roles, 'using', qual, 'check', with_check
  ) order by schemaname, tablename, policyname) as sec_s03_policies
from pg_policies where schemaname in ('public', 'storage');

-- s04. Every function in public and private: definer, search_path, who can execute.
select jsonb_agg(jsonb_build_object(
    'f', p.oid::regprocedure::text, 'definer', p.prosecdef, 'volatility', p.provolatile,
    'config', p.proconfig, 'owner', pg_get_userbyid(p.proowner), 'acl', p.proacl::text,
    'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
    'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    'service_role', has_function_privilege('service_role', p.oid, 'EXECUTE'),
    'body_md5', md5(p.prosrc)
  ) order by p.oid::regprocedure::text) as sec_s04_functions
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private') and p.prokind = 'f';

-- s05. Column-level write grants for client roles (tables without the table-level privilege).
select jsonb_agg(jsonb_build_object('t', x.t, 'role', x.grantee, 'priv', x.privilege_type, 'cols', x.cols)
  order by x.t, x.grantee, x.privilege_type) as sec_s05_column_grants
from (
  select table_schema || '.' || table_name as t, grantee, privilege_type,
         string_agg(column_name::text, ',' order by column_name) as cols
  from information_schema.column_privileges
  where table_schema in ('public', 'private') and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE')
    and not has_table_privilege(grantee, (quote_ident(table_schema) || '.' || quote_ident(table_name))::regclass, privilege_type)
  group by 1, 2, 3
) x;

-- s06. Views and materialized views: security_invoker and grants.
select jsonb_agg(jsonb_build_object(
    'v', n.nspname || '.' || c.relname, 'kind', c.relkind, 'options', c.reloptions, 'acl', c.relacl::text
  ) order by n.nspname, c.relname) as sec_s06_views
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'private') and c.relkind in ('v', 'm');

-- s07. Storage buckets (configuration only).
select jsonb_agg(jsonb_build_object(
    'id', b.id, 'public', b.public, 'file_size_limit', b.file_size_limit,
    'allowed_mime_types', b.allowed_mime_types
  ) order by b.id) as sec_s07_buckets
from storage.buckets b;

-- s08. Schema usage, default privileges, realtime publication.
select jsonb_build_object(
  'schemas', (select jsonb_agg(jsonb_build_object('s', n.nspname, 'acl', n.nspacl::text) order by n.nspname)
              from pg_namespace n where n.nspname in ('public', 'private')),
  'default_acl', (select jsonb_agg(jsonb_build_object('role', pg_get_userbyid(d.defaclrole),
                    'schema', n.nspname, 'objtype', d.defaclobjtype, 'acl', d.defaclacl::text)
                    order by pg_get_userbyid(d.defaclrole), n.nspname, d.defaclobjtype)
                  from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
                  where n.nspname in ('public', 'private')),
  'realtime_tables', (select jsonb_agg(t.schemaname || '.' || t.tablename order by t.schemaname, t.tablename)
                      from pg_publication_tables t where t.pubname = 'supabase_realtime')
) as sec_s08_schemas;

-- s09. Authorization inputs: auth.role(), JWT and user metadata in function bodies and policies (names only).
select jsonb_build_object(
  'functions', (select jsonb_agg(jsonb_build_object('f', p.oid::regprocedure::text,
                  'auth_role', p.prosrc ~* 'auth\.role\(\)',
                  'auth_jwt', p.prosrc ~* 'auth\.jwt\(\)',
                  'user_metadata', p.prosrc ~* '(raw_user_meta_data|user_metadata)',
                  'app_metadata', p.prosrc ~* '(raw_app_meta_data|app_metadata)') order by p.oid::regprocedure::text)
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname in ('public', 'private')
                  and p.prosrc ~* '(auth\.role\(\)|auth\.jwt\(\)|user_metadata|app_metadata|raw_user_meta_data|raw_app_meta_data)'),
  'policies', (select jsonb_agg(schemaname || '.' || tablename || '.' || policyname order by 1)
               from pg_policies
               where schemaname in ('public', 'storage')
                 and concat(qual, ' ', with_check) ~* '(auth\.role\(\)|auth\.jwt\(\)|user_metadata|app_metadata)')
) as sec_s09_auth_inputs;

-- s10. Data preconditions and exposure (PRODUCTION ONLY; counts and booleans, no values).
select jsonb_build_object(
  'couples', (select count(*) from public.couples),
  'profiles', (select count(*) from public.profiles),
  'home_photo_path', (select jsonb_build_object(
      'null', count(*) filter (where c.home_photo_path is null),
      'own_folder', count(*) filter (where starts_with(c.home_photo_path, c.id::text || '/') and position('..' in c.home_photo_path) = 0),
      'outside', count(*) filter (where c.home_photo_path is not null
                   and not (starts_with(c.home_photo_path, c.id::text || '/') and position('..' in c.home_photo_path) = 0)))
    from public.couples c),
  'avatar_path_outside_own_couple', (select count(*) from public.profiles p
      where p.avatar_path is not null and (p.couple_id is null or not starts_with(p.avatar_path, p.couple_id::text || '/'))),
  'moments_path_outside_couple', (select count(*) from public.moments m where not starts_with(m.storage_path, m.couple_id::text || '/')),
  'moment_photos_path_outside_couple', (select count(*) from public.moment_photos m where not starts_with(m.storage_path, m.couple_id::text || '/')),
  'left_for_you_media_outside_sender', (select count(*) from public.left_for_you l
      where l.kind in ('photo', 'audio', 'video')
        and not starts_with(l.media_path, l.couple_id::text || '/' || l.sender_id::text || '/left/')),
  'calendar_reminders', (select count(*) from public.calendar_reminders),
  'auth_users', (select jsonb_build_object(
      'total', count(*),
      'anonymous', count(*) filter (where u.is_anonymous),
      'without_profile', count(*) filter (where not exists (select 1 from public.profiles p where p.id = u.id)))
    from auth.users u),
  'storage_objects', (select jsonb_build_object(
      'total', count(*),
      'us_media_outside_known_couples', count(*) filter (where o.bucket_id = 'us-media'
          and not exists (select 1 from public.couples c where (storage.foldername(o.name))[1] = c.id::text)),
      'other_buckets', count(*) filter (where o.bucket_id <> 'us-media'))
    from storage.objects o)
) as sec_s10_data;

-- s11. Realtime authorization (private channels) policies, if the platform table exists.
select jsonb_build_object(
  'realtime_messages_exists', to_regclass('realtime.messages') is not null,
  'policies', (select jsonb_agg(jsonb_build_object('p', policyname, 'cmd', cmd, 'roles', roles,
                 'using', qual, 'check', with_check) order by policyname)
               from pg_policies where schemaname = 'realtime')
) as sec_s11_realtime;

rollback;
