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
const fxJs = read('oggi-fx.js');
const progressionJs = read('progression.js');
const html = read('index.html');

// Premi di Oggi (founder, 25/11/2026; grill D3–D16 and the approved tavola):
// four themes, and eight effects in three steps (Base, Natura, Vostri).
const THEMES = ['original', 'film', 'golden', 'seasonal'];
const EFFECTS = ['none', 'hearts', 'petals', 'dandelions', 'snow', 'leaves', 'shooting', 'lanterns', 'memories'];
const LEVELS = { golden: 6, seasonal: 12, dandelions: 4, snow: 7, leaves: 10, shooting: 13, lanterns: 16, memories: 20 };

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
  reward('oggi_effect_dandelions', 'oggi_effect', 4, level >= 4), reward('oggi_theme_golden', 'oggi_theme', 6, level >= 6),
  reward('oggi_effect_snow', 'oggi_effect', 7, level >= 7), reward('oggi_effect_leaves', 'oggi_effect', 10, level >= 10),
  reward('oggi_theme_seasonal', 'oggi_theme', 12, level >= 12), reward('oggi_effect_shooting', 'oggi_effect', 13, level >= 13),
  reward('oggi_effect_lanterns', 'oggi_effect', 16, level >= 16), reward('oggi_effect_memories', 'oggi_effect', 20, level >= 20)
];

// ------------------------------------------------------------------ catalog + CSS
test('Oggi looks: four themes and eight effects in three steps, a free Base and no fake currency', () => {
  const { look } = boot();
  assert.deepEqual(plain(look.THEMES.map((t) => t.id)), THEMES);
  assert.deepEqual(plain(look.EFFECTS.map((e) => e.id)), EFFECTS);
  assert.deepEqual(plain(look.THEMES.filter((t) => !t.reward).map((t) => t.id)), ['original', 'film']);
  assert.deepEqual(plain(look.EFFECTS.filter((e) => !e.reward).map((e) => e.id)), ['none', 'hearts', 'petals']);
  for (const [id, level] of Object.entries(LEVELS)) assert.equal(look.find(id in { golden: 1, seasonal: 1 } ? 'theme' : 'effect', id).level, level, id);
  assert.deepEqual(plain(look.EFFECTS.filter((e) => e.step).map((e) => e.step)), ['Base', 'Base', 'Natura', 'Natura', 'Natura', 'Vostri', 'Vostri', 'Vostri']);
  // Gone (grill D4, D14): never offered again; a stored choice falls back to the original.
  for (const gone of ['pastel', 'cinematic', 'sky', 'romantic', 'moonlight']) assert.equal(look.find('theme', gone), null, gone);
  for (const gone of ['stars', 'fireflies', 'bokeh', 'aurora']) assert.equal(look.find('effect', gone), null, gone);
  const copy = [...look.THEMES, ...look.EFFECTS].map((l) => `${l.name} ${l.note}`).join(' ').toLowerCase();
  assert.doesNotMatch(copy, /\bcoin|monet|gettoni|crediti|premium|acquista/);
});

test('Oggi looks: every theme is ONE token block shared by the real Oggi and its preview', () => {
  for (const id of THEMES.slice(1)) {
    assert.match(lookCss, new RegExp(`html\\[data-us-oggi-theme="${id}"\\],\\s*\\.us-look-phone\\[data-oggi-theme="${id}"\\]\\{`), id);
  }
  assert.match(lookCss, /:root,\s*\.us-look-phone\[data-oggi-theme="original"\]\{/, 'the original look resets every token');
  // The effects are drawn by one engine (oggi-fx.js), each by hand, on one canvas.
  for (const id of EFFECTS.slice(1)) assert.match(fxJs, new RegExp(`^  ${id}: \\(k`, 'm'), id);
  assert.match(lookCss, /\.us-oggi-fx>canvas\.us-oggi-fx-canvas\{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none\}/);
});

test('Oggi looks: themes never restyle global US — only --oggi-* tokens consumed by Oggi selectors', () => {
  const blocks = [...lookCss.matchAll(/html\[data-us-oggi-theme="[a-z]+"\],[^{]*\{([^}]*)\}/g)].map((m) => m[1]);
  assert.equal(blocks.length, 3);
  for (const body of blocks) {
    const props = [...body.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]);
    assert.ok(props.length > 8);
    assert.ok(props.every((p) => p.startsWith('--oggi-')), `only Oggi tokens: ${props.filter((p) => !p.startsWith('--oggi-'))}`);
  }
  // Token blocks: one per theme, and the seasons of Stagioni (Sintonia V2) on top of theirs.
  const consumers = [...lookCss.matchAll(/^(html\[data-us-oggi-theme[^{]*)\{/gm)].map((m) => m[1]).filter((sel) => !/^html\[data-us-oggi-theme="[a-z]+"\](\[data-us-oggi-season="[a-z]+"\])?,/.test(sel));
  assert.ok(consumers.length > 3);
  for (const sel of consumers) assert.match(sel, /#home|#homeHero|body:has\(#home\.page\.active\)/, `scoped to Oggi: ${sel}`);
  assert.doesNotMatch(lookCss, /data-us-theme=/, 'the global Atmosfera US stays progression.css territory');
  assert.match(read('progression.css'), /:root\[data-us-theme="rose"\]/, 'and keeps working');
});

test('Oggi effects: above the photo, below every control, never blocking touches, still under reduced motion', () => {
  assert.match(lookCss, /#homeHero>\.us-oggi-tint,#homeHero>\.us-oggi-deco,#homeHero>\.us-oggi-fx\{position:absolute;inset:0;pointer-events:none\}/);
  assert.match(lookCss, /#homeHero>\.us-oggi-fx\{z-index:3\}/);
  assert.match(read('countdown.css'), /\.us-countdown-display\{position:relative;z-index:4;/, 'the countdown stays above effects');
  assert.match(read('styles.css'), /\.us-oggi-stack\{position:absolute;z-index:4;/, 'Oggi controls stay above effects');
  // One loop draws only what is on screen and never while Oggi or the app is hidden;
  // reduced motion gets one still frame and no burst.
  assert.match(fxJs, /const paused = \(h\) => document\.hidden \|\| \(h\.hero && document\.documentElement\.classList\.contains\('us-oggi-fx-paused'\)\);/);
  assert.match(fxJs, /if \(raf \|\| reducedMotion\(\)\) return;/);
  assert.match(fxJs, /burst\(\) \{ if \(reducedMotion\(\)\) return;/);
  assert.match(fxJs, /if \(!reducedMotion\(\) \|\| !this\.fx \|\| !this\.w\) return;/);
  assert.match(lookJs, /document\.documentElement\.classList\.toggle\('us-oggi-fx-paused', paused\);/);
  const urls = (lookCss + lookJs + fxJs).replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '');
  assert.doesNotMatch(urls, /https?:\/\//, 'no remote asset is ever loaded (only the inline SVG namespace)');
});

// ------------------------------------------------------------------ runtime
test('Oggi looks: choosing a free look applies at once and persists in this phone\'s cosmetics, not the server', async () => {
  const { look, progression, root, storage, calls, hero } = boot();
  await progression.hydrate({ force: true, showUnlocks: false });
  assert.equal(await progression.setLook('theme', 'film'), true);
  assert.equal(await progression.setLook('effect', 'hearts'), true);
  assert.equal(root.dataset.usOggiTheme, 'film');
  assert.equal(root.dataset.usOggiEffect, 'hearts');
  const fx = hero.children.find((c) => c.className === 'us-oggi-fx');
  assert.equal(fx.dataset.fx, 'hearts', 'the layer knows its effect; oggi-fx.js draws it');
  const saved = JSON.parse(storage.get('us:cosmetics:v1:c:f'));
  assert.equal(saved.preferences.oggi_theme, 'film');
  assert.equal(saved.preferences.oggi_effect, 'hearts');
  assert.deepEqual(calls.map(([n]) => n), ['get_progression_v1'], 'no write RPC: the look is device-local');
  assert.deepEqual(plain(look.current()), { theme: 'film', effect: 'hearts' });
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
  assert.equal(before.look.status('theme', 'golden').state, 'unavailable', 'migration not applied: never shown as a fake reward');
  assert.equal(await before.progression.setLook('theme', 'golden'), false);

  const after = boot({ rewards: v3Rewards(6), level: 6 });
  await after.progression.hydrate({ force: true, showUnlocks: false });
  assert.deepEqual(plain(after.look.status('theme', 'seasonal')), { state: 'locked', level: 12, plus: false });
  assert.equal(after.look.status('theme', 'golden').state, 'unlocked');
  assert.equal(after.look.status('effect', 'dandelions').state, 'unlocked');
  assert.deepEqual(plain(after.look.status('effect', 'memories')), { state: 'locked', level: 20, plus: false });
  assert.equal(await after.progression.setLook('theme', 'seasonal'), false, 'locked');
  assert.equal(await after.progression.setLook('effect', 'memories'), false, 'locked');
  assert.equal(await after.progression.setLook('theme', 'golden'), true);
  assert.equal(await after.progression.setLook('effect', 'dandelions'), true);
  assert.equal(after.root.dataset.usOggiTheme, 'golden');
  assert.equal(after.root.dataset.usOggiEffect, 'dandelions');
});

test('Oggi looks: a restart paints the stored look before the server answers; entitlement is re-checked', async () => {
  const stored = JSON.stringify({ version: 2, couple_id: 'c', profile_id: 'f', preferences: { oggi_theme: 'golden', oggi_effect: 'hearts' } });
  const phone = boot({ storageSeed: { 'us:cosmetics:v1:c:f': stored }, rewards: [], level: 1 });
  phone.identityChange();
  assert.equal(phone.root.dataset.usOggiTheme, 'golden', 'early paint from this phone');
  assert.equal(phone.root.dataset.usOggiEffect, 'hearts');
  await phone.progression.hydrate({ force: true, showUnlocks: false });
  assert.equal(phone.root.dataset.usOggiTheme, undefined, 'the server does not entitle Ora d’oro: back to the original');
  assert.equal(phone.root.dataset.usOggiEffect, 'hearts', 'a free effect stays');
  // A look that left (Cinema, Stelle luminose) is never painted again.
  const old = boot({ storageSeed: { 'us:cosmetics:v1:c:f': JSON.stringify({ version: 2, couple_id: 'c', profile_id: 'f', preferences: { oggi_theme: 'cinematic', oggi_effect: 'stars' } }) } });
  old.identityChange();
  assert.equal(old.root.dataset.usOggiTheme, undefined);
  assert.equal(old.root.dataset.usOggiEffect, undefined);
});

test('Oggi looks: each identity on the phone keeps its own look; logout returns to the original', async () => {
  const francesco = JSON.stringify({ version: 2, couple_id: 'c', profile_id: 'f', preferences: { oggi_theme: 'film' } });
  const bea = JSON.stringify({ version: 2, couple_id: 'c', profile_id: 'b', preferences: { oggi_effect: 'petals' } });
  const phone = boot({ storageSeed: { 'us:cosmetics:v1:c:f': francesco, 'us:cosmetics:v1:c:b': bea } });
  phone.identityChange();
  assert.equal(phone.root.dataset.usOggiTheme, 'film');
  phone.window.usProfile = { id: 'b', couple_id: 'c', role: 'beatrice' };
  phone.identityChange();
  assert.equal(phone.root.dataset.usOggiTheme, undefined);
  assert.equal(phone.root.dataset.usOggiEffect, 'petals');
  phone.window.usProfile = null;
  phone.identityChange();
  assert.equal(phone.root.dataset.usOggiTheme, undefined);
  assert.equal(phone.root.dataset.usOggiEffect, undefined);
});

// The engine itself, in a fake canvas: every effect mounts, draws, answers a
// touch and a burst, the Vostri a swipe; modest phones get fewer pieces.
function engine({ lowPower = false, reduced = false } = {}) {
  const ops = { draws: 0 };
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'getImageData' ? () => ({ data: [255, 124, 150, 255] }) : k === 'drawImage' ? () => { ops.draws += 1; } : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
  const canvas = () => ({ className: '', width: 0, height: 0, isConnected: true, getContext: () => ctx, setAttribute() {}, getBoundingClientRect: () => ({ width: 390, height: 640, left: 0, top: 0 }) });
  const host = { children: [], querySelector: () => null, appendChild(c) { this.children.push(c); return c; }, dispatchEvent() {} };
  const document = { documentElement: { dataset: { usLuce: 'notte' }, classList: { contains: () => false } }, hidden: false, createElement: canvas, addEventListener() {} };
  const window = { document, navigator: lowPower ? { hardwareConcurrency: 4, deviceMemory: 2 } : { hardwareConcurrency: 8, deviceMemory: 8 }, matchMedia: (q) => ({ matches: reduced && q.includes('reduce') }), addEventListener() {}, devicePixelRatio: 2 };
  const context = vm.createContext({ window, document, getComputedStyle: () => ({ getPropertyValue: () => '' }), performance: { now: () => 0 }, requestAnimationFrame: () => 1, CustomEvent: class {}, Image: class {}, console });
  vm.runInContext(fxJs, context, { filename: 'oggi-fx.js' });
  return { fx: window.UsOggiFx, host, ops };
}
test('Oggi effects: one engine draws all eight; touch everywhere, swipe for the Vostri; fewer pieces on modest phones', () => {
  const strong = engine(), weak = engine({ lowPower: true });
  assert.deepEqual(plain(strong.fx.ids), EFFECTS.slice(1));
  for (const id of EFFECTS.slice(1)) {
    const h = strong.fx.mount(strong.host, id, { hero: true });
    assert.equal(h.id, id);
    for (let i = 0; i < 40; i += 1) { h.fx.step(1 / 30, i / 30); h.paint(i / 30, { luce: 'notte', tu: [255, 124, 150], pa: [169, 139, 255] }, 1 / 30); }
    h.tap(195, 300); h.burst(); h.fx.step(0.5, 2); h.paint(2, { luce: 'giorno', tu: [231, 161, 171], pa: [171, 157, 219] }, 0.5);
    assert.equal(h.answersSwipe(), ['shooting', 'lanterns', 'memories'].includes(id), id);
    if (h.answersSwipe()) { h.drag(120, 300); assert.equal(h.swipe(100, 400, 260, 200, 900, -700), true); h.fx.step(0.2, 3); }
    else assert.equal(h.swipe(100, 400, 260, 200, 900, -700), false, `${id} ignores a swipe`);
  }
  assert.equal(strong.fx.mount(strong.host, 'hearts').density, 1);
  assert.equal(weak.fx.mount(weak.host, 'hearts').density, 0.6);
  assert.equal(engine().fx.mount(engine().host, 'stars').fx, null, 'an effect that left draws nothing');
});

// ------------------------------------------------------------------ wiring
test('Oggi looks: reachable from Sintonia (not Settings), Back-aware, shipped to PWA and native', () => {
  // Founder, 29/10/2026: themes and effects live in Sintonia, where they are
  // unlocked; Settings no longer lists them. Their groups open the full gallery.
  assert.doesNotMatch(html, /data-us-setting="oggi-(theme|effect)"|PERSONALIZZA OGGI/);
  assert.match(progressionJs, /const LOOK_GALLERY = Object\.freeze\(\{ oggi_theme: 'theme', oggi_effect: 'effect' \}\);/);
  assert.match(progressionJs, /if \(gallery\?\.dataset\?\.lookGallery\) \{ window\.USOggiLook\?\.openGallery\?\.\(\{ tab: gallery\.dataset\.lookGallery \}\); return; \}/);
  // Round 3 (mockup 076): a look tile in the Sintonia collection applies the look directly, like every other tile.
  assert.doesNotMatch(progressionJs, /lookId === 'sky'/, 'Il vostro cielo left (grill D14)');
  assert.match(progressionJs, /ok = setDeviceLook\(data\.lookSlot, data\.lookId\)/);
  const nav = read('navigation.js');
  assert.match(nav, /name:'oggi-look',\s*find:\(\)=>document\.getElementById\('usLookSheet'\)/);
  assert.match(nav, /name:'oggi-look-detail',\s*find:\(\)=>document\.getElementById\('usLookDetail'\)/);
  const worker = read('service-worker.js');
  for (const file of ['oggi-fx.js', 'oggi-look.js', 'oggi-look.css']) {
    assert.match(html, new RegExp(`/${file.replace('.', '\\.')}\\?v=`));
    assert.ok(worker.includes(`versioned("/${file}")`), file);
    for (const build of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.ok(read(build).includes(`'${file}'`), `${build} ships ${file}`);
  }
  assert.ok(html.indexOf('/progression.css') < html.indexOf('/oggi-look.css'), 'Oggi tokens load after the global atmosphere');
  assert.ok(html.indexOf('/oggi-fx.js?v=') < html.indexOf('/oggi-look.js?v='), 'the engine loads before the looks');
  assert.doesNotMatch(html, /\/sky\.js\?v=/, 'Il vostro cielo is no longer loaded');
});

// Grill D11–D12: the finger plays with the effect in Foto a fuoco; three moments make it shine.
test('Oggi effects: in Foto a fuoco a tap plays, «Torna a Oggi» leaves; Ti penso, a special day and a new level make it shine', () => {
  const app = read('app.js');
  assert.match(app, /if\(oggiIsWidgetTarget\(event\.target\)\)return;\n  \/\/ Premi di Oggi \(grill D11\)[^\n]*\n[^\n]*\n  if\(window\.USOggiLook\?\.touchActive\?\.\(\)\)return;\n  toggleOggiFocusPhoto\(\);/);
  assert.match(lookJs, /const touchActive = \(\) => inFocus\(\) && applied\.effect !== DEFAULTS\.effect && Boolean\(heroFx\);/);
  assert.match(lookJs, /exit\.textContent = 'Torna a Oggi';/);
  assert.match(lookCss, /html\[data-us-oggi-effect\] #homeHero\.us-oggi-focus>\.us-oggi-focus-exit\{opacity:1;/);
  assert.match(app, /setTimeout\(\(\)=>window\.USOggiLook\?\.burst\?\.\(\),2800\);/, 'after the Ti penso\'s own moment');
  assert.match(progressionJs, /window\.USOggiLook\?\.burst\?\.\(\);/, 'a new level');
  assert.match(lookJs, /window\.UsPersonaggi\?\.reactionOf\?\.\(window\.usProfile\?\.role \|\| ''\) === 'festa'/, 'a special day, once');
  // «Ricordi in volo»: the couple's own six photos come from app.js, never from the engine.
  assert.match(app, /window\.usOggiMemoriesForFx=async function\(\)\{/);
  assert.doesNotMatch(fxJs, /sb\.|storage\.from|createSignedUrl|fetch\(/);
});

test('Oggi looks: the photo pipeline is untouched — no new photo fetch, only a filter on the existing layers', () => {
  assert.doesNotMatch(lookJs, /sb\.|storage\.from|createSignedUrl|fetch\(/);
  assert.match(lookCss, /html\[data-us-oggi-theme\] #homeHero \.home-photo-layer,\.us-look-phone \.us-look-photo\{filter:var\(--oggi-photo-filter\)\}/);
  assert.doesNotMatch(lookCss, /\.home-photo-layer[^{]*\{[^}]*(?:opacity|transform|transition|background-image)/, 'rotation and cross-fade stay app.js territory');
});

test('V3 countdown rewards: the Aurora, Orbita and Cromo previews still show after V3 moves them to the countdown category', () => {
  const { window, progression } = boot();
  window.USCountdown = { STYLES: [{ id: 'aurora', reward: 'frame_aurora' }], previewMarkup: (id) => `<i data-countdown-style="${id}"></i>` };
  for (const category of ['countdown', 'frame']) {
    const html = progression.previewMarkup({ id: 'frame_aurora', token: 'frame_aurora', category, level_required: 4 });
    assert.match(html, /us-cos-countdown/, category);
    assert.match(html, /data-countdown-style="aurora"/, category);
  }
  assert.doesNotMatch(progression.previewMarkup({ id: 'frame_other', token: 'frame_other', category: 'frame', level_required: 3 }), /us-cos-countdown/, 'a retired reward with no countdown style gets no preview');
});
