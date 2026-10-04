const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { newDb, readBaseline } = require('../scripts/supabase-baseline/rebuild.cjs');
const { loadEdgeFunction, createFakeAdmin } = require('./helpers/edge-function-harness');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const files = fs.readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
const FILE = files.find((f) => f.endsWith('_f2a3_retention_operations.sql'));
const SQL = FILE ? read(`supabase/migrations/${FILE}`) : '';
const NAMES = ['us-operational-retention-daily', 'us-left-for-you-cleanup-daily'];
const jobs = async (db) => (await db.query('select * from cron.job order by jobid')).rows;
async function fixture(production = false) {
  const db = await newDb();
  await db.exec(read(`supabase/migrations/${files[0]}`));
  for (const file of files.slice(1).filter((f) => f < FILE)) {
    if (production && file.endsWith('_f2c_edge_cron_source_of_truth.sql')) continue;
    await db.exec(read(`supabase/migrations/${file}`));
  }
  if (production) await db.exec(readBaseline()['90_cron.sql']);
  return db;
}
async function withDb(fn, production = false) {
  const db = await fixture(production);
  try { await fn(db); } finally { await db.close(); }
}
const C = '00000000-0000-0000-0000-000000000001';
const U = '00000000-0000-0000-0000-000000000002';
const B = '00000000-0000-0000-0000-000000000003';
async function seedOwners(db) {
  await db.exec(`insert into public.couples(id) values ('${C}');
    insert into auth.users(id) values ('${U}');
    insert into public.profiles(id, display_name, role, couple_id) values ('${U}', 'Test', 'francesco', '${C}')
    on conflict (id) do update set couple_id = excluded.couple_id;
    insert into auth.users(id) values ('${B}');
    insert into public.profiles(id, display_name, role, couple_id) values ('${B}', 'Partner', 'beatrice', '${C}')
    on conflict (id) do update set couple_id = excluded.couple_id;`);
}
const run = (db) => db.query('select private.run_operational_retention() as counts');

test('F2A3 source: only the approved technical tables are deleted; no Storage metadata, user history, Vault writes or legacy auth', () => {
  const code = SQL.replace(/--[^\n]*/g, '');
  const targets = [...code.matchAll(/delete\s+from\s+([a-z_.]+)/gi)].map((m) => m[1]);
  assert.deepEqual([...new Set(targets)].sort(), [
    'cron.job_run_details', 'public.widget_action_tokens', 'public.widget_tokens',
    'public.widget_scriptable_setup_codes', 'public.widget_scriptable_installations', 'private.left_for_you_cleanup_queue',
  ].sort());
  assert.doesNotMatch(code, /vault\.(create_secret|update_secret)|delete\s+from\s+storage\.|truncate/i);
  assert.match(SQL, /security invoker/i);
  assert.match(SQL, /revoke all on function private\.run_operational_retention\(\) from public, anon, authenticated, service_role/i);
  assert.doesNotMatch(read('supabase/functions/cleanup-left-for-you/index.ts'), /M5I_CLEANUP_SECRET|x-m5i-cleanup-secret/);
  assert.match(read('supabase/config.toml'), /\[functions\.cleanup-left-for-you\]\s*verify_jwt = false/);
});

for (const production of [false, true]) {
  test(`F2A3 ${production ? 'production upgrade' : 'fresh database'}: adds two paused jobs once, leaves existing jobs byte-identical and never runs retention on apply`, { timeout: 120000 }, () => withDb(async (db) => {
    const before = await jobs(db);
    await db.exec(`insert into cron.job_run_details(status, end_time) values ('succeeded', now()-interval '100 days')`);
    await db.exec(SQL);
    const first = await jobs(db);
    assert.deepEqual(first.filter((j) => !NAMES.includes(j.jobname)), before);
    assert.deepEqual(first.filter((j) => NAMES.includes(j.jobname)).map((j) => [j.jobname, j.schedule, j.active, j.username]), [
      [NAMES[0], '20 3 * * *', false, 'postgres'], [NAMES[1], '40 3 * * *', false, 'postgres'],
    ]);
    assert.equal((await db.query('select count(*)::int as n from cron.job_run_details')).rows[0].n, 1);
    assert.deepEqual((await db.query("select name from vault.secrets where name='us_left_for_you_cleanup_cron_key'")).rows, []);
    await db.exec(SQL);
    assert.deepEqual(await jobs(db), first);
    // A later operator activation is preserved on reapply, as is pausing again.
    await db.query('update cron.job set active=true where jobname=$1', [NAMES[0]]);
    const enabled = await jobs(db);
    await db.exec(SQL);
    assert.deepEqual(await jobs(db), enabled);
  }, production));
}

test('F2A3 cron guards: other owner, duplicate, command/schedule/database drift abort atomically', { timeout: 120000 }, () => withDb(async (db) => {
  for (const name of NAMES) {
    for (const mutation of [
      `update cron.job set username='another_owner' where jobname='${name}'`,
      `insert into cron.job(jobname,schedule,command,username) values ('${name}', '* * * * *', 'select 1', 'another_owner')`,
      `update cron.job set command='select 1' where jobname='${name}'`,
      `update cron.job set schedule='* * * * *' where jobname='${name}'`,
      `update cron.job set database='other_db' where jobname='${name}'`,
    ]) {
      await db.exec('begin');
      await db.exec(SQL);
      await db.exec(mutation);
      const before = await jobs(db);
      await db.exec('savepoint migration_attempt');
      await assert.rejects(db.exec(SQL), /F2A3:/);
      await db.exec('rollback to migration_attempt');
      assert.deepEqual(await jobs(db), before);
      await db.exec('rollback');
    }
  }
}));

test('F2A3 cutoffs: strict 14/30-day cron boundaries, push idempotency ledger retained indefinitely, unfinished runs preserved, repeat is a no-op', { timeout: 120000 }, () => withDb(async (db) => {
  await db.exec(SQL);
  await seedOwners(db);
  await db.exec('begin'); // now() remains fixed across all boundary assertions
  try {
    for (const [status, days] of [['succeeded', 14], ['failed', 30], ['running', 30]]) {
      for (const offset of [-1, 0, 1]) await db.query(`insert into cron.job_run_details(status, return_message, end_time)
        values ($1, $2, now()-make_interval(days=>$3)+make_interval(secs=>$4))`, [status, `${status}:${offset}`, days, offset]);
    }
    await db.exec(`insert into cron.job_run_details(status, return_message, end_time) values ('failed','unfinished',null)`);
    await db.exec(`insert into public.push_event_log(dedupe_key,couple_id,event_type,created_at)
      values ('push:180d','00000000-0000-0000-0000-000000000001','test',now()-interval '180 days'),
             ('push:2y','00000000-0000-0000-0000-000000000001','test',now()-interval '730 days')`);
    const counts = (await run(db)).rows[0].counts;
    assert.equal(counts.cron_success, 1);
    assert.equal(counts.cron_unsuccessful, 2);
    assert.equal(Object.prototype.hasOwnProperty.call(counts, 'push_event_log'), false);
    assert.deepEqual((await db.query('select return_message from cron.job_run_details order by return_message')).rows.map((r) => r.return_message),
      ['failed:0', 'failed:1', 'running:0', 'running:1', 'succeeded:0', 'succeeded:1', 'unfinished']);
    assert.deepEqual((await db.query('select dedupe_key from public.push_event_log order by dedupe_key')).rows.map((r) => r.dedupe_key),
      ['push:180d', 'push:2y']);
    assert.ok(Object.values((await run(db)).rows[0].counts).every((n) => n === 0));
  } finally { await db.exec('rollback'); }
}));

test('F2A3 widgets and queue: every lifecycle timestamp uses strict 30 days, FK cascades retain active-token receipts and user messages', { timeout: 120000 }, () => withDb(async (db) => {
  await db.exec(SQL);
  await seedOwners(db);
  await db.exec('begin');
  try {
    const message = (await db.query(`insert into public.shared_messages(couple_id,sender_id,recipient_id,kind,body,created_at)
      values ('${C}','${U}','${B}','normal','Keep our history',now()-interval '730 days') returning id`)).rows[0].id;
    await db.exec(`insert into public.moments(couple_id,created_by,storage_path,caption,moment_date,created_at)
      values ('${C}','${U}','old-memory.jpg','Keep this memory','2020-01-01',now()-interval '730 days');
      insert into public.progression_events(couple_id,actor_id,source_kind,source_key,xp_awarded,counts_rhythm,action_day,created_at)
      values ('${C}','${U}','think','f2a3-history',1,false,'2020-01-01',now()-interval '730 days');
      insert into public.left_for_you(couple_id,sender_id,recipient_id,kind,body,created_at,seen_at)
      values ('${C}','${U}','${B}','text','Retained by operational housekeeping',now()-interval '730 days',now()-interval '365 days');
      insert into storage.objects(bucket_id,name,created_at) values ('us-media','old-orphan.jpg',now()-interval '730 days');`);
    const storageBefore = (await db.query('select * from storage.objects')).rows;
    let sequence = 1;
    const hash = () => (sequence++).toString(16).padStart(64, '0');
    const cases = [
      ['public.widget_action_tokens', 'revoked_at'], ['public.widget_action_tokens', 'expires_at'],
      ['public.widget_tokens', 'revoked_at'], ['public.widget_scriptable_setup_codes', 'consumed_at'],
      ['public.widget_scriptable_setup_codes', 'revoked_at'], ['public.widget_scriptable_setup_codes', 'expires_at'],
      ['public.widget_scriptable_installations', 'revoked_at'], ['public.widget_scriptable_installations', 'expires_at'],
      ['private.left_for_you_cleanup_queue', 'completed_at'],
    ];
    const retained = new Map();
    let actionCount = 0;
    for (const [table, column] of cases) {
      for (const offset of [-1, 0, 1, null]) {
        const timestamp = offset === null ? 'null' : `now()-interval '30 days'+make_interval(secs=>${offset})`;
        const expiry = column === 'expires_at' ? (offset === null ? "now()+interval '1 day'" : timestamp) : "now()+interval '1 day'";
        const lifecycle = column === 'expires_at' ? '' : `, ${column}`;
        const lifeValue = column === 'expires_at' ? '' : `, ${timestamp}`;
        let row;
        if (table === 'public.widget_action_tokens') {
          row = await db.query(`insert into ${table}(couple_id,profile_id,device_id_hash,token_hash,expires_at${lifecycle})
            values ('${C}','${U}',$1,$2,${expiry}${lifeValue}) returning id`, [hash(), hash()]);
          await db.query(`insert into public.widget_action_receipts(token_id, action_id, action_type, status, created_at, message_id)
            values ($1,gen_random_uuid(),'think:send','sent',now()-interval '365 days',$2)`, [row.rows[0].id, message]);
          actionCount++;
          // Even a recent installation disappears when its old unusable action token is deleted.
          await db.query(`insert into public.widget_scriptable_installations(couple_id,profile_id,device_id_hash,state_token_hash,action_token_id,expires_at)
            values ('${C}','${U}',$1,$2,$3,now()+interval '1 day')`, [hash(), hash(), row.rows[0].id]);
        } else if (table === 'public.widget_tokens') {
          row = await db.query(`insert into ${table}(couple_id,profile_id,token_hash${lifecycle}) values ('${C}','${U}',$1${lifeValue}) returning id`, [hash()]);
        } else if (table === 'public.widget_scriptable_setup_codes') {
          row = await db.query(`insert into ${table}(couple_id,profile_id,token_hash,expires_at${lifecycle}) values ('${C}','${U}',$1,${expiry}${lifeValue}) returning id`, [hash()]);
        } else if (table === 'public.widget_scriptable_installations') {
          const token = await db.query(`insert into public.widget_action_tokens(couple_id,profile_id,device_id_hash,token_hash,expires_at)
            values ('${C}','${U}',$1,$2,now()+interval '1 day') returning id`, [hash(), hash()]);
          row = await db.query(`insert into ${table}(couple_id,profile_id,device_id_hash,state_token_hash,action_token_id,expires_at${lifecycle})
            values ('${C}','${U}',$1,$2,$3,${expiry}${lifeValue}) returning id`, [hash(), hash(), token.rows[0].id]);
        } else {
          row = await db.query(`insert into ${table}(item_id,couple_id,sender_id,kind,source_deleted_at,completed_at)
            values (gen_random_uuid(),'${C}','${U}','text',now()-interval '365 days',${timestamp}) returning item_id as id`);
        }
        if (offset !== -1) {
          if (!retained.has(table)) retained.set(table, []);
          retained.get(table).push(row.rows[0].id);
        }
      }
    }
    // Snapshot every product table, including profiles/couples and progression ledgers.
    const technical = new Set(cases.map(([t]) => t.split('.')[1]).concat('widget_action_receipts', 'push_event_log'));
    const tables = (await db.query("select tablename from pg_tables where schemaname='public' order by tablename")).rows.map((r) => r.tablename).filter((t) => !technical.has(t));
    const snapshot = async () => Promise.all(tables.map(async (t) => [t, (await db.query(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), '[]') as data from public.${t} x`)).rows[0].data]));
    const before = await snapshot();
    const counts = (await run(db)).rows[0].counts;
    assert.equal(counts.widget_action_tokens, 2);
    assert.equal(counts.widget_tokens, 1);
    assert.equal(counts.widget_scriptable_setup_codes, 3);
    assert.equal(counts.widget_scriptable_installations, 2);
    assert.equal(counts.left_for_you_cleanup_queue, 1);
    for (const [table, ids] of retained) {
      const pk = table.startsWith('private.') ? 'item_id' : 'id';
      const got = (await db.query(`select ${pk} as id from ${table}`)).rows.map((r) => r.id);
      for (const id of ids) assert.ok(got.includes(id), `${table}: boundary or live row must survive`);
    }
    assert.equal((await db.query('select count(*)::int as n from public.widget_action_receipts')).rows[0].n, actionCount - 2);
    assert.equal((await db.query('select count(*)::int as n from public.widget_scriptable_installations')).rows[0].n, 12);
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual((await db.query('select * from storage.objects')).rows, storageBefore);
    assert.ok(Object.values((await run(db)).rows[0].counts).every((n) => n === 0));
  } finally { await db.exec('rollback'); }
}));

test('F2A3 ACL: operational function owner only, new Vault RPC service only, blank/missing configuration fails closed', { timeout: 120000 }, () => withDb(async (db) => {
  await db.exec(SQL);
  await db.exec('create role f2a3_public_probe; grant usage on schema public,private to f2a3_public_probe');
  for (const role of ['anon', 'authenticated', 'service_role', 'f2a3_public_probe']) {
    assert.equal((await db.query(`select has_function_privilege($1,'private.run_operational_retention()','execute') as allowed`, [role])).rows[0].allowed, false);
    assert.equal((await db.query(`select has_function_privilege($1,'public.get_internal_left_for_you_cleanup_cron_key()','execute') as allowed`, [role])).rows[0].allowed, role === 'service_role');
    await db.exec(`set role ${role}`);
    await assert.rejects(run(db), /permission denied/);
    if (role !== 'service_role') await assert.rejects(db.query('select public.get_internal_left_for_you_cleanup_cron_key()'), /permission denied/);
    await db.exec('reset role');
  }
  assert.equal((await db.query("select has_function_privilege('postgres','private.run_operational_retention()','execute') as allowed")).rows[0].allowed, true);
  await db.exec('set role service_role');
  assert.equal((await db.query('select public.get_internal_left_for_you_cleanup_cron_key() as key')).rows[0].key, null);
  await db.exec('reset role');
  await db.exec("select vault.create_secret('cron-test', 'us_left_for_you_cleanup_cron_key')");
  await db.exec('set role service_role');
  assert.equal((await db.query('select public.get_internal_left_for_you_cleanup_cron_key() as key')).rows[0].key, 'cron-test');
  await db.exec('reset role');
  await db.exec(`create table net.f2a3_calls(url text, headers jsonb);
    create or replace function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb, headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
    returns bigint language plpgsql as $$ begin insert into net.f2a3_calls values (url,headers); return 1; end $$;`);
  const command = (await jobs(db)).find((j) => j.jobname === NAMES[1]).command;
  await db.exec(command);
  assert.deepEqual((await db.query('select * from net.f2a3_calls')).rows, []);
  await db.exec("select vault.create_secret('https://example.supabase.co/', 'us_project_url')");
  await db.exec(command);
  assert.deepEqual((await db.query('select * from net.f2a3_calls')).rows, [{ url: 'https://example.supabase.co/functions/v1/cleanup-left-for-you', headers: { 'Content-Type': 'application/json', 'x-us-cron-key': 'cron-test' } }]);
  await db.exec('delete from net.f2a3_calls');
  for (const value of ['', '   ']) {
    await db.query("update vault.secrets set secret=$1 where name='us_left_for_you_cleanup_cron_key'", [value]);
    await db.exec(command);
    assert.deepEqual((await db.query('select * from net.f2a3_calls')).rows, []);
  }
}));

const request = (headers = {}) => new Request('https://edge.test/cleanup-left-for-you', { method: 'POST', headers });
test('F2A3 cleanup worker: missing/wrong/legacy/bearer keys or unavailable Vault RPC never claim work', async () => {
  for (const [headers, rpc] of [
    [{}, 'cron-ok'], [{ 'x-us-cron-key': 'wrong' }, 'cron-ok'], [{ 'x-m5i-cleanup-secret': 'legacy' }, 'cron-ok'],
    [{ authorization: 'Bearer service-role-test' }, 'cron-ok'], [{ 'x-us-cron-key': 'cron-ok' }, null],
    [{ 'x-us-cron-key': 'cron-ok' }, () => { throw new Error('unavailable'); }],
  ]) {
    const admin = createFakeAdmin({ rpc: { get_internal_left_for_you_cleanup_cron_key: rpc, claim_left_for_you_cleanup: [] } });
    const fn = await loadEdgeFunction('cleanup-left-for-you', { admin, env: { M5I_CLEANUP_SECRET: 'legacy' } });
    assert.equal((await fn.call(request(headers))).status, 401);
    assert.ok(!admin.log.rpc.includes('claim_left_for_you_cleanup'));
  }
});

test('F2A3 cleanup worker: authenticates against the real service-only RPC and a no-op DB twice; no Storage deletion', { timeout: 120000 }, () => withDb(async (db) => {
  await db.exec(SQL);
  await db.exec("select vault.create_secret('cron-ok', 'us_left_for_you_cleanup_cron_key')");
  await seedOwners(db);
  await db.exec(`insert into public.left_for_you(couple_id,sender_id,recipient_id,kind,body,seen_at)
    values ('${C}','${U}','${B}','text','Recently seen',now()-interval '1 day'),
      ('${C}','${U}','${B}','text','Not yet seen',null)`);
  const before = (await db.query('select * from public.left_for_you order by id')).rows;
  const rpcNames = [];
  const admin = {
    async rpc(name, args) {
      rpcNames.push(name);
      await db.exec('set role service_role');
      try {
        if (name === 'get_internal_left_for_you_cleanup_cron_key') return { data: (await db.query(`select public.${name}() as key`)).rows[0].key, error: null };
        if (name === 'claim_left_for_you_cleanup') return { data: (await db.query(`select * from public.${name}($1)`, [args.target_batch_size])).rows, error: null };
        throw new Error(`Unexpected mutation ${name}`);
      } finally { await db.exec('reset role'); }
    },
    storage: { from() { assert.fail('No-op cleanup must not delete Storage bytes'); } },
  };
  const fn = await loadEdgeFunction('cleanup-left-for-you', { admin });
  for (let i = 0; i < 2; i++) assert.deepEqual(await fn.call(request({ 'x-us-cron-key': 'cron-ok' })), { status: 200, body: { claimed: 0, results: [] } });
  assert.deepEqual(rpcNames, ['get_internal_left_for_you_cleanup_cron_key', 'claim_left_for_you_cleanup', 'get_internal_left_for_you_cleanup_cron_key', 'claim_left_for_you_cleanup']);
  assert.deepEqual((await db.query('select * from private.left_for_you_cleanup_queue')).rows, []);
  assert.deepEqual((await db.query('select * from public.left_for_you order by id')).rows, before);
}));
