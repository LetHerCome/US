// Colori a scelta con US Plus (founder, 29/10/2026, DECISIONS.md): each person
// picks their colour from 8; both phones show it. Only while the couple has
// Plus (at least one current member with an active entitlement, D4). The
// entitlement table is the read side of plus-v1-staging.md §2: only the server
// writes it. Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_person_colors_plus_v1\.sql$/.test(f));
const setColor = (user, color) => h.as(db, user, 'select public.set_my_color($1) r', [color]);
const plus = (user) => h.as(db, user, 'select public.get_couple_plus() r');
const grant = (user, over = {}) => db.query(
  `insert into public.plus_entitlements(user_id, source, product, status, expires_at) values ($1, $2, $3, $4, $5)`,
  [user, over.source || 'manuale', over.product || 'us_plus_monthly', over.status || 'active', over.expires_at ?? null]);
const colorOf = async (id) => (await db.query('select person_color from public.profiles where id=$1', [id])).rows[0].person_color;

let db;
test.beforeEach(async () => { db = await h.database(); });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration exists and is listed in the cutoff', () => {
  assert.ok(FILE, 'missing supabase/migrations/*_person_colors_plus_v1.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
});

test('without Plus: nobody has it, and the colour cannot be changed', async () => {
  assert.deepEqual(await plus(h.F), { active: false, by: null });
  await assert.rejects(setColor(h.F, 'cielo'), /plus required/);
  assert.equal(await colorOf(h.F), null, 'the usual rosa / lilla');
});

test('Plus of either partner opens it for both, and names who has it', async () => {
  await grant(h.B);
  assert.deepEqual(await plus(h.F), { active: true, by: 'Beatrice' });
  assert.deepEqual(await setColor(h.F, 'cielo'), { color: 'cielo' });
  assert.deepEqual(await setColor(h.B, 'oro'), { color: 'oro' });
  const both = await h.as(db, h.B, 'select id, person_color from public.profiles order by display_name');
  assert.deepEqual(both.map((r) => r.person_color), ['oro', 'cielo'], 'each sees both colours');
});

test('a colour from the 8 only, never the partner\'s (their default counts too)', async () => {
  await grant(h.F);
  await assert.rejects(setColor(h.F, 'verde acido'), /invalid color/);
  await assert.rejects(setColor(h.F, '#ff0000'), /invalid color/);
  await assert.rejects(setColor(h.F, 'lilla'), /partner color/, 'Beatrice is lilla by default');
  await setColor(h.B, 'salvia');
  assert.deepEqual(await setColor(h.F, 'lilla'), { color: 'lilla' }, 'free once she moved');
  await assert.rejects(setColor(h.F, 'salvia'), /partner color/);
});

test('back to the usual colour is always allowed; a chosen colour stays after Plus ends', async () => {
  await grant(h.F, { expires_at: new Date(Date.now() + 864e5).toISOString() });
  await setColor(h.F, 'pesca');
  await db.query(`update public.plus_entitlements set status = 'expired'`);
  assert.equal((await plus(h.F)).active, false);
  assert.equal(await colorOf(h.F), 'pesca', 'what the couple made stays (D4)');
  await assert.rejects(setColor(h.F, 'oro'), /plus required/);
  assert.deepEqual(await setColor(h.F, null), { color: null });
  assert.equal(await colorOf(h.F), null);
});

test('an expired date, or someone outside the couple, gives no Plus', async () => {
  await grant(h.F, { expires_at: '2026-01-01T00:00:00Z' });
  await grant(h.U1, { source: 'beta' });
  assert.equal((await plus(h.B)).active, false);
});

test('entitlements: each reads only their own row and nobody writes from the app', async () => {
  await grant(h.F, { source: 'beta' });
  await grant(h.B);
  assert.equal((await h.as(db, h.F, 'select user_id from public.plus_entitlements')).length, 1);
  for (const role of ['authenticated', 'anon']) {
    await assert.rejects(h.as(db, h.F, `insert into public.plus_entitlements(user_id, source, product, status) values ($1, 'manuale', 'x', 'active')`, [h.F], role), /permission denied|row-level security/);
    await assert.rejects(h.as(db, h.F, `update public.profiles set person_color = 'oro' where id = $1`, [h.F], role), /permission denied/);
  }
  await assert.rejects(db.query(`insert into public.plus_entitlements(user_id, source, product, status) values ($1, 'regalo', 'x', 'active')`, [h.U2]), /check/);
});
