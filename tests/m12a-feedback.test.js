// M12A — the US feedback engine: one authority for haptics and sound.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const { createFeedback } = require('../ui-foundation.js');

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (k) => (values.has(k) ? values.get(k) : null), setItem: (k, v) => values.set(k, String(v)), values };
}

function fakeDocument({ hidden = false } = {}) {
  const listeners = new Map();
  return {
    hidden,
    addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, []).get(type)).push(fn); },
    fire(type, event = {}) { (listeners.get(type) || []).forEach((fn) => fn(event)); },
    listeners
  };
}

function fakeAudio({ state = 'running' } = {}) {
  const log = { contexts: 0, oscillators: 0, resumes: 0 };
  class AudioContext {
    constructor() { log.contexts += 1; this.state = state; this.currentTime = 0; this.destination = {}; }
    resume() { log.resumes += 1; return Promise.resolve(); }
    createOscillator() { log.oscillators += 1; return { frequency: {}, connect() {}, start() {}, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  }
  return { AudioContext, log };
}

function setup({ vibrate = true, audio = fakeAudio(), storage = memoryStorage(), doc = fakeDocument(), platform } = {}) {
  const vibrations = [];
  const navigatorRef = vibrate ? { vibrate: (pattern) => { vibrations.push(pattern); return true; } } : {};
  const feedback = createFeedback({ navigator: navigatorRef, document: doc, AudioContext: audio.AudioContext, localStorage: storage, UsPlatform: platform });
  return { feedback, vibrations, audio, doc, storage };
}

test('haptic: unsupported vibrate is harmless, supported vibrate fires short patterns only', () => {
  const none = setup({ vibrate: false, audio: { AudioContext: undefined, log: {} } });
  for (const kind of ['tap', 'action', 'success', 'attention', 'reveal']) assert.doesNotThrow(() => none.feedback[kind]());

  const ok = setup();
  ok.feedback.tap();
  ok.feedback.reveal();
  assert.equal(ok.vibrations.length, 2);
  for (const pattern of ok.vibrations) {
    assert.ok(pattern.reduce((a, b) => a + b, 0) <= 200, 'never a long vibration sequence');
  }
});

test('haptic: a throwing vibrate API is swallowed', () => {
  const doc = fakeDocument();
  const feedback = createFeedback({ navigator: { vibrate() { throw new Error('blocked'); } }, document: doc, localStorage: memoryStorage() });
  assert.doesNotThrow(() => feedback.action());
});

test('disabled haptics produce no vibration and the choice is persisted', () => {
  const { feedback, vibrations, storage } = setup();
  feedback.setHapticsEnabled(false);
  feedback.success();
  feedback.tap();
  assert.deepEqual(vibrations, []);
  assert.equal(storage.getItem('us:feedback:haptics'), '0');
  assert.deepEqual(feedback.getPreferences(), { sounds: true, haptics: false });
  // A new instance (next launch) honours the stored choice.
  const again = createFeedback({ navigator: { vibrate: () => assert.fail('must stay silent') }, document: fakeDocument(), localStorage: storage });
  again.tap();
});

test('disabled sounds produce no audio action at all', () => {
  const audio = fakeAudio();
  const { feedback, doc } = setup({ audio });
  doc.fire('pointerdown');
  feedback.setSoundsEnabled(false);
  feedback.tap();
  feedback.reveal();
  assert.equal(audio.log.oscillators, 0);
  assert.equal(feedback.getPreferences().sounds, false);
});

test('no sound on cold launch: nothing plays before the first user gesture', () => {
  const audio = fakeAudio();
  const { feedback, doc } = setup({ audio });
  feedback.attention();
  feedback.reveal();
  assert.equal(audio.log.contexts, 0, 'no AudioContext is even created without a gesture');
  assert.equal(audio.log.oscillators, 0);
  doc.fire('pointerdown');
  assert.equal(audio.log.contexts, 1, 'the context is created once, inside the gesture');
  feedback.tap();
  assert.ok(audio.log.oscillators >= 1);
  doc.fire('keydown');
  feedback.action();
  assert.equal(audio.log.contexts, 1, 'the AudioContext is never recreated');
});

test('a suspended AudioContext is handled: resumed, never throws, never queues sound', async () => {
  const audio = fakeAudio({ state: 'suspended' });
  const { feedback, doc } = setup({ audio });
  doc.fire('pointerdown');
  assert.doesNotThrow(() => feedback.tap());
  assert.equal(audio.log.oscillators, 0);
  assert.ok(audio.log.resumes >= 1);

  class Broken {
    constructor() { this.state = 'suspended'; }
    resume() { return Promise.reject(new Error('autoplay')); }
  }
  const second = createFeedback({ navigator: {}, document: fakeDocument(), AudioContext: Broken, localStorage: memoryStorage() });
  second.unlock();
  assert.doesNotThrow(() => second.attention());
  await new Promise((resolve) => setImmediate(resolve));
});

test('nothing fires while the document is hidden', () => {
  const audio = fakeAudio();
  const doc = fakeDocument({ hidden: true });
  const { feedback, vibrations } = setup({ audio, doc });
  feedback.unlock();
  feedback.attention();
  feedback.success();
  assert.equal(audio.log.oscillators, 0);
  assert.deepEqual(vibrations, []);
});

test('native haptics go through the platform bridge when present', () => {
  const calls = [];
  const { feedback } = setup({ platform: { haptic: (kind, pattern) => { calls.push([kind, pattern]); return Promise.resolve(true); } } });
  feedback.success();
  feedback.tap();
  assert.deepEqual(calls.map(([kind]) => kind), ['success', 'light']);
});

// ------------------------------------------------ default tap (M12A review fix)

// Minimal element tree: enough selector support for the feedback authority.
function node(tag, attrs = {}, parent = null) {
  const el = {
    tag, attrs, parent, disabled: 'disabled' in attrs, hidden: 'hidden' in attrs,
    getAttribute: (k) => (k in attrs ? String(attrs[k]) : null),
    hasAttribute: (k) => k in attrs,
    matches: (selector) => matchesSelector(el, selector),
    closest(selector) { for (let cur = el; cur; cur = cur.parent) if (matchesSelector(cur, selector)) return cur; return null; }
  };
  return el;
}
function matchesSelector(el, selector) {
  return selector.split(',').map((part) => part.trim()).some((part) => {
    const m = part.match(/^([a-z]*)((?:\[[^\]]+\])*)$/);
    if (!m) return false;
    if (m[1] && m[1] !== el.tag) return false;
    return [...m[2].matchAll(/\[([a-z-]+)(?:="([^"]*)")?\]/g)].every(([, name, value]) => (value === undefined ? name in el.attrs : String(el.attrs[name]) === value));
  });
}
const click = (doc, target, extra = {}) => doc.fire('click', { target, ...extra });
const settle = () => new Promise((resolve) => setTimeout(resolve, 8));

test('default tap: an ordinary button needs no data-us-feedback attribute', async () => {
  const { vibrations, doc } = setup();
  click(doc, node('button'));
  await settle();
  assert.equal(vibrations.length, 1);
  assert.deepEqual(vibrations[0], [8], 'the tap profile');
});

test('default tap: links, role=button and role=tab count; passive areas and plain text do not', async () => {
  const { vibrations, doc } = setup();
  click(doc, node('a', { href: '/x' }));
  click(doc, node('div', { role: 'button' }));
  click(doc, node('span', { role: 'tab' }));
  await settle();
  assert.equal(vibrations.length, 1, 'taps of one gesture burst collapse, never machine-gun');
  for (const passive of [node('div'), node('a'), node('p')]) { click(doc, passive); await settle(); }
  assert.equal(vibrations.length, 1, 'no feedback for passive areas or links without href');
  click(doc, node('span', { role: 'tab' })); await settle();
  assert.equal(vibrations.length, 2);
  // A tap inside a button (icon/label) resolves to the button.
  const button = node('button'); click(doc, node('span', {}, button)); await settle();
  assert.equal(vibrations.length, 3);
});

test('default tap: disabled, aria-disabled, hidden and inert controls stay silent', async () => {
  const { vibrations, doc } = setup();
  const inert = node('div', { inert: '' });
  const hiddenBox = node('section', { hidden: '' });
  for (const target of [node('button', { disabled: '' }), node('button', { 'aria-disabled': 'true' }), node('button', { hidden: '' }), node('button', {}, inert), node('button', {}, hiddenBox)]) {
    click(doc, target); await settle();
  }
  assert.deepEqual(vibrations, []);
  click(doc, node('button', { 'aria-disabled': 'false' })); await settle();
  assert.equal(vibrations.length, 1);
});

test('default tap: programmatic clicks (isTrusted false) are not user gestures', async () => {
  const { vibrations, doc } = setup();
  click(doc, node('button'), { isTrusted: false });
  click(doc, node('button'), { isTrusted: true });
  await settle();
  assert.equal(vibrations.length, 1);
});

test('override: data-us-feedback="action" replaces the tap, "off" (also on a container) is silent', async () => {
  const { vibrations, doc } = setup();
  click(doc, node('button', { 'data-us-feedback': 'action' })); await settle();
  assert.deepEqual(vibrations, [[14]], 'action only, no tap on top');
  click(doc, node('button', { 'data-us-feedback': 'off' })); await settle();
  click(doc, node('button', {}, node('div', { 'data-us-feedback': 'off' }))); await settle();
  click(doc, node('button', { 'data-us-feedback': 'nonsense' })); await settle();
  assert.equal(vibrations.length, 1);
  click(doc, node('button', { 'data-us-feedback': 'tap' })); await settle();
  assert.equal(vibrations.length, 2, 'an explicit tap still works');
});

test('double feedback: an explicit action/success in the same gesture replaces the tap; confirmed async success follows it', async () => {
  const { feedback, vibrations, doc } = setup();
  // Handler calls action() synchronously during the click.
  click(doc, node('button')); feedback.action(); await settle();
  assert.deepEqual(vibrations, [[14]], 'one action, the tap was superseded');

  // A tap now, and a confirmed success after the async work: two distinct moments.
  vibrations.length = 0;
  click(doc, node('button'));
  await settle();
  feedback.success();
  assert.deepEqual(vibrations, [[8], [14, 40, 22]]);
});

test('default tap obeys preferences, hidden document and cold launch like every other feedback', async () => {
  const off = setup();
  off.feedback.setHapticsEnabled(false);
  click(off.doc, node('button')); await settle();
  assert.deepEqual(off.vibrations, []);

  const hidden = setup({ doc: fakeDocument({ hidden: true }) });
  click(hidden.doc, node('button')); await settle();
  assert.deepEqual(hidden.vibrations, []);

  const audio = fakeAudio();
  const cold = setup({ audio });
  click(cold.doc, node('button')); await settle();
  assert.equal(audio.log.oscillators, 0, 'no sound before the first gesture unlocked audio');
  cold.doc.fire('pointerdown');
  click(cold.doc, node('button')); await settle();
  assert.ok(audio.log.oscillators >= 1);
});

// ------------------------------------------------ attention from the shell

function attentionHarness({ hidden = false } = {}) {
  const { install } = require('../ui-foundation.js');
  const audio = fakeAudio();
  const doc = fakeDocument({ hidden });
  const vibrations = [];
  let clock = 1000;
  const feedback = createFeedback({ navigator: { vibrate: (p) => { vibrations.push(p); return true; } }, document: doc, AudioContext: audio.AudioContext, localStorage: memoryStorage(), now: () => clock });
  let observerCallback;
  class Observer { constructor(cb) { this.cb = cb; } observe(t, o) { if (o.attributeFilter?.includes('data-us-attention')) observerCallback = this.cb; } disconnect() {} }
  const bar = { offsetWidth: 0, setAttribute() {}, removeAttribute() {} };
  const documentRef = Object.assign(doc, {
    body: {}, documentElement: { setAttribute() {} }, querySelector: (s) => (s === '.top.us-premium-top' ? bar : null), querySelectorAll: () => [], removeEventListener() {}
  });
  const handle = install(documentRef, { matchMedia: () => ({ matches: false, addEventListener() {} }), MutationObserver: Observer, setTimeout: () => 1, clearTimeout() {}, UsFeedback: feedback });
  const topTarget = (value) => ({ getAttribute: () => value, closest: (s) => (s === '.top.us-premium-top' ? {} : null) });
  return { handle, feedback, vibrations, audio, doc, fire: (value, old) => observerCallback([{ target: topTarget(value), oldValue: old }]), advance: (ms) => { clock += ms; } };
}

test('top-bar attention: off -> on emits ONE attention feedback; on -> on and on -> off emit none', () => {
  const h = attentionHarness();
  h.doc.fire('pointerdown');
  h.fire('on', 'off');
  assert.deepEqual(h.vibrations, [[10, 50, 10]]);
  h.fire('on', 'on');
  h.fire('off', 'on');
  assert.equal(h.vibrations.length, 1);
  h.handle.destroy();
});

test('top-bar attention: a burst from several controls is still one event', () => {
  const h = attentionHarness();
  h.doc.fire('pointerdown');
  h.fire('on', 'off'); h.fire('on', null);
  assert.equal(h.vibrations.length, 1);
  h.advance(5000);
  h.fire('on', 'off');
  assert.equal(h.vibrations.length, 2, 'a genuinely new transition later plays again');
  h.handle.destroy();
});

test('top-bar attention: silent while hidden, before audio is unlocked, and when preferences are off', () => {
  const hidden = attentionHarness({ hidden: true });
  hidden.doc.fire('pointerdown');
  hidden.fire('on', 'off');
  assert.deepEqual(hidden.vibrations, []);
  assert.equal(hidden.audio.log.oscillators, 0);

  const cold = attentionHarness();
  cold.fire('on', 'off');
  assert.equal(cold.audio.log.contexts, 0, 'cold launch: no AudioContext, no sound');
  assert.equal(cold.audio.log.oscillators, 0);

  const muted = attentionHarness();
  muted.doc.fire('pointerdown');
  muted.feedback.setSoundsEnabled(false);
  muted.feedback.setHapticsEnabled(false);
  muted.fire('on', 'off');
  assert.deepEqual(muted.vibrations, []);
  assert.equal(muted.audio.log.oscillators, 0);
});

test('Ti penso does not double-fire: the explicit call and the shell transition share one attention event', () => {
  const h = attentionHarness();
  h.doc.fire('pointerdown');
  h.feedback.attention(); // handleIncomingThink
  h.fire('on', 'off');   // a top control reacting to the same arrival
  assert.equal(h.vibrations.length, 1);
  const app = read('app.js');
  assert.equal((app.match(/UsFeedback\?\.attention\?\.\(\)/g) || []).length, 1, 'Ti penso keeps exactly one explicit call');
  assert.match(read('ui-foundation.js'), /environment\.UsFeedback\?\.attention\?\.\(\)/);
});

test('no scattered vibration or audio APIs outside the feedback authority', () => {
  const offenders = [];
  for (const file of fs.readdirSync(ROOT).filter((name) => /\.(js|mjs)$/.test(name))) {
    if (['ui-foundation.js', 'platform.js', 'service-worker.js'].includes(file)) continue;
    const source = read(file);
    if (/navigator\.vibrate|new Audio\(|AudioContext/.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test('settings exposes one row to switch sounds and haptics off', () => {
  const html = read('index.html');
  const settings = read('settings.js');
  assert.match(html, /data-us-setting="feedback"/);
  assert.match(settings, /setSoundsEnabled/);
  assert.match(settings, /setHapticsEnabled/);
});
