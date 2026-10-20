// 20/10/2026: faster first launch and return to the app. The page on screen
// refreshes first; what is not on screen waits a moment; no double refreshes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const app = read('app.js');

test('fast start: the daily question starts with the Home photo, not after it', () => {
  const body = app.slice(app.indexOf('async function hydrateCloud'), app.indexOf('function escapeHtml'));
  assert.ok(body.indexOf('hydrateToday()') > 0);
  assert.ok(body.indexOf('hydrateToday()') < body.indexOf('await Promise.allSettled(critical)'), 'Today is scheduled before waiting for the photo');
});

test('fast start: on return, what is not on screen waits for the page on screen', () => {
  assert.match(app, /function usAfterForeground\(task,delay=1200\)\{\n  setTimeout\(\(\)=>usRunWhenIdle\(task,800\),delay\);\n\}/);
  assert.match(app, /if\(document\.getElementById\('moments'\)\?\.classList\.contains\('active'\)\)ricordiCheckNew\(\)/);
  assert.match(app, /else usAfterForeground\(\(\)=>ricordiCheckNew\(\),\d+\);/);
  const games = read('games.js');
  assert.match(games, /byId\('quiz'\)\?\.classList\.contains\('active'\)\) return;/, 'on Gioca app.js already refreshes it');
  assert.doesNotMatch(games, /visibilitychange', \(\) => \{ if \(!document\.hidden && window\.usProfile\) refresh\(\); \}\)/);
  assert.match(read('widgets.js'), /window\.usAfterForeground \|\| \(\(task\) => task\(\)\)\)\(\(\) => \{\n\s+if \(document\.hidden \|\| !ownerHash\) return;/);
  assert.match(read('fix4.js'), /\(window\.usAfterForeground \|\| \(\(task\) => task\(\)\)\)\(checkForUpdate, \d+\)/);
});

test('fast start: stories refresh once on return, not on both visibilitychange and focus', () => {
  const stories = read('stories.js');
  assert.match(stories, /if \(Date\.now\(\) - lastReturnRefresh < 2000\) return;/);
  assert.match(stories, /window\.addEventListener\('focus', refreshOnReturn\);/);
  assert.doesNotMatch(stories, /addEventListener\('focus', \(\) => refreshStories/);
});
