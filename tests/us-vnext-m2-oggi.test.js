const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
function priorityRuntimeSource() {
  const source = read('app.js');
  const start = source.indexOf('let usTodayPriorityRefreshId=0;');
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
    // Oggi's arbitration marks its slot after every render (03/11/2026).
    setAttribute() {},
    removeAttribute() {},
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

test('M2 isola una failure Events e non trasforma errori o assenza dati in priorita false', async () => {
  const { api, region } = installPriorityRuntime({ eventSource: async () => { throw new Error('offline'); } });
  await api.refresh({
    daily: {
      question: { id: 'q-1', question: 'Una domanda reale', question_date: '2026-09-01' },
      state: { both_answered: true, my_answer: 'A' },
      partnerName: 'Bea',
    },
  });
  // M9B: la Domanda del giorno vive nella sua card su Oggi, non nella priority
  // queue; una failure Events non deve comunque inventare una priorita.
  assert.equal(region.hidden, true);
  assert.doesNotMatch(region.innerHTML, /Risposte pronte/);

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
