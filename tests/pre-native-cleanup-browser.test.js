const test = require('node:test');
const assert = require('node:assert/strict');
const { start, pageFor } = require('./helpers/countdown-browser');

const VIEWPORTS = [[320, 844], [390, 844], [412, 915]];

// Redesign definitivo (23–24/11/2026): Noi opens on the calendar with your
// character in the head (it opens the Profilo, D6); the old couple card with the
// two avatars and the gear is no longer drawn.
test('pre-native browser: Noi stays contained; the couple card is gone and your character opens Settings at phone widths', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    for (const [width, height] of VIEWPORTS) {
      const view = await pageFor(h, { width, height });
      const { page } = view;
      await page.evaluate(() => window.go('bond', { nav: true }));
      await page.waitForTimeout(500);

      const geometry = await page.evaluate(() => {
        const box = (selector) => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
        };
        return {
          viewport: { width: innerWidth, scrollWidth: document.scrollingElement.scrollWidth },
          card: box('#noiCoupleCard'),
          me: box('#bond [data-us-self]'),
          board: box('#usNoiV2')
        };
      });

      assert.equal(geometry.card.height, 0, width + ': the old couple card is not drawn');
      assert.ok(geometry.me.left >= 0 && geometry.me.right <= geometry.viewport.width + 0.5 && geometry.me.width >= 43.5 && geometry.me.height >= 43.5, width + ': your character is a contained 44px control ' + JSON.stringify(geometry.me));
      assert.ok(geometry.board.left >= 0 && geometry.board.right <= geometry.viewport.width + 0.5 && geometry.board.height > 0, width + ': the calendar is contained');
      assert.ok(geometry.viewport.scrollWidth <= geometry.viewport.width, width + ': no horizontal overflow');

      await page.click('#bond [data-us-self]');
      await page.waitForTimeout(250);
      assert.equal(await page.locator('#settings').evaluate((el) => el.classList.contains('active')), true, width + ': your character opens Settings');
      assert.deepEqual(view.errors, [], width + ': no page errors');
      await view.ctx.close();
    }
  } finally {
    await h.close();
  }
});


// US 1.0 (N10): the old Lavagna board is gone; the Noi calendar is what returns.
test('Noi return: the calendar keeps resolved content visible while it refreshes in the background', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const view = await pageFor(h, { width: 390, height: 844 });
    const { page } = view;
    await page.evaluate(() => window.go('bond', { nav: true }));
    await page.waitForFunction(() => document.getElementById('usNoiV2Content')?.dataset.state === 'ready');
    // Fluidità 2 (24/11/2026): a tap during a motion lands at once, so the
    // snapshot waits for the first change to settle (its hydration included).
    await page.waitForFunction(() => !window.UsDueColori?.isFlooding?.());
    await page.waitForTimeout(400);
    const before = await page.locator('#usNoiV2Content').innerHTML();
    await page.evaluate(() => window.go('home', { nav: true }));
    await page.waitForTimeout(80);
    await page.evaluate(() => window.go('bond', { nav: true }));
    const immediate = await page.evaluate(() => ({
      state: document.getElementById('usNoiV2Content').dataset.state,
      html: document.getElementById('usNoiV2Content').innerHTML
    }));
    assert.equal(immediate.state, 'ready', 'returning to Noi never flashes the loader');
    assert.equal(immediate.html, before, 'the last resolved month stays painted during refresh');
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#usNoiV2Content[data-state="loading"]').count(), 0);
    assert.deepEqual(view.errors, []);
    await view.ctx.close();
  } finally {
    await h.close();
  }
});
