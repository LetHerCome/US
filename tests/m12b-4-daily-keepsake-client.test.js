// M12B.4 — client: Conserva on the Daily reveal and the kept Daily in the
// Ricordi living archive. The Conserva runtime and the archive logic run for
// real (vm) against a mocked Supabase client; wiring is asserted on source.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const app = read('app.js');
const between = (start, end) => {
  const i = app.indexOf(start); const j = app.indexOf(end, i + 1);
  assert.ok(i >= 0 && j > i, `slice ${start}`);
  return app.slice(i, j);
};
const KEEP_BLOCK = between('// M12B.4 — Conserva: dopo il reveal', '// M9E — la domanda di oggi');
const QID = '11111111-1111-4111-8111-111111111111';
const flush = () => new Promise((r) => setImmediate(r));

function install({ rows = [], loadError = null, rpc } = {}) {
  const calls = []; const toasts = []; let clickHandler = null;
  const node = { hidden: true, innerHTML: '', addEventListener: (type, fn) => { if (type === 'click') clickHandler = fn; } };
  const query = { select() { return query; }, eq(col, v) { calls.push(['eq', col, v]); return query; }, limit() { return Promise.resolve(loadError ? { data: null, error: loadError } : { data: rows, error: null }); } };
  const sb = {
    from(table) { calls.push(['from', table]); return query; },
    rpc(name, args) { calls.push(['rpc', name, args]); return rpc(name, args, calls); },
  };
  const window = { todayQuestion: { id: QID }, todayState: { both_answered: true } };
  const context = vm.createContext({
    window, sb, console: { warn() {} }, Promise, Error, Array, String, setTimeout,
    toast: (m) => toasts.push(m),
    document: { getElementById: (id) => (id === 'todayKeep' ? node : id === 'momentsGrid' ? { dataset: { loaded: '0' } } : null) },
  });
  vm.runInContext(KEEP_BLOCK, context);
  const tap = () => clickHandler({ target: { closest: (sel) => (sel === '[data-us-daily-keep]' ? {} : null) } });
  return { api: window.UsDailyKeepsake, node, calls, toasts, window, tap };
}
const ok = (status) => async () => ({ data: { status, question_id: QID, id: 'k', source_key: `daily_question:${QID}` }, error: null });

test('M12B.4 UI: before keeping, the revealed Daily shows a single "Conserva" action', async () => {
  const h = install({ rpc: ok('kept') });
  await h.api.load(QID);
  assert.equal(h.node.hidden, false);
  assert.match(h.node.innerHTML, /<button[^>]*data-us-daily-keep[^>]*>Conserva<\/button>/);
  assert.deepEqual(h.calls.slice(0, 2), [['from', 'daily_question_keepsakes'], ['eq', 'question_id', QID]]);
});

test('M12B.4 UI: an already kept Daily is restored as "Conservato nei Ricordi" after a reload (server row, no local copy)', async () => {
  const h = install({ rows: [{ id: 'k', kept_at: '2026-10-01T09:00:00Z', kept_by_role: 'beatrice' }], rpc: ok('existing') });
  await h.api.load(QID);
  assert.match(h.node.innerHTML, /Conservato nei Ricordi/);
  assert.doesNotMatch(h.node.innerHTML, /<button/);
  assert.equal(await h.api.keep().then((r) => r.status), 'noop', 'nothing to do once kept');
  assert.equal(h.calls.filter((c) => c[0] === 'rpc').length, 0);
});

test('M12B.4 UI: loading, then a double tap sends ONE request; success shows the kept state and one toast', async () => {
  let release;
  const h = install({ rpc: () => new Promise((r) => { release = () => r({ data: { status: 'kept', question_id: QID }, error: null }); }) });
  await h.api.load(QID);
  h.tap(); h.tap(); await flush();
  assert.match(h.node.innerHTML, /disabled aria-busy="true">Conservo…/);
  assert.equal(h.calls.filter((c) => c[0] === 'rpc').length, 1, 'repeated tap while saving is ignored');
  assert.equal(JSON.stringify(h.calls.find((c) => c[0] === 'rpc')), JSON.stringify(['rpc', 'keep_daily_question', { target_question_id: QID }]));
  release(); await flush();
  assert.match(h.node.innerHTML, /Conservato nei Ricordi/);
  assert.deepEqual(h.toasts, ['Conservato nei Ricordi ♡']);
});

test('M12B.4 UI: the partner kept it first ("existing") — same kept state, no duplicate celebration', async () => {
  const h = install({ rpc: ok('existing') });
  await h.api.load(QID);
  await h.api.keep();
  assert.match(h.node.innerHTML, /Conservato nei Ricordi/);
  assert.deepEqual(h.toasts, []);
});

test('M12B.4 UI: an offline/network error is honest and retryable; the retry reaches the idempotent server', async () => {
  let fail = true;
  const h = install({ rpc: async () => (fail ? { data: null, error: { message: 'Failed to fetch' } } : { data: { status: 'existing', question_id: QID }, error: null }) });
  await h.api.load(QID);
  await h.api.keep();
  assert.match(h.node.innerHTML, />Riprova<\/button>/);
  assert.match(h.node.innerHTML, /Non conservata\. Riprova quando torni online\./);
  fail = false;
  await h.api.keep();
  assert.match(h.node.innerHTML, /Conservato nei Ricordi/);
});

test('M12B.4 UI: the action exists only where the shared result is legitimately visible', async () => {
  const notReady = install({ rpc: ok('kept') });
  notReady.window.todayState = { both_answered: false, my_answer: 'x' };
  await notReady.api.load(QID);
  assert.equal(notReady.node.hidden, true);
  assert.equal((await notReady.api.keep()).status, 'noop');

  const otherQuestion = install({ rpc: ok('kept') });
  otherQuestion.window.todayQuestion = { id: 'another' };
  await otherQuestion.api.load(QID);
  assert.equal(otherQuestion.node.hidden, true, 'never for a question that is not on screen');

  const refused = install({ rpc: async () => ({ data: null, error: { code: '42501', message: 'daily_question_reveal_not_ready' } }) });
  await refused.api.load(QID);
  await refused.api.keep();
  assert.equal(refused.node.hidden, true, 'the server said no: the action disappears');

  const noBackend = install({ loadError: { code: '42P01', message: 'relation "public.daily_question_keepsakes" does not exist' }, rpc: ok('kept') });
  await noBackend.api.load(QID);
  assert.equal(noBackend.node.hidden, true, 'client shipped before the migration: no dead button');

  const offlineLoad = install({ loadError: { message: 'Failed to fetch' }, rpc: ok('existing') });
  await offlineLoad.api.load(QID);
  assert.match(offlineLoad.node.innerHTML, />Conserva</, 'unknown state offline: Conserva stays, the RPC answers existing if needed');

  const h = install({ rpc: ok('kept') });
  await h.api.load(QID); h.api.hide();
  assert.equal(h.node.hidden, true); assert.equal(h.node.innerHTML, '');
});

test('M12B.4 wiring: hydrateToday loads Conserva only after the reveal, hides it otherwise; the sheet has one slot', () => {
  const hydrate = between('async function hydrateToday(){', 'async function updateHomeStatus');
  const revealed = hydrate.slice(hydrate.indexOf('if(state?.both_answered){'), hydrate.indexOf('}else{', hydrate.indexOf('if(state?.both_answered){')));
  assert.match(revealed, /await dailyQuestionOutcomes\.load\(q,state\);[\s\S]*window\.UsDailyKeepsake\?\.load\?\.\(q\.id\)/);
  const notRevealed = hydrate.slice(hydrate.indexOf('}else{', hydrate.indexOf('if(state?.both_answered){')));
  assert.match(notRevealed, /window\.UsDailyKeepsake\?\.hide\?\.\(\)/);
  assert.match(between('function renderTodayQuestionUnavailable', 'const US_DAILY_REACTIONS'), /window\.UsDailyKeepsake\?\.hide\?\.\(\)/);
  const html = read('index.html');
  const sheet = html.match(/<main id="today"[\s\S]*?<\/main>/)[0];
  assert.equal((sheet.match(/id="todayKeep"/g) || []).length, 1);
  assert.ok(sheet.indexOf('id="todayReveal"') < sheet.indexOf('id="todayKeep"') && sheet.indexOf('id="todayKeep"') < sheet.indexOf('id="todayOutcome"'));
  assert.doesNotMatch(KEEP_BLOCK, /daily_answers|localStorage|sessionStorage/, 'never reads answers or keeps local state');
  assert.doesNotMatch(KEEP_BLOCK, /\.insert\(|\.upsert\(|\.update\(|\.delete\(/, 'writes only through keep_daily_question');
});

// ---- Ricordi living archive ----
const ARCHIVE = app.match(/\/\/ ===== M8A — Ricordi living archive =====[\s\S]*?(?=async function hydrateMomentsCore\(\))/)[0];
function archive() {
  const window = {};
  const context = vm.createContext({ window, document: { getElementById: () => null, querySelectorAll: () => [], querySelector: () => null }, escapeHtml: (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`), go() {}, openMomentViewer() {}, console });
  vm.runInContext(`${ARCHIVE}\nwindow.ricordiDailyCard=ricordiDailyCard;`, context);
  return window;
}
const kept = (id, date, extra = {}) => ({ id, source_key: `daily_question:${id}`, question_text: 'Quale posto per te ormai è “nostro”?', question_date: date,
  francesco_answer: 'Il lago', beatrice_answer: 'La terrazza <b>', revealed_at: `${date}T20:00:00Z`, ...extra });
const m = (id, date) => ({ id, moment_date: date, created_at: `${date}T10:00:00Z`, storage_path: `p/${id}`, created_by: 'u' });

test('M12B.4 archive: kept Dailies join La vostra storia on their Daily date, with Moments and lived experiences', () => {
  const w = archive();
  const t = w.UsRicordiArchive.timeline([m('m1', '2026-09-27'), m('m2', '2026-08-02')], [{ id: 'x', title: 'Mostra', completed_at: '2026-09-10T18:00:00' }],
    [kept('d1', '2026-09-15'), kept('bad', null), kept('nodate', '15/09/2026')]);
  assert.deepEqual([...t].map((i) => `${i.kind}:${i.row.id}`), ['moment:m1', 'daily:d1', 'experience:x', 'moment:m2']);
  assert.deepEqual([...w.UsRicordiArchive.timeline([m('m1', '2026-09-27')], [])].map((i) => i.kind), ['moment'], 'without keepsakes nothing changes');
  const ch = [...w.UsRicordiArchive.chapters(t)].map((c) => ({ year: c.year, moments: c.moments, experiences: c.experiences, dailies: c.dailies, cover: c.cover?.id }));
  assert.deepEqual(ch, [{ year: '2026', moments: 2, experiences: 1, dailies: 1, cover: 'm1' }]);
});

test('M12B.4 archive: the card says "Domanda del giorno · <date>", keeps the source key and shows both kept answers safely', () => {
  const w = archive();
  const html = w.ricordiDailyCard(kept('d1', '2026-10-12'));
  assert.match(html, /^<details class="ricordi-daily" data-ricordi-daily="d1" data-source-key="daily_question:d1">/);
  assert.match(html, /<small>Domanda del giorno · 12 ottobre<\/small>/);
  assert.match(html, /<b>Francesco<\/b><p>Il lago<\/p>/);
  assert.match(html, /<b>Bea<\/b><p>La terrazza &#60;b&#62;<\/p>/, 'escaped');
  assert.doesNotMatch(html, /<img|storage_path/, 'not a fake Moment');
});

test('M12B.4 archive wiring: Ricordi reads the keepsakes as an optional enrichment and renders them in the story', () => {
  const core = between('async function hydrateMomentsCore(){', 'let momentsHydrateInFlight');
  assert.match(core, /sb\.from\('daily_question_keepsakes'\)\.select\('id,source_key,question_text,question_date,francesco_answer,beatrice_answer,revealed_at'\)/);
  assert.match(core, /const keptRows=keptError\?\[\]:\(kept\|\|\[\]\);/, 'an unreadable keepsake table never breaks Ricordi');
  assert.match(core, /ricordiTimeline\([^;]*livedRows,keptRows\)/);
  assert.match(core, /if\(item\.kind==='daily'\)\{closeRow\(\);html\.push\(ricordiDailyCard\(item\.row\)\);continue;\}/);
  assert.match(core, /keptRows\.map\(r=>\[r\.id,r\.question_date\]\)/, 'a new keepsake re-renders the story');
  assert.match(core, /if\(!rows\?\.length&&!livedRows\.length&&!keptRows\.length\)/);
  assert.match(between('function ricordiPickRivivi', 'function ricordiChapters'), /moments/, 'Rivivi is unchanged (M12B.5 will consume the source)');
  assert.doesNotMatch(between('function ricordiPickRivivi', 'function ricordiChapters'), /daily/);
  const css = read('moments-albums.css');
  assert.match(css, /#moments \.ricordi-daily-mark::before\{[^}]*mask-image:url\("\/assets\/icons\/phosphor\/question-regular\.svg"\)/, 'approved Phosphor icon already in the shell');
  assert.match(read('service-worker.js'), /"\/assets\/icons\/phosphor\/question-regular\.svg"/);
});
