// US vi ricorda (controllo 27/11/2026): «Non dirmelo più» on the bubble of the
// Bacheca is kept by the server like the other kinds; an unknown kind is
// still refused. Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const FILE = '20261127120000_us_battute_mute_bacheca.sql';
let db;
test.beforeEach(async () => { db = await h.database(); });
test.afterEach(async () => { await db?.close(); db = null; });

test('the bubble of the Bacheca can be muted and unmuted; other kinds stay refused', async () => {
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  assert.equal(await h.as(db, h.F, "select public.set_my_battute_mute_v1('bacheca', true) r"), true);
  assert.deepEqual((await db.query('select kind from public.us_battute_mute where user_id = $1', [h.F])).rows.map((r) => r.kind), ['bacheca']);
  assert.equal(await h.as(db, h.B, "select count(*)::int r from public.us_battute_mute"), 0, 'each person sees only their own');
  assert.equal(await h.as(db, h.F, "select public.set_my_battute_mute_v1('bacheca', false) r"), true);
  assert.equal((await db.query('select count(*)::int n from public.us_battute_mute where user_id = $1', [h.F])).rows[0].n, 0);
  await assert.rejects(h.as(db, h.F, "select public.set_my_battute_mute_v1('qualcosa', true) r"), /us_battute_mute_kind/);
});
