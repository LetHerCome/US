// Bug 25/10/2026 (1.2.2): «Non riesco ad attivare le notifiche ·
// T-registration_failedjavau». Android hands the registrationError as the
// whole Java message ("java.util.concurrent.ExecutionException:
// java.io.IOException: SERVICE_NOT_AVAILABLE"); notifications.js kept its first
// 40 letters, so FCM's own reason was cut off and a transient failure never got
// its second try. The reason is now FCM's code, the last upper-case word.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;

const source = fs.readFileSync(path.join(__dirname, '..', 'notifications.js'), 'utf8');

async function attiva(errors) {
  const listeners = {};
  let registers = 0;
  const push = {
    addListener: (name, fn) => { listeners[name] = fn; },
    checkPermissions: async () => ({ receive: 'granted' }),
    register: async () => {
      const error = errors[registers++];
      setTimeout(() => (error ? listeners.registrationError({ error }) : listeners.registration({ value: 'fcm:' + 'a'.repeat(140) })), 0);
    },
    removeAllDeliveredNotifications: async () => {}
  };
  const support = {
    getStatus: async () => ({ platform: 'android', configured: true, environment: 'production', bindingEpoch: '00000000-0000-4000-8000-000000000001', notificationsEnabled: true }),
    setBadge: async () => {}, bindPushOwner: async () => ({ bound: true }), clearPushOwner: async () => ({ cleared: true }), stopPushTransport: async () => ({ stopped: true })
  };
  const sb = { auth: { getSession: async () => ({ data: { session: { user: { id: 'A' } } } }) }, rpc: async () => ({ error: null, data: { registered: true } }) };
  const window = { sb, UsPlatform: { isNative: true, isPluginAvailable: () => true, getNativePlugin: (n) => (n === 'PushNotifications' ? push : support) } };
  const store = new Map();
  vm.runInNewContext(source, {
    window, sb, crypto, console, setTimeout, clearTimeout, URL, globalThis: window,
    document: { hidden: false, addEventListener() {} },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
  });
  const api = window.UsNotifications;
  await api.authReady({ id: 'A' }).catch(() => {});
  const result = JSON.parse(JSON.stringify(await api.enable()));
  return { result, registers };
}

const JAVA = (code) => `java.util.concurrent.ExecutionException: java.io.IOException: ${code}`;

test('a refused Google token shows FCM\'s own reason, not the start of the Java message', async () => {
  const { result } = await attiva([JAVA('FIS_AUTH_ERROR')]);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'T-FIS_AUTH_ERROR');
});

test('a transient FCM failure gets its second try and can succeed', async () => {
  const { result, registers } = await attiva([JAVA('SERVICE_NOT_AVAILABLE')]);
  assert.equal(registers, 2, 'SERVICE_NOT_AVAILABLE is retried');
  assert.equal(result.ok, true);
  const twice = await attiva([JAVA('SERVICE_NOT_AVAILABLE'), JAVA('SERVICE_NOT_AVAILABLE')]);
  assert.deepEqual([twice.result.kind, twice.result.code], ['network', 'T-SERVICE_NOT_AVAILABLE']);
});
