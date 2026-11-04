// Android live (04/11/2026): the web part from this PC stays a debug,
// staging-only tool. Release, Play bundle and production are untouched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('the live app id exists only inside the staging QA branch of build.gradle', () => {
  const gradle = read('android/app/build.gradle');
  const staging = gradle.indexOf("if (System.getenv('US_STAGING_QA') == 'true') {");
  const live = gradle.indexOf("if (System.getenv('US_ANDROID_LIVE') == 'true') {");
  const liveId = gradle.indexOf('applicationId "com.usapp.us.staging.live"');
  assert.ok(staging > 0 && live > staging && liveId > live, 'live id nested in the staging block');
  assert.equal(gradle.split('com.usapp.us.staging.live').length, 2);
});

test('plain HTTP is allowed only to localhost and only in debug builds', () => {
  const main = read('android/app/src/main/AndroidManifest.xml');
  assert.doesNotMatch(main, /usesCleartextTraffic|networkSecurityConfig/);
  assert.match(read('android/app/src/debug/AndroidManifest.xml'), /@xml\/us_live_network_security/);
  const config = read('android/app/src/debug/res/xml/us_live_network_security.xml');
  const domains = [...config.matchAll(/<domain[^>]*>([^<]+)<\/domain>/g)].map((m) => m[1]);
  assert.deepEqual(domains.sort(), ['127.0.0.1', 'localhost']);
  assert.doesNotMatch(config, /<base-config[^>]*cleartextTrafficPermitted="true"/);
});

test('the live script rewrites for US-STAGING only and puts the server config back', () => {
  const script = read('scripts/android-live.mjs');
  assert.match(script, /isolateStagingBuild/);
  assert.doesNotMatch(script, /iiakdfsxpywdkxravqjh/);
  assert.match(script, /server: \{ url: `http:\/\/localhost:\$\{PORT\}`/);
  assert.match(script, /finally \{[\s\S]*restoreConfig\(\)/);
  assert.match(script, /server\.listen\(PORT, '127\.0\.0\.1'/);
  assert.match(read('.gitignore'), /^\/dist\/android-live\/$/m);
});
