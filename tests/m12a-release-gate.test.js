// M12A — release gate for the candidate build.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(path.resolve(__dirname, '..'), file), 'utf8');

test('release gate: build marker, version.json and SW cache move together; private media cache is untouched', () => {
  const build = read('index.html').match(/<meta name="us-build" content="([^"]+)"/)[1];
  assert.ok(build, 'index.html carries the canonical build marker');
  assert.equal(JSON.parse(read('version.json')).version, build);
  const worker = read('service-worker.js');
  assert.ok(worker.includes(`const BUILD_ID = "${build}";`));
  assert.match(worker, /const SHELL_CACHE_PREFIX = "us-shell-"/);
  assert.ok(worker.includes('const CACHE_NAME = `${SHELL_CACHE_PREFIX}${BUILD_ID}`;'));
  assert.match(worker, /const MEDIA_CACHE_NAME = "us-private-media-v1"/);
  assert.match(worker, /"\/assets\/derived\/runtime\/us-symbol-256-v1\.png"/);
  assert.doesNotMatch(worker, /us-symbol-ui-crisp-v1/);
});
