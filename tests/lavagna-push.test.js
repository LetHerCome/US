// Lavagna V1 (founder, 03/11/2026): «X ha disegnato sulla lavagna» reaches the
// partner at most once every 2 hours, through the push path that already
// exists (send-web-push → Web Push and FCM/APNs under one key), and can be
// switched off in Impostazioni › Notifiche. The real Edge Function and shared
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
const HOUR = 60 * 60 * 1000;
const sub = (id, userId) => ({ id, user_id: userId, endpoint: `https://push.example/${id}`, p256dh: 'p', auth_key: 'a' });
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const stroke = (extra = {}) => ({ id: S, couple_id: COUPLE, author_id: B, created_at: ago(5000), ...extra });
const lastPush = (ms, extra = {}) => ({ dedupe_key: `lavagna:${F}:old`, couple_id: COUPLE, sender_id: B, event_type: 'lavagna', created_at: ago(ms), ...extra });

function world({ tables = {}, locales = {} } = {}) {
  const admin = createFakeAdmin({
    tables: {
      profiles: [
        { id: F, couple_id: COUPLE, display_name: 'Francesco', role: 'francesco', locale: locales[F] ?? null },
        { id: B, couple_id: COUPLE, display_name: 'Bea', role: 'beatrice', locale: locales[B] ?? null },
      ],
      notification_preferences: [], push_subscriptions: [sub('s-fra', F), sub('s-bea', B)], push_event_log: [],
      lavagna_strokes: [stroke()],
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

test('catalogue: one line with the name, in the recipient\'s language, that opens the board', async () => {
  const core = await shared('notification-core.mjs');
  assert.ok(core.NOTIFICATION_TARGETS.includes('lavagna'));
  const it = core.buildNotification('lavagna', { senderName: 'Bea', strokeId: S });
  assert.deepEqual([it.title, it.body, it.target, it.ref, it.tag, it.channel, it.urgency], ['US. · Lavagna', 'Bea ha disegnato sulla lavagna', 'lavagna', S, 'us-lavagna', 'partner', 'normal']);
  const en = core.buildNotification('lavagna', { senderName: 'Bea', strokeId: S, locale: 'en' });
  assert.deepEqual([en.title, en.body], ['US. · Board', 'Bea drew on the board']);
  assert.equal(core.buildNotification('lavagna', {}).body, 'La tua persona ha disegnato sulla lavagna');
});

test('Android: FCM carries the kind only, the phone writes the line and opens Noi', async () => {
  const { ANDROID_NOTICE_KINDS } = await shared('native-push-transport.mjs');
  assert.equal(ANDROID_NOTICE_KINDS.lavagna, 'lavagna');
  const notices = read('native-plugins/us-push-support/android/src/main/java/com/usapp/pushsupport/UsPushNotices.java');
  assert.match(notices, /case "lavagna":\s*return notice\(en, "US\. · Lavagna", "US\. · Board",\s*who \+ " ha disegnato sulla lavagna", who \+ " drew on the board", "noi"\);/);
  const tests = read('native-plugins/us-push-support/android/src/test/java/com/usapp/pushsupport/UsPushNoticesTest.java');
  assert.match(tests, /forKind\("lavagna", "Bea", IT\)/);
});

test('the app, the service worker and the native client accept the new target, and it opens the board', () => {
  for (const [file, pattern] of [
    ['app.js', /const US_PUSH_TARGETS=Object\.freeze\(\[[^\]]*'lavagna'[^\]]*\]\);/],
    ['notifications.js', /const TARGETS = Object\.freeze\(\[[^\]]*'lavagna'[^\]]*\]\);/],
    ['service-worker.js', /const US_PUSH_TARGETS = \[[^\]]*"lavagna"[^\]]*\];/],
  ]) assert.match(read(file), pattern, file);
  const app = read('app.js');
  assert.match(app, /if\(target==='lavagna'\)\{[\s\S]{0,200}go\('bond'[\s\S]{0,120}window\.UsLavagna\?\.open\?\.\(\)/);
});

test('send-web-push: the partner hears it once, with the name; the key is the recipient\'s 2-hour window', async () => {
  const w = world();
  const ok = await post(w, 'jwt-b', { type: 'lavagna', reference_id: S });
  assert.deepEqual(ok.body, { delivered: 1, failed: 0 });
  assert.deepEqual(w.webpush.sent.map((s) => [s.endpoint, s.payload.title, s.payload.body, s.payload.target, s.payload.url]),
    [['https://push.example/s-fra', 'US. · Lavagna', 'Bea ha disegnato sulla lavagna', 'lavagna', '/?open=lavagna&from=push']]);
  const claim = w.admin.db.push_event_log.find((row) => row.event_type === 'lavagna');
  assert.equal(claim.dedupe_key, `lavagna:${F}:${Math.floor(Date.now() / (2 * HOUR))}`);
  assert.deepEqual([claim.couple_id, claim.sender_id], [COUPLE, B]);
  // The next stroke in the same window: no second push.
  assert.deepEqual((await post(w, 'jwt-b', { type: 'lavagna', reference_id: S })).body, { delivered: 0, failed: 0, deduplicated: true });
  assert.equal(w.webpush.sent.length, 1);
});

test('send-web-push: at most once every 2 hours for whoever receives it', async () => {
  const soon = world({ tables: { push_event_log: [lastPush(HOUR + 50 * 60 * 1000)] } });
  assert.deepEqual((await post(soon, 'jwt-b', { type: 'lavagna', reference_id: S })).body, { delivered: 0, failed: 0, reason: 'throttled' });
  assert.equal(soon.webpush.sent.length, 0);
  // Pushes to the other person, or another couple's, never count.
  const others = world({ tables: { push_event_log: [lastPush(60_000, { sender_id: F }), lastPush(60_000, { couple_id: OTHER }), lastPush(60_000, { event_type: 'think' })] } });
  assert.deepEqual((await post(others, 'jwt-b', { type: 'lavagna', reference_id: S })).body, { delivered: 1, failed: 0 });
  const later = world({ locales: { [F]: 'en' }, tables: { push_event_log: [lastPush(2 * HOUR + 60_000)] } });
  assert.deepEqual((await post(later, 'jwt-b', { type: 'lavagna', reference_id: S })).body, { delivered: 1, failed: 0 });
  assert.deepEqual(later.webpush.sent.map((s) => s.payload.body), ['Bea drew on the board']);
});

test('send-web-push: only a fresh stroke of the caller, on the caller\'s board; the switch turns it off', async () => {
  assert.equal((await post(world(), 'jwt-b', { type: 'lavagna' })).status, 400);
  assert.equal((await post(world(), 'jwt-b', { type: 'lavagna', reference_id: 'not-a-uuid' })).status, 400);
  assert.equal((await post(world(), 'jwt-f', { type: 'lavagna', reference_id: S })).status, 403, 'someone else\'s stroke');
  assert.equal((await post(world({ tables: { lavagna_strokes: [stroke({ couple_id: OTHER })] } }), 'jwt-b', { type: 'lavagna', reference_id: S })).status, 403);
  assert.equal((await post(world({ tables: { lavagna_strokes: [] } }), 'jwt-b', { type: 'lavagna', reference_id: S })).status, 403);
  const stale = world({ tables: { lavagna_strokes: [stroke({ created_at: ago(31 * 60 * 1000) })] } });
  assert.deepEqual((await post(stale, 'jwt-b', { type: 'lavagna', reference_id: S })).body, { delivered: 0, failed: 0, reason: 'stale' });
  const off = world({ tables: { notification_preferences: [{ user_id: F, lavagna: false }] } });
  assert.deepEqual((await post(off, 'jwt-b', { type: 'lavagna', reference_id: S })).body, { delivered: 0, failed: 0, reason: 'disabled-by-preference' });
  assert.equal(off.webpush.sent.length, 0);
});

test('Impostazioni › Notifiche: a Lavagna switch with its own line', () => {
  const settings = read('settings.js');
  assert.match(settings, /preferenceToggle\('lavagna','Lavagna',p\.lavagna!==false\)/);
  assert.match(settings, /key==='lavagna'\?'Quando la tua persona disegna sulla lavagna'/);
  assert.match(read('i18n-en.js'), /'Quando la tua persona disegna sulla lavagna': 'When your person draws on the board'/);
});
