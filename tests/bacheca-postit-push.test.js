// La bacheca, fase 2 (founder, grill 27/11/2026): «Bea ha scritto su un ricordo
// in bacheca» reaches the partner at most once every 2 hours, under the
// «Lavagna» switch, never with the text of the post-it, and opens the board on
// that thing. The real Edge Function and shared cores under Node, with
// in-memory doubles (no network, no Supabase).
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
const N = UUID(80);
const HOUR = 60 * 60 * 1000;
const sub = (id, userId) => ({ id, user_id: userId, endpoint: `https://push.example/${id}`, p256dh: 'p', auth_key: 'a' });
const ago = (ms) => new Date(Date.now() - ms).toISOString();
const note = (extra = {}) => ({ id: N, couple_id: COUPLE, author_id: B, ref_key: 'moment:x', body: 'Torniamo a giugno?', created_at: ago(5000), ...extra });
const lastPush = (ms, extra = {}) => ({ dedupe_key: `bacheca-postit:${F}:old`, couple_id: COUPLE, sender_id: B, event_type: 'bacheca_postit', created_at: ago(ms), ...extra });

function world({ tables = {}, locales = {} } = {}) {
  const admin = createFakeAdmin({
    tables: {
      profiles: [
        { id: F, couple_id: COUPLE, display_name: 'Francesco', role: 'francesco', locale: locales[F] ?? null },
        { id: B, couple_id: COUPLE, display_name: 'Bea', role: 'beatrice', locale: locales[B] ?? null },
      ],
      notification_preferences: [], push_subscriptions: [sub('s-fra', F), sub('s-bea', B)], push_event_log: [],
      us_bacheca_notes: [note()],
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

test('catalogue: who wrote, never the text, in the recipient\'s language; it opens the board', async () => {
  const core = await shared('notification-core.mjs');
  assert.ok(core.NOTIFICATION_TARGETS.includes('bacheca'));
  const it = core.buildNotification('bacheca_postit', { senderName: 'Bea', noteId: N });
  assert.deepEqual([it.title, it.body, it.target, it.ref, it.tag, it.channel], ['US. · Bacheca', 'Bea ha scritto su un ricordo in bacheca', 'bacheca', N, 'us-bacheca-postit', 'partner']);
  const en = core.buildNotification('bacheca_postit', { senderName: 'Bea', noteId: N, locale: 'en' });
  assert.deepEqual([en.title, en.body], ['US. · Board', 'Bea wrote on a memory on your board']);
  assert.equal(core.buildNotification('bacheca_postit', {}).body, 'La tua persona ha scritto su un ricordo in bacheca');
});

test('Android: FCM carries the kind only; the phone writes the line and opens Ricordi', async () => {
  const { ANDROID_NOTICE_KINDS } = await shared('native-push-transport.mjs');
  assert.equal(ANDROID_NOTICE_KINDS.bacheca_postit, 'bacheca_postit');
  const notices = read('native-plugins/us-push-support/android/src/main/java/com/usapp/pushsupport/UsPushNotices.java');
  assert.match(notices, /case "bacheca_postit":\s*return notice\(en, "US\. · Bacheca", "US\. · Board",\s*who \+ " ha scritto su un ricordo in bacheca", who \+ " wrote on a memory on your board", "ricordi"\);/);
  assert.match(read('native-plugins/us-push-support/android/src/test/java/com/usapp/pushsupport/UsPushNoticesTest.java'), /forKind\("bacheca_postit", "Bea", IT\)/);
});

test('the app, the service worker and the native client accept the target; it opens the board on the thing', () => {
  for (const [file, pattern] of [
    ['app.js', /const US_PUSH_TARGETS=Object\.freeze\(\[[^\]]*'bacheca'[^\]]*\]\);/],
    ['notifications.js', /const TARGETS = Object\.freeze\(\[[^\]]*'bacheca'[^\]]*\]\);/],
    ['service-worker.js', /const US_PUSH_TARGETS = \[[^\]]*"bacheca"[^\]]*\];/],
  ]) assert.match(read(file), pattern, file);
  assert.match(read('app.js'), /if\(target==='bacheca'\)\{[\s\S]{0,200}go\('moments'[\s\S]{0,120}window\.UsBacheca\?\.openOn\?\.\(\{noteId:ref\|\|''\}\)/);
});

test('send-web-push: the partner hears it once, with the name and without the text; its own 2-hour window', async () => {
  const w = world();
  const ok = await post(w, 'jwt-b', { type: 'bacheca_postit', reference_id: N });
  assert.deepEqual(ok.body, { delivered: 1, failed: 0 });
  assert.deepEqual(w.webpush.sent.map((s) => [s.endpoint, s.payload.title, s.payload.body, s.payload.target, s.payload.url]),
    [['https://push.example/s-fra', 'US. · Bacheca', 'Bea ha scritto su un ricordo in bacheca', 'bacheca', '/?open=bacheca&from=push']]);
  assert.ok(!JSON.stringify(w.webpush.sent).includes('giugno'), 'never the post-it\'s words');
  const claim = w.admin.db.push_event_log.find((row) => row.event_type === 'bacheca_postit');
  assert.equal(claim.dedupe_key, `bacheca-postit:${F}:${Math.floor(Date.now() / (2 * HOUR))}`);
  assert.deepEqual((await post(w, 'jwt-b', { type: 'bacheca_postit', reference_id: N })).body, { delivered: 0, failed: 0, deduplicated: true });
  assert.equal(w.webpush.sent.length, 1);
  // A drawing in the same hour has its own line: the board of Noi is another place.
  const drew = world({ tables: { push_event_log: [lastPush(60_000, { event_type: 'lavagna' })] } });
  assert.deepEqual((await post(drew, 'jwt-b', { type: 'bacheca_postit', reference_id: N })).body, { delivered: 1, failed: 0 });
});

test('send-web-push: at most once every 2 hours; only a fresh post-it of the caller; the Lavagna switch turns it off', async () => {
  const soon = world({ tables: { push_event_log: [lastPush(HOUR + 50 * 60 * 1000)] } });
  assert.deepEqual((await post(soon, 'jwt-b', { type: 'bacheca_postit', reference_id: N })).body, { delivered: 0, failed: 0, reason: 'throttled' });
  const later = world({ locales: { [F]: 'en' }, tables: { push_event_log: [lastPush(2 * HOUR + 60_000)] } });
  assert.deepEqual((await post(later, 'jwt-b', { type: 'bacheca_postit', reference_id: N })).body, { delivered: 1, failed: 0 });
  assert.deepEqual(later.webpush.sent.map((s) => s.payload.body), ['Bea wrote on a memory on your board']);
  assert.equal((await post(world(), 'jwt-b', { type: 'bacheca_postit', reference_id: 'nope' })).status, 400);
  assert.equal((await post(world(), 'jwt-f', { type: 'bacheca_postit', reference_id: N })).status, 403, 'someone else\'s post-it');
  assert.equal((await post(world({ tables: { us_bacheca_notes: [note({ couple_id: OTHER })] } }), 'jwt-b', { type: 'bacheca_postit', reference_id: N })).status, 403);
  assert.equal((await post(world({ tables: { us_bacheca_notes: [] } }), 'jwt-b', { type: 'bacheca_postit', reference_id: N })).status, 403);
  const stale = world({ tables: { us_bacheca_notes: [note({ created_at: ago(31 * 60 * 1000) })] } });
  assert.deepEqual((await post(stale, 'jwt-b', { type: 'bacheca_postit', reference_id: N })).body, { delivered: 0, failed: 0, reason: 'stale' }, 'an old post-it changed later notifies no more');
  const off = world({ tables: { notification_preferences: [{ user_id: F, lavagna: false }] } });
  assert.deepEqual((await post(off, 'jwt-b', { type: 'bacheca_postit', reference_id: N })).body, { delivered: 0, failed: 0, reason: 'disabled-by-preference' });
  assert.equal(off.webpush.sent.length, 0);
});
