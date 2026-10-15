const test = require('node:test');
const assert = require('node:assert/strict');
const { start, pageFor } = require('./helpers/countdown-browser');

const VIEWPORTS = [[320, 844], [390, 844], [412, 915]];

test('pre-native browser: couple card stays compact, contained and opens Settings at phone widths', async (t) => {
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
          settings: box('#usSettingsEntry'),
          francesco: box('#pairAvatarFrancesco'),
          beatrice: box('#pairAvatarBeatrice'),
          // US 1.0 (N10): the old Lavagna board is gone; the Noi calendar sits below the card.
          board: box('#usNoiV2'),
          names: [...document.querySelectorAll('.noi-couple-name')].map((el) => el.textContent.trim())
        };
      });

      assert.ok(geometry.card.left >= 0 && geometry.card.right <= geometry.viewport.width + 0.5, width + ': card contained');
      assert.ok(geometry.card.height >= 72 && geometry.card.height <= 98, width + ': light bridge stays compact');
      assert.ok(geometry.settings.left >= geometry.card.left && geometry.settings.right <= geometry.card.right, width + ': Settings inside card');
      assert.ok(geometry.settings.top >= geometry.card.top && geometry.settings.bottom <= geometry.card.bottom, width + ': Settings stays inside the bridge bounds');
      assert.ok(geometry.settings.left >= geometry.beatrice.right - 1, width + ': Settings does not cover Beatrice');
      assert.ok(geometry.board.top > geometry.card.bottom, width + ': the calendar stays below the card');
      assert.deepEqual(geometry.names, ['Francesco', 'Beatrice']);
      assert.ok(geometry.viewport.scrollWidth <= geometry.viewport.width, width + ': no horizontal overflow');

      await page.click('#usSettingsEntry');
      await page.waitForTimeout(250);
      assert.equal(await page.locator('#settings').evaluate((el) => el.classList.contains('active')), true, width + ': gear opens Settings');
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
