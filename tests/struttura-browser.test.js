// Redesign definitivo, fase 2 (23/11/2026, D6), in the real app with the fake
// Supabase: your character opens the Profilo and the arrow goes back where you
// were; the heart in the middle of the bar sends a Ti penso with one tap.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, pageFor } = require('./helpers/countdown-browser');

test('your character opens the Profilo from Ricordi, and the arrow goes back to Ricordi', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    // Your shape from the profile (migration 20261115183900): a cloud.
    await page.evaluate(() => { window.__QA.tables.profiles[0].character_shape = 'nuvola'; return window.UsCoupleContext.hydrate(); });
    await page.waitForFunction(() => document.querySelector('.top [data-us-self] svg path:nth-of-type(2)')?.getAttribute('d')?.startsWith('M27 52'));
    // <html> keeps its role: painting the characters leaves the page alone.
    assert.equal(await page.evaluate(() => document.documentElement.dataset.usMe), 'francesco');
    assert.ok(await page.evaluate(() => Boolean(document.getElementById('home'))));

    await page.evaluate(() => window.go('moments', { nav: true }));
    await page.waitForSelector('#moments .us-moments-head-actions [data-us-self]:not([hidden]) svg');
    await page.click('#moments .us-moments-head-actions [data-us-self]');
    await page.waitForFunction(() => document.querySelector('.page.active')?.id === 'settings');
    assert.equal(await page.locator('#usSettingsFromLabel').innerText(), 'Ricordi');
    assert.equal(await page.locator('#usProfileShape').innerText(), 'Nuvola');
    assert.equal(await page.locator('#usProfileName').innerText(), 'Francesco');
    assert.ok(await page.locator('#usProfileChar svg').count());

    await page.click('.us-settings2-back');
    await page.waitForFunction(() => document.querySelector('.page.active')?.id === 'moments');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});

test('the heart in the middle of the bar sends a Ti penso with one tap, on every page', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 360, height: 740 });
    await page.evaluate(() => {
      window.__QA.rpc.send_think = async () => { window.__QA.sent = (window.__QA.sent || 0) + 1; return { data: [{ message_id: `m${window.__QA.sent}`, duplicate: false }], error: null }; };
    });
    // Between Noi and Ricordi, visible on Gioca too.
    await page.evaluate(() => window.openQuizHub({ nav: true }));
    await page.waitForFunction(() => document.querySelector('.page.active')?.id === 'quiz');
    const boxes = await page.$$eval('.us-nav > button', (all) => all.map((b) => [b.dataset.page || b.id, b.getBoundingClientRect().left]));
    assert.deepEqual(boxes.map(([id]) => id), ['home', 'bond', 'thinkButton', 'moments', 'quiz']);
    assert.ok(boxes.every(([, x], i) => i === 0 || x > boxes[i - 1][1]), 'left to right');
    assert.ok(await page.locator('#thinkButton').isVisible());

    await page.click('#thinkButton');
    assert.ok(await page.locator('#thinkButton.is-full').count(), 'the heart fills at the tap');
    await page.waitForFunction(() => window.__QA.sent === 1);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});
