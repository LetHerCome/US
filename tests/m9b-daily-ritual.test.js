// M9B — Domanda del giorno riportata su Oggi come rituale quotidiano.
// La card deriva i quattro stati SOLO da get_daily_state e apre il foglio esistente.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function installRitual({ profiles = [], role = 'francesco' } = {}) {
  const source = read('app.js');
  const start = source.indexOf('const US_TODAY_PRIORITY_ORDER=');
  const end = source.indexOf('function localDateISO()', start);
  const card = { hidden: true, innerHTML: '', dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
  const region = { hidden: true, innerHTML: '', addEventListener() {} };
  const window = { usProfile: { role }, usBondProfiles: profiles };
  const context = vm.createContext({
    console: { warn() {} },
    document: { getElementById: (id) => (id === 'usDailyRitual' ? card : id === 'usTodayPriorityRegion' ? region : null) },
    escapeHtml: (value) => String(value).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])),
    partnerFromProfiles: (list) => list.find((p) => p.role !== role) || null,
    Promise,
    window,
  });
  require('./helpers/identity-fixture').install(context, profiles);
  vm.runInContext(source.slice(start, end), context);
  return { api: window.UsDailyRitual, card, region, window, context };
}

const question = { id: 'q-1', question: 'Cosa vorresti rifare con me?', question_date: '2026-09-29' };

test('M9B/M10.1A: stati reali — la card esiste solo finché manca la MIA risposta', () => {
  const { api } = installRitual();
  const vm0 = (state) => api.viewModel({ question, state, partnerName: 'Beatrice' });
  const none = vm0({ my_answer: null, partner_has_answer: false, both_answered: false });
  assert.equal(none.state, 'answer');
  assert.equal(none.cta, 'Rispondi');
  assert.equal(vm0({ my_answer: 'La mia', partner_has_answer: false, both_answered: false }), null, 'ho risposto io → nessuna card');
  const invited = vm0({ my_answer: null, partner_has_answer: true, both_answered: false });
  assert.equal(invited.state, 'invited');
  assert.equal(invited.status, '');
  assert.equal(invited.cta, 'Rispondi');
  assert.equal(vm0({ my_answer: 'La mia', partner_answer: 'La sua', partner_has_answer: true, both_answered: true }), null, 'entrambi → nessuna card su Oggi');
  assert.equal(none.status, '', 'M10B: nessun testo esplicativo nello stato normale');
  assert.equal(api.viewModel({ question: null, state: {}, partnerName: 'X' }), null);
  assert.equal(api.viewModel({ question, state: null, partnerName: 'X' }), null);
});

test('M9B: la card non rivela mai la risposta del partner', () => {
  const { api, card } = installRitual();
  const secret = 'RISPOSTA-SEGRETA-PARTNER';
  const mine = 'RISPOSTA-MIA';
  for (const state of [
    { my_answer: null, partner_answer: secret, partner_has_answer: true, both_answered: false },
  ]) {
    api.render(api.viewModel({ question, state, partnerName: 'Beatrice' }));
    assert.equal(card.hidden, false);
    assert.doesNotMatch(card.innerHTML + JSON.stringify(card.attrs), new RegExp(secret));
    assert.doesNotMatch(card.innerHTML, new RegExp(mine));
  }
  api.render(null);
  assert.equal(card.hidden, true);
  assert.equal(card.innerHTML, '');
});

test('M9B: il nome del partner arriva dal profilo reale, con fallback neutro', () => {
  const withProfiles = installRitual({ profiles: [{ id: 'f', role: 'francesco', display_name: 'Francesco' }, { id: 'b', role: 'beatrice', display_name: 'Bea' }] });
  assert.equal(vm.runInContext('dailyRitualPartnerName()', withProfiles.context), 'Bea');
  assert.equal(vm.runInContext('dailyRitualPartnerName()', installRitual({ role: 'francesco' }).context), 'La tua persona');
  assert.equal(vm.runInContext('dailyRitualPartnerName()', installRitual({ role: 'beatrice' }).context), 'La tua persona');
});

test('M9B: il testo della domanda è escapato', () => {
  const { api, card } = installRitual();
  api.render(api.viewModel({ question: { id: 'q', question: '<img src=x onerror=alert(1)>' }, state: {}, partnerName: 'B' }));
  assert.doesNotMatch(card.innerHTML, /<img/);
});

test('M9B: una sola autorità — get_daily_state, foglio esistente, niente duplicato nella priority queue', () => {
  const app = read('app.js');
  const html = read('index.html');
  const home = html.match(/<main id="home"[\s\S]*?<\/main>/)?.[0] || '';
  assert.match(home, /<button type="button" class="us-daily-ritual us-attention-orbit" id="usDailyRitual" hidden onclick="openToday\(\)" data-us-attention="off"><\/button>/);
  assert.ok(home.indexOf('id="usDailyRitual"') > home.indexOf('id="homeHero"'));
  assert.equal((app.match(/rpc\('get_daily_state'/g) || []).length, 1, 'nessun secondo sistema Daily Question');
  const refresh = app.slice(app.indexOf('async function refreshTodayPriorities'), app.indexOf('window.UsTodayPriority=Object.freeze'));
  assert.match(refresh, /renderDailyRitual\(dailyRitualViewModel\(dailySource\)\)/);
  assert.doesNotMatch(refresh, /candidates\.push\(dailyPriority\)/);
  assert.doesNotMatch(app.slice(app.indexOf('function dailyRitualViewModel'), app.indexOf('function renderDailyRitual')), /partner_answer/);
});

test('M9B: stile premium con icona Phosphor approvata e rispetto di focus/reduced motion', () => {
  const css = read('styles.css');
  assert.match(css, /\.us-daily-ritual-mark::before\{[^}]*mask:url\("\/assets\/icons\/phosphor\/question-regular\.svg"\)/);
  assert.match(css, /\.us-daily-ritual-question\{[^}]*font-family:var\(--us-font-editorial/);
  assert.match(css, /\.us-daily-ritual\[data-state="invited"\]/);
  for (const state of ['waiting', 'reveal']) assert.doesNotMatch(css, new RegExp(`\\.us-daily-ritual\\[data-state="${state}"\\]`));
  assert.match(css, /\.us-oggi-focus \.us-daily-ritual\{opacity:0!important;pointer-events:none!important\}/);
  assert.match(css, /prefers-reduced-motion:reduce\)\{\.us-daily-ritual\{transition:none\}/);
});
