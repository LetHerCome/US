// Gioca tile rework: the week is one strip; Per voi is one line of state plus
// one action. US V3: every game card is icon, name, the kind of moment and its
// real state (available, to continue, completed, locked), in one grid.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const tick = async (n = 6) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };

function hub(homeState, extraWindow = {}) {
  const nodes = {};
  const node = (id) => (nodes[id] ||= {
    id, innerHTML: '', dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {}, removeAttribute() {}, addEventListener() {}, querySelector: () => null,
  });
  const window = { usProfile: { role: 'francesco' }, crypto: { randomUUID: () => 'r' }, go() {}, ...extraWindow };
  const sandbox = {
    window,
    document: { readyState: 'complete', hidden: false, getElementById: node, addEventListener() {}, querySelector: () => ({ id: 'quiz' }) },
    sb: { rpc: async () => ({ data: homeState, error: null }) },
    toast() {}, FormData: class {}, console: { warn() {} }, setTimeout: () => 1, setInterval: () => 1,
  };
  node('quizHub'); node('usGameV2Panel'); node('usPerVoiTop');
  require('./helpers/identity-fixture').install(sandbox);
  vm.runInNewContext(read('games.js'), sandbox);
  return { nodes, html: async () => { await tick(); return nodes.quizHub.innerHTML; } };
}

const weekly = { week_start: '2026-09-28', next_unlock: '2026-10-05', assigned_role: 'francesco', next_role: 'beatrice', my_turn: false, created: false, created_by_me: false, partner_left_question: false, my_question: null };
const homeOf = (over = {}) => ({ my_role: 'francesco', partner_role: 'beatrice', weekly, per_voi: { state: 'idle' }, open_rounds: [], recent: [], ...over });
const allowance = (over = {}) => ({ week_start: '2026-09-28', resets_on: '2026-10-05', per_voi_used: 0, per_voi_limit: 1, free_used: 0, free_limit: 2, used: 0, limit: 3, per_voi_available: true, free_available: true, open_count: 0, open_limit: 3, families: {}, ...over });

test('Gioca tiles: a fresh week is six cards of icon, name, kind of moment and "Disponibile"', async () => {
  const html = await hub(homeOf({ allowance: allowance() })).html();
  const tiles = html.match(/<button type="button" (?:data-us-[a-z-]+(?:="[a-z]+")? )*class="us-gv2-game[^"]*" data-gv2-family="[a-z_]+"[\s\S]*?<\/button>/g) || [];
  // G7 1.0 — "E se…?" is no longer offered: Swipe plus five families.
  assert.equal(tiles.length, 5);
  assert.doesNotMatch(html, /data-gv2-family="e_se"/);
  for (const tile of tiles) {
    assert.match(tile, /class="us-gv2-glyph"/, 'each card leads with the icon chip');
    assert.match(tile, /<b>[^<]+<\/b><small>[^<]+<\/small>/, 'then its name and the kind of moment');
    // Round 3 parity (062): the mockup's tile is its art, name and kind; a
    // ready card says "Disponibile" to assistive tech, not with a badge.
    assert.match(tile, /<svg class="us-gv2-art" viewBox="0 0 48 48"/, 'the drawn mark (stile unico), not a Phosphor glyph');
    assert.doesNotMatch(tile, /us-gv2-stato/, 'a ready tile says nothing: no «Pronto»');
    assert.match(tile, /data-gv2-mode-state="ready"[^>]*aria-label="[^"]+\. Disponibile"/, 'a ready card says it is available');
    assert.doesNotMatch(tile, /us-gv2-game-state/);
  }
  assert.doesNotMatch(html, /is-wide|us-gv2-deck/);
  assert.match(html, /<div class="us-gv2-game-grid" data-s>/);
  for (const gone of ['Quello che forse non sapete ancora', 'Stessa situazione, due sguardi', 'Scenari assurdi', 'Uno risponde, l’altro indovina', 'Lo stesso momento, due memorie', 'Scelte, futuri, possibilità']) {
    assert.doesNotMatch(html, new RegExp(gone));
  }
});

// Redesign definitivo, fase 6 (D11, tavola «Gioca»): the tokens, «Vi aspetta»,
// then I vostri giochi; no week strip, no daily question, no weekly challenge.
test('Gioca hub (fase 6): tokens, then the games; no week strip, every tile one of three chips', async () => {
  const html = await hub(homeOf({ allowance: allowance({ used: 1, free_used: 1, families: { ridete: { session_id: 'r', completed: true } } }),
    open_rounds: [{ id: 'o1', game_family: 'confrontatevi', item_count: 5, my_answered_count: 2 }] })).html();
  for (const gone of ['Scopritevi, giocando', 'Cinque domande alla volta', 'IN CORSO', 'SCEGLIETE VOI', 'usGv2Week', 'us-gv2-wd', 'data-wc-slot', 'us-gv2-daycount', 'us-gv2-pervoi-cta']) assert.doesNotMatch(html, new RegExp(gone));
  assert.match(html, /<h2 class="us-gv2-sr">Gioca<\/h2>/);
  assert.ok(html.indexOf('id="usGv2Tokens"') < html.indexOf('us-gv2-choose'), 'the tokens first');
  assert.match(html, /data-gv2-family="confrontatevi" data-gv2-mode-state="open" data-gv2-chip="ready" data-gv2-session="o1" data-tone="progress"[\s\S]*?<\/svg><\/span><\/span>\s*<span class="us-gv2-game-copy"><b>Confrontatevi<\/b><small>2 di 5<\/small>/, 'an open round shows on its own card');
  assert.match(html, /data-gv2-family="ridete" data-gv2-mode-state="played" data-gv2-chip="played"[\s\S]*?Giocato<\/span>[\s\S]*?<small>questa settimana<\/small>/);
  const chips = [...html.matchAll(/data-gv2-chip="([a-z]+)"/g)].map((m) => m[1]);
  assert.equal(chips.length, 7, 'Per voi, five families, Questo o quello');
  assert.ok(chips.every((c) => ['ready', 'played', 'tomorrow'].includes(c)));
});

test('Gioca hub: a spent day locks unplayed tiles until tomorrow', async () => {
  const html = await hub(homeOf({ per_voi: { state: 'played', session_id: 'p' },
    allowance: allowance({ used: 1, limit: 1, per_voi_used: 1, free_used: 1, free_limit: 1, per_voi_available: false, free_available: false, families: { per_voi: { session_id: 'p', completed: true } } }) })).html();
  assert.doesNotMatch(html, /Nuove partite domani/, 'the hub does not duplicate exhaustion prose; tiles carry the state');
  assert.match(html, /data-gv2-family="scopritevi" data-gv2-mode-state="locked" data-gv2-chip="tomorrow" aria-disabled="true" aria-label="Scopritevi: [^"]+\. Da domani"[\s\S]*?Domani<\/span>[\s\S]*?<small>torna domani<\/small>/);
  assert.match(html, /id="usGv2ChooseTitle">I vostri giochi<\/h3><small>tornano domani<\/small>/);
});

test('Gioca hub: Per voi is the first tile, its line the server\'s state', async () => {
  const expectations = { idle: ['5 domande scelte per voi', 'ready'], pending: ['Beatrice ha iniziato', 'ready'], waiting: ['Aspetti Beatrice', 'played'], reveal_ready: ['Risposte pronte ♡', 'ready'], in_progress: ['A metà', 'ready'] };
  for (const [state, [line, chip]] of Object.entries(expectations)) {
    const html = await hub(homeOf({ per_voi: { state, session_id: 's' } })).html();
    const tile = html.match(/<button[^>]*data-gv2-action="per-voi"[\s\S]*?<\/button>/)?.[0] || '';
    assert.ok(html.indexOf(tile) < html.indexOf('data-gv2-family='), `${state}: first`);
    assert.match(tile, new RegExp(`data-gv2-chip="${chip}"[\\s\\S]*data-gv2-state="${state}"[\\s\\S]*<b>Per voi</b><small>${line}</small>`), state);
  }
});

test('Gioca CSS: tiles use the canonical tokens and the Noi chip recipe, never a new palette', () => {
  const css = read('games.css');
  assert.match(css, /\.us-gv2-glyph\{[^}]*width:40px;height:40px;border-radius:14px/);
  // US V3 — one two-column grid; nothing to discover by scrolling sideways.
  assert.match(css, /#quiz \.us-gv2-game-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css, /\.us-gv2-deck|\.us-gv2-game-grid\{[^}]*overflow-x/);
  assert.doesNotMatch(css, /:root\s*\{/, 'no palette of its own');
  assert.match(css, /var\(--us-radius-card\)/);
  assert.match(css, /var\(--us-accent-gradient\)/);
});


// D4 (28/10/2026), three a day since 13/11/2026, three tokens since fase 6
// (D11): one token per round of the day, lit while it is still there; at zero
// «Domani altre 3» with when they come back, and only there US Plus.
const tokens = (html) => html.match(/<section class="us-gv2-tokens"[\s\S]*?<\/section>/)?.[0] || '';
const lit = (html) => [...tokens(html).matchAll(/class="us-gv2-token( is-on)?"/g)].map((m) => Boolean(m[1]));
const day = (over = {}) => allowance({ period: 'day', resets_on: '2026-10-29', limit: 3, free_limit: 3, ...over });

test('Gioca hub: three tokens say how many rounds are left today', async () => {
  const html = await hub(homeOf({ allowance: day({ used: 1, free_used: 1 }) })).html();
  assert.match(tokens(html), /role="img" aria-label="2 gettoni su 3"/);
  assert.match(tokens(html), /<b>Ancora 2 su 3 oggi<\/b><small>Ogni partita nuova usa un gettone<\/small>/);
  assert.deepEqual(lit(html), [true, true, false]);
  assert.doesNotMatch(html, /data-gv2-action="plus-soon"/, 'no Plus row while rounds are left');
});

test('Gioca hub: at zero the tokens say tomorrow, when, and Plus is coming', async () => {
  const spent = day({ used: 3, free_used: 3, per_voi_used: 3, free_available: false, per_voi_available: false });
  const html = await hub(homeOf({ allowance: spent }), { UsPlusSoon: { open() {} } }).html();
  assert.match(tokens(html), /aria-label="Nessun gettone rimasto"/);
  assert.match(tokens(html), /<b>Domani altre 3<\/b><small>tra (poco|\d+ (ore|ora|minuti|minuto)[^<]*)<\/small>/);
  assert.deepEqual(lit(html), [false, false, false]);
  assert.match(tokens(html), /<b>Partite illimitate con US Plus<\/b><small>In arrivo<\/small><\/span><button type="button" data-us-feedback="tap" data-gv2-action="plus-soon">Avvisami<\/button>/);
});

test('Gioca hub: an older one-a-day server still reads well', async () => {
  const one = day({ limit: 1, free_limit: 1, used: 1, free_used: 1, free_available: false, per_voi_available: false });
  assert.match(tokens(await hub(homeOf({ allowance: one })).html()), /<b>Domani un’altra partita<\/b>/);
});

test('Gioca hub: no allowance yet, no tokens; the title keeps the low-friction hint', async () => {
  const html = await hub(homeOf()).html();
  assert.doesNotMatch(html, /us-gv2-tokens/);
  assert.match(html, /<h3 class="us-gv2-section-title" id="usGv2ChooseTitle">I vostri giochi<\/h3><small>bastano pochi minuti<\/small>/);
});

test('Gioca tokens: the time to midnight in Rome reads as hours and minutes', () => {
  const src = read('games.js');
  const slice = src.slice(src.indexOf('const DAY_ZONE'), src.indexOf('const TOKEN_HEART'));
  const ctx = vm.createContext({ Intl, Date, Math, Number, String, Object, RegExp });
  vm.runInContext(`${slice};this.resetLine=resetLine;this.romeMidnight=romeMidnight;`, ctx);
  assert.equal(ctx.romeMidnight('2026-11-25'), Date.parse('2026-11-24T23:00:00Z'), 'winter: UTC+1');
  assert.equal(ctx.romeMidnight('2026-07-02'), Date.parse('2026-07-01T22:00:00Z'), 'summer: UTC+2');
  assert.equal(ctx.resetLine('2026-11-25', Date.parse('2026-11-24T16:48:00Z')), 'tra 6 ore e 12 minuti');
  assert.equal(ctx.resetLine('2026-11-25', Date.parse('2026-11-24T22:00:00Z')), 'tra 1 ora');
  assert.equal(ctx.resetLine('2026-11-25', Date.parse('2026-11-24T22:20:00Z')), 'tra 40 minuti');
  assert.equal(ctx.resetLine('2026-11-25', Date.parse('2026-11-24T22:59:30Z')), 'tra poco');
});

test('Gioca: a new round flies a token instead of the confirm window (D11)', () => {
  const src = read('games.js');
  assert.doesNotMatch(src, /confirmSpend|Userete 1 delle|Userete la partita/);
  assert.match(src, /flyToken\(from\);\n  return startRound\(family\);/);
  assert.match(src, /flyToken\(from\);\n  return startSwipe\(\);/);
  assert.match(src, /if \(!allowance\(\) \|\| freeLeft\(\)\) flyToken\(from\);\n  return startRound\('per_voi'\);/);
  assert.match(src, /prefers-reduced-motion: reduce/, 'no flight with reduced motion: the token just goes out');
});
