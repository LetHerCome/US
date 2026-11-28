// Piccolezze prima del rilascio (27/11/2026): the island's first peek on a
// slow phone. The level arriving long after the old ~11 s of retries still
// gets its moment; never while the intro is open, never twice. personaggi.js
// runs in a small fake page with fake timers.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'personaggi.js'), 'utf8');

function page({ level = 0, intro = false } = {}) {
  let now = 0, seq = 0;
  const timers = new Map();
  const listeners = {};
  const on = (target) => (type, fn) => { (listeners[`${target}:${type}`] ||= []).push(fn); };
  const fire = (target, type) => (listeners[`${target}:${type}`] || []).forEach((fn) => fn({ type }));
  const store = new Map();
  const home = { id: 'home', classList: { contains: (c) => c === 'active' } };
  const document = {
    readyState: 'complete', hidden: false,
    body: { getAttribute: () => null },
    documentElement: {},
    getElementById: (id) => (id === 'home' ? home : null),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener: on('d'),
  };
  const state = { level, intro };
  const w = {
    document,
    usProfile: { id: 'f1', couple_id: 'c1', role: 'francesco' },
    UsCoupleContext: { snapshot: () => ({ profiles: [{ id: 'f1', role: 'francesco' }, { id: 'b1', role: 'beatrice' }] }) },
    USProgression: { getState: () => ({ level: state.level }) },
    UsIntro: { active: () => state.intro },
    // With US vi ricorda on the page, the first peek only writes the level seen.
    UsRicorda: {},
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); } },
    addEventListener: on('w'),
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  };
  const ctx = {
    window: w, document,
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { at: now + (ms || 0), fn }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    setInterval: () => 0, clearInterval: () => {},
    module: undefined,
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = end;
  };
  const seen = () => JSON.parse(store.get('us:isola:v1:f1') || 'null');
  const writes = [];
  const set = w.localStorage.setItem;
  w.localStorage.setItem = (k, v) => { if (k === 'us:isola:v1:f1') writes.push(v); set(k, v); };
  return { state, advance, seen, writes, fire, pending: () => timers.size };
}

test('a level that arrives after 40 s still gets the first peek, once', () => {
  const p = page({ level: 0 });
  p.advance(40000);
  assert.equal(p.seen(), null, 'nothing before the level');
  p.state.level = 3; // the progression lands late and says nothing
  p.advance(16000);
  assert.deepEqual(p.seen(), { level: 3 });
  p.fire('w', 'us-identity-change');
  p.fire('d', 'visibilitychange');
  p.advance(60000);
  assert.equal(p.writes.length, 1, 'never twice');
});

test('never during the intro: its end tries again', () => {
  const p = page({ level: 2, intro: true });
  p.advance(120000);
  assert.equal(p.seen(), null, 'held back while the intro is open');
  assert.equal(p.pending(), 0, 'no polling under the intro');
  p.state.intro = false;
  p.fire('w', 'us:intro-done');
  p.advance(1000);
  assert.deepEqual(p.seen(), { level: 2 });
});

test('the retries slow down and stop after about ten minutes; an event starts them again', () => {
  const p = page({ level: 0 });
  p.advance(15 * 60 * 1000);
  assert.equal(p.pending(), 0, 'no endless polling');
  p.state.level = 4;
  p.fire('w', 'us-identity-change');
  p.advance(1000);
  assert.deepEqual(p.seen(), { level: 4 });
});

test('source: no short cap on the island\'s retries', () => {
  assert.doesNotMatch(SRC, /tries < 12/);
  assert.match(SRC, /const PEEK_WAIT = \[900, 1500, 2500, 4000, 6000, 10000, 15000\], PEEK_TRIES = 50;/);
  assert.match(SRC, /if \(w\.UsIntro\?\.active\?\.\(\)\) return;/);
});
