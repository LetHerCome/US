const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8');
const source = () => read('games.js').split('// M11A — couple-created questions')[1];

function el() {
  const listeners = new Map();
  const classes = new Set(['hidden']);
  return {
    innerHTML: '', value: '', dataset: {}, disabled: false,
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
    addEventListener: (event, fn) => listeners.set(event, fn),
    querySelector: () => null, querySelectorAll: () => [],
    fire: (event, data) => listeners.get(event)?.(data)
  };
}

function harness({ role = 'francesco', questions = [], sessions = [], session = null, saveResult, completeResult } = {}) {
  const nodes = Object.fromEntries(['usCustomGamesHub', 'usCustomGamePanel', 'quizHub', 'quizPlay', 'quizResult', 'usKnowledgePlay', 'usKnowledgeResult'].map(k => [k, el()]));
  const calls = [], notices = [];
  const handlers = {
    list_couple_questions: () => questions,
    list_game_sessions: () => sessions,
    get_game_session: () => session,
    start_custom_game_session: () => session,
    save_game_session_answer: () => saveResult || session,
    complete_game_session_side: () => completeResult || session,
    mark_game_session_reveal_seen: () => ({ ...session, my_reveal_seen_at: '2026-09-30T10:00:00Z' })
  };
  const sandbox = {
    window: { usProfile: { role, couple_id: 'c' }, crypto: { randomUUID: () => 'op-1' } },
    document: { readyState: 'loading', hidden: false, getElementById: key => nodes[key] || null, addEventListener() {} },
    sb: { rpc: async (name, args) => { calls.push([name, args]); return { data: handlers[name]?.(args), error: null }; } },
    toast: message => notices.push(message),
    console: { warn() {} }, setTimeout: () => 1,
  };
  vm.runInNewContext(`// M11A — couple-created questions${source()}`, sandbox);
  return { api: sandbox.window.USCustomGames, nodes, calls, notices, handlers };
}

const openState = ({ ready = false, myComplete = false, partnerComplete = false, partnerAnswer = null } = {}) => ({
  id: 'session-1', game_family: 'couple_custom', content_source: 'couple_custom', started_by_role: 'francesco',
  my_complete: myComplete, partner_complete: partnerComplete, reveal_ready: ready, completed_at: ready ? 'now' : null,
  my_reveal_seen_at: null,
  items: [{ id: 'item-1', question_text: 'Cosa ricordi di Roma?', answer_kind: 'open', options: [],
    my_answer_text: myComplete ? 'La stanza' : null, partner_answer_text: partnerAnswer }]
});

test('M11A hub shows authored questions, active sessions and only the author gets edit/delete', async () => {
  const questions = [
    { id: 'q1', question_text: '<nostra domanda>', answer_kind: 'open', options: [], author_role: 'francesco', version: 1 },
    { id: 'q2', question_text: 'Quale posto?', answer_kind: 'choice', options: ['Roma', 'Casa'], author_role: 'beatrice', version: 1 }
  ];
  const sessions = [{ id: 's1', question_preview: 'Cosa ricordi?', my_complete: false, partner_complete: true, reveal_ready: false }];
  const { api, nodes, calls } = harness({ questions, sessions });
  await api.load();
  const html = nodes.usCustomGamesHub.innerHTML;
  assert.match(html, /Le vostre domande/);
  assert.match(html, /Crea una domanda/);
  assert.match(html, /Tocca a te/);
  assert.match(html, /&lt;nostra domanda&gt;/);
  assert.match(html, /data-cg-edit="q1"/);
  assert.doesNotMatch(html, /data-cg-edit="q2"/);
  assert.match(html, /data-cg-start="q2"/);
  assert.deepEqual(calls.map(x => x[0]), ['list_couple_questions', 'list_game_sessions']);
});

test('M11A session UI never renders a partner answer before server reveal-ready', async () => {
  const session = openState({ myComplete: true, partnerComplete: false, partnerAnswer: 'SERVER-MUST-HIDE' });
  const { api, nodes } = harness({ session });
  await api.openSession('session-1');
  assert.match(nodes.usCustomGamePanel.innerHTML, /Hai risposto\. Aspettiamo Bea/);
  assert.doesNotMatch(nodes.usCustomGamePanel.innerHTML, /SERVER-MUST-HIDE/);
  assert.match(nodes.usCustomGamePanel.innerHTML, /La stanza/);
});

test('M11A submits own answer then finalizes; partner answer appears only in completed reveal', async () => {
  const session = openState({ ready: true, myComplete: true, partnerComplete: true, partnerAnswer: 'La cena' });
  const { api, nodes, calls } = harness({ session, completeResult: session });
  await api.openSession('session-1');
  assert.match(nodes.usCustomGamePanel.innerHTML, /LA TUA RISPOSTA/);
  assert.match(nodes.usCustomGamePanel.innerHTML, /La cena/);
  assert.ok(calls.some(([name]) => name === 'mark_game_session_reveal_seen'));
  const fresh = openState();
  const h = harness({ session: fresh, completeResult: session });
  await h.api.openSession('session-1');
  await h.api.submitAnswer('La stanza', null);
  assert.deepEqual(h.calls.filter(([name]) => name.startsWith('save_') || name.startsWith('complete_')).map(([name]) => name),
    ['save_game_session_answer', 'complete_game_session_side']);
});

test('M11A choice reveal uses Uguale or Una sorpresa, never scoring language', async () => {
  const state = openState({ ready: true, myComplete: true, partnerComplete: true });
  state.items[0] = { id: 'i', question_text: 'Dove torniamo?', answer_kind: 'choice', options: ['Roma', 'Casa'], my_answer_index: 0, partner_answer_index: 0 };
  const h = harness({ session: state });
  await h.api.openSession('session-1');
  assert.match(h.nodes.usCustomGamePanel.innerHTML, /Uguale ♡/);
  assert.doesNotMatch(h.nodes.usCustomGamePanel.innerHTML, /compatibil|punteggio|XP/i);
  state.items[0].partner_answer_index = 1;
  await h.api.openSession('session-1');
  assert.match(h.nodes.usCustomGamePanel.innerHTML, /Una sorpresa/);
});

test('M11A surface is inside Gioca and does not add AI, push or a new navigation tab', () => {
  const html = read('index.html');
  const app = read('app.js');
  const games = read('games.js');
  assert.match(html, /id="usCustomGamesHub"/);
  assert.match(html, /id="usCustomGamePanel"/);
  assert.match(app, /window\.USCustomGames\?\.close/);
  assert.match(games, /window\.USCustomGames/);
  assert.doesNotMatch(games.split('// M11A — couple-created questions')[1], /fetch\(|openai|anthropic|sendWebPushEvent|bond_xp/i);
});
