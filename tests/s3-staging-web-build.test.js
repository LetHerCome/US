const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PROD = 'iiakdfsxpywdkxravqjh';
const STAGE = 'dugmhngrfkuieeletatb';
const KEY = 'sb_publishable_TESTTESTTESTTESTTESTTEST';
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('PR #187 staging web points only to US-STAGING', async () => {
  const { isolateStagingWeb } = await import('../scripts/build-s3-staging-web.mjs');
  const out = isolateStagingWeb({ app: read('app.js'), index: read('index.html'), worker: read('service-worker.js') }, KEY);
  for (const text of Object.values(out)) assert.ok(!text.includes(PROD), 'production reference survived');
  assert.ok(out.app.includes("const SB_URL = 'https://" + STAGE + ".supabase.co';"));
  assert.ok(out.app.includes("const SB_KEY = '" + KEY + "';"));
  assert.ok(out.worker.includes('"https://' + STAGE + '.supabase.co"'));
  assert.match(out.index, /<title>\[STAGING\] /);
});

test('staging web refuses anything but a publishable key', async () => {
  const { isolateStagingWeb } = await import('../scripts/build-s3-staging-web.mjs');
  const input = { app: read('app.js'), index: read('index.html'), worker: read('service-worker.js') };
  for (const key of ['', 'eyJhbGciOiJIUzI1NiJ9.service_role', 'sb_secret_TESTTESTTESTTESTTESTTEST']) {
    assert.throws(() => isolateStagingWeb(input, key));
  }
});

test('staging web build is pinned to the PR #187 QA branch', async () => {
  const { APPROVED_BRANCH } = await import('../scripts/build-s3-staging-web.mjs');
  assert.equal(APPROVED_BRANCH, 'claude/pr187-notifications-bcyiy6');
  assert.match(read('scripts/build-s3-staging-web.mjs'), /CF_PAGES_BRANCH !== APPROVED_BRANCH/);
});

test('built-in fallback is a publishable client key, never a secret', async () => {
  const { STAGING_PUBLISHABLE_KEY } = await import('../scripts/build-s3-staging-web.mjs');
  assert.match(STAGING_PUBLISHABLE_KEY, /^sb_publishable_[A-Za-z0-9_-]{20,}$/);
});
