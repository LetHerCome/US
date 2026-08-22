const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function extractFunction(source, name, endMarker) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `Funzione ${name} non trovata`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Delimitatore di ${name} non trovato`);
  return source.slice(start, end).trim();
}

function createHarness(overrides = {}) {
  const appSource = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const settingsSource = fs.readFileSync(path.join(ROOT, 'settings.js'), 'utf8');
  const events = [];
  const stored = new Map([
    ['us:fix4:last-profile', 'profile'],
    ['us:signed-url-cache:v2', 'signed'],
    ['us:boot:home-photo:v1', 'home'],
    ['us:home-photo:boot:v1', 'legacy-home'],
    ['us:push:subscription:user-1', 'push'],
    ['us:push:subscription:user-2', 'other-user-push']
  ]);
  const subscription = {
    endpoint: 'https://push.example/device-1',
    unsubscribe: async () => {
      events.push('cleanup:unsubscribe');
      if (overrides.unsubscribeError) throw new Error('unsubscribe failed');
      return true;
    }
  };
  const pushButton = { disabled: false, textContent: '' };
  const context = vm.createContext({
    console: { warn() {} },
    confirm: () => true,
    location: { reload: () => events.push('reload') },
    document: { getElementById: () => pushButton },
    setTimeout() {},
    toast(message) { events.push(`toast:${message}`); },
    refreshWebPushUi: async () => { events.push('push:refresh'); },
    isWebPushSupported: () => true,
    isIosDevice: () => false,
    isStandaloneUs: () => true,
    Notification: { permission: 'granted' },
    getUsServiceWorkerRegistration: async () => ({
      pushManager: { getSubscription: async () => subscription }
    }),
    syncPushSubscriptionToSupabase: async () => {
      events.push('enable:sync:start');
      if(overrides.syncGate)await overrides.syncGate;
      events.push('enable:sync:done');
      return true;
    },
    sendWebPushEvent: async () => {},
    getCurrentPushSubscription: async () => subscription,
    sb: {
      rpc: async () => {
        events.push('revoke:server');
        if (overrides.rpcError) throw new Error('rpc failed');
        return { error: null };
      },
      auth: {
        signOut: async () => {
          events.push('signOut');
          await Promise.resolve();
          events.push('signOut:done');
          return { error: overrides.signOutError ? new Error('signOut failed') : null };
        }
      }
    },
    caches: {
      delete: async (name) => {
        events.push(`cleanup:cache:${name}`);
        if (overrides.cacheError) throw new Error('cache failed');
        return true;
      }
    },
    localStorage: {
      removeItem(key) {
        events.push(`cleanup:storage:${key}`);
        if (overrides.storageError === key) throw new Error('storage failed');
        stored.delete(key);
      }
    },
    window: { usProfile: { id: 'user-1' } },
    US_SIGNED_URL_CACHE: new Map([['private/path.jpg', { url: 'signed' }]]),
    US_SIGNED_URL_STORAGE_KEY: 'us:signed-url-cache:v2',
    US_HOME_BOOT_CACHE_KEY: 'us:boot:home-photo:v1',
    usPushUiBusy: false,
    usPushOperationInFlight: null,
    usNativeWidgetBridge: { configured: true },
    logoutInFlight: false
  });

  const appFunctions = [
    extractFunction(appSource, 'enableWebPush', 'window.enableWebPush='),
    extractFunction(appSource, 'disableWebPush', 'window.disableWebPush='),
    extractFunction(appSource, 'clearPrivateDeviceState', 'async function revokeCurrentDevice('),
    extractFunction(appSource, 'revokeCurrentDevice', 'window.revokeCurrentDevice=')
  ];
  vm.runInContext(appFunctions.join('\n'), context);
  context.window.revokeCurrentDevice = context.revokeCurrentDevice;
  vm.runInContext(extractFunction(settingsSource, 'logout', 'async function action('), context);
  return { context, events, stored };
}

test('login simulato -> logout -> reload rispetta revoke -> cleanup -> signOut', async () => {
  const { context, events, stored } = createHarness();

  await context.logout();

  const revokeIndex = events.indexOf('revoke:server');
  const cleanupIndex = events.indexOf('cleanup:unsubscribe');
  const signOutIndex = events.indexOf('signOut');
  const signOutDoneIndex = events.indexOf('signOut:done');
  const reloadIndex = events.indexOf('reload');
  assert.ok(revokeIndex > -1 && revokeIndex < cleanupIndex);
  assert.ok(cleanupIndex < signOutIndex);
  assert.ok(signOutIndex < signOutDoneIndex);
  assert.ok(signOutDoneIndex < reloadIndex);
  assert.equal(context.US_SIGNED_URL_CACHE.size, 0);
  assert.deepEqual(context.usNativeWidgetBridge, { configured: true });
  assert.deepEqual([...stored.keys()], ['us:push:subscription:user-2']);
  assert.ok(events.includes('cleanup:cache:us-private-media-v1'));
});

test('cleanup best-effort: gli errori non bloccano signOut o reload', async () => {
  const { context, events } = createHarness({
    rpcError: true,
    unsubscribeError: true,
    cacheError: true,
    storageError: 'us:signed-url-cache:v2'
  });
  context.usPushUiBusy = true;
  let finishPriorPush;
  context.usPushOperationInFlight = new Promise(resolve => { finishPriorPush = resolve; });

  const logoutPromise = context.logout();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(events.includes('revoke:server'), false);
  events.push('push:prior:done');
  context.usPushUiBusy = false;
  finishPriorPush();
  await logoutPromise;

  assert.equal(events.filter((event) => event === 'signOut').length, 1);
  assert.equal(events.filter((event) => event === 'reload').length, 1);
  assert.ok(events.indexOf('push:prior:done') < events.indexOf('revoke:server'));
  assert.ok(events.indexOf('revoke:server') < events.indexOf('cleanup:unsubscribe'));
  assert.ok(events.indexOf('cleanup:unsubscribe') < events.indexOf('signOut'));
});

test('doppio click avvia una sola sequenza di logout', async () => {
  const { context, events } = createHarness();

  await Promise.all([context.logout(), context.logout()]);

  assert.equal(events.filter((event) => event === 'revoke:server').length, 1);
  assert.equal(events.filter((event) => event === 'signOut').length, 1);
  assert.equal(events.filter((event) => event === 'reload').length, 1);
});

test('un errore restituito da signOut impedisce esclusivamente il reload', async () => {
  const { context, events } = createHarness({ signOutError: true });

  await context.logout();

  assert.equal(events.filter((event) => event === 'signOut').length, 1);
  assert.equal(events.filter((event) => event === 'reload').length, 0);
  assert.ok(events.includes('cleanup:cache:us-private-media-v1'));
});

test('disableWebPush senza opzioni conserva il comportamento UI normale', async () => {
  const { context, events } = createHarness();

  const result = await context.disableWebPush();

  assert.equal(result, true);
  assert.ok(events.indexOf('revoke:server') < events.indexOf('cleanup:unsubscribe'));
  assert.ok(events.includes('toast:Notifiche disattivate'));
  assert.ok(events.includes('push:refresh'));
});

test('disableWebPush normale non entra se lo stato push è busy', async () => {
  const { context, events } = createHarness();
  context.usPushUiBusy = true;

  const result = await context.disableWebPush();

  assert.equal(result, false);
  assert.equal(events.includes('revoke:server'), false);
  assert.equal(events.includes('push:refresh'), false);
});

test('disableWebPush normale conserva il feedback di errore RPC ma completa unsubscribe', async () => {
  const { context, events } = createHarness({ rpcError: true });

  const result = await context.disableWebPush();

  assert.equal(result, false);
  assert.ok(events.includes('cleanup:unsubscribe'));
  assert.ok(events.includes('toast:Non riesco a disattivare le notifiche'));
  assert.ok(events.includes('push:refresh'));
});

test('cleanup ripetuto è idempotente e preserva la chiave push di un altro profilo', async () => {
  const { context, stored } = createHarness();

  await context.revokeCurrentDevice();
  await context.revokeCurrentDevice();

  assert.deepEqual([...stored.keys()], ['us:push:subscription:user-2']);
  assert.equal(context.US_SIGNED_URL_CACHE.size, 0);
});

test('logout attende un enableWebPush in corso prima della revoca', async () => {
  let finishSync;
  const syncGate = new Promise(resolve => { finishSync = resolve; });
  const { context, events } = createHarness({ syncGate });

  const enablePromise = context.enableWebPush();
  await Promise.resolve();
  const logoutPromise = context.logout();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(events.includes('revoke:server'), false);

  finishSync();
  await Promise.all([enablePromise, logoutPromise]);

  assert.ok(events.indexOf('enable:sync:done') < events.indexOf('revoke:server'));
  assert.ok(events.indexOf('revoke:server') < events.indexOf('signOut'));
});
