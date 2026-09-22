const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('la modalità local dev è esplicita, localhost-only e non è un bypass Auth', () => {
  const html = read('index.html');
  assert.match(html, /params\.get\('us-dev'\) !== '1'/);
  assert.match(html, /hostname === 'localhost'/);
  assert.match(html, /hostname === '127\.0\.0\.1'/);
  assert.match(html, /nativeRuntime/);
  assert.match(html, /us:local-dev:service-worker-reset:v1/);
  assert.match(html, /us-private-media-v1/);
  assert.doesNotMatch(html, /signInAnonymously|claim_us_role|createClient/);
});

test('local dev disabilita soltanto Service Worker, Web Push e update checker', () => {
  const app = read('app.js');
  const fix4 = read('fix4.js');
  assert.match(app, /!window\.__US_LOCAL_DEV__&&window\.UsPlatform\?\.canUseServiceWorker/);
  assert.match(app, /!window\.__US_LOCAL_DEV__&&window\.UsPlatform\?\.canUseWebPush/);
  assert.match(fix4, /!window\.__US_LOCAL_DEV__ && window\.UsPlatform\?\.canUsePwaUpdates/);
  assert.match(app, /signInAnonymously/);
  assert.match(app, /claim_us_role/);
});

test('il service worker production resta invariato e la modalità dev non altera la pipeline native', () => {
  const worker = read('service-worker.js');
  const packageJson = read('package.json');
  assert.match(worker, /const MEDIA_CACHE_NAME = "us-private-media-v1"/);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(packageJson, /"build:capacitor-web"/);
  assert.doesNotMatch(read('capacitor.config.json'), /server\s*:/);
});
