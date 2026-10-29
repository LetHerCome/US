// Aggiornamento dell'app (founder, 29/10/2026): the server says the lowest
// version code of the app that still works with it. Below it, the app asks
// to update (app-update.js). Raising it is a reviewed SQL, after the new AAB
// is on Play. Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_app_min_version_v1\.sql$/.test(f));
const read = (user, platform, role = 'authenticated') => h.as(db, user, 'select public.get_app_min_version($1) r', [platform], role);

let db;
test.beforeEach(async () => { db = await h.database(); });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration exists and is listed in the cutoff', () => {
  assert.ok(FILE, 'missing supabase/migrations/*_app_min_version_v1.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
});

test('it starts at 0 for android and ios: nobody is asked to update', async () => {
  assert.equal(Number(await read(h.F, 'android')), 0);
  assert.equal(Number(await read(h.B, 'ios')), 0);
  await assert.rejects(read(null, 'android', 'anon'), /permission denied/, 'signed-in clients only (F1B)');
  assert.equal(Number(await h.as(db, h.F, 'select coalesce(public.get_app_min_version($1), -1) r', ['web'])), -1, 'the web app updates by itself');
});

test('a reviewed SQL raises it; clients read it but cannot change it', async () => {
  await db.query(`update public.app_min_version set min_version_code = 430000 where platform = 'android'`);
  assert.equal(Number(await read(h.F, 'android')), 430000);
  for (const role of ['authenticated', 'anon']) {
    await assert.rejects(h.as(db, h.F, `update public.app_min_version set min_version_code = 1 where platform = 'android'`, [], role), /permission denied/);
    await assert.rejects(h.as(db, h.F, `select * from public.app_min_version`, [], role), /permission denied/);
  }
  await assert.rejects(db.query(`update public.app_min_version set min_version_code = -1 where platform = 'android'`), /check/);
});
