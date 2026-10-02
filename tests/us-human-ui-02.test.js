// US-HUMAN-UI-02 — compact density, couple hierarchy and game discovery.
// Presentation only: these tests pin the semantics the new layout must keep
// (destinations, actions, ownership, truthfulness of derived state) rather
// than its pixels.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const html = read('index.html');
const tick = async (n = 8) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };

// ---------------------------------------------------------------- shell / nav

test('nav: the same four destinations, in order, with the same handlers and names', () => {
  const nav = html.match(/<nav class="nav us-nav us-nav-premium"[\s\S]*?<\/nav>/)?.[0] || '';
  const buttons = [...nav.matchAll(/<button [^>]*data-page="([^"]+)" onclick="([^"]+)" aria-label="([^"]+)"/g)].map((m) => m.slice(1));
  assert.deepEqual(buttons, [
    ['home', "go('home',{nav:true})", 'Oggi'],
    ['bond', "go('bond',{nav:true})", 'Noi'],
    ['moments', "go('moments',{nav:true})", 'Ricordi'],
    ['quiz', 'openQuizHub({nav:true})', 'Gioca'],
  ]);
  assert.equal((nav.match(/aria-current="page"/g) || []).length, 1, 'one current page at boot');
  assert.match(nav, /class="active" data-page="home"[^>]*aria-current="page"/);
});

test('nav: aria-current still follows the .active tab (ui-foundation sync is unchanged)', () => {
  const src = read('ui-foundation.js');
  assert.match(src, /function syncNavigation\(\) \{\s*Array\.from\(documentRef\.querySelectorAll\('\.nav button'\)\)\.forEach\(\(button\) => \{\s*if \(button\.classList\.contains\('active'\)\) button\.setAttribute\('aria-current', 'page'\);\s*else button\.removeAttribute\('aria-current'\);/);
});

test('nav: ~56px before the safe area, 44px+ targets, 24px icons, no looping animation', () => {
  const tokens = read('ui-foundation.css');
  assert.match(tokens, /--us-nav-height:56px;/);
  const id = read('identity.css');
  const block = id.slice(id.indexOf('/* --- M1 APK shell navigation'), id.indexOf('/* M1 top chrome'));
  assert.match(block, /\.us-nav-premium button\{[\s\S]*?min-width:44px!important;[\s\S]*?min-height:46px!important/);
  assert.match(block, /\.us-nav-icon\{position:relative;display:block;width:24px;height:24px;/);
  assert.doesNotMatch(block, /infinite/, 'no looping animation on the nav');
  assert.doesNotMatch(block, /button\.active::after/, 'no extra dot under the active label');
  assert.match(block, /button\.active \.us-nav-icon-on\{display:block!important\}/, 'active is still unmistakable: filled icon');
  assert.match(tokens, /\.us-nav:has\(> button:nth-of-type\(4\)\.active\)\{--us-nav-index:3\}/, 'the sliding indicator still marks the active tab');
  assert.match(tokens, /@media \(prefers-reduced-motion:reduce\)\{\.us-nav-indicator\{transition:none\}\}/);
  assert.match(read('fix4.css'), /@media \(orientation:landscape\) and \(max-height:560px\)\{:root\{--us-nav-height:52px\}/);
});

test('top: the pill is only as tall as its 44px controls and content starts right after it', () => {
  const tokens = read('ui-foundation.css');
  assert.match(tokens, /--us-top-chrome-height:46px;/);
  assert.match(tokens, /--us-top-chrome-clearance:56px;/);
  assert.match(read('identity.css'), /\.top\.us-premium-top\{top:calc\(var\(--us-safe-top\) \+ 6px\);left:max\(34px,var\(--us-safe-left\)\);right:max\(34px,var\(--us-safe-right\)\);padding:0 1px!important;/);
  // Global shell: Ti penso and Lasciato per te flank the product mark.
  const top = html.split('\n').find((line) => line.includes('<div class="top us-premium-top">')) || '';
  assert.match(top, /id="thinkButton" class="us-top-think us-premium-control" onclick="sendThinkSignal\(\)"/);
  assert.match(top, /id="leftForYouPartnerEntry"/);
  assert.match(top, /class="us-top-brand"/);
  assert.doesNotMatch(top, /id="usPerVoiTop"/, 'Per voi belongs to Gioca, not global chrome');
  assert.equal((html.match(/id="thinkButton"/g) || []).length, 1, 'one global Ti penso action');
});

test('HUMAN-UI-01 is not reintroduced: no capsule, no floating envelope shell', () => {
  assert.doesNotMatch(html, /us-capsule|usCapsuleMark|usNavGioca/);
  assert.doesNotMatch(read('ui-foundation.js'), /capsule\(/);
  assert.match(html, /<div class="top us-premium-top"><span class="us-aurora"/, 'the production top pill (with its aurora) stays');
});

// ---------------------------------------------------------------- Gioca

function gioca(homeState, rpcLog = []) {
  const nodes = {};
  const listeners = {};
  const node = (id) => (nodes[id] ||= {
    id, innerHTML: '', dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {}, removeAttribute() {}, querySelector: () => null,
    addEventListener(type, fn) { (listeners[`${id}:${type}`] ||= []).push(fn); },
  });
  const store = { localStorage: [], sessionStorage: [] };
  const storage = (name) => ({ getItem() { return null; }, setItem(k) { store[name].push(k); }, removeItem() {} });
  const window = { usProfile: { role: 'francesco' }, crypto: { randomUUID: () => 'req-1' }, go() {}, UsUiFoundation: { confirm: async () => true } };
  const sandbox = {
    window,
    document: { readyState: 'complete', hidden: false, getElementById: node, addEventListener() {}, querySelector: () => ({ id: 'quiz' }) },
    sb: { rpc: async (name, args) => { rpcLog.push([name, args]); return name === 'get_game_v2_home' ? { data: homeState, error: null } : { data: null, error: { message: 'qa' } }; } },
    localStorage: storage('localStorage'), sessionStorage: storage('sessionStorage'),
    toast() {}, FormData: class {}, console: { warn() {} }, setTimeout: () => 1, setInterval: () => 1,
  };
  node('quizHub'); node('usGameV2Panel'); node('usPerVoiTop');
  vm.runInNewContext(read('games.js'), sandbox);
  const click = async (dataset) => {
    for (const fn of listeners['quizHub:click'] || []) fn({ target: { closest: () => ({ dataset }) } });
    await tick();
  };
  return { nodes, store, window, click, hubHtml: async () => { await tick(); return nodes.quizHub.innerHTML; } };
}

const weekly = { week_start: '2026-09-28', next_unlock: '2026-10-05', assigned_role: 'francesco', next_role: 'beatrice', my_turn: false, created: false, created_by_me: false, partner_left_question: false, my_question: null };
const allowance = (over = {}) => ({ week_start: '2026-09-28', resets_on: '2026-10-05', per_voi_used: 0, per_voi_limit: 1, free_used: 0, free_limit: 2, used: 0, limit: 3, per_voi_available: true, free_available: true, open_count: 0, open_limit: 3, families: {}, ...over });
const homeOf = (over = {}) => ({ my_role: 'francesco', partner_role: 'beatrice', weekly, allowance: allowance(), per_voi: { state: 'idle' }, open_rounds: [], recent: [], ...over });
const round = (id, family, over = {}) => ({ id, game_family: family, item_count: 5, my_answered_count: 0, my_complete: false, partner_complete: false, reveal_ready: false, my_reveal_seen_at: null, started_by_role: 'francesco', completed_at: null, ...over });

test('Gioca: the same six game IDs, in order, as one deck after the Per voi hero', async () => {
  const html = await gioca(homeOf()).hubHtml();
  const ids = [...html.matchAll(/data-gv2-family="([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['scopritevi', 'confrontatevi', 'ridete', 'quanto_mi_conosci', 'rivivete', 'e_se']);
  assert.ok(html.indexOf('data-gv2-action="per-voi"') < html.indexOf('us-gv2-deck'), 'Per voi remains before the game deck');
  assert.equal((html.match(/data-gv2-action="per-voi"/g) || []).length, 1);
  assert.match(html, /<section class="us-gv2-modes" aria-label="Scegliete voi"><div class="us-gv2-mode-grid us-gv2-deck">/);
});

test('Gioca: a fresh week shows no status chips (nothing to filter is never invented)', async () => {
  const html = await gioca(homeOf()).hubHtml();
  assert.doesNotMatch(html, /us-gv2-filters|data-gv2-filter/);
});

test('Gioca: chips are plain readings of open_rounds / recent, with real counts', async () => {
  const state = homeOf({
    open_rounds: [round('o1', 'ridete', { partner_complete: true }), round('o2', 'e_se', { my_answered_count: 2 }), round('o3', 'scopritevi', { my_complete: true })],
    recent: [round('r1', 'rivivete', { my_complete: true, partner_complete: true, reveal_ready: true, completed_at: '2026-09-30T10:00:00Z' }),
      round('r2', 'confrontatevi', { my_complete: true, partner_complete: true, reveal_ready: true, my_reveal_seen_at: '2026-09-29T10:00:00Z', completed_at: '2026-09-29T09:00:00Z' })],
  });
  const html = await gioca(state).hubHtml();
  const chips = [...html.matchAll(/data-gv2-filter="([a-z]+)" aria-pressed="false" aria-controls="usGv2FilterList"><span>([^<]+)<\/span><b>(\d+)<\/b>/g)].map((m) => [m[1], m[2], Number(m[3])]);
  assert.deepEqual(chips, [['turn', 'Tocca a te', 2], ['ready', 'Risposte pronte', 1], ['waiting', 'Aspetti Bea', 1], ['done', 'Completati', 1]]);
  assert.ok(html.indexOf('us-gv2-filters') < html.indexOf('data-gv2-action="per-voi"'), 'status chips surface before Per voi when rounds exist');
  assert.match(html, /id="usGv2FilterList" aria-live="polite" hidden><\/div>/, 'no list until a chip is chosen');
});

test('Gioca: choosing a chip lists exactly its rounds, each opening the existing session action', async () => {
  const state = homeOf({ open_rounds: [round('o1', 'ridete', { partner_complete: true }), round('o3', 'scopritevi', { my_complete: true })] });
  const g = gioca(state);
  await g.hubHtml();
  await g.click({ gv2Filter: 'turn' });
  let html = g.nodes.quizHub.innerHTML;
  assert.match(html, /data-gv2-filter="turn" aria-pressed="true"/);
  const sessions = [...html.matchAll(/data-gv2-session="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(sessions, ['o1']);
  assert.match(html, /<b>Ridete<\/b><\/span><small class="us-gv2-row-state" data-tone="turn">Tocca a te<\/small>/);
  await g.click({ gv2Filter: 'turn' });
  html = g.nodes.quizHub.innerHTML;
  assert.match(html, /data-gv2-filter="turn" aria-pressed="false"/);
  assert.doesNotMatch(html, /data-gv2-session=/, 'a second tap closes the list');
  assert.deepEqual(g.store, { localStorage: [], sessionStorage: [] }, 'the filter is view state only');
});

test('Gioca: deck cards keep the existing mode action (start_game_round with the same family id)', async () => {
  const log = [];
  const g = gioca(homeOf(), log);
  await g.hubHtml();
  await g.click({ gv2Family: 'quanto_mi_conosci' });
  assert.deepEqual(log.filter(([n]) => n === 'start_game_round').map(([, a]) => JSON.stringify(a)), [JSON.stringify({ target_family: 'quanto_mi_conosci', request_id: 'req-1' })]);
  await g.click({ gv2Action: 'per-voi' });
  assert.ok(log.some(([n, a]) => n === 'start_game_round' && a.target_family === 'per_voi'), 'Per voi still starts the per_voi round');
});

test('Gioca: no new RPC, storage or authority in games.js', () => {
  const src = read('games.js');
  const rpcs = [...new Set([...src.matchAll(/sb\.rpc\('([a-z_0-9]+)'/g)].map((m) => m[1]))].sort();
  assert.deepEqual(rpcs, ['complete_game_session_side', 'create_weekly_question', 'get_game_session', 'get_game_v2_home', 'mark_game_session_reveal_seen', 'save_game_session_answer', 'start_game_round']);
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/);
});

// ---------------------------------------------------------------- Noi

const app = read('app.js');
const locationBlock = app.slice(app.indexOf('let locationRefreshInFlight=false;'), app.indexOf('function setAvatarSlot('));

function noi() {
  const els = {};
  const el = (id) => (els[id] ||= { id, hidden: true, textContent: '', dataset: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
  ['distanceWidget', 'distanceValue', 'noiCoupleLink', 'noiCoupleDistance'].forEach(el);
  const sandbox = {
    window: { usProfile: { id: 'me', couple_id: 'c', role: 'francesco' } },
    document: { hidden: false, getElementById: (id) => els[id] || null },
    navigator: { geolocation: {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sb: {}, toast() {}, setInterval: () => 1, clearInterval() {}, console: { warn() {} },
    Date, Number, Math, Promise, JSON, Infinity, Object, Array, String, Boolean, isFinite: Number.isFinite, parseFloat,
  };
  vm.runInNewContext(`${locationBlock}\nthis.api={distanceCapsuleModel,noiDistanceLine,renderDistanceCapsule};`, sandbox);
  return { api: sandbox.api, els };
}
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
const me = (age) => ({ user_id: 'me', latitude: 41.9028, longitude: 12.4964, updated_at: ago(age) });
const her = (age) => ({ user_id: 'her', latitude: 45.4642, longitude: 9.19, updated_at: ago(age) });

test('Noi distance: only a real reading carries a number; every other state stays unknown', () => {
  const { api } = noi();
  const ready = api.noiDistanceLine(api.distanceCapsuleModel({ mine: me(2), partner: her(2) }));
  assert.equal(ready.state, 'ready');
  assert.match(ready.text, /^\d{3} km$/);
  const stale = api.noiDistanceLine(api.distanceCapsuleModel({ mine: me(180), partner: her(2) }));
  assert.equal(stale.state, 'stale');
  assert.match(stale.label, /^Ultima distanza nota: \d{3} km$/);
  const unknownInputs = [
    { supported: false }, { permission: 'denied' }, { permission: 'granted' }, { permission: 'prompt' },
    { mine: me(2), partner: null }, { mine: { ...me(2), latitude: 'x' }, partner: her(2) },
  ];
  for (const input of unknownInputs) {
    const line = api.noiDistanceLine(api.distanceCapsuleModel(input));
    assert.deepEqual({ ...line }, { state: 'unknown', text: 'distanza non nota', label: 'Distanza tra voi non nota' }, JSON.stringify(input));
  }
  assert.equal(api.noiDistanceLine(undefined).state, 'unknown');
  assert.doesNotMatch(locationBlock, /insieme'|"insieme"|`insieme/, 'no "together" state is invented');
});

test('Noi distance: the existing capsule render also fills the couple row, and only reads', () => {
  const { api, els } = noi();
  api.renderDistanceCapsule(api.distanceCapsuleModel({ mine: me(2), partner: her(2) }));
  assert.equal(els.noiCoupleLink.dataset.usDistanceState, 'ready');
  assert.match(els.noiCoupleDistance.textContent, /^\d{3} km$/);
  assert.equal(els.distanceValue.textContent, els.noiCoupleDistance.textContent, 'one source for both surfaces');
  api.renderDistanceCapsule(api.distanceCapsuleModel({ permission: 'denied' }));
  assert.equal(els.noiCoupleLink.dataset.usDistanceState, 'unknown');
  assert.equal(els.noiCoupleDistance.textContent, 'distanza non nota');
  const render = app.slice(app.indexOf('function noiDistanceLine('), app.indexOf('function renderDistanceCapsule('));
  assert.doesNotMatch(render, /sb\.|localStorage|upsert|insert|update\(/);
});

test('Noi: the couple row reuses the existing avatar slots; Risonanza stays the hero; destinations unchanged', () => {
  const bond = html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';
  const head = bond.match(/<header class="noi-canonical-head noi-couple-head">[\s\S]*?<\/header>/)?.[0] || '';
  assert.match(head, /id="pairAvatarFrancesco"><img alt="" hidden><span class="fallback"/);
  assert.match(head, /id="pairAvatarBeatrice"><img alt="" hidden><span class="fallback"/);
  assert.match(head, /id="noiCoupleLink" data-us-distance-state="unknown"/);
  assert.match(head, /id="usSettingsEntry" onclick="go\('settings',\{nav:true\}\)"/);
  assert.match(app, /if\(profile\.role==='francesco'\)setAvatarSlot\('pairAvatarFrancesco',url\);/);
  assert.match(app, /if\(profile\.role==='beatrice'\)setAvatarSlot\('pairAvatarBeatrice',url\);/);
  const hub = bond.match(/<nav class="noi-hub" id="noiHub"[\s\S]*?<\/nav>/)?.[0] || '';
  const targets = [...hub.matchAll(/class="noi-hub-card noi-hub-card--([a-z]+)"(?: data-noi-open="([a-z-]+)"| id="usCalendarEntry" onclick="openCalendarSurface\(\)")/g)].map((m) => [m[1], m[2] || 'calendar-surface']);
  assert.deepEqual(targets, [['resonance', 'resonance'], ['ideas', 'da-vivere'], ['calendar', 'calendar-surface'], ['quest', 'quest'], ['events', 'eventi']]);
  for (const id of ['noiHubResonanceTitle', 'noiHubResonanceMeta', 'noiHubResonanceFill', 'noiHubIdeasTitle', 'noiHubIdeasMeta', 'noiHubQuestTitle', 'noiHubQuestMeta', 'noiHubEventsTitle', 'noiHubEventsMeta']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
  }
});



test('Noi density: Risonanza is the only hero and the four destinations share one compact surface', () => {
  const bond = html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';
  const hub = bond.match(/<nav class="noi-hub" id="noiHub"[\s\S]*?<\/nav>/)?.[0] || '';
  const group = hub.match(/<div class="noi-hub-destinations" role="group" aria-label="Voi">[\s\S]*?<\/div>/)?.[0] || '';
  assert.match(hub, /noi-hub-card--resonance/);
  assert.doesNotMatch(
    hub.slice(0, hub.indexOf('noi-hub-destinations')),
    /noi-hub-card--ideas|noi-hub-card--calendar|noi-hub-card--quest|noi-hub-card--events/
  );
  for (const kind of ['ideas', 'calendar', 'quest', 'events']) {
    assert.match(group, new RegExp(`noi-hub-card--${kind}`), kind);
  }
  const css = read('styles.css');
  assert.match(css, /US-NOI-DENSITY-02/);
  assert.match(css, /\.noi-hub-card--resonance\{min-height:116px;/);
  assert.match(css, /\.noi-hub-destinations[\s\S]*?border-radius:20px/);
  assert.match(css, /min-height:54px/);
});

test('Quest: action paths are untouched (server-authoritative confirm / reroll)', () => {
  assert.match(app, /sb\.rpc\('confirm_bond_quest'/);
  assert.match(app, /sb\.rpc\('reroll_bond_quest'/);
  const bond = html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';
  assert.match(bond, /<div id="questWeekBoard" class="quest-week" hidden><\/div>/);
  assert.match(bond, /<div id="bondQuestList" class="bond-quest-list noi-living-list" aria-live="polite">/);
});

// ---------------------------------------------------------------- Settings

const settingsPage = html.match(/<main id="settings"[\s\S]*?<\/main>/)?.[0] || '';
const scope = (name) => settingsPage.match(new RegExp(`<section class="us-settings2-section" data-us-settings-scope="${name}"[\\s\\S]*?\\n      </section>`))?.[0] || '';
const settingsIn = (chunk) => [...chunk.matchAll(/data-us-setting="([a-z-]+)"/g)].map((m) => m[1]);

test('Settings: TU holds what is the actor\'s or this phone\'s, VOI what the couple shares', () => {
  assert.deepEqual(settingsIn(scope('tu')), ['profile-photo', 'notifications', 'location', 'account-upgrade', 'distance', 'feedback', 'home-photo', 'scriptable-widgets', 'sync-status']);
  assert.deepEqual(settingsIn(scope('voi')), ['relationship-date', 'story-archive']);
  assert.match(scope('voi'), /<article class="us-couple-id-card" id="usCoupleIdCard"/, 'the couple card is shared state');
  assert.match(scope('tu'), /<h3 id="usSettingsTuTitle">Tu<\/h3>/);
  assert.match(scope('voi'), /<h3 id="usSettingsVoiTitle">Voi<\/h3>/);
});

test('Settings: every control exists exactly once and keeps its existing action', () => {
  const all = settingsIn(settingsPage);
  assert.equal(new Set(all).size, all.length, 'no duplicated control');
  assert.deepEqual([...all].sort(), ['account-upgrade', 'distance', 'feedback', 'home-photo', 'location', 'logout', 'notifications', 'privacy', 'profile-photo', 'relationship-date', 'scriptable-widgets', 'story-archive', 'sync-status']);
  const settingsJs = read('settings.js');
  for (const name of all) assert.match(settingsJs, new RegExp(`if\\(name==='${name}'\\)`), `${name} is still handled`);
  for (const id of ['usRelationshipDateValue', 'usNotificationsValue', 'usDistanceUnitValue', 'usLocationState', 'usFeedbackValue', 'usSyncValue', 'usAccountUpgradeRow', 'usStoryArchiveValue', 'usSettingsBuild', 'usCoupleAvatars', 'usCoupleNames', 'usTogetherLine', 'usSettingsDeviceDot']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
  }
});

test('Settings: ownership matches storage (shared rows write couple data, personal rows do not)', () => {
  const s = read('settings.js');
  assert.match(s, /sb\.from\('couples'\)\.update\(\{started_on:value\}\)/, 'relationship date is couple data (VOI)');
  assert.match(s, /localStorage\.setItem\('us:settings:distance-unit'/, 'distance unit is this phone (TU)');
  assert.match(s, /sb\.rpc\('set_notification_preference'/, 'notification preferences are per user (TU)');
});

// ---------------------------------------------------------------- release

test('release: one BUILD_ID owns HTML, version marker and atomic shell cache', () => {
  const build = html.match(/<meta name="us-build" content="([^"]+)"\/>/)?.[1];
  assert.ok(build, 'HTML exposes a build id');
  assert.equal(JSON.parse(read('version.json')).version, build);

  const worker = read('service-worker.js');
  const workerBuild = worker.match(/const BUILD_ID = "([^"]+)";/)?.[1];
  assert.equal(workerBuild, build);
  assert.match(worker, /const CACHE_NAME = `\$\{SHELL_CACHE_PREFIX\}\$\{BUILD_ID\}`;/);
  assert.match(worker, /const MEDIA_CACHE_NAME = "us-private-media-v1";/);
  assert.match(worker, /new Request\(url, \{ cache: "reload" \}\)/, 'install precache is atomic and bypasses stale HTTP cache');
  assert.match(worker, /url\.searchParams\.get\("v"\) === BUILD_ID/, 'build assets are immutable inside a release');

  const versionedHtml = [...html.matchAll(/(?:href|src)="([^"]+\?v=([^"&]+))"/g)];
  assert.ok(versionedHtml.length > 10, 'critical shell assets are versioned');
  for (const [, asset, version] of versionedHtml) assert.equal(version, build, asset);

  const manifest = read('manifest.webmanifest');
  for (const match of manifest.matchAll(/"src":\s*"([^"]+\?v=([^"&]+))"/g)) {
    assert.equal(match[2], build, match[1]);
  }
});

test('no new dependencies', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@capacitor/android', '@capacitor/app', '@capacitor/core', '@capacitor/haptics', '@supabase/supabase-js', '@us/widget-bridge']);
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ['@capacitor/cli', '@electric-sql/pglite', 'esbuild']);
});


test('Gioca density: played Per voi, deck and weekly question use compact hub geometry', () => {
  const css = read('games.css');
  assert.match(css, /US-GIOCA-DENSITY-01/);
  assert.match(css, /#quiz \.us-gv2-pervoi\[data-gv2-state="played"\]\{[\s\S]*?min-height:64px/);
  assert.match(css, /#quiz \.us-gv2-mode\{[\s\S]*?width:116px;[\s\S]*?min-height:126px/);
  assert.match(css, /#quiz \.us-gv2-weekly\.is-open\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css, /body:has\(#quiz\.page\.active\) #thinkButton\{display:none!important\}/);
});


test('Settings density: utility rows, couple card and footer stay compact without changing controls', () => {
  const css = read('settings2.css');
  assert.match(css, /US-SETTINGS-DENSITY-01/);
  assert.match(css, /#settings \.us-settings2-row\{[\s\S]*?min-height:48px!important;/);
  assert.match(css, /#settings \.us-settings2-icon\{[\s\S]*?width:28px;[\s\S]*?height:28px;/);
  assert.match(css, /#settings \.us-couple-id-card\{[\s\S]*?padding:10px 11px;/);
  assert.match(css, /body:has\(#settings\.page\.active\) #thinkButton\{\s*display:none!important;/);
  const page = html.match(/<main id="settings"[\s\S]*?<\/main>/)?.[0] || '';
  for (const name of ['profile-photo','notifications','location','distance','feedback','home-photo','scriptable-widgets','sync-status','relationship-date','story-archive']) {
    assert.match(page, new RegExp(`data-us-setting="${name}"`), name);
  }
});


test('Oggi density: arbitration stays authoritative while primary and quiet surfaces use compact geometry', () => {
  const css = read('styles.css');
  assert.match(css, /US-OGGI-DENSITY-01/);
  assert.match(css, /#home \.us-daily-ritual\[data-us-oggi-slot="primary"\]\{[\s\S]*?min-height:70px/);
  assert.match(css, /#home #usOggiCalendarWidget\[data-us-oggi-slot="quiet"\] \.us-oggi-card\{[\s\S]*?min-height:46px/);
  assert.match(css, /#home #usTodayPriorityRegion\[data-us-oggi-slot="primary"\] \.us-today-priority-card\{[\s\S]*?min-height:58px/);
  const app = read('app.js');
  assert.match(app, /US_OGGI_SURFACES=Object\.freeze\(\['usTodayPriorityRegion','usOggiCalendarWidget','usDailyRitual','usDailyRevealLink','pushOptInCard'\]\)/);
  assert.match(app, /winner\.primary===id\?'primary':winner\.quiet===id\?'quiet':'suppressed'/);
});


test('shell: Ti penso lives in top chrome and Per voi stays inside Gioca', () => {
  const top = html.split('\n').find((line) => line.includes('<div class="top us-premium-top">')) || '';
  assert.match(top, /id="thinkButton"/);
  assert.match(top, /id="leftForYouPartnerEntry"/);
  assert.doesNotMatch(top, /usPerVoiTop/);
  assert.equal((html.match(/id="thinkButton"/g) || []).length, 1);
  assert.match(read('identity.css'), /US-SHELL-THINK-01/);
  assert.match(read('polish4.css'), /Ti penso is global top chrome/);
  assert.match(read('games.js'), /data-gv2-action="per-voi"/);
});


test('secondary surfaces: internal destinations use the same compact sheet and row rhythm', () => {
  const calendar = read('calendar.css');
  const events = read('events.css');
  const moments = read('moments-albums.css');
  const left = read('left-for-you.css');
  const settings = read('settings.css');
  const styles = read('styles.css');
  for (const css of [calendar, events, moments, left, settings, styles]) assert.match(css, /US-SECONDARY-SURFACES-01/);
  assert.match(calendar, /\.us-cal-day\{min-height:50px/);
  assert.match(events, /\.us-event-item\{[\s\S]*?min-height:60px/);
  assert.match(moments, /\.conservati-card\{[\s\S]*?min-height:60px/);
  assert.match(left, /\.left-for-you-head h2\{font-size:22px/);
  assert.match(settings, /\.us-setting-choice button\{min-height:48px/);
  assert.match(styles, /#today \.question\{padding:14px/);
  assert.match(styles, /#bond \.noi-living-list \.bond-quest\{[\s\S]*?padding:11px 12px/);
});


test('state system: loading, empty, error, retry and connectivity share one visual authority', () => {
  const css = read('state-system.css');
  assert.match(css, /US-STATE-SYSTEM-01/);
  assert.match(css, /\.us-state--loading/);
  assert.match(css, /\.app-status-bar\[data-kind="error"\]/);
  assert.match(css, /\.app-status-bar\[data-kind="online"\]/);
  assert.match(css, /\.conservati-error/);
  assert.match(css, /\.left-for-you-error/);
  assert.match(css, /\.us-gv2-error/);
  assert.match(css, /\.us-cal-empty/);
  assert.match(css, /\.us-settings-empty/);
  const build = html.match(/<meta name="us-build" content="([^"]+)"\/>/)?.[1];
  assert.match(html, new RegExp(`/state-system\\.css\\?v=${build}`));
  assert.match(read('service-worker.js'), /versioned\("\/state-system\.css"\)/);
  assert.match(read('fix4.js'), /showStatus\('Sei offline\. Riprendo appena torni online\.', 'offline'\)/);
});


test('PWA hardening: update navigation refreshes index and version checks do not leak timestamp cache keys', () => {
  const worker = read('service-worker.js');
  const fix = read('fix4.js');
  assert.match(worker, /const versionKey = new Request\("\/version\.json"\);/);
  assert.match(worker, /cache\.put\(versionKey, copy\)/);
  assert.doesNotMatch(worker, /cache\.put\(request, copy\)[\s\S]{0,180}version\.json/);
  assert.match(worker, /if \(url\.searchParams\.has\("us-refresh"\)\)/);
  assert.match(worker, /cache\.put\("\/index\.html", response\.clone\(\)\)/);
  assert.match(fix, /refreshUrl\.searchParams\.set\('us-refresh', String\(Date\.now\(\)\)\)/);
  assert.match(fix, /window\.location\.replace\(refreshUrl\.href\)/);
  assert.match(fix, /currentUrl\.searchParams\.delete\('us-refresh'\)/);
});
