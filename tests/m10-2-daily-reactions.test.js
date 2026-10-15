// Daily 1.0 — reactions (♥ / mi hai commosso) on the reveal, server state and notification contract.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { ROOT, app, slice, meta, installToday, flush } = require('./helpers/m10-2-harness.js');

// ------------------------------------------------------------------ reactions

// 1.0 (O2) — one tap on the other's answer: only ♥ or "Mi hai commosso", never
// "arrabbiato". Under my answer, what the other felt. The server decides.
test('1.0 O2: reaction controls only on the partner answer, ♥ and "Mi hai commosso" only; their reaction under mine', async () => {
  for (const role of ['francesco','beatrice']) {
    const t=installToday({role,revealMeta:meta({my_reaction:'cry',partner_reaction:'heart'})});
    await t.hydrate();
    const html=t.nodes.todayReveal.innerHTML;
    const mine=html.slice(html.indexOf('data-us-daily-answer="mine"'),html.indexOf('data-us-daily-answer="partner"'));
    const theirs=html.slice(html.indexOf('data-us-daily-answer="partner"'));
    assert.match(html,/La tua risposta/);
    assert.match(html,role==='francesco'?/Beatrice/:/Francesco/);
    assert.doesNotMatch(mine,/data-daily-reaction/,'never a reaction on my own answer');
    assert.deepEqual([...theirs.matchAll(/data-daily-reaction="([a-z]+)"/g)].map((m)=>m[1]),['heart','cry']);
    assert.doesNotMatch(html,/angry|arrabbiat|😡/);
    assert.match(theirs,/data-daily-reaction="cry" aria-pressed="true"/);
    assert.match(theirs,/data-daily-reaction="heart"[^>]*aria-pressed="false"/);
    assert.match(mine,/data-us-daily-partner-reaction="heart"/);
    assert.match(mine,role==='francesco'?/Beatrice ha messo ♥ alla tua risposta/:/Francesco ha messo ♥ alla tua risposta/);
  }
  const angry=installToday({revealMeta:meta({partner_reaction:'angry'})});await angry.hydrate();
  assert.doesNotMatch(angry.nodes.todayReveal.innerHTML,/data-us-daily-partner-reaction|angry/,'an old "angry" is never shown');
});

test('1.0 O2: one tap sends set_daily_answer_reaction, the same tap takes it back; no push from the client', async () => {
  const t = installToday();await t.hydrate();
  assert.equal(typeof t.window.setDailyAnswerReaction,'function');
  assert.equal(t.listeners.has('click'),true);
  const click=(reaction)=>t.listeners.get('click')({target:{closest:(sel)=>sel==='[data-daily-reaction]'?{dataset:{dailyReaction:reaction}}:null}});
  click('heart');await flush();await flush();
  assert.deepEqual(t.calls.filter(([name])=>name==='set_daily_answer_reaction').at(-1),['set_daily_answer_reaction',{target_question_id:'q-1',target_reaction:'heart'}]);
  assert.equal(t.window.todayRevealMeta.my_reaction,'heart');
  click('heart');await flush();await flush();
  assert.deepEqual(t.calls.filter(([name])=>name==='set_daily_answer_reaction').at(-1),['set_daily_answer_reaction',{target_question_id:'q-1',target_reaction:null}]);
  assert.equal(await t.window.setDailyAnswerReaction('angry').then((r)=>r.status),'noop','never "arrabbiato"');
  assert.deepEqual(t.pushes,[]);
});

test('1.0 O2: a refused reaction goes back to what the server had, with an honest toast', async () => {
  const t = installToday({revealMeta:meta({my_reaction:'heart'}),reactionResult:()=>({data:null,error:new Error('offline')})});
  await t.hydrate();
  const result=await t.window.setDailyAnswerReaction('cry');
  assert.equal(result.status,'error');
  assert.equal(t.window.todayRevealMeta.my_reaction,'heart');
  assert.match(t.nodes.todayReveal.innerHTML,/data-daily-reaction="heart"[^>]*aria-pressed="true"/);
  assert.deepEqual(t.toasts,['Reazione non salvata. Riprova.']);
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
  // dispatcher (86c82fe29cf56725d64a161169700c9ff4ce6c1ded21d4da2a40570c3a01f39a).
  // US 1.0 (founder decisions A2, A6, N5, O2, O7) changed it on purpose:
  // daily_reaction and partner_joined events, the reveal only to the partner,
  // copy in the recipient's language. Pinned again:
  assert.equal(crypto.createHash('sha256').update(beforeF2C, 'utf8').digest('hex'), '6a4bffaeb2f98f3609f0b217e4a80de22ea8b2804664db8d4f53d32f66e24ee5', 'send-web-push content is the US 1.0 source plus only the F2C VAPID edit');
  assert.match(edge, /const EVENT_TYPES: EventType\[\] = \["test", "think", "think_reaction", "daily_answer", "daily_reaction", "quest_confirmed", "left_for_you", "partner_joined"\];/, 'the US 1.0 event types, no other');
  const newPaths = [slice('// M10.2 — reveal Daily', 'let usTodayHydrateSeq=0;'), slice('installTodayNoticeSwipe(', 'window.UsTodayPriority=Object.freeze')].join('\n');
  // US 1.0 (O2): the reveal may ask for the one reaction push, nothing else.
  assert.doesNotMatch(newPaths.replace(/sendWebPushEvent\('daily_reaction',[^)]*\)/g, ''), /sendWebPushEvent|push_event_log|sendNotification/);
  assert.match(app, /sendWebPushEvent\('daily_answer',window\.todayQuestion\.id\)/, 'the second-answer push still originates from the saved answer');
  assert.equal((app.match(/sendWebPushEvent\('daily_answer'/g) || []).length, 1);
});
