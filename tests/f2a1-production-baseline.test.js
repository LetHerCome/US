// US 2.0 F2A.1 — production baseline and missing-source recovery.
//
// Proves, without production access, that:
//   * the recovered production-only sources are the captured bytes;
//   * the five cosmetic drifts are exactly the repo body with CRLF / without
//     comment lines (so their logic equals the repo);
//   * the capture pack can only read;
//   * the migration cutoff covers every repo file and ledger version;
//   * EMPTY Supabase-like PostgreSQL + supabase/baseline reproduces the
//     production schema fingerprint captured in F2A and F2A.1.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT, loadF2A, loadCapture } = require('../scripts/supabase-baseline/evidence.cjs');
const { captureQueries, f2aQueries } = require('../scripts/supabase-baseline/queries.cjs');
const { generate, DRIFTED_FUNCTIONS, PRODUCTION_ONLY_FUNCTIONS } = require('../scripts/supabase-baseline/generate.cjs');
const { buildCutoff, REPLAY_HAZARDS } = require('../scripts/supabase-baseline/cutoff.cjs');
const { rebuild, readBaseline, fingerprint, newDb } = require('../scripts/supabase-baseline/rebuild.cjs');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const md5 = (text) => crypto.createHash('md5').update(text).digest('hex');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const F2A = loadF2A();
const CAPTURE = loadCapture();
assert.ok(CAPTURE, 'docs/us-2.0/F2A_1_PRODUCTION_CAPTURE*.json is committed');
const prodFunctions = new Map(F2A.f2a_04_functions.map((f) => [f.f.slice(0, f.f.indexOf('(')), f]));

// ------------------------------------------------------------ monthiversary

// F2C changed exactly one thing in the recovered source: the VAPID subject
// comes from Edge configuration (supabase/functions/_shared/web-push-vapid.mjs).
const f2cMonthiversaryEdit = (text) => text
  .replace('const VAPID_SUBJECT="https://usfinal.vercel.app";\n', '')
  .replace('import webpush from "npm:web-push@3.6.7";\n', 'import webpush from "npm:web-push@3.6.7";\nimport { vapidSubject } from "../_shared/web-push-vapid.mjs";\n')
  .replace('webpush.setVapidDetails(VAPID_SUBJECT,', 'webpush.setVapidDetails(vapidSubject(),');

test('F2A.1 monthiversary-job: repo source is the deployed v4 bytes plus only the F2C VAPID edit', () => {
  const deployed = F2A.monthiversary_job;
  assert.equal(deployed.slug, 'monthiversary-job');
  assert.equal(deployed.version, 4);
  assert.equal(deployed.verify_jwt, false);
  const names = deployed.files.map((f) => f.name).sort();
  assert.deepEqual(names, ['deno.json', 'index.ts']);
  for (const file of deployed.files) {
    const local = fs.readFileSync(path.join(ROOT, 'supabase/functions/monthiversary-job', file.name)).toString('utf8');
    const expected = file.name === 'index.ts' ? f2cMonthiversaryEdit(file.content) : file.content;
    if (file.name === 'index.ts') assert.notEqual(expected, file.content, 'the F2C edit applies to the recovered bytes');
    assert.equal(local, expected, `${file.name} differs from the deployed source beyond the F2C edit`);
  }
  const provenance = read('supabase/functions/monthiversary-job/PROVENANCE.md');
  assert.match(provenance, new RegExp(sha256(deployed.files.find((f) => f.name === 'index.ts').content)), 'the recovered v4 hash stays recorded');
  assert.match(provenance, new RegExp(sha256(fs.readFileSync(path.join(ROOT, 'supabase/functions/monthiversary-job/index.ts')))));
  assert.match(provenance, new RegExp(sha256(fs.readFileSync(path.join(ROOT, 'supabase/functions/monthiversary-job/deno.json')))));
  assert.match(provenance, new RegExp(deployed.ezbr_sha256));
});

test('F2A.1 monthiversary-job: config.toml pins verify_jwt=false like production', () => {
  assert.match(read('supabase/config.toml'), /\[functions\.monthiversary-job\]\r?\nverify_jwt = false/);
  const listed = F2A.edge_functions.functions.find((f) => f.slug === 'monthiversary-job');
  assert.equal(listed.verify_jwt, false);
});

test('F2A.1 monthiversary-job: only the cron key, the VAPID key and the award RPC, all service_role-only', () => {
  const source = read('supabase/functions/monthiversary-job/index.ts');
  const rpcs = [...source.matchAll(/\.rpc\("([a-z_0-9]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(rpcs, ['award_relationship_milestone', 'get_internal_monthiversary_cron_key', 'get_internal_vapid_private_key']);
  for (const name of rpcs) {
    const fn = prodFunctions.get(`public.${name}`);
    assert.ok(fn, `${name} exists in production`);
    assert.doesNotMatch(fn.acl, /(^|[{,])(anon|authenticated)=/, `${name} must not be client-callable`);
    assert.match(fn.acl, /service_role=X/);
  }
  const job = F2A.f2a_11_cron.jobs.find((j) => j.name === 'us-monthiversary-hourly');
  assert.equal(job.schedule, '5 * * * *');
  assert.match(job.command, /functions\/v1\/monthiversary-job/);
  assert.match(job.command, /us_monthiversary_cron_key/);
});

// ------------------------------------------------------------ function drift

// Body of the latest `create function` for `name` in repo filename order:
// exactly the text pg_proc.prosrc stores.
function latestRepoBody(qualified) {
  const [schema, fn] = qualified.split('.');
  const dir = path.join(ROOT, 'supabase/migrations_history');
  let body = null;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    // Git stores migration sources with LF; Windows checkout may materialize CRLF.
    // Normalize here so drift decisions compare the canonical repository bytes,
    // not the platform-specific working-tree representation.
    const text = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n');
    const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+${schema}\\.${fn}\\s*\\(`, 'gi');
    for (const m of text.matchAll(re)) {
      const rest = text.slice(m.index + m[0].length);
      const as = rest.match(/\bas\s+(\$[A-Za-z_]*\$)/i);
      const start = as.index + as[0].length;
      body = rest.slice(start, rest.indexOf(as[1], start));
    }
  }
  return body;
}

const COSMETIC_DRIFT = {
  'public.claim_us_role': (b) => b.replace(/\n/g, '\r\n'),
  'private.calendar_entries_guard_update': (b) => b.replace(/\n/g, '\r\n'),
  'private.bucket_items_guard_calendar_link': (b) => b.replace(/\n/g, '\r\n'),
  'private.bucket_items_guard_delete': (b) => b.replace(/\n/g, '\r\n'),
  'public.claim_left_for_you_cleanup': (b) => b.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n'),
};

test('F2A.1 drift: 5 of the 8 drifted bodies are the repo body with CRLF or without comment lines', () => {
  for (const [name, transform] of Object.entries(COSMETIC_DRIFT)) {
    const repo = latestRepoBody(name);
    assert.ok(repo, `${name} has a repo definition`);
    const prod = prodFunctions.get(name).body_md5;
    assert.notEqual(md5(repo), prod, `${name} is drifted byte-wise`);
    assert.equal(md5(transform(repo)), prod, `${name}: production body = transformed repo body`);
  }
});

// The 3 Ti penso bodies, decided from the captured pg_get_functiondef. Their
// repo files were written after apply (6472885) and drifted from what ran.
// Each is the latest repo body plus exactly the edits listed here, compared
// with whitespace and full-line comments ignored.
const capturedBody = (qualified) => {
  const defs = ['c12', 'c13', 'c14', 'c15', 'c16', 'c17', 'c18', 'c19', 'c20'].flatMap((b) => CAPTURE[`f2a1_${b}_functions`] || []);
  const def = defs.find((d) => d.f.startsWith(`${qualified}(`)).def;
  return def.match(/AS \$(\w*)\$([\s\S]*)\$\1\$\s*$/)[2];
};
const logic = (b) => b.split('\n').filter((l) => !l.trim().startsWith('--')).join(' ').replace(/\s+/g, ' ').trim();
const TI_PENSO_DRIFT = {
  // Formatting only (line breaks and blank lines).
  'public.widget_send_think_internal': (b) => b,
  // The unresolved-conflict error is raised as P0001, not 23505. No caller
  // reads the code: app.js only toasts on any error.
  'public.send_think': (b) => b.replace("errcode = '23505', message = 'think_send_conflict_unresolved'", "errcode = 'P0001', message = 'think_send_conflict_unresolved'"),
  // The shared_messages alias is msg. The repo's alias `message` collides
  // with the record variable `message` and fails at run time (proved on the
  // rebuild below).
  'public.set_think_reaction': (b) => b.replace(/select message\.\* into message\s+from public\.shared_messages as message\s+where message\.id = target_message_id\s+and message\.kind = 'think'\s+and message\.couple_id = current_couple\s+and message\.recipient_id = auth\.uid\(\)/,
    "select msg.* into message from public.shared_messages as msg where msg.id = target_message_id and msg.kind = 'think' and msg.couple_id = current_couple and msg.recipient_id = auth.uid()"),
};

test('F2A.1 drift: the 3 Ti penso bodies are the repo body plus one listed production edit each', () => {
  for (const [name, edit] of Object.entries(TI_PENSO_DRIFT)) {
    const repo = latestRepoBody(name);
    const prod = capturedBody(name);
    assert.equal(md5(prod), prodFunctions.get(name).body_md5, `${name}: capture is the F2A body`);
    assert.notEqual(md5(repo), md5(prod), `${name} still drifts`);
    if (name !== 'public.widget_send_think_internal') {
      assert.notEqual(logic(repo), logic(prod), `${name}: a logic edit, not formatting`);
      assert.notEqual(edit(repo), repo, `${name}: the listed edit applies to the repo body`);
    }
    assert.equal(logic(edit(repo)), logic(prod), name);
  }
  assert.deepEqual([...Object.keys(COSMETIC_DRIFT), ...Object.keys(TI_PENSO_DRIFT)].sort(), [...DRIFTED_FUNCTIONS].sort());
});

// ------------------------------------------------------------ capture pack

test('F2A.1 capture pack: every block is one read-only SELECT and never reads a secret value', () => {
  const pack = read('docs/us-2.0/F2A_1_PRODUCTION_CAPTURE.sql');
  assert.match(pack, /^begin transaction read only;$/m);
  assert.match(pack.trimEnd(), /rollback;$/);
  const blocks = captureQueries();
  assert.ok(Object.keys(blocks).length >= 21);
  for (const [label, sql] of Object.entries(blocks)) {
    const code = sql.replace(/'(?:[^']|'')*'/g, "''");
    assert.match(code, /^(select|with)\b/i, label);
    assert.doesNotMatch(code, /;/, `${label}: one statement`);
    assert.doesNotMatch(code, /\b(insert|update|delete|merge|truncate|alter|create|drop|grant|revoke|copy|call|do|vacuum|refresh|reset|set|lock|comment|security|execute)\b(?!\s*=>)/i, label);
    assert.doesNotMatch(code, /decrypted_secret|\bsecret\b(?!s)/i, `${label}: no secret column`);
  }
});

// ------------------------------------------------------------ cutoff

test('F2A.1 cutoff: MIGRATION_CUTOFF.json is current and accounts for every file and ledger row', () => {
  const cutoff = buildCutoff(F2A);
  assert.equal(read('supabase/baseline/MIGRATION_CUTOFF.json'), `${JSON.stringify(cutoff, null, 2)}\n`);
  assert.deepEqual(cutoff.counts, {
    repo_files: 47, repo_same_version: 37, repo_alternate_version: 10,
    ledger_rows: 83, ledger_pre_repo_base: 36, replay_hazards: Object.keys(REPLAY_HAZARDS).length,
  });
  assert.equal(cutoff.production_ledger_tip, '20261003200000');
  // Production ran every pre-baseline migration; forward ones (F2C on) are
  // all newer than the baseline and reach production only through review.
  for (const file of cutoff.forward_migrations) assert.ok(file.slice(0, 14) > cutoff.baseline_version, `${file} is newer than the baseline`);
  for (const version of Object.keys(REPLAY_HAZARDS)) {
    const row = cutoff.repo.find((r) => r.version === version);
    assert.ok(row && row.after_f2a2 === 'history_only', `${version} must never be replayable`);
  }
  const mapped = cutoff.ledger.filter((r) => r.repo_file).length;
  assert.equal(mapped, 47);
});

// ------------------------------------------------------------ m6d

test('F2A.1 m6d: the committed m6d file cannot be replayed (sub-query CHECK), as production proves', async () => {
  const sql = read('supabase/migrations_history/20260928210000_m6d_calendar_reminders.sql');
  const check = sql.match(/constraint calendar_reminders_allday_offset_check\s+check \(([\s\S]*?)\),\r?\n\r?\n/);
  assert.ok(check, 'repo m6d still carries the sub-query CHECK');
  assert.match(check[1], /not exists \(\s*select 1 from public\.calendar_entries/);
  const db = await newDb();
  await db.exec('create table public.calendar_entries (id uuid primary key, is_all_day boolean);');
  await assert.rejects(
    db.exec(`create table public.calendar_reminders_probe (entry_id uuid, offset_minutes int, check (${check[1]}));`),
    /cannot use subquery in check constraint/,
  );
  const prodCheck = F2A.f2a_06_triggers_checks.checks.find((c) => c.con === 'calendar_reminders_allday_offset_check');
  assert.equal(prodCheck.def, 'CHECK (calendar_reminder_offset_valid(entry_id, offset_minutes))');
  assert.ok(prodFunctions.has('public.calendar_reminder_offset_valid'), 'production helper exists');
  assert.equal(latestRepoBody('public.calendar_reminder_offset_valid'), null, 'helper exists in no repo migration');
  // What production ran under the same version (ledger, c10): the repo file
  // plus the helper and its ACL, with the CHECK calling the helper.
  const applied = read('supabase/baseline/recovered/ledger/20260928210000_m6d_calendar_reminders.sql');
  const norm = (t) => t.split('\n').filter((l) => !l.trim().startsWith('--')).join(' ').replace(/;/g, ' ').replace(/\s+/g, ' ').trim();
  const helperStart = applied.indexOf('create or replace function public.calendar_reminder_offset_valid(');
  const helperEnd = applied.indexOf('to authenticated;', applied.indexOf('grant execute on function public.calendar_reminder_offset_valid(', helperStart)) + 'to authenticated;'.length;
  assert.ok(helperStart > 0 && helperEnd > helperStart, 'applied m6d defines the helper');
  const appliedWithoutHelper = applied.slice(0, helperStart) + applied.slice(helperEnd);
  const repoWithHelperCheck = sql.replace(check[0], 'constraint calendar_reminders_allday_offset_check\n    check (public.calendar_reminder_offset_valid(entry_id, offset_minutes)),\n\n');
  assert.equal(norm(appliedWithoutHelper), norm(repoWithHelperCheck));
});

// ------------------------------------------------------------ secrets

test('F2A.1 secrets manifest: every vault name and Edge env name, names only', () => {
  const manifest = JSON.parse(read('supabase/SECRETS_MANIFEST.json'));
  // Production's vault names at F2A, plus names a later mission introduces
  // (marked introduced_by, provisioned in that mission's rollout).
  assert.deepEqual(manifest.vault.filter((v) => !v.introduced_by).map((v) => v.name).sort(), [...F2A.f2a_13_vault_secret_names].sort());
  const introduced = manifest.vault.filter((v) => v.introduced_by);
  assert.equal(introduced[0].name, 'us_project_url');
  assert.equal(new Set(manifest.vault.map((v) => v.name)).size, manifest.vault.length, 'no duplicate Vault names');
  for (const v of introduced) {
    const migration = v.introduced_by.match(/supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql/);
    assert.ok(migration, `${v.name}: names its forward migration`);
    assert.ok(read(migration[0]).includes(`'${v.name}'`), `${v.name}: consumed in its migration`);
  }
  const envNames = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(ts|mjs|js)$/.test(e.name)) for (const m of read(rel).matchAll(/Deno\.env\.get\(\s*["']([A-Z0-9_]+)["']/g)) envNames.add(m[1]);
    }
  };
  walk('supabase/functions');
  assert.deepEqual(manifest.edge_env.map((v) => v.name).sort(), [...envNames].sort());
  // Every Edge Function that reads a vault-backed key through an RPC is listed.
  const rpcToSecret = {
    get_internal_vapid_private_key: 'us_web_push_vapid_private',
    get_internal_monthiversary_cron_key: 'us_monthiversary_cron_key',
    get_internal_calendar_reminders_cron_key: 'us_calendar_reminders_cron_key',
    get_internal_daily_question_push_cron_key: 'us_daily_question_push_cron_key',
    get_internal_game_v2_push_cron_key: 'us_game_v2_push_cron_key',
    get_internal_left_for_you_push_cron_key: 'us_left_for_you_push_cron_key',
    get_internal_left_for_you_cleanup_cron_key: 'us_left_for_you_cleanup_cron_key',
  };
  const shared = new Map();
  for (const f of fs.readdirSync(path.join(ROOT, 'supabase/functions/_shared'))) shared.set(f, read(`supabase/functions/_shared/${f}`));
  for (const fn of fs.readdirSync(path.join(ROOT, 'supabase/functions'))) {
    if (fn.startsWith('_')) continue;
    let source = read(`supabase/functions/${fn}/index.ts`);
    for (const [name, text] of shared) if (source.includes(`_shared/${name}`)) source += text;
    for (const [rpc, secret] of Object.entries(rpcToSecret)) {
      if (!source.includes(`"${rpc}"`)) continue;
      assert.ok(manifest.vault.find((v) => v.name === secret).edge_consumers.includes(fn), `${fn} reads ${secret}`);
    }
  }
  // Names and consumers only: no field that could carry a value, and nothing
  // shaped like a JWT, a Supabase key or a VAPID private key.
  const allowed = new Set(['purpose', 'verified', 'vault', 'edge_env', 'name', 'created_by', 'introduced_by', 'read_by_sql', 'edge_consumers', 'store', 'pairs_with']);
  const keys = (node) => (Array.isArray(node) ? node.flatMap(keys) : node && typeof node === 'object' ? Object.entries(node).flatMap(([k, v]) => [k, ...keys(v)]) : []);
  for (const key of keys(manifest)) assert.ok(allowed.has(key), `unexpected field ${key}`);
  const text = read('supabase/SECRETS_MANIFEST.json');
  assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{10,}|sb_(secret|publishable)_/, 'no API keys');
  for (const token of text.split(/[^A-Za-z0-9+/=_-]+/)) {
    assert.ok(!(token.length >= 32 && /[A-Z]/.test(token) && /[0-9]/.test(token) && /[a-z]/.test(token)), `key-shaped value ${token.slice(0, 6)}…`);
  }
});

// ------------------------------------------------------------ baseline (needs the capture)

test('F2A.1 baseline: supabase/baseline is exactly what the generator prints from the capture', () => {
  const files = generate(CAPTURE, F2A);
  const disk = readBaseline();
  for (const [name, text] of Object.entries(files)) {
    if (name.startsWith('recovered/')) assert.equal(read(`supabase/baseline/${name}`), text, name);
    else assert.equal(disk[name], text, `${name} is stale: run node scripts/build-supabase-baseline.mjs`);
  }
});

test('F2A.1 capture: agrees with the F2A production evidence it extends', () => {
  const manifest = [...CAPTURE.f2a1_c11a_function_manifest_public, ...CAPTURE.f2a1_c11b_function_manifest_private];
  assert.equal(manifest.length, F2A.f2a_04_functions.length);
  const byF2A = new Map(F2A.f2a_04_functions.map((f) => [f.f, f]));
  for (const f of manifest) {
    const old = byF2A.get(f.f);
    assert.ok(old, `${f.f} existed at F2A time`);
    assert.equal(f.body_md5, old.body_md5, `${f.f} body unchanged since F2A`);
    assert.equal(f.acl, old.acl, `${f.f} ACL unchanged since F2A`);
    assert.equal(f.sd, old.sd);
  }
  const policies = CAPTURE.f2a1_c06_policies;
  for (const p of F2A.f2a_05_policies) {
    const now = policies.find((q) => q.t === p.t && q.p === p.p);
    assert.ok(now, `${p.t} ${p.p}`);
    assert.equal(md5(`${now.qual ?? ''}|${now.with_check ?? ''}`), p.md5, `${p.p} expression unchanged since F2A`);
  }
  const checks = CAPTURE.f2a1_c04_constraints.filter((k) => k.type === 'c');
  assert.equal(checks.length, F2A.f2a_06_triggers_checks.checks.length);
  for (const k of F2A.f2a_06_triggers_checks.checks) assert.ok(checks.find((c) => c.con === k.con && c.def === k.def), k.con);
  assert.deepEqual(CAPTURE.f2a1_c01_meta.ledger.map((r) => [r.v, r.n]), F2A.f2a_01_ledger.ledger.map((r) => [r.v, r.n]), 'no migration landed between F2A and the capture');
  for (const name of [...PRODUCTION_ONLY_FUNCTIONS, ...DRIFTED_FUNCTIONS]) assert.ok(manifest.find((f) => f.f.startsWith(`${name}(`)), name);
});

// Deparse is canonical only after one round trip: a CHECK or policy written
// as `a between 1 and 6 and b` is stored as nested ANDs and printed with
// extra parentheses; replaying that text yields the flat form. Prove such a
// difference is the round trip and nothing else by replaying production's
// own text on the rebuilt table inside a rolled-back transaction.
async function canonicalCheck(db, table, con, def) {
  await db.exec('begin');
  try {
    await db.exec(`alter table only ${table} drop constraint ${JSON.stringify(con)}`);
    await db.exec(`alter table only ${table} add constraint ${JSON.stringify(con)} ${def} not valid`);
    const r = await db.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname = $1 and conrelid = $2::regclass`, [con, table]);
    return r.rows[0].d.replace(/ NOT VALID$/, '');
  } finally { await db.exec('rollback'); }
}
async function canonicalPolicy(db, p) {
  await db.exec('begin');
  try {
    await db.exec(`alter policy ${JSON.stringify(p.p)} on ${p.t}${p.qual != null ? ` using (${p.qual})` : ''}${p.with_check != null ? ` with check (${p.with_check})` : ''}`);
    const [schema, table] = p.t.split('.');
    const r = await db.query('select qual, with_check from pg_policies where schemaname = $1 and tablename = $2 and policyname = $3', [schema, table, p.p]);
    return { ...p, qual: r.rows[0].qual, with_check: r.rows[0].with_check };
  } finally { await db.exec('rollback'); }
}

const sortRows = (rows) => [...(rows || [])].map((r) => JSON.stringify(r)).sort();

test('F2A.1 rebuild: empty Supabase-like PostgreSQL + baseline reproduces the production fingerprint', { timeout: 300000 }, async (t) => {
  const db = await rebuild();
  const searchPath = CAPTURE.f2a1_c01_meta.search_path;
  const got = await fingerprint(db, searchPath);
  const roundTrip = [];

  await t.test('F2A b02 object counts', () => assert.deepEqual(got.f2a.f2a_02_counts, F2A.f2a_02_counts));
  await t.test('F2A b03 tables: RLS, FORCE, column fingerprint, ACL', () => {
    const strip = (rows) => rows.map(({ est_rows, ...r }) => r);
    assert.deepEqual(strip(got.f2a.f2a_03_tables), strip(F2A.f2a_03_tables));
  });
  await t.test('F2A b04 functions: signature, SECURITY DEFINER, body md5, ACL, config', () => assert.deepEqual(got.f2a.f2a_04_functions, F2A.f2a_04_functions));
  await t.test('F2A b06 triggers', () => assert.deepEqual(sortRows(got.f2a.f2a_06_triggers_checks.triggers), sortRows(F2A.f2a_06_triggers_checks.triggers)));
  await t.test('F2A b07 views and enums', () => assert.deepEqual(got.f2a.f2a_07_views_types, F2A.f2a_07_views_types));
  await t.test('F2A b08 Realtime membership', () => assert.deepEqual([...got.f2a.f2a_08_realtime].sort(), [...F2A.f2a_08_realtime].sort()));
  await t.test('F2A b10 storage bucket configuration', () => assert.deepEqual(got.f2a.f2a_10_storage.buckets, F2A.f2a_10_storage.buckets));
  await t.test('F2A b11 cron jobs (definition, not run history)', () => assert.deepEqual(got.f2a.f2a_11_cron.jobs, F2A.f2a_11_cron.jobs));

  const cap = CAPTURE;
  const g = got.capture;
  await t.test('F2A.1 schema private: owner and ACL (public and default privileges are platform-owned)', () => {
    const own = (meta) => meta.schemas.filter((s) => s.s === 'private');
    assert.deepEqual(own(g.f2a1_c01_meta), own(cap.f2a1_c01_meta));
  });
  await t.test('F2A.1 tables and columns: types, defaults, nullability, identity, ACLs, comments', () => {
    assert.deepEqual(g.f2a1_c02_tables_a, cap.f2a1_c02_tables_a);
    assert.deepEqual(g.f2a1_c03_tables_b, cap.f2a1_c03_tables_b);
  });
  await t.test('F2A.1 constraints (CHECK text canonical after one deparse round trip)', async () => {
    const prod = cap.f2a1_c04_constraints;
    const rebuilt = g.f2a1_c04_constraints.filter((k) => k.type !== 'n');
    assert.equal(rebuilt.length, prod.length);
    for (const k of prod) {
      const r = rebuilt.find((x) => x.t === k.t && x.con === k.con);
      assert.ok(r, `${k.t} ${k.con} rebuilt`);
      assert.equal(r.type, k.type);
      if (r.def === k.def) continue;
      assert.equal(r.def, await canonicalCheck(db, k.t, k.con, k.def), `${k.con}: only the deparse round trip may differ`);
      roundTrip.push(`constraint ${k.t}.${k.con}`);
    }
  });
  await t.test('F2A.1 indexes and triggers', () => assert.deepEqual(g.f2a1_c05_indexes_triggers, cap.f2a1_c05_indexes_triggers));
  await t.test('F2A.1 policies (expressions canonical after one deparse round trip)', async () => {
    const prod = cap.f2a1_c06_policies;
    assert.equal(g.f2a1_c06_policies.length, prod.length);
    for (const p of prod) {
      const r = g.f2a1_c06_policies.find((x) => x.t === p.t && x.p === p.p);
      assert.ok(r, `${p.t} ${p.p}`);
      if (JSON.stringify(r) === JSON.stringify(p)) continue;
      assert.deepEqual(r, await canonicalPolicy(db, p), `${p.p}: only the deparse round trip may differ`);
      roundTrip.push(`policy ${p.t}.${p.p}`);
    }
  });
  await t.test('F2A.1 views, sequences and types', () => assert.deepEqual(g.f2a1_c07_views_sequences_types, cap.f2a1_c07_views_sequences_types));
  await t.test('F2A.1 Realtime publication and storage buckets', () => {
    assert.deepEqual(g.f2a1_c08_realtime_storage.publication, cap.f2a1_c08_realtime_storage.publication);
    assert.deepEqual(sortRows(g.f2a1_c08_realtime_storage.members), sortRows(cap.f2a1_c08_realtime_storage.members));
    assert.deepEqual(g.f2a1_c08_realtime_storage.buckets, cap.f2a1_c08_realtime_storage.buckets);
  });
  await t.test('F2A.1 cron jobs', () => assert.deepEqual(g.f2a1_c09_cron_vault.jobs, cap.f2a1_c09_cron_vault.jobs));
  await t.test('F2A.1 reference content fingerprints', () => {
    const prod = cap.f2a1_c10_content.content_fingerprints;
    const rebuilt = g.f2a1_c10_content.content_fingerprints;
    for (const table of ['bond_quest_templates', 'daily_question_templates', 'game_v2_catalog', 'game_v2_recipes', 'game_v2_cooldowns', 'progression_reward_catalog', 'game_swipe_v1_catalog']) {
      assert.deepEqual(rebuilt[table], prod[table], table);
    }
  });
  await t.test('F2A.1 functions: every header attribute and full definition hash', () => {
    assert.deepEqual(g.f2a1_c11a_function_manifest_public, cap.f2a1_c11a_function_manifest_public);
    assert.deepEqual(g.f2a1_c11b_function_manifest_private, cap.f2a1_c11b_function_manifest_private);
  });
  await t.test('F2A.1 drift: production set_think_reaction runs; the repo body fails on its alias', async () => {
    // A recipient with no such message: production reaches its own 42501
    // check, the repo body dies on the ambiguous alias before it.
    const call = async () => {
      await db.exec('begin');
      try {
        await db.exec(`select set_config('request.jwt.claim.sub', '${crypto.randomUUID()}', true)`);
        await db.query(`select public.set_think_reaction('${crypto.randomUUID()}', 'heart')`);
        return 'no error';
      } catch (e) { return e.message; } finally { await db.exec('rollback'); }
    };
    assert.equal(await call(), 'think recipient required');
    const file = read('supabase/migrations_history/20260922120726_think_send_idempotency_final_reaction.sql');
    const from = file.indexOf('create or replace function public.set_think_reaction(');
    const repoSql = file.slice(from, file.indexOf('$$;', file.indexOf('as $$', from) + 5) + 3);
    await db.exec('begin');
    try {
      await db.exec(repoSql);
      await db.exec(`select set_config('request.jwt.claim.sub', '${crypto.randomUUID()}', true)`);
      await assert.rejects(db.query(`select public.set_think_reaction('${crypto.randomUUID()}', 'heart')`), /column reference "message\.\*" is ambiguous/);
    } finally { await db.exec('rollback'); }
    assert.equal(await call(), 'think recipient required', 'rollback restored the production body');
  });
  t.diagnostic(`deparse round-trip only: ${roundTrip.length ? roundTrip.join(', ') : 'none'}`);
  await db.close();
});

test('F2A.1 rebuild harness: the fingerprint queries are the committed production packs', () => {
  // The same SQL text that produced the production evidence runs on the rebuild.
  const f2a = f2aQueries();
  for (const block of ['2', '3', '4', '5', '6', '7', '8', '10', '11']) assert.ok(f2a[block], `F2A block ${block}`);
  assert.ok(Object.keys(captureQueries()).includes('c11a'));
});
