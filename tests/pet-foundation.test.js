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

function classes(initial = []) {
  const set = new Set(initial);
  return { contains: (n) => set.has(n), add: (n) => set.add(n), remove: (n) => set.delete(n) };
}
// A browser-shaped window: timers are tracked (scheduled and still pending),
// MutationObserver callbacks are fired by the test like the real engine would.
function fakeWindow(href, storage = new Map()) {
  const listeners = {};
  const attrs = {};
  const observed = [];
  const layerAttrs = new Set();
  const actor = { innerHTML: '' };
  const layer = {
    hidden: true, dataset: {}, style: { setProperty(k, v) { attrs[k] = v; } },
    querySelector: (s) => (s === '.us-pet-actor' ? actor : null),
    hasAttribute: (n) => layerAttrs.has(n), setAttribute: (n) => layerAttrs.add(n), removeAttribute: (n) => layerAttrs.delete(n)
  };
  const nav = { getBoundingClientRect: () => ({ width: 360, height: 68 }) };
  const body = { classList: classes() };
  const nudge = { hidden: true };
  const toast = { classList: classes() };
  const hero = { classList: classes() };
  const auth = { classList: classes(['hidden']) };
  const ids = { usPetLayer: layer, usDailyNudge: nudge, toast, homeHero: hero };
  let scheduled = 0;
  let seq = 0;
  const pending = new Map();
  const document = {
    hidden: false, body,
    getElementById: (id) => ids[id] || null,
    querySelector: (s) => (s === '.nav' ? nav : null),
    querySelectorAll: (s) => (s === '.auth-overlay' ? [auth] : []),
    addEventListener(type, fn) { (listeners[`d:${type}`] ||= []).push(fn); }
  };
  const w = {
    document, location: { href },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    setTimeout: (fn) => { scheduled++; const id = ++seq; pending.set(id, fn); return id; },
    clearTimeout: (id) => pending.delete(id),
    MutationObserver: class { constructor(cb) { this.cb = cb; } observe(node, options) { observed.push({ node, options, cb: this.cb }); } },
    addEventListener(type, fn) { (listeners[`w:${type}`] ||= []).push(fn); },
    USPet: { ...Pet }
  };
  // Apply a DOM change, then deliver it to the observers like the engine would.
  const mutate = (change) => { change(); new Set(observed.map((o) => o.cb)).forEach((cb) => cb([])); };
  // Run the oldest pending timer (one scheduler step).
  const tick = () => { const first = pending.entries().next().value; if (first) { pending.delete(first[0]); first[1](); } };
  return { w, layer, actor, attrs, listeners, storage, body, nudge, toast, hero, auth, observed, mutate, tick, timers: () => scheduled, active: () => pending.size };
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

test('F1 occlusion: keyboard stops the PET with zero pending timers, ignores reactions, resumes once', () => {
  const f = fakeWindow('http://127.0.0.1/?us-pet=preview');
  Pet.install(f.w);
  assert.equal(f.w.USPet.snapshot().running, true);
  assert.equal(f.active(), 1, 'one scheduler timer while alive');
  f.mutate(() => f.body.classList.add('us-keyboard-open'));
  assert.deepEqual(f.w.USPet.blockers(), ['keyboard']);
  assert.equal(f.w.USPet.snapshot().running, false);
  assert.equal(f.active(), 0, 'no PET timer survives while the keyboard owns the space');
  assert.equal(f.w.USPet.react('reward'), false, 'reactions are ignored while blocked');
  f.listeners['w:us:pet'][0]({ detail: { type: 'react', reason: 'think' } });
  assert.equal(f.layer.dataset.petState, 'idle');
  f.mutate(() => {}); // unrelated mutation while still blocked: still stopped, still no timer
  assert.equal(f.active(), 0);
  f.mutate(() => f.body.classList.remove('us-keyboard-open'));
  assert.equal(f.w.USPet.snapshot().running, true);
  assert.equal(f.active(), 1, 'restarted exactly once');
  f.mutate(() => {}); // a second unrelated mutation must not stack another scheduler
  assert.equal(f.active(), 1);
  assert.equal(f.w.USPet.snapshot().pending, null);
  assert.equal(f.layer.dataset.petState, 'idle');
});

test('F1 occlusion: transient UI guards stop the PET and resume it cleanly, dropping queued reactions', () => {
  const guards = [
    ['nudge', (f) => { f.nudge.hidden = false; }, (f) => { f.nudge.hidden = true; }],
    ['toast', (f) => f.toast.classList.add('show'), (f) => f.toast.classList.remove('show')],
    ['inert', (f) => f.layer.setAttribute('inert'), (f) => f.layer.removeAttribute('inert')],
    ['focus', (f) => f.hero.classList.add('us-oggi-focus'), (f) => f.hero.classList.remove('us-oggi-focus')],
    ['auth', (f) => f.auth.classList.remove('hidden'), (f) => f.auth.classList.add('hidden')],
    ['status', (f) => f.body.classList.add('us-status-visible'), (f) => f.body.classList.remove('us-status-visible')],
    ['update', (f) => f.body.classList.add('us-update-visible'), (f) => f.body.classList.remove('us-update-visible')]
  ];
  for (const [name, on, off] of guards) {
    const f = fakeWindow('http://127.0.0.1/?us-pet=preview');
    Pet.install(f.w);
    // A reaction in flight with one queued behind it must not survive the occlusion.
    f.w.USPet.react('think');
    f.w.USPet.react('streak');
    assert.equal(f.w.USPet.snapshot().pending, 'streak');
    f.mutate(() => on(f));
    assert.deepEqual(f.w.USPet.blockers(), [name]);
    assert.equal(f.active(), 0, `${name}: zero pending timers`);
    assert.equal(f.w.USPet.react('reward'), false, `${name}: reaction ignored`);
    f.mutate(() => off(f));
    assert.equal(f.w.USPet.snapshot().running, true, `${name}: resumed`);
    assert.equal(f.active(), 1, `${name}: one scheduler`);
    assert.equal(f.w.USPet.snapshot().pending, null, `${name}: no accumulated reaction`);
    assert.equal(f.w.USPet.snapshot().state, 'idle', `${name}: resumes from idle, not the stale reaction`);
  }
});

test('F1 occlusion: observation is bounded to blocker nodes/attributes; hidden and pagehide still stop', () => {
  const f = fakeWindow('http://127.0.0.1/?us-pet=preview');
  Pet.install(f.w);
  assert.equal(f.observed.length, 6, 'body, layer, nudge, toast, hero, auth overlay');
  for (const { options } of f.observed) {
    assert.equal(options.subtree, undefined, 'never a subtree observer');
    assert.equal(options.childList, undefined);
    assert.ok(Array.isArray(options.attributeFilter) && options.attributeFilter.length === 1);
  }
  f.w.document.hidden = true;
  f.listeners['d:visibilitychange'][0]();
  assert.equal(f.active(), 0);
  f.w.document.hidden = false;
  f.listeners['d:visibilitychange'][0]();
  assert.equal(f.active(), 1);
  f.listeners['w:pagehide'][0]();
  assert.deepEqual(f.w.USPet.blockers(), ['hidden']);
  assert.equal(f.active(), 0);
  f.mutate(() => {}); // a DOM change after pagehide must not restart the PET
  assert.equal(f.active(), 0);
  f.listeners['w:pageshow'][0]();
  assert.equal(f.active(), 1);
  assert.doesNotMatch(petJs, /setInterval|requestAnimationFrame/, 'no polling, no rAF');
});

test('F2 renderers fail closed: placeholder is preview-only, unknown ids keep the current renderer', () => {
  assert.equal(Pet.canMount('placeholder'), false, 'production/approved mode never mounts the placeholder');
  assert.equal(Pet.canMount('placeholder', { preview: false }), false);
  assert.equal(Pet.canMount('placeholder', { preview: true }), true);
  assert.equal(Pet.canMount('sprite-that-does-not-exist', { preview: true }), false);
  const f = fakeWindow('http://127.0.0.1/?us-pet=preview');
  Pet.install(f.w);
  const before = f.actor.innerHTML;
  assert.equal(f.w.USPet.useRenderer('missing-renderer'), false);
  assert.equal(f.layer.dataset.petRenderer, 'placeholder');
  assert.equal(f.actor.innerHTML, before, 'the valid renderer stays mounted');
  Pet.registerRenderer({ id: 'test-throws', mount() { throw new Error('broken asset'); } });
  const warn = console.warn;
  console.warn = () => {};
  try { assert.equal(f.w.USPet.useRenderer('test-throws'), false); } finally { console.warn = warn; }
  assert.equal(f.layer.dataset.petRenderer, 'placeholder');
  assert.equal(f.actor.innerHTML, before);
  assert.match(petJs, /if\(!useRenderer\(approved\?'sprite':'placeholder'\)\)\{api\.enabled=false;return;\}/, 'nothing mounts if the chosen renderer cannot');
  assert.doesNotMatch(petJs, /renderers\.get\(id\)\|\|renderers\.get\('placeholder'\)/, 'no placeholder fallback');
});

test('F3 renderer contract: setFacing(facing) is its own call, setState carries state and reason only', () => {
  const calls = [];
  Pet.registerRenderer({
    id: 'test-recorder',
    mount() {
      return {
        setState: (state, meta) => calls.push(['state', state, { ...meta }]),
        setFacing: (facing) => calls.push(['facing', facing]),
        setAppearance: (a) => calls.push(['appearance', { ...a }]),
        destroy: () => calls.push(['destroy'])
      };
    }
  });
  const f = fakeWindow('http://127.0.0.1/?us-pet=preview');
  Pet.install(f.w);
  assert.equal(f.w.USPet.useRenderer('test-recorder'), true);
  assert.equal(f.layer.dataset.petRenderer, 'test-recorder');
  assert.deepEqual(calls.slice(0, 2), [['facing', 'right'], ['state', 'idle', { reason: '' }]]);
  calls.length = 0;
  f.w.USPet.react('think');
  assert.deepEqual(calls, [['state', 'react', { reason: 'think' }]], 'no facing inside setState, no redundant setFacing');
  calls.length = 0;
  // Drive the scheduler until the pet turns, to prove setFacing fires on change.
  for (let i = 0; i < 400 && !calls.some((c) => c[0] === 'facing'); i++) f.tick();
  const turns = calls.filter((c) => c[0] === 'facing');
  assert.equal(turns.length, 1);
  assert.equal(turns[0][1], 'left');
  assert.ok(calls.every((c) => c[0] !== 'state' || !('facing' in c[2])));
  const spec = read('docs/missions/us-pet-asset-spec-v1.md');
  assert.match(spec, /setFacing\(facing\)/);
  assert.match(spec, /setState\(state, \{ reason \}\)/);
});
