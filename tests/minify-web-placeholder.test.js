// The us-staging-s31 Pages project builds every branch; branches other than
// staging get only a placeholder page (build-s31-staging-preview.mjs). The
// minify step after it (05/11/2026) must let that placeholder through, or every
// PR into staging fails its Cloudflare check.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PREVIEW = path.join(ROOT, 'dist', 's31-staging-preview');

test('minify-web leaves the staging placeholder page alone', async () => {
  const { minifyWebBundle } = await import('../scripts/minify-web.mjs');
  const { PLACEHOLDER_HTML } = await import('../scripts/build-s31-staging-preview.mjs');
  const backup = `${PREVIEW}.minify-test-backup`;
  fs.rmSync(backup, { recursive: true, force: true });
  fs.renameSync(PREVIEW, backup);
  try {
    fs.mkdirSync(PREVIEW, { recursive: true });
    fs.writeFileSync(path.join(PREVIEW, 'index.html'), PLACEHOLDER_HTML);
    const result = await minifyWebBundle(PREVIEW);
    assert.equal(result.placeholder, true);
    assert.equal(fs.readFileSync(path.join(PREVIEW, 'index.html'), 'utf8'), PLACEHOLDER_HTML);
  } finally {
    fs.rmSync(PREVIEW, { recursive: true, force: true });
    fs.renameSync(backup, PREVIEW);
  }
});

test('minify-web still refuses a folder that is neither a bundle nor the placeholder', async () => {
  const { minifyWebBundle } = await import('../scripts/minify-web.mjs');
  const backup = `${PREVIEW}.minify-test-backup`;
  fs.rmSync(backup, { recursive: true, force: true });
  fs.renameSync(PREVIEW, backup);
  try {
    fs.mkdirSync(PREVIEW, { recursive: true });
    fs.writeFileSync(path.join(PREVIEW, 'index.html'), '<!doctype html><p>altro</p>');
    await assert.rejects(minifyWebBundle(PREVIEW), /does not look like a US web bundle/);
  } finally {
    fs.rmSync(PREVIEW, { recursive: true, force: true });
    fs.renameSync(backup, PREVIEW);
  }
});
