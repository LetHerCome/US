// L'invito che si rinnova (founder, 27/11/2026, dal controllo generale): the code lasts 14 days
// instead of 48 hours; an expired code is made again by itself on the waiting screen; whoever
// waits can turn on the notifications there («Avvisami quando entra») and then gets a reminder
// to send the code again the day after and three days after the couple was made, at 18 in Rome.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadEdgeFunction, createFakeAdmin, createFakeWebPush } = require('./helpers/edge-function-harness');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const migration = (suffix) => read(`supabase/migrations/${fs.readdirSync(path.join(ROOT, 'supabase/migrations')).find((f) => f.endsWith(suffix))}`);

const WAITING = '00000000-0000-4000-8000-0000000000c1';
const LATE = '00000000-0000-4000-8000-0000000000c2';
const PAIRED = '00000000-0000-4000-8000-0000000000c3';
const OLD = '00000000-0000-4000-8000-0000000000c4';
const W = '00000000-0000-4000-8000-0000000000a1';
const L = '00000000-0000-4000-8000-0000000000a2';
const F = '00000000-0000-4000-8000-0000000000f1';
const B = '00000000-0000-4000-8000-0000000000b1';
const O = '00000000-0000-4000-8000-0000000000a3';
const sub = (id, user) => ({ id, user_id: user, endpoint: `https://push.example/${id}`, p256dh: 'p', auth_key: 'a' });

test('the code lasts 14 days: only the expiry of create_partner_invite changes', () => {
  const now = migration('_invito_14_giorni.sql');
  const mc2 = read('supabase/migrations/20261007201842_mc2_couple_invites.sql');
  const body = (sql) => sql.slice(sql.indexOf('language plpgsql volatile security definer set search_path = \'\'\nas $fn$\ndeclare uid uuid; cid uuid; slot text;'), sql.indexOf('$fn$;', sql.indexOf('create function public.create_partner_invite') >= 0 ? sql.indexOf('create function public.create_partner_invite') : sql.indexOf('create or replace function public.create_partner_invite')));
  assert.match(now, /create or replace function public\.create_partner_invite\(\) returns jsonb/);
  assert.equal(body(now), body(mc2).replace("interval '48 hours'", "interval '14 days'"));
  assert.ok(body(now).includes("interval '14 days'"));
});

test('the waiting screen: the code is made again once when it expired, and «Avvisami quando entra»', () => {
  const ob = read('onboarding.js'), html = read('index.html'), en = read('i18n-en.js');
  assert.ok(ob.includes("if(waiting&&active&&invite?.status==='expired'&&!state.busy&&!autoRenewed){autoRenewed=true;"));
  assert.ok(ob.includes('setTimeout(()=>run(()=>controller.generate()),0);'));
  assert.ok(ob.includes("let autoRenewed=false,notifyState='';"));
  assert.ok(ob.includes("if(notifyState){button.hidden=notifyState!=='inactive';return;}"), 'shown only while the notifications are off and not refused');
  assert.ok(ob.includes('const result=await notifications.enable();'), 'the OS asks after a tap, never by itself');
  assert.ok(html.includes('<button type="button" id="mc3Notify" class="us-ob-link us-ob-notify" hidden>Avvisami quando entra</button>'));
  assert.ok(html.includes('Il codice vale 14 giorni e resta qui finché non chiudi US.'));
  for (const it of ['Avvisami quando entra', 'Ti avviso quando entra ♡', 'Il codice era scaduto: eccone uno nuovo.', 'Il codice vale 14 giorni e resta qui finché non chiudi US. Uno nuovo annulla il precedente. Condividilo solo con la tua persona.']) {
    assert.ok(en.includes(`'${it}':`), it);
  }
});

test('the reminder: copy in both languages, opens US, Android writes its own line', async () => {
  const core = await import('../supabase/functions/_shared/notification-core.mjs');
  const one = core.buildNotification('invite_reminder', { day: 1, tag: 'invite-reminder-1' });
  const three = core.buildNotification('invite_reminder', { day: 3, tag: 'invite-reminder-3', locale: 'en' });
  assert.deepEqual([one.title, one.body, one.target, one.channel], ['US.', 'Il vostro spazio vi aspetta: manda il codice alla tua persona ♡', 'home', 'reminders']);
  assert.equal(three.body, 'Still waiting: send your person the code again. It lasts 14 days.');
  const { ANDROID_NOTICE_KINDS } = await import('../supabase/functions/_shared/native-push-transport.mjs');
  assert.equal(ANDROID_NOTICE_KINDS.invite_reminder, 'invite_reminder');
  const java = read('native-plugins/us-push-support/android/src/main/java/com/usapp/pushsupport/UsPushNotices.java');
  assert.ok(java.includes('case "invite_reminder":'));
  assert.ok(java.includes('"Il vostro spazio vi aspetta: manda il codice alla tua persona ♡"'));
});

test('Rome days and the hour', async () => {
  const job = await import('../supabase/functions/_shared/invite-reminder-job-core.mjs');
  assert.equal(job.romeDaysSince('2026-11-26T23:30:00Z', new Date('2026-11-27T17:00:00Z')), 0, '00:30 in Rome is already the 27th');
  assert.equal(job.romeDaysSince('2026-11-26T10:00:00Z', new Date('2026-11-27T17:00:00Z')), 1);
  assert.equal(job.romeDaysSince('nonsense'), -1);
  assert.equal(job.shouldRun(job.romeParts(new Date('2026-11-27T17:10:00Z'))), true, '18 in Rome');
  assert.equal(job.shouldRun(job.romeParts(new Date('2026-11-27T16:10:00Z'))), false);
  assert.equal(job.shouldRun({ hour: 3 }, true), true);
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
function world({ prefs = [] } = {}) {
  const admin = createFakeAdmin({
    tables: {
      couples: [
        { id: WAITING, created_at: '2026-11-26T09:00:00.000Z' }, // day 1 on 27/11
        { id: LATE, created_at: '2026-11-24T09:00:00.000Z' }, // day 3
        { id: PAIRED, created_at: '2026-11-26T09:00:00.000Z' }, // day 1, but two
        { id: OLD, created_at: '2026-11-25T09:00:00.000Z' }, // day 2: nothing
      ],
      profiles: [{ id: W, couple_id: WAITING, locale: null }, { id: L, couple_id: LATE, locale: 'en' }, { id: F, couple_id: PAIRED, locale: null }, { id: B, couple_id: PAIRED, locale: null }, { id: O, couple_id: OLD, locale: null }],
      notification_preferences: prefs,
      push_subscriptions: [sub('s-w', W), sub('s-l', L), sub('s-f', F), sub('s-b', B), sub('s-o', O)],
      push_event_log: [],
    },
    rpc: { get_internal_invite_reminder_cron_key: 'cron-ok', get_internal_vapid_private_key: 'vapid-private' },
  });
  return { admin, webpush: createFakeWebPush() };
}
async function run(w, iso, body = {}, key = 'cron-ok') {
  const fn = await loadEdgeFunction('invite-reminder-job', { admin: w.admin, webpush: w.webpush });
  return atInstant(iso, () => fn.call(new Request('https://x/functions/v1/invite-reminder-job', { method: 'POST', headers: { 'x-us-cron-key': key }, body: JSON.stringify(body) })));
}
const sent = (w) => w.webpush.sent.map((s) => [s.endpoint.replace('https://push.example/', ''), s.payload.body]);

test('the job: day 1 and day 3 at 18, only whoever waits alone, once, with the cron key', async () => {
  const w = world();
  assert.equal((await run(w, '2026-11-27T17:17:00Z', {}, 'wrong')).status, 401);
  assert.deepEqual((await run(w, '2026-11-27T10:17:00Z')).body, { skipped: true, reason: 'outside-local-hour' });
  const res = await run(w, '2026-11-27T17:17:00Z');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, reminded: 2, delivered: 2 });
  assert.deepEqual(sent(w).sort(), [
    ['s-l', 'Still waiting: send your person the code again. It lasts 14 days.'],
    ['s-w', 'Il vostro spazio vi aspetta: manda il codice alla tua persona ♡'],
  ]);
  // The cron again in the same hour: nobody is told twice.
  await run(w, '2026-11-27T17:47:00Z', { force: true });
  assert.equal(w.webpush.sent.length, 2);
});

test('the job: the relationship switch turned off is respected', async () => {
  const w = world({ prefs: [{ user_id: W, relationship: false }] });
  await run(w, '2026-11-27T17:17:00Z');
  assert.deepEqual(sent(w), [['s-l', 'Still waiting: send your person the code again. It lasts 14 days.']]);
});

test('the cron migration: key reader for service_role only, the schedule off where us_project_url is missing', () => {
  const sql = migration('_invito_promemoria_cron.sql');
  assert.match(sql, /revoke all on function public\.get_internal_invite_reminder_cron_key\(\) from public, anon, authenticated, service_role;/);
  assert.match(sql, /grant execute on function public\.get_internal_invite_reminder_cron_key\(\) to service_role;/);
  assert.match(sql, /set search_path to ''/);
  assert.match(sql, /perform cron\.schedule\('us-invite-reminder-hourly', '17 \* \* \* \*'/);
  assert.match(sql, /vault us_project_url not provisioned \(staging\), nothing scheduled/);
  assert.match(read('supabase/config.toml'), /\[functions\.invite-reminder-job\]\nverify_jwt = false/);
});
