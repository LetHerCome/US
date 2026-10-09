const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const Countdown = require('../countdown.js');
const countdownCss = read('countdown.css');
const countdownJs = read('countdown.js');
const progressionJs = read('progression.js');
const progressionCss = read('progression.css');
const html = read('index.html');
const migration = read('supabase/migrations/20261004231911_countdown_oggi_v1.sql');

test('Countdown visual pass: style ids and entitlements are exactly what the server validates', () => {
  const serverIds = migration.match(/if style not in \(([^)]*)\)/)[1].match(/'([a-z]+)'/g).map((s) => s.slice(1, -1));
  assert.deepEqual(Countdown.STYLES.map((s) => s.id), serverIds);
  const serverRewards = Object.fromEntries([...migration.matchAll(/when '([a-z]+)' then '([a-z_]+)'/g)].map((m) => [m[1], m[2]]));
  for (const style of Countdown.STYLES) assert.equal(style.reward, serverRewards[style.id], style.id);
  assert.equal(new Set(Countdown.STYLES.map((s) => s.name)).size, 6);
});

test('Countdown visual pass: every style owns typography, composition and its own motion', () => {
  const block = (id) => countdownCss.split('\n').filter((line) => line.includes(`[data-countdown-style="${id}"]`)).join('\n');
  for (const style of Countdown.STYLES) {
    const rules = block(style.id);
    assert.match(rules, /\.us-countdown-number\{[^}]*font/, `${style.id} number typography`);
    assert.match(rules, /\.us-countdown-(title|unit)\{/, `${style.id} composition`);
  }
  // One motion signature each (orbit is driven by real seconds, not a keyframe).
  assert.match(block('editorial'), /us-countdown-rise/);
  assert.match(block('signal'), /us-countdown-flap/);
  assert.match(block('glass'), /us-countdown-glint/);
  assert.match(block('aurora'), /us-countdown-aurora/);
  assert.match(block('orbit'), /transform:rotate\(var\(--us-cd-sweep,0deg\)\);transition:transform 1s linear/);
  assert.match(block('orbit'), /\[data-sweep-jump\]::after\{transition:none;\}/);
  assert.match(block('chrome'), /us-countdown-chrome/);
  assert.match(countdownCss, /\.us-countdown-art \.us-countdown-title:empty\{display:none!important\}/);
});

test('Countdown visual pass: reduced motion freezes everything, background and inactive Oggi pause it', () => {
  assert.match(countdownCss, /@media\(prefers-reduced-motion:reduce\)\{\.us-countdown-art \*,\.us-countdown-art::after\{animation:none!important;transition:none!important;\}/);
  assert.match(countdownCss, /:root\[data-us-motion="reduced"\] \.us-countdown-art \*,:root\[data-us-motion="reduced"\] \.us-countdown-art::after\{animation:none!important;transition:none!important;\}/);
  assert.match(countdownCss, /:root\[data-us-motion="reduced"\] \[data-countdown-style="orbit"\]::after\{transform:none!important;\}/);
  assert.match(countdownCss, /html\[data-us-visibility="hidden"\] \.us-countdown-art \*/);
  assert.match(countdownCss, /#home:not\(\.active\) \.us-countdown-art \*/);
  // Only compositor-friendly properties are animated by the new keyframes.
  for (const name of ['rise', 'flap', 'glint', 'chrome']) {
    const frames = countdownCss.match(new RegExp(`@keyframes us-countdown-${name}\\{(.*)\\}`))[1];
    assert.doesNotMatch(frames, /\b(width|height|top|left|margin|padding|font-size)\s*:/, name);
  }
});

test('Countdown visual pass: separators are marked, the orbit light jumps without spinning after background', () => {
  assert.match(countdownJs, /us-countdown-digit\$\{\/\\d\/\.test\(c\)\?'':' is-sep'\}/);
  assert.match(countdownJs, /<span class="us-countdown-deco" aria-hidden="true"><i><\/i><\/span>/);
  assert.match(countdownJs, /art\.toggleAttribute\('data-sweep-jump',s!==prev\+1\)/);
  assert.match(countdownJs, /api\.previewMarkup=style=>STYLES\.some/);
});

function fakeElement(id) {
  const attrs = {};
  const listeners = {};
  return {
    id, hidden: false, dataset: {}, innerHTML: '', textContent: '',
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    setAttribute(name, v) { attrs[name] = String(v); },
    getAttribute: (name) => attrs[name] ?? null,
    removeAttribute(name) { delete attrs[name]; },
    addEventListener(type, fn) { listeners[type] = fn; },
    emit(type, event) { return listeners[type]?.(event); },
    querySelector: () => null,
    querySelectorAll: () => [],
    insertAdjacentHTML() {}
  };
}

const catalog = [
  { id: 'badge_day_one', level_required: 1, category: 'badge', title: 'Day One', description: 'Spilla', token: 'badge_day_one' },
  { id: 'frame_aurora', level_required: 4, category: 'frame', title: 'Aurora', description: 'Bordo', token: 'frame_aurora' },
  { id: 'ring_orbit', level_required: 9, category: 'ring', title: 'Orbita', description: 'Anello', token: 'ring_orbit' },
  { id: 'frame_chrome', level_required: 12, category: 'frame', title: 'Cromo', description: 'Metallo', token: 'frame_chrome' }
];

function runProgression({ level, pending = [], withCountdown = true }) {
  const elements = new Map();
  const seen = new Set();
  const reactions = [];
  const applied = [];
  let activeCountdownStyle = 'editorial';
  const state = () => ({
    total_xp: 100, level, rhythm_days: 0, rhythm_today: false,
    rewards: catalog.map((r) => ({ ...r, unlocked: r.level_required <= level, equipped: false })),
    pending_unlocks: catalog.filter((r) => pending.includes(r.id) && !seen.has(r.id)), next_reward: null, preferences: {}
  });
  const document = {
    documentElement: { dataset: {} }, readyState: 'complete', hidden: false,
    getElementById: (id) => { if (!elements.has(id)) elements.set(id, fakeElement(id)); return elements.get(id); },
    addEventListener() {}
  };
  const sb = { rpc: async (name, args) => { if (name === 'ack_progression_unlock') seen.add(args.target_reward_id); return { data: state(), error: null }; } };
  const storage = new Map();
  const window = {
    document, usProfile: null,
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    UsFeedback: { action() {}, success() {} }, dispatchEvent() {},
    USPet: { react: (reason) => reactions.push(reason) },
    USCountdown: withCountdown ? {
      STYLES: Countdown.STYLES,
      previewMarkup: (id) => `<span class="us-countdown-art" data-countdown-style="${id}"></span>`,
      activeStyle: () => activeCountdownStyle,
      hasActive: () => true,
      setStyle: async (id) => { activeCountdownStyle = id; applied.push(id); return true; }
    } : undefined,
    toast() {}
  };
  vm.runInNewContext(progressionJs, { window, document, sb, console, CustomEvent, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: (fn) => fn() }, { filename: 'progression.js' });
  window.usProfile = { id: 'f', couple_id: 'c', role: 'francesco' };
  return { api: window.USProgression, el: document.getElementById, reactions, applied };
}

// US V3 — frames, stickers, badges and rings are no longer rewards: a pending
// one is never announced. A legacy reward that entitles a Countdown style is
// announced as that style, where it really lives.
test('Unlock moment: tells where the piece lives; retired pieces are never announced', async () => {
  const { api, el, reactions, applied } = runProgression({ level: 4, pending: ['badge_day_one', 'frame_aurora'] });
  await api.hydrate({ showUnlocks: true, force: true });
  assert.equal(el('usProgressionUnlock').dataset.category, 'countdown', 'the badge is skipped, Aurora comes first');
  assert.equal(el('usProgressionUnlockCount').textContent, '', 'a single real unlock, not "1 di 2"');
  assert.equal(el('usProgressionUnlockKicker').textContent, 'NUOVO STILE COUNTDOWN');
  assert.equal(el('usProgressionUnlockTitle').textContent, 'Countdown «Aurora»');
  assert.equal(el('usProgressionUnlockPlace').textContent, 'Sul countdown di Oggi');
  assert.equal(el('usProgressionUnlockPlace').hidden, false);
  assert.equal(el('usProgressionUnlockExtra').hidden, true, 'the style is the reward itself, not an extra');
  assert.match(el('usProgressionUnlockPreview').innerHTML, /data-countdown-style="aurora"/);
  assert.equal(el('usProgressionUnlockUse').textContent, 'Usalo nel countdown');
  assert.deepEqual(reactions, [], 'the PET waits until the moment is over');
  await el('usProgressionUnlockUse').emit('click');
  assert.deepEqual(applied, ['aurora'], '"Usalo" applies the countdown style through USCountdown');
  assert.deepEqual(reactions, ['reward']);
});

test('Collection: Countdown styles are a visible group whose locks follow the existing reward rows', async () => {
  const { api, el, applied } = runProgression({ level: 9 });
  await api.hydrate({ showUnlocks: false, force: true });
  let markup = el('usProgressionRewards').innerHTML;
  assert.match(markup, /data-category="countdown" aria-label="Stili Countdown"/);
  assert.match(markup, /<em>5\/6<\/em>/, 'three free + Aurora (L4) + Orbita (L9); Cromo still locked');
  assert.match(markup, /data-countdown-style-select="chrome" disabled/);
  assert.match(markup, /Con Cromo · livello 12/);
  assert.doesNotMatch(markup, /data-countdown-style-select="orbit" disabled/);
  assert.match(markup, /class="[^"]*us-progression-countdown-style[^"]*is-equipped[^"]*"[^>]*data-countdown-style-select="editorial"[^>]*aria-pressed="true"/);
  assert.equal((markup.match(/us-progression-reward-plus/g) || []).length, 0, 'US V3: Aurora, Orbita and Cromo are presented as the styles themselves, not as frames/rings');
  assert.doesNotMatch(markup, /data-progression-reward="(?:badge|frame|ring)_/, 'retired categories have no tile');
  assert.equal(el('usProgressionRewardsCount').textContent, '0 di 0', 'the count covers only rewards with a visible destination');
  await el('usProgressionRewards').emit('click', { target: { closest: () => ({ disabled: false, dataset: { countdownStyleSelect: 'orbit' } }) } });
  assert.deepEqual(applied, ['orbit']);
  markup = el('usProgressionRewards').innerHTML;
  assert.match(markup, /class="[^"]*us-progression-countdown-style[^"]*is-equipped[^"]*"[^>]*data-countdown-style-select="orbit"[^>]*aria-pressed="true"/);
  assert.match(markup, />Orbita<\/b><small>In uso<\/small>/);
});

test('Collection: without the Countdown runtime the collection is unchanged', async () => {
  const { api, el } = runProgression({ level: 9, withCountdown: false });
  await api.hydrate({ showUnlocks: false, force: true });
  assert.doesNotMatch(el('usProgressionRewards').innerHTML, /Stili Countdown|us-progression-reward-plus/);
});

test('Unlock moment markup: staged, tinted per category and fully static under reduced motion', () => {
  assert.match(html, /<div class="us-progression-unlock-stage" aria-hidden="true">\s*<span class="us-progression-unlock-burst"><\/span>\s*<span class="us-progression-unlock-sparks"><\/span>\s*<div class="us-progression-unlock-preview" id="usProgressionUnlockPreview" aria-hidden="true"><\/div>/);
  assert.match(html, /id="usProgressionUnlockPlace" hidden/);
  assert.match(html, /id="usProgressionUnlockExtra" hidden/);
  for (const category of ['oggi_theme', 'oggi_effect', 'countdown', 'theme', 'accent', 'effect']) {
    assert.match(progressionCss, new RegExp(`\\.us-progression-unlock\\[data-category="${category}"\\]`), category);
  }
  assert.match(progressionCss, /:root\[data-us-motion="reduced"\] \.us-progression-unlock \*,:root\[data-us-motion="reduced"\] \.us-progression-unlock \*::before\{animation:none!important\}/);
  assert.match(progressionCss, /@media\(prefers-reduced-motion:reduce\)\{\.us-progression-unlock \*,\.us-progression-unlock \*::before\{animation:none!important\}\}/);
});
