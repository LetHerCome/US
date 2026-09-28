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

// (1) the duration picker exists under Ora, with 30min/1h(default)/2h/Altro.
test('M6C.1 (1): a Quanto dura? picker sits under Ora with 30 min / 1 ora (default) / 2 ore / Altro', () => {
  const form = html().match(/<form class="us-cal-form"[\s\S]*?<\/form>/)?.[0] || '';
  const timeIdx = form.indexOf('id="usCalendarTimeField"');
  const durIdx = form.indexOf('id="usCalendarDurationField"');
  assert.ok(timeIdx > -1 && durIdx > timeIdx, 'duration UI comes right after Ora');
  assert.match(form, /Quanto dura\?/);
  assert.match(form, /data-us-cal-duration="30"[^>]*>30 min</);
  assert.match(form, /data-us-cal-duration="60" class="is-active"[^>]*>1 ora</, '1 ora is the visible default');
  assert.match(form, /data-us-cal-duration="120"[^>]*>2 ore</);
  assert.match(form, /data-us-cal-duration="custom"[^>]*>Altro</);
  assert.match(form, /id="usCalendarEndInput" type="time"/, 'Altro reveals a minimal end-time control');
});

// (2) all-day hides the entire duration UI.
test('M6C.1 (2): with Tutto il giorno the whole duration UI disappears', () => {
  assert.match(js(), /durationField\.hidden = allDay/);
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
test('M6C.1 (4): Altro computes the duration from Fine alle; end <= start yields null (error, not repair)', () => {
  assert.equal(cal.durationMinutesFromTimes('09:00', '10:30'), 90);
  assert.equal(cal.durationMinutesFromTimes('21:30', '22:00'), 30);
  assert.equal(cal.durationMinutesFromTimes('10:00', '09:00'), null, 'end before start is invalid');
  assert.equal(cal.durationMinutesFromTimes('09:00', '09:00'), null, 'zero duration is invalid');
  assert.equal(cal.durationMinutesFromTimes('', '10:00'), null, 'missing start is invalid');
  assert.match(js(), /durationMinutesFromTimes\(time, endTime\)/);
  assert.match(js(), /La fine deve essere dopo l'inizio\./);
});

// (5) editing preserves the entry's REAL duration: chips map exactly, others open Altro prefilled.
test('M6C.1 (5): editing opens on the entry\'s real duration and preserves it unless explicitly changed', () => {
  // non-chip duration -> Altro prefilled with the entry's own end time
  assert.match(js(), /durationChoice = 'custom';/);
  assert.match(js(), /durationEnd = `\$\{pad2\(e\.getHours\(\)\)\}:\$\{pad2\(e\.getMinutes\(\)\)\}`;/);
  assert.match(js(), /editingOriginalEndHHMM = durationEnd;/);
  // untouched Fine alle -> real duration wins even if only the start moved
  assert.match(js(), /durationMinutes = \(real && endTime === editingOriginalEndHHMM\)[\s\S]{0,20}\? real/);
  // the old silent rewrite (fall back to 60 for every non-chip case) is gone
  assert.doesNotMatch(js(), /originalDurationMinutes\(editingFormEntry\) \|\| US_CALENDAR_DEFAULT_DURATION_MINUTES/);
});

// (6) 60 minutes is no longer an invisible assumption for new entries.
test('M6C.1 (6): new timed entries take their duration from the picker, not from a hidden 60-minute default', () => {
  assert.match(js(), /durationMinutes = getActiveDurationChoice\(\) \|\| US_CALENDAR_DEFAULT_DURATION_MINUTES/, 'the constant survives only as a last-resort guard');
  const save = (js().match(/async function saveEntry\(event\)[\s\S]*?^}/m)?.[0] || '').replace(/\/\/.*$/gm, '');
  const literals = save.match(/\b60\b/g) || [];
  assert.equal(literals.length, 0, 'no bare 60-minute literal in the save path');
  assert.match(js(), /function getActiveDurationChoice\(\)/);
  assert.match(js(), /function setDurationPicker\(value\)/);
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

// (8) picker styling follows the existing segmented-control idiom.
test('M6C.1 (8): the duration picker reuses the M6B segmented-control styling', () => {
  assert.match(css(), /\.us-cal-duration-picker\{display:flex;gap:6px;margin-top:2px\}/);
  assert.match(css(), /\.us-cal-duration-picker button\.is-active\{background:rgba\(169,133,255,\.22\)/);
  assert.match(css(), /\.us-cal-end-field\{margin-top:10px\}/);
});
