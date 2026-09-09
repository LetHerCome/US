const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Gate 1 typography uses official local Newsreader and Inter assets with fallbacks', () => {
  const css = read('ui-foundation.css');
  assert.match(css, /@font-face\{font-family:"Newsreader";src:url\("\/assets\/fonts\/Newsreader-Variable\.woff2"\)/);
  assert.match(css, /@font-face\{font-family:"Inter";src:url\("\/assets\/fonts\/Inter-Variable\.woff2"\)/);
  assert.match(css, /--us-font-editorial:"Newsreader",Georgia,serif/);
  assert.match(css, /--us-font-ui:"Inter",system-ui/);
  assert.doesNotMatch(css, /fonts\.googleapis\.com|use\.typekit\.net|cdn\./i);
  assert.ok(fs.statSync(path.join(ROOT, 'assets/fonts/Newsreader-Variable.woff2')).size > 1000);
  assert.ok(fs.statSync(path.join(ROOT, 'assets/fonts/Inter-Variable.woff2')).size > 1000);
  assert.match(read('assets/fonts/PROVENANCE.md'), /SIL Open Font License 1\.1/);
});
