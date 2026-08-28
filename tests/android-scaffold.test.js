const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('lo scaffold Android mantiene identità US e MainActivity priva di feature logic', () => {
  const appGradle = read('android/app/build.gradle');
  const strings = read('android/app/src/main/res/values/strings.xml');
  const activity = read('android/app/src/main/java/com/usapp/us/MainActivity.java');
  const config = JSON.parse(read('capacitor.config.json'));

  assert.match(appGradle, /namespace\s*=\s*["']com\.usapp\.us["']/);
  assert.match(appGradle, /applicationId\s+["']com\.usapp\.us["']/);
  assert.match(strings, /<string name="app_name">US<\/string>/);
  assert.match(activity, /public class MainActivity extends BridgeActivity \{\}/);
  assert.doesNotMatch(activity, /registerPlugin|onCreate|WebView|Supabase|Push|Widget/);
  assert.equal(config.server, undefined);
  assert.equal(fs.existsSync(path.join(ROOT, 'ios')), false);
});

test('il manifest dichiara soltanto i permessi necessari alle capability web esistenti', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  const permissions = [...manifest.matchAll(/<uses-permission\s+android:name="([^"]+)"\s*\/>/g)]
    .map((match) => match[1])
    .sort();

  assert.deepEqual(permissions, [
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.CAMERA',
    'android.permission.INTERNET'
  ]);
});
