import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertRecentPasswordAuth, cleanupStoragePrefix, decodeJwtPayload, finishAccountDeletion,
  handleDeleteAccount, isOriginAllowed, isSafeObjectName, parseDeletionBody, runDeletionWorker,
  DeletionError, EXPORTS_BUCKET, REMOVE_BATCH_SIZE, STORAGE_BUCKET,
} from '../supabase/functions/_shared/s32-account-deletion-core.mjs';

const UID = 'e8c90d50-81e9-4a0d-beeb-5886c63c4963';
const PARTNER = '01d5fe3d-1e8e-4872-b453-01918de88893';
const COUPLE = '46155127-5742-42d0-8195-5f6d0992ae7b';
const OTHER_COUPLE = '7e4ff7be-f3f3-44aa-ac8d-b587375e81a4';
const NOW = 1_800_000_000;
const ENV = { US_ACCOUNT_DELETION_ENABLED: 'true', US_ALLOWED_ORIGINS: 'https://us-staging-s31.pages.dev' };

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const makeJwt = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.c2ln`;
const freshJwt = (extra = {}) => makeJwt({ sub: UID, amr: [{ method: 'password', timestamp: NOW - 30 }], ...extra });

// In-memory bucket that mimics supabase-js list()/remove() (one level, folders id=null).
function makeStorage(initial, { failRemove = false, failList = false, ignoreRemove = new Set(), extraNames = [], extraAt = null } = {}) {
  const objects = new Set(initial);
  const calls = { list: 0, remove: [] };
  return {
    objects, calls,
    async list(folder, { limit, offset }) {
      calls.list++;
      if (failList) return { data: null, error: { code: 'boom' } };
      const base = folder ? `${folder}/` : '';
      const entries = new Map();
      for (const name of objects) {
        if (!name.startsWith(base)) continue;
        const rest = name.slice(base.length);
        const [head, ...tail] = rest.split('/');
        if (tail.length) entries.set(head, { name: head, id: null });
        else entries.set(head, { name: head, id: `id-${name}` });
      }
      if (folder === extraAt) {
        for (const n of extraNames) entries.set(n, { name: n, id: 'x' });
      }
      const sorted = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
      return { data: sorted.slice(offset, offset + limit), error: null };
    },
    async remove(paths) {
      calls.remove.push([...paths]);
      if (failRemove) return { data: null, error: { code: 'remove_failed' } };
      for (const p of paths) if (!ignoreRemove.has(p)) objects.delete(p);
      return { data: paths.map((name) => ({ name })), error: null };
    },
  };
}

function makeClient({ storage, exportsStorage = makeStorage([]), dbResult, dbError = null, plan = null, deleteUserError = null, user = { id: UID } } = {}) {
  const calls = { rpc: [], signOut: 0, deleteUser: 0, ban: 0, getUser: 0, storageFrom: [] };
  const client = {
    calls,
    auth: {
      async getUser() { calls.getUser++; return user ? { data: { user }, error: null } : { data: { user: null }, error: { status: 401 } }; },
      admin: {
        async signOut() { calls.signOut++; return { error: null }; },
        async deleteUser(id) { calls.deleteUser++; assert.equal(id, UID); return { data: null, error: deleteUserError }; },
        async updateUserById(id, attrs) { calls.ban++; assert.deepEqual(attrs, { ban_duration: '876000h' }); return { data: null, error: null }; },
      },
    },
    async rpc(fn, args) {
      calls.rpc.push([fn, args]);
      if (fn === 's32_delete_account_data') return dbError ? { data: null, error: dbError } : { data: dbResult, error: null };
      if (fn === 's32_account_deletion_storage_plan') return { data: plan, error: null };
      if (fn === 's32_mark_account_deletion') return { data: { ok: true }, error: null };
      throw new Error(`unexpected rpc ${fn}`);
    },
    storage: { from(bucket) { calls.storageFrom.push(bucket); return bucket === EXPORTS_BUCKET ? exportsStorage : storage; } },
  };
  return client;
}

const request = (client, overrides = {}) => {
  let created = 0;
  const logs = [];
  const run = handleDeleteAccount({
    method: 'POST',
    origin: 'https://us-a33.pages.dev',
    authorization: `Bearer ${freshJwt()}`,
    readBody: async () => ({ confirm: 'ELIMINA', channel: 'app' }),
    env: ENV,
    nowSeconds: NOW,
    createClient: () => { created++; return client; },
    log: (e) => logs.push(e),
    ...overrides,
  });
  return run.then((res) => ({ ...res, created, logs }));
};
const marks = (client) => client.calls.rpc.filter(([fn]) => fn === 's32_mark_account_deletion').map(([, a]) => [a.p_state, a.p_error]);

const ownPrefix = `${COUPLE}/${UID}/`;
const departedFiles = [
  `${ownPrefix}moments/a.jpg`,
  `${ownPrefix}moments/b.jpg`,
  `${ownPrefix}avatar.png`,
  `${ownPrefix}shared/kept-for-partner.jpg`,
  `${COUPLE}/${PARTNER}/partner.jpg`,
  `${OTHER_COUPLE}/${UID}/foreign.jpg`,
];

test('happy path departed: own files removed, keep_paths and partner files untouched', async () => {
  const storage = makeStorage(departedFiles);
  const client = makeClient({ storage, dbResult: { status: 'db_done', mode: 'departed', storage_prefix: ownPrefix, keep_paths: [`${ownPrefix}shared/kept-for-partner.jpg`] } });
  const res = await request(client);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'deleted' });
  assert.deepEqual([...storage.objects].sort(), [
    `${COUPLE}/${PARTNER}/partner.jpg`, `${ownPrefix}shared/kept-for-partner.jpg`, `${OTHER_COUPLE}/${UID}/foreign.jpg`,
  ].sort());
  assert.ok(!storage.calls.remove.flat().includes(`${ownPrefix}shared/kept-for-partner.jpg`));
  assert.deepEqual(client.calls.storageFrom, [STORAGE_BUCKET, EXPORTS_BUCKET]);
  assert.equal(client.calls.signOut, 1);
  assert.equal(client.calls.deleteUser, 1);
  assert.deepEqual(client.calls.rpc[0], ['s32_delete_account_data', { p_user: UID, p_channel: 'app' }]);
  assert.deepEqual(marks(client), [['storage_done', null], ['completed', null]]);
  const logText = JSON.stringify(res.logs);
  for (const secret of [UID, COUPLE, PARTNER, 'kept-for-partner', 'a.jpg']) assert.ok(!logText.includes(secret), `log leaks ${secret}`);
});

test('couple_erased: whole couple prefix cleaned, other couples untouched', async () => {
  const storage = makeStorage(departedFiles);
  const client = makeClient({ storage, dbResult: { status: 'db_done', mode: 'couple_erased', storage_prefix: `${COUPLE}/`, keep_paths: [] } });
  const res = await request(client);
  assert.equal(res.status, 200);
  assert.deepEqual([...storage.objects], [`${OTHER_COUPLE}/${UID}/foreign.jpg`]);
});

test('no_couple: no media storage calls at all', async () => {
  const storage = makeStorage(departedFiles);
  const client = makeClient({ storage, dbResult: { status: 'db_done', mode: 'no_couple', storage_prefix: null, keep_paths: [] } });
  const res = await request(client);
  assert.equal(res.status, 200);
  assert.equal(storage.calls.list, 0);
  assert.equal(storage.calls.remove.length, 0);
  assert.equal(client.calls.deleteUser, 1);
});

test('removal is batched in groups of at most 100', async () => {
  const many = Array.from({ length: 250 }, (_, i) => `${ownPrefix}m/${String(i).padStart(4, '0')}.jpg`);
  const storage = makeStorage(many);
  const res = await finishAccountDeletion({ uid: UID, admin: makeClient().auth.admin, storage, rpc: makeClient().rpc,
    plan: { state: 'db_done', storage_prefix: ownPrefix, keep_paths: [] } });
  assert.equal(res.status, 'deleted');
  assert.deepEqual(storage.calls.remove.map((b) => b.length), [100, 100, 50]);
  assert.ok(storage.calls.remove.every((b) => b.length <= REMOVE_BATCH_SIZE));
  assert.equal(storage.objects.size, 0);
});

test('unsafe listed names abort cleanup: nothing removed, auth not deleted, 202', async () => {
  const storage = makeStorage([`${ownPrefix}ok.jpg`], { extraNames: ['..', 'a\\b'], extraAt: ownPrefix.slice(0, -1) });
  const client = makeClient({ storage, dbResult: { status: 'db_done', mode: 'departed', storage_prefix: ownPrefix, keep_paths: [] } });
  const res = await request(client);
  assert.equal(res.status, 202);
  assert.deepEqual(res.body, { status: 'pending_cleanup' });
  assert.equal(storage.calls.remove.length, 0);
  assert.equal(client.calls.deleteUser, 0);
  assert.deepEqual(marks(client), [['failed', 'storage_name_invalid']]);
});

test('isSafeObjectName rejects traversal and names outside the prefix', () => {
  for (const bad of [`${OTHER_COUPLE}/${UID}/x.jpg`, `${ownPrefix}../x`, `${ownPrefix}a\\b`, `${ownPrefix}a//b`, `/${ownPrefix}x`, ownPrefix, `${ownPrefix}a\nb`, 42]) {
    assert.equal(isSafeObjectName(bad, ownPrefix), false, String(bad));
  }
  assert.equal(isSafeObjectName(`${ownPrefix}a/b.jpg`, ownPrefix), true);
  assert.equal(isSafeObjectName(`${ownPrefix}a.jpg`, '../'), false);
});

test('invalid prefix or malformed keep_paths fail closed without listing', async () => {
  for (const [prefix, keep, code] of [['../', [], 'storage_prefix_invalid'], [`${COUPLE}`, [], 'storage_prefix_invalid'], [ownPrefix, null, 'keep_paths_invalid'], [ownPrefix, [1], 'keep_paths_invalid']]) {
    const storage = makeStorage(departedFiles);
    await assert.rejects(cleanupStoragePrefix({ storage, prefix, keepPaths: keep }), (e) => e instanceof DeletionError && e.code === code);
    assert.equal(storage.calls.list, 0);
  }
});

test('DB RPC failure: 500 and no storage or auth deletion', async () => {
  const storage = makeStorage(departedFiles);
  const client = makeClient({ storage, dbError: { code: 'P0001', message: `secret ${UID}` } });
  const res = await request(client);
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: 'deletion_failed' });
  assert.equal(storage.calls.list + storage.calls.remove.length, 0);
  assert.equal(client.calls.deleteUser, 0);
  assert.equal(client.calls.ban, 0);
  assert.ok(!JSON.stringify(res.logs).includes(UID));
});

test('storage remove failure: 202 and deleteUser NOT called (retry can still find files)', async () => {
  const storage = makeStorage(departedFiles, { failRemove: true });
  const client = makeClient({ storage, dbResult: { status: 'db_done', mode: 'departed', storage_prefix: ownPrefix, keep_paths: [] } });
  const res = await request(client);
  assert.equal(res.status, 202);
  assert.equal(client.calls.deleteUser, 0);
  assert.deepEqual(marks(client), [['failed', 'storage_remove_failed']]);
});

test('storage list failure and incomplete removal both stop before auth deletion', async () => {
  const listFail = makeStorage(departedFiles, { failList: true });
  const c1 = makeClient({ storage: listFail, dbResult: { status: 'db_done', mode: 'departed', storage_prefix: ownPrefix, keep_paths: [] } });
  assert.equal((await request(c1)).status, 202);
  assert.equal(c1.calls.deleteUser, 0);

  const sticky = makeStorage(departedFiles, { ignoreRemove: new Set([`${ownPrefix}avatar.png`]) });
  const c2 = makeClient({ storage: sticky, dbResult: { status: 'db_done', mode: 'departed', storage_prefix: ownPrefix, keep_paths: [] } });
  assert.equal((await request(c2)).status, 202);
  assert.equal(c2.calls.deleteUser, 0);
  assert.deepEqual(marks(c2), [['failed', 'storage_incomplete']]);
});

test('deleteUser 404 counts as success', async () => {
  const storage = makeStorage([]);
  const client = makeClient({ storage, deleteUserError: { status: 404, code: 'user_not_found' }, dbResult: { status: 'db_done', mode: 'no_couple', storage_prefix: null, keep_paths: [] } });
  const res = await request(client);
  assert.equal(res.status, 200);
  assert.equal(client.calls.ban, 0);
  assert.deepEqual(marks(client), [['storage_done', null], ['completed', null]]);
});

test('deleteUser other error: ban fallback, failed auth_delete_failed, 202', async () => {
  const storage = makeStorage([]);
  const client = makeClient({ storage, deleteUserError: { status: 500, code: 'unexpected_failure' }, dbResult: { status: 'db_done', mode: 'no_couple', storage_prefix: null, keep_paths: [] } });
  const res = await request(client);
  assert.equal(res.status, 202);
  assert.equal(client.calls.ban, 1);
  assert.deepEqual(marks(client), [['storage_done', null], ['failed', 'auth_delete_failed']]);
});

test('assertRecentPasswordAuth', () => {
  const ok = { amr: [{ method: 'otp', timestamp: NOW }, { method: 'password', timestamp: NOW - 599 }] };
  assert.equal(assertRecentPasswordAuth(ok, NOW), true);
  assert.equal(assertRecentPasswordAuth({ amr: [{ method: 'password', timestamp: NOW + 59 }] }, NOW), true);
  // 25/10/2026: an account that signs in with Google confirms with Google again
  // (Supabase records the id_token grant as amr "oauth"), within the same 10 minutes.
  assert.equal(assertRecentPasswordAuth({ amr: [{ method: 'oauth', timestamp: NOW - 599 }] }, NOW), true);
  const rejects = [
    {}, { amr: null }, { amr: [] },
    { amr: [{ method: 'oauth', timestamp: NOW - 601 }] },
    { amr: [{ method: 'token_refresh', timestamp: NOW }] },
    { amr: [{ method: 'otp', timestamp: NOW }] },
    { amr: [{ method: 'password', timestamp: NOW - 601 }] },
    { amr: [{ method: 'password', timestamp: NOW + 61 }] },
    { amr: [{ method: 'password', timestamp: String(NOW) }] },
    { amr: ['password'] },
  ];
  for (const payload of rejects) {
    assert.throws(() => assertRecentPasswordAuth(payload, NOW), (e) => e.code === 'reauth_required' && e.status === 401, JSON.stringify(payload));
  }
  assert.throws(() => assertRecentPasswordAuth({ amr: [{ method: 'password', timestamp: NOW - 100 }] }, NOW, 60));
  assert.deepEqual(decodeJwtPayload(freshJwt()).sub, UID);
});

test('stale re-authentication → 401 reauth_required, no client created', async () => {
  const client = makeClient({ storage: makeStorage([]) });
  const stale = makeJwt({ sub: UID, amr: [{ method: 'password', timestamp: NOW - 3600 }] });
  const res = await request(client, { authorization: `Bearer ${stale}` });
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'reauth_required' });
  assert.equal(res.created, 0);
});

test('flag off → 503 without any client call', async () => {
  for (const value of [undefined, 'false', 'TRUE', '1']) {
    let readBody = 0;
    const res = await request(null, { env: { US_ACCOUNT_DELETION_ENABLED: value }, readBody: async () => { readBody++; return {}; } });
    assert.equal(res.status, 503);
    assert.deepEqual(res.body, { error: 'deletion_disabled' });
    assert.equal(res.created, 0);
    assert.equal(readBody, 0);
  }
});

test('body, method, origin and bearer validation', async () => {
  const client = makeClient({ storage: makeStorage([]) });
  const cases = [
    [{ readBody: async () => ({ confirm: 'elimina', channel: 'app' }) }, 400, 'confirm_required'],
    [{ readBody: async () => ({ channel: 'app' }) }, 400, 'confirm_required'],
    [{ readBody: async () => { throw new SyntaxError('bad json'); } }, 400, 'confirm_required'],
    [{ readBody: async () => ['ELIMINA'] }, 400, 'confirm_required'],
    [{ readBody: async () => ({ confirm: 'ELIMINA', channel: 'operator' }) }, 400, 'channel_invalid'],
    [{ readBody: async () => ({ confirm: 'ELIMINA' }) }, 400, 'channel_invalid'],
    [{ method: 'GET' }, 405, 'method_not_allowed'],
    [{ origin: 'https://evil.example' }, 403, 'origin_denied'],
    [{ authorization: '' }, 401, 'auth_required'],
    [{ authorization: 'Basic abc' }, 401, 'auth_required'],
  ];
  for (const [overrides, status, error] of cases) {
    const res = await request(client, overrides);
    assert.equal(res.status, status, error);
    assert.deepEqual(res.body, { error });
    assert.equal(res.created, 0);
  }
  assert.equal((await request(client, { method: 'OPTIONS' })).status, 204);
  assert.ok(isOriginAllowed('https://us-staging-s31.pages.dev', ENV.US_ALLOWED_ORIGINS));
  assert.ok(isOriginAllowed('https://localhost', ''));
  assert.ok(isOriginAllowed('capacitor://localhost', ''));
  assert.ok(!isOriginAllowed('https://us-staging-s31.pages.dev', ''));
  assert.ok(!isOriginAllowed('null', 'null'));
  assert.deepEqual(parseDeletionBody({ confirm: 'ELIMINA', channel: 'web' }), { channel: 'web' });
});

test('identity comes from auth.getUser, never the body; sub mismatch rejected', async () => {
  const storage = makeStorage([]);
  const client = makeClient({ storage, user: { id: PARTNER } });
  const res = await request(client, { readBody: async () => ({ confirm: 'ELIMINA', channel: 'app', user_id: PARTNER }) });
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'invalid_session' });
  assert.equal(client.calls.rpc.length, 0);
  assert.equal(client.calls.signOut, 0);

  const noUser = makeClient({ storage, user: null });
  assert.equal((await request(noUser)).status, 401);
  assert.equal(noUser.calls.rpc.length, 0);
});

test('idempotent retry: already_done request resumes from the receipt', async () => {
  const storage = makeStorage([`${ownPrefix}left.jpg`]);
  const client = makeClient({ storage, dbResult: { status: 'already_done', mode: 'departed', storage_prefix: ownPrefix, keep_paths: [] },
    plan: { state: 'db_done', storage_prefix: ownPrefix, keep_paths: [] } });
  const res = await request(client);
  assert.equal(res.status, 200);
  assert.ok(client.calls.rpc.some(([fn]) => fn === 's32_account_deletion_storage_plan'));
  assert.equal(storage.objects.size, 0);
});

test('finishAccountDeletion resumes from each receipt state', async () => {
  // db_done → storage + auth + completed
  let storage = makeStorage([`${ownPrefix}x.jpg`, `${ownPrefix}keep.jpg`]);
  let client = makeClient({ storage, plan: { state: 'db_done', storage_prefix: ownPrefix, keep_paths: [`${ownPrefix}keep.jpg`] } });
  let res = await finishAccountDeletion({ uid: UID, admin: client.auth.admin, storage, rpc: client.rpc });
  assert.deepEqual(res, { status: 'deleted', resumedFrom: 'db_done' });
  assert.deepEqual([...storage.objects], [`${ownPrefix}keep.jpg`]);
  assert.equal(client.calls.deleteUser, 1);

  // storage_done → no storage calls, auth + completed
  storage = makeStorage([`${ownPrefix}x.jpg`]);
  client = makeClient({ storage, plan: { state: 'storage_done', storage_prefix: ownPrefix, keep_paths: [] }, deleteUserError: { status: 404 } });
  res = await finishAccountDeletion({ uid: UID, admin: client.auth.admin, storage, rpc: client.rpc });
  assert.deepEqual(res, { status: 'deleted', resumedFrom: 'storage_done' });
  assert.equal(storage.calls.list, 0);
  assert.deepEqual(marks(client), [['completed', null]]);

  // completed → no-op
  storage = makeStorage([`${ownPrefix}x.jpg`]);
  client = makeClient({ storage, plan: { state: 'completed', storage_prefix: ownPrefix, keep_paths: [] } });
  res = await finishAccountDeletion({ uid: UID, admin: client.auth.admin, storage, rpc: client.rpc });
  assert.equal(res.status, 'deleted');
  assert.equal(storage.calls.list, 0);
  assert.equal(client.calls.deleteUser, 0);
  assert.deepEqual(marks(client), []);

  // no receipt → nothing happens
  client = makeClient({ storage, plan: null });
  res = await finishAccountDeletion({ uid: UID, admin: client.auth.admin, storage, rpc: client.rpc });
  assert.deepEqual(res, { status: 'no_receipt' });
  assert.equal(client.calls.deleteUser, 0);

  // failed storage, then a successful retry
  const flaky = makeStorage([`${ownPrefix}y.jpg`], { failRemove: true });
  client = makeClient({ storage: flaky, plan: { state: 'db_done', storage_prefix: ownPrefix, keep_paths: [] } });
  res = await finishAccountDeletion({ uid: UID, admin: client.auth.admin, storage: flaky, rpc: client.rpc });
  assert.equal(res.status, 'pending_cleanup');
  assert.equal(client.calls.deleteUser, 0);
  const healed = makeStorage([...flaky.objects]);
  res = await finishAccountDeletion({ uid: UID, admin: client.auth.admin, storage: healed, rpc: client.rpc });
  assert.equal(res.status, 'deleted');
  assert.equal(healed.objects.size, 0);
  assert.equal(client.calls.deleteUser, 1);
});

test('listing pages past 1000 entries per folder', async () => {
  const many = Array.from({ length: 1500 }, (_, i) => `${ownPrefix}${String(i).padStart(5, '0')}.jpg`);
  const storage = makeStorage(many);
  const res = await cleanupStoragePrefix({ storage, prefix: ownPrefix, keepPaths: [many[1234]] });
  assert.equal(res.removed, 1499);
  assert.deepEqual([...storage.objects], [many[1234]]);
});

// ------------------------------------------------------------ retry worker ---
function makeWorkerClient({ key = 'cron-secret', claimed = [], plans = {}, storage = makeStorage([]) } = {}) {
  const calls = { rpc: [], deleteUser: [] };
  return {
    calls,
    auth: { admin: {
      async deleteUser(id) { calls.deleteUser.push(id); return { error: null }; },
      async updateUserById() { return { error: null }; },
    } },
    async rpc(fn, args) {
      calls.rpc.push([fn, args]);
      if (fn === 'get_internal_account_deletion_cron_key') return { data: key, error: null };
      if (fn === 's32_claim_pending_account_deletions') return { data: claimed, error: null };
      if (fn === 's32_account_deletion_storage_plan') return { data: plans[args.p_user] ?? null, error: null };
      if (fn === 's32_mark_account_deletion') return { data: {}, error: null };
      if (fn === 's32_purge_account_deletion_receipts') return { data: 2, error: null };
      throw new Error(`unexpected rpc ${fn}`);
    },
    storage: { from() { return storage; } },
  };
}
const work = (client, overrides = {}) => runDeletionWorker({
  method: 'POST', cronKey: 'cron-secret', readBody: async () => ({}), env: ENV,
  createClient: () => client, ...overrides,
});

test('worker: flag off, wrong method, missing or wrong cron key do nothing', async () => {
  const client = makeWorkerClient({ claimed: [UID] });
  assert.equal((await work(client, { env: {} })).status, 503);
  assert.equal((await work(client, { method: 'GET' })).status, 405);
  assert.equal((await work(client, { cronKey: '' })).status, 401);
  assert.equal((await work(client, { cronKey: 'guess' })).status, 401);
  assert.equal((await work(makeWorkerClient({ key: null }), {})).status, 401, 'no Vault key configured → denied');
  assert.ok(!client.calls.rpc.some(([fn]) => fn === 's32_claim_pending_account_deletions'));
  assert.deepEqual(client.calls.deleteUser, []);
});

test('worker: resumes claimed requests from their receipt and purges expired receipts', async () => {
  const storage = makeStorage([`${ownPrefix}left.jpg`, `${ownPrefix}keep.jpg`, `${COUPLE}/${PARTNER}/p.jpg`]);
  const client = makeWorkerClient({
    claimed: [UID, PARTNER, 'not-a-uuid'], storage,
    plans: {
      [UID]: { state: 'db_done', storage_prefix: ownPrefix, keep_paths: [`${ownPrefix}keep.jpg`] },
      [PARTNER]: { state: 'storage_done', storage_prefix: `${COUPLE}/${PARTNER}/`, keep_paths: [] },
    },
  });
  const res = await work(client, { readBody: async () => ({ batch_size: 500 }) });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { claimed: 2, deleted: 2, pending: 0, skipped: 1, purged_receipts: 2 });
  assert.deepEqual([...storage.objects].sort(), [`${COUPLE}/${PARTNER}/p.jpg`, `${ownPrefix}keep.jpg`].sort());
  assert.deepEqual(client.calls.deleteUser.sort(), [UID, PARTNER].sort());
  const claim = client.calls.rpc.find(([fn]) => fn === 's32_claim_pending_account_deletions');
  assert.deepEqual(claim[1], { p_limit: 50 }, 'batch size is capped');
});

test('D-5 archives: every archived couple prefix is erased whole; malformed archive list fails closed', async () => {
  const archive = `${OTHER_COUPLE}/`;
  const storage = makeStorage([`${ownPrefix}x.jpg`, `${archive}${UID}/old.jpg`, `${archive}${PARTNER}/old-partner.jpg`, `${COUPLE}/${PARTNER}/p.jpg`]);
  const client = makeClient({ storage, plan: { state: 'db_done', storage_prefix: ownPrefix, keep_paths: [], archive_prefixes: [archive] } });
  const res = await finishAccountDeletion({ uid: UID, admin: client.auth.admin, storage, rpc: client.rpc });
  assert.equal(res.status, 'deleted');
  assert.deepEqual([...storage.objects], [`${COUPLE}/${PARTNER}/p.jpg`]);

  for (const bad of ['not-a-list', [`${COUPLE}/${UID}/`], ['../'], [42]]) {
    const st = makeStorage([`${ownPrefix}x.jpg`]);
    const c = makeClient({ storage: st, plan: { state: 'db_done', storage_prefix: ownPrefix, keep_paths: [], archive_prefixes: bad } });
    const r = await finishAccountDeletion({ uid: UID, admin: c.auth.admin, storage: st, rpc: c.rpc });
    assert.equal(r.status, 'pending_cleanup', JSON.stringify(bad));
    assert.equal(st.calls.remove.length, 0);
    assert.equal(c.calls.deleteUser, 0);
  }
});

test('deletion also removes the data exports prepared for the user, and only theirs', async () => {
  const storage = makeStorage(departedFiles);
  const exportsStorage = makeStorage([`${UID}/20261014T120000Z.json`, `${PARTNER}/20261014T120000Z.json`]);
  const client = makeClient({ storage, exportsStorage, dbResult: { status: 'db_done', mode: 'departed', storage_prefix: ownPrefix, keep_paths: [] } });
  const res = await request(client);
  assert.equal(res.status, 200);
  assert.deepEqual([...exportsStorage.objects], [`${PARTNER}/20261014T120000Z.json`]);
});

test('worker afterPurge runs with the authenticated client and is merged into the body', async () => {
  const client = makeClient({ storage: makeStorage([]) });
  client.rpc = async (fn) => {
    if (fn === 'get_internal_account_deletion_cron_key') return { data: 'k'.repeat(32), error: null };
    if (fn === 's32_claim_pending_account_deletions') return { data: [], error: null };
    if (fn === 's32_purge_account_deletion_receipts') return { data: 0, error: null };
    throw new Error(fn);
  };
  let seen = null;
  const res = await runDeletionWorker({ method: 'POST', cronKey: 'k'.repeat(32), readBody: async () => ({}), env: ENV,
    createClient: () => client, afterPurge: async (ctx) => { seen = ctx.client; return { departures: { left: 1 } }; } });
  assert.equal(res.status, 200);
  assert.equal(seen, client);
  assert.deepEqual(res.body.departures, { left: 1 });
  const denied = await runDeletionWorker({ method: 'POST', cronKey: 'wrong', readBody: async () => ({}), env: ENV,
    createClient: () => client, afterPurge: async () => { throw new Error('must not run'); } });
  assert.equal(denied.status, 401);
});
