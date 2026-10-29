// Aggiornamento dell'app (founder, 29/10/2026): the installed app updates
// itself through Google Play's in-app updates, and the server's minimum
// version (get_app_min_version) can require it. app-update.js decides; the
// plugin is @capawesome/capacitor-app-update («AppUpdate»), native only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const U = require('../app-update.js');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const info = (over = {}) => ({ currentVersionCode: '429593', availableVersionCode: '431000', updateAvailability: 2,
  updatePriority: 0, immediateUpdateAllowed: true, flexibleUpdateAllowed: true, installStatus: 0, ...over });

test('the plan: nothing new means nothing to do', () => {
  assert.deepEqual(U.updatePlan({ info: info({ updateAvailability: 1 }), minVersionCode: 0 }), { kind: 'none' });
  assert.deepEqual(U.updatePlan({ info: null, minVersionCode: 0 }), { kind: 'none' });
});

test('the plan: an ordinary update downloads in the background (flexible)', () => {
  assert.deepEqual(U.updatePlan({ info: info(), minVersionCode: 0 }), { kind: 'flexible' });
  assert.deepEqual(U.updatePlan({ info: info({ installStatus: 11 }), minVersionCode: 0 }), { kind: 'ready' }, 'already downloaded: restart');
});

test('the plan: an urgent update (Play priority 4–5) takes the screen, but can be put off', () => {
  assert.deepEqual(U.updatePlan({ info: info({ updatePriority: 4 }), minVersionCode: 0 }), { kind: 'immediate', required: false });
  assert.deepEqual(U.updatePlan({ info: info({ updatePriority: 5, immediateUpdateAllowed: false }), minVersionCode: 0 }), { kind: 'flexible' });
});

test('the plan: below the server minimum the update is required', () => {
  assert.deepEqual(U.updatePlan({ info: info(), minVersionCode: 430000 }), { kind: 'immediate', required: true });
  assert.deepEqual(U.updatePlan({ info: info({ updateAvailability: 1 }), minVersionCode: 430000 }), { kind: 'store', required: true },
    'Play has nothing for this phone yet: the store page');
  assert.deepEqual(U.updatePlan({ info: info({ immediateUpdateAllowed: false }), minVersionCode: 430000 }), { kind: 'store', required: true });
  assert.deepEqual(U.updatePlan({ info: info({ updateAvailability: 1 }), minVersionCode: 429593 }), { kind: 'none' }, 'equal is fine');
});

function harness({ appInfo = info(), min = 0, immediate = { code: 0 }, flexible = { code: 0 } } = {}) {
  const calls = [];
  let stateListener = null;
  const plugin = {
    getAppUpdateInfo: async () => { calls.push('info'); return appInfo; },
    performImmediateUpdate: async () => { calls.push('immediate'); return immediate; },
    startFlexibleUpdate: async () => { calls.push('flexible'); return flexible; },
    completeFlexibleUpdate: async () => { calls.push('complete'); },
    openAppStore: async () => { calls.push('store'); },
    addListener: async (name, fn) => { calls.push(`listen:${name}`); stateListener = fn; return { remove() {} }; },
  };
  const ui = { blocked: [], ready: 0, block(opts) { this.blocked.push(opts); }, unblock() { this.blocked.push('off'); }, readyToRestart(go) { this.ready += 1; this.restart = go; } };
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  let clock = 1_000_000;
  const updater = U.createAppUpdater({ plugin, platformName: 'android', readMin: async (p) => { calls.push(`min:${p}`); return min; }, ui, storage, now: () => clock });
  return { updater, calls, ui, fire: (s) => stateListener?.(s), tick: (ms) => { clock += ms; } };
}

test('flexible: Play downloads, then «Riavvia» installs it; once a day per version', async () => {
  const h = harness();
  await h.updater.check();
  assert.deepEqual(h.calls, ['info', 'min:android', 'listen:onFlexibleUpdateStateChange', 'flexible']);
  h.fire({ installStatus: 11 });
  assert.equal(h.ui.ready, 1);
  await h.ui.restart();
  assert.ok(h.calls.includes('complete'));
  h.tick(60_000); await h.updater.check();
  assert.equal(h.calls.filter((c) => c === 'flexible').length, 1, 'not asked again the same day');
  h.tick(6 * 3600_000 + 1); await h.updater.check();
  assert.equal(h.calls.filter((c) => c === 'flexible').length, 1, 'still the same version: not the same day');
  h.tick(24 * 3600_000); await h.updater.check();
  assert.equal(h.calls.filter((c) => c === 'flexible').length, 2);
});

test('required: Play\'s full-screen update; if put off, US stays closed behind «Aggiorna US»', async () => {
  const h = harness({ min: 430000, immediate: { code: 1 } });
  await h.updater.check();
  assert.deepEqual(h.calls.slice(0, 3), ['info', 'min:android', 'immediate']);
  assert.equal(h.ui.blocked.length, 1);
  await h.ui.blocked[0].onUpdate();
  assert.equal(h.calls.filter((c) => c === 'immediate').length, 2, '«Aggiorna» tries Play again');
});

test('required and Play has nothing yet: the store page, behind the gate', async () => {
  const h = harness({ min: 430000, appInfo: info({ updateAvailability: 1 }) });
  await h.updater.check();
  assert.equal(h.ui.blocked.length, 1);
  await h.ui.blocked[0].onUpdate();
  assert.ok(h.calls.includes('store'));
});

test('urgent but not required: put off, US goes on', async () => {
  const h = harness({ appInfo: info({ updatePriority: 5 }), immediate: { code: 1 } });
  await h.updater.check();
  assert.ok(h.calls.includes('immediate'));
  assert.equal(h.ui.blocked.length, 0);
});

test('offline or no answer: nothing happens, nothing blocks', async () => {
  const U2 = U.createAppUpdater({ plugin: { getAppUpdateInfo: async () => { throw new Error('offline'); } }, platformName: 'android',
    readMin: async () => { throw new Error('offline'); }, ui: { block() { throw new Error('no'); } }, storage: null, now: () => 1 });
  assert.deepEqual(await U2.check(), { kind: 'none' });
  const h = harness({ min: null });
  assert.equal((await h.updater.check()).kind, 'flexible', 'an unreadable minimum counts as 0');
  let calls = 0;
  const retry = U.createAppUpdater({ plugin: { getAppUpdateInfo: async () => info({ updateAvailability: 1 }) }, platformName: 'android',
    readMin: async () => { calls += 1; throw new Error('signed out'); }, ui: {}, storage: null, now: () => 5 });
  await retry.check(); await retry.check();
  assert.equal(calls, 2, 'a minimum it could not read is asked again at the next return, not in 6 hours');
});

test('wired once: native only, after the app starts and when it comes back', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('/app-update.js?v=') > html.indexOf('/platform.js?v=') && html.indexOf('/app-update.js?v=') < html.indexOf('<script defer src="/app.js?v='));
  const app = read('app.js');
  assert.match(app, /window\.UsAppUpdate\?\.start\?\.\(\{readMin:platform=>sb\.rpc\('get_app_min_version',\{p_platform:platform\}\)\.then\(\(\{data,error\}\)=>\{if\(error\)throw error;return data;\}\)\}\);/);
  const src = read('app-update.js');
  assert.match(src, /getNativePlugin\?\.\('AppUpdate'\)/);
  assert.doesNotMatch(src, /getPlatform\(\)\s*===?\s*['"](ios|android)['"]/);
  for (const list of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.match(read(list), /'app-update\.js',/, list);
  assert.match(read('service-worker.js'), /versioned\("\/app-update\.js"\)/);
  assert.equal(JSON.parse(read('package.json')).dependencies['@capawesome/capacitor-app-update'], '8.1.0');
  assert.match(read('android/capacitor.settings.gradle'), /include ':capawesome-capacitor-app-update'/);
});
