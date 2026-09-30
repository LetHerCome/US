// M11B — the new Gioca client (games.js). The server is the authority for
// couple, role, week, content and reveal; these tests pin what the client
// may render from each server state and what it sends back.
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
    querySelector(selector) { return this.query[selector] ?? null; },
    querySelectorAll: () => [],
    fire: (event, data) => listeners.get(event)?.(data),
  };
}

const weekly = (over = {}) => ({
  week_start: '2026-09-28', next_unlock: '2026-10-05', assigned_role: 'francesco', next_role: 'beatrice',
  my_turn: false, created: false, created_by_me: false, partner_left_question: false, my_question: null, ...over,
});
const home = (over = {}) => ({
  my_role: 'francesco', partner_role: 'beatrice', weekly: weekly(), per_voi: { state: 'idle' }, open_rounds: [], recent: [], ...over,
});
const item = (over = {}) => ({
  id: 'i1', position: 1, question_text: 'Qual è il tuo posto felice?', answer_kind: 'open', options: [], mechanic: 'reciprocal',
  family: 'scopritevi', my_item_role: 'mutual', my_prompt: 'Qual è il tuo posto felice?', subject_role: null, context: {},
  my_answer_text: null, my_answer_index: null, partner_answer_text: null, partner_answer_index: null, prediction_matched: null, ...over,
});
const session = (over = {}) => ({
  id: 's1', game_family: 'per_voi', engine_version: 2, started_by_role: 'francesco', my_role: 'francesco',
  my_complete: false, partner_complete: false, reveal_ready: false, completed_at: null, my_reveal_seen_at: null,
  items: [item()], ...over,
});

function harness({ role = 'francesco', homeState = home(), handlers = {} } = {}) {
  const nodes = Object.fromEntries(['quizHub', 'usGameV2Panel', 'usPerVoiTop', 'usGv2Answer', 'usGv2Error'].map((k) => [k, el(k)]));
  const calls = []; const notices = []; const pushes = [];
  const base = {
    get_game_v2_home: () => homeState,
    get_game_session: () => session(),
    start_game_round: () => session(),
    save_game_session_answer: () => session(),
    complete_game_session_side: () => session({ my_complete: true }),
    mark_game_session_reveal_seen: (args) => ({ id: args.target_session_id, my_reveal_seen_at: 'now' }),
    create_weekly_question: () => weekly({ created: true, created_by_me: true }),
    ...handlers,
  };
  let uuidCount = 0;
  const window = {
    usProfile: { role, couple_id: 'client-supplied-ignored' },
    crypto: { randomUUID: () => `req-${++uuidCount}` },
    sendWebPushEvent: (type, id) => { pushes.push([type, id]); return Promise.resolve(); },
    go: () => {},
  };
  class FormData {
    constructor(form) { this.fields = form.fields || {}; }
    get(k) { const v = this.fields[k]; return Array.isArray(v) ? v[0] ?? null : v ?? null; }
    getAll(k) { const v = this.fields[k]; return Array.isArray(v) ? v : v == null ? [] : [v]; }
  }
  const sandbox = {
    window,
    document: { readyState: 'complete', hidden: false, getElementById: (k) => nodes[k] || null, addEventListener() {}, querySelector: () => ({ id: 'quiz' }) },
    sb: {
      rpc: async (name, args) => {
        calls.push([name, args === undefined ? undefined : JSON.parse(JSON.stringify(args))]);
        try { return { data: await base[name]?.(args), error: null }; } catch (error) { return { data: null, error }; }
      },
    },
    toast: (m) => notices.push(m), FormData, console: { warn() {} }, setTimeout: () => 1, setInterval: () => 1,
  };
  vm.runInNewContext(read('games.js'), sandbox);
  return { api: window.USGameV2, window, nodes, calls, notices, pushes, handlers: base };
}

const NO_SCORE = /compatibil|punteggio|percentual|%|XP|sbagliat|giusto|corrett/i;

test('M11B client: hub shows Per voi, the six modes and the weekly turn, with no score language', async () => {
  const h = harness({ homeState: home({ weekly: weekly({ my_turn: true }) }) });
  await tick();
  const html = h.nodes.quizHub.innerHTML;
  assert.match(html, /<b>Per voi<\/b><small>Cinque domande<\/small>/);
  for (const name of ['Scopritevi', 'Confrontatevi', 'Ridete', 'Quanto mi conosci\\?', 'Rivivete', 'E se…\\?']) assert.match(html, new RegExp(name));
  assert.match(html, /<b>Tocca a te<\/b>/);
  assert.match(html, /Crea la domanda/);
  assert.doesNotMatch(html, NO_SCORE);
  assert.deepEqual(h.calls.map(([n]) => n), ['get_game_v2_home']);
  assert.deepEqual(h.calls[0][1], undefined, 'no client-supplied couple, user or role');
});

test('M11B client: the top Per voi control mirrors the server state with the shared attention orbit', async () => {
  const expectations = { idle: 'off', in_progress: 'off', waiting: 'off', pending: 'on', reveal_ready: 'on' };
  for (const [state, attention] of Object.entries(expectations)) {
    const h = harness({ homeState: home({ per_voi: { state, session_id: state === 'idle' ? undefined : 's1' } }) });
    await tick();
    const top = h.nodes.usPerVoiTop;
    assert.equal(top.dataset.gv2State, state);
    assert.equal(top.dataset.usAttention, attention, state);
    assert.equal(top.classList.contains('is-loading'), false);
    assert.match(top.getAttribute('aria-label'), /^Per voi/);
  }
  const failed = harness({ handlers: { get_game_v2_home: () => { throw new Error('offline'); } } });
  await tick();
  assert.equal(failed.nodes.usPerVoiTop.classList.contains('is-loading'), false, 'a failed load never leaves the control disabled');
  assert.match(failed.nodes.quizHub.innerHTML, /Riprova/);
});

test('M11B client: weekly card states — locked, created by me, sealed for the partner', async () => {
  const locked = harness({ homeState: home({ weekly: weekly({ assigned_role: 'beatrice', next_role: 'francesco' }) }) });
  await tick();
  assert.match(locked.nodes.quizHub.innerHTML, /Questa settimana crea Bea/);
  assert.match(locked.nodes.quizHub.innerHTML, /Tocca a te da lunedì 5 ottobre/);
  assert.doesNotMatch(locked.nodes.quizHub.innerHTML, /data-gv2-action="weekly-create"/);

  const mine = harness({ homeState: home({ weekly: weekly({ my_turn: false, created: true, created_by_me: true, my_question: { question_text: 'Cosa <ti> manca?' } }) }) });
  await tick();
  assert.match(mine.nodes.quizHub.innerHTML, /Domanda creata/);
  assert.match(mine.nodes.quizHub.innerHTML, /Poi tocca a Bea, lunedì 5 ottobre\./);
  assert.match(mine.nodes.quizHub.innerHTML, /Cosa &lt;ti&gt; manca\?/, 'author sees own text, escaped');

  const sealed = harness({ role: 'beatrice', homeState: home({ my_role: 'beatrice', partner_role: 'francesco', weekly: weekly({ created: true, partner_left_question: true }) }) });
  await tick();
  assert.match(sealed.nodes.quizHub.innerHTML, /Francesco ha lasciato una domanda/);
  assert.doesNotMatch(sealed.nodes.quizHub.innerHTML, /blockquote/, 'the partner never sees the sealed text');
});

test('M11B client: waiting view never renders a partner answer before the server reveal', async () => {
  const leaked = session({ my_complete: true, items: [item({ my_answer_text: 'La montagna', partner_answer_text: 'SERVER-MUST-HIDE' })] });
  const h = harness({ handlers: { get_game_session: () => leaked } });
  await tick();
  await h.api.openSession('s1');
  const html = h.nodes.usGameV2Panel.innerHTML;
  assert.match(html, /Hai risposto\./);
  assert.match(html, /Aspettiamo Bea/);
  assert.match(html, /La montagna/);
  assert.doesNotMatch(html, /SERVER-MUST-HIDE/);
  assert.equal(h.calls.some(([n]) => n === 'mark_game_session_reveal_seen'), false);
});

test('M11B client: reveal copy — gendered prediction outcomes, Uguale / Una sorpresa, receipt stored', async () => {
  const revealed = (role, items) => session({ my_role: role, my_complete: true, partner_complete: true, reveal_ready: true, completed_at: 'now', items });
  const predict = (over) => item({ mechanic: 'prediction', answer_kind: 'choice', options: ['Mare', 'Montagna'], family: 'quanto_mi_conosci', ...over });
  const f = harness({ handlers: { get_game_session: () => revealed('francesco', [
    predict({ id: 'a', my_item_role: 'predictor', subject_role: 'beatrice', my_answer_index: 0, partner_answer_index: 0, prediction_matched: true }),
    predict({ id: 'b', my_item_role: 'predictor', subject_role: 'beatrice', my_answer_index: 0, partner_answer_index: 1, prediction_matched: false }),
    predict({ id: 'c', my_item_role: 'subject', subject_role: 'francesco', my_answer_index: 1, partner_answer_index: 1, prediction_matched: true }),
    predict({ id: 'd', my_item_role: 'subject', subject_role: 'francesco', my_answer_index: 1, partner_answer_index: 0, prediction_matched: false }),
    item({ id: 'e', answer_kind: 'choice', options: ['Sì', 'No'], my_answer_index: 0, partner_answer_index: 0 }),
    item({ id: 'f', answer_kind: 'choice', options: ['Sì', 'No'], my_answer_index: 0, partner_answer_index: 1 }),
  ]) } });
  await tick();
  await h_open(f);
  const html = f.nodes.usGameV2Panel.innerHTML;
  assert.match(html, /L’hai capita al volo ♡/);
  assert.match(html, /Ti ha sorpreso/);
  assert.match(html, /Ti ha capito al volo ♡/);
  assert.match(html, /L’hai sorpresa/);
  assert.match(html, /Uguale ♡/);
  assert.match(html, /Una sorpresa/);
  assert.match(html, /Tu pensavi/);
  assert.match(html, /Bea ha scelto/);
  assert.doesNotMatch(html, /Facciamone un altro/, 'M11F: no immediate replay invitation after a reveal');
  assert.doesNotMatch(html, NO_SCORE);
  assert.ok(f.calls.some(([n, a]) => n === 'mark_game_session_reveal_seen' && a.target_session_id === 's1'));

  const b = harness({ role: 'beatrice', handlers: { get_game_session: () => revealed('beatrice', [
    predict({ id: 'a', my_item_role: 'predictor', subject_role: 'francesco', my_answer_index: 0, partner_answer_index: 0, prediction_matched: true }),
    predict({ id: 'b', my_item_role: 'predictor', subject_role: 'francesco', my_answer_index: 0, partner_answer_index: 1, prediction_matched: false }),
    predict({ id: 'c', my_item_role: 'subject', subject_role: 'beatrice', my_answer_index: 1, partner_answer_index: 1, prediction_matched: true }),
    predict({ id: 'd', my_item_role: 'subject', subject_role: 'beatrice', my_answer_index: 1, partner_answer_index: 0, prediction_matched: false }),
  ]) } });
  await tick();
  await h_open(b);
  const bh = b.nodes.usGameV2Panel.innerHTML;
  for (const line of ['L’hai capito al volo ♡', 'Ti ha sorpresa', 'Ti ha capita al volo ♡', 'L’hai sorpreso', 'Francesco pensava']) assert.match(bh, new RegExp(line));
});
test('M11C client: context chip and longitudinal answers appear only as the server sends them', async () => {
  const withContext = item({ id: 'l', source_type: 'game_history', context: { kind: 'longitudinal', kind_label: 'L’avete già giocata a gennaio' } });
  const waiting = session({ my_complete: true, items: [{ ...withContext, my_answer_text: 'Oggi' }] });
  const w = harness({ handlers: { get_game_session: () => waiting } });
  await tick();
  await w.api.openSession('s1');
  assert.doesNotMatch(w.nodes.usGameV2Panel.innerHTML, /COSA AVEVATE RISPOSTO/);
  const revealed = session({ my_complete: true, partner_complete: true, reveal_ready: true, completed_at: 'now',
    items: [{ ...withContext, my_answer_text: 'Oggi', partner_answer_text: 'Adesso', previous: { my_answer_text: 'Allora <io>', partner_answer_text: 'Allora lei' } }] });
  const r = harness({ handlers: { get_game_session: () => revealed } });
  await tick();
  await r.api.openSession('s1');
  const html = r.nodes.usGameV2Panel.innerHTML;
  assert.match(html, /class="us-gv2-context">L’avete già giocata a gennaio/);
  assert.match(html, /COSA AVEVATE RISPOSTO/);
  assert.match(html, /Allora &lt;io&gt;/);
  assert.match(html, /Allora lei/);
});

async function h_open(h) { await h.api.openSession('s1'); await tick(); }

test('M11B client: a round saves each own answer, finalizes once and sends only an id to push', async () => {
  const two = session({ items: [item({ id: 'i1' }), item({ id: 'i2', my_prompt: 'Secondo te cosa ha scelto Bea?', question_text: 'Q2', answer_kind: 'choice', options: ['A', 'B'], mechanic: 'prediction', my_item_role: 'predictor', subject_role: 'beatrice' })] });
  let saved = two;
  const h = harness({ handlers: {
    get_game_session: () => two,
    save_game_session_answer: (a) => { saved = { ...saved, items: saved.items.map((i) => (i.id === a.target_item_id ? { ...i, my_answer_text: a.target_answer_text, my_answer_index: a.target_answer_index } : i)) }; return saved; },
    complete_game_session_side: () => ({ ...saved, my_complete: true }),
  } });
  await tick();
  await h.api.openSession('s1');
  assert.match(h.nodes.usGameV2Panel.innerHTML, /1 di 2/);
  h.nodes.usGv2Answer.value = '  Il lago  ';
  h.nodes.usGameV2Panel.fire('submit', { target: { id: 'usGv2AnswerForm' }, preventDefault() {} });
  await tick();
  assert.match(h.nodes.usGameV2Panel.innerHTML, /2 di 2/);
  assert.match(h.nodes.usGameV2Panel.innerHTML, /Secondo te cosa ha scelto Bea\?/);
  assert.match(h.nodes.usGameV2Panel.innerHTML, /Conferma le risposte/);
  h.nodes.usGameV2Panel.query['input[name="gv2choice"]:checked'] = { value: '1' };
  h.nodes.usGameV2Panel.fire('submit', { target: { id: 'usGv2AnswerForm' }, preventDefault() {} });
  await tick();
  const writes = h.calls.filter(([n]) => n === 'save_game_session_answer' || n === 'complete_game_session_side');
  assert.deepEqual(writes.map(([n]) => n), ['save_game_session_answer', 'save_game_session_answer', 'complete_game_session_side']);
  assert.deepEqual(writes[0][1], { target_session_id: 's1', target_item_id: 'i1', target_answer_text: 'Il lago', target_answer_index: null });
  assert.deepEqual(writes[1][1], { target_session_id: 's1', target_item_id: 'i2', target_answer_text: null, target_answer_index: 1 });
  assert.deepEqual(h.pushes, [['game_session', 's1']]);
  assert.match(h.nodes.usGameV2Panel.innerHTML, /Hai risposto\./);
});

test('M11B client: an empty answer is refused locally and nothing is sent', async () => {
  const h = harness();
  await tick();
  await h.api.openSession('s1');
  h.nodes.usGv2Answer.value = '   ';
  h.nodes.usGameV2Panel.fire('submit', { target: { id: 'usGv2AnswerForm' }, preventDefault() {} });
  await tick();
  assert.equal(h.nodes.usGv2Error.textContent, 'Scrivi una risposta, anche breve.');
  assert.equal(h.calls.some(([n]) => n === 'save_game_session_answer'), false);
});

test('M11B client: starting a round retries with the same request id, then mints a fresh one', async () => {
  let fail = true;
  const h = harness({ handlers: { start_game_round: () => { if (fail) { fail = false; throw new Error('network'); } return session(); } } });
  await tick();
  await h.api.startRound('ridete');
  await h.api.startRound('ridete');
  await h.api.startRound('ridete');
  const ids = h.calls.filter(([n]) => n === 'start_game_round').map(([, a]) => a);
  assert.deepEqual(ids.map((a) => a.target_family), ['ridete', 'ridete', 'ridete']);
  assert.equal(ids[0].request_id, ids[1].request_id, 'a retry replays the same request');
  assert.notEqual(ids[1].request_id, ids[2].request_id, 'a new tap is a new request');
  assert.deepEqual(Object.keys(ids[0]).sort(), ['request_id', 'target_family']);
  const empty = harness({ handlers: { start_game_round: () => { throw new Error('not enough content'); } } });
  await tick();
  await empty.api.startRound('rivivete');
  assert.deepEqual(empty.notices, ['Non ci sono ancora abbastanza domande per questo gioco.']);
});

test('M11B client: Per voi resumes the server session or starts a round', async () => {
  const resume = harness({ homeState: home({ per_voi: { state: 'pending', session_id: 's9' } }) });
  await tick();
  await resume.api.openPerVoi();
  assert.deepEqual(resume.calls.filter(([n]) => n !== 'get_game_v2_home').map(([n, a]) => [n, a.target_session_id]), [['get_game_session', 's9']]);
  const fresh = harness();
  await tick();
  await fresh.api.openPerVoi();
  assert.equal(fresh.calls.find(([n]) => n === 'start_game_round')[1].target_family, 'per_voi');
});

test('M11B client: weekly question form sends only content, retries idempotently, pushes without text', async () => {
  let fail = true;
  const h = harness({
    homeState: home({ weekly: weekly({ my_turn: true }) }),
    handlers: { create_weekly_question: () => { if (fail) { fail = false; throw new Error('network'); } return weekly({ created: true, created_by_me: true, question_id: 'q7' }); } },
  });
  await tick();
  const form = el('usGv2WeeklyForm');
  h.nodes.usGameV2Panel.query['#usGv2WeeklyForm'] = form;
  h.nodes.quizHub.fire('click', { target: { closest: () => ({ dataset: { gv2Action: 'weekly-create' } }) } });
  assert.match(h.nodes.usGameV2Panel.innerHTML, /Crea la domanda/);
  assert.match(h.nodes.usGameV2Panel.innerHTML, /value="quanto_mi_conosci"  disabled/, 'Quanto mi conosci? needs choices');
  form.fields = { question_text: '', answer_kind: 'open', families: ['scopritevi'] };
  form.query['button[type="submit"]'] = { disabled: false };
  h.nodes.usGameV2Panel.fire('submit', { target: form, preventDefault() {} });
  await tick();
  assert.match(h.nodes.usGv2Error.textContent, /300 caratteri/);
  form.fields = { question_text: 'Cosa ti ha fatto ridere?', answer_kind: 'choice', option_0: 'Io', option_1: 'Io', families: ['ridete'] };
  h.nodes.usGameV2Panel.fire('submit', { target: form, preventDefault() {} });
  await tick();
  assert.equal(h.nodes.usGv2Error.textContent, 'Scrivi almeno due opzioni diverse.');
  form.fields = { question_text: '  Cosa ti ha fatto ridere?  ', answer_kind: 'choice', option_0: 'Io', option_1: 'Tu', option_2: '', families: ['ridete', 'quanto_mi_conosci'] };
  h.nodes.usGameV2Panel.fire('submit', { target: form, preventDefault() {} });
  await tick();
  h.nodes.usGameV2Panel.fire('submit', { target: form, preventDefault() {} });
  await tick();
  const sends = h.calls.filter(([n]) => n === 'create_weekly_question').map(([, a]) => a);
  assert.equal(sends.length, 2);
  assert.equal(sends[0].request_id, sends[1].request_id, 'the retry replays the same request id');
  assert.deepEqual(Object.keys(sends[1]).sort(), ['answer_kind', 'families', 'options', 'question_text', 'request_id']);
  assert.deepEqual(sends[1].options, ['Io', 'Tu']);
  assert.equal(sends[1].question_text, 'Cosa ti ha fatto ridere?');
  assert.deepEqual(h.pushes, [['game_weekly', 'q7']], 'push carries an id, never the sealed text');
  assert.deepEqual(h.notices, ['Domanda salvata ♡']);
});

test('M11B client: static contract — one Gioca surface, Phosphor icons, no legacy quiz or local answer storage', () => {
  const html = read('index.html');
  const app = read('app.js');
  const games = read('games.js');
  const css = read('games.css') + read('identity.css');
  const top = html.match(/<button[^>]*id="usPerVoiTop"[^>]*>/)?.[0] || '';
  assert.match(top, /us-attention-orbit/);
  assert.match(top, /data-us-attention="off"/);
  assert.match(top, /onclick="window\.USGameV2\?\.openPerVoi\(\)"/);
  assert.match(html, /<div class="us-top-left"><button[^>]*id="usPerVoiTop"/);
  assert.match(html, /<div id="quizHub" class="us-gv2-hub"/);
  assert.match(html, /<div id="usGameV2Panel" class="us-gv2-panel hidden"/);
  assert.doesNotMatch(html, /weeklyQuizGrid|usExtraGames|usCustomGamesHub|quizPlay|scoreRing/);
  assert.doesNotMatch(app, /quiz_responses|loadWeeklyQuizHub|refreshQuizState|QUIZ_META|Ogni risposta uguale/);
  assert.match(app, /function openQuizHub\(options=\{\}\)\{go\('quiz',options\);window\.USGameV2\?\.showHub\(\);\}/);
  assert.match(read('navigation.js'), /close:\(\)=>window\.USGameV2\?\.close\(\)/);
  assert.doesNotMatch(games, /localStorage|sessionStorage|indexedDB|fetch\(|openai|anthropic|bond_xp/i);
  assert.doesNotMatch(games, /couple_id|user_id|auth\.uid/, 'never sends identity; the server derives it');
  const rpcs = [...new Set([...games.matchAll(/sb\.rpc\('([a-z_0-9]+)'/g)].map((m) => m[1]))].sort();
  assert.deepEqual(rpcs, ['complete_game_session_side', 'create_weekly_question', 'get_game_session', 'get_game_v2_home', 'mark_game_session_reveal_seen', 'save_game_session_answer', 'start_game_round']);
  const registry = JSON.parse(read('assets/ICON_REGISTRY.json')).icons;
  for (const [file, phosphor] of [['sparkle-regular', 'Sparkle'], ['sparkle-fill', 'Sparkle'], ['feather-regular', 'Feather'], ['lock-simple-regular', 'LockSimple'], ['binoculars-regular', 'Binoculars'], ['arrows-left-right-regular', 'ArrowsLeftRight'], ['smiley-regular', 'Smiley'], ['eye-regular', 'Eye'], ['clock-counter-clockwise-regular', 'ClockCounterClockwise'], ['signpost-regular', 'Signpost']]) {
    assert.ok(fs.existsSync(path.join(ROOT, 'assets/icons/phosphor', `${file}.svg`)), file);
    assert.match(css, new RegExp(`/assets/icons/phosphor/${file}\\.svg`), `${file} is painted from the official file`);
    assert.ok(registry.some((i) => i.source === 'PHOSPHOR' && i.phosphorName === phosphor), `${phosphor} registered`);
  }
  assert.doesNotMatch(games + read('games.css'), /<svg|<path/, 'no hand-drawn icons');
});

// ---------------------------------------------------------------- M11F weekly rhythm

const allowance = (over = {}) => ({ week_start: '2026-09-28', resets_on: '2026-10-05', per_voi_used: 0, per_voi_limit: 1, free_used: 0, free_limit: 2,
  used: 0, limit: 3, per_voi_available: true, free_available: true, open_count: 0, open_limit: 3, families: {}, ...over });

test('M11F client: the weekly strip reads the server allowance, restrained, never a counter game', async () => {
  const fresh = harness({ homeState: home({ allowance: allowance() }) });
  await tick();
  assert.match(fresh.nodes.quizHub.innerHTML, /QUESTA SETTIMANA/);
  assert.match(fresh.nodes.quizHub.innerHTML, /data-gv2-rhythm="open"[\s\S]*<b>0 di 3<\/b>/);
  const mid = harness({ homeState: home({ allowance: allowance({ used: 2, per_voi_used: 1, free_used: 1, per_voi_available: false, families: { per_voi: { session_id: 'p', completed: true }, ridete: { session_id: 'r', completed: true } } }) }) });
  await tick();
  const html = mid.nodes.quizHub.innerHTML;
  assert.match(html, /2 di 3 momenti giocati/);
  assert.equal((html.match(/data-on="true"/g) || []).length, 2);
  assert.match(html, /data-gv2-family="ridete" data-gv2-mode-state="played"/);
  assert.match(html, /Giocato<\/small>/);
  assert.doesNotMatch(html, /vite|energia|stamina|streak|serie/i, 'no game-energy language');
  const done = harness({ homeState: home({ per_voi: { state: 'played', session_id: 'p' }, allowance: allowance({ used: 3, per_voi_used: 1, free_used: 2, per_voi_available: false, free_available: false, families: { per_voi: { session_id: 'p', completed: true } } }) }) });
  await tick();
  const dh = done.nodes.quizHub.innerHTML;
  assert.match(dh, /<b>Nuovi giochi lunedì<\/b>/);
  assert.match(dh, /Giocato · il prossimo lunedì/, 'Per voi shows its played state');
  assert.match(dh, /data-gv2-family="scopritevi" data-gv2-mode-state="locked" aria-disabled="true"/, 'modes stay visible, locked');
  assert.equal(done.nodes.usPerVoiTop.dataset.gv2State, 'played');
  assert.equal(done.nodes.usPerVoiTop.dataset.usAttention, 'off');
});

test('M11F client: an exhausted week starts nothing; played modes open their reveal; server refusals are explained', async () => {
  const h = harness({ homeState: home({ allowance: allowance({ used: 3, free_used: 2, per_voi_used: 1, per_voi_available: false, free_available: false, families: { ridete: { session_id: 'r1', completed: true } } }) }) });
  await tick();
  await h.api.chooseMode('scopritevi');
  await h.api.chooseMode('ridete');
  await tick();
  assert.equal(h.calls.some(([n]) => n === 'start_game_round'), false, 'no start call once the week is spent');
  assert.match(h.notices.join('|'), /Nuovi giochi lunedì/);
  assert.ok(h.calls.some(([n, a]) => n === 'get_game_session' && a.target_session_id === 'r1'), 'played mode opens its round');

  const refused = harness({ handlers: { start_game_round: () => { throw Object.assign(new Error('weekly allowance exhausted'), { code: 'P0001' }); } } });
  await tick();
  await refused.api.startRound('e_se');
  assert.match(refused.notices.join('|'), /Nuovi giochi lunedì/);
  const pile = harness({ handlers: { start_game_round: () => { throw new Error('too many open rounds'); } } });
  await tick();
  await pile.api.startRound('e_se');
  assert.match(pile.notices.join('|'), /Prima finite una delle partite in corso/);
});

test('M11F client: repeating a played mode asks once through the shared US confirm; an open round just resumes', async () => {
  const asked = [];
  const h = harness({ homeState: home({ open_rounds: [{ id: 'open-1', game_family: 'e_se', item_count: 5, my_answered_count: 1 }],
    allowance: allowance({ used: 1, free_used: 1, families: { ridete: { session_id: 'r1', completed: true } } }) }) });
  h.window.UsUiFoundation = { confirm: async (opts) => { asked.push(opts); return asked.length > 1; } };
  await tick();
  await h.api.chooseMode('ridete');
  assert.equal(h.calls.some(([n]) => n === 'start_game_round'), false, 'declined: nothing started');
  await h.api.chooseMode('ridete');
  assert.ok(h.calls.some(([n, a]) => n === 'start_game_round' && a.target_family === 'ridete'));
  assert.match(asked[0].title, /Avete già giocato a Ridete questa settimana/);
  assert.match(asked[0].body, /un momento/);
  await h.api.chooseMode('e_se');
  assert.ok(h.calls.some(([n, a]) => n === 'get_game_session' && a.target_session_id === 'open-1'));
  assert.equal(asked.length, 2, 'resuming never asks');
});
