const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

test('Swipe V1 client: Gioca exposes a dedicated sealed 8-card swipe flow', () => {
  const js = read('games.js');
  const css = read('games.css');

  assert.match(js, /const SWIPE = \{ id: 'swipe', name: 'Swipe'/);
  assert.match(js, /sb\.rpc\('start_swipe_round'/);
  assert.match(js, /data-gv2-action="swipe"/);
  assert.match(js, /Array\.from\(\{ length: total \}/);
  assert.match(js, /partnerName\(\).*non vedrà le tue scelte|non vedrà le tue scelte[\s\S]*partnerName\(\)/);
  assert.match(js, /pointerdown/);
  assert.match(js, /pointermove/);
  assert.match(js, /pointerup/);
  assert.match(js, /ArrowLeft/);
  assert.match(js, /ArrowRight/);
  assert.match(js, /data-gv2-swipe-choice="0"/);
  assert.match(js, /data-gv2-swipe-choice="1"/);
  assert.match(js, /renderSwipeWaiting/);
  assert.match(js, /renderSwipeReveal/);
  assert.match(js, /Non è un punteggio/);

  assert.match(css, /\.us-gv2-swipe-entry/);
  assert.match(css, /\.us-gv2-swipe-card/);
  assert.match(css, /touch-action:pan-y/);
  assert.match(css, /\.us-gv2-swipe-reveal-card/);
  assert.match(css, /prefers-reduced-motion/);
});

test('Swipe V1 stays outside the six weekly-question editorial families', () => {
  const js = read('games.js');
  const block = js.match(/const FAMILIES = \[([\s\S]*?)\];/)?.[1] || '';
  assert.doesNotMatch(block, /id: 'swipe'/);
  assert.match(js, /const SWIPE =/);
  assert.match(js, /FAMILIES\.map\(\(f\) =>/);
});
