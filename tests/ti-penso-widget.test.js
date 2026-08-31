const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const sha256 = (file) => createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');

function loadPlatform(runtime = null) {
  const sandbox = { console: { warn() {} }, navigator: {} };
  if (runtime) sandbox.UsCapacitorRuntime = runtime;
  sandbox.window = sandbox;
  vm.runInContext(read('platform.js'), vm.createContext(sandbox), { filename: 'platform.js' });
  return sandbox.UsPlatform;
}

function loadWidgetRuntime({ launchUrl = null, issueResult = { token: 'A'.repeat(43), expiresAt: '2027-01-01T00:00:00.000Z' }, storeCredentialResult = true } = {}) {
  const events = [];
  let appUrlOpen;
  let listenerRegistrations = 0;
  let issueCalls = 0;
  let revokeCalls = 0;
  const platform = {
    isNative: true,
    activateWidgetAccount: async (ownerHash) => events.push(['activate', ownerHash]),
    writeWidgetSnapshot: async (snapshot) => events.push(['snapshot', snapshot]),
    clearWidgetSnapshot: async () => events.push(['clear']),
    getWidgetDeviceIdentity: async () => ({ deviceId: '5a86d7aa-37d8-48ed-9122-a8f42d80ff9e' }),
    storeWidgetActionCredential: async (ownerHash, token) => { events.push(['credential', ownerHash, token]); return storeCredentialResult; },
    clearWidgetActionCredential: async () => events.push(['credential-clear']),
    getNativeLaunchUrl: async () => launchUrl,
    listenForNativeAppUrl(handler) {
      listenerRegistrations += 1;
      appUrlOpen = handler;
      return Promise.resolve({ remove() {} });
    }
  };
  const sandbox = {
    console: { warn() {} },
    crypto: webcrypto,
    TextEncoder,
    URL,
    UsPlatform: platform,
    go(page) { events.push(['go', page]); },
    UsWidgetCredentialApi: {
      issue: async (deviceIdHash) => { issueCalls += 1; events.push(['issue', deviceIdHash]); return issueResult; },
      revoke: async (deviceIdHash) => { revokeCalls += 1; events.push(['revoke', deviceIdHash]); return true; }
    },
    setTimeout,
    clearTimeout
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(read('ti-penso-widget.js'), context, { filename: 'ti-penso-widget.js' });
  return {
    widget: context.UsThinkWidget,
    emitUrl: (url) => appUrlOpen?.({ url }),
    events,
    get listenerRegistrations() { return listenerRegistrations; },
    get issueCalls() { return issueCalls; },
    get revokeCalls() { return revokeCalls; }
  };
}

test('browser/PWA mantiene il bridge widget come no-op fail-safe', async () => {
  const platform = loadPlatform();
  assert.equal(platform.isNative, false);
  assert.equal(await platform.activateWidgetAccount('owner'), false);
  assert.equal(await platform.writeWidgetSnapshot({ schemaVersion: 1 }), false);
  assert.equal(await platform.clearWidgetSnapshot(), false);
  assert.equal(await platform.getNativeLaunchUrl(), null);
  assert.equal(await platform.listenForNativeAppUrl(() => {}), null);
  assert.equal(await platform.getWidgetDeviceIdentity(), null);
  assert.equal(await platform.storeWidgetActionCredential('a'.repeat(64), 'A'.repeat(43)), false);
  assert.equal(await platform.clearWidgetActionCredential(), false);
});

test('boundary inoltra solo snapshot e owner hash, mai credenziali', async () => {
  const calls = [];
  const plugin = {
    activateAccount: async (payload) => calls.push(['activate', payload]),
    writeSnapshot: async (payload) => calls.push(['write', payload]),
    clearSnapshot: async () => calls.push(['clear'])
  };
  const platform = loadPlatform({
    isNativePlatform: () => true,
    isPluginAvailable: (name) => name === 'UsWidgetBridge',
    registerPlugin: () => plugin
  });
  await platform.activateWidgetAccount('a'.repeat(64));
  await platform.writeWidgetSnapshot({
    schemaVersion: 1,
    ownerHash: 'a'.repeat(64),
    updatedAt: '2026-08-31T12:00:00.000Z',
    modules: { think: { partnerName: 'F', lastReceivedAt: '', lastSentAt: '', lastActionStatus: 'idle', lastActionAt: '' } },
    accessToken: 'secret', refreshToken: 'secret', supabaseUrl: 'secret', supabaseKey: 'secret'
  });
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ['activate', { ownerHash: 'a'.repeat(64) }]);
  const serialized = JSON.stringify(calls[1]);
  assert.doesNotMatch(serialized, /secret|accessToken|refreshToken|supabaseUrl|supabaseKey/);
  assert.equal(calls[1][1].snapshot.schemaVersion, 1);
});

test('listener URL native è singolo e auth ready provisiona una credential device-scoped', async () => {
  const harness = loadWidgetRuntime({ launchUrl: { url: 'us://widget/think/send' } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(harness.listenerRegistrations, 1);
  assert.equal(harness.issueCalls, 0);
  await harness.widget.authReady({ id: 'user-1' });
  assert.equal(harness.issueCalls, 1);
  assert.ok(harness.events.some((event) => event[0] === 'credential'));
});

test('URL open naviga Home mentre URL send legacy non invia dalla WebView', async () => {
  const harness = loadWidgetRuntime();
  await harness.widget.authReady({ id: 'user-1' });
  await harness.emitUrl('us://widget/think/open');
  assert.deepEqual(harness.events.find((event) => event[0] === 'go'), ['go', 'home']);
  assert.equal(await harness.emitUrl('us://widget/think/send'), false);
});

test('fallimento provisioning non conserva credential e non pubblica falso sent', async () => {
  const harness = loadWidgetRuntime({ issueResult: null });
  await harness.widget.authReady({ id: 'user-1' });
  assert.equal(harness.events.some((event) => event[0] === 'credential'), false);
  assert.ok(harness.events.some((event) => event[0] === 'credential-clear'));
});

test('credential emessa ma non cifrata localmente viene revocata subito', async () => {
  const harness = loadWidgetRuntime({ storeCredentialResult: false });
  await harness.widget.authReady({ id: 'user-1' });
  assert.equal(harness.issueCalls, 1);
  assert.equal(harness.revokeCalls, 1);
  assert.ok(harness.events.some((event) => event[0] === 'credential-clear'));
});

test('logout attende il provisioning prima di revocare e cancellare la credential', async () => {
  let releaseIssue;
  const pendingIssue = new Promise((resolve) => { releaseIssue = resolve; });
  const harness = loadWidgetRuntime({ issueResult: pendingIssue });
  const ready = harness.widget.authReady({ id: 'user-1' });
  for (let index = 0; index < 10 && harness.issueCalls === 0; index += 1) await new Promise(setImmediate);
  assert.equal(harness.issueCalls, 1);
  const clearing = harness.widget.clear();
  await Promise.resolve();
  assert.equal(harness.revokeCalls, 0);
  releaseIssue({ token: 'A'.repeat(43), expiresAt: '2027-01-01T00:00:00.000Z' });
  await Promise.all([ready, clearing]);
  const names = harness.events.map((event) => event[0]);
  assert.ok(names.indexOf('credential') < names.indexOf('revoke'));
  assert.ok(names.indexOf('revoke') < names.indexOf('credential-clear'));
});

test('snapshot è versionato, isolato con hash account e cancellabile', async () => {
  const harness = loadWidgetRuntime();
  await harness.widget.authReady({ id: 'raw-user-id' });
  await harness.widget.publishThink({ partnerName: 'Partner', lastReceivedAt: '', lastSentAt: '' });
  const snapshot = harness.events.findLast((event) => event[0] === 'snapshot')[1];
  assert.equal(snapshot.schemaVersion, 1);
  assert.match(snapshot.ownerHash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(snapshot), /raw-user-id/);
  await harness.widget.clear();
  assert.ok(harness.events.some((event) => event[0] === 'clear'));
  assert.equal(harness.revokeCalls, 1);
  assert.ok(harness.events.some((event) => event[0] === 'credential-clear'));
  assert.ok(harness.events.findIndex((event) => event[0] === 'revoke') < harness.events.findIndex((event) => event[0] === 'credential-clear'));
});

test('cambio account produce owner hash distinto e non riusa identità raw', async () => {
  const harness = loadWidgetRuntime();
  await harness.widget.authReady({ id: 'account-one' });
  await harness.widget.publishThink({ partnerName: 'Prima', lastReceivedAt: '', lastSentAt: '' });
  const first = harness.events.findLast((event) => event[0] === 'snapshot')[1];
  await harness.widget.authReady({ id: 'account-two' });
  await harness.widget.publishThink({ partnerName: 'Seconda', lastReceivedAt: '', lastSentAt: '' });
  const second = harness.events.findLast((event) => event[0] === 'snapshot')[1];
  assert.notEqual(first.ownerHash, second.ownerHash);
  assert.doesNotMatch(JSON.stringify(second), /account-one|account-two|Prima/);
});

test('app provisiona/revoca via client Supabase esistente e non conserva session token nel bridge', () => {
  const app = read('app.js');
  const coordinator = read('ti-penso-widget.js');
  assert.doesNotMatch(app, /syncNativeWidgetBridge|bridge\.configure/);
  assert.doesNotMatch(coordinator, /window\.sendThinkSignal\(\)/);
  assert.doesNotMatch(coordinator, /Supabase|access[_T]?oken|refresh[_T]?oken|supabaseUrl|supabaseKey/i);
  assert.match(app, /widget-device-token/);
  assert.match(app, /UsWidgetCredentialApi/);
  assert.match(app, /UsThinkWidget\?\.authReady\?\.\(profile\)/);
  assert.match(app, /UsThinkWidget\?\.publishThink\?\.\(/);
  assert.match(app, /if\(options\.foreground\)hydrateThink\(\)\.catch/);
  assert.match(app, /UsThinkWidget\?\.clear\?\.\(\)/);
});

test('plugin Android dichiara provider 2x2, networking minimale senza Supabase client e MainActivity invariata', () => {
  const pluginManifest = read('native-plugins/us-widget-bridge/android/src/main/AndroidManifest.xml');
  const providerInfo = read('native-plugins/us-widget-bridge/android/src/main/res/xml/us_widget_think_info.xml');
  const mainActivity = read('android/app/src/main/java/com/usapp/us/MainActivity.java');
  const pluginSources = [
    'native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget/UsWidgetBridgePlugin.java',
    'native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget/UsWidgetSnapshotStore.java',
    'native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget/UsThinkWidgetProvider.java'
  ].map(read).join('\n');
  assert.match(pluginManifest, /android\.appwidget\.action\.APPWIDGET_UPDATE/);
  assert.match(providerInfo, /android:targetCellWidth="2"/);
  assert.match(providerInfo, /android:targetCellHeight="2"/);
  assert.doesNotMatch(pluginSources, /OkHttp|Supabase|accessToken|refreshToken/);
  assert.match(pluginSources, /getNoBackupFilesDir\(\)/);
  assert.match(pluginSources, /new AtomicFile/);
  assert.match(pluginSources, /!currentOwner\.equals\(ownerHash\)\) snapshotFile\.delete\(\)/);
  assert.equal(mainActivity.replace(/\r\n/g, '\n').trim(), 'package com.usapp.us;\n\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {}');
});

test('widget 2x2 usa il visual minimale con cuore standard, copy personale e CTA', () => {
  const layout = read('native-plugins/us-widget-bridge/android/src/main/res/layout/us_widget_think.xml');
  const background = read('native-plugins/us-widget-bridge/android/src/main/res/drawable/us_widget_background.xml');
  const heart = read('native-plugins/us-widget-bridge/android/src/main/res/drawable/us_widget_heart.xml');
  const provider = read('native-plugins/us-widget-bridge/android/src/main/java/com/usapp/widget/UsThinkWidgetProvider.java');

  assert.doesNotMatch(layout, /us_wordmark|us_widget_title|us_icon_ti_penso/i);
  assert.match(layout, /android:src="@drawable\/us_widget_heart"/);
  assert.match(layout, /android:layout_width="64dp"/);
  assert.match(layout, /android:id="@\+id\/us_widget_cta"/);
  assert.match(heart, /<vector/);
  assert.match(heart, /android:fillColor="@color\/us_widget_heart"/);
  assert.doesNotMatch(heart, /gradient|filter|strokeColor/i);
  assert.doesNotMatch(background, /#6EBA6DFF|neon|glow/i);
  assert.match(provider, /partnerName/);
  assert.match(provider, /ti sta pensando ✨/);
  assert.match(provider, /ti ha pensato\\n/);
  assert.match(provider, /R[Ii][Cc][Aa][Mm][Bb][Ii][Aa]/);
});

test('derivative widget sono byte-identiche agli APPROVED e il sync è deterministico', () => {
  execFileSync(process.execPath, ['scripts/sync-approved-widget-assets.mjs'], { cwd: ROOT });
  const firstIcon = sha256('native-plugins/us-widget-bridge/android/src/main/res/drawable-nodpi/us_icon_ti_penso_v1.png');
  const firstWordmark = sha256('native-plugins/us-widget-bridge/android/src/main/res/drawable-nodpi/us_wordmark_v1.png');
  execFileSync(process.execPath, ['scripts/sync-approved-widget-assets.mjs'], { cwd: ROOT });
  assert.equal(firstIcon, sha256('assets/source/ui/us-icon-ti-penso-v1.png'));
  assert.equal(firstWordmark, sha256('assets/source/brand/us-wordmark-v1.png'));
  assert.equal(firstIcon, sha256('native-plugins/us-widget-bridge/android/src/main/res/drawable-nodpi/us_icon_ti_penso_v1.png'));
  assert.equal(firstWordmark, sha256('native-plugins/us-widget-bridge/android/src/main/res/drawable-nodpi/us_wordmark_v1.png'));
});
