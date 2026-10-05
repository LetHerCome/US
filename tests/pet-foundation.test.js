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

// Deterministic timers: the machine never uses rAF, only schedule/cancel.
function clock() {
  let now = 0;
  let seq = 0;
  const timers = new Map();
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
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = until;
    }
  };
}
const sequence = (...values) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };

test('PET brain: idle walks along the nav axis inside the track, never a jitter step', () => {
  const walk = Pet.decide('idle', { x: 6, width: 300, random: sequence(0.1, 0.9) });
  assert.equal(walk.state, 'walk');
  assert.ok(walk.x >= Pet.TIMING.edge && walk.x <= 300 - Pet.TIMING.size - Pet.TIMING.edge);
  assert.ok(Math.abs(walk.x - 6) >= Pet.TIMING.minStep);
  assert.equal(walk.facing, 'right');
  assert.ok(walk.duration >= Pet.TIMING.walkMin && walk.duration <= Pet.TIMING.walkMax);
  assert.equal(Pet.decide('idle', { x: 6, width: 300, random: () => 0.7 }).state, 'rest');
  assert.equal(Pet.decide('idle', { x: 6, width: 300, random: () => 0.9 }).state, 'idle');
  for (const state of ['walk', 'rest', 'react']) assert.equal(Pet.decide(state, { x: 10, width: 300 }).state, 'idle');
});

test('PET brain: reduced motion and a track too short never produce a walk', () => {
  for (let i = 0; i < 50; i++) {
    const r = i / 50;
    assert.notEqual(Pet.decide('idle', { x: 6, width: 300, reduced: true, random: () => r }).state, 'walk');
    assert.notEqual(Pet.decide('idle', { x: 6, width: 60, random: () => r }).state, 'walk');
  }
});

test('PET machine: idle → walk → idle with pauses, linear position, stop cancels every timer', () => {
  const c = clock();
  const frames = [];
  const pet = Pet.createPet({ ...c, random: sequence(0, 0.1, 0.99, 0.5), render: (f) => frames.push(f) });
  pet.setTrack(400);
  assert.equal(pet.start(), true);
  assert.equal(pet.snapshot().state, 'idle');
  c.advance(Pet.TIMING.idle[0]);
  const walking = pet.snapshot();
  assert.equal(walking.state, 'walk');
  const walkFrame = frames.find((f) => f.state === 'walk');
  assert.ok(walkFrame.duration > 0);
  c.advance(walkFrame.duration / 2);
  const mid = pet.snapshot().x;
  assert.ok(mid > Pet.TIMING.edge && mid < walkFrame.x, 'mid-walk position is interpolated');
  c.advance(walkFrame.duration);
  assert.equal(pet.snapshot().state, 'idle');
  assert.ok(c.pending() > 0);
  assert.equal(pet.stop(), true);
  assert.equal(c.pending(), 0, 'no timer survives a stop (document hidden / pagehide)');
  assert.equal(pet.react('reward'), false, 'a stopped pet ignores reactions');
});

test('PET machine: react interrupts a walk where it is, queues at most one, rejects unknown reasons', () => {
  const c = clock();
  const pet = Pet.createPet({ ...c, random: sequence(0, 0.1, 0.99) });
  pet.setTrack(400);
  pet.start();
  c.advance(Pet.TIMING.idle[0]);
  assert.equal(pet.snapshot().state, 'walk');
  c.advance(600);
  const before = pet.snapshot().x;
  assert.equal(pet.react('think'), true);
  assert.deepEqual([pet.snapshot().state, pet.snapshot().x, pet.snapshot().reason], ['react', before, 'think']);
  assert.equal(pet.react('reward'), true);
  assert.equal(pet.react('daily-question'), true);
  assert.equal(pet.snapshot().pending, 'daily-question', 'only the latest single reaction is queued');
  assert.equal(pet.react('confetti'), false);
  c.advance(Pet.TIMING.react);
  assert.equal(pet.snapshot().reason, 'daily-question');
  c.advance(Pet.TIMING.react);
  assert.equal(pet.snapshot().state, 'idle');
  assert.deepEqual([...Pet.REASONS], ['think', 'left-for-you', 'reward', 'streak', 'daily-question']);
});

test('PET machine: switching to reduced motion stops a walk in place; a narrower nav clamps the pet', () => {
  const c = clock();
  const pet = Pet.createPet({ ...c, random: sequence(0, 0.1, 0.99) });
  pet.setTrack(400);
  pet.start();
  c.advance(Pet.TIMING.idle[0]);
  c.advance(400);
  const x = pet.snapshot().x;
  pet.setReduced(true);
  assert.deepEqual([pet.snapshot().state, pet.snapshot().x], ['idle', x]);
  pet.setTrack(80);
  assert.ok(pet.snapshot().x <= 80 - Pet.TIMING.size - Pet.TIMING.edge);
});

function fakeWindow(href, storage = new Map()) {
  const listeners = {};
  const attrs = {};
  const layer = {
    hidden: true, dataset: {}, style: { setProperty(k, v) { attrs[k] = v; } },
    querySelector: (s) => (s === '.us-pet-actor' ? actor : null)
  };
  const actor = { innerHTML: '' };
  const nav = { getBoundingClientRect: () => ({ width: 360, height: 68 }) };
  let timers = 0;
  const document = {
    hidden: false,
    getElementById: (id) => (id === 'usPetLayer' ? layer : null),
    querySelector: (s) => (s === '.nav' ? nav : null),
    addEventListener(type, fn) { (listeners[`d:${type}`] ||= []).push(fn); }
  };
  const w = {
    document, location: { href },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    setTimeout: () => ++timers, clearTimeout() {},
    addEventListener(type, fn) { (listeners[`w:${type}`] ||= []).push(fn); },
    USPet: { ...Pet }
  };
  return { w, layer, actor, attrs, listeners, storage, timers: () => timers };
}

test('PET gate: without an approved asset the layer stays unmounted, with zero timers and listeners', () => {
  assert.equal(Pet.PET_ASSET_STATUS, 'PLACEHOLDER');
  const f = fakeWindow('https://us.example/');
  Pet.install(f.w);
  assert.equal(f.w.USPet.enabled, false);
  assert.equal(f.layer.hidden, true);
  assert.equal(f.actor.innerHTML, '');
  assert.equal(f.timers(), 0);
  assert.deepEqual(Object.keys(f.listeners), []);
  assert.equal(f.w.USPet.react('reward'), false, 'callers can always call react safely');
});

test('PET gate: ?us-pet=preview mounts the placeholder on this device; ?us-pet=off clears it', () => {
  const storage = new Map();
  const on = fakeWindow('http://127.0.0.1:5173/?us-pet=preview', storage);
  Pet.install(on.w);
  assert.equal(on.w.USPet.enabled, true);
  assert.equal(on.layer.hidden, false);
  assert.equal(on.layer.dataset.petRenderer, 'placeholder');
  assert.match(on.actor.innerHTML, /data-pet-placeholder/);
  assert.equal(on.attrs['--us-pet-track'], '360px');
  assert.equal(on.attrs['--us-pet-nav-h'], '68px');
  assert.equal(on.layer.dataset.petState, 'idle');
  assert.equal(storage.get('us:pet:v1:preview'), '1');
  assert.ok(on.listeners['d:visibilitychange'] && on.listeners['w:pagehide'] && on.listeners['w:us:pet']);
  on.listeners['w:us:pet'][0]({ detail: { type: 'react', reason: 'streak' } });
  assert.equal(on.layer.dataset.petReason, 'streak');
  on.w.USPet.setAppearance({ skin: 'pearl', accessory: 'scarf"><x' });
  assert.deepEqual([on.layer.dataset.petSkin, on.layer.dataset.petAccessory], ['pearl', 'scarfx']);
  const persisted = fakeWindow('http://127.0.0.1:5173/', storage);
  Pet.install(persisted.w);
  assert.equal(persisted.w.USPet.enabled, true, 'installed PWA keeps the opt-in without the query');
  const off = fakeWindow('http://127.0.0.1:5173/?us-pet=off', storage);
  Pet.install(off.w);
  assert.equal(off.w.USPet.enabled, false);
  assert.equal(storage.has('us:pet:v1:preview'), false);
});

test('PET gate: APPROVED requires a manifest entry and a sprite renderer, never the placeholder', () => {
  const manifest = JSON.parse(read('assets/ASSET_MANIFEST.json'));
  const approvedPet = manifest.assets.some((a) => a.status === 'APPROVED' && /\/pet\//.test(a.path));
  if (Pet.PET_ASSET_STATUS === 'APPROVED') assert.ok(approvedPet, 'an APPROVED PET status needs an APPROVED asset in the manifest');
  assert.match(petJs, /const approved=PET_ASSET_STATUS==='APPROVED'&&renderers\.has\('sprite'\)/);
  assert.doesNotMatch(petJs, /requestAnimationFrame/, 'M12A: no JS animation loop');
  assert.doesNotMatch(petJs, /[\u{1F300}-\u{1FAFF}]/u, 'no emoji PET');
  assert.throws(() => Pet.registerRenderer({ id: 'x' }), /invalid_pet_renderer/);
});

test('PET layer: never takes input, never covers the nav, steps aside and respects motion preferences', () => {
  assert.match(html, /<\/nav>\n<!-- US PET V1[^\n]*-->\n<div class="us-pet-layer" id="usPetLayer" aria-hidden="true" hidden><span class="us-pet-actor"><\/span><\/div>/);
  assert.ok(html.indexOf('src="/pet.js') > html.indexOf('src="/ui-foundation.js'), 'pet reads the foundation motion authority');
  assert.match(petCss, /\.us-pet-layer,\.us-pet-layer \*\{pointer-events:none!important/);
  assert.match(petCss, /\.us-pet-layer\{position:fixed;z-index:19;[^}]*bottom:calc\(max\(8px,var\(--us-safe-bottom\)\) \+ var\(--us-pet-nav-h,68px\) - 3px\)/);
  for (const guard of ['body.us-keyboard-open .us-pet-layer', '.us-pet-layer[inert]', 'body.us-status-visible .us-pet-layer', 'body.us-update-visible .us-pet-layer', 'body:has(#usDailyNudge:not([hidden])) .us-pet-layer', 'body:has(#toast.show) .us-pet-layer', 'body:has(#homeHero.us-oggi-focus) .us-pet-layer']) {
    assert.ok(petCss.includes(guard), guard);
  }
  assert.match(petCss, /html\[data-us-visibility="hidden"\] \.us-pet-layer \*\{animation-play-state:paused!important\}/);
  assert.match(petCss, /:root\[data-us-motion="reduced"\] \.us-pet-layer \*\{animation:none!important;transition:none!important\}/);
  assert.match(petCss, /@media\(prefers-reduced-motion:reduce\)\{\.us-pet-layer \*\{animation:none!important;transition:none!important\}\}/);
  for (const state of Pet.STATES) assert.match(petCss, new RegExp(`\\[data-pet-state="${state}"\\]`), state);
});

test('PET ships in the atomic PWA shell and both web builds; reward unlocks are its first reaction', () => {
  const worker = read('service-worker.js');
  assert.match(worker, /versioned\("\/pet\.css"\),\n  versioned\("\/pet\.js"\)/);
  for (const file of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) {
    assert.match(read(file), /'pet\.css',\n  'pet\.js',/, file);
  }
  const build = JSON.parse(read('version.json')).version;
  assert.match(html, new RegExp(`href="/pet\\.css\\?v=${build}"`));
  assert.match(html, new RegExp(`src="/pet\\.js\\?v=${build}"`));
  assert.match(read('progression.js'), /window\.USPet\?\.react\?\.\('reward'\)/);
});

test('PET layer: :has() guards live in their own rule so older engines keep the keyboard/inert guards', () => {
  const rules = petCss.replace(/\/\*[\s\S]*?\*\//g, '').split('}').filter((rule) => rule.includes('.us-pet-layer') && rule.includes('visibility:hidden'));
  const plain = rules.find((rule) => rule.includes('body.us-keyboard-open'));
  assert.ok(plain && !plain.includes(':has('), 'keyboard/inert guard must not share a selector list with :has()');
});
