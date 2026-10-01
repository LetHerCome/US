// M12A — global shell, aurora, universal attention, sliding nav, tile opening.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('index.html');
const foundationCss = read('ui-foundation.css');
const identityCss = read('identity.css');
const topBar = html.match(/<div class="top us-premium-top">[\s\S]*?<\/div><\/div>/)[0];

// ---------------------------------------------------------------- SHELL

// US-HUMAN-UI-01 replaced the M12A top bar (Per voi · US · Left for You)
// with ONE floating control and a transient capsule where the US mark speaks.
test('shell: no top bar — one floating control (Left for You), the US mark lives in the capsule', () => {
  assert.match(topBar, /id="leftForYouPartnerEntry"/);
  assert.equal((topBar.match(/<button/g) || []).length, 1, 'one persistent top control');
  assert.doesNotMatch(topBar, /usPerVoiTop|us-top-brand|us-aurora/);
  assert.match(html, /<div class="us-capsule" id="usCapsule" aria-live="polite" aria-atomic="true"><\/div><template id="usCapsuleMark"><img class="us-brand-symbol-art us-capsule-mark" src="\/assets\/derived\/brand\/us-symbol-apk-foreground-v1\.png" alt="" aria-hidden="true"><\/template>/);
  assert.match(foundationCss, /\.top\.us-premium-top\{position:absolute;z-index:10;top:var\(--us-shell-top\);[^}]*background:none;border:0;[^}]*pointer-events:none\}/);
  assert.doesNotMatch(identityCss, /\.top\.us-premium-top\{display:grid/);
});

test('shell: Events no longer owns the global centre slot but stays reachable', () => {
  assert.doesNotMatch(topBar, /usEventsTopEntry|us-events-top-control|I nostri eventi/);
  assert.doesNotMatch(identityCss, /us-events-top/);
  // Contextual homes: the Calendar head (Noi) and the Oggi event priority card.
  assert.match(html, /id="usCalendarEventsLink"[^>]*aria-label="Apri i nostri eventi"/);
  const calendar = read('calendar.js');
  assert.match(calendar, /usCalendarEventsLink'\)\?\.addEventListener\('click',[\s\S]{0,160}closeCalendarSurface\(\);[\s\S]{0,500}classList\.contains\('open'\)[\s\S]{0,200}window\.openEvents\?\.\(\)/);
  assert.match(read('app.js'), /if\(action==='events'\)window\.openEvents\?\.\(\)/);
});

test('shell: the canonical PWA/launcher mark is used as-is (display cropping only)', () => {
  const manifest = JSON.parse(read('assets/ASSET_MANIFEST.json'));
  const asset = manifest.assets.find((entry) => entry.path === 'assets/derived/brand/us-symbol-apk-foreground-v1.png');
  assert.equal(asset.status, 'APPROVED');
  assert.match(read('service-worker.js'), /"\/assets\/derived\/brand\/us-symbol-apk-foreground-v1\.png"/);
  // Cloned into the capsule as-is; only its display box is set.
  assert.match(foundationCss, /\.us-capsule \.us-capsule-mark\{flex:0 0 auto;width:38px;height:38px;margin:-9px -6px -9px -9px;object-fit:contain\}/);
  assert.match(read('ui-foundation.js'), /getElementById\?\.\('usCapsuleMark'\)\?\.content\?\.firstElementChild[\s\S]{0,80}brand\.cloneNode\(true\)/);
});

async function runNetwork({ online, warn }) {
  class El {
    constructor(hidden = false) { this.hidden = hidden; this.dataset = {}; this.style = { setProperty() {} }; this.textContent = ''; this.cls = new Set(); this.classList = { contains: (c) => this.cls.has(c), toggle() {}, add: (c) => this.cls.add(c), remove: (c) => this.cls.delete(c) }; }
    addEventListener() {} contains() { return false; } matches() { return false; } querySelectorAll() { return []; }
  }
  const status = new El(true);
  const badge = new El(false);
  if (warn) badge.cls.add('warn');
  badge.textContent = warn ? '● connessione…' : '● sync';
  const body = new El();
  const elements = { appStatusBar: status, appUpdateBar: new El(true), appUpdateBtn: new El(), onlineBadge: badge };
  const timers = [];
  const document = { activeElement: new El(), body, hidden: false, documentElement: new El(), addEventListener() {}, getElementById: (id) => elements[id] || null, querySelector: (s) => (s.includes('us-build') ? { content: 'b' } : null), querySelectorAll: () => [] };
  document.documentElement.clientHeight = 844;
  const window = { innerHeight: 844, usProfile: null, addEventListener() {}, visualViewport: { height: 844, addEventListener() {} } };
  const context = vm.createContext({
    clearInterval() {}, clearTimeout: (id) => { const t = timers.find((x) => x.id === id); if (t) t.cancelled = true; }, console, document, Element: El,
    fetch: async () => ({ ok: true, json: async () => ({ version: 'b' }) }), localStorage: { getItem: () => null, setItem() {} }, location: { reload() {} },
    MutationObserver: class { observe() {} }, navigator: { onLine: online, serviceWorker: null }, Node: { ELEMENT_NODE: 1 },
    setInterval: () => 1, setTimeout: (fn, ms) => { const t = { id: timers.length + 1, fn, ms }; timers.push(t); return t.id; }, window
  });
  vm.runInContext(read('fix4.js'), context);
  await new Promise((resolve) => setImmediate(resolve));
  return { status, timers };
}

test('connection: healthy shows nothing, offline is immediate, "connecting" waits for a meaningful delay', async () => {
  const healthy = await runNetwork({ online: true, warn: false });
  assert.equal(healthy.status.hidden, true);

  const offline = await runNetwork({ online: false, warn: false });
  assert.equal(offline.status.hidden, false, 'offline is surfaced at once');
  assert.match(offline.status.textContent, /offline/i);

  const connecting = await runNetwork({ online: true, warn: true });
  assert.equal(connecting.status.hidden, true, 'a transient "connecting…" does not flash');
  const grace = connecting.timers.find((t) => t.ms >= 3000 && t.ms <= 10000);
  assert.ok(grace, 'a grace timer of several seconds exists');
  grace.fn();
  assert.equal(connecting.status.hidden, false, 'still connecting after the grace period: now it is shown');
});

test('connection: the top-bar badge itself never occupies shell space', () => {
  assert.match(foundationCss, /\.top\.us-premium-top \.online-badge\{display:none!important\}/);
  assert.match(read('fix4.css'), /\.online-badge\.ok\{display:none!important\}/);
});

// ---------------------------------------------------------------- CAPSULE

test('capsule: transient by construction — hidden when empty, one entry transition, no loop, reduced-motion aware', () => {
  const block = foundationCss.slice(foundationCss.indexOf('US-HUMAN-UI-01 — Shell'), foundationCss.indexOf('/* Dock.'));
  assert.match(block, /\.us-capsule:empty\{display:none\}/);
  assert.match(block, /\.us-capsule\[data-state="shown"\] \.us-capsule-pill\{opacity:1;transform:none\}/);
  assert.match(block, /:root\[data-us-motion="reduced"\] \.us-capsule-pill\{transform:none;transition:opacity 1ms\}/);
  assert.match(block, /@media \(prefers-reduced-motion:reduce\)\{\.us-capsule-pill\{transform:none;transition:opacity 1ms\}\}/);
  assert.doesNotMatch(block, /infinite|animation:/, 'the capsule never loops');
  assert.doesNotMatch(foundationCss, /us-aurora/, 'the ambient aurora is gone');
  assert.doesNotMatch(read('ui-foundation.js'), /setInterval/, 'no perpetual JS loop');
});

function foundationHarness({ reduced = false } = {}) {
  const { install } = require('../ui-foundation.js');
  const timers = [];
  const attrs = new Map();
  const barAttrs = new Map();
  const bar = { offsetWidth: 0, setAttribute: (k, v) => barAttrs.set(k, v), removeAttribute: (k) => barAttrs.delete(k), getAttribute: (k) => barAttrs.get(k) ?? null };
  const docListeners = new Map();
  const fakeEl = (tag) => {
    const a = new Map();
    return { tagName: tag, children: [], listeners: {}, className: '', textContent: '', type: '', firstChild: null, offsetWidth: 0,
      setAttribute: (k, v) => a.set(k, String(v)), getAttribute: (k) => a.get(k) ?? null, removeAttribute: (k) => a.delete(k),
      addEventListener(t, fn) { this.listeners[t] = fn; }, append(...c) { this.children.push(...c); this.firstChild = this.children[0]; },
      replaceChildren(...c) { this.children = c; this.firstChild = c[0] || null; } };
  };
  const capsule = fakeEl('div');
  const documentRef = {
    hidden: false,
    body: { tagName: 'BODY' },
    documentElement: { setAttribute: (k, v) => attrs.set(k, v) },
    activeElement: null,
    querySelector: (s) => (s === '.top.us-premium-top' ? bar : null),
    getElementById: (id) => (id === 'usCapsule' ? capsule : null),
    createElement: (tag) => fakeEl(tag),
    querySelectorAll: () => [],
    addEventListener: (t, fn) => docListeners.set(t, fn),
    removeEventListener: (t) => docListeners.delete(t)
  };
  let observerCallback;
  class Observer { constructor(cb) { this.cb = cb; } observe(target, opts) { if (opts.attributeFilter?.includes('data-us-attention')) observerCallback = this.cb; } disconnect() {} }
  const handle = install(documentRef, {
    matchMedia: () => ({ matches: reduced, addEventListener() {} }),
    MutationObserver: Observer,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout() {}
  });
  return { handle, attrs, barAttrs, capsule, docListeners, documentRef, timers, fire: (records) => observerCallback(records) };
}

test('aurora: visibility drives a data attribute (CSS pauses the animation while hidden)', () => {
  const h = foundationHarness();
  assert.equal(h.attrs.get('data-us-visibility'), 'visible');
  h.documentRef.hidden = true;
  h.docListeners.get('visibilitychange')();
  assert.equal(h.attrs.get('data-us-visibility'), 'hidden');
  h.handle.destroy();
});

test('capsule: attention turning on in the floating control or the dock names the arrival once, then leaves', () => {
  const h = foundationHarness();
  let clicked = 0;
  const shellTarget = (value, label = 'Bea ti ha lasciato qualcosa') => ({
    getAttribute: (k) => (k === 'data-us-attention' ? value : k === 'aria-label' ? label : null),
    closest: (sel) => (sel === '.us-nav' ? {} : null), click: () => { clicked += 1; }
  });
  h.fire([{ target: shellTarget('on'), oldValue: 'off' }]);
  assert.equal(h.capsule.getAttribute('data-state'), 'shown');
  const pill = h.capsule.firstChild;
  assert.equal(pill.tagName, 'button', 'a real destination makes the capsule tappable');
  assert.equal(pill.children[1].textContent, 'Bea ti ha lasciato qualcosa');
  // A second arrival does not push the first one out.
  h.fire([{ target: shellTarget('on', 'Gioca · Bea ha iniziato'), oldValue: 'off' }]);
  assert.equal(h.capsule.firstChild.children[1].textContent, 'Bea ti ha lasciato qualcosa');
  pill.listeners.click();
  assert.equal(clicked, 1, 'tap opens the control\'s own destination');
  assert.equal(h.capsule.getAttribute('data-state'), 'leaving');
  // Already-on, off, and controls outside the shell (the Oggi cards) never speak.
  const fresh = foundationHarness();
  fresh.fire([{ target: shellTarget('on'), oldValue: 'on' }]);
  fresh.fire([{ target: shellTarget('off'), oldValue: 'on' }]);
  fresh.fire([{ target: { getAttribute: () => 'on', closest: () => null }, oldValue: 'off' }]);
  assert.equal(fresh.capsule.getAttribute('data-state'), null);
  fresh.handle.destroy();
  h.handle.destroy();
});

test('capsule: it auto-hides, and a hidden document never shows it', () => {
  const { capsule } = require('../ui-foundation.js');
  const h = foundationHarness();
  assert.equal(capsule({ text: 'Bea ti pensa' }), true);
  assert.equal(h.capsule.firstChild.tagName, 'span', 'no destination, no button');
  const hide = h.timers.find((t) => t.ms === 3600);
  assert.ok(hide, 'shown for a few seconds');
  hide.fn();
  assert.equal(h.capsule.getAttribute('data-state'), 'leaving');
  h.documentRef.hidden = true;
  assert.equal(capsule({ text: 'Bea ti pensa' }), false);
  h.handle.destroy();
});

// ---------------------------------------------------------------- ATTENTION

test('attention: Left for You and Gioca (Per voi) use the same primitive, driven by data-us-attention', () => {
  const envelope = topBar.match(/<button[^>]*id="leftForYouPartnerEntry"[^>]*>/)[0];
  assert.match(envelope, /us-attention-orbit/);
  assert.match(envelope, /data-us-attention="off"/);
  assert.equal((topBar.match(/data-us-attention-icon/g) || []).length, 1);
  const gioca = html.match(/<button[^>]*id="usNavGioca"[^>]*>/)[0];
  assert.match(gioca, /data-page="quiz"/);
  assert.match(gioca, /data-us-attention="off"/);
  assert.match(read('games.js'), /byId\('usNavGioca'\)/);
  assert.match(read('games.js'), /us-gv2-pervoi us-attention-orbit[^`]*data-us-attention=/);
});

test('attention: the primitive is generic (no envelope/Per voi selectors), slow with a rest, and reduced-motion aware', () => {
  const block = foundationCss.slice(foundationCss.indexOf('M10E / M12A'), foundationCss.indexOf('M12A — Tiles and their destinations'));
  assert.doesNotMatch(block, /envelope|pervoi|leftForYou|usPerVoiTop/i);
  assert.match(block, /\.us-attention-orbit\[data-us-attention="on"\] \[data-us-attention-icon\]\{[^}]*animation:us-attention-breathe/);
  assert.match(block, /us-attention-period,5\.2s/);
  assert.match(block, /64%,100%\{--us-attention-angle:360deg;opacity:0\}/, 'each cycle ends in a calm rest');
  assert.match(block, /prefers-reduced-motion:reduce/);
  assert.match(block, /:root\[data-us-motion="reduced"\] \.us-attention-orbit\[data-us-attention="on"\]::after,[\s\S]*animation:none/);
  assert.doesNotMatch(block, /infinite[^;]*bounce|shake/i);
  // The state source of truth did not move: renderers still set data-us-attention.
  assert.match(read('left-for-you.js'), /data-us-attention|dataset\.usAttention/);
});

// ---------------------------------------------------------------- NAV

test('nav: a single sliding indicator whose slot follows the active tab', () => {
  const nav = html.match(/<nav class="nav us-nav us-nav-premium"[\s\S]*?<\/nav>/)[0];
  assert.match(nav, /<span class="us-nav-track" aria-hidden="true"><span class="us-nav-indicator"><\/span><\/span>/);
  assert.deepEqual([...nav.matchAll(/data-page="(\w+)"/g)].map((m) => m[1]), ['home', 'bond', 'moments', 'quiz'], 'tab order unchanged');
  for (let i = 1; i <= 4; i += 1) {
    assert.match(foundationCss, new RegExp(`\\.us-nav:has\\(> button:nth-of-type\\(${i}\\)\\.active\\)\\{--us-nav-index:${i - 1}\\}`));
  }
  // US-HUMAN-UI-01: the glide settles with a short, small overshoot.
  assert.match(foundationCss, /\.us-nav-indicator\{[^}]*transform:translate3d\(calc\(var\(--us-nav-index,0\) \* 100%\),0,0\)[^}]*transition:transform 300ms cubic-bezier\(\.3,1\.25,\.5,1\)/);
  assert.match(foundationCss, /@media \(prefers-reduced-motion:reduce\)\{\.us-nav-indicator\{transition:none\}/);
});

test('nav: navigation logic is untouched (go() still only toggles the active class)', () => {
  const app = read('app.js');
  assert.match(app, /document\.querySelectorAll\('\.nav button'\)\.forEach\(b=>b\.classList\.toggle\('active',b\.dataset\.page===id\)\);/);
  assert.match(app, /function openQuizHub\(options=\{\}\)\{go\('quiz',options\);window\.USGameV2\?\.showHub\(\);\}/);
});

// ---------------------------------------------------------------- TILES

test('tiles: Noi and Gioca tiles share one press + destination primitive', () => {
  assert.equal((html.match(/noi-hub-card[^"]*"[^>]*>/g) || []).length, 5);
  for (const card of html.match(/<button[^>]*class="noi-hub-card[^>]*>/g)) assert.match(card, /data-us-tile/);
  const games = read('games.js');
  assert.match(games, /data-us-tile data-us-feedback="tap" class="us-gv2-mode/);
  assert.match(games, /data-us-tile data-us-feedback="tap" class="us-gv2-pervoi/);
  assert.match(foundationCss, /\[data-us-tile\]:active\{transform:scale\(\.975\)\}/);
  assert.match(foundationCss, /\.us-content-enter\{animation:us-content-enter var\(--us-motion-fast\)/);
  assert.match(foundationCss, /@keyframes us-content-enter\{from\{opacity:0;transform:translate3d\(0,8px,0\)\}/);
  assert.match(read('styles.css'), /#bond \.noi-canonical-page:not\(\[data-noi-view="hub"\]\)>:is\(/);
  // Purely presentational: opening is not delayed.
  assert.doesNotMatch(games, /setTimeout\([^)]*openSession|setTimeout\([^)]*chooseMode/);
});
