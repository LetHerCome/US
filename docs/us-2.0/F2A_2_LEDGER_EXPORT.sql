-- US 2.0 F2A.2 — read-only export of the production migration ledger.
--
-- Purpose: F2A.2 step 3. The ledger repair (step 5) deletes the 83 current
-- rows of supabase_migrations.schema_migrations, and with them the only copy
-- of the SQL production recorded for each version. This pack exports every
-- row first, with secret-shaped text masked INSIDE the database, so the
-- repository keeps what ran as provenance (supabase/migrations_history/ledger/).
-- Nothing writes. Nothing reads a vault value.
--
-- Masking (applied to every statement, in this order):
--   * JWTs (eyJ….….…)                         -> <redacted-jwt>
--   * sb_secret_… / sb_publishable_… keys       -> <redacted-sb-key>
--   * the F2A.1 c10 rule: a quoted literal of 20+ key characters with a digit
--                                              -> '<redacted>'
--   * 32+ hex characters                       -> <redacted-hex>
--   * 32+ key characters mixing upper case, lower case and digits
--                                              -> <redacted-token>
-- 'redacted' counts the placeholders added; 'md5' is of the unmasked text so
-- every row can be matched with F2A.1 c01 without exposing it.
--
-- How to run: like the F2A.1 pack, ONE block at a time through the Supabase
-- connector (execute_sql) or the SQL Editor; copy the single JSON cell. Blocks
-- are ~55 KB buckets in version order; a block that returns null is empty and
-- so are the ones after it. Save as
--   docs/us-2.0/F2A_2_LEDGER_EXPORT_*.json
-- with {"captured_at": ..., "project_id": ..., "mode": "production-read-only",
--       "blocks": {"l00": {"text": <result>}, ...}}.

begin transaction read only;
set local statement_timeout = '60s';

-- l00. Ledger table shape (the CLI version decides its columns).
select jsonb_build_object(
  'columns', (select jsonb_agg(jsonb_build_object('c', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
                'notnull', a.attnotnull) order by a.attnum)
              from pg_attribute a where a.attrelid = 'supabase_migrations.schema_migrations'::regclass and a.attnum > 0 and not a.attisdropped),
  'rows', (select count(*) from supabase_migrations.schema_migrations),
  'tip', (select max(version) from supabase_migrations.schema_migrations)
) as f2a2_l00_shape;

-- l01. Ledger rows in bucket 0.
select jsonb_agg(jsonb_build_object(
    'v', r.version, 'n', r.name,
    'stmts', coalesce(array_length(r.statements, 1), 0),
    'len', coalesce(length(array_to_string(r.statements, E'\n')), 0),
    -- md5 of the UNMASKED text, equal to F2A.1 c01: proves which row this is.
    'md5', md5(coalesce(array_to_string(r.statements, E'\n'), '')),
    'redacted', (select coalesce(sum((length(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g')) - length(replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g'), '<redacted', '')))
                                     - (length(st) - length(replace(st, '<redacted', '')))), 0) / length('<redacted')
                 from unnest(r.statements) as u(st)),
    'statements', (select jsonb_agg(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g') order by i)
                   from unnest(r.statements) with ordinality as u(st, i)),
    'other_columns', to_jsonb(r) - 'version' - 'name' - 'statements'
  ) order by r.version) as f2a2_l01_ledger
from (
  select m.*, (sum(coalesce(length(array_to_string(m.statements, E'\n')), 0)) over (order by m.version)
               - coalesce(length(array_to_string(m.statements, E'\n')), 0)) / 55000 as bucket
  from supabase_migrations.schema_migrations m
) r
where r.bucket = 0;

-- l02. Ledger rows in bucket 1.
select jsonb_agg(jsonb_build_object(
    'v', r.version, 'n', r.name,
    'stmts', coalesce(array_length(r.statements, 1), 0),
    'len', coalesce(length(array_to_string(r.statements, E'\n')), 0),
    -- md5 of the UNMASKED text, equal to F2A.1 c01: proves which row this is.
    'md5', md5(coalesce(array_to_string(r.statements, E'\n'), '')),
    'redacted', (select coalesce(sum((length(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g')) - length(replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g'), '<redacted', '')))
                                     - (length(st) - length(replace(st, '<redacted', '')))), 0) / length('<redacted')
                 from unnest(r.statements) as u(st)),
    'statements', (select jsonb_agg(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g') order by i)
                   from unnest(r.statements) with ordinality as u(st, i)),
    'other_columns', to_jsonb(r) - 'version' - 'name' - 'statements'
  ) order by r.version) as f2a2_l02_ledger
from (
  select m.*, (sum(coalesce(length(array_to_string(m.statements, E'\n')), 0)) over (order by m.version)
               - coalesce(length(array_to_string(m.statements, E'\n')), 0)) / 55000 as bucket
  from supabase_migrations.schema_migrations m
) r
where r.bucket = 1;

-- l03. Ledger rows in bucket 2.
select jsonb_agg(jsonb_build_object(
    'v', r.version, 'n', r.name,
    'stmts', coalesce(array_length(r.statements, 1), 0),
    'len', coalesce(length(array_to_string(r.statements, E'\n')), 0),
    -- md5 of the UNMASKED text, equal to F2A.1 c01: proves which row this is.
    'md5', md5(coalesce(array_to_string(r.statements, E'\n'), '')),
    'redacted', (select coalesce(sum((length(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g')) - length(replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g'), '<redacted', '')))
                                     - (length(st) - length(replace(st, '<redacted', '')))), 0) / length('<redacted')
                 from unnest(r.statements) as u(st)),
    'statements', (select jsonb_agg(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g') order by i)
                   from unnest(r.statements) with ordinality as u(st, i)),
    'other_columns', to_jsonb(r) - 'version' - 'name' - 'statements'
  ) order by r.version) as f2a2_l03_ledger
from (
  select m.*, (sum(coalesce(length(array_to_string(m.statements, E'\n')), 0)) over (order by m.version)
               - coalesce(length(array_to_string(m.statements, E'\n')), 0)) / 55000 as bucket
  from supabase_migrations.schema_migrations m
) r
where r.bucket = 2;

-- l04. Ledger rows in bucket 3.
select jsonb_agg(jsonb_build_object(
    'v', r.version, 'n', r.name,
    'stmts', coalesce(array_length(r.statements, 1), 0),
    'len', coalesce(length(array_to_string(r.statements, E'\n')), 0),
    -- md5 of the UNMASKED text, equal to F2A.1 c01: proves which row this is.
    'md5', md5(coalesce(array_to_string(r.statements, E'\n'), '')),
    'redacted', (select coalesce(sum((length(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g')) - length(replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g'), '<redacted', '')))
                                     - (length(st) - length(replace(st, '<redacted', '')))), 0) / length('<redacted')
                 from unnest(r.statements) as u(st)),
    'statements', (select jsonb_agg(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g') order by i)
                   from unnest(r.statements) with ordinality as u(st, i)),
    'other_columns', to_jsonb(r) - 'version' - 'name' - 'statements'
  ) order by r.version) as f2a2_l04_ledger
from (
  select m.*, (sum(coalesce(length(array_to_string(m.statements, E'\n')), 0)) over (order by m.version)
               - coalesce(length(array_to_string(m.statements, E'\n')), 0)) / 55000 as bucket
  from supabase_migrations.schema_migrations m
) r
where r.bucket = 3;

-- l05. Ledger rows in bucket 4.
select jsonb_agg(jsonb_build_object(
    'v', r.version, 'n', r.name,
    'stmts', coalesce(array_length(r.statements, 1), 0),
    'len', coalesce(length(array_to_string(r.statements, E'\n')), 0),
    -- md5 of the UNMASKED text, equal to F2A.1 c01: proves which row this is.
    'md5', md5(coalesce(array_to_string(r.statements, E'\n'), '')),
    'redacted', (select coalesce(sum((length(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g')) - length(replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g'), '<redacted', '')))
                                     - (length(st) - length(replace(st, '<redacted', '')))), 0) / length('<redacted')
                 from unnest(r.statements) as u(st)),
    'statements', (select jsonb_agg(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g') order by i)
                   from unnest(r.statements) with ordinality as u(st, i)),
    'other_columns', to_jsonb(r) - 'version' - 'name' - 'statements'
  ) order by r.version) as f2a2_l05_ledger
from (
  select m.*, (sum(coalesce(length(array_to_string(m.statements, E'\n')), 0)) over (order by m.version)
               - coalesce(length(array_to_string(m.statements, E'\n')), 0)) / 55000 as bucket
  from supabase_migrations.schema_migrations m
) r
where r.bucket = 4;

-- l06. Ledger rows in bucket 5.
select jsonb_agg(jsonb_build_object(
    'v', r.version, 'n', r.name,
    'stmts', coalesce(array_length(r.statements, 1), 0),
    'len', coalesce(length(array_to_string(r.statements, E'\n')), 0),
    -- md5 of the UNMASKED text, equal to F2A.1 c01: proves which row this is.
    'md5', md5(coalesce(array_to_string(r.statements, E'\n'), '')),
    'redacted', (select coalesce(sum((length(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g')) - length(replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g'), '<redacted', '')))
                                     - (length(st) - length(replace(st, '<redacted', '')))), 0) / length('<redacted')
                 from unnest(r.statements) as u(st)),
    'statements', (select jsonb_agg(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g') order by i)
                   from unnest(r.statements) with ordinality as u(st, i)),
    'other_columns', to_jsonb(r) - 'version' - 'name' - 'statements'
  ) order by r.version) as f2a2_l06_ledger
from (
  select m.*, (sum(coalesce(length(array_to_string(m.statements, E'\n')), 0)) over (order by m.version)
               - coalesce(length(array_to_string(m.statements, E'\n')), 0)) / 55000 as bucket
  from supabase_migrations.schema_migrations m
) r
where r.bucket = 5;

-- l07. Ledger rows in bucket 6.
select jsonb_agg(jsonb_build_object(
    'v', r.version, 'n', r.name,
    'stmts', coalesce(array_length(r.statements, 1), 0),
    'len', coalesce(length(array_to_string(r.statements, E'\n')), 0),
    -- md5 of the UNMASKED text, equal to F2A.1 c01: proves which row this is.
    'md5', md5(coalesce(array_to_string(r.statements, E'\n'), '')),
    'redacted', (select coalesce(sum((length(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g')) - length(replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g'), '<redacted', '')))
                                     - (length(st) - length(replace(st, '<redacted', '')))), 0) / length('<redacted')
                 from unnest(r.statements) as u(st)),
    'statements', (select jsonb_agg(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g') order by i)
                   from unnest(r.statements) with ordinality as u(st, i)),
    'other_columns', to_jsonb(r) - 'version' - 'name' - 'statements'
  ) order by r.version) as f2a2_l07_ledger
from (
  select m.*, (sum(coalesce(length(array_to_string(m.statements, E'\n')), 0)) over (order by m.version)
               - coalesce(length(array_to_string(m.statements, E'\n')), 0)) / 55000 as bucket
  from supabase_migrations.schema_migrations m
) r
where r.bucket = 6;

-- l08. Ledger rows in bucket 7.
select jsonb_agg(jsonb_build_object(
    'v', r.version, 'n', r.name,
    'stmts', coalesce(array_length(r.statements, 1), 0),
    'len', coalesce(length(array_to_string(r.statements, E'\n')), 0),
    -- md5 of the UNMASKED text, equal to F2A.1 c01: proves which row this is.
    'md5', md5(coalesce(array_to_string(r.statements, E'\n'), '')),
    'redacted', (select coalesce(sum((length(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g')) - length(replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g'), '<redacted', '')))
                                     - (length(st) - length(replace(st, '<redacted', '')))), 0) / length('<redacted')
                 from unnest(r.statements) as u(st)),
    'statements', (select jsonb_agg(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g') order by i)
                   from unnest(r.statements) with ordinality as u(st, i)),
    'other_columns', to_jsonb(r) - 'version' - 'name' - 'statements'
  ) order by r.version) as f2a2_l08_ledger
from (
  select m.*, (sum(coalesce(length(array_to_string(m.statements, E'\n')), 0)) over (order by m.version)
               - coalesce(length(array_to_string(m.statements, E'\n')), 0)) / 55000 as bucket
  from supabase_migrations.schema_migrations m
) r
where r.bucket = 7;

-- l09. Ledger rows in bucket 8.
select jsonb_agg(jsonb_build_object(
    'v', r.version, 'n', r.name,
    'stmts', coalesce(array_length(r.statements, 1), 0),
    'len', coalesce(length(array_to_string(r.statements, E'\n')), 0),
    -- md5 of the UNMASKED text, equal to F2A.1 c01: proves which row this is.
    'md5', md5(coalesce(array_to_string(r.statements, E'\n'), '')),
    'redacted', (select coalesce(sum((length(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g')) - length(replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g'), '<redacted', '')))
                                     - (length(st) - length(replace(st, '<redacted', '')))), 0) / length('<redacted')
                 from unnest(r.statements) as u(st)),
    'statements', (select jsonb_agg(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g') order by i)
                   from unnest(r.statements) with ordinality as u(st, i)),
    'other_columns', to_jsonb(r) - 'version' - 'name' - 'statements'
  ) order by r.version) as f2a2_l09_ledger
from (
  select m.*, (sum(coalesce(length(array_to_string(m.statements, E'\n')), 0)) over (order by m.version)
               - coalesce(length(array_to_string(m.statements, E'\n')), 0)) / 55000 as bucket
  from supabase_migrations.schema_migrations m
) r
where r.bucket = 8;

-- l10. Ledger rows in bucket 9.
select jsonb_agg(jsonb_build_object(
    'v', r.version, 'n', r.name,
    'stmts', coalesce(array_length(r.statements, 1), 0),
    'len', coalesce(length(array_to_string(r.statements, E'\n')), 0),
    -- md5 of the UNMASKED text, equal to F2A.1 c01: proves which row this is.
    'md5', md5(coalesce(array_to_string(r.statements, E'\n'), '')),
    'redacted', (select coalesce(sum((length(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g')) - length(replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g'), '<redacted', '')))
                                     - (length(st) - length(replace(st, '<redacted', '')))), 0) / length('<redacted')
                 from unnest(r.statements) as u(st)),
    'statements', (select jsonb_agg(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g') order by i)
                   from unnest(r.statements) with ordinality as u(st, i)),
    'other_columns', to_jsonb(r) - 'version' - 'name' - 'statements'
  ) order by r.version) as f2a2_l10_ledger
from (
  select m.*, (sum(coalesce(length(array_to_string(m.statements, E'\n')), 0)) over (order by m.version)
               - coalesce(length(array_to_string(m.statements, E'\n')), 0)) / 55000 as bucket
  from supabase_migrations.schema_migrations m
) r
where r.bucket = 9;

-- l11. Ledger rows in bucket 10.
select jsonb_agg(jsonb_build_object(
    'v', r.version, 'n', r.name,
    'stmts', coalesce(array_length(r.statements, 1), 0),
    'len', coalesce(length(array_to_string(r.statements, E'\n')), 0),
    -- md5 of the UNMASKED text, equal to F2A.1 c01: proves which row this is.
    'md5', md5(coalesce(array_to_string(r.statements, E'\n'), '')),
    'redacted', (select coalesce(sum((length(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g')) - length(replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g'), '<redacted', '')))
                                     - (length(st) - length(replace(st, '<redacted', '')))), 0) / length('<redacted')
                 from unnest(r.statements) as u(st)),
    'statements', (select jsonb_agg(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g') order by i)
                   from unnest(r.statements) with ordinality as u(st, i)),
    'other_columns', to_jsonb(r) - 'version' - 'name' - 'statements'
  ) order by r.version) as f2a2_l11_ledger
from (
  select m.*, (sum(coalesce(length(array_to_string(m.statements, E'\n')), 0)) over (order by m.version)
               - coalesce(length(array_to_string(m.statements, E'\n')), 0)) / 55000 as bucket
  from supabase_migrations.schema_migrations m
) r
where r.bucket = 10;

-- l12. Ledger rows in bucket 11.
select jsonb_agg(jsonb_build_object(
    'v', r.version, 'n', r.name,
    'stmts', coalesce(array_length(r.statements, 1), 0),
    'len', coalesce(length(array_to_string(r.statements, E'\n')), 0),
    -- md5 of the UNMASKED text, equal to F2A.1 c01: proves which row this is.
    'md5', md5(coalesce(array_to_string(r.statements, E'\n'), '')),
    'redacted', (select coalesce(sum((length(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g')) - length(replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g'), '<redacted', '')))
                                     - (length(st) - length(replace(st, '<redacted', '')))), 0) / length('<redacted')
                 from unnest(r.statements) as u(st)),
    'statements', (select jsonb_agg(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g') order by i)
                   from unnest(r.statements) with ordinality as u(st, i)),
    'other_columns', to_jsonb(r) - 'version' - 'name' - 'statements'
  ) order by r.version) as f2a2_l12_ledger
from (
  select m.*, (sum(coalesce(length(array_to_string(m.statements, E'\n')), 0)) over (order by m.version)
               - coalesce(length(array_to_string(m.statements, E'\n')), 0)) / 55000 as bucket
  from supabase_migrations.schema_migrations m
) r
where r.bucket = 11;

-- l13. Ledger rows in bucket 12 and later (expected null).
select jsonb_agg(jsonb_build_object(
    'v', r.version, 'n', r.name,
    'stmts', coalesce(array_length(r.statements, 1), 0),
    'len', coalesce(length(array_to_string(r.statements, E'\n')), 0),
    -- md5 of the UNMASKED text, equal to F2A.1 c01: proves which row this is.
    'md5', md5(coalesce(array_to_string(r.statements, E'\n'), '')),
    'redacted', (select coalesce(sum((length(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g')) - length(replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g'), '<redacted', '')))
                                     - (length(st) - length(replace(st, '<redacted', '')))), 0) / length('<redacted')
                 from unnest(r.statements) as u(st)),
    'statements', (select jsonb_agg(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(st,
        'eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}', '<redacted-jwt>', 'g'),
        'sb_(secret|publishable)_[A-Za-z0-9_-]{8,}', '<redacted-sb-key>', 'g'),
        '''(?=[^'']*[0-9])[A-Za-z0-9+/=_-]{20,}''', '''<redacted>''', 'g'),
        '\m[0-9A-Fa-f]{32,}\M', '<redacted-hex>', 'g'),
        '(?=[A-Za-z0-9+/=_-]*[A-Z])(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[0-9])[A-Za-z0-9+/=_-]{32,}', '<redacted-token>', 'g') order by i)
                   from unnest(r.statements) with ordinality as u(st, i)),
    'other_columns', to_jsonb(r) - 'version' - 'name' - 'statements'
  ) order by r.version) as f2a2_l13_ledger
from (
  select m.*, (sum(coalesce(length(array_to_string(m.statements, E'\n')), 0)) over (order by m.version)
               - coalesce(length(array_to_string(m.statements, E'\n')), 0)) / 55000 as bucket
  from supabase_migrations.schema_migrations m
) r
where r.bucket >= 12;

rollback;
