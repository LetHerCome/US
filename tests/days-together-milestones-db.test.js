// Traguardi dei giorni insieme (founder, 29/10/2026): every 100 days together
// is a milestone, and every 1000 the biggest prize. The hourly
// monthiversary-job awards it through award_relationship_days_milestone, next
// to the mesiversario; the couple reads it from relationship_milestones.
// Full repo schema in disposable PGlite; no real Supabase project.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_days_together_milestones_v1\.sql$/.test(f));
// Couple A (helpers/mc2-db.js) is together since 2026-04-21.
const after = (days) => new Date(Date.UTC(2026, 3, 21) + days * 864e5).toISOString().slice(0, 10);
const award = (db, days, xp, date = after(days), couple = h.A) => h.as(db, null,
  'select public.award_relationship_days_milestone($1::uuid,$2::date,$3::integer,$4::integer) r', [couple, date, days, xp], 'service_role');
const xpOf = async (db) => (await db.query('select bond_xp from public.couples where id=$1', [h.A])).rows[0].bond_xp;

let db;
test.beforeEach(async () => { db = await h.database(); });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration exists, is listed in the cutoff and the award stays server-only', () => {
  assert.ok(FILE, 'missing supabase/migrations/*_days_together_milestones_v1.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  const sql = fs.readFileSync(path.join(DIR, FILE), 'utf8');
  assert.match(sql, /revoke all on function public\.award_relationship_days_milestone\(uuid, date, integer, integer\) from public, anon, authenticated, service_role;\ngrant execute on function public\.award_relationship_days_milestone\(uuid, date, integer, integer\) to service_role;/);
});

test('a days milestone is recorded once, with its days, and adds its points to the Sintonia', async () => {
  const before = await xpOf(db);
  assert.equal(await award(db, 1000, 300), true);
  assert.equal(await award(db, 1000, 300), false, 'the hourly job may run twice: once only');
  const rows = (await db.query(`select kind, days_together, months_together, xp_awarded from public.relationship_milestones where couple_id=$1`, [h.A])).rows;
  assert.deepEqual(rows, [{ kind: 'days', days_together: 1000, months_together: 32, xp_awarded: 300 }]);
  assert.equal(await xpOf(db), before + 300);
  const feed = (await db.query(`select payload from public.activity where couple_id=$1 and type='relationship_milestone'`, [h.A])).rows;
  assert.deepEqual(feed.map((r) => [r.payload.kind, r.payload.days, r.payload.xp]), [['days', 1000, 300]]);
});

test('the same day can be a mesiversario and a days milestone: both count', async () => {
  await h.as(db, null, `select public.award_relationship_milestone($1::uuid,$2::date,5,'monthiversary',60) r`, [h.A, after(300)], 'service_role');
  assert.equal(await award(db, 300, 80), true);
  const kinds = (await db.query(`select kind from public.relationship_milestones where couple_id=$1 order by kind`, [h.A])).rows.map((r) => r.kind);
  assert.deepEqual(kinds, ['days', 'monthiversary']);
});

test('only whole hundreds of days, with sane points', async () => {
  assert.equal(after(300), '2027-02-15');
  await assert.rejects(award(db, 300, 80, '2027-02-16'), /Invalid milestone/, 'the days must be the days since Insieme dal');
  for (const [days, xp] of [[150, 80], [0, 80], [-100, 80], [100, -1], [100, 501]]) {
    await assert.rejects(award(db, days, xp), /Invalid milestone/, `${days}/${xp}`);
  }
});

test('the couple reads its milestones; nobody else can award one', async () => {
  await award(db, 100, 80);
  const mine = await h.as(db, h.F, `select kind, days_together from public.relationship_milestones`);
  assert.deepEqual(mine.map((r) => [r.kind, r.days_together]), [['days', 100]]);
  for (const role of ['authenticated', 'anon']) {
    await assert.rejects(h.as(db, h.F, `select public.award_relationship_days_milestone($1::uuid,$2::date,200,80) r`, [h.A, after(200)], role), /permission denied/);
  }
});
