const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const loadGate = () => import(pathToFileURL(path.join(ROOT, 'scripts/validate-android-bundle.mjs')).href);

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

// Minimal little-endian ELF64 with one PT_LOAD program header per alignment.
function elf64(alignments) {
  const phoff = 64;
  const buf = Buffer.alloc(phoff + 56 * (alignments.length + 1));
  buf.writeUInt32BE(0x7f454c46, 0);
  buf[4] = 2; buf[5] = 1;
  buf.writeBigUInt64LE(BigInt(phoff), 0x20);
  buf.writeUInt16LE(56, 0x36);
  buf.writeUInt16LE(alignments.length + 1, 0x38);
  buf.writeUInt32LE(6, phoff); // PT_PHDR, ignored
  alignments.forEach((align, i) => {
    const base = phoff + 56 * (i + 1);
    buf.writeUInt32LE(1, base);
    buf.writeBigUInt64LE(BigInt(align), base + 0x30);
  });
  return buf;
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
  assert.match(dataSafety.detail, /ACCESS_COARSE_LOCATION -> Posizione approssimativa/);
  assert.doesNotMatch(dataSafety.detail, /ACCESS_FINE_LOCATION/);
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
  const lib = 'base/lib/arm64-v8a/libdatastore_shared_counter.so';
  assert.equal(levelOf(gate.checkEntries([...GOOD_ENTRIES, lib], { mode: 'test' }), 'page-size-16kb'), 'warn');
  assert.equal(levelOf(gate.checkEntries([...GOOD_ENTRIES, lib], { mode: 'test', readLib: () => elf64([0x4000, 0x4000]) }), 'page-size-16kb'), 'pass');
  assert.equal(levelOf(gate.checkEntries([...GOOD_ENTRIES, lib], { mode: 'test', readLib: () => elf64([0x4000, 0x1000]) }), 'page-size-16kb'), 'fail');
  assert.equal(levelOf(gate.checkEntries([...GOOD_ENTRIES, lib], { mode: 'test', readLib: () => Buffer.from('nope') }), 'page-size-16kb'), 'fail');
  // 32-bit ABIs are outside the 16 KB requirement.
  assert.equal(levelOf(gate.checkEntries([...GOOD_ENTRIES, 'base/lib/armeabi-v7a/libx.so'], { mode: 'test', readLib: () => Buffer.from('nope') }), 'page-size-16kb'), 'pass');
  assert.equal(gate.elfMinLoadAlignment(elf64([0x10000, 0x4000])), 0x4000);
  assert.equal(levelOf(gate.checkEntries([...GOOD_ENTRIES, 'base/assets/public/google-services.json'], { mode: 'test' }), 'no-signing-material'), 'fail');
  assert.equal(levelOf(gate.checkEntries([...GOOD_ENTRIES, 'base/root/upload.jks'], { mode: 'test' }), 'no-signing-material'), 'fail');
});

test('embedded server secrets fail the gate while the public anon config passes', async () => {
  const gate = await loadGate();
  const clean = gate.scanForSecrets([{ name: 'public/app.js', text: 'const SUPABASE_ANON_KEY = "eyJhbGciOi.anon";' }]);
  assert.equal(clean[0].level, 'pass');
  const jwt = (claims) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.c2lnbmF0dXJlLXZhbHVl`;
  assert.equal(gate.scanForSecrets([{ name: 'public/app.js', text: `const k = "${jwt({ role: 'anon', iss: 'supabase' })}";` }])[0].level, 'pass');
  assert.equal(gate.scanForSecrets([{ name: 'classes.dex', text: `x${jwt({ role: 'service_role', iss: 'supabase' })}x` }])[0].level, 'fail');
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
  fs.writeFileSync(path.join(extracted, 'app.js'), 'const URL = "https://iiakdfsxpywdkxravqjh.supabase.co";');
  fs.writeFileSync(path.join(dir, 'manifest.xml'), manifestXml());
  fs.writeFileSync(path.join(dir, 'entries.txt'), GOOD_ENTRIES.join('\n'));
  fs.writeFileSync(path.join(dir, 'app.aab'), 'not really a bundle');
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ optimizations: { uncompressNativeLibraries: { enabled: true, alignment: 'PAGE_ALIGNMENT_16K' } } }));
  const args = ['--bundle-config', path.join(dir, 'config.json'), '--mode', 'upload', '--manifest', path.join(dir, 'manifest.xml'), '--entries', path.join(dir, 'entries.txt'),
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
  // ...compared by public fingerprint only: the internal private key is never decoded here.
  assert.match(workflow, /vars\.ANDROID_INTERNAL_CERT_SHA256/);
  assert.doesNotMatch(workflow, /ANDROID_SIGNING_BUNDLE_B64/);
  assert.match(workflow, /BUNDLETOOL_SHA256: '[0-9a-f]{64}'/);
  assert.match(workflow, /-lt 24/);
});

test('PAGE_ALIGNMENT_16K is required in BundleConfig when 64-bit native libraries ship', async () => {
  const gate = await loadGate();
  const libs = [...GOOD_ENTRIES, 'base/lib/arm64-v8a/libdatastore_shared_counter.so'];
  const aligned = { bundletool: { version: '8.13.0' }, optimizations: { uncompressNativeLibraries: { enabled: true, alignment: 'PAGE_ALIGNMENT_16K' } } };
  assert.equal(gate.checkBundleConfig(aligned, libs)[0].level, 'pass');
  assert.equal(gate.checkBundleConfig({ optimizations: { uncompressNativeLibraries: { enabled: true, alignment: 'PAGE_ALIGNMENT_4K' } } }, libs)[0].level, 'fail');
  assert.equal(gate.checkBundleConfig({ optimizations: { uncompressNativeLibraries: { enabled: true } } }, libs)[0].level, 'fail');
  assert.equal(gate.checkBundleConfig({}, libs)[0].level, 'fail');
  assert.equal(gate.checkBundleConfig({}, GOOD_ENTRIES)[0].level, 'pass');
  assert.match(read('.github/workflows/android-play-bundle.yml'), /dump config --bundle=/);
});

test('once the source declares the guarded FCM service, test builds must ship it alone', async () => {
  const gate = await loadGate();
  const stock = gate.summarizeManifest(gate.parseManifestXml(manifestXml({ fcmServices: ['com.capacitorjs.plugins.pushnotifications.MessagingService'] })));
  const results = gate.checkManifest(stock, { expectVersionCode: '1791739949', expectVersionName: '1.0.0', mode: 'test', requireGuardedFcm: true });
  assert.equal(levelOf(results, 'fcm-guarded-receiver'), 'fail');
  assert.match(read('.github/workflows/android-play-bundle.yml'), /grep -q 'UsGuardedMessagingService' android\/app\/src\/main\/AndroidManifest\.xml/);
});

test('signed internal APK workflows never upload an installable APK in clear from a public repo', () => {
  for (const file of ['android-internal-release.yml', 'android-candidate-signed.yml', 'android-ui-integration-signed.yml']) {
    const workflow = read(`.github/workflows/${file}`);
    const guard = workflow.indexOf('Keep signed APK out of public artifacts');
    const upload = workflow.indexOf('actions/upload-artifact');
    assert.ok(guard > 0 && guard < upload, `${file}: guard step must precede the upload`);
    assert.match(workflow, /REPO_PRIVATE: \$\{\{ github\.event\.repository\.private \}\}/);
    assert.match(workflow, /if \(\$env:REPO_PRIVATE -eq 'true'\) \{ exit 0 \}/);
    assert.match(workflow, /7z a -t7z -mhe=on/);
    assert.match(workflow, /Length -ge 24/);
    assert.match(workflow, /\$apks \| Remove-Item -Force/);
  }
});

test('signing workflows mask keystore passwords before exporting them to later steps', () => {
  for (const file of ['android-internal-release.yml', 'android-candidate-signed.yml', 'android-ui-integration-signed.yml']) {
    const workflow = read(`.github/workflows/${file}`);
    for (const field of ['storePassword', 'keyPassword']) {
      const mask = workflow.indexOf(`::add-mask::$($bundle.${field})`);
      const exported = workflow.indexOf(`=$($bundle.${field})" | Out-File -FilePath $env:GITHUB_ENV`);
      assert.ok(mask > 0 && exported > mask, `${file}: ${field} must be masked before it reaches GITHUB_ENV`);
    }
  }
  const play = read('.github/workflows/android-play-bundle.yml');
  assert.ok(play.indexOf('::add-mask::$store_pass') < play.indexOf('US_ANDROID_UPLOAD_KEYSTORE_PASSWORD=$store_pass'));
});

test('a Play bundle targets production and carries no staging QA tooling', async () => {
  const gate = await loadGate();
  const prod = { name: 'base/assets/public/app.js', text: 'createClient("https://iiakdfsxpywdkxravqjh.supabase.co")' };
  assert.deepEqual(gate.checkProductionOnly([prod]).map((r) => r.level), ['pass', 'pass']);
  for (const text of [
    '<script defer src="/s3-staging-push-qa.js"></script>',
    "button.id = 's3-qa-button';",
    'https://dugmhngrfkuieeletatb.supabase.co',
    'appId com.usapp.us.staging'
  ]) {
    assert.equal(gate.checkProductionOnly([prod, { name: 'base/assets/public/index.html', text }])[0].level, 'fail', text);
  }
  assert.equal(gate.checkProductionOnly([prod, { name: 'base/dex/classes.dex', text: 'UsPushSupportPlugin.qaTrace' }])[0].level, 'fail');
  const staging = { name: 'base/assets/public/app.js', text: 'https://dugmhngrfkuieeletatb.supabase.co' };
  assert.equal(gate.checkProductionOnly([staging])[1].level, 'fail');
});

test('the upload-secret helper never prints or stores the keystore or its passwords', () => {
  const script = read('scripts/make-play-upload-secret.ps1');
  assert.match(script, /Read-Host -Prompt \$prompt -AsSecureString/);
  assert.match(script, /Set-Clipboard/);
  assert.match(script, /keystoreBase64[\s\S]*storePassword[\s\S]*keyAlias[\s\S]*keyPassword/);
  assert.doesNotMatch(script, /Out-File|Set-Content|Add-Content|Write-Output|Write-Host \$/);
});

test('precise location is forbidden: US 1.0 ships approximate location only', async () => {
  const { results } = await check({ extraPermissions: ['android.permission.ACCESS_FINE_LOCATION'] });
  const forbidden = results.filter((r) => r.level === 'fail').map((r) => `${r.id} ${r.detail || ''}`).join('\n');
  assert.match(forbidden, /ACCESS_FINE_LOCATION/);
  const clean = await check({});
  assert.doesNotMatch(clean.results.filter((r) => r.level === 'fail').map((r) => r.detail || '').join('\n'), /ACCESS_FINE_LOCATION/);
});
