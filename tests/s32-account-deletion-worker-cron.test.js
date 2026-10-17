// US Store S3.2: the account deletion worker runs hourly in production, with
// the same Vault-based pattern as the F2C jobs; staging (no us_project_url)
// schedules nothing. Runs the real migration on PGlite with pg_cron, Vault and
// pg_net stand-ins.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FILE = 'supabase/migrations/20261017120000_s32_account_deletion_worker_cron.sql';
const SQL = fs.readFileSync(path.join(ROOT, FILE), 'utf8');

const FIXTURE = `
  create schema vault;
  create table vault.secrets (name text primary key, secret text);
  create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;
  create function vault.create_secret(value text, secret_name text) returns uuid language sql as $$
    insert into vault.secrets values (secret_name, value); select gen_random_uuid();
  $$;
  create schema cron;
  create table cron.job (jobname text, schedule text, command text, username text default current_user);
  create function cron.schedule(job_name text, job_schedule text, job_command text) returns bigint language plpgsql as $$
  begin
    delete from cron.job where jobname = job_name and username = current_user;
    insert into cron.job (jobname, schedule, command) values (job_name, job_schedule, job_command);
    return 1;
  end $$;
  create schema net;
  create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$ select 1::bigint $$;
`;

async function db(setup = '') {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  await pg.exec(FIXTURE + setup);
  return pg;
}
const rows = async (pg, sql) => (await pg.query(sql)).rows;

test('staging (no us_project_url): nothing is scheduled and no key is created', async () => {
  const pg = await db();
  await pg.exec(SQL);
  assert.deepEqual(await rows(pg, 'select * from cron.job'), []);
  assert.deepEqual(await rows(pg, 'select * from vault.secrets'), []);
});

test('production: one hourly job that posts to the worker with the Vault key; a random key is created once', async () => {
  const pg = await db(`insert into vault.secrets values ('us_project_url', 'https://abc123.supabase.co/');`);
  await pg.exec(SQL);
  const jobs = await rows(pg, 'select jobname, schedule, command from cron.job');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].jobname, 'us-account-deletion-worker');
  assert.equal(jobs[0].schedule, '23 * * * *');
  assert.match(jobs[0].command, /\/functions\/v1\/account-deletion-worker/);
  assert.match(jobs[0].command, /'x-us-cron-key',\(select decrypted_secret from vault\.decrypted_secrets where name = 'us_account_deletion_cron_key' limit 1\)/);
  assert.doesNotMatch(jobs[0].command, /abc123/, 'the URL is read from the Vault at run time, never written in the job');
  const [key] = await rows(pg, "select secret from vault.secrets where name = 'us_account_deletion_cron_key'");
  assert.match(key.secret, /^[0-9a-f]{64}$/);

  // Re-running converges: still one job, the same key.
  await pg.exec(SQL);
  assert.equal((await rows(pg, 'select * from cron.job')).length, 1);
  const [again] = await rows(pg, "select secret from vault.secrets where name = 'us_account_deletion_cron_key'");
  assert.equal(again.secret, key.secret);
});

test('an existing key is kept; a malformed project URL or a job of another role aborts before any change', async () => {
  const kept = await db(`insert into vault.secrets values ('us_project_url', 'https://abc123.supabase.co'), ('us_account_deletion_cron_key', 'chosen-by-operator');`);
  await kept.exec(SQL);
  assert.deepEqual(await rows(kept, "select secret from vault.secrets where name = 'us_account_deletion_cron_key'"), [{ secret: 'chosen-by-operator' }]);

  const bad = await db(`insert into vault.secrets values ('us_project_url', 'http://evil.example/x');`);
  await assert.rejects(bad.exec(SQL), /us_project_url must be/);
  assert.deepEqual(await rows(bad, 'select * from cron.job'), []);

  const foreign = await db(`insert into vault.secrets values ('us_project_url', 'https://abc123.supabase.co');
    insert into cron.job (jobname, schedule, command, username) values ('us-account-deletion-worker', '* * * * *', 'select 1', 'someone_else');`);
  await assert.rejects(foreign.exec(SQL), /owned by another role/);
  assert.deepEqual(await rows(foreign, "select username from cron.job"), [{ username: 'someone_else' }]);
  assert.deepEqual(await rows(foreign, "select name from vault.secrets where name = 'us_account_deletion_cron_key'"), []);
});

test('the worker and its key reader exist with the names the cron uses', () => {
  const worker = fs.readFileSync(path.join(ROOT, 'supabase/functions/account-deletion-worker/index.ts'), 'utf8');
  assert.match(worker, /request\.headers\.get\("x-us-cron-key"\)/);
  const migration = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261013150000_s32_account_deletion_v1.sql'), 'utf8');
  assert.match(migration, /where name = 'us_account_deletion_cron_key'/);
  assert.match(fs.readFileSync(path.join(ROOT, 'supabase/config.toml'), 'utf8'), /\[functions\.account-deletion-worker\]\nverify_jwt = false/);
});
