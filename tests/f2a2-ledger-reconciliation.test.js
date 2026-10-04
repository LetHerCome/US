// US 2.0 F2A.2 — ledger reconciliation.
//
// Proves, without production access, that:
//   * the 47 pre-baseline migrations are archived unchanged and can never run;
//   * supabase/migrations holds exactly one migration, the generated baseline;
//   * an empty Supabase-like PostgreSQL + that migration (+ the cron source)
//     gives the same schema fingerprint as supabase/baseline, i.e. production;
//   * the read-only packs (ledger export, schema digest) can only read;
//   * the ledger repair set reverts exactly the 83 recorded versions and
//     records only the baseline.
// With the committed production evidence it also proves the preflight found
// no drift, the export is complete and masked, and the repair changed nothing
// but the ledger.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT, loadF2A, loadCapture, loadPreflight, loadLedgerExport, loadDigest } = require('../scripts/supabase-baseline/evidence.cjs');
const { parsePack } = require('../scripts/supabase-baseline/queries.cjs');
const { buildCutoff } = require('../scripts/supabase-baseline/cutoff.cjs');
const { BASELINE_VERSION, BASELINE_NAME, BASELINE_FILE, baselineMigration } = require('../scripts/supabase-baseline/migration.cjs');
const { digestSql } = require('../scripts/supabase-baseline/digest.cjs');
const { repairSet, parseMigrationList, ledgerHistoryFiles } = require('../scripts/supabase-baseline/repair.cjs');
const { newDb, readBaseline, rebuild, fingerprint } = require('../scripts/supabase-baseline/rebuild.cjs');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const F2A = loadF2A();
const CAPTURE = loadCapture();
const PREFLIGHT = loadPreflight();
const EXPORTED = loadLedgerExport();
const DIGEST_PRE = loadDigest('PRE');
const DIGEST_POST = loadDigest('POST');
const REPAIR_OUTPUT = 'docs/us-2.0/F2A_2_LEDGER_REPAIR_OUTPUT.txt';
const pending = (what) => `pending: ${what} not committed yet`;

const MIGRATIONS = 'supabase/migrations';
const HISTORY = 'supabase/migrations_history';
const sqlFiles = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.sql')).sort();

// ------------------------------------------------------------ archive + guard

test('F2A.2 archive: the 47 pre-baseline migrations are in migrations_history, byte for byte', () => {
  const pinned = JSON.parse(read('supabase/baseline/HISTORY_ARCHIVE.json'));
  const files = sqlFiles(HISTORY);
  assert.equal(files.length, 47);
  assert.deepEqual(files, Object.keys(pinned.sha256).sort());
  for (const file of files) assert.equal(sha256(fs.readFileSync(path.join(ROOT, HISTORY, file))), pinned.sha256[file], file);
  assert.deepEqual(buildCutoff(F2A).repo.map((r) => r.file), files, 'the cutoff accounts for every archived file');
});

test('F2A.2 guard: supabase/migrations holds only the baseline and newer; history can never run', () => {
  const files = sqlFiles(MIGRATIONS);
  assert.ok(files.includes(BASELINE_FILE), 'the baseline migration exists');
  assert.deepEqual(fs.readdirSync(path.join(ROOT, MIGRATIONS)).filter((f) => !f.endsWith('.sql')), [], 'only .sql files');
  for (const file of files) {
    assert.match(file, /^\d{14}_[a-z0-9_]+\.sql$/, file);
    if (file !== BASELINE_FILE) assert.ok(file.slice(0, 14) > BASELINE_VERSION, `${file} must be newer than the baseline`);
  }
  for (const file of sqlFiles(HISTORY)) assert.ok(file.slice(0, 14) < BASELINE_VERSION, `${file} predates the baseline`);
  // The CLI reads supabase/migrations only; nothing may point it at history.
  const config = read('supabase/config.toml');
  assert.doesNotMatch(config, /migrations_history/);
  assert.doesNotMatch(config, /schema_paths|sql_paths/);
  const cutoff = JSON.parse(read('supabase/baseline/MIGRATION_CUTOFF.json'));
  assert.equal(cutoff.baseline_version, BASELINE_VERSION);
  assert.deepEqual(cutoff.executable_migrations, files);
  assert.ok(cutoff.repo.every((r) => r.after_f2a2 === 'history_only'));
});

test('F2A.2 baseline migration: generated from supabase/baseline, without extensions and cron', () => {
  const baseline = readBaseline();
  const migration = read(`${MIGRATIONS}/${BASELINE_FILE}`);
  assert.equal(migration, baselineMigration(baseline), 'run node scripts/build-supabase-baseline.mjs');
  assert.ok(BASELINE_VERSION > buildCutoff(F2A).production_ledger_tip);
  assert.doesNotMatch(migration, /^-- ==== supabase\/baseline\/(00_extensions|90_cron)\.sql/m);
  assert.doesNotMatch(migration, /cron\.schedule|create extension/i);
  for (const name of JSON.parse(baseline['MANIFEST.json']).apply_order.filter((n) => !/^(00|90)_/.test(n))) {
    assert.ok(migration.includes(baseline[name].replace(/\n+$/, '')), `${name} is in the migration verbatim`);
  }
});

const sortRows = (rows) => [...(rows || [])].map((r) => JSON.stringify(r)).sort();

test('F2A.2 rebuild: empty PostgreSQL + supabase/migrations (+ cron source) = the baseline fingerprint', { timeout: 300000 }, async () => {
  const searchPath = CAPTURE.f2a1_c01_meta.search_path;
  const fromBaseline = await rebuild();
  const expected = await fingerprint(fromBaseline, searchPath);
  await fromBaseline.close();

  const db = await newDb();
  for (const file of sqlFiles(MIGRATIONS)) await db.exec(read(`${MIGRATIONS}/${file}`));
  // Cron jobs stay a source file (supabase/baseline/90_cron.sql) until F2C.
  const noCron = await fingerprint(db, searchPath);
  assert.deepEqual(noCron.f2a.f2a_11_cron.jobs, null, 'the migration schedules no cron job');
  await db.exec(readBaseline()['90_cron.sql']);
  const got = await fingerprint(db, searchPath);
  await db.close();

  assert.deepEqual(got.f2a, expected.f2a);
  for (const [alias, value] of Object.entries(expected.capture)) {
    if (alias === 'f2a1_c08_realtime_storage') {
      assert.deepEqual(sortRows(got.capture[alias].members), sortRows(value.members));
      assert.deepEqual({ ...got.capture[alias], members: null }, { ...value, members: null });
    } else assert.deepEqual(got.capture[alias], value, alias);
  }
});

// ------------------------------------------------------------ read-only packs

function assertReadOnlyPack(file, headerPattern) {
  const text = read(file);
  assert.match(text, /^begin transaction read only;$/m);
  assert.match(text, /^rollback;\s*$/m);
  const blocks = parsePack(path.join(ROOT, file), headerPattern);
  assert.ok(Object.keys(blocks).length > 0);
  // The same rule the F2A.1 capture pack is held to.
  for (const [label, sql] of Object.entries(blocks)) {
    const code = sql.replace(/'(?:[^']|'')*'/g, "''");
    assert.match(code, /^(select|with)\b/i, label);
    assert.doesNotMatch(code, /;/, `${label}: one statement`);
    assert.doesNotMatch(code, /\b(insert|update|delete|merge|truncate|alter|create|drop|grant|revoke|copy|call|do|vacuum|refresh|reset|set|lock|comment|security|execute)\b(?!\s*=>)/i, label);
    assert.doesNotMatch(code, /decrypted_secret|\bsecret\b(?!s)/i, `${label}: no secret column`);
  }
  return blocks;
}

test('F2A.2 packs: ledger export and schema digest only read, and mask secret-shaped text', () => {
  const exportBlocks = assertReadOnlyPack('docs/us-2.0/F2A_2_LEDGER_EXPORT.sql', /^-- (l\d\d)\. /);
  assert.deepEqual(Object.keys(exportBlocks), Array.from({ length: 14 }, (_, i) => `l${String(i).padStart(2, '0')}`));
  for (const label of Object.keys(exportBlocks).slice(1)) {
    for (const placeholder of ['<redacted-jwt>', '<redacted-sb-key>', "'<redacted>'", '<redacted-hex>', '<redacted-token>']) {
      assert.ok(exportBlocks[label].includes(placeholder), `${label} masks with ${placeholder}`);
    }
  }
  assert.equal(read('docs/us-2.0/F2A_2_SCHEMA_DIGEST.sql'), digestSql(), 'digest pack is generated from the F2A.1 capture pack');
  assertReadOnlyPack('docs/us-2.0/F2A_2_SCHEMA_DIGEST.sql', /^-- (d\d\d)\. /);
});

// ------------------------------------------------------------ repair set

test('F2A.2 repair set: revert exactly the 83 recorded versions, record only the baseline', () => {
  const set = repairSet(CAPTURE);
  assert.equal(read('supabase/baseline/LEDGER_REPAIR.json'), `${JSON.stringify(set, null, 2)}\n`);
  assert.equal(set.revert.length, 83);
  assert.deepEqual(set.revert, F2A.f2a_01_ledger.ledger.map((r) => r.v));
  assert.deepEqual(set.revert, buildCutoff(F2A).ledger.map((r) => r.version));
  assert.ok(!set.revert.includes(BASELINE_VERSION));
  assert.deepEqual(set.apply, { version: BASELINE_VERSION, name: BASELINE_NAME, file: `supabase/migrations/${BASELINE_FILE}` });
  assert.deepEqual(set.expected_after, [{ version: BASELINE_VERSION, name: BASELINE_NAME }]);
  // Only ledger commands, always against the linked project, never a real push.
  for (const c of set.commands) {
    assert.ok(c.includes('--linked'), c.join(' '));
    assert.ok(['migration list', 'migration repair', 'db push'].includes(c.slice(0, 2).join(' ')), c.join(' '));
    if (c[0] === 'db') assert.ok(c.includes('--dry-run'));
  }
  const script = read('scripts/f2a2-ledger-repair.mjs');
  assert.doesNotMatch(script, /db', 'push'(?![^\n]*dry-run)|db reset|migration up|execute_sql/);
});

test('F2A.2 repair script: parses `supabase migration list` output', () => {
  const before = [
    '  ',
    '   Local          | Remote         | Time (UTC)          ',
    '  ----------------|----------------|---------------------',
    '                  | 20260818181916 | 2026-08-18 18:19:16 ',
    `   ${BASELINE_VERSION} |                | 2026-10-04 00:00:00 `,
  ].join('\r\n');
  assert.deepEqual(parseMigrationList(before), [{ local: null, remote: '20260818181916' }, { local: BASELINE_VERSION, remote: null }]);
  const after = `   Local          | Remote         | Time (UTC)\n  ---|---|---\n   ${BASELINE_VERSION} | ${BASELINE_VERSION} | 2026-10-04 00:00:00\n`;
  assert.deepEqual(parseMigrationList(after), [{ local: BASELINE_VERSION, remote: BASELINE_VERSION }]);
});

// ------------------------------------------------------------ production evidence

test('F2A.2 preflight: production still equals the F2A.1 capture, block for block', { skip: !PREFLIGHT && pending('docs/us-2.0/F2A_2_PREFLIGHT_CAPTURE_*.json') }, () => {
  assert.deepEqual(Object.keys(PREFLIGHT).sort(), Object.keys(CAPTURE).sort());
  for (const [alias, value] of Object.entries(CAPTURE)) assert.deepEqual(PREFLIGHT[alias], value, `${alias}: production drifted since F2A.1`);
});

test('F2A.2 ledger export: all 83 rows, the F2A.1 identities, masked, written to history', { skip: !EXPORTED && pending('docs/us-2.0/F2A_2_LEDGER_EXPORT_*.json') }, () => {
  const { rows, files } = ledgerHistoryFiles(EXPORTED);
  const c01 = CAPTURE.f2a1_c01_meta.ledger;
  assert.deepEqual(rows.map((r) => [r.v, r.n, r.stmts, r.len, r.md5]), c01.map((r) => [r.v, r.n, r.stmts, r.len, r.md5]));
  assert.equal(EXPORTED.f2a2_l00_shape.rows, 83);
  assert.equal(EXPORTED.f2a2_l00_shape.tip, '20261003200000');
  assert.equal(EXPORTED.f2a2_l13_ledger, null, 'no row beyond the last bucket');
  const text = JSON.stringify(rows.map((r) => r.statements));
  assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/, 'no JWT');
  assert.doesNotMatch(text, /sb_(secret|publishable)_[A-Za-z0-9_-]{8,}/, 'no Supabase key');
  for (const token of text.match(/[A-Za-z0-9+/=_-]{32,}/g) || []) {
    assert.ok(!(/[A-Z]/.test(token) && /[a-z]/.test(token) && /\d/.test(token)), `secret-shaped token ${token.slice(0, 6)}…`);
    assert.ok(!/^[0-9A-Fa-f]{32,}$/.test(token), `hex token ${token.slice(0, 6)}…`);
  }
  for (const [name, content] of Object.entries(files)) assert.equal(read(`${HISTORY}/ledger/${name}`), content, name);
  assert.equal(fs.readdirSync(path.join(ROOT, HISTORY, 'ledger')).length, 84, '83 versions + LEDGER.json');
});

const ledgerOf = (rows) => rows.map((r) => [r.v, r.n, r.stmts, r.len, r.md5]);

test('F2A.2 digest before repair: the ledger is the expected 83 rows', { skip: !DIGEST_PRE && pending('docs/us-2.0/F2A_2_SCHEMA_DIGEST_PRE.json') }, () => {
  const pre = DIGEST_PRE.f2a2_d01_digest;
  assert.deepEqual(ledgerOf(pre.ledger), ledgerOf(CAPTURE.f2a1_c01_meta.ledger));
  assert.deepEqual(Object.keys(pre.digest).sort(), Object.keys(CAPTURE).map((a) => a.match(/^f2a1_(c\d\d[ab]?)_/)[1]).sort());
});

test('F2A.2 digest after repair: schema unchanged, ledger is the baseline only', { skip: !DIGEST_POST && pending('docs/us-2.0/F2A_2_SCHEMA_DIGEST_POST.json') }, () => {
  assert.ok(DIGEST_PRE, 'the pre-repair digest is committed too');
  const pre = DIGEST_PRE.f2a2_d01_digest;
  const post = DIGEST_POST.f2a2_d01_digest;
  assert.deepEqual(post.digest, pre.digest, 'the repair changed no schema object');
  assert.deepEqual(post.ledger.map((r) => [r.v, r.n]), [[BASELINE_VERSION, BASELINE_NAME]]);
});

test('F2A.2 repair output: migration list is local = remote baseline, push dry-run is a no-op', { skip: !fs.existsSync(path.join(ROOT, REPAIR_OUTPUT)) && pending(REPAIR_OUTPUT) }, () => {
  const out = read(REPAIR_OUTPUT);
  const after = out.slice(out.lastIndexOf('migration list --linked'));
  assert.deepEqual(parseMigrationList(after.slice(0, after.indexOf('db push'))), [{ local: BASELINE_VERSION, remote: BASELINE_VERSION }]);
  assert.match(out.slice(out.lastIndexOf('db push --dry-run')), /up to date/i);
  assert.match(out, /F2A\.2 ledger repair complete/);
});
