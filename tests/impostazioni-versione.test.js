// Revisione di staging (founder, 03/11/2026): «US 1.0» at the end of Settings
// did not tell which build was installed. The build now shows under it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

// Il diario, ma pulito (15/11/2026): the footer is «US 1.5.1 · fatto in due»
// (the hand font); the build stays visible on a small line under it.
test('Settings shows the build under «US 1.0»', () => {
  const line = read('index.html').split('\n').find((l) => l.includes('class="dy-set-foot"')) || '';
  assert.match(line, /<span id="usSettingsVersion">US<\/span> · <span class="dy-set-hand">fatto in due<\/span><small id="usSettingsBuild">/, 'the build is not hidden');
  assert.match(read('settings.js'), /\$\('usSettingsBuild'\)\.textContent=currentBuild\(\);/);
  assert.match(read('diario.css'), /\.dy-set-foot small\{display:block/);
  assert.match(read('diario.css'), /\.dy-set-hand\{font:15px\/1 var\(--us-font-hand\)\}/);
});
