const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const BRAND = 'assets/brand';
const NAV_ICONS = ['home', 'moments', 'quiz', 'bond', 'settings', 'stories'];

test('M5E fornisce una famiglia SVG vettoriale coerente per brand e icone', () => {
  const wordmark = read(`${BRAND}/us-wordmark.svg`);
  assert.match(wordmark, /viewBox="0 0 112 32"/);
  assert.match(wordmark, /<path\b/);
  assert.doesNotMatch(wordmark, /<text\b/i, 'il wordmark deve restare un vero asset grafico, non testo font-dependent');

  NAV_ICONS.forEach((name) => {
    const icon = read(`${BRAND}/us-icon-${name}.svg`);
    assert.match(icon, /viewBox="0 0 24 24"/);
    assert.match(icon, /stroke-width="1\.75"/);
    assert.match(icon, /stroke-linecap="round"/);
    assert.match(icon, /stroke-linejoin="round"/);
    assert.doesNotMatch(icon, /<image\b|\.png|\.jpg/i, `${name} deve restare vettoriale`);
  });
});

test('M5E integra il wordmark e la famiglia corretta senza cambiare le cinque tab', () => {
  const html = read('index.html');
  const stories = read('stories.js');

  assert.equal((html.match(/assets\/brand\/us-wordmark\.svg/g) || []).length, 3, 'header, auth e Settings devono condividere il wordmark SVG');
  ['home', 'moments', 'quiz', 'bond', 'settings'].forEach((name) => {
    assert.match(html, new RegExp(`data-page="${name}"[\\s\\S]{0,260}us-nav-icon--${name}`));
  });
  assert.match(stories, /us-brand-icon--stories/);
  assert.doesNotMatch(html, /data-page="stories"/, 'Stories resta fuori dalla bottom navigation');
});

test('M5E distingue default e selected con gradiente controllato e precachea gli asset', () => {
  const css = read('identity.css');
  const worker = read('service-worker.js');
  const html = read('index.html');
  const version = JSON.parse(read('version.json')).version;
  const build = html.match(/meta name="us-build" content="([^"]+)"/)?.[1];

  assert.match(css, /\.us-nav-icon,\s*\.us-brand-icon\{[\s\S]*background:#9[\w#]+/);
  assert.match(css, /\.us-nav button\.active \.us-nav-icon\{[\s\S]*linear-gradient\(135deg,#ff[\w#]+[\s\S]*#9[\w#]+/);
  assert.match(css, /drop-shadow\(0 2px 6px rgba\(190,113,255,\.28\)\)/);
  assert.match(css, /--us-brand-icon-home:url\("\/assets\/brand\/us-icon-home\.svg"\)/);
  assert.match(css, /--us-brand-icon-stories:url\("\/assets\/brand\/us-icon-stories\.svg"\)/);
  ['us-wordmark.svg', ...NAV_ICONS.map((name) => `us-icon-${name}.svg`)].forEach((file) => {
    assert.match(worker, new RegExp(`"/assets/brand/${file.replace('.', '\\.')}"`));
  });
  assert.equal(build, version, 'build marker e versione devono restare allineati');
});
