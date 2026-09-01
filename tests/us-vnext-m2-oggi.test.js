const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
function priorityRuntimeSource() {
  const source = read('app.js');
  const start = source.indexOf('const US_TODAY_PRIORITY_ORDER=');
  const end = source.indexOf('function localDateISO()', start);
  assert.notEqual(start, -1, 'app.js deve implementare il runtime M2');
  assert.notEqual(end, -1, 'il runtime M2 deve restare un blocco focalizzato');
  return source.slice(start, end);
}

function installPriorityRuntime({ eventSource } = {}) {
  const listeners = new Map();
  const region = {
    hidden: true,
    innerHTML: '',
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  const calls = [];
  const window = {
    openToday: () => calls.push('today'),
    openEvents: () => calls.push('events'),
    getTodayEventPrioritySource: eventSource,
  };
  const context = vm.createContext({
    console: { warn() {} },
    document: { getElementById: (id) => id === 'usTodayPriorityRegion' ? region : null },
    escapeHtml: (value) => String(value),
    Promise,
    window,
  });
  vm.runInContext(priorityRuntimeSource(), context);
  return { api: window.UsTodayPriority, calls, listeners, region, window };
}

test('M2 colloca la priority region sopra l hero e la lascia strutturalmente vuota', () => {
  const html = read('index.html');
  const home = html.match(/<main id="home"[\s\S]*?<\/main>/)?.[0] || '';
  const region = '<div id="usTodayPriorityRegion" hidden aria-live="polite"></div>';

  assert.ok(home.indexOf(region) >= 0);
  assert.ok(home.indexOf(region) < home.indexOf('id="homeHero"'));
  assert.match(read('styles.css'), /\.us-today-priority-card[\s\S]{0,500}min-height:44px/);
});

test('M2 compone al massimo una priorita per categoria in ordine P1 P2 P3', () => {
  const { api } = installPriorityRuntime();
  const candidates = [
    { id: 'context-late', factKey: 'event:late', category: 'couple_context', urgency: 30, recency: 90 },
    { id: 'waiting', factKey: 'daily:waiting', category: 'waiting_for_me', urgency: 20, recency: 10 },
    { id: 'ready', factKey: 'daily:ready', category: 'received_ready', urgency: 40, recency: 5 },
    { id: 'context-soon', factKey: 'event:soon', category: 'couple_context', urgency: 10, recency: 1 },
    { id: 'extra', factKey: 'extra', category: 'received_ready', urgency: 50, recency: 100 },
  ];

  assert.deepEqual(
    Array.from(api.compose(candidates), (item) => item.id),
    ['ready', 'waiting', 'context-soon'],
  );
});

test('M2 usa urgenza, recency e id come tie-break deterministico', () => {
  const { api } = installPriorityRuntime();
  const candidates = [
    { id: 'z', factKey: 'z', category: 'couple_context', urgency: 10, recency: 20 },
    { id: 'b', factKey: 'b', category: 'couple_context', urgency: 10, recency: 30 },
    { id: 'a', factKey: 'a', category: 'couple_context', urgency: 10, recency: 30 },
  ];

  const first = Array.from(api.compose(candidates), (item) => item.id);
  const second = Array.from(api.compose([...candidates].reverse()), (item) => item.id);
  assert.deepEqual(first, ['a']);
  assert.deepEqual(second, first);
});

test('M2 deriva Daily Question soltanto da reveal pronto o risposta partner in attesa', () => {
  const { api } = installPriorityRuntime();
  const question = { id: 'q-1', question: 'Una domanda reale', question_date: '2026-09-01' };

  const ready = api.dailyViewModel({ question, state: { both_answered: true, my_answer: 'A' }, partnerName: 'Bea' });
  assert.equal(ready.category, 'received_ready');
  assert.equal(ready.action, 'today');

  const waiting = api.dailyViewModel({ question, state: { partner_has_answer: true, my_answer: null }, partnerName: 'Bea' });
  assert.equal(waiting.category, 'waiting_for_me');
  assert.match(waiting.title, /Bea/);
  assert.equal(waiting.action, 'today');

  assert.equal(api.dailyViewModel({ question, state: { my_answer: 'A', both_answered: false }, partnerName: 'Bea' }), null);
  assert.equal(api.dailyViewModel({ question, state: { partner_has_answer: false }, partnerName: 'Bea' }), null);
  assert.equal(api.dailyViewModel({ question: null, state: null, partnerName: 'Bea' }), null);
});

test('M2 accetta Events soltanto oggi o entro 48 ore e conserva openEvents come action', () => {
  const { api } = installPriorityRuntime();
  const base = { id: 'event-1', title: 'Cena', effective_date: '2026-09-03', created_at: '2026-08-01T10:00:00Z' };

  const relevant = api.eventViewModel({ ...base, days_left: 2 });
  assert.equal(relevant.category, 'couple_context');
  assert.equal(relevant.action, 'events');
  assert.equal(api.eventViewModel({ ...base, days_left: 3 }), null);
  assert.equal(api.eventViewModel({ ...base, days_left: -1 }), null);
  assert.equal(api.eventViewModel({ ...base, days_left: null }), null);
  assert.equal(api.eventViewModel({ ...base, effective_date: null, days_left: 0 }), null);
});

test('M2 mantiene la region hidden senza placeholder e usa solo gli opener esistenti', () => {
  const { api, calls, listeners, region } = installPriorityRuntime();
  api.render([]);
  assert.equal(region.hidden, true);
  assert.equal(region.innerHTML, '');

  api.render([
    { id: 'daily', category: 'received_ready', title: 'Risposte pronte', detail: 'Ora potete leggerle.', action: 'today', actionLabel: 'Apri' },
    { id: 'event', category: 'couple_context', title: 'Cena', detail: 'Domani', action: 'events', actionLabel: 'Apri' },
  ]);
  assert.equal(region.hidden, false);
  assert.match(region.innerHTML, /data-us-today-action="today"/);
  assert.match(region.innerHTML, /data-us-today-action="events"/);

  const click = listeners.get('click');
  click({ target: { closest: () => ({ dataset: { usTodayAction: 'today' } }) } });
  click({ target: { closest: () => ({ dataset: { usTodayAction: 'events' } }) } });
  assert.deepEqual(calls, ['today', 'events']);
});

test('M2 isola una failure Events e non trasforma errori o assenza dati in priorita false', async () => {
  const { api, region } = installPriorityRuntime({ eventSource: async () => { throw new Error('offline'); } });
  await api.refresh({
    daily: {
      question: { id: 'q-1', question: 'Una domanda reale', question_date: '2026-09-01' },
      state: { both_answered: true, my_answer: 'A' },
      partnerName: 'Bea',
    },
  });
  assert.equal(region.hidden, false);
  assert.match(region.innerHTML, /Risposte pronte/);

  await api.refresh({ daily: null });
  assert.equal(region.hidden, true);
  assert.equal(region.innerHTML, '');
});

test('M2 riusa hydration Daily RPC e calcoli Events senza nuove fonti di dominio', () => {
  const app = read('app.js');
  const events = read('events.js');
  const runtime = priorityRuntimeSource();

  assert.match(app, /sb\.rpc\('get_daily_state'/);
  assert.match(app, /UsTodayPriority\?\.refresh/);
  assert.match(events, /function getTodayEventPrioritySource\([\s\S]*?upcomingRows\(\)/);
  assert.match(events, /window\.getTodayEventPrioritySource=getTodayEventPrioritySource/);
  assert.doesNotMatch(runtime, /\b(go|history\.pushState|localStorage|sessionStorage|supabase|sb\.from|sb\.rpc)\b/);
  assert.doesNotMatch(runtime, /(openStories|hydrateMoments|hydrateBond|bond_weekly_quests)/i);
});
