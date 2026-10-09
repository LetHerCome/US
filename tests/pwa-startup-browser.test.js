// PWA startup soak — the real service worker in real Chromium, served the way
// Cloudflare Pages serves US: "/index.html" answers 308 -> "/", unknown paths
// fall back to the SPA document. Regression for the installed Android PWA
// opening on Chrome's own "Impossibile raggiungere il sito" (ERR_FAILED) page.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const vm = require('node:vm');
const { ROOT, loadChromium, FAKE_SUPABASE } = require('./helpers/oggi-browser');
const { qaFixture } = require('./helpers/countdown-browser');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const BUILD_A = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8').match(/const BUILD_ID = "([^"]+)"/)[1];
const BUILD_B = 'qa-startup-soak-build-b';
// The installed production V5, not the candidate with its marker renamed.
const V5_SHA = '1251e495aea03282b284d2f4177120a7bd5eea03';
const V5_BUILD = 'us-reveal-calendar-v5-20261009-1';
const digest = (body) => createHash('sha256').update(body).digest('hex');
const historicalFiles = new Map();
function v5File(file) {
  const relative = path.relative(ROOT, file).split(path.sep).join('/');
  if (!historicalFiles.has(relative)) historicalFiles.set(relative,
    execFileSync('git', ['show', `${V5_SHA}:${relative}`], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 }));
  return historicalFiles.get(relative);
}

function cloudflareLikeServer({ installedV5 = false } = {}) {
  const state = { offline: false, build: installedV5 ? V5_BUILD : BUILD_A, v5: installedV5, documents: 0 };
  const server = http.createServer((req, res) => {
    if (state.offline) { req.socket.destroy(); return; }
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === state.failPrecachePath && url.searchParams.get('v') === BUILD_A) {
      res.writeHead(503); res.end('fixture: interrupted V6 precache'); return;
    }
    if (url.pathname === '/index.html') {
      res.writeHead(308, { location: `/${url.search}` });
      res.end();
      return;
    }
    let file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (url.pathname === '/' || !path.extname(file)) file = path.join(ROOT, 'index.html');
    const send = (error, body) => {
      if (error) { res.writeHead(404); res.end(); return; }
      const ext = path.extname(file);
      if (file.endsWith('index.html')) state.documents += 1;
      // A deploy only changes the build marker: rewrite it in the three files that carry it.
      if (!state.v5 && state.build !== BUILD_A && /(index\.html|service-worker\.js|version\.json)$/.test(file)) {
        body = Buffer.from(String(body).split(BUILD_A).join(state.build));
      }
      res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(body);
    };
    if (state.v5) {
      try { send(null, v5File(file)); } catch (error) { send(error); }
    } else fs.readFile(file, send);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, state })));
}

async function setup(t, options) {
  const chromium = loadChromium();
  if (!chromium) { t.skip('Playwright unavailable'); return null; }
  const { server, state } = await cloudflareLikeServer(options);
  const browser = await chromium.launch();
  const base = `http://127.0.0.1:${server.address().port}`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Rome' });
  await ctx.route(/cdn\.jsdelivr\.net/, (route) => route.fulfill({ contentType: 'text/javascript', body: FAKE_SUPABASE }));
  await ctx.addInitScript(qaFixture, { style: 'editorial', mode: 'days', unlocked: true, missing: false, started: '2022-06-23', active: 'custom' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(async () => { await browser.close(); await new Promise((resolve) => server.close(resolve)); });
  return { base, ctx, page, state, errors };
}

async function waitForShell(page, build) {
  // Polled from Node: waitForFunction would treat the async predicate's
  // pending Promise as an immediate truthy result.
  const deadline = Date.now() + 30000;
  for (;;) {
    const ready = await page.evaluate(async (expected) => {
      const registration = await navigator.serviceWorker.getRegistration();
      const keys = await caches.keys();
      return Boolean(navigator.serviceWorker.controller && registration?.active?.state === 'activated' &&
        registration.active.scriptURL.endsWith('/service-worker.js') &&
        registration.waiting === null && registration.installing === null && keys.includes(`us-shell-${expected}`) &&
        await (await caches.open(`us-shell-${expected}`)).match('/'));
    }, build).catch(() => false);
    if (ready) return;
    if (Date.now() > deadline) throw new Error(`service worker shell ${build} never became ready`);
    await page.waitForTimeout(150);
  }
}

// A launch "works" when Chrome rendered US itself, not its network error page.
async function launch(page, url) {
  let failure = null;
  await page.goto(url, { waitUntil: 'load' }).catch((error) => { failure = error.message.split('\n')[0]; });
  const shown = await page.evaluate(() => ({
    href: location.href,
    build: document.querySelector('meta[name="us-build"]')?.content || null,
    nav: Boolean(document.querySelector('.nav')),
    offlinePage: /US non è raggiungibile/.test(document.body?.textContent || '')
  })).catch(() => ({ href: 'chrome-error', build: null, nav: false, offlinePage: false }));
  return { failure, ...shown };
}

test('installed PWA: every relaunch after install renders US, never the browser error page', async (t) => {
  const h = await setup(t); if (!h) return;
  const first = await launch(h.page, `${h.base}/`);
  assert.equal(first.failure, null);
  await waitForShell(h.page, BUILD_A);
  for (let i = 0; i < 3; i += 1) {
    const relaunch = await launch(h.page, `${h.base}/`);
    assert.deepEqual({ failure: relaunch.failure, nav: relaunch.nav, build: relaunch.build }, { failure: null, nav: true, build: BUILD_A }, `relaunch ${i}`);
  }
  const shelled = await h.page.evaluate(async (build) => {
    const cache = await caches.open(`us-shell-${build}`);
    const entries = await Promise.all(['/', '/index.html'].map((key) => cache.match(key)));
    return entries.map((entry) => entry && { redirected: entry.redirected, status: entry.status });
  }, BUILD_A);
  assert.deepEqual(shelled, [{ redirected: false, status: 200 }, { redirected: false, status: 200 }]);
  assert.deepEqual(h.errors, []);
});

test('installed PWA: relaunch while the network is down, then while it comes back', async (t) => {
  const h = await setup(t); if (!h) return;
  await launch(h.page, `${h.base}/`);
  await waitForShell(h.page, BUILD_A);
  h.state.offline = true;
  const offline = await launch(h.page, `${h.base}/?open=home&from=push`);
  assert.deepEqual({ failure: offline.failure, nav: offline.nav, build: offline.build, offlinePage: offline.offlinePage },
    { failure: null, nav: true, build: BUILD_A, offlinePage: false }, 'the cached shell starts without any network');
  h.state.offline = false;
  const back = await launch(h.page, `${h.base}/`);
  assert.deepEqual({ failure: back.failure, nav: back.nav }, { failure: null, nav: true });
  assert.deepEqual(h.errors, []);
});

test('installed PWA: launch right after an update and offline after it keep one consistent build', async (t) => {
  const h = await setup(t); if (!h) return;
  await launch(h.page, `${h.base}/`);
  await waitForShell(h.page, BUILD_A);
  h.state.build = BUILD_B; // deploy
  await launch(h.page, `${h.base}/`); // the next open notices the new worker
  await waitForShell(h.page, BUILD_B);
  const afterUpdate = await launch(h.page, `${h.base}/`);
  assert.deepEqual({ failure: afterUpdate.failure, nav: afterUpdate.nav, build: afterUpdate.build }, { failure: null, nav: true, build: BUILD_B });
  h.state.offline = true;
  const offline = await launch(h.page, `${h.base}/`);
  assert.deepEqual({ failure: offline.failure, nav: offline.nav, build: offline.build }, { failure: null, nav: true, build: BUILD_B });
  const keys = await h.page.evaluate(() => caches.keys());
  assert.equal(keys.includes(`us-shell-${BUILD_A}`), false, 'the previous shell is gone');
  assert.deepEqual(h.errors, []);
});

test('installed production V5 upgrades to V6: every shell asset has candidate bytes online and offline', async (t) => {
  const h = await setup(t, { installedV5: true }); if (!h) return;
  assert.notEqual(BUILD_A, V5_BUILD, 'V6 must have its own build/cache identity');
  assert.equal((await launch(h.page, `${h.base}/`)).build, V5_BUILD);
  await waitForShell(h.page, V5_BUILD);
  const oldApp = await h.page.evaluate(async (build) => {
    const cache = await caches.open(`us-shell-${build}`);
    await (await caches.open('us-private-media-v1')).put('/qa-private-media', new Response('keep-private-media'));
    return await (await cache.match(`/app.js?v=${build}`)).text();
  }, V5_BUILD);
  assert.equal(digest(oldApp), digest(v5File(path.join(ROOT, 'app.js'))), 'the installed JS really is production V5');
  assert.notEqual(digest(oldApp), digest(fs.readFileSync(path.join(ROOT, 'app.js'))), 'the candidate has different Daily code');

  const delivered = [];
  h.page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === h.base && /\.(js|css)$/.test(url.pathname)) {
      delivered.push(response.body().then((body) => ({ url, hash: digest(body) })));
    }
  });
  h.state.v5 = false; h.state.build = BUILD_A; // publish the actual candidate files on the same origin
  await launch(h.page, `${h.base}/`);
  await waitForShell(h.page, BUILD_A);
  const prefix = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8').split('// Every other APP_SHELL entry')[0];
  const shell = vm.runInNewContext(`${prefix}\nAPP_SHELL`);
  const expected = shell.filter((url) => url !== '/' && url !== '/index.html').map((url) => ({
    url, hash: digest(fs.readFileSync(path.join(ROOT, new URL(url, h.base).pathname)))
  }));
  for (const offline of [false, true]) {
    h.state.offline = offline;
    const opened = await launch(h.page, `${h.base}/`);
    assert.deepEqual({ failure: opened.failure, nav: opened.nav, build: opened.build },
      { failure: null, nav: true, build: BUILD_A }, `V6 launch offline=${offline}`);
    const result = await h.page.evaluate(async ({ build, expected }) => {
      const cache = await caches.open(`us-shell-${build}`);
      const hash = async (response) => response ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer())))
        .map((b) => b.toString(16).padStart(2, '0')).join('') : null;
      const assets = [];
      for (const { url } of expected) assets.push({ url, cached: await hash(await cache.match(url)), served: await hash(await fetch(url)) });
      const refs = [...document.querySelectorAll('script[src],link[rel="stylesheet"]')]
        .map((el) => el.src || el.href).filter((url) => new URL(url).origin === location.origin);
      const documents = await Promise.all(['/', '/index.html'].map(async (url) => (await cache.match(url)).text()));
      return { assets, refs, documents, keys: await caches.keys(),
        media: await (await (await caches.open('us-private-media-v1')).match('/qa-private-media')).text() };
    }, { build: BUILD_A, expected });
    for (const asset of expected) {
      const actual = result.assets.find((item) => item.url === asset.url);
      assert.equal(actual.cached, asset.hash, `precache ${asset.url}, offline=${offline}`);
      assert.equal(actual.served, asset.hash, `worker response ${asset.url}, offline=${offline}`);
    }
    assert.ok(result.refs.length > 20);
    assert.ok(result.refs.every((url) => new URL(url).searchParams.get('v') === BUILD_A), 'no V5 or unversioned local JS/CSS in V6 HTML');
    assert.ok(result.documents.every((html) => html.includes(`content="${BUILD_A}"`) && !html.includes(V5_BUILD)), 'both cached documents are V6');
    assert.equal(result.keys.includes(`us-shell-${V5_BUILD}`), false);
    assert.equal(result.media, 'keep-private-media', 'upgrade preserves the private media cache');
  }
  const responses = await Promise.all(delivered);
  assert.ok(responses.some(({ url }) => url.searchParams.get('v') === V5_BUILD), 'the next open exercises the still-controlling V5 worker');
  assert.ok(responses.some(({ url }) => url.searchParams.get('v') === BUILD_A), 'the updated page requests V6 assets');
  for (const { url, hash } of responses) {
    const file = path.join(ROOT, url.pathname);
    const build = url.searchParams.get('v');
    assert.ok([V5_BUILD, BUILD_A].includes(build), `unexpected build during activation: ${url}`);
    assert.equal(hash, digest(build === V5_BUILD ? v5File(file) : fs.readFileSync(file)),
      `no mixed JS/CSS bytes during navigation/activation: ${url}`);
  }
  assert.deepEqual(h.errors, []);
});

test('installed production V5 remains usable offline when the V6 precache fails', async (t) => {
  const h = await setup(t, { installedV5: true }); if (!h) return;
  assert.notEqual(BUILD_A, V5_BUILD);
  await launch(h.page, `${h.base}/`);
  await waitForShell(h.page, V5_BUILD);
  h.state.v5 = false; h.state.build = BUILD_A; h.state.failPrecachePath = '/modal-center.css';
  await h.page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('failed installation did not settle')), 15000);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'redundant') { clearTimeout(timeout); resolve(); }
        });
      }, { once: true });
      registration.update().catch(reject);
    });
  });
  h.state.offline = true;
  const opened = await launch(h.page, `${h.base}/`);
  assert.deepEqual({ failure: opened.failure, nav: opened.nav, build: opened.build },
    { failure: null, nav: true, build: V5_BUILD });
  await waitForShell(h.page, V5_BUILD);
  const app = await h.page.evaluate(async (build) => (await fetch(`/app.js?v=${build}`)).text(), V5_BUILD);
  assert.equal(digest(app), digest(v5File(path.join(ROOT, 'app.js'))), 'the previous installed worker still serves real V5 JS');
  assert.deepEqual(h.errors, []);
});

test('installed PWA: a redirected document left by an older build is never replayed raw', async (t) => {
  const h = await setup(t); if (!h) return;
  await launch(h.page, `${h.base}/`);
  await waitForShell(h.page, BUILD_A);
  // Exactly what addAll('/index.html') stored before the fix on Cloudflare Pages.
  const poisoned = await h.page.evaluate(async (build) => {
    // The query keeps the request off the worker's cached shell entries.
    const response = await fetch('/index.html?qa-legacy=1', { cache: 'no-store' });
    const cache = await caches.open(`us-shell-${build}`);
    await cache.put('/index.html', response.clone());
    return (await cache.match('/index.html')).redirected;
  }, BUILD_A);
  assert.equal(poisoned, true);
  h.state.offline = true; // no background network rescue either
  const relaunch = await launch(h.page, `${h.base}/`);
  assert.deepEqual({ failure: relaunch.failure, nav: relaunch.nav }, { failure: null, nav: true });
});

test('no usable shell and no network: a real US page that recovers when the connection returns', async (t) => {
  const h = await setup(t); if (!h) return;
  await launch(h.page, `${h.base}/`);
  await waitForShell(h.page, BUILD_A);
  await h.page.evaluate(async () => { for (const key of await caches.keys()) if (key.startsWith('us-shell-')) await caches.delete(key); });
  h.state.offline = true;
  const down = await launch(h.page, `${h.base}/`);
  assert.deepEqual({ failure: down.failure, offlinePage: down.offlinePage }, { failure: null, offlinePage: true });
  h.state.offline = false;
  await Promise.all([h.page.waitForNavigation({ waitUntil: 'load' }), h.page.click('#usRetry')]);
  assert.equal(await h.page.evaluate(() => Boolean(document.querySelector('.nav'))), true);
});
