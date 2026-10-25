// Bug 25/10/2026: «mi chiede sempre di riattivare le notifiche anche se già
// attive». At launch a failed read of the profile or the couple (a slow
// network, the server restarting) came back as ERROR_OR_INELIGIBLE, and
// app.js treated it like "not in a couple": UsNotifications.signedOut()
// retired this phone's registration and its «abilitate» mark, so the next
// good launch showed «Attiva le notifiche» again. A failed read is now
// marked transient and the phone keeps its notifications and widgets.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto').webcrypto;

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const Onboarding = require('../onboarding.js');

test('a failed read at launch is transient; an account that may not enter is not', async () => {
  const session = { user: { id: 'u1' } };
  const failing = Onboarding.createController({ readProfile: async () => ({ error: new Error('fetch failed') }), rpc: async () => ({ data: {} }) });
  const down = await failing.load(session);
  assert.equal(down.kind, 'ERROR_OR_INELIGIBLE');
  assert.equal(down.transient, true, 'a network or server failure says nothing about the couple');
  const throwing = Onboarding.createController({ readProfile: async () => { throw new Error('offline'); }, rpc: async () => ({ data: {} }) });
  assert.equal((await throwing.load(session)).transient, true);
  // A real answer that does not let this account in stays a hard state.
  const ineligible = Onboarding.createController({ readProfile: async () => ({ data: null }), rpc: async () => ({ data: { member: true, couple_id: 'c1', partner_joined: true, invite: { status: 'used' } } }) });
  const hard = await ineligible.load(session);
  assert.equal(hard.kind, 'ERROR_OR_INELIGIBLE');
  assert.notEqual(hard.transient, true);
});

test('app.js: a transient failure keeps this phone\'s notifications and widgets', () => {
  const app = read('app.js');
  const branch = app.slice(app.indexOf("    if(result.kind!=='PAIRED'){"), app.indexOf('    const profile=result.profile;'));
  assert.match(branch, /if\(!result\.transient\)\{\n\s+window\.UsNotifications\?\.signedOut\?\.\(\);\n\s+window\.UsWidgets\?\.clear\?\.\(\)\.catch\(\(\)=>\{\}\);\n\s+\}/);
});

// The circuit of the diagnosis: a phone with notifications already on.
async function phone({ flakyBoot }) {
  const store = new Map([
    ['us:notifications:v1:enabled:A', '1'], ['us:notifications:v1:owner', 'A'],
    ['us:notifications:v1:installation', '11111111-1111-4111-8111-111111111111'], ['us:notifications:v1:token', 'fcm:tok']
  ]);
  const push = { addListener() {}, checkPermissions: async () => ({ receive: 'granted' }), register: async () => {}, removeAllDeliveredNotifications: async () => {} };
  const support = {
    getStatus: async () => ({ platform: 'android', configured: true, environment: 'production', bindingEpoch: '00000000-0000-4000-8000-000000000001', notificationsEnabled: true, partnerBlocked: false, remindersBlocked: false }),
    setBadge: async () => {}, bindPushOwner: async () => ({ bound: true }), clearPushOwner: async () => ({ cleared: true }), stopPushTransport: async () => ({ stopped: true })
  };
  const sb = { auth: { getSession: async () => ({ data: { session: { user: { id: 'A' } } } }) }, rpc: async () => ({ error: null, data: {} }) };
  const window = { sb, UsPlatform: { isNative: true, isPluginAvailable: () => true, getNativePlugin: (n) => (n === 'PushNotifications' ? push : support) } };
  vm.runInNewContext(read('notifications.js'), {
    window, sb, crypto, console, setTimeout, clearTimeout, URL, globalThis: window,
    document: { hidden: false, addEventListener() {} },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) }
  });
  const api = window.UsNotifications;
  api.authReady({ id: 'A' }).catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
  if (flakyBoot === 'old') api.signedOut(); // what app.js did on every non-PAIRED result
  api.authReady({ id: 'A' }).catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
  return (await api.getState()).kind;
}

test('the scenario: a launch whose read fails, then a good one, keeps notifications active', async () => {
  assert.equal(await phone({ flakyBoot: 'old' }), 'inactive', 'the bug: signedOut on a failed read loses the registration');
  assert.equal(await phone({ flakyBoot: 'new' }), 'active', 'the fix: the phone keeps it');
});
