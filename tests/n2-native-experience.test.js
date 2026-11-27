const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function loadPlatform({ runtime = null, vibrate = null } = {}) {
  const sandbox = { console: { warn() {} }, navigator: { vibrate } };
  if (runtime) sandbox.UsCapacitorRuntime = runtime;
  sandbox.window = sandbox;
  vm.runInContext(read('platform.js'), vm.createContext(sandbox), { filename: 'platform.js' });
  return sandbox.UsPlatform;
}

test('SystemBars Capacitor 8.5 usa inset CSS e contenuto chiaro sul shell scuro', () => {
  const config = JSON.parse(read('capacitor.config.json'));

  assert.deepEqual(config.plugins.SystemBars, {
    insetsHandling: 'css',
    style: 'DARK',
    hidden: false,
    initialViewportFitValueHint: 'cover'
  });

  const css = read('ui-foundation.css');
  assert.match(css, /--us-safe-top:\s*var\(--safe-area-inset-top,\s*env\(safe-area-inset-top,0px\)\)/);
  assert.match(css, /--us-safe-bottom:\s*var\(--safe-area-inset-bottom,\s*env\(safe-area-inset-bottom,0px\)\)/);
});

test('haptic usa il plugin nativo quando disponibile senza vibrazione web duplicata', async () => {
  const notifications = [];
  const vibrations = [];
  const platform = loadPlatform({
    runtime: {
      isNativePlatform: () => true,
      isPluginAvailable: (name) => name === 'Haptics',
      registerPlugin: () => ({
        notification: async (payload) => notifications.push(payload)
      })
    },
    vibrate: (pattern) => vibrations.push(pattern)
  });

  await platform.haptic('success', [28, 18, 38]);

  assert.deepEqual(notifications.map((payload) => ({ ...payload })), [{ type: 'SUCCESS' }]);
  assert.deepEqual(vibrations, []);
});

test('haptic nativo espone selection, error e heavy senza vibrazione web duplicata', async () => {
  const calls = [];
  const vibrations = [];
  const platform = loadPlatform({
    runtime: {
      isNativePlatform: () => true,
      isPluginAvailable: (name) => name === 'Haptics',
      registerPlugin: () => ({
        selectionChanged: async () => calls.push(['selection']),
        notification: async (payload) => calls.push(['notification', { ...payload }]),
        impact: async (payload) => calls.push(['impact', { ...payload }])
      })
    },
    vibrate: (pattern) => vibrations.push(pattern)
  });

  await platform.haptic('selection', [5]);
  await platform.haptic('error', [24, 40, 24]);
  await platform.haptic('heavy', [18]);

  assert.deepEqual(calls, [
    ['selection'],
    ['notification', { type: 'ERROR' }],
    ['impact', { style: 'HEAVY' }]
  ]);
  assert.deepEqual(vibrations, []);
});

test('haptic mantiene il pattern web e degrada in modo sicuro quando il plugin manca', async () => {
  const vibrations = [];
  const platform = loadPlatform({ vibrate: (pattern) => vibrations.push(pattern) });

  await platform.haptic('light', [30, 25, 45]);

  assert.deepEqual(vibrations, [[30, 25, 45]]);
});

test('haptic native senza plugin resta fail-safe e usa soltanto il fallback disponibile', async () => {
  const vibrations = [];
  const platform = loadPlatform({
    runtime: {
      isNativePlatform: () => true,
      isPluginAvailable: () => false,
      registerPlugin: () => { throw new Error('non deve registrare plugin assenti'); }
    },
    vibrate: (pattern) => vibrations.push(pattern)
  });

  await platform.haptic('medium', [45, 35, 80]);

  assert.deepEqual(vibrations, [[45, 35, 80]]);
});
