const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Stories usa un solo clock rAF per progresso, pause e resume', () => {
  const source = read('stories.js');
  assert.match(source, /function startStoryPlayback\(/);
  assert.match(source, /function pauseStoryPlayback\(/);
  assert.match(source, /function resumeStoryPlayback\(/);
  assert.match(source, /storyPlaybackElapsedMs/);
  assert.match(source, /document\.addEventListener\('visibilitychange'/);
});

test('la transizione Story avviene solo dopo media pronta e rispetta next previous', () => {
  const source = read('stories.js');
  assert.match(source, /showStoryAt\(index,direction=0\)/);
  assert.match(source, /applyStoryMediaEntry\(direction\)/);
  assert.match(source, /showStoryAt\(currentViewerIndex \+ 1,1\)/);
  assert.match(source, /showStoryAt\(currentViewerIndex - 1,-1\)/);
  assert.match(source, /cancelSurfaceExit\?\.\(viewer\)/);
});

test('CSS Stories mantiene fade viewer e micro shift leggibile senza profondita', () => {
  const css = read('stories.css');
  assert.match(css, /\.us-story-viewer\.open\.is-opening/);
  assert.match(css, /translateX\(12px\)/);
  assert.match(css, /translateX\(-12px\)/);
  assert.match(css, /var\(--us-motion-fast\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)[\s\S]*\.us-story-media/);
  assert.match(css, /opacity 100ms/);
});

test('reduced motion disabilita auto advance senza alterare retry o delete', () => {
  const source = read('stories.js');
  assert.match(source, /if \(isStoryReducedMotion\(\)\) return;/);
  assert.match(source, /\.eq\('author_id', profile\.id\)/);
  assert.match(source, /retryPendingStoryUpload/);
});
