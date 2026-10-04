// Rebuilds the US backend in an empty embedded PostgreSQL (PGlite) and reads
// back its schema fingerprint with the same read-only queries that were run on
// production. No network, no production access.
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./evidence.cjs');
const { f2aQueries, captureQueries, aliasOf } = require('./queries.cjs');

const BASELINE_DIR = path.join(ROOT, 'supabase/baseline');
const PLATFORM = path.join(BASELINE_DIR, 'platform/pglite-platform.sql');
// 00_extensions.sql is platform-managed on Supabase; the skeleton provides it.
const SKIPPED_IN_REBUILD = new Set(['00_extensions.sql']);

async function newDb() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { pgcrypto } = await import('@electric-sql/pglite/contrib/pgcrypto');
  const { uuid_ossp } = await import('@electric-sql/pglite/contrib/uuid_ossp');
  const db = new PGlite({ extensions: { pgcrypto, uuid_ossp } });
  await db.exec(fs.readFileSync(PLATFORM, 'utf8'));
  return db;
}

async function applyFile(db, label, sql) {
  try {
    await db.exec(sql);
  } catch (error) {
    error.message = `${label}: ${error.message}`;
    throw error;
  }
}

// files: { name: sql } in apply order (a generated baseline), or read from disk.
async function rebuild({ files = null, forward = [] } = {}) {
  const db = await newDb();
  const baseline = files || readBaseline();
  const order = JSON.parse(baseline['MANIFEST.json']).apply_order;
  for (const name of order) {
    if (SKIPPED_IN_REBUILD.has(name)) continue;
    await applyFile(db, name, baseline[name]);
  }
  for (const file of forward) await applyFile(db, path.basename(file), fs.readFileSync(file, 'utf8'));
  return db;
}

function readBaseline(dir = BASELINE_DIR) {
  const out = {};
  for (const name of fs.readdirSync(dir)) {
    if (/\.(sql|json)$/.test(name)) out[name] = fs.readFileSync(path.join(dir, name), 'utf8');
  }
  return out;
}

async function runPack(db, queries, searchPath) {
  const out = {};
  await db.exec(`select pg_catalog.set_config('search_path', '${searchPath.replace(/'/g, "''")}', false)`);
  for (const sql of Object.values(queries)) {
    const alias = aliasOf(sql);
    const res = await db.query(sql);
    out[alias] = res.rows.length ? res.rows[0][alias] : null;
  }
  return out;
}

// F2A blocks that describe schema (not data volumes, run history or the ledger).
const F2A_SCHEMA_BLOCKS = ['2', '3', '4', '5', '6', '7', '8', '10', '11'];

async function fingerprint(db, searchPath) {
  const f2a = f2aQueries();
  const picked = Object.fromEntries(F2A_SCHEMA_BLOCKS.map((k) => [k, f2a[k]]));
  return {
    f2a: await runPack(db, picked, searchPath),
    capture: await runPack(db, captureQueries(), searchPath),
  };
}

module.exports = { BASELINE_DIR, newDb, rebuild, readBaseline, runPack, fingerprint, F2A_SCHEMA_BLOCKS };
