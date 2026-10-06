// Maudit Interaction V1 — pure rules, machine states, lifecycle and contracts.
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
    now: () => now,
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
  const pet = Pet.createPet({ schedule: c.schedule, cancel: c.cancel, now: c.now, random: () => 0.9, render: (f) => frames.push(f) });
  pet.setTrack(300);
  return { c, pet, frames, states: () => frames.map((f) => f.state) };
}

test('gesture rules: short still press pets, a long still press or a sideways pull picks up, vertical is a scroll', () => {
  const G = Pet.GESTURE;
  assert.equal(Pet.classifyPress({ type: 'touch', elapsed: 120, up: true }), 'pet');
  assert.equal(Pet.classifyPress({ type: 'touch', dx: 3, dy: 4, elapsed: G.hold - 1, up: true }), 'pet', 'jitter under the slop is still a tap');
  assert.equal(Pet.classifyPress({ type: 'touch', elapsed: 100 }), 'pending');
  assert.equal(Pet.classifyPress({ type: 'touch', elapsed: G.hold }), 'pickup', 'hold threshold');
  assert.equal(Pet.classifyPress({ type: 'touch', elapsed: G.hold + 400, up: true }), 'pickup', 'a long press is never a pet');
  assert.equal(Pet.classifyPress({ type: 'touch', dx: 18, dy: 4, elapsed: 60 }), 'pickup', 'sideways pull');
  assert.equal(Pet.classifyPress({ type: 'touch', dx: 4, dy: -18, elapsed: 60 }), 'scroll', 'vertical intent scrolls the page');
  assert.equal(Pet.classifyPress({ type: 'pen', dx: 10, dy: 10, elapsed: 60 }), 'scroll', 'diagonal is not an intentional pull');
  assert.equal(Pet.classifyPress({ type: 'mouse', dx: 0, dy: -12, elapsed: 60 }), 'pickup', 'a mouse cannot scroll by dragging');
  assert.ok(G.slop >= 8 && G.hold >= 200 && G.hold <= 400, 'mobile-friendly thresholds');
});

test('placement is semantic (plane id + 0..1), clamped, and corrupt values fall back to nothing', () => {
  const raw = Pet.encodePlacement('noi-sintonia-top', 0.72);
  assert.deepEqual(JSON.parse(raw), { v: 1, plane: 'noi-sintonia-top', x: 0.72 });
  assert.deepEqual(Pet.decodePlacement(raw), { plane: 'noi-sintonia-top', x: 0.72 });
  assert.deepEqual(Pet.decodePlacement(Pet.encodePlacement('nav', 4)), { plane: 'nav', x: 1 });
  assert.equal(Pet.encodePlacement('made-up-plane', 0.5), null);
  assert.equal(Pet.decodePlacement('{"v":1,"plane":"gone","x":0.4}'), null, 'a plane no longer registered is ignored');
  assert.equal(Pet.decodePlacement('{"v":1,"plane":"nav","x":"0.4"}'), null);
  assert.equal(Pet.decodePlacement('not json'), null);
  assert.equal(Pet.decodePlacement(null), null);
  assert.doesNotMatch(raw, /px|"y"|clientX|"top"/, 'never raw viewport coordinates');
});

test('plane registry is explicit, small, selector-based and covers the four primary pages', () => {
  const ids = Pet.PLANES.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(Pet.PLANES[0], { id: 'nav', page: '', selector: '.nav' }, 'the nav rim is the default plane');
  for (const page of ['home', 'bond', 'moments', 'quiz']) assert.ok(Pet.PLANES.some((p) => p.page === page), page);
  assert.ok(Pet.PLANES.length <= 16, 'a registry, not every DOM rectangle');
  for (const plane of Pet.PLANES) assert.doesNotMatch(plane.selector, /\d+px|\[style/, `${plane.id}: no device pixels`);
});

test('free segments: the cat body needs clear columns; blocked spans split a rim; tiny runs are dropped', () => {
  const blocked = (x) => !(x >= 150 && x <= 170);
  const segments = Pet.freeSegments({ left: 20, right: 360, step: 2, free: blocked });
  assert.equal(segments.length, 2);
  const [[a1, b1], [a2, b2]] = segments;
  assert.ok(a1 >= 20 && b1 + 38 < 150, `left run clears the block ${b1}`);
  assert.ok(a2 + 2 > 170 && b2 <= 320, `right run starts after the block ${a2}`);
  assert.deepEqual(Pet.freeSegments({ left: 0, right: 45, step: 2, free: () => true }), [], 'no room to stand');
  assert.deepEqual(Pet.freeSegments({ left: 0, right: 300, free: () => false }), []);
});

test('nearest plane is predictable; too far means no plane (caller returns to the previous spot)', () => {
  const candidates = [
    { id: 'nav', rim: 780, segments: [[30, 300]] },
    { id: 'noi-sintonia-top', rim: 246, segments: [[232, 322]] },
    { id: 'noi-week-board-top', rim: 130, segments: [[124, 238]] }
  ];
  assert.equal(Pet.choosePlane({ x: 280, y: 250 }, candidates).id, 'noi-sintonia-top');
  assert.equal(Pet.choosePlane({ x: 100, y: 760 }, candidates).id, 'nav');
  const clamped = Pet.choosePlane({ x: 60, y: 240 }, candidates);
  assert.deepEqual([clamped.id, clamped.left], ['noi-sintonia-top', 232], 'x is clamped into the segment');
  assert.equal(Pet.choosePlane({ x: 200, y: 520 }, candidates), null, 'mid-screen, far from every rim');
});

test('gravity chooses the first safe plane below the feet and keeps nav as the final floor', () => {
  const candidates = [
    { id: 'nav', rim: 780, segments: [[30, 300]] },
    { id: 'upper', rim: 220, segments: [[80, 200]] },
    { id: 'lower', rim: 410, segments: [[80, 200]] }
  ];
  assert.equal(Pet.chooseFallPlane({ x: 140, y: 250 }, candidates).id, 'lower');
  assert.equal(Pet.chooseFallPlane({ x: 140, y: 100 }, candidates).id, 'upper');
  const nav = Pet.chooseFallPlane({ x: 350, y: 250 }, candidates);
  assert.deepEqual([nav.id, nav.left], ['nav', 300]);
  assert.ok(Pet.GRAVITY.acceleration > 0 && Pet.GRAVITY.frame <= 20);
});

test('machine: held → fall has no scheduler timer; land resumes exactly one and queued reactions wait', () => {
  const { c, pet, states } = machine();
  pet.start(); pet.hold();
  assert.equal(c.pending(), 0);
  assert.equal(pet.react('think'), true);
  assert.equal(pet.fall(), true);
  assert.deepEqual([pet.snapshot().state, c.pending()], ['fall', 0]);
  assert.equal(pet.caress(), false);
  assert.equal(pet.land({ x: 120 }), true);
  assert.deepEqual([pet.snapshot().state, pet.snapshot().x, c.pending()], ['snap', 120, 1]);
  c.advance(Pet.TIMING.snap);
  assert.equal(pet.snapshot().state, 'react');
  c.advance(Pet.TIMING.react);
  assert.equal(pet.snapshot().state, 'idle');
  assert.ok(states().includes('held') && states().includes('fall') && states().includes('snap'));
});

test('machine: held stops every autonomous timer; release resumes exactly one; reactions wait for the landing', () => {
  const { c, pet, states } = machine();
  pet.start();
  assert.equal(c.pending(), 1);
  assert.equal(pet.hold(), true);
  assert.equal(pet.snapshot().state, 'held');
  assert.equal(c.pending(), 0, 'no walk/idle timer while held');
  c.advance(60000);
  assert.equal(pet.snapshot().state, 'held', 'nothing moves a held cat');
  assert.equal(pet.caress(), false, 'a held cat is not petted');
  assert.equal(pet.hold(), false, 'no double pickup');
  assert.equal(pet.react('reward'), true, 'reaction queued');
  assert.equal(pet.react('think'), true);
  assert.equal(pet.snapshot().pending, 'think', 'at most one queued reaction');
  assert.equal(pet.release({ x: 120 }), true);
  assert.deepEqual([pet.snapshot().state, pet.snapshot().x, c.pending()], ['snap', 120, 1]);
  assert.equal(pet.release({ x: 10 }), false, 'release only from held');
  c.advance(Pet.TIMING.snap);
  assert.equal(pet.snapshot().state, 'react', 'the queued reaction plays once it has landed');
  assert.equal(c.pending(), 1);
  c.advance(Pet.TIMING.react);
  assert.equal(pet.snapshot().state, 'idle');
  assert.equal(c.pending(), 1, 'one scheduler, never two');
  assert.ok(states().includes('held') && states().includes('snap'));
});

test('machine: caress is one short pet reaction that settles to idle; stop during held leaves no timer', () => {
  const { c, pet } = machine();
  pet.start();
  assert.equal(pet.caress(), true);
  assert.equal(pet.snapshot().state, 'pet');
  assert.equal(c.pending(), 1);
  c.advance(Pet.TIMING.pet);
  assert.equal(pet.snapshot().state, 'idle');
  pet.hold();
  pet.stop();
  assert.deepEqual([pet.snapshot().running, pet.snapshot().state, c.pending()], [false, 'idle', 0]);
  assert.equal(pet.hold(), false, 'a stopped (blocked) cat cannot be picked up');
  assert.equal(pet.caress(), false);
  pet.start();
  assert.equal(c.pending(), 1);
});

test('machine: place() stands at x without strolling; a narrower track never steals a held cat', () => {
  const { c, pet } = machine();
  pet.start();
  pet.place(90);
  assert.equal(pet.snapshot().x, 90);
  pet.hold();
  pet.setTrack(80);
  assert.equal(pet.snapshot().state, 'held', 'track change during a drag keeps the gesture');
  assert.equal(c.pending(), 0);
  pet.release({ x: 500 });
  assert.equal(pet.snapshot().x, 80 - Pet.TIMING.size - Pet.TIMING.edge, 'release is clamped into the new track');
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

test('pointer contract: the layer stays transparent; only the bounded hit target takes input', () => {
  assert.match(petCss, /\.us-pet-layer,\.us-pet-layer \*\{pointer-events:none!important/);
  const autos = petCss.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+\{[^}]*pointer-events:auto[^}]*\}/g) || [];
  assert.equal(autos.length, 1, 'exactly one rule re-enables input');
  assert.match(autos[0].trim(), /^\.us-pet-layer \.us-pet-hit\{/);
  assert.match(autos[0], /width:40px;height:34px/, 'bounded to the cat');
  assert.match(autos[0], /bottom:4px/, 'its bottom stays clear of the nav tabs');
  assert.match(autos[0], /touch-action:pan-y/, 'vertical scroll still starts on Maudit');
  assert.match(petJs, /on\(hit,'touchstart',event=>event\.stopPropagation\(\),\{passive:true\}\)/, 'page swipe never sees a Maudit gesture');
  assert.match(petJs, /on\(hit,'touchmove',event=>\{event\.stopPropagation\(\);if\(press\?\.picked&&event\.cancelable\)event\.preventDefault\(\);\},\{passive:false\}\)/, 'no page scroll only while held');
  assert.doesNotMatch(petJs, /(window|w|d|document)\.addEventListener\('pointer(move|up)'/, 'no global pointer listeners: pointer capture on the hit target');
  assert.doesNotMatch(petJs, /requestAnimationFrame|setInterval/, 'no loops');
  assert.doesNotMatch(petJs, /subtree:true|childList:true/, 'no broad MutationObservers');
});

test('poses: pet / held / fall / snap are CSS transforms of the approved articulated kitten, with reduced-motion static poses', () => {
  for (const state of ['pet', 'held', 'fall', 'snap']) assert.ok(Pet.STATES.includes(state), state);
  assert.match(petCss, /\[data-pet-state="pet"\] \.k-eyes-closed\{opacity:1\}/, 'eyes soften');
  assert.match(petCss, /\[data-pet-state="pet"\] \.k-head\{transform:rotate\(-9deg\)/, 'head leans into the hand');
  assert.match(petCss, /\[data-pet-state="held"\] \.us-pet-kitten\{transform-origin:62% 38%;transform:rotate\(-28deg\)/, 'hangs from the scruff');
  assert.match(petCss, /\[data-pet-state="held"\] \.k-tail\{transform:rotate\(-118deg\)/, 'tail hangs relaxed');
  assert.match(petCss, /\[data-pet-state="held"\] \.k-leg-hind-near,[^{]+\{transform:rotate\(30deg\) scaleY\(1\.12\)\}/, 'legs dangle');
  assert.match(petCss, /\[data-pet-state="fall"\] \.us-pet-kitten\{[^}]*scale\(\.98,1\.04\)/, 'airborne pose');
  assert.match(petCss, /:root\[data-us-motion="reduced"\] \.us-pet-layer \*\{animation:none!important;transition:none!important\}/);
  // Same approved drawing: no new production asset was introduced.
  const manifest = JSON.parse(read('assets/ASSET_MANIFEST.json'));
  assert.equal(manifest.assets.filter((a) => /\/pet\//.test(a.path)).length, 1);
  assert.doesNotMatch(petJs + petCss, /[\u{1F300}-\u{1FAFF}❤♥]/u, 'no emoji, no heart glyph');
});

test('Settings: one "Maudit" switch row, device-local, correct accessible state, no explanatory copy', () => {
  const row = html.match(/<button[^>]*data-us-setting="maudit"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(row, 'row exists');
  assert.match(row, /role="switch" aria-checked="true"/);
  assert.match(row, /<b>Maudit<\/b><\/span>/);
  assert.doesNotMatch(row, /<small>/, 'no explanatory paragraph');
  const deviceGroup = html.slice(html.indexOf('SU QUESTO TELEFONO'), html.indexOf('data-us-settings-scope="voi"'));
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
