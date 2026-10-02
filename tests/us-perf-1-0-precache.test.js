const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const worker = read('service-worker.js');
const html = read('index.html');

const shell = (() => {
  const block = worker.slice(worker.indexOf('const APP_SHELL'), worker.indexOf('];', worker.indexOf('const APP_SHELL')));
  return [...block.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]);
})();

const runtimeFiles = fs.readdirSync(ROOT)
  .filter((name) => /\.(js|css|html|webmanifest)$/.test(name) && name !== 'service-worker.js');
const runtimeSources = Object.fromEntries(runtimeFiles.map((name) => [name, read(name)]));
const referencedBy = (asset) => runtimeFiles.filter((name) => runtimeSources[name].includes(asset));

// Entries that no HTML/CSS/JS file names but that the platform asks the worker for.
const PLATFORM_REQUIRED = {
  '/': 'the document the offline navigation falls back to',
  '/index.html': 'the cached document (navigation and us-refresh both read and write it)',
  '/version.json': 'update detection (fix4.js reads it; the worker caches it for offline)',
  '/icon-192.png': 'push notification icon and badge (service-worker.js push handler) and the 192 px manifest icon',
  '/icon-512.png': 'the 512 px manifest icon the installed app uses for its launch splash'
};

test('perf 1.0 precache: every entry exists and is required for offline boot or a first-use critical surface', () => {
  assert.ok(shell.length > 60);
  assert.equal(new Set(shell).size, shell.length, 'no duplicated entry');
  const unexplained = [];
  for (const entry of shell) {
    const [pathname] = entry.split('?');
    assert.ok(fs.existsSync(path.join(ROOT, pathname === '/' ? 'index.html' : pathname.slice(1))), `${pathname} exists`);
    if (PLATFORM_REQUIRED[pathname]) continue;
    if (referencedBy(pathname).length === 0 && referencedBy(pathname.slice(1)).length === 0) unexplained.push(pathname);
  }
  assert.deepEqual(unexplained, [], 'precached but not referenced by index.html, any stylesheet, script or the manifest');
  for (const [entry, reason] of Object.entries(PLATFORM_REQUIRED)) {
    assert.ok(shell.some((item) => item.split('?')[0] === entry), `${entry} (${reason}) stays precached`);
  }
});

test('perf 1.0 precache: everything index.html needs to boot offline is precached', () => {
  const needed = [...html.matchAll(/(?:src|href)="(\/(?!\/)[^"?#]+)(?:\?[^"#]*)?"/g)].map((m) => m[1])
    .filter((p) => !p.startsWith('/__'));
  assert.ok(needed.length > 30);
  const missing = needed.filter((p) => !shell.some((entry) => entry.split('?')[0] === p));
  assert.deepEqual(missing, []);
  // Stylesheet url() targets are first paint resources too.
  const cssAssets = new Set();
  for (const name of runtimeFiles.filter((file) => file.endsWith('.css'))) {
    for (const m of runtimeSources[name].matchAll(/url\(["']?(\/assets\/[^"')?#]+)/g)) cssAssets.add(m[1]);
  }
  const cssMissing = [...cssAssets].filter((p) => fs.existsSync(path.join(ROOT, p.slice(1))) && !shell.some((entry) => entry === p));
  // Anything a stylesheet paints and the shell does not precache must be a lazy, non-critical surface.
  assert.deepEqual(cssMissing.filter((p) => /\/(fonts|derived)\//.test(p)), [], 'fonts and brand art are never left to the network');
});

test('perf 1.0 precache: no approved master is precached or loaded; the size budget holds', () => {
  assert.deepEqual(shell.filter((entry) => entry.startsWith('/assets/source/')), [], 'masters live in assets/source and are never shell assets');
  assert.ok(!shell.some((entry) => /apk-foreground-v1\.png/.test(entry)));
  let total = 0; let largest = ['', 0];
  for (const entry of shell) {
    const pathname = entry.split('?')[0];
    if (pathname === '/') continue;
    const size = fs.statSync(path.join(ROOT, pathname.slice(1))).size;
    total += size;
    if (size > largest[1]) largest = [pathname, size];
  }
  assert.ok(largest[1] <= 400 * 1024, `${largest[0]} is ${largest[1]} bytes: shell assets stay under 400 KB each`);
  assert.ok(total <= 2.2 * 1024 * 1024, `precache is ${total} bytes: stays under 2.2 MB`);
});
