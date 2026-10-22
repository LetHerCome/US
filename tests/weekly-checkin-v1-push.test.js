// Weekly check-in V1, notifications: the real send-web-push runs under Node
// with in-memory doubles. The server re-reads the round before telling the
// other: "ha fatto il punto, tocca a te" after the first answer, "pronto"
// after the second; only to the partner, never with what was written.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadEdgeFunction, createFakeAdmin, createFakeWebPush } = require('./helpers/edge-function-harness.js');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const COUPLE = 'couple-1', OTHER = 'couple-2';
const F = 'francesco-id', B = 'beatrice-id';
const WEEK = '2026-10-19';
const sub = (id, userId) => ({ id, user_id: userId, endpoint: `https://push.example/${id}`, p256dh: 'p', auth_key: 'a' });
const row = (userId, week = WEEK, couple = COUPLE) => ({ id: `wc-${userId}-${week}`, couple_id: couple, user_id: userId, week_start: week, appreciation: 'SEGRETO', support_request: 'PRIVATO' });

async function setup({ checkins = [], preferences = [], locale = {}, partner = true } = {}) {
  const profiles = [{ id: F, couple_id: COUPLE, display_name: 'Francesco', role: 'francesco', locale: locale[F] || null }];
  if (partner) profiles.push({ id: B, couple_id: COUPLE, display_name: 'Beatrice', role: 'beatrice', locale: locale[B] || null });
  const admin = createFakeAdmin({
    tables: {
      profiles,
      weekly_checkins: checkins,
      notification_preferences: preferences,
      push_subscriptions: [sub('s-fra', F), sub('s-bea', B)],
      push_event_log: [],
    },
    users: { 'jwt-f': { id: F }, 'jwt-b': { id: B } },
    rpc: { get_internal_vapid_private_key: 'vapid-private' },
  });
  const webpush = createFakeWebPush();
  const edge = await loadEdgeFunction('send-web-push', { admin, webpush });
  const answered = (token, reference = WEEK) => edge.call(new Request('https://x/functions/v1/send-web-push', {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ type: 'weekly_checkin_answer', reference_id: reference }),
  }));
  return { admin, webpush, answered };
}

test('first answer: only the partner hears "ha fatto il punto della settimana"', async () => {
  const { admin, webpush, answered } = await setup({ checkins: [row(F)] });
  const response = await answered('jwt-f');
  assert.deepEqual(response, { status: 200, body: { delivered: 1, failed: 0 } });
  assert.deepEqual(webpush.sent.map((s) => s.endpoint), ['https://push.example/s-bea']);
  assert.deepEqual(webpush.sent[0].payload, {
    title: 'US. · Il punto della settimana', body: 'Francesco ha fatto il punto della settimana. Ora tocca a te.',
    icon: '/icon-192.png', badge: '/icon-192.png', tag: `weekly-checkin-turn-${WEEK}`, target: 'today', url: '/?open=today&from=push',
  });
  assert.deepEqual(admin.db.push_event_log.map(({ dedupe_key, event_type }) => ({ dedupe_key, event_type })),
    [{ dedupe_key: `weekly-checkin-turn:${COUPLE}:${WEEK}:${F}`, event_type: 'weekly_checkin_answer' }]);
});

test('second answer: "pronto" only to the other, never to the one who just answered', async () => {
  const { webpush, answered } = await setup({ checkins: [row(F), row(B)] });
  const response = await answered('jwt-b');
  assert.deepEqual(response.body, { delivered: 1, failed: 0 });
  assert.deepEqual(webpush.sent.map((s) => [s.endpoint, s.payload.body, s.payload.tag]),
    [['https://push.example/s-fra', 'Il vostro punto della settimana è pronto ♡', `weekly-checkin-reveal-${WEEK}`]]);
});

test('nothing written ever leaves in the notification', async () => {
  const { webpush, answered } = await setup({ checkins: [row(F)] });
  await answered('jwt-f');
  assert.doesNotMatch(JSON.stringify(webpush.sent), /SEGRETO|PRIVATO/);
});

test('edits and retries do not notify twice', async () => {
  const { webpush, answered } = await setup({ checkins: [row(F)] });
  await answered('jwt-f');
  const again = await answered('jwt-f');
  assert.deepEqual(again.body, { delivered: 0, deduplicated: true });
  assert.equal(webpush.sent.length, 1);
});

test('English for a partner who reads English', async () => {
  const { webpush, answered } = await setup({ checkins: [row(F)], locale: { [B]: 'en' } });
  await answered('jwt-f');
  assert.equal(webpush.sent[0].payload.title, 'US. · Weekly check-in');
  assert.equal(webpush.sent[0].payload.body, 'Francesco did the weekly check-in. Your turn now.');
});

test('the Oggi notification switch turns it off', async () => {
  const { webpush, answered } = await setup({ checkins: [row(F)], preferences: [{ user_id: B, think: true, today: false, bond: true, relationship: true }] });
  const response = await answered('jwt-f');
  assert.deepEqual(response.body, { delivered: 0, reason: 'disabled-by-preference' });
  assert.equal(webpush.sent.length, 0);
});

test('refused: no saved answer, a bad week, another couple, no partner', async () => {
  let { webpush, answered } = await setup({ checkins: [] });
  assert.equal((await answered('jwt-f')).status, 409, 'no answer saved for that week');
  ({ webpush, answered } = await setup({ checkins: [row(F)] }));
  for (const bad of ['2026-10-20', 'not-a-date', '', null]) assert.equal((await answered('jwt-f', bad)).status, 400, String(bad));
  ({ webpush, answered } = await setup({ checkins: [row(F, WEEK, OTHER)] }));
  assert.equal((await answered('jwt-f')).status, 409, 'a row of another couple does not count');
  ({ webpush, answered } = await setup({ checkins: [row(F)], partner: false }));
  assert.equal((await answered('jwt-f')).status, 400);
  assert.equal(webpush.sent.length, 0);
});

test('one kind per type for Android, with its own sentence on the phone', () => {
  const transport = read('supabase/functions/_shared/native-push-transport.mjs');
  assert.match(transport, /weekly_checkin_turn: 'checkin_turn'/);
  assert.match(transport, /weekly_checkin_reveal: 'checkin_ready'/);
  const java = read('native-plugins/us-push-support/android/src/main/java/com/usapp/pushsupport/UsPushNotices.java');
  for (const kind of ['checkin_turn', 'checkin_ready']) assert.match(java, new RegExp(`case "${kind}":`));
  assert.match(java, /ha fatto il punto della settimana/);
  assert.match(java, /did the weekly check-in/);
  assert.match(read('native-plugins/us-push-support/android/src/test/java/com/usapp/pushsupport/UsPushNoticesTest.java'), /checkin_turn/);
});
