// M10.2 — Oggi "Risposte pronte", ricevuta "visto" solo a reveal aperto.
// Redesign definitivo, fase 5 (D9): the notice and its swipe left Oggi; the
// Domanda di oggi card says the answers are ready until I open them.
// Stessa tecnica di m10-1a/m9e: il vero app.js eseguito in un contesto vm.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const { read, app, slice, flush, QUESTION, state, meta, installToday } = require('./helpers/m10-2-harness.js');
const html = read('index.html');
const css = read('styles.css');

// ---------------------------------------------------------------- Oggi matrix
function fakeEl(extra = {}) {
  return { hidden: true, innerHTML: '', textContent: '', dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; }, addEventListener() {}, ...extra };
}
function installOggi({ today } = {}) {
  const nodes = { usDailyRitual: fakeEl(), usDailyRevealLink: fakeEl() };
  const listeners = new Map();
  const window = { usProfile: { role: 'francesco' }, usBondProfiles: [], openToday() {} };
  const context = vm.createContext({
    console, Promise, window, setTimeout, Date,
    document: { getElementById: (id) => nodes[id] || null },
    escapeHtml: (v) => String(v),
    partnerFromProfiles: () => null,
    ...(today ? { usDailyQuestionDay: () => today } : {}),
  });
  vm.runInContext(app.slice(app.indexOf('let usTodayPriorityRefreshId=0;'), app.indexOf('function localDateISO()')), context);
  return { nodes, window, listeners, context };
}
async function oggi(daily, opts) {
  const t = installOggi(opts);
  await t.window.UsTodayPriority.refresh({ daily });
  const { usDailyRitual: card, usDailyRevealLink: link } = t.nodes;
  return {
    ...t,
    dailyCardVisible: card.hidden === false,
    ready: card.hidden === false && card.dataset.state === 'ready',
    linkVisible: link.hidden === false,
  };
}
const source = (me, other, m) => ({ question: QUESTION, state: state(me, other), reveal: m, partnerName: 'Bea' });

// 1.0 (O1): the Daily card stays until both answered (waiting state after mine),
// and after the reveal it offers "Rivedi" until tomorrow.
test('M10.2 matrice Oggi: nessuno / uno solo ha risposto → card Daily per entrambi (in attesa dopo la mia risposta), mai «pronte»', async () => {
  const neither = await oggi(source(null, null));
  assert.deepEqual([neither.dailyCardVisible, neither.ready, neither.linkVisible], [true, false, false]);
  const meAnswered = await oggi(source('Mia', null));           // Francesco ha risposto
  assert.deepEqual([meAnswered.dailyCardVisible, meAnswered.ready, meAnswered.linkVisible], [true, false, false]);
  assert.equal(meAnswered.nodes.usDailyRitual.dataset.state, 'waiting');
  const partnerPending = await oggi(source(null, 'Sua'));        // Beatrice non ha ancora risposto
  assert.deepEqual([partnerPending.dailyCardVisible, partnerPending.ready, partnerPending.linkVisible], [true, false, false]);
  // Un meta arrivato in ritardo non può dire «pronte» prima del reveal.
  const early = await oggi(source('Mia', null, meta({ both_answered: false })));
  assert.deepEqual([early.ready, early.linkVisible], [false, false]);
});

test('redesign D9: entrambi hanno risposto, nessuno ha aperto → la card Daily dice «Risposte pronte» per entrambi, niente link', async () => {
  for (const [me, other] of [['Mia', 'Sua'], ['Sua', 'Mia']]) {
    const t = await oggi(source(me, other, meta()));
    assert.deepEqual([t.dailyCardVisible, t.ready, t.linkVisible], [true, true, false]);
    const card = t.nodes.usDailyRitual;
    assert.equal(card.dataset.usAttention, 'off', 'M10E.2: after my answer never the orbit; the words say it');
    assert.match(card.innerHTML, /Risposte pronte/);
    assert.match(card.innerHTML, /Le vostre risposte sono pronte/);
    assert.match(card.innerHTML, /Scopri/);
    assert.doesNotMatch(card.innerHTML, /Mia|Sua/, 'no answer text on Oggi');
  }
});

test('M10.2 matrice Oggi: aperto → card "Rivedi"; nascosto (prima del redesign) → card "Rivedi"; il partner non cambia', async () => {
  const opened = await oggi(source('Mia', 'Sua', meta({ my_reveal_seen_at: '2026-10-05T09:00:00Z' })));
  assert.deepEqual([opened.dailyCardVisible, opened.ready, opened.linkVisible], [true, false, true]);
  assert.equal(opened.nodes.usDailyRitual.dataset.state, 'revealed');
  assert.match(opened.nodes.usDailyRitual.innerHTML, /Svelate · domani una nuova domanda/);
  assert.match(opened.nodes.usDailyRitual.innerHTML, /Rivedi/);
  assert.doesNotMatch(opened.nodes.usDailyRitual.innerHTML, /Mia|Sua/, 'never the answers on Oggi');
  assert.equal(opened.nodes.usDailyRevealLink.textContent, 'Rivedi le risposte di oggi');
  assert.equal(opened.nodes.usDailyRevealLink.dataset.usQuestionId, 'q-1');

  const dismissed = await oggi(source('Mia', 'Sua', meta({ my_notice_dismissed_at: '2026-10-05T09:00:00Z' })));
  assert.deepEqual([dismissed.dailyCardVisible, dismissed.ready, dismissed.linkVisible], [true, false, true]);

  // Il partner riceve il proprio meta: il MIO seen non lo tocca.
  const partner = await oggi(source('Sua', 'Mia', meta()));
  assert.deepEqual([partner.ready, partner.linkVisible], [true, false]);
});

test('M10.2 matrice Oggi: senza meta caricata (errore/offline) nessuna card «pronte» e nessun link inventati', async () => {
  const t = await oggi(source('Mia', 'Sua', null));
  assert.deepEqual([t.ready, t.linkVisible, t.dailyCardVisible], [false, false, false]);
  const wrongQuestion = await oggi(source('Mia', 'Sua', meta({ question_id: 'ieri' })));
  assert.deepEqual([wrongQuestion.ready, wrongQuestion.linkVisible], [false, false]);
});

test('M10.2 cambio giorno Europe/Rome: «pronte», link e reazioni di ieri non compaiono; la Daily di oggi non ne è contaminata', async () => {
  const yesterday = await oggi(source('Mia', 'Sua', meta()), { today: '2026-10-06' });
  assert.deepEqual([yesterday.ready, yesterday.linkVisible], [false, false]);
  // La nuova domanda di oggi (senza mia risposta) riporta la card Daily anche con meta di ieri in memoria.
  const next = await oggi({ question: { id: 'q-2', question: 'Nuova domanda', question_date: '2026-10-06' }, state: state(null, null), reveal: meta(), partnerName: 'Bea' }, { today: '2026-10-06' });
  assert.deepEqual([next.dailyCardVisible, next.ready, next.linkVisible], [true, false, false]);
  const same = await oggi(source('Mia', 'Sua', meta()), { today: '2026-10-05' });
  assert.equal(same.ready, true);
});

test('M10.2 markup: il link passivo, niente avviso né swipe su Oggi (redesign D9)', () => {
  assert.doesNotMatch(html, /usTodayPriorityRegion|us-today-priority/);
  assert.doesNotMatch(app, /installTodayNoticeSwipe|dismissDailyRevealNotice|data-us-today-dismiss/);
  assert.match(read('ui-foundation.css'), /:where\(button[^{]*\):focus-visible\s*\{\s*outline:2px solid/);
  assert.match(css, /\.us-daily-reveal-link\{[^}]*position:relative/);
  const link = css.match(/\.us-daily-reveal-link\{[^}]*\}/)?.[0] || '';
  assert.doesNotMatch(link, /animation|transition/, 'passive link: no animation');
  assert.doesNotMatch(css.match(/\.us-daily-reveal-link[^{]*\{[^}]*\}/g).join(''), /orbit|attention/);
  assert.match(html, /<button type="button" class="us-daily-reveal-link" id="usDailyRevealLink" hidden onclick="openToday\(\)"><\/button>/);
  const stack = html.match(/<div class="us-oggi-stack" id="usOggiStack">[\s\S]*?\n {6}<\/div>/)?.[0] || '';
  assert.ok(stack.indexOf('id="usDailyRevealLink"') >= 0, 'the passive link stays in the hidden stack');
  assert.doesNotMatch(html, /id="todayOrb"/, 'the old top-left todayOrb stays removed');
  // Founder 15/10: the Oggi card can be swiped away once both answered and read.
  // That hide is a visual, per-phone choice (dailyRitualDismissedId/dailyRitualDismiss);
  // reveal seen state stays on the server, so only those two helpers may touch storage.
  const cardHide = /function dailyRitualDismissedId\(\)\{[\s\S]*?\n\}\nfunction dailyRitualDismiss\(questionId\)\{[\s\S]*?\n\}\n/;
  assert.match(app, cardHide, 'the card-hide helpers exist as one block');
  assert.doesNotMatch(read('styles.css') + app.replace(cardHide, ''), /localStorage[^;]*(dismiss|reveal)/i, 'no local authority for dismiss/seen');
});

// ------------------------------------------------- Today sheet: seen + dismiss
const rpcNames = (t) => t.calls.map((c) => c[0]);

test('M10.2 seen: reveal mostrato in foglio aperto → mark_daily_reveal_seen, poi Oggi si aggiorna con la meta canonica', async () => {
  const t = installToday();
  await t.hydrate();
  assert.deepEqual(rpcNames(t), ['get_or_create_daily_question', 'get_daily_state', 'get_daily_reveal_meta', 'mark_daily_reveal_seen']);
  assert.deepEqual(t.calls[3][1], { target_question_id: 'q-1' });
  assert.ok(t.window.todayRevealMeta.my_reveal_seen_at);
  assert.match(t.nodes.todayReveal.innerHTML, /Mia[\s\S]*Sua/, 'answers still come from get_daily_state');
  const last = t.refreshes[t.refreshes.length - 1];
  assert.ok(last.daily.reveal.my_reveal_seen_at, 'Oggi refresh carries the updated canonical meta');
  assert.equal(t.window.todayRevealMeta.my_notice_dismissed_at, null, 'seen ≠ dismissed');
});

test('M10.2 seen: MAI segnato se il foglio è chiuso (hydrate di Home, push arrivata, card renderizzata)', async () => {
  const t = installToday({ sheetOpen: false });
  await t.hydrate();
  assert.ok(!rpcNames(t).includes('mark_daily_reveal_seen'));
  assert.equal(t.window.todayRevealMeta.my_reveal_seen_at, null);
  assert.equal(t.refreshes[t.refreshes.length - 1].daily.reveal.my_reveal_seen_at, null);
});

test('M10.2 seen: già visto → nessuna seconda scrittura; non pronto → nessuna chiamata di stato', async () => {
  const t = installToday({ revealMeta: meta({ my_reveal_seen_at: '2026-10-05T08:00:00Z' }) });
  await t.hydrate();
  assert.ok(!rpcNames(t).includes('mark_daily_reveal_seen'));
  const src = slice('async function hydrateToday(){', 'let pendingMomentFile=null;');
  assert.match(src, /markDailyRevealSeenIfVisible\(q\.id,seq\)/);
  assert.equal((app.match(/rpc\('mark_daily_reveal_seen'/g) || []).length, 1, 'one single writer of the receipt');
});

test('M10.2 seen: ricevuta non salvata → reveal leggibile, meta canonica intatta, «pronte» ancora su Oggi', async () => {
  const t = installToday({ seenResult: async () => ({ data: null, error: { message: 'offline' } }) });
  await t.hydrate();
  assert.match(t.nodes.todayReveal.innerHTML, /Mia[\s\S]*Sua/, 'answers displayed');
  assert.equal(t.window.todayRevealMeta.my_reveal_seen_at, null, 'no false local canonical mutation');
  assert.equal(t.refreshes[t.refreshes.length - 1].daily.reveal.my_reveal_seen_at, null);
  // Riaprire il foglio riprova.
  const again = await (async () => { const before = t.calls.length; await t.hydrate(); return t.calls.slice(before).map((c) => c[0]); })();
  assert.ok(again.includes('mark_daily_reveal_seen'), 'retry on next open');
});
