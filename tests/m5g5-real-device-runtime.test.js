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

test('M5G5 location policy treats twelve-hour-old coordinates as stale', () => {
  const app = read('app.js');
  assert.match(app, /const LOCATION_STALE_MS=60\*60\*1000/);
  assert.match(app, /if\(stalePartner\|\|staleMine\)\{/);
  assert.match(app, /value\.textContent='Posizione non aggiornata'/);
  assert.ok(app.indexOf('if(stalePartner||staleMine){') < app.indexOf('const km=distanceKm('));
});

test('M5G5 missing profileAvatarImg cannot crash avatar hydration', () => {
  const app = read('app.js');
  const block = app.slice(app.indexOf('async function hydrateProfileAvatars'), app.indexOf('window.hydrateProfileAvatars'));
  assert.match(block, /const img=document\.getElementById\('profileAvatarImg'\)/);
  assert.match(block, /if\(img\)\{/);
});
