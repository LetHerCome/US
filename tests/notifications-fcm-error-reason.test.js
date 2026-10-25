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

async function phone(errors, { rpcError = null } = {}) {
  const listeners = {};
  const events = [];
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
  const sb = { auth: { getSession: async () => ({ data: { session: { user: { id: 'A' } } } }) }, rpc: async () => ({ error: rpcError, data: rpcError ? null : { registered: true } }) };
  const window = { sb, dispatchEvent: (event) => events.push(event.type), addEventListener() {}, UsPlatform: { isNative: true, isPluginAvailable: () => true, getNativePlugin: (n) => (n === 'PushNotifications' ? push : support) } };
  const store = new Map();
  vm.runInNewContext(source, {
    window, sb, crypto, console, CustomEvent: class { constructor(type) { this.type = type; } }, setTimeout, clearTimeout, URL, globalThis: window,
    document: { hidden: false, addEventListener() {} },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
  });
  const api = window.UsNotifications;
  await api.authReady({ id: 'A' }).catch(() => {});
  return { api, store, events, registers: () => registers };
}

async function attiva(errors) {
  const p = await phone(errors);
  const result = JSON.parse(JSON.stringify(await p.api.enable()));
  return { result, registers: p.registers() };
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

// 25/10/2026: on 5G Google refuses the token, on Wi-Fi it works. A first «Attiva»
// on 5G must not leave the person waiting for Wi-Fi and a second tap.
test('«Attiva» on a network where Google refuses the token: US remembers it and finishes by itself', async () => {
  const refused = JAVA('SERVICE_NOT_AVAILABLE');
  const p = await phone([refused, refused]);
  const first = JSON.parse(JSON.stringify(await p.api.enable()));
  assert.deepEqual([first.ok, first.kind, first.pending], [false, 'network', true]);
  const waiting = await p.api.getState();
  assert.deepEqual([waiting.kind, waiting.pending], ['inactive', true], 'the card says US is finishing');
  await p.api.resume(); // reopened, or back on a network that answers
  assert.equal((await p.api.getState()).kind, 'active');
  assert.equal(p.store.get('us:notifications:v1:wanted:A'), undefined, 'the wish is done');
  assert.deepEqual(p.events, ['us-notifications-changed'], 'app.js refreshes the card');
});

test('a wish that is not finished keeps waiting; turning notifications off drops it', async () => {
  const refused = JAVA('SERVICE_NOT_AVAILABLE');
  const p = await phone([refused, refused, refused, refused]);
  await p.api.enable();
  await p.api.resume();
  assert.equal((await p.api.getState()).pending, true, 'still refused: still waiting, no error shown');
  assert.deepEqual(p.events, []);
  await p.api.disable();
  assert.equal(p.store.get('us:notifications:v1:wanted:A'), undefined);
});

test('a server refusal (not the network) stays an error and never becomes a silent wish', async () => {
  const p = await phone([], { rpcError: { code: '42501', message: 'permission denied' } });
  const result = JSON.parse(JSON.stringify(await p.api.enable()));
  assert.deepEqual([result.ok, result.kind, result.pending], [false, 'error', false]);
  assert.equal(p.store.get('us:notifications:v1:wanted:A'), undefined);
});

test('app.js and onboarding say US finishes by itself, and refresh the card when it does', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.ok(app.includes("result.kind==='network'&&result.pending)toast(`La rete non risponde: le attivo da solo appena può"));
  assert.ok(app.includes("state.pending?'Le attivo da solo appena la rete risponde. Con il Wi-Fi è subito.'"));
  assert.ok(app.includes("window.addEventListener('us-notifications-changed',()=>{refreshWebPushUi().catch(()=>{});toast('Notifiche attive ♡');});"));
  const onboarding = fs.readFileSync(path.join(__dirname, '..', 'onboarding.js'), 'utf8');
  assert.ok(onboarding.includes("result?.kind==='network'&&result?.pending?'La rete non risponde: le attivo da solo appena può'"));
});
