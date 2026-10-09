// M10.2 — reazioni alla risposta del PARTNER nel foglio Today. Il vero app.js in vm.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { ROOT, app, slice, flush, meta, installToday } = require('./helpers/m10-2-harness.js');

// ------------------------------------------------------------------ reactions
const glyphs = { heart: '❤️', angry: '😡', cry: '😭' };

test('Daily V5: both answers have labels but no reaction controls or prior reaction indicators', async () => {
  for (const role of ['francesco','beatrice']) {
    const t=installToday({role,revealMeta:meta({my_reaction:'angry',partner_reaction:'heart'})});
    await t.hydrate();
    const html=t.nodes.todayReveal.innerHTML;
    assert.match(html,/data-us-daily-answer="mine"/);
    assert.match(html,/data-us-daily-answer="partner"/);
    assert.doesNotMatch(html,/data-daily-reaction|today-reaction|ha reagito|❤️|😡|😭/);
    assert.match(html,/La tua risposta/);
    assert.match(html,role==='francesco'?/Beatrice/:/Francesco/);
  }
});

test('M10.2 reazioni: salva sul server, sostituisce, tap sulla selezionata la toglie; poi meta canonica riconciliata', async () => {
  const t = installToday();
  await t.hydrate();
  t.calls.length = 0;
  for (const [tap, expected] of [['heart', 'heart'], ['angry', 'angry'], ['cry', 'cry'], ['cry', null]]) {
    const r = await t.window.setDailyAnswerReaction(tap);
    assert.equal(r.status, 'saved');
    assert.equal(t.window.todayRevealMeta.my_reaction, expected);
    assert.doesNotMatch(t.nodes.todayReveal.innerHTML, /data-daily-reaction|aria-pressed/, 'legacy reaction authority no longer shown as UI');
  }
  assert.deepEqual(t.calls.map((c) => c[0]), Array(4).fill('set_daily_answer_reaction'));
  assert.deepEqual(t.calls.map((c) => c[1].target_reaction), ['heart', 'angry', 'cry', null]);
  assert.deepEqual(Object.keys(t.calls[0][1]), ['target_question_id', 'target_reaction'], 'no user id / couple id / target from the client');
  assert.deepEqual(t.pushes, [], 'no push for reactions');
});

test('M10.2 reazioni: click delegato sul bottone; errore server → rollback allo stato canonico + toast', async () => {
  const t = installToday({ revealMeta: meta({ my_reaction: 'heart' }), reactionResult: async () => ({ data: null, error: { message: 'offline' } }) });
  await t.hydrate();
  let seenDuring = null;
  const promise = (async () => { t.listeners.get('click')({ target: { closest: () => ({ dataset: { dailyReaction: 'cry' } }) } }); })();
  seenDuring = t.window.todayRevealMeta.my_reaction;
  await promise; await flush(); await flush();
  assert.equal(seenDuring, 'cry', 'brief optimistic pressed state');
  assert.equal(t.window.todayRevealMeta.my_reaction, 'heart', 'rolled back to the server value');
  assert.doesNotMatch(t.nodes.todayReveal.innerHTML, /data-daily-reaction|aria-pressed/, 'no user-visible reaction controls');
  assert.equal(t.toasts.length, 1);
  // Risposta con un'altra domanda non viene accettata come salvataggio.
  const wrong = installToday({ reactionResult: async () => ({ data: meta({ question_id: 'altra', my_reaction: 'cry' }), error: null }) });
  await wrong.hydrate();
  assert.equal((await wrong.window.setDailyAnswerReaction('cry')).status, 'error');
  assert.equal(wrong.window.todayRevealMeta.my_reaction, null);
});

test('M10.2 reazioni: nessuna prima del reveal, valori non validi ignorati, una alla volta', async () => {
  const t = installToday();
  await t.hydrate();
  t.calls.length = 0;
  assert.equal((await t.window.setDailyAnswerReaction('like')).status, 'noop');
  assert.equal(t.calls.length, 0);
  const locked = installToday();
  locked.window.todayQuestion = null;
  assert.equal((await locked.window.setDailyAnswerReaction('heart')).status, 'noop');
  const src = slice('async function hydrateToday(){', 'async function updateHomeStatus');
  // Prima del reveal il ramo "non sbloccato" azzera la meta e svuota il reveal.
  assert.match(src, /window\.todayRevealMeta=null;\s*reveal\.classList\.add\('hidden'\);reveal\.innerHTML=''/);
});

test('M10.2 nessuna notifica per reazioni/receipt: send-web-push invariato, nessun push dai nuovi percorsi', () => {
  const edge = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-web-push/index.ts'), 'utf8').replace(/\r\n/g, '\n');
  // F2C moved only the VAPID subject to Edge configuration; undoing exactly
  // that edit must give back the M10 production source.
  const beforeF2C = edge
    .replace('import { vapidSubject } from "../_shared/web-push-vapid.mjs";\n', '')
    .replace(/(const VAPID_PUBLIC_KEY = "[^"]+";\n)/, '$1const VAPID_SUBJECT = "https://usfinal.vercel.app";\n')
    .replaceAll('setVapidDetails(vapidSubject(),', 'setVapidDetails(VAPID_SUBJECT,');
  assert.notEqual(beforeF2C, edge, 'the F2C edit is present');
  // M10 production source (before Native Notifications V1): 069c044b6aa849337b094980905b15097ee5982c899ca4f512969fcf9122086c.
  // N2 replaced only the per-subscription delivery loop with the shared
  // dispatcher (_shared/notification-core.mjs, same copy/dedupe keys, plus the
  // native transport); authorization and event types are unchanged. Pinned again:
  assert.equal(crypto.createHash('sha256').update(beforeF2C, 'utf8').digest('hex'), '86c82fe29cf56725d64a161169700c9ff4ce6c1ded21d4da2a40570c3a01f39a', 'send-web-push content is the N2 source plus only the F2C VAPID edit');
  assert.match(edge, /\["test", "think", "think_reaction", "daily_answer", "quest_confirmed", "left_for_you"\]/, 'no new push event type');
  const newPaths = [slice('// M10.2 — reveal Daily', 'let usTodayHydrateSeq=0;'), slice('installTodayNoticeSwipe(', 'window.UsTodayPriority=Object.freeze')].join('\n');
  assert.doesNotMatch(newPaths, /sendWebPushEvent|push_event_log|sendNotification/);
  assert.match(app, /sendWebPushEvent\('daily_answer',window\.todayQuestion\.id\)/, 'the second-answer push still originates from the saved answer');
  assert.equal((app.match(/sendWebPushEvent\('daily_answer'/g) || []).length, 1);
});
