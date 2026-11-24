// Aspetto, Giorno e Notte (founder, 24/11/2026, tavola «US · Quaderno, giorno
// e notte», with the recommended choices: actions in ceralacca, Automatico
// follows the phone, polaroids and post-its stay paper). Giorno is the
// Quaderno; Notte is the night US already has; the choice is in the Profilo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function fakeWindow({ stored = null, dark = true } = {}) {
  const store = new Map(stored ? [['us:aspetto:v1', stored]] : []);
  const attrs = {};
  const metas = { 'theme-color': { v: '#0a0a0e' }, 'color-scheme': { v: 'dark' } };
  const listeners = [];
  const win = {
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
    matchMedia: () => ({ matches: dark, addEventListener: (_e, fn) => listeners.push(fn) }),
    document: {
      readyState: 'complete',
      documentElement: { dataset: attrs },
      querySelector: (q) => { const name = (q.match(/name="([^"]+)"/) || [])[1]; return name && metas[name] ? { setAttribute: (_a, v) => { metas[name].v = v; } } : null; },
      querySelectorAll: () => [],
      addEventListener: () => {},
    },
    dispatchEvent: () => {},
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; },
  };
  return { win, store, attrs, metas, listeners, setDark: (v) => { dark = v; } };
}
function load(win) {
  const file = path.join(ROOT, 'aspetto.js');
  const src = fs.readFileSync(file, 'utf8');
  const module = { exports: {} };
  new Function('window', 'module', src)(win, module);
  return module.exports;
}

test('Automatico follows the phone; Giorno and Notte are fixed; the choice stays on the phone', () => {
  const night = fakeWindow({ dark: true });
  const A = load(night.win);
  assert.equal(A.choice(), 'auto');
  assert.equal(night.attrs.usLuce, 'notte');
  assert.equal(A.set('giorno'), 'giorno');
  assert.equal(night.attrs.usLuce, 'giorno');
  assert.equal(night.store.get('us:aspetto:v1'), 'giorno');
  assert.equal(night.metas['theme-color'].v, '#f3ece1');
  assert.equal(night.metas['color-scheme'].v, 'light');
  assert.equal(A.set('notte'), 'notte');
  assert.equal(night.metas['color-scheme'].v, 'dark');
  assert.equal(A.set('nonsense'), null, 'only the three choices');
  const day = fakeWindow({ dark: false });
  load(day.win);
  assert.equal(day.attrs.usLuce, 'giorno', 'a light phone opens on paper');
  assert.equal(load(fakeWindow({ stored: 'notte', dark: false }).win).luce(), 'notte');
  assert.deepEqual([load(fakeWindow().win).luceOf('auto', true), load(fakeWindow().win).luceOf('auto', false)], ['notte', 'giorno']);
});

test('the light is set before the first paint, and the day sheet comes last', () => {
  const html = read('index.html');
  const prepaint = html.indexOf('localStorage.getItem("us:aspetto:v1")');
  assert.ok(prepaint > 0 && prepaint < html.indexOf('<link rel="stylesheet"'), 'before any stylesheet');
  assert.ok(html.indexOf('/colori.css?v=') < html.indexOf('/giorno.css?v='), 'giorno.css after colori.css');
  assert.match(html, /<script defer src="\/aspetto\.js\?v=/);
  for (const file of ['scripts/build-capacitor-web.mjs', 'scripts/build-cloudflare-pages.mjs']) {
    assert.match(read(file), /'aspetto\.js',/);
    assert.match(read(file), /'giorno\.css',/);
  }
  const sw = read('service-worker.js');
  assert.match(sw, /versioned\("\/aspetto\.js"\)/);
  assert.match(sw, /versioned\("\/giorno\.css"\)/);
});

test('Profilo › Aspetto: Automatico, Giorno, Notte as one radio group', () => {
  const html = read('index.html');
  assert.match(html, /<div class="us-aspetto" role="radiogroup" aria-labelledby="usAspettoTitle" data-s>/);
  for (const choice of ['auto', 'giorno', 'notte']) assert.match(html, new RegExp(`role="radio" aria-checked="(true|false)" data-us-aspetto="${choice}"`));
});

test('Giorno is the Quaderno: carta, foglio, inchiostro, ceralacca; the couple dusty; the night untouched', () => {
  const css = read('giorno.css');
  const day = css.match(/:root\[data-us-luce="giorno"\]\{([\s\S]*?)\n\}/)[1];
  for (const token of ['--us-color-bg:#f3ece1', '--us-color-surface:#fbf7f0', '--us-color-text:#231b1d', '--us-ceralacca:#b8452f', '--us-accent-gradient:linear-gradient(#b8452f,#b8452f)!important', '--us-rosa:var(--us-rosa-giorno,#e7a1ab)!important', '--us-lilla:var(--us-lilla-giorno,#ab9ddb)!important']) {
    assert.ok(day.includes(token), token);
  }
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /(^|\})\s*:root\{/, 'nothing outside Giorno, except the shared Aspetto control');
  // The photo of Oggi stays a photo; the first steps keep their night.
  assert.match(css, /#home #homeHero,:root\[data-us-luce="giorno"\] \.app>\.top\.us-premium-top\{--us-latte:#f7efe9/);
  assert.match(css, /:root\[data-us-luce="giorno"\] :is\(\.auth-overlay,\.us-setup,\.us-tour,#usOnboarding,\.us-app-lock,#mc3Waiting\)\{/);
  // Actions painted in my colour become ceralacca in Giorno.
  assert.match(css, /:root\[data-us-luce="giorno"\] \.primary\{background:var\(--us-ceralacca\)!important;color:var\(--us-foglio\)!important\}/);
});

test('each colour has its day tone, put on <html> with the chosen one', () => {
  const C = require('../person-colors.js');
  assert.deepEqual(Object.keys(C.PALETTE_GIORNO), Object.keys(C.PALETTE));
  const set = new Map();
  const style = { setProperty: (k, v) => set.set(k, v), removeProperty: (k) => set.delete(k) };
  C.applyCoupleColors([{ id: 'f', role: 'francesco', person_color: 'blu' }], { style, dataset: {} }, 'francesco');
  assert.equal(set.get('--us-rosa-giorno'), C.PALETTE_GIORNO.blu);
  assert.equal(set.has('--us-lilla-giorno'), false);
});
