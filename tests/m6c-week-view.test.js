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

// (1) Mese | Settimana switch — simple, no new bottom-nav tab.
test('M6C (1): a simple Mese | Settimana switch exists and never adds a bottom-nav destination', () => {
  assert.match(html(), /id="usCalendarViewMonth"[^>]*>Mese</);
  assert.match(html(), /id="usCalendarViewWeek"[^>]*>Settimana</);
  assert.match(js(), /usCalendarViewMonth'\)\?\.addEventListener\('click', ?\(\) => setMode\('month'\)\)/);
  assert.match(js(), /usCalendarViewWeek'\)\?\.addEventListener\('click', ?\(\) => setMode\('week'\)\)/);
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

// (3) navigation: prev/next step a whole week; Oggi lands on the current Monday.
test('M6C (3): prev/next shift the week by ±7 days and Oggi resets to the current Monday', () => {
  assert.match(js(), /weekStartISO = shiftISODate\(weekStartISO, delta \* 7\)/);
  assert.match(js(), /function stepView\(delta\)/);
  assert.match(js(), /if \(calendarMode === 'week'\) shiftWeek\(delta\);\r?\n  else shiftMonth\(delta\);/);
  assert.match(js(), /weekStartISO = mondayOfISO\(selectedDate\)/);
  assert.match(js(), /usCalendarPrev'\)\?\.addEventListener\('click', ?\(\) => stepView\(-1\)\)/);
  assert.match(js(), /usCalendarNext'\)\?\.addEventListener\('click', ?\(\) => stepView\(1\)\)/);
});

// (4) partner/shared rendering reuses the day-sheet sections, both partners present.
test('M6C (4): week days render both partner lanes plus Insieme from live profile order', () => {
  assert.match(js(), /ordered\.map\(\(p\) => renderDaySection\(p\.display_name/);
  assert.match(js(), /renderDaySection\('Insieme', dayEntries\.filter\(\(e\) => entryLaneRole\(e\) === 'shared'\), 'shared'\)/);
  assert.match(js(), /function renderWeekList\(\)/);
  assert.match(js(), /sortedProfiles\(\)/);
  assert.doesNotMatch(js(), /['"]Francesco['"]|['"]Beatrice['"]/);
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

// (6) the availability algorithm itself is REUSED, never reimplemented.
test('M6C (6): Tempo insieme goes through UsCalendarDomain.computeFreeTogether — no reimplementation', () => {
  assert.match(js(), /UsCalendarDomain\.computeFreeTogether\(/);
  assert.doesNotMatch(js(), /function (mergeIntervals|complementIntervals|computeFreeTogether)\b/, 'merge/complement stay in calendar-domain.js only');
  assert.match(js(), /partitionDayBusy\(entries, dateISO, entryLaneRole\)/);
  assert.match(js(), /minDurationMinutes: 30/);
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
  assert.doesNotMatch(js(), /conflict|availability engine|AvailabilityEngine/i);
  assert.match(js(), /Tempo insieme/);
});

// (12) responsive: one week list everywhere, month panes untouched, no tiny dual timelines.
test('M6C (12): the week view is a single vertical list at every width; the month view DOM is untouched', () => {
  assert.match(html(), /id="usCalendarWeekList"/);
  // M9C: the floating + is gone — tapping a day is the create action.
  assert.doesNotMatch(html(), /id="usCalendarAddBtn"|class="us-cal-fab/);
  assert.doesNotMatch(css(), /\.us-cal-fab\{/);
  assert.match(css(), /\.us-cal-surface\{[^}]*padding:0 0 calc\(18px \+ var\(--us-safe-bottom\)\)/, 'the surface keeps its safe-area padding');
  assert.match(css(), /\.us-cal-week-pane\{display:none\}/);
  assert.match(css(), /\.us-cal-body\.is-week-mode \.us-cal-pane-month\{display:none!important\}/);
  assert.match(css(), /\.us-cal-body\.is-week-mode \.us-cal-week-pane\{display:block\}/);
  assert.match(css(), /\.us-cal-week-list\{display:grid;gap:12px;max-width:560px;margin:0 auto\}/, 'single constrained column, same list on mobile and wide');
  // M10.1: month view is ONE grid at every width (the 860px breakpoint only makes it roomier)
  assert.match(css(), /@media\(min-width:860px\)/);
  assert.match(js(), /renderMonthGrid\(dateIndex\)/);
});

// (13) detail / back flow: week items reuse the existing detail sheet; nav layers unchanged.
test('M6C (13): week items open the existing detail; the navigation layer registry is unchanged', () => {
  assert.match(js(), /container\.querySelectorAll\('\[data-entry-id\]'\)\.forEach\(\(btn\) => btn\.addEventListener\('click', \(\) => openDetail\(btn\.dataset\.entryId\)\)\)/);
  // M9C: the rest of a week day (head included) starts creation for that date;
  // a tap on an entry never creates.
  assert.match(js(), /container\.querySelectorAll\('\.us-cal-week-day\[data-date\]'\)\.forEach\(\(day\) => day\.addEventListener\('click', \(event\) => \{\s*if \(event\.target\.closest\?\.\('\[data-entry-id\]'\)\) return;\s*startCreateForDate\(day\.dataset\.date\);/);
  for (const name of ['calendar', 'calendar-detail', 'calendar-form']) {
    assert.match(nav(), new RegExp(`name:'${name}'`));
  }
  assert.doesNotMatch(nav(), /name:'calendar-week'/, 'the week switch is a view, not a new navigation layer');
});

// (14) the week read satisfies the same overlap-query contract as the month read.
test('M6C (14): the week load reuses buildRangeOverlapFilter + filterEntriesInWindow on calendar_entries', () => {
  const load = js().match(/async function loadEntries\(\)[\s\S]*?^}/m)?.[0] || '';
  assert.match(load, /const win = visibleWindow\(\)/);
  assert.match(load, /UsCalendarDomain\.buildRangeOverlapFilter\(win\)/);
  assert.match(load, /UsCalendarDomain\.filterEntriesInWindow\(data \|\| \[\], win\)/);
  assert.match(load, /sb\.from\('calendar_entries'\)/);
  const visible = js().match(/function visibleWindow\(\)[\s\S]*?\n}/)?.[0] || '';
  assert.match(visible, /weekWindowFor\(weekStartISO\)/);
  assert.match(visible, /monthGridRange\(viewYear, viewMonth\)/);
});

// (15) the header label and switch state follow the mode.
test('M6C (15): in week mode the header shows the date range and the switch reflects the mode', () => {
  assert.match(js(), /formatDateRangeLabel\(weekStartISO, shiftISODate\(weekStartISO, 6\)\)/);
  assert.match(js(), /is-week-mode/, 'the body carries the mode class');
  assert.match(js(), /setViewSwitch\(mode\)/);
  assert.match(js(), /aria-pressed/);
});
