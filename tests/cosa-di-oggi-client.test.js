// «La cosa di oggi» on the Domanda di oggi card (founder, 13/11/2026,
// docs/DECISIONS.md): what the card says after the answers, in the first week
// and with the streak, and what is celebrated. cosa-di-oggi.js in a sandbox.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function load({ rpc, timers = false } = {}) {
  const window = {
    usProfile: { id: 'f', couple_id: 'c' },
    usIdentity: () => ({ ownName: 'Francesco', partnerName: 'Bea' }),
    UsTodayPriority: { refreshed: 0, refresh() { this.refreshed++; } },
    sb: { calls: [], rpc(name, args) { this.calls.push([name, args]); return Promise.resolve(rpc ? rpc(name, args) : { data: null, error: null }); } },
    document: null,
  };
  const context = vm.createContext({ window, console: { warn() {} }, Intl, Date, Promise, JSON, Math, setTimeout: timers ? setTimeout : () => 0, clearTimeout, Object, String, Number, Array });
  vm.runInContext(read('cosa-di-oggi.js'), context);
  return { api: window.UsCosaDiOggi, window };
}

const TODAY = '2026-11-20';
const revealed = { questionId: 'q', question: 'Cosa vorresti rifare con me?', kicker: 'La domanda di oggi', state: 'revealed', meta: 'Svelate · domani una nuova domanda', glyph: 'noi', cta: 'Rivedi', attention: false };
const answer = { ...revealed, state: 'answer', meta: 'Una domanda, due risposte', cta: 'Rispondi', attention: true };
const s = (over = {}) => ({ streak: 12, record: 12, best_before: 5, today: { counted: true, me: true, partner: true, my_think: false }, week: null, ...over });
const week = (over = {}) => ({ started_on: '2026-11-17', ends_on: '2026-12-07', total: 7, done: 2, current: 'game', ready: true, done_today: false, all_done: false, finished_on: null, steps: [], ...over });
const plain = (x) => JSON.parse(JSON.stringify(x));
const text = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('after the answers: a Ti penso to send, then the day closed', () => {
  const { api } = load();
  const think = api.decorate(revealed, s(), { partner: 'Bea', today: TODAY });
  assert.equal(think.look, 'think');
  assert.equal(think.kicker, 'La cosa di oggi');
  assert.equal(think.question, 'Manda un Ti penso a Bea');
  assert.equal(think.action, 'think');
  assert.match(text(think.ctaHtml), /Ti penso/);
  assert.match(text(think.footHtml), /12 giorni di fila/);
  const closed = api.decorate(revealed, s({ today: { counted: true, me: true, partner: true, my_think: true } }), { partner: 'Bea', today: TODAY });
  assert.equal(closed.look, 'closed');
  assert.equal(closed.question, 'Oggi c’eravate voi due ♡');
  assert.equal(closed.action, undefined, 'a tap opens the answers again');
  assert.match(text(closed.ctaHtml), /^Rivedi$/, 'a button, like the other Oggi cards');
  assert.equal(closed.state, 'revealed', 'it can still be swiped away for today');
});

test('before the answers the card is the question; the streak replaces the generic line', () => {
  const { api } = load();
  const a = api.decorate(answer, s(), { partner: 'Bea', today: TODAY });
  assert.equal(a.question, answer.question);
  assert.equal(a.cta, 'Rispondi');
  assert.match(text(a.footHtml), /^12 giorni di fila$/);
  const invited = { ...answer, state: 'invited', meta: 'Bea ha già risposto · tocca a te' };
  assert.deepEqual(api.decorate(invited, s(), { today: TODAY }), invited, 'whose turn it is stays');
  assert.deepEqual(api.decorate({ ...answer, state: 'waiting' }, s(), { today: TODAY }).footHtml, undefined);
  assert.equal(api.decorate(answer, s({ streak: 1 }), { today: TODAY }), answer, 'no streak line for one day');
  assert.equal(api.decorate(answer, null), answer, 'nothing read yet: the card as it was');
  assert.equal(api.decorate(null, s()), null);
});

test('first week: the step after the question, «Fatto» with tomorrow, the end', () => {
  const { api } = load();
  const step = api.decorate(revealed, s({ week: week() }), { partner: 'Bea', today: TODAY });
  assert.deepEqual([step.look, step.kicker, step.question, step.action], ['step', 'La vostra prima settimana', 'Fate la vostra prima partita', 'step:game']);
  assert.match(step.footHtml, /2 passi su 7/);
  assert.equal((step.footHtml.match(/class="on"/g) || []).length, 2);
  assert.equal((step.footHtml.match(/class="now"/g) || []).length, 1);
  const think = api.decorate(revealed, s({ week: week({ current: 'think', done: 1 }) }), { partner: 'Bea', today: TODAY });
  assert.equal(think.question, 'Manda il primo Ti penso a Bea');
  assert.equal(think.action, 'step:think');
  const left = api.decorate(revealed, s({ week: week({ current: 'left', done: 5 }) }), { partner: 'Bea', today: TODAY });
  assert.equal(left.question, 'Lascia qualcosa da aprire a Bea');
  const done = api.decorate(revealed, s({ week: week({ current: 'moment', done: 3, ready: false, done_today: true }) }), { partner: 'Bea', today: TODAY });
  assert.deepEqual([done.look, done.question, done.action], ['done', 'Fatto ♡', undefined]);
  assert.equal(text(done.subHtml), 'Domani: il primo ricordo');
  const end = api.decorate(revealed, s({ week: week({ current: null, all_done: true, done: 7, finished_on: TODAY }) }), { partner: 'Bea', today: TODAY });
  assert.deepEqual([end.look, end.question], ['finished', 'Settimana finita ♡']);
  assert.match(text(end.subHtml), /\+100 punti Sintonia/);
  // The day after it ended, back to the usual card.
  const after = api.decorate(revealed, s({ week: week({ current: null, all_done: true, done: 7, finished_on: '2026-11-19' }) }), { partner: 'Bea', today: TODAY });
  assert.equal(after.look, 'think');
  // During the week the question keeps the dots, never «giorno 3 di 7».
  const q = api.decorate(answer, s({ week: week() }), { today: TODAY });
  assert.match(q.footHtml, /us-cdo-dots/);
  assert.doesNotMatch(text(q.footHtml), /giorno/i);
});

test('names and words are escaped', () => {
  const { api } = load();
  const m = api.decorate(revealed, s({ week: week({ current: 'left' }) }), { partner: '<img src=x>', today: TODAY });
  assert.equal(m.question, 'Lascia qualcosa da aprire a <img src=x>', 'plain text: app.js escapes the question');
  assert.doesNotMatch(m.ctaHtml + m.footHtml, /<img/);
});

test('what is celebrated: streak +1, the closed day, a step, the end, a record, a milestone', () => {
  const { api } = load();
  const a = s({ streak: 6, best_before: 6, today: { counted: false, me: true, partner: false, my_think: true }, week: week({ done: 2 }) });
  const b = s({ streak: 7, best_before: 6, today: { counted: true, me: true, partner: true, my_think: true }, week: week({ done: 3 }) });
  assert.deepEqual(plain(api.changes(a, b, TODAY)), ['streak', 'closed', 'step', 'record', 'milestone:7']);
  assert.deepEqual(plain(api.changes(b, b, TODAY)), []);
  assert.deepEqual(plain(api.changes(null, b, TODAY)), [], 'the first read celebrates nothing');
  const fin = s({ week: week({ all_done: true, finished_on: TODAY, done: 7 }) });
  assert.ok(api.changes(s({ week: week({ done: 6 }) }), fin, TODAY).includes('finished'));
  assert.deepEqual(plain(api.changes(s({ streak: 2, best_before: 1 }), s({ streak: 3, best_before: 1 }), TODAY)), ['streak'], 'no record party for short streaks');
});

test('the server is read with the widget state, at most every 20 s unless forced', async () => {
  const data = s();
  const { api, window } = load({ rpc: () => ({ data, error: null }) });
  await api.refresh();
  assert.deepEqual(plain(window.sb.calls), [['cosa_di_oggi', { widget: 'unsupported' }]]);
  assert.equal(window.UsTodayPriority.refreshed, 1, 'a change paints Oggi again');
  await api.refresh();
  assert.equal(window.sb.calls.length, 1);
  await api.refresh({ force: true });
  assert.equal(window.sb.calls.length, 2);
  assert.equal(window.UsTodayPriority.refreshed, 1, 'the same state paints nothing');
  window.UsWidgets = { isAvailable: () => true, installed: async () => ({ installed: { photo: true } }) };
  await api.refresh({ force: true });
  assert.deepEqual(plain(window.sb.calls[2]), ['cosa_di_oggi', { widget: 'done' }]);
  window.UsWidgets = { isAvailable: () => true, installed: async () => ({ installed: {} }) };
  await api.refresh({ force: true });
  assert.deepEqual(plain(window.sb.calls[3]), ['cosa_di_oggi', { widget: 'todo' }]);
});

test('a bridge or a read that never answers does not block the next reads', async () => {
  let hang = true;
  const { api, window } = load({ timers: true, rpc: () => (hang ? new Promise(() => {}) : { data: s(), error: null }) });
  api.limits.widget = 30;
  api.limits.read = 60;
  window.UsWidgets = { isAvailable: () => true, installed: () => new Promise(() => {}) };
  assert.equal(await api.refresh({ force: true }), null, 'the hanging read gives up');
  assert.deepEqual(plain(window.sb.calls[0]), ['cosa_di_oggi', { widget: 'todo' }], 'a silent bridge counts as no widget');
  hang = false;
  await api.refresh({ force: true });
  assert.equal(api.state.streak, 12, 'the next read goes through');
});

test('a forced read during an older one reads again after it', async () => {
  let n = 0;
  const { api, window } = load({ rpc: () => ({ data: s({ today: { counted: true, me: true, partner: true, my_think: ++n > 1 } }), error: null }) });
  const first = api.refresh({ force: true });
  const after = api.refresh({ force: true });
  await first;
  await after;
  assert.equal(window.sb.calls.length, 2);
  assert.equal(api.state.today.my_think, true, 'the answer from after my gesture wins');
});

test('wiring: the card decorates, routes its own gesture and the script ships everywhere', () => {
  const app = read('app.js');
  const render = app.slice(app.indexOf('function renderDailyRitual'), app.indexOf('window.UsDailyRitual=Object.freeze'));
  assert.match(render, /window\.UsCosaDiOggi\.decorate\(model\)/);
  assert.ok(render.indexOf('decorate(model)') < render.indexOf('dailyRitualDismissedId()'), 'a swiped-away day stays away');
  assert.match(app, /const action=card\.dataset\.cdoAction;[\s\S]{0,200}event\.stopImmediatePropagation\(\);\s*window\.UsCosaDiOggi\.act\(action\);/);
  const swipe = app.slice(app.indexOf('function bindDailyRitualSwipe'), app.indexOf('function renderDailyRitual'));
  assert.ok(swipe.indexOf('if(moved){event.preventDefault()') < swipe.indexOf('card.dataset.cdoAction'), 'a swipe is never a gesture');
  assert.match(read('index.html'), /<script defer src="\/cosa-di-oggi\.js\?v=[^"]+"><\/script>/);
  assert.match(read('service-worker.js'), /versioned\("\/cosa-di-oggi\.js"\)/);
  assert.match(read('scripts/build-cloudflare-pages.mjs'), /'cosa-di-oggi\.js'/);
  assert.match(read('scripts/build-capacitor-web.mjs'), /'cosa-di-oggi\.js'/);
  const css = read('dc-oggi.css');
  assert.match(css, /:root\[data-us-motion="reduced"\] :is\(\.us-cdo-fly,\.us-cdo-check,\.us-cdo-rain\)\{display:none\}/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\s*:is\(\.us-cdo-fly,\.us-cdo-check,\.us-cdo-rain\)\{display:none\}/);
});
