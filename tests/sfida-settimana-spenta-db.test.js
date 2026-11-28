// La sfida della settimana, spenta (founder, 28/11/2026): the migration removes
// the hourly cron of weekly-challenge-job and touches nothing else. Run on a
// real Postgres (PGlite) with the pg_cron stand-in of the baseline rebuild.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { newDb } = require('../scripts/supabase-baseline/rebuild.cjs');

const FILE = '20261128141224_sfida_settimana_spenta.sql';
const SQL = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations', FILE), 'utf8');

async function withCron(fn) {
  const db = await newDb();
  try {
    await db.exec(`select cron.schedule('us-weekly-challenge-hourly', '12 * * * *', 'select 1');
      select cron.schedule('us-game-v2-push', '*/10 * * * *', 'select 2');`);
    await fn(db);
  } finally {
    await db.close();
  }
}
const names = async (db) => (await db.query('select jobname from cron.job order by jobid')).rows.map((r) => r.jobname);

test('the weekly challenge cron goes, every other job stays, and a second run changes nothing', async () => {
  await withCron(async (db) => {
    await db.exec(SQL);
    assert.deepEqual(await names(db), ['us-game-v2-push']);
    await db.exec(SQL);
    assert.deepEqual(await names(db), ['us-game-v2-push']);
  });
});

test('a job of that name owned by another role stops the file before any change', async () => {
  await withCron(async (db) => {
    await db.exec(`update cron.job set username = 'someone_else' where jobname = 'us-weekly-challenge-hourly'`);
    await assert.rejects(db.exec(SQL), /owned by another role/);
    assert.deepEqual(await names(db), ['us-weekly-challenge-hourly', 'us-game-v2-push']);
  });
});

test('without pg_cron (a bare database) nothing happens', async () => {
  const db = await newDb();
  try {
    await db.exec('drop schema cron cascade');
    await db.exec(SQL);
  } finally {
    await db.close();
  }
});

test('the file only removes the cron: no table, grant, policy, function or data change', () => {
  const code = SQL.replace(/--.*$/gm, '').replace(/'(?:[^']|'')*'/g, "''");
  assert.match(code, /perform cron\.unschedule\(''\)/);
  assert.doesNotMatch(code, /\b(?:create|alter|drop|grant|revoke|insert|update|delete|truncate)\b/i);
});
