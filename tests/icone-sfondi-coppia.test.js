// Founder, 24/11/2026 (tavola «US · icone e colori»): icons B, two-tone, then
// one tone again on 25/11/2026. No coloured background in the end: a warm black.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// 25/11/2026: «togliamo il doppio colore dalle icone che non mi piace più»:
// one line in the icon's colour again, in the pages and in the bar.
test('icons: one tone again, the fill under the outline never shows; the bar too', () => {
  const css = read('ui-foundation.css');
  assert.match(css, /\.us-icon::before\{[^}]*opacity:0\}/, 'the fill layer is never visible');
  assert.ok(!css.includes('opacity:var(--us-icon-tint-alpha'));
  assert.match(css, /\.us-icon::after\{background-color:currentColor\}/);
  const nav = read('colori.css');
  assert.ok(!nav.includes('.us-nav-icon-on{display:block!important'), 'the bar: no fill under the outline');
  assert.doesNotMatch(nav, /icone a due toni/i);
});

test('the background: a warm black, no colour behind; no switch left (founder 24/11: «Nero caldo»)', () => {
  const css = read('colori.css');
  assert.match(css, /html{background:#120d11!important;background-attachment:fixed!important}/);
  assert.doesNotMatch(css, /data-us-sfondo/);
  assert.doesNotMatch(read('person-colors.js'), /sfondo/);
});
