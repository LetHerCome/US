-- US 2.0 F2A.1 — read-only production capture pack (catalog definitions).
--
-- Purpose: capture the exact definitions F2A recorded only as hashes, so the
-- repository baseline (supabase/baseline/) can be generated from production
-- truth instead of being guessed. Every block is ONE SELECT on catalogs,
-- cron/vault metadata, the migration ledger or reference-content tables.
-- Nothing writes. Nothing reads a secret value.
--
-- How to run (same as F2A):
--   * Supabase connector `execute_sql` or Dashboard > SQL Editor: run ONE
--     numbered block at a time and copy the single JSON cell it returns.
--   * The BEGIN READ ONLY / ROLLBACK lines around the file make an accidental
--     write fail if the whole file is run at once.
--
-- Blocks c01–c10b are small or medium (c10b may be ~80 KB). c11a/c11b list every function.
-- c12–c20 hold the full definitions in ~55 KB buckets. A bucket block that
-- returns null is empty: the remaining ones are empty too.
--
-- Secrets: c09 lists vault secret NAMES and descriptions only. The `secret`
-- and `decrypted_secret` columns are never selected.
--
-- Save the results like the F2A evidence, e.g.
--   docs/us-2.0/F2A_1_PRODUCTION_CAPTURE_C01_C10.json
--   docs/us-2.0/F2A_1_PRODUCTION_CAPTURE_FUNCTIONS.json
-- with {"captured_at": ..., "project_id": ..., "blocks": {"c01": {"text": <result>}, ...}}.

begin transaction read only;
set local statement_timeout = '60s';

-- c01. Server, schemas, default privileges, ledger fingerprints.
select jsonb_build_object(
  'server_version', current_setting('server_version'),
  'server_version_num', current_setting('server_version_num')::int,
  -- deparsed SQL (constraints, defaults, policies, views) is printed relative
  -- to this search_path, so the baseline replays under the same one.
  'search_path', current_setting('search_path'),
  'schemas', (select jsonb_agg(jsonb_build_object('s', n.nspname, 'owner', pg_get_userbyid(n.nspowner),
                'acl', n.nspacl::text, 'comment', obj_description(n.oid, 'pg_namespace')) order by n.nspname)
              from pg_namespace n where n.nspname in ('public', 'private')),
  'default_acl', (select jsonb_agg(jsonb_build_object('role', pg_get_userbyid(d.defaclrole),
                'schema', n.nspname, 'objtype', d.defaclobjtype, 'acl', d.defaclacl::text)
                order by pg_get_userbyid(d.defaclrole), n.nspname, d.defaclobjtype)
              from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
              where n.nspname is null or n.nspname in ('public', 'private')),
  'ledger', (select jsonb_agg(jsonb_build_object('v', version, 'n', name,
                'stmts', coalesce(array_length(statements, 1), 0),
                'len', coalesce(length(array_to_string(statements, E'\n')), 0),
                'md5', md5(coalesce(array_to_string(statements, E'\n'), ''))) order by version)
              from supabase_migrations.schema_migrations)
) as f2a1_c01_meta;

-- c02. Tables and columns, part 1 (public tables a..l).
select jsonb_strip_nulls(jsonb_agg(t order by t->>'t')) as f2a1_c02_tables_a from (
  select jsonb_build_object(
    't', n.nspname || '.' || c.relname, 'owner', pg_get_userbyid(c.relowner),
    'rls', c.relrowsecurity, 'force', c.relforcerowsecurity, 'replident', c.relreplident,
    'reloptions', c.reloptions, 'acl', c.relacl::text, 'comment', obj_description(c.oid, 'pg_class'),
    'cols', (select jsonb_agg(jsonb_build_object(
        'n', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'notnull', a.attnotnull,
        'default', pg_get_expr(d.adbin, d.adrelid), 'identity', nullif(a.attidentity, ''),
        'generated', nullif(a.attgenerated, ''),
        'collation', case when a.attcollation <> 0 and a.attcollation <> (select typcollation from pg_type where oid = a.atttypid)
                          then (select collname from pg_collation where oid = a.attcollation) end,
        'acl', a.attacl::text, 'comment', col_description(c.oid, a.attnum)) order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)) as t
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and n.nspname = 'public' and c.relname < 'm'
) s;

-- c03. Tables and columns, part 2 (public tables m..z, and private).
select jsonb_strip_nulls(jsonb_agg(t order by t->>'t')) as f2a1_c03_tables_b from (
  select jsonb_build_object(
    't', n.nspname || '.' || c.relname, 'owner', pg_get_userbyid(c.relowner),
    'rls', c.relrowsecurity, 'force', c.relforcerowsecurity, 'replident', c.relreplident,
    'reloptions', c.reloptions, 'acl', c.relacl::text, 'comment', obj_description(c.oid, 'pg_class'),
    'cols', (select jsonb_agg(jsonb_build_object(
        'n', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'notnull', a.attnotnull,
        'default', pg_get_expr(d.adbin, d.adrelid), 'identity', nullif(a.attidentity, ''),
        'generated', nullif(a.attgenerated, ''),
        'collation', case when a.attcollation <> 0 and a.attcollation <> (select typcollation from pg_type where oid = a.atttypid)
                          then (select collname from pg_collation where oid = a.attcollation) end,
        'acl', a.attacl::text, 'comment', col_description(c.oid, a.attnum)) order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped)) as t
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and ((n.nspname = 'public' and c.relname >= 'm') or n.nspname = 'private')
) s;

-- c04. Every table constraint (PK, FK with actions, UNIQUE, CHECK, EXCLUDE).
select jsonb_agg(jsonb_build_object(
  't', n.nspname || '.' || c.relname, 'con', k.conname, 'type', k.contype,
  'def', pg_get_constraintdef(k.oid)) order by n.nspname, c.relname, k.contype, k.conname) as f2a1_c04_constraints
from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'private') and c.relkind in ('r', 'p');

-- c05. Indexes that do not back a constraint, plus non-public-schema triggers
--      that call public/private functions, plus every public/private trigger.
select jsonb_build_object(
  'indexes', (select jsonb_agg(jsonb_build_object('t', n.nspname || '.' || c.relname, 'i', i.relname,
                'def', pg_get_indexdef(x.indexrelid)) order by n.nspname, c.relname, i.relname)
              from pg_index x join pg_class i on i.oid = x.indexrelid join pg_class c on c.oid = x.indrelid
              join pg_namespace n on n.oid = c.relnamespace
              where n.nspname in ('public', 'private')
                and not exists (select 1 from pg_constraint k where k.conindid = x.indexrelid and k.conrelid = x.indrelid)),
  'triggers', (select jsonb_agg(jsonb_build_object('t', n.nspname || '.' || c.relname, 'trg', t.tgname,
                 'enabled', t.tgenabled, 'def', pg_get_triggerdef(t.oid)) order by n.nspname, c.relname, t.tgname)
               from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
               join pg_proc p on p.oid = t.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
               where not t.tgisinternal
                 and (n.nspname in ('public', 'private') or pn.nspname in ('public', 'private')))
) as f2a1_c05_indexes_triggers;

-- c06. RLS policies with full expressions (public, private, storage, realtime).
select jsonb_agg(jsonb_build_object(
  't', schemaname || '.' || tablename, 'p', policyname, 'cmd', cmd, 'roles', roles::text,
  'perm', permissive, 'qual', qual, 'with_check', with_check)
  order by schemaname, tablename, policyname) as f2a1_c06_policies
from pg_policies where schemaname in ('public', 'private', 'storage', 'realtime');

-- c07. Views, sequences and standalone types in public/private.
select jsonb_build_object(
  'views', (select jsonb_agg(jsonb_build_object('v', n.nspname || '.' || c.relname, 'owner', pg_get_userbyid(c.relowner),
              'reloptions', c.reloptions, 'acl', c.relacl::text, 'def', pg_get_viewdef(c.oid, false)) order by 1)
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where c.relkind in ('v', 'm') and n.nspname in ('public', 'private')),
  'sequences', (select jsonb_agg(jsonb_build_object('s', n.nspname || '.' || c.relname, 'acl', c.relacl::text,
                  'owned_by', (select r.relname || '.' || a.attname from pg_depend d join pg_class r on r.oid = d.refobjid
                               join pg_attribute a on a.attrelid = r.oid and a.attnum = d.refobjsubid
                               where d.objid = c.oid and d.deptype in ('a', 'i') limit 1)) order by 1)
                from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where c.relkind = 'S' and n.nspname in ('public', 'private')),
  'types', (select jsonb_agg(jsonb_build_object('type', n.nspname || '.' || t.typname, 'kind', t.typtype,
              'owner', pg_get_userbyid(t.typowner), 'acl', t.typacl::text, 'comment', obj_description(t.oid, 'pg_type'),
              'attributes', case when t.typtype = 'c' then (select jsonb_agg(jsonb_build_object('n', a.attname,
                  'type', format_type(a.atttypid, a.atttypmod)) order by a.attnum)
                from pg_attribute a where a.attrelid = t.typrelid and a.attnum > 0 and not a.attisdropped) end,
              'labels', case when t.typtype = 'e' then (select jsonb_agg(e.enumlabel order by e.enumsortorder)
                from pg_enum e where e.enumtypid = t.oid) end,
              'domain', case when t.typtype = 'd' then jsonb_build_object('base', format_type(t.typbasetype, t.typtypmod),
                'notnull', t.typnotnull, 'default', t.typdefault,
                'checks', (select jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname) from pg_constraint k where k.contypid = t.oid)) end)
              order by n.nspname, t.typname)
            from pg_type t join pg_namespace n on n.oid = t.typnamespace
            where n.nspname in ('public', 'private')
              and (t.typtype in ('e', 'd', 'r', 'm')
                   or (t.typtype = 'c' and (select relkind from pg_class where oid = t.typrelid) = 'c')))
) as f2a1_c07_views_sequences_types;

-- c08. Realtime publication and storage configuration.
select jsonb_build_object(
  'publication', (select jsonb_agg(jsonb_build_object('pub', pubname, 'owner', pg_get_userbyid(pubowner),
                    'alltables', puballtables, 'ins', pubinsert, 'upd', pubupdate, 'del', pubdelete,
                    'trunc', pubtruncate, 'viaroot', pubviaroot) order by pubname)
                  from pg_publication where pubname = 'supabase_realtime'),
  'members', (select jsonb_agg(jsonb_build_object('t', p.schemaname || '.' || p.tablename,
                'attnames', p.attnames, 'rowfilter', p.rowfilter,
                'replident', (select c.relreplident from pg_class c join pg_namespace n on n.oid = c.relnamespace
                              where n.nspname = p.schemaname and c.relname = p.tablename))
                order by p.schemaname, p.tablename)
              from pg_publication_tables p where p.pubname = 'supabase_realtime'),
  'buckets', (select jsonb_agg(to_jsonb(b) - 'owner' - 'owner_id' - 'created_at' - 'updated_at' order by b.id)
              from storage.buckets b)
) as f2a1_c08_realtime_storage;

-- c09. Cron jobs (full) and vault secret NAMES (never values).
select jsonb_build_object(
  'jobs', (select jsonb_agg(jsonb_build_object('id', jobid, 'name', jobname, 'schedule', schedule,
             'command', command, 'database', database, 'username', username, 'active', active) order by jobid)
           from cron.job),
  'vault', (select jsonb_agg(jsonb_build_object('name', name, 'description', description) order by name)
            from vault.secrets)
) as f2a1_c09_cron_vault;

-- c10. Reference content: Quest templates in full; fingerprints for the
--      other catalog/seed tables; applied ledger SQL for m6d and monthiversary.
select jsonb_build_object(
  'bond_quest_templates', (select jsonb_agg(to_jsonb(q) order by to_jsonb(q)::text) from public.bond_quest_templates q),
  'content_fingerprints', jsonb_build_object(
    'bond_quest_templates', (select jsonb_build_object('n', count(*), 'md5', md5(string_agg(x::text, '|' order by x::text))) from public.bond_quest_templates x),
    'daily_question_templates', (select jsonb_build_object('n', count(*), 'md5', md5(string_agg(x::text, '|' order by x::text))) from public.daily_question_templates x),
    'game_v2_catalog', (select jsonb_build_object('n', count(*), 'md5', md5(string_agg(x::text, '|' order by x::text))) from public.game_v2_catalog x),
    'game_v2_recipes', (select jsonb_build_object('n', count(*), 'md5', md5(string_agg(x::text, '|' order by x::text))) from public.game_v2_recipes x),
    'progression_reward_catalog', (select jsonb_build_object('n', count(*), 'md5', md5(string_agg(x::text, '|' order by x::text))) from public.progression_reward_catalog x),
    'game_swipe_v1_catalog', (select jsonb_build_object('n', count(*), 'md5', md5(string_agg(x::text, '|' order by x::text))) from private.game_swipe_v1_catalog x),
    'quiz_sets', (select jsonb_build_object('n', count(*), 'md5', md5(string_agg(x::text, '|' order by x::text))) from public.quiz_sets x),
    'quiz_questions', (select jsonb_build_object('n', count(*), 'md5', md5(string_agg(x::text, '|' order by x::text))) from public.quiz_questions x)),
  'ledger_sql', (select jsonb_agg(jsonb_build_object('v', version, 'n', name, 'statements', statements) order by version)
                 from supabase_migrations.schema_migrations
                 where version in ('20260928210000', '20260820181734', '20260820181751'))
) as f2a1_c10_content;

-- c10b. Full content of the catalog tables that repo migrations seed, so the
--       baseline can carry them after the old migrations become history-only.
select jsonb_build_object(
  'game_v2_catalog', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.game_v2_catalog x),
  'game_v2_recipes', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.game_v2_recipes x),
  'daily_question_templates', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.daily_question_templates x),
  'progression_reward_catalog', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from public.progression_reward_catalog x),
  'game_swipe_v1_catalog', (select jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text) from private.game_swipe_v1_catalog x)
) as f2a1_c10b_catalog_content;

-- c11a. Function manifest, public: header attributes, hashes, and the bucket
--       each definition falls in (buckets are computed over all functions).
with f as (
  select p.oid, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
         length(pg_get_functiondef(p.oid)) as len
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
), b as (
  select f.*, (sum(len) over (order by sig rows unbounded preceding) / 55000)::int as bucket from f
)
select jsonb_strip_nulls(jsonb_agg(jsonb_build_object(
  'f', b.sig, 'bucket', b.bucket, 'len', b.len, 'owner', pg_get_userbyid(p.proowner),
  'lang', (select lanname from pg_language where oid = p.prolang), 'returns', pg_get_function_result(p.oid),
  'args', pg_get_function_arguments(p.oid), 'volatile', p.provolatile, 'strict', p.proisstrict,
  'parallel', p.proparallel, 'leakproof', p.proleakproof, 'cost', p.procost, 'rows', p.prorows,
  'sd', p.prosecdef, 'cfg', p.proconfig, 'acl', p.proacl::text, 'comment', obj_description(p.oid, 'pg_proc'),
  'body_md5', md5(p.prosrc), 'def_md5', md5(pg_get_functiondef(p.oid))) order by b.sig)) as f2a1_c11a_function_manifest_public
from b join pg_proc p on p.oid = b.oid
where b.sig like 'public.%';

-- c11b. Function manifest, private (same columns).
with f as (
  select p.oid, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
         length(pg_get_functiondef(p.oid)) as len
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
), b as (
  select f.*, (sum(len) over (order by sig rows unbounded preceding) / 55000)::int as bucket from f
)
select jsonb_strip_nulls(jsonb_agg(jsonb_build_object(
  'f', b.sig, 'bucket', b.bucket, 'len', b.len, 'owner', pg_get_userbyid(p.proowner),
  'lang', (select lanname from pg_language where oid = p.prolang), 'returns', pg_get_function_result(p.oid),
  'args', pg_get_function_arguments(p.oid), 'volatile', p.provolatile, 'strict', p.proisstrict,
  'parallel', p.proparallel, 'leakproof', p.proleakproof, 'cost', p.procost, 'rows', p.prorows,
  'sd', p.prosecdef, 'cfg', p.proconfig, 'acl', p.proacl::text, 'comment', obj_description(p.oid, 'pg_proc'),
  'body_md5', md5(p.prosrc), 'def_md5', md5(pg_get_functiondef(p.oid))) order by b.sig)) as f2a1_c11b_function_manifest_private
from b join pg_proc p on p.oid = b.oid
where b.sig like 'private.%';

-- c12. Full function definitions (pg_get_functiondef), bucket 0.
with f as (
  select p.oid, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
         length(pg_get_functiondef(p.oid)) as len
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
), b as (
  select f.*, (sum(len) over (order by sig rows unbounded preceding) / 55000)::int as bucket from f
)
select jsonb_agg(jsonb_build_object('f', b.sig, 'def', pg_get_functiondef(b.oid)) order by b.sig) as f2a1_c12_functions
from b
where b.bucket = 0;

-- c13. Full function definitions (pg_get_functiondef), bucket 1.  Null = empty, stop here.
with f as (
  select p.oid, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
         length(pg_get_functiondef(p.oid)) as len
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
), b as (
  select f.*, (sum(len) over (order by sig rows unbounded preceding) / 55000)::int as bucket from f
)
select jsonb_agg(jsonb_build_object('f', b.sig, 'def', pg_get_functiondef(b.oid)) order by b.sig) as f2a1_c13_functions
from b
where b.bucket = 1;

-- c14. Full function definitions (pg_get_functiondef), bucket 2.  Null = empty, stop here.
with f as (
  select p.oid, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
         length(pg_get_functiondef(p.oid)) as len
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
), b as (
  select f.*, (sum(len) over (order by sig rows unbounded preceding) / 55000)::int as bucket from f
)
select jsonb_agg(jsonb_build_object('f', b.sig, 'def', pg_get_functiondef(b.oid)) order by b.sig) as f2a1_c14_functions
from b
where b.bucket = 2;

-- c15. Full function definitions (pg_get_functiondef), bucket 3.  Null = empty, stop here.
with f as (
  select p.oid, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
         length(pg_get_functiondef(p.oid)) as len
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
), b as (
  select f.*, (sum(len) over (order by sig rows unbounded preceding) / 55000)::int as bucket from f
)
select jsonb_agg(jsonb_build_object('f', b.sig, 'def', pg_get_functiondef(b.oid)) order by b.sig) as f2a1_c15_functions
from b
where b.bucket = 3;

-- c16. Full function definitions (pg_get_functiondef), bucket 4.  Null = empty, stop here.
with f as (
  select p.oid, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
         length(pg_get_functiondef(p.oid)) as len
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
), b as (
  select f.*, (sum(len) over (order by sig rows unbounded preceding) / 55000)::int as bucket from f
)
select jsonb_agg(jsonb_build_object('f', b.sig, 'def', pg_get_functiondef(b.oid)) order by b.sig) as f2a1_c16_functions
from b
where b.bucket = 4;

-- c17. Full function definitions (pg_get_functiondef), bucket 5.  Null = empty, stop here.
with f as (
  select p.oid, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
         length(pg_get_functiondef(p.oid)) as len
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
), b as (
  select f.*, (sum(len) over (order by sig rows unbounded preceding) / 55000)::int as bucket from f
)
select jsonb_agg(jsonb_build_object('f', b.sig, 'def', pg_get_functiondef(b.oid)) order by b.sig) as f2a1_c17_functions
from b
where b.bucket = 5;

-- c18. Full function definitions (pg_get_functiondef), bucket 6.  Null = empty, stop here.
with f as (
  select p.oid, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
         length(pg_get_functiondef(p.oid)) as len
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
), b as (
  select f.*, (sum(len) over (order by sig rows unbounded preceding) / 55000)::int as bucket from f
)
select jsonb_agg(jsonb_build_object('f', b.sig, 'def', pg_get_functiondef(b.oid)) order by b.sig) as f2a1_c18_functions
from b
where b.bucket = 6;

-- c19. Full function definitions (pg_get_functiondef), bucket 7.  Null = empty, stop here.
with f as (
  select p.oid, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
         length(pg_get_functiondef(p.oid)) as len
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
), b as (
  select f.*, (sum(len) over (order by sig rows unbounded preceding) / 55000)::int as bucket from f
)
select jsonb_agg(jsonb_build_object('f', b.sig, 'def', pg_get_functiondef(b.oid)) order by b.sig) as f2a1_c19_functions
from b
where b.bucket = 7;

-- c20. Full function definitions (pg_get_functiondef), bucket >= 8.  Null = empty, stop here.
with f as (
  select p.oid, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig,
         length(pg_get_functiondef(p.oid)) as len
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prokind = 'f'
), b as (
  select f.*, (sum(len) over (order by sig rows unbounded preceding) / 55000)::int as bucket from f
)
select jsonb_agg(jsonb_build_object('f', b.sig, 'def', pg_get_functiondef(b.oid)) order by b.sig) as f2a1_c20_functions
from b
where b.bucket >= 8;

rollback;
