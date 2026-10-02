const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const migration = read('supabase/migrations/20261003090000_progression_rewards_v2.sql');
const css = read('progression.css');
const js = read('progression.js');
const html = read('index.html');

const catalog = [...migration.matchAll(/\('([a-z_]+)',\s+(\d+), '([a-z]+)',\s+'((?:[^']|'')+)',\s+'((?:[^']|'')+)', '([a-z_]+)',\s+(\d+), true, true\)/g)]
  .map((m) => ({ id: m[1], level_required: Number(m[2]), category: m[3], title: m[4].replace(/''/g, "'"), description: m[5].replace(/''/g, "'"), token: m[6] }));
const value = (reward) => reward.token.slice(reward.category.length + 1);

// The real surface each slot paints, and the preview hook its tile uses.
const HOOKS = {
  frame: (v) => [`#homeHero[data-us-frame="${v}"]`, `.us-cos-photo[data-frame="${v}"]`],
  sticker: (v) => [`.us-sticker[data-sticker="${v}"]`],
  badge: (v) => [`.us-badge[data-badge="${v}"]`],
  ring: (v) => [`:root[data-us-ring="${v}"] .noi-couple-avatar`, `.us-cos-avatar[data-ring="${v}"]`],
  theme: (v) => [`:root[data-us-theme="${v}"]`, `.us-cos-theme[data-theme="${v}"]`],
  accent: (v) => [`:root[data-us-accent="${v}"]`, `.us-cos-accent[data-accent="${v}"]`],
  effect: (v) => [`:root[data-us-effect="${v}"]`]
};

test('Rewards V2 client: every catalog reward has a real cosmetic and a preview hook in CSS', () => {
  assert.equal(catalog.length, 27);
  for (const reward of catalog) {
    for (const hook of HOOKS[reward.category](value(reward))) {
      assert.ok(css.includes(hook), `${reward.id} is missing ${hook}`);
    }
  }
  assert.match(js, /if \(value === 'ours'\)/);
  assert.match(js, /if \(value === 'ticket'\)/);
  assert.match(js, /if \(value === 'stamp'\)/);
});

test('Rewards V2 client: slots mirror the server preference keys, no client authority', () => {
  for (const category of Object.keys(HOOKS)) {
    assert.match(js, new RegExp(`${category}: \\{ pref: '${category}_reward_id'`), category);
    assert.match(migration, new RegExp(`'${category}_reward_id', prefs\\.${category}_reward_id`), category);
  }
  assert.doesNotMatch(js, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(js, /\.from\('(?:progression_|couple_reward|couple_progression)/);
  assert.match(html, /id="usCoupleBadge"/);
  assert.match(html, /id="usHeroSticker"/);
  assert.match(html, /id="usProgressionUnlockKicker"/);
});

test('Rewards V2 client: no fake currencies, no coin language', () => {
  const copy = catalog.map((r) => `${r.title} ${r.description}`).join(' ').toLowerCase();
  assert.doesNotMatch(copy, /\bcoin|monet|gettoni|punti premio|crediti/);
  const titles = catalog.map((r) => r.title);
  assert.equal(new Set(titles).size, titles.length, 'every reward has its own name');
});

test('Rewards V2 client: themes and accents keep text-on-accent contrast >= 3:1 (default US is 2.3:1)', () => {
  const lum = (hex) => {
    const c = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const blocks = [...css.matchAll(/:root\[data-us-(theme|accent)="([a-z_]+)"\],[^{]*\{([^}]*)\}/g)];
  assert.equal(blocks.length, 8);
  for (const [, kind, name, body] of blocks) {
    const stops = [...body.match(/--us-accent-gradient:linear-gradient\(([^;]*)\)/)[1].matchAll(/#[0-9a-f]{6}/gi)].map((m) => m[0]);
    const onAccent = body.match(/--us-color-text-on-accent:(#[0-9a-f]{6})/i)?.[1] || '#ffffff';
    const worst = Math.min(...stops.map((stop) => ratio(stop, onAccent)));
    assert.ok(worst >= 3, `${kind} ${name}: ${worst.toFixed(2)}`);
    const ink = body.match(/--us-color-accent-ink:(#[0-9a-f]{6})/i)[1];
    const bg = body.match(/--us-color-bg:(#[0-9a-f]{6})/i)?.[1] || '#08040e';
    assert.ok(ratio(ink, bg) >= 7, `${kind} ${name}: accent ink on background`);
  }
  assert.match(read('identity.css'), /\.answer-btn\.selected\{[^}]*color:var\(--us-color-text-on-accent\)!important/);
  assert.match(read('games.css'), /\.us-gv2-pervoi-cta\{[^}]*color:var\(--us-color-text-on-accent\)/);
});

test('Rewards V2 client: motion is opt-out with reduced motion and paused when hidden', () => {
  const reduced = css.slice(css.lastIndexOf('@media(prefers-reduced-motion:reduce)'));
  assert.match(reduced, /:root\[data-us-effect\] \.us-top-brand::before/);
  assert.match(reduced, /:root\[data-us-ring\] \.noi-couple-avatar::after/);
  assert.match(css, /:root\[data-us-visibility="hidden"\] \.us-top-brand::before/);
  assert.match(css, /\.us-progression-rewards\{[^}]*max-height:min\(440px,56dvh\)[^}]*overflow-y:auto/);
  assert.match(css, /\.us-reward-grid\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
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

function runProgression(stateFor) {
  const elements = new Map();
  const root = { dataset: {} };
  const calls = [];
  const document = {
    documentElement: root,
    readyState: 'complete',
    hidden: false,
    getElementById: (id) => { if (!elements.has(id)) elements.set(id, fakeElement(id)); return elements.get(id); },
    addEventListener() {}
  };
  const sb = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: stateFor(name, args), error: null };
    }
  };
  const window = { document, usProfile: null, UsFeedback: { action() {}, success() {} } };
  const context = { window, document, sb, console, setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: (fn) => fn() };
  vm.runInNewContext(js, context, { filename: 'progression.js' });
  window.usProfile = { id: 'f', couple_id: 'c' };
  return { api: window.USProgression, el: document.getElementById, root, calls, window };
}

test('Rewards V2 client: equipped slots paint the real UI independently; re-tap unequips', async () => {
  const prefs = { frame_reward_id: 'frame_polaroid', theme_reward_id: 'theme_film', accent_reward_id: 'accent_champagne', effect_reward_id: 'effect_constellation', badge_reward_id: 'badge_still_here', sticker_reward_id: 'sticker_ticket', ring_reward_id: 'ring_orbit' };
  const state = () => ({
    total_xp: 6000, level: 9, rhythm_days: 2, rhythm_today: true,
    rewards: catalog.map((r) => ({ ...r, unlocked: r.level_required <= 9, equipped: prefs[`${r.category}_reward_id`] === r.id })),
    pending_unlocks: [], next_reward: catalog.find((r) => r.level_required > 9), preferences: { ...prefs }
  });
  const { api, el, root, calls } = runProgression((name, args) => {
    if (name === 'equip_progression_reward') {
      const r = catalog.find((x) => x.id === args.target_reward_id);
      const key = `${r.category}_reward_id`;
      prefs[key] = prefs[key] === r.id ? null : r.id;
    }
    return state();
  });
  await api.hydrate({ showUnlocks: false, force: true });
  assert.deepEqual({ ...root.dataset }, { usTheme: 'film', usAccent: 'champagne', usEffect: 'constellation', usRing: 'orbit', usSticker: 'ticket' });
  assert.equal(el('homeHero').dataset.usFrame, 'polaroid');
  assert.equal(el('usCoupleBadge').hidden, false);
  assert.match(el('usCoupleBadge').innerHTML, /data-badge="still_here"[\s\S]*Still Here/);
  assert.match(el('usHeroSticker').innerHTML, /data-sticker="ticket"/);
  const tiles = el('usProgressionRewards').innerHTML;
  assert.equal((tiles.match(/data-progression-reward=/g) || []).length, 27);
  assert.equal((tiles.match(/aria-pressed="true"/g) || []).length, 7);
  assert.equal((tiles.match(/class="us-reward-group"/g) || []).length, 7);
  assert.match(tiles, /data-progression-reward="frame_scrapbook"[^>]*disabled/, 'locked rewards are disabled tiles');
  assert.match(el('usProgressionRewardsCount').textContent, /^\d+ di 27$/);
  assert.match(el('usProgressionNext').innerHTML, /us-progression-next-preview/);

  const tap = (id) => el('usProgressionRewards').emit('click', { target: { closest: () => ({ disabled: false, dataset: { progressionReward: id } }) } });
  await tap('accent_champagne');
  assert.equal(root.dataset.usAccent, undefined, 'tapping the equipped accent clears only the accent');
  assert.equal(root.dataset.usTheme, 'film');
  assert.equal(el('homeHero').dataset.usFrame, 'polaroid');
  await tap('badge_still_here');
  assert.equal(el('usCoupleBadge').hidden, true);
  await tap('badge_day_one');
  assert.match(el('usCoupleBadge').innerHTML, /data-badge="day_one"/);
  assert.ok(calls.filter((c) => c.name === 'equip_progression_reward').length === 3);
});

test('Rewards V2 client: the unlock card previews the real cosmetic and "Usalo ora" never unequips', async () => {
  const prefs = { frame_reward_id: null, theme_reward_id: null, accent_reward_id: null, effect_reward_id: null, badge_reward_id: 'badge_day_one', sticker_reward_id: null, ring_reward_id: null };
  const seen = new Set();
  const pending = ['badge_day_one', 'sticker_ours'];
  const state = () => ({
    total_xp: 300, level: 2, rhythm_days: 0, rhythm_today: false,
    rewards: catalog.map((r) => ({ ...r, unlocked: r.level_required <= 2, equipped: prefs[`${r.category}_reward_id`] === r.id })),
    pending_unlocks: catalog.filter((r) => pending.includes(r.id) && !seen.has(r.id)), next_reward: null, preferences: { ...prefs }
  });
  const equips = [];
  const { api, el } = runProgression((name, args) => {
    if (name === 'ack_progression_unlock') seen.add(args.target_reward_id);
    if (name === 'equip_progression_reward') { equips.push(args.target_reward_id); const r = catalog.find((x) => x.id === args.target_reward_id); const k = `${r.category}_reward_id`; prefs[k] = prefs[k] === r.id ? null : r.id; }
    return state();
  });
  await api.hydrate({ showUnlocks: true, force: true });
  assert.equal(el('usProgressionUnlockKicker').textContent, 'NUOVA SPILLA');
  assert.equal(el('usProgressionUnlockCount').textContent, '1 di 2');
  assert.match(el('usProgressionUnlockPreview').innerHTML, /us-badge[\s\S]*Day One/);
  await el('usProgressionUnlockUse').emit('click');
  assert.deepEqual(equips, [], 'already-equipped reward is acknowledged, not toggled off');
  assert.equal(prefs.badge_reward_id, 'badge_day_one');
  assert.equal(el('usProgressionUnlockKicker').textContent, 'NUOVO ADESIVO');
  assert.match(el('usProgressionUnlockPreview').innerHTML, /data-sticker="ours"/);
  await el('usProgressionUnlockUse').emit('click');
  assert.deepEqual(equips, ['sticker_ours']);
  assert.ok(seen.has('sticker_ours') && seen.has('badge_day_one'));
});
