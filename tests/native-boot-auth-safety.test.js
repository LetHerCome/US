const test = require('node:test');
const assert = require('node:assert/strict');
const { loadChromium, startServer, FAKE_SUPABASE } = require('./helpers/oggi-browser');
const { qaFixture } = require('./helpers/countdown-browser');

function authFake() {
  let src = FAKE_SUPABASE;
  const sessionLine = "const session = () => ({ access_token: 'qa', refresh_token: 'qa', user: { id: Q().me, is_anonymous: false, email: 'qa@example.test' } });";
  const dynamicSession = "const session = () => window.__QA_AUTH_SIGNED_IN === false ? null : ({ access_token: 'qa', refresh_token: 'qa', user: { id: Q().me, is_anonymous: false, email: 'qa@example.test' } });";
  const getUserLine = "getUser: async () => ({ data: { user: session().user }, error: null }),";
  const dynamicGetUser = "getUser: async () => ({ data: { user: session()?.user || null }, error: null }),";
  const signInLine = "signInWithPassword: async () => ({ data: null, error: { message: 'qa' } }),";
  const successfulSignIn = "signInWithPassword: async () => { window.__QA_AUTH_SIGNED_IN = true; return { data: { session: session() }, error: null }; },";
  assert.ok(src.includes(sessionLine), 'fake session contract changed');
  assert.ok(src.includes(getUserLine), 'fake getUser contract changed');
  assert.ok(src.includes(signInLine), 'fake signIn contract changed');
  return src.replace(sessionLine, dynamicSession).replace(getUserLine, dynamicGetUser).replace(signInLine, successfulSignIn);
}

async function harness(t, { signedIn }) {
  const chromium = loadChromium();
  if (!chromium) { t.skip('Playwright unavailable'); return null; }
  const server = await startServer();
  let browser;
  try { browser = await chromium.launch(); }
  catch (error) { await new Promise((resolve) => server.close(resolve)); throw error; }
  const base = `http://127.0.0.1:${server.address().port}`;
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    timezoneId: 'Europe/Rome',
    serviceWorkers: 'block'
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(base)) return route.continue();
    if (/supabase-js/.test(url)) return route.fulfill({ contentType: 'text/javascript', body: authFake() });
    return route.abort();
  });
  await page.addInitScript(qaFixture, {
    style: 'editorial',
    mode: 'days',
    unlocked: true,
    missing: false,
    started: '2024-02-03',
    active: 'custom',
    meName: 'Luca',
    partnerName: 'Maya'
  });
  await page.addInitScript((initial) => { window.__QA_AUTH_SIGNED_IN = initial; }, signedIn);
  t.after(async () => {
    await ctx.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  });
  return { page, errors, base };
}

test('boot/auth safety: a returning valid session reaches the app and restores couple context', async (t) => {
  let h;
  try { h = await harness(t, { signedIn: true }); }
  catch (error) {
    if (/Executable doesn't exist|browserType\.launch|playwright/i.test(String(error))) { t.skip('Playwright unavailable'); return; }
    throw error;
  }
  if (!h) return;

  await h.page.goto(h.base + '/?us-dev=1', { waitUntil: 'load' });
  await h.page.waitForFunction(() => window.usProfile?.id === 'f1' && document.documentElement.classList.contains('us-auth-ready'));
  await h.page.waitForFunction(() => window.UsCoupleContext?.partnerName?.() === 'Maya');

  const state = await h.page.evaluate(() => ({
    authHidden: document.getElementById('authOverlay')?.classList.contains('hidden'),
    loginFn: typeof window.loginAccount,
    partner: window.UsCoupleContext?.partnerName?.(),
    coupleId: window.usProfile?.couple_id
  }));
  assert.deepEqual(state, { authHidden: true, loginFn: 'function', partner: 'Maya', coupleId: 'c1' });
  assert.deepEqual(h.errors, []);
});

test('boot/auth safety: password login cannot remain stranded on Accesso', async (t) => {
  let h;
  try { h = await harness(t, { signedIn: false }); }
  catch (error) {
    if (/Executable doesn't exist|browserType\.launch|playwright/i.test(String(error))) { t.skip('Playwright unavailable'); return; }
    throw error;
  }
  if (!h) return;

  await h.page.goto(h.base + '/?us-dev=1', { waitUntil: 'load' });
  await h.page.waitForFunction(() => document.getElementById('authLogin')?.classList.contains('active'));

  await h.page.fill('#loginEmail', 'luca@example.test');
  await h.page.fill('#loginPassword', 'correct-horse-battery-staple');
  await h.page.click('#loginBtn');

  await h.page.waitForFunction(() => window.usProfile?.id === 'f1' && document.getElementById('authOverlay')?.classList.contains('hidden'));
  await h.page.waitForFunction(() => window.UsCoupleContext?.partnerName?.() === 'Maya');

  const state = await h.page.evaluate(() => ({
    buttonDisabled: document.getElementById('loginBtn')?.disabled,
    status: document.getElementById('loginStatus')?.textContent?.trim(),
    ready: document.documentElement.classList.contains('us-auth-ready'),
    partner: window.UsCoupleContext?.partnerName?.()
  }));
  assert.equal(state.buttonDisabled, false);
  assert.notEqual(state.status, 'Accesso…');
  assert.equal(state.ready, true);
  assert.equal(state.partner, 'Maya');
  assert.deepEqual(h.errors, []);
});
