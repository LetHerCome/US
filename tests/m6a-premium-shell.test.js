const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const PRIMARY_NAV = ['home', 'moments', 'quiz', 'bond', 'settings'];
const SHELL_ICONS = [...PRIMARY_NAV, 'stories', 'calendar', 'profile', 'add', 'think'];

test('M6A usa il wordmark premium e coppie SVG OFF/ON reali senza tint o mask', () => {
  const html = read('index.html');
  const css = read('identity.css');

  assert.equal((html.match(/assets\/brand\/us-wordmark-premium\.svg/g) || []).length, 3);
  PRIMARY_NAV.forEach((name) => {
    assert.match(html, new RegExp(`data-page="${name}"[\\s\\S]{0,420}us-nav-icon--${name}`));
    assert.match(html, new RegExp(`us-nav-icon--${name}[\\s\\S]{0,260}us-nav-icon-off[\\s\\S]{0,260}us-nav-icon-on`));
  });
  assert.match(css, /\.us-nav-icon-off\{[\s\S]*display:block/);
  assert.match(css, /\.us-nav-premium button\.active \.us-nav-icon-off\{[\s\S]*display:none/);
  assert.match(css, /\.us-nav-premium button\.active \.us-nav-icon-on\{[\s\S]*display:block/);
  assert.doesNotMatch(css, /(?:-webkit-)?mask:/, 'le icone premium non possono essere ridotte a una CSS mask');
  assert.doesNotMatch(css, /filter:\s*(?:saturate|brightness)/, 'gli SVG ON/OFF devono conservare il proprio colore');
});

test('M6A precarica tutti gli asset shell premium e mantiene il contratto PWA', () => {
  const worker = read('service-worker.js');
  const html = read('index.html');
  const version = JSON.parse(read('version.json')).version;
  const build = html.match(/meta name="us-build" content="([^"]+)"/)?.[1];

  assert.match(worker, /const MEDIA_CACHE_NAME = "us-private-media-v1"/);
  assert.match(worker, /const CACHE_NAME = "us-shell-static-runtime-13"/);
  assert.equal(build, version);
  assert.match(worker, /"\/assets\/brand\/us-wordmark-premium\.svg"/);
  SHELL_ICONS.forEach((name) => {
    ['off', 'on'].forEach((state) => {
      const file = `assets/icons/${name}-${state}.svg`;
      assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} deve essere disponibile al runtime`);
      assert.match(worker, new RegExp(`"/${file.replace('.', '\\.') }"`));
    });
  });
});
