const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

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
  // Minimal live nodes: identity, parent links and children matter for F4.
  const node = (tagName) => ({
    tagName, className: '', innerHTML: '', parentNode: null, children: [],
    appendChild(child) { child.parentNode?.removeChild(child); child.parentNode = this; this.children.push(child); return child; },
    removeChild(child) { this.children = this.children.filter((n) => n !== child); child.parentNode = null; return child; },
    remove() { this.parentNode?.removeChild(this); }
  });
  const actor = node('span');
  Object.defineProperty(actor, 'innerHTML', {
    get() { return this.children.map((n) => n.innerHTML).join(''); },
    // Writing the actor directly (the pre-F4 behaviour) wipes every live child.
    set(value) { this.children.forEach((n) => { n.parentNode = null; }); this.children = value ? [{ innerHTML: value, parentNode: this }] : []; }
  });
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
    createElement: (tag) => node(tag),
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

test('PET production gate: approved kitten v0 mounts by default', () => {
  assert.equal(Pet.PET_ASSET_STATUS, 'APPROVED');
  const f = fakeWindow('https://us.example/');
  Pet.install(f.w);
  assert.equal(f.w.USPet.enabled, true);
  assert.equal(f.layer.hidden, false);
  assert.equal(f.layer.dataset.petRenderer, 'sprite');
  assert.match(f.actor.innerHTML, /data-pet-production="kitten-v0"/);
  assert.equal(f.active(), 1, 'one scheduler timer while the production PET is alive');
  assert.ok(f.listeners['d:visibilitychange'] && f.listeners['w:pagehide'] && f.listeners['w:us:pet']);
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
  assert.match(petCss, /\.us-pet-layer\{position:fixed;z-index:10040;/, 'transient notifications stay below the PET overlay');
  assert.doesNotMatch(petCss, /#usDailyNudge:not\(\[hidden\]\)\) \.us-pet-layer|#toast\.show\) \.us-pet-layer/, 'Daily/Ti penso never hide the PET');
  assert.match(petCss, /\.us-pet-layer\{position:fixed;z-index:10040;[^}]*bottom:calc\(max\(8px,var\(--us-safe-bottom\)\) \+ var\(--us-pet-nav-h,68px\) - 3px\)/);
  for (const guard of ['body.us-keyboard-open .us-pet-layer', '.us-pet-layer[inert]', 'body.us-status-visible .us-pet-layer', 'body.us-update-visible .us-pet-layer', 'body:has(#homeHero.us-oggi-focus) .us-pet-layer']) {
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

test('F1 occlusion: exclusive UI guards stop the PET and resume it cleanly, dropping queued reactions', () => {
  const guards = [
    ['inert', (f) => f.layer.setAttribute('inert'), (f) => f.layer.removeAttribute('inert')],
    ['focus', (f) => f.hero.classList.add('us-oggi-focus'), (f) => f.hero.classList.remove('us-oggi-focus')],
    ['auth', (f) => f.auth.classList.remove('hidden'), (f) => f.auth.classList.add('hidden')],
    ['status', (f) => f.body.classList.add('us-status-visible'), (f) => f.body.classList.remove('us-status-visible')],
    ['update', (f) => f.body.classList.add('us-update-visible'), (f) => f.body.classList.remove('us-update-visible')]
  ];
  for (const [name, block, unblock] of guards) {
    const f = fakeWindow('http://127.0.0.1/?us-pet=preview');
    Pet.install(f.w);
    assert.equal(f.w.USPet.react('think'), true);
    block(f); f.mutate(() => {});
    assert.equal(f.w.USPet.snapshot().running, false, name);
    assert.equal(f.active(), 0, `${name}: no timer while blocked`);
    assert.equal(f.w.USPet.react('reward'), false);
    unblock(f); f.mutate(() => {});
    assert.equal(f.w.USPet.snapshot().running, true, `${name}: resumed`);
    assert.equal(f.active(), 1, `${name}: one scheduler timer`);
    assert.equal(f.w.USPet.snapshot().pending, null, `${name}: queued reaction dropped`);
  }
});

test('Transient Daily/Ti-penso surfaces never block or stop the PET', () => {
  const f = fakeWindow('http://127.0.0.1/?us-pet=preview');
  Pet.install(f.w);
  f.nudge.hidden = false;
  f.toast.classList.add('show');
  assert.deepEqual(f.w.USPet.blockers(), []);
  assert.equal(f.w.USPet.snapshot().running, true);
  assert.equal(f.w.USPet.react('think'), true);
  f.mutate(() => {});
  assert.equal(f.w.USPet.snapshot().running, true, 'observer delivery does not stop for transient notifications');
  assert.equal(f.active(), 1);
});
test('F1 occlusion: observation is bounded to blocker nodes/attributes; hidden and pagehide still stop', () => {
  const f = fakeWindow('http://127.0.0.1/?us-pet=preview');
  Pet.install(f.w);
  assert.equal(f.observed.length, 4, 'body, layer, hero, auth overlay; transient notifications are not observed');
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
  assert.match(petJs, /if\(!useRenderer\(preview\?'placeholder':approved\?'sprite':'placeholder'\)\)\{api\.enabled=false;return;\}/, 'nothing mounts if the chosen renderer cannot');
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

test('F4 atomic renderer swap: a candidate that mutates its host and throws leaves the current renderer intact', () => {
  const log = [];
  Pet.registerRenderer({
    id: 'test-live',
    mount(host) {
      host.innerHTML = '<i data-live-figure></i>';
      host.liveFigure = { listening: true }; // a live reference the renderer keeps
      return { setState: (state) => log.push(['state', state]), setFacing: () => {}, destroy: () => log.push(['destroy']) };
    }
  });
  Pet.registerRenderer({
    id: 'test-mutate-throw',
    mount(host) {
      host.innerHTML = '<b>half-mounted</b>';
      host.className = 'corrupted';
      throw new Error('asset decode failed');
    }
  });
  const f = fakeWindow('http://127.0.0.1/?us-pet=preview');
  Pet.install(f.w);
  assert.equal(f.w.USPet.useRenderer('test-live'), true);
  assert.equal(f.actor.children.length, 1, 'the placeholder host was replaced, not stacked');
  const liveHost = f.actor.children[0];
  const liveHtml = liveHost.innerHTML;
  const liveFigure = liveHost.liveFigure;
  log.length = 0;
  const warn = console.warn;
  console.warn = () => {};
  try { assert.equal(f.w.USPet.useRenderer('test-mutate-throw'), false); } finally { console.warn = warn; }
  assert.equal(f.actor.children.length, 1, 'the failed candidate host is never attached');
  assert.equal(f.actor.children[0], liveHost, 'same live host node');
  assert.equal(liveHost.parentNode, f.actor);
  assert.equal(liveHost.innerHTML, liveHtml, 'current renderer DOM untouched');
  assert.equal(liveHost.className, 'us-pet-renderer');
  assert.equal(liveHost.liveFigure, liveFigure, 'live references survive');
  assert.equal(f.layer.dataset.petRenderer, 'test-live');
  assert.deepEqual(log, [], 'the current view was not destroyed');
  f.w.USPet.react('think');
  assert.deepEqual(log, [['state', 'react']], 'the current view is still the one being driven');
  // A successful swap destroys the old view first, then promotes the new host.
  assert.equal(f.w.USPet.useRenderer('placeholder'), true);
  assert.deepEqual(log.at(-1), ['destroy']);
  assert.equal(liveHost.parentNode, null);
  assert.equal(f.actor.children.length, 1);
  assert.match(f.actor.children[0].innerHTML, /data-pet-placeholder/);
});

test('F4 initial install: if the first renderer fails to mount, the PET stays disabled with nothing attached', () => {
  const modulePath = require.resolve('../pet.js');
  delete require.cache[modulePath];
  const Fresh = require('../pet.js');
  delete require.cache[modulePath];
  Fresh.registerRenderer({ id: 'placeholder', mount(host) { host.innerHTML = '<b>partial</b>'; throw new Error('broken'); } });
  const f = fakeWindow('http://127.0.0.1/?us-pet=preview');
  f.w.USPet = { ...Fresh };
  const warn = console.warn;
  console.warn = () => {};
  try { Fresh.install(f.w); } finally { console.warn = warn; }
  assert.equal(f.w.USPet.enabled, false);
  assert.equal(f.layer.hidden, true);
  assert.equal(f.actor.children.length, 0);
  assert.equal(f.active(), 0);
  assert.equal(f.observed.length, 0);
  assert.equal(f.w.USPet.react('reward'), false);
});

test('F5 reactions honour blockers synchronously, before the MutationObserver delivers', () => {
  const guards = [
    ['keyboard', (f) => f.body.classList.add('us-keyboard-open')],
    ['inert', (f) => f.layer.setAttribute('inert')]
  ];
  for (const [name, block] of guards) {
    // Idle pet: nothing may start.
    const idle = fakeWindow('http://127.0.0.1/?us-pet=preview');
    Pet.install(idle.w);
    block(idle); // DOM changed, observer NOT delivered
    assert.equal(idle.w.USPet.snapshot().running, true, `${name}: observer has not run yet`);
    assert.equal(idle.w.USPet.react('reward'), false, `${name}: api.react refused`);
    idle.listeners['w:us:pet'][0]({ detail: { type: 'react', reason: 'think' } });
    assert.deepEqual([idle.w.USPet.snapshot().state, idle.layer.dataset.petState, idle.layer.dataset.petReason], ['idle', 'idle', undefined], `${name}: us:pet refused`);
    // Reaction in flight: nothing may be queued or replaced.
    const busy = fakeWindow('http://127.0.0.1/?us-pet=preview');
    Pet.install(busy.w);
    assert.equal(busy.w.USPet.react('think'), true);
    block(busy);
    assert.equal(busy.w.USPet.react('streak'), false);
    busy.listeners['w:us:pet'][0]({ detail: { type: 'react', reason: 'daily-question' } });
    const snap = busy.w.USPet.snapshot();
    assert.deepEqual([snap.state, snap.reason, snap.pending], ['react', 'think', null], `${name}: no queued reaction`);
    // The observer still owns scheduler stop/resume once it delivers.
    busy.mutate(() => {});
    assert.equal(busy.active(), 0);
  }
});

test('Kitten production v0 matches its approved source and keeps preview isolated', () => {
  const spec = read('docs/missions/us-pet-asset-spec-v1.md');
  assert.match(spec, /\*\*Concept approvato:\*\* un piccolo gattino, pelo bianco e grigio, occhi azzurri\./);
  assert.match(spec, /PRODUCTION V0 APPROVATO/);
  // Same part names as the final asset contract, in the documented draw order.
  const parts = ['k-tail', 'k-leg-hind-far', 'k-leg-front-far', 'k-body', 'k-leg-hind-near', 'k-leg-front-near', 'k-head', 'k-ear-far', 'k-ear-near', 'k-face', 'k-eyes-open', 'k-eyes-closed', 'k-nose', 'k-mouth', 'k-collar'];
  let last = -1;
  for (const part of parts) {
    assert.ok(spec.includes(`\`${part}\``), `spec documents ${part}`);
    const at = petJs.search(new RegExp(`class="(?:[a-z-]+ )*${part}[ "]`));
    assert.ok(at > last, `${part} drawn in order`);
    last = at;
  }
  // Palette: white/gray fur, blue iris, no theme colour in the fur.
  for (const hex of ['#fbf8f4', '#a7acb5', '#7c818b', '#b4dcff', '#5e9ce0', '#3a6cab']) assert.ok(petJs.includes(hex), hex);
  assert.equal((petJs.match(/var\(--us-color-accent-strong/g) || []).length, 1, 'only the collar accessory takes the theme accent');
  assert.match(petJs, /data-pet-placeholder data-pet-preview="kitten-v0"/);
  assert.match(petJs, /data-pet-production="kitten-v0"/);
  assert.match(petJs, /id:'sprite'/);
  assert.equal(Pet.canMount('placeholder'), false, 'placeholder still requires explicit preview');
  assert.equal(Pet.canMount('sprite'), true, 'approved production renderer is mountable');
  const sourcePath = 'assets/source/pet/us-pet-kitten-base-v0.svg';
  const source = read(sourcePath);
  const inline = petJs.match(/const KITTEN_V0_SVG='([^']+)'/)?.[1];
  assert.equal(inline, source.trimEnd(), 'runtime drawing is identical to the approved source asset');
  const manifest = JSON.parse(read('assets/ASSET_MANIFEST.json'));
  const asset = manifest.assets.find((row) => row.path === sourcePath);
  assert.equal(asset?.status, 'APPROVED');
  assert.equal(asset?.sha256, crypto.createHash('sha256').update(source).digest('hex'));
  // Every state has a static pose (survives reduced motion) and only the collar accessory exists.
  for (const [state, rule] of [['rest', /\[data-pet-state="rest"\] \.k-eyes-closed\{opacity:1\}/], ['rest', /\[data-pet-state="rest"\] \.k-leg\{opacity:0\}/], ['react', /\[data-pet-state="react"\] \.k-ear\{transform:scale\(1\.14\)\}/], ['walk', /\[data-pet-state="walk"\] \.k-tail\{transform:rotate\(16deg\)\}/]]) {
    assert.match(petCss, rule, state);
  }
  assert.match(petCss, /\.us-pet-layer\[data-pet-accessory="collar"\] \.us-pet-kitten \.k-collar\{display:inline\}/);
  assert.doesNotMatch(petCss, /data-pet-placeholder\]\{outline/, 'no dashed debug slot around the kitten');
  assert.doesNotMatch(petJs + petCss, /[\u{1F300}-\u{1FAFF}❤♥]/u, 'no emoji or heart glyphs');
});
