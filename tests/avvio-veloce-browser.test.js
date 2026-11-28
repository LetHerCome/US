// Avvio più veloce (27/11/2026), in the real app (headless Chromium, fake
// Supabase): the first screen is marked once, a short trip away rereads
// nothing, a real absence rereads, and the English dictionary loads only in English.
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadChromium, startServer, FAKE_SUPABASE } = require('./helpers/oggi-browser');
const { qaFixture } = require('./helpers/countdown-browser');

// Every Supabase read the app makes, by name (after the in-page fake).
const COUNT = `(() => {
  const real = window.supabase.createClient;
  window.__CALLS = [];
  window.supabase = { createClient: (...args) => {
    const c = real(...args);
    const rpc = c.rpc; c.rpc = (name, a) => { window.__CALLS.push('rpc:' + name); return rpc(name, a); };
    const from = c.from; c.from = (table) => { window.__CALLS.push('from:' + table); return from(table); };
    return c;
  } };
})();`;

const PROBE = () => {
  window.__ready = [];
  window.addEventListener('us:app-ready', (event) => window.__ready.push({ ...event.detail, auth: document.documentElement.classList.contains('us-auth-ready'), question: Boolean(window.todayQuestion) }));
  let hidden = false;
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => hidden });
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  window.__setHidden = (value) => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
};

async function open(t, { lang = 'it' } = {}) {
  const chromium = loadChromium();
  if (!chromium) { t.skip('Playwright unavailable'); return null; }
  const server = await startServer();
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); await new Promise((resolve) => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const ctx = await browser.newContext({ locale: lang === 'en' ? 'en-US' : 'it-IT', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Rome', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(base)) return route.continue();
    if (/supabase-js/.test(url)) return route.fulfill({ contentType: 'text/javascript', body: `${FAKE_SUPABASE}\n${COUNT}` });
    return route.abort();
  });
  await page.addInitScript(qaFixture, { style: 'editorial', mode: 'days', unlocked: true, missing: false, started: '2022-06-23', active: 'custom' });
  await page.addInitScript(PROBE);
  await page.goto(`${base}/?us-dev=1${lang === 'en' ? '&us-lang=en' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready.length > 0 && window.usProfile, null, { timeout: 20000 });
  return { page, errors, requests };
}

test('cold start: one us:app-ready, once Oggi has its question, in Italian without the English dictionary', async (t) => {
  const h = await open(t);
  if (!h) return;
  const { page, errors, requests } = h;
  await page.waitForTimeout(3000);
  const ready = await page.evaluate(() => window.__ready);
  assert.equal(ready.length, 1, 'once');
  assert.equal(ready[0].reason, 'oggi');
  assert.ok(ready[0].at > 0);
  assert.equal(ready[0].auth, true, 'after the shell is revealed');
  assert.equal(ready[0].question, true, 'with the question of today');
  assert.equal(await page.evaluate(() => document.documentElement.classList.contains('us-app-ready') && window.UsAppReady.ready), true);
  assert.equal(requests.some((path) => path === '/i18n-en.js'), false, 'Italian: the English dictionary is never fetched');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'it');
  assert.deepEqual(errors, []);
});

test('warm start: a few seconds away rereads nothing; a real absence rereads Oggi', async (t) => {
  const h = await open(t);
  if (!h) return;
  const { page, errors } = h;
  await page.waitForTimeout(3000);
  // Off to WhatsApp for a moment and back.
  await page.evaluate(() => { window.__CALLS.length = 0; window.__setHidden(true); });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__setHidden(false));
  await page.waitForTimeout(3500);
  assert.deepEqual(await page.evaluate(() => window.__CALLS), [], 'nothing reread after a short trip');
  // Away for a minute (the clock moves on while hidden).
  await page.evaluate(() => { window.__CALLS.length = 0; window.__setHidden(true); const now = Date.now; Date.now = () => now() + 60000; });
  await page.evaluate(() => window.__setHidden(false));
  await page.waitForTimeout(3500);
  const calls = await page.evaluate(() => window.__CALLS);
  assert.ok(calls.includes('rpc:get_or_create_daily_question'), 'the question of today is read again');
  assert.ok(calls.includes('rpc:get_countdown_oggi_v1'), 'the countdown too');
  // Still one first screen per launch.
  assert.equal(await page.evaluate(() => window.__ready.length), 1);
  assert.deepEqual(errors, []);
});

test('English: the dictionary is written in before the body and the page speaks English', async (t) => {
  const h = await open(t, { lang: 'en' });
  if (!h) return;
  const { page, errors, requests } = h;
  assert.ok(requests.includes('/i18n-en.js'));
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  assert.equal(await page.evaluate(() => window.usT('Invia la mia risposta')), 'Send my answer');
  assert.deepEqual(errors, []);
});
