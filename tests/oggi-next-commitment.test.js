// Round 3 (founder, 2026-10-15: "inserendo un impegno per la giornata di domani
// in calendario non viene mostrato in Oggi come mostra il mockup").
// Oggi's pill (mockup .og-next "Domani, 21:00 · Cena da Marco") reads both the
// shared events and the Noi calendar (either person's commitments).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const { oggiNextCommitment } = require('../calendar.js');

// Local wall-clock instants, so the test holds in any time zone.
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const timed = (id, d, h, endD, endH, extra = {}) => ({ id, title: id, is_all_day: false, starts_at: at(d, h), ends_at: at(endD, endH), entry_type: 'personal', ...extra });
const allDay = (id, start, end) => ({ id, title: id, is_all_day: true, start_date: start, end_date: end, entry_type: 'shared' });
const NOW = at(15, 15); // Thursday 15 October 2026, 15:00
const TODAY = '2026-10-15';

test('the next commitment: tomorrow 21:00 reads as the mockup pill expects', () => {
  const next = oggiNextCommitment([timed('Cena da Marco', 16, 21, 16, 23)], NOW, TODAY);
  assert.deepEqual(next, { kind: 'calendar', id: 'Cena da Marco', title: 'Cena da Marco', effective_date: '2026-10-16', days_left: 1, event_time: '21:00', started: false });
});

test('only today, tomorrow and the day after; what is over is skipped', () => {
  assert.equal(oggiNextCommitment([timed('Dopodomani+1', 18, 9, 18, 10)], NOW, TODAY), null, 'three days ahead is out of range');
  assert.equal(oggiNextCommitment([timed('Stamattina', 15, 9, 15, 10)], NOW, TODAY), null, 'an ended one is not "next"');
  assert.equal(oggiNextCommitment([timed('Ieri notte', 14, 23, 15, 1)], NOW, TODAY), null);
  assert.equal(oggiNextCommitment([{ id: 'x', title: '  ', is_all_day: false, starts_at: at(16, 9), ends_at: at(16, 10) }], NOW, TODAY), null, 'no title, no pill');
  assert.equal(oggiNextCommitment([allDay('Vecchio', '2026-10-10', '2026-10-14')], NOW, TODAY), null);
  assert.equal(oggiNextCommitment([timed('Dopodomani', 17, 8, 17, 9)], NOW, TODAY).days_left, 2);
});

test('upcoming first by day and time; one in progress only when nothing else is coming', () => {
  const list = [timed('In corso', 15, 14, 15, 17), timed('Dopodomani 8', 17, 8, 17, 9), timed('Domani 9', 16, 9, 16, 10), allDay('Tutto il giorno', '2026-10-16', '2026-10-16')];
  assert.equal(oggiNextCommitment(list, NOW, TODAY).id, 'Domani 9');
  const inProgress = oggiNextCommitment([timed('In corso', 15, 14, 15, 17)], NOW, TODAY);
  assert.deepEqual([inProgress.id, inProgress.started, inProgress.event_time], ['In corso', true, '14:00']);
  // Without a time it comes at the end of its day, as in the Events list.
  assert.equal(oggiNextCommitment([allDay('Tutto il giorno', '2026-10-15', '2026-10-15'), timed('Stasera', 15, 21, 15, 22)], NOW, TODAY).id, 'Stasera');
});

test('a commitment that began earlier counts on today, without a time that is not today\'s', () => {
  const trip = oggiNextCommitment([allDay('Viaggio', '2026-10-13', '2026-10-17')], NOW, TODAY);
  assert.deepEqual([trip.effective_date, trip.days_left, trip.event_time, trip.started], ['2026-10-15', 0, null, false]);
  const night = oggiNextCommitment([timed('Turno', 14, 22, 15, 18)], NOW, TODAY);
  assert.deepEqual([night.effective_date, night.event_time, night.started], ['2026-10-15', null, true]);
});

test('either person and shared entries are all candidates (the read is per couple, not per owner)', () => {
  const mine = timed('Mio', 16, 20, 16, 21, { owner_id: 'f1' });
  const hers = timed('Suo', 16, 19, 16, 20, { owner_id: 'b1' });
  const ours = timed('Nostro', 16, 22, 16, 23, { entry_type: 'shared', owner_id: null });
  assert.equal(oggiNextCommitment([mine, hers, ours], NOW, TODAY).id, 'Suo');
});

function appRuntime() {
  const app = read('app.js');
  const pick = (name) => {
    const start = app.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, name);
    const end = app.indexOf('\n}\n', start);
    return app.slice(start, end + 2);
  };
  const context = vm.createContext({ globalThis: {}, Date, Number, String });
  vm.runInContext([pick('oggiLocaleTag'), pick('oggiNextEventViewModel'), pick('oggiNearestNext')].join('\n'), context);
  return context;
}

test('Oggi merges the next event and the next commitment, and the pill keeps the mockup wording', () => {
  const { oggiNearestNext, oggiNextEventViewModel } = appRuntime();
  const event = { id: 'e1', title: 'Cinema', effective_date: '2026-10-17', days_left: 2, event_time: '18:00:00' };
  const commitment = { kind: 'calendar', id: 'c1', title: 'Cena da Marco', effective_date: '2026-10-16', days_left: 1, event_time: '21:00', started: false };
  const next = oggiNearestNext(event, commitment);
  assert.equal(next.id, 'c1');
  const model = oggiNextEventViewModel(next);
  assert.deepEqual({ kind: model.kind, when: model.when, title: model.title, date: model.date }, { kind: 'calendar', when: 'Domani, 21:00', title: 'Cena da Marco', date: '2026-10-16' });
  // Same day: the earlier time wins, whichever source it comes from.
  assert.equal(oggiNearestNext({ ...event, effective_date: '2026-10-16', days_left: 1, event_time: '20:30:00' }, commitment).id, 'e1');
  // A commitment already in progress yields to anything still to come.
  assert.equal(oggiNearestNext({ ...commitment, effective_date: '2026-10-15', days_left: 0, started: true }, event).id, 'e1');
  assert.equal(oggiNearestNext(null, null), null);
  assert.equal(oggiNextEventViewModel({ id: 'r', title: 'Mesiversario ♡', system: true, effective_date: '2026-10-16', days_left: 1 }).kind, 'relationship');
});

test('the pill refreshes after calendar and event writes and on the way back to Oggi; a tap opens the source', () => {
  const app = read('app.js');
  const calendar = read('calendar.js');
  const events = read('events.js');
  assert.match(calendar, /async function getOggiNextCommitmentSource\(\{ fresh = false \} = \{\}\)\{?[\s\S]*?fetchEntriesForRange\(coupleId, today, shiftISODate\(today, 3\)\)/);
  assert.equal((calendar.match(/window\.UsOggiNext\?\.refresh\?\.\(\{ calendar: 'fresh' \}\);/g) || []).length, 2, 'after a save and after a delete');
  assert.match(events, /await hydrateEvents\(\);refreshOggiNextFromEvents\(\);[\s\S]*await hydrateEvents\(\);refreshOggiNextFromEvents\(\);[\s\S]*await hydrateEvents\(\);refreshOggiNextFromEvents\(\);/);
  assert.match(app, /if\(id==='home'\)\{[^\n]*window\.UsOggiNext\?\.refresh\?\.\(\{event:'read',calendar:'read'\}\)/);
  assert.match(app, /data\.usNextKind==='calendar'[^\n]*window\.UsCalendarLinks\.openEntry\(data\.usEventId\)/);
  assert.match(app, /data\.usNextKind==='event'[^\n]*window\.openEventEditor\(data\.usEventId/);
});
