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

test('declarative feedback: [data-us-feedback] clicks route to the engine, disabled controls do not', () => {
  const { feedback, vibrations, doc } = setup();
  const host = (kind, disabled = false) => ({ target: { closest: () => ({ disabled, getAttribute: () => kind }) } });
  doc.fire('click', host('tap'));
  doc.fire('click', host('tap', true));
  doc.fire('click', host('nonsense'));
  assert.equal(vibrations.length, 1);
  assert.ok(feedback);
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
