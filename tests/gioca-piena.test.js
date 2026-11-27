// Gioca più piena (founder, grill del 27/11/2026: D1–D5, D15, D18). The
// choices of gioca-insieme.js as plain functions, then games.js in a vm with
// the server faked: Voi due, the week, Cosa avete scoperto, Intanto
// rileggete…, the giostra by mood, the games with their last time, +15.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const G = require('../gioca-insieme.js');

const ROOT = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');
const tick = async (n = 12) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };

const choice = (id, q, options, mine, theirs, over = {}) => ({ id, question_text: q, my_prompt: q, answer_kind: 'choice', options, my_answer_index: mine, partner_answer_index: theirs, mechanic: 'reciprocal', depth: 1, source_type: 'curated', ...over });
const open = (id, q, mine, theirs, over = {}) => ({ id, question_text: q, my_prompt: q, answer_kind: 'open', options: [], my_answer_text: mine, partner_answer_text: theirs, mechanic: 'reciprocal', depth: 1, ...over });
const round = (id, family, items, over = {}) => ({ id, game_family: family, reveal_ready: true, my_reveal_seen_at: '2026-11-26T10:00:00Z', completed_at: '2026-11-26T09:00:00Z', items, ...over });

// ------------------------------------------------------------ intesa (D3, D18)

test('intesa: the last comparable answers as «su N domande … uguale M volte», a gentle line before five', () => {
  assert.deepEqual(G.intesa(null), { ready: false, compared: 0, same: 0, line: 'Giocate qualche partita e qui vedrete la vostra intesa' });
  assert.equal(G.intesa({ compared: 4, same: 4 }).ready, false, 'four answers are not enough yet');
  assert.equal(G.intesa({ compared: 20, same: 14 }).line, 'Su 20 domande avete risposto uguale 14 volte');
  assert.equal(G.intesa({ compared: 6, same: 1 }).line, 'Su 6 domande avete risposto uguale 1 volta');
  assert.equal(G.intesa({ compared: 8, same: 0 }).line, 'Su 8 domande avete scelto sempre in modo diverso');
  assert.equal(G.intesa({ compared: 5, same: 9 }).same, 5, 'never more same than compared');
  for (const word of ['vinto', 'punti', 'gara', 'battuto', 'meglio']) assert.doesNotMatch(G.intesa({ compared: 20, same: 3 }).line, new RegExp(word), 'never a competition');
});

// -------------------------------------------------------- days together (D4)

test('week dots: seven days from Monday, lit when you finished a round together, today marked, no penalty', () => {
  const dots = G.weekDots('2026-11-23', ['2026-11-23', '2026-11-25', '2026-11-30'], '2026-11-27');
  assert.equal(dots.length, 7);
  assert.deepEqual(dots.map((d) => d.on), [true, false, true, false, false, false, false], 'a day of another week never lights');
  assert.deepEqual(dots.map((d) => d.today), [false, false, false, false, true, false, false]);
  assert.deepEqual(dots.map((d) => d.future), [false, false, false, false, false, true, true]);
  assert.equal(dots[0].iso, '2026-11-23');
  assert.equal(dots[6].iso, '2026-11-29');
  assert.ok(dots.every((d) => d.letter), 'each day has its letter');
  assert.deepEqual(G.weekDots('', []), []);
  assert.equal(G.weekLine(0), 'Giocate insieme e qui si accende il giorno');
  assert.equal(G.weekLine(1), 'Un giorno insieme questa settimana');
  assert.equal(G.weekLine(4), '4 giorni insieme questa settimana');
  for (const n of [0, 1, 4]) assert.doesNotMatch(G.weekLine(n), /perso|serie|streak|ricomincia/i);
});

test('week dots without the server: the finished rounds the hub lists, in Rome days of this week', () => {
  const recent = [{ completed_at: '2026-11-23T23:30:00Z' }, { completed_at: '2026-11-25T10:00:00Z' }, { completed_at: '2026-11-22T10:00:00Z' }, { completed_at: null }];
  assert.deepEqual(G.daysFromRecent(recent, '2026-11-23'), ['2026-11-24', '2026-11-25'], '23:30Z on Monday is Tuesday in Rome; Sunday 22 is last week');
});

// ------------------------------------------------------- discoveries (D2)

test('discoveries: choices you both made and very short light answers; never a guess, a deep or a couple-written question', () => {
  assert.deepEqual(G.discoveryOf(choice('a', 'Sushi o pizza?', ['Sushi', 'Pizza'], 0, 1), 'swipe'), { question: 'Sushi o pizza?', mine: 'Sushi', theirs: 'Pizza', same: false, kind: 'choice' });
  assert.equal(G.discoveryOf(choice('b', 'Mare?', ['Mare', 'Monti'], 0, 0), 'ridete').same, true);
  assert.equal(G.discoveryOf(choice('c', 'Cosa sceglierebbe?', ['A', 'B'], 0, 1, { mechanic: 'prediction' }), 'quanto_mi_conosci'), null, 'a guess stays in the reveal');
  assert.equal(G.discoveryOf(choice('d', 'Profondo', ['A', 'B'], 0, 1, { depth: 3 }), 'scopritevi'), null, 'an intimate question stays in the reveal');
  assert.equal(G.discoveryOf(choice('e', 'La nostra', ['A', 'B'], 0, 1, { source_type: 'couple_custom' }), 'per_voi'), null);
  assert.equal(G.discoveryOf(choice('f', 'Lunga', ['x'.repeat(41), 'B'], 0, 1), 'ridete'), null);
  assert.equal(G.discoveryOf(choice('g', 'Mezza', ['A', 'B'], 0, null), 'ridete'), null, 'both answers or nothing');
  assert.equal(G.discoveryOf(open('h', 'Un cibo?', 'Gnocchi', 'Ramen'), 'ridete').kind, 'open');
  assert.equal(G.discoveryOf(open('i', 'Un cibo?', 'Gnocchi', 'Ramen'), 'rivivete'), null, 'free answers only from light games');
  assert.equal(G.discoveryOf(open('j', 'Un ricordo?', 'Una sera lunghissima in cui abbiamo parlato di tutto', 'Il mare'), 'ridete'), null, 'long free text stays out');
  assert.equal(G.discoveryOf(open('k', 'Un ricordo?', 'Il mare', 'La neve', { depth: 2 }), 'confrontatevi'), null);
});

test('discoveries: only rounds you opened, light games first, one per round, at most three, a new choice every day', () => {
  const recent = [
    { id: 'q', game_family: 'quanto_mi_conosci', reveal_ready: true, my_reveal_seen_at: 'x' },
    { id: 'new', game_family: 'ridete', reveal_ready: true, my_reveal_seen_at: null },
    { id: 's', game_family: 'scopritevi', reveal_ready: true, my_reveal_seen_at: 'x' },
    { id: 'w', game_family: 'swipe', reveal_ready: true, my_reveal_seen_at: 'x' },
    { id: 'o', game_family: 'ridete', reveal_ready: false },
  ];
  assert.deepEqual(G.discoverySessions(recent, 3), ['w', 's', 'q'], 'an unopened reveal is never read: no spoilers');
  const sessions = [
    round('q', 'quanto_mi_conosci', [choice('q1', 'Q1', ['A', 'B'], 0, 1)]),
    round('s', 'scopritevi', [choice('s1', 'S1', ['A', 'B'], 0, 1), choice('s2', 'S2', ['A', 'B'], 1, 1)]),
    round('w', 'swipe', [choice('w1', 'W1', ['A', 'B'], 0, 0), choice('w2', 'W2', ['A', 'B'], 0, 1), choice('w3', 'W3', ['A', 'B'], 1, 0)]),
    round('u', 'ridete', [choice('u1', 'U1', ['A', 'B'], 0, 1)], { my_reveal_seen_at: null }),
  ];
  const one = G.pickDiscoveries(sessions, { day: '2026-11-27' });
  assert.equal(one.length, 3);
  assert.deepEqual(one.map((d) => d.sessionId), ['w', 's', 'q'], 'one per round, the lightest first');
  assert.ok(!one.some((d) => d.sessionId === 'u'));
  const days = new Set(['2026-11-27', '2026-11-28', '2026-11-29'].map((day) => G.pickDiscoveries(sessions, { day }).map((d) => d.question).join('|')));
  assert.ok(days.size > 1, 'they rotate with the day');
  assert.equal(G.pickDiscoveries([sessions[2]], { day: '2026-11-27', max: 3 }).length, 3, 'a single round can fill the three');
  assert.deepEqual(G.pickDiscoveries([], {}), []);
});

test('rileggete (D5): the newest answer where you chose differently', () => {
  const older = round('a', 'ridete', [choice('a1', 'Vecchia', ['A', 'B'], 0, 1)], { completed_at: '2026-11-20T10:00:00Z' });
  const newer = round('b', 'swipe', [choice('b1', 'Uguale', ['A', 'B'], 1, 1), choice('b2', 'Previsione', ['A', 'B'], 0, 1, { mechanic: 'prediction' }), choice('b3', 'Nuova', ['A', 'B'], 1, 0)], { completed_at: '2026-11-26T10:00:00Z' });
  const found = G.latestDifferent([older, newer]);
  assert.deepEqual([found.session.id, found.item.id], ['b', 'b3']);
  assert.equal(G.latestDifferent([round('c', 'ridete', [choice('c1', 'X', ['A', 'B'], 0, 0)])]), null);
});

// ------------------------------------------------------- the moods (D15)

test('giostra by mood: both happy → a game to laugh first, one of you down → a tender one, otherwise today', () => {
  assert.equal(G.moodLead('felice', 'innamorato'), 'ridere');
  assert.equal(G.moodLead('festa', 'felice'), 'ridere');
  assert.equal(G.moodLead('felice', ''), '', 'one mood unknown: today\'s order');
  assert.equal(G.moodLead('innamorato', 'stanco'), 'tenero', 'one of you tired wins over the other happy');
  assert.equal(G.moodLead('giu', ''), 'tenero');
  assert.equal(G.moodLead('malato', 'lavoro'), 'tenero');
  assert.equal(G.moodLead('lavoro', 'viaggio'), '');
  const today = ['per_voi', 'scopritevi', 'swipe'];
  assert.deepEqual(G.giostraOrder(today, ''), today);
  assert.deepEqual(G.giostraOrder(today, 'ridere'), ['ridete', 'per_voi', 'scopritevi', 'swipe'], 'the rest stays stable');
  assert.deepEqual(G.giostraOrder(['per_voi', 'rivivete', 'swipe'], 'tenero'), ['rivivete', 'per_voi', 'swipe'], 'the game of the day moves first, once');
});

test('Tutti i giochi: the last time and the same answers, when known', () => {
  const now = new Date('2026-11-27T10:00:00Z');
  assert.equal(G.lastPlayedLine('2026-11-27T08:00:00Z', now), 'Giocato oggi');
  assert.equal(G.lastPlayedLine('2026-11-26T23:30:00Z', now), 'Giocato oggi', '00:30 in Rome is already the 27th');
  assert.equal(G.lastPlayedLine('2026-11-26T22:30:00Z', now), 'Giocato ieri', '23:30 in Rome is still the 26th');
  assert.equal(G.lastPlayedLine('2026-11-26T10:00:00Z', now), 'Giocato ieri');
  assert.equal(G.lastPlayedLine('2026-11-23T10:00:00Z', now), 'Giocato 4 giorni fa');
  assert.match(G.lastPlayedLine('2026-11-02T10:00:00Z', now), /^Giocato il 2 novembre$/);
  assert.equal(G.lastPlayedLine(null, now), '');
  assert.equal(G.sameShare({ compared: 10, same: 7 }), '70% risposte uguali');
  assert.equal(G.sameShare({ compared: 3, same: 3 }), '', 'too few to say');
  assert.equal(G.sameShare(null), '');
});

// ------------------------------------------------------- games.js in a vm

const weekly = { week_start: '2026-11-23', next_unlock: '2026-11-30', assigned_role: 'francesco', next_role: 'beatrice', my_turn: false, created: false, created_by_me: false, partner_left_question: false, my_question: null };
const allowance = (used) => ({ day: '2026-11-27', week_start: '2026-11-23', resets_on: '2026-11-28', period: 'day', per_voi_used: used, free_used: used, free_limit: 3, used, limit: 3, per_voi_available: used < 3, free_available: used < 3, open_count: 0, open_limit: 3, families: {} });
const seen = (id, family, completed) => ({ id, game_family: family, item_count: 4, my_answered_count: 4, my_complete: true, partner_complete: true, reveal_ready: true, my_reveal_seen_at: '2026-11-26T12:00:00Z', started_by_role: 'francesco', started_at: completed, completed_at: completed });
const SESSIONS = {
  w: round('w', 'swipe', [choice('w1', 'Sushi o pizza?', ['Sushi', 'Pizza'], 0, 1), choice('w2', 'Mare o montagna?', ['Mare', 'Montagna'], 0, 0)], { completed_at: '2026-11-26T09:00:00Z' }),
  r: round('r', 'ridete', [choice('r1', 'Chi si perde prima in un IKEA?', ['Io', 'Tu'], 0, 1)], { completed_at: '2026-11-25T09:00:00Z' }),
};
const INTESA = { compared: 20, same: 14, week_start: '2026-11-23', days: ['2026-11-23', '2026-11-26'], families: { ridete: { last_at: '2026-11-25T09:00:00Z', compared: 10, same: 7 } } };

function hub({ home, intesa = INTESA, moods = null, intesaError = null } = {}) {
  const nodes = {};
  const node = (id) => (nodes[id] ||= {
    id, innerHTML: '', dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {}, removeAttribute() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
  });
  const calls = [];
  const rpc = {
    get_game_v2_home: () => home,
    get_game_intesa_v1: () => { if (intesaError) throw intesaError; return intesa; },
    get_game_session: ({ target_session_id }) => SESSIONS[target_session_id] || null,
    mark_game_session_reveal_seen: ({ target_session_id }) => ({ ...SESSIONS[target_session_id], my_reveal_seen_at: 'now' }),
  };
  const window = {
    usProfile: { role: 'francesco', couple_id: 'c' }, crypto: { randomUUID: () => 'r' }, go() {},
    UsMemberStatus: moods ? { widgetState: () => ({ me: { status: moods[0] }, partner: { status: moods[1] } }) } : undefined,
    UsPersonaggi: { character: (role, o) => `<svg class="us-char" data-role="${role}" data-reaction="${o.reaction ?? 'mood'}"></svg>` },
  };
  const sandbox = {
    window,
    document: { readyState: 'complete', hidden: false, getElementById: node, addEventListener() {}, querySelector: () => ({ id: 'quiz' }) },
    sb: { rpc: async (name, args) => { calls.push(name); try { return { data: await rpc[name]?.(args) ?? null, error: null }; } catch (error) { return { data: null, error }; } } },
    toast() {}, FormData: class {}, console: { warn() {} }, setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 1; }, setInterval: () => 1,
  };
  node('quizHub'); node('usGameV2Panel');
  require('./helpers/identity-fixture').install(sandbox);
  vm.runInNewContext(read('gioca-insieme.js'), sandbox);
  vm.runInNewContext(read('games.js'), sandbox);
  return { nodes, calls, api: window.USGameV2, html: async () => { await tick(); return nodes.quizHub.innerHTML; } };
}
const homeOf = (over = {}) => ({ my_role: 'francesco', partner_role: 'beatrice', weekly, per_voi: { state: 'idle' }, open_rounds: [], recent: [], allowance: allowance(0), ...over });
const slides = (html) => [...(html.match(/<div class="us-gv2-giostra-track"[\s\S]*?<div class="us-gv2-giostra-dots"/)?.[0] || '').matchAll(/data-gv2-slide="([a-z_]+)"/g)].map((m) => m[1]);

test('hub (D1): tokens and the week, Voi due, Oggi per voi, Cosa avete scoperto, Tutti i giochi, the diary at the bottom', async () => {
  const h = hub({ home: homeOf({ allowance: allowance(1), recent: [seen('w', 'swipe', '2026-11-26T09:00:00Z'), seen('r', 'ridete', '2026-11-25T09:00:00Z')] }) });
  const html = await h.html();
  const at = (needle) => html.indexOf(needle);
  const order = ['id="usGv2Tokens"', 'class="us-gv2-giorni"', 'class="us-gv2-voi"', 'class="us-gv2-choose"', 'class="us-gv2-scoperte"', 'class="us-gv2-all"', 'class="us-gv2-done"'];
  assert.ok(order.every((n) => at(n) >= 0), JSON.stringify(order.map(at)));
  assert.deepEqual(order.map(at), [...order.map(at)].sort((a, b) => a - b));
  // D3, D18: the intesa, never who won; both characters
  const voi = html.match(/<section class="us-gv2-voi"[\s\S]*?<\/section>/)[0];
  assert.match(voi, /<h3 class="us-gv2-kicker" id="usGv2VoiTitle">Voi due<\/h3><p class="us-gv2-voi-line">Su 20 domande avete risposto uguale 14 volte<\/p>/);
  assert.match(voi, /data-role="francesco"[\s\S]*data-role="beatrice"/, 'the two of you');
  assert.equal((voi.match(/<i data-on="true"><\/i>/g) || []).length, 14);
  // D4: the week beside the tokens
  const week = html.match(/<div class="us-gv2-giorni">[\s\S]*?<\/div>/)[0];
  assert.deepEqual([...week.matchAll(/<i data-on="(true|false)"/g)].map((m) => m[1]), ['true', 'false', 'false', 'true', 'false', 'false', 'false']);
  assert.match(week, /data-today="true"/);
  assert.match(week, /role="img" aria-label="Questa settimana avete giocato insieme: [^"]+"/);
  assert.match(week, /<small>2 giorni insieme questa settimana<\/small>/);
  // D2: answers from opened rounds; a tap opens the round again
  const found = html.match(/<section class="us-gv2-scoperte"[\s\S]*?<\/section>/)[0];
  assert.match(found, /Cosa avete scoperto/);
  assert.match(found, /data-gv2-session="w"/);
  assert.match(found, /<span class="is-tu"><i>Tu<\/i> <b translate="no">[^<]+<\/b><\/span><span class="is-pa"><i translate="no">Beatrice<\/i>|<i>Tutti e due<\/i>/);
  // the games: each with its last time and same answers when known
  const ridete = html.slice(at('class="us-gv2-all"')).match(/data-gv2-family="ridete"[\s\S]*?<\/button>/)[0];
  assert.match(ridete, /<span class="us-gv2-game-meta"><i>Giocato [^<]+<\/i><i>70% risposte uguali<\/i><\/span>/);
  assert.match(html, /<summary><span>Il diario delle partite<\/span><b>2<\/b><\/summary>/);
  assert.doesNotMatch(html, /data-wc-slot/, 'D6: the photo challenge stays hidden');
  assert.ok(h.calls.includes('get_game_intesa_v1'));
});

test('hub: a new couple sees the gentle intesa line and no discoveries; nothing invented', async () => {
  const html = await hub({ home: homeOf(), intesa: { compared: 0, same: 0, week_start: '2026-11-23', days: [], families: {} } }).html();
  assert.match(html, /data-gv2-intesa="empty"[\s\S]*Giocate qualche partita e qui vedrete la vostra intesa/);
  assert.doesNotMatch(html, /us-gv2-scoperte|us-gv2-rileggete|us-gv2-intesa"/);
  assert.match(html, /<small>Giocate insieme e qui si accende il giorno<\/small>/);
});

test('hub: an older server without the intesa RPC asks once, then reads the week from the recent rounds', async () => {
  const h = hub({ home: homeOf({ recent: [seen('w', 'swipe', '2026-11-26T09:00:00Z')] }), intesaError: { code: 'PGRST202', message: 'Could not find the function public.get_game_intesa_v1' } });
  const html = await h.html();
  assert.match(html, /Giocate qualche partita e qui vedrete la vostra intesa/);
  assert.match(html, /<small>Un giorno insieme questa settimana<\/small>/);
  await h.api.load(); await tick();
  assert.equal(h.calls.filter((c) => c === 'get_game_intesa_v1').length, 1);
});

test('hub (D5): tokens spent — Intanto rileggete… with the latest different answer and the move of a result; sleepy characters', async () => {
  const spent = homeOf({ allowance: allowance(3), recent: [seen('w', 'swipe', '2026-11-26T09:00:00Z'), seen('r', 'ridete', '2026-11-25T09:00:00Z')] });
  const html = await hub({ home: spent }).html();
  const card = html.match(/<section class="us-gv5-move us-gv2-rileggete"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(card, /<span class="us-gv2-kicker">Intanto rileggete…<\/span>/);
  assert.match(card, /Sushi o pizza\?[\s\S]*<dd>Sushi<\/dd>[\s\S]*<dd>Pizza<\/dd>/);
  assert.match(card, /<h3 id="usGv2RileggeteTitle">Ne parlate stasera\?<\/h3>/);
  assert.match(card, /data-gv2-action="leave-something"[\s\S]*data-gv2-action="think"/);
  assert.match(card, /data-gv2-session="w">Rivedi la partita<\/button>/);
  assert.ok(html.indexOf('us-gv2-rileggete') < html.indexOf('us-gv2-choose'), 'before the spent games, not a grey page');
  assert.match(html.match(/<section class="us-gv2-voi"[\s\S]*?<\/section>/)[0], /data-reaction="sera"/, 'sleepy when the tokens are finished');
  assert.match(html, /<b>Domani altre 3<\/b>/, 'and when they come back');
});

test('hub (D15): the moods choose the first card; the rest of the giostra stays in today\'s order', async () => {
  // 2026-11-27: the game of the day is a fixed rotation (dailyPick); read it from a plain render.
  const plain = slides(await hub({ home: homeOf() }).html());
  assert.equal(plain.length, 3);
  const happy = slides(await hub({ home: homeOf(), moods: ['felice', 'innamorato'] }).html());
  assert.equal(happy[0], 'ridete');
  assert.deepEqual(happy.filter((s) => s !== 'ridete'), plain.filter((s) => s !== 'ridete'));
  const low = slides(await hub({ home: homeOf(), moods: ['stanco', 'felice'] }).html());
  assert.equal(low[0], 'rivivete');
  assert.deepEqual(low.filter((s) => s !== 'rivivete'), plain.filter((s) => s !== 'rivivete'));
  assert.deepEqual(slides(await hub({ home: homeOf(), moods: ['lavoro', 'felice'] }).html()), plain);
  assert.deepEqual(slides(await hub({ home: homeOf({ allowance: allowance(3) }), moods: ['stanco', 'felice'] }).html()), plain, 'with the tokens spent nothing can start: today\'s order');
  const html = await hub({ home: homeOf(), moods: ['felice', 'felice'] }).html();
  if (!plain.includes('ridete')) assert.match(html, /data-gv2-slide="ridete"[\s\S]*?<span class="us-gv2-carta-badge" aria-hidden="true">Per ridere<\/span>/);
});

test('Vi aspetta: both characters, happy when the answers are ready', async () => {
  const ready = { ...seen('q', 'quanto_mi_conosci', '2026-11-27T08:00:00Z'), my_reveal_seen_at: null };
  const html = await hub({ home: homeOf({ recent: [ready] }) }).html();
  const row = html.match(/<button type="button" class="us-gv2-aspetta"[\s\S]*?<\/button>/)[0];
  assert.match(row, /data-role="francesco" data-reaction="cuore"[\s\S]*data-role="beatrice" data-reaction="cuore"/);
});

test('reveal (D4): the end of a result says +15 for your level, the points the server already gave', async () => {
  const h = hub({ home: homeOf() });
  await tick();
  await h.api.openSession('w');
  await tick();
  const panel = h.nodes.usGameV2Panel.innerHTML;
  assert.match(panel, /<p class="us-gv5-livello">[\s\S]*<span>\+15 per il vostro livello<\/span><\/p>\s*<div class="us-gv2-actions is-single">/);
  assert.match(read('games.js'), /const GAME_XP=15;/);
  assert.match(read('supabase/migrations/20261004000000_us_2_0_baseline.sql'), /progression_award\(new\.couple_id, null, 'game', new\.id::text, 15,/, 'the same 15 the server awards');
});

test('the new module is shipped like every script: index, precache and both builds', () => {
  assert.match(read('index.html'), /<script defer src="\/gioca-insieme\.js\?v=[^"]+"><\/script>\s*<script defer src="\/games\.js/);
  assert.match(read('service-worker.js'), /versioned\("\/gioca-insieme\.js"\)/);
  for (const f of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.match(read(f), /'gioca-insieme\.js'/);
  assert.doesNotMatch(read('gioca-insieme.js'), /localStorage|sessionStorage|indexedDB|sb\.rpc/, 'no storage, no server: choices only');
});
