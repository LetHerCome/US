// La striscia bianca in alto (founder, 27/11/2026, screenshot dell'APK di staging): with the light
// theme a 1px white line ran along the top of Oggi. The legacy .hero card kept a 1px border; the
// hero's paper colour showed under it and the photo, filling only the inside, started 1px lower.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadChromium } = require('./helpers/oggi-browser');

test('Oggi has no frame around the photo', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'dc-oggi.css'), 'utf8');
  assert.match(css, /#home #homeHero\{border:0\}/);
});

test('the photo reaches the very top edge, by day and by night', async (t) => {
  if (!loadChromium()) return t.skip('Playwright unavailable');
  const { start, qaFixture } = require('./helpers/countdown-browser');
  const { FAKE_SUPABASE } = require('./helpers/oggi-browser');
  const h = await start();
  try {
    for (const colorScheme of ['light', 'dark']) {
      const ctx = await h.browser.newContext({ locale: 'it-IT', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Rome', serviceWorkers: 'block', colorScheme });
      const page = await ctx.newPage();
      await page.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith(h.base)) return route.continue(); if (/supabase-js/.test(u)) return route.fulfill({ contentType: 'text/javascript', body: FAKE_SUPABASE }); return route.abort(); });
      await page.addInitScript(qaFixture, { style: 'editorial', mode: 'days', unlocked: true, missing: false, started: '2022-06-23', active: 'custom' });
      await page.goto(`${h.base}/?us-dev=1`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.usProfile && document.querySelector('.home-photo-layer.active'));
      await page.waitForTimeout(1200);
      const geo = await page.evaluate(() => {
        const hero = document.getElementById('homeHero'), photo = document.querySelector('.home-photo-layer.active');
        const h = hero.getBoundingClientRect(), p = photo.getBoundingClientRect();
        return { border: getComputedStyle(hero).borderTopWidth, top: p.top - h.top, left: p.left - h.left, right: h.right - p.right, topmost: document.elementsFromPoint(195, 0.5)[0]?.classList.contains('home-photo-layer') || false };
      });
      assert.deepEqual(geo, { border: '0px', top: 0, left: 0, right: 0, topmost: true }, colorScheme);
      await ctx.close();
    }
  } finally { await h.close(); }
});
