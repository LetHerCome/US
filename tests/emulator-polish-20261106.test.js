// Prova nell'emulatore del 06/11/2026: barra di stato leggibile, «Voi due» e
// «Blackboard» in inglese. (Il gattino è andato in pensione il 23/11/2026, D5.)
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

test('English: the shared Settings section and the blackboard keep their own names', () => {
  const en = read('i18n-en.js');
  assert.match(en, /'Voi due': 'You two'/);
  assert.match(en, /Lavagna: 'Blackboard'/);
  assert.match(en, /Bacheca: 'Board'/);
  assert.match(read('index.html'), /<h3 id="usSettingsVoiTitle">Voi due<\/h3>/);
});
