// M10A/M10B — Oggi reads top-down (personal priority → today's Calendar →
// Daily Question → passive widgets) and the Daily Question card is a compact
// entry point whose state comes only from get_or_create_daily_question +
// get_daily_state.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('index.html');
const css = read('styles.css');
const app = read('app.js');
const hero = html.match(/<section class="hero home-hero-only" id="homeHero"[\s\S]*?<\/section>/)?.[0] || '';

function installCard() {
  const source = app.slice(app.indexOf('const US_TODAY_PRIORITY_ORDER='), app.indexOf('function localDateISO()'));
  const card = { hidden: true, innerHTML: '', dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
  const window = { usProfile: { role: 'francesco' }, usBondProfiles: [] };
  const context = vm.createContext({
    console, Promise, window,
    document: { getElementById: (id) => (id === 'usDailyRitual' ? card : null) },
    escapeHtml: (v) => String(v).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])),
    partnerFromProfiles: () => null,
  });
  vm.runInContext(source, context);
  return { api: window.UsDailyRitual, card };
}
const question = { id: 'q-1', question: 'Cosa ti farebbe partire bene questa settimana?', question_date: '2026-10-05' };

test('M10A: una sola colonna Oggi — priorità, poi Calendario, poi Domanda del giorno; i widget passivi restano sotto', () => {
  const stack = hero.match(/<div class="us-oggi-stack" id="usOggiStack">[\s\S]*?\n {6}<\/div>/)?.[0] || '';
  assert.ok(stack, 'Oggi stack exists inside the hero');
  const order = ['id="usTodayPriorityRegion"', 'id="usOggiCalendarWidget"', 'id="usDailyRitual"'].map((id) => stack.indexOf(id));
  assert.ok(order.every((i) => i >= 0), 'the three regions live in the stack');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'priority → calendar → daily question');
  for (const passive of ['id="distanceWidget"', 'id="pushOptInCard"', 'id="homeEmptyState"']) {
    assert.equal(stack.indexOf(passive), -1, `${passive} is not in the priority stack`);
    assert.ok(hero.indexOf(passive) > hero.indexOf('id="usOggiStack"'));
  }
  // One flow container: children are not absolutely positioned against each other.
  assert.match(css, /\.us-oggi-stack\{position:absolute;[^}]*display:flex;flex-direction:column;gap:8px/);
  assert.match(css, /\.us-oggi-widgets\{position:relative;/);
  assert.match(css, /\.us-daily-ritual\{position:relative;/);
  assert.match(css, /#usTodayPriorityRegion\{position:relative;/);
  assert.doesNotMatch(css, /\.us-daily-ritual\{[^}]*bottom:calc/, 'the Daily Question is no longer pinned to the bottom');
  // No duplicate Calendar data: one widget region, M6E authority unchanged.
  assert.equal((html.match(/id="usOggiCalendarWidget"/g) || []).length, 1);
  assert.match(app, /const fact=await window\.getOggiCalendarInsightSource\?\.\(\);/);
  // Taps on the stack never toggle Focus Photo; Focus Photo fades and inerts all of it.
  assert.match(app, /target\.closest\('\.us-oggi-stack,/);
  assert.match(app, /const fadeTargets=\[document\.getElementById\('usTodayPriorityRegion'\),document\.getElementById\('usOggiCalendarWidget'\),document\.getElementById\('usDailyRitual'\)/);
});

test('M10A: gli impegni del Calendario sono informazione, mai attenzione animata', () => {
  const render = app.slice(app.indexOf('function renderOggiCalendarWidget'), app.indexOf("document.getElementById('usOggiCalendarWidget')?.addEventListener"));
  assert.doesNotMatch(render, /us-attention-orbit|usAttention|data-us-attention/);
  assert.doesNotMatch(hero.match(/id="usOggiCalendarWidget"[^>]*>/)[0], /us-attention-orbit|data-us-attention/);
});

test('M10B: stati compatti della card — A da rispondere, B risposto, C scopri, D errore', () => {
  const { api } = installCard();
  const m = (state) => api.viewModel({ question, state, partnerName: 'Beatrice' });
  const a = m({ my_answer: null, partner_has_answer: false, both_answered: false });
  assert.deepEqual({ state: a.state, kicker: a.kicker, cta: a.cta, status: a.status }, { state: 'answer', kicker: 'Domanda del giorno', cta: 'Rispondi', status: '' });
  const a2 = m({ my_answer: null, partner_has_answer: true, both_answered: false });
  assert.deepEqual({ cta: a2.cta, status: a2.status }, { cta: 'Rispondi', status: '' }, 'partner answered first: same compact copy');
  const b = m({ my_answer: 'Mia', partner_has_answer: false, both_answered: false });
  assert.deepEqual({ state: b.state, cta: b.cta, status: b.status }, { state: 'waiting', cta: '', status: 'Risposto' });
  const c = m({ my_answer: 'Mia', partner_has_answer: true, both_answered: true, partner_answer: 'Sua' });
  assert.deepEqual({ state: c.state, cta: c.cta }, { state: 'reveal', cta: 'Scopri' });
  const d = api.viewModel({ status: 'error' });
  assert.deepEqual({ state: d.state, cta: d.cta }, { state: 'error', cta: 'Riprova' });
});

test('M10B: la card contiene solo kicker, domanda e un segnale — niente testo esplicativo, niente risposte', () => {
  const { api, card } = installCard();
  const secret = 'RISPOSTA-PARTNER'; const mine = 'RISPOSTA-MIA';
  for (const state of [
    { my_answer: null, partner_has_answer: false, both_answered: false },
    { my_answer: null, partner_has_answer: true, both_answered: false, partner_answer: secret },
    { my_answer: mine, partner_has_answer: false, both_answered: false },
    { my_answer: mine, partner_has_answer: true, both_answered: true, partner_answer: secret },
  ]) {
    api.render(api.viewModel({ question, state, partnerName: 'Beatrice' }));
    const text = card.innerHTML.replace(/<[^>]+>/g, '|').split('|').filter(Boolean);
    assert.equal(text.length, 3, `kicker + question + one signal: ${text.join(' / ')}`);
    assert.equal(text[0], 'Domanda del giorno');
    assert.equal(text[1], question.question);
    assert.doesNotMatch(card.innerHTML + JSON.stringify(card.attrs), new RegExp(`${secret}|${mine}`));
  }
  assert.doesNotMatch(app, /Rispondete entrambi, poi scopritevi|Aspettiamo \$\{name\}|ti aspetta`,cta/);
  assert.match(css, /\.us-daily-ritual-question\{[^}]*-webkit-line-clamp:2/);
});

test('M10B: un errore non mostra mai una risposta finta o modificabile', () => {
  const { api, card } = installCard();
  api.render(api.viewModel({ status: 'error' }));
  assert.equal(card.dataset.state, 'error');
  assert.doesNotMatch(card.innerHTML, /<textarea|<input|contenteditable/);
  assert.match(card.innerHTML, /Riprova/);
});
