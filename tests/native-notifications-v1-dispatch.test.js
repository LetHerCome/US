// Native Notifications V1 — one notification domain, several transports.
//
// notification-core.mjs (catalogue + dispatcher) and native-push-transport.mjs
// (FCM HTTP v1 / APNs) are pure modules: fake admin, fake providers, real
// WebCrypto signatures with throwaway keys generated here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const SHARED = path.join(ROOT, 'supabase/functions/_shared');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const load = (name) => import(path.join(SHARED, name));

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const F = 'aaaaaaaa-0000-4000-8000-00000000000f';
const B = 'aaaaaaaa-0000-4000-8000-00000000000b';
const MSG = '33333333-3333-4333-8333-333333333333';
const FCM_TOKEN = `fcm:${'a'.repeat(60)}`;
const APNS_TOKEN = 'ab'.repeat(32);

// ---------------------------------------------------------------- fake admin
function fakeAdmin({ subscriptions = [], devices = [], claimed = new Set(), failOn = {} } = {}) {
  const log = { claims: [], released: [], deletedSubscriptions: [], deletedDevices: [], deviceQueries: 0 };
  const table = (name) => {
    const filters = [];
    const builder = {
      select() { return builder; },
      eq(column, value) { filters.push((row) => row[column] === value); return builder; },
      in(column, values) { filters.push((row) => values.includes(row[column])); return builder; },
      then(resolve, reject) {
        if (failOn[name]) return Promise.resolve({ data: null, error: { message: `${name} down` } }).then(resolve, reject);
        const rows = name === 'push_subscriptions' ? subscriptions : devices;
        if (name === 'device_push_tokens') log.deviceQueries += 1;
        return Promise.resolve({ data: rows.filter((row) => filters.every((f) => f(row))), error: null }).then(resolve, reject);
      },
      insert(row) {
        if (claimed.has(row.dedupe_key)) return Promise.resolve({ error: { code: '23505' } });
        claimed.add(row.dedupe_key);
        log.claims.push(row);
        return Promise.resolve({ error: null });
      },
      delete() {
        return { eq: (column, value) => {
          if (name === 'push_event_log') { claimed.delete(value); log.released.push(value); }
          if (name === 'push_subscriptions') log.deletedSubscriptions.push(value);
          if (name === 'device_push_tokens') log.deletedDevices.push(value);
          return Promise.resolve({ error: null });
        } };
      },
    };
    return builder;
  };
  return { from: table, log, claimed };
}

const subscription = (id, userId) => ({ id, user_id: userId, endpoint: `https://push.example/${id}`, p256dh: 'p', auth_key: 'a' });
const device = (id, userId, provider = 'fcm', coupleId = C1) => ({
  id, user_id: userId, couple_id: coupleId, token: provider === 'fcm' ? FCM_TOKEN : APNS_TOKEN,
  platform: provider === 'fcm' ? 'android' : 'ios', provider, apns_environment: provider === 'apns' ? 'production' : null,
});
function fakeWeb({ fail = {} } = {}) {
  const sent = [];
  return { sent, send: async (sub, payload, options) => {
    if (fail[sub.endpoint]) { const e = new Error('push failed'); e.statusCode = fail[sub.endpoint]; throw e; }
    sent.push({ sub, payload: JSON.parse(payload), options });
  } };
}
function fakeNative({ ready = ['fcm', 'apns'], outcome = {} } = {}) {
  const sent = [];
  return { sent, ready: (provider) => ready.includes(provider), send: async (d, n) => {
    sent.push({ device: d.id, notification: n });
    return outcome[d.id] ? { ok: false, outcome: outcome[d.id] } : { ok: true };
  } };
}

// ------------------------------------------------------------------ contract
test('contract: every catalogue entry builds a valid, URL-free, allow-listed notification', async () => {
  const core = await load('notification-core.mjs');
  const args = { senderName: 'Bea', messageId: MSG, questionId: MSG, questId: MSG, itemId: MSG, sessionId: MSG, tag: 'game-waiting:x', entryId: MSG, reminderId: MSG, body: 'Cena alle 20', title: 'Auguri', reminder: 1 };
  for (const type of core.NOTIFICATION_TYPES) {
    const n = core.buildNotification(type, args);
    assert.ok(Object.isFrozen(n));
    assert.deepEqual(Object.keys(n).sort(), ['badge', 'body', 'category', 'channel', 'ref', 'tag', 'target', 'title', 'ttl', 'type', 'urgency', 'v']);
    assert.ok(core.NOTIFICATION_TARGETS.includes(n.target), type);
    assert.ok(core.NOTIFICATION_CHANNELS.includes(n.channel), type);
    assert.equal(n.badge, 1, `${type}: native badge is the binary unread signal`);
    assert.doesNotMatch(JSON.stringify(n), /https?:|\/\/|token|@/i, `${type}: no URL, token or address`);
  }
  assert.throws(() => core.buildNotification('nope'), /notification_type_invalid/);
  assert.throws(() => core.buildNotification('relationship', { title: 'x', body: 'y', tag: 'bad tag!' }), /notification_tag_invalid/);
  assert.throws(() => core.buildNotification('calendar_reminder', { reminderId: 'r', entryId: MSG, body: '' }), /notification_copy_missing/);
  // A ref that is not a UUID never travels.
  assert.equal(core.buildNotification('game_waiting', { sessionId: 'javascript:alert(1)', tag: 'game-waiting:x' }).ref, null);
  assert.throws(() => core.buildNotification('think', { senderName: 'B', messageId: 'javascript:alert(1)' }), /notification_tag_invalid/);
  // Control characters are flattened, copy is bounded.
  const long = core.buildNotification('relationship', { title: 'a\u0000b', body: 'x'.repeat(500), tag: 'relationship-1' });
  assert.equal(long.title, 'a b');
  assert.equal(long.body.length, 180);
});

test('contract: the Web Push wire format keeps exactly the keys the service worker reads', async () => {
  const core = await load('notification-core.mjs');
  const payload = JSON.parse(core.webPushPayload(core.buildNotification('think', { senderName: 'Bea', messageId: MSG })));
  assert.deepEqual(Object.keys(payload).sort(), ['badge', 'body', 'icon', 'tag', 'target', 'title', 'url']);
  assert.equal(payload.url, '/?open=think&from=push');
  assert.equal(payload.body, 'Bea ti sta pensando ♡');
});

// ----------------------------------------------------------------- dispatcher
test('dispatch: one logical event reaches Web Push AND native devices under ONE claim', async () => {
  const { buildNotification, deliverNotification } = await load('notification-core.mjs');
  const admin = fakeAdmin({ subscriptions: [subscription('s1', B)], devices: [device('d1', B), device('d2', B, 'apns'), device('d3', F)] });
  const web = fakeWeb();
  const native = fakeNative();
  const result = await deliverNotification(admin, {
    notification: buildNotification('think', { senderName: 'F', messageId: MSG }),
    recipientIds: [B], coupleId: C1, senderId: F, dedupeKey: `think:${MSG}`, eventType: 'think', web, native,
  });
  assert.deepEqual(result, { delivered: 3, failed: 0 });
  assert.equal(admin.log.claims.length, 1);
  assert.deepEqual(native.sent.map((s) => s.device).sort(), ['d1', 'd2'], 'sender devices never receive');
  assert.equal(web.sent.length, 1);
  // A replay of the same event is deduplicated for every transport.
  const replay = await deliverNotification(admin, {
    notification: buildNotification('think', { senderName: 'F', messageId: MSG }),
    recipientIds: [B], coupleId: C1, senderId: F, dedupeKey: `think:${MSG}`, eventType: 'think', web, native,
  });
  assert.deepEqual(replay, { delivered: 0, failed: 0, deduplicated: true });
  assert.equal(native.sent.length, 2);
});

test('dispatch: a native-only recipient is reached; Web Push never consumes the event first', async () => {
  const { buildNotification, deliverNotification } = await load('notification-core.mjs');
  const admin = fakeAdmin({ devices: [device('d1', B)] });
  const native = fakeNative();
  const result = await deliverNotification(admin, {
    notification: buildNotification('left_for_you', { senderName: 'F', itemId: MSG }), recipientIds: [B], coupleId: C1,
    dedupeKey: `left-for-you:${MSG}`, eventType: 'left_for_you', web: fakeWeb(), native,
  });
  assert.deepEqual(result, { delivered: 1, failed: 0 });
  assert.equal(native.sent[0].notification.target, 'left_for_you');
});

test('dispatch: rows of another couple are skipped', async () => {
  const { buildNotification, deliverNotification } = await load('notification-core.mjs');
  const admin = fakeAdmin({ devices: [device('d1', B, 'fcm', C2)] });
  const result = await deliverNotification(admin, {
    notification: buildNotification('think', { senderName: 'F', messageId: MSG }), recipientIds: [B], coupleId: C1,
    dedupeKey: 'k1', eventType: 'think', web: fakeWeb(), native: fakeNative(),
  });
  assert.deepEqual(result, { delivered: 0, failed: 0, reason: 'recipient-not-subscribed' });
  assert.deepEqual(admin.log.released, ['k1'], 'nothing delivered → the key is released');
});

test('dispatch: invalid tokens are removed, transient and config failures keep the token', async () => {
  const { buildNotification, deliverNotification } = await load('notification-core.mjs');
  const admin = fakeAdmin({ devices: [device('dead', B), device('busy', B), device('auth', B, 'apns')] });
  const native = fakeNative({ outcome: { dead: 'invalid-token', busy: 'transient', auth: 'config' } });
  const result = await deliverNotification(admin, {
    notification: buildNotification('think', { senderName: 'F', messageId: MSG }), recipientIds: [B], coupleId: C1,
    dedupeKey: 'k2', eventType: 'think', web: fakeWeb(), native,
  });
  assert.deepEqual(result, { delivered: 0, failed: 3 });
  assert.deepEqual(admin.log.deletedDevices, ['dead']);
  assert.deepEqual(admin.log.released, ['k2'], 'a later retry can still deliver');
});

test('dispatch: a thrown transport error is transient, never deletes', async () => {
  const { buildNotification, deliverNotification } = await load('notification-core.mjs');
  const admin = fakeAdmin({ devices: [device('d1', B)] });
  const native = { ready: () => true, send: async () => { throw new Error('socket'); } };
  const result = await deliverNotification(admin, {
    notification: buildNotification('think', { senderName: 'F', messageId: MSG }), recipientIds: [B], coupleId: C1,
    dedupeKey: 'k3', eventType: 'think', native,
  });
  assert.deepEqual(result, { delivered: 0, failed: 1 });
  assert.deepEqual(admin.log.deletedDevices, []);
});

test('dispatch: missing configuration fails safely without consuming the event', async () => {
  const { buildNotification, deliverNotification } = await load('notification-core.mjs');
  const n = buildNotification('think', { senderName: 'F', messageId: MSG });
  const brokenWeb = { ensure: async () => { throw new Error('push_configuration_unavailable'); }, send: async () => {} };
  // No VAPID and no native configuration → throw before any claim.
  const a1 = fakeAdmin({ subscriptions: [subscription('s1', B)], devices: [device('d1', B)] });
  await assert.rejects(deliverNotification(a1, { notification: n, recipientIds: [B], coupleId: C1, dedupeKey: 'k4', eventType: 'think', web: brokenWeb, native: fakeNative({ ready: [] }) }), /push_configuration_unavailable/);
  assert.equal(a1.log.claims.length, 0);
  assert.equal(a1.log.deviceQueries, 0, 'native rows are not even read while native is unconfigured');
  // Native configured, VAPID broken, recipient has only Web Push → the claim is released and the error surfaces.
  const a2 = fakeAdmin({ subscriptions: [subscription('s1', B)] });
  await assert.rejects(deliverNotification(a2, { notification: n, recipientIds: [B], coupleId: C1, dedupeKey: 'k5', eventType: 'think', web: brokenWeb, native: fakeNative() }), /push_configuration_unavailable/);
  assert.deepEqual(a2.log.released, ['k5']);
  // VAPID broken but the recipient has a native device → native still delivers.
  const a3 = fakeAdmin({ subscriptions: [subscription('s1', B)], devices: [device('d1', B)] });
  assert.deepEqual(await deliverNotification(a3, { notification: n, recipientIds: [B], coupleId: C1, dedupeKey: 'k6', eventType: 'think', web: brokenWeb, native: fakeNative() }), { delivered: 1, failed: 0 });
  // Only an APNs device but only FCM configured → reported, not consumed.
  const a4 = fakeAdmin({ devices: [device('d1', B, 'apns')] });
  assert.deepEqual(await deliverNotification(a4, { notification: n, recipientIds: [B], coupleId: C1, dedupeKey: 'k7', eventType: 'think', web: fakeWeb(), native: fakeNative({ ready: ['fcm'] }) }), { delivered: 0, failed: 0, reason: 'transport-unconfigured' });
  assert.deepEqual(a4.log.released, ['k7']);
});

test('dispatch: a failed recipient query releases the claim', async () => {
  const { buildNotification, deliverNotification } = await load('notification-core.mjs');
  const admin = fakeAdmin({ failOn: { device_push_tokens: true } });
  await assert.rejects(deliverNotification(admin, {
    notification: buildNotification('think', { senderName: 'F', messageId: MSG }), recipientIds: [B], coupleId: C1,
    dedupeKey: 'k8', eventType: 'think', web: fakeWeb(), native: fakeNative(),
  }));
  assert.deepEqual(admin.log.released, ['k8']);
});

test('dispatch: Web Push 404/410 prunes the subscription exactly as before', async () => {
  const { buildNotification, deliverNotification } = await load('notification-core.mjs');
  const admin = fakeAdmin({ subscriptions: [subscription('gone', B), subscription('ok', B)] });
  const result = await deliverNotification(admin, {
    notification: buildNotification('think', { senderName: 'F', messageId: MSG }), recipientIds: [B], coupleId: C1,
    dedupeKey: 'k9', eventType: 'think', web: fakeWeb({ fail: { 'https://push.example/gone': 410 } }), native: null,
  });
  assert.deepEqual(result, { delivered: 1, failed: 1 });
  assert.deepEqual(admin.log.deletedSubscriptions, ['gone']);
});

// ------------------------------------------------------------- preferences
test('preferences: every producer filters BEFORE the dispatcher, so all transports obey the same switch', () => {
  const producers = {
    'supabase/functions/_shared/think-web-push.ts': /thinkPreferenceEnabled/,
    'supabase/functions/_shared/left-for-you-push-core.mjs': /notification_preferences/,
    'supabase/functions/_shared/daily-question-push-core.mjs': /notification_preferences|preference/,
    'supabase/functions/_shared/game-v2-push-core.mjs': /notification_preferences|preference/,
    'supabase/functions/send-web-push/index.ts': /notification_preferences/,
    'supabase/functions/monthiversary-job/index.ts': /notification_preferences/,
  };
  for (const [file, pattern] of Object.entries(producers)) {
    const source = read(file);
    assert.match(source, pattern, `${file} reads preferences`);
    assert.match(source, /deliverNotification/, `${file} delivers through the dispatcher`);
  }
  // No producer talks to a provider or claims dedupe keys on its own any more.
  for (const file of Object.keys(producers)) {
    const source = read(file);
    assert.doesNotMatch(source, /fcm\.googleapis|push\.apple\.com/, file);
    assert.doesNotMatch(source, /from\(["']push_event_log["']\)\.insert/, `${file}: claims only in the dispatcher`);
  }
});

// ------------------------------------------------------------------ transport
async function pkcs8Pem(algorithm) {
  const pair = await webcrypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
  const der = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
  return { pem: `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`, publicKey: pair.publicKey };
}
const b64url = (s) => Buffer.from(s, 'base64url');

async function providerKeys() {
  const rsa = await pkcs8Pem({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' });
  const ec = await pkcs8Pem({ name: 'ECDSA', namedCurve: 'P-256' });
  const env = {
    FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'us-test-project', client_email: 'sender@us-test-project.iam.gserviceaccount.com', private_key: rsa.pem }),
    APNS_KEY_ID: 'ABC123DEFG', APNS_TEAM_ID: 'TEAM123456', APNS_PRIVATE_KEY: ec.pem,
  };
  return { rsa, ec, env };
}

test('transport config: missing or malformed secrets leave the provider not ready', async () => {
  const t = await load('native-push-transport.mjs');
  assert.deepEqual(t.nativePushConfig(() => undefined), { fcm: null, apns: null });
  assert.deepEqual(t.nativePushConfig((k) => ({ FCM_SERVICE_ACCOUNT_JSON: '{not json', APNS_KEY_ID: 'short', APNS_TEAM_ID: 'TEAM123456', APNS_PRIVATE_KEY: 'x' })[k]), { fcm: null, apns: null });
  const throwing = t.createNativeTransport({ config: t.nativePushConfig(() => { throw new Error('no env'); }) });
  assert.equal(throwing.ready('fcm'), false);
  assert.equal(throwing.ready('apns'), false);
  assert.deepEqual(await throwing.send({ provider: 'fcm', platform: 'android', token: FCM_TOKEN }, {}), { ok: false, outcome: 'config' });
  const { env } = await providerKeys();
  const config = t.nativePushConfig((k) => env[k]);
  assert.equal(config.apns.topic, 'com.usapp.us');
  assert.equal(config.fcm.projectId, 'us-test-project');
});

test('transport FCM: signed RS256 assertion, HTTP v1 message, channel and data contract', async () => {
  const t = await load('native-push-transport.mjs');
  const core = await load('notification-core.mjs');
  t.resetNativeTransportCache();
  const { rsa, env } = await providerKeys();
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (url === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }), { status: 200 });
    return new Response('{}', { status: 200 });
  };
  const transport = t.createNativeTransport({ config: t.nativePushConfig((k) => env[k]), fetch, crypto: webcrypto });
  const n = core.buildNotification('calendar_reminder', { reminderId: 'r1', entryId: MSG, body: 'Cena alle 20' });
  assert.deepEqual(await transport.send(device('d1', B), n), { ok: true });
  assert.deepEqual(await transport.send(device('d1', B), n), { ok: true });
  assert.equal(calls.filter((c) => c.url.includes('oauth2')).length, 1, 'access token cached');
  const assertion = new URLSearchParams(calls[0].init.body).get('assertion');
  const [h, c, s] = assertion.split('.');
  assert.ok(await webcrypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, rsa.publicKey, b64url(s), Buffer.from(`${h}.${c}`)));
  const claims = JSON.parse(b64url(c).toString());
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging');
  const send = calls[1];
  assert.equal(send.url, 'https://fcm.googleapis.com/v1/projects/us-test-project/messages:send');
  assert.equal(send.init.headers.Authorization, 'Bearer ya29.test');
  const message = JSON.parse(send.init.body).message;
  assert.deepEqual(message.data, { v: '1', type: 'calendar_reminder', target: 'calendar', ref: MSG, tag: 'calendar-reminder-r1' });
  assert.equal(message.android.notification.channel_id, 'us_reminders');
  assert.equal(message.android.notification.notification_count, 1);
  assert.equal(message.android.priority, 'HIGH');
  assert.doesNotMatch(send.init.body, /private_key|BEGIN|https?:\/\/(?!)/);
});

test('transport APNs: ES256 provider token, sandbox vs production host, headers, category', async () => {
  const t = await load('native-push-transport.mjs');
  const core = await load('notification-core.mjs');
  t.resetNativeTransportCache();
  const { ec, env } = await providerKeys();
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 200 }); };
  const transport = t.createNativeTransport({ config: t.nativePushConfig((k) => env[k]), fetch, crypto: webcrypto, now: () => 1_700_000_000_000 });
  const n = core.buildNotification('think', { senderName: 'Bea', messageId: MSG });
  await transport.send({ ...device('d1', B, 'apns'), apns_environment: 'development' }, n);
  await transport.send(device('d2', B, 'apns'), n);
  assert.equal(calls[0].url, `https://api.sandbox.push.apple.com/3/device/${APNS_TOKEN}`);
  assert.equal(calls[1].url, `https://api.push.apple.com/3/device/${APNS_TOKEN}`);
  const headers = calls[0].init.headers;
  assert.equal(headers['apns-topic'], 'com.usapp.us');
  assert.equal(headers['apns-push-type'], 'alert');
  assert.equal(headers['apns-priority'], '10');
  assert.equal(headers['apns-expiration'], String(1_700_000_000 + 43_200));
  assert.equal(headers['apns-collapse-id'], `think-${MSG}`);
  const [h, c, s] = headers.authorization.replace('bearer ', '').split('.');
  assert.deepEqual(JSON.parse(b64url(h).toString()), { alg: 'ES256', kid: 'ABC123DEFG' });
  assert.ok(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, ec.publicKey, b64url(s), Buffer.from(`${h}.${c}`)));
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.aps.category, 'US_THINK');
  assert.deepEqual(body.us, { v: 1, type: 'think', target: 'think', ref: MSG, tag: `think-${MSG}` });
  assert.equal(body.aps.badge, 1, 'binary unread badge');
});

test('transport: provider errors are classified (invalid token / transient / config / rejected)', async () => {
  const t = await load('native-push-transport.mjs');
  assert.equal(t.classifyFcmError(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }), 'invalid-token');
  assert.equal(t.classifyFcmError(400, { error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' } }), 'invalid-token');
  assert.equal(t.classifyFcmError(403, { error: { details: [{ errorCode: 'SENDER_ID_MISMATCH' }] } }), 'invalid-token');
  assert.equal(t.classifyFcmError(429, {}), 'transient');
  assert.equal(t.classifyFcmError(503, {}), 'transient');
  assert.equal(t.classifyFcmError(401, {}), 'config');
  assert.equal(t.classifyFcmError(403, { error: { details: [{ errorCode: 'THIRD_PARTY_AUTH_ERROR' }] } }), 'config');
  assert.equal(t.classifyFcmError(400, { error: { status: 'INVALID_ARGUMENT', message: 'bad ttl' } }), 'rejected');
  assert.equal(t.classifyApnsError(410, { reason: 'Unregistered' }), 'invalid-token');
  assert.equal(t.classifyApnsError(400, { reason: 'BadDeviceToken' }), 'invalid-token');
  assert.equal(t.classifyApnsError(400, { reason: 'DeviceTokenNotForTopic' }), 'invalid-token');
  assert.equal(t.classifyApnsError(429, { reason: 'TooManyRequests' }), 'transient');
  assert.equal(t.classifyApnsError(500, {}), 'transient');
  assert.equal(t.classifyApnsError(403, { reason: 'InvalidProviderToken' }), 'config');
  assert.equal(t.classifyApnsError(400, { reason: 'PayloadTooLarge' }), 'rejected');
  // Network failure and auth failure never become invalid-token.
  t.resetNativeTransportCache();
  const { env } = await providerKeys();
  const down = t.createNativeTransport({ config: t.nativePushConfig((k) => env[k]), fetch: async () => { throw new Error('ECONNRESET'); }, crypto: webcrypto });
  assert.deepEqual(await down.send(device('d1', B), { tag: 'x' }), { ok: false, outcome: 'transient' });
  assert.deepEqual(await down.send(device('d2', B, 'apns'), (await load('notification-core.mjs')).buildNotification('think', { senderName: 'B', messageId: MSG })), { ok: false, outcome: 'transient' });
  t.resetNativeTransportCache();
  const denied = t.createNativeTransport({ config: t.nativePushConfig((k) => env[k]), fetch: async () => new Response('{}', { status: 400 }), crypto: webcrypto });
  assert.deepEqual(await denied.send(device('d1', B), { tag: 'x' }), { ok: false, outcome: 'config' });
  // A malformed stored token is dead on arrival.
  assert.deepEqual(await denied.send({ ...device('d1', B), token: 'x' }, { tag: 'x' }), { ok: false, outcome: 'invalid-token' });
});

test('secrets: credentials are read only from Edge secrets, never committed or logged', () => {
  const env = read('supabase/functions/_shared/native-push-env.ts');
  for (const name of ['FCM_SERVICE_ACCOUNT_JSON', 'APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_PRIVATE_KEY', 'APNS_TOPIC']) assert.match(env, new RegExp(`Deno\\.env\\.get\\("${name}"\\)`));
  const transport = read('supabase/functions/_shared/native-push-transport.mjs');
  assert.doesNotMatch(transport, /console\.(log|info|warn|error)/, 'the transport never logs');
  const manifest = JSON.parse(read('supabase/SECRETS_MANIFEST.json'));
  for (const name of ['FCM_SERVICE_ACCOUNT_JSON', 'APNS_PRIVATE_KEY']) assert.ok(manifest.edge_env.some((e) => e.name === name), name);
  const tracked = require('node:child_process').execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
  assert.ok(!tracked.some((f) => /google-services\.json$|GoogleService-Info\.plist$|\.p8$|AuthKey_|service-account.*\.json$/i.test(f)), 'no Firebase/APNs credential file is tracked');
});
