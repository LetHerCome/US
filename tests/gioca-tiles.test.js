// Gioca tile rework: a tile is icon, name and (only when there is one) a state;
// the week is one strip; Per voi is one line of state plus one action.
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
  vm.runInNewContext(read('games.js'), sandbox);
  return { nodes, html: async () => { await tick(); return nodes.quizHub.innerHTML; } };
}

const weekly = { week_start: '2026-09-28', next_unlock: '2026-10-05', assigned_role: 'francesco', next_role: 'beatrice', my_turn: false, created: false, created_by_me: false, partner_left_question: false, my_question: null };
const homeOf = (over = {}) => ({ my_role: 'francesco', partner_role: 'beatrice', weekly, per_voi: { state: 'idle' }, open_rounds: [], recent: [], ...over });
const allowance = (over = {}) => ({ week_start: '2026-09-28', resets_on: '2026-10-05', per_voi_used: 0, per_voi_limit: 1, free_used: 0, free_limit: 2, used: 0, limit: 3, per_voi_available: true, free_available: true, open_count: 0, open_limit: 3, families: {}, ...over });

test('Gioca tiles: a fresh week is six tiles of icon and name, with no taglines or state lines', async () => {
  const html = await hub(homeOf({ allowance: allowance() })).html();
  const tiles = html.match(/<button type="button" (?:data-us-[a-z-]+(?:="[a-z]+")? )*class="us-gv2-mode[^"]*" data-gv2-family="[a-z_]+"[\s\S]*?<\/button>/g) || [];
  assert.equal(tiles.length, 6);
  for (const tile of tiles) {
    assert.match(tile, /class="us-gv2-glyph"/, 'each tile leads with the icon chip');
    assert.match(tile, /<b>[^<]+<\/b>/, 'and carries its name');
    assert.doesNotMatch(tile, /<small/, 'a ready tile has no state line');
  }
  // HUMAN-UI-02 — the six tiles are one horizontal deck: no tile spans a row any more.
  assert.doesNotMatch(html, /is-wide/);
  assert.match(html, /<div class="us-gv2-mode-grid us-gv2-deck">/);
  for (const gone of ['Quello che forse non sapete ancora', 'Stessa situazione, due sguardi', 'Scenari assurdi', 'Uno risponde, l’altro indovina', 'Lo stesso momento, due memorie', 'Scelte, futuri, possibilità']) {
    assert.doesNotMatch(html, new RegExp(gone));
  }
});

test('Gioca hub: no page header prose, no separate in-progress list, one week strip', async () => {
  const html = await hub(homeOf({ allowance: allowance({ used: 1, free_used: 1, families: { ridete: { session_id: 'r', completed: true } } }),
    open_rounds: [{ id: 'o1', game_family: 'e_se', item_count: 5, my_answered_count: 2 }] })).html();
  for (const gone of ['Scopritevi, giocando', 'Cinque domande alla volta', 'Un Per voi e due giochi a scelta', 'IN CORSO', 'SCEGLIETE VOI', 'Non scegliete. US ha preparato']) assert.doesNotMatch(html, new RegExp(gone));
  assert.match(html, /<h2>Gioca<\/h2>/);
  assert.match(html, /QUESTA SETTIMANA/);
  assert.match(html, /<b>2 rimasti<\/b>/);
  assert.match(html, /data-gv2-family="e_se" data-gv2-mode-state="open"[\s\S]*?<small class="us-gv2-mode-state">2 di 5<\/small>/, 'an open round shows on its own tile');
  assert.match(html, /data-gv2-family="ridete" data-gv2-mode-state="played"[\s\S]*?us-gv2-icon" data-gv2-icon="check"/);
  assert.equal((html.match(/us-gv2-rhythm"/g) || []).length, 1);
});

test('Gioca hub: a spent week stays compact and locks unplayed tiles with an icon', async () => {
  const html = await hub(homeOf({ per_voi: { state: 'played', session_id: 'p' },
    allowance: allowance({ used: 3, per_voi_used: 1, free_used: 2, per_voi_available: false, free_available: false, families: { per_voi: { session_id: 'p', completed: true } } }) })).html();
  assert.doesNotMatch(html, /Nuovi giochi lunedì/, 'the hub does not duplicate exhaustion prose; tiles carry the state');
  assert.match(html, /<b>0 rimasti<\/b>/, 'the top-right strip says how many games are actually still available');
  assert.match(html, /data-gv2-family="scopritevi" data-gv2-mode-state="locked" aria-disabled="true"[\s\S]*?data-gv2-icon="lock-simple"/);
  assert.match(html, /<small class="us-gv2-mode-state"><span class="us-gv2-icon" data-gv2-icon="lock-simple" aria-hidden="true"><\/span>Lunedì<\/small>/);
});

test('Gioca hub: Per voi is one line of state plus one action', async () => {
  const expectations = { idle: ['5 domande scelte per voi', 'Inizia'], pending: ['Bea ha iniziato', 'Rispondi'], waiting: ['Aspettiamo Bea', 'Apri'], reveal_ready: ['Risposte pronte ♡', 'Scopri'], in_progress: ['A metà', 'Continua'] };
  for (const [state, [line, cta]] of Object.entries(expectations)) {
    const html = await hub(homeOf({ per_voi: { state, session_id: 's' } })).html();
    assert.match(html, new RegExp(`<b>Per voi</b><small>${line}</small></span><span class="us-gv2-pervoi-cta">${cta}</span>`), state);
  }
});

test('Gioca CSS: tiles use the canonical tokens and the Noi chip recipe, never a new palette', () => {
  const css = read('games.css');
  assert.match(css, /\.us-gv2-glyph\{[^}]*width:40px;height:40px;border-radius:14px/);
  // HUMAN-UI-02 — the modes are a horizontal deck of small portrait cards.
  assert.match(css, /\.us-gv2-deck\{display:flex;[^}]*overflow-x:auto/);
  assert.match(css, /\.us-gv2-mode\{flex:0 0 auto;width:132px;/);
  assert.doesNotMatch(css, /\.us-gv2-mode-grid\{display:grid/);
  assert.doesNotMatch(css, /:root\s*\{/, 'no palette of its own');
  assert.match(css, /var\(--us-radius-card\)/);
  assert.match(css, /var\(--us-accent-gradient\)/);
});


test('Gioca hub: a fresh hub explains the low-friction entry without adding authority', async () => {
  const html = await hub(homeOf()).html();
  assert.match(html, /class="us-gv2-entry-note">Scegliete un gioco\. Bastano pochi minuti\.<\/p>/);
});
