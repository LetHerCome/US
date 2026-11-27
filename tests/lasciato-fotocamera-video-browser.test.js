// Lasciato per te: fotocamera e video (27/11/2026), in the real app shell.
// «Fai un video» opens the file chooser with the camera (accept video/*,
// capture); «Scegli un video» opens it on the gallery types. Both fit a phone,
// one under the other like «Scatta una foto» and «Scegli dalla galleria».
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, pageFor } = require('./helpers/countdown-browser');

test('«Fai un video» and «Scegli un video» stack like the photo choices and open the right chooser', { timeout: 120000 }, async (t) => {
  const h = await start();
  if (!h) { t.skip('Chromium not available (PLAYWRIGHT_NODE_MODULES)'); return; }
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 360, height: 740 });
    await page.evaluate(() => window.UsLeftForYou.openComposer({ kind: 'video' }));
    await page.waitForSelector('#leftForYouComposerVideoCamera', { state: 'visible' });
    const boxes = await page.evaluate(() => ['leftForYouComposerVideoCamera', 'leftForYouComposerVideoPick', 'leftForYouComposerSend'].map((id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { id, top: Math.round(r.top), left: r.left, right: r.right, height: r.height };
    }));
    const [record, gallery] = boxes;
    assert.ok(record.height >= 44 && gallery.height >= 44, JSON.stringify(boxes));
    assert.ok(record.top + record.height <= gallery.top + 1, "the camera first, the gallery under it");
    assert.ok(Math.max(record.right, gallery.right) <= 360 - 15, 'inside the 16 px gutter');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no sideways scroll');

    const chooser = async (id) => {
      const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(`#${id}`)]);
      return fileChooser.element().evaluate((input) => ({ id: input.id, accept: input.getAttribute('accept'), capture: input.getAttribute('capture') }));
    };
    assert.deepEqual(await chooser('leftForYouComposerVideoCamera'), { id: 'leftForYouComposerVideoFile', accept: 'video/*', capture: 'environment' });
    assert.deepEqual(await chooser('leftForYouComposerVideoPick'), { id: 'leftForYouComposerVideoFile', accept: 'video/mp4,video/webm,video/quicktime', capture: null });
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});
