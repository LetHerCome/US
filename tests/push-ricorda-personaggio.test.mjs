// Avvisi di US vi ricorda e personaggi sempre aggiornati (founder, 27/11/2026).
// Edge cores with fake admins and fake providers:
//  * the five «US vi ricorda» notifications (words, language, Android kinds),
//    the worker (two daytime hours, one a day per person);
//  * the silent widget signals (FCM v3: look or clear, nothing private), the
//    look read back from the server, the partner's phones after a leave.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import * as core from '../supabase/functions/_shared/notification-core.mjs';
import * as transport from '../supabase/functions/_shared/native-push-transport.mjs';
import * as ricorda from '../supabase/functions/_shared/us-ricorda-push-core.mjs';
import * as signals from '../supabase/functions/_shared/widget-signal-core.mjs';
import { LEAVE_WORD, handleLeaveCouple } from '../supabase/functions/_shared/s32-leave-couple-core.mjs';

const require = createRequire(import.meta.url);
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const F = 'aaaaaaaa-0000-4000-8000-00000000000f';
const B = 'aaaaaaaa-0000-4000-8000-00000000000b';
const INSTALLATION = '8f248b96-e0af-475b-8b87-0f22236ed062';
const FCM_TOKEN = `fcm:${'a'.repeat(60)}`;
const device = (id, userId, provider = 'fcm', coupleId = C1) => ({
  id, user_id: userId, couple_id: coupleId, installation_id: INSTALLATION, token: provider === 'fcm' ? FCM_TOKEN : 'ab'.repeat(32),
  platform: provider === 'fcm' ? 'android' : 'ios', provider, apns_environment: provider === 'apns' ? 'production' : null,
});

// A tiny admin: tables as arrays, the dedupe claims, an rpc answer.
function fakeAdmin({ tables = {}, rpc = {}, claimed = new Set() } = {}) {
  const log = { claims: [], released: [], deletedDevices: [], rpc: [] };
  const from = (name) => {
    const filters = [];
    const rows = () => (tables[name] || []).filter((row) => filters.every((f) => f(row)));
    const builder = {
      select() { return builder; },
      eq(column, value) { filters.push((row) => row[column] === value); return builder; },
      neq(column, value) { filters.push((row) => row[column] !== value); return builder; },
      in(column, values) { filters.push((row) => values.includes(row[column])); return builder; },
      maybeSingle() { return Promise.resolve({ data: rows()[0] || null, error: null }); },
      then(resolve, reject) { return Promise.resolve({ data: rows(), error: null }).then(resolve, reject); },
      insert(row) {
        if (claimed.has(row.dedupe_key)) return Promise.resolve({ error: { code: '23505' } });
        claimed.add(row.dedupe_key); log.claims.push(row);
        return Promise.resolve({ error: null });
      },
      delete() {
        return { eq: (column, value) => {
          if (name === 'push_event_log') { claimed.delete(value); log.released.push(value); }
          if (name === 'device_push_tokens') log.deletedDevices.push(value);
          return Promise.resolve({ error: null });
        } };
      },
    };
    return builder;
  };
  return { from, log, claimed, rpc: async (fn, args) => { log.rpc.push([fn, args]); return { data: rpc[fn] ?? null, error: null }; } };
}
function fakeNative({ ready = ['fcm', 'apns'], outcome = {} } = {}) {
  const sent = [];
  return {
    sent,
    ready: (provider) => ready.includes(provider),
    send: async (d, n) => { sent.push({ device: d.id, notification: n }); return outcome[d.id] ? { ok: false, outcome: outcome[d.id] } : { ok: true }; },
    sendSignal: async (d, s, owner) => { sent.push({ device: d.id, signal: s, owner }); return outcome[d.id] ? { ok: false, outcome: outcome[d.id] } : { ok: true }; },
  };
}

// ---------------------------------------------------------------- the words
test('the five lines: short, warm, gender-neutral, Italian and English, one tag, they open Oggi', () => {
  const cases = [
    ['ricorda_birthday_week', { name: 'Bea' }, /Tra una settimana è il compleanno di Bea/, /Bea’s birthday is a week away/],
    ['ricorda_birthday', { name: 'Bea' }, /Oggi è il compleanno di Bea/, /Today is Bea’s birthday/],
    ['ricorda_anniversary_week', { years: 1 }, /Tra una settimana fate un anno insieme/, /One week until one year together/],
    ['ricorda_anniversary_week', { years: 3 }, /fate 3 anni insieme/, /3 years together/],
    ['ricorda_year_ago', { source: 'moment', place: 'Padova' }, /Un anno fa, oggi, eravate a Padova/, /you were in Padova/],
    ['ricorda_year_ago', { source: 'moment' }, /Un anno fa, oggi: un vostro ricordo/, /one of your memories/],
    ['ricorda_year_ago', { source: 'meet', title: 'Cena da noi' }, /«Cena da noi»/, /“Cena da noi”/],
    ['ricorda_year_ago', { source: 'idea', title: 'Il lago' }, /avete fatto «Il lago»/, /you did “Il lago”/],
    ['ricorda_bacheca', { reason: 'un_anno_fa', place: 'Padova' }, /In bacheca c’è Padova, un anno fa/, /On your board: Padova/],
    ['ricorda_bacheca', { reason: 'traguardo', count: 50 }, /50 ricordi/, /50 memories/],
    ['ricorda_bacheca', { reason: 'settimana' }, /il ricordo della settimana/, /memory of the week/],
    ['ricorda_bacheca', { reason: 'tenuta' }, /una cosa vostra/, /Something of yours/],
  ];
  for (const [type, args, it, en] of cases) {
    const a = core.buildNotification(type, { ...args, locale: 'it' });
    const b = core.buildNotification(type, { ...args, locale: 'en' });
    assert.match(a.body, it, type);
    assert.match(b.body, en, type);
    for (const n of [a, b]) {
      assert.equal(n.tag, 'us-ricorda');
      assert.equal(n.target, 'home');
      assert.equal(n.channel, 'reminders');
      assert.ok(n.body.length <= 120, `${type}: short (${n.body.length})`);
    }
    // No «pronto/a», «visti», «stati»: the same line for whoever reads it.
    assert.doesNotMatch(a.body, /\b(pronto|pronta|visti|viste|stati|state|andati|contento|contenta)\b/i, type);
  }
  assert.equal(core.buildNotification('ricorda_bacheca', { reason: 'settimana' }).title, 'US. · Bacheca');
  assert.match(core.buildNotification('ricorda_birthday', {}).body, /compleanno di la tua persona/, 'no name: the calm default');
});

test('Android: each line has its kind, the phone writes it with the name it already has', () => {
  for (const type of ricorda.RICORDA_TYPES) {
    assert.ok(core.NOTIFICATION_TYPES.includes(type), type);
    const kind = transport.ANDROID_NOTICE_KINDS[type];
    assert.ok(kind, type);
    const { message } = transport.fcmMessage(core.buildNotification(type, { name: 'PRIVATE_NAME', place: 'PRIVATE_PLACE', title: 'PRIVATE_TITLE', reason: 'un_anno_fa' }), device('d', F));
    assert.deepEqual(message.data, { v: '2', installation: INSTALLATION, k: kind });
    assert.doesNotMatch(JSON.stringify(message), /PRIVATE_/);
  }
  const notices = read('native-plugins/us-push-support/android/src/main/java/com/usapp/pushsupport/UsPushNotices.java');
  assert.match(notices, /case "birthday_week":[\s\S]*?"Tra una settimana è il compleanno di " \+ whom/);
  assert.match(notices, /case "bacheca":[\s\S]*?"ricordi"\);/, 'the bacheca opens Ricordi');
});

// ---------------------------------------------------------------- the worker
test('worker: only at 10 and 18 in Rome (never at night), by hand on staging', () => {
  assert.equal(ricorda.ricordaSlot(10), 'mattina');
  assert.equal(ricorda.ricordaSlot(18), 'sera');
  for (const hour of [0, 3, 9, 11, 17, 19, 22, 23]) assert.equal(ricorda.ricordaSlot(hour), null, String(hour));
  assert.equal(ricorda.ricordaSlot(3, 'sera'), 'sera');
  assert.equal(ricorda.ricordaSlot(10, 'notte'), null);
  assert.equal(ricorda.romeHour(new Date('2026-11-27T09:30:00Z')), 10, 'CET');
  assert.equal(ricorda.romeHour(new Date('2026-07-27T08:30:00Z')), 10, 'CEST');
});

test('worker: one push a day per person, in their language; a second run the same day says nothing', async () => {
  const due = [
    { user_id: F, couple_id: C1, day: '2026-11-25', type: 'ricorda_birthday_week', vars: { name: 'Beatrice' } },
    { user_id: B, couple_id: C1, day: '2026-11-25', type: 'ricorda_year_ago', vars: { source: 'moment', place: 'Padova', path: 'c/secret.webp' } },
    { user_id: 'not-a-uuid', couple_id: C1, day: '2026-11-25', type: 'ricorda_birthday', vars: {} },
    { user_id: F, couple_id: C1, day: '2026-11-25', type: 'not_a_line', vars: {} },
  ];
  const claimed = new Set();
  const admin = fakeAdmin({
    claimed,
    rpc: { us_ricorda_push_due_v1: due },
    tables: { profiles: [{ id: F, locale: 'it' }, { id: B, locale: 'en' }], device_push_tokens: [device('df', F), device('db', B)], push_subscriptions: [] },
  });
  const native = fakeNative();
  const result = await ricorda.runRicordaPushJob(admin, { slot: 'mattina', web: null, native });
  assert.deepEqual(admin.log.rpc[0], ['us_ricorda_push_due_v1', { p_slot: 'mattina' }]);
  assert.equal(result.delivered, 2);
  assert.deepEqual(admin.log.claims.map((c) => c.dedupe_key), [`us-ricorda:${F}:2026-11-25`, `us-ricorda:${B}:2026-11-25`]);
  assert.match(native.sent[0].notification.body, /compleanno di Beatrice/);
  assert.match(native.sent[1].notification.body, /A year ago today you were in Padova/);
  assert.doesNotMatch(JSON.stringify(native.sent), /secret\.webp/);
  const again = await ricorda.runRicordaPushJob(admin, { slot: 'sera', native });
  assert.equal(again.delivered, 0, 'the evening finds them already told');
});

// ---------------------------------------------------------------- the signals
test('signal: FCM v3 carries the look or nothing; an old app (v2 only) drops it', () => {
  const look = signals.lookSignal({ role: 'beatrice', person_color: 'menta', character_shape: 'goccia', character_head: 'corona', character_face: 'sole', display_name: 'PRIVATE_NAME', avatar_path: 'PRIVATE_PATH' });
  assert.deepEqual({ ...look }, { s: 'look', shape: 'goccia', head: 'corona', face: 'sole', color: '#6fd6c8', day: '#8ac6ba' });
  const { message } = transport.fcmSignalMessage(look, device('d', B));
  assert.deepEqual(Object.keys(message).sort(), ['android', 'data', 'token']);
  assert.deepEqual(message.data, { v: '3', installation: INSTALLATION, s: 'look', shape: 'goccia', head: 'corona', face: 'sole', color: '#6fd6c8', day: '#8ac6ba' });
  assert.deepEqual(message.android, { priority: 'NORMAL', ttl: '86400s', collapse_key: 'us-widget-look' });
  assert.doesNotMatch(JSON.stringify(message), /PRIVATE_|"notification"|"title"|"body"|"k"/);
  const clear = transport.fcmSignalMessage(signals.CLEAR_SIGNAL, device('d', B)).message;
  assert.deepEqual(clear.data, { v: '3', installation: INSTALLATION, s: 'clear' });
  assert.deepEqual(clear.android, { priority: 'HIGH', ttl: '604800s', collapse_key: 'us-widget-clear' });
  // Anything off the allow-list is emptied or refused.
  assert.deepEqual({ ...transport.widgetSignal({ s: 'look', shape: '<script>', head: 'x', face: 'gala', color: 'red', day: '#FFFFFF' }) },
    { s: 'look', shape: '', head: '', face: 'gala', color: '', day: '#ffffff' });
  assert.throws(() => transport.widgetSignal({ s: 'photo' }), /widget_signal_invalid/);
  assert.throws(() => transport.fcmSignalMessage(look, { token: FCM_TOKEN }), /native_installation_missing/);
  // The service: v3 only reaches the widget bridge, behind the same installation gate.
  const service = read('android/app/src/main/java/com/usapp/us/UsGuardedMessagingService.java');
  const body = service.slice(service.indexOf('public void onMessageReceived('));
  assert.ok(body.indexOf('"3".equals(data.get("v"))') >= 0 && body.indexOf('"3".equals(data.get("v"))') < body.indexOf('!"2".equals(data.get("v"))'));
  assert.match(service, /UsPushOwnerGate\.postIfCurrent\(this, data\.get\("installation"\), \(\) -> changed\[0\] = UsWidgetSignals\.apply\(this, data\)\)/);
});

test('signal: APNs background push ready for iOS, but iOS stays off until the app declares it', () => {
  const owner = 'a'.repeat(64);
  const request = transport.apnsSignalRequest(signals.CLEAR_SIGNAL, owner, 1_700_000_000_000);
  assert.deepEqual(request.headers, { 'apns-push-type': 'background', 'apns-priority': '5', 'apns-expiration': String(1_700_000_000 + 604800), 'apns-collapse-id': 'us-widget-clear' });
  assert.deepEqual(request.body, { aps: { 'content-available': 1 }, us: { v: 3, owner, widget: { s: 'clear' } } });
  assert.throws(() => transport.apnsSignalRequest(signals.CLEAR_SIGNAL, ''), /widget_owner_missing/);
  assert.equal(signals.IOS_WIDGET_SIGNALS, false);
  assert.doesNotMatch(read('ios/App/App/Info.plist'), /UIBackgroundModes/);
});

test('signal: the colours and the default shapes are the app\'s own', () => {
  const colors = require('../person-colors.js');
  for (const [id, [night, day]] of Object.entries(signals.PERSON_PALETTE)) {
    assert.equal(night, colors.PALETTE[id], id);
    assert.equal(day, colors.PALETTE_GIORNO[id], id);
  }
  assert.deepEqual(Object.keys(signals.PERSON_PALETTE).sort(), Object.keys(colors.PALETTE).sort());
  assert.deepEqual({ ...signals.lookSignal({ role: 'francesco' }) }, { s: 'look', shape: 'palla', head: '', face: '', color: '#ff7c96', day: '#e7a1ab' });
  assert.deepEqual([signals.lookSignal({ role: 'beatrice' }).shape, signals.lookSignal({ role: 'beatrice', person_color: 'cielo' }).color], ['quadrato', '#6f9bff']);
  const personaggi = read('personaggi.js');
  assert.match(personaggi, /role === 'beatrice' \? 'quadrato' : 'palla'/);
});

test('partner_look: the look is read back from the server; one signal per revision; Android only', async () => {
  const profiles = [
    { id: F, couple_id: C1, role: 'francesco', person_color: 'blu', character_shape: 'nuvola', character_head: null, character_face: 'occhiali' },
    { id: B, couple_id: C1, role: 'beatrice', person_color: null, character_shape: null, character_head: null, character_face: null },
  ];
  const tables = {
    profiles,
    couple_sync: [{ couple_id: C1, kind: 'looks', revision: 4 }],
    device_push_tokens: [device('b-android', B), device('b-iphone', B, 'apns'), device('b-old-couple', B, 'fcm', C2), device('f-own', F)],
  };
  const admin = fakeAdmin({ tables });
  const native = fakeNative();
  const sender = { id: F, couple_id: C1 };
  const res = await signals.dispatchPartnerLook(admin, { sender, partner: { id: B }, native });
  assert.deepEqual(res, { delivered: 1, failed: 0 });
  assert.deepEqual(native.sent.map((s) => s.device), ['b-android'], 'not the iPhone (off), not another couple, not the sender');
  assert.deepEqual({ ...native.sent[0].signal }, { s: 'look', shape: 'nuvola', head: '', face: 'occhiali', color: '#6f9bff', day: '#8faad6' });
  assert.deepEqual(admin.log.claims.map((c) => [c.dedupe_key, c.event_type]), [[`partner-look:${F}:4`, 'partner_look']]);
  assert.deepEqual(await signals.dispatchPartnerLook(admin, { sender, partner: { id: B }, native }), { delivered: 0, failed: 0, deduplicated: true });
  // No change ever recorded, no partner, a dead token.
  assert.deepEqual(await signals.dispatchPartnerLook(fakeAdmin({ tables: { ...tables, couple_sync: [] } }), { sender, partner: { id: B }, native }), { delivered: 0, reason: 'no-change' });
  assert.deepEqual(await signals.dispatchPartnerLook(admin, { sender, partner: null, native }), { delivered: 0, reason: 'no-recipient' });
  const dead = fakeAdmin({ tables: { ...tables, couple_sync: [{ couple_id: C1, kind: 'looks', revision: 5 }] } });
  const r = await signals.dispatchPartnerLook(dead, { sender, partner: { id: B }, native: fakeNative({ outcome: { 'b-android': 'invalid-token' } }) });
  assert.deepEqual(r, { delivered: 0, failed: 1 });
  assert.deepEqual(dead.log.deletedDevices, ['b-android']);
  assert.deepEqual(dead.log.released, [`partner-look:${F}:5`], 'nothing delivered: the revision can be retried');
  assert.equal((await signals.deliverWidgetSignal(admin, { signal: signals.CLEAR_SIGNAL, recipientIds: [B], native: fakeNative({ ready: [] }) })).reason, 'transport-unconfigured');
});

test('send-web-push: partner_look is a known event and never a Web Push', () => {
  const fn = read('supabase/functions/send-web-push/index.ts');
  assert.match(fn, /const EVENT_TYPES: EventType\[\] = \[[^\]]*"partner_look"[^\]]*\];/);
  const branch = fn.slice(fn.indexOf('if (type === "partner_look")'), fn.indexOf('if (type === "think")'));
  assert.match(branch, /dispatchPartnerLook\(admin, \{ sender, partner, native: nativeTransport\(\) \}\)/);
  assert.doesNotMatch(branch, /webpush|deliverNotification/);
});

test('the app: the couple_sync looks signal reads the looks again; my own change tells the partner; the switch is in Notifiche', () => {
  const app = read('app.js');
  const sync = app.slice(app.indexOf('function usOnCoupleSync('), app.indexOf('function startUsRealtime('));
  assert.match(sync, /if\(kind==='looks'\)return refreshUsCoupleLooks\(\);/);
  const hydrate = app.slice(app.indexOf('async function hydrateUsCoupleContext('), app.indexOf('const USC_LOOK_FIELDS='));
  assert.match(hydrate, /const mineWas=uscLookKey\(usCoupleContextState\.profiles\.filter\(row=>row\.id===profile\.id\)\);/);
  assert.match(hydrate, /if\(mineWas!=='\[\]'&&mineWas!==uscLookKey\([^)]*\)\)\)sendWebPushEvent\('partner_look'\);/, 'only a real change of my own look, never the first read');
  const settings = read('settings.js');
  assert.match(settings, /preferenceToggle\('ricorda','US vi ricorda',p\.ricorda!==false\)/);
  assert.ok(settings.indexOf("preferenceToggle('ricorda'") < settings.indexOf('${vociToggle('), 'next to the others, before the voices');
  assert.match(read('i18n-en.js'), /'US vi ricorda': 'US remembers'/);
});

// ---------------------------------------------------------------- leaving
const UID = 'e8c90d50-81e9-4a0d-beeb-5886c63c4963';
const PARTNER = '01d5fe3d-1e8e-4872-b453-01918de88893';
const COUPLE = '46155127-5742-42d0-8195-5f6d0992ae7b';
const NOW = 1_800_000_000;
const jwt = () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64({ sub: UID, amr: [{ method: 'password', timestamp: NOW - 30 }] })}.c2ln`;
};
function leaveClient({ dbError = null } = {}) {
  const profiles = [{ id: UID, couple_id: COUPLE }, { id: PARTNER, couple_id: COUPLE }];
  const admin = fakeAdmin({ tables: { profiles } });
  return {
    ...admin,
    auth: { async getUser() { return { data: { user: { id: UID } }, error: null }; } },
    async rpc(fn) {
      if (fn === 's32_leave_couple') {
        if (dbError) return { data: null, error: dbError };
        profiles[0].couple_id = null;
        return { data: { status: 'db_done', couple_id: COUPLE, mode: 'departed', state: 'db_done', storage_prefix: `${COUPLE}/${UID}/`, keep_paths: [] }, error: null };
      }
      if (fn === 's32_mark_couple_departure') return { data: { ok: true }, error: null };
      throw new Error(`unexpected rpc ${fn}`);
    },
    storage: { from() { return { async list() { return { data: [], error: null }; }, async remove() { return { data: [], error: null }; } }; } },
  };
}
const leave = (client, notifyPartnerLeft) => {
  const logs = [];
  return handleLeaveCouple({
    method: 'POST', origin: 'https://us-a33.pages.dev', authorization: `Bearer ${jwt()}`,
    readBody: async () => ({ confirm: LEAVE_WORD, channel: 'app' }),
    env: { US_LEAVE_COUPLE_ENABLED: 'true' }, nowSeconds: NOW, createClient: () => client, log: (e) => logs.push(e), notifyPartnerLeft,
  }).then((res) => ({ ...res, logs }));
};

test('leaving: who stays is told after the leave, never before it, and a failure never blocks it', async () => {
  const told = [];
  const res = await leave(leaveClient(), async (args) => { told.push({ coupleId: args.coupleId, partnerIds: args.partnerIds }); return { delivered: 1 }; });
  assert.equal(res.status, 200);
  assert.deepEqual(told, [{ coupleId: COUPLE, partnerIds: [PARTNER] }]);
  assert.ok(res.logs.some((e) => e.step === 'partner_widgets' && e.outcome === 'ok'));
  assert.doesNotMatch(JSON.stringify(res.logs), new RegExp(`${PARTNER}|${COUPLE}`), 'no id in the logs');
  const failing = await leave(leaveClient(), async () => { throw new Error('fcm down'); });
  assert.equal(failing.status, 200);
  assert.ok(failing.logs.some((e) => e.step === 'partner_widgets' && e.outcome === 'error'));
  const nobody = [];
  const failed = await leave(leaveClient({ dbError: { message: 'not_in_couple' } }), async (a) => { nobody.push(a); });
  assert.equal(failed.status, 409);
  assert.deepEqual(nobody, [], 'the leave did not happen: nobody is told');
  for (const file of ['supabase/functions/leave-couple/index.ts', 'supabase/functions/delete-account/index.ts']) {
    assert.match(read(file), /notifyPartnerLeft\(client, \{ coupleId, partnerIds, native: nativeTransport\(\) \}\)/, file);
  }
  const deletion = read('supabase/functions/_shared/s32-account-deletion-core.mjs');
  const flow = deletion.slice(deletion.indexOf('export async function handleDeleteAccount('));
  assert.ok(flow.indexOf('partnersOf(client, uid)') < flow.indexOf("'s32_delete_account_data'"));
  assert.ok(flow.indexOf('tellPartnerWidgets(') > flow.indexOf("'s32_delete_account_data'"));
});

test('transport: sendSignal posts the v3 packet to FCM HTTP v1 with the shared token', async () => {
  transport.resetNativeTransportCache();
  const pair = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
  const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  const env = { FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'us-test-project', client_email: 'sender@us-test-project.iam.gserviceaccount.com', private_key: pem }) };
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }), { status: 200 });
    return new Response('{}', { status: 200 });
  };
  const t = transport.createNativeTransport({ config: transport.nativePushConfig((k) => env[k]), fetch, crypto: webcrypto });
  assert.deepEqual(await t.sendSignal(device('d1', B), signals.CLEAR_SIGNAL), { ok: true });
  const sent = JSON.parse(calls.at(-1).init.body).message;
  assert.deepEqual(sent.data, { v: '3', installation: INSTALLATION, s: 'clear' });
  assert.deepEqual(await t.sendSignal(device('i1', B, 'apns'), signals.CLEAR_SIGNAL), { ok: false, outcome: 'config' }, 'no APNs configured');
});
