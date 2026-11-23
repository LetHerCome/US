// Noi nuova (founder, 03/11/2026, docs/DECISIONS.md «Noi nuova, lavagna e
// sfida della settimana»; tavola Main.dc.html): the calendar is the
// protagonist. Big squares without circles, dots or key; every commitment is
// a label with its name in the colour of whoever put it; a day with a Ricordo
// is its photo; today bold, the chosen day framed; under it the agenda of that
// day; the views «Mese» and «Prossimi», with the recurring dates too.
// noi-v2.js runs in a vm with a tiny DOM and a fixed "now".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const ME = { id: 'me', couple_id: 'c1', role: 'francesco' };
const PROFILES = [{ id: 'me', display_name: 'Luca', role: 'francesco', couple_id: 'c1' }, { id: 'you', display_name: 'Sara', role: 'beatrice', couple_id: 'c1' }];

function fixedDate(nowISO) {
  const now = new Date(nowISO).getTime();
  return class extends Date {
    constructor(...args) { if (args.length) super(...args); else super(now); }
    static now() { return now; }
  };
}

function makeEl(id) {
  const classes = new Set();
  const attrs = {};
  const handlers = {};
  return {
    id, hidden: false, textContent: '', innerHTML: '', dataset: {}, style: {},
    classList: { add: (...n) => n.forEach((x) => classes.add(x)), remove: (...n) => n.forEach((x) => classes.delete(x)), contains: (n) => classes.has(n), toggle: (n, f) => { if (f === undefined ? !classes.has(n) : f) classes.add(n); else classes.delete(n); } },
    setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: (k) => attrs[k] ?? null,
    addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); }, handlers,
    querySelector: () => null, querySelectorAll: () => [], scrollIntoView() {}, focus() {}, appendChild() {}
  };
}

function load({ now, month = () => null, range = () => null, domain = null }) {
  const els = new Map();
  const $ = (id) => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); };
  const calls = [];
  const reads = [];
  const window = {
    usProfile: ME,
    matchMedia: () => ({ matches: true }),
    addEventListener() {},
    go: (page) => calls.push(['go', page]),
    closeNoiSection: () => calls.push(['closeNoiSection']),
    openNoiSection: (view) => calls.push(['openNoiSection', view]),
    openEventEditor: (...args) => calls.push(['openEventEditor', ...args]),
    openMomentViewer: (card) => calls.push(['openMomentViewer', card.dataset.momentId]),
    UsCalendarLinks: { openEntry: (...args) => calls.push(['openEntry', ...args]), createForDate: (day) => calls.push(['createForDate', day]) },
    ...(domain ? { UsCalendarDomain: domain } : {}),
    USNoiCalendarRead: {
      readMonth: async (year, m) => { reads.push(['month', year, m]); return month(year, m); },
      readRange: async (from, to) => { reads.push(['range', from, to]); return range(from, to); },
      freeEvenings: () => []
    }
  };
  const document = { readyState: 'complete', getElementById: $, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, hidden: false };
  window.document = document;
  const context = vm.createContext({
    window, document, console: { info() {}, warn() {} }, Date: fixedDate(now), Intl, Math, Map, Set, Array, Object, String, Number, Promise, JSON,
    MutationObserver: class { observe() {} }, setTimeout: () => 0, clearTimeout() {}
  });
  context.globalThis = context;
  vm.runInContext(read('noi-v2.js'), context, { filename: 'noi-v2.js' });
  const tap = (id) => $(id).handlers.click.forEach((fn) => fn({ target: { closest: () => null } }));
  // A tap inside the Noi section on whatever the selector finds.
  const click = (pick) => $('usNoiV2').handlers.click.forEach((fn) => fn({ target: { closest: (sel) => pick(sel) } }));
  const last = () => JSON.parse(JSON.stringify(calls.at(-1)));
  return { api: window.USNoiV2, $, calls, reads, tap, click, last };
}
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
const timed = (title, owner, type, date, h1, h2) => ({ id: `${title}-${date}`, couple_id: 'c1', entry_type: type, owner_id: type === 'shared' ? null : owner, title, is_all_day: false, starts_at: new Date(`${date}T${h1}:00`).toISOString(), ends_at: new Date(`${date}T${h2}:00`).toISOString(), dates: [date] });
const cell = (html, day) => html.match(new RegExp(`<button[^>]*data-noi-day="${day}"[\\s\\S]*?</button>`))?.[0] || '';

const NOVEMBER = {
  appointments: [
    timed('Yoga', 'you', 'personal', '2026-11-24', '19:00', '20:00'),
    timed('Cena da noi', null, 'shared', '2026-11-24', '21:00', '23:00'),
    timed('Dentista', 'me', 'personal', '2026-11-05', '10:30', '11:30'),
    timed('Concerto', null, 'shared', '2026-11-26', '21:00', '23:30'),
    timed('Calcetto', 'me', 'personal', '2026-11-26', '18:30', '20:00'),
    timed('Pilates', 'you', 'personal', '2026-11-26', '19:00', '20:00')
  ],
  events: [{ id: 'ev1', title: 'Gita al lago', event_date: '2026-11-07', event_time: null, recurs_yearly: false }],
  profiles: PROFILES,
  startedOn: '2024-01-10',
  moments: [{ id: 'm1', day: '2026-11-07', caption: 'Gita al lago', created_by: 'you', storage_path: 'c1/you/a.webp', thumb: 'https://media.test/a-thumb.webp' }]
};

test('a day is a big square: each commitment a label with its name, in the colour of whoever put it; at most two, then +n', async () => {
  const h = load({ now: '2026-11-24T10:00:00', month: () => NOVEMBER });
  h.api.openCalendar({ date: '2026-11-24' });
  await settle();
  const grid = h.$('usNoiV2Content').innerHTML;
  const today = cell(grid, '2026-11-24');
  assert.match(today, /<span class="us-noi-v2-bar" data-owner="partner" translate="no">Yoga<\/span>/, 'Sara put it: her colour');
  assert.match(today, /<span class="us-noi-v2-bar" data-owner="noi" translate="no">Cena da noi<\/span>/, 'shared: the colour of both');
  assert.match(cell(grid, '2026-11-05'), /data-owner="tu" translate="no">Dentista</, 'mine: my colour');
  const busy = cell(grid, '2026-11-26');
  assert.equal((busy.match(/class="us-noi-v2-bar"/g) || []).length, 2, 'two labels fit in a square');
  assert.match(busy, /<span class="us-noi-v2-more">\+1<\/span>/);
  assert.match(busy, /aria-label="[^"]*3 impegni"/);
  // Staging, 04/11/2026: «Mesiversario» became «Mesi…»; in a square the
  // couple's dates say how much, on two lines if needed.
  assert.match(cell(grid, '2026-11-10'), /<span class="us-noi-v2-bar is-milestone" data-owner="noi">34 mesi<\/span>/, 'the mesiversario is a short label (translated)');
  for (const gone of ['us-noi-v2-day-marks', 'us-noi-v2-legend', 'us-noi-v2-sel', '<i data-owner']) assert.ok(!grid.includes(gone), `no ${gone}`);
});

test('the couple\'s dates in a square say how much; a hundred-days milestone does not repeat itself in the agenda', async () => {
  // 4100 days on 20 November 2026, the mesiversario on the 30th.
  const data = { appointments: [], events: [], profiles: PROFILES, startedOn: '2015-08-30', moments: [] };
  const h = load({ now: '2026-11-04T10:00:00', month: () => data, range: () => data, domain: require('../calendar-domain.js') });
  h.api.openCalendar({ date: '2026-11-20' });
  await settle();
  const grid = h.$('usNoiV2Content').innerHTML;
  assert.match(cell(grid, '2026-11-20'), /<span class="us-noi-v2-bar is-milestone" data-owner="noi">4100 giorni<\/span>/);
  assert.match(cell(grid, '2026-11-30'), /<span class="us-noi-v2-bar is-milestone" data-owner="noi">135 mesi<\/span>/);
  const detail = h.$('usNoiV2Detail').innerHTML;
  assert.match(detail, /<b>4100 giorni ♡<\/b>/);
  assert.doesNotMatch(detail, /4100 giorni insieme/, 'the title says it once');

  h.tap('usNoiV2ModeList');
  await settle();
  const list = h.$('usNoiV2Content').innerHTML;
  assert.equal((list.match(/4100 giorni/g) || []).length, 1, '«Prossimi»: «4100 giorni ♡» and nothing else about it');
  assert.match(list, /<b>Mesiversario<\/b>[\s\S]*?135 mesi insieme/, 'a mesiversario keeps its line');

  const css = read('dc-noi.css');
  assert.match(css, /#bond \.us-noi-v2-bar\.is-milestone\{[^}]*white-space:normal[^}]*-webkit-line-clamp:2/);
  const en = read('i18n-en.js');
  for (const it of ['{n} mesi', '{n} anni', '1 mese', '1 anno', '{n} giorni', 'Inizio']) assert.ok(en.includes(`'${it}':`) || en.includes(`\n    ${it}:`), it);
});

test('today is bold, the chosen day is framed; a day with a Ricordo shows its photo', async () => {
  const h = load({ now: '2026-11-24T10:00:00', month: () => NOVEMBER });
  h.api.openCalendar({ date: '2026-11-24' });
  await settle();
  let grid = h.$('usNoiV2Content').innerHTML;
  assert.match(cell(grid, '2026-11-24'), /class="us-noi-v2-day is-selected is-today"[^>]*aria-pressed="true"[^>]*aria-current="date"/);
  const photo = cell(grid, '2026-11-07');
  assert.match(photo, /class="us-noi-v2-day has-photo is-past"/);
  assert.match(photo, /<img class="us-noi-v2-day-photo" src="https:\/\/media\.test\/a-thumb\.webp" alt="" loading="lazy" decoding="async">/);
  assert.match(photo, /aria-label="[^"]*con un Ricordo/);
  assert.doesNotMatch(cell(grid, '2026-11-08'), /<img/);

  h.click((sel) => (sel === '[data-noi-day]' ? { dataset: { noiDay: '2026-11-07' }, hasAttribute: () => false } : null));
  grid = h.$('usNoiV2Content').innerHTML;
  assert.match(cell(grid, '2026-11-07'), /class="us-noi-v2-day is-selected has-photo is-past"/);
  assert.match(cell(grid, '2026-11-24'), /class="us-noi-v2-day is-today"/);
});

test('the agenda of the chosen day: its Ricordo, the commitments with time and whose, and «Aggiungi a questo giorno»', async () => {
  const h = load({ now: '2026-11-24T10:00:00', month: () => NOVEMBER });
  h.api.openCalendar({ date: '2026-11-24' });
  await settle();
  let detail = h.$('usNoiV2Detail').innerHTML;
  assert.match(detail, /<h3>martedì 24 novembre<\/h3><span class="us-noi-v2-today-pill">Oggi<\/span>/);
  assert.match(detail, /19:00[\s\S]*Yoga[\s\S]*Solo Sara[\s\S]*<span class="us-noi-v2-who" data-owner="partner" translate="no">Sara<\/span>/);
  assert.match(detail, /21:00[\s\S]*Cena da noi[\s\S]*<span class="us-noi-v2-who" data-owner="noi">Insieme<\/span>/);
  assert.match(detail, /<button type="button" class="us-noi-v2-add-day" data-noi-add>/);
  assert.match(detail, /Aggiungi a questo giorno/);
  h.calls.length = 0;
  h.click((sel) => (sel === '[data-noi-add]' ? {} : null));
  assert.deepEqual(h.last(), ['createForDate', '2026-11-24'], 'the existing editor, on that day');

  h.api.openCalendar({ date: '2026-11-07' });
  detail = h.$('usNoiV2Detail').innerHTML;
  assert.doesNotMatch(detail, /us-noi-v2-today-pill/);
  assert.match(detail, /<button type="button" class="us-noi-v2-ricordo" data-noi-ricordo data-moment-id="m1"/);
  assert.match(detail, /data-storage-path="c1\/you\/a\.webp"[^>]*data-moment-iso="2026-11-07"[^>]*data-moment-owner="you"/);
  assert.match(detail, /<img src="https:\/\/media\.test\/a-thumb\.webp" alt=""/);
  assert.match(detail, /<small>Ricordo<\/small><b translate="no">Gita al lago<\/b><span>di Sara<\/span>/);
  const ricordo = { dataset: { momentId: 'm1' } };
  h.click((sel) => (sel === '[data-noi-ricordo]' ? ricordo : null));
  assert.deepEqual(h.last(), ['openMomentViewer', 'm1'], 'the Ricordo opens in its album');

  h.api.openCalendar({ date: '2026-11-25' });
  assert.match(h.$('usNoiV2Detail').innerHTML, /Niente in programma\. Un giorno libero, tutto vostro\./);
});

test('«Prossimi»: from today, one year ahead, with birthdays, mesiversari and the anniversary; nothing past', async () => {
  const year = {
    appointments: [timed('Volo Roma', 'you', 'personal', '2026-11-30', '07:15', '09:00'), timed('Ieri', 'me', 'personal', '2026-11-23', '10:00', '11:00')],
    events: [{ id: 'bd', title: 'Compleanno Sara', event_date: '1998-03-02', event_time: null, recurs_yearly: true }, { id: 'old', title: 'Cena passata', event_date: '2026-11-01', event_time: null, recurs_yearly: false }],
    profiles: PROFILES, startedOn: '2024-01-31'
  };
  const h = load({ now: '2026-11-24T10:00:00', month: () => NOVEMBER, range: () => year });
  h.api.openCalendar({ date: '2026-11-24' });
  await settle();
  h.tap('usNoiV2ModeList');
  await settle();
  assert.deepEqual(h.reads.at(-1), ['range', '2026-11-24', '2027-11-25'], 'from today to the same day next year');
  assert.equal(h.$('usNoiV2').dataset.mode, 'list');
  const list = h.$('usNoiV2Content').innerHTML;
  const days = [...list.matchAll(/data-noi-day="([^"]+)" data-noi-focus-list/g)].map((m) => m[1]);
  assert.deepEqual(days.slice(0, 4), ['2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28']);
  assert.ok(days.includes('2027-03-02'), 'the birthday, months away');
  assert.ok(!days.some((d) => d < '2026-11-24'), 'nothing before today');
  assert.match(list, /Compleanno Sara/);
  assert.match(list, /<b>Anniversario<\/b>[\s\S]*?3 anni insieme/);
  assert.match(list, /lunedì 30 novembre/, 'the day says its month');
  assert.doesNotMatch(list, /Cena passata|>Ieri</);
  // No dashes (founder, 04/11/2026): a date without an hour carries a mark.
  assert.doesNotMatch(list, /—/);
  assert.match(list, /us-noi-v2-item-time is-mark" aria-hidden="true"><span class="us-icon" data-us-icon="heart"/);
  assert.match(list, /us-noi-v2-item-time">07:15</);
  assert.equal(h.$('usNoiV2Detail').hidden, true);

  h.tap('usNoiV2ModeCalendar');
  await settle();
  assert.equal(h.$('usNoiV2').dataset.mode, 'calendar');
});

test('«Prossimi» shows at most 30 dates, and a quiet line when nothing is coming', async () => {
  const many = { appointments: Array.from({ length: 40 }, (_, i) => timed(`Corso ${i}`, 'me', 'personal', `2026-12-${String((i % 28) + 1).padStart(2, '0')}`, '18:00', '19:00')), events: [], profiles: PROFILES, startedOn: null };
  const h = load({ now: '2026-11-24T10:00:00', month: () => NOVEMBER, range: () => many });
  h.api.openCalendar({ date: '2026-11-24' });
  await settle();
  h.tap('usNoiV2ModeList');
  await settle();
  assert.equal((h.$('usNoiV2Content').innerHTML.match(/class="us-noi-v2-item"/g) || []).length, 30);

  const none = load({ now: '2026-11-24T10:00:00', month: () => NOVEMBER, range: () => ({ appointments: [], events: [], profiles: PROFILES, startedOn: null }) });
  none.api.openCalendar({ date: '2026-11-24' });
  await settle();
  none.tap('usNoiV2ModeList');
  await settle();
  assert.match(none.$('usNoiV2Content').innerHTML, /Niente in arrivo/);
});

test('the page: «Mese» and «Prossimi», no tiles, no «Il nostro giorno», the board under the calendar with the Lavagna slot', () => {
  const html = read('index.html');
  const bond = html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '';
  assert.match(bond, /id="usNoiV2ModeCalendar"[^>]*>Mese<\/button>/);
  assert.match(bond, /id="usNoiV2ModeList"[^>]*>Prossimi<\/button>/);
  assert.doesNotMatch(bond, /data-noi-open-link|us-noi-v2-links/, 'Lavagna, Missioni, Eventi and Note tiles are gone');
  assert.doesNotMatch(bond, /id="usNoiV2First"|Il nostro giorno/);
  const board = bond.match(/<section class="us-noi-board" id="usNoiBoard"[\s\S]*?<\/section>/)?.[0] || '';
  assert.ok(board, 'the board is on the Noi page');
  assert.ok(bond.indexOf('id="usNoiV2Detail"') < bond.indexOf('id="usNoiBoard"'), 'under the calendar');
  assert.match(board, /<div id="usNoiLavagnaSlot"( class="us-lav-slot")?><\/div>/, 'phase 2 hooks the Lavagna here');
  assert.ok(board.indexOf('usNoiLavagnaSlot') < board.indexOf('id="usNoiBoardGrid"'), 'the Lavagna on top of the post-its');
  const js = read('noi-v2.js');
  assert.doesNotMatch(js, /function legendMarkup|us-noi-v2-day-marks|us-noi-v2-sel/);
  assert.match(read('calendar.js'), /window\.USNoiCalendarRead = Object\.freeze\(\{readMonth:readNoiMonth,readRange:readNoiRange,freeEvenings:noiFreeEvenings\}\)/);
});
