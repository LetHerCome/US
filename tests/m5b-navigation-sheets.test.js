const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

test('la navigazione usa un ingresso direzionale M5B senza riattivare il fade legacy', () => {
  const app = read('app.js');
  const css = read('polish4.css');
  const index = read('index.html');

  assert.match(index, /onclick="go\('home',\{nav:true\}\)"/);
  assert.match(index, /onclick="go\('moments',\{nav:true\}\)"/);
  assert.match(index, /onclick="openQuizHub\(\{nav:true\}\)"/);
  assert.match(app, /us-motion5-enter-next/);
  assert.match(app, /us-motion5-enter-prev/);
  assert.match(app, /isReducedMotion/);
  assert.match(css, /\.page\.active\.us-motion5-enter-next/);
  assert.match(css, /\.page\.active\.us-motion5-enter-prev/);
  assert.match(css, /animation:usMotion5PageEnter var\(--us-motion-fast\) var\(--us-ease-enter\) both/);
  assert.match(css, /html\.us-motion31-promoting \.page\.active\.us-motion5-enter-next/);
});

test('le sole superfici non fotografiche concordate adottano l opt-in motion', () => {
  const index = read('index.html');
  const albums = read('moments-albums.js');
  const foundation = read('ui-foundation.css');

  ['today', 'usEventsOverlay', 'usSettingsOverlay'].forEach((id) => {
    assert.match(index, new RegExp(`id=["']${id}["'][^>]*data-us-motion-surface`));
  });
  assert.match(albums, /overlay\.setAttribute\('data-us-motion-surface',\s*''\)/);
  assert.doesNotMatch(index, /id=["']momentViewer["'][^>]*data-us-motion-surface/);
  assert.match(foundation, /\[data-us-motion-surface\]\[data-us-motion-exiting\]/);
  assert.match(foundation, /\[data-us-motion-surface\] \.us-modal-backdrop/);
  assert.match(foundation, /\[data-us-motion-surface\] \[data-us-modal-panel\]/);
});

test('la foundation governa le sheet opt-in e swipe usa i token M5A', () => {
  const foundation = read('ui-foundation.css');
  const polish = read('polish4.css');
  const app = read('app.js');

  assert.match(foundation, /transition:transform var\(--us-motion-surface\) var\(--us-ease-enter\),opacity var\(--us-motion-micro\) var\(--us-ease-standard\)/);
  assert.match(foundation, /\[data-us-motion-surface\] \[data-us-modal-panel\][\s\S]*animation:none/);
  assert.match(polish, /transition:transform var\(--us-motion-surface\) var\(--us-ease-standard\)!important/);
  assert.match(polish, /transition:transform var\(--us-motion-base\) var\(--us-ease-standard\)!important/);
  assert.match(app, /US_MOTION_SURFACE_MS=260/);
  assert.match(app, /US_MOTION_BASE_MS=220/);
});
