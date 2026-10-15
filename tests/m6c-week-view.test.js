const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const cal = require('../calendar.js');
const domain = require('../calendar-domain.js');

const html = () => read('index.html');
const js = () => read('calendar.js');
const css = () => read('calendar.css');
const nav = () => read('navigation.js');
const noi = () => read('noi-v2.js');

// US 1.0 (audit N3/N10): the old overlay and its Mese | Settimana switch are
// gone. The week is "La nostra settimana", the week view of the Noi calendar
// (noi-v2.js), with the free evenings of both of you. The pure rules below
// (week window, busy partition, free time together) are unchanged.

// ---------------------------------------------------------------------------
// Composed helper: the EXACT production path — partitionDayBusy feeds
// computeFreeTogether. Tests exercise the domain algorithm through the same
// seam the UI uses; the merge/complement/min-duration logic is never copied.
function tempoWindows(entries, dateISO, roleOf, minDurationMinutes = 30) {
  const partition = cal.partitionDayBusy(entries, dateISO, roleOf);
  const win = cal.windowForGrid(new Date(2026, 8, 29), new Date(2026, 8, 30));
  return domain.computeFreeTogether({
    windowStart: win.windowStartAt,
    windowEnd: win.windowEndAt,
    personABusy: partition.personABusy,
    personBBusy: partition.personBBusy,
    sharedEvents: partition.sharedEvents,
    minDurationMinutes
  });
}

const day = (y, m, d, hh, mm) => new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
const DAY = '2026-09-29'; // a Tuesday
const roleOf = (e) => e.role; // tests pass the role directly on the entry

// (1) the week opens from "La nostra settimana" and "Torna al mese" leaves it; no new tab.
test('M6C (1): "La nostra settimana" opens the week, "Torna al mese" leaves it; never a bottom-nav destination', () => {
  // Parity: the week is the mockup's Lavagna Foglio; its close button leaves it.
  assert.match(html(), /id="usNoiV2WeekBack" hidden data-us-modal-close aria-label="Chiudi la lavagna">/);
  assert.match(noi(), /\$\('usNoiV2WeekBack'\)\?\.addEventListener\('click',closeWeek\)/);
  assert.match(noi(), /function closeWeek\(\)\{\s*if\(mode!=='week'\)return;\s*mode='calendar';render\(\);\s*\}/);
  assert.doesNotMatch(html(), /data-page="calendar"/);
  assert.doesNotMatch(html(), /data-page="week"/);
});

// (2) week window: Monday-start, 7 days, same domain window contract as month.
test('M6C (2): the week window is Monday-first, 7 days long, and reuses windowForGrid', () => {
  const monday = cal.mondayOfISO('2026-09-27'); // a Sunday -> previous Monday
  assert.equal(monday, '2026-09-21');
  const { startISO, endISO } = cal.weekRangeFor(monday);
  assert.equal(startISO, '2026-09-21');
  assert.equal(endISO, '2026-09-28');
  const win = cal.weekWindowFor(monday);
  assert.equal(new Date(win.windowStartAt).getDay(), 1);
  assert.equal((new Date(win.windowEndAt) - new Date(win.windowStartAt)) / 86400000, 7);
  assert.equal(win.windowStartDate, monday);
  assert.equal(win.windowEndDate, endISO);
});

// (3) navigation: prev/next step a whole week in week mode; the week starts on Monday.
test('M6C (3): prev/next shift the week by ±7 days and the week starts on Monday', () => {
  assert.match(noi(), /if\(mode==='week'\)\{\s*const now=dateOf\(selected\);\s*const next=new Date\(now\.getFullYear\(\),now\.getMonth\(\),now\.getDate\(\)\+7\*delta,12\);/);
  assert.match(noi(), /const monday=new Date\(date\.getFullYear\(\),date\.getMonth\(\),date\.getDate\(\)-\(\(date\.getDay\(\)\+6\)%7\),12\);/);
  assert.match(noi(), /Array\.from\(\{length:7\}/);
});

// (4) each week day shows every commitment as a chip in the colour of whose it is.
test('M6C (4): week days show each commitment with its owner colour, from live profiles', () => {
  assert.match(noi(), /function chipMarkup\(day,item\)[\s\S]*?data-owner="\$\{ownerOf\(item\)\}"/);
  assert.match(noi(), /const lane=items\.length\|\|evening\?sortedForBoard\(items\)\.map\(item=>chipMarkup\(day,item\)\)/);
  assert.match(noi(), /function ownerOf\(item\)\{[\s\S]*?item\.ownerId===viewer\?\.id\?'tu':'partner'/);
  assert.doesNotMatch(noi(), /['"]Francesco['"]|['"]Beatrice['"]/);
});

// (5) timed / all-day / overnight bucketing.
test('M6C (5): timed, all-day and overnight entries land on the right days as busy intervals', () => {
  const entries = [
    { id: 't1', entry_type: 'personal', role: 'francesco', is_all_day: false, starts_at: day(2026, 9, 29, 9, 0), ends_at: day(2026, 9, 29, 10, 30) },
    { id: 't2', entry_type: 'personal', role: 'beatrice', is_all_day: true, start_date: '2026-09-29', end_date: '2026-09-29' },
    // overnight: 23:00 -> 01:00 next day
    { id: 't3', entry_type: 'personal', role: 'beatrice', is_all_day: false, starts_at: day(2026, 9, 29, 23, 0), ends_at: day(2026, 9, 30, 1, 0) }
  ];
  const tue = cal.partitionDayBusy(entries, '2026-09-29', roleOf);
  assert.equal(tue.personABusy.length, 2, 'beatrice: the all-day + her overnight start');
  const dayStart = new Date(2026, 8, 29).getTime();
  const dayEnd = new Date(2026, 8, 30).getTime();
  assert.deepEqual(tue.personABusy[0], { start: dayStart, end: dayEnd });
  assert.deepEqual(tue.personABusy[1], { start: new Date(2026, 8, 29, 23, 0).getTime(), end: dayEnd });
  assert.equal(tue.personBBusy.length, 1, 'francesco: his timed entry only');
  assert.equal(tue.personBBusy[0].start, new Date(day(2026, 9, 29, 9, 0)).getTime());
  assert.equal(tue.personBBusy[0].end, new Date(day(2026, 9, 29, 10, 30)).getTime());
  // overnight spills into the next day's window, clipped
  const wed = cal.partitionDayBusy(entries, '2026-09-30', roleOf);
  assert.deepEqual(wed.personABusy, [{ start: dayEnd, end: new Date(2026, 8, 30, 1, 0).getTime() }]);
  assert.deepEqual(wed.personBBusy, [], 'the all-day ended 2026-09-30 (exclusive end) — not busy on the 30th');
});

// (6) free evenings reuse the availability algorithm, never reimplement it.
test('M6C (6): free evenings go through UsCalendarDomain.computeFreeTogether — no reimplementation', () => {
  assert.match(js(), /UsCalendarDomain\.computeFreeTogether\(/);
  assert.doesNotMatch(js() + noi(), /function (mergeIntervals|complementIntervals|computeFreeTogether)\b/, 'merge/complement stay in calendar-domain.js only');
  assert.match(js(), /const partition = partitionDayBusy\(entries, dateISO, roleOf\);[\s\S]*?return domain\.computeFreeTogether\(\{/);
  assert.match(noi(), /const reader=window\.USNoiCalendarRead\?\.freeEvenings;/, 'Noi reads no second time: it uses the month it has');
});

// (6b) US 1.0 (N3): a free evening is three hours free for both between 19:00 and 23:00.
test('M6C (6b): a free evening is three free hours together between 19:00 and 23:00', () => {
  assert.deepEqual({ ...cal.US_FREE_EVENING }, { startHour: 19, endHour: 23, minMinutes: 180, eventMinutes: 180 });
  assert.equal(cal.freeEveningFor([], DAY, roleOf, [], domain), true, 'nothing planned: free');
  const gym = { id: 'g', entry_type: 'personal', role: 'francesco', is_all_day: false, starts_at: day(2026, 9, 29, 19, 0), ends_at: day(2026, 9, 29, 20, 30) };
  assert.equal(cal.freeEveningFor([gym], DAY, roleOf, [], domain), false, 'one of you busy until 20:30 leaves 2h30');
  const lunch = { ...gym, starts_at: day(2026, 9, 29, 12, 0), ends_at: day(2026, 9, 29, 14, 0) };
  assert.equal(cal.freeEveningFor([lunch], DAY, roleOf, [], domain), true, 'daytime plans do not touch the evening');
  const dinner = { id: 's', entry_type: 'shared', is_all_day: false, starts_at: day(2026, 9, 29, 20, 0), ends_at: day(2026, 9, 29, 22, 0) };
  assert.equal(cal.freeEveningFor([dinner], DAY, roleOf, [], domain), false, 'a shared plan fills the evening');
  assert.equal(cal.freeEveningFor([], DAY, roleOf, ['21:00'], domain), false, 'an Eventi date with a time counts as a plan');
  assert.equal(cal.freeEveningFor([], DAY, roleOf, ['09:00'], domain), true, 'a morning Eventi date does not');
  const unknown = { ...gym, role: '' };
  assert.equal(cal.freeEveningFor([unknown], DAY, roleOf, [], domain), false, 'an unknown owner counts as busy for both');
  const allDay = { id: 'a', entry_type: 'personal', role: 'beatrice', is_all_day: true, start_date: DAY, end_date: DAY };
  assert.equal(cal.freeEveningFor([allDay], DAY, roleOf, [], domain), false);
  assert.equal(cal.freeEveningFor([], DAY, roleOf, [], null), false, 'without the domain module nothing is promised');
});

// (7) merge of overlapping busy events -> one continuous gap.
test('M6C (7): overlapping busy events merge into one busy span (no phantom free slivers)', () => {
  const entries = [
    { id: 'a', entry_type: 'personal', role: 'francesco', is_all_day: false, starts_at: day(2026, 9, 29, 10, 0), ends_at: day(2026, 9, 29, 12, 0) },
    { id: 'b', entry_type: 'personal', role: 'francesco', is_all_day: false, starts_at: day(2026, 9, 29, 11, 0), ends_at: day(2026, 9, 29, 13, 0) }
  ];
  const windows = tempoWindows(entries, DAY, roleOf);
  // merged busy 10:00-13:00 -> morning gap + afternoon gap, nothing between 10 and 13
  assert.equal(windows.length, 2);
  assert.equal(windows[0].end, day(2026, 9, 29, 10, 0));
  assert.equal(windows[1].start, day(2026, 9, 29, 13, 0));
});

// (8) a shared event occupies BOTH partners.
test('M6C (8): a shared event makes both partners busy without being duplicated', () => {
  const entries = [
    { id: 's', entry_type: 'shared', is_all_day: false, starts_at: day(2026, 9, 29, 20, 0), ends_at: day(2026, 9, 29, 23, 0) }
  ];
  const partition = cal.partitionDayBusy(entries, DAY, roleOf);
  assert.equal(partition.sharedEvents.length, 1, 'one domain record, one interval');
  assert.equal(partition.personABusy.length, 0);
  assert.equal(partition.personBBusy.length, 0);
  const windows = tempoWindows(entries, DAY, roleOf);
  assert.ok(!windows.some((w) => new Date(w.start) < new Date(day(2026, 9, 29, 20, 0)).getTime() && new Date(w.end) > new Date(day(2026, 9, 29, 20, 0)).getTime()), 'no free window crosses the shared event');
});

// (9) the 30-minute threshold filters out short slivers.
test('M6C (9): free windows shorter than 30 minutes are dropped', () => {
  const entries = [
    { id: 'a', entry_type: 'personal', role: 'francesco', is_all_day: false, starts_at: day(2026, 9, 29, 10, 0), ends_at: day(2026, 9, 29, 10, 45) },
    { id: 'b', entry_type: 'personal', role: 'beatrice', is_all_day: false, starts_at: day(2026, 9, 29, 11, 0), ends_at: day(2026, 9, 29, 11, 30) }
  ];
  // sliver 10:45-11:00 is only 15 min -> filtered
  const windows = tempoWindows(entries, DAY, roleOf, 30);
  assert.ok(!windows.some((w) => new Date(w.start).getTime() === new Date(day(2026, 9, 29, 10, 45)).getTime()));
  // but at a 10-minute threshold it survives
  const relaxed = tempoWindows(entries, DAY, roleOf, 10);
  assert.ok(relaxed.some((w) => new Date(w.start).getTime() === new Date(day(2026, 9, 29, 10, 45)).getTime()));
});

// (10) fully occupied / fully free day.
test('M6C (10): a fully occupied day has no windows; a fully free day has exactly one, all day', () => {
  const occupied = [
    { id: 's', entry_type: 'shared', is_all_day: true, start_date: DAY, end_date: DAY }
  ];
  assert.deepEqual(tempoWindows(occupied, DAY, roleOf), []);
  assert.deepEqual(tempoWindows([], DAY, roleOf), [
    { start: day(2026, 9, 29, 0, 0), end: day(2026, 9, 30, 0, 0) }
  ]);
});

// (11) warm Italian labels for the windows.
test('M6C (11): window labels read like 13:00 – 16:00 / dopo le 19:00 — never corporate jargon', () => {
  assert.equal(cal.tempoWindowLabel(day(2026, 9, 29, 13, 0), day(2026, 9, 29, 16, 0), DAY, '2026-09-30'), '13:00 – 16:00');
  assert.equal(cal.tempoWindowLabel(day(2026, 9, 29, 19, 0), day(2026, 9, 30, 0, 0), DAY, '2026-09-30'), 'dopo le 19:00');
  assert.equal(cal.tempoWindowLabel(day(2026, 9, 29, 0, 0), day(2026, 9, 29, 8, 30), DAY, '2026-09-30'), 'fino alle 08:30');
  assert.equal(cal.tempoWindowLabel(day(2026, 9, 29, 0, 0), day(2026, 9, 30, 0, 0), DAY, '2026-09-30'), 'Tutta la giornata');
  assert.doesNotMatch(js() + noi(), /conflict|availability engine|AvailabilityEngine/i);
  assert.match(noi(), /Sera libera/);
  assert.match(noi(), /sere libere per tutti e due/);
});

// (12) one week list everywhere; the month view stays the month view.
test('M6C (12): the week view is a single vertical list at every width; the month view is untouched', () => {
  assert.match(noi(), /<div class="us-noi-v2-week-list" role="group" aria-label="La nostra settimana">/);
  // Parity: the week renders in the Lavagna sheet (#usNoiV2Week); the page keeps the month or the list.
  assert.match(noi(), /mode==='list'\?listMarkup\(index\):calendarMarkup\(index\)/);
  assert.match(noi(), /body\.innerHTML=weekMarkup\(index\)/);
  assert.doesNotMatch(html(), /id="usCalendarWeekList"|id="usCalendarAddBtn"|class="us-cal-fab/);
  assert.doesNotMatch(css(), /\.us-cal-fab\{/);
});

// (13) a week item opens what it is; the week is a view with its own Back step.
test('M6C (13): week items open the existing detail; Back returns from the week to the month', () => {
  assert.match(noi(), /if\(kind==='entry'&&item\.dataset\.id\)\{window\.UsCalendarLinks\?\.openEntry\?\.\(item\.dataset\.id,\{inPlace:true\}\);return;\}/);
  for (const name of ['noi-week', 'calendar-detail', 'calendar-form']) {
    assert.match(nav(), new RegExp(`name:'${name}'`));
  }
  assert.match(nav(), /name:'noi-week',[\s\S]*?close:\(\)=>window\.USNoiV2\?\.closeWeek\?\.\(\)/);
  assert.doesNotMatch(nav(), /name:'calendar-week'|name:'calendar',/);
});

// (14) the Noi read satisfies the overlap-query contract on calendar_entries.
test('M6C (14): the Noi read reuses buildRangeOverlapFilter + filterEntriesInWindow on calendar_entries', () => {
  const load = js().match(/async function fetchEntriesForRange\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(load, /UsCalendarDomain\.buildRangeOverlapFilter\(win\)/);
  assert.match(load, /UsCalendarDomain\.filterEntriesInWindow\(data \|\| \[\], win\)/);
  assert.match(load, /sb\.from\('calendar_entries'\)/);
  const month = js().match(/async function readNoiMonth\([\s\S]*?\n\}/)?.[0] || '';
  assert.match(month, /monthGridRange\(year,month\)/);
  assert.match(month, /fetchEntriesForRange\(viewer\.couple_id,start,end\)/);
});

// (15) the header follows the mode.
test('M6C (15): in week mode the header names the week and "Torna al mese" shows', () => {
  assert.match(noi(), /return `Settimana del \$\{monday\.getDate\(\)\} \$\{months\[monday\.getMonth\(\)\]\}`/);
  assert.match(noi(), /if\(weekBack\)weekBack\.hidden=mode!=='week';/);
  assert.match(noi(), /root\.dataset\.mode=mode;/);
});
