// CI (audit 27/11/2026): the whole npm test runs on pull requests to staging
// and main, and no workflow waits for a push to a branch that no longer exists.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, '.github', 'workflows');
const read = (name) => fs.readFileSync(path.join(DIR, name), 'utf8');
const STAGING = 'mission/us-store-s3-1-public-auth-staging-20261011';

test('full test suite: npm test with Chromium on pull requests to main and staging', () => {
  const wf = read('full-test.yml');
  assert.match(wf, /^on:\n  pull_request:\n    branches:\n      - main\n      - mission\/us-store-s3-1-public-auth-staging-20261011\n  workflow_dispatch:\n/m);
  assert.match(wf, /npm install --no-save --package-lock=false --ignore-scripts playwright@1\.62\.1/);
  assert.match(wf, /npx playwright install --with-deps chromium/);
  assert.match(wf, /run: npm test\n/);
  assert.match(wf, /fetch-depth: 0/);
  assert.doesNotMatch(wf, /secrets\./, 'no secret reaches the test job');
  assert.match(wf, /permissions:\n  contents: read/);
});

test('no workflow is triggered by a push to a retired mission branch', () => {
  const retired = ['mission/us-store-s3-2-lifecycle-design-20261012', 'mission/us-store-s3-native-push-owner-gate-20261010'];
  for (const name of fs.readdirSync(DIR).filter((file) => file.endsWith('.yml'))) {
    const code = read(name).split('\n').filter((line) => !line.trim().startsWith('#')).join('\n');
    for (const branch of retired) assert.ok(!code.includes(branch), `${name} still names ${branch}`);
  }
});

test('staging QA APK: by hand only, from staging or the two QA branches', () => {
  const wf = read('s3-staging-android-qa.yml');
  assert.match(wf, /^on:\n  workflow_dispatch:\n\n/m);
  assert.doesNotMatch(wf, /^  push:/m);
  for (const branch of [STAGING, 'claude/sintonia-premi-v2', 'claude/mappa-ricordi']) {
    assert.ok(wf.includes(`github.ref == 'refs/heads/${branch}'`), branch);
  }
});
