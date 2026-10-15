// Sintonia events guard — the current Eventi client when complete_shared_event
// gives no points (xp_awarded 0 + xp_reason): never a "+0 XP" celebration or
// label, and the preview follows the server rule. events.js runs in a vm.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const isoDay = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const stamp = (offset) => new Date(Date.now() + offset * 86400000).toISOString();
const TODAY = isoDay(0);

function harness({ events = [], completions = [], answer = {}, celebrate = true } = {}) {
  const nodes = {};
  const node = (id) => {
    if (nodes[id]) return nodes[id];
    const el = {
      id, textContent: '', hidden: false, dataset: {}, value: '', checked: false, disabled: false, style: {}, innerHTML: '',
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, setAttribute() {}, focus() {}, reset() {}, closest: () => null, contains: () => true
    };
    return (nodes[id] = el);
  };
  const tables = { shared_events: events, shared_event_completions: completions, couples: [{ started_on: null }], relationship_milestones: [] };
  const sb = {
    from(table) {
      const b = { select: () => b, eq: () => b, order: () => b, limit: () => b, maybeSingle: async () => ({ data: (tables[table] || [])[0] || null, error: null }), then: (res, rej) => Promise.resolve({ data: tables[table], error: null }).then(res, rej) };
      return b;
    },
    rpc: async () => ({ data: answer, error: null })
  };
  const toasts = [];
  const celebrations = [];
  const window = { usProfile: { id: 'u', couple_id: 'c' }, addEventListener() {}, removeEventListener() {} };
  if (celebrate) window.usCelebrateXp = (amount, label) => { celebrations.push([amount, label]); return true; };
  const sandbox = {
    window, document: { getElementById: node, addEventListener() {}, body: { classList: { add() {}, remove() {} } } }, sb, navigator: { onLine: true },
    toast: (message) => toasts.push(message), usConfirm: async () => true, console: { warn() {}, info() {} },
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {}, location: { href: 'https://us.test/' }, history: { replaceState() {} },
    URL, Date, Math, Promise, Number, String, Array, Object, Set, Map, JSON
  };
  sandbox.window.document = sandbox.document;
  vm.runInNewContext(read('events.js'), sandbox, { filename: 'events.js' });
  return { window, node, toasts, celebrations };
}

const event = (id, { date = TODAY, createdDaysAgo = 0, yearly = false } = {}) => ({
  id, couple_id: 'c', created_by: 'u', title: `Evento ${id}`, event_date: date, event_time: null, location: null, note: null,
  recurs_yearly: yearly, created_at: createdDaysAgo ? stamp(-createdDaysAgo) : new Date().toISOString(), updated_at: new Date().toISOString()
});
const completion = (eventId, xp, { date = TODAY, at = new Date().toISOString() } = {}) => ({ id: `k-${eventId}`, event_id: eventId, occurrence_date: date, completed_by: 'u', xp_awarded: xp, completed_at: at });

async function completeWith(answer, options = {}) {
  const h = harness({ events: [event('e1', { createdDaysAgo: options.createdDaysAgo ?? 3 })], answer, celebrate: options.celebrate !== false });
  await h.window.hydrateEvents();
  h.window.editEvent('e1', TODAY);
  await h.window.completeEvent();
  return h;
}

test('a completion without points is never celebrated: a quiet line says why', async () => {
  const cases = [
    ['same_day', 'Evento vissuto ♡ La Sintonia cresce con gli eventi programmati in anticipo'],
    ['before_creation', 'Evento vissuto ♡ La Sintonia cresce con gli eventi programmati in anticipo'],
    ['daily_limit', 'Evento vissuto ♡ Oggi un evento ha già fatto crescere la Sintonia'],
    [undefined, 'Evento vissuto ♡'],
  ];
  for (const [reason, copy] of cases) {
    const h = await completeWith({ completed: true, already_completed: false, xp_awarded: 0, occurrence_date: TODAY, xp_reason: reason });
    assert.deepEqual(h.celebrations, [], `${reason}: no celebration`);
    assert.deepEqual(h.toasts, [copy], `${reason}: one quiet toast`);
    assert.doesNotMatch(h.toasts.join(' '), /\+0|XP|Bond/);
  }
  // Without the Polish layer the fallback toast never says "+0 XP" either.
  const bare = await completeWith({ completed: true, already_completed: false, xp_awarded: 0, xp_reason: 'same_day' }, { celebrate: false });
  assert.deepEqual(bare.toasts, ['Evento vissuto ♡ La Sintonia cresce con gli eventi programmati in anticipo']);
});

test('already completed without points says so without "+0 XP"; with points it is unchanged', async () => {
  const none = await completeWith({ completed: true, already_completed: true, xp_awarded: 0, completed_at: stamp(0) });
  assert.deepEqual(none.toasts, ['Già completato']);
  const some = await completeWith({ completed: true, already_completed: true, xp_awarded: 35, completed_at: stamp(0) });
  assert.deepEqual(some.toasts, ['Già completato · +35 XP']);
  assert.deepEqual([...none.celebrations, ...some.celebrations], []);
});

test('a completion with points is celebrated exactly as before', async () => {
  const h = await completeWith({ completed: true, already_completed: false, xp_awarded: 35, occurrence_date: TODAY, xp_reason: 'planned' });
  assert.deepEqual(h.celebrations, [[35, 'Evento vissuto']]);
  assert.deepEqual(h.toasts, []);
  const bare = await completeWith({ completed: true, already_completed: false, xp_awarded: 60 }, { celebrate: false });
  assert.deepEqual(bare.toasts, ['+60 XP Bond ✦'], 'old server answers (no xp_reason) keep working');
});

test('labels show the real points of a completion, and no "+0 XP"', async () => {
  const h = harness({
    events: [event('zero', { date: isoDay(-2) }), event('paid', { date: isoDay(-3), createdDaysAgo: 10 })],
    completions: [completion('zero', 0, { date: isoDay(-2) }), completion('paid', 50, { date: isoDay(-3), at: stamp(-3) })]
  });
  await h.window.hydrateEvents();
  const done = h.node('usEventsDoneList').innerHTML;
  assert.match(done, /<b>Evento zero<\/b><small>Completato<\/small>/, 'not the preview of a completion that earned nothing');
  assert.match(done, /<b>Evento paid<\/b><small>Completato · \+50 XP<\/small>/);
  assert.doesNotMatch(done, /\+0 XP/);
  h.window.editEvent('zero', isoDay(-2));
  assert.equal(h.node('usEventCompleteBtn').textContent, '✓ Completato');
  h.window.editEvent('paid', isoDay(-3));
  assert.equal(h.node('usEventCompleteBtn').textContent, '✓ Completato · +50 XP');
});

test('the preview follows the server rule: nothing for an event made the same day or a day already rewarded', async () => {
  const fresh = harness({ events: [event('today'), event('planned', { createdDaysAgo: 3 }), event('yearly', { yearly: true })] });
  await fresh.window.hydrateEvents();
  fresh.window.editEvent('today', TODAY);
  assert.equal(fresh.node('usEventCompleteBtn').textContent, '✓ Segna come fatto', 'made today: no promise of points');
  fresh.window.editEvent('yearly', TODAY);
  assert.equal(fresh.node('usEventCompleteBtn').textContent, '✓ Segna come fatto', 'a yearly event made today does not earn 60');
  fresh.window.editEvent('planned', TODAY);
  assert.equal(fresh.node('usEventCompleteBtn').textContent, '✓ Segna come fatto · +35 XP', 'planned ahead: unchanged');

  const due = harness({ events: [event('late', { date: isoDay(-4) }), event('kept', { date: isoDay(-4), createdDaysAgo: 30 })] });
  await due.window.hydrateEvents();
  const list = due.node('usEventsDueList').innerHTML;
  assert.match(list, /<b>Evento late<\/b><small>Da segnare<\/small>/, 'dated before it was created: no points');
  assert.match(list, /<b>Evento kept<\/b><small>Da segnare · \+50 XP<\/small>/);

  const rewarded = harness({
    events: [event('first', { createdDaysAgo: 3 }), event('second', { createdDaysAgo: 3 })],
    completions: [completion('first', 35)]
  });
  await rewarded.window.hydrateEvents();
  rewarded.window.editEvent('second', TODAY);
  assert.equal(rewarded.node('usEventCompleteBtn').textContent, '✓ Segna come fatto', 'one event with points a day');
});

test('T1 1.0: the old "+XP" party is gone; a silent shim answers callers', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'polish4.js')), false);
  const progression = read('progression.js');
  assert.match(progression, /window\.usCelebrateXp = window\.usCelebrateXp \|\| function \(\) \{\};/);
});
