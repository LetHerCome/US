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

const localISO = (y, m, d, hh, mm) => new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();

// (1) M9C: the duration stays in the domain but leaves the quick form.
test('M6C.1 (1): the quick form has no duration UI; the domain keeps duration (ends_at) intact', () => {
  const form = html().match(/<form class="us-cal-form"[\s\S]*?<\/form>/)?.[0] || '';
  assert.doesNotMatch(form, /Quanto dura\?|data-us-cal-duration|usCalendarEndInput/);
  const payload = cal.buildEntryPayload({ title: 'X', allDay: false, date: '2026-09-29', time: '09:00', durationMinutes: 90 });
  assert.equal(payload.ends_at, localISO(2026, 9, 29, 10, 30), 'ends_at is still a real column of the domain');
});

// (2) all-day hides Ora only; there is no duration UI left to hide.
test('M6C.1 (2): with Tutto il giorno only Ora disappears', () => {
  assert.match(js(), /timeField\.hidden = allDay/);
  assert.doesNotMatch(js(), /durationField/);
  assert.match(js(), /function toggleAllDayFields\(\)/);
});

// (3) ends_at derives from the chosen duration — 30m / 1h / 2h.
test('M6C.1 (3): ends_at derives from the explicit duration (30 min / 1 h / 2 h)', () => {
  for (const [minutes, expectEnd] of [[30, localISO(2026, 9, 29, 9, 30)], [60, localISO(2026, 9, 29, 10, 0)], [120, localISO(2026, 9, 29, 11, 0)]]) {
    const payload = cal.buildEntryPayload({ title: 'X', allDay: false, date: '2026-09-29', time: '09:00', durationMinutes: minutes });
    assert.equal(payload.ends_at, expectEnd);
    assert.equal(payload.starts_at, localISO(2026, 9, 29, 9, 0));
    assert.ok(payload.ends_at > payload.starts_at);
  }
});

// (4) Altro: duration from the chosen end time; end <= start is rejected, never repaired.
test('M6C.1 (4): the pure end-time helper still rejects end <= start (error, not repair)', () => {
  assert.equal(cal.durationMinutesFromTimes('09:00', '10:30'), 90);
  assert.equal(cal.durationMinutesFromTimes('21:30', '22:00'), 30);
  assert.equal(cal.durationMinutesFromTimes('10:00', '09:00'), null, 'end before start is invalid');
  assert.equal(cal.durationMinutesFromTimes('09:00', '09:00'), null, 'zero duration is invalid');
  assert.equal(cal.durationMinutesFromTimes('', '10:00'), null, 'missing start is invalid');
});

// (5) M9C: editing preserves the entry's REAL duration even without a duration control.
test('M6C.1 (5): editing a timed entry keeps its real duration; only create uses the default', () => {
  const existing = { is_all_day: false, starts_at: localISO(2026, 9, 29, 9, 0), ends_at: localISO(2026, 9, 29, 10, 45), description: 'nota', location: null };
  assert.equal(cal.quickEntryHiddenFields({ editingEntry: existing, allDay: false }).durationMinutes, 105);
  assert.equal(cal.quickEntryHiddenFields({ editingEntry: existing, allDay: true }).durationMinutes, cal.US_CALENDAR_DEFAULT_DURATION_MINUTES, 'timed -> all-day has no duration to keep');
  const allDay = { is_all_day: true, start_date: '2026-09-29', end_date: '2026-09-29' };
  assert.equal(cal.quickEntryHiddenFields({ editingEntry: allDay, allDay: false }).durationMinutes, cal.US_CALENDAR_DEFAULT_DURATION_MINUTES, 'all-day -> timed starts from the default');
  assert.match(js(), /originalDurationMinutes\(editingEntry\) \|\| US_CALENDAR_DEFAULT_DURATION_MINUTES/);
});

// (6) new timed entries use the single default constant (60 minutes).
test('M6C.1 (6): new timed quick entries use US_CALENDAR_DEFAULT_DURATION_MINUTES', () => {
  const fresh = cal.quickEntryHiddenFields({ editingEntry: null, allDay: false });
  assert.equal(fresh.durationMinutes, 60);
  const save = (js().match(/async function saveEntry\(event\)[\s\S]*?^}/m)?.[0] || '').replace(/\/\/.*$/gm, '');
  assert.equal((save.match(/\b60\b/g) || []).length, 0, 'no bare 60-minute literal in the save path');
  assert.match(save, /quickEntryHiddenFields\(\{/);
});

// (7) Tempo insieme keeps using REAL intervals — regression on the M6C seam.
test('M6C.1 (7): Tempo insieme consumes real intervals via M6A (a 90-min busy block carves the windows)', () => {
  const entries = [
    { id: 'a', entry_type: 'personal', role: 'francesco', is_all_day: false, starts_at: localISO(2026, 9, 29, 9, 0), ends_at: localISO(2026, 9, 29, 10, 30) },
    { id: 'b', entry_type: 'personal', role: 'beatrice', is_all_day: false, starts_at: localISO(2026, 9, 29, 18, 0), ends_at: localISO(2026, 9, 29, 19, 30) }
  ];
  const win = cal.windowForGrid(new Date(2026, 8, 29), new Date(2026, 8, 30));
  const partition = cal.partitionDayBusy(entries, '2026-09-29', (e) => e.role);
  const windows = domain.computeFreeTogether({
    windowStart: win.windowStartAt, windowEnd: win.windowEndAt,
    personABusy: partition.personABusy, personBBusy: partition.personBBusy,
    sharedEvents: partition.sharedEvents, minDurationMinutes: 30
  });
  const fmt = (iso) => { const d = new Date(iso); return `${d.getHours()}:${d.getMinutes()}`; };
  assert.deepEqual(windows.map((w) => `${fmt(w.start)}-${fmt(w.end)}`), [
    '0:0-9:0',     // 00:00 -> 09:00
    '10:30-18:0',  // 10:30 -> 18:00
    '19:30-0:0'    // 19:30 -> 24:00
  ]);
});

// (8) M9C: the old picker styling is gone with the picker.
test('M6C.1 (8): no dead duration-picker styling remains', () => {
  assert.doesNotMatch(css(), /\.us-cal-duration-picker|\.us-cal-end-field/);
});
