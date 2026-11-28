// Come stai che conta (grill del founder del 27/11/2026). Edge cores with a
// fake admin and fake providers:
//  * D7/D16 the answer to the partner's Come stai: words (Italian, English),
//    Android kinds (the gesture as an allow-listed suffix, nothing private),
//    read back from the server, one per state;
//  * D13 the silent widget signal 'status' (FCM v3, APNs background);
//  * D11/D19 work and study: Gioca, the evening reminder and US vi ricorda
//    wait without claiming their key, and go once the state is over.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as core from '../supabase/functions/_shared/notification-core.mjs';
import * as transport from '../supabase/functions/_shared/native-push-transport.mjs';
import * as comeStai from '../supabase/functions/_shared/come-stai-push-core.mjs';
import * as signals from '../supabase/functions/_shared/widget-signal-core.mjs';
import * as game from '../supabase/functions/_shared/game-v2-push-core.mjs';
import * as daily from '../supabase/functions/_shared/daily-question-push-core.mjs';
import * as ricorda from '../supabase/functions/_shared/us-ricorda-push-core.mjs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const C1 = '11111111-1111-4111-8111-111111111111';
const F = 'aaaaaaaa-0000-4000-8000-00000000000f';
const B = 'aaaaaaaa-0000-4000-8000-00000000000b';
const S = 'cccccccc-0000-4000-8000-000000000001';
const Q = 'dddddddd-0000-4000-8000-000000000001';
const INSTALLATION = '8f248b96-e0af-475b-8b87-0f22236ed062';
const FCM_TOKEN = `fcm:${'a'.repeat(60)}`;
const device = (id, userId, provider = 'fcm') => ({
  id, user_id: userId, couple_id: C1, installation_id: INSTALLATION, token: provider === 'fcm' ? FCM_TOKEN : 'ab'.repeat(32),
  platform: provider === 'fcm' ? 'android' : 'ios', provider, apns_environment: provider === 'apns' ? 'production' : null,
});
const NOW = new Date('2026-11-27T13:00:00Z');
const hoursFrom = (h, at = NOW) => new Date(at.getTime() + h * 3600e3).toISOString();

function fakeAdmin({ tables = {}, rpc = {}, claimed = new Set(), failing = [] } = {}) {
  const log = { claims: [], released: [], rpc: [] };
  const from = (name) => {
    const filters = [];
    const rows = () => (tables[name] || []).filter((row) => filters.every((f) => f(row)));
    const answer = () => (failing.includes(name) ? { data: null, error: { message: 'down' } } : { data: rows(), error: null });
    const builder = {
      select() { return builder; },
      eq(column, value) { filters.push((row) => row[column] === value); return builder; },
      neq(column, value) { filters.push((row) => row[column] !== value); return builder; },
      in(column, values) { filters.push((row) => values.includes(row[column])); return builder; },
      maybeSingle() { const a = answer(); return Promise.resolve({ data: a.data ? a.data[0] || null : null, error: a.error }); },
      then(resolve, reject) { return Promise.resolve(answer()).then(resolve, reject); },
      insert(row) {
        if (claimed.has(row.dedupe_key)) return Promise.resolve({ error: { code: '23505' } });
        claimed.add(row.dedupe_key); log.claims.push(row);
        if (name === 'push_event_log') (tables.push_event_log ||= []).push(row);
        return Promise.resolve({ error: null });
      },
      delete() {
        return { eq: (column, value) => {
          if (name === 'push_event_log') { claimed.delete(value); log.released.push(value); tables.push_event_log = (tables.push_event_log || []).filter((r) => r.dedupe_key !== value); }
          return Promise.resolve({ error: null });
        } };
      },
    };
    return builder;
  };
  return { from, log, claimed, rpc: async (fn, args) => { log.rpc.push([fn, args]); return { data: rpc[fn] ?? null, error: null }; } };
}
function fakeNative() {
  const sent = [];
  return {
    sent,
    ready: () => true,
    send: async (d, n) => { sent.push({ device: d.id, notification: n }); return { ok: true }; },
    sendSignal: async (d, s, owner) => { sent.push({ device: d.id, signal: s, owner }); return { ok: true }; },
  };
}

// ---------------------------------------------------------------- D7/D16 the answer
const GESTURES = {
  abbraccio: ['Bea: Ti mando un abbraccio', 'Bea: Sending you a hug'],
  riposati: ['Bea: Riposati', 'Bea: Get some rest'],
  respira: ['Bea: Respira, ci sono io', 'Bea: Breathe, I’m here'],
  cuore: ['Bea ti manda un cuore ♡', 'Bea sends you a heart ♡'],
  festa: ['Bea: 🎉', 'Bea: 🎉'],
  forza: ['Bea: Forza!', 'Bea: You’ve got this!'],
  spacca: ['Bea: Spacca tutto!', 'Bea: Crush it!'],
  buon_viaggio: ['Bea: Buon viaggio', 'Bea: Safe travels'],
  buon_appetito: ['Bea: Buon appetito', 'Bea: Enjoy your meal'],
};

test('the answer reads like a Ti penso, in the recipient\'s language; it opens Oggi', () => {
  assert.deepEqual([...core.STATUS_GESTURES].sort(), Object.keys(GESTURES).sort());
  for (const [gesture, [it, en]] of Object.entries(GESTURES)) {
    const a = core.buildNotification('status_response', { senderName: 'Bea', gesture, locale: 'it' });
    const b = core.buildNotification('status_response', { senderName: 'Bea', gesture, locale: 'en' });
    assert.equal(a.body, it);
    assert.equal(b.body, en);
    assert.equal(a.title, 'US. · Come stai');
    assert.equal(b.title, 'US. · How are you');
    for (const n of [a, b]) {
      assert.equal(n.target, 'home');
      assert.equal(n.channel, 'partner');
      assert.equal(n.urgency, 'high');
      assert.equal(n.gesture, gesture);
    }
  }
  const unknown = core.buildNotification('status_response', { senderName: 'Bea', gesture: 'urlo' });
  assert.equal(unknown.body, 'Bea ha risposto al tuo Come stai ♡');
  assert.equal(unknown.gesture, null);
  assert.equal(core.buildNotification('think', { senderName: 'Bea', messageId: S }).gesture, null, 'only on the answer');
});

test('Android: the gesture is the kind\'s suffix; no name, text or id on FCM', () => {
  for (const gesture of Object.keys(GESTURES)) {
    const n = core.buildNotification('status_response', { senderName: 'PRIVATE_NAME', gesture });
    const { message } = transport.fcmMessage(n, device('d', B));
    assert.deepEqual(message.data, { v: '2', installation: INSTALLATION, k: `status_${gesture}` });
    assert.equal(transport.ANDROID_STATUS_KINDS[gesture], `status_${gesture}`);
    assert.doesNotMatch(JSON.stringify(message), /PRIVATE_NAME|Ti mando|Sending/);
  }
  // No gesture or a forged one: the generic kind, never the forged text.
  const forged = transport.fcmMessage({ ...core.buildNotification('status_response', { senderName: 'B' }), gesture: '<b>x</b>' }, device('d', B)).message;
  assert.deepEqual(forged.data, { v: '2', installation: INSTALLATION, k: 'status_reply' });
  // A gesture on another type never changes its kind.
  const think = transport.fcmMessage({ ...core.buildNotification('think', { senderName: 'B', messageId: S }), gesture: 'cuore' }, device('d', B)).message;
  assert.equal(think.data.k, 'think');
  const notices = read('native-plugins/us-push-support/android/src/main/java/com/usapp/pushsupport/UsPushNotices.java');
  assert.match(notices, /case "status_abbraccio":\s*return status\(en, who \+ ": Ti mando un abbraccio", who \+ ": Sending you a hug"\);/);
});

test('the answer is read back from the partner\'s row: fresh, the state still showing, one per state', async () => {
  const setAt = hoursFrom(-1);
  const row = { user_id: B, couple_id: C1, status: 'giu', set_at: setAt, expires_at: hoursFrom(11), reply_gesture: 'abbraccio', reply_at: hoursFrom(-0.05) };
  const event = await comeStai.statusResponseEvent(fakeAdmin({ tables: { member_status: [row] } }), { sender: { id: F, couple_id: C1 }, partner: { id: B }, now: NOW });
  assert.deepEqual(event, { gesture: 'abbraccio', setAt, dedupeKey: `status-response:${B}:${Date.parse(setAt)}` });
  const ask = (patch, extra = {}) => comeStai.statusResponseEvent(fakeAdmin({ tables: { member_status: [{ ...row, ...patch }] } }), { sender: { id: F, couple_id: C1 }, partner: { id: B }, now: NOW, ...extra });
  assert.equal((await ask({ reply_gesture: null, reply_at: null })).reason, 'no-answer');
  assert.equal((await ask({ reply_at: hoursFrom(-1) })).reason, 'stale-answer', 'an old answer is never pushed again');
  assert.equal((await ask({ expires_at: hoursFrom(-0.1) })).reason, 'no-status');
  assert.equal((await ask({ couple_id: '22222222-2222-4222-8222-222222222222' })).reason, 'no-status');
  assert.equal((await ask({ reply_gesture: 'urlo' })).reason, 'no-answer');
  assert.equal((await comeStai.statusResponseEvent(fakeAdmin(), { sender: { id: F, couple_id: C1 }, partner: null })).reason, 'no-recipient');
});

test('send-web-push: status_response and partner_status are known; the answer always goes, with the think switch', () => {
  const fn = read('supabase/functions/send-web-push/index.ts');
  assert.match(fn, /const EVENT_TYPES: EventType\[\] = \[[^\]]*"partner_status", "status_response", "play_invite"\];/);
  const answer = fn.slice(fn.indexOf('if (type === "status_response")'), fn.indexOf('if (!recipientIds.length || !compose)'));
  assert.match(answer, /statusResponseEvent\(admin, \{ sender, partner \}\)/);
  assert.match(answer, /buildNotification\("status_response", \{ senderName: sender\.display_name, gesture: event\.gesture, locale \}\)/);
  assert.match(answer, /prefKey = "think";/);
  assert.doesNotMatch(answer, /isQuiet|quietRecipients/, 'never held back by work or study');
  const status = fn.slice(fn.indexOf('if (type === "partner_status")'), fn.indexOf('if (type === "think")'));
  assert.match(status, /dispatchPartnerStatus\(admin, \{ sender, partner, native: nativeTransport\(\) \}\)/);
  assert.doesNotMatch(status, /webpush|deliverNotification/);
});

// ---------------------------------------------------------------- D13 the widget signal
test('signal status: the twelve keys, the form and the server\'s two instants; nothing else, nothing half', () => {
  const at = '2026-11-27T12:00:00.123456+00:00', until = '2026-11-28T00:00:00.123456+00:00';
  const sig = signals.statusSignal({ status: 'lavoro', form: 'f', set_at: at, expires_at: until, user_id: B, display_name: 'PRIVATE' });
  assert.deepEqual({ ...sig }, { s: 'status', status: 'lavoro', form: 'f', at: '2026-11-27T12:00:00.123Z', until: '2026-11-28T00:00:00.123Z' });
  const { message } = transport.fcmSignalMessage(sig, device('d', B));
  assert.deepEqual(message.data, { v: '3', installation: INSTALLATION, s: 'status', status: 'lavoro', form: 'f', at: '2026-11-27T12:00:00.123Z', until: '2026-11-28T00:00:00.123Z' });
  assert.deepEqual(message.android, { priority: 'NORMAL', ttl: '43200s', collapse_key: 'us-widget-status' });
  assert.doesNotMatch(JSON.stringify(message), /PRIVATE|"notification"|"title"|"body"|"k"/);
  const owner = 'a'.repeat(64);
  const apns = transport.apnsSignalRequest(sig, owner, 1_700_000_000_000);
  assert.deepEqual(apns.headers, { 'apns-push-type': 'background', 'apns-priority': '5', 'apns-expiration': String(1_700_000_000 + 43200), 'apns-collapse-id': 'us-widget-status' });
  assert.deepEqual(apns.body.us.widget, { ...sig });
  // No state, a broken one or a hostile one: "nothing to show", never half a state.
  assert.deepEqual({ ...signals.statusSignal(null) }, { s: 'status', status: '', form: '', at: '', until: '' });
  assert.deepEqual({ ...transport.widgetSignal({ s: 'status', status: 'arrabbiato', form: 'x', at, until }) }, { s: 'status', status: '', form: '', at: '', until: '' });
  assert.deepEqual({ ...transport.widgetSignal({ s: 'status', status: 'felice', form: 'm', at: 'ieri', until }) }, { s: 'status', status: '', form: 'm', at: '', until: '' });
});

test('partner_status: the state read back from the server, one signal per change, Android and iPhone', async () => {
  const updated = hoursFrom(-0.01);
  const tables = {
    member_status: [{ user_id: F, couple_id: C1, status: 'viaggio', form: null, set_at: updated, expires_at: hoursFrom(12), updated_at: updated }],
    device_push_tokens: [device('b-android', B), device('b-iphone', B, 'apns'), device('f-own', F)],
  };
  const admin = fakeAdmin({ tables });
  const native = fakeNative();
  const res = await signals.dispatchPartnerStatus(admin, { sender: { id: F, couple_id: C1 }, partner: { id: B }, native });
  assert.deepEqual(res, { delivered: 2, failed: 0 });
  assert.deepEqual(native.sent.map((s) => s.device), ['b-android', 'b-iphone']);
  assert.equal(native.sent[0].signal.status, 'viaggio');
  assert.equal(native.sent[1].owner, await signals.widgetOwnerHash(B));
  assert.deepEqual(admin.log.claims.map((c) => [c.dedupe_key, c.event_type]), [[`partner-status:${F}:${Date.parse(updated)}`, 'partner_status']]);
  assert.deepEqual(await signals.dispatchPartnerStatus(admin, { sender: { id: F, couple_id: C1 }, partner: { id: B }, native }), { delivered: 0, failed: 0, deduplicated: true });
  assert.deepEqual(await signals.dispatchPartnerStatus(fakeAdmin(), { sender: { id: F, couple_id: C1 }, partner: { id: B }, native }), { delivered: 0, reason: 'no-change' });
});

// ---------------------------------------------------------------- D11/D19 work and study
test('quiet: lavoro and studio still showing; anything else, expired, or not known is not quiet', async () => {
  const rows = [
    { user_id: F, status: 'lavoro', expires_at: hoursFrom(2) },
    { user_id: B, status: 'studio', expires_at: hoursFrom(-0.1) },
  ];
  assert.deepEqual([...(await comeStai.quietRecipients(fakeAdmin({ tables: { member_status: rows } }), [F, B], NOW))], [F]);
  assert.equal(comeStai.isQuietRow({ status: 'palestra', expires_at: hoursFrom(2) }, NOW), false);
  assert.equal(comeStai.isQuietRow({ status: 'studio', expires_at: hoursFrom(2) }, NOW), true);
  assert.equal(await comeStai.isQuiet(fakeAdmin({ tables: { member_status: rows }, failing: ['member_status'] }), F, NOW), false, 'a failed read never holds a push back');
  assert.equal(await comeStai.isQuiet({ from() { throw new Error('boom'); } }, F, NOW), false);
});

const gameTables = (status) => ({
  profiles: [{ id: F, couple_id: C1, role: 'francesco', display_name: 'Francesco', locale: 'it' }, { id: B, couple_id: C1, role: 'beatrice', display_name: 'Bea', locale: 'it' }],
  notification_preferences: [],
  game_sessions: [{ id: S, couple_id: C1, game_family: 'ridete' }],
  member_status: status ? [{ user_id: B, status, expires_at: hoursFrom(3) }] : [],
  device_push_tokens: [device('b-android', B)],
  push_subscriptions: [],
});
const waiting = { kind: 'game_waiting', couple_id: C1, recipient_role: 'beatrice', sender_role: 'francesco', dedupe_key: `game-waiting:${S}:beatrice` };

test('Gioca waits while the recipient is at work; no key is claimed; once it is over the worker sends it', async () => {
  const claimed = new Set();
  const native = fakeNative();
  const busy = fakeAdmin({ tables: gameTables('lavoro'), claimed });
  assert.equal((await game.deliverGamePush(busy, waiting, { native, now: NOW })).outcome, 'deferred');
  assert.deepEqual(busy.log.claims, [], 'the key stays free');
  assert.equal(native.sent.length, 0);
  // Later the recovery worker finds it again (game_v2_pending_pushes) and the state is over.
  const free = fakeAdmin({ tables: gameTables('felice'), claimed, rpc: { game_v2_pending_pushes: [waiting] } });
  const run = await game.dispatchGameV2PendingPushes(free, { native, now: new Date('2026-11-27T16:00:00Z') });
  assert.equal(run.delivered, 1);
  assert.deepEqual(free.log.claims.map((c) => c.dedupe_key), [waiting.dedupe_key]);
  assert.match(native.sent[0].notification.body, /Francesco ha giocato a «Ridete»: tocca a te/);
  // Studying holds it too; an expired state does not.
  assert.equal((await game.deliverGamePush(fakeAdmin({ tables: gameTables('studio') }), waiting, { native: fakeNative(), now: NOW })).outcome, 'deferred');
  const expired = gameTables('lavoro');
  expired.member_status[0].expires_at = hoursFrom(-1);
  assert.equal((await game.deliverGamePush(fakeAdmin({ tables: expired }), waiting, { native: fakeNative(), now: NOW })).outcome, 'delivered');
});

test('the evening reminder of the question waits for work or study, and goes at the next run', async () => {
  const evening = new Date('2026-11-27T19:40:00Z'); // 20:40 in Rome
  const tables = (status) => ({
    daily_questions: [{ id: Q, question_date: '2026-11-27' }],
    profiles: [{ id: F, couple_id: C1, display_name: 'Francesco', locale: 'it' }, { id: B, couple_id: C1, display_name: 'Bea', locale: 'it' }],
    notification_preferences: [],
    daily_answers: [{ user_id: F, question_id: Q, created_at: '2026-11-27T10:00:00Z' }],
    member_status: status ? [{ user_id: B, status, expires_at: hoursFrom(1, evening) }] : [],
    device_push_tokens: [device('b-android', B)],
    push_subscriptions: [],
    push_event_log: [],
  });
  const claimed = new Set();
  const busy = fakeAdmin({ tables: tables('studio'), claimed });
  const first = await daily.dispatchDailyQuestionPush(busy, { now: evening, native: fakeNative() });
  assert.deepEqual(first.evening.recipients, [{ userId: B, outcome: 'deferred' }]);
  assert.ok(!busy.log.claims.some((c) => String(c.dedupe_key).startsWith('daily-evening:')), 'no evening key claimed');
  const native = fakeNative();
  const later = await daily.dispatchDailyQuestionPush(fakeAdmin({ tables: tables(null), claimed }), { now: new Date('2026-11-27T19:50:00Z'), native });
  assert.equal(later.evening.delivered, 1);
  assert.match(native.sent.find((s) => s.notification.type === 'daily_evening').notification.body, /Francesco ha già risposto/);
});

test('US vi ricorda: at work at 10, the line waits; from 11 to 21 it goes once the state is over, still one a day', async () => {
  const due = [
    { user_id: F, couple_id: C1, day: '2026-11-27', type: 'ricorda_birthday_week', vars: { name: 'Bea' } },
    { user_id: B, couple_id: C1, day: '2026-11-27', type: 'ricorda_birthday_week', vars: { name: 'Francesco' } },
  ];
  const tables = {
    member_status: [{ user_id: F, status: 'lavoro', expires_at: hoursFrom(2) }],
    profiles: [{ id: F, locale: 'it' }, { id: B, locale: 'en' }],
    device_push_tokens: [device('df', F), device('db', B)],
    push_subscriptions: [],
    push_event_log: [],
  };
  const claimed = new Set();
  const native = fakeNative();
  const admin = fakeAdmin({ tables, claimed, rpc: { us_ricorda_push_due_v1: due } });
  const morning = await ricorda.runRicordaPushJob(admin, { slot: 'mattina', native, now: NOW });
  assert.deepEqual({ delivered: morning.delivered, deferred: morning.deferred }, { delivered: 1, deferred: 1 });
  assert.deepEqual(admin.log.claims.map((c) => c.dedupe_key), [ricorda.waitKey('mattina', F, '2026-11-27'), `us-ricorda:${B}:2026-11-27`]);
  assert.equal(native.sent.length, 1);
  // At 14 the state is still on: nothing yet.
  const still = await ricorda.runRicordaPushJob(admin, { slot: 'mattina', native, now: new Date(hoursFrom(1)), catchUp: true });
  assert.deepEqual({ due: still.due, delivered: still.delivered, deferred: still.deferred }, { due: 1, delivered: 0, deferred: 1 }, 'only who waited is looked at');
  // At 16 it is over: the line goes, once; B (already told) is not asked again.
  tables.member_status = [];
  const after = await ricorda.runRicordaPushJob(admin, { slot: 'mattina', native, now: new Date(hoursFrom(3)), catchUp: true });
  assert.deepEqual({ due: after.due, delivered: after.delivered }, { due: 1, delivered: 1 });
  assert.match(native.sent[1].notification.body, /compleanno di Bea/);
  const again = await ricorda.runRicordaPushJob(admin, { slot: 'mattina', native, now: new Date(hoursFrom(4)), catchUp: true });
  assert.equal(again.delivered, 0, 'one a day');
  // The hours: catch-up only between the two, never at night.
  assert.deepEqual(ricorda.ricordaCatchUp(10), []);
  assert.deepEqual(ricorda.ricordaCatchUp(11), ['mattina']);
  assert.deepEqual(ricorda.ricordaCatchUp(17), ['mattina']);
  assert.deepEqual(ricorda.ricordaCatchUp(18), []);
  assert.deepEqual(ricorda.ricordaCatchUp(19), ['mattina', 'sera']);
  assert.deepEqual(ricorda.ricordaCatchUp(21), ['mattina', 'sera']);
  for (const hour of [22, 23, 0, 7, 9]) assert.deepEqual(ricorda.ricordaCatchUp(hour), [], String(hour));
  const worker = read('supabase/functions/us-ricorda-push-worker/index.ts');
  assert.match(worker, /const catchUp = slot \|\| force \? \[\] : ricordaCatchUp\(hour\);/);
});

test('what always goes: Ti penso, Lasciato per te, post-it and the answers never ask about work', () => {
  for (const file of ['supabase/functions/_shared/think-web-push.ts', 'supabase/functions/_shared/left-for-you-push-core.mjs', 'supabase/functions/_shared/lavagna-push-core.mjs', 'supabase/functions/_shared/notification-core.mjs']) {
    assert.doesNotMatch(read(file), /come-stai-push-core|quietRecipients|isQuiet/, file);
  }
});
