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

  // Il diario, ma pulito (15/11/2026): no OFF/ON pair any more. Each tab has one
  // inline stroke icon and the red scribble; the current tab is ink, bold, and
  // shows the scribble.
  const diario = read('diario.css');
  PRIMARY_NAV.forEach((name) => {
    assert.match(html, new RegExp(`data-page="${name}"[^>]*><svg class="dy-nav-icon"[\\s\\S]{0,420}<svg class="dy-nav-scrib"`));
  });
  assert.match(diario, /\.dy-nav \.dy-nav-scrib\{[^}]*opacity:0;/);
  assert.match(diario, /\.dy-nav button\.active\{color:var\(--us-ink-100\);font-weight:800\}/);
  // La barra a pillola (21/11/2026): a soft pill marks the page, its icon a little bolder; the scribble rests.
  assert.match(diario, /\.dy-nav button\[data-page\]\.active\{background:var\(--us-ink-08\)\}/);
  assert.match(diario, /\.dy-nav button\.active \.dy-nav-icon\{stroke-width:2\.2\}/);
  assert.doesNotMatch(css + diario, /filter:\s*(?:saturate|brightness)/, 'no tint filters on the icons');
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
  // Il diario, ma pulito (15/11/2026): the nav and the envelope draw inline
  // SVGs; the Phosphor icons still named by index.html must be precached.
  assert.ok(referencedPhosphor.length >= 1);
  for (const file of referencedPhosphor) {
    assert.ok(fs.existsSync(path.join(ROOT, file.slice(1))), `${file} deve essere disponibile al runtime`);
    assert.ok(worker.includes(`"${file}"`), `${file} deve essere precachato`);
  }
  // Il diario, ma pulito (15/11/2026): the two new fonts join the shell; the
  // nav-only Phosphor pairs (house, images fill, game controller) left the nav.
  ['Fraunces-Soft-Roman.woff2', 'Fraunces-Soft-Italic.woff2', 'Figtree-Latin.woff2', 'Figtree-LatinExt.woff2',
    'GochiHand-Latin.woff2', 'PermanentMarker-Latin.woff2',
    'heart-straight-regular.svg', 'heart-straight-fill.svg',
    'images-regular.svg',
    'cards-three-regular.svg', 'calendar-dots-regular.svg'].forEach((name) => {
    const file = name.endsWith('.woff2') ? `assets/fonts/${name}` : `assets/icons/phosphor/${name}`;
    assert.match(worker, new RegExp(`"/${file.replaceAll('.', '\\.') }"`));
  });
});
