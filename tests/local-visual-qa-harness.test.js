const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const harness = read('qa/local-visual-harness.js');
const index = read('index.html');
const app = read('app.js');
const staging = read('scripts/build-capacitor-web.mjs');

test('local QA harness requires an explicit flag and exact local hostname', () => {
  assert.match(harness, /hostname === 'localhost'/);
  assert.match(harness, /hostname === '127\.0\.0\.1'/);
  assert.match(harness, /get\('us-qa'\) === 'gate1'/);
  assert.match(harness, /window\.__US_LOCAL_QA__/);
  assert.doesNotMatch(harness, /hostname === '0\.0\.0\.0'/);
  assert.doesNotMatch(harness, /hostname === '::1'/);
});

test('native runtime plus QA flag cannot activate the local fixture', () => {
  assert.match(harness, /nativeRuntime = Boolean\(window\.UsPlatform\?\.isNative\)/);
  assert.match(harness, /localOrigin && requested && !nativeRuntime/);
});

test('QA harness is loaded before production auth/app and production auth remains present', () => {
  const harnessIndex = index.indexOf("['/qa/', 'local-visual-harness.js']");
  const authIndex = index.indexOf('/auth-storage.js');
  const appIndex = index.indexOf('<script defer src="/app.js"');
  assert.ok(harnessIndex >= 0 && harnessIndex < authIndex && harnessIndex < appIndex);
  assert.match(index, /id="authOverlay"/);
  assert.match(app, /window\.__US_LOCAL_QA__\?\.active/);
  assert.match(app, /return window\.__US_LOCAL_QA__\.boot\(\)/);
  assert.match(app, /sb\.auth\.onAuthStateChange/);
});

test('QA fixture blocks remote mutations and exposes deterministic shell state', () => {
  assert.match(harness, /fetch\s*=|window\.fetch\s*=|QA_REMOTE_BLOCKED/);
  assert.match(harness, /toUpperCase\(\)/);
  assert.match(harness, /POST|PUT|PATCH|DELETE/);
  assert.match(harness, /fixtureProfile\('francesco'/);
  assert.match(harness, /fixtureProfile\('beatrice'/);
  assert.match(harness, /couple_id: 'local-qa-couple'/);
  assert.match(harness, /homePhotoLayerA/);
  assert.match(harness, /usHeroOverlayLayer/);
  assert.match(harness, /go\('settings'/);
});

test('QA fixture does not replace pairing or create a production session', () => {
  assert.match(harness, /signInAnonymously|claim_us_role/);
  assert.match(harness, /QA mode never calls pairing/i);
  assert.match(harness, /window\.usProfile/);
});

test('Capacitor release staging excludes the development-only QA asset', () => {
  assert.doesNotMatch(staging, /'qa\/local-visual-harness\.js'/);
  assert.match(index, /\['\/qa\/', 'local-visual-harness\.js'\]\.join\(''\)/);
});
