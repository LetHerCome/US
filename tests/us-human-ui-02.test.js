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
  // Il diario, ma pulito (15/11/2026): <nav class="dy-nav">, same buttons; the
  // icons are the mockup's inline strokes (Gioca a controller), no Phosphor files.
  const nav = html.match(/<nav class="dy-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  const buttons = [...nav.matchAll(/<button [^>]*data-page="([^"]+)" onclick="([^"]+)" aria-label="([^"]+)"/g)].map((m) => m.slice(1));
  assert.deepEqual(buttons, [
    ['home', "go('home',{nav:true})", 'Oggi'],
    ['bond', "go('bond',{nav:true})", 'Noi'],
    ['moments', "go('moments',{nav:true})", 'Ricordi'],
    ['quiz', 'openQuizHub({nav:true})', 'Gioca'],
  ]);
  assert.equal((nav.match(/aria-current="page"/g) || []).length, 1, 'one current page at boot');
  assert.match(nav, /class="active" data-page="home"[^>]*aria-current="page"/);
  assert.equal((nav.match(/<svg class="dy-nav-icon"/g) || []).length, 4);
  assert.doesNotMatch(nav, /phosphor\/|cards-three/, 'inline icons only');
});

test('nav: aria-current still follows the .active tab (ui-foundation sync is unchanged)', () => {
  const src = read('ui-foundation.js');
  // Il diario, ma pulito (15/11/2026): the same sync, on .dy-nav.
  assert.match(src, /function syncNavigation\(\) \{\s*Array\.from\(documentRef\.querySelectorAll\('\.dy-nav button'\)\)\.forEach\(\(button\) => \{\s*if \(button\.classList\.contains\('active'\)\) button\.setAttribute\('aria-current', 'page'\);\s*else button\.removeAttribute\('aria-current'\);/);
});

test('nav: ~50px before the safe area, 44px+ targets, 27px icons, no looping animation', () => {
  // Il diario, ma pulito (15/11/2026): the bar is 66px before the safe area
  // (84 with the 18 below); its buttons fill the bar above the safe area, icons 24px; the current
  // tab is ink, bold, with the red scribble; one hop when it changes, never a loop.
  const tokens = read('ui-foundation.css');
  assert.match(tokens, /--us-nav-height:50px;/);
  const block = read('diario.css').split('\n').filter((line) => line.includes('.dy-nav')).join('\n');
  assert.match(block, /\.dy-nav\{[^}]*height:calc\(var\(--us-nav-height\) \+ max\(18px,var\(--us-safe-bottom\)\)\);padding:4px /);
  assert.match(block, /\.dy-nav \.dy-nav-icon\{width:27px;height:27px;/);
  assert.doesNotMatch(block, /infinite/, 'no looping animation on the nav');
  assert.match(block, /\.dy-nav button\.active\{color:var\(--us-ink-100\);font-weight:800\}/, 'active is still unmistakable');
  // La barra a goccia (20/11/2026): the hill under the page marks it; its icon lifts into it.
  assert.match(block, /\.dy-nav button\.active \.dy-nav-icon\{transform:translateY\(var\(--dy-ball-dy,-16px\)\);stroke-width:2\.2;/);
  assert.match(block, /html\[data-us-motion="reduced"\] :is\(\.dy-oggi,\.dy-nav,\.dy-over\) \*\{animation:none!important;transition:none!important\}/);
  assert.match(read('fix4.css'), /@media \(orientation:landscape\) and \(max-height:560px\)\{:root\{--us-nav-height:48px\}/);
});

test('top: the pill is only as tall as its 44px controls and content starts right after it', () => {
  // Il diario, ma pulito (15/11/2026): no floating pill. The header of Oggi
  // starts 6px under the safe area; its controls are square 44px buttons and
  // the date follows it in the page flow.
  const diario = read('diario.css');
  assert.match(diario, /\.dy-head\{[^}]*padding:calc\(var\(--us-safe-top\) \+ 6px\) 20px 0\}/);
  assert.match(diario, /\.dy-ib\{[^}]*width:var\(--us-icon-btn\);height:var\(--us-icon-btn\);/);
  // La barra a goccia (20/11/2026): Lasciato per te and you flank «us»; Ti penso is the middle of the bar.
  const top = html.match(/<header class="dy-head">[\s\S]*?<\/header>/)?.[0] || '';
  assert.doesNotMatch(top, /id="thinkButton"/);
  assert.match(html.match(/<nav class="dy-nav"[\s\S]*?<\/nav>/)?.[0] || '', /id="thinkButton" class="dy-think"/);
  assert.match(top, /data-dy-me/);
  assert.match(top, /id="leftForYouPartnerEntry"/);
  assert.match(top, /class="dy-mark"/);
  assert.doesNotMatch(top, /id="usPerVoiTop"/, 'Per voi belongs to Gioca, not global chrome');
  assert.equal((html.match(/id="thinkButton"/g) || []).length, 1, 'one global Ti penso action');
});

test('HUMAN-UI-01 is not reintroduced: no capsule, no floating envelope shell', () => {
  assert.doesNotMatch(html, /us-capsule|usCapsuleMark|usNavGioca/);
  assert.doesNotMatch(read('ui-foundation.js'), /capsule\(/);
  // Il diario, ma pulito (15/11/2026): the old pill is a hidden holder; the header of Oggi replaces it.
  assert.match(html, /<div class="top us-premium-top" hidden>/);
  assert.doesNotMatch(html, /class="us-aurora"/);
});

test('page labels: Ricordi and Gioca stay accessible without a visible top-left title', () => {
  const moments = html.match(/<main id="moments"[\s\S]*?<\/main>/)?.[0] || '';
  assert.match(moments, /<h2 class="noi-sr">Ricordi<\/h2>/);
  assert.doesNotMatch(moments, /<h2>Ricordi<\/h2>/);
  // Il diario, ma pulito (15/11/2026): Ricordi and Gioca now have a visible header
  // (.dy-hd «Il vostro diario», «Giochi a due»); the week strip left the hub.
  assert.match(moments, /<header class="dy-hd">\s*<h2 class="dy-h2">Il vostro <em>diario<\/em><\/h2>/);
  const games = read('games.js');
  assert.match(games, /<header class="dy-hd"><h2 class="dy-h2">Giochi <em>a due<\/em><\/h2>\$\{dyCountTag\(\)\}<span class="dy-hd-tools">/);
  assert.doesNotMatch(games.slice(games.indexOf('function renderHub()'), games.indexOf('function renderHubError()')), /weekStrip\(\)/);
  assert.doesNotMatch(games, /rhythmStrip|us-gv2-head"/);
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
  require('./helpers/identity-fixture').install(sandbox);
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

// US V3 — the six families (and Swipe) are one ordered grid after Per voi:
// no sideways deck, no filter chips; rounds that wait for you are shown
// directly in "Da continuare", completed ones in one disclosure at the end.
test('Gioca V4: six existing game IDs and hero are in one bento grid', async () => {
  const html = await gioca(homeOf()).hubHtml();
  const ids = [...html.matchAll(/data-gv2-family="([a-z_]+)"/g)].map((m) => m[1]);
  // G7 1.0 — "E se…?" is no longer offered (old rounds still open by id).
  assert.deepEqual(ids, ['scopritevi', 'confrontatevi', 'ridete', 'quanto_mi_conosci', 'rivivete']);
  // Il diario, ma pulito (15/11/2026): one «Da giocare» list (.dy-game-list), Per voi first.
  assert.ok(html.indexOf('dy-game-list') < html.indexOf('data-gv2-action="per-voi"'), 'Per voi is the first row of the list');
  assert.ok(html.indexOf('data-gv2-action="per-voi"') < html.indexOf('data-gv2-action="swipe"'), 'Per voi precedes Swipe in visual and keyboard order');
  assert.equal((html.match(/data-gv2-action="per-voi"/g) || []).length, 1);
  assert.equal((html.match(/data-gv2-action="swipe"/g) || []).length, 1, 'Swipe has exactly one entry');
  assert.match(html, /<section class="dy-games" aria-labelledby="usGv2ChooseTitle">[\s\S]*?<h3 id="usGv2ChooseTitle">Da giocare<\/h3>[\s\S]*?<div class="dy-game-list">/);
  assert.doesNotMatch(html, /us-gv2-deck|us-gv2-filters|data-gv2-filter/);
  assert.doesNotMatch(read('games.css'), /\.us-gv2-game-grid\{[^}]*overflow-x/, 'discovering games never needs a sideways scroll');
});

test('Gioca: a fresh week shows no "Da continuare" and no completed list (nothing is invented)', async () => {
  const html = await gioca(homeOf()).hubHtml();
  assert.doesNotMatch(html, /us-gv2-continue|us-gv2-done|data-gv2-session/);
});

// Round 3 parity (062): a round of an offered family lives on its own tile
// (the mockup has no list above the games); "Da continuare" keeps only rounds
// no tile stands for (a retired family such as E se…?), after the games.
test('Gioca: rounds are plain readings of open_rounds / recent, on their tiles; "Da continuare" holds the rest', async () => {
  const state = homeOf({
    open_rounds: [round('o1', 'ridete', { partner_complete: true }), round('o2', 'e_se', { my_answered_count: 2 }), round('o3', 'scopritevi', { my_complete: true })],
    recent: [round('r1', 'rivivete', { my_complete: true, partner_complete: true, reveal_ready: true, completed_at: '2026-09-30T10:00:00Z' }),
      round('r2', 'confrontatevi', { my_complete: true, partner_complete: true, reveal_ready: true, my_reveal_seen_at: '2026-09-29T10:00:00Z', completed_at: '2026-09-29T09:00:00Z' })],
  });
  const html = await gioca(state).hubHtml();
  const section = html.match(/<section class="us-gv2-continue"[\s\S]*?<\/section>/)?.[0] || '';
  const rows = [...section.matchAll(/data-gv2-session="([^"]+)" data-tone="([a-z]+)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(rows, [['o2', 'progress']]);
  assert.match(section, /<b>E se…\?<\/b>/);
  // Il diario, ma pulito (15/11/2026): a row says its round in its status tag.
  const tiles = [...html.matchAll(/data-gv2-family="([a-z_]+)" data-gv2-mode-state="open" data-gv2-session="([^"]+)" data-tone="([a-z]+)"[^>]*>[\s\S]*?<span class="dy-tag dy-tag-s dy-game-tag"[^>]*>(?:<span class="dy-mini"[\s\S]*?<\/svg><\/span>)?([^<]+)<\/span>/g)].map((m) => m.slice(1)); // the turn tag may start with the small character (v4.1)
  // v4.1: a round the other person already played says «ha giocato» with their small character.
  assert.deepEqual(tiles, [['scopritevi', 'o3', 'waiting', 'aspetti Beatrice'], ['ridete', 'o1', 'turn', 'ha giocato'], ['rivivete', 'r1', 'ready', 'risposte pronte']]);
  assert.ok(html.indexOf('us-gv2-continue') > html.indexOf('dy-games'), 'the rest comes after the games');
  const done = html.match(/<details class="us-gv2-done">[\s\S]*?<\/details>/)?.[0] || '';
  assert.match(done, /<summary><span>Partite completate<\/span><b>1<\/b><\/summary>/);
  assert.deepEqual([...done.matchAll(/data-gv2-session="([^"]+)"/g)].map((m) => m[1]), ['r2']);
  assert.ok(html.indexOf('us-gv2-done') > html.indexOf('dy-games'), 'completed rounds stay at the end');
});

test('Gioca: a round row opens the existing session action and keeps no client state', async () => {
  const log = [];
  const state = homeOf({ open_rounds: [round('o1', 'ridete', { partner_complete: true }), round('o3', 'scopritevi', { my_complete: true })] });
  const g = gioca(state, log);
  await g.hubHtml();
  await g.click({ gv2Session: 'o1' });
  assert.deepEqual(log.filter(([n]) => n === 'get_game_session').map(([, a]) => a.target_session_id), ['o1']);
  assert.deepEqual(g.store, { localStorage: [], sessionStorage: [] }, 'the hub is view state only');
});

test('Gioca: game cards keep the existing mode action (start_game_round with the same family id)', async () => {
  const log = [];
  const g = gioca(homeOf(), log);
  await g.hubHtml();
  await g.click({ gv2Family: 'quanto_mi_conosci' });
  assert.deepEqual(log.filter(([n]) => n === 'start_game_round').map(([, a]) => JSON.stringify(a)), [JSON.stringify({ target_family: 'quanto_mi_conosci', request_id: 'req-1' })]);
  await g.click({ gv2Action: 'per-voi' });
  assert.ok(log.some(([n, a]) => n === 'start_game_round' && a.target_family === 'per_voi'), 'Per voi still starts the per_voi round');
});

test('Gioca: RPC surface is explicit; Swipe adds only its start authority and no client storage', () => {
  const src = read('games.js');
  const rpcs = [...new Set([...src.matchAll(/sb\.rpc\('([a-z_0-9]+)'/g)].map((m) => m[1]))].sort();
  assert.deepEqual(rpcs, ['complete_game_session_side', 'create_weekly_question', 'get_game_session', 'get_game_v2_home', 'mark_game_session_reveal_seen', 'save_game_session_answer', 'start_game_round', 'start_swipe_round']);
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
  require('./helpers/identity-fixture').install(sandbox);
  vm.runInNewContext(`${locationBlock}\nthis.api={distanceCapsuleModel,noiDistanceLine,renderDistanceCapsule};`, sandbox);
  return { api: sandbox.api, els };
}
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
// couple_distance() answers: never coordinates, only a rounded distance or "near".
const server = (mineAge, partnerAge, extra = {}) => ({ sharing: true, my_updated_at: ago(mineAge), partner_sharing: true, partner_updated_at: ago(partnerAge), near: false, distance_km: 477, ...extra });

test('Noi distance: only a real reading carries a number; every other state stays unknown', () => {
  const { api } = noi();
  const ready = api.noiDistanceLine(api.distanceCapsuleModel({ server: server(2, 2) }));
  assert.equal(ready.state, 'ready');
  assert.match(ready.text, /^\d{3} km$/);
  const stale = api.noiDistanceLine(api.distanceCapsuleModel({ server: server(180, 2) }));
  assert.equal(stale.state, 'stale');
  assert.match(stale.label, /^Ultima distanza nota: \d{3} km$/);
  const unknownInputs = [
    { supported: false }, { permission: 'denied' }, { permission: 'granted' }, { permission: 'prompt' },
    { server: { ...server(2, 2), partner_sharing: false, partner_updated_at: null, distance_km: null } },
    { server: server(2, 2, { distance_km: 'x' }) }, { server: { ...server(2, 2), sharing: false }, consent: true, permission: 'denied' },
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
  api.renderDistanceCapsule(api.distanceCapsuleModel({ server: server(2, 2) }));
  assert.equal(els.noiCoupleLink.dataset.usDistanceState, 'ready');
  assert.match(els.noiCoupleDistance.textContent, /^\d{3} km$/);
  assert.equal(els.distanceValue.textContent, els.noiCoupleDistance.textContent, 'one source for both surfaces');
  api.renderDistanceCapsule(api.distanceCapsuleModel({ permission: 'denied' }));
  assert.equal(els.noiCoupleLink.dataset.usDistanceState, 'unknown');
  assert.equal(els.noiCoupleDistance.textContent, 'distanza non nota');
  const render = app.slice(app.indexOf('function noiDistanceLine('), app.indexOf('function renderDistanceCapsule('));
  assert.doesNotMatch(render, /sb\.|localStorage|upsert|insert|update\(/);
});

// US 1.0 (N3/N10): the old board and hidden hub are gone. "La nostra settimana",
// Missioni and Eventi are the three links under the one Noi calendar.
test('Noi: the couple row stays centered, "La nostra settimana" owns the week, and destinations stay focused', () => {
  const bond = html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';
  // Il diario, ma pulito (15/11/2026): the couple row stays mounted (its avatars and
  // distance are still filled) but hidden; Noi opens on «I vostri giorni», whose
  // gear is the visible way to Settings.
  const head = bond.match(/<header class="noi-canonical-head noi-couple-head" hidden>[\s\S]*?<\/header>/)?.[0] || '';
  const dyHead = bond.match(/<header class="dy-hd">\s*<h2 class="dy-h2">I vostri <em>giorni<\/em><\/h2>[\s\S]*?<\/header>/)?.[0] || '';
  // La barra a goccia (20/11/2026): your character is the way to Settings (the gear left Noi).
  assert.match(dyHead, /<button type="button" class="dy-ib dy-me" data-dy-me onclick="go\('settings',\{nav:true\}\)" aria-label="Tu: profilo e impostazioni">/);
  assert.match(head, /id="pairAvatarFrancesco"><img alt="" hidden><span class="fallback"/);
  assert.match(head, /id="pairAvatarBeatrice"><img alt="" hidden><span class="fallback"/);
  assert.match(head, /id="noiCoupleCard" role="group" aria-label="Voi due, distanza e impostazioni"/);
  assert.match(head, /id="noiCoupleLink" data-us-distance-state="unknown"/);
  assert.match(head, /id="usSettingsEntry" onclick="go\('settings',\{nav:true\}\)"/);
  assert.ok(head.indexOf('id="noiCoupleCard"') < head.indexOf('id="usSettingsEntry"'), 'Settings lives inside the couple card');
  assert.match(app, /if\(profile\.role==='francesco'\)setAvatarSlot\('pairAvatarFrancesco',url\);/);
  assert.match(app, /if\(profile\.role==='beatrice'\)setAvatarSlot\('pairAvatarBeatrice',url\);/);
  assert.doesNotMatch(bond, /id="noiWeekBoard"|id="noiHub"|id="usCalendarEntry"|noi-hub-card/);
  const targets = [...bond.matchAll(/data-noi-open-link="([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepEqual(targets, [], 'Noi nuova (03/11/2026): no tiles, the calendar and the board');
  assert.match(app, /document\.querySelector\(`#usNoiV2 \[data-noi-open-link="\$\{from\}"\]`\)\?\.focus\(\{preventScroll:true\}\)/, 'closing a section focuses its link again');
});



test('Noi density: the one calendar comes first, then the board; no second hero', () => {
  const bond = html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';
  assert.ok(bond.indexOf('id="usNoiV2Content"') < bond.indexOf('id="usNoiBoard"'), 'the calendar sits above the board');
  assert.match(bond, /<h2 id="usNoiBoardTitle">Bacheca<\/h2>/);
  assert.doesNotMatch(bond, /data-noi-open-link/);
  assert.doesNotMatch(bond, /class="noi-week-board"|noi-hub-card--resonance/);
});

test('Quest → Sfida della settimana (03/11/2026): the weekly board and its actions are gone from the app', () => {
  assert.doesNotMatch(app, /sb\.rpc\('confirm_bond_quest'|sb\.rpc\('reroll_bond_quest'|sb\.rpc\('ensure_bond_week'/);
  const bond = html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';
  assert.doesNotMatch(bond, /id="questWeekBoard"|id="bondQuestList"/);
});

// ---------------------------------------------------------------- Settings

// Il diario, ma pulito (15/11/2026, mockup v4.1): Impostazioni is a page of the
// diary under the couple card; since 20/11/2026 five groups (Tu, Voi due with the
// distance in one place, App, Aiuto, Account with the two exits last). «Compagni» (the retired cat) and «Foto Home» left; every other control
// keeps its data-us-setting hook and its action.
const settingsPage = html.match(/<main id="settings"[\s\S]*?<\/main>/)?.[0] || '';
const scope = (name) => settingsPage.match(new RegExp(`<section class="dy-set-group" data-us-settings-scope="${name}"[\\s\\S]*?\\n      </section>`))?.[0] || '';
const settingsIn = (chunk) => [...chunk.matchAll(/data-us-setting="([a-z-]+)"/g)].map((m) => m[1]);

test('Settings: TU holds what is the actor\'s or this phone\'s, VOI what the couple shares', () => {
  assert.deepEqual(settingsIn(scope('tu')), ['character-shape', 'person-color', 'status', 'profile-photo', 'status-form']);
  assert.deepEqual(settingsIn(scope('voi')), ['relationship-date', 'together-mode', 'location', 'story-archive']);
  assert.deepEqual(settingsIn(scope('app')), ['notifications', 'feedback', 'app-lock', 'optimize-ricordi', 'widgets']);
  assert.deepEqual(settingsIn(scope('aiuto')), ['report', 'sync-status']);
  assert.deepEqual(settingsIn(scope('account')), ['plus', 'privacy', 'logout', 'leave-couple'], 'the two exits last');
  // The distance in one place: the row, the location that measures it, km or miles.
  assert.match(scope('voi'), /data-us-setting="together-mode"[\s\S]*data-us-switch="location"[\s\S]*data-us-distance-unit="km"/);
  assert.match(settingsPage, /<button type="button" class="dy-card dy-set-couple" id="usCoupleIdCard" data-us-setting="voi-due"/, 'the couple card opens «Voi due»');
  assert.ok(settingsPage.indexOf('id="usCoupleIdCard"') < settingsPage.indexOf('data-us-settings-scope="tu"'), 'the couple card sits on top');
  assert.match(scope('tu'), /<h3 class="dy-set-title" id="usSettingsTuTitle">Tu<\/h3>/);
  assert.match(scope('voi'), /<h3 class="dy-set-title" id="usSettingsVoiTitle">Voi due<\/h3>/);
  assert.match(scope('app'), /<h3 class="dy-set-title" id="usSettingsAppTitle">App<\/h3>/);
  assert.match(scope('aiuto'), /<h3 class="dy-set-title" id="usSettingsHelpTitle">Aiuto<\/h3>/);
  assert.match(scope('account'), /<h3 class="dy-set-title" id="usSettingsAccountTitle">Account<\/h3>/);
});

test('Settings: every control exists exactly once and keeps its existing action', () => {
  const all = settingsIn(settingsPage);
  assert.equal(new Set(all).size, all.length, 'no duplicated control');
  assert.deepEqual([...all].sort(), ['app-lock', 'character-shape', 'feedback', 'leave-couple', 'location', 'logout', 'notifications', 'optimize-ricordi', 'person-color', 'plus', 'privacy', 'profile-photo', 'relationship-date', 'report', 'status', 'status-form', 'story-archive', 'sync-status', 'together-mode', 'voi-due', 'widgets']);
  const settingsJs = read('settings.js');
  for (const name of all) assert.match(settingsJs, new RegExp(`if\\(name==='${name}'\\)`), `${name} is still handled`);
  for (const id of ['usRelationshipDateValue', 'usNotificationsValue', 'usLocationState', 'usFeedbackValue', 'usSyncValue', 'usStoryArchiveValue', 'usSettingsBuild', 'usSettingsVersion', 'usCoupleAvatars', 'usCoupleNames', 'usTogetherLine', 'usStatusFormValue', 'usStatusValue', 'usCharacterShapeValue', 'usDistanceValue', 'usDistanceKmTag', 'usNotificationsSwitch', 'usLocationSwitch', 'usFeedbackSwitch']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, id);
  }
  // The switches and the two segmented controls are wired once each.
  assert.deepEqual([...settingsPage.matchAll(/data-us-switch="([a-z-]+)"/g)].map((m) => m[1]), ['location', 'notifications', 'feedback']);
  assert.deepEqual([...settingsPage.matchAll(/data-us-aspetto="([a-z]+)"/g)].map((m) => m[1]), ['auto', 'chiaro', 'scuro']);
  assert.deepEqual([...settingsPage.matchAll(/data-us-distance-unit="([a-z]+)"/g)].map((m) => m[1]), ['km', 'mi']);
  assert.match(settingsJs, /function switchAction\(name\)\{\n  if\(name==='notifications'\)return toggleNotifications\(\);\n  if\(name==='location'\)return locationAction\(\);\n  if\(name==='feedback'\)return toggleFeedback\(\);/);
  assert.match(settingsJs, /window\.UsAspetto\?\.set\?\.\(btn\.dataset\.usAspetto\)/);
  // Retired with the redesign: the cat's switch and «Foto Home».
  assert.doesNotMatch(settingsPage, /data-us-setting="(maudit|home-photo|distance)"|<b>Compagni<\/b>|<b>Foto Home<\/b>/);
  assert.doesNotMatch(settingsJs, /homePhotoModal|toggleMaudit|distanceModal/);
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
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@capacitor/android', '@capacitor/app', '@capacitor/core', '@capacitor/haptics', '@capacitor/ios', '@capacitor/push-notifications', '@capawesome/capacitor-app-update', '@supabase/supabase-js', '@us/app-icon', '@us/app-lock', '@us/apple-signin', '@us/google-signin', '@us/photo-place', '@us/push-support', '@us/splash-theme', '@us/widget-bridge']); // Accedi con Apple (05/11/2026, iOS Store V1): local apple-signin plugin, iOS only; Mappa dei Ricordi (29/10/2026): local photo-place plugin; Icone dell'app (29/10/2026, Premi Sintonia V2): local app-icon plugin; Aggiornamento dell'app (29/10/2026, founder): Play in-app updates plugin; Accesso con Google (25/10/2026): local Credential Manager plugin; M15: iOS platform; Native Security V1: local app-lock plugin; Native Notifications V1: official push plugin + local push-support; 18/10/2026: local splash-theme plugin (Android splash follows the app theme)
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), ['@capacitor/cli', '@electric-sql/pglite', 'esbuild']);
});


test('Gioca density: played Per voi, game grid and weekly question use compact hub geometry', () => {
  const css = read('games.css');
  assert.match(css, /US-GIOCA-DENSITY-01/);
  assert.match(css, /#quiz \.us-gv2-pervoi\[data-gv2-state="played"\]\{[\s\S]*?min-height:64px/);
  assert.match(css, /US-GIOCA-V3/);
  assert.match(css, /#quiz \.us-gv2-game-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /#quiz \.us-gv2-game\.is-swipe\{[^}]*grid-column:1\/-1/, 'Swipe stands out without taking the page');
  assert.match(css, /#quiz \.us-gv2-weekly\.is-open\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) auto/);
  // La barra a goccia (20/11/2026): Ti penso is in the bar on Gioca too.
  assert.doesNotMatch(css, /body:has\(#quiz\.page\.active\) #thinkButton/);
});


// Il diario, ma pulito (15/11/2026): the mockup's measures, in diario.css with tokens only.
// Il diario, ma pulito (15/11/2026): the mockup's measures (58px rows on a hairline, 36px icon tiles, 13px group titles).
test('Settings density: utility rows, couple card and footer stay compact without changing controls', () => {
  const css = read('diario.css');
  assert.match(css, /\.dy-set \.dy-set-row\{display:flex;align-items:center;gap:12px;width:100%;min-height:58px;[^}]*border-bottom:1px solid var\(--us-ink-08\)/);
  assert.match(css, /\.dy-set-ic\{flex:none;width:36px;height:36px;border-radius:10px;/);
  assert.match(css, /\.dy-set \.dy-set-title\{margin:0 0 2px;font:800 var\(--us-text-13\)\/1\.3 var\(--us-font-ui\);letter-spacing:0;color:var\(--us-ink-60\)\}/);
  assert.match(css, /\.dy-set \.dy-set-couple\{[^}]*padding:16px;/);
  // Ink for what you do: the switch is ink when on, never a person colour.
  assert.match(css, /\.dy-sw\[aria-checked="true"\]::before,\[aria-checked="true"\]>\.dy-sw::before\{background:var\(--us-ink-100\)\}/);
  // Tokens only (dark mode follows); a person colour only on your dot.
  const block = css.slice(css.indexOf('/* ---------------------------------------------------------------- Impostazioni */'), css.indexOf('/* ================================================================ fogli */'));
  assert.doesNotMatch(block, /#[0-9a-f]{3,6}\b/i, 'no hard-coded colours');
  assert.deepEqual(block.match(/var\(--us-(tu|partner|rosa|lilla)\)/g), ['var(--us-tu)'], 'only the dot of «Il tuo colore»');
  assert.match(block, /\.dy-set-dot\{[^}]*background:var\(--us-tu\)/);
  // The Ti penso lives in the bar (barra a goccia): Settings keeps it, no hole in the bar.
  assert.doesNotMatch(read('settings2.css'), /body:has\(#settings\.page\.active\) #thinkButton\{\s*display:none!important;/);
  const page = html.match(/<main id="settings"[\s\S]*?<\/main>/)?.[0] || '';
  for (const name of ['profile-photo', 'notifications', 'location', 'feedback', 'sync-status', 'relationship-date', 'story-archive', 'together-mode']) {
    assert.match(page, new RegExp(`data-us-setting="${name}"`), name);
  }
});


// 1.0: the dock above the nav holds one evidence card and the Domanda di oggi;
// arbitration stays authoritative, the cards keep the mockup geometry (dc-oggi.css).
test('Oggi density: arbitration stays authoritative; the dock holds one evidence card and the daily card', () => {
  // Il diario, ma pulito (15/11/2026): the dock and the M9B card are mounted in the
  // hidden hero (their layout was pruned); the arbitration that fills them is unchanged,
  // and the notices of Oggi sit in an 8px column under the question (#dyMore, one page since 20/11/2026).
  assert.match(read('diario.css'), /\.dy-more\{flex:none;display:flex;flex-direction:column;gap:8px;/);
  const app = read('app.js');
  assert.match(app, /US_OGGI_SURFACES=Object\.freeze\(\['usTodayPriorityRegion','usDailyRitual','pushOptInCard','usOggiCalendarWidget','usDailyRevealLink'\]\)/);
  assert.match(app, /winner\.evidence===id\?'evidence':winner\.daily===id\?'daily':'suppressed'/);
});


test('shell: Ti penso lives in the bottom bar and Per voi stays inside Gioca', () => {
  // La barra a goccia (20/11/2026): Ti penso is the middle of the bottom bar; the header of Oggi keeps Lasciato per te.
  const top = html.match(/<header class="dy-head">[\s\S]*?<\/header>/)?.[0] || '';
  assert.match(html.match(/<nav class="dy-nav"[\s\S]*?<\/nav>/)?.[0] || '', /id="thinkButton"/);
  assert.match(top, /id="leftForYouPartnerEntry"/);
  assert.doesNotMatch(top, /usPerVoiTop/);
  assert.equal((html.match(/id="thinkButton"/g) || []).length, 1);
  // T1 1.0 — polish4.css is gone; the top-chrome rule lives in identity.css.
  assert.equal(fs.existsSync(path.join(ROOT, 'polish4.css')), false);
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
  // Mockup v5 «I fogli» (16/11/2026): the question of today is the one sheet of the diary.
  assert.match(read('index.html'), /<main id="today" class="dy-foglio"/);
});


test('state system: loading, empty, error, retry and connectivity share one visual authority', () => {
  const css = read('state-system.css');
  assert.match(css, /US-STATE-SYSTEM-01/);
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
  // Il diario, ma pulito (15/11/2026): the copy of the mockup v4.1.
  assert.match(read('fix4.js'), /showStatus\('Siete senza rete: quello che fate parte appena torna\.', 'offline'\)/);
});


test('PWA hardening: update navigation refreshes index and version checks do not leak timestamp cache keys', () => {
  const worker = read('service-worker.js');
  const fix = read('fix4.js');
  assert.match(worker, /const versionKey = new Request\("\/version\.json"\);/);
  assert.match(worker, /cache\.put\(versionKey, copy\)/);
  assert.doesNotMatch(worker, /cache\.put\(request, copy\)[\s\S]{0,180}version\.json/);
  assert.match(worker, /if \(url\.searchParams\.has\("us-refresh"\)\)/);
  // The refreshed document still lands in the shell, through the same-build guard.
  assert.match(worker, /if \(url\.searchParams\.has\("us-refresh"\)\)[\s\S]*?usCacheDocumentForThisBuild\(response\.clone\(\)\)/);
  assert.match(worker, /await cache\.put\("\/index\.html", response\)/);
  assert.match(fix, /refreshUrl\.searchParams\.set\('us-refresh', String\(Date\.now\(\)\)\)/);
  assert.match(fix, /window\.location\.replace\(refreshUrl\.href\)/);
  assert.match(fix, /currentUrl\.searchParams\.delete\('us-refresh'\)/);
});


test('Auth first-run: private entry is compact, device-aware and keeps backend ownership unchanged', () => {
  const auth = html.match(/<div class="auth-overlay" id="authOverlay">[\s\S]*?<div class="app">/)?.[0] || '';
  const css = read('auth-first-run.css');
  const firstRun = read('auth-first-run.js');
  const app = read('app.js');

  assert.match(css, /US-AUTH-FIRST-RUN-01/);
  assert.match(auth, /US · SPAZIO PRIVATO/);
  assert.match(auth, /Eccoti <em>di nuovo<\/em>/);
  assert.match(auth, /Accedi con la tua email e password\./);
  assert.match(auth, /id="usAuthInstall"/);
  assert.doesNotMatch(auth, /authPair|pairBtn|pairCode|Magic Link/);
  assert.match(app, /showAuthStep\('authLogin'\)/);
  assert.match(app, /Accedi per entrare in US\./);
  assert.match(app, /passwordEnter\.addEventListener\('keydown'/);

  assert.match(app, /sb\.auth\.signInWithPassword\(\{email,password\}\)/);
  assert.doesNotMatch(app, /claim_us_role|signInAnonymously|signInWithOtp|shouldCreateUser:false/);

  assert.match(firstRun, /beforeinstallprompt/);
  assert.match(firstRun, /event\.preventDefault\(\)/);
  assert.match(firstRun, /deferredInstallPrompt\.prompt\(\)/);
  assert.match(firstRun, /appinstalled/);
  assert.match(firstRun, /navigator\.standalone === true/);
  assert.match(auth, /Aggiungi alla schermata Home/);
});

test('Auth first-run: new assets follow the canonical BUILD_ID contract', () => {
  const build = html.match(/<meta name="us-build" content="([^"]+)"\/>/)?.[1];
  assert.ok(build);
  assert.match(html, new RegExp(`/auth-first-run\\.css\\?v=${build}`));
  assert.match(html, new RegExp(`/auth-first-run\\.js\\?v=${build}`));
  const worker = read('service-worker.js');
  assert.match(worker, /versioned\("\/auth-first-run\.css"\)/);
  assert.match(worker, /versioned\("\/auth-first-run\.js"\)/);
  assert.equal(JSON.parse(read('version.json')).version, build);
});


test('Pre-native polish: Settings has one explicit home inside the couple card and Home no longer shows distance', () => {
  const css = read('styles.css');
  const identity = read('identity.css');
  assert.match(css, /#bond \.noi-couple-card\{/);
  assert.match(css, /#bond \.noi-couple-card #usSettingsEntry\{/);
  assert.match(css, /right:8px;/);
  assert.match(css, /top:8px;/);
  // Il diario, ma pulito (15/11/2026): the distance pill sits in the hidden hero
  // (the distance is said by the sentence of the day), so its own hide rule was pruned.
  assert.match(html, /<section class="hero home-hero-only" id="homeHero"[^>]* hidden>[\s\S]*?id="distanceWidget"[\s\S]*?<\/section>/);
  assert.doesNotMatch(identity, /#home \.home-distance-pill\{/);
});
