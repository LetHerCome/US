// Maudit 1.0 interaction — machine states, lifecycle and contracts (a still cat).
// Real pointer/geometry behaviour is covered by maudit-interaction-browser.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const Pet = require('../pet.js');
const petJs = read('pet.js');
const petCss = read('pet.css');
const html = read('index.html');
const settingsJs = read('settings.js');
const settingsCss = read('settings2.css');

function clock() {
  let now = 0; let seq = 0; const timers = new Map();
  return {
    schedule: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: now + ms }); return id; },
    cancel: (id) => timers.delete(id),
    pending: () => timers.size,
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const next = [...timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > until) break;
        timers.delete(next[0]); now = next[1].at; next[1].fn();
      }
      now = until;
    }
  };
}
function machine() {
  const c = clock(); const frames = [];
  const pet = Pet.createPet({ schedule: c.schedule, cancel: c.cancel, render: (f) => frames.push(f) });
  return { c, pet, frames, states: () => frames.map((f) => f.state) };
}

// Maudit sits still in its home spot (the approved mockup): no gestures,
// no placement, no planes, no gravity, no drag. Only its state changes.
test('Maudit is never carried: no pickup, drag, placement, plane or gravity API', () => {
  for (const retired of ['classifyPress', 'encodePlacement', 'decodePlacement', 'PLANES', 'freeSegments', 'choosePlane', 'chooseFallPlane', 'GESTURE', 'GRAVITY']) {
    assert.equal(Pet[retired], undefined, retired);
  }
  const { pet } = machine();
  for (const retired of ['hold', 'release', 'fall', 'land', 'place', 'setTrack']) assert.equal(pet[retired], undefined, retired);
  for (const state of ['held', 'fall', 'snap', 'walk']) assert.ok(!Pet.STATES.includes(state), state);
  assert.doesNotMatch(petCss, /data-pet-state="(held|fall|snap|walk)"/);
});

test('machine: a tap pets, every third tap is happy, each settles back to idle with one state timer', () => {
  const { c, pet, states } = machine();
  pet.start();
  assert.equal(c.pending(), 1, 'only the sleep timer while idle');
  assert.equal(pet.caress(), true);
  assert.equal(pet.snapshot().state, 'pet');
  assert.equal(c.pending(), 2, 'state timer + sleep timer, never more');
  c.advance(Pet.TIMING.pet);
  assert.equal(pet.snapshot().state, 'idle');
  pet.caress(); pet.caress();
  assert.equal(pet.snapshot().state, 'happy', 'the third tap');
  c.advance(Pet.TIMING.happy);
  assert.equal(pet.snapshot().state, 'idle');
  assert.deepEqual(states().filter((s, i, a) => s !== a[i - 1]), ['idle', 'pet', 'idle', 'pet', 'happy', 'idle']);
});

test('machine: sleeps after 30 s without a touch; a touch wakes it curious; stop leaves no timer', () => {
  const { c, pet } = machine();
  pet.start();
  c.advance(Pet.TIMING.sleep - 1);
  assert.equal(pet.touch(), false, 'a touch only postpones the sleep');
  c.advance(Pet.TIMING.sleep - 1);
  assert.equal(pet.snapshot().state, 'idle');
  c.advance(1);
  assert.equal(pet.snapshot().state, 'sleep');
  assert.equal(c.pending(), 0, 'nothing ticks while it sleeps');
  assert.equal(pet.touch(), true);
  assert.equal(pet.snapshot().state, 'curious');
  c.advance(Pet.TIMING.curious);
  assert.equal(pet.snapshot().state, 'idle');
  pet.stop();
  assert.deepEqual([pet.snapshot().running, c.pending()], [false, 0]);
  assert.equal(pet.caress(), false, 'a stopped (blocked) cat is not petted');
});

// ---- lifecycle with a browser-shaped fake window ----
function fakeWindow({ storage = new Map(), href = 'https://us.example/' } = {}) {
  const live = new Map();
  const add = (scope) => (type, fn) => { const key = `${scope}:${type}`; if (!live.has(key)) live.set(key, new Set()); live.get(key).add(fn); };
  const remove = (scope) => (type, fn) => live.get(`${scope}:${type}`)?.delete(fn);
  const node = () => ({ className: '', innerHTML: '', children: [], parentNode: null,
    appendChild(child) { child.parentNode?.removeChild?.(child); child.parentNode = this; this.children.push(child); return child; },
    removeChild(child) { this.children = this.children.filter((n) => n !== child); child.parentNode = null; },
    remove() { this.parentNode?.removeChild(this); } });
  const actor = node();
  const layer = { ...node(), hidden: true, dataset: {}, props: {},
    style: { setProperty(k, v) { layer.props[k] = v; }, removeProperty(k) { delete layer.props[k]; } },
    querySelector: (s) => (s === '.us-pet-actor' ? actor : null), hasAttribute: () => false, contains: () => false };
  const nav = { getBoundingClientRect: () => ({ width: 360, height: 68, left: 15, top: 776 }) };
  const body = { classList: { contains: () => false }, getAttribute: () => null };
  const pending = new Map(); let seq = 0;
  const observers = [];
  const document = { hidden: false, body, getElementById: (id) => (id === 'usPetLayer' ? layer : null),
    querySelector: (s) => (s === '.nav' ? nav : null), querySelectorAll: () => [], createElement: () => node(),
    addEventListener: add('d'), removeEventListener: remove('d') };
  const w = { document, location: { href },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    setTimeout: (fn) => { const id = ++seq; pending.set(id, fn); return id; }, clearTimeout: (id) => pending.delete(id),
    MutationObserver: class { constructor() { this.on = false; observers.push(this); } observe() { this.on = true; } disconnect() { this.on = false; } },
    addEventListener: add('w'), removeEventListener: remove('w'), USPet: { ...Pet } };
  const listeners = () => [...live.values()].reduce((n, set) => n + set.size, 0);
  return { w, layer, actor, storage, timers: () => pending.size, listeners, observing: () => observers.filter((o) => o.on).length };
}

test('Settings On/Off: Off unmounts renderer, hit target, timers, observers and listeners; On restores cleanly', () => {
  const f = fakeWindow();
  Pet.install(f.w);
  assert.equal(f.w.USPet.isEnabled(), true, 'default: Maudit is on');
  assert.equal(f.w.USPet.enabled, true);
  assert.equal(f.layer.hidden, false);
  assert.equal(f.timers(), 1);
  assert.ok(f.listeners() >= 5 && f.observing() >= 1);
  assert.equal(f.layer.children.length, 1, 'the bounded hit target is mounted with Maudit');
  assert.equal(f.w.USPet.setEnabled(false), false);
  assert.equal(f.storage.get(Pet.MAUDIT_KEYS.enabled), '0', 'device-local preference');
  assert.deepEqual({ enabled: f.w.USPet.enabled, hidden: f.layer.hidden, timers: f.timers(), listeners: f.listeners(), observing: f.observing(), hit: f.layer.children.length, renderer: f.actor.children.length },
    { enabled: false, hidden: true, timers: 0, listeners: 0, observing: 0, hit: 0, renderer: 0 });
  assert.equal(f.layer.dataset.petState, undefined, 'no stale state attributes');
  assert.equal(f.w.USPet.react('reward'), false, 'Off ignores reactions');
  assert.deepEqual(f.w.USPet.snapshot(), { state: 'disabled', running: false });
  f.w.USPet.setEnabled(false);
  assert.equal(f.timers(), 0, 'Off is idempotent');
  f.w.USPet.setEnabled(true);
  assert.deepEqual({ enabled: f.w.USPet.enabled, hidden: f.layer.hidden, timers: f.timers(), hit: f.layer.children.length, renderer: f.actor.children.length },
    { enabled: true, hidden: false, timers: 1, hit: 1, renderer: 1 });
  const listeners = f.listeners();
  f.w.USPet.setEnabled(true);
  assert.equal(f.listeners(), listeners, 'On twice never duplicates listeners');
  assert.equal(f.timers(), 1);
});

test('Off persists across reloads: zero cost at boot, nothing painted', () => {
  const storage = new Map([[Pet.MAUDIT_KEYS.enabled, '0']]);
  const f = fakeWindow({ storage });
  Pet.install(f.w);
  assert.deepEqual({ pref: f.w.USPet.isEnabled(), enabled: f.w.USPet.enabled, hidden: f.layer.hidden, timers: f.timers(), listeners: f.listeners() },
    { pref: false, enabled: false, hidden: true, timers: 0, listeners: 0 });
  const blocked = fakeWindow();
  blocked.w.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  Pet.install(blocked.w);
  assert.equal(blocked.w.USPet.enabled, true, 'blocked storage keeps the default (on)');
});

test('pointer contract: the layer stays transparent; only the hit target over the cat takes a tap', () => {
  assert.match(petCss, /\.us-pet-layer,\.us-pet-layer \*\{pointer-events:none!important/);
  const autos = petCss.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+\{[^}]*pointer-events:auto[^}]*\}/g) || [];
  assert.equal(autos.length, 1, 'exactly one rule re-enables input');
  assert.match(autos[0].trim(), /^\.us-pet-layer \.us-pet-hit\{/);
  assert.match(autos[0], /inset:0/, 'bounded to the 54 x 48 cat box');
  assert.match(autos[0], /touch-action:manipulation/, 'a tap, never a drag');
  assert.match(petJs, /on\(hit,'click',/, 'a tap is a click: no gesture recogniser');
  assert.doesNotMatch(petJs, /pointermove|pointerup|touchstart|touchmove|setPointerCapture/, 'no drag handling at all');
  assert.doesNotMatch(petJs, /requestAnimationFrame|setInterval/, 'no loops');
  assert.doesNotMatch(petJs, /subtree:true|childList:true/, 'no broad MutationObservers');
});

test('poses: curious / pet / sleep / happy are CSS poses of the approved drawings, with reduced-motion static poses', () => {
  for (const state of ['idle', 'sleep', 'curious', 'pet', 'happy']) assert.ok(Pet.STATES.includes(state), state);
  assert.match(petCss, /\[data-pet-state="pet"\] \.k-eyes-closed\{opacity:1\}/, 'kitten preview: eyes soften');
  assert.match(petCss, /\[data-pet-state="pet"\] \.k-head\{transform:rotate\(-9deg\)/, 'kitten preview: head leans into the hand');
  assert.match(petCss, /:root\[data-us-motion="reduced"\] \.us-pet-layer \*\{animation:none!important;transition:none!important\}/);
  // Maudit 2.0 and the companions (production): poses of the owner's art.
  assert.match(petCss, /\[data-pet-state="pet"\] :is\(\.us-pet-lids,\.us-pet-blink\)\{opacity:1\}/, 'eyes closed under the hand');
  assert.match(petCss, /\[data-pet-state="pet"\] \.us-pet-awake\{rotate:5deg\}/, 'leans into the hand');
  assert.match(petCss, /\[data-pet-state="curious"\] \.us-pet-awake\{rotate:-7deg\}/, 'curious tilt');
  assert.match(petCss, /\[data-pet-state="sleep"\] \.us-pet-pose-sleep\{opacity:1\}/, 'asleep');
  assert.match(petJs, /\.us-pet-figure/, 'happy hop runs on the figure');
  assert.match(petJs, /\.us-pet-heart/, 'happy shows the heart');
  // In use: kitten v0 (QA preview) and the companions' pieces (production).
  const manifest = JSON.parse(read('assets/ASSET_MANIFEST.json'));
  assert.deepEqual([...new Set(manifest.assets.filter((a) => /\/pet\//.test(a.path) && a.usedBy.length).map((a) => a.usedBy[0]))].sort(), ['pet-preview', 'pet-production']);
  assert.doesNotMatch(petJs + petCss, /[\u{1F300}-\u{1FAFF}❤♥]/u, 'no emoji, no heart glyph');
});

// Founder, 29/10/2026: the switch is called «Compagni», it turns off whichever companion is shown.
test('Settings: one "Compagni" switch row, device-local, correct accessible state, one short line of copy', () => {
  const row = html.match(/<button[^>]*data-us-setting="maudit"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(row, 'row exists');
  assert.match(row, /role="switch" aria-checked="true"/);
  // US 1.0 Settings mockup (#200): the label plus one short line, never a paragraph.
  assert.match(row, /<b>Compagni<\/b>(<small>[^<]{1,40}<\/small>)?<\/span>/);
  const deviceGroup = html.slice(html.indexOf('data-us-settings-scope="tu"'), html.indexOf('data-us-settings-scope="voi"'));
  assert.ok(deviceGroup.includes('data-us-setting="maudit"'), 'lives with the other on-this-phone settings');
  assert.match(settingsJs, /if\(name==='maudit'\)return toggleMaudit\(\);/);
  assert.match(settingsJs, /window\.USPet\?\.setEnabled\?\.\(next\)/);
  assert.match(settingsJs, /row\.setAttribute\('aria-checked',mauditEnabled\(\)\?'true':'false'\)/);
  assert.match(settingsCss, /\.us-settings2-switch-row\[aria-checked="true"\] \.us-settings2-switch u\{transform:translateX\(18px\)/);
  const toggle = settingsJs.slice(settingsJs.indexOf('// Maudit V1'), settingsJs.indexOf('async function notificationsModal'));
  assert.ok(toggle.length > 100);
  assert.doesNotMatch(petJs + toggle, /\bsb\.|supabase|\.rpc\(/i, 'no Supabase schema/RPC for the toggle');
});

test('no economy and no noise in V1: no XP, coins, hunger, toast, modal or text from touching Maudit', () => {
  assert.doesNotMatch(petJs, /\bxp\b|award|coins?\b|hunger|happiness|food|shop|level|streak_/i);
  assert.doesNotMatch(petJs, /toast\(|openModal|confirm\(|textContent=/);
  assert.match(html, /<div class="us-pet-layer" id="usPetLayer" aria-hidden="true" data-us-ambient hidden>/, 'decorative to screen readers');
  assert.doesNotMatch(petJs, /tabindex|setAttribute\('role'|aria-label/, 'no focusable control inside an aria-hidden layer');
});
