// Native Notifications V1 — the device registration migration.
//
// Runs on an empty embedded PostgreSQL rebuilt from every repo migration
// (baseline + forward), with two couples seeded. The migration
// 20261006200000_native_notifications_v1.sql reshapes device_push_tokens into
// "one row per app installation" behind two authenticated RPCs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('../scripts/supabase-baseline/evidence.cjs');
const { newDb } = require('../scripts/supabase-baseline/rebuild.cjs');

const MIGRATIONS = path.join(ROOT, 'supabase/migrations');
const N2_FILE = '20261006200000_native_notifications_v1.sql';
const read = (file) => fs.readFileSync(file, 'utf8');
const N2 = read(path.join(MIGRATIONS, N2_FILE));

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const F = 'aaaaaaaa-0000-4000-8000-00000000000f';
const B = 'aaaaaaaa-0000-4000-8000-00000000000b';
const X = 'bbbbbbbb-0000-4000-8000-00000000000a';
const LONER = 'cccccccc-0000-4000-8000-000000000000'; // account without profile
const ANON = 'cccccccc-0000-4000-8000-0000000000a0'; // anonymous auth user (legacy)
const I1 = '0e000000-0000-4000-8000-000000000001';
const I2 = '0e000000-0000-4000-8000-000000000002';
const I3 = '0e000000-0000-4000-8000-000000000003';
const FCM_A = `fcmA:${'a'.repeat(60)}`;
const FCM_B = `fcmB:${'b'.repeat(60)}`;
const APNS = 'ab'.repeat(32);

const SEED = `
  insert into auth.users (id, email, is_anonymous) values
    ('${F}', 'f@example.test', false), ('${B}', 'b@example.test', false),
    ('${X}', 'x@example.test', false), ('${LONER}', 'l@example.test', false), ('${ANON}', null, true);
  insert into public.couples (id, name) values ('${C1}', 'US.'), ('${C2}', 'Altri');
  insert into public.profiles (id, display_name, couple_id, role) values
    ('${F}', 'Francesco', '${C1}', 'francesco'), ('${B}', 'Beatrice', '${C1}', 'beatrice'),
    ('${X}', 'X', '${C2}', 'francesco');
`;

async function database({ upTo = null, seed = true } = {}) {
  const db = await newDb();
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    if (upTo && file >= upTo) continue;
    await db.exec(read(path.join(MIGRATIONS, file)));
  }
  if (seed) await db.exec(SEED);
  return db;
}

// Runs statements as `uid` with `role` and COMMITS (state carries across calls).
async function as(db, uid, sql, role = 'authenticated') {
  await db.exec('begin');
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid || '']);
    await db.exec(`set local role ${role}`);
    const res = await db.query(sql);
    await db.exec('commit');
    return { ok: true, data: res.rows };
  } catch (error) {
    await db.exec('rollback');
    return { ok: false, code: error.code, message: error.message };
  }
}

const register = (installation, token, { platform = 'android', provider = 'fcm', env = null, retired = null } = {}) =>
  `select public.register_native_push_device('${installation}', '${platform}', '${provider}', '${token}', ${env ? `'${env}'` : 'null'}, ${retired ? `'${retired}'` : 'null'}) as r`;
const unregister = (installation) => `select public.unregister_native_push_device('${installation}') as r`;
const rows = async (db) => (await db.query('select user_id, couple_id, installation_id, token, platform, provider, apns_environment from public.device_push_tokens order by installation_id')).rows;

let db;
test.beforeEach(async () => { db = await database(); });
test.afterEach(async () => { await db?.close(); });

test('N2 migration: forward-only, after every earlier migration, fails closed', () => {
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  assert.equal(files.at(-1), N2_FILE, 'newest migration');
  const cutoff = JSON.parse(read(path.join(ROOT, 'supabase/baseline/MIGRATION_CUTOFF.json')));
  assert.ok(cutoff.forward_migrations.includes(N2_FILE));
  assert.match(N2, /security definer\s+set search_path = ''/g);
  assert.doesNotMatch(N2, /grant[^;]*to (anon|public)\b/i, 'never granted to anon/public');
  assert.match(N2, /revoke all on table public\.device_push_tokens from public, anon, authenticated;/);
  assert.match(N2, /drop function if exists public\.register_push_token\(text, text\);/);
});

test('N2 migration: re-applying it changes nothing', async () => {
  assert.deepEqual((await as(db, F, register(I1, FCM_A))).ok, true);
  await db.exec(N2);
  assert.equal((await rows(db)).length, 1);
});

test('N2 migration: aborts when legacy rows without an installation id exist', async () => {
  const legacy = await database({ upTo: N2_FILE });
  try {
    await legacy.exec(`insert into public.device_push_tokens (user_id, couple_id, token, platform) values ('${F}', '${C1}', 'legacy-token', 'android')`);
    await assert.rejects(legacy.exec(N2), /legacy row/);
    // Nothing changed: the column was not added.
    const cols = (await legacy.query(`select 1 from information_schema.columns where table_name = 'device_push_tokens' and column_name = 'installation_id'`)).rows;
    assert.equal(cols.length, 0);
  } finally { await legacy.close(); }
});

test('N2 privileges: client roles cannot touch the table; RPCs are authenticated-only', async () => {
  for (const role of ['anon', 'authenticated']) {
    for (const sql of ['select * from public.device_push_tokens', `delete from public.device_push_tokens`,
      `insert into public.device_push_tokens (user_id, couple_id, installation_id, token, platform, provider) values ('${F}', '${C1}', '${I1}', '${FCM_A}', 'android', 'fcm')`]) {
      assert.equal((await as(db, F, sql, role)).code, '42501', `${role}: ${sql}`);
    }
  }
  assert.equal((await as(db, null, register(I1, FCM_A), 'anon')).code, '42501');
  assert.equal((await as(db, null, unregister(I1), 'anon')).code, '42501');
  const legacy = (await db.query(`select to_regprocedure('public.register_push_token(text,text)') as f`)).rows[0].f;
  assert.equal(legacy, null);
  // The Edge dispatcher (service_role) reads and prunes.
  assert.equal((await as(db, null, 'select * from public.device_push_tokens', 'service_role')).ok, true);
});

test('N2 register: identity from the session, never from the payload', async () => {
  assert.equal((await as(db, '', register(I1, FCM_A))).code, '42501', 'no session');
  assert.equal((await as(db, ANON, register(I1, FCM_A))).code, '42501', 'anonymous auth user');
  assert.equal((await as(db, LONER, register(I1, FCM_A))).code, '42501', 'no profile/couple');
  const ok = await as(db, F, register(I1, FCM_A));
  assert.deepEqual(ok.data[0].r, { active: true, platform: 'android', provider: 'fcm' });
  assert.deepEqual(await rows(db), [{ user_id: F, couple_id: C1, installation_id: I1, token: FCM_A, platform: 'android', provider: 'fcm', apns_environment: null }]);
});

test('N2 register: platform, provider, environment and token shape are validated', async () => {
  const bad = [
    register(I1, FCM_A, { platform: 'web' }),
    register(I1, FCM_A, { platform: 'android', provider: 'apns' }),
    register(I1, FCM_A, { env: 'production' }),
    register(I1, APNS, { platform: 'ios', provider: 'apns' }),
    register(I1, APNS, { platform: 'ios', provider: 'apns', env: 'staging' }),
    register(I1, 'short'),
    register(I1, `${FCM_A}<script>`),
    register(I1, 'AB'.repeat(32), { platform: 'ios', provider: 'apns', env: 'production' }),
    `select public.register_native_push_device(null, 'android', 'fcm', '${FCM_A}') as r`,
  ];
  for (const sql of bad) assert.equal((await as(db, F, sql)).code, '22023', sql);
  assert.equal((await as(db, F, register(I2, APNS, { platform: 'ios', provider: 'apns', env: 'development' }))).ok, true);
  assert.equal((await rows(db))[0].apns_environment, 'development');
});

test('N2 register: token refresh updates in place; the token moving to a new installation removes the old row', async () => {
  await as(db, F, register(I1, FCM_A));
  await as(db, F, register(I1, FCM_B));
  assert.deepEqual((await rows(db)).map((r) => [r.installation_id, r.token]), [[I1, FCM_B]]);
  // Reinstall / restored data: same token, new installation id.
  await as(db, F, register(I2, FCM_B));
  assert.deepEqual((await rows(db)).map((r) => [r.installation_id, r.token]), [[I2, FCM_B]]);
});

test('N2 register: another account cannot claim a provider token already owned by someone else', async () => {
  await as(db, F, register(I1, FCM_A));
  const hijack = await as(db, X, register(I2, FCM_A));
  assert.equal(hijack.code, '23505', 'unique token ownership blocks cross-account reassignment');
  const after = await rows(db);
  assert.equal(after.length, 1);
  assert.deepEqual(after[0], { user_id: F, couple_id: C1, installation_id: I1, token: FCM_A, platform: 'android', provider: 'fcm', apns_environment: null });
});

test('N2 register: another account cannot take over an existing installation id', async () => {
  await as(db, B, register(I3, FCM_B)); // Beatrice's own phone
  await as(db, F, register(I1, FCM_A));
  const takeover = await as(db, X, register(I1, FCM_A));
  assert.equal(takeover.code, '42501');
  const after = await rows(db);
  assert.deepEqual(after.find((r) => r.installation_id === I1), { user_id: F, couple_id: C1, installation_id: I1, token: FCM_A, platform: 'android', provider: 'fcm', apns_environment: null });
  assert.equal(after.find((r) => r.installation_id === I3).user_id, B);
  assert.equal(after.length, 2);
});

test('N2 register: retired cleanup is ownership-scoped', async () => {
  await as(db, F, register(I1, FCM_A));
  await as(db, F, register(I2, `fcmC:${'c'.repeat(60)}`, { retired: I1 }));
  assert.deepEqual((await rows(db)).map((r) => r.installation_id), [I2], 'same user can clean its retired installation');

  await as(db, F, register(I1, FCM_A));
  await as(db, B, register(I3, FCM_B, { retired: I1 }));
  const after = await rows(db);
  assert.equal(after.find((r) => r.installation_id === I1).user_id, F, 'another account cannot delete the retired row');
  assert.equal(after.find((r) => r.installation_id === I3).user_id, B);
});

test('N2 unregister: removes only an installation owned by auth.uid()', async () => {
  await as(db, F, register(I1, FCM_A));
  await as(db, F, register(I2, APNS, { platform: 'ios', provider: 'apns', env: 'production' }));
  assert.equal((await as(db, '', unregister(I1))).code, '42501');
  assert.deepEqual((await as(db, X, unregister(I1))).data[0].r, { removed: false }, 'another account cannot delete it');
  assert.equal((await rows(db)).find((r) => r.installation_id === I1).user_id, F);
  assert.deepEqual((await as(db, F, unregister(I1))).data[0].r, { removed: true });
  assert.deepEqual((await as(db, F, unregister(I1))).data[0].r, { removed: false });
  assert.deepEqual((await rows(db)).map((r) => r.installation_id), [I2]);
});

test('N2 preflight pack: read-only, runs on the pre-N2 state and shows the migration preconditions', async () => {
  const pack = read(path.join(ROOT, 'docs/native/NATIVE_NOTIFICATIONS_V1_PREFLIGHT.sql'));
  assert.match(pack, /^begin transaction read only;$/m);
  assert.match(pack, /^rollback;$/m);
  const code = pack.replace(/--.*$/gm, '');
  assert.doesNotMatch(code, /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate)\b\s/i);
  assert.doesNotMatch(code, /select[^;]*\btoken\b\s*(,|from)/i, 'never selects a token value');
  const legacy = await database({ upTo: N2_FILE });
  try {
    const block = (label) => code.split(';').find((statement) => statement.includes(`) as ${label}`));
    const n02 = (await legacy.query(block('n02'))).rows[0].n02;
    assert.equal(n02.rows, 0);
    assert.equal(n02.has_installation_id, false);
    const n03 = (await legacy.query(block('n03'))).rows[0].n03;
    assert.deepEqual([n03.register_push_token_exists, n03.register_push_token_client_execute, n03.new_rpcs_exist], [true, false, false]);
  } finally { await legacy.close(); }
});
