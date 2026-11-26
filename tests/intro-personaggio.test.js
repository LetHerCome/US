// L'intro col tuo personaggio (tavola approved 26/11/2026): eight stops on Oggi, once per person,
// right after the first «Entra in US»; «Salta» always; «Rivedi l'intro» in the Profilo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadChromium } = require('./helpers/oggi-browser');

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const intro = read('intro.js');

test('intro: shipped like every other script (page, service worker, both builds)', () => {
  assert.match(read('index.html'), /<script defer src="\/intro\.js\?v=[^"]+"><\/script>/);
  assert.match(read('service-worker.js'), /versioned\("\/intro\.js"\)/);
  assert.match(read('scripts/build-capacitor-web.mjs'), /'intro\.js'/);
  assert.match(read('scripts/build-cloudflare-pages.mjs'), /'intro\.js'/);
});

test('intro: eight stops in the approved order, two lines of the other person, neutral words', () => {
  const ids = [...intro.matchAll(/\{ id: '([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['ciao', 'domanda', 'tipenso', 'noi', 'ricordi', 'gioca', 'profilo', 'angolo']);
  assert.equal((intro.match(/other: '/g) || []).length, 2);
  assert.match(intro, /other: 'Io lo aspetto, eh\.'/);
  assert.match(intro, /other: 'Ci vediamo qui ogni giorno!'/);
  // The logo opens into the bar, as if tapped (it is only the logo before).
  assert.match(intro, /island: true/);
  assert.match(intro, /w\.UsAngolo\?\.isola\?\.\(true/);
  assert.doesNotMatch(intro, /\bla stai pensando\b|\bmandale\b/i, 'no guess about who the other person is');
});

test('intro: only the first entry starts it, on this phone, and the Profilo starts it again', () => {
  const onboarding = read('onboarding.js');
  assert.match(onboarding, /const firstEntry=!silent&&mode!=='device';/);
  assert.match(onboarding, /if\(firstEntry\)setTimeout\(\(\)=>window\.UsIntro\?\.start\?\.\(\)/);
  assert.match(intro, /const SEEN = \(\) => `us:intro:v1:\$\{w\.usProfile\?\.id \|\| ''\}`;/);
  assert.match(intro, /if \(!force && store\.get\(SEEN\(\)\)\) return false;/);
  assert.match(read('index.html'), /data-us-setting="intro"[\s\S]{0,260}Rivedi l’intro/);
  assert.match(read('settings.js'), /if\(name==='intro'\)\{window\.usSettingsReturn\?\.\(\);return window\.UsIntro\?\.start\?\.\(\{force:true\}\);\}/);
});

test('intro: nothing else talks over it; reduced motion keeps it still', () => {
  assert.match(read('us-ricorda.js'), /muted \|\| w\.UsIntro\?\.active\?\.\(\)\) return;/);
  assert.match(read('personaggi.js'), /Boolean\(w\.UsIntro\?\.active\?\.\(\)\)/);
  const css = read('struttura.css');
  assert.match(css, /html\.us-intro-open \.us-fumetto\{visibility:hidden\}/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.us-intro,\.us-intro-hole,\.us-intro-guide,\.us-intro-bubble,\.us-intro-other\{transition:none!important\}/);
  assert.match(css, /\.us-intro-skip\{min-height:44px;/);
  assert.match(css, /\.us-intro-next\{min-height:44px;/);
});

test('intro: who already has US gets it once with the update, on Oggi, by itself', async (t) => {
  assert.match(intro, /function autoStart\(\)/);
  assert.match(intro, /const automated = \(\) => Boolean\(w\.navigator\?\.webdriver\) && !w\.__usIntroAuto;/);
  const chromium = loadChromium();
  if (!chromium) return t.skip('Playwright unavailable');
  const { start, qaFixture } = require('./helpers/countdown-browser');
  const { FAKE_SUPABASE } = require('./helpers/oggi-browser');
  const h = await start();
  try {
    const ctx = await h.browser.newContext({ locale: 'it-IT', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Rome', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith(h.base)) return route.continue(); if (/supabase-js/.test(u)) return route.fulfill({ contentType: 'text/javascript', body: FAKE_SUPABASE }); return route.abort(); });
    await page.addInitScript(qaFixture, { style: 'editorial', mode: 'days', unlocked: true, missing: false, started: '2022-06-23', active: 'custom' });
    await page.addInitScript(() => { window.__usIntroAuto = true; });
    await page.goto(`${h.base}/?us-dev=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.UsIntro?.active(), null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => document.getElementById('usIntro').dataset.step), 'ciao');
    await page.click('[data-intro-skip]');
    // Back to the app later (the fixture wipes storage on reload, so the return is simulated): it does not come back.
    assert.equal(await page.evaluate(() => window.UsIntro.seen()), true);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(4500);
    assert.equal(await page.evaluate(() => window.UsIntro.active()), false);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await h.close(); }
});

test('intro: in the real app it walks the eight stops and is not shown twice', async (t) => {
  const chromium = loadChromium();
  if (!chromium) return t.skip('Playwright unavailable');
  const { start, pageFor } = require('./helpers/countdown-browser');
  const h = await start();
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    assert.equal(await page.evaluate(() => window.UsIntro.start()), true);
    const seen = [];
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(250);
      seen.push(await page.evaluate(() => document.getElementById('usIntro').dataset.step));
      const inside = await page.evaluate(() => { const b = document.querySelector('[data-intro-bubble]').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; });
      assert.ok(inside, `bubble on screen at ${seen[i]}`);
      await page.click('[data-intro-next]');
    }
    assert.deepEqual(seen, ['ciao', 'domanda', 'tipenso', 'noi', 'ricordi', 'gioca', 'profilo', 'angolo']);
    assert.deepEqual(await page.evaluate(() => ({ active: window.UsIntro.active(), seen: window.UsIntro.seen(), again: window.UsIntro.start() })), { active: false, seen: true, again: false });
    // «Salta» closes it at once.
    assert.equal(await page.evaluate(() => window.UsIntro.start({ force: true })), true);
    await page.click('[data-intro-skip]');
    assert.equal(await page.evaluate(() => window.UsIntro.active()), false);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await h.close(); }
});
