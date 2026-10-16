// Oggi (16/10, founder screenshot): a long one-line photo caption made the
// bottom dock wider than the phone; caption and the "Aspetta te" card were
// cut on the right. The dock is one column that never grows past itself.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'dc-oggi.css'), 'utf8');

test('Oggi dock: a single minmax(0,1fr) column, so the widest child cannot widen it', () => {
  const dock = css.match(/#home \.us-oggi-dock\{[^}]*\}/)?.[0] || '';
  assert.match(dock, /display:grid;/);
  assert.match(dock, /grid-template-columns:minmax\(0,1fr\);/);
  assert.match(dock, /width:min\(420px,calc\(100% - 28px\)\);/);
});

test('Oggi caption: may shrink, then ends with an ellipsis on one line', () => {
  assert.match(css, /#home #usOggiCaption\.og-cap\{min-width:0;/);
  assert.match(css, /#home #usOggiCaption em\{[^}]*overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/);
});
