// US V3 — Oggi themes and background effects: one catalog, shared preview and
// real-surface CSS, entitlement from Rewards V2, device-local persistence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const lookJs = read('oggi-look.js');
const lookCss = read('oggi-look.css');
const progressionJs = read('progression.js');
const html = read('index.html');

const THEMES = ['original', 'romantic', 'pastel', 'cinematic', 'moonlight', 'seasonal'];
const EFFECTS = ['none', 'hearts', 'stars', 'petals', 'fireflies', 'bokeh', 'snow'];

// ------------------------------------------------------------------ fake DOM
function fakeNode(id = '') {
  const attrs = {};
  const listeners = {};
  const node = {
    id, hidden: false, dataset: {}, innerHTML: '', textContent: '', children: [], className: '',
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); }, toggle(c, on) { if (on ?? !this.set.has(c)) this.set.add(c); else this.set.delete(c); } },
    style: {},
    setAttribute(n, v) { attrs[n] = String(v); }, getAttribute: (n) => attrs[n] ?? null, removeAttribute(n) { delete attrs[n]; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    emit(type, event) { return Promise.all((listeners[type] || []).map((fn) => fn(event))); },
    querySelector(sel) {
      const m = sel.match(/^:scope > \.([a-z-]+)$/);
      if (m) return node.children.find((c) => c.className === m[1]) || null;
      return null;
    },
    querySelectorAll: () => [],
    insertBefore(child, ref) { const i = ref ? node.children.indexOf(ref) : -1; if (i < 0) node.children.push(child); else node.children.splice(i, 0, child); return child; },
    appendChild(child) { node.children.push(child); return child; },
    get firstChild() { return node.children[0] || null; },
    get nextSibling() { return null; },
    focus() {}, insertAdjacentHTML() {}
  };
  return node;
}

function boot({ rewards = [], level = 1, profile = { id: 'f', couple_id: 'c', role: 'francesco' }, storageSeed = {}, reduced = false, lowPower = false } = {}) {
  const elements = new Map();
  const root = fakeNode('html');
  const storage = new Map(Object.entries(storageSeed));
  const windowListeners = {};
  const document = {
    documentElement: root, readyState: 'complete', hidden: false, activeElement: null, body: fakeNode('body'),
    getElementById: (id) => { if (!elements.has(id)) elements.set(id, fakeNode(id)); return elements.get(id); },
    createElement: () => fakeNode(), addEventListener() {}, querySelector: () => null
  };
  const hero = document.getElementById('homeHero');
  const shade = fakeNode(); shade.className = 'home-photo-shade'; hero.children.push(shade);
  const calls = [];
  const sb = { rpc: async (name, args) => { calls.push([name, args]); return { data: { total_xp: 0, level, rewards, pending_unlocks: [], next_reward: null, preferences: {} }, error: null }; } };
  const window = {
    document, usProfile: null,
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    navigator: lowPower ? { hardwareConcurrency: 4, deviceMemory: 2 } : { hardwareConcurrency: 8, deviceMemory: 8 },
    matchMedia: (q) => ({ matches: reduced && q.includes('reduce'), addEventListener() {} }),
    addEventListener(type, fn) { (windowListeners[type] ||= []).push(fn); },
    dispatchEvent(event) { for (const fn of windowListeners[event.type] || []) fn(event); },
    UsFeedback: { action() {}, success() {}, selection() {} },
    getComputedStyle: () => ({ backgroundImage: 'none' }), requestAnimationFrame: (fn) => fn()
  };
  const context = vm.createContext({ window, document, sb, console, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } }, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: (fn) => fn(), MutationObserver: class { observe() {} }, getComputedStyle: window.getComputedStyle, CSS: { escape: (s) => s } });
  vm.runInContext(lookJs, context, { filename: 'oggi-look.js' });
  vm.runInContext(progressionJs, context, { filename: 'progression.js' });
  window.usProfile = profile;
  const identityChange = () => window.dispatchEvent({ type: 'us-identity-change' });
  return { window, root, hero, storage, calls, look: window.USOggiLook, progression: window.USProgression, el: document.getElementById, identityChange };
}
const plain = (value) => JSON.parse(JSON.stringify(value)); // vm objects come from another realm
const reward = (id, category, level, unlocked) => ({ id, token: id, category, level_required: level, unlocked, title: id, description: id, equipped: false });
const v3Rewards = (level) => [
  reward('oggi_effect_petals', 'oggi_effect', 2, level >= 2), reward('oggi_theme_cinematic', 'oggi_theme', 4, level >= 4),
  reward('oggi_effect_fireflies', 'oggi_effect', 6, level >= 6), reward('oggi_theme_moonlight', 'oggi_theme', 7, level >= 7),
  reward('oggi_effect_bokeh', 'oggi_effect', 10, level >= 10), reward('oggi_theme_seasonal', 'oggi_theme', 12, level >= 12),
  reward('oggi_effect_snow', 'oggi_effect', 13, level >= 13)
];

// ------------------------------------------------------------------ catalog + CSS
test('Oggi looks: six curated themes and seven effects, with a free starter set and no fake currency', () => {
  const { look } = boot();
  assert.deepEqual(plain(look.THEMES.map((t) => t.id)), THEMES);
  assert.deepEqual(plain(look.EFFECTS.map((e) => e.id)), EFFECTS);
  assert.deepEqual(plain(look.THEMES.filter((t) => !t.reward).map((t) => t.id)), ['original', 'romantic', 'pastel']);
  assert.deepEqual(plain(look.EFFECTS.filter((e) => !e.reward).map((e) => e.id)), ['none', 'hearts', 'stars']);
  const copy = [...look.THEMES, ...look.EFFECTS].map((l) => `${l.name} ${l.note}`).join(' ').toLowerCase();
  assert.doesNotMatch(copy, /\bcoin|monet|gettoni|crediti|premium|acquista/);
});

test('Oggi looks: every theme is ONE token block shared by the real Oggi and its preview', () => {
  for (const id of THEMES.slice(1)) {
    assert.match(lookCss, new RegExp(`html\\[data-us-oggi-theme="${id}"\\],\\s*\\.us-look-phone\\[data-oggi-theme="${id}"\\]\\{`), id);
  }
  assert.match(lookCss, /:root,\s*\.us-look-phone\[data-oggi-theme="original"\]\{/, 'the original look resets every token');
  for (const id of EFFECTS.slice(1)) assert.match(lookCss, new RegExp(`\\.us-oggi-fx\\[data-fx="${id}"\\]>i\\{`), id);
});

test('Oggi looks: themes never restyle global US — only --oggi-* tokens consumed by Oggi selectors', () => {
  const blocks = [...lookCss.matchAll(/html\[data-us-oggi-theme="[a-z]+"\],[^{]*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(blocks.length, 5);
  for (const body of blocks) {
    const props = [...body.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]);
    assert.ok(props.length > 8);
    assert.ok(props.every((p) => p.startsWith('--oggi-')), `only Oggi tokens: ${props.filter((p) => !p.startsWith('--oggi-'))}`);
  }
  const consumers = [...lookCss.matchAll(/^(html\[data-us-oggi-theme[^{]*)\{/gm)].map((m) => m[1]).filter((sel) => !/^html\[data-us-oggi-theme="[a-z]+"\],/.test(sel));
  assert.ok(consumers.length > 6);
  for (const sel of consumers) assert.match(sel, /#home|#homeHero|body:has\(#home\.page\.active\)/, `scoped to Oggi: ${sel}`);
  assert.doesNotMatch(lookCss, /data-us-theme=/, 'the global Atmosfera US stays progression.css territory');
  assert.match(read('progression.css'), /:root\[data-us-theme="rose"\]/, 'and keeps working');
});

test('Oggi effects: above the photo, below every control, never blocking touches, still under reduced motion', () => {
  assert.match(lookCss, /#homeHero>\.us-oggi-tint,#homeHero>\.us-oggi-deco,#homeHero>\.us-oggi-fx\{position:absolute;inset:0;pointer-events:none\}/);
  assert.match(lookCss, /#homeHero>\.us-oggi-fx\{z-index:3\}/);
  assert.match(read('countdown.css'), /\.us-countdown-display\{position:relative;z-index:4;/, 'the countdown stays above effects');
  assert.match(read('styles.css'), /\.us-oggi-stack\{position:absolute;z-index:4;/, 'Oggi controls stay above effects');
  assert.match(lookCss, /@media\(prefers-reduced-motion:reduce\)\{\s*\.us-oggi-fx>i\{animation:none!important;/);
  assert.match(lookCss, /html\.us-oggi-fx-paused #homeHero \.us-oggi-fx>i\{animation-play-state:paused\}/);
  const frames = [...lookCss.matchAll(/@keyframes (us-fx-[a-z-]+)\{(.*)\}$/gm)];
  assert.ok(frames.length >= 6);
  for (const [, name, body] of frames) assert.doesNotMatch(body, /\b(width|height|top|left|margin|padding|filter|box-shadow)\s*:/, `${name} animates only transform/opacity`);
  const urls = (lookCss + lookJs).replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '');
  assert.doesNotMatch(urls, /https?:\/\//, 'no remote asset is ever loaded (only the inline SVG namespace)');
});

// ------------------------------------------------------------------ runtime
test('Oggi looks: choosing a free look applies at once and persists in this phone\'s cosmetics, not the server', async () => {
  const { look, progression, root, storage, calls, hero } = boot();
  await progression.hydrate({ force: true, showUnlocks: false });
  assert.equal(await progression.setLook('theme', 'romantic'), true);
  assert.equal(await progression.setLook('effect', 'hearts'), true);
  assert.equal(root.dataset.usOggiTheme, 'romantic');
  assert.equal(root.dataset.usOggiEffect, 'hearts');
  const fx = hero.children.find((c) => c.className === 'us-oggi-fx');
  assert.equal((fx.innerHTML.match(/<i style=/g) || []).length, 9, 'nine hearts on a capable phone');
  const saved = JSON.parse(storage.get('us:cosmetics:v1:c:f'));
  assert.equal(saved.preferences.oggi_theme, 'romantic');
  assert.equal(saved.preferences.oggi_effect, 'hearts');
  assert.deepEqual(calls.map(([n]) => n), ['get_progression_v1'], 'no write RPC: the look is device-local');
  assert.deepEqual(plain(look.current()), { theme: 'romantic', effect: 'hearts' });
  // Restore the original look.
  await progression.setLook('theme', 'original');
  await progression.setLook('effect', 'none');
  assert.equal(root.dataset.usOggiTheme, undefined);
  assert.equal(root.dataset.usOggiEffect, undefined);
  assert.equal(JSON.parse(storage.get('us:cosmetics:v1:c:f')).preferences.oggi_theme, null);
});

test('Oggi looks: locked looks preview but cannot be applied; looks the server does not offer stay hidden', async () => {
  const before = boot();
  await before.progression.hydrate({ force: true, showUnlocks: false });
  assert.equal(before.look.status('theme', 'moonlight').state, 'unavailable', 'migration not applied: never shown as a fake reward');
  assert.equal(await before.progression.setLook('theme', 'moonlight'), false);

  const after = boot({ rewards: v3Rewards(6), level: 6 });
  await after.progression.hydrate({ force: true, showUnlocks: false });
  assert.deepEqual(plain(after.look.status('theme', 'moonlight')), { state: 'locked', level: 7 });
  assert.equal(after.look.status('theme', 'cinematic').state, 'unlocked');
  assert.equal(await after.progression.setLook('theme', 'moonlight'), false, 'locked');
  assert.equal(await after.progression.setLook('theme', 'cinematic'), true);
  assert.equal(after.root.dataset.usOggiTheme, 'cinematic');
});

test('Oggi looks: a restart paints the stored look before the server answers; entitlement is re-checked', async () => {
  const stored = JSON.stringify({ version: 2, couple_id: 'c', profile_id: 'f', preferences: { oggi_theme: 'cinematic', oggi_effect: 'stars' } });
  const phone = boot({ storageSeed: { 'us:cosmetics:v1:c:f': stored }, rewards: [], level: 1 });
  phone.identityChange();
  assert.equal(phone.root.dataset.usOggiTheme, 'cinematic', 'early paint from this phone');
  assert.equal(phone.root.dataset.usOggiEffect, 'stars');
  await phone.progression.hydrate({ force: true, showUnlocks: false });
  assert.equal(phone.root.dataset.usOggiTheme, undefined, 'the server does not entitle Cinematic: back to the original');
  assert.equal(phone.root.dataset.usOggiEffect, 'stars', 'a free effect stays');
});

test('Oggi looks: each identity on the phone keeps its own look; logout returns to the original', async () => {
  const francesco = JSON.stringify({ version: 2, couple_id: 'c', profile_id: 'f', preferences: { oggi_theme: 'romantic' } });
  const bea = JSON.stringify({ version: 2, couple_id: 'c', profile_id: 'b', preferences: { oggi_theme: 'pastel', oggi_effect: 'hearts' } });
  const phone = boot({ storageSeed: { 'us:cosmetics:v1:c:f': francesco, 'us:cosmetics:v1:c:b': bea } });
  phone.identityChange();
  assert.equal(phone.root.dataset.usOggiTheme, 'romantic');
  phone.window.usProfile = { id: 'b', couple_id: 'c', role: 'beatrice' };
  phone.identityChange();
  assert.equal(phone.root.dataset.usOggiTheme, 'pastel');
  assert.equal(phone.root.dataset.usOggiEffect, 'hearts');
  phone.window.usProfile = null;
  phone.identityChange();
  assert.equal(phone.root.dataset.usOggiTheme, undefined);
  assert.equal(phone.root.dataset.usOggiEffect, undefined);
});

test('Oggi effects: fewer particles on modest phones, the same deterministic composition everywhere', async () => {
  const strong = boot();
  const weak = boot({ lowPower: true });
  for (const phone of [strong, weak]) {
    await phone.progression.hydrate({ force: true, showUnlocks: false });
    await phone.progression.setLook('effect', 'stars');
  }
  const count = (phone) => (phone.hero.children.find((c) => c.className === 'us-oggi-fx').innerHTML.match(/<i style=/g) || []).length;
  assert.equal(count(strong), 12);
  assert.ok(count(weak) < count(strong) && count(weak) >= 3);
  const again = boot();
  await again.progression.hydrate({ force: true, showUnlocks: false });
  await again.progression.setLook('effect', 'stars');
  assert.equal(again.hero.children.find((c) => c.className === 'us-oggi-fx').innerHTML, strong.hero.children.find((c) => c.className === 'us-oggi-fx').innerHTML);
});

// ------------------------------------------------------------------ wiring
test('Oggi looks: reachable from Settings and Sintonia, Back-aware, shipped to PWA and native', () => {
  assert.match(html, /data-us-setting="oggi-theme"[\s\S]{0,400}id="usOggiThemeValue"/);
  assert.match(html, /data-us-setting="oggi-effect"[\s\S]{0,400}id="usOggiEffectValue"/);
  const settings = read('settings.js');
  assert.match(settings, /if\(name==='oggi-theme'\)return window\.USOggiLook\?\.openGallery\?\.\(\{tab:'theme'\}\)/);
  assert.match(settings, /if\(name==='oggi-effect'\)return window\.USOggiLook\?\.openGallery\?\.\(\{tab:'effect'\}\)/);
  assert.match(progressionJs, /window\.USOggiLook\?\.openGallery\?\.\(\{ tab: look\.dataset\.lookSlot, look: look\.dataset\.lookId \}\)/);
  const nav = read('navigation.js');
  assert.match(nav, /name:'oggi-look',\s*find:\(\)=>document\.getElementById\('usLookSheet'\)/);
  assert.match(nav, /name:'oggi-look-detail',\s*find:\(\)=>document\.getElementById\('usLookDetail'\)/);
  const worker = read('service-worker.js');
  for (const file of ['oggi-look.js', 'oggi-look.css']) {
    assert.match(html, new RegExp(`/${file.replace('.', '\\.')}\\?v=`));
    assert.ok(worker.includes(`versioned("/${file}")`), file);
    for (const build of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.ok(read(build).includes(`'${file}'`), `${build} ships ${file}`);
  }
  assert.ok(html.indexOf('/progression.css') < html.indexOf('/oggi-look.css'), 'Oggi tokens load after the global atmosphere');
});

test('Oggi looks: the photo pipeline is untouched — no new photo fetch, only a filter on the existing layers', () => {
  assert.doesNotMatch(lookJs, /sb\.|storage\.from|createSignedUrl|fetch\(/);
  assert.match(lookCss, /html\[data-us-oggi-theme\] #homeHero \.home-photo-layer,\.us-look-phone \.us-look-photo\{filter:var\(--oggi-photo-filter\)\}/);
  assert.doesNotMatch(lookCss, /\.home-photo-layer[^{]*\{[^}]*(?:opacity|transform|transition|background-image)/, 'rotation and cross-fade stay app.js territory');
});
