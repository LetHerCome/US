'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('widget and premium-motion features are preserved in integration', () => {
  const widget = read('widgets.js');
  const hub = read('widget-hub.js');
  const app = read('app.js');
  assert.ok(widget.includes("'noi-play': 'quiz', photo: 'home'"));
  assert.ok(widget.includes('us:home-photo-changed'));
  assert.ok(hub.includes('us-wp-noi-light'));
  assert.ok(hub.includes('La fotografia che vedi su Oggi'));
  assert.ok(app.includes('homePhotoHasPainted'));
  assert.ok(app.includes('const usEntryTimers = new WeakMap()'));
  assert.ok(!read('index.html').includes('id="usWidgetHubGuide"'));
  assert.ok(read('widget-hub.css').includes('us-wp-noi-light'));
  assert.ok(!app.includes('let swipeGesture=null;'));
  assert.ok(widget.includes('syncNoiDistance'));
  assert.ok(read('modal-center.css').includes('opacity var(--us-motion-surface)'));
  assert.ok(read('tests/widget-system.test.js').includes("['home', 'home', 'bond', 'quiz', 'home']"));
});

test('single build version across all web entry points', () => {
  const ver = 'us-ui-feedback-v2-20261009-2';
  assert.equal(JSON.parse(read('version.json')).version, ver);
  assert.ok(read('index.html').includes('content="' + ver + '"'));
  assert.ok(read('index.html').includes('/app.js?v=' + ver));
  assert.ok(read('manifest.webmanifest').includes('?v=' + ver));
  assert.ok(read('service-worker.js').includes('BUILD_ID = "' + ver + '"'));
  const html = read('index.html');
  for (const stale of ['us-ui-widgets-v2-20261009-1','us-premium-motion-v1-20261009-1','us-noi-together-widget-v1-20261009-1']) {
    assert.ok(!html.includes(stale), 'stale build token: ' + stale);
  }
});
