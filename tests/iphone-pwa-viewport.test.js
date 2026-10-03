const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'fix4.css'), 'utf8');

test('iPhone PWA: standalone viewport is pinned to device width and scale 1', () => {
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"\/>/);
});

test('iPhone PWA: app shell cannot exceed the visible viewport width', () => {
  assert.match(css, /html\{width:100%;max-width:100%/);
  assert.match(css, /body\{width:100%;max-width:100%/);
  assert.match(css, /\.app\{position:relative;width:100%;max-width:480px;overflow-x:clip/);
});

// QA trigger: isolated branch run.
