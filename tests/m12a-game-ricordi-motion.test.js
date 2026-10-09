// M12A — motion polish on Game V2 reveal, weekly question and new Ricordi.
// Domain behaviour is asserted unchanged: only decoration and staging are new.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const tick = async (n = 6) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };

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

const weekly = (over = {}) => ({ week_start: '2026-09-28', next_unlock: '2026-10-05', assigned_role: 'francesco', next_role: 'beatrice', my_turn: true, created: false, created_by_me: false, partner_left_question: false, my_question: null, ...over });
const home = (over = {}) => ({ my_role: 'francesco', partner_role: 'beatrice', weekly: weekly(), per_voi: { state: 'idle' }, open_rounds: [], recent: [], ...over });
const item = (over = {}) => ({
  id: 'i1', position: 1, question_text: 'Qual è il tuo posto felice?', answer_kind: 'open', options: [], mechanic: 'reciprocal', family: 'scopritevi',
  my_item_role: 'mutual', my_prompt: 'Qual è il tuo posto felice?', subject_role: null, context: {},
  my_answer_text: 'Il mare', my_answer_index: null, partner_answer_text: 'La montagna', partner_answer_index: null, prediction_matched: null, ...over,
});
const session = (over = {}) => ({ id: 's1', game_family: 'per_voi', engine_version: 2, started_by_role: 'francesco', my_role: 'francesco', my_complete: true, partner_complete: true, reveal_ready: true, completed_at: 'now', my_reveal_seen_at: null, items: [item()], ...over });

function harness({ homeState = home(), handlers = {}, motion = false } = {}) {
  const nodes = Object.fromEntries(['quizHub', 'usGameV2Panel', 'usPerVoiTop', 'usGv2Answer', 'usGv2Error'].map((k) => [k, el(k)]));
  const calls = []; const notices = []; const feedback = []; const played = [];
  const base = {
    get_game_v2_home: () => homeState,
    get_game_session: () => session(),
    mark_game_session_reveal_seen: (args) => ({ id: args.target_session_id, my_reveal_seen_at: 'now' }),
    create_weekly_question: () => weekly({ created: true, created_by_me: true, my_turn: false, my_question: { question_text: 'Cosa ti ha fatto ridere?' } }),
    ...handlers,
  };
  const window = {
    usProfile: { role: 'francesco', couple_id: 'ignored' },
    crypto: { randomUUID: () => 'req-1' },
    sendWebPushEvent: () => Promise.resolve(),
    go: () => {},
    UsFeedback: { reveal: () => feedback.push('reveal'), success: () => feedback.push('success') },
    ...(motion ? { UsUiFoundation: { isReducedMotion: () => false, playOnce: (node, cls) => { played.push(cls); return true; } } } : {}),
  };
  class FormData {
    constructor(form) { this.fields = form.fields || {}; }
    get(k) { const v = this.fields[k]; return Array.isArray(v) ? v[0] ?? null : v ?? null; }
    getAll(k) { const v = this.fields[k]; return Array.isArray(v) ? v : v == null ? [] : [v]; }
  }
  const sandbox = {
    window,
    document: { readyState: 'complete', hidden: false, getElementById: (k) => nodes[k] || null, addEventListener() {}, querySelector: () => ({ id: 'quiz' }) },
    sb: { rpc: async (name, args) => { calls.push([name, args === undefined ? undefined : JSON.parse(JSON.stringify(args))]); try { return { data: await base[name]?.(args), error: null }; } catch (error) { return { data: null, error }; } } },
    toast: (m) => notices.push(m), FormData, console: { warn() {} },
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 1; }, setInterval: () => 1,
  };
  require('./helpers/identity-fixture').install(sandbox);
  vm.runInNewContext(read('games.js'), sandbox);
  return { api: window.USGameV2, nodes, calls, notices, feedback, played };
}

test('reveal: the FIRST reveal is staged, yet every answer is already in the DOM', async () => {
  const h = harness();
  await tick();
  await h.api.openSession('s1');
  await tick();
  const panel = h.nodes.usGameV2Panel.innerHTML;
  assert.match(panel, /class="us-gv2-reveal us-gv5-reveal is-first-reveal"/);
  assert.match(panel, /class="us-gv5-summary"/);
  assert.doesNotMatch(panel, /class="us-gv2-reveal-card"/, 'no long per-question cards');
  assert.match(panel, /<dd>Il mare<\/dd>/);
  assert.match(panel, /<dd>La montagna<\/dd>/);
  assert.deepEqual(h.feedback, ['reveal']);
  // Domain unchanged: the receipt is still recorded exactly once.
  assert.equal(h.calls.filter(([n]) => n === 'mark_game_session_reveal_seen').length, 1);
});

test('reveal: an already-seen reveal is not delayed, decorated or announced again', async () => {
  const h = harness({ handlers: { get_game_session: () => session({ my_reveal_seen_at: '2026-09-30T10:00:00Z' }) } });
  await tick();
  await h.api.openSession('s1');
  await tick();
  const panel = h.nodes.usGameV2Panel.innerHTML;
  assert.doesNotMatch(panel, /is-first-reveal/);
  assert.match(panel, /<dd>Il mare<\/dd>[\s\S]*<dd>La montagna<\/dd>/);
  assert.deepEqual(h.feedback, []);
  assert.equal(h.calls.filter(([n]) => n === 'mark_game_session_reveal_seen').length, 0);
});

test('reveal: prediction keeps prediction → actual answer → outcome order and its own (longer) beat', async () => {
  const prediction = item({ mechanic: 'prediction', answer_kind: 'choice', options: ['A', 'B'], my_item_role: 'predictor', subject_role: 'beatrice', my_answer_index: 0, partner_answer_index: 1, my_answer_text: null, partner_answer_text: null, prediction_matched: false });
  const h = harness({ handlers: { get_game_session: () => session({ items: [prediction] }) } });
  await tick();
  await h.api.openSession('s1');
  await tick();
  const panel = h.nodes.usGameV2Panel.innerHTML;
  assert.match(panel, /data-gv2-mechanic="prediction"/);
  assert.ok(panel.indexOf('Tu pensavi') < panel.indexOf('ha scelto'));
  const css = read('games.css');
  assert.match(css, /#quiz \.us-gv5-reveal-answers dl>div\{display:flex;flex-direction:column/, 'prediction answers have a compact layout');
  // Whole staged sequence stays under a second: latest delay + duration.
  const delays = [...css.matchAll(/(\d+)ms var\(--us-ease-enter\) (\d+)ms both/g)].map((m) => Number(m[1]) + Number(m[2]));
  assert.ok(Math.max(...delays, 420) <= 1000, `staging ends by ${Math.max(...delays)}ms`);
});

test('reveal: reduced motion removes the staging (instant reveal)', () => {
  const css = read('games.css');
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{#quiz \.us-gv5-reveal-chevron\{transition:none\}\}/, 'collapsible comparison respects reduced motion');
});

async function submitWeekly(h, fields) {
  const form = el('usGv2WeeklyForm');
  const button = { disabled: false, innerHTML: 'Salva la domanda', classes: new Set(), classList: { add(c) { button.classes.add(c); } } };
  h.nodes.usGameV2Panel.query['#usGv2WeeklyForm'] = form;
  form.query['button[type="submit"]'] = button;
  h.nodes.quizHub.fire('click', { target: { closest: () => ({ dataset: { gv2Action: 'weekly-create' } }) } });
  form.fields = fields;
  h.nodes.usGameV2Panel.fire('submit', { target: form, preventDefault() {} });
  await tick();
  return button;
}

test('weekly: the morph follows the confirmed server result, then the locked card settles in once', async () => {
  let created = false;
  const createdWeekly = weekly({ created: true, created_by_me: true, my_turn: false, my_question: { question_text: 'Cosa ti ha fatto ridere?' } });
  const h = harness({ motion: true, handlers: {
    get_game_v2_home: () => home({ weekly: created ? createdWeekly : weekly() }),
    create_weekly_question: () => { created = true; return createdWeekly; }
  } });
  await tick();
  const button = await submitWeekly(h, { question_text: 'Cosa ti ha fatto ridere?', answer_kind: 'open', families: ['scopritevi'] });
  assert.equal(h.calls.filter(([n]) => n === 'create_weekly_question').length, 1);
  assert.ok(button.classes.has('is-saved'), 'saved state shown only after the server answered');
  assert.match(button.innerHTML, /Domanda salvata/);
  assert.deepEqual(h.feedback, ['success']);
  const hub = h.nodes.quizHub.innerHTML;
  assert.match(hub, /us-gv2-weekly is-locked is-just-created/);
  assert.match(hub, /Cosa ti ha fatto ridere\?/);
  // The settle flag is consumed: a later hub render does not replay it.
  h.api.showHub();
  await tick();
  assert.doesNotMatch(h.nodes.quizHub.innerHTML, /is-just-created/);
});

test('weekly: a server failure restores the action and shows the canonical error, no morph', async () => {
  const h = harness({ motion: true, handlers: { create_weekly_question: () => { throw new Error('network'); } } });
  await tick();
  const button = await submitWeekly(h, { question_text: 'Una domanda', answer_kind: 'open', families: ['scopritevi'] });
  assert.equal(button.classes.has('is-saved'), false);
  assert.equal(button.disabled, false, 'the action is actionable again');
  assert.match(h.nodes.usGv2Error.textContent, /Non riesco a salvare la domanda/);
  assert.deepEqual(h.feedback, []);
  assert.doesNotMatch(h.nodes.quizHub.innerHTML, /is-just-created/);
});

test('weekly: without the shared motion system or under reduced motion the change is immediate', async () => {
  const h = harness({ motion: false });
  await tick();
  const button = await submitWeekly(h, { question_text: 'Una domanda', answer_kind: 'open', families: ['scopritevi'] });
  assert.equal(button.classes.has('is-saved'), false);
  assert.deepEqual(h.notices, ['Domanda salvata ♡']);
  assert.match(read('games.css'), /:root\[data-us-motion="reduced"\] :is\(\.us-gv2-submit\.is-saved/);
});

// ---------------------------------------------------------------- Ricordi

function ricordiHarness() {
  const app = read('app.js');
  const src = app.slice(app.indexOf('let usFreshRicordo=null;'), app.indexOf('window.UsRicordiFresh='));
  const played = [];
  const cards = ['m1', 'm2', 'm3'].map((id) => ({ dataset: { momentId: id } }));
  const grid = { querySelectorAll: () => cards };
  const sandbox = { window: { UsUiFoundation: { playOnce: (card, cls, ms) => { played.push([card.dataset.momentId, cls, ms]); return true; } } }, Date, String, Array };
  require('./helpers/identity-fixture').install(sandbox);
  vm.runInNewContext(`${src}\nthis.api={markFreshRicordo,consumeFreshRicordo};`, sandbox);
  return { api: sandbox.api, played, grid, cards, sandbox };
}

test('ricordi: only the newly created card gets the one-shot marker, exactly once', () => {
  const r = ricordiHarness();
  assert.equal(r.api.consumeFreshRicordo(r.grid), false, 'ordinary renders animate nothing');
  r.api.markFreshRicordo('m2');
  assert.equal(r.api.consumeFreshRicordo(r.grid), true);
  assert.deepEqual(r.played, [['m2', 'ricordi-new', 1300]]);
  assert.equal(r.api.consumeFreshRicordo(r.grid), false, 'a later refresh or scroll never replays it');
  assert.equal(r.played.length, 1);
});

test('ricordi: a card that has not rendered yet keeps the marker until it appears; stale markers expire', () => {
  const r = ricordiHarness();
  r.api.markFreshRicordo('m9');
  assert.equal(r.api.consumeFreshRicordo(r.grid), false);
  r.cards.push({ dataset: { momentId: 'm9' } });
  assert.equal(r.api.consumeFreshRicordo(r.grid), true);
  assert.deepEqual(r.played.map((p) => p[0]), ['m9']);

  const expired = ricordiHarness();
  const realNow = Date.now;
  expired.api.markFreshRicordo('m1');
  Date.now = () => realNow() + 60000;
  try {
    assert.equal(expired.api.consumeFreshRicordo(expired.grid), false);
  } finally { Date.now = realNow; }
});

test('ricordi: creation wires the marker from the inserted id; CSS animates only .ricordi-new', () => {
  const app = read('app.js');
  const upload = app.slice(app.indexOf('async function uploadMoment(){'),app.indexOf('async function ',app.indexOf('async function uploadMoment(){')+1));
  assert.match(upload, /\.select\('id'\)\.single\(\)/, 'moment creation must return inserted id');
  assert.match(upload, /if\(rowError\)\{[\s\S]*?await sb\.storage\.from\('us-media'\)\.remove\(cleanup\);[\s\S]*?throw rowError;/, 'original and derived media are cleaned on failed insert');
  assert.match(upload, /if\(created\?\.id\)markFreshRicordo\(created\.id\)/, 'one-shot animation uses actual inserted id');
  assert.ok(upload.indexOf('throw rowError') < upload.indexOf('if(created?.id)markFreshRicordo(created.id)'), 'marker only after successful insert');
  assert.match(app, /grid\.dataset\.loaded='1';grid\.dataset\.signature=signature;\s*consumeFreshRicordo\(grid\);/);
  const css = read('moments-albums.css');
  assert.match(css, /#moments \.moment-card\.ricordi-new\{animation:ricordi-settle/);
  assert.match(css, /#moments \.moment-card\.ricordi-new::after\{[^}]*animation:ricordi-light-catch/);
  assert.doesNotMatch(css, /\.moment-card\.moment-postit\{[^}]*ricordi-settle/);
  assert.doesNotMatch(read('index.html') + read('app.js'), /polaroid/i, 'no Polaroid UI is reintroduced');
});

test('ricordi: reduced motion disables the settle and the light catch', () => {
  const css = read('moments-albums.css');
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{#moments \.moment-card\.ricordi-new,#moments \.moment-card\.ricordi-new::after\{animation:none\}\}/);
  assert.match(css, /:root\[data-us-motion="reduced"\] #moments \.moment-card\.ricordi-new/);
});

test('ti penso: one soft pulse, the shared attention state and the attention tone — no loop', () => {
  const app = read('app.js');
  const at = app.indexOf('function handleIncomingThink');
  const body = app.slice(at, app.indexOf('const usRealtimeRefreshTimers', at));
  assert.match(body, /window\.UsFeedback\?\.attention\?\.\(\)/);
  assert.match(body, /window\.UsUiFoundation\?\.auroraPulse\?\.\(\)/);
  assert.match(body, /playOnce\?\.\(card,'us-attention-pulse',900\)/);
  assert.match(body, /\[data-us-arrival-type="think-received"\]/);
  const css = read('ui-foundation.css');
  assert.match(css, /\.us-attention-pulse::before\{[^}]*animation:us-attention-pulse 900ms [^}]* 1 both\}/);
  assert.doesNotMatch(css.slice(css.indexOf('.us-attention-pulse::before')).split('\n')[0], /infinite/);
});
