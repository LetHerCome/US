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

// US 1.0 (N7): Eventi never shows points. A completion that earned points gets the
// same quiet toast; labels and the complete button never promise XP.
test('already completed says so, never with points', async () => {
  const none = await completeWith({ completed: true, already_completed: true, xp_awarded: 0, completed_at: stamp(0) });
  assert.deepEqual(none.toasts, ['Già completato']);
  const some = await completeWith({ completed: true, already_completed: true, xp_awarded: 35, completed_at: stamp(0) });
  assert.deepEqual(some.toasts, ['Già completato']);
  assert.deepEqual([...none.celebrations, ...some.celebrations], []);
});

// Round 3 (mockup parity, 078): a completion that earned points shows the mockup's
// "+35 XP · Evento vissuto · Sintonia" (progression.js usCelebrateXp) instead of the toast.
test('a completion with points gets the mockup\'s +XP, and the quiet toast without it', async () => {
  const h = await completeWith({ completed: true, already_completed: false, xp_awarded: 35, occurrence_date: TODAY, xp_reason: 'planned' });
  assert.deepEqual(h.celebrations, [[35, 'Evento vissuto']]);
  assert.deepEqual(h.toasts, []);
  const bare = await completeWith({ completed: true, already_completed: false, xp_awarded: 60 }, { celebrate: false });
  assert.deepEqual(bare.toasts, ['Evento vissuto ♡'], 'old server answers (no xp_reason) keep working');
  assert.doesNotMatch([...h.toasts, ...bare.toasts].join(' '), /XP|Bond/);
});

test('labels say a completion is done, never its points', async () => {
  const h = harness({
    events: [event('zero', { date: isoDay(-2) }), event('paid', { date: isoDay(-3), createdDaysAgo: 10 })],
    completions: [completion('zero', 0, { date: isoDay(-2) }), completion('paid', 50, { date: isoDay(-3), at: stamp(-3) })]
  });
  await h.window.hydrateEvents();
  const done = h.node('usEventsDoneList').innerHTML;
  // Parity: the mockup's rows say "Festeggiato"; titles are user content (translate="no").
  assert.match(done, /<b translate="no">Evento zero<\/b><small>Festeggiato<\/small>/);
  assert.match(done, /<b translate="no">Evento paid<\/b><small>Festeggiato<\/small>/);
  assert.doesNotMatch(done, /XP/);
  // Parity: a lived event's detail says so in its lead line; there is nothing left to mark.
  for (const [id, date] of [['zero', isoDay(-2)], ['paid', isoDay(-3)]]) {
    h.window.editEvent(id, date);
    assert.equal(h.node('usEventCompleteBtn').hidden, true, id);
    assert.equal(h.node('usEventDetailLead').textContent, 'Festeggiato insieme ♡', id);
    assert.doesNotMatch(h.node('usEventDetailLead').textContent, /XP/);
  }
});

test('the complete button and the due list never promise points', async () => {
  const fresh = harness({ events: [event('today'), event('planned', { createdDaysAgo: 3 }), event('yearly', { yearly: true })] });
  await fresh.window.hydrateEvents();
  for (const id of ['today', 'yearly', 'planned']) {
    fresh.window.editEvent(id, TODAY);
    assert.match(fresh.node('usEventCompleteBtn').innerHTML, /data-us-icon="check"[\s\S]*<span>Segna come fatto<\/span>$/, id);
    assert.doesNotMatch(fresh.node('usEventCompleteBtn').innerHTML, /XP/, id);
  }

  const due = harness({ events: [event('late', { date: isoDay(-4) }), event('kept', { date: isoDay(-4), createdDaysAgo: 30 })] });
  await due.window.hydrateEvents();
  const list = due.node('usEventsDueList').innerHTML;
  assert.match(list, /<b translate="no">Evento late<\/b><small>Da segnare<\/small>/);
  assert.match(list, /<b translate="no">Evento kept<\/b><small>Da segnare<\/small>/);
  assert.doesNotMatch(list, /XP/);
});

test('T1 1.0 + round 3: the old polish4 party is gone; usCelebrateXp is the mockup\'s +XP', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'polish4.js')), false);
  const progression = read('progression.js');
  assert.match(progression, /window\.usCelebrateXp = \(n, label\) => xpPop\(n, label\);/);
  assert.match(progression, /\{ duration: 1550, easing: EASE\.out \}/);
});
