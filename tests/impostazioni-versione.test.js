// Revisione di staging (founder, 03/11/2026): «US 1.0» at the end of Settings
// did not tell which build was installed. The build now shows under it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('Settings shows the build under «US 1.0»', () => {
  const line = read('index.html').split('\n').find((l) => l.includes('class="us-settings2-version"')) || '';
  assert.match(line, /<small id="usSettingsBuild">/, 'the build is not hidden');
  assert.match(read('settings.js'), /\$\('usSettingsBuild'\)\.textContent=currentBuild\(\);/);
  assert.match(read('dc-settings.css'), /#settings \.us-settings2-page \.us-settings2-version small\{display:block/);
});
