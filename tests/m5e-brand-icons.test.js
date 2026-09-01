const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const BRAND = 'assets/brand';
const NAV_ICONS = ['home', 'moments', 'quiz', 'bond', 'settings', 'stories'];

test('M5E conserva una famiglia SVG vettoriale coerente per il brand precedente', () => {
  const wordmark = read(`${BRAND}/us-wordmark.svg`);
  assert.match(wordmark, /viewBox="0 0 112 32"/);
  assert.match(wordmark, /<path\b/);
  assert.match(wordmark, /linearGradient\b/);
  assert.doesNotMatch(wordmark, /<text\b/i, 'il wordmark deve restare un vero asset grafico, non testo font-dependent');

  NAV_ICONS.forEach((name) => {
    const icon = read(`${BRAND}/us-icon-${name}.svg`);
    assert.match(icon, /viewBox="0 0 24 24"/);
    assert.match(icon, /stroke-width="1\.75"/);
    assert.match(icon, /linearGradient\b/);
    assert.match(icon, /#FF86C8/i);
    assert.match(icon, /#B16DFF/i);
    assert.doesNotMatch(icon, /<image\b|\.png|\.jpg/i, `${name} deve restare vettoriale`);
  });
});

test('Foundation 01 conserva quattro tab primarie e Stories fuori dalla bottom navigation', () => {
  const html = read('index.html');
  const stories = read('stories.js');

  ['home', 'bond', 'moments', 'quiz'].forEach((name) => {
    assert.match(html, new RegExp(`data-page="${name}"[\\s\\S]{0,420}us-nav-icon--${name}`));
  });
  assert.match(stories, /us-brand-icon--stories/);
  assert.doesNotMatch(html, /data-page="settings"/, 'Settings resta fuori dalla bottom navigation');
  assert.doesNotMatch(html, /data-page="stories"/, 'Stories resta fuori dalla bottom navigation');
});

test('M5E mantiene gli SVG come asset diretti e il build marker allineato', () => {
  const css = read('identity.css');
  const html = read('index.html');
  const version = JSON.parse(read('version.json')).version;
  const build = html.match(/meta name="us-build" content="([^"]+)"/)?.[1];

  assert.doesNotMatch(css, /(?:-webkit-)?mask:/);
  assert.equal(build, version, 'build marker e versione devono restare allineati');
});
