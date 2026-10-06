const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const PRIMARY_NAV = ['home', 'bond', 'moments', 'quiz'];

test('M6A conserva coppie SVG OFF/ON reali senza tint o mask', () => {
  const html = read('index.html');
  const css = read('identity.css');

  PRIMARY_NAV.forEach((name) => {
    assert.match(html, new RegExp(`data-page="${name}"[\\s\\S]{0,420}us-nav-icon--${name}`));
    assert.match(html, new RegExp(`us-nav-icon--${name}[\\s\\S]{0,260}us-nav-icon-off[\\s\\S]{0,260}us-nav-icon-on`));
  });
  assert.match(css, /\.us-nav-icon-off\{[\s\S]*display:block/);
  assert.match(css, /\.us-nav-premium button\.active \.us-nav-icon-off\{[\s\S]*display:none/);
  assert.match(css, /\.us-nav-premium button\.active \.us-nav-icon-on\{[\s\S]*display:block/);
  assert.ok(css.includes('.us-nav-icon [data-icon]') && css.includes('-webkit-mask-image:url("/assets/icons/phosphor/'), 'la nav M1 usa gli asset Phosphor locali come mask colorabile');
  assert.doesNotMatch(css, /filter:\s*(?:saturate|brightness)/, 'gli SVG ON/OFF devono conservare il proprio colore');
});

test('M6A precarica tutti gli asset shell premium e mantiene il contratto PWA', () => {
  const worker = read('service-worker.js');
  const html = read('index.html');
  const version = JSON.parse(read('version.json')).version;
  const build = html.match(/meta name="us-build" content="([^"]+)"/)?.[1];

  assert.match(worker, /const MEDIA_CACHE_NAME = "us-private-media-v1"/);
  assert.ok(build);
  assert.equal(build, version);
  assert.ok(worker.includes(`const BUILD_ID = "${build}";`));
  assert.ok(worker.includes('const CACHE_NAME = `${SHELL_CACHE_PREFIX}${BUILD_ID}`;'));
  assert.match(worker, /"\/assets\/derived\/runtime\/us-symbol-256-v1\.png"/);
  const referencedPhosphor = [...new Set([...html.matchAll(/data-icon="(\/assets\/icons\/phosphor\/[^"]+\.svg)"/g)].map((m) => m[1]))];
  assert.ok(referencedPhosphor.length >= 8);
  for (const file of referencedPhosphor) {
    assert.ok(fs.existsSync(path.join(ROOT, file.slice(1))), `${file} deve essere disponibile al runtime`);
    assert.ok(worker.includes(`"${file}"`), `${file} deve essere precachato`);
  }
  ['Inter-Variable.woff2', 'Newsreader-Variable.woff2',
    'house-regular.svg', 'house-fill.svg',
    'heart-straight-regular.svg', 'heart-straight-fill.svg',
    'images-regular.svg', 'images-fill.svg',
    'cards-three-regular.svg', 'game-controller-regular.svg', 'game-controller-fill.svg', 'calendar-dots-regular.svg'].forEach((name) => {
    const file = name.endsWith('.woff2') ? `assets/fonts/${name}` : `assets/icons/phosphor/${name}`;
    assert.match(worker, new RegExp(`"/${file.replaceAll('.', '\\.') }"`));
  });
});
