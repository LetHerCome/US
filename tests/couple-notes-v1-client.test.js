// Note condivise V1, client: how a note reads in the list, what goes to the
// server, and how the module is wired into Noi. The server rules are in
// couple-notes-v1-db.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const N = require('../couple-notes.js');

test('when: adesso, minutes, oggi, ieri, then the date (Rome days)', () => {
  const now = Date.parse('2026-10-31T15:00:00+01:00');
  assert.equal(N.when('2026-10-31T14:59:40+01:00', now), 'adesso');
  assert.equal(N.when('2026-10-31T14:35:00+01:00', now), '25 min fa');
  assert.equal(N.when('2026-10-31T00:30:00+01:00', now), 'oggi');
  assert.equal(N.when('2026-10-30T23:50:00+01:00', now), 'ieri');
  assert.equal(N.when('2026-10-12T10:00:00+02:00', now), '12 ottobre');
  assert.equal(N.when('2025-12-24T10:00:00+01:00', now), '24 dicembre 2025');
  assert.equal(N.when(null, now), '');
});

test('the card: first line of the text, or what is left on the list, and the count', () => {
  const list = [{ id: 'a', text: 'Latte', done: true }, { id: 'b', text: 'Pane', done: false }, { id: 'c', text: ' ', done: false }];
  assert.deepEqual(N.summary({ title: 'Spesa', body: '', items: list }), { preview: 'Pane', progress: '1 di 2' });
  assert.deepEqual(N.summary({ title: 'Film', body: '\n  Il gladiatore\nAltro', items: [] }), { preview: 'Il gladiatore', progress: '' });
  assert.equal(N.summary({ body: 'x'.repeat(120) }).preview.length, 90);
});

test('a note with nothing written is empty; empty items go when it is closed', () => {
  assert.ok(N.isEmpty({ title: ' ', body: '\n', items: [{ id: 'a', text: '  ', done: false }] }));
  assert.ok(!N.isEmpty({ title: '', body: '', items: [{ id: 'a', text: 'Latte', done: false }] }));
  const note = { title: 't'.repeat(90), body: 'b', items: [{ id: 'a', text: 'Latte', done: 1 }, { id: 'b', text: '', done: false }] };
  assert.deepEqual(N.payload(note, { keep: false }), { title: 't'.repeat(80), body: 'b', items: [{ id: 'a', text: 'Latte', done: true }] });
  assert.equal(N.payload(note).items.length, 2, 'while writing, the new empty item stays');
});

test('wired into Noi: link, Foglio, back, realtime, reset, cache and builds', () => {
  const html = read('index.html');
  assert.match(html, /<script defer src="\/couple-notes\.js\?v=[^"]+"/);
  assert.match(html, /<link rel="stylesheet" href="\/couple-notes\.css\?v=[^"]+"/);
  assert.match(html, /id="usNotesSheet" class="us-notes-overlay us-foglio"[^>]*data-us-modal/);
  assert.match(html, /data-noi-open-link="note"[\s\S]{0,200}<b>Note<\/b>/);
  assert.match(read('noi-v2.js'), /link==='note'\)window\.UsCoupleNotes\?\.open\?\.\(\)/);
  assert.match(read('navigation.js'), /name:'notes'[\s\S]{0,200}usNotesSheet[\s\S]{0,200}UsCoupleNotes\?\.back/);
  const app = read('app.js');
  assert.match(app, /table:'couple_notes',filter:`couple_id=eq\.\$\{coupleId\}`\},payload=>window\.UsCoupleNotes\?\.onChange\?\.\(payload\)\)/, 'the one realtime channel of the app');
  assert.match(app, /UsCoupleNotes\?\.reset\?\.\(\)/);
  const sw = read('service-worker.js');
  assert.ok(sw.includes('versioned("/couple-notes.js")') && sw.includes('versioned("/couple-notes.css")'));
  for (const f of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) {
    assert.ok(read(f).includes("'couple-notes.js'") && read(f).includes("'couple-notes.css'"), f);
  }
  const js = read('couple-notes.js');
  // Founder, 31/10/2026: squares you read, tick and write on in place.
  assert.match(js, /class="us-notes-grid"/);
  assert.match(js, /data-tick="\$\{esc\(i\.id\)\}"/, 'items tick on the square');
  assert.match(js, /class="us-notes-tile is-editing" data-editor/, 'the square widens to be written on');
  assert.match(read('couple-notes.css'), /\.us-notes-tile\.is-editing\{grid-column:1\/-1;/);
  assert.doesNotMatch(js, /autocomplete=/, 'the keyboard keeps suggestions and emoji');
  assert.doesNotMatch(js, /\.channel\(/, 'no second realtime channel');
  assert.ok(read('i18n-en.js').includes("'Nuova nota': 'New note'"));
});
