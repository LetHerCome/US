// Native Notifications V1 — the real app in headless Chromium posing as the
// native shell (mocked UsAppLock, PushNotifications and UsPushSupport
// plugins). Proves the ordering rules: a notification tap never navigates
// before the session AND the app lock are open, permission is asked only from
// an explicit "Attiva", and logout removes only this installation.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadChromium, startServer, FAKE_SUPABASE } = require('./helpers/oggi-browser');
const { qaFixture } = require('./helpers/countdown-browser');

const OWNER = crypto.createHash('sha256').update('f1').digest('hex');
const TOKEN = `fcmQA:${'x'.repeat(80)}`;

function nativeShell({ lockEnabled, ownerHash, configured, permission, retainedAction, token }) {
  const lock = window.__LOCK = { enabled: lockEnabled, locked: lockEnabled, calls: [], release: null, listeners: {} };
  const lockStatus = () => ({
    platform: 'android',
    biometry: { available: true, kind: 'fingerprint', reason: 'ok' },
    protection: { enabled: lock.enabled, ownerHash: lock.enabled ? ownerHash : '', state: lock.enabled ? 'ok' : 'off' },
    locked: lock.enabled && lock.locked,
    graceMs: 60000
  });
  const appLock = {
    getStatus: async () => lockStatus(),
    unlock: () => { lock.calls.push('unlock'); return new Promise((resolve) => { lock.release = () => { lock.locked = false; resolve(lockStatus()); }; }); },
    reset: async () => { lock.enabled = false; return lockStatus(); },
    releaseCover: async () => {},
    enable: async () => lockStatus(),
    disable: async () => lockStatus(),
    addListener: async (name, fn) => { lock.listeners[name] = fn; return { remove() {} }; }
  };
  const push = window.__PUSH = { calls: [], listeners: {}, retained: {}, permission, configured, rpc: [], rpcError: null };
  if (retainedAction) push.retained.pushNotificationActionPerformed = retainedAction;
  push.emit = (name, data) => {
    if (push.listeners[name]) push.listeners[name](data);
    else push.retained[name] = data; // Capacitor retains until a listener exists
  };
  const pushPlugin = {
    addListener: async (name, fn) => {
      push.listeners[name] = fn;
      if (push.retained[name]) { const data = push.retained[name]; delete push.retained[name]; setTimeout(() => fn(data), 0); }
      return { remove() {} };
    },
    checkPermissions: async () => ({ receive: push.permission }),
    requestPermissions: async () => { push.calls.push('requestPermissions'); push.permission = 'granted'; return { receive: 'granted' }; },
    register: async () => { push.calls.push('register'); setTimeout(() => push.emit('registration', { value: push.token || token }), 10); },
    unregister: async () => { push.calls.push('unregister'); },
    removeAllDeliveredNotifications: async () => { push.calls.push('removeAll'); }
  };
  // S3 native owner gate (UsPushOwnerGate): SharedPreferences survive a
  // WebView/process restart, so the mock keeps them in a storage key that the
  // cold-start test carries over like the rest of the WebView storage.
  const GATE = '__qa_native_push_gate';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const gate = () => { try { return JSON.parse(localStorage.getItem(GATE)) || {}; } catch (_) { return {}; } };
  const saveGate = (value) => localStorage.setItem(GATE, JSON.stringify(value));
  const epoch = () => {
    const current = gate();
    if (UUID.test(current.epoch || '')) return current.epoch;
    const fresh = { epoch: crypto.randomUUID() };
    saveGate(fresh);
    return fresh.epoch;
  };
  push.gate = gate;
  const support = {
    getStatus: async () => ({ platform: 'android', provider: 'fcm', bindingEpoch: epoch(), configured: push.configured, environment: null, notificationsEnabled: true, partnerBlocked: false, remindersBlocked: false }),
    bindPushOwner: async ({ ownerId, installationId, expectedEpoch }) => {
      push.calls.push('bindPushOwner');
      const current = gate();
      if (!ownerId || !UUID.test(installationId || '') || expectedEpoch !== current.epoch) return { bound: false };
      saveGate({ ...current, owner: ownerId, installation: installationId.toLowerCase() });
      return { bound: true };
    },
    clearPushOwner: async () => {
      push.calls.push('clearPushOwner');
      saveGate({ epoch: crypto.randomUUID() });
      return { cleared: true };
    },
    stopPushTransport: async () => {
      push.calls.push('stopPushTransport');
      return { stopped: !gate().owner && !push.stopFails };
    },
    openSettings: async () => { push.calls.push('openSettings'); return { opened: true }; },
    setBadge: async () => ({ supported: false })
  };
  const plugins = { UsAppLock: appLock, PushNotifications: pushPlugin, UsPushSupport: support };
  window.UsCapacitorRuntime = {
    isNativePlatform: () => true,
    isPluginAvailable: (name) => name in plugins,
    getPlatform: () => 'android',
    registerPlugin: (name) => plugins[name] || {},
    app: { addListener: async () => ({ remove() {} }), getLaunchUrl: async () => null }
  };
  // Record the two RPCs on the fake Supabase client.
  const hook = () => {
    if (!window.__QA) return setTimeout(hook, 5);
    window.__QA.rpc = window.__QA.rpc || {};
    for (const name of ['register_native_push_device', 'unregister_native_push_device']) {
      window.__QA.rpc[name] = async (args) => {
        push.rpc.push({ name, args });
        return push.rpcError ? { data: null, error: { message: push.rpcError } } : { data: { ok: true }, error: null };
      };
    }
    window.__QA.rpc.send_web_push_test = undefined;
  };
  hook();
}

async function harness(t) {
  const chromium = loadChromium();
  if (!chromium) { t.skip('Playwright unavailable'); return null; }
  const server = await startServer();
  const browser = await chromium.launch();
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await browser.close(); await new Promise((resolve) => server.close(resolve)); });
  const nativeIndex = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace('<html lang="it">', '<html lang="it" class="us-app-lock-pending">');
  return {
    async page(options) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Rome', serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.origin === base && url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: nativeIndex });
        if (url.origin === base) return route.continue();
        if (/supabase-js/.test(url.href)) return route.fulfill({ contentType: 'text/javascript', body: FAKE_SUPABASE });
        if (/functions\/v1\//.test(url.href)) return route.fulfill({ contentType: 'application/json', body: '{"delivered":0}' });
        return route.abort();
      });
      await page.addInitScript(qaFixture, { style: 'editorial', mode: 'days', unlocked: true, missing: false, started: '2022-06-23', active: 'custom' });
      await page.addInitScript(nativeShell, { lockEnabled: false, configured: true, permission: 'prompt', retainedAction: null, token: TOKEN, ownerHash: OWNER, ...options });
      await page.goto(`${base}/`, { waitUntil: 'load' });
      return { page, ctx, errors };
    }
  };
}

const activePage = (page) => page.evaluate(() => document.querySelector('.page.active')?.id || '');
const tap = (target, extra = {}) => ({ actionId: 'tap', notification: { id: 'm1', data: { v: '1', type: 'quest_confirmed', target, ref: '', tag: 't', ...extra } } });

test('N2 browser: cold-start tap behind the biometric lock navigates only after unlock', async (t) => {
  const h = await harness(t);
  if (!h) return;
  const { page, ctx, errors } = await h.page({ lockEnabled: true, retainedAction: tap('bond') });
  await page.waitForFunction(() => window.__LOCK.calls.includes('unlock'));
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => window.usProfile ?? null), null, 'nothing private loaded');
  assert.notEqual(await activePage(page), 'bond', 'no navigation behind the lock');
  await page.evaluate(() => window.__LOCK.release());
  await page.waitForFunction(() => document.querySelector('.page.active')?.id === 'bond', null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('us-app-locked')), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('N2 browser: a tap that races the resume lock waits for the unlock (whenOpen re-reads native state)', async (t) => {
  const h = await harness(t);
  if (!h) return;
  const { page, ctx, errors } = await h.page({ lockEnabled: true });
  await page.waitForFunction(() => window.__LOCK.calls.includes('unlock'));
  await page.evaluate(() => window.__LOCK.release());
  await page.waitForFunction(() => window.usProfile && !document.documentElement.classList.contains('us-app-locked'));
  await page.waitForTimeout(300);
  // Native onStart set "locked"; its lockRequired event has not reached the web layer yet.
  await page.evaluate((action) => { window.__LOCK.locked = true; window.__PUSH.emit('pushNotificationActionPerformed', action); }, tap('bond'));
  await page.waitForFunction(() => document.documentElement.classList.contains('us-app-locked'), null, { timeout: 5000 });
  // The late native event must not stack a second lock / prompt.
  await page.evaluate(() => window.__LOCK.listeners.lockRequired?.({ reason: 'background' }));
  await page.waitForTimeout(500);
  assert.notEqual(await activePage(page), 'bond');
  assert.equal(await page.evaluate(() => window.__LOCK.calls.filter((c) => c === 'unlock').length), 2, 'one resume prompt');
  await page.evaluate(() => window.__LOCK.release());
  await page.waitForFunction(() => document.querySelector('.page.active')?.id === 'bond', null, { timeout: 5000 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('N2 browser: malformed or non-allow-listed payloads never navigate; valid ones do', async (t) => {
  const h = await harness(t);
  if (!h) return;
  const { page, ctx, errors } = await h.page({});
  await page.waitForFunction(() => window.usProfile);
  await page.waitForTimeout(300);
  const before = await activePage(page);
  for (const bad of [tap('https://evil.example'), tap('settings'), { actionId: 'tap', notification: { data: { target: 'bond' } } }, { actionId: 'dismiss', notification: { data: { v: '1', target: 'bond' } } }]) {
    await page.evaluate((action) => window.__PUSH.emit('pushNotificationActionPerformed', action), bad);
  }
  await page.waitForTimeout(500);
  assert.equal(await activePage(page), before);
  await page.evaluate((action) => window.__PUSH.emit('pushNotificationActionPerformed', action), tap('bond'));
  await page.waitForFunction(() => document.querySelector('.page.active')?.id === 'bond', null, { timeout: 5000 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('N2 browser: permission only after "Attiva"; registration per installation; logout removes only this installation', async (t) => {
  const h = await harness(t);
  if (!h) return;
  const { page, ctx, errors } = await h.page({});
  await page.waitForFunction(() => window.usProfile);
  await page.waitForTimeout(1600);
  assert.deepEqual(await page.evaluate(() => window.__PUSH.calls), [], 'nothing asked or registered at boot');
  assert.equal(await page.evaluate(() => document.getElementById('pushOptInCard')?.hidden), false, 'the Oggi card invites');
  assert.equal(await page.evaluate(() => document.getElementById('pushEnableBtn')?.textContent), 'Attiva');

  const result = await page.evaluate(() => window.enableWebPush());
  assert.equal(result.ok, true);
  const first = await page.evaluate(() => ({ calls: window.__PUSH.calls, rpc: window.__PUSH.rpc, installation: localStorage.getItem('us:notifications:v1:installation') }));
  assert.deepEqual(first.calls, ['requestPermissions', 'register', 'bindPushOwner'], 'the native gate is bound only after the server accepted the row');
  assert.equal(await page.evaluate(() => window.__PUSH.gate().installation), first.installation);
  assert.equal(first.rpc.length, 1);
  assert.deepEqual(first.rpc[0], { name: 'register_native_push_device', args: {
    target_installation_id: first.installation, target_platform: 'android', target_provider: 'fcm',
    target_token: TOKEN, target_environment: null, target_retired_installation_id: null
  } });
  assert.match(first.installation, /^[0-9a-f-]{36}$/);
  assert.equal(await page.evaluate(async () => (await window.UsNotifications.getState()).kind), 'active');
  await page.waitForFunction(() => document.getElementById('pushOptInCard')?.hidden === true);

  // Logout while offline: the server row cannot be removed now → retired, retried later.
  await page.evaluate(() => { window.__PUSH.rpcError = 'offline'; });
  await page.evaluate(() => window.revokeCurrentDevice());
  const after = await page.evaluate(() => ({ calls: window.__PUSH.calls, rpc: window.__PUSH.rpc.at(-1), installation: localStorage.getItem('us:notifications:v1:installation'), retired: localStorage.getItem('us:notifications:v1:retired') }));
  assert.deepEqual(after.rpc, { name: 'unregister_native_push_device', args: { target_installation_id: first.installation } });
  assert.ok(after.calls.includes('clearPushOwner'), 'native owner gate retired');
  assert.ok(after.calls.indexOf('clearPushOwner') < after.calls.indexOf('stopPushTransport'), 'gate retired before the FCM token is deleted');
  assert.ok(!after.calls.includes('unregister'), 'Android never uses the early-resolving Capacitor unregister()');
  assert.equal(await page.evaluate(() => window.__PUSH.gate().owner ?? null), null, 'no owner left on this phone');
  assert.ok(after.calls.includes('removeAll'));
  assert.equal(after.installation, null, 'a new identity for the next account');
  assert.deepEqual(JSON.parse(after.retired), [{id:first.installation,userId:'f1',token:TOKEN,transportStopped:true}], 'FCM confirmed the old token deleted');

  // Next activation (back online): new installation, the retired one is removed with it.
  await page.evaluate(() => { window.__PUSH.rpcError = null; });
  await page.evaluate(() => window.UsNotifications.authReady(window.usProfile));
  await page.evaluate(() => window.UsNotifications.enable());
  const next = await page.evaluate(() => ({ rpc: window.__PUSH.rpc.at(-1), retired: localStorage.getItem('us:notifications:v1:retired') }));
  assert.equal(next.rpc.name, 'register_native_push_device');
  assert.notEqual(next.rpc.args.target_installation_id, first.installation);
  assert.equal(next.rpc.args.target_retired_installation_id, null, 'owner cleanup precedes fresh registration');
  assert.equal(next.retired, null);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('N3 browser: foreground resume clears seen notifications, revalidates the installation and accepts token rotation', async (t) => {
  const h = await harness(t);
  if (!h) return;
  const { page, ctx, errors } = await h.page({ permission: 'granted' });
  await page.waitForFunction(() => window.usProfile);
  await page.waitForTimeout(400);

  const enabled = await page.evaluate(() => window.UsNotifications.enable());
  assert.equal(enabled.ok, true);
  const first = await page.evaluate(() => ({
    installation: localStorage.getItem('us:notifications:v1:installation'),
    rpcCount: window.__PUSH.rpc.filter((entry) => entry.name === 'register_native_push_device').length
  }));
  assert.equal(first.rpcCount, 1);

  // Same process foreground recovery is cheap: clear seen OS notifications,
  // ask FCM for the current token, but do not rewrite the same server row.
  await page.evaluate(() => { window.__PUSH.calls.length = 0; window.__PUSH.rpc.length = 0; });
  await page.evaluate(() => window.UsNotifications.resume());
  const resumed = await page.evaluate(() => ({ calls: window.__PUSH.calls, rpc: window.__PUSH.rpc }));
  assert.deepEqual(resumed.calls, ['removeAll', 'register', 'bindPushOwner'], 'one owner re-bind, no duplicate from the registration event');
  assert.equal(resumed.rpc.length, 0);

  // Provider rotation is authoritative even without an app restart.
  const rotated = `fcmQA:${'y'.repeat(80)}`;
  await page.evaluate((value) => window.__PUSH.emit('registration', { value }), rotated);
  await page.waitForFunction(() => window.__PUSH.rpc.some((entry) => entry.name === 'register_native_push_device'));
  const rotation = await page.evaluate(() => window.__PUSH.rpc.at(-1));
  assert.equal(rotation.args.target_installation_id, first.installation);
  assert.equal(rotation.args.target_token, rotated);

  // A cold WebView process confirms the server row once even when the local
  // daily signature is still valid (repairs remote pruning).
  // A real app restart keeps the WebView localStorage and the native
  // SharedPreferences. The QA fixture wipes storage on every navigation, so
  // carry this installation's state over explicitly; without this the
  // "cold start" was a fresh install with notifications never enabled and
  // the re-registration below could not happen (audit H-03).
  const persisted = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage)
    .filter((key) => key.startsWith('us:notifications:') || key === '__qa_native_push_gate')
    .map((key) => [key, localStorage.getItem(key)])));
  assert.equal(persisted['us:notifications:v1:installation'], first.installation);
  assert.equal(persisted['us:notifications:v1:enabled:f1'], '1');
  await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, persisted);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.usProfile);
  assert.equal(await page.evaluate(() => localStorage.getItem('us:notifications:v1:installation')), first.installation, 'storage survived the restart');
  await page.waitForFunction(() => window.__PUSH.rpc.some((entry) => entry.name === 'register_native_push_device'), null, { timeout: 5000 });
  await page.waitForFunction(() => window.__PUSH.calls.includes('bindPushOwner'), null, { timeout: 5000 });
  const cold = await page.evaluate(() => ({ calls: window.__PUSH.calls, rpc: window.__PUSH.rpc.at(-1), gate: window.__PUSH.gate() }));
  assert.ok(cold.calls.includes('removeAll'));
  assert.ok(cold.calls.includes('register'));
  assert.equal(cold.rpc.args.target_installation_id, first.installation);
  assert.equal(cold.gate.installation, first.installation, 'native gate still bound to this installation after the restart');
  assert.equal(cold.gate.owner, 'f1');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('S3 browser: after A logs out offline, B on the same phone gets its own installation only once A\'s FCM token is gone', async (t) => {
  const h = await harness(t);
  if (!h) return;
  const { page, ctx, errors } = await h.page({});
  await page.waitForFunction(() => window.usProfile);
  await page.waitForTimeout(600);
  assert.equal((await page.evaluate(() => window.enableWebPush())).ok, true);
  const a = await page.evaluate(() => localStorage.getItem('us:notifications:v1:installation'));

  // Offline logout AND the provider cannot delete the token: B must stay blocked.
  await page.evaluate(() => { window.__PUSH.rpcError = 'offline'; window.__PUSH.stopFails = true; });
  await page.evaluate(() => window.revokeCurrentDevice());
  assert.equal(await page.evaluate(() => window.__PUSH.gate().owner ?? null), null, 'A no longer owns the native gate');
  await page.evaluate(() => { window.__PUSH.rpcError = null; });
  await page.evaluate(() => window.UsNotifications.authReady({ id: 'f2' }));
  assert.deepEqual(await page.evaluate(async () => ({ ...(await window.UsNotifications.enable()) })), { ok: false, kind: 'error' }, 'fail closed while A\'s token may still be live');
  assert.equal(await page.evaluate(() => window.__PUSH.rpc.filter((entry) => entry.name === 'register_native_push_device').length), 1, 'no registration for B yet');

  // The provider now confirms deleteToken(): A's row can no longer deliver.
  await page.evaluate(() => { window.__PUSH.stopFails = false; window.__PUSH.token = `fcmQA:${'b'.repeat(80)}`; });
  const enabled = await page.evaluate(async () => ({ ...(await window.UsNotifications.enable()) }));
  assert.deepEqual(enabled, { ok: true, kind: 'active' });
  const b = await page.evaluate(() => ({ rpc: window.__PUSH.rpc.at(-1), gate: window.__PUSH.gate(), retired: JSON.parse(localStorage.getItem('us:notifications:v1:retired')) }));
  assert.equal(b.rpc.name, 'register_native_push_device');
  assert.notEqual(b.rpc.args.target_installation_id, a, 'B never reuses A\'s installation');
  assert.notEqual(b.rpc.args.target_token, TOKEN, 'B never registers A\'s token');
  assert.deepEqual({ owner: b.gate.owner, installation: b.gate.installation }, { owner: 'f2', installation: b.rpc.args.target_installation_id });
  assert.deepEqual(b.retired.map((entry) => entry.id), [a], 'A\'s row stays queued for A\'s own cleanup, never B\'s');
  assert.equal(b.retired[0].userId, 'f1');
  assert.equal(await page.evaluate(() => window.__PUSH.rpc.filter((entry) => entry.name === 'unregister_native_push_device' && entry.args.target_installation_id !== null).length), 1, 'B never unregisters A\'s row');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('N2 browser: without a Firebase configuration nothing native is touched and Settings says so', async (t) => {
  const h = await harness(t);
  if (!h) return;
  const { page, ctx, errors } = await h.page({ configured: false });
  await page.waitForFunction(() => window.usProfile);
  await page.waitForTimeout(1600);
  assert.equal(await page.evaluate(() => document.getElementById('pushOptInCard')?.hidden), true, 'no invitation that cannot work');
  assert.equal(await page.evaluate(async () => (await window.UsNotifications.getState()).kind), 'unavailable');
  assert.deepEqual(await page.evaluate(async () => ({ ...(await window.UsNotifications.enable()) })), { ok: false, kind: 'unavailable' });
  await page.evaluate(() => window.revokeCurrentDevice());
  const unconfigured = await page.evaluate(() => window.__PUSH.calls);
  assert.deepEqual(unconfigured.filter((call) => !['clearPushOwner', 'removeAll'].includes(call)), [], 'never register/unregister (FirebaseMessaging) without configuration');
  assert.ok(unconfigured.includes('removeAll'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('N2 browser: the PWA keeps Web Push and never loads native notification code paths', async (t) => {
  const chromium = loadChromium();
  if (!chromium) { t.skip('Playwright unavailable'); return; }
  const server = await startServer();
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await new Promise((resolve) => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    if (/supabase-js/.test(url.href)) return route.fulfill({ contentType: 'text/javascript', body: FAKE_SUPABASE });
    return route.abort();
  });
  await page.addInitScript(qaFixture, { style: 'editorial', mode: 'days', unlocked: true, missing: false, started: '2022-06-23', active: 'custom' });
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.usProfile);
  assert.equal(await page.evaluate(() => window.UsNotifications.supported()), false);
  assert.equal(await page.evaluate(() => typeof window.enableWebPush), 'function');
  await ctx.close();
});
