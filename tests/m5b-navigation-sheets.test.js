const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

test('la navigazione usa un ingresso direzionale M5B senza riattivare il fade legacy', () => {
  const app = read('app.js');
  // T1 1.0 — the page-entry rules moved from polish4.css to styles.css.
  const css = read('styles.css');
  const index = read('index.html');

  assert.match(index, /onclick="go\('home',\{nav:true\}\)"/);
  assert.match(index, /onclick="go\('moments',\{nav:true\}\)"/);
  assert.match(index, /onclick="openQuizHub\(\{nav:true\}\)"/);
  assert.match(app, /us-motion5-enter-next/);
  assert.match(app, /us-motion5-enter-prev/);
  assert.match(app, /isReducedMotion/);
  assert.match(css, /\.page\.active\.us-motion5-enter-next/);
  assert.match(css, /\.page\.active\.us-motion5-enter-prev/);
  // Il diario, ma pulito (15/11/2026): 260 ms, ±28px and a fade from 0; the timer in app.js waits 280 ms.
  assert.match(css, /animation:usMotion5PageEnter 260ms cubic-bezier\(\.2,\.8,\.2,1\) both/);
  assert.match(css, /\.page\.active\.us-motion5-enter-next\{--us-motion5-enter-x:28px\}/);
  assert.match(css, /\.page\.active\.us-motion5-enter-prev\{--us-motion5-enter-x:-28px\}/);
  assert.match(css, /from\{opacity:0;transform:translate3d\(var\(--us-motion5-enter-x\),0,0\)\}/);
  assert.match(app, /\},280\); \/\/ the 260 ms entry of styles\.css, plus a frame/);
});

test('le superfici concordate adottano l opt-in motion', () => {
  const index = read('index.html');
  const albums = read('moments-albums.js');
  const foundation = read('ui-foundation.css');

  // Mockup v5 «I fogli» (16/11/2026): the question of today moves in diario.css (.dy-foglio).
  assert.match(index, /id=["']today["'] class="dy-foglio"/);
  ['usEventsOverlay', 'usSettingsOverlay'].forEach((id) => {
    assert.match(index, new RegExp(`id=["']${id}["'][^>]*data-us-motion-surface`));
  });
  assert.match(albums, /overlay\.setAttribute\('data-us-motion-surface',\s*''\)/);
  assert.match(index, /id=["']momentViewer["'][^>]*data-us-motion-surface/);
  assert.match(foundation, /\[data-us-motion-surface\]\[data-us-motion-exiting\]/);
  assert.match(foundation, /\[data-us-motion-surface\] \.us-modal-backdrop/);
  assert.match(foundation, /\[data-us-motion-surface\] \[data-us-modal-panel\]/);
});

test('la foundation governa le sheet opt-in e swipe usa i token M5A', () => {
  const foundation = read('ui-foundation.css');
  const app = read('app.js');

  assert.match(foundation, /transition:transform var\(--us-motion-surface\) var\(--us-ease-enter\),opacity var\(--us-motion-micro\) var\(--us-ease-standard\)/);
  assert.match(foundation, /\[data-us-motion-surface\] \[data-us-modal-panel\][\s\S]*animation:none/);
  assert.match(app, /US_MOTION_SURFACE_MS=260/);
  assert.match(app, /US_MOTION_BASE_MS=220/);
});
