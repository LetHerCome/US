// Native Security V1 — the real app in headless Chromium, posing as the native
// shell (html.us-app-lock-pending + a mocked UsAppLock plugin). Proves that no
// private surface is ever visible before the biometric unlock.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadChromium, startServer, FAKE_SUPABASE } = require('./helpers/oggi-browser');
const { qaFixture } = require('./helpers/countdown-browser');

const OWNER = crypto.createHash('sha256').update('f1').digest('hex');

// In-page native runtime: just enough Capacitor for platform.js + app-lock.js.
function nativeShell({ enabled, ownerHash }) {
  const listeners = {};
  const lock = window.__LOCK = { enabled, locked: enabled, calls: [], frames: [], release: null };
  const status = () => ({
    platform: 'android',
    biometry: { available: true, kind: 'fingerprint', reason: 'ok' },
    protection: { enabled: lock.enabled, ownerHash: lock.enabled ? ownerHash : '', state: lock.enabled ? 'ok' : 'off' },
    locked: lock.enabled && lock.locked,
    graceMs: 60000
  });
  const plugin = {
    getStatus: async () => { lock.calls.push('getStatus'); return status(); },
    unlock: () => {
      lock.calls.push('unlock');
      return new Promise((resolve) => { lock.release = () => { lock.locked = false; resolve(status()); }; });
    },
    reset: async () => { lock.calls.push('reset'); lock.enabled = false; return status(); },
    releaseCover: async () => { lock.calls.push('releaseCover'); },
    enable: async () => status(),
    disable: async () => status(),
    addListener: async (name, fn) => { listeners[name] = fn; return { remove() {} }; }
  };
  lock.fire = (name) => { lock.locked = true; listeners[name]?.({ reason: 'background' }); };
  window.UsCapacitorRuntime = {
    isNativePlatform: () => true,
    isPluginAvailable: (name) => name === 'UsAppLock',
    getPlatform: () => 'android',
    registerPlugin: (name) => (name === 'UsAppLock' ? plugin : {}),
    app: { addListener: async () => ({ remove() {} }), getLaunchUrl: async () => null }
  };
  // Every frame until unlock: is any private surface visible?
  const sample = () => {
    const app = document.querySelector('.app');
    if (app && document.body) {
      const visible = getComputedStyle(app).visibility !== 'hidden';
      lock.frames.push({ visible, unlocked: !lock.locked || !lock.enabled });
    }
    if (lock.frames.length < 4000) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}

async function harness(t) {
  const chromium = loadChromium();
  if (!chromium) { t.skip('Playwright unavailable'); return null; }
  const server = await startServer();
  const browser = await chromium.launch();
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await browser.close(); await new Promise((resolve) => server.close(resolve)); });
  // Same transform scripts/build-capacitor-web.mjs applies to the native bundle.
  const nativeIndex = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace('<html lang="it">', '<html lang="it" class="us-app-lock-pending">');
  return {
    async page({ enabled, width = 390, height = 844 }) {
      const ctx = await browser.newContext({ viewport: { width, height }, isMobile: width < 800, hasTouch: true, timezoneId: 'Europe/Rome', serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.origin === base && url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: nativeIndex });
        if (url.origin === base) return route.continue();
        if (/supabase-js/.test(url.href)) return route.fulfill({ contentType: 'text/javascript', body: FAKE_SUPABASE });
        return route.abort();
      });
      await page.addInitScript(qaFixture, { style: 'editorial', mode: 'days', unlocked: true, missing: false, started: '2022-06-23', active: 'custom' });
      await page.addInitScript(nativeShell, { enabled, ownerHash: OWNER });
      await page.goto(`${base}/`, { waitUntil: 'load' });
      return { page, ctx, errors };
    }
  };
}

const visibleAt = (page, selector) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  const style = getComputedStyle(el);
  const box = el.getBoundingClientRect();
  return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0;
}, selector);

test('N1 browser: protezione attiva → nessun frame con contenuto privato prima dello sblocco', async (t) => {
  const h = await harness(t);
  if (!h) return;
  const { page, ctx, errors } = await h.page({ enabled: true });
  await page.waitForFunction(() => window.__LOCK.calls.includes('unlock'));
  await page.waitForTimeout(900);

  const locked = await page.evaluate(() => ({
    html: [...document.documentElement.classList],
    profile: window.usProfile ?? null,
    hit: document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('#usAppLock') !== null,
    mode: document.getElementById('usAppLock').dataset.mode,
    button: document.getElementById('usAppLockPrimary').textContent,
    appInert: document.querySelector('.app').hasAttribute('inert'),
    authInert: document.getElementById('authOverlay').hasAttribute('inert')
  }));
  assert.ok(locked.html.includes('us-app-locked'));
  assert.equal(locked.profile, null, 'initCloud non ha ancora caricato profilo né dati');
  assert.equal(locked.hit, true, 'ogni tocco finisce sul lock');
  assert.equal(locked.mode, 'locked');
  assert.equal(locked.button, 'Sblocca con l’impronta');
  assert.equal(locked.appInert, true);
  assert.equal(locked.authInert, true);
  for (const selector of ['.app', '#homeHero', '#authOverlay', '#thinkButton']) {
    assert.equal(await visibleAt(page, selector), false, `${selector} non deve essere visibile`);
  }
  assert.equal(await visibleAt(page, '#usAppLockPrimary'), true);

  await page.evaluate(() => window.__LOCK.release());
  await page.waitForFunction(() => window.usProfile && !document.documentElement.classList.contains('us-app-locked'));
  await page.waitForTimeout(400);
  assert.equal(await visibleAt(page, '.app'), true);
  assert.equal(await visibleAt(page, '#usAppLock'), false);
  const frames = await page.evaluate(() => window.__LOCK.frames);
  assert.ok(frames.length > 10, 'frame campionati');
  assert.deepEqual(frames.filter((frame) => frame.visible && !frame.unlocked), [], 'mai un frame privato prima dello sblocco');
  assert.equal(await page.evaluate(() => document.querySelector('.app').hasAttribute('inert')), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('N1 browser: protezione spenta → US si apre come prima, senza prompt', async (t) => {
  const h = await harness(t);
  if (!h) return;
  const { page, ctx, errors } = await h.page({ enabled: false });
  await page.waitForFunction(() => window.usProfile);
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => ({ html: [...document.documentElement.classList], calls: window.__LOCK.calls }));
  assert.equal(state.html.includes('us-app-lock-pending'), false);
  assert.equal(state.html.includes('us-app-locked'), false);
  assert.equal(state.calls.includes('unlock'), false);
  assert.equal(await visibleAt(page, '.app'), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('N1 browser: rientro dopo il periodo di grazia → lock sopra la app viva, poi sblocco', async (t) => {
  const h = await harness(t);
  if (!h) return;
  const { page, ctx, errors } = await h.page({ enabled: true });
  await page.waitForFunction(() => window.__LOCK.calls.includes('unlock'));
  await page.evaluate(() => window.__LOCK.release());
  await page.waitForFunction(() => window.usProfile && !document.documentElement.classList.contains('us-app-locked'));
  await page.evaluate(() => window.__LOCK.fire('lockRequired'));
  await page.waitForFunction(() => document.documentElement.classList.contains('us-app-locked'));
  await page.waitForFunction(() => window.__LOCK.calls.filter((c) => c === 'unlock').length === 2);
  assert.equal(await visibleAt(page, '.app'), false);
  assert.equal(await visibleAt(page, '#usAppLockPrimary'), true);
  assert.ok(await page.evaluate(() => window.usProfile?.id === 'f1'), 'la sessione resta, solo la UI è bloccata');
  await page.evaluate(() => window.__LOCK.release());
  await page.waitForFunction(() => !document.documentElement.classList.contains('us-app-locked'));
  assert.equal(await visibleAt(page, '.app'), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});
