// Novità (founder, 30/10/2026): at the first opening after the update, the beta
// testers see once what changed. A new install does not: it has nothing to compare.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const F = require('../ui-foundation.js');
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };

test('once after the update, for who already used US on this phone', () => {
  const s = store();
  assert.equal(F.releaseNotesDue('1.3', { storage: s, returning: true }), true, 'from 1.2.4: never seen');
  assert.equal(F.releaseNotesDue('1.3', { storage: s, returning: true }), false, 'only once');
  assert.equal(F.releaseNotesDue('1.4', { storage: s, returning: true }), true, 'the next release has its own');
});

test('a new install or a broken storage never shows it', () => {
  const s = store();
  assert.equal(F.releaseNotesDue('1.3', { storage: s, returning: false }), false);
  assert.equal(F.releaseNotesDue('1.3', { storage: s, returning: true }), false, 'marked as seen on the first opening');
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(F.releaseNotesDue('1.3', { storage: broken, returning: true }), false);
});

test('the notice can carry a list, written as text', () => {
  const src = read('ui-foundation.js');
  assert.match(src, /if \(Array\.isArray\(options\.items\) && options\.items\.length\)/);
  assert.match(src, /li\.textContent = text\(item\);/);
  assert.match(read('ui-foundation.css'), /\.us-confirm-list\{/);
});

test('wired: after sign-in on a phone that knew US, the list of what is new', () => {
  const app = read('app.js');
  assert.match(app, /const usReturningDevice=Boolean\(localStorage\.getItem\('us:fix4:last-profile'\)\);/);
  assert.match(app, /usShowWhatsNew\(usReturningDevice\);/);
  const body = app.slice(app.indexOf('const US_WHATS_NEW='), app.indexOf('function usShowWhatsNew(') + 600);
  assert.match(body, /releaseNotesDue\?\.\(US_WHATS_NEW\.id,\{returning\}\)/);
  assert.match(body, /notice\?\.\(\{kicker:'Novità',title:US_WHATS_NEW\.title,items:US_WHATS_NEW\.items,confirmLabel:'Ho capito',icon:'sparkle'\}\)/);
  for (const item of ['colore', 'cuore', 'Mappa dei Ricordi', 'Sintonia', 'Gioca', 'aggiorna da sola']) assert.match(body, new RegExp(item), item);
  const en = read('i18n-en.js');
  assert.ok(en.includes("'Ho capito'") || en.includes('"Ho capito"'));
  assert.ok(en.includes("'Novità'"));
});
