const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('Android internal signing never commits the private key and reads secrets externally', () => {
  const gradle = read('android/app/build.gradle');
  const ignore = read('android/.gitignore');
  assert.match(ignore, /^\*\.jks$/m);
  assert.match(ignore, /^\*\.keystore$/m);
  assert.match(ignore, /^keystore\.properties$/m);
  assert.match(gradle, /US_ANDROID_KEYSTORE_PATH/);
  assert.match(gradle, /US_ANDROID_KEYSTORE_PASSWORD/);
  assert.match(gradle, /US_ANDROID_KEY_ALIAS/);
  assert.match(gradle, /US_ANDROID_KEY_PASSWORD/);
  assert.doesNotMatch(gradle, /storePassword\s+['"][^'"]+['"]/);
  assert.doesNotMatch(gradle, /keyPassword\s+['"][^'"]+['"]/);
});

test('Android internal builds can override versionCode and versionName for safe updates', () => {
  const gradle = read('android/app/build.gradle');
  const script = read('scripts/build-android-internal.ps1');
  assert.match(gradle, /US_ANDROID_VERSION_CODE/);
  assert.match(gradle, /US_ANDROID_VERSION_NAME/);
  assert.match(script, /ToUnixTimeSeconds/);
  assert.match(script, /assembleRelease/);
});

test('signed Android CI verifies the APK before publishing it', () => {
  const workflow = read('.github/workflows/android-internal-release.yml');
  assert.match(workflow, /ANDROID_SIGNING_BUNDLE_B64/);
  assert.match(workflow, /ConvertFrom-Json/);
  assert.match(workflow, /assembleRelease/);
  assert.match(workflow, /apksigner\.bat/);
  assert.match(workflow, /verify --verbose --print-certs/);
  assert.match(workflow, /US-Android-Internal\.apk/);
});
