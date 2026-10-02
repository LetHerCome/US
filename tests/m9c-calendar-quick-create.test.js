const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const cal = require('../calendar.js');

const html = () => read('index.html');
const js = () => read('calendar.js');
const css = () => read('calendar.css');
const form = () => html().match(/<form class="us-cal-form"[\s\S]*?<\/form>/)?.[0] || '';
const localISO = (y, m, d, hh, mm) => new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();

test('M9C/US 1.0: the quick form keeps one title flow and explicit keyboard Inizio/Fine', () => {
  const f = form();
  for (const preset of ['Lavoro', 'Università', 'Uscita']) assert.match(f, new RegExp(`data-us-calendar-preset="${preset}"`));
  assert.match(f, /id="usCalendarTitleInput"/);
  assert.match(f, /id="usCalendarAllDayInput"/);
  assert.match(f, /id="usCalendarStartTimeInput"[^>]*inputmode="numeric"/);
  assert.match(f, /id="usCalendarEndTimeInput"[^>]*inputmode="numeric"/);
  assert.doesNotMatch(f, /type="time"/);
  assert.match(f, /id="usCalendarDateField"[^>]*hidden/);
  for (const gone of [/Quanto dura/, /Ricordamelo/, /Ricorda a/, /Una nota/, /usCalendarNoteInput/, /usCalendarKindPicker/, /data-us-cal-duration/, /data-us-cal-reminder/]) {
    assert.doesNotMatch(f, gone);
  }
  assert.doesNotMatch(html(), /id="usCalendarAddBtn"|us-cal-fab/);
  assert.doesNotMatch(css(), /\.us-cal-fab|\.us-cal-kind-picker|\.us-cal-reminder-picker/);
  assert.match(js(), /if \(dateField\) dateField\.hidden = mode !== 'edit';/);
});

test('M9C/M10.1C: month day selects, "Aggiungi impegno" and the week day create; tapping an event opens it', () => {
  const src = js();
  assert.match(src, /function startCreateForDate\(dateISO\)/);
  assert.match(src, /selectDay\(btn\.dataset\.date\)/, 'month cell selects the day');
  assert.match(src, /\$\('usCalendarAddEntry'\)\?\.addEventListener\('click', \(\) => startCreateForDate\(selectedDate \|\| todayISO\(\)\)\)/, 'explicit create');
  assert.match(src, /\.us-cal-week-day\[data-date\]'\)\.forEach\(\(day\) => day\.addEventListener\('click', \(event\) => \{\s*if \(event\.target\.closest\?\.\('\[data-entry-id\]'\)\) return;/, 'week day, but not when an event was tapped');
  assert.match(src, /querySelectorAll\('\[data-entry-id\]'\)\.forEach\(\(btn\) => btn\.addEventListener\('click', \(\) => openDetail\(btn\.dataset\.entryId\)\)\)/);
});

test('M9C: manual entries default to personal; Da vivere keeps creating shared entries', () => {
  const src = js();
  assert.match(src, /calendarKind = mode === 'edit' \? entry\.entry_type : 'personal';/);
  assert.match(src, /const kind = ideaLink \? 'shared' : calendarKind;/);
  assert.match(src, /calendarKind = 'shared';/);
});

test('M9C: create uses the 60-minute default, a single day, no hidden note or place', () => {
  assert.deepEqual(cal.quickEntryHiddenFields({ editingEntry: null, allDay: false }), { description: null, location: null, durationMinutes: 60, spanDays: 0 });
  assert.deepEqual(cal.quickEntryHiddenFields({ editingEntry: null, allDay: true }), { description: null, location: null, durationMinutes: 60, spanDays: 0 });
  assert.equal(cal.quickEntryHiddenFields({ editingEntry: null, ideaNote: 'Portare il vino' }).description, 'Portare il vino', 'an idea note travels as the description');
  const p = cal.buildEntryPayload({ title: 'Cena', allDay: false, date: '2026-10-02', time: '20:00', durationMinutes: 60, spanDays: 0 });
  assert.equal(p.starts_at, localISO(2026, 10, 2, 20, 0));
  assert.equal(p.ends_at, localISO(2026, 10, 2, 21, 0));
});

test('M9C: editing preserves description, place, duration and all-day span', () => {
  const timed = { is_all_day: false, starts_at: localISO(2026, 10, 2, 20, 0), ends_at: localISO(2026, 10, 2, 22, 30), description: 'Portare il vino', location: 'Da noi' };
  assert.deepEqual(cal.quickEntryHiddenFields({ editingEntry: timed, allDay: false }), { description: 'Portare il vino', location: 'Da noi', durationMinutes: 150, spanDays: 0 });
  const trip = { is_all_day: true, start_date: '2026-10-10', end_date: '2026-10-12', description: 'Mare', location: null };
  const kept = cal.quickEntryHiddenFields({ editingEntry: trip, allDay: true });
  assert.equal(kept.description, 'Mare');
  assert.ok(kept.spanDays >= 2, 'a multi-day all-day entry keeps its span');
  const p = cal.buildEntryPayload({ title: 'Mare', allDay: true, date: '2026-10-10', spanDays: kept.spanDays });
  assert.equal(p.start_date, '2026-10-10');
  assert.equal(p.end_date, '2026-10-12');
});

test('M9C: existing reminders are never deleted or re-synced by the quick form', () => {
  const src = js();
  assert.doesNotMatch(src, /syncEntryReminders|formReminderOffset|formReminderTarget/);
  assert.doesNotMatch(src, /\.from\('calendar_reminders'\)\.(delete|insert|update|upsert)\(/);
  const save = src.match(/async function saveEntry\(event\)[\s\S]*?^}/m)?.[0] || '';
  assert.doesNotMatch(save, /calendar_reminders/);
});

test('M9C: Da vivere picks a day through a cancellable banner, then opens the shared form', () => {
  const src = js();
  assert.match(html(), /id="usCalendarPickBanner"[^>]*hidden/);
  assert.match(html(), /id="usCalendarPickCancel"/);
  assert.match(src, /if \(pendingIdeaPick\) \{ openIdeaForm\(pendingIdeaPick, dateISO\); return; \}/);
  assert.match(src, /function clearIdeaPick\(\)/);
  assert.match(src, /function closeCalendarSurface[\s\S]*?clearIdeaPick\(\)/);
});
