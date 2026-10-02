const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Noi static liquid list keeps Bencho 44/50 rhythm without reorder', () => {
  const css = read('styles.css');
  const html = read('index.html');

  assert.match(css, /NOI STATIC LIQUID LIST V1/);
  assert.match(css, /#bond \.noi-hub-destinations\{[\s\S]*gap:6px/);
  assert.match(css, /#bond \.noi-hub-destinations \.noi-hub-card\{[\s\S]*min-height:44px/);
  assert.match(css, /border-radius:22px/);
  assert.match(css, /scaleX\(1\.018\) scaleY\(\.965\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);

  const hub = html.match(/<nav class="noi-hub" id="noiHub"[\s\S]*?<\/nav>/)?.[0] || '';
  assert.match(hub, /noi-hub-card--calendar/);
  assert.match(hub, /noi-hub-card--quest/);
  assert.match(hub, /noi-hub-card--events/);
  assert.match(hub, /noi-hub-card--resonance/);
});

test('Noi liquid list introduces no React, Framer Motion or drag authority', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies?.react, undefined);
  assert.equal(pkg.dependencies?.['react-dom'], undefined);
  assert.equal(pkg.dependencies?.['framer-motion'], undefined);
  assert.equal(pkg.dependencies?.motion, undefined);

  const app = read('app.js');
  const marker = read('styles.css').slice(read('styles.css').indexOf('NOI STATIC LIQUID LIST V1'));
  assert.doesNotMatch(app, /Reorder\.|useMotionValue|framer-motion/);
  assert.doesNotMatch(marker, /pointermove|draggable|cursor:grab|touch-action:none/);
});
