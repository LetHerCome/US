// Mappa dei Ricordi (founder, 29/10/2026, D1–D7): one place per Ricordo,
// rounded to about 100 m by the column type, seen only by the couple. Either
// member places or moves a Ricordo through set_moment_place. Full repo schema
// in disposable PGlite.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = require('./helpers/mc2-db');

const DIR = path.join(__dirname, '../supabase/migrations');
const FILE = fs.readdirSync(DIR).find((f) => /_ricordi_place_v1\.sql$/.test(f));
const M1 = '22222222-2222-4222-8222-222222222222';
const M2 = '33333333-3333-4333-8333-333333333333';

let db, C2, OTHER;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const place = (user, moment, lat, lon, label, source = 'search') =>
  h.as(db, user, 'select public.set_moment_place($1,$2,$3,$4,$5) r', [moment, lat, lon, label, source]);
const row = async (id) => (await q('select place_lat::float8 lat, place_lon::float8 lon, place_label label, place_source source from public.moments where id = $1', [id]))[0];

test.beforeEach(async () => {
  db = await h.database();
  const c = await h.create(db, h.U1, 'Other', '2025-06-01'); C2 = c.couple_id; OTHER = h.U1;
  await q("insert into public.moments(id, couple_id, created_by, storage_path, moment_date) values ($1,$3,$4,'a/b/1.webp','2026-05-01'),($2,$5,$6,'x/y/2.webp','2026-05-02')", [M1, M2, h.A, h.B, C2, OTHER]);
});
test.afterEach(async () => { await db?.close(); db = null; });

test('migration exists, is listed in the cutoff and the export carries the place', async () => {
  assert.ok(FILE, 'missing supabase/migrations/*_ricordi_place_v1.sql');
  const sql = fs.readFileSync(path.join(DIR, FILE), 'utf8');
  const cutoff = JSON.parse(fs.readFileSync(path.join(__dirname, '../supabase/baseline/MIGRATION_CUTOFF.json'), 'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE) && cutoff.forward_migrations.includes(FILE));
  assert.match(sql, /grant execute on function public\.set_moment_place\(uuid, double precision, double precision, text, text\) to authenticated;/);
  const core = fs.readFileSync(path.join(__dirname, '../supabase/functions/_shared/s3-2-export-core.mjs'), 'utf8');
  assert.match(core, /\['moments','created_by','[^']*place_lat,place_lon,place_label,place_source[^']*'/);
});

test('a new Ricordo has no place; the author can save one with the photo, rounded to about 100 m', async () => {
  assert.deepEqual(await row(M1), { lat: null, lon: null, label: null, source: null });
  const id = await h.as(db, h.B, "insert into public.moments(couple_id, created_by, storage_path, place_lat, place_lon, place_label, place_source) values ($1,$2,'a/b/3.webp',44.494887,11.342616,'Bologna','photo') returning id r", [h.A, h.B]);
  assert.deepEqual(await row(id), { lat: 44.495, lon: 11.343, label: 'Bologna', source: 'photo' });
});

test('either member places, moves and clears a Ricordo of the couple', async () => {
  // M1 was uploaded by F: B places it (D6, old Ricordi are placed by hand).
  const placed = await place(h.B, M1, 45.464211, 9.190005, '  Duomo, Milano  ');
  assert.deepEqual(placed, { id: M1, lat: 45.464, lon: 9.19, label: 'Duomo, Milano', source: 'search' });
  assert.deepEqual(await row(M1), { lat: 45.464, lon: 9.19, label: 'Duomo, Milano', source: 'search' });
  await place(h.F, M1, -33.8568, 151.2153, 'Sydney', 'photo');
  assert.deepEqual(await row(M1), { lat: -33.857, lon: 151.215, label: 'Sydney', source: 'photo' });
  // Repeating the same call is harmless.
  await place(h.F, M1, -33.8568, 151.2153, 'Sydney', 'photo');
  assert.deepEqual(await place(h.B, M1, null, null, null, null), { id: M1, lat: null, lon: null, label: null, source: null });
  assert.deepEqual(await row(M1), { lat: null, lon: null, label: null, source: null });
});

test('the place is only for the couple: no other couple, no anonymous visitor', async () => {
  await place(h.F, M1, 45.4642, 9.19, 'Milano');
  await assert.rejects(place(OTHER, M1, 41.9, 12.5, 'Roma'), /moment not found/);
  assert.equal((await row(M1)).label, 'Milano', 'untouched');
  const seen = await h.as(db, OTHER, 'select id, place_label from public.moments order by id');
  assert.deepEqual(seen.map((m) => m.id), [M2], 'the other couple sees only its own Ricordo');
  await assert.rejects(h.as(db, null, 'select id from public.moments', [], 'anon'), /permission denied/);
  await assert.rejects(h.as(db, null, 'select public.set_moment_place($1,1,1,$2,$3) r', [M1, 'x', 'search'], 'anon'), /permission denied/);
});

test('only real places: coordinates in range, both or none, a short label, a known source', async () => {
  await assert.rejects(place(h.F, M1, 91, 9, 'Polo'), /invalid place/);
  await assert.rejects(place(h.F, M1, 45, -181, 'Mare'), /invalid place/);
  await assert.rejects(place(h.F, M1, 45, null, 'Mezzo'), /invalid place/);
  await assert.rejects(place(h.F, M1, 45, 9, '   '), /invalid place/);
  await assert.rejects(place(h.F, M1, 45, 9, 'x'.repeat(121)), /invalid place/);
  await assert.rejects(place(h.F, M1, 45, 9, 'Milano', 'gps-live'), /invalid place/);
  // A direct write cannot skip the checks either.
  await assert.rejects(q("update public.moments set place_lat = 45, place_lon = null, place_label = 'x', place_source = 'search' where id = $1", [M1]), /moments_place_check/);
  await assert.rejects(q("update public.moments set place_lat = 45, place_lon = 9, place_label = '', place_source = 'search' where id = $1", [M1]), /moments_place_check/);
});
