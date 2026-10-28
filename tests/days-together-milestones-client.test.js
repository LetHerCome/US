// Traguardi dei giorni insieme (founder, 29/10/2026), in the app: Oggi
// celebrates the day, Eventi shows the next one coming, Rivivi keeps it.
// The day count is the server's (relationship-milestones.mjs): calendar days
// since «Insieme dal», every 100, 1000 with its own name.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../calendar-domain.js');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('the days together and the milestone that falls on a day', () => {
  assert.equal(D.daysTogether('2026-04-21', '2029-01-15'), 1000);
  assert.equal(D.daysTogether('2026-04-21', '2026-04-21'), 0);
  assert.equal(D.daysTogether('bad', '2026-04-21'), null);
  assert.equal(D.daysMilestoneOn('2026-04-21', '2026-07-30'), 100);
  assert.equal(D.daysMilestoneOn('2026-04-21', '2029-01-15'), 1000);
  assert.equal(D.daysMilestoneOn('2026-04-21', '2026-07-31'), 0);
  assert.equal(D.daysMilestoneOn('2026-04-21', '2026-04-21'), 0, 'Il nostro giorno is not one');
});

test('the next milestone, from today: its date, days and how far', () => {
  assert.deepEqual(D.nextDaysMilestone('2026-04-21', '2026-07-30'), { date: '2026-07-30', days: 100, days_left: 0 }, 'today counts');
  assert.deepEqual(D.nextDaysMilestone('2026-04-21', '2026-07-31'), { date: '2026-11-07', days: 200, days_left: 99 });
  assert.deepEqual(D.nextDaysMilestone('2026-04-21', '2029-01-03'), { date: '2029-01-15', days: 1000, days_left: 12 });
  assert.deepEqual(D.nextDaysMilestone('2026-04-21', '2026-04-21'), { date: '2026-07-30', days: 100, days_left: 100 });
  assert.equal(D.nextDaysMilestone('', '2026-04-21'), null);
});

test('the words: 1000 has its own name', () => {
  assert.equal(D.daysMilestoneTitle(1000), 'Mille giorni ♡');
  assert.equal(D.daysMilestoneTitle(300), '300 giorni ♡');
  assert.equal(D.daysMilestoneLine(1000), 'Mille giorni insieme');
  assert.equal(D.daysMilestoneLine(300), '300 giorni insieme');
});

test('Oggi: on the day the days milestone takes the celebration slot, before a mesiversario', () => {
  const app = read('app.js');
  assert.match(app, /const daysMilestone=window\.UsCalendarDomain\?\.daysMilestoneOn\?\.\(startedOn,todayISO\)\|\|0;/);
  assert.match(app, /if\(daysMilestone\)return \{\n\s+id:`celebration:\$\{todayISO\}`[\s\S]*?title:daysMilestone===1000\?'Oggi sono mille giorni ♡':`Oggi sono \$\{daysMilestone\} giorni ♡`/);
});

test('Eventi lists the next days milestone; it reads its own awarded row', () => {
  const events = read('events.js');
  assert.match(events, /function nextDaysMilestoneRow\(\)/);
  assert.match(events, /const days=nextDaysMilestoneRow\(\);if\(days\)eventRows\.push\(days\);/);
  assert.match(events, /item\.milestone_date===date&&item\.kind!=='days'/, 'a mesiversario on the same day is not marked by the days row');
  assert.match(events, /item\.milestone_date===next\.date&&item\.kind==='days'/);
  assert.match(events, /select\('milestone_date,kind,months_together,days_together,xp_awarded,awarded_at'\)/);
});

test('Rivivi keeps a days milestone with its count', () => {
  const app = read('app.js');
  assert.match(app, /select\('milestone_date,kind,months_together,days_together,xp_awarded'\)/);
  assert.match(app, /if\(row\.kind==='days'\)\{/);
  assert.match(app, /if\(entry\.milestone==='days'\)return \{title:window\.UsCalendarDomain\?\.daysMilestoneTitle/);
});

test('the Noi calendar shows the days milestones of the months on screen; they open Eventi', () => {
  const vm = require('node:vm');
  const noi = read('noi-v2.js');
  const a = noi.indexOf('function daysMilestoneItems('), b = noi.indexOf('function relationshipItem(', a);
  assert.ok(a >= 0 && b > a);
  const box = {
    window: { UsCalendarDomain: D }, snapshot: { startedOn: '2026-04-21' },
    // October, November and December 2026 on screen.
    nearMonths: () => [[2026, 9], [2026, 10], [2026, 11]],
    iso: (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    dateParts: (v) => { const p = String(v || '').split('-').map(Number); return p.length === 3 && p.every(Number.isInteger) ? p : null; },
  };
  vm.runInNewContext(noi.slice(a, b) + ';this.items=daysMilestoneItems();', box);
  const plain = () => JSON.parse(JSON.stringify(box.items)); // arrays from another realm
  assert.deepEqual(plain().map(({ day, item }) => [day, item.title, item.time, item.months]), [['2026-11-07', '200 giorni ♡', '200 giorni insieme', -1]]);
  box.snapshot.startedOn = '2024-02-15'; // 1000 days: 11 November 2026
  vm.runInNewContext('this.items=daysMilestoneItems();', box);
  assert.deepEqual(plain().map(({ day, item }) => [day, item.title]), [['2026-11-11', 'Mille giorni ♡']]);
  assert.match(noi, /if\(kind==='anniversary'&&item\.dataset\.months!=='0'\)\{window\.openNoiSection\?\.\('eventi'\)/, 'months -1 opens Eventi');
});
