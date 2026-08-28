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
