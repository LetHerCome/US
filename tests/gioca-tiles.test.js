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
  const all = html.slice(html.indexOf('class="us-gv2-all"'));
  const tiles = all.match(/<button type="button" (?:data-us-[a-z-]+(?:="[a-z]+")? )*class="us-gv2-game[^"]*" data-gv2-family="[a-z_]+"[\s\S]*?<\/button>/g) || [];
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
  // La giostra (25/11/2026): the cards ride one sideways track that snaps to the middle.
  assert.match(html, /<div class="us-gv2-giostra" data-s>\s*<div class="us-gv2-giostra-track" role="group" aria-roledescription="carosello"/);
  for (const gone of ['Quello che forse non sapete ancora', 'Stessa situazione, due sguardi', 'Scenari assurdi', 'Uno risponde, l’altro indovina', 'Lo stesso momento, due memorie', 'Scelte, futuri, possibilità']) {
    assert.doesNotMatch(html, new RegExp(gone));
  }
});

// Redesign definitivo, fase 6 (D11, tavola «Gioca»): the tokens, «Vi aspetta»,
// then I vostri giochi; no week strip, no daily question, no weekly challenge.
test('Gioca hub (fase 6): tokens, then the games; no week strip, every tile one of three chips', async () => {
  const html = await hub(homeOf({ allowance: allowance({ used: 1, free_used: 1, families: { ridete: { session_id: 'r', completed: true } } }),
    open_rounds: [{ id: 'o1', game_family: 'confrontatevi', item_count: 5, my_answered_count: 2 }] })).html();
  const all = html.slice(html.indexOf('class="us-gv2-all"'));
  for (const gone of ['Scopritevi, giocando', 'Cinque domande alla volta', 'IN CORSO', 'SCEGLIETE VOI', 'usGv2Week', 'us-gv2-wd', 'data-wc-slot', 'us-gv2-daycount', 'us-gv2-pervoi-cta']) assert.doesNotMatch(html, new RegExp(gone));
  assert.match(html, /<h2 class="us-gv2-sr">Gioca<\/h2>/);
  assert.ok(html.indexOf('id="usGv2Tokens"') < html.indexOf('us-gv2-choose'), 'the tokens first');
  assert.match(all, /data-gv2-family="confrontatevi" data-gv2-mode-state="open" data-gv2-chip="ready" data-gv2-session="o1" data-tone="progress"[\s\S]*?<\/svg><\/span><\/span>\s*<span class="us-gv2-game-copy"><b>Confrontatevi<\/b><small>2 di 5<\/small>/, 'an open round shows on its own card');
  assert.match(all, /data-gv2-family="ridete" data-gv2-mode-state="played" data-gv2-chip="played"[\s\S]*?Giocato<\/span>[\s\S]*?<small>questa settimana<\/small>/);
  const chips = [...html.matchAll(/data-gv2-chip="([a-z]+)"/g)].map((m) => m[1]);
  assert.equal(chips.length, 8, 'the giostra (Per voi, the game of the day, Questo o quello), then five tiles');
  assert.ok(chips.every((c) => ['ready', 'played', 'tomorrow'].includes(c)));
});

test('Gioca hub: a spent day locks unplayed tiles until tomorrow', async () => {
  const html = await hub(homeOf({ per_voi: { state: 'played', session_id: 'p' },
    allowance: allowance({ used: 1, limit: 1, per_voi_used: 1, free_used: 1, free_limit: 1, per_voi_available: false, free_available: false, families: { per_voi: { session_id: 'p', completed: true } } }) })).html();
  assert.doesNotMatch(html, /Nuove partite domani/, 'the hub does not duplicate exhaustion prose; tiles carry the state');
  assert.match(html, /data-gv2-family="scopritevi" data-gv2-mode-state="locked" data-gv2-chip="tomorrow" aria-disabled="true" aria-label="Scopritevi: [^"]+\. Da domani"[\s\S]*?Domani<\/span>[\s\S]*?<small>torna domani<\/small>/);
  assert.match(html, /id="usGv2ChooseTitle">Oggi per voi<\/h3><small>tornano domani<\/small>/);
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
  assert.match(html, /<h3 class="us-gv2-section-title" id="usGv2ChooseTitle">Oggi per voi<\/h3><small>scorri e scegli<\/small>/);
  assert.match(html, /id="usGv2AllTitle">Tutti i giochi<\/h3><small>bastano pochi minuti<\/small>/);
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
  // 25/11/2026: it flies only when the server can open a round (one left and
  // room for another open round), and the count drops only on resumed === false.
  assert.match(src, /if \(canSpend\(\)\) flyToken\(from\);\n  return startRound\(family, from\);/);
  assert.match(src, /if \(canSpend\(\)\) flyToken\(from\);\n  return startSwipe\(from\);/);
  assert.match(src, /if \(canSpend\(\)\) flyToken\(from\);\n  return startRound\('per_voi', from\);/);
  assert.match(src, /if \(a && state\?\.resumed === false\)/);
  // 28/11/2026 (founder: «inizio un gioco, non viene, se ne va il gettone»): opened only
  // while Gioca is on screen, «Apro…» on the card meanwhile, the hub read again after any failure.
  assert.match(src, /settleToken\(data\);\n  if \(inGioca\(\)\) await present\(data\);\n  load\(\);/);
  assert.match(src, /opening\(from, true\);/);
  assert.doesNotMatch(src, /if \(\/weekly\|too many open rounds\/\.test\(msg\)\) load\(\);/);
  assert.match(src, /prefers-reduced-motion: reduce/, 'no flight with reduced motion: the token just goes out');
});

// 25/11/2026 (founder: «i gettoni non vengono utilizzati quando parte un
// gioco»): the server spent the token, but the hub kept saying «Ancora 3 su 3»
// and lit the token again on closing the round, until the next read. A round
// the server really opened (resumed: false) drops the count at once and the
// hub is read again; a resumed round spends nothing.
function startHarness({ resumed }) {
  const nodes = {};
  const node = (id) => (nodes[id] ||= {
    id, innerHTML: '', outerHTML: '', dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {}, removeAttribute() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
  });
  const calls = [];
  let used = 0;
  const home = () => homeOf({ allowance: allowance({ free_used: used, free_limit: 3, used, limit: 3, free_available: used < 3, open_count: 0 }) });
  const session = { id: 's1', game_family: 'ridete', my_complete: false, reveal_ready: false, items: [{ id: 'i1', question_text: 'Q', answer_kind: 'open', my_answer_text: null }] };
  const window = { usProfile: { role: 'francesco' }, crypto: { randomUUID: () => 'r' }, go() {} };
  const sandbox = {
    window,
    document: { readyState: 'complete', hidden: false, getElementById: node, addEventListener() {}, querySelector: () => ({ id: 'quiz' }), querySelectorAll: () => [] },
    sb: { rpc: async (name) => {
      calls.push(name);
      if (name === 'start_game_round') { if (!resumed) used += 1; return { data: { ...session, resumed }, error: null }; }
      if (name === 'get_game_session') return { data: session, error: null };
      return { data: home(), error: null };
    } },
    toast() {}, FormData: class {}, console: { warn() {} }, setTimeout: () => 1, setInterval: () => 1,
  };
  node('quizHub'); node('usGameV2Panel'); node('usPerVoiTop'); node('usGv2Tokens');
  require('./helpers/identity-fixture').install(sandbox);
  vm.runInNewContext(read('games.js'), sandbox);
  return { nodes, calls, window };
}

test('Gioca tokens: a round the server opens drops the count at once and reads the hub again', async () => {
  const h = startHarness({ resumed: false });
  await tick();
  assert.match(h.nodes.quizHub.innerHTML, /aria-label="3 gettoni su 3"/);
  await h.window.USGameV2.chooseMode('ridete');
  await tick();
  assert.match(h.nodes.usGv2Tokens.outerHTML, /aria-label="2 gettoni su 3"/, 'the token row says 2 before any new read');
  assert.match(h.nodes.usGv2Tokens.outerHTML, /<b>Ancora 2 su 3 oggi<\/b>/);
  assert.equal(h.calls.filter((c) => c === 'get_game_v2_home').length, 2, 'the hub is read again behind the sheet');
  h.window.USGameV2.showHub();
  await tick();
  assert.match(h.nodes.quizHub.innerHTML, /aria-label="2 gettoni su 3"/, 'closing the round never lights the spent token again');
});

test('Gioca tokens: a resumed round spends nothing', async () => {
  const h = startHarness({ resumed: true });
  await tick();
  await h.window.USGameV2.chooseMode('ridete');
  await tick();
  assert.match(h.nodes.usGv2Tokens.outerHTML, /aria-label="3 gettoni su 3"/, 'the token that flew is lit again');
});

// 25/11/2026 (founder: «non tutti a carosello… alcuni a carosello e gli altri
// come prima»): the giostra is Per voi, «Il gioco di oggi» and Questo o quello;
// the game of the day is one family, the same all day, the next one tomorrow.
test('Gioca giostra: Per voi, the game of the day, Questo o quello; the tiles stay below', async () => {
  const at = async (day) => {
    const html = await hub(homeOf({ allowance: allowance({ day }) })).html();
    const track = html.match(/<div class="us-gv2-giostra-track"[\s\S]*?<div class="us-gv2-giostra-dots"/)?.[0] || '';
    return { html, track, slides: [...track.matchAll(/data-gv2-slide="([a-z_]+)"/g)].map((m) => m[1]) };
  };
  const a = await at('2026-11-25');
  assert.deepEqual(a.slides, ['per_voi', 'ridete', 'swipe']);
  assert.match(a.track, /<span class="us-gv2-carta-badge" aria-hidden="true">Il gioco di oggi<\/span>/);
  assert.equal((a.track.match(/us-gv2-carta-badge/g) || []).length, 1);
  assert.match(a.track, /<span class="us-gv2-carta-cta" data-cost="true">Gioca<span class="us-gv2-costo"/);
  assert.deepEqual((await at('2026-11-26')).slides, ['per_voi', 'quanto_mi_conosci', 'swipe'], 'tomorrow, the next one');
  const all = a.html.slice(a.html.indexOf('class="us-gv2-all"'));
  assert.doesNotMatch(all, /data-gv2-slide|us-gv2-carta-desc|us-gv2-carta-cta/, 'the tiles are the ones from before');
  assert.doesNotMatch(all, /us-gv2-genre/, 'five games: one grid, no genre titles yet');
});

// More games later: past six question games «Tutti i giochi» splits by kind of
// moment, so the list never turns into a heap (founder, 25/11/2026).
test('Gioca: past six question games the tiles split by genre, each with its title', async () => {
  const more = "  { id: 'indovinate', name: 'Indovinate', icon: 'x', kind: 'Prova', genre: 'conoscervi' },\n  { id: 'cantate', name: 'Cantate', icon: 'x', kind: 'Prova', genre: 'ridere' },\n  { id: 'e_se'";
  const src = read('games.js').replace("  { id: 'e_se'", more);
  assert.notEqual(src, read('games.js'));
  const nodes = {};
  const node = (id) => (nodes[id] ||= { id, innerHTML: '', dataset: {}, classList: { add() {}, remove() {}, contains: () => false }, setAttribute() {}, removeAttribute() {}, addEventListener() {}, querySelector: () => null });
  const sandbox = {
    window: { usProfile: { role: 'francesco' }, crypto: { randomUUID: () => 'r' }, go() {} },
    document: { readyState: 'complete', hidden: false, getElementById: node, addEventListener() {}, querySelector: () => ({ id: 'quiz' }) },
    sb: { rpc: async () => ({ data: homeOf({ allowance: allowance({ day: '2026-11-25' }) }), error: null }) },
    toast() {}, FormData: class {}, console: { warn() {} }, setTimeout: () => 1, setInterval: () => 1,
  };
  node('quizHub'); node('usGameV2Panel'); node('usPerVoiTop');
  require('./helpers/identity-fixture').install(sandbox);
  vm.runInNewContext(src, sandbox);
  await tick();
  const all = nodes.quizHub.innerHTML.slice(nodes.quizHub.innerHTML.indexOf('class="us-gv2-all"'));
  const titles = [...all.matchAll(/<h4 class="us-gv2-genre-title">([^<]+)<\/h4>/g)].map((m) => m[1]);
  assert.deepEqual(titles, ['Per conoscervi', 'Per parlarvi', 'Per ridere', 'Per ricordare']);
  const first = all.slice(all.indexOf('Per conoscervi'), all.indexOf('Per parlarvi'));
  assert.deepEqual([...first.matchAll(/data-gv2-family="([a-z_]+)"/g)].map((m) => m[1]), ['scopritevi', 'quanto_mi_conosci', 'indovinate']);
});
