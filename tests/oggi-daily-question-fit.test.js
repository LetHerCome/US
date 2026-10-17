// Oggi (16/10): a long "Domanda di oggi" steps down in size and takes more
// lines instead of leaving the card; and the Oggi photo fills the screen
// again (the "whole on a blurred copy" of #207 was reverted by the founder).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('daily question: the length decides the size class', () => {
  const app = read('app.js');
  const fn = app.slice(app.indexOf('function dailyQuestionLengthAttr('), app.indexOf('\n}\n', app.indexOf('function dailyQuestionLengthAttr(')) + 2);
  const context = vm.createContext({});
  vm.runInContext(`${fn};globalThis.size=dailyQuestionLengthAttr;`, context);
  assert.equal(context.size('Qual è il tuo ricordo preferito di noi?'), '');
  assert.equal(context.size('x'.repeat(61)), ' data-length="long"');
  assert.equal(context.size('x'.repeat(101)), ' data-length="xlong"');
  assert.equal(context.size(null), '');
  assert.match(app, /<span class="dq-q us-daily-ritual-question"\$\{dailyQuestionLengthAttr\(model\.question\)\}>/);
});

test('daily question: long and very long questions get smaller type and more lines, never wider than the card', () => {
  const css = read('dc-oggi.css');
  assert.match(css, /#home #usDailyRitual \.us-daily-ritual-question\{overflow-wrap:anywhere\}/);
  assert.match(css, /\[data-length="long"\]\{font-size:18px;line-height:1\.22;-webkit-line-clamp:3\}/);
  assert.match(css, /\[data-length="xlong"\]\{font-size:16px;line-height:1\.25;-webkit-line-clamp:4\}/);
  assert.match(css, /@media\(max-height:700px\)\{[\s\S]*?:is\(\[data-length="long"\],\[data-length="xlong"\]\)\{font-size:15px;line-height:1\.25;-webkit-line-clamp:2\}/);
});

test('Oggi photo: it fills the screen again, no whole-photo backdrop', () => {
  assert.doesNotMatch(read('index.html'), /homePhotoBackdrop/);
  assert.doesNotMatch(read('fastboot2.js'), /UsHomePhotoFit|HOME_PHOTO_CROP_LIMIT/);
  assert.doesNotMatch(read('dc-oggi.css'), /data-us-photo-whole|home-photo-backdrop/);
  assert.match(read('styles.css'), /\.home-photo-layer\{[^}]*background-size:cover/);
  // The widget photo keeps reusing the HTTP cache (egress), kept from #207.
  const widgets = read('widgets.js');
  assert.doesNotMatch(widgets.slice(widgets.indexOf('async function encodePhoto')), /cache: 'no-store'/);
});
