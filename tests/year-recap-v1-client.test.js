// Il vostro anno V1, client: which cards show, how they read, and how the
// module is wired into the shell. The server rules are in
// year-recap-v1-db.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const R = require('../year-recap.js');

const names = { francesco: 'Francesco', beatrice: 'Bea' };
const recap = (over = {}) => ({
  period: { start: '2025-10-22', end: '2026-10-21', full_year: false, first_year: false, years: 1, months: 23 },
  days_together: 729,
  moments: { count: 6, photos: 8, top_month: '2026-03', top_month_count: 3, first: { moment_date: '2025-12-20', storage_path: 'c/a/1.webp', thumbnail_path: 'c/a/t1.webp' }, last: { moment_date: '2026-10-21', storage_path: 'c/a/6.webp', thumbnail_path: null } },
  think: { total: 3, francesco: 2, beatrice: 1 },
  daily: { answered_together: 2, kept: 1 }, games: { completed: 1 }, missions: { completed: 0 }, events: { lived: 1 }, left_for_you: { count: 0 },
  ...over,
});

test('cards: opening and closing always, the rest only when there is something', () => {
  assert.deepEqual(R.cards(recap()).map((c) => c.kind), ['intro', 'moments', 'top_month', 'think', 'daily', 'together', 'outro']);
  const empty = recap({ moments: { count: 0, photos: 0, top_month: null, top_month_count: 0, first: null, last: null }, think: { total: 0, francesco: 0, beatrice: 0 },
    daily: { answered_together: 0, kept: 0 }, games: { completed: 0 }, missions: { completed: 0 }, events: { lived: 0 }, left_for_you: { count: 0 } });
  assert.deepEqual(R.cards(empty).map((c) => c.kind), ['intro', 'outro']);
  assert.ok(!R.cards(recap({ moments: { ...recap().moments, top_month_count: 1 } })).some((c) => c.kind === 'top_month'), 'one memory a month is not a «most» month');
  assert.equal(R.cards(null).length, 0);
});

test('the title says which year it is', () => {
  assert.equal(R.title(recap()), 'Il vostro anno, finora');
  assert.equal(R.title(recap({ period: { ...recap().period, full_year: true, years: 2 } })), '2 anni insieme');
  assert.equal(R.title(recap({ period: { ...recap().period, full_year: true, years: 1 } })), 'Il vostro primo anno');
  assert.equal(R.title(recap({ period: { ...recap().period, first_year: true, years: 0, months: 7 } })), 'I vostri primi 7 mesi');
  assert.equal(R.title(recap({ period: { ...recap().period, first_year: true, years: 0, months: 1 } })), 'Il vostro primo mese');
  assert.equal(R.title(recap({ period: { ...recap().period, first_year: true, years: 0, months: 0 } })), 'I vostri primi giorni');
});

test('Ti penso is told lightly, never as a ranking', () => {
  assert.equal(R.thinkLine(recap().think, names, 'beatrice'), 'Francesco ti ha pensato un po’ di più');
  assert.equal(R.thinkLine(recap().think, names, 'francesco'), 'Hai pensato tu un po’ di più', 'said to the one who reads it');
  assert.equal(R.thinkLine({ total: 4, francesco: 2, beatrice: 2 }, names, 'beatrice'), 'Pari: vi siete pensati tanto quanto');
  assert.equal(R.thinkLine({ total: 3, francesco: 0, beatrice: 0 }, names, 'beatrice'), '');
  for (const c of R.cards(recap())) assert.doesNotMatch(JSON.stringify(c), /vinc|classific|punt|record/i);
});

test('plural words follow the number', () => {
  assert.equal(R.count(1, 'ricordo', 'ricordi'), '1 ricordo');
  assert.equal(R.count(6, 'ricordo', 'ricordi'), '6 ricordi');
  assert.equal(R.count(0, 'foto', 'foto'), '0 foto');
});

test('names are escaped; no written text ever reaches the cards', () => {
  const html = R.cards(recap()).map((c) => R.renderCard(c, { names: { francesco: '<b>F</b>', beatrice: 'Bea' }, photo: () => '' })).join('');
  assert.doesNotMatch(html, /<b>F<\/b>/);
  assert.match(html, /&lt;b&gt;F/);
  assert.match(html, /translate="no"/, 'names are never translated');
});

test('shell: loaded, precached, built, back-closable, reset; Oggi and Noi open it', () => {
  const html = read('index.html');
  assert.match(html, /<script defer src="\/year-recap\.js\?v=[^"]+"/);
  assert.match(html, /<link rel="stylesheet" href="\/year-recap\.css\?v=[^"]+"/);
  assert.match(html, /id="usRecapSheet"[^>]*data-us-modal/);
  assert.match(html, /id="noiRecapRow"/);
  const sw = read('service-worker.js');
  assert.ok(sw.includes('versioned("/year-recap.js")') && sw.includes('versioned("/year-recap.css")'));
  for (const f of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) {
    assert.ok(read(f).includes("'year-recap.js'") && read(f).includes("'year-recap.css'"), f);
  }
  assert.match(read('navigation.js'), /name:'year-recap'[\s\S]{0,200}usRecapSheet[\s\S]{0,200}UsYearRecap\?\.close/);
  const app = read('app.js');
  assert.match(app, /UsYearRecap\?\.reset\?\.\(\)/);
  assert.match(app, /action==='recap'\)window\.UsYearRecap\?\.open\?\.\(\)/);
  assert.match(app, /action:day\.years\?'recap':'events'/, 'the anniversary card opens the recap');
  const js = read('year-recap.js');
  assert.ok(js.includes("'get_couple_year_recap'"));
  assert.doesNotMatch(js, /\.from\(/, 'one RPC, no direct table read');
});

test('English for the fixed lines', () => {
  const en = read('i18n-en.js');
  for (const it of ['Il vostro anno', 'Il vostro anno, finora', 'Il vostro primo anno', 'Il mese più vostro', 'Il prossimo anno comincia oggi'])
    assert.ok(en.includes(`'${it}'`), it);
});
