const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadPlatform(runtime = null) {
  const sandbox = { console: { warn() {} } };
  if (runtime) sandbox.UsCapacitorRuntime = runtime;
  sandbox.window = sandbox;
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'platform.js'), 'utf8'), vm.createContext(sandbox), { filename: 'platform.js' });
  return sandbox.UsPlatform;
}

test('boundary registra il listener Back native una sola volta e inoltra un solo callback', async () => {
  let registrations = 0;
  let nativeBack;
  const app = {
    async addListener(name, callback) {
      registrations += 1;
      assert.equal(name, 'backButton');
      nativeBack = callback;
      return { remove() {} };
    }
  };
  const platform = loadPlatform({
    isNativePlatform: () => true,
    isPluginAvailable: (name) => name === 'App',
    registerPlugin: () => app
  });
  let handled = 0;

  await Promise.all([
    platform.listenForNativeBackButton(() => { handled += 1; }),
    platform.listenForNativeBackButton(() => { handled += 100; })
  ]);
  nativeBack();

  assert.equal(registrations, 1);
  assert.equal(handled, 1);
});

test('boundary browser non registra App Back e non espone un exit nativo', async () => {
  const platform = loadPlatform();

  assert.equal(await platform.listenForNativeBackButton(() => {}), null);
  assert.equal(await platform.exitNativeApp(), false);
});

test('Android haptic selection uses perceptible native LIGHT impact; iOS keeps selection tick', async () => {
  const androidCalls = [];
  const fakeHaptics = {
    impact: ({ style }) => { androidCalls.push(['impact', style]); return Promise.resolve(); },
    selectionChanged: () => { androidCalls.push(['selection']); return Promise.resolve(); }
  };
  const android = loadPlatform({
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    haptics: fakeHaptics
  });
  await android.haptic('selection', [12]);
  await android.haptic('light', [16]);
  assert.deepEqual(androidCalls, [['impact', 'LIGHT'], ['impact', 'LIGHT']]);

  const iosCalls = [];
  const ios = loadPlatform({
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    haptics: {
      selectionChanged: () => { iosCalls.push('selection'); return Promise.resolve(); }
    }
  });
  await ios.haptic('selection', [12]);
  assert.deepEqual(iosCalls, ['selection']);
});

test('Android explicitly requests VIBRATE permission for Capacitor haptics', () => {
  const manifest = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.match(manifest, /<uses-permission android:name="android.permission.VIBRATE"/);
});
