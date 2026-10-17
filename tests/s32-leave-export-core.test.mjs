import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEAVE_WORD, finishCoupleDeparture, handleLeaveCouple, isLeaveEnabled, parseLeaveBody, resumeCoupleDepartures,
} from '../supabase/functions/_shared/s32-leave-couple-core.mjs';
import {
  EXPORT_BUCKET, LINK_TTL_SECONDS, MEDIA_BUCKET, SIGN_BATCH_SIZE, handleDataExport, isSafeMediaPath, purgeExpiredExports, sameSecret,
} from '../supabase/functions/_shared/s32-data-export-core.mjs';
import { createEmailSender, exportEmail, isEmailAddress } from '../supabase/functions/_shared/us-email.mjs';
import { DeletionError, STORAGE_BUCKET } from '../supabase/functions/_shared/s32-account-deletion-core.mjs';

const UID = 'e8c90d50-81e9-4a0d-beeb-5886c63c4963';
const PARTNER = '01d5fe3d-1e8e-4872-b453-01918de88893';
const COUPLE = '46155127-5742-42d0-8195-5f6d0992ae7b';
const OTHER_COUPLE = '7e4ff7be-f3f3-44aa-ac8d-b587375e81a4';
const NOW = 1_800_000_000;
const ENV = { US_LEAVE_COUPLE_ENABLED: 'true', US_ALLOWED_ORIGINS: 'https://us-staging-s31.pages.dev' };

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const makeJwt = (payload) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.c2ln`;
const freshJwt = (extra = {}) => makeJwt({ sub: UID, amr: [{ method: 'password', timestamp: NOW - 30 }], ...extra });

// In-memory bucket that mimics supabase-js list()/remove() (one level, folders id=null).
function makeStorage(initial, { failRemove = false } = {}) {
  const objects = new Set(initial);
  const calls = { list: 0, remove: [] };
  return {
    objects, calls,
    async list(folder, { limit = 100, offset = 0 } = {}) {
      calls.list++;
      const base = folder ? `${folder}/` : '';
      const entries = new Map();
      for (const name of objects) {
        if (!name.startsWith(base)) continue;
        const [head, ...tail] = name.slice(base.length).split('/');
        entries.set(head, tail.length ? { name: head, id: null } : { name: head, id: `id-${name}` });
      }
      const sorted = [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
      return { data: sorted.slice(offset, offset + limit), error: null };
    },
    async remove(paths) {
      calls.remove.push([...paths]);
      if (failRemove) return { data: null, error: { code: 'remove_failed' } };
      for (const p of paths) objects.delete(p);
      return { data: paths.map((name) => ({ name })), error: null };
    },
  };
}

// ------------------------------------------------------------------ leave ---

const ownPrefix = `${COUPLE}/${UID}/`;
const files = [
  `${ownPrefix}moments/a.jpg`,
  `${ownPrefix}avatar.png`,
  `${ownPrefix}shared/kept-for-partner.jpg`,
  `${COUPLE}/${PARTNER}/partner.jpg`,
  `${OTHER_COUPLE}/${UID}/foreign.jpg`,
];
const departedPlan = (extra = {}) => ({
  status: 'db_done', couple_id: COUPLE, mode: 'departed', state: 'db_done',
  storage_prefix: ownPrefix, keep_paths: [`${ownPrefix}shared/kept-for-partner.jpg`], ...extra,
});

function makeLeaveClient({ storage, dbResult, dbError = null, plan = null, markError = null, user = { id: UID } } = {}) {
  const calls = { rpc: [], getUser: 0, storageFrom: [], admin: 0 };
  return {
    calls,
    auth: {
      async getUser() { calls.getUser++; return user ? { data: { user }, error: null } : { data: { user: null }, error: { status: 401 } }; },
      admin: new Proxy({}, { get() { calls.admin++; return async () => ({ error: null }); } }),
    },
    async rpc(fn, args) {
      calls.rpc.push([fn, args]);
      if (fn === 's32_leave_couple') return dbError ? { data: null, error: dbError } : { data: dbResult, error: null };
      if (fn === 's32_couple_departure_plan') return { data: plan, error: null };
      if (fn === 's32_mark_couple_departure') return markError ? { data: null, error: markError } : { data: { ok: true }, error: null };
      throw new Error(`unexpected rpc ${fn}`);
    },
    storage: { from(bucket) { calls.storageFrom.push(bucket); return storage; } },
  };
}

const leave = (client, overrides = {}) => {
  let created = 0;
  const logs = [];
  return handleLeaveCouple({
    method: 'POST',
    origin: 'https://us-a33.pages.dev',
    authorization: `Bearer ${freshJwt()}`,
    readBody: async () => ({ confirm: LEAVE_WORD, channel: 'app' }),
    env: ENV,
    nowSeconds: NOW,
    createClient: () => { created++; return client; },
    log: (e) => logs.push(e),
    ...overrides,
  }).then((res) => ({ ...res, created, logs }));
};
const leaveMarks = (client) => client.calls.rpc.filter(([fn]) => fn === 's32_mark_couple_departure').map(([, a]) => [a.p_state, a.p_error]);

test('leave: own files removed, kept media and partner files untouched, account never touched', async () => {
  const storage = makeStorage(files);
  const client = makeLeaveClient({ storage, dbResult: departedPlan() });
  const res = await leave(client);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: 'left' });
  assert.deepEqual([...storage.objects].sort(), [
    `${COUPLE}/${PARTNER}/partner.jpg`, `${ownPrefix}shared/kept-for-partner.jpg`, `${OTHER_COUPLE}/${UID}/foreign.jpg`,
  ].sort());
  assert.deepEqual(client.calls.rpc[0], ['s32_leave_couple', { p_user: UID, p_channel: 'app' }]);
  assert.deepEqual(client.calls.storageFrom, [STORAGE_BUCKET]);
  assert.deepEqual(leaveMarks(client), [['completed', null]]);
  assert.equal(client.calls.admin, 0, 'leaving never signs out, bans or deletes the account');
  const logText = JSON.stringify(res.logs);
  for (const secret of [UID, COUPLE, PARTNER, 'kept-for-partner', 'a.jpg']) assert.ok(!logText.includes(secret), `log leaks ${secret}`);
});

test('leave: last member erases the whole couple folder only', async () => {
  const storage = makeStorage(files);
  const client = makeLeaveClient({ storage, dbResult: departedPlan({ mode: 'couple_erased', storage_prefix: `${COUPLE}/`, keep_paths: [] }) });
  const res = await leave(client);
  assert.equal(res.status, 200);
  assert.deepEqual([...storage.objects], [`${OTHER_COUPLE}/${UID}/foreign.jpg`]);
});

test('leave: a plan whose prefix does not match its mode fails closed, nothing removed', async () => {
  for (const bad of [
    departedPlan({ storage_prefix: `${COUPLE}/` }),
    departedPlan({ mode: 'couple_erased' }),
    departedPlan({ storage_prefix: `${OTHER_COUPLE}/${UID}/` }),
    departedPlan({ mode: 'deleted' }),
  ]) {
    const storage = makeStorage(files);
    const client = makeLeaveClient({ storage, dbResult: bad });
    const res = await leave(client);
    assert.equal(res.status, 202);
    assert.deepEqual(res.body, { status: 'pending_cleanup' });
    assert.equal(storage.calls.remove.length, 0);
    assert.deepEqual(leaveMarks(client), [['failed', 'departure_plan_invalid']]);
  }
});

test('leave: storage failure is 202 and marked failed for the worker', async () => {
  const storage = makeStorage(files, { failRemove: true });
  const client = makeLeaveClient({ storage, dbResult: departedPlan() });
  const res = await leave(client);
  assert.equal(res.status, 202);
  assert.deepEqual(leaveMarks(client), [['failed', 'storage_remove_failed']]);
});

test('leave: not in a couple is 409, other DB errors 500 without storage calls', async () => {
  let client = makeLeaveClient({ storage: makeStorage(files), dbError: { code: 'P0002', message: 'not_in_couple' } });
  let res = await leave(client);
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: 'not_in_couple' });
  assert.deepEqual(client.calls.storageFrom, []);
  client = makeLeaveClient({ storage: makeStorage(files), dbError: { code: 'P0001', message: 'account_deleted' } });
  res = await leave(client);
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: 'leave_failed' });
  assert.deepEqual(client.calls.storageFrom, []);
});

test('leave: retry resumes from the receipt plan', async () => {
  const storage = makeStorage(files);
  const client = makeLeaveClient({ storage, dbResult: { status: 'already_done', couple_id: COUPLE }, plan: departedPlan({ state: 'storage_done' }) });
  const res = await leave(client);
  assert.equal(res.status, 200);
  assert.ok(client.calls.rpc.some(([fn, a]) => fn === 's32_couple_departure_plan' && a.p_user === UID && a.p_couple === COUPLE));
  const done = makeLeaveClient({ storage, dbResult: { status: 'already_done', couple_id: COUPLE }, plan: departedPlan({ state: 'completed' }) });
  assert.equal((await leave(done)).status, 200);
  assert.deepEqual(leaveMarks(done), []);
});

test('leave: flag, origin, method, word, channel, bearer and re-authentication', async () => {
  const client = makeLeaveClient({ storage: makeStorage(files), dbResult: departedPlan() });
  const cases = [
    [{ env: { ...ENV, US_LEAVE_COUPLE_ENABLED: 'false' } }, 503, 'leave_disabled'],
    [{ origin: 'https://evil.example' }, 403, 'origin_denied'],
    [{ method: 'GET' }, 405, 'method_not_allowed'],
    [{ authorization: '' }, 401, 'auth_required'],
    [{ readBody: async () => ({ confirm: 'esci', channel: 'app' }) }, 400, 'confirm_required'],
    [{ readBody: async () => ({ confirm: 'ELIMINA', channel: 'app' }) }, 400, 'confirm_required'],
    [{ readBody: async () => ({ confirm: LEAVE_WORD, channel: 'operator' }) }, 400, 'channel_invalid'],
    [{ readBody: async () => { throw new Error('bad json'); } }, 400, 'confirm_required'],
    [{ authorization: `Bearer ${freshJwt({ amr: [{ method: 'password', timestamp: NOW - 3600 }] })}` }, 401, 'reauth_required'],
  ];
  for (const [overrides, status, error] of cases) {
    const res = await leave(client, overrides);
    assert.equal(res.status, status, JSON.stringify(overrides));
    assert.deepEqual(res.body, { error });
    assert.equal(res.created, 0, 'no client before every check passes');
  }
  assert.equal((await leave(client, { method: 'OPTIONS' })).status, 204);
  assert.deepEqual(client.calls.rpc, []);
});

test('leave: identity comes from auth.getUser; a token for someone else is rejected', async () => {
  const client = makeLeaveClient({ storage: makeStorage(files), dbResult: departedPlan(), user: { id: PARTNER } });
  const res = await leave(client);
  assert.equal(res.status, 401);
  assert.deepEqual(res.body, { error: 'invalid_session' });
  assert.deepEqual(client.calls.rpc, []);
});

test('leave: parseLeaveBody and the flag', () => {
  assert.deepEqual(parseLeaveBody({ confirm: 'ESCI', channel: 'app' }), { channel: 'app' });
  assert.throws(() => parseLeaveBody(['ESCI']), DeletionError);
  assert.throws(() => parseLeaveBody(null), DeletionError);
  assert.equal(isLeaveEnabled({ US_LEAVE_COUPLE_ENABLED: 'true' }), true);
  assert.equal(isLeaveEnabled({ US_LEAVE_COUPLE_ENABLED: '1' }), false);
  assert.equal(isLeaveEnabled(undefined), false);
});

test('worker resume: claimed departures finish, malformed ids skipped, failures stay pending', async () => {
  const storage = makeStorage(files);
  const other = '9b1b7a9e-3f3c-4bd2-9c55-1d7c5f0e2a11';
  const rpcCalls = [];
  const rpc = async (fn, args) => {
    rpcCalls.push([fn, args]);
    if (fn === 's32_claim_pending_couple_departures') {
      return { data: [{ user_id: UID, couple_id: COUPLE }, { user_id: 'nope', couple_id: COUPLE }, { user_id: other, couple_id: COUPLE }], error: null };
    }
    if (fn === 's32_couple_departure_plan') {
      return args.p_user === UID ? { data: departedPlan({ state: 'db_done' }), error: null } : { data: null, error: { code: 'XX000' } };
    }
    if (fn === 's32_mark_couple_departure') return { data: { ok: true }, error: null };
    throw new Error(`unexpected rpc ${fn}`);
  };
  const counts = await resumeCoupleDepartures({ rpc, storage, limit: 5 });
  assert.deepEqual(counts, { claimed: 2, left: 1, pending: 1, skipped: 1 });
  assert.deepEqual(rpcCalls[0], ['s32_claim_pending_couple_departures', { p_limit: 5 }]);
  assert.ok(!storage.objects.has(`${ownPrefix}moments/a.jpg`));
  const failed = await resumeCoupleDepartures({ rpc: async () => ({ data: null, error: { code: 'x' } }), storage });
  assert.equal(failed.error, 'claim_failed');
});

test('finishCoupleDeparture rejects malformed ids before any call', async () => {
  await assert.rejects(finishCoupleDeparture({ uid: 'x', couple: COUPLE, storage: makeStorage([]), rpc: async () => { throw new Error('no'); } }), DeletionError);
});

// ----------------------------------------------------------------- export ---

const OPERATOR_KEY = 'op-key-0123456789abcdef0123456789abcdef';
const mediaPaths = [`${ownPrefix}moments/a.jpg`, `${ownPrefix}avatar.png`];

function makeExportClient({ media = mediaPaths, lookup = UID, exportError = null, signFail = false, uploadError = null, missing = [] } = {}) {
  const calls = { rpc: [], sign: [], upload: [], signedUrl: [], storageFrom: [] };
  const buckets = {
    [MEDIA_BUCKET]: {
      async createSignedUrls(paths, ttl) {
        calls.sign.push([paths, ttl]);
        if (signFail) return { data: null, error: { code: 'x' } };
        return { data: paths.map((path) => (missing.includes(path) ? { path, error: 'Object not found', signedUrl: null } : { path, error: null, signedUrl: `https://signed/${path}` })), error: null };
      },
    },
    [EXPORT_BUCKET]: {
      async upload(name, bytes, opts) { calls.upload.push([name, JSON.parse(Buffer.from(bytes).toString('utf8')), opts]); return { error: uploadError }; },
      async createSignedUrl(name, ttl, opts) { calls.signedUrl.push([name, ttl, opts]); return { data: { signedUrl: `https://signed/export/${name}` }, error: null }; },
    },
  };
  return {
    calls,
    async rpc(fn, args) {
      calls.rpc.push([fn, args]);
      if (fn === 'get_internal_operator_key') return { data: OPERATOR_KEY, error: null };
      if (fn === 's32_user_id_by_email') return { data: lookup, error: null };
      if (fn === 's32_export_user_data') return exportError ? { data: null, error: exportError } : { data: { schema_version: 1, user_id: UID, media }, error: null };
      throw new Error(`unexpected rpc ${fn}`);
    },
    storage: { from(bucket) { calls.storageFrom.push(bucket); return buckets[bucket]; } },
  };
}

const exportRun = (client, overrides = {}) => {
  const logs = [];
  return handleDataExport({
    method: 'POST',
    operatorKey: OPERATOR_KEY,
    readBody: async () => ({ email: 'persona@example.com' }),
    env: { US_DATA_EXPORT_ENABLED: 'true', US_SUPPORT_EMAIL: 'aiuto@example.com' },
    now: () => new Date('2026-10-14T12:00:00.000Z'),
    createClient: () => client,
    log: (e) => logs.push(e),
    ...overrides,
  }).then((res) => ({ ...res, logs }));
};

test('export without email provider: file in the user folder, link handed to the operator', async () => {
  const client = makeExportClient({ missing: [`${ownPrefix}avatar.png`] });
  const res = await exportRun(client);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ready');
  assert.equal(res.body.media_count, 2);
  assert.equal(res.body.media_skipped, 0);
  assert.equal(res.body.expires_at, '2026-10-21T12:00:00.000Z');
  const [name, doc, opts] = client.calls.upload[0];
  assert.equal(name, `${UID}/20261014T120000Z.json`);
  assert.deepEqual(opts, { contentType: 'application/json', upsert: false });
  assert.equal(doc.account.email, 'persona@example.com');
  assert.deepEqual(doc.media, [
    { path: `${ownPrefix}moments/a.jpg`, url: `https://signed/${ownPrefix}moments/a.jpg` },
    { path: `${ownPrefix}avatar.png`, url: null },
  ]);
  assert.equal(res.body.download_url, `https://signed/export/${name}`);
  assert.deepEqual(client.calls.signedUrl[0].slice(1), [LINK_TTL_SECONDS, { download: true }]);
  const logText = JSON.stringify(res.logs);
  for (const secret of [UID, COUPLE, 'persona@example.com', 'signed/', OPERATOR_KEY]) assert.ok(!logText.includes(secret), `log leaks ${secret}`);
});

test('export with an email provider: mailed to the user, no link in the response', async () => {
  const sent = [];
  const res = await exportRun(makeExportClient(), { sendEmail: async (m) => { sent.push(m); return { ok: true }; } });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'sent');
  assert.equal(res.body.download_url, undefined);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'persona@example.com');
  assert.match(sent[0].text, /https:\/\/signed\/export\//);
  assert.match(sent[0].text, /aiuto@example\.com/);
});

test('export: failed email falls back to the operator link', async () => {
  const res = await exportRun(makeExportClient(), { sendEmail: async () => ({ ok: false, code: 'email_http_500' }) });
  assert.equal(res.body.status, 'ready');
  assert.ok(res.body.download_url);
});

test('export: paths outside the user folder are never signed', async () => {
  const client = makeExportClient({ media: [...mediaPaths, `${COUPLE}/${PARTNER}/partner.jpg`, `${ownPrefix}../${PARTNER}/x.jpg`, 'legacy.jpg'] });
  const res = await exportRun(client);
  assert.equal(res.status, 200);
  assert.equal(res.body.media_count, 2);
  assert.equal(res.body.media_skipped, 3);
  assert.deepEqual(client.calls.sign.flatMap(([p]) => p), mediaPaths);
});

test('export: links are signed in batches', async () => {
  const many = Array.from({ length: SIGN_BATCH_SIZE * 2 + 5 }, (_, i) => `${ownPrefix}moments/${i}.jpg`);
  const client = makeExportClient({ media: many });
  const res = await exportRun(client);
  assert.equal(res.body.media_count, many.length);
  assert.deepEqual(client.calls.sign.map(([p]) => p.length), [SIGN_BATCH_SIZE, SIGN_BATCH_SIZE, 5]);
});

test('export: operator key, flag, method, email and lookup checks', async () => {
  const client = makeExportClient();
  const cases = [
    [{ env: { US_DATA_EXPORT_ENABLED: 'false' } }, 503, 'export_disabled'],
    [{ method: 'GET' }, 405, 'method_not_allowed'],
    [{ operatorKey: '' }, 401, 'unauthorized'],
    [{ operatorKey: `${OPERATOR_KEY}x` }, 401, 'unauthorized'],
    [{ operatorKey: OPERATOR_KEY.replace(/.$/, 'X') }, 401, 'unauthorized'],
    [{ readBody: async () => ({ email: 'not-an-email' }) }, 400, 'email_invalid'],
    [{ readBody: async () => { throw new Error('bad'); } }, 400, 'email_invalid'],
  ];
  for (const [overrides, status, error] of cases) {
    const res = await exportRun(client, overrides);
    assert.equal(res.status, status, JSON.stringify(overrides));
    assert.deepEqual(res.body, { error });
  }
  assert.ok(!client.calls.rpc.some(([fn]) => fn === 's32_export_user_data'));
  assert.equal((await exportRun(makeExportClient({ lookup: null }))).status, 404);
  assert.equal((await exportRun(makeExportClient({ exportError: { code: 'P0001' } }))).status, 500);
  assert.equal((await exportRun(makeExportClient({ signFail: true }))).status, 502);
  assert.equal((await exportRun(makeExportClient({ uploadError: { code: 'x' } }))).status, 502);
});

test('export helpers: isSafeMediaPath and sameSecret', () => {
  assert.ok(isSafeMediaPath(`${ownPrefix}moments/a.jpg`, UID));
  assert.ok(!isSafeMediaPath(`${COUPLE}/${PARTNER}/a.jpg`, UID));
  assert.ok(!isSafeMediaPath(`${ownPrefix}../a.jpg`, UID));
  assert.ok(!isSafeMediaPath(`${ownPrefix}/a.jpg`, UID));
  assert.ok(!isSafeMediaPath(null, UID));
  assert.ok(sameSecret('abc', 'abc'));
  assert.ok(!sameSecret('abc', 'abd'));
  assert.ok(!sameSecret('', ''));
});

test('purgeExpiredExports removes only export files older than the link', async () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  const tree = {
    '': [{ name: UID, id: null }, { name: 'stray.txt', id: 'f' }, { name: 'not-a-uuid', id: null }],
    [UID]: [
      { name: '20261001T100000Z.json', id: '1', created_at: '2026-10-01T10:00:00Z' },
      { name: '20261013T100000Z.json', id: '2', created_at: '2026-10-13T10:00:00Z' },
      { name: 'other.bin', id: '3', created_at: '2026-01-01T00:00:00Z' },
    ],
  };
  const removed = [];
  const storage = {
    async list(folder) { return { data: tree[folder] || [], error: null }; },
    async remove(paths) { removed.push(...paths); return { error: null }; },
  };
  const res = await purgeExpiredExports({ storage, nowMs: now });
  assert.deepEqual(res, { removed: 1 });
  assert.deepEqual(removed, [`${UID}/20261001T100000Z.json`]);
  const failing = await purgeExpiredExports({ storage: { async list() { return { data: null, error: { code: 'x' } }; } }, nowMs: now });
  assert.equal(failing.error, 'list_failed');
});

// ------------------------------------------------------------------ email ---

test('email: no provider configured means manual hand-off', () => {
  assert.equal(createEmailSender({}, fetch), null);
  assert.equal(createEmailSender({ US_EMAIL_PROVIDER: 'manual' }, fetch), null);
  assert.equal(createEmailSender({ US_EMAIL_PROVIDER: 'resend', US_EMAIL_FROM: 'US <a@b.it>' }, fetch), null, 'no key');
  assert.equal(createEmailSender({ US_EMAIL_PROVIDER: 'resend', US_EMAIL_API_KEY: 'k' }, fetch), null, 'no sender');
  assert.equal(createEmailSender({ US_EMAIL_PROVIDER: 'postino', US_EMAIL_FROM: 'a@b.it', US_EMAIL_API_KEY: 'k' }, fetch), null, 'unknown provider');
});

test('email: resend sender posts one message and maps failures to codes', async () => {
  const requests = [];
  let status = 200;
  const fakeFetch = async (url, init) => { requests.push([url, init]); return { status }; };
  const send = createEmailSender({ US_EMAIL_PROVIDER: 'Resend', US_EMAIL_FROM: 'US <ciao@example.com>', US_EMAIL_API_KEY: 'test-key' }, fakeFetch);
  assert.deepEqual(await send({ to: 'persona@example.com', subject: 'S', text: 'T' }), { ok: true });
  const [url, init] = requests[0];
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(init.headers.Authorization, 'Bearer test-key');
  assert.deepEqual(JSON.parse(init.body), { from: 'US <ciao@example.com>', to: ['persona@example.com'], subject: 'S', text: 'T' });
  status = 422;
  assert.deepEqual(await send({ to: 'persona@example.com', subject: 'S', text: 'T' }), { ok: false, code: 'email_http_422' });
  assert.deepEqual(await send({ to: 'nope', subject: 'S', text: 'T' }), { ok: false, code: 'recipient_invalid' });
  const offline = createEmailSender({ US_EMAIL_PROVIDER: 'resend', US_EMAIL_FROM: 'a@b.it', US_EMAIL_API_KEY: 'k' }, async () => { throw new Error('down'); });
  assert.deepEqual(await offline({ to: 'persona@example.com', subject: 'S', text: 'T' }), { ok: false, code: 'email_network' });
});

test('email: export message text and address check', () => {
  const m = exportEmail({ link: 'https://x/y', expiresAt: '2026-10-21T12:00:00.000Z', supportEmail: 'aiuto@example.com' });
  assert.equal(m.subject, 'La copia dei tuoi dati di US');
  assert.match(m.text, /https:\/\/x\/y/);
  assert.match(m.text, /21 ottobre 2026/);
  assert.match(m.text, /aiuto@example\.com/);
  assert.ok(isEmailAddress('a.b+c@example.co'));
  assert.ok(!isEmailAddress('a@b'));
  assert.ok(!isEmailAddress('a b@example.com'));
  assert.ok(!isEmailAddress(42));
});
