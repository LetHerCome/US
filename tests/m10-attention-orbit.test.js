// M10E — ONE shared personal attention orbit. It means "YOU still have
// something to do or see", never "the shared flow is incomplete".
//   Daily Question: ON iff get_daily_state().my_answer == null (never both_answered).
//   Left for You:   ON iff the CURRENT recipient's unseenCount > 0.
//   Ti penso:       ON only for a received Ti penso not yet handled.
//   Calendar, passive widgets, completed Daily Question: never.
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
const ALL_CSS = fs.readdirSync(ROOT).filter((f) => f.endsWith('.css')).map((f) => [f, read(f)]);

function fakeEl() {
  const attrs = {};
  return { hidden: true, innerHTML: '', dataset: {}, setAttribute(k, v) { attrs[k] = String(v); }, removeAttribute(k) { delete attrs[k]; }, attrs };
}
function installOggi({ role = 'francesco' } = {}) {
  const card = fakeEl(); const region = { ...fakeEl(), addEventListener() {} };
  const window = { usProfile: { role }, usBondProfiles: [] };
  const context = vm.createContext({
    console, Promise, window,
    document: { getElementById: (id) => (id === 'usDailyRitual' ? card : id === 'usTodayPriorityRegion' ? region : null) },
    escapeHtml: (v) => String(v),
    partnerFromProfiles: () => null,
  });
  vm.runInContext(app.slice(app.indexOf('const US_TODAY_PRIORITY_ORDER='), app.indexOf('function localDateISO()')), context);
  return { window, card, region, context };
}
const question = { id: 'q-1', question: 'Cosa ti farebbe partire bene questa settimana?', question_date: '2026-10-05' };
// What get_daily_state returns to EACH member (my_answer is always "mine").
const stateFor = (me, other) => ({ my_answer: me, partner_has_answer: other != null, both_answered: me != null && other != null, partner_answer: me != null && other != null ? other : null });
const orbit = (state) => {
  const t = installOggi();
  t.window.UsDailyRitual.render(t.window.UsDailyRitual.viewModel({ question, state }));
  return t.card.dataset.usAttention;
};

test('M10E.2: Domanda del giorno — i quattro casi esatti, per ciascun partner', () => {
  const cases = [
    ['nessuno ha risposto', null, null, 'on', 'on'],
    ['Beatrice sì, Francesco no', null, 'B', 'on', 'off'],
    ['Francesco sì, Beatrice no', 'F', null, 'off', 'on'],
    ['entrambi', 'F', 'B', 'off', 'off'],
  ];
  for (const [label, f, b, fOrbit, bOrbit] of cases) {
    assert.equal(orbit(stateFor(f, b)), fOrbit, `${label}: Francesco`);
    assert.equal(orbit(stateFor(b, f)), bOrbit, `${label}: Beatrice`);
  }
});

test('M10E.2: l’attenzione segue my_answer, MAI both_answered', () => {
  // Deliberately contradictory inputs: only my_answer decides.
  assert.equal(orbit({ my_answer: 'Mia', partner_has_answer: false, both_answered: false }), 'off', 'waiting for the partner is not MY action');
  assert.equal(orbit({ my_answer: null, partner_has_answer: true, both_answered: false }), 'on');
  const vmSource = slice('function dailyRitualViewModel(source){', 'function renderDailyRitual(model){');
  assert.match(vmSource, /const attention=state\.my_answer==null;/);
  assert.doesNotMatch(vmSource, /attention\s*=[^;\n]*both_answered/);
  assert.equal(orbit(undefined), 'off');
  const t = installOggi();
  t.window.UsDailyRitual.render(t.window.UsDailyRitual.viewModel({ status: 'error' }));
  assert.equal(t.card.dataset.usAttention, 'off', 'backend error → no attention');
  t.window.UsDailyRitual.render(null);
  assert.equal(t.card.dataset.usAttention, 'off');
});

test('M10E.2: l’orbit si spegne dopo il salvataggio, dallo stato canonico riletto — non dal click', async () => {
  let saved = false; let failSave = false;
  const nodes = { qtext: {}, locked: {}, todayReveal: { classList: { add() {}, remove() {} } }, todaySaveBtn: { dataset: {} }, answer: { value: '' } };
  const refreshes = [];
  const sb = {
    rpc: (name) => Promise.resolve(name === 'get_or_create_daily_question'
      ? { data: { ...question, question_date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date()) }, error: null }
      : { data: stateFor(saved ? 'La mia' : null, null), error: null }),
    from: () => ({ upsert: () => { if (!failSave) saved = true; return Promise.resolve({ error: failSave ? { message: 'offline' } : null }); } }),
  };
  const window = { usProfile: { id: 'f', couple_id: 'c', role: 'francesco' }, UsTodayPriority: { refresh: (arg) => refreshes.push(arg) } };
  const ctx = vm.createContext({
    console: { warn() {} }, Promise, Intl, Date, Error, window, sb,
    document: { querySelector: () => nodes.qtext, getElementById: (id) => nodes[id] },
    dailyQuestionOutcomes: { hide() {}, async load() {} }, updateHomeStatus() {}, escapeHtml: String,
    dailyRitualPartnerName: () => 'Beatrice', localDateISO: () => 'x', toast() {}, sendWebPushEvent: () => Promise.resolve(),
  });
  vm.runInContext(`${slice('// M9E — la domanda di oggi', 'async function updateHomeStatus')}\n${slice('saveAnswer = async function(){', 'window.saveAnswer=saveAnswer;')}\nwindow.hydrateToday=hydrateToday;window.saveAnswer=saveAnswer;`, ctx);
  const cardFor = (arg) => { const t = installOggi(); t.window.UsDailyRitual.render(t.window.UsDailyRitual.viewModel(arg.daily)); return t.card.dataset.usAttention; };

  await window.hydrateToday();
  assert.equal(cardFor(refreshes.at(-1)), 'on');
  failSave = true; nodes.answer.value = 'La mia';
  await window.saveAnswer();
  assert.equal(cardFor(refreshes.at(-1)), 'on', 'a failed save never turns the orbit off');
  failSave = false;
  const before = refreshes.length;
  await window.saveAnswer();
  assert.ok(refreshes.length > before, 'save is followed by a canonical re-read');
  assert.equal(refreshes.at(-1).daily.state.my_answer, 'La mia');
  assert.equal(cardFor(refreshes.at(-1)), 'off', 'OFF right after MY save, without waiting for the partner');
});

// --- Left for You -----------------------------------------------------------
function leftForYouHarness({ me, rows }) {
  const elements = new Map();
  const mk = (id) => {
    const classes = new Set(); const attrs = {};
    return { id, hidden: true, value: '', textContent: '', innerHTML: '', dataset: {}, classList: { add: (...n) => n.forEach((x) => classes.add(x)), remove: (...n) => n.forEach((x) => classes.delete(x)), contains: (n) => classes.has(n), toggle: (n, f) => { const v = f === undefined ? !classes.has(n) : Boolean(f); if (v) classes.add(n); else classes.delete(n); return v; } }, setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: (k) => attrs[k] ?? null, removeAttribute: (k) => { delete attrs[k]; }, addEventListener() {}, querySelector: () => mk(`${id}-child`) };
  };
  const document = { getElementById: (id) => { if (!elements.has(id)) elements.set(id, mk(id)); return elements.get(id); }, querySelectorAll: () => [], querySelector: () => ({ querySelector: () => mk('n') }), createElement: (t) => mk(t), addEventListener() {}, readyState: 'complete' };
  const queries = [];
  // A tiny server: applies eq/is filters like PostgREST would.
  const from = (table) => {
    const filters = [];
    const b = {
      select: () => b, order: () => b,
      eq: (col, val) => { filters.push([col, val]); if (table === 'left_for_you') queries.push([col, val]); return b; },
      is: (col, val) => { filters.push([col, val]); return b; },
      then: (res, rej) => Promise.resolve({ data: table === 'profiles' ? [{ id: 'francesco-id', display_name: 'Francesco' }, { id: 'beatrice-id', display_name: 'Beatrice' }] : rows.filter((r) => filters.every(([c, v]) => r[c] === v)).map((r) => ({ ...r })), error: null }).then(res, rej),
    };
    return b;
  };
  const sb = { from, rpc: (name, args) => { const row = rows.find((r) => r.id === args.target_item_id); if (row) row.seen_at = '2026-10-05T10:00:00Z'; return Promise.resolve({ data: { seen_at: row?.seen_at }, error: null }); }, channel: () => { const c = { on: () => c, subscribe: () => c }; return c; }, removeChannel() {} };
  const window = { document, addEventListener() {}, dispatchEvent() {}, usProfile: { id: me, couple_id: 'c', role: me === 'francesco-id' ? 'francesco' : 'beatrice', display_name: me }, sb, __US_LEFT_FOR_YOU_RENDERER_ONLY__: true };
  window.navigator = window;
  const context = { module: { exports: {} }, window, document, console: { warn() {}, error() {} }, URL, setTimeout, clearTimeout, crypto: require('node:crypto'), navigator: window, Blob };
  vm.runInNewContext(read('left-for-you.js'), context, { filename: 'left-for-you.js' });
  return { api: context.module.exports, envelope: () => document.getElementById('leftForYouPartnerEntry'), queries };
}
const lfyRows = () => [
  ...['a', 'b', 'c'].map((id) => ({ id: `to-f-${id}`, sender_id: 'beatrice-id', recipient_id: 'francesco-id', kind: 'text', body: 'Per te', seen_at: null, created_at: '2026-10-05T09:00:00Z' })),
  ...['x', 'y'].map((id) => ({ id: `to-b-${id}`, sender_id: 'francesco-id', recipient_id: 'beatrice-id', kind: 'text', body: 'Per te', seen_at: null, created_at: '2026-10-05T09:00:00Z' })),
];

test('M10E.1: Lasciato per te — Francesco riceve 3 item → ON; li vede tutti → OFF subito dopo l’ultimo', async () => {
  const rows = lfyRows();
  const { api, envelope, queries } = leftForYouHarness({ me: 'francesco-id', rows });
  api.applyEnvelopeState();
  assert.equal(envelope().dataset.usAttention, 'off', 'loading → off');
  await api.handleIncoming();
  assert.equal(envelope().dataset.usAttention, 'on');
  assert.ok(queries.some(([c, v]) => c === 'recipient_id' && v === 'francesco-id'), 'unseenCount is scoped to the current recipient');
  await api.load(); // views item 1 (server marks it seen)
  assert.equal(envelope().dataset.usAttention, 'on', '2 left');
  await api.load(); // item 2
  assert.equal(envelope().dataset.usAttention, 'on', '1 left');
  await api.load(); // item 3, the last unseen
  assert.equal(envelope().dataset.usAttention, 'off', 'last unseen viewed → off immediately');
  assert.equal(envelope().classList.contains('is-open'), true, 'envelope state machine agrees');
  // Beatrice still has 2 unseen items: irrelevant to Francesco.
  assert.equal(rows.filter((r) => r.recipient_id === 'beatrice-id' && !r.seen_at).length, 2);
});

test('M10E.1: lo stato non letto del partner non accende mai la busta dell’utente corrente', async () => {
  const rows = lfyRows().map((r) => (r.recipient_id === 'francesco-id' ? { ...r, seen_at: '2026-10-05T08:00:00Z' } : r));
  const f = leftForYouHarness({ me: 'francesco-id', rows });
  await f.api.handleIncoming();
  assert.equal(f.envelope().dataset.usAttention, 'off', 'Francesco saw everything; Beatrice unread does not matter');
  const b = leftForYouHarness({ me: 'beatrice-id', rows });
  await b.api.handleIncoming();
  assert.equal(b.envelope().dataset.usAttention, 'on', 'Beatrice has her own unseen items');
  // Direct derivation: unseenCount > 0 ⇔ on.
  f.api.updateEntry(1); assert.equal(f.envelope().dataset.usAttention, 'on');
  f.api.updateEntry(0); assert.equal(f.envelope().dataset.usAttention, 'off');
  assert.match(read('left-for-you.js'), /el\.dataset\.usAttention = unseenCount > 0 \? 'on' : 'off';/);
});

// --- Other personal priorities ----------------------------------------------
test('M10E.3: solo un Ti penso ricevuto e non gestito accende l’orbit; impegni e card passive mai', () => {
  const t = installOggi();
  const api = t.window.UsTodayPriority;
  api.render([{ id: 'think-received:1', factKey: 'think:1', category: 'received_ready', attention: true, title: 'Bea ti pensa', action: 'think', actionLabel: 'Apri' }]);
  assert.match(t.region.innerHTML, /class="us-today-priority-card us-attention-orbit" data-us-attention="on"/);
  const event = api.eventViewModel({ id: 'e', title: 'Cena', days_left: 0, effective_date: '2026-10-05', event_time: '20:30' });
  assert.equal(event.attention, false);
  api.render([event]);
  assert.match(t.region.innerHTML, /data-us-attention="off"/);
  assert.match(app, /arrivalType:'think-received',\s*category:'received_ready',[\s\S]{0,200}attention:true/);
  // Calendar widget, distance, push opt-in, empty state, memories: never hosts.
  const hosts = [...html.matchAll(/<[^>]+class="[^"]*us-attention-orbit[^"]*"[^>]*>/g)].map((m) => m[0].match(/id="([^"]+)"/)?.[1]);
  assert.deepEqual(hosts.sort(), ['leftForYouPartnerEntry', 'usDailyRitual']);
  for (const passive of ['renderOggiCalendarWidget', 'function renderHomeMoment', 'function refreshMyLocation']) {
    const at = app.indexOf(passive);
    if (at >= 0) assert.doesNotMatch(app.slice(at, at + 1500), /us-attention-orbit|usAttention/);
  }
});

// --- Primitive ----------------------------------------------------------------
test('M10E: un solo primitive condiviso, in ui-foundation, senza animazioni parallele', () => {
  const foundation = read('ui-foundation.css');
  assert.match(foundation, /\.us-attention-orbit::after\{[\s\S]*pointer-events:none;/);
  assert.match(foundation, /\.us-attention-orbit\[data-us-attention="on"\]::after\{[\s\S]*animation:us-attention-orbit var\(--us-attention-period,3\.2s\) linear infinite;/);
  const period = Number(foundation.match(/--us-attention-period,([\d.]+)s/)[1]);
  assert.ok(period >= 2.5 && period <= 4, 'one rotation every 2.5–4 s');
  const keyframes = ALL_CSS.filter(([, s]) => /@keyframes us-attention-orbit/.test(s)).map(([f]) => f);
  assert.deepEqual(keyframes, ['ui-foundation.css'], 'defined once');
  for (const [file, source] of ALL_CSS) {
    assert.doesNotMatch(source, /us-envelope-trace/, `${file}: the old bespoke envelope trace is gone`);
  }
  // No flashing / scale pulse in the primitive.
  const block = foundation.slice(foundation.indexOf('M10E — Personal attention orbit'));
  assert.doesNotMatch(block, /scale\(|steps\(|infinite alternate/);
  // Every host writes the same attribute from its own canonical state.
  assert.match(app, /card\.dataset\.usAttention=model\.attention\?'on':'off';/);
  assert.match(app, /data-us-attention="\$\{item\.attention\?'on':'off'\}"/);
});

test('M10E: reduced motion → nessuna rotazione, alone statico visibile', () => {
  const foundation = read('ui-foundation.css');
  const reduced = foundation.slice(foundation.lastIndexOf('@media (prefers-reduced-motion:reduce){'));
  assert.match(reduced, /\.us-attention-orbit\[data-us-attention="on"\]::after\{[\s\S]*animation:none;[\s\S]*background:linear-gradient/);
});

test('M10E: il primitive non tocca tap, focus o aria degli host', () => {
  const lfyCss = read('left-for-you.css');
  assert.match(lfyCss, /#leftForYouPartnerEntry\.us-envelope-control\{--us-attention-inset:-3px;position:relative;/);
  assert.match(read('styles.css'), /\.us-today-priority-card\{position:relative;pointer-events:auto\}/);
  assert.match(read('styles.css'), /\.us-daily-ritual\{position:relative;/);
  assert.match(read('styles.css'), /\.us-daily-ritual:focus-visible\{outline/);
  assert.match(html, /id="leftForYouPartnerEntry" onclick="usEnvelopeTap\(\)" aria-label="Lasciato per te"/);
  assert.match(html, /id="usDailyRitual" hidden onclick="openToday\(\)"/);
});
