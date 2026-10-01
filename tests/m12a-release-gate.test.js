// M12A — release gate for the candidate build.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(path.resolve(__dirname, '..'), file), 'utf8');

test('release gate: build marker, version.json and SW cache move together; private media cache is untouched', () => {
  const build = read('index.html').match(/<meta name="us-build" content="([^"]+)"/)[1];
  assert.equal(JSON.parse(read('version.json')).version, build);
  assert.equal(build, 'us-m12b5-rivivi-archive-20261001-2');
  const worker = read('service-worker.js');
  assert.match(worker, /const CACHE_NAME = "us-shell-static-runtime-47"/);
  assert.match(worker, /const MEDIA_CACHE_NAME = "us-private-media-v1"/);
  assert.match(worker, /"\/assets\/derived\/brand\/us-symbol-apk-foreground-v1\.png"/);
  assert.doesNotMatch(worker, /us-symbol-ui-crisp-v1/);
});
