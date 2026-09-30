// M10.2 — Oggi "Risposte pronte": avviso personale, dismiss (swipe + bottone),
// accesso passivo dopo aperto/nascosto, ricevuta "visto" solo a reveal aperto.
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
  const nodes = { usDailyRitual: fakeEl(), usTodayPriorityRegion: fakeEl(), usDailyRevealLink: fakeEl() };
  const listeners = new Map();
  nodes.usTodayPriorityRegion.addEventListener = (type, fn) => listeners.set(type, fn);
  const window = { usProfile: { role: 'francesco' }, usBondProfiles: [], openToday() {} };
  const context = vm.createContext({
    console, Promise, window, setTimeout, Date,
    document: { getElementById: (id) => nodes[id] || null },
    escapeHtml: (v) => String(v),
    partnerFromProfiles: () => null,
    ...(today ? { usDailyQuestionDay: () => today } : {}),
  });
  vm.runInContext(app.slice(app.indexOf('const US_TODAY_PRIORITY_ORDER='), app.indexOf('function localDateISO()')), context);
  return { nodes, window, listeners, context };
}
async function oggi(daily, opts) {
  const t = installOggi(opts);
  const priorities = await t.window.UsTodayPriority.refresh({ daily });
  const { usDailyRitual: card, usTodayPriorityRegion: region, usDailyRevealLink: link } = t.nodes;
  return {
    ...t, priorities,
    dailyCardVisible: card.hidden === false,
    noticeVisible: region.hidden === false && /data-us-arrival-type="daily-reveal-ready"/.test(region.innerHTML),
    linkVisible: link.hidden === false,
  };
}
const source = (me, other, m) => ({ question: QUESTION, state: state(me, other), reveal: m, partnerName: 'Bea' });

test('M10.2 matrice Oggi: nessuno / uno solo ha risposto → nessun avviso, card Daily solo a chi non ha risposto', async () => {
  const neither = await oggi(source(null, null));
  assert.deepEqual([neither.dailyCardVisible, neither.noticeVisible, neither.linkVisible], [true, false, false]);
  const meAnswered = await oggi(source('Mia', null));           // Francesco ha risposto
  assert.deepEqual([meAnswered.dailyCardVisible, meAnswered.noticeVisible, meAnswered.linkVisible], [false, false, false]);
  const partnerPending = await oggi(source(null, 'Sua'));        // Beatrice non ha ancora risposto
  assert.deepEqual([partnerPending.dailyCardVisible, partnerPending.noticeVisible, partnerPending.linkVisible], [true, false, false]);
  // Un meta arrivato in ritardo non può accendere l'avviso prima del reveal.
  const early = await oggi(source('Mia', null, meta({ both_answered: false })));
  assert.deepEqual([early.noticeVisible, early.linkVisible], [false, false]);
});

test('M10.2 matrice Oggi: entrambi hanno risposto, nessuno ha aperto → avviso ON per entrambi, niente card Daily né link', async () => {
  for (const [me, other] of [['Mia', 'Sua'], ['Sua', 'Mia']]) {
    const t = await oggi(source(me, other, meta()));
    assert.deepEqual([t.dailyCardVisible, t.noticeVisible, t.linkVisible], [false, true, false]);
    assert.match(t.nodes.usTodayPriorityRegion.innerHTML, /data-us-attention="on"/, 'personal unread → restrained M10 orbit');
    assert.match(t.nodes.usTodayPriorityRegion.innerHTML, /Risposte pronte/);
    assert.match(t.nodes.usTodayPriorityRegion.innerHTML, /Le vostre risposte sono pronte/);
    assert.match(t.nodes.usTodayPriorityRegion.innerHTML, /Scopri/);
    assert.doesNotMatch(t.nodes.usTodayPriorityRegion.innerHTML, /Cosa ti farebbe partire|Mia|Sua/, 'no question or answer text on Oggi');
    assert.match(t.nodes.usTodayPriorityRegion.innerHTML, /aria-label="Nascondi avviso Risposte pronte"/);
    assert.match(t.nodes.usTodayPriorityRegion.innerHTML, /data-us-question-id="q-1"/);
  }
});

test('M10.2 matrice Oggi: aperto → avviso OFF + link passivo; nascosto → avviso OFF + link passivo; il partner non cambia', async () => {
  const opened = await oggi(source('Mia', 'Sua', meta({ my_reveal_seen_at: '2026-10-05T09:00:00Z' })));
  assert.deepEqual([opened.dailyCardVisible, opened.noticeVisible, opened.linkVisible], [false, false, true]);
  assert.equal(opened.nodes.usDailyRevealLink.textContent, 'Rivedi le risposte di oggi');
  assert.equal(opened.nodes.usDailyRevealLink.dataset.usQuestionId, 'q-1');

  const dismissed = await oggi(source('Mia', 'Sua', meta({ my_notice_dismissed_at: '2026-10-05T09:00:00Z' })));
  assert.deepEqual([dismissed.dailyCardVisible, dismissed.noticeVisible, dismissed.linkVisible], [false, false, true]);
  assert.equal(dismissed.priorities.length, 0);

  // Il partner riceve il proprio meta: il MIO seen/dismiss non lo tocca.
  const partner = await oggi(source('Sua', 'Mia', meta()));
  assert.deepEqual([partner.noticeVisible, partner.linkVisible], [true, false]);
});

test('M10.2 matrice Oggi: senza meta caricata (errore/offline) nessun avviso e nessun link inventati', async () => {
  const t = await oggi(source('Mia', 'Sua', null));
  assert.deepEqual([t.noticeVisible, t.linkVisible, t.dailyCardVisible], [false, false, false]);
  const wrongQuestion = await oggi(source('Mia', 'Sua', meta({ question_id: 'ieri' })));
  assert.deepEqual([wrongQuestion.noticeVisible, wrongQuestion.linkVisible], [false, false]);
});

test('M10.2 cambio giorno Europe/Rome: avviso, link e reazioni di ieri non compaiono; la Daily di oggi non ne è contaminata', async () => {
  const yesterday = await oggi(source('Mia', 'Sua', meta()), { today: '2026-10-06' });
  assert.deepEqual([yesterday.noticeVisible, yesterday.linkVisible], [false, false]);
  // La nuova domanda di oggi (senza mia risposta) riporta la card Daily anche con meta di ieri in memoria.
  const next = await oggi({ question: { id: 'q-2', question: 'Nuova domanda', question_date: '2026-10-06' }, state: state(null, null), reveal: meta(), partnerName: 'Bea' }, { today: '2026-10-06' });
  assert.deepEqual([next.dailyCardVisible, next.noticeVisible, next.linkVisible], [true, false, false]);
  const same = await oggi(source('Mia', 'Sua', meta()), { today: '2026-10-05' });
  assert.equal(same.noticeVisible, true);
});

test('M10.2 un solo ingresso: se l\'avviso è in coda il link passivo non compare; Ti penso non lo nasconde', async () => {
  const t = installOggi();
  t.window.getTodayEventPrioritySource = async () => ({ id: 'e1', title: 'Cena', effective_date: '2026-10-05', days_left: 0, event_time: '20:00' });
  const priorities = await t.window.UsTodayPriority.refresh({ daily: source('Mia', 'Sua', meta()) });
  assert.deepEqual(Array.from(priorities, (p) => p.category), ['answers_ready', 'couple_context']);
  assert.equal(t.nodes.usDailyRevealLink.hidden, true);
  // Categoria propria: un Ti penso ricevuto (received_ready) non ne prende il posto.
  const composed = Array.from(t.window.UsTodayPriority.compose([
    { id: 'think-received:1', factKey: 'think:1', category: 'received_ready', urgency: 1, recency: 1 },
    { id: 'daily-ready:q-1', factKey: 'daily:q-1', category: 'answers_ready', urgency: 5, recency: 0 },
  ]), (p) => p.id);
  assert.deepEqual(composed, ['think-received:1', 'daily-ready:q-1']);
});

test('M10.2 tap sull\'avviso: apre Today senza nasconderlo localmente (lo stato è canonico, non "consumato")', async () => {
  const t = installOggi();
  let opened = 0; t.window.openToday = () => { opened += 1; };
  await t.window.UsTodayPriority.refresh({ daily: source('Mia', 'Sua', meta()) });
  const before = t.nodes.usTodayPriorityRegion.innerHTML;
  const control = { dataset: { usTodayAction: 'today' } };
  t.listeners.get('click')({ target: { closest: (sel) => (sel === '[data-us-today-action]' ? control : null) } });
  assert.equal(opened, 1);
  assert.equal(t.nodes.usTodayPriorityRegion.innerHTML, before, 'still there until mark_daily_reveal_seen succeeds');
});

// ---------------------------------------------------------------------- swipe
function fakeItem({ width = 320, questionId = 'q-1' } = {}) {
  const item = {
    style: {}, dataset: { usQuestionId: questionId }, isConnected: true, captured: null,
    getBoundingClientRect: () => ({ width }), setPointerCapture(id) { this.captured = id; },
  };
  item.closest = (sel) => (sel === '[data-us-swipe-item]' ? item : null);
  return item;
}
function installSwipe({ dismiss, reduced = false } = {}) {
  const t = installOggi();
  t.window.UsUiFoundation = { isReducedMotion: () => reduced };
  const calls = [];
  t.window.dismissDailyRevealNotice = dismiss || (async (id) => { calls.push(id); return { status: 'dismissed' }; });
  const item = fakeItem();
  const fire = (type, x, y, extra = {}) => t.listeners.get(type)({ pointerId: 1, button: 0, clientX: x, clientY: y, target: item, preventDefault() {}, ...extra });
  return { ...t, item, calls, fire };
}

test('M10.2 swipe: sotto soglia → snap back, nessun dismiss', async () => {
  const s = installSwipe();
  s.fire('pointerdown', 200, 300); s.fire('pointermove', 180, 302); s.fire('pointermove', 165, 303);
  assert.equal(s.item.style.transform, 'translateX(-35px)');
  assert.ok(Number(s.item.style.opacity) < 1 && Number(s.item.style.opacity) > 0.5);
  s.fire('pointerup', 165, 303);
  await flush();
  assert.equal(s.calls.length, 0);
  assert.equal(s.item.style.transform, 'translateX(0)');
  assert.match(s.item.style.transition, /transform/);
});

test('M10.2 swipe: gesto verticale → non trascina, non nasconde (lo scroll resta del browser)', async () => {
  const s = installSwipe();
  s.fire('pointerdown', 200, 300); s.fire('pointermove', 205, 340); s.fire('pointermove', 260, 420); s.fire('pointerup', 260, 420);
  await flush();
  assert.equal(s.item.style.transform, undefined);
  assert.equal(s.calls.length, 0);
  // Diagonale con verticale prevalente: idem.
  const d = installSwipe();
  d.fire('pointerdown', 200, 300); d.fire('pointermove', 130, 380); d.fire('pointerup', 130, 380);
  await flush();
  assert.equal(d.item.style.transform, undefined);
  assert.equal(d.calls.length, 0);
});

test('M10.2 swipe: orizzontale oltre soglia (sinistra e destra) → dismiss canonico sulla domanda dell\'avviso', async () => {
  for (const dx of [-90, 90]) {
    const s = installSwipe();
    s.fire('pointerdown', 200, 300); s.fire('pointermove', 200 + dx / 2, 303); s.fire('pointermove', 200 + dx, 304);
    assert.equal(s.item.captured, 1, 'pointer captured only after horizontal intent');
    s.fire('pointerup', 200 + dx, 304);
    await flush();
    assert.deepEqual(s.calls, ['q-1']);
    assert.equal(s.item.style.transform, `translateX(${dx < 0 ? -320 : 320}px)`, 'exits in the swipe direction');
  }
});

test('M10.2 swipe: errore del backend → la card torna al suo posto e si può riprovare', async () => {
  let attempts = 0;
  const s = installSwipe({ dismiss: async () => { attempts += 1; return attempts === 1 ? { status: 'error' } : { status: 'dismissed' }; } });
  s.fire('pointerdown', 200, 300); s.fire('pointermove', 100, 300); s.fire('pointerup', 100, 300);
  await flush();
  assert.equal(attempts, 1);
  assert.equal(s.item.style.transform, 'translateX(0)');
  assert.equal(s.item.style.opacity, '');
  s.fire('pointerdown', 200, 300); s.fire('pointermove', 100, 300); s.fire('pointerup', 100, 300);
  await flush();
  assert.equal(attempts, 2, 'retry allowed');
});

test('M10.2 swipe: il click dopo un drag non apre il reveal; un tap semplice sì', async () => {
  const s = installSwipe();
  let opened = 0; s.window.openToday = () => { opened += 1; };
  await s.window.UsTodayPriority.refresh({ daily: source('Mia', 'Sua', meta()) });
  const control = { dataset: { usTodayAction: 'today' } };
  const click = () => s.listeners.get('click')({ target: { closest: (sel) => (sel === '[data-us-today-action]' ? control : null) }, preventDefault() {} });
  s.fire('pointerdown', 200, 300); s.fire('pointermove', 190, 301); s.fire('pointerup', 190, 301);
  click();
  assert.equal(opened, 0, 'drag → click swallowed');
  s.fire('pointerdown', 200, 300); s.fire('pointerup', 200, 300);
  click();
  assert.equal(opened, 1, 'tap → opens Today');
});

test('M10.2 swipe: reduced motion — nessuna transizione, stesso comportamento', async () => {
  const s = installSwipe({ reduced: true });
  s.fire('pointerdown', 200, 300); s.fire('pointermove', 100, 300);
  assert.equal(s.item.style.transition, 'none');
  s.fire('pointerup', 100, 300);
  await flush();
  assert.equal(s.item.style.transition, 'none');
  assert.deepEqual(s.calls, ['q-1']);
  const short = installSwipe({ reduced: true });
  short.fire('pointerdown', 200, 300); short.fire('pointermove', 180, 300); short.fire('pointerup', 180, 300);
  await flush();
  assert.equal(short.item.style.transition, 'none');
  assert.equal(short.item.style.transform, 'translateX(0)');
  assert.equal(short.calls.length, 0);
});

test('M10.2 swipe: soglia proporzionale 50–70px; il bottone × non avvia un drag e usa la stessa autorità', async () => {
  const { context } = installOggi();
  const threshold = vm.runInContext('usTodaySwipeThreshold', context);
  assert.deepEqual([200, 320, 480, 900].map(threshold), [50, 64, 70, 70]);
  assert.equal(threshold(0), 50);

  const s = installSwipe();
  const dismissButton = { closest: (sel) => (sel === '[data-us-today-dismiss]' ? dismissButton : sel === '[data-us-swipe-item]' ? s.item : null) };
  s.fire('pointerdown', 200, 300, { target: dismissButton });
  s.fire('pointermove', 100, 300, { target: dismissButton }); s.fire('pointerup', 100, 300, { target: dismissButton });
  await flush();
  assert.equal(s.calls.length, 0, 'no drag started from the dismiss button');
  s.listeners.get('click')({ target: dismissButton, preventDefault() {} });
  await flush();
  assert.deepEqual(s.calls, ['q-1'], 'accessible dismiss → same canonical authority');
});

test('M10.2 markup: dismiss accessibile, swipe verticale libero, nessuna icona inventata', () => {
  assert.match(css, /\.us-today-priority-swipe\{[^}]*touch-action:pan-y/);
  // US-UI-UNIFICATION-01: 44px tap target; focus comes from the one global ring.
  const dismissRule = css.match(/\.us-today-priority-dismiss\{[^}]*\}/)?.[0] || '';
  assert.match(dismissRule, /width:44px/);
  assert.match(dismissRule, /height:44px/);
  assert.match(read('ui-foundation.css'), /:where\(button[^{]*\):focus-visible\s*\{\s*outline:2px solid/);
  assert.match(css, /\.us-daily-reveal-link\{[^}]*position:relative/);
  const link = css.match(/\.us-daily-reveal-link\{[^}]*\}/)?.[0] || '';
  assert.doesNotMatch(link, /animation|transition/, 'passive link: no animation');
  assert.doesNotMatch(css.match(/\.us-daily-reveal-link[^{]*\{[^}]*\}/g).join(''), /orbit|attention/);
  assert.match(html, /<button type="button" class="us-daily-reveal-link" id="usDailyRevealLink" hidden onclick="openToday\(\)"><\/button>/);
  const stack = html.match(/<div class="us-oggi-stack" id="usOggiStack">[\s\S]*?\n {6}<\/div>/)?.[0] || '';
  assert.ok(stack.indexOf('id="usDailyRevealLink"') > stack.indexOf('id="usDailyRitual"'), 'secondary link sits after the Daily card slot inside the same stack');
  assert.doesNotMatch(html, /id="todayOrb"/, 'the old top-left todayOrb stays removed');
  assert.doesNotMatch(read('styles.css') + app, /localStorage[^;]*(dismiss|reveal)/i, 'no local authority for dismiss/seen');
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
  const src = slice('async function hydrateToday(){', 'async function updateHomeStatus');
  assert.match(src, /markDailyRevealSeenIfVisible\(q\.id,seq\)/);
  assert.equal((app.match(/rpc\('mark_daily_reveal_seen'/g) || []).length, 1, 'one single writer of the receipt');
});

test('M10.2 seen: ricevuta non salvata → reveal leggibile, meta canonica intatta, avviso ancora su Oggi', async () => {
  const t = installToday({ seenResult: async () => ({ data: null, error: { message: 'offline' } }) });
  await t.hydrate();
  assert.match(t.nodes.todayReveal.innerHTML, /Mia[\s\S]*Sua/, 'answers displayed');
  assert.equal(t.window.todayRevealMeta.my_reveal_seen_at, null, 'no false local canonical mutation');
  assert.equal(t.refreshes[t.refreshes.length - 1].daily.reveal.my_reveal_seen_at, null);
  // Riaprire il foglio riprova.
  const again = await (async () => { const before = t.calls.length; await t.hydrate(); return t.calls.slice(before).map((c) => c[0]); })();
  assert.ok(again.includes('mark_daily_reveal_seen'), 'retry on next open');
});

test('M10.2 dismiss: solo RPC canonica, non segna visto, aggiorna Oggi; errore → toast e nessun cambio', async () => {
  const ok = installToday({ sheetOpen: false });
  await ok.hydrate();
  ok.calls.length = 0;
  const done = await ok.window.dismissDailyRevealNotice('q-1');
  assert.equal(done.status, 'dismissed');
  assert.deepEqual(rpcNames(ok), ['dismiss_daily_reveal_notice']);
  assert.ok(ok.window.todayRevealMeta.my_notice_dismissed_at);
  assert.equal(ok.window.todayRevealMeta.my_reveal_seen_at, null, 'dismiss is not a read receipt');
  assert.equal(ok.refreshes[ok.refreshes.length - 1], 'refresh');

  const bad = installToday({ sheetOpen: false, dismissResult: async () => ({ data: null, error: { message: 'boom' } }) });
  await bad.hydrate();
  const failed = await bad.window.dismissDailyRevealNotice('q-1');
  assert.equal(failed.status, 'error');
  assert.equal(bad.window.todayRevealMeta.my_notice_dismissed_at, null);
  assert.equal(bad.toasts.length, 1);
  // Meta di un'altra domanda o payload vuoto non contano come successo.
  const wrong = installToday({ sheetOpen: false, dismissResult: () => ({ data: meta({ question_id: 'altra' }), error: null }) });
  await wrong.hydrate();
  assert.equal((await wrong.window.dismissDailyRevealNotice('q-1')).status, 'error');
});
