const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function read(file) {
  const target = path.join(ROOT, file);
  assert.ok(fs.existsSync(target), `${file} deve esistere`);
  return fs.readFileSync(target, 'utf8');
}

function createPlatform(capacitor = null) {
  const sandbox = { console: { warn() {} } };
  if (capacitor) sandbox.UsCapacitorRuntime = capacitor;
  sandbox.window = sandbox;
  vm.runInContext(read('platform.js'), vm.createContext(sandbox), { filename: 'platform.js' });
  return sandbox.UsPlatform;
}

test('platform boundary distingue web e native senza dipendere dallo user agent', () => {
  const web = createPlatform();
  const native = createPlatform({
    isNativePlatform: () => true,
    isPluginAvailable: () => false,
    registerPlugin: () => null
  });

  assert.equal(web.isNative, false);
  assert.equal(web.canUseServiceWorker, true);
  assert.equal(web.canUseWebPush, true);
  assert.equal(web.canUsePwaUpdates, true);
  assert.equal(web.canUsePrivateWebMediaCache, true);

  assert.equal(native.isNative, true);
  assert.equal(native.canUseServiceWorker, false);
  assert.equal(native.canUseWebPush, false);
  assert.equal(native.canUsePwaUpdates, false);
  assert.equal(native.canUsePrivateWebMediaCache, false);
});

test('widget bridge viene registrato soltanto quando il plugin native e disponibile', () => {
  const calls = [];
  const unavailable = createPlatform({
    isNativePlatform: () => true,
    isPluginAvailable: () => false,
    registerPlugin(name) { calls.push(name); return { name }; }
  });
  assert.equal(unavailable.getNativePlugin('UsWidgetBridge'), null);
  assert.deepEqual(calls, []);

  const available = createPlatform({
    isNativePlatform: () => true,
    isPluginAvailable: (name) => name === 'UsWidgetBridge',
    registerPlugin(name) { calls.push(name); return { name }; }
  });
  assert.deepEqual(available.getNativePlugin('UsWidgetBridge'), { name: 'UsWidgetBridge' });
  assert.deepEqual(calls, ['UsWidgetBridge']);
});

test('app abilita Web Push nel browser e lo esclude nel container native', () => {
  const source = read('app.js');
  const block = source.match(/function isWebPushSupported\(\)[\s\S]*?(?=function urlBase64ToUint8Array)/)?.[0];
  assert.ok(block, 'helper Web Push non trovato');

  function evaluate(platform) {
    const browserWindow = {
      PushManager() {},
      Notification() {},
      UsPlatform: platform
    };
    const context = vm.createContext({
      window: browserWindow,
      navigator: { serviceWorker: {} },
      Notification: browserWindow.Notification
    });
    vm.runInContext(block, context);
    return context.isWebPushSupported();
  }

  assert.equal(evaluate({ canUseWebPush: true }), true);
  assert.equal(evaluate({ canUseWebPush: false }), false);
});

test('registrazione Service Worker resta web-only', async () => {
  const source = read('app.js');
  const block = source.match(/function canUseUsServiceWorker\(\)[\s\S]*?(?=async function getCurrentPushSubscription)/)?.[0];
  assert.ok(block, 'guard Service Worker non trovato');

  async function evaluate(platform) {
    let registrations = 0;
    const ready = { scope: '/' };
    const context = vm.createContext({
      window: { UsPlatform: platform },
      navigator: {
        serviceWorker: {
          register: async () => { registrations += 1; },
          ready
        }
      }
    });
    vm.runInContext(block, context);
    return { registration: await context.getUsServiceWorkerRegistration(), registrations };
  }

  assert.deepEqual(await evaluate({ canUseServiceWorker: true }), {
    registration: { scope: '/' },
    registrations: 1
  });
  assert.deepEqual(await evaluate({ canUseServiceWorker: false }), {
    registration: null,
    registrations: 0
  });
});

test('fastboot native non prova il pseudo endpoint della cache PWA', async () => {
  const attempts = [];
  const profile = { id: 'user-1', couple_id: 'couple-1' };
  const cached = {
    path: 'couple-1/user-1/photo.webp',
    coupleId: 'couple-1',
    url: 'https://media.example.test/signed-photo',
    expiresAt: Date.now() + 60000
  };
  const layer = { style: {}, classList: { add() {} } };
  class ImageStub {
    set src(value) {
      attempts.push(value);
      queueMicrotask(() => this.onload?.());
    }
  }
  const sandbox = {
    console: { info() {} },
    Image: ImageStub,
    localStorage: {
      getItem(key) {
        if (key === 'us:fix4:last-profile') return JSON.stringify(profile);
        if (key === 'us:home-photo:boot:v1') return JSON.stringify(cached);
        return null;
      }
    },
    document: {
      getElementById: () => layer,
      body: { classList: { add() {} } }
    },
    UsPlatform: { canUsePrivateWebMediaCache: false }
  };
  sandbox.window = sandbox;
  vm.runInContext(read('fastboot2.js'), vm.createContext(sandbox), { filename: 'fastboot2.js' });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(attempts, ['https://media.example.test/signed-photo']);
});

test('update checker PWA non installa listener o timer nel container native', () => {
  const source = read('fix4.js');
  const blocks = [
    source.match(/function canUsePwaUpdates\(\)[\s\S]*?(?=function syncRuntimeLayout)/)?.[0],
    source.match(/async function checkForUpdate\(\)[\s\S]*?(?=async function applyUpdate)/)?.[0],
    source.match(/async function applyUpdate\(\)[\s\S]*?(?=function setupUpdateChecks)/)?.[0],
    source.match(/function setupUpdateChecks\(\)[\s\S]*?(?=function setupMutationObserver)/)?.[0]
  ];
  assert.ok(blocks.every(Boolean), 'blocco update PWA non trovato');
  const events = [];
  const updateBar = { hidden: false };
  const context = vm.createContext({
    window: { UsPlatform: { canUsePwaUpdates: false } },
    navigator: { onLine: true, serviceWorker: {} },
    updateBar,
    updateBtn: { addEventListener: () => events.push('listener') },
    updateCheckTimer: null,
    syncRuntimeLayout: () => events.push('layout'),
    fetch: () => { events.push('fetch'); return Promise.resolve({ ok: false }); },
    setInterval: () => { events.push('timer'); return 1; },
    document: { hidden: false },
    location: { reload() {} }
  });
  vm.runInContext(blocks.join('\n'), context);
  context.setupUpdateChecks();

  assert.equal(updateBar.hidden, true);
  assert.deepEqual(events, ['layout']);
});

test('config Capacitor resta bundled-only e non introduce una piattaforma iOS', () => {
  const config = JSON.parse(read('capacitor.config.json'));
  assert.equal(config.appId, 'com.usapp.us');
  assert.equal(config.appName, 'US');
  assert.equal(config.webDir, 'dist/capacitor');
  assert.equal(config.server, undefined);
  assert.deepEqual(config.plugins.SystemBars, {
    insetsHandling: 'css',
    style: 'DARK',
    hidden: false
  });
  assert.equal(fs.existsSync(path.join(ROOT, 'android')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'ios')), false);
});
