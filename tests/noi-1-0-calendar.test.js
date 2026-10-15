// US 1.0 (audit N1, N2, N3, N5, N6) — the Noi calendar at runtime. noi-v2.js runs in a
// vm with a tiny DOM and a fixed "now"; the free-evening reader is the pure
// rule exported by calendar.js, fed exactly as calendar.js feeds it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const cal = require('../calendar.js');
const domain = require('../calendar-domain.js');

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

// Months are read through the stubbed readMonth; nothing else is read.
function load({ now, month }) {
  const els = new Map();
  const $ = (id) => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); };
  const calls = [];
  const reads = [];
  const roleById = new Map(PROFILES.map((p) => [p.id, p.role]));
  const window = {
    usProfile: ME,
    matchMedia: () => ({ matches: true }),
    addEventListener() {},
    go: (page) => calls.push(['go', page]),
    closeNoiSection: () => calls.push(['closeNoiSection']),
    openNoiSection: (view) => calls.push(['openNoiSection', view]),
    openEventEditor: (...args) => calls.push(['openEventEditor', ...args]),
    UsCalendarLinks: { openEntry: (...args) => calls.push(['openEntry', ...args]), createForDate: (day) => calls.push(['createForDate', day]) },
    USNoiCalendarRead: {
      readMonth: async (year, m) => { reads.push([year, m]); return month(year, m); },
      // Same feeding as calendar.js noiFreeEvenings.
      freeEvenings: ({ appointments, dates, eventTimesByDate }) => dates.filter((d) => cal.freeEveningFor(appointments, d, (e) => cal.entryLaneRoleFor(e, roleById.get(e.owner_id)), eventTimesByDate[d] || [], domain))
    }
  };
  const document = {
    readyState: 'complete', getElementById: $, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, hidden: false
  };
  window.document = document;
  const context = vm.createContext({
    window, document, console: { info() {}, warn() {} }, Date: fixedDate(now), Intl, Math, Map, Set, Array, Object, String, Number, Promise, JSON,
    MutationObserver: class { observe() {} }, setTimeout: () => 0, clearTimeout() {}
  });
  context.globalThis = context;
  vm.runInContext(read('noi-v2.js'), context, { filename: 'noi-v2.js' });
  const click = (dataset) => {
    const item = { dataset, hasAttribute: () => false };
    const target = { closest: (sel) => (sel === '[data-noi-item]' ? item : null) };
    $('usNoiV2').handlers.click.forEach((fn) => fn({ target }));
  };
  // Objects made inside the vm have another realm's prototypes: compare plain copies.
  const last = () => JSON.parse(JSON.stringify(calls.at(-1)));
  return { api: window.USNoiV2, $, calls, reads, click, last };
}
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
const timed = (id, owner, type, date, h1, h2) => ({ id, couple_id: 'c1', entry_type: type, owner_id: type === 'shared' ? null : owner, title: id, is_all_day: false, starts_at: new Date(`${date}T${h1}:00`).toISOString(), ends_at: new Date(`${date}T${h2}:00`).toISOString(), dates: [date] });

test('N2: the month shows the mesiversario every month; a 31st counts on the last day of a shorter month', async () => {
  const h = load({ now: '2026-02-10T10:00:00', month: () => ({ appointments: [], events: [], profiles: PROFILES, startedOn: '2024-01-31' }) });
  h.api.openCalendar({ date: '2026-02-28' });
  await settle();
  const grid = h.$('usNoiV2Content').innerHTML;
  assert.match(grid, /data-noi-day="2026-02-28"[^>]*aria-label="[^"]*, 1 momento"/, 'February has its mesiversario on the 28th');
  const detail = h.$('usNoiV2Detail').innerHTML;
  assert.match(detail, /<b>Mesiversario<\/b>/);
  assert.match(detail, /25 mesi insieme/);
  assert.match(detail, /Luca e Sara/, 'it belongs to both of you');

  h.api.openCalendar({ date: '2026-01-31' });
  await settle();
  assert.match(h.$('usNoiV2Detail').innerHTML, /<b>Anniversario<\/b>[\s\S]*2 anni insieme/);

  h.api.openCalendar({ date: '2024-02-29' });
  await settle();
  assert.match(h.$('usNoiV2Detail').innerHTML, /Un mese insieme/);

  h.api.openCalendar({ date: '2024-01-31' });
  await settle();
  assert.match(h.$('usNoiV2Detail').innerHTML, /Il nostro giorno/);
  h.api.openCalendar({ date: '2023-12-31' });
  await settle();
  assert.doesNotMatch(h.$('usNoiV2Detail').innerHTML, /Mesiversario|Il nostro giorno/, 'nothing before the first day');
});

test('N3: "La nostra settimana" across two months keeps events, mesiversari and the free evenings of both', async () => {
  const appointments = [
    timed('Palestra', 'me', 'personal', '2026-10-29', '19:00', '21:00'),
    timed('Ieri', 'you', 'personal', '2026-10-28', '08:00', '09:00')
  ];
  const h = load({
    now: '2026-10-29T10:00:00',
    month: () => ({ appointments, events: [{ id: 'ev1', title: 'Compleanno', event_date: '1990-11-01', event_time: null, recurs_yearly: true }], profiles: PROFILES, startedOn: '2025-03-31' })
  });
  h.api.openCalendar({ date: '2026-10-29', mode: 'week' });
  await settle();
  assert.equal(h.$('usNoiV2').dataset.mode, 'week');
  // Parity: the week is the Lavagna Foglio; its title names the week.
  assert.equal(h.$('usNoiLavagnaTitle').textContent, 'Questa settimana');
  assert.equal(h.$('usNoiV2WeekBack').hidden, false);
  const week = h.$('usNoiV2Week').innerHTML;
  assert.match(week, /data-noi-item="event" data-day="2026-11-01" data-id="ev1"/, 'a yearly event next month is in the week');
  assert.match(week, /data-noi-item="anniversary" data-day="2026-10-31" data-id="" data-months="19"/, 'the mesiversario on the 31st');
  assert.match(week, /3 sere libere per tutti e due/, 'Thu is taken from 19 to 21; Fri, Sat, Sun are free; past days never count');
  const freeDays = week.split('<section').filter((row) => row.includes('Sera libera')).map((row) => row.match(/data-noi-day="([^"]+)"/)[1]);
  assert.deepEqual(freeDays, ['2026-10-30', '2026-10-31', '2026-11-01']);

  h.api.closeWeek();
  assert.equal(h.$('usNoiV2').dataset.mode, 'calendar', 'Back returns from the week to the month');
  assert.equal(h.$('usNoiV2WeekBack').hidden, true);
});

test('N3: an evening Eventi date or a shared plan takes the evening; a past week says nothing about free evenings', async () => {
  const h = load({
    now: '2026-10-26T09:00:00',
    month: () => ({
      appointments: [timed('Cena', 'me', 'shared', '2026-10-27', '20:00', '22:00')],
      events: [{ id: 'ev2', title: 'Teatro', event_date: '2026-10-28', event_time: '20:30:00', recurs_yearly: false }],
      profiles: PROFILES, startedOn: null
    })
  });
  h.api.openCalendar({ date: '2026-10-26', mode: 'week' });
  await settle();
  const week = h.$('usNoiV2Week').innerHTML;
  const freeDays = week.split('<section').filter((row) => row.includes('Sera libera')).map((row) => row.match(/data-noi-day="([^"]+)"/)[1]);
  assert.deepEqual(freeDays, ['2026-10-26', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  assert.match(week, /5 sere libere per tutti e due/);

  h.api.openCalendar({ date: '2026-10-12', mode: 'week' });
  await settle();
  assert.doesNotMatch(h.$('usNoiV2Week').innerHTML, /sere libere|Sera libera|Nessuna sera libera/);
});

test('N6: tapping an event opens that event; a mesiversario opens Eventi; an entry opens its detail in place', async () => {
  const h = load({ now: '2026-10-29T10:00:00', month: () => ({ appointments: [], events: [], profiles: PROFILES, startedOn: '2025-03-31' }) });
  h.api.openCalendar({ date: '2026-10-29' });
  await settle();
  h.calls.length = 0;
  h.click({ noiItem: 'event', id: 'ev1', day: '2026-11-01' });
  assert.deepEqual(h.last(), ['openEventEditor', 'ev1', '2026-11-01', { from: 'calendar' }]);
  h.click({ noiItem: 'anniversary', id: '', day: '2026-10-31', months: '19' });
  assert.deepEqual(h.last(), ['openNoiSection', 'eventi']);
  h.click({ noiItem: 'entry', id: 'e1', day: '2026-10-29' });
  assert.deepEqual(h.last(), ['openEntry', 'e1', { inPlace: true }]);
});

test('N1: "Data speciale" from the "+" opens the Eventi editor for that day, with what was typed', () => {
  const h = load({ now: '2026-10-29T10:00:00', month: () => null });
  h.api.addSpecialDate({ date: '2026-11-05', title: 'Cena da Marta', time: '20:00' });
  assert.deepEqual(h.last(), ['openEventEditor', null, null, { from: 'calendar', date: '2026-11-05', title: 'Cena da Marta', time: '20:00' }]);
  h.api.addSpecialDate({ date: 'nope' });
  assert.equal(h.calls.at(-1)[3].date, '2026-10-29', 'a bad date falls back to the selected day');
});

test('N5: a mission push (target bond) opens Missioni itself, not only the Noi page', () => {
  const app = read('app.js');
  const push = app.match(/async function performPushNavigation\(target,intent=\{\}\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(push, /if\(target==='bond'\)\{\s*if\(document\.querySelector\('\.page\.active'\)\?\.id!=='bond'\)go\('bond',\{motionCommit:true\}\);\s*setTimeout\(\(\)=>window\.openNoiSection\?\.\('quest'\),120\);\s*return;\s*\}/);
  assert.ok(push.indexOf("target==='bond'") < push.indexOf('if(pages.includes(target))go(target);'), 'before the generic page jump');
});
