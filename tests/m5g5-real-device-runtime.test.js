const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('M5G5 camera overlay participates in the fixed modal and open selectors', () => {
  const css = read('left-for-you.css');
  // Mockup v5 «I fogli» (16/11/2026): reading and writing are the one sheet; the camera keeps its own fixed overlay.
  assert.match(css, /#leftForYouCameraOverlay\{position:fixed/);
  assert.match(css, /#leftForYouCameraOverlay\.open\{opacity:1/);
  // The camera stacks one step above the composer on the sheet rung of the ladder.
  assert.match(css, /#leftForYouCameraOverlay\{z-index:calc\(var\(--us-layer-sheet\) \+ 10\)\}/);
});

test('M5G5 enabled composer CTA has an explicit enabled visual state', () => {
  const css = read('left-for-you.css');
  // Mockup v5 «I fogli» (16/11/2026): the send button is the ink button of the one sheet, muted when disabled.
  void css;
  assert.match(read('index.html'), /class="dy-btn dy-btn-l" id="leftForYouComposerSend" disabled/);
  assert.match(read('diario.css'), /\.dy-btn:disabled,\.dy-btn\[aria-disabled="true"\]\{background:var\(--us-ink-12\);color:var\(--us-ink-40\)/);
});

test('M5G5 location policy treats old coordinates as stale (M12A: the last value stays, marked stale)', () => {
  const app = read('app.js');
  assert.match(app, /const US_LOCATION_STALE_DISPLAY_MS=60\*60\*1000/);
  assert.match(app, /const stale=oldest>US_LOCATION_STALE_DISPLAY_MS;/);
  assert.match(app, /state:stale\?'stale':'ready'/);
  assert.match(read('styles.css'), /\.us-distance-capsule\[data-us-distance-state="stale"\]/);
});

test('M5G5 missing profileAvatarImg cannot crash avatar hydration', () => {
  const app = read('app.js');
  const block = app.slice(app.indexOf('async function hydrateProfileAvatars'), app.indexOf('window.hydrateProfileAvatars'));
  assert.match(block, /const img=document\.getElementById\('profileAvatarImg'\)/);
  assert.match(block, /if\(img\)\{/);
});
