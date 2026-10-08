// M10.1A/B — la Domanda del giorno su Oggi dice a CHI guarda "hai ancora
// qualcosa da fare": esiste SOLO finché get_daily_state().my_answer == null.
// Dopo la MIA risposta sparisce del tutto (card e orbit). Il vecchio controllo
// top-left "Oggi / Domanda" (todayOrb) è rimosso; openToday() resta.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const app = read('app.js');
const html = read('index.html');
const slice = (from, to) => { const a = app.indexOf(from); const b = app.indexOf(to, a); assert.ok(a >= 0 && b > a, `${from}…${to}`); return app.slice(a, b); };

function fakeEl() {
  const attrs = {};
  return { hidden: true, innerHTML: '', dataset: {}, setAttribute(k, v) { attrs[k] = String(v); }, removeAttribute(k) { delete attrs[k]; }, attrs };
}
function installOggi() {
  const card = fakeEl(); const region = { ...fakeEl(), addEventListener() {} };
  const window = { usProfile: { role: 'francesco' }, usBondProfiles: [] };
  const context = vm.createContext({
    console, Promise, window,
    document: { getElementById: (id) => (id === 'usDailyRitual' ? card : id === 'usTodayPriorityRegion' ? region : null) },
    escapeHtml: (v) => String(v),
    partnerFromProfiles: () => null,
  });
  require('./helpers/identity-fixture').install(context);
  vm.runInContext(app.slice(app.indexOf('const US_TODAY_PRIORITY_ORDER='), app.indexOf('function localDateISO()')), context);
  return { window, card, region };
}
const question = { id: 'q-1', question: 'Cosa ti farebbe partire bene questa settimana?', question_date: '2026-10-05' };
const stateFor = (me, other) => ({ my_answer: me, partner_has_answer: other != null, both_answered: me != null && other != null, partner_answer: me != null && other != null ? other : null });
const show = (daily) => { const t = installOggi(); t.window.UsDailyRitual.render(t.window.UsDailyRitual.viewModel(daily)); return t.card; };

test('M10.1A: my_answer == null → card visibile con orbit ON', () => {
  const card = show({ question, state: stateFor(null, null) });
  assert.equal(card.hidden, false);
  assert.equal(card.dataset.usAttention, 'on');
});

test('M10.1A: il partner ha risposto, io no → card visibile con orbit ON', () => {
  const card = show({ question, state: stateFor(null, 'Sua') });
  assert.equal(card.hidden, false);
  assert.equal(card.dataset.usAttention, 'on');
  assert.equal(card.dataset.state, 'invited');
});

test('M10.1A: ho risposto io, il partner no → card nascosta', () => {
  const card = show({ question, state: stateFor('Mia', null) });
  assert.equal(card.hidden, true);
  assert.equal(card.innerHTML, '');
  assert.equal(card.dataset.usAttention, 'off');
});

test('M10.1A: entrambi hanno risposto → card nascosta (niente reveal/“Scopri” su Oggi)', () => {
  const card = show({ question, state: stateFor('Mia', 'Sua') });
  assert.equal(card.hidden, true);
  assert.equal(card.innerHTML, '');
  assert.equal(card.dataset.usAttention, 'off');
});

test('M10.1A: nessuna copia di risposta/attesa/reveal su Oggi in nessuno stato', () => {
  for (const [me, other] of [[null, null], [null, 'Sua'], ['Mia', null], ['Mia', 'Sua']]) {
    const card = show({ question, state: stateFor(me, other) });
    assert.doesNotMatch(card.innerHTML, /Risposto|In attesa|Aspettiamo|Scopri|Sua|Mia/);
  }
});

test('M10.1A: la visibilità dipende SOLO da my_answer — mai da both_answered', () => {
  const vmSource = slice('function dailyRitualViewModel(source){', 'function renderDailyRitual(model){');
  assert.match(vmSource, /state\.my_answer!=null\)return null/);
  assert.doesNotMatch(vmSource.replace(/\/\/.*$/gm, ''), /both_answered/, 'nessun both_answered nel codice del view-model');
  // Stati contraddittori: solo my_answer decide.
  assert.equal(show({ question, state: { my_answer: null, partner_has_answer: false, both_answered: true } }).hidden, false);
  assert.equal(show({ question, state: { my_answer: 'Mia', partner_has_answer: false, both_answered: false } }).hidden, true);
  assert.equal(show({ question, state: { my_answer: '', partner_has_answer: true, both_answered: false } }).hidden, true, 'una risposta esistente (anche stringa vuota) non è null');
});

test('M10.1A: errore backend → nessuno stato "completato" finto, solo Riprova', () => {
  const card = show({ status: 'error' });
  assert.equal(card.hidden, false);
  assert.equal(card.dataset.state, 'error');
  assert.equal(card.dataset.usAttention, 'off');
  assert.doesNotMatch(card.innerHTML, /Risposto|In attesa|Scopri/);
  assert.match(card.innerHTML, /Riprova/);
});

function hydrateHarness() {
  let saved = false; let day = 'A';
  const nodes = { qtext: {}, locked: {}, todayReveal: { classList: { add() {}, remove() {} } }, todaySaveBtn: { dataset: {} }, answer: { value: '' } };
  const refreshes = [];
  const rome = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
  const sb = {
    rpc: (name) => Promise.resolve(name === 'get_or_create_daily_question'
      ? { data: { id: `q-${day}`, question: `Domanda ${day}`, question_date: rome() }, error: null }
      : { data: stateFor(saved ? 'La mia' : null, 'Sua'), error: null }),
    from: () => ({ upsert: () => { saved = true; return Promise.resolve({ error: null }); } }),
  };
  const window = { usProfile: { id: 'f', couple_id: 'c', role: 'francesco' }, UsTodayPriority: { refresh: (arg) => refreshes.push(arg) } };
  const ctx = vm.createContext({
    console: { warn() {} }, Promise, Intl, Date, Error, window, sb,
    document: { querySelector: () => nodes.qtext, getElementById: (id) => nodes[id] },
    dailyQuestionOutcomes: { hide() {}, async load() {} }, updateHomeStatus() {}, escapeHtml: String,
    dailyRitualPartnerName: () => 'Beatrice', localDateISO: () => 'x', toast() {}, sendWebPushEvent: () => Promise.resolve(),
  });
  require('./helpers/identity-fixture').install(ctx);
  vm.runInContext(`${slice('// M9E — la domanda di oggi', 'async function updateHomeStatus')}\n${slice('saveAnswer = async function(){', 'window.saveAnswer=saveAnswer;')}\nwindow.hydrateToday=hydrateToday;window.saveAnswer=saveAnswer;`, ctx);
  return {
    window, nodes, refreshes,
    nextDay() { day = 'B'; saved = false; window.todayQuestion = null; window.todayState = null; },
    cardNow() { return show(refreshes.at(-1).daily); },
  };
}

test('M10.1A: dopo la MIA risposta + rilettura canonica la card sparisce; la nuova domanda la riporta', async () => {
  const h = hydrateHarness();
  await h.window.hydrateToday();
  assert.equal(h.cardNow().hidden, false, 'domanda non risposta → card visibile');
  h.nodes.answer.value = 'La mia';
  await h.window.saveAnswer();
  assert.equal(h.refreshes.at(-1).daily.state.my_answer, 'La mia', 'stato riletto dal canonico');
  const after = h.cardNow();
  assert.equal(after.hidden, true, 'risposto → card sparita');
  assert.equal(after.dataset.usAttention, 'off', 'e l’orbit con lei');
  // Domani: nuova domanda Europe/Rome, io non ho risposto → torna.
  h.nextDay();
  await h.window.hydrateToday();
  const next = h.cardNow();
  assert.equal(next.hidden, false);
  assert.match(next.innerHTML, /Domanda B/);
  assert.equal(next.dataset.usAttention, 'on');
});

test('M10.1B: il controllo top-left “Oggi / Domanda” (todayOrb) è rimosso', () => {
  assert.doesNotMatch(html, /id="todayOrb"|id="todayOrbDot"|today-orb/);
  assert.doesNotMatch(html, /class="brand-row"/, 'niente contenitore vuoto che riserva spazio');
  assert.doesNotMatch(app, /todayOrb/);
  for (const file of fs.readdirSync(ROOT).filter((f) => f.endsWith('.css'))) {
    assert.doesNotMatch(read(file), /today-orb|\.brand-row/, `${file}: CSS obsoleto rimosso`);
  }
  // M12A: le tre zone della top bar restano bilanciate: Per voi, marchio US al centro, Left for You a destra.
  const css = read('identity.css');
  assert.match(css, /\.top\.us-premium-top \.us-top-brand\{[^}]*grid-column:2/);
  assert.match(css, /\.top\.us-premium-top \.top-actions\{[^}]*grid-column:3/);
});

test('M10.1B: openToday(), target push "today" e foglio Daily Question restano vivi', () => {
  assert.match(app, /window\.openToday=openToday;/);
  assert.match(app, /if\(target==='today'\)\{openToday\(\);return;\}/);
  assert.match(html, /id="usDailyRitual"[^>]*onclick="openToday\(\)"/, 'la card di Oggi apre il foglio');
  assert.match(html, /id="today"/);
  assert.match(html, /id="todaySaveBtn"/);
  assert.match(app, /action==='today'\)window\.openToday\?\.\(\)/);
});
