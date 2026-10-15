// Gioca 1.0 (audit items G2, G3, G4, G7, G9) — games.js runs in a vm with the
// server answers faked; Sintonia items (S2, S5, S8, S10, T1) are checked on
// the sources they live in.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const tick = async (n = 8) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };

function el(id) {
  const listeners = new Map();
  const classes = new Set(id === 'usGameV2Panel' ? ['hidden'] : []);
  const attrs = {};
  return {
    id, innerHTML: '', value: '', dataset: {}, disabled: false, hidden: false, query: {},
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    setAttribute: (k, v) => { attrs[k] = String(v); }, removeAttribute: (k) => { delete attrs[k]; }, getAttribute: (k) => attrs[k] ?? null,
    addEventListener: (event, fn) => listeners.set(event, fn),
    querySelector(selector) { return this.query[selector] ?? null; }, querySelectorAll: () => [],
    fire: (event, data) => listeners.get(event)?.(data),
  };
}

const weekly = (over = {}) => ({ week_start: '2026-10-12', next_unlock: '2026-10-19', assigned_role: 'francesco', next_role: 'beatrice', my_turn: false, created: false, created_by_me: false, partner_left_question: false, my_question: null, ...over });
const home = (over = {}) => ({ my_role: 'francesco', partner_role: 'beatrice', weekly: weekly(), per_voi: { state: 'idle' }, open_rounds: [], recent: [], ...over });
const item = (over = {}) => ({
  id: 'i1', position: 1, question_text: 'Weekend ideale?', answer_kind: 'choice', options: ['Mare', 'Montagna'], mechanic: 'reciprocal', family: 'scopritevi',
  my_item_role: 'mutual', my_prompt: 'Weekend ideale?', subject_role: null, context: {},
  my_answer_text: null, my_answer_index: 0, partner_answer_text: null, partner_answer_index: 1, prediction_matched: null, ...over,
});
const session = (over = {}) => ({ id: 's1', game_family: 'scopritevi', engine_version: 2, started_by_role: 'francesco', my_role: 'francesco', my_complete: true, partner_complete: true, reveal_ready: true, completed_at: 'now', my_reveal_seen_at: 'before', items: [item()], ...over });

function harness({ homeState = home(), handlers = {}, extra = {} } = {}) {
  const nodes = Object.fromEntries(['quizHub', 'usGameV2Panel', 'usPerVoiTop', 'usGv2Answer', 'usGv2Error'].map((k) => [k, el(k)]));
  const calls = [];
  const base = {
    get_game_v2_home: () => homeState,
    get_game_session: () => session(),
    mark_game_session_reveal_seen: (args) => ({ id: args.target_session_id, my_reveal_seen_at: 'now' }),
    ...handlers,
  };
  const window = { usProfile: { role: 'francesco', couple_id: 'ignored' }, crypto: { randomUUID: () => 'req-1' }, sendWebPushEvent: () => Promise.resolve(), go: () => {}, UsFeedback: {}, ...extra };
  const sandbox = {
    window,
    document: { readyState: 'complete', hidden: false, getElementById: (k) => nodes[k] || null, addEventListener() {}, querySelector: () => ({ id: 'quiz' }) },
    sb: { rpc: async (name, args) => { calls.push([name, args]); try { return { data: await base[name]?.(args), error: null }; } catch (error) { return { data: null, error }; } } },
    toast: () => {}, FormData: class {}, console: { warn() {} },
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 1; }, setInterval: () => 1,
  };
  require('./helpers/identity-fixture').install(sandbox);
  vm.runInNewContext(read('games.js'), sandbox);
  return { api: window.USGameV2, nodes, calls, window };
}

test('G2: a result shows every answer at once, then one move: talk tonight, leave something, Ti penso', async () => {
  const opened = []; const thought = [];
  const h = harness({
    handlers: { get_game_session: () => session({ items: [item(), item({ id: 'i2', position: 2, question_text: 'Colazione?', my_prompt: 'Colazione?', options: ['Letto', 'Bar'], partner_answer_index: 0 })] }) },
    extra: { UsLeftForYou: { openComposer: (...args) => opened.push(args) }, sendThinkSignal: async () => { thought.push(1); return true; } },
  });
  await tick();
  await h.api.openSession('s1');
  await tick();
  const panel = h.nodes.usGameV2Panel.innerHTML;
  assert.doesNotMatch(panel, /<details|<summary/, 'nothing to unfold first');
  assert.match(panel, /<h3 id="usGv5MoveTitle">Ne parlate stasera\?<\/h3>/);
  // Round 3 parity (072-gioco-risposte): the mockup shows the answers first;
  // the one move follows the lists.
  assert.ok(panel.indexOf('us-gv5-reveal-groups') < panel.indexOf('usGv5MoveTitle'), 'the lists come first, then the move');
  const move = panel.slice(panel.indexOf('class="us-gv5-move'), panel.indexOf('us-gv2-actions is-single'));
  assert.match(move, /Weekend ideale\?/, 'the move features one of the different answers');
  assert.doesNotMatch(move, /Colazione\?/);
  assert.match(move, /data-gv2-action="leave-something"[\s\S]*Lascia qualcosa a Beatrice/);
  assert.match(move, /data-gv2-action="think"[\s\S]*Ti penso/);
  assert.match(panel, /<dd>Montagna<\/dd>[\s\S]*<dd>Letto<\/dd>/, 'all answers are in the lists');

  h.nodes.usGameV2Panel.fire('click', { target: { closest: () => ({ dataset: { gv2Action: 'leave-something' } }) } });
  assert.equal(opened.length, 1, 'Lasciato per te composer opens');
  const label = { textContent: 'Ti penso' };
  const think = { dataset: { gv2Action: 'think' }, disabled: false, isConnected: true, querySelector: () => label };
  h.nodes.usGameV2Panel.fire('click', { target: { closest: () => think } });
  await tick();
  assert.equal(thought.length, 1, 'the existing Ti penso signal is sent');
  assert.equal(label.textContent, 'Inviato');
  assert.equal(think.disabled, true);
});

test('G2: with no different answer the move is only the two gestures', async () => {
  const h = harness({ handlers: { get_game_session: () => session({ items: [item({ partner_answer_index: 0 })] }) } });
  await tick();
  await h.api.openSession('s1');
  await tick();
  const panel = h.nodes.usGameV2Panel.innerHTML;
  assert.match(panel, /Ne parlate stasera\?/);
  assert.doesNotMatch(panel, /us-gv5-move-pick/);
});

test('G3: Quanto mi conosci? ends with how many times you were read, from prediction_matched', async () => {
  const predicted = (n, matched) => item({ id: `q${n}`, position: n, family: 'quanto_mi_conosci', mechanic: 'prediction', my_item_role: 'subject', subject_role: 'francesco', prediction_matched: matched });
  const h = harness({ handlers: { get_game_session: () => session({ game_family: 'quanto_mi_conosci', items: [predicted(1, true), predicted(2, false), predicted(3, true)] }) } });
  await tick();
  await h.api.openSession('s1');
  await tick();
  assert.match(h.nodes.usGameV2Panel.innerHTML, /<p class="us-gv5-reading">Beatrice ti ha letto 2 volte su 3<\/p>/);
  const one = harness({ handlers: { get_game_session: () => session({ game_family: 'quanto_mi_conosci', items: [predicted(1, true), predicted(2, false)] }) } });
  await tick();
  await one.api.openSession('s1');
  await tick();
  assert.match(one.nodes.usGameV2Panel.innerHTML, /Beatrice ti ha letto 1 volta su 2/);
});

test('G4: Per voi says when the partner question is inside — before the round and once it exists', async () => {
  const left = weekly({ assigned_role: 'beatrice', created: true, partner_left_question: true, created_at: '2026-10-13T10:00:00Z' });
  const idle = harness({ homeState: home({ weekly: left }) });
  await tick();
  assert.match(idle.nodes.quizHub.innerHTML, /<small class="us-gv2-pervoi-note">Dentro c’è la domanda di Beatrice<\/small>/);
  const later = harness({ homeState: home({ weekly: left, recent: [{ id: 'r', game_family: 'per_voi', started_at: '2026-10-14T10:00:00Z' }] }) });
  await tick();
  assert.doesNotMatch(later.nodes.quizHub.innerHTML, /us-gv2-pervoi-note/, 'a round started after the question decides by its items, not by guess');
  const written = item({ source_type: 'couple_custom', context: { author_role: 'beatrice', origin: 'weekly' } });
  const pending = harness({ homeState: home({ weekly: left, per_voi: { state: 'pending', session_id: 'pv' } }), handlers: { get_game_session: () => session({ id: 'pv', game_family: 'per_voi', reveal_ready: false, items: [written] }) } });
  await tick(14);
  assert.match(pending.nodes.quizHub.innerHTML, /Dentro c’è la domanda di Beatrice/);
  assert.equal(pending.calls.filter(([n]) => n === 'get_game_session').length, 1, 'one read, remembered');
});

test('G7: E se…? is not offered, yet an old E se…? round still opens with its name', async () => {
  const h = harness({ handlers: { get_game_session: () => session({ id: 'old', game_family: 'e_se', items: [item({ family: 'e_se' })] }) } });
  await tick();
  assert.doesNotMatch(h.nodes.quizHub.innerHTML, /data-gv2-family="e_se"/);
  await h.api.openSession('old');
  await tick();
  assert.match(h.nodes.usGameV2Panel.innerHTML, /aria-label="E se…\?"/, "the round keeps its name as the sheet label");
});

test('G9: La vostra domanda closes the Giochi panel, as in the mockup, and is signed where it appears', async () => {
  // Round 3 parity (062/074): the mockup has La vostra domanda at the end of
  // Giochi, after the tiles, also when it is your turn.
  const h = harness({ homeState: home({ weekly: weekly({ my_turn: true }) }) });
  await tick();
  const hub = h.nodes.quizHub.innerHTML;
  assert.ok(hub.indexOf('us-gv2-weekly') > hub.indexOf('us-gv2-choose'), 'weekly card after the games, also on your turn');
  const notMine = harness({ homeState: home({ weekly: weekly({ assigned_role: 'beatrice' }) }) });
  await tick();
  const other = notMine.nodes.quizHub.innerHTML;
  assert.ok(other.indexOf('us-gv2-weekly') > other.indexOf('us-gv2-choose'), 'otherwise it stays after the games');
  const signed = harness({ handlers: { get_game_session: () => session({ items: [
    item({ id: 'a', source_type: 'couple_custom', context: { author_role: 'beatrice', origin: 'weekly' } }),
    item({ id: 'b', position: 2, source_type: 'couple_custom', context: { author_role: 'francesco', origin: 'library' } }),
    item({ id: 'c', position: 3 }),
  ] }) } });
  await tick();
  await signed.api.openSession('s1');
  await tick();
  const panel = signed.nodes.usGameV2Panel.innerHTML;
  assert.match(panel, /us-gv2-author">[\s\S]*?La domanda di Beatrice<\/span>/);
  assert.match(panel, /us-gv2-author">[\s\S]*?La tua domanda<\/span>/);
  assert.equal((panel.match(/us-gv2-author"/g) || []).length, 2, 'library questions are not signed');
});

test('S6: Ultime crescite (the mockup fold) — what, detail · date and its points, mesiversari included', () => {
  const app = read('app.js');
  const from = app.indexOf('const RESONANCE_HISTORY_LIMIT=6;');
  const block = app.slice(from, app.indexOf('function hashSeed(text){', from));
  const root = { innerHTML: '', setAttribute() {}, closest: () => null };
  const window = {};
  const context = vm.createContext({ window, document: { getElementById: (id) => (id === 'noiResonanceHistory' ? root : null) }, console, escapeHtml: String });
  vm.runInContext(`${block}\nwindow.api=window.UsResonance;`, context);
  const entries = window.api.historyEntries(
    [{ id: 'q1', title: 'Cena senza telefoni', xp: 80, completed_at: '2026-10-09T18:00:00Z' }], [], [],
    [{ milestone_date: '2026-10-12', kind: 'monthiversary', months_together: 16, xp_awarded: 60 }, { milestone_date: '2026-06-12', kind: 'anniversary', months_together: 12, xp_awarded: 0 }]);
  assert.deepEqual(Array.from(entries, (e) => e.kind), ['milestone', 'quest', 'milestone'], 'newest first, mesiversari included');
  window.api.renderHistory(entries);
  // Round 3 (mockup parity): "Mesiversario / 16 mesi insieme · 12 ott / +60 XP", as the mockup's .hist rows.
  assert.match(root.innerHTML, /<p class="noi-resonance-history-copy">Mesiversario<small><span>16 mesi insieme<\/span> · <time>12 ott<\/time><\/small><\/p><b class="noi-resonance-history-xp">\+60 XP<\/b>/);
  assert.match(root.innerHTML, /Missione di coppia<small><span>Cena senza telefoni<\/span> · <time>9 ott<\/time><\/small><\/p><b class="noi-resonance-history-xp">\+80 XP<\/b>/);
  assert.match(root.innerHTML, /Anniversario<small><span>1 anno insieme<\/span>/);
  assert.equal((root.innerHTML.match(/noi-resonance-history-xp/g) || []).length, 2, 'a milestone that gave no points shows none');
});

test('S2/S8/S10/T1: level moment, reward scope, Back and the old party (sources)', () => {
  const progression = read('progression.js');
  const html = read('index.html');
  const nav = read('navigation.js');
  // Round 3 (mockup parity) — the level Momento: "Livello 6", "Intesa rara. Il prossimo arriva a 950 XP.", the chip.
  assert.match(progression, /Livello <em>\$\{level\}<\/em>/);
  assert.match(progression, /`\$\{rank\}\. Il prossimo arriva a \$\{fmt\(need\)\} XP\.`/);
  assert.match(progression, /'Un premio sbloccato'/);
  assert.doesNotMatch(progression, /XP al prossimo livello|PROSSIMO SBLOCCO · LIVELLO/);
  // S8 — the scope is said under "I vostri sblocchi"; the next unlock is the mockup's card.
  assert.match(progression, /'Tocca un premio per usarlo\. Vale solo su questo telefono\.'/);
  assert.match(progression, /'Tocca uno stile per usarlo\. Vale per tutti e due\.'/);
  assert.match(progression, /Prossimo sblocco · Livello \$\{level\}/);
  // S10 — the mockup's "Più tardi"; the reward stays in the collection; Back closes both windows.
  assert.match(html, /id="usProgressionUnlockLater">Più tardi<\/button>/);
  assert.match(nav, /name:'progression-unlock'[\s\S]*?closeUnlock/);
  assert.match(nav, /name:'level-moment'[\s\S]*?closeLevelMoment/);
  // S5 — each part of the line under the bar opens its own place.
  for (const go of ['daily', 'games', 'quest', 'memory']) assert.match(html, new RegExp(`data-sintonia-go="${go}"`));
  assert.match(progression, /\$\('usSintoniaGrow'\)\?\.addEventListener\('click'/);
  // T1 — polish4 is gone everywhere it was shipped.
  for (const file of ['index.html', 'service-worker.js', 'scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.doesNotMatch(read(file), /polish4/, file);
  // The English for these texts lives in i18n-en.js; the old Bond party key is gone.
  const EN = require('../i18n-en.js');
  assert.equal(EN['Ci siete arrivati insieme.'], 'You got here together.');
  assert.equal(EN['NUOVO BOND LEVEL'], undefined);
  for (const key of ['Livello {n} · {name}', 'Verso il livello {n}', 'Resta nella vostra collezione, in Sintonia.']) assert.doesNotMatch(EN[key], /XP|Bond/, key);
});
