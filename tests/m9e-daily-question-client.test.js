// M9E — client: hydrateToday() gets today's concrete question ONLY through
// get_or_create_daily_question, distinguishes loading / real failure / ready,
// never offers an editable answer without a valid question, and keeps
// get_daily_state + the daily_answer notification flow unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const app = read('app.js');
const slice = (from, to) => { const a = app.indexOf(from); const b = app.indexOf(to, a); assert.ok(a >= 0 && b > a, `${from}…${to}`); return app.slice(a, b); };

function el(extra = {}) {
  return { textContent: '', innerHTML: '', value: '', hidden: false, disabled: false, dataset: {}, className: '',
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); } }, ...extra };
}
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }

function install({ rpc, upsert } = {}) {
  const nodes = { qtext: el(), locked: el(), todayReveal: el(), todaySaveBtn: el(), answer: el() };
  const calls = []; const refreshes = []; const pushes = []; const toasts = []; const upserts = [];
  const sb = {
    rpc: (name, args) => { calls.push([name, args]); return rpc(name, args); },
    from: (table) => ({ upsert: (row, opts) => { upserts.push([table, row, opts]); return Promise.resolve(upsert ? upsert(row) : { error: null }); } }),
  };
  const window = { usProfile: { id: 'f', couple_id: 'c', role: 'francesco' }, UsTodayPriority: { refresh: (arg) => refreshes.push(arg), render() {} } };
  const context = vm.createContext({
    console: { warn() {} }, Promise, Intl, Date, Error,
    window, sb,
    document: { querySelector: (s) => (s === '#today .qtext' ? nodes.qtext : null), getElementById: (id) => nodes[id] || null },
    dailyQuestionOutcomes: { hide() {}, async load() {} },
    updateHomeStatus() {},
    escapeHtml: (v) => String(v),
    dailyRitualPartnerName: () => 'Beatrice',
    localDateISO: () => 'LOCAL',
    toast: (m) => toasts.push(m),
    sendWebPushEvent: (type, id) => { pushes.push([type, id]); return Promise.resolve(); },
  });
  vm.runInContext(`${slice('// M9E — la domanda di oggi', 'async function updateHomeStatus')}\nwindow.hydrateToday=hydrateToday;window.usDailyQuestionDay=usDailyQuestionDay;`, context);
  vm.runInContext(`${slice('saveAnswer = async function(){', 'window.saveAnswer=saveAnswer;')}\nwindow.saveAnswer=saveAnswer;`, context);
  return { nodes, calls, refreshes, pushes, toasts, upserts, window, context, hydrate: () => window.hydrateToday() };
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const Q = () => ({ id: 'q-today', question: 'Cosa ti farebbe partire bene questa settimana?', question_date: today(), theme: 'noi_adesso', day_timezone: 'Europe/Rome' });
const EMPTY = { my_answer: null, partner_has_answer: false, both_answered: false, partner_answer: null };
const ok = (q = Q(), state = EMPTY) => (name) => Promise.resolve(name === 'get_or_create_daily_question' ? { data: q, error: null } : { data: state, error: null });

test('M9E client: hydrateToday usa get_or_create_daily_question, poi get_daily_state sul suo id', async () => {
  const t = install({ rpc: ok() });
  await t.hydrate();
  assert.deepEqual(t.calls.map((c) => c[0]), ['get_or_create_daily_question', 'get_daily_state']);
  assert.equal(t.calls[0][1], undefined, 'no client date is sent');
  assert.deepEqual({ ...t.calls[1][1] }, { target_question_id: 'q-today' });
  assert.equal(t.nodes.qtext.textContent, Q().question);
  assert.equal(t.nodes.answer.hidden, false); assert.equal(t.nodes.answer.disabled, false);
  assert.equal(t.nodes.todaySaveBtn.hidden, false); assert.equal(t.nodes.todaySaveBtn.textContent, 'Rispondi');
  assert.equal(t.window.todayQuestion.id, 'q-today');
  assert.equal(t.refreshes.at(-1).daily.question.id, 'q-today', 'M9B card is fed by the new authority');
});

test('M9E client: durante il caricamento nessuna textarea né invio', async () => {
  const pending = deferred();
  const t = install({ rpc: (name) => (name === 'get_or_create_daily_question' ? pending.promise : ok()(name)) });
  const run = t.hydrate();
  assert.equal(t.nodes.qtext.textContent, 'Sto preparando la domanda di oggi…');
  assert.equal(t.nodes.answer.hidden, true); assert.equal(t.nodes.answer.disabled, true);
  assert.equal(t.nodes.todaySaveBtn.hidden, true); assert.equal(t.nodes.todaySaveBtn.disabled, true);
  pending.resolve({ data: Q(), error: null });
  await run;
  assert.equal(t.nodes.answer.hidden, false);
});

for (const [label, rpc] of [
  ['errore backend', () => Promise.resolve({ data: null, error: { code: 'P0002', message: 'daily_question_template_bank_empty' } })],
  ['rete assente', () => Promise.reject(new Error('Failed to fetch'))],
  ['payload non valido', () => Promise.resolve({ data: { id: '', question: '' }, error: null })],
  ['nessun dato', () => Promise.resolve({ data: null, error: null })],
]) {
  test(`M9E client: ${label} → stato di errore onesto con Riprova, mai una textarea`, async () => {
    const t = install({ rpc });
    await t.hydrate();
    assert.equal(t.nodes.qtext.textContent, 'Non riesco a caricare la domanda di oggi.');
    assert.equal(t.nodes.locked.textContent, 'Controlla la connessione e riprova.');
    assert.equal(t.nodes.answer.hidden, true); assert.equal(t.nodes.answer.disabled, true);
    assert.equal(t.nodes.todaySaveBtn.hidden, false); assert.equal(t.nodes.todaySaveBtn.disabled, false);
    assert.equal(t.nodes.todaySaveBtn.textContent, 'Riprova');
    assert.equal(t.nodes.todaySaveBtn.dataset.usTodayMode, 'retry');
    assert.equal(t.window.todayQuestion, null);
    assert.deepEqual({ ...t.refreshes.at(-1).daily }, { status: 'error' });
    assert.ok(!t.calls.some((c) => c[0] === 'get_daily_state'));
  });
}

test('M9E client: Riprova ritenta il RPC e non salva nessuna risposta', async () => {
  let fail = true;
  const t = install({ rpc: (name) => (name === 'get_or_create_daily_question' && fail ? Promise.resolve({ data: null, error: { message: 'down' } }) : ok()(name)) });
  await t.hydrate();
  fail = false;
  await t.window.saveAnswer();
  assert.equal(t.upserts.length, 0);
  assert.equal(t.pushes.length, 0);
  assert.equal(t.nodes.qtext.textContent, Q().question);
  assert.equal(t.calls.filter((c) => c[0] === 'get_or_create_daily_question').length, 2);
});

test('M9E client: un errore transitorio non cancella la domanda valida di oggi', async () => {
  let fail = false;
  const t = install({ rpc: (name) => (name === 'get_or_create_daily_question' && fail ? Promise.resolve({ data: null, error: { message: 'blip' } }) : ok()(name)) });
  await t.hydrate();
  t.nodes.answer.value = 'bozza';
  fail = true;
  await t.hydrate();
  assert.equal(t.window.todayQuestion.id, 'q-today');
  assert.equal(t.nodes.qtext.textContent, Q().question);
  assert.equal(t.nodes.answer.hidden, false);
  assert.equal(t.nodes.answer.value, 'bozza');
});

test('M9E client: una risposta lenta superata da una più recente viene ignorata; al cambio giorno la bozza non passa alla nuova domanda', async () => {
  const slow = deferred();
  let n = 0;
  const t = install({ rpc: (name) => {
    if (name !== 'get_or_create_daily_question') return ok()(name);
    n += 1;
    return n === 1 ? slow.promise : Promise.resolve({ data: { ...Q(), id: 'q-new', question: 'Nuova' }, error: null });
  } });
  const first = t.hydrate();
  await t.hydrate();
  slow.resolve({ data: { ...Q(), id: 'q-old', question: 'Vecchia' }, error: null });
  await first;
  assert.equal(t.window.todayQuestion.id, 'q-new');
  assert.equal(t.nodes.qtext.textContent, 'Nuova');

  const y = install({ rpc: ok({ ...Q(), id: 'q-yesterday', question_date: '2000-01-01' }) });
  await y.hydrate();
  y.nodes.answer.value = 'bozza di ieri';
  y.calls.length = 0;
  y.context.sb.rpc = (name) => { y.calls.push([name]); return ok()(name); };
  await y.hydrate();
  assert.equal(y.window.todayQuestion.id, 'q-today');
  assert.equal(y.nodes.answer.value, '');
});

test('M9E client: reveal e partner nascosto restano quelli di get_daily_state', async () => {
  const waiting = install({ rpc: ok(Q(), { my_answer: null, partner_has_answer: true, both_answered: false, partner_answer: null }) });
  await waiting.hydrate();
  assert.match(waiting.nodes.locked.innerHTML, /Rispondi per sbloccarla/);
  assert.equal(waiting.nodes.todayReveal.innerHTML, '');
  const reveal = install({ rpc: ok(Q(), { my_answer: 'Mia', partner_has_answer: true, both_answered: true, partner_answer: 'Sua' }) });
  await reveal.hydrate();
  assert.match(reveal.nodes.todayReveal.innerHTML, /Mia[\s\S]*Sua/);
  assert.equal(reveal.nodes.todaySaveBtn.textContent, 'Risposte sbloccate');
});

test('M9E client: nessuna regressione nel flusso di notifica daily_answer', async () => {
  const t = install({ rpc: ok() });
  await t.hydrate();
  t.nodes.answer.value = '  La mia risposta  ';
  await t.window.saveAnswer();
  assert.equal(t.upserts.length, 1);
  const [table, row, opts] = t.upserts[0];
  assert.equal(table, 'daily_answers');
  assert.equal(row.question_id, 'q-today');
  assert.equal(row.answer, 'La mia risposta');
  assert.equal(opts.onConflict, 'question_id,user_id');
  assert.deepEqual(t.pushes, [['daily_answer', 'q-today']]);
  const push = read('supabase/functions/send-web-push/index.ts');
  assert.match(push, /from\("daily_questions"\)\.select\("id"\)\.eq\("id", questionId\)/, 'push validates the question by id, which materialized rows satisfy');
});

test('M9E client: giorno client allineato a Europe/Rome attorno alla mezzanotte', () => {
  const t = install({ rpc: ok() });
  const day = (iso) => t.window.usDailyQuestionDay(new Date(iso));
  assert.equal(day('2026-09-30T21:59:59Z'), '2026-09-30');
  assert.equal(day('2026-09-30T22:00:00Z'), '2026-10-01');
  assert.equal(day('2026-12-31T22:59:59Z'), '2026-12-31');
  assert.equal(day('2026-12-31T23:00:00Z'), '2027-01-01');
});

test('M9E client: una sola authority, niente fallback da seed scaduto, card M9B con stato di errore', () => {
  const hydrate = slice('async function hydrateToday(){', 'async function updateHomeStatus');
  assert.doesNotMatch(app, /from\('daily_questions'\)/, 'client never queries daily_questions by date');
  assert.equal((app.match(/rpc\('get_or_create_daily_question'/g) || []).length, 1);
  assert.equal((app.match(/rpc\('get_daily_state'/g) || []).length, 1);
  assert.doesNotMatch(app, /La prossima domanda sta arrivando/);
  assert.doesNotMatch(hydrate, /localDateISO/);

  const source = app.slice(app.indexOf('const US_TODAY_PRIORITY_ORDER='), app.indexOf('function localDateISO()'));
  const card = { hidden: true, innerHTML: '', dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } };
  const window = { usProfile: { role: 'francesco' }, usBondProfiles: [] };
  const ctx = vm.createContext({ console, window, Promise, document: { getElementById: (id) => (id === 'usDailyRitual' ? card : null) }, escapeHtml: (v) => String(v), partnerFromProfiles: () => null });
  vm.runInContext(source, ctx);
  const model = window.UsDailyRitual.viewModel({ status: 'error' });
  assert.equal(model.state, 'error');
  assert.equal(model.cta, 'Riprova');
  window.UsDailyRitual.render(model);
  assert.equal(card.hidden, false);
  assert.equal(card.dataset.state, 'error');
  assert.equal(window.UsDailyRitual.viewModel({ daily: null }), null);

  const css = read('styles.css');
  assert.match(css, /\.us-daily-ritual\[data-state="error"\]/);
  assert.match(css, /#answer\[hidden\],#todaySaveBtn\[hidden\]\{display:none!important\}/);
  const html = read('index.html');
  assert.match(html, /<textarea id="answer" rows="4" placeholder="Scrivi la tua risposta\.\.\." hidden disabled><\/textarea>/);
  assert.match(html, /id="todaySaveBtn" onclick="saveAnswer\(\)" hidden disabled>/);
  assert.doesNotMatch(html, /Qual è una cosa che vorresti rifare insieme per la prima volta\?/, 'no hard-coded fake question before hydration');
});
