// Errori dell'app (09/11/2026): the app sends its own JavaScript errors to
// private.client_errors through public.report_client_errors(), only technical
// facts, at most 20 per call and 50 per account per day, gone with the account
// and after 30 days. Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_client_errors_v1\.sql$/.test(f));
const F2A3 = fs.readdirSync(DIR).find((f) => /_f2a3_retention_operations\.sql$/.test(f));
const SQL = FILE ? fs.readFileSync(path.join(DIR, FILE), 'utf8') : '';

let db;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const report = (user, errors) => h.as(db, user, 'select public.report_client_errors($1::jsonb) r', [JSON.stringify(errors)]);
const item = (over = {}) => ({ kind: 'error', message: 'TypeError: x is not a function', source: 'app.js', line: 12, col: 3, build: 'us-staging-20261109-106', platform: 'android', ...over });
const count = async (user) => (await q('select count(*)::int n from private.client_errors where user_id = $1', [user]))[0].n;

test.beforeEach(async () => { db = await h.database(); });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration is listed; nobody but the function writes and nobody reads through the API', async () => {
  assert.ok(FILE, 'missing supabase/migrations/*_client_errors_v1.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  assert.equal((await q("select relrowsecurity r from pg_class where oid = 'private.client_errors'::regclass"))[0].r, true);
  for (const role of ['anon', 'authenticated']) {
    for (const right of ['select', 'insert', 'update', 'delete']) {
      assert.equal((await q('select has_table_privilege($1, \'private.client_errors\', $2) r', [role, right]))[0].r, false, `${role} ${right}`);
    }
  }
  const fn = (await q("select prosecdef, proconfig from pg_proc where proname = 'report_client_errors'"))[0];
  assert.equal(fn.prosecdef, true);
  assert.deepEqual(fn.proconfig, ['search_path=""']);
  assert.equal((await q("select has_function_privilege('authenticated', 'public.report_client_errors(jsonb)', 'execute') r"))[0].r, true);
  assert.equal((await q("select has_function_privilege('anon', 'public.report_client_errors(jsonb)', 'execute') r"))[0].r, false);
  await assert.rejects(h.as(db, h.F, 'select count(*) r from private.client_errors'), /permission denied/);
  await assert.rejects(h.as(db, h.F, "insert into private.client_errors(user_id, build, platform, kind, message) values ($1, 'b', 'web', 'error', 'm')", [h.F]), /permission denied/);
});

test('a signed-in account saves its own errors, also before it has a couple; invalid items are skipped', async () => {
  assert.equal(await report(h.U1, [
    item(),
    item({ kind: 'rejection', platform: 'web', message: `  ${'a'.repeat(400)}  `, source: '', line: 'x', col: -1, repeats: 5000 }),
    item({ platform: 'windows' }),
    item({ kind: 'warning' }),
    item({ message: '   ' }),
    item({ build: '' }),
    'not an object',
    item({ user_id: h.F }),
  ]), 3);
  const rows = await q('select user_id, kind, platform, char_length(message) len, source, line, col, repeats from private.client_errors order by id');
  assert.deepEqual(rows.map((r) => r.user_id), [h.U1, h.U1, h.U1], 'always the caller, whatever the item says');
  assert.deepEqual(rows.slice(0, 2).map((r) => [r.kind, r.platform, r.len, r.source, r.line, r.col, r.repeats]), [
    ['error', 'android', 30, 'app.js', 12, 3, 1],
    ['rejection', 'web', 300, null, null, null, 1000],
  ]);
  assert.equal(await count(h.F), 0);
  assert.equal(await report(h.U1, { not: 'an array' }), 0);
  assert.equal(await report(h.U1, []), 0);
});

test('no account, no error: anonymous callers and the anon role are refused', async () => {
  await assert.rejects(h.as(db, null, "select public.report_client_errors('[]'::jsonb) r"), /authentication required/);
  await assert.rejects(h.as(db, h.F, "select public.report_client_errors('[]'::jsonb) r", [], 'anon'), /permission denied/);
});

test('at most 20 per call and 50 per account per day; yesterday does not count', async () => {
  const many = Array.from({ length: 30 }, (_, i) => item({ line: i }));
  assert.equal(await report(h.F, many), 20);
  assert.equal(await report(h.F, many), 20);
  assert.equal(await report(h.F, many), 10, 'the room left for today');
  assert.equal(await report(h.F, many), 0);
  assert.equal(await count(h.F), 50);
  assert.equal(await report(h.B, [item()]), 1, 'the partner has a room of their own');
  await q("update private.client_errors set created_at = now() - interval '25 hours' where user_id = $1", [h.F]);
  assert.equal(await report(h.F, [item()]), 1);
});

test('errors go with the account', async () => {
  await report(h.U2, [item(), item({ line: 2 })]);
  await report(h.U3, [item()]);
  await q('delete from auth.users where id = $1', [h.U2]);
  assert.equal(await count(h.U2), 0);
  assert.equal(await count(h.U3), 1);
});

test('the daily retention deletes errors older than 30 days and keeps every F2A3 step', async () => {
  await report(h.F, [item(), item({ line: 2 })]);
  await q("update private.client_errors set created_at = now() - interval '31 days' where line = 2");
  const counts = (await q('select private.run_operational_retention() as counts'))[0].counts;
  assert.equal(counts.client_errors, 1);
  assert.equal(await count(h.F), 1);
  const targets = (code) => [...new Set([...code.replace(/--[^\n]*/g, '').matchAll(/delete\s+from\s+([a-z_.]+)/gi)].map((m) => m[1]))].sort();
  const before = targets(fs.readFileSync(path.join(DIR, F2A3), 'utf8'));
  const retention = SQL.slice(SQL.indexOf('create or replace function private.run_operational_retention'));
  assert.deepEqual(targets(retention), [...before, 'private.client_errors'].sort());
  assert.match(SQL, /revoke all on function private\.run_operational_retention\(\) from public, anon, authenticated, service_role/);
});
