// Batteria del partner (founder, grill del 31/10/2026). Each phone reports its
// own battery level only while US is in use; the partner of the same couple
// reads the last one (level, charging, when), nobody else does. The time is
// the server's, a retry within a minute writes nothing, and the reading goes
// with the account. Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_couple_battery_v1\.sql$/.test(f));

let db;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const report = (user, level, charging) => h.as(db, user, 'select public.report_battery($1,$2) r', [level, charging]);
const seen = (user) => h.as(db, user, 'select user_id, level, charging from public.couple_batteries order by user_id');

test.beforeEach(async () => { db = await h.database(); });
test.afterEach(async () => { await db?.close(); db = null; });

test('migration exists, is listed in the cutoff, the export and Realtime', async () => {
  assert.ok(FILE, 'missing supabase/migrations/*_couple_battery_v1.sql');
  const cutoff = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  const core = fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/s3-2-export-core.mjs'), 'utf8');
  assert.match(core, /\['couple_batteries','user_id','user_id,couple_id,level,charging,updated_at',true\]/);
  const paging = fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/s3-2-export-paging.mjs'), 'utf8');
  assert.match(paging, /couple_batteries:'user_id'/);
  assert.equal((await q("select count(*)::int n from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'couple_batteries'"))[0].n, 1);
  assert.equal((await q("select relrowsecurity on_ from pg_class where oid = 'public.couple_batteries'::regclass"))[0].on_, true);
});

test('a member reports the battery; the partner reads level, charging and the server time', async () => {
  const saved = await report(h.B, 18, false);
  assert.deepEqual({ level: saved.level, charging: saved.charging }, { level: 18, charging: false });
  assert.ok(Math.abs(Date.now() - Date.parse(saved.updated_at)) < 60000, 'server time');
  assert.deepEqual(Object.keys(saved).sort(), ['charging', 'level', 'updated_at']);

  const byF = await seen(h.F);
  assert.deepEqual(byF, [{ user_id: h.B, level: 18, charging: false }]);
  await report(h.F, 64, true);
  assert.deepEqual(await seen(h.B), [{ user_id: h.F, level: 64, charging: true }, { user_id: h.B, level: 18, charging: false }].sort((a, b) => a.user_id.localeCompare(b.user_id)));

  const [row] = await q('select couple_id from public.couple_batteries where user_id = $1', [h.B]);
  assert.equal(row.couple_id, h.A, 'the couple comes from the profile, not from the phone');
});

test('levels outside 0–100, no account or no couple are refused', async () => {
  await assert.rejects(report(h.F, 101, false), /battery level invalid/);
  await assert.rejects(report(h.F, -1, false), /battery level invalid/);
  await assert.rejects(report(h.F, null, false), /battery level invalid/);
  await assert.rejects(report(null, 50, false), /authentication required/);
  // U1 has an account but no couple yet.
  await assert.rejects(report(h.U1, 50, false), /authentication required/);
  assert.equal((await q('select count(*)::int n from public.couple_batteries'))[0].n, 0);
  // Charging unknown is stored as not charging.
  assert.equal((await report(h.F, 0, null)).charging, false);
  assert.equal((await report(h.F, 100, true)).level, 100);
});

test('only the couple reads it; nobody writes or deletes the partner reading', async () => {
  await report(h.F, 40, false);
  await report(h.B, 70, true);
  // Another couple.
  const c = await h.create(db, h.U1, 'Other', '2025-06-01');
  await report(h.U1, 90, false);
  assert.deepEqual((await seen(h.U1)).map((r) => r.user_id), [h.U1]);
  assert.deepEqual((await seen(h.F)).map((r) => r.user_id).sort(), [h.F, h.B].sort());
  assert.ok(c.couple_id);

  // Anonymous visitors read nothing and cannot report.
  await assert.rejects(h.as(db, null, 'select * from public.couple_batteries', [], 'anon'), /permission denied/);
  await assert.rejects(h.as(db, null, 'select public.report_battery(10,false) r', [], 'anon'), /permission denied/);

  // Direct writes: never the partner's row, never another couple, never a fake time.
  await h.as(db, h.F, 'update public.couple_batteries set level = 1 where user_id = $1', [h.B]);
  await h.as(db, h.F, 'delete from public.couple_batteries where user_id = $1', [h.B]);
  assert.equal((await q('select level from public.couple_batteries where user_id = $1', [h.B]))[0].level, 70);
  await assert.rejects(h.as(db, h.U2, 'insert into public.couple_batteries(user_id, couple_id, level) values ($1,$2,5)', [h.U2, h.A]), /row-level security/);
  await h.as(db, h.F, "update public.couple_batteries set updated_at = now() + interval '3 days' where user_id = $1", [h.F]);
  const [mine] = await q('select updated_at from public.couple_batteries where user_id = $1', [h.F]);
  assert.ok(Date.parse(mine.updated_at) <= Date.now() + 1000, 'the server sets the time');

  // Your own reading can be deleted.
  await h.as(db, h.F, 'delete from public.couple_batteries where user_id = $1', [h.F]);
  assert.deepEqual((await seen(h.B)).map((r) => r.user_id), [h.B]);
});

test('a retry within a minute writes nothing; a new level or an older reading does', async () => {
  const first = await report(h.F, 50, false);
  const again = await report(h.F, 50, false);
  assert.equal(again.updated_at, first.updated_at, 'same reading within a minute: no write, no Realtime event');
  const changed = await report(h.F, 49, false);
  assert.equal(changed.level, 49);
  await q("update public.couple_batteries set updated_at = now() - interval '20 minutes' where user_id = $1", [h.F]);
  const later = await report(h.F, 49, false);
  assert.ok(Date.now() - Date.parse(later.updated_at) < 60000, 'same level, later: the time moves on');
});

test('the reading goes with the account and moves with a new couple', async () => {
  await report(h.F, 33, false);
  await report(h.B, 66, false);
  await q('delete from public.profiles where id = $1', [h.B]);
  assert.deepEqual((await q('select user_id from public.couple_batteries')).map((r) => r.user_id), [h.F]);
  // A reading left under an older couple id is moved by the next report.
  const c = await h.create(db, h.U1, 'Other', '2025-06-01');
  await q('insert into public.couple_batteries(user_id, couple_id, level) values ($1,$2,12)', [h.U1, h.A]);
  assert.deepEqual(await seen(h.F), [{ user_id: h.F, level: 33, charging: false }], 'not shown to the old couple once the owner is in another one');
  await report(h.U1, 12, false);
  assert.equal((await q('select couple_id from public.couple_batteries where user_id = $1', [h.U1]))[0].couple_id, c.couple_id);
});

test('re-applying the migration changes nothing', async () => {
  await report(h.F, 21, true);
  await db.exec(fs.readFileSync(path.join(DIR, FILE), 'utf8'));
  assert.deepEqual(await seen(h.B), [{ user_id: h.F, level: 21, charging: true }]);
  assert.equal((await q("select count(*)::int n from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'couple_batteries'"))[0].n, 1);
});
