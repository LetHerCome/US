// Staging BUILD_ID (founder, 21/11/2026): the service worker keeps the shell
// by BUILD_ID and the source keeps the one of the last production release, so
// after every merge a phone that had opened staging kept the old code. Each
// staging deploy now stamps <release>-s<commit> in the four places.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('staging BUILD_ID: release plus commit, stamped in index, worker, manifest and version.json', async () => {
  const { stagingBuildId, stampStagingBuild } = await import('../scripts/build-s31-staging-preview.mjs');
  const worker = read('service-worker.js');
  const base = /const BUILD_ID = "([^"]+)";/.exec(worker)[1];
  const id = stagingBuildId(worker, 'A4CDC676abcdef');
  assert.equal(id, `${base}-sa4cdc676`);
  assert.notEqual(stagingBuildId(worker, 'b1b2b3b4ffff'), id, 'a new commit, a new id');
  assert.match(stagingBuildId(worker, '', 1763700000000), new RegExp(`^${base}-s[a-z0-9]+$`), 'no commit: the time');

  const out = stampStagingBuild({ index: read('index.html'), worker, manifest: read('manifest.webmanifest') }, id);
  assert.match(out.index, new RegExp(`<meta name="us-build" content="${id}"/>`));
  assert.doesNotMatch(out.index, new RegExp(`\\?v=${base}(?!-s)`), 'no asset keeps the release id');
  assert.match(out.index, new RegExp(`/diario\\.js\\?v=${id}"`));
  assert.match(out.worker, new RegExp(`const BUILD_ID = "${id}";`));
  assert.doesNotMatch(out.manifest, new RegExp(`\\?v=${base}(?!-s)`));
  assert.deepEqual(JSON.parse(out.version), { version: id });
  assert.throws(() => stampStagingBuild({ index: '<p>', worker, manifest: '' }, id), /us-build meta/);
});

test('staging BUILD_ID: the preview build stamps it before minify, the source stays on the release id', () => {
  const src = read('scripts/build-s31-staging-preview.mjs');
  assert.match(src, /stagingBuildId\(stWorker, process\.env\.CF_PAGES_COMMIT_SHA \|\| process\.env\.GITHUB_SHA\)/);
  assert.ok(src.indexOf('stampStagingBuild({ index: stIndex') < src.indexOf("const output=await readdir(OUT);"));
  assert.match(read('package.json'), /"build:us-staging-pages": "node scripts\/build-cloudflare-pages\.mjs && US_S31_STAGING_PREVIEW=true node scripts\/build-s31-staging-preview\.mjs && node scripts\/minify-web\.mjs dist\/s31/);
});
