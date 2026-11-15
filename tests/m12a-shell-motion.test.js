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
// Il diario, ma pulito (15/11/2026): the top chrome of Oggi is its header (.dy-head).
const topBar = html.match(/<header class="dy-head">[\s\S]*?<\/header>/)[0];

// ---------------------------------------------------------------- SHELL

test('shell: Ti penso left, the US mark at the centre, Left for You right', () => {
  const think = topBar.indexOf('id="thinkButton"');
  // Il diario, ma pulito (15/11/2026): «us» in Permanent Marker is the centre (mockup).
  const brand = topBar.indexOf('class="dy-mark"');
  const envelope = topBar.indexOf('id="leftForYouPartnerEntry"');
  assert.ok(think > 0 && brand > think && envelope > brand, 'order: Ti penso, US, Left for You');
  assert.doesNotMatch(topBar, /id="usPerVoiTop"/, 'Per voi belongs to Gioca, not global chrome');
  assert.match(topBar, /<span class="dy-mark" role="img" aria-label="US">us<\/span>/);
  assert.match(read('diario.css'), /\.dy-head\{display:flex;justify-content:space-between;align-items:center;/);
});

test('shell: Events no longer owns the global centre slot but stays reachable', () => {
  assert.doesNotMatch(topBar, /usEventsTopEntry|us-events-top-control|I nostri eventi/);
  assert.doesNotMatch(identityCss, /us-events-top/);
  // Contextual homes: the dates of the Noi calendar (Noi nuova, 03/11/2026: no
  // Eventi tile; an event opens its editor, a mesiversario opens Eventi) and
  // the Oggi event priority card.
  assert.doesNotMatch(html, /data-noi-open-link/);
  assert.match(read('noi-v2.js'), /if\(kind==='anniversary'&&item\.dataset\.months!=='0'\)\{window\.openNoiSection\?\.\('eventi'\);return;\}/);
  assert.doesNotMatch(html, /id="usCalendarEventsLink"/);
  assert.match(read('app.js'), /if\(action==='events'\)window\.openEvents\?\.\(\)/);
});

test('shell: the canonical PWA/launcher mark is used as-is (display cropping only)', () => {
  const manifest = JSON.parse(read('assets/ASSET_MANIFEST.json'));
  const asset = manifest.assets.find((entry) => entry.path === 'assets/derived/brand/us-symbol-apk-foreground-v1.png');
  assert.equal(asset.status, 'APPROVED');
  assert.match(read('service-worker.js'), /"\/assets\/derived\/runtime\/us-symbol-256-v1\.png"/);
  assert.doesNotMatch(read('service-worker.js'), /us-symbol-apk-foreground-v1/, 'the 1254 px master is the install icon, not a shell asset');
  // Il diario, ma pulito (15/11/2026): the header no longer shows the mark; the
  // auth screen still does, as-is.
  assert.match(html, /<link rel="icon"[^>]+href="\/assets\/derived\/runtime\/us-symbol-256-v1\.png/);
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
  // Il diario, ma pulito (15/11/2026): the badge lives in the old top bar, which is now a hidden holder.
  assert.match(html, /<div class="top us-premium-top" hidden><div class="top-actions"><div class="online-badge warn" id="onlineBadge"/);
  assert.match(read('fix4.css'), /\.online-badge\.ok\{display:none!important\}/);
});

// ---------------------------------------------------------------- AURORA

test('aurora: one canonical layer with ambient drift, reaction and reduced-motion state', { skip: 'Il diario, ma pulito (15/11/2026): la barra in alto con l\'aurora non c\'è più, Oggi ha la sua testata su carta' }, () => {
  assert.match(topBar, /<span class="us-aurora" aria-hidden="true"><\/span>/);
  assert.match(foundationCss, /\.top\.us-premium-top>\.us-aurora\{[^}]*overflow:hidden[^}]*pointer-events:none/);
  assert.match(foundationCss, /animation:us-aurora-drift 12s ease-in-out infinite alternate/);
  assert.match(foundationCss, /\[data-us-aurora="react"\] \.us-aurora::before/);
  assert.match(foundationCss, /\[data-us-aurora="react"\] \.us-aurora::after\{animation:us-aurora-sweep 800ms/);
  // Reduced motion: no continuous travel.
  assert.match(foundationCss, /:root\[data-us-motion="reduced"\] \.us-aurora::before,\s*:root\[data-us-motion="reduced"\] \.us-aurora::after\{animation:none!important/);
  assert.match(foundationCss, /@media \(prefers-reduced-motion:reduce\)\{\s*\.us-aurora::before,\.us-aurora::after\{animation:none!important/);
  // A hidden document pauses the ambient animation.
  assert.match(foundationCss, /:root\[data-us-visibility="hidden"\] \.us-aurora::before/);
  // Cheap by construction: only transform/opacity, no filters, no JS loop.
  const block = foundationCss.slice(foundationCss.indexOf('M12A — Shell aurora'), foundationCss.indexOf('M12A — Tiles and their destinations'));
  assert.doesNotMatch(block, /filter:|blur\(/);
  assert.doesNotMatch(read('ui-foundation.js'), /setInterval/, 'no perpetual JS loop');
});

function foundationHarness({ reduced = false } = {}) {
  const { install } = require('../ui-foundation.js');
  const timers = [];
  const attrs = new Map();
  const barAttrs = new Map();
  const bar = { offsetWidth: 0, setAttribute: (k, v) => barAttrs.set(k, v), removeAttribute: (k) => barAttrs.delete(k), getAttribute: (k) => barAttrs.get(k) ?? null };
  const docListeners = new Map();
  const documentRef = {
    hidden: false,
    body: { tagName: 'BODY' },
    documentElement: { setAttribute: (k, v) => attrs.set(k, v) },
    activeElement: null,
    querySelector: (s) => (s === '.top.us-premium-top' ? bar : null),
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
  return { handle, attrs, barAttrs, docListeners, documentRef, timers, fire: (records) => observerCallback(records) };
}

test('aurora: visibility drives a data attribute (CSS pauses the animation while hidden)', () => {
  const h = foundationHarness();
  assert.equal(h.attrs.get('data-us-visibility'), 'visible');
  h.documentRef.hidden = true;
  h.docListeners.get('visibilitychange')();
  assert.equal(h.attrs.get('data-us-visibility'), 'hidden');
  h.handle.destroy();
});

test('aurora: the same layer reacts briefly when attention turns on in the top bar, then returns', () => {
  const { auroraPulse } = require('../ui-foundation.js');
  const h = foundationHarness();
  const topTarget = (value) => ({ getAttribute: () => value, closest: (s) => (s === '.top.us-premium-top' ? {} : null) });
  h.fire([{ target: topTarget('on'), oldValue: 'off' }]);
  assert.equal(h.barAttrs.get('data-us-aurora'), 'react');
  const reset = h.timers.find((t) => t.ms === 800);
  assert.ok(reset, 'reaction lasts about 800ms');
  reset.fn();
  assert.equal(h.barAttrs.get('data-us-aurora'), undefined, 'returns to the ambient state');

  // Not for already-on, off, or controls outside the top bar (e.g. the Oggi cards).
  h.fire([{ target: topTarget('on'), oldValue: 'on' }]);
  h.fire([{ target: topTarget('off'), oldValue: 'on' }]);
  h.fire([{ target: { getAttribute: () => 'on', closest: () => null }, oldValue: 'off' }]);
  assert.equal(h.barAttrs.get('data-us-aurora'), undefined);

  assert.equal(auroraPulse(), true, 'an explicit pulse (Ti penso arrival) uses the same system');
  h.handle.destroy();
});

test('aurora: reduced motion never pulses', () => {
  const h = foundationHarness({ reduced: true });
  const { auroraPulse, isReducedMotion } = require('../ui-foundation.js');
  assert.equal(isReducedMotion(), true);
  assert.equal(auroraPulse(), false);
  assert.equal(h.barAttrs.get('data-us-aurora'), undefined);
  h.handle.destroy();
});

// ---------------------------------------------------------------- ATTENTION

test('attention: global Left for You and Gioca Per voi share the same primitive', () => {
  // Il diario, ma pulito (15/11/2026): the envelope keeps data-us-attention (set by
  // left-for-you.js) but shows it with its red dot, not with the orbit ring.
  const envelope = topBar.match(/<button[^>]*id="leftForYouPartnerEntry"[^>]*>/)?.[0] || '';
  assert.doesNotMatch(envelope, /us-attention-orbit/);
  assert.match(envelope, /data-us-attention="off"/);
  assert.equal((topBar.match(/data-us-attention-icon/g) || []).length, 0, 'no orbit glyph in the header');
  // Per voi (Il diario, ma pulito): a «Da giocare» row whose status tag says what waits for you.
  const games = read('games.js');
  assert.match(games, /class="dy-game" data-gv2-action="per-voi"/);
  assert.match(games, />tocca a te<\/span>/);
  assert.match(games, /dataset\.usAttention = attention \? 'on' : 'off';/);
});

test('attention: the primitive is generic (no envelope/Per voi selectors), slow with a rest, and reduced-motion aware', () => {
  // Il diario, ma pulito (15/11/2026): the aurora comment that closed this block was pruned with the top bar.
  const block = foundationCss.slice(foundationCss.indexOf('M10E / M12A'), foundationCss.indexOf('M12A — One-shot soft pulse'));
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

test('nav: a single sliding indicator whose slot follows the active tab', { skip: 'Il diario, ma pulito (15/11/2026): la barra ha icone a tratto e lo scarabocchio rosso sotto la scheda attiva, non più l\'indicatore che scorre' }, () => {
  const nav = html.match(/<nav class="nav us-nav us-nav-premium"[\s\S]*?<\/nav>/)[0];
  assert.match(nav, /<span class="us-nav-track" aria-hidden="true"><span class="us-nav-indicator"><\/span><\/span>/);
  assert.deepEqual([...nav.matchAll(/data-page="(\w+)"/g)].map((m) => m[1]), ['home', 'bond', 'moments', 'quiz'], 'tab order unchanged');
  for (let i = 1; i <= 4; i += 1) {
    assert.match(foundationCss, new RegExp(`\\.us-nav:has\\(> button:nth-of-type\\(${i}\\)\\.active\\)\\{--us-nav-index:${i - 1}\\}`));
  }
  assert.match(foundationCss, /\.us-nav-indicator\{[^}]*transform:translate3d\(calc\(var\(--us-nav-index,0\) \* 100%\),0,0\)[^}]*transition:transform 210ms/);
  assert.match(foundationCss, /@media \(prefers-reduced-motion:reduce\)\{\.us-nav-indicator\{transition:none\}\}/);
});

test('nav: navigation logic is untouched (go() still only toggles the active class)', () => {
  const app = read('app.js');
  // Il diario, ma pulito (15/11/2026): the bottom nav is .dy-nav.
  assert.match(app, /document\.querySelectorAll\('\.dy-nav button'\)\.forEach\(b=>b\.classList\.toggle\('active',b\.dataset\.page===id\)\);/);
  assert.match(app, /function openQuizHub\(options=\{\}\)\{go\('quiz',options\);window\.USGameV2\?\.showHub\(\);\}/);
});

// ---------------------------------------------------------------- TILES

// US 1.0 (N10): the hidden Noi hub cards and the old board button (the Noi users
// of data-us-tile) are gone; the visible Noi links are unchanged.
test('tiles: Gioca destinations share one press + destination primitive', () => {
  assert.doesNotMatch(html, /class="noi-hub-card|id="noiWeekBoardOpen"/);
  const games = read('games.js');
  // Il diario, ma pulito (15/11/2026): the games and Per voi are .dy-game rows, same primitive.
  assert.match(games, /data-us-tile data-us-feedback="tap" class="dy-game" \$\{data\}/);
  assert.match(games, /data-us-tile data-us-feedback="tap" class="dy-game" data-gv2-action="per-voi"/);
  assert.match(foundationCss, /\[data-us-tile\]:active\{transform:scale\(\.975\)\}/);
  assert.match(foundationCss, /@keyframes us-content-enter\{from\{opacity:0;transform:translate3d\(0,8px,0\)\}/);
  assert.match(read('styles.css'), /#bond \.noi-canonical-page:not\(\[data-noi-view="hub"\]\)>:is\(/);
  // Purely presentational: opening is not delayed.
  assert.doesNotMatch(games, /setTimeout\([^)]*openSession|setTimeout\([^)]*chooseMode/);
});
