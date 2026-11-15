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
  // Il diario, ma pulito (15/11/2026): «Da giocare» is a list of rows (button.dy-game):
  // a square black icon, the name, the kind of moment and a status tag.
  const tiles = html.match(/<button type="button" (?:data-us-[a-z-]+(?:="[a-z]+")? )*class="dy-game" data-gv2-family="[a-z_]+"[\s\S]*?<\/button>/g) || [];
  // G7 1.0 — "E se…?" is no longer offered: Swipe plus five families.
  assert.equal(tiles.length, 5);
  assert.doesNotMatch(html, /data-gv2-family="e_se"/);
  for (const tile of tiles) {
    assert.match(tile, /<span class="dy-ib is-dark dy-game-ic" aria-hidden="true"><svg viewBox="0 0 24 24"/, 'each row leads with its icon');
    assert.match(tile, /<span class="dy-game-copy"><b>[^<]+<\/b><small>[^<]+<\/small><\/span>/, 'then its name and the kind of moment');
    assert.match(tile, /data-gv2-mode-state="ready"[^>]*aria-label="[^"]+\. Disponibile"/, 'a ready row says it is available');
    assert.match(tile, /<span class="dy-tag dy-tag-s dy-game-tag"[^>]*>da giocare<\/span>/);
  }
  assert.doesNotMatch(html, /is-wide|us-gv2-deck/);
  assert.match(html, /<div class="dy-game-list">/);
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
  // Il diario, ma pulito (15/11/2026): the page title is the header «Giochi a due»;
  // the week strip is gone; an open round says its progress in its row's tag.
  assert.match(html, /<header class="dy-hd"><h2 class="dy-h2">Giochi <em>a due<\/em><\/h2>/);
  assert.doesNotMatch(html, /id="usGv2Week"|class="us-gv2-wd[ "]/, 'no week strip');
  assert.doesNotMatch(html, /us-gv2-rhythm|QUESTA SETTIMANA|Ancora \d giochi/, 'no budget strip');
  assert.match(html, /data-gv2-family="confrontatevi" data-gv2-mode-state="open" data-gv2-session="o1" data-tone="progress"[\s\S]*?<span class="dy-tag dy-tag-s dy-game-tag"[^>]*>2 di 5<\/span>/, 'an open round shows on its own row');
  assert.match(html, /data-gv2-family="ridete" data-gv2-mode-state="played"[\s\S]*?<small>Giocato questa settimana<\/small>/);
});

test('Gioca hub: a spent day stays compact and locks unplayed tiles until tomorrow', async () => {
  const html = await hub(homeOf({ per_voi: { state: 'played', session_id: 'p' },
    allowance: allowance({ used: 1, limit: 1, per_voi_used: 1, free_used: 1, free_limit: 1, per_voi_available: false, free_available: false, families: { per_voi: { session_id: 'p', completed: true } } }) })).html();
  assert.doesNotMatch(html, /Nuove partite domani/, 'the hub does not duplicate exhaustion prose; tiles carry the state');
  // Round 3 parity: no budget strip; a locked tile is dimmed and says when.
  assert.doesNotMatch(html, /Tutti giocati|us-gv2-rhythm/);
  assert.match(html, /data-gv2-family="scopritevi" data-gv2-mode-state="locked" aria-disabled="true" aria-label="Scopritevi: [^"]+\. Da domani"[\s\S]*?<small>Da domani<\/small>/);
});

test('Gioca hub: Per voi is one line of state plus one action', async () => {
  // Il diario, ma pulito (15/11/2026): Per voi is a row like the games; its action
  // is the status tag (tocca a te / risposte pronte in their colours, else the action).
  const expectations = { idle: ['5 domande scelte per voi', 'inizia'], pending: ['Beatrice ha iniziato', 'tocca a te'], waiting: ['Aspetti Beatrice', 'apri'], reveal_ready: ['Risposte pronte ♡', 'risposte pronte'], in_progress: ['A metà', 'continua'] };
  for (const [state, [line, cta]] of Object.entries(expectations)) {
    const html = await hub(homeOf({ per_voi: { state, session_id: 's' } })).html();
    assert.match(html, new RegExp(`<b>Per voi</b><small>${line}</small></span>\\s*<span class="dy-tag dy-tag-s dy-game-tag"[^>]*>${cta}</span>`), state);
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


// D4 (28/10/2026), three a day since 13/11/2026: the hub counts the rounds
// left today under I vostri giochi, from the server's allowance, with one dot
// per round of the day.
// Il diario, ma pulito (15/11/2026): the count is the honey tag of the header
// («N su 3 oggi», «Domani si rigioca»); the dots are gone.
const titleHint = (html) => html.match(/<header class="dy-hd">[\s\S]*?<span class="dy-tag"[^>]*data-gv2-left="\d+">([^<]*)<\/span><\/header>/)?.[1];
const dots = (html) => [...(html.match(/class="us-gv2-daycount-dots"[^>]*>(.*?)<\/span>/s)?.[1] || '').matchAll(/data-on="(true|false)"/g)].map((m) => m[1] === 'true');
const day = (over = {}) => allowance({ period: 'day', resets_on: '2026-10-29', limit: 3, free_limit: 3, ...over });

test('Gioca hub: the counter says how many of the three rounds are left today', async () => {
  const html = await hub(homeOf({ allowance: day({ used: 1, free_used: 1 }) })).html();
  assert.equal(titleHint(html), '2 su 3 oggi');
  assert.deepEqual(dots(html), [], 'no dots');
  assert.doesNotMatch(html, /data-gv2-action="plus-soon"/, 'no Plus row while rounds are left');
});

test('Gioca hub: once the day is spent, the counter says tomorrow and Plus is coming', async () => {
  {
    const spent = day({ used: 3, free_used: 3, per_voi_used: 3, free_available: false, per_voi_available: false });
    const html = await hub(homeOf({ allowance: spent }), { UsPlusSoon: { open() {} } }).html();
    assert.equal(titleHint(html), 'Domani si rigioca');
    assert.deepEqual(dots(html), [], 'no dots');
    assert.match(html, /data-gv2-action="plus-soon"[^>]*>.*Partite illimitate con US Plus.*In arrivo · Avvisami/s);
  }
});

test('Gioca hub: an older one-a-day server still reads well', async () => {
  const one = day({ limit: 1, free_limit: 1, used: 1, free_used: 1, free_available: false, per_voi_available: false });
  // Il diario, ma pulito (15/11/2026): one wording for every limit.
  assert.equal(titleHint(await hub(homeOf({ allowance: one })).html()), 'Domani si rigioca');
});

test('Gioca V4 hub: bento title keeps the low-friction hint', async () => {
  const html = await hub(homeOf()).html();
  // Il diario, ma pulito (15/11/2026): the section is «Da giocare»; with no allowance
  // from the server the header shows no count at all.
  assert.match(html, /<div class="dy-sec-head"><h3 id="usGv2ChooseTitle">Da giocare<\/h3><\/div>/);
  assert.match(html, /<header class="dy-hd"><h2 class="dy-h2">Giochi <em>a due<\/em><\/h2><\/header>/);
});
