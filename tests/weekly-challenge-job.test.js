// La sfida della settimana — notifications (founder, 03/11/2026): «La sfida
// della settimana» on Monday morning, a reminder on Saturday if it is not done,
// and, for a couple apart, "X ha messo la sua foto: manca solo la tua" to the
// other one. All three follow the challenge's switch in Impostazioni ›
// Notifiche (notification_preferences.bond, the missions' one before). The
// real Edge Functions run under Node with in-memory doubles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadEdgeFunction, createFakeAdmin, createFakeWebPush } = require('./helpers/edge-function-harness');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const COUPLE = '00000000-0000-4000-8000-0000000000c1';
const ALONE = '00000000-0000-4000-8000-0000000000c2';
const F = '00000000-0000-4000-8000-0000000000f1';
const B = '00000000-0000-4000-8000-0000000000b1';
const S = '00000000-0000-4000-8000-0000000000a1';
const CH = '00000000-0000-4000-8000-0000000000e1';
const sub = (id, user) => ({ id, user_id: user, endpoint: `https://push.example/${id}`, p256dh: 'p', auth_key: 'a' });

let core;
test.before(async () => { core = await import('../supabase/functions/_shared/notification-core.mjs'); });

test('the three notifications: copy in both languages, they open Gioca, never points or missions', () => {
  const n = (type, args) => core.buildNotification(type, { challengeId: CH, ...args });
  const monday = n('challenge_new', { title: 'Fotografate il vostro cielo stasera, alla stessa ora.' });
  assert.deepEqual([monday.title, monday.body, monday.target, monday.ref, monday.channel], ['US. · La sfida della settimana', 'Fotografate il vostro cielo stasera, alla stessa ora.', 'quiz', CH, 'reminders']);
  assert.equal(n('challenge_new', { locale: 'en', title: 'Photograph your sky tonight, at the same time.' }).title, 'US. · This week’s challenge');
  assert.equal(n('challenge_new', {}).body, 'C’è una nuova sfida per voi ♡');
  const saturday = n('challenge_reminder', { shortTitle: 'Lo stesso cielo' });
  assert.equal(saturday.body, 'Domani è l’ultimo giorno per «Lo stesso cielo» ♡');
  assert.equal(n('challenge_reminder', { shortTitle: 'The same sky', locale: 'en' }).body, 'Tomorrow is the last day for “The same sky” ♡');
  const photo = n('challenge_photo', { senderName: 'Bea' });
  assert.deepEqual([photo.title, photo.body, photo.target, photo.channel], ['US. · La sfida della settimana', 'Bea ha messo la sua foto: manca solo la tua', 'quiz', 'partner']);
  assert.equal(n('challenge_photo', { senderName: 'Bea', locale: 'en' }).body, 'Bea added their photo: only yours is missing');
  assert.notEqual(monday.tag, saturday.tag);
  for (const x of [monday, saturday, photo]) assert.doesNotMatch(`${x.title} ${x.body}`, /XP|Bond|quest|[Mm]issioni|\+\d|punti/);
});

test('Android writes its own sentence for each of them (kinds in sync with UsPushNotices.java)', async () => {
  const { ANDROID_NOTICE_KINDS } = await import('../supabase/functions/_shared/native-push-transport.mjs');
  assert.equal(ANDROID_NOTICE_KINDS.challenge_new, 'challenge');
  assert.equal(ANDROID_NOTICE_KINDS.challenge_reminder, 'challenge_reminder');
  assert.equal(ANDROID_NOTICE_KINDS.challenge_photo, 'challenge_photo');
  const java = read('native-plugins/us-push-support/android/src/main/java/com/usapp/pushsupport/UsPushNotices.java');
  for (const kind of ['challenge', 'challenge_reminder', 'challenge_photo']) assert.match(java, new RegExp(`case "${kind}":[\\s\\S]*?"gioca"\\);`), kind);
  assert.match(java, /ha messo la sua foto: manca solo la tua/);
});

async function atInstant(iso, fn) {
  const RealDate = Date;
  const fixed = RealDate.parse(iso);
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return fixed; }
  };
  try { return await fn(); } finally { globalThis.Date = RealDate; }
}
function world({ completed = false, postedBy = [], prefs = [], locales = {} } = {}) {
  const calls = [];
  const admin = createFakeAdmin({
    tables: {
      couples: [{ id: COUPLE }, { id: ALONE }],
      profiles: [{ id: F, couple_id: COUPLE, locale: locales[F] ?? null }, { id: B, couple_id: COUPLE, locale: locales[B] ?? null }, { id: S, couple_id: ALONE, locale: null }],
      notification_preferences: prefs,
      push_subscriptions: [sub('s-fra', F), sub('s-bea', B), sub('s-solo', S)],
      push_event_log: [],
    },
    rpc: {
      get_internal_weekly_challenge_cron_key: 'cron-ok',
      get_internal_vapid_private_key: 'vapid-private',
      weekly_challenge_for_job: (args) => {
        calls.push(args.target_couple_id);
        return {
          id: args.target_couple_id === COUPLE ? CH : '00000000-0000-4000-8000-0000000000e2', week_start: '2026-11-09',
          title: 'Fotografate il vostro cielo stasera, alla stessa ora.', title_en: 'Photograph your sky tonight, at the same time.',
          short_title: 'Lo stesso cielo', short_title_en: 'The same sky', two_places: true, completed, posted_by: postedBy,
        };
      },
    },
  });
  return { admin, calls, webpush: createFakeWebPush() };
}
async function run(w, iso, body = {}, key = 'cron-ok') {
  const fn = await loadEdgeFunction('weekly-challenge-job', { admin: w.admin, webpush: w.webpush });
  return atInstant(iso, () => fn.call(new Request('https://x/functions/v1/weekly-challenge-job', { method: 'POST', headers: { 'x-us-cron-key': key }, body: JSON.stringify(body) })));
}
const sent = (w) => w.webpush.sent.map((s) => [s.endpoint.replace('https://push.example/', ''), s.payload.body]);

test('the job answers only the cron key, and acts only on Monday at 9 and Saturday at 10 in Rome', async () => {
  const w = world();
  assert.equal((await run(w, '2026-11-09T08:30:00Z', {}, 'wrong')).status, 401);
  assert.deepEqual((await run(w, '2026-11-09T07:30:00Z')).body, { skipped: true, reason: 'outside-local-hour' }, 'Monday 8:30 in Rome');
  assert.deepEqual((await run(w, '2026-11-10T08:30:00Z')).body, { skipped: true, reason: 'outside-local-hour' }, 'Tuesday 9:30');
  assert.deepEqual((await run(w, '2026-11-14T08:30:00Z')).body, { skipped: true, reason: 'outside-local-hour' }, 'Saturday 9:30');
  assert.deepEqual(w.calls, []);
  assert.deepEqual(w.webpush.sent, []);
});

test('Monday morning: «La sfida della settimana» with its title, to both, each in their language, once', async () => {
  const w = world({ locales: { [B]: 'en' } });
  const res = await run(w, '2026-11-09T08:30:00Z');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, kind: 'new', couples: 1, delivered: 2 });
  assert.deepEqual(w.calls, [COUPLE], 'a couple of one is not told');
  assert.deepEqual(sent(w).sort(), [['s-bea', 'Photograph your sky tonight, at the same time.'], ['s-fra', 'Fotografate il vostro cielo stasera, alla stessa ora.']]);
  assert.ok(w.webpush.sent.every((s) => s.payload.target === 'quiz'));
  assert.deepEqual(w.admin.db.push_event_log.map((r) => r.dedupe_key).sort(), [`challenge-new:${CH}:${B}`, `challenge-new:${CH}:${F}`]);
  // A second run in the same hour sends nothing.
  await run(w, '2026-11-09T08:50:00Z');
  assert.equal(w.webpush.sent.length, 2);
});

test('the switch in Impostazioni › Notifiche turns them off', async () => {
  const w = world({ prefs: [{ user_id: B, bond: false }] });
  await run(w, '2026-11-09T08:30:00Z');
  assert.deepEqual(sent(w), [['s-fra', 'Fotografate il vostro cielo stasera, alla stessa ora.']]);
});

test('Saturday: a reminder only if it is not done, only to whoever has not sent a photo', async () => {
  const done = world({ completed: true });
  assert.deepEqual((await run(done, '2026-11-14T09:30:00Z')).body, { ok: true, kind: 'reminder', couples: 1, delivered: 0 });
  assert.deepEqual(done.webpush.sent, []);
  const half = world({ postedBy: [B] });
  await run(half, '2026-11-14T09:30:00Z');
  assert.deepEqual(sent(half), [['s-fra', 'Domani è l’ultimo giorno per «Lo stesso cielo» ♡']]);
});

test('to try it by hand on staging: the cron key and {"force":"monday"} or {"force":"saturday"}', async () => {
  const w = world();
  assert.equal((await run(w, '2026-11-11T15:00:00Z', { force: 'monday' })).body.kind, 'new');
  assert.equal((await run(w, '2026-11-11T15:00:00Z', { force: 'saturday' })).body.kind, 'reminder');
  assert.equal((await run(w, '2026-11-11T15:00:00Z', { force: 'monday' }, 'nope')).status, 401);
  assert.deepEqual((await run(w, '2026-11-11T15:00:00Z', { force: 'sunday' })).body, { skipped: true, reason: 'outside-local-hour' });
});

// send-web-push: the photo of a couple apart.
function photoWorld({ twoPlaces = true, completed = null, photos = [{ user_id: B }], prefs = [] } = {}) {
  const admin = createFakeAdmin({
    tables: {
      profiles: [{ id: F, couple_id: COUPLE, display_name: 'Francesco', role: 'francesco' }, { id: B, couple_id: COUPLE, display_name: 'Bea', role: 'beatrice' }],
      couple_weekly_challenges: [{ id: CH, couple_id: COUPLE, two_places: twoPlaces, completed_at: completed }],
      couple_weekly_challenge_photos: photos.map((p) => ({ challenge_id: CH, ...p })),
      notification_preferences: prefs,
      push_subscriptions: [sub('s-fra', F), sub('s-bea', B)],
      push_event_log: [],
    },
    users: { 'jwt-f': { id: F }, 'jwt-b': { id: B } },
    rpc: { get_internal_vapid_private_key: 'vapid-private' },
  });
  return { admin, webpush: createFakeWebPush() };
}
async function photoPush(w, token, ref = CH) {
  const fn = await loadEdgeFunction('send-web-push', { admin: w.admin, webpush: w.webpush });
  return fn.call(new Request('https://x/functions/v1/send-web-push', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ type: 'challenge_photo', reference_id: ref }) }));
}

test('a couple apart: the first photo tells the other one «manca solo la tua», once', async () => {
  const w = photoWorld();
  assert.deepEqual((await photoPush(w, 'jwt-b')).body, { delivered: 1, failed: 0 });
  assert.deepEqual(sent(w), [['s-fra', 'Bea ha messo la sua foto: manca solo la tua']]);
  assert.deepEqual((await photoPush(w, 'jwt-b')).body, { delivered: 0, deduplicated: true });
});

test('no push when it is not true: no photo of mine, both sent, near couple, closed, another couple, switched off', async () => {
  assert.equal((await photoPush(photoWorld(), 'jwt-f')).status, 409, 'F has not sent a photo');
  assert.deepEqual((await photoPush(photoWorld({ photos: [{ user_id: B }, { user_id: F }] }), 'jwt-b')).body, { delivered: 0, reason: 'not-waiting' });
  assert.deepEqual((await photoPush(photoWorld({ twoPlaces: false }), 'jwt-b')).body, { delivered: 0, reason: 'not-waiting' });
  assert.deepEqual((await photoPush(photoWorld({ completed: '2026-11-12T10:00:00Z' }), 'jwt-b')).body, { delivered: 0, reason: 'not-waiting' });
  assert.equal((await photoPush(photoWorld(), 'jwt-b', '00000000-0000-4000-8000-0000000000ee')).status, 409);
  assert.equal((await photoPush(photoWorld(), 'jwt-b', 'not-a-uuid')).status, 400);
  assert.deepEqual((await photoPush(photoWorld({ prefs: [{ user_id: F, bond: false }] }), 'jwt-b')).body, { delivered: 0, reason: 'disabled-by-preference' });
});

test('the cron migration and the Edge are wired like the other jobs', () => {
  const edge = read('supabase/functions/weekly-challenge-job/index.ts');
  assert.match(edge, /get_internal_weekly_challenge_cron_key/);
  assert.match(edge, /x-us-cron-key/);
  assert.match(edge, /from "\.\.\/_shared\/weekly-challenge-job-core\.mjs"/);
  assert.ok(fs.existsSync(path.join(ROOT, 'supabase/functions/weekly-challenge-job/deno.json')));
  const config = read('supabase/config.toml');
  assert.match(config, /\[functions\.weekly-challenge-job\]\s+verify_jwt = false/);
});
