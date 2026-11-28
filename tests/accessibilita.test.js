// Accessibilità (founder, 20/11/2026): the text follows the phone's font size
// (Android text zoom, iPhone Dynamic Type) and the attribute a screen reader
// reads as a hint is translated too. Kept when staging restarted from main
// (23/11/2026, D1 of docs/missions/redesign-definitivo.md); the layouts at the
// largest sizes are checked again in each phase of the redesign.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Accessibilità static: the phone font size reaches the WebView on Android and iPhone', () => {
  const view = read('android/app/src/main/java/com/usapp/us/UsWebView.java');
  assert.match(view, /getSettings\(\)\.setTextZoom\(Math\.max\(85, Math\.min\(200, Math\.round\(fontScale \* 100\)\)\)\);/);
  const platform = read('platform.js');
  assert.match(platform, /font:-apple-system-body/);
  assert.match(platform, /el\.style\.setProperty\('-webkit-text-size-adjust', pct\)/);
  assert.match(platform, /addEventListener\('visibilitychange', \(\) => \{ if \(!document\.hidden\) applyIosTextSize\(\); \}\)/);
  assert.match(read('i18n.js'), /const ATTRS = \['placeholder', 'aria-label', 'aria-description', 'title', 'alt'\];/);
  assert.match(read('couple-notes.css'), /\.us-postit :is\(\.us-notes-title,\.us-notes-text,\.us-notes-item-text\):focus-visible\{/);
});
