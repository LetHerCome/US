// Accoglienza V1 (docs/missions/accoglienza-v1.md): "vi vedete spesso o
// vivete lontani?" is one column of the couple, written only by its members,
// and it chooses the missions when the two locations are not shared. A shared
// location still decides. Full repo schema in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_couple_distance_v1\.sql$/.test(f));

let db, C2;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const mode = async (couple) => (await q('select private.bond_mode_for_couple($1) m', [couple]))[0].m;
const setAs = (user, couple, value) => h.as(db, user, "update public.couples set distance_mode = $2 where id = $1 returning distance_mode r", [couple, value]);

test.beforeEach(async () => {
  db = await h.database();
  const c = await h.create(db, h.U1, 'Other', '2025-06-01'); C2 = c.couple_id;
  const inv = await h.invite(db, h.U1); await h.accept(db, h.U2, inv.code, 'Other partner');
});
test.afterEach(async () => { await db?.close(); db = null; });

test('migration exists, is listed in the cutoff and opens only this column to the members', async () => {
  assert.ok(FILE, 'missing supabase/migrations/*_couple_distance_v1.sql');
  const sql = fs.readFileSync(path.join(DIR, FILE), 'utf8');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  assert.ok(sql.includes('grant update (distance_mode) on table public.couples to authenticated;'));
  assert.ok(sql.includes('revoke all on function private.bond_mode_for_couple(uuid) from public, anon, authenticated, service_role;'));
});

test('a member answers for the couple; only near or far; nobody else can write it', async () => {
  assert.equal((await q('select distance_mode from public.couples where id = $1', [h.A]))[0].distance_mode, null, 'not asked yet');
  assert.equal(await setAs(h.F, h.A, 'far'), 'far');
  assert.equal(await setAs(h.B, h.A, 'near'), 'near', 'either member');
  await assert.rejects(setAs(h.F, h.A, 'moon'), /couples_distance_mode_check/);
  // The other couple's row is invisible to this member: the update touches nothing.
  assert.deepEqual(await setAs(h.F, C2, 'far'), [], 'no row updated');
  assert.equal((await q('select distance_mode from public.couples where id = $1', [C2]))[0].distance_mode, null);
  await assert.rejects(h.as(db, null, 'update public.couples set distance_mode = $1 returning 1 r', ['far'], 'anon'), /permission denied/);
});

test('missions: without shared locations the answer decides; a shared location still wins', async () => {
  assert.equal(await mode(h.A), 'any', 'no answer, no location: every mission');
  await q("update public.couples set distance_mode = 'far' where id = $1", [h.A]);
  assert.equal(await mode(h.A), 'far');
  await q("update public.couples set distance_mode = 'near' where id = $1", [h.A]);
  assert.equal(await mode(h.A), 'near');
  // Milano and Roma: about 480 km.
  await q("insert into public.couple_locations(user_id, couple_id, latitude, longitude, updated_at) values ($1,$3,45.46,9.19,now()),($2,$3,41.90,12.50,now())", [h.F, h.B, h.A]);
  assert.equal(await mode(h.A), 'far', 'the locations decide');
  assert.equal(await mode(C2), 'any', 'the other couple is untouched');
});
