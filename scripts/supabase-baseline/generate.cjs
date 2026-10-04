// Generates the canonical schema baseline (supabase/baseline/*.sql) from the
// committed production capture. Pure and deterministic: the same capture
// always yields the same bytes, and every statement is printed from a
// production catalog value (pg_get_*def, ACL, column metadata). Nothing is
// written by hand here except the DDL keywords that wrap those values.
const crypto = require('node:crypto');

const ROLES = ['anon', 'authenticated', 'service_role'];
const OWNER = 'postgres';

const RESERVED = new Set(`all analyse analyze and any array as asc asymmetric authorization binary both case cast check
collate collation column concurrently constraint create cross current_catalog current_date current_role current_schema
current_time current_timestamp current_user default deferrable desc distinct do else end except false fetch for foreign
freeze from full grant group having ilike in initially inner intersect into is isnull join lateral leading left like limit
localtime localtimestamp natural not notnull null offset on only or order outer overlaps placing primary references
returning right select session_user similar some symmetric system_user table tablesample then to trailing true union
unique user using variadic verbose when where window with`.split(/\s+/));

function ident(name) {
  if (/^[a-z_][a-z0-9_]*$/.test(name) && !RESERVED.has(name)) return name;
  return `"${name.replace(/"/g, '""')}"`;
}
function qname(qualified) {
  const dot = qualified.indexOf('.');
  return `${ident(qualified.slice(0, dot))}.${ident(qualified.slice(dot + 1))}`;
}
function literal(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
function dollar(text, base) {
  let tag = `$${base}$`;
  for (let i = 1; text.includes(tag); i += 1) tag = `$${base}${i}$`;
  return `${tag}${text}${tag}`;
}
function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// --------------------------------------------------------------- ACLs
const PRIV = { a: 'insert', r: 'select', w: 'update', d: 'delete', D: 'truncate', x: 'references', t: 'trigger', m: 'maintain', X: 'execute', U: 'usage', C: 'create', T: 'temporary', c: 'connect' };
const FULL = { table: 'arwdDxtm', function: 'X', schema: 'UC', sequence: 'rwU', type: 'U' };

function parseAcl(acl) {
  if (acl == null) return null;
  const body = acl.replace(/^\{|\}$/g, '');
  if (!body) return [];
  return body.split(',').map((item) => {
    const m = item.match(/^("?)([^=]*)\1=([a-zA-Z*]*)\/(.+)$/);
    if (!m) throw new Error(`unparseable aclitem ${item}`);
    const privs = [];
    for (let i = 0; i < m[3].length; i += 1) {
      const option = m[3][i + 1] === '*';
      privs.push({ p: m[3][i], option });
      if (option) i += 1;
    }
    return { grantee: m[2] || 'public', privs, grantor: m[4] };
  });
}

// Statements that turn whatever ACL an object starts with (NULL, or the
// Supabase default privileges) into exactly `acl`, item order included:
// revoke every non-owner grantee, then grant in the captured order (PostgreSQL
// appends new grantees, so the order is reproduced).
function aclStatements(kind, object, acl, columns = null) {
  const items = parseAcl(acl);
  if (items === null) return [];
  const on = columns ? `${kind} ${object}` : `${kind} ${object}`;
  const out = [];
  let rest = items;
  if (!columns) {
    // Functions and types start from PostgreSQL's default {=X/owner,owner=X/owner}
    // (PUBLIC first). Keep that prefix when production kept it.
    const keepsPublic = (kind === 'function' || kind === 'type') && items[0] && items[0].grantee === 'public'
      && items[0].privs.map((x) => x.p).join('') === FULL[kind] && items[1] && items[1].grantee === OWNER;
    const ownerItem = keepsPublic ? items[1] : items[0];
    if (!ownerItem || ownerItem.grantee !== OWNER) throw new Error(`${object}: ACL ${acl} does not start with the owner`);
    const owner = ownerItem.privs.map((x) => x.p).join('');
    const full = FULL[kind === 'table' || kind === 'view' ? 'table' : kind];
    if (owner !== full || ownerItem.privs.some((x) => x.option)) throw new Error(`${object}: owner privileges ${owner} are not the default ${full}`);
    out.push(`revoke all on ${on} from ${keepsPublic ? '' : 'public, '}${ROLES.join(', ')};`);
    rest = items.slice(keepsPublic ? 2 : 1);
  }
  for (const item of rest) {
    if (item.grantor !== OWNER) throw new Error(`${object}: grantor ${item.grantor} is not ${OWNER}`);
    if (item.grantee === OWNER) throw new Error(`${object}: owner appears twice in ${acl}`);
    const fullSet = FULL[kind === 'table' || kind === 'view' ? 'table' : kind];
    const letters = (list) => list.map((x) => x.p).join('');
    const words = (list) => (!columns && letters(list) === fullSet ? ['all'] : list.map((x) => PRIV[x.p]));
    const plain = words(item.privs.filter((x) => !x.option));
    const option = item.privs.some((x) => x.option) ? words(item.privs.filter((x) => x.option)) : [];
    const target = item.grantee === 'public' ? 'public' : ident(item.grantee);
    const cols = columns ? ` (${columns})` : '';
    if (plain.length) out.push(`grant ${plain.join(', ')}${cols} on ${on} to ${target};`);
    if (option.length) out.push(`grant ${option.join(', ')}${cols} on ${on} to ${target} with grant option;`);
  }
  return out;
}

// --------------------------------------------------------------- inputs
function requireAlias(capture, alias) {
  if (!capture || !Object.prototype.hasOwnProperty.call(capture, alias)) throw new Error(`capture block ${alias} is missing`);
  return capture[alias];
}

function inputs(capture, f2a) {
  const meta = requireAlias(capture, 'f2a1_c01_meta');
  const tables = [...(requireAlias(capture, 'f2a1_c02_tables_a') || []), ...(requireAlias(capture, 'f2a1_c03_tables_b') || [])]
    .sort((a, b) => a.t.localeCompare(b.t));
  // NOT NULL constraints (contype 'n', PostgreSQL 18+) are carried by the
  // column definitions; production (PostgreSQL 17) does not list them.
  const constraints = (requireAlias(capture, 'f2a1_c04_constraints') || []).filter((k) => k.type !== 'n');
  const c05 = requireAlias(capture, 'f2a1_c05_indexes_triggers') || {};
  const indexes = c05.indexes || [];
  const triggers = c05.triggers || [];
  const policies = requireAlias(capture, 'f2a1_c06_policies') || [];
  const c07 = requireAlias(capture, 'f2a1_c07_views_sequences_types') || {};
  const views = c07.views || [];
  const sequences = c07.sequences || [];
  const types = c07.types || [];
  const realtime = requireAlias(capture, 'f2a1_c08_realtime_storage') || {};
  const cron = requireAlias(capture, 'f2a1_c09_cron_vault') || {};
  const content = requireAlias(capture, 'f2a1_c10_content') || {};
  const catalogs = requireAlias(capture, 'f2a1_c10b_catalog_content') || {};
  const manifest = [...(requireAlias(capture, 'f2a1_c11a_function_manifest_public') || []), ...(requireAlias(capture, 'f2a1_c11b_function_manifest_private') || [])]
    .sort((a, b) => a.f.localeCompare(b.f));
  const defs = new Map();
  for (const [alias, rows] of Object.entries(capture)) {
    if (!/^f2a1_c(1[2-9]|20)_functions$/.test(alias)) continue;
    for (const row of rows || []) {
      if (defs.has(row.f)) throw new Error(`function ${row.f} captured twice`);
      defs.set(row.f, row.def);
    }
  }
  for (const f of manifest) if (!defs.has(f.f)) throw new Error(`function ${f.f} has no captured definition (bucket ${f.bucket})`);
  if (defs.size !== manifest.length) throw new Error(`captured ${defs.size} definitions for ${manifest.length} functions`);
  const unsupported = types.filter((t) => !['c', 'e', 'd'].includes(t.kind));
  if (unsupported.length) throw new Error(`unsupported type kinds: ${unsupported.map((t) => `${t.type}:${t.kind}`).join(', ')}`);
  const extensions = f2a.f2a_09_extensions;
  return { meta, tables, constraints, indexes, triggers, policies, views, sequences, types, realtime, cron, content, catalogs, manifest, defs, extensions };
}

// --------------------------------------------------------------- files
function header(title, lines = []) {
  return [
    `-- US backend baseline: ${title}`,
    '-- GENERATED by scripts/build-supabase-baseline.mjs from the committed',
    '-- production capture (docs/us-2.0/F2A_1_PRODUCTION_CAPTURE*.json).',
    '-- Do not edit by hand: regenerate. Never applied to production by F2A.1.',
    ...lines.map((l) => `-- ${l}`),
    '',
  ].join('\n');
}

function sessionPreamble(searchPath) {
  return [`set check_function_bodies = off;`, `select pg_catalog.set_config('search_path', ${literal(searchPath)}, false);`, ''].join('\n');
}

function extensionsFile(x) {
  const lines = [header('extensions', [
    'Production extensions (F2A b09). On Supabase these are platform-managed;',
    'the rebuild test provides equivalents in its platform skeleton instead.',
  ]), 'create schema if not exists extensions;'];
  for (const e of x.extensions) {
    if (e.ext === 'plpgsql') continue;
    const schema = e.schema === 'pg_catalog' ? 'pg_catalog' : ident(e.schema);
    lines.push(`create extension if not exists ${ident(e.ext)} with schema ${schema} version ${literal(e.v)};`);
  }
  return lines.join('\n') + '\n';
}

function schemasFile(x) {
  const out = [header('schemas')];
  for (const s of x.meta.schemas) {
    if (s.s === 'public') continue; // platform-owned on Supabase
    out.push(`create schema if not exists ${ident(s.s)};`);
    if (s.owner !== OWNER) throw new Error(`schema ${s.s} owner ${s.owner}`);
    if (s.comment) out.push(`comment on schema ${ident(s.s)} is ${literal(s.comment)};`);
    out.push(...schemaAcl(s));
  }
  return out.join('\n') + '\n';
}

function schemaAcl(s) {
  const items = parseAcl(s.acl);
  if (items === null) return [];
  const out = [`revoke all on schema ${ident(s.s)} from public, ${ROLES.join(', ')};`];
  for (const item of items) {
    if (item.grantee === OWNER) continue;
    const plain = item.privs.filter((p) => !p.option).map((p) => PRIV[p.p]);
    if (plain.length) out.push(`grant ${plain.join(', ')} on schema ${ident(s.s)} to ${item.grantee === 'public' ? 'public' : ident(item.grantee)};`);
  }
  return out;
}

function typesFile(x) {
  const out = [header('types', ['Standalone composite, enum and domain types.'])];
  out.push(sessionPreamble(x.meta.search_path));
  for (const t of x.types) {
    if (t.owner !== OWNER) throw new Error(`${t.type}: owner ${t.owner}`);
    if (t.kind === 'c') out.push(`create type ${qname(t.type)} as (\n${t.attributes.map((a) => `  ${ident(a.n)} ${a.type}`).join(',\n')}\n);`);
    else if (t.kind === 'e') out.push(`create type ${qname(t.type)} as enum (${t.labels.map(literal).join(', ')});`);
    else {
      const d = t.domain;
      let sql = `create domain ${qname(t.type)} as ${d.base}`;
      if (d.default != null) sql += ` default ${d.default}`;
      if (d.notnull) sql += ' not null';
      for (const check of d.checks || []) sql += ` ${check}`;
      out.push(`${sql};`);
    }
    if (t.comment) out.push(`comment on type ${qname(t.type)} is ${literal(t.comment)};`);
    out.push(...aclStatements('type', qname(t.type), t.acl));
  }
  return out.join('\n') + '\n';
}

function columnSql(c) {
  let sql = `  ${ident(c.n)} ${c.type}`;
  if (c.collation) sql += ` collate ${ident(c.collation)}`;
  if (c.identity) sql += c.identity === 'a' ? ' generated always as identity' : ' generated by default as identity';
  if (c.generated) sql += ` generated always as (${c.default}) stored`;
  if (c.notnull) sql += ' not null';
  return sql;
}

function tablesFile(x) {
  const out = [header('tables', ['Columns, primary keys, unique and exclusion constraints.', 'CHECK and FOREIGN KEY constraints follow in 40_constraints.sql.'])];
  out.push(sessionPreamble(x.meta.search_path));
  for (const seq of x.sequences.filter((s) => !s.owned_by || !isIdentitySequence(x, s))) {
    out.push(`create sequence if not exists ${qname(seq.s)};`);
  }
  for (const t of x.tables) {
    if (t.owner !== OWNER) throw new Error(`${t.t}: owner ${t.owner}`);
    out.push(`create table ${qname(t.t)} (\n${t.cols.map(columnSql).join(',\n')}\n)${t.reloptions ? ` with (${t.reloptions.join(', ')})` : ''};`);
    if (t.comment) out.push(`comment on table ${qname(t.t)} is ${literal(t.comment)};`);
    for (const c of t.cols) if (c.comment) out.push(`comment on column ${qname(t.t)}.${ident(c.n)} is ${literal(c.comment)};`);
    for (const k of x.constraints.filter((k) => k.t === t.t && ['p', 'u', 'x'].includes(k.type))) {
      out.push(`alter table only ${qname(t.t)} add constraint ${ident(k.con)} ${k.def};`);
    }
    out.push('');
  }
  return out.join('\n');
}

function isIdentitySequence(x, seq) {
  const [table, column] = seq.owned_by.split('.');
  const schema = seq.s.split('.')[0];
  const t = x.tables.find((tt) => tt.t === `${schema}.${table}`);
  return Boolean(t && t.cols.find((c) => c.n === column && c.identity));
}

function functionsFile(x) {
  const out = [header('functions', [`${x.manifest.length} functions, printed with pg_get_functiondef.`, 'Bodies are byte-exact production prosrc (verified by md5 in the rebuild test).'])];
  out.push(sessionPreamble(x.meta.search_path));
  for (const f of x.manifest) {
    if (f.owner !== OWNER) throw new Error(`${f.f}: owner ${f.owner}`);
    out.push(`-- ${f.f}`);
    out.push(`${x.defs.get(f.f).replace(/\n$/, '')};`);
    if (f.comment) out.push(`comment on function ${signature(f.f)} is ${literal(f.comment)};`);
    out.push('');
  }
  return out.join('\n');
}

function signature(sig) {
  const open = sig.indexOf('(');
  return `${qname(sig.slice(0, open))}${sig.slice(open)}`;
}

function defaultsFile(x) {
  const out = [header('column defaults', ['Applied after functions because some defaults call them.'])];
  out.push(sessionPreamble(x.meta.search_path));
  for (const t of x.tables) {
    for (const c of t.cols) {
      if (c.default == null || c.generated || c.identity) continue;
      out.push(`alter table only ${qname(t.t)} alter column ${ident(c.n)} set default ${c.default};`);
    }
  }
  for (const seq of x.sequences.filter((s) => s.owned_by && !isIdentitySequence(x, s))) {
    const [table, column] = seq.owned_by.split('.');
    out.push(`alter sequence ${qname(seq.s)} owned by ${ident(seq.s.split('.')[0])}.${ident(table)}.${ident(column)};`);
  }
  return out.join('\n') + '\n';
}

function constraintsFile(x) {
  const out = [header('constraints', ['CHECK constraints (some call functions), then FOREIGN KEYs.'])];
  out.push(sessionPreamble(x.meta.search_path));
  for (const type of ['c', 'f']) {
    for (const k of x.constraints.filter((kk) => kk.type === type)) {
      out.push(`alter table only ${qname(k.t)} add constraint ${ident(k.con)} ${k.def};`);
    }
  }
  const unknown = x.constraints.filter((k) => !['p', 'u', 'x', 'c', 'f'].includes(k.type));
  if (unknown.length) throw new Error(`unsupported constraint types: ${unknown.map((k) => `${k.con}:${k.type}`).join(', ')}`);
  return out.join('\n') + '\n';
}

function indexesFile(x) {
  const out = [header('indexes', ['Indexes that do not back a constraint (pg_get_indexdef).'])];
  out.push(sessionPreamble(x.meta.search_path));
  for (const i of x.indexes) out.push(`${i.def};`);
  return out.join('\n') + '\n';
}

function viewsFile(x) {
  const out = [header('views')];
  out.push(sessionPreamble(x.meta.search_path));
  for (const v of x.views) {
    if (v.owner !== OWNER) throw new Error(`${v.v}: owner ${v.owner}`);
    const opts = v.reloptions ? ` with (${v.reloptions.join(', ')})` : '';
    out.push(`create view ${qname(v.v)}${opts} as\n${v.def.replace(/;\s*$/, '')};`);
  }
  return out.join('\n') + '\n';
}

function triggersFile(x) {
  const out = [header('triggers', ['pg_get_triggerdef output, including triggers on platform tables that call US functions.'])];
  out.push(sessionPreamble(x.meta.search_path));
  for (const t of x.triggers) {
    out.push(`${t.def};`);
    if (t.enabled === 'D') out.push(`alter table ${qname(t.t)} disable trigger ${ident(t.trg)};`);
    else if (t.enabled !== 'O') throw new Error(`${t.trg}: unsupported trigger state ${t.enabled}`);
  }
  return out.join('\n') + '\n';
}

function policySql(p) {
  const roles = p.roles.replace(/^\{|\}$/g, '').split(',').map((r) => (r === 'public' ? 'public' : ident(r))).join(', ');
  let sql = `create policy ${ident(p.p)} on ${qname(p.t)} as ${p.perm.toLowerCase()} for ${p.cmd.toLowerCase()} to ${roles}`;
  if (p.qual != null) sql += `\n  using (${p.qual})`;
  if (p.with_check != null) sql += `\n  with check (${p.with_check})`;
  return `${sql};`;
}

function rlsFile(x) {
  const out = [header('row level security', ['RLS / FORCE RLS flags and every public and private policy.', 'Storage policies are in 85_storage.sql.'])];
  out.push(sessionPreamble(x.meta.search_path));
  for (const t of x.tables) {
    if (t.rls) out.push(`alter table ${qname(t.t)} enable row level security;`);
    if (t.force) out.push(`alter table ${qname(t.t)} force row level security;`);
  }
  out.push('');
  for (const p of x.policies.filter((pp) => /^(public|private)\./.test(pp.t))) out.push(policySql(p));
  return out.join('\n') + '\n';
}

function grantsFile(x) {
  const out = [header('grants', ['Table, column, view, sequence and function privileges, reproduced item by item', 'from the production ACLs (owner first, then grantees in production order).'])];
  out.push(sessionPreamble(x.meta.search_path));
  for (const t of x.tables) {
    out.push(...aclStatements('table', qname(t.t), t.acl));
    // Column privileges, grouped per grantee/privilege as PostgreSQL stores them per column.
    for (const c of t.cols) {
      if (!c.acl) continue;
      out.push(...aclStatements('table', qname(t.t), c.acl, ident(c.n)));
    }
  }
  for (const v of x.views) out.push(...aclStatements('table', qname(v.v), v.acl));
  for (const s of x.sequences) out.push(...aclStatements('sequence', qname(s.s), s.acl));
  for (const f of x.manifest) out.push(...aclStatements('function', signature(f.f), f.acl));
  return out.join('\n') + '\n';
}

function realtimeFile(x) {
  const out = [header('realtime', ['Membership of publication supabase_realtime (exists on every Supabase project).'])];
  out.push(sessionPreamble(x.meta.search_path));
  const pub = (x.realtime.publication || [])[0];
  if (pub && (pub.alltables || !pub.ins || !pub.upd || !pub.del || !pub.trunc || pub.viaroot)) {
    throw new Error('supabase_realtime has non-default publication options');
  }
  for (const m of x.realtime.members || []) {
    const table = (x.allTables || x.tables).find((t) => t.t === m.t);
    if (!table) throw new Error(`realtime member ${m.t} is not a captured table`);
    const allCols = table.cols.map((c) => c.n);
    const cols = m.attnames && m.attnames.join(',') !== allCols.join(',') ? ` (${m.attnames.map(ident).join(', ')})` : '';
    const where = m.rowfilter ? ` where (${m.rowfilter})` : '';
    out.push(`alter publication supabase_realtime add table only ${qname(m.t)}${cols}${where};`);
  }
  for (const t of x.tables) {
    if (t.replident === 'f') out.push(`alter table ${qname(t.t)} replica identity full;`);
    else if (t.replident === 'n') out.push(`alter table ${qname(t.t)} replica identity nothing;`);
    else if (t.replident !== 'd' && t.replident != null) throw new Error(`${t.t}: replica identity ${t.replident} needs an index name`);
  }
  return out.join('\n') + '\n';
}

function storageFile(x) {
  const out = [header('storage', ['Bucket configuration (no objects) and the storage.objects policies.'])];
  out.push(sessionPreamble(x.meta.search_path));
  for (const b of x.realtime.buckets || []) {
    const keys = Object.keys(b).sort();
    const json = JSON.stringify(Object.fromEntries(keys.map((k) => [k, b[k]])));
    out.push(`insert into storage.buckets (${keys.map(ident).join(', ')})\nselect ${keys.map(ident).join(', ')}\nfrom jsonb_populate_record(null::storage.buckets, ${dollar(json, 'bucket')}::jsonb)\non conflict (id) do update set ${keys.filter((k) => k !== 'id').map((k) => `${ident(k)} = excluded.${ident(k)}`).join(', ')};`);
  }
  for (const p of x.policies.filter((pp) => pp.t.startsWith('storage.'))) out.push(policySql(p));
  const other = x.policies.filter((pp) => !/^(public|private|storage)\./.test(pp.t));
  if (other.length) throw new Error(`policies outside public/private/storage: ${other.map((p) => p.p).join(', ')}`);
  return out.join('\n') + '\n';
}

function cronFile(x) {
  const out = [header('cron', [
    'SOURCE REPRESENTATION of the production pg_cron jobs, in production job order.',
    'WARNING: the commands call the production project URL and read vault keys by',
    'name. Apply only to production-equivalent environments; a staging rebuild must',
    'substitute its own URL first (F2A D9). Vault secret VALUES are never in the repo.',
  ])];
  for (const j of x.cron.jobs || []) {
    if (j.username !== OWNER || j.database !== 'postgres') throw new Error(`cron ${j.name}: runs as ${j.username} on ${j.database}`);
    out.push(`select cron.schedule(${literal(j.name)}, ${literal(j.schedule)}, ${dollar(j.command, 'cron')});`);
    if (!j.active) out.push(`update cron.job set active = false where jobname = ${literal(j.name)};`);
  }
  return out.join('\n') + '\n';
}

const SEEDS = [
  ['public.bond_quest_templates', (x) => x.content.bond_quest_templates],
  ['public.daily_question_templates', (x) => x.catalogs.daily_question_templates],
  ['public.game_v2_cooldowns', (x) => x.catalogs.game_v2_cooldowns],
  ['public.game_v2_catalog', (x) => x.catalogs.game_v2_catalog],
  ['public.game_v2_recipes', (x) => x.catalogs.game_v2_recipes],
  ['public.progression_reward_catalog', (x) => x.catalogs.progression_reward_catalog],
  ['private.game_swipe_v1_catalog', (x) => x.catalogs.game_swipe_v1_catalog],
];

function referenceDataFile(x) {
  const out = [header('reference data', [
    'Curated catalog content only (no user data): Quest templates, which existed only',
    'in production, and the catalogs that historical migrations seeded.',
  ])];
  out.push(sessionPreamble(x.meta.search_path));
  for (const [table, pick] of SEEDS) {
    if (x.seedTables && !x.seedTables.has(table)) continue;
    const rows = pick(x);
    if (rows == null) continue;
    const json = JSON.stringify(rows);
    out.push(`insert into ${qname(table)}\nselect * from jsonb_populate_recordset(null::${qname(table)}, ${dollar(json, 'rows')}::jsonb);`);
  }
  return out.join('\n') + '\n';
}

// Ordered: each file only depends on earlier ones.
const ORDER = [
  ['00_extensions.sql', extensionsFile],
  ['10_schemas.sql', schemasFile],
  ['15_types.sql', typesFile],
  ['20_tables.sql', tablesFile],
  ['30_functions.sql', functionsFile],
  ['35_column_defaults.sql', defaultsFile],
  ['40_constraints.sql', constraintsFile],
  ['50_indexes.sql', indexesFile],
  ['55_views.sql', viewsFile],
  ['60_triggers.sql', triggersFile],
  ['65_rls_policies.sql', rlsFile],
  ['70_grants.sql', grantsFile],
  ['80_realtime.sql', realtimeFile],
  ['85_storage.sql', storageFile],
  ['90_cron.sql', cronFile],
  ['95_reference_data.sql', referenceDataFile],
];

function counts(x) {
  return {
    tables: { public: x.tables.filter((t) => t.t.startsWith('public.')).length, private: x.tables.filter((t) => t.t.startsWith('private.')).length },
    columns: x.tables.reduce((n, t) => n + t.cols.length, 0),
    constraints: Object.fromEntries(['p', 'u', 'x', 'c', 'f'].map((k) => [k, x.constraints.filter((c) => c.type === k).length])),
    indexes: x.indexes.length,
    functions: { public: x.manifest.filter((f) => f.f.startsWith('public.')).length, private: x.manifest.filter((f) => f.f.startsWith('private.')).length },
    types: x.types.length,
    views: x.views.length,
    sequences: x.sequences.length,
    triggers: x.triggers.length,
    policies: Object.fromEntries(['public', 'private', 'storage'].map((s) => [s, x.policies.filter((p) => p.t.startsWith(`${s}.`)).length])),
    column_grants: x.tables.reduce((n, t) => n + t.cols.filter((c) => c.acl).length, 0),
    realtime_members: (x.realtime.members || []).length,
    buckets: (x.realtime.buckets || []).length,
    cron_jobs: (x.cron.jobs || []).length,
    extensions: x.extensions.filter((e) => e.ext !== 'plpgsql').length,
    reference_rows: Object.fromEntries(SEEDS.map(([t, pick]) => [t, (pick(x) || []).length])),
  };
}

// ------------------------------------------------------------ slices
// Recovered-source artifacts: the same builders run on a subset of the
// capture, so a slice is byte-for-byte the baseline's own text for those
// objects. Slices document; the baseline files are what a rebuild applies.
const nameOf = (f) => f.f.slice(0, f.f.indexOf('('));
const PRODUCTION_ONLY_FUNCTIONS = [
  'private.current_couple_id', 'private.us_touch_updated_at', 'public.calendar_reminder_offset_valid',
  'public.get_daily_state', 'public.complete_shared_event', 'public.register_web_push_subscription',
  'public.remove_web_push_subscription', 'public.get_internal_vapid_private_key',
  'public.get_internal_monthiversary_cron_key', 'public.award_relationship_milestone',
  'public.get_weekly_quiz_sets', 'public.get_quiz_state', 'public.save_quiz_answer', 'public.get_weekly_game_sets',
  'public.get_partner_knowledge_hub', 'public.complete_partner_knowledge_deck', 'public.register_push_token',
  'public.get_web_push_status',
];
const DRIFTED_FUNCTIONS = [
  'public.send_think', 'public.set_think_reaction', 'public.widget_send_think_internal',
  'public.claim_left_for_you_cleanup', 'public.claim_us_role', 'private.calendar_entries_guard_update',
  'private.bucket_items_guard_calendar_link', 'private.bucket_items_guard_delete',
];
const SLICES = [
  ['m6d_calendar_reminders_applied.sql', 'm6d as production runs it: table, checks + helpers, indexes, RLS, grants, dispatch cron.', {
    tables: ['public.calendar_reminders'],
    functions: ['public.calendar_reminder_offset_valid', 'public.calendar_reminder_recipient_in_couple', 'public.get_internal_calendar_reminders_cron_key'],
    cron: ['us-calendar-reminders-dispatch'] }],
  ['monthiversary.sql', 'Monthiversary subsystem: milestones table, award/key RPCs, hourly cron (Edge source: supabase/functions/monthiversary-job).', {
    tables: ['public.relationship_milestones'],
    functions: ['public.award_relationship_milestone', 'public.get_internal_monthiversary_cron_key', 'public.get_internal_vapid_private_key'],
    cron: ['us-monthiversary-hourly'] }],
  ['quest.sql', 'Quest (Bond weekly quests): tables, functions, policies and the template content.', {
    tables: ['public.bond_quest_templates', 'public.bond_weekly_quests', 'public.bond_weekly_state'],
    functionMatch: /bond/, cron: [] }],
  ['production_only_functions.sql', 'The 18 functions that existed only in production before F2A.1.', {
    tables: [], functions: PRODUCTION_ONLY_FUNCTIONS, cron: [] }],
  ['function_drift_production.sql', 'Production definitions of the 8 functions whose body differed from the latest repo file (F2A D3).', {
    tables: [], functions: DRIFTED_FUNCTIONS, cron: [] }],
  ['storage_realtime.sql', 'us-media bucket, storage.objects policies and supabase_realtime membership.', {
    tables: [], functions: [], cron: [], storage: true, realtime: true }],
];

function subset(x, spec) {
  const tables = new Set(spec.tables);
  const fnWanted = (f) => (spec.functions || []).includes(nameOf(f)) || (spec.functionMatch ? spec.functionMatch.test(nameOf(f)) : false);
  const manifest = x.manifest.filter(fnWanted);
  for (const name of spec.functions || []) {
    if (!x.manifest.some((f) => nameOf(f) === name)) throw new Error(`slice function ${name} is not in the capture`);
  }
  return {
    ...x,
    tables: x.tables.filter((t) => tables.has(t.t)),
    allTables: x.tables,
    constraints: x.constraints.filter((k) => tables.has(k.t)),
    indexes: x.indexes.filter((i) => tables.has(i.t)),
    triggers: x.triggers.filter((t) => tables.has(t.t)),
    policies: x.policies.filter((p) => tables.has(p.t) || (spec.storage && p.t.startsWith('storage.'))),
    views: [], sequences: [], types: [],
    manifest,
    realtime: {
      publication: x.realtime.publication,
      members: (x.realtime.members || []).filter((m) => spec.realtime || tables.has(m.t)),
      buckets: spec.storage ? x.realtime.buckets : [],
    },
    cron: { jobs: (x.cron.jobs || []).filter((j) => spec.cron.includes(j.name)), vault: [] },
    seedTables: tables,
  };
}

function stripHeader(text) {
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].startsWith('--')) i += 1;
  return lines.slice(i).join('\n').replace(/^\n+/, '');
}

function sliceFile(x, name, purpose, spec) {
  const y = subset(x, spec);
  const missingCron = spec.cron.filter((c) => !y.cron.jobs.some((j) => j.name === c));
  if (missingCron.length) throw new Error(`slice ${name}: cron ${missingCron.join(', ')} not captured`);
  const out = [
    `-- US backend recovered source: ${name}`,
    `-- ${purpose}`,
    '-- GENERATED from the production capture by scripts/build-supabase-baseline.mjs.',
    '-- A documentation slice of supabase/baseline (same text, same order). It is not',
    '-- a migration and is not applied by itself; the baseline files are.',
    '',
  ];
  const sections = [['20_tables.sql', tablesFile], ['30_functions.sql', functionsFile], ['35_column_defaults.sql', defaultsFile],
    ['40_constraints.sql', constraintsFile], ['50_indexes.sql', indexesFile], ['60_triggers.sql', triggersFile],
    ['65_rls_policies.sql', rlsFile], ['70_grants.sql', grantsFile], ['80_realtime.sql', realtimeFile],
    ['85_storage.sql', storageFile], ['90_cron.sql', cronFile], ['95_reference_data.sql', referenceDataFile]];
  for (const [file, fn] of sections) {
    const body = stripHeader(fn(y)).split('\n').filter((l) => !/^set check_function_bodies|^select pg_catalog\.set_config\('search_path'/.test(l)).join('\n').trim();
    if (body) out.push(`-- from ${file}`, body, '');
  }
  return out.join('\n');
}

// The SQL production recorded in its ledger for the versions whose repo file
// is missing or differs (c10; key-like literals masked at capture). History
// only: kept so the repo shows what ran, never executed by anything.
function ledgerFiles(x) {
  const out = {};
  for (const l of x.content.ledger_sql || []) {
    if (l.redacted_literals == null) throw new Error(`ledger ${l.v}: capture without the redaction count`);
    const text = [
      `-- US backend recovered source: production ledger ${l.v} ${l.n}`,
      '-- GENERATED from the production capture (c10, supabase_migrations.schema_migrations.statements)',
      `-- by scripts/build-supabase-baseline.mjs. ${l.statements.length} statement(s), ${l.redacted_literals} key-like literal(s) masked.`,
      '-- HISTORY ONLY: what production ran under this version. Never apply it.',
      '',
      ...l.statements.map((st) => `${st.replace(/\s+$/, '')};\n`),
    ].join('\n');
    out[`recovered/ledger/${l.v}_${l.n}.sql`] = text;
  }
  return out;
}

function generate(capture, f2a, { slices = true } = {}) {
  const x = inputs(capture, f2a);
  const files = {};
  for (const [name, fn] of ORDER) files[name] = fn(x);
  const manifest = {
    generated_by: 'scripts/build-supabase-baseline.mjs',
    source: 'docs/us-2.0/F2A_1_PRODUCTION_CAPTURE*.json + docs/us-2.0/F2A_PRODUCTION_RESULTS_06_10.json (b09)',
    production_server_version: x.meta.server_version,
    search_path: x.meta.search_path,
    apply_order: ORDER.map(([name]) => name),
    counts: counts(x),
    vault_secret_names: (x.cron.vault || []).map((v) => v.name),
    default_privileges: x.meta.default_acl || [],
    files: Object.fromEntries(Object.entries(files).map(([name, text]) => [name, sha256(text)])),
  };
  if (slices) {
    for (const [name, purpose, spec] of SLICES) files[`recovered/${name}`] = sliceFile(x, name, purpose, spec);
    Object.assign(files, ledgerFiles(x));
    manifest.recovered = Object.fromEntries(Object.keys(files).filter((n) => n.startsWith('recovered/')).map((n) => [n, sha256(files[n])]));
  }
  files['MANIFEST.json'] = `${JSON.stringify(manifest, null, 2)}\n`;
  return files;
}

module.exports = { generate, parseAcl, aclStatements, ident, qname, ORDER, SEEDS, SLICES, PRODUCTION_ONLY_FUNCTIONS, DRIFTED_FUNCTIONS };
