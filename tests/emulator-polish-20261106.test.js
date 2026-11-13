// Prova nell'emulatore del 06/11/2026: barra di stato leggibile, gattino che non
// copre i comandi, «Voi due» e «Blackboard» in inglese.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('a band under the status bar appears only once the page has scrolled', () => {
  const css = read('styles.css');
  assert.match(css, /body::after\{[^}]*position:fixed[^}]*top:0[^}]*height:calc\(var\(--us-safe-top\) \* 1\.4\)[^}]*pointer-events:none[^}]*opacity:0/);
  assert.match(css, /html\[data-us-scrolled\] body::after\{opacity:1\}/);
  const ui = read('ui-foundation.js');
  assert.match(ui, /setAttribute\?\.\('data-us-scrolled', ''\)/);
  assert.match(ui, /addEventListener\?\.\('scroll', syncScrolled, \{ passive: true \}\)/);
});

test('the cat steps aside, without a hit target, when a control rests under it', () => {
  const js = read('pet.js');
  assert.match(js, /function covered\(\)/);
  assert.match(js, /elementsFromPoint/);
  // The home spot without the step aside, or the cat would bob up and down.
  assert.match(js, /left:layer.offsetLeft,top:layer.offsetTop/);
  assert.match(js, /\[role="switch"\]/);
  assert.match(js, /layer\.dataset\.petAside=''/);
  // 13/11/2026 (founder): aside it stays as it is, and taps pass through to the control.
  const css = read('pet.css');
  assert.doesNotMatch(css, /\.us-pet-layer\[data-pet-aside\]\{/, 'no fade, no move, no hide');
  assert.match(css, /\.us-pet-layer\[data-pet-aside\] \.us-pet-hit\{pointer-events:none!important\}/);
  assert.doesNotMatch(css, /\[data-pet-aside\]\{[^}]*visibility:hidden/, 'never vanishes');
});

test('English: the shared Settings section and the blackboard keep their own names', () => {
  const en = read('i18n-en.js');
  assert.match(en, /'Voi due': 'You two'/);
  assert.match(en, /Lavagna: 'Blackboard'/);
  assert.match(en, /Bacheca: 'Board'/);
  assert.match(read('index.html'), /<h3 id="usSettingsVoiTitle">Voi due<\/h3>/);
});
