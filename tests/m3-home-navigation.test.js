const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function functionSource(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.notEqual(from, -1, `blocco mancante: ${start}`);
  assert.notEqual(to, -1, `fine blocco mancante: ${end}`);
  return source.slice(from, to);
}

class FakeClassList {
  constructor(values = []) { this.values = new Set(values); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const enabled = force === undefined ? !this.values.has(value) : Boolean(force);
    if (enabled) this.values.add(value); else this.values.delete(value);
    return enabled;
  }
}

test('Home rende intenzionale il vuoto e lo rimuove quando arriva una foto', async () => {
  const source = read('app.js');
  const hero = { classList: new FakeClassList(), setAttribute() {}, removeAttribute() {} };
  const empty = { hidden: true };
  const layers = {
    homePhotoLayerA: { style: {}, classList: new FakeClassList(['active']) },
    homePhotoLayerB: { style: {}, classList: new FakeClassList() }
  };
  const context = vm.createContext({
    console,
    document: { getElementById: (id) => ({ homeHero: hero, homeEmptyState: empty, ...layers })[id] || null },
    requestAnimationFrame: (callback) => callback()
  });
  vm.runInContext(`
    let homePhotoActiveLayer = 'A';
    let homePhotoRequestId = 0;
    let homePhotoHasPainted = false;
    class Image {
      set src(_value) { this.onload?.(); }
      decode() { return Promise.resolve(); }
    }
    ${functionSource(source, 'function crossfadeHomePhoto(', 'async function hydrateHomePhoto(')}
  `, context);

  context.crossfadeHomePhoto('');
  assert.equal(empty.hidden, false);
  assert.equal(hero.classList.contains('is-empty'), true);

  context.crossfadeHomePhoto('https://example.test/private-photo');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(empty.hidden, true);
  assert.equal(hero.classList.contains('is-empty'), false);
});

test('un errore di caricamento Home non viene confuso con un vuoto reale', async () => {
  const source = read('app.js');
  const failingQuery = {
    select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
    then(resolve) { resolve({ data: null, error: new Error('offline') }); }
  };
  const context = vm.createContext({
    console: { warn() {} },
    homePhotoPath: '',
    homeRotationKey: () => '2026-08-25T00',
    homeStableIndex: () => 0,
    sb: { from: () => failingQuery },
    window: { usProfile: { couple_id: 'couple-1' } }
  });
  vm.runInContext(functionSource(source, 'async function getHomeRotationPath()', 'function crossfadeHomePhoto('), context);

  assert.equal(await context.getHomeRotationPath(), undefined);

  const painted = [];
  let cleared = 0;
  const hydrateContext = vm.createContext({
    crossfadeHomePhoto: (url) => painted.push(url),
    getHomeRotationPath: async () => undefined,
    homePhotoHourKey: '', homePhotoPath: '',
    homeRotationKey: () => '2026-08-25T00',
    localStorage: { removeItem: () => { cleared += 1; } },
    readHomeBootCache: () => null,
    usGetSignedUrl: async () => null,
    window: { usProfile: { couple_id: 'couple-1' } },
    writeHomeBootCache() {}
  });
  vm.runInContext(functionSource(source, 'async function hydrateHomePhoto(', 'function startHomePhotoRotation('), hydrateContext);
  await hydrateContext.hydrateHomePhoto();
  assert.deepEqual(painted, []);
  assert.equal(cleared, 0);
});

test('Settings non registra gesture drag o inerzia su Ti penso', () => {
  const pointerListeners = [];
  const documentListeners = new Map();
  const heart = {
    classList: new FakeClassList(), dataset: {}, style: {}, offsetWidth: 48, offsetHeight: 48,
    addEventListener: (type) => pointerListeners.push(type),
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 18, top: 180, width: 48, height: 48 })
  };
  const document = {
    readyState: 'loading', hidden: false,
    body: { classList: new FakeClassList() },
    getElementById: (id) => id === 'thinkButton' ? heart : null,
    querySelector: (selector) => selector === '.nav' ? { getBoundingClientRect: () => ({ top: 760 }) } : null,
    querySelectorAll: () => [],
    addEventListener: (type, listener) => documentListeners.set(type, listener)
  };
  const window = {
    innerWidth: 390, innerHeight: 844, usProfile: null,
    visualViewport: { width: 390, height: 844, offsetLeft: 0, offsetTop: 0, addEventListener() {}, removeEventListener() {} },
    addEventListener() {}, removeEventListener() {}
  };
  vm.runInContext(read('settings.js'), vm.createContext({
    cancelAnimationFrame() {}, clearInterval() {}, clearTimeout() {}, console, document,
    localStorage: { getItem: () => null, setItem() {} }, performance: { now: () => 0 },
    requestAnimationFrame: (callback) => { callback(); return 1; },
    setInterval: () => 1, setTimeout: () => 1, window
  }));
  documentListeners.get('DOMContentLoaded')();

  assert.deepEqual(pointerListeners.filter((type) => type.startsWith('pointer')), []);
  assert.equal(heart.dataset.draggableThink, undefined);
});

async function runFix4({ online, badgeWarn = false, updateAvailable = false }) {
  class FakeElement {
    constructor({ classes = [], hidden = false } = {}) {
      this.classList = new FakeClassList(classes);
      this.hidden = hidden;
      this.dataset = {};
      this.style = { setProperty() {} };
      this.textContent = '';
    }
    addEventListener() {}
    contains() { return false; }
    matches() { return false; }
    querySelectorAll() { return []; }
  }
  const status = new FakeElement({ hidden: true });
  const update = new FakeElement({ hidden: true });
  const onlineBadge = new FakeElement({ classes: badgeWarn ? ['warn'] : ['ok'] });
  onlineBadge.textContent = badgeWarn ? '● connessione…' : '● sync';
  const body = new FakeElement();
  const elements = { appStatusBar: status, appUpdateBar: update, appUpdateBtn: new FakeElement(), onlineBadge };
  const document = {
    activeElement: new FakeElement(), body, hidden: false,
    documentElement: new FakeElement(),
    addEventListener() {},
    getElementById: (id) => elements[id] || null,
    querySelector: (selector) => selector.includes('us-build') ? { content: 'current-build' } : null,
    querySelectorAll: () => []
  };
  document.documentElement.clientHeight = 844;
  const window = {
    innerHeight: 844, usProfile: null,
    addEventListener() {},
    visualViewport: { height: 844, addEventListener() {} }
  };
  const context = vm.createContext({
    clearInterval() {}, clearTimeout() {}, console, document, Element: FakeElement,
    fetch: async () => ({ ok: true, json: async () => ({ version: updateAvailable ? 'next-build' : 'current-build' }) }),
    localStorage: { getItem: () => null, setItem() {} }, location: { reload() {} },
    MutationObserver: class { observe() {} }, navigator: { onLine: online, serviceWorker: null },
    Node: { ELEMENT_NODE: 1 }, setInterval: () => 1, setTimeout: () => 1, window
  });
  vm.runInContext(read('fix4.js'), context);
  await new Promise((resolve) => setImmediate(resolve));
  return { body, status, update };
}

test('fix4 espone gli stati layout per status e update senza sovrapporli implicitamente', async () => {
  const offline = await runFix4({ online: false });
  assert.equal(offline.status.hidden, false);
  assert.equal(offline.body.classList.contains('us-status-visible'), true);
  assert.equal(offline.body.classList.contains('us-update-visible'), false);

  const both = await runFix4({ online: true, badgeWarn: true, updateAvailable: true });
  assert.equal(both.status.hidden, false);
  assert.equal(both.update.hidden, false);
  assert.equal(both.body.classList.contains('us-status-visible'), true);
  assert.equal(both.body.classList.contains('us-update-visible'), true);
});

test('il Quiz hub usa la bottom navigation senza una seconda freccia Home', () => {
  const html = read('index.html');
  const quizHeader = html.match(/<main id="quiz"[\s\S]*?<div id="quizHub">/)?.[0] || '';
  assert.doesNotMatch(quizHeader, /onclick="go\('home'\)"/);
});

test('il feedback runtime non lascia il prompt Home vuota dietro al rail in landscape', () => {
  const css = read('fix4.css');
  const landscape = css.match(/@media \(orientation:landscape\)[\s\S]*?(?=@media \(max-width:360px\))/)?.[0] || '';
  assert.match(landscape, /body\.us-update-visible #homeHero\.is-empty \.home-empty-state\{display:none\}/);
  assert.doesNotMatch(landscape, /body\.us-status-visible #homeHero\.is-empty \.home-empty-state/);
  assert.match(css, /body\.us-keyboard-open #homeHero\.is-empty \.home-empty-state\{display:none\}/);
});
