// Play Us (28/11/2026): «Bea ti sfida a Play Us ♡» reaches the partner only
// while the live invite is waiting (3 minutes), opens Gioca, and Android writes
// the line itself from the play_invite kind. The real Edge Function and shared
// cores under Node, with in-memory doubles (no network, no Supabase).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadEdgeFunction, createFakeAdmin, createFakeWebPush } = require('./helpers/edge-function-harness.js');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const shared = (file) => import(pathToFileURL(path.join(ROOT, 'supabase/functions/_shared', file)).href);
const UUID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const COUPLE = UUID(900);
const OTHER = UUID(901);
const F = UUID(1);
const B = UUID(2);
const S = UUID(70);
const INSTALL = '11111111-1111-4111-8111-111111111111';
const sub = (id, userId) => ({ id, user_id: userId, endpoint: `https://push.example/${id}`, p256dh: 'p', auth_key: 'a' });
const inMs = (ms) => new Date(Date.now() + ms).toISOString();
const session = (extra = {}) => ({ id: S, couple_id: COUPLE, invited_by: B, status: 'invited', invite_expires_at: inMs(150_000), ...extra });

function world({ tables = {} } = {}) {
  const admin = createFakeAdmin({
    tables: {
      profiles: [
        { id: F, couple_id: COUPLE, display_name: 'Francesco', role: 'francesco', locale: null },
        { id: B, couple_id: COUPLE, display_name: 'Bea', role: 'beatrice', locale: null },
      ],
      notification_preferences: [], push_subscriptions: [sub('s-fra', F), sub('s-bea', B)], push_event_log: [],
      play_us_sessions: [session()],
      ...tables,
    },
    users: { 'jwt-f': { id: F }, 'jwt-b': { id: B } },
    rpc: { get_internal_vapid_private_key: 'vapid-private' },
  });
  return { admin, webpush: createFakeWebPush() };
}
async function post(w, token, body) {
  const edge = await loadEdgeFunction('send-web-push', w);
  return edge.call(new Request('https://x/functions/v1/send-web-push', {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  }));
}

test('play_invite: the copy, Gioca, high urgency and a 3-minute life', async () => {
  const core = await shared('notification-core.mjs');
  const it = core.buildNotification('play_invite', { senderName: 'Bea', sessionId: S, locale: 'it' });
  assert.equal(it.title, 'US. · Play Us');
  assert.equal(it.body, 'Bea ti sfida a Play Us ♡');
  assert.equal(it.target, 'quiz');
  assert.equal(it.ref, S);
  assert.equal(it.tag, `play-invite-${S}`);
  assert.equal(it.channel, 'partner');
  assert.equal(it.urgency, 'high');
  assert.equal(it.ttl, 180);
  assert.equal(core.buildNotification('play_invite', { senderName: 'Bea', sessionId: S, locale: 'en' }).body, 'Bea challenges you to Play Us ♡');
});

test('play_invite: FCM carries only the kind, Android writes the line and opens Gioca', async () => {
  const core = await shared('notification-core.mjs');
  const { fcmMessage, ANDROID_NOTICE_KINDS } = await shared('native-push-transport.mjs');
  assert.equal(ANDROID_NOTICE_KINDS.play_invite, 'play_invite');
  const message = fcmMessage(core.buildNotification('play_invite', { senderName: 'Bea', sessionId: S, locale: 'it' }), { token: 'fcm-token', installation_id: INSTALL }).message;
  assert.deepEqual(message.data, { v: '2', installation: INSTALL, k: 'play_invite' });
  assert.equal(message.android.priority, 'HIGH');
  assert.equal(message.android.ttl, '180s');
  assert.match(read('native-plugins/us-push-support/android/src/main/java/com/usapp/pushsupport/UsPushNotices.java'),
    /case "play_invite":\s*return notice\(en, "US\. · Play Us", "US\. · Play Us",\s*who \+ " ti sfida a Play Us ♡", who \+ " challenges you to Play Us ♡", "gioca"\);/);
});

test('send-web-push: the waiting invite reaches the partner once', async () => {
  const w = world();
  const ok = await post(w, 'jwt-b', { type: 'play_invite', reference_id: S });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { delivered: 1, failed: 0 });
  assert.deepEqual(w.webpush.sent.map((s) => [s.endpoint, s.payload.body, s.payload.target, s.options.TTL]), [["https://push.example/s-fra", "Bea ti sfida a Play Us ♡", "quiz", 180]]);
  const claim = w.admin.db.push_event_log.find((row) => row.event_type === 'play_invite');
  assert.equal(claim.dedupe_key, `play-invite:${S}`);
  assert.deepEqual((await post(w, 'jwt-b', { type: 'play_invite', reference_id: S })).body, { delivered: 0, deduplicated: true });
});

test('send-web-push: only a real, own, still waiting invite', async () => {
  assert.equal((await post(world(), 'jwt-b', { type: 'play_invite', reference_id: 'nope' })).status, 400);
  assert.equal((await post(world(), 'jwt-f', { type: 'play_invite', reference_id: S })).status, 403, 'not the one who invited');
  assert.equal((await post(world({ tables: { play_us_sessions: [session({ couple_id: OTHER })] } }), 'jwt-b', { type: 'play_invite', reference_id: S })).status, 403);
  assert.equal((await post(world({ tables: { play_us_sessions: [] } }), 'jwt-b', { type: 'play_invite', reference_id: S })).status, 403);
  assert.equal((await post(world({ tables: { play_us_sessions: [session({ status: 'playing' })] } }), 'jwt-b', { type: 'play_invite', reference_id: S })).status, 409);
  assert.equal((await post(world({ tables: { play_us_sessions: [session({ invite_expires_at: inMs(-1000) })] } }), 'jwt-b', { type: 'play_invite', reference_id: S })).status, 409, 'expired');
  const off = world({ tables: { notification_preferences: [{ user_id: F, think: true, today: true, bond: true, relationship: true, games: false }] } });
  assert.deepEqual((await post(off, 'jwt-b', { type: 'play_invite', reference_id: S })).body, { delivered: 0, reason: 'disabled-by-preference' });
});
