const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('M5G5 camera overlay participates in the fixed modal and open selectors', () => {
  const css = read('left-for-you.css');
  assert.match(css, /#leftForYouOverlay,#leftForYouComposerOverlay,#leftForYouCameraOverlay\{/);
  assert.match(css, /#leftForYouOverlay\.open,#leftForYouComposerOverlay\.open,#leftForYouCameraOverlay\.open\{/);
  assert.match(css, /\.left-for-you-camera-overlay\{z-index:10030\}/);
});

test('M5G5 enabled composer CTA has an explicit enabled visual state', () => {
  const css = read('left-for-you.css');
  assert.match(css, /\.left-for-you-composer-actions button:not\(:disabled\)/);
  assert.match(css, /\.left-for-you-composer-actions button:disabled/);
  assert.match(css, /box-shadow:/);
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
