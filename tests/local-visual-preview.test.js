const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const index = read('index.html');
const app = read('app.js');
const staging = read('scripts/build-capacitor-web.mjs');
const harnessPath = path.join(ROOT, 'qa', 'remote-visual-preview.js');

function harness() {
  assert.ok(fs.existsSync(harnessPath), 'remote preview harness must exist');
  return fs.readFileSync(harnessPath, 'utf8');
}

test('preview activation requires exact preview hostname and explicit flag', () => {
  const source = harness();
  assert.match(source, /hostname === PREVIEW_HOST/);
  assert.match(source, /new URLSearchParams\(window\.location\.search\)\.get\('us-preview'\) === 'remote'/);
  assert.match(source, /active = localOrigin && requested && !nativeRuntime/);
  assert.doesNotMatch(source, /usfinal\.vercel\.app.*active/);
});

test('production hostname is explicitly excluded', () => {
  const source = harness();
  assert.match(source, /PRODUCTION_HOST/);
  assert.match(source, /hostname !== PRODUCTION_HOST/);
  assert.match(source, /usfinal\.vercel\.app/);
});

test('Capacitor runtime is explicitly excluded', () => {
  const source = harness();
  assert.match(source, /window\.UsPlatform\?\.isNative/);
  assert.match(source, /!nativeRuntime/);
});

test('preview blocks every Supabase request and does not initialize Auth', () => {
  const source = harness();
  assert.match(source, /supabase\.co/);
  assert.match(source, /QA_REMOTE_BLOCKED/);
  assert.match(source, /MUTATING_METHODS/);
  assert.match(source, /blockedClient/);
  assert.match(source, /signInAnonymously/);
  assert.match(app, /claim_us_role/);
  assert.match(app, /if\(!window\.__US_REMOTE_PREVIEW__\?\.active\)/);
  assert.match(app, /window\.__US_REMOTE_PREVIEW__\.boot\(\)/);
});

test('fixtures contain only non-production identifiers', () => {
  const source = harness();
  assert.match(source, /preview-couple/);
  assert.match(source, /preview-francesco/);
  assert.match(source, /preview-beatrice/);
  assert.doesNotMatch(source, /e519e1fc|9f610037|c42c0170/);
});

test('preview reuses the production shell/router/navigation', () => {
  assert.match(index, /id="home"/);
  assert.match(index, /class="nav us-nav/);
  assert.match(index, /navigation\.js/);
  assert.match(index, /id="previewMarker"/);
  assert.match(app, /pages=\['home','bond','moments','quiz','settings'\]/);
});

test('preview assets are excluded from the Capacitor bundle', () => {
  assert.doesNotMatch(staging, /RUNTIME_FILES[\s\S]*remote-visual-preview\.js/);
  assert.match(staging, /replace\(\/\\s\*<script defer src=.*remote-visual-preview/);
  assert.match(index, /qa\/remote-visual-preview\.js/);
});

test('production boot remains the default when preview is inactive', () => {
  assert.match(app, /if\(window\.__US_REMOTE_PREVIEW__\?\.active\)/);
  assert.match(app, /initCloud\(\);/);
  assert.match(app, /sb\.auth\.onAuthStateChange/);
  assert.match(index, /id="authOverlay"/);
});

test('DEV PREVIEW marker is visible and fixture boot is deterministic', () => {
  const source = harness();
  assert.match(index, /id="previewMarker"/);
  assert.match(index, /DEV PREVIEW/);
  assert.match(source, /local fixtures/i);
  assert.match(source, /us-local-preview/);
  assert.match(source, /window\.usProfile/);
});
