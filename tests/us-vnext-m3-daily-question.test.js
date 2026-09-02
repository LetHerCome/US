const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function outcomeRuntimeSource() {
  const source = read('app.js');
  const start = source.indexOf('function dailyQuestionOutcomeRuntime(');
  const end = source.indexOf('async function updateHomeStatus()', start);
  assert.notEqual(start, -1, 'M3 deve esporre un runtime Daily Question post-reveal focalizzato');
  assert.notEqual(end, -1, 'il runtime M3 deve restare prima dello status Home');
  return source.slice(start, end);
}

function installRuntime({ selectResult = { data: [], error: null }, rpcResult = { data: { status: 'saved', id: 'mine', revision: 1, body: 'Ci provo' }, error: null } } = {}) {
  const calls = [];
  const elements = new Map();
  const document = {
    getElementById(id) { return elements.get(id) || null; },
    querySelector() { return null; }
  };
  const query = {
    select(columns) { calls.push(['select', columns]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    order(column) { calls.push(['order', column]); return Promise.resolve(selectResult); }
  };
  const context = vm.createContext({
    console: { warn() {} },
    crypto: { randomUUID: () => 'operation-1' },
    document,
    escapeHtml: (value) => String(value),
    sb: {
      from(table) { calls.push(['from', table]); return query; },
      rpc(name, args) { calls.push(['rpc', name, args]); return Promise.resolve(rpcResult); }
    },
    window: { usProfile: { role: 'francesco' }, todayQuestion: { id: 'question-1' }, todayState: { both_answered: true } }
  });
  vm.runInContext(`${outcomeRuntimeSource()}\nwindow.dailyQuestionOutcomeRuntime=dailyQuestionOutcomeRuntime();`, context);
  return { api: context.window.dailyQuestionOutcomeRuntime, calls, context, elements };
}

test('M3 integra una regione post-reveal nell overlay Today esistente', () => {
  const html = read('index.html');
  const today = html.match(/<main id="today"[\s\S]*?<\/main>/)?.[0] || '';
  assert.match(today, /id="todayOutcome"/);
  assert.match(today, /data-us-today-outcome/);
  assert.match(read('app.js'), /window\.saveDailyQuestionOutcome=/);
  assert.match(read('app.js'), /window\.deleteDailyQuestionOutcome=/);
  assert.doesNotMatch(read('app.js'), /daily_question_outcomes[^\n]{0,120}channel\(/);
});

test('M3 legge outcome RLS-scoped solo dopo both_answered', async () => {
  const { api, calls } = installRuntime();
  await api.load({ id: 'question-1' }, { both_answered: false });
  assert.equal(calls.length, 0);

  await api.load({ id: 'question-1' }, { both_answered: true });
  assert.deepEqual(calls, [
    ['from', 'daily_question_outcomes'],
    ['select', 'id,author_role,body,revision'],
    ['eq', 'question_id', 'question-1'],
    ['order', 'created_at']
  ]);
});

test('M3 salva solo tramite RPC con revision owner e non persiste il draft', async () => {
  const { api, calls } = installRuntime({ selectResult: { data: [{ id: 'mine', author_role: 'francesco', body: 'Prima', revision: 4 }], error: null } });
  await api.load({ id: 'question-1' }, { both_answered: true });
  await api.save('Dopo');
  const rpc = calls.find((call) => call[0] === 'rpc');
  assert.deepEqual(JSON.parse(JSON.stringify(rpc)), ['rpc', 'save_daily_question_outcome', {
    target_question_id: 'question-1', target_body: 'Dopo', operation_id: 'operation-1', expected_revision: 4
  }]);
  assert.doesNotMatch(outcomeRuntimeSource(), /localStorage|sessionStorage/);
});

test('M3 lascia il testo locale e il reveal intatto in errore/offline e gestisce stale', async () => {
  const { api, context } = installRuntime({ rpcResult: { data: null, error: new Error('offline') } });
  context.window.todayOutcomeState = { questionId: 'question-1', rows: [], draft: 'Resta qui' };
  const result = await api.save('Resta qui');
  assert.equal(result.status, 'error');
  assert.equal(context.window.todayOutcomeState.draft, 'Resta qui');

  const stale = installRuntime({ rpcResult: { data: { status: 'stale', revision: 2 }, error: null } });
  stale.context.window.todayOutcomeState = { questionId: 'question-1', rows: [], draft: 'Non perdere' };
  const staleResult = await stale.api.save('Non perdere');
  assert.equal(staleResult.status, 'stale');
  assert.equal(stale.context.window.todayOutcomeState.draft, 'Non perdere');
});

test('M3 rende il partner read-only e hard-delete solo per l owner con already_absent idempotente', async () => {
  const { api, calls } = installRuntime({
    selectResult: { data: [
      { id: 'mine', author_role: 'francesco', body: 'Mia', revision: 3 },
      { id: 'partner', author_role: 'beatrice', body: 'Sua', revision: 2 }
    ], error: null },
    rpcResult: { data: { status: 'already_absent' }, error: null }
  });
  await api.load({ id: 'question-1' }, { both_answered: true });
  const view = api.view();
  assert.match(view, /Mia/);
  assert.match(view, /Sua/);
  assert.match(view, /data-us-today-outcome-owner/);
  assert.match(view, /data-us-today-outcome-partner><b>Bea<\/b><p>Sua<\/p><\/article>/);

  const result = await api.remove();
  assert.equal(result.status, 'already_absent');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.find((call) => call[0] === 'rpc'))), ['rpc', 'delete_daily_question_outcome', {
    target_question_id: 'question-1', expected_revision: 3
  }]);
});

test('M3 mantiene openToday/closeToday, refresh su apertura e visibilita senza nuova navigation authority', () => {
  const app = read('app.js');
  assert.match(app, /function openToday\(\)[\s\S]{0,500}hydrateToday\(\)/);
  assert.match(app, /const todayOpen=document\.getElementById\('today'\)\?\.classList\.contains\('open'\);[\s\S]{0,300}if\(active==='home'\|\|todayOpen\)[\s\S]{0,100}hydrateToday\(\)/);
  assert.doesNotMatch(outcomeRuntimeSource(), /\b(go|history\.pushState|replaceState|addEventListener\(['"]postgres_changes)/);
});

test('M3 reveal helper delega a get_daily_state e non conta daily_answers autonomamente', () => {
  const migration = read('supabase/migrations/20260902101619_daily_question_reveal_authority.sql');
  assert.match(migration, /create or replace function private\.daily_question_reveal_ready\(target_question_id uuid\)/);
  assert.match(migration, /public\.get_daily_state\(target_question_id\)/);
  assert.match(migration, /->>\s*'both_answered'/);
  assert.doesNotMatch(migration, /from\s+public\.daily_answers/i);
  assert.doesNotMatch(migration, /count\s*\(\s*\*\s*\)\s*>=\s*2/i);
});
