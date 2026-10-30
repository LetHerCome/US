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

function hub(homeState) {
  const nodes = {};
  const node = (id) => (nodes[id] ||= {
    id, innerHTML: '', dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {}, removeAttribute() {}, addEventListener() {}, querySelector: () => null,
  });
  const window = { usProfile: { role: 'francesco' }, crypto: { randomUUID: () => 'r' }, go() {} };
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
    assert.match(tile, /<svg class="us-gv2-art" viewBox="0 0 44 44"/, 'the mockup art, not a Phosphor glyph');
    assert.match(tile, /data-gv2-mode-state="ready"[^>]*aria-label="[^"]+\. Disponibile"/, 'a ready card says it is available');
    assert.doesNotMatch(tile, /us-gv2-game-state/);
  }
  assert.doesNotMatch(html, /is-wide|us-gv2-deck/);
  assert.match(html, /<div class="us-gv2-game-grid" data-s>/);
  for (const gone of ['Quello che forse non sapete ancora', 'Stessa situazione, due sguardi', 'Scenari assurdi', 'Uno risponde, l’altro indovina', 'Lo stesso momento, due memorie', 'Scelte, futuri, possibilità']) {
    assert.doesNotMatch(html, new RegExp(gone));
  }
});

test('Gioca hub: no page header prose, no separate in-progress list, one week strip', async () => {
  // Round 3 parity (062): the week strip is the mockup's seven days (L … D);
  // the weekly limit is said in the confirm and on the tiles it locks.
  const html = await hub(homeOf({ allowance: allowance({ used: 1, free_used: 1, families: { ridete: { session_id: 'r', completed: true } } }),
    open_rounds: [{ id: 'o1', game_family: 'confrontatevi', item_count: 5, my_answered_count: 2 }] })).html();
  for (const gone of ['Scopritevi, giocando', 'Cinque domande alla volta', 'Un Per voi e due giochi a scelta', 'IN CORSO', 'SCEGLIETE VOI', 'Non scegliete. US ha preparato']) assert.doesNotMatch(html, new RegExp(gone));
  assert.match(html, /<h2 class="us-gv2-sr">Gioca<\/h2>/);
  assert.equal((html.match(/id="usGv2Week"/g) || []).length, 1, 'one week strip');
  assert.equal((html.match(/class="us-gv2-wd[ "]/g) || []).length, 7, 'seven days');
  assert.equal((html.match(/aria-current="date"/g) || []).length, 1, 'today, once');
  assert.doesNotMatch(html, /us-gv2-rhythm|QUESTA SETTIMANA|Ancora \d giochi/, 'no budget strip');
  assert.match(html, /data-gv2-family="confrontatevi" data-gv2-mode-state="open" data-gv2-session="o1" data-tone="progress"[\s\S]*?<small>2 di 5<\/small>/, 'an open round shows on its own card');
  assert.match(html, /data-gv2-family="ridete" data-gv2-mode-state="played"[\s\S]*?<small>Giocato questa settimana<\/small>/);
});

test('Gioca hub: a spent day stays compact and locks unplayed tiles until tomorrow', async () => {
  const html = await hub(homeOf({ per_voi: { state: 'played', session_id: 'p' },
    allowance: allowance({ used: 1, limit: 1, per_voi_used: 1, free_used: 1, free_limit: 1, per_voi_available: false, free_available: false, families: { per_voi: { session_id: 'p', completed: true } } }) })).html();
  assert.doesNotMatch(html, /Nuovi giochi domani/, 'the hub does not duplicate exhaustion prose; tiles carry the state');
  // Round 3 parity: no budget strip; a locked tile is dimmed and says when.
  assert.doesNotMatch(html, /Tutti giocati|us-gv2-rhythm/);
  assert.match(html, /data-gv2-family="scopritevi" data-gv2-mode-state="locked" aria-disabled="true" aria-label="Scopritevi: [^"]+\. Da domani"[\s\S]*?<small>Da domani<\/small>/);
});

test('Gioca hub: Per voi is one line of state plus one action', async () => {
  const expectations = { idle: ['5 domande scelte per voi', 'Inizia'], pending: ['Beatrice ha iniziato', 'Rispondi'], waiting: ['Aspetti Beatrice', 'Apri'], reveal_ready: ['Risposte pronte ♡', 'Scopri'], in_progress: ['A metà', 'Continua'] };
  for (const [state, [line, cta]] of Object.entries(expectations)) {
    const html = await hub(homeOf({ per_voi: { state, session_id: 's' } })).html();
    assert.match(html, new RegExp(`<b>Per voi</b><small>${line}</small></span>\\s*<span class="us-gv2-pervoi-cta">${cta}</span>`), state);
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


// D4 (28/10/2026): one round a day. The hub says how many are left today,
// under I vostri giochi, from the server's allowance.
const titleHint = (html) => html.match(/id="usGv2ChooseTitle">I vostri giochi<\/h3><small>([^<]*)<\/small>/)?.[1];
const day = (over = {}) => allowance({ period: 'day', resets_on: '2026-10-29', limit: 1, free_limit: 1, ...over });

test('Gioca hub: the title says one round is left today', async () => {
  assert.equal(titleHint(await hub(homeOf({ allowance: day() })).html()), '1 partita da giocare oggi');
});

test('Gioca hub: once the day is spent, the title says the next round is tomorrow', async () => {
  const spent = day({ used: 1, free_used: 1, per_voi_used: 1, free_available: false, per_voi_available: false });
  assert.equal(titleHint(await hub(homeOf({ allowance: spent })).html()), 'Domani un’altra partita');
});

test('Gioca hub: a larger daily allowance is counted', async () => {
  assert.equal(titleHint(await hub(homeOf({ allowance: day({ free_limit: 3, free_used: 1 }) })).html()), '2 partite da giocare oggi');
});

test('Gioca V4 hub: bento title keeps the low-friction hint', async () => {
  const html = await hub(homeOf()).html();
  assert.match(html, /<h3 class="us-gv2-section-title" id="usGv2ChooseTitle">I vostri giochi<\/h3><small>Bastano pochi minuti<\/small>/);
});
