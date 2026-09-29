const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// The M7-M8 release bumped version.json and the Service Worker but left the
// index.html build marker behind (fixed afterwards by e547f0b). A mismatch
// makes the update banner compare two different builds forever.
test('release: the index.html build marker and version.json never diverge', () => {
  const marker = read('index.html').match(/<meta name="us-build" content="([^"]+)"\/>/)?.[1];
  const { version } = JSON.parse(read('version.json'));
  assert.ok(marker, 'index.html carries a us-build marker');
  assert.equal(marker, version);
  assert.match(version, /^us-[a-z0-9-]+-\d{8}-\d+$/);
});

test('release: the shell cache has one current name and the private media cache is untouched', () => {
  const worker = read('service-worker.js');
  assert.equal([...worker.matchAll(/const CACHE_NAME = "(us-shell-static-runtime-\d+)";/g)].length, 1);
  assert.match(worker, /const MEDIA_CACHE_NAME = "us-private-media-v1";/);
  assert.match(worker, /key !== CACHE_NAME && key !== MEDIA_CACHE_NAME/);
});

test('release: every Phosphor icon the shell references exists and is precached', () => {
  const worker = read('service-worker.js');
  const sources = ['index.html', 'styles.css', 'calendar.css', 'ui-foundation.css', 'app.js'].map(read).join('\n');
  const icons = [...new Set([...sources.matchAll(/\/assets\/icons\/phosphor\/([a-z0-9-]+\.svg)/g)].map((m) => m[1]))];
  assert.ok(icons.length > 0);
  for (const icon of icons) {
    assert.ok(fs.existsSync(path.join(ROOT, 'assets/icons/phosphor', icon)), `${icon} exists`);
    assert.ok(worker.includes(`"/assets/icons/phosphor/${icon}"`), `${icon} is in APP_SHELL`);
  }
});
