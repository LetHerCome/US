// US 1.0 Location A — database side, on the real schema in PGlite.
// Readings are stored only as grid cells of at least 3 km2, the partner never
// reads coordinates, and stop_sharing_location() deletes only your own reading.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { database, as, create, invite, accept, A, F, B, U1, U2, U3 } = require('./helpers/mc2-db');

const ROOT = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const MIGRATION = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261014180000_location_approximate_v1.sql'), 'utf8');

function clientCell() {
  const slice = (from, to) => app.slice(app.indexOf(from), app.indexOf(to));
  const source = [
    "const US_LOCATION_CELL_DEG=0.02;",
    slice('function usLocationCell(', 'function locationConsentGiven('),
    slice('function validCoordinate(', '// The server already rounds')
  ].join('\n');
  const sandbox = { Math, Number };
  vm.runInNewContext(`${source}\nthis.usLocationCell=usLocationCell;`, sandbox);
  return sandbox.usLocationCell;
}

const put = (db, user, couple, lat, lon) => as(db, user,
  `insert into public.couple_locations(user_id,couple_id,latitude,longitude,accuracy_m,updated_at)
   values ($1,$2,$3,$4,8,now())
   on conflict (user_id) do update set latitude=excluded.latitude, longitude=excluded.longitude, accuracy_m=excluded.accuracy_m, updated_at=excluded.updated_at`,
  [user, couple, lat, lon]);
const distance = (db, user) => as(db, user, 'select public.couple_distance() r');

test('stored readings are grid cells, identical to the app, and accuracy is dropped', async () => {
  const db = await database();
  try {
    const cell = clientCell();
    await put(db, F, A, 41.902783, 12.496366);
    const [row] = await as(db, F, 'select latitude, longitude, accuracy_m from public.couple_locations where user_id=$1', [F]);
    assert.deepEqual({ latitude: row.latitude, longitude: row.longitude }, { ...cell(41.902783, 12.496366) });
    assert.equal(row.accuracy_m, null);

    // Same grid in SQL and JS, across latitudes, signs and cell edges.
    const points = [[0, 0], [-33.8688, 151.2093], [59.9139, 10.7522], [64.1466, -21.9426], [-0.00001, -179.99999], [89.99, 179.99], [45.46, 9.19], [40.02, 8.04]];
    for (const [lat, lon] of points) {
      const [sql] = (await db.query('select cell_latitude, cell_longitude from private.location_cell($1,$2)', [lat, lon])).rows;
      assert.deepEqual({ latitude: sql.cell_latitude, longitude: sql.cell_longitude }, { ...cell(lat, lon) }, `${lat},${lon}`);
    }
    await assert.rejects(db.query('select * from private.location_cell(91, 0)'), /invalid coordinates/);
  } finally { await db.close(); }
});

test('an old client that still sends precise coordinates on update is snapped too', async () => {
  const db = await database();
  try {
    await put(db, F, A, 41.9, 12.5);
    await as(db, F, 'update public.couple_locations set latitude=45.464211, longitude=9.191383, accuracy_m=5 where user_id=$1', [F]);
    const [row] = await as(db, F, 'select latitude, longitude, accuracy_m from public.couple_locations where user_id=$1', [F]);
    assert.deepEqual({ latitude: row.latitude, longitude: row.longitude }, { ...clientCell()(45.464211, 9.191383) });
    assert.equal(row.accuracy_m, null);
  } finally { await db.close(); }
});

test('readings stored before the migration are snapped by its backfill', async () => {
  const db = await database();
  try {
    await db.exec('alter table public.couple_locations disable trigger couple_locations_coarsen');
    await db.query("insert into public.couple_locations(user_id,couple_id,latitude,longitude,accuracy_m,updated_at) values ($1,$2,41.902783,12.496366,4,now() - interval '1 hour')", [F, A]);
    await db.exec('alter table public.couple_locations enable trigger couple_locations_coarsen');
    const backfill = MIGRATION.match(/^update public\.couple_locations set latitude = latitude;$/m)[0];
    await db.exec(backfill);
    const [row] = (await db.query('select latitude, longitude, accuracy_m, updated_at from public.couple_locations where user_id=$1', [F])).rows;
    assert.deepEqual({ latitude: row.latitude, longitude: row.longitude }, { ...clientCell()(41.902783, 12.496366) });
    assert.equal(row.accuracy_m, null);
    assert.ok(Date.now() - new Date(row.updated_at).getTime() > 50 * 60000, 'the reading keeps its age');
  } finally { await db.close(); }
});

test('the partner never reads coordinates: only their own row is visible', async () => {
  const db = await database();
  try {
    await put(db, F, A, 41.9028, 12.4964);
    await put(db, B, A, 45.4642, 9.19);
    const seenByF = await as(db, F, 'select user_id from public.couple_locations');
    assert.deepEqual(seenByF.map((r) => r.user_id), [F]);
    const seenByB = await as(db, B, 'select user_id from public.couple_locations');
    assert.deepEqual(seenByB.map((r) => r.user_id), [B]);
    // No write to the partner's row either.
    await as(db, F, 'update public.couple_locations set latitude=0 where user_id=$1', [B]);
    await as(db, F, 'delete from public.couple_locations where user_id=$1', [B]);
    const [still] = (await db.query('select latitude from public.couple_locations where user_id=$1', [B])).rows;
    assert.notEqual(still.latitude, 0);
  } finally { await db.close(); }
});

test('couple_distance returns a rounded distance or "near", and never coordinates', async () => {
  const db = await database();
  try {
    let r = await distance(db, F);
    assert.equal(r.sharing, false);
    assert.equal(r.partner_sharing, false);
    assert.equal(r.distance_km, null);

    await put(db, F, A, 41.9028, 12.4964);
    r = await distance(db, F);
    assert.equal(r.sharing, true);
    assert.equal(r.partner_sharing, false, 'waiting for the partner');

    await put(db, B, A, 45.4642, 9.19);
    r = await distance(db, F);
    assert.equal(r.near, false);
    assert.ok(Number.isInteger(r.distance_km));
    assert.ok(r.distance_km > 450 && r.distance_km < 500, String(r.distance_km));
    assert.deepEqual(Object.keys(r).sort(), ['distance_km', 'my_updated_at', 'near', 'partner_sharing', 'partner_updated_at', 'sharing']);
    // Timestamps can contain 45.4 (e.g. 23:17:45.406): look for coordinates outside them.
    const { my_updated_at: _mine, partner_updated_at: _partner, ...rest } = r;
    assert.doesNotMatch(JSON.stringify(rest), /latitude|longitude|45\.4|9\.19/);
    assert.equal((await distance(db, B)).distance_km, r.distance_km, 'same answer for both');

    await put(db, B, A, 41.9035, 12.4975);
    r = await distance(db, F);
    assert.equal(r.near, true);
    assert.equal(r.distance_km, null, 'under 3 km only "near"');
  } finally { await db.close(); }
});

test('other couples, anonymous callers and users without a couple get nothing', async () => {
  const db = await database();
  try {
    await put(db, F, A, 41.9028, 12.4964);
    await put(db, B, A, 45.4642, 9.19);
    const other = await create(db, U1, 'Alex');
    const code = (await invite(db, U1)).code;
    await accept(db, U2, code, 'Sam');
    await put(db, U1, other.couple_id, 40.85, 14.27);
    const r = await distance(db, U1);
    assert.equal(r.partner_sharing, false, "another couple's reading never counts as the partner's");
    assert.deepEqual((await as(db, U1, 'select user_id from public.couple_locations')).map((x) => x.user_id), [U1]);
    await assert.rejects(put(db, U1, A, 41.9, 12.5), /row-level security|violates/i);
    await assert.rejects(distance(db, U3), /authentication required/);
    await assert.rejects(as(db, null, 'select public.couple_distance() r', [], 'anon'), /permission denied/);
    await assert.rejects(as(db, F, 'select * from private.location_cell(41.9, 12.5)'), /permission denied/);
  } finally { await db.close(); }
});

test('stop_sharing_location deletes only your own reading and is safe to repeat', async () => {
  const db = await database();
  try {
    await put(db, F, A, 41.9028, 12.4964);
    await put(db, B, A, 45.4642, 9.19);
    assert.equal(await as(db, F, 'select public.stop_sharing_location() r'), true);
    assert.equal(await as(db, F, 'select public.stop_sharing_location() r'), false);
    const rows = (await db.query('select user_id from public.couple_locations')).rows.map((r) => r.user_id);
    assert.deepEqual(rows, [B]);
    const r = await distance(db, B);
    assert.equal(r.sharing, true);
    assert.equal(r.partner_sharing, false);
    assert.equal(r.distance_km, null);
    await assert.rejects(as(db, null, 'select public.stop_sharing_location() r', [], 'anon'), /permission denied/);
  } finally { await db.close(); }
});

test('the SQL Editor script runs the migration verbatim, records it once and refuses a second run', async () => {
  const { newDb } = require('../scripts/supabase-baseline/rebuild.cjs');
  const { DIR, FILE, PLATFORM, SEED, MC2, afterMc2 } = require('./helpers/mc2-db');
  const script = fs.readFileSync(path.join(ROOT, 'docs/store/US_1_0_LOCATION_A_SQL_EDITOR.sql'), 'utf8');
  assert.equal(script.split(MIGRATION).length - 1, 2, 'the migration appears verbatim twice: executed and recorded');

  const db = await newDb();
  try {
    // Production as it is before this PR: every other migration, no ledger row for this one.
    await db.exec(PLATFORM);
    // Same order as tests/helpers/mc2-db.js: S3.2 migrations build on MC2.
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql') && f !== FILE && !f.startsWith('20261014180000')).sort();
    for (const f of files.filter((f) => !afterMc2(f))) await db.exec(fs.readFileSync(path.join(DIR, f), 'utf8'));
    await db.exec(SEED);
    await db.exec(MC2());
    for (const f of files.filter(afterMc2)) await db.exec(fs.readFileSync(path.join(DIR, f), 'utf8'));
    await db.exec('create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text)');
    await db.query('insert into public.couple_locations(user_id,couple_id,latitude,longitude,accuracy_m,updated_at) values ($1,$2,41.902783,12.496366,7,now())', [F, A]);

    const results = await db.exec(script);
    const check = results[results.length - 1].rows[0];
    assert.deepEqual({ ...check }, { precise: 0, vecchia_regola: 0, funzioni: 2, registrata: 1 });
    const [ledger] = (await db.query("select name, statements from supabase_migrations.schema_migrations where version='20261014180000'")).rows;
    assert.equal(ledger.name, 'location_approximate_v1');
    assert.deepEqual(ledger.statements, [MIGRATION]);

    await assert.rejects(db.exec(script), /già applicata/);
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int n from supabase_migrations.schema_migrations')).rows[0].n, 1);
  } finally { await db.close(); }
});
