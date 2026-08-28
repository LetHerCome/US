const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'navigation.js'), 'utf8');

function classList(open = false) {
  return {
    contains(name) { return name === 'open' && open; },
    toggle() {},
    remove() {},
    set open(value) { open = value; }
  };
}

function navigationHarness({ page = 'home', layerOpen = false, state = null } = {}) {
  const listeners = new Map();
  const calls = { go: [], closeToday: 0, back: 0 };
  const today = { classList: classList(layerOpen) };
  const states = [{ __usNav: 1, kind: 'page', page: 'home', entryIndex: 0 }];
  if (state) states.push(state);
  else if (page !== 'home') states.push({ __usNav: 1, kind: 'page', page, entryIndex: 1 });
  else if (layerOpen) states.push({ __usNav: 1, kind: 'layer', layer: 'today', page: 'home', entryIndex: 1 });
  let position = states.length - 1;

  const document = {
    readyState: 'complete',
    body: {},
    querySelector(selector) {
      if (selector === '.page.active') return { id: page };
      return null;
    },
    getElementById(id) {
      if (id === 'today') return today;
      return null;
    },
    addEventListener() {}
  };
  const history = {
    get state() { return states[position]; },
    pushState(next) { states.splice(position + 1); states.push(next); position += 1; },
    replaceState(next) { states[position] = next; },
    back() {
      calls.back += 1;
      if (position === 0) return;
      position -= 1;
      listeners.get('popstate')?.({ state: states[position] });
    }
  };
  const window = {
    document,
    history,
    location: { href: 'https://app.test/' },
    go(id) { calls.go.push(id); page = id; },
    closeToday() { calls.closeToday += 1; today.classList.open = false; },
    addEventListener(name, listener) { listeners.set(name, listener); },
    setTimeout(callback) { callback(); return 1; },
    queueMicrotask(callback) { callback(); },
    MutationObserver: class { observe() {} }
  };
  window.window = window;
  vm.runInContext(source, vm.createContext({ window, document, history, location: window.location, MutationObserver: window.MutationObserver, queueMicrotask: window.queueMicrotask, setTimeout: window.setTimeout, console: { info() {} } }), { filename: 'navigation.js' });
  return { window, calls, today };
}

test('Back nativo con layer aperto usa lo state layer US e chiude soltanto il layer', () => {
  const { window, calls } = navigationHarness({ layerOpen: true });

  assert.equal(window.UsNavigation.handleNativeBack(), true);
  assert.equal(calls.back, 1);
  assert.equal(calls.closeToday, 1);
});

test('Back nativo su pagina secondaria usa la history US senza terminare l app', () => {
  const { window, calls } = navigationHarness({ page: 'moments' });

  assert.equal(window.UsNavigation.handleNativeBack(), true);
  assert.equal(calls.back, 1);
  assert.deepEqual(calls.go, ['home']);
});

test('Back nativo alla root senza history US utile resta non gestito', () => {
  const { window, calls } = navigationHarness();

  assert.equal(window.UsNavigation.handleNativeBack(), false);
  assert.equal(calls.back, 0);
  assert.deepEqual(calls.go, []);
});

test('Back nativo non usa history.length estranea alla navigation US', () => {
  const { window, calls } = navigationHarness();
  window.history.length = 99;

  assert.equal(window.UsNavigation.handleNativeBack(), false);
  assert.equal(calls.back, 0);
});
