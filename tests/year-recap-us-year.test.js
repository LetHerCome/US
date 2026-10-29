// «Il vostro anno su US» (founder, 29/10/2026): it shows only when the couple
// completes a year on US (from the day they created the couple in the app),
// for 30 days; in the rest of the year Noi does not have it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../year-recap.js');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('the first year on US: from the day it ends, for 30 days', () => {
  const created = '2025-11-03T21:15:00+00:00';
  assert.equal(R.usYear(created, '2026-10-29'), 0, 'not a year yet');
  assert.equal(R.usYear(created, '2026-11-02'), 0);
  assert.equal(R.usYear(created, '2026-11-03'), 1, 'the day the year ends');
  assert.equal(R.usYear(created, '2026-12-02'), 1, 'the 30th day');
  assert.equal(R.usYear(created, '2026-12-03'), 0, 'gone after 30 days');
  assert.equal(R.usYear(created, '2027-11-03'), 2, 'every year');
});

test('the day on US is the day in Rome, and 29 February has its 28th', () => {
  assert.equal(R.usYear('2025-10-28T23:30:00+00:00', '2026-10-29'), 1, '00:30 in Rome is already the 29th');
  assert.equal(R.usYear('2024-02-29T10:00:00+00:00', '2025-02-28'), 1);
  assert.equal(R.usYear('2024-02-29T10:00:00+00:00', '2025-02-27'), 0);
});

test('nothing without a date', () => {
  assert.equal(R.usYear(null, '2026-10-29'), 0);
  assert.equal(R.usYear('boh', '2026-10-29'), 0);
});

test('wired: Noi shows the row only in that window, named «Il vostro anno su US»', () => {
  assert.match(read('index.html'), /id="noiRecapRow"[^>]*hidden>[\s\S]{0,300}<b>Il vostro anno su US<\/b>/);
  assert.match(read('app.js'), /sb\.from\('couples'\)\.select\('id,name,started_on,created_at'\)/);
  const js = read('year-recap.js');
  assert.match(js, /row\.hidden=!key\(\)\|\|!usYear\(/);
  assert.ok(read('i18n-en.js').includes("'Il vostro anno su US'"));
});
