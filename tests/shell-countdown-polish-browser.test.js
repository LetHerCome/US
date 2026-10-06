const test = require('node:test');
const assert = require('node:assert/strict');
const { start, pageFor } = require('./helpers/countdown-browser');

test('Sintonia collection applies Countdown style directly without opening the Countdown sheet', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844, style: 'editorial', unlocked: true });
    await page.evaluate(() => window.go('bond', { nav: true }));
    await page.waitForTimeout(500);
    await page.click('[data-noi-open="resonance"]');
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
    const shell = await page.evaluate(() => ({
      ricordiTitle: getComputedStyle(document.querySelector('#moments > .section > h2')).position,
      ricordiTitleClass: document.querySelector('#moments > .section > h2')?.className || '',
      giocaTitleClass: document.querySelector('#quizHub .us-gv2-head h2')?.className || '',
      quizOff: document.querySelector('.nav button[data-page="quiz"] [data-icon].us-nav-icon-off')?.dataset.icon || '',
      quizOn: document.querySelector('.nav button[data-page="quiz"] [data-icon].us-nav-icon-on')?.dataset.icon || ''
    }));
    assert.equal(shell.ricordiTitle, 'absolute');
    assert.match(shell.ricordiTitleClass, /noi-sr/);
    assert.match(shell.giocaTitleClass, /us-gv2-sr/);
    assert.match(shell.quizOff, /game-controller-regular\.svg$/);
    assert.match(shell.quizOn, /game-controller-fill\.svg$/);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});
