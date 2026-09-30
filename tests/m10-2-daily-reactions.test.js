// M10.2 — reazioni alla risposta del PARTNER nel foglio Today. Il vero app.js in vm.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { ROOT, app, slice, flush, meta, installToday } = require('./helpers/m10-2-harness.js');

// ------------------------------------------------------------------ reactions
const glyphs = { heart: '❤️', angry: '😡', cry: '😭' };

test('M10.2 reazioni UI: tre bottoni SOLO sulla risposta del partner, aria-label e aria-pressed corretti', async () => {
  const t = installToday({ revealMeta: meta({ my_reaction: 'angry' }) });
  await t.hydrate();
  const html = t.nodes.todayReveal.innerHTML;
  const [mine, partner] = html.split('data-us-daily-answer="partner"');
  assert.doesNotMatch(mine, /data-daily-reaction/, 'no controls on my own answer');
  assert.equal((partner.match(/data-daily-reaction="/g) || []).length, 3);
  assert.match(partner, /aria-label="Reagisci con cuore" aria-pressed="false"/);
  assert.match(partner, /aria-label="Reagisci con faccina arrabbiata" aria-pressed="true"/);
  assert.match(partner, /aria-label="Reagisci con pianto" aria-pressed="false"/);
  for (const g of Object.values(glyphs)) assert.ok(partner.includes(g));
  assert.match(partner, /role="group" aria-label="Reagisci alla risposta di Bea"/);
});

test('M10.2 reazioni UI: la reazione del partner compare passiva sulla MIA risposta ("Bea ha reagito ❤️")', async () => {
  for (const [role, label] of [['francesco', 'Bea'], ['beatrice', 'Francesco']]) {
    const t = installToday({ role, revealMeta: meta({ partner_reaction: 'heart' }) });
    await t.hydrate();
    const [mine, partner] = t.nodes.todayReveal.innerHTML.split('data-us-daily-answer="partner"');
    assert.match(mine, new RegExp(`${label} ha reagito <span aria-hidden="true">❤️</span>`));
    assert.doesNotMatch(mine, /<button/, 'non interactive on my own answer');
    assert.doesNotMatch(partner, /ha reagito/);
  }
  const none = installToday();
  await none.hydrate();
  assert.doesNotMatch(none.nodes.todayReveal.innerHTML, /ha reagito/);
});

test('M10.2 reazioni: salva sul server, sostituisce, tap sulla selezionata la toglie; poi meta canonica riconciliata', async () => {
  const t = installToday();
  await t.hydrate();
  t.calls.length = 0;
  for (const [tap, expected] of [['heart', 'heart'], ['angry', 'angry'], ['cry', 'cry'], ['cry', null]]) {
    const r = await t.window.setDailyAnswerReaction(tap);
    assert.equal(r.status, 'saved');
    assert.equal(t.window.todayRevealMeta.my_reaction, expected);
    const pressed = t.nodes.todayReveal.innerHTML.match(/data-daily-reaction="(\w+)" aria-label="[^"]+" aria-pressed="true"/)?.[1] ?? null;
    assert.equal(pressed, expected, 'exactly the server value is pressed');
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
  assert.match(t.nodes.todayReveal.innerHTML, /data-daily-reaction="heart" aria-label="[^"]+" aria-pressed="true"/);
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
  const edge = fs.readFileSync(path.join(ROOT, 'supabase/functions/send-web-push/index.ts'));
  assert.equal(crypto.createHash('sha256').update(edge).digest('hex'), '069c044b6aa849337b094980905b15097ee5982c899ca4f512969fcf9122086c', 'send-web-push is byte-identical to the M10 production source');
  const newPaths = [slice('// M10.2 — reveal Daily', 'let usTodayHydrateSeq=0;'), slice('installTodayNoticeSwipe(', 'window.UsTodayPriority=Object.freeze')].join('\n');
  assert.doesNotMatch(newPaths, /sendWebPushEvent|push_event_log|sendNotification/);
  assert.match(app, /sendWebPushEvent\('daily_answer',window\.todayQuestion\.id\)/, 'the second-answer push still originates from the saved answer');
  assert.equal((app.match(/sendWebPushEvent\('daily_answer'/g) || []).length, 1);
});
