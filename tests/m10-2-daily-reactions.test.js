// Daily V6 — retired reaction UI, preserved server state and notification contract.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { ROOT, app, slice, meta, installToday } = require('./helpers/m10-2-harness.js');

// ------------------------------------------------------------------ reactions

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

test('Daily V6: retired reaction actions cannot send frontend mutations', async () => {
  const t = installToday();await t.hydrate();
  assert.equal(t.window.setDailyAnswerReaction, undefined);
  assert.equal(t.listeners.has('click'), false);
  assert.ok(t.calls.every(([name]) => name !== 'set_daily_answer_reaction'));
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
