const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const loadGate = () => import(path.join(ROOT, 'scripts/validate-android-bundle.mjs'));

// Shape of `bundletool dump manifest` for a US release bundle built from the
// PR #187 manifest (guarded FCM service, Capacitor + Firebase handlers removed).
function manifestXml({
  versionCode = '1791739949',
  versionName = '1.0.0',
  targetSdk = '36',
  extraPermissions = [],
  applicationAttrs = 'android:allowBackup="false"',
  fcmServices = ['com.usapp.us.UsGuardedMessagingService'],
  extraComponents = ''
} = {}) {
  const permissions = [
    'android.permission.CAMERA',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.INTERNET',
    'android.permission.VIBRATE',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.WAKE_LOCK',
    ...extraPermissions
  ].map((p) => `  <uses-permission android:name="${p}"/>`).join('\n');
  const services = fcmServices.map((name) => `    <service android:name="${name}" android:exported="false">
      <intent-filter android:priority="-500">
        <action android:name="com.google.firebase.MESSAGING_EVENT"/>
      </intent-filter>
    </service>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" android:versionCode="${versionCode}" android:versionName="${versionName}" android:compileSdkVersion="36" package="com.usapp.us">
  <uses-sdk android:minSdkVersion="26" android:targetSdkVersion="${targetSdk}"/>
${permissions}
  <application ${applicationAttrs} android:label="@string/app_name">
    <!-- launcher -->
    <activity android:name="com.usapp.us.MainActivity" android:exported="true" android:launchMode="singleTask">
      <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.LAUNCHER"/>
      </intent-filter>
    </activity>
    <provider android:name="androidx.core.content.FileProvider" android:authorities="com.usapp.us.fileprovider" android:exported="false"/>
    <receiver android:name="com.google.firebase.iid.FirebaseInstanceIdReceiver" android:exported="true" android:permission="com.google.android.c2dm.permission.SEND">
      <intent-filter><action android:name="com.google.android.c2dm.intent.RECEIVE"/></intent-filter>
    </receiver>
${services}
${extraComponents}
  </application>
</manifest>
`;
}

const GOOD_ENTRIES = [
  'BundleConfig.pb',
  'base/manifest/AndroidManifest.xml',
  'base/dex/classes.dex',
  'base/dex/classes2.dex',
  'base/assets/public/index.html',
  'base/assets/capacitor.config.json',
  'base/res/drawable/us_adaptive_foreground_v1.xml',
  'base/resources.pb',
  'META-INF/MANIFEST.MF',
  'META-INF/US-CI-TH.RSA'
];

async function check(xmlOptions, mode = 'upload') {
  const gate = await loadGate();
  const summary = gate.summarizeManifest(gate.parseManifestXml(manifestXml(xmlOptions)));
  return { summary, results: gate.checkManifest(summary, { expectVersionCode: xmlOptions?.versionCode ?? '1791739949', expectVersionName: '1.0.0', mode }) };
}
const levelOf = (results, id) => results.find((r) => r.id === id)?.level;

test('a release bundle built from the guarded FCM manifest passes every manifest check', async () => {
  const { summary, results } = await check({});
  assert.equal(summary.package, 'com.usapp.us');
  assert.equal(summary.targetSdk, '36');
  assert.deepEqual(results.filter((r) => r.level === 'fail'), []);
  assert.equal(levelOf(results, 'fcm-guarded-receiver'), 'pass');
  assert.equal(levelOf(results, 'exported-components'), 'pass');
});

test('main without PR #187 (two stock FCM receivers) can never pass the upload gate', async () => {
  const stock = ['com.capacitorjs.plugins.pushnotifications.MessagingService', 'com.google.firebase.messaging.FirebaseMessagingService'];
  const upload = await check({ fcmServices: stock }, 'upload');
  assert.equal(levelOf(upload.results, 'fcm-guarded-receiver'), 'fail');
  const testBuild = await check({ fcmServices: stock }, 'test');
  assert.equal(levelOf(testBuild.results, 'fcm-guarded-receiver'), 'warn');
  const extra = await check({ fcmServices: ['com.usapp.us.UsGuardedMessagingService', stock[0]] }, 'upload');
  assert.equal(levelOf(extra.results, 'fcm-guarded-receiver'), 'fail');
});

test('Play-blocking manifest regressions fail the gate', async () => {
  assert.equal(levelOf((await check({ targetSdk: '35' })).results, 'target-sdk'), 'fail');
  assert.equal(levelOf((await check({ applicationAttrs: 'android:allowBackup="false" android:debuggable="true"' })).results, 'not-debuggable'), 'fail');
  assert.equal(levelOf((await check({ applicationAttrs: 'android:allowBackup="true"' })).results, 'backup-disabled'), 'fail');
  assert.equal(levelOf((await check({ applicationAttrs: 'android:allowBackup="false" android:usesCleartextTraffic="true"' })).results, 'no-cleartext'), 'fail');
  assert.equal(levelOf((await check({ extraPermissions: ['android.permission.ACCESS_BACKGROUND_LOCATION'] })).results, 'forbidden-permissions'), 'fail');
  assert.equal(levelOf((await check({ extraPermissions: ['android.permission.READ_MEDIA_IMAGES'] })).results, 'forbidden-permissions'), 'fail');
  const exported = await check({ extraComponents: '<receiver android:name="com.example.Leaky" android:exported="true"/>' });
  assert.equal(levelOf(exported.results, 'exported-components'), 'fail');
});

test('versionCode and versionName follow the Play scheme', async () => {
  assert.equal(levelOf((await check({ versionCode: '2100000001' })).results, 'version-code-range'), 'fail');
  assert.equal(levelOf((await check({ versionCode: '0' })).results, 'version-code-range'), 'fail');
  const gate = await loadGate();
  const summary = gate.summarizeManifest(gate.parseManifestXml(manifestXml({ versionName: '1.0-internal.1791739949' })));
  const results = gate.checkManifest(summary, { expectVersionCode: '1791739949', expectVersionName: '1.0.0', mode: 'upload' });
  assert.equal(levelOf(results, 'version-name-format'), 'fail');
  const mismatch = gate.checkManifest(gate.summarizeManifest(gate.parseManifestXml(manifestXml())), { expectVersionCode: '42', expectVersionName: '1.0.0', mode: 'upload' });
  assert.equal(levelOf(mismatch, 'version-code-match'), 'fail');
});

test('missing RECORD_AUDIO and Data safety permissions are surfaced as warnings, not hidden', async () => {
  const { results } = await check({});
  assert.equal(levelOf(results, 'record-audio-missing'), 'warn');
  const dataSafety = results.find((r) => r.id === 'data-safety-permissions');
  assert.match(dataSafety.detail, /ACCESS_FINE_LOCATION -> Posizione precisa/);
  assert.match(dataSafety.detail, /CAMERA/);
  const withAudio = await check({ extraPermissions: ['android.permission.RECORD_AUDIO'] });
  assert.equal(levelOf(withAudio.results, 'record-audio-missing'), undefined);
});

test('bundle structure, native libraries, signing leftovers and Firebase are checked', async () => {
  const gate = await loadGate();
  const ok = gate.checkEntries(GOOD_ENTRIES, { mode: 'upload', firebaseConfigured: true });
  assert.deepEqual(ok.filter((r) => r.level !== 'pass'), []);
  assert.equal(levelOf(ok, 'page-size-16kb'), 'pass');

  const noWeb = gate.checkEntries(GOOD_ENTRIES.filter((e) => !e.includes('public/index.html')), { mode: 'test', firebaseConfigured: false });
  assert.equal(levelOf(noWeb, 'web-bundle-present'), 'fail');
  assert.equal(levelOf(noWeb, 'firebase-config'), 'warn');

  assert.equal(levelOf(gate.checkEntries(GOOD_ENTRIES, { mode: 'upload', firebaseConfigured: false }), 'firebase-config'), 'fail');
  assert.equal(levelOf(gate.checkEntries([...GOOD_ENTRIES, 'base/lib/arm64-v8a/libfoo.so'], { mode: 'test' }), 'page-size-16kb'), 'warn');
  assert.equal(levelOf(gate.checkEntries([...GOOD_ENTRIES, 'base/assets/public/google-services.json'], { mode: 'test' }), 'no-signing-material'), 'fail');
  assert.equal(levelOf(gate.checkEntries([...GOOD_ENTRIES, 'base/root/upload.jks'], { mode: 'test' }), 'no-signing-material'), 'fail');
});

test('embedded server secrets fail the gate while the public anon config passes', async () => {
  const gate = await loadGate();
  const clean = gate.scanForSecrets([{ name: 'public/app.js', text: 'const SUPABASE_ANON_KEY = "eyJhbGciOi.anon";' }]);
  assert.equal(clean[0].level, 'pass');
  for (const text of [
    '-----BEGIN PRIVATE KEY-----\nabc',
    '{"type": "service_account", "project_id": "x"}',
    'payload {"role":"service_role"}',
    'const k = "sb_secret_abcdefghijklmnop";'
  ]) {
    assert.equal(gate.scanForSecrets([{ name: 'public/x.js', text }])[0].level, 'fail', text);
  }
});

test('the CLI writes JSON, Markdown and permission reports and fails on errors', async () => {
  const gate = await loadGate();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'us-aab-gate-'));
  const extracted = path.join(dir, 'extracted', 'base', 'assets', 'public');
  fs.mkdirSync(extracted, { recursive: true });
  fs.writeFileSync(path.join(extracted, 'index.html'), '<!doctype html><title>US</title>');
  fs.writeFileSync(path.join(dir, 'manifest.xml'), manifestXml());
  fs.writeFileSync(path.join(dir, 'entries.txt'), GOOD_ENTRIES.join('\n'));
  fs.writeFileSync(path.join(dir, 'app.aab'), 'not really a bundle');
  const args = ['--mode', 'upload', '--manifest', path.join(dir, 'manifest.xml'), '--entries', path.join(dir, 'entries.txt'),
    '--extracted', path.join(dir, 'extracted'), '--aab', path.join(dir, 'app.aab'), '--expect-version-code', '1791739949',
    '--expect-version-name', '1.0.0', '--firebase-configured', 'true', '--out', path.join(dir, 'out')];
  const report = gate.main(args);
  assert.equal(report.ok, true);
  assert.match(report.aab.sha256, /^[0-9a-f]{64}$/);
  for (const file of ['aab-validation.json', 'aab-validation.md', 'permissions.txt']) {
    assert.ok(fs.existsSync(path.join(dir, 'out', file)), file);
  }
  fs.writeFileSync(path.join(dir, 'manifest.xml'), manifestXml({ targetSdk: '34' }));
  assert.equal(gate.main(args).ok, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Gradle signs Play builds only with the dedicated upload key and guards versioning', () => {
  const gradle = read('android/app/build.gradle');
  for (const name of ['US_ANDROID_UPLOAD_KEYSTORE_PATH', 'US_ANDROID_UPLOAD_KEYSTORE_PASSWORD', 'US_ANDROID_UPLOAD_KEY_ALIAS', 'US_ANDROID_UPLOAD_KEY_PASSWORD']) {
    assert.match(gradle, new RegExp(name));
  }
  assert.match(gradle, /US_ANDROID_PLAY_UPLOAD/);
  assert.match(gradle, /if \(playUploadRequested && !uploadSigningReady\)\s*\{\s*throw new GradleException/);
  assert.match(gradle, /if \(playUploadRequested\) \{\s*signingConfig signingConfigs\.playUpload\s*\} else if \(internalSigningReady\)/);
  assert.match(gradle, /2100000000L/);
  assert.doesNotMatch(gradle, /storePassword\s+['"][^'"]+['"]/);
  assert.doesNotMatch(gradle, /keyPassword\s+['"][^'"]+['"]/);
  assert.match(read('android/variables.gradle'), /targetSdkVersion = 36/);
});

test('the AAB workflow never publishes a downloadable bundle from a public repository', () => {
  const workflow = read('.github/workflows/android-play-bundle.yml');
  assert.match(workflow, /bundleRelease/);
  assert.match(workflow, /bundletool/);
  assert.match(workflow, /validate --bundle/);
  assert.match(workflow, /scripts\/validate-android-bundle\.mjs/);
  assert.match(workflow, /refs\/heads\/main/);
  // Test builds upload reports only; the real bundle only inside an encrypted archive.
  const uploads = workflow.split('actions/upload-artifact').slice(1);
  assert.equal(uploads.length, 2);
  assert.doesNotMatch(uploads[0], /\.aab/);
  assert.match(uploads[1], /if: env\.US_BUILD_MODE == 'upload'/);
  assert.match(uploads[1], /US-Play-candidate\.7z/);
  assert.match(workflow, /7z a -t7z -mhe=on/);
  // No Play publishing, no secret echo.
  assert.doesNotMatch(workflow, /androidpublisher|r0adkll\/upload-google-play|fastlane supply/i);
  assert.doesNotMatch(workflow, /echo\s+"?\$\{\{\s*secrets\./);
  assert.match(workflow, /::add-mask::/);
  // The upload key must differ from the permanent internal key.
  assert.match(workflow, /La chiave di upload coincide con la chiave interna permanente/);
});
