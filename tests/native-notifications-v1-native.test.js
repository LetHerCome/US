// Native Notifications V1 — native contract: what the Android/iOS projects,
// the local plugin and the web client must (and must not) contain. Static
// checks only; Gradle/Xcode builds run in the native CI workflows.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const PLUGIN = 'native-plugins/us-push-support';

test('N2 identity: application id, bundle id and signing are unchanged; no Firebase/APNs credential is committed', () => {
  assert.equal(JSON.parse(read('capacitor.config.json')).appId, 'com.usapp.us');
  const gradle = read('android/app/build.gradle');
  assert.match(gradle, /applicationId "com\.usapp\.us"/);
  // google-services is applied only when the (uncommitted) config file exists.
  assert.match(gradle, /google-services\.json/);
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  assert.deepEqual([...pbx.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1]), ['com.usapp.us', 'com.usapp.us']);
  assert.doesNotMatch(pbx, /DEVELOPMENT_TEAM\s*=|PROVISIONING_PROFILE/);
  const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n');
  for (const file of tracked) {
    assert.doesNotMatch(file, /google-services\.json$|GoogleService-Info\.plist$|\.p8$|\.p12$|\.jks$|\.keystore$|\.mobileprovision$/i, file);
  }
  const diffable = ['notifications.js', 'app.js', 'settings.js', `${PLUGIN}/android/src/main/java/com/usapp/pushsupport/UsPushSupportPlugin.java`,
    `${PLUGIN}/ios/Sources/UsPushSupportPlugin/UsPushSupportPlugin.swift`, 'ios/App/App/AppDelegate.swift', 'android/app/src/main/AndroidManifest.xml'];
  for (const rel of diffable) assert.doesNotMatch(read(rel), /BEGIN (RSA |EC )?PRIVATE KEY|"private_key"|AAAA[0-9A-Za-z_-]{7}:APA91/, rel);
});

test('N2 Android: official plugin + local support plugin synced, channels match the server contract', async () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies['@capacitor/push-notifications'], '8.1.3', 'exact version');
  assert.equal(pkg.dependencies['@us/push-support'], `file:${PLUGIN}`);
  const settings = read('android/capacitor.settings.gradle');
  assert.match(settings, /include ':capacitor-push-notifications'/);
  assert.match(settings, /project\(':us-push-support'\)\.projectDir = new File\('\.\.\/native-plugins\/us-push-support\/android'\)/);
  const plugin = read(`${PLUGIN}/android/src/main/java/com/usapp/pushsupport/UsPushSupportPlugin.java`);
  const channels = read(`${PLUGIN}/android/src/main/java/com/usapp/pushsupport/UsPushChannels.java`);
  assert.match(plugin, /@CapacitorPlugin\(name = "UsPushSupport"\)/);
  assert.match(plugin, /getIdentifier\("google_app_id", "string"/, 'Firebase configured = generated google_app_id');
  assert.doesNotMatch(plugin, /FirebaseMessaging|FirebaseApp|getToken/, 'the support plugin never touches Firebase itself');
  const transport = await import(path.join(ROOT, 'supabase/functions/_shared/native-push-transport.mjs'));
  assert.match(channels, new RegExp(`PARTNER = "${transport.ANDROID_CHANNELS.partner}"`));
  assert.match(channels, new RegExp(`REMINDERS = "${transport.ANDROID_CHANNELS.reminders}"`));
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /default_notification_icon"\s+android:resource="@drawable\/us_adaptive_foreground_v1"/);
  assert.match(manifest, /default_notification_channel_id"\s+android:value="us_partner"/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.ok(exists('android/app/src/main/res/drawable-nodpi/us_adaptive_foreground_v1.png'));
  assert.equal(exists('android/app/google-services.json'), false, 'never invented');
});

test('N2 iOS: APNs forwarding, Push entitlement, Ricambia category, environment detection', async () => {
  const delegate = read('ios/App/App/AppDelegate.swift');
  assert.match(delegate, /didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data\)[\s\S]*?\.capacitorDidRegisterForRemoteNotifications, object: deviceToken/);
  assert.match(delegate, /didFailToRegisterForRemoteNotificationsWithError error: Error\)[\s\S]*?\.capacitorDidFailToRegisterForRemoteNotifications, object: error/);
  assert.match(read('ios/App/App/App.entitlements'), /<key>aps-environment<\/key>\s*<string>development<\/string>/);
  const swiftPackage = read('ios/App/CapApp-SPM/Package.swift');
  assert.match(swiftPackage, /\.product\(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications"\)/);
  assert.match(swiftPackage, /\.package\(name: "UsPushSupport", path: "\.\.\/\.\.\/\.\.\/native-plugins\/us-push-support"\)/);
  const plugin = read(`${PLUGIN}/ios/Sources/UsPushSupportPlugin/UsPushSupportPlugin.swift`);
  const transport = await import(path.join(ROOT, 'supabase/functions/_shared/native-push-transport.mjs'));
  assert.match(plugin, new RegExp(`thinkCategory = "${transport.APNS_CATEGORIES.think}"`));
  assert.match(plugin, /ricambiaAction = "ricambia"/);
  assert.match(plugin, /title: "Ricambia",\s*options: \[\.foreground\]/, 'Ricambia opens US; nothing runs in the background');
  assert.match(plugin, /public let jsName = "UsPushSupport"/);
  assert.match(read(`${PLUGIN}/ios/Sources/UsPushSupportPlugin/UsPushEnvironment.swift`), /entitlements\["aps-environment"\]/);
  assert.doesNotMatch(read(`${PLUGIN}/ios/Sources/UsPushSupportPlugin/UsPushEnvironment.swift`), /@objc\(/);
  assert.match(read('.github/workflows/ios-native.yml'), /swiftc native-plugins\/us-push-support\/ios\/Sources\/UsPushSupportPlugin\/UsPushEnvironment\.swift/);
});

test('N2 foreground: no OS banner while US is open (Android and iOS)', () => {
  assert.deepEqual(JSON.parse(read('capacitor.config.json')).plugins.PushNotifications, { presentationOptions: [] });
});

test('N2 client: shipped in the native bundle, PWA and SW, loaded before app.js', () => {
  const html = read('index.html');
  const lock = html.indexOf('<script defer src="/app-lock.js?v=');
  const client = html.indexOf('<script defer src="/notifications.js?v=');
  const app = html.indexOf('<script defer src="/app.js?v=');
  assert.ok(lock > 0 && lock < client && client < app, 'platform → app-lock → notifications → app');
  assert.match(read('scripts/build-capacitor-web.mjs'), /'notifications\.js'/);
  assert.match(read('scripts/build-cloudflare-pages.mjs'), /'notifications\.js'/);
  assert.match(read('service-worker.js'), /versioned\("\/notifications\.js"\)/);
  // PWA release safety: the three build markers move together.
  const build = html.match(/name="us-build" content="([^"]+)"/)[1];
  assert.equal(JSON.parse(read('version.json')).version, build);
  assert.match(read('service-worker.js'), new RegExp(`const BUILD_ID = "${build}"`));
  assert.match(read('service-worker.js'), /const MEDIA_CACHE_NAME = "us-private-media-v1"/);
});

function loadClient(window = {}) {
  const context = vm.createContext({ window, document: { hidden: false, addEventListener() {}, removeEventListener() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, setTimeout, clearTimeout, crypto: require('node:crypto').webcrypto, CustomEvent: class {} });
  vm.runInContext(read('notifications.js'), context);
  return context.window.UsNotifications;
}

test('N2 payload contract: only allow-listed targets, UUID refs, no URL ever navigates', async () => {
  const api = loadClient();
  assert.equal(api.supported(), false, 'the PWA never uses the native client');
  const { parsePayload, intentFromAction, normalizeToken } = api._test;
  const core = await import(path.join(ROOT, 'supabase/functions/_shared/notification-core.mjs'));
  const REF = '33333333-3333-4333-8333-333333333333';
  for (const target of core.NOTIFICATION_TARGETS) assert.equal(parsePayload({ v: '1', type: 'x', target, ref: '', tag: 't' }).target, target);
  assert.deepEqual({ ...parsePayload({ v: '1', type: 'think', target: 'think', ref: REF.toUpperCase(), tag: 't' }) }, { type: 'think', target: 'think', ref: REF });
  // iOS userInfo carries the contract under "us".
  assert.equal(parsePayload({ aps: {}, us: { v: 1, type: 'calendar_reminder', target: 'calendar', ref: REF } }).target, 'calendar');
  for (const bad of [null, {}, { v: '2', target: 'home' }, { v: '1', target: 'https://evil.example' }, { v: '1', target: 'settings' },
    { v: '1', target: '../home' }, { v: '1', target: 'home', url: 'javascript:alert(1)' }]) {
    const parsed = parsePayload(bad);
    assert.ok(parsed === null || (parsed.target === 'home' && !('url' in parsed)), JSON.stringify(bad));
  }
  assert.equal(parsePayload({ v: '1', type: 'think', target: 'think', ref: 'not-a-uuid' }).ref, null);
  // Android data from the tray carries extra google.* keys: ignored.
  assert.equal(intentFromAction({ actionId: 'tap', notification: { data: { 'google.message_id': 'x', from: '1', v: '1', type: 'today', target: 'today' } } }).target, 'today');
  assert.equal(intentFromAction({ actionId: 'dismiss', notification: { data: { v: '1', target: 'home' } } }), null);
  assert.equal(intentFromAction({ actionId: 'delete_everything', notification: { data: { v: '1', target: 'home' } } }), null);
  assert.equal(intentFromAction({ actionId: 'ricambia', notification: { data: { v: '1', type: 'think', target: 'think', ref: REF } } }).action, 'ricambia');
  assert.equal(intentFromAction({ actionId: 'ricambia', notification: { data: { v: '1', type: 'today', target: 'today' } } }).action, 'open');
  // Tokens are shaped exactly like the server/database expects (iOS hex lower-cased).
  assert.equal(normalizeToken('ios', 'AB'.repeat(32)), 'ab'.repeat(32));
  assert.equal(normalizeToken('ios', 'zz'.repeat(32)), '');
  assert.equal(normalizeToken('android', `fcm:${'a'.repeat(60)}`), `fcm:${'a'.repeat(60)}`);
  assert.equal(normalizeToken('android', 'short'), '');
});

test('N2 client source: no permission at boot, no URL navigation, only push ownership metadata persisted', () => {
  const client = read('notifications.js');
  assert.doesNotMatch(client, /location\.(href|assign|replace)|window\.open\(|innerHTML|eval\(/);
  assert.doesNotMatch(client, /console\.(log|info)\(/, 'tokens are never logged');
  // requestPermissions only inside enable(), which only an explicit "Attiva" calls.
  const enable = client.slice(client.indexOf('async function enable()'), client.indexOf('async function stopNativeDelivery'));
  assert.match(enable, /push\.requestPermissions\(\)/);
  assert.equal(client.split('requestPermissions(').length - 1, 1);
  const stored = [...client.matchAll(/'us:notifications:v1:[^']*'|`us:notifications:v1:[^`]*`/g)].map((m) => m[0]);
  assert.deepEqual(stored, ["'us:notifications:v1:installation'", "'us:notifications:v1:owner'", "'us:notifications:v1:token'", "'us:notifications:v1:retired'", '`us:notifications:v1:enabled:${userId}`', '`us:notifications:v1:synced:${userId}`']);
  assert.doesNotMatch(client, /access_token|refresh_token|service_role/, 'push tokens never replace Auth credentials');
  // Android: FirebaseMessaging is never touched without a configuration.
  assert.match(client, /if \(status\?\.available && status\.configured\) \{\s*try \{ await withTimeout\(push\.unregister\(\)/);
  // Navigation waits for the session AND the app lock.
  assert.match(client, /lock\.whenOpen\(\)/);
  const app = read('app.js');
  assert.match(app, /window\.UsNotifications\?\.onNavigate\?\.\(intent=>performPushNavigation\(intent\.target,intent\)\)/);
  assert.match(app, /if\(!US_PUSH_TARGETS\.includes\(target\)\)return;/);
  assert.match(app, /window\.UsNotifications\?\.revokeDevice\?\.\(\)/);
  const revoke = app.slice(app.indexOf('async function revokeCurrentDevice('), app.indexOf('window.revokeCurrentDevice='));
  assert.ok(revoke.indexOf('UsNotifications') < revoke.indexOf('disableWebPush') && revoke.indexOf('disableWebPush') < revoke.indexOf('clearPrivateDeviceState'), 'capture native identity before awaiting Web Push cleanup');
});
