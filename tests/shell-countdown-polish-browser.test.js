const test = require('node:test');
const assert = require('node:assert/strict');
const { start, pageFor } = require('./helpers/countdown-browser');

test('Sintonia collection applies Countdown style directly without opening the Countdown sheet', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844, style: 'editorial', unlocked: true });
    // Redesign (23–25/11/2026): the Sintonia collection lives in «Il vostro angolo», tab Premi (struttura-browser.test.js).
    await page.waitForFunction(() => window.usProfile?.couple_id && window.UsAngolo);
    await page.evaluate(() => { window.UsAngolo.isola(false); window.UsAngolo.open(); window.UsAngolo.tab('premi'); });
    // A row of chips chooses the one kind of reward shown (I vostri sblocchi).
    await page.click('#usAngoloPremi [data-reward-cat="countdown"]');
    await page.waitForSelector('[data-countdown-style-select="orbit"]:not([disabled])', { timeout: 10000 });

    assert.equal(await page.locator('[data-countdown-style-select="editorial"]').getAttribute('aria-pressed'), 'true', 'current style is marked in use');
    assert.equal(await page.locator('#usCountdownSheet').getAttribute('aria-hidden'), 'true');

    await page.click('[data-countdown-style-select="orbit"]');
    await page.waitForFunction(() => document.querySelector('[data-countdown-style-select="orbit"]')?.getAttribute('aria-pressed') === 'true');

    assert.match(await page.locator('[data-countdown-style-select="orbit"] .us-progression-reward-copy small').innerText(), /In uso/);
    assert.equal(await page.locator('#usCountdownSheet').getAttribute('aria-hidden'), 'true', 'collection selection never opens Countdown management');

    await page.evaluate(() => window.go('home', { nav: true }));
    await page.waitForSelector('#usCountdownDisplay:not([hidden])');
    assert.equal(await page.locator('#usCountdownDisplay .us-countdown-art').getAttribute('data-countdown-style'), 'orbit');
    assert.equal(await page.evaluate(() => window.__QA.countdown.items[0].style), 'orbit', 'style is saved through the existing countdown authority');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});

test('shell polish keeps Ricordi/Gioca labels semantic-only and Gioca uses the controller glyph', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    // The Gioca hub paints its (screen-reader) title when it renders.
    await page.waitForSelector('#quizHub h2', { state: 'attached' });
    const shell = await page.evaluate(() => ({
      ricordiTitle: getComputedStyle(document.querySelector('#moments > .section > h2')).position,
      ricordiTitleClass: document.querySelector('#moments > .section > h2')?.className || '',
      giocaTitleClass: document.querySelector('#quizHub h2')?.className || '',
      quizOff: document.querySelector('.nav button[data-page="quiz"] [data-icon].us-nav-icon-off')?.dataset.icon || '',
      quizOn: document.querySelector('.nav button[data-page="quiz"] [data-icon].us-nav-icon-on')?.dataset.icon || '',
      transforms: Object.fromEntries(['home','bond','moments','quiz'].map((pageName) => {
        const icon = document.querySelector(`.nav button[data-page="${pageName}"] .us-nav-icon`);
        return [pageName, getComputedStyle(icon).transform];
      }))
    }));
    assert.equal(shell.ricordiTitle, 'absolute');
    assert.match(shell.ricordiTitleClass, /noi-sr/);
    assert.match(shell.giocaTitleClass, /us-gv2-sr/);
    assert.match(shell.quizOff, /game-controller-regular\.svg$/);
    assert.match(shell.quizOn, /game-controller-fill\.svg$/);
    assert.equal(shell.transforms.home, 'none');
    assert.equal(shell.transforms.bond, 'none');
    assert.equal(shell.transforms.moments, 'none');
    assert.match(shell.transforms.quiz, /matrix\(1, 0, 0, 1, 0, -2\)/, 'Gioca glyph is optically raised without moving its tab box');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});
