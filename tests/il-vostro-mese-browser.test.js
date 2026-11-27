// Il vostro mese in the real app with the fake Supabase: Ricordi › Carte, the
// pack torn with a real drag, the ten cards flipped and tossed, the rare one
// last, the fan, the cards one by one (swipe, the board, save as image), the
// sharing (11 images 1080×1920, answers and photos hidden by default), a card
// of a deleted memory, Back, 360×640 and reduced motion.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, mesePage, openCarte, openLastPack, tear, noSideScroll } = require('./helpers/mese-browser');

// The share sheet of the browser, recorded; each file measured.
const recordShare = (page) => page.evaluate(() => {
  window.__QA.shared = [];
  navigator.canShare = () => true;
  navigator.share = async (o) => { window.__QA.shared.push(await Promise.all(o.files.map(async (f) => { const b = await createImageBitmap(f); return { name: f.name, type: f.type, w: b.width, h: b.height }; }))); };
});

test('the pack: torn by a drag, ten cards, the rare one last, the fan; one card at a time; the board; save; share', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, errors } = await mesePage(h, { width: 390, height: 844 });
    await openCarte(page);
    assert.equal(await page.locator('#ricordiCarte .slot.before').count(), 2, 'the months before the couple, light');
    assert.equal(await page.locator('#ricordiCarte .slot.closed').count(), 1, 'last month waits to be opened');
    assert.match(await page.locator('#ricordiCarte .uc-gold').innerText(), /31 dicembre/);
    assert.equal(await page.evaluate(() => document.querySelector('#moments .ricordi-story-head h3').textContent), 'Le vostre carte');
    assert.ok(await noSideScroll(page));
    await openLastPack(page);
    assert.match(await page.locator('#usMese .pk-head').innerText(), /non l’ha ancora aperto/);
    // A drag that stops early: the strip goes back, nothing opens.
    const half = await tear(page, 0.5);
    await page.mouse.up();
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__QA.mese.opened.length), 0);
    assert.equal(await page.locator('#usMese [data-um="strip"]').getAttribute('aria-valuenow'), '0');
    // The whole line: it opens, once.
    const full = await tear(page, 1);
    await page.mouse.up();
    void half; void full;
    await page.waitForFunction(() => document.querySelector('#usMese [data-um-part="pile"]')?.hidden === false);
    await page.waitForTimeout(900);
    assert.deepEqual(await page.evaluate(() => window.__QA.mese.opened), [await page.evaluate(() => window.__QA.mese.months.find((m) => m.state === 'opened' && m.cover && m.pack && window.__QA.mese.opened.includes(m.pack))?.pack)]);
    assert.equal(await page.locator('#usMese .pile .um-card').count(), 10);
    assert.equal(await page.locator('#usMese [data-um="count"]').innerText(), '1 / 10');
    for (let i = 0; i < 10; i += 1) {
      const card = page.locator('#usMese .pile .um-card').nth(i);
      if (i === 9) {
        assert.ok(await card.evaluate((n) => n.classList.contains('rare')), 'the rare one is last');
        assert.match(await page.locator('#usMese [data-um="hint"]').innerText(), /carta rara/);
      }
      await card.click();
      await page.waitForTimeout(i === 9 ? 950 : 560);
      assert.equal(await card.evaluate((n) => n.querySelector('.inner').style.transform), 'rotateY(180deg)', `card ${i + 1} flipped`);
      if (i === 9) {
        // The shine follows the finger.
        const b = await card.boundingBox();
        await page.mouse.move(b.x + b.width * 0.8, b.y + b.height * 0.2);
        assert.ok(Math.abs(parseFloat(await card.evaluate((n) => n.querySelector('.front').style.getPropertyValue('--mx'))) - 80) < 0.5);
      }
      await card.click();
      await page.waitForTimeout(470);
    }
    await page.waitForSelector('#usMese [data-um-part="finale"]:not([hidden])');
    assert.match(await page.locator('#usMese .finale h2').innerText(), /^Il vostro \w+/);
    assert.equal(await page.locator('#usMese .fan .mini').count(), 10);
    assert.ok(await page.locator('#usMese .fan img[src]').count() >= 3, 'the photos are signed and shown');

    // One card at a time, from the fan.
    await page.evaluate(() => document.querySelectorAll('#usMese .fan .mini')[2].click());
    await page.waitForSelector('#usMese [data-um-l="viewer"]:not([hidden])');
    assert.equal(await page.locator('#usMese [data-um="vcount"]').innerText(), '3 / 10');
    const stage = await page.locator('#usMese [data-um="vstage"]').boundingBox();
    await page.mouse.move(stage.x + stage.width * 0.8, stage.y + stage.height * 0.5);
    await page.mouse.down();
    for (let i = 1; i <= 8; i += 1) await page.mouse.move(stage.x + stage.width * (0.8 - 0.06 * i), stage.y + stage.height * 0.5);
    await page.mouse.up();
    await page.waitForTimeout(300);
    assert.equal(await page.locator('#usMese [data-um="vcount"]').innerText(), '4 / 10', 'a swipe to the left: the next card');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('#usMese [data-um="vcount"]').innerText(), '3 / 10');
    assert.equal(await page.locator('#usMese [data-um="pin"]').count(), 0, 'the places: nothing to pin');
    await page.click('#usMese [data-um="prev"]');
    await page.click('#usMese [data-um="prev"]');
    assert.equal(await page.locator('#usMese [data-um="vcount"]').innerText(), '1 / 10');
    assert.ok(await page.locator('#usMese [data-um="prev"]').isDisabled());
    // Metti in bacheca: through the board's own «Appendi».
    await page.evaluate(() => { window.__QA.pins = []; window.UsBacheca = { ...(window.UsBacheca || {}), pinThing: async (o) => { window.__QA.pins.push(o); return 'pinned'; } }; });
    await page.click('#usMese [data-um="pin"]');
    await page.waitForFunction(() => window.__QA.pins.length === 1);
    assert.deepEqual(await page.evaluate(() => ({ source: window.__QA.pins[0].source, id: window.__QA.pins[0].id })), { source: 'moment', id: '00000000-0000-4000-8000-000000000001' });
    await page.waitForFunction(() => document.querySelector('#usMese [data-um="pin"]').textContent === 'Già in bacheca');
    // Salva come immagine: one image 1080×1920.
    await recordShare(page);
    await page.click('#usMese [data-um="save"]');
    await page.waitForFunction(() => window.__QA.shared.length === 1, null, { timeout: 20000 });
    assert.deepEqual(await page.evaluate(() => window.__QA.shared[0].map((f) => [f.w, f.h, f.type])), [[1080, 1920, 'image/jpeg']]);

    // Back: the viewer, then the pack screen.
    await page.evaluate(() => window.UsMese.back());
    assert.equal(await page.locator('#usMese [data-um-l="viewer"]').isHidden(), true);
    // Share: a 9:16 carousel, answers and photos hidden until switched on, 11 images with the watermark.
    await page.click('#usMese [data-um="share"]');
    await page.waitForSelector('#usMese [data-um-l="share"]:not([hidden])');
    assert.deepEqual(await page.evaluate(() => { const l = document.querySelector('#usMese [data-um-l="share"]'); return [l.classList.contains('hide-answers'), l.classList.contains('hide-photos'), l.querySelector('[data-um="photos"]').checked, l.querySelector('[data-um="answers"]').checked]; }), [true, true, false, false]);
    assert.equal(await page.locator('#usMese .reel .slide').count(), 11);
    assert.equal(await page.locator('#usMese .reel .wm').innerText(), 'US · uscouple.app');
    const reel = await page.locator('#usMese .reel').boundingBox();
    assert.ok(Math.abs(reel.height / reel.width - 16 / 9) < 0.02, '9:16');
    await page.click('#usMese [data-um="go"]');
    await page.waitForFunction(() => window.__QA.shared.length === 2, null, { timeout: 60000 });
    const files = await page.evaluate(() => window.__QA.shared[1]);
    assert.equal(files.length, 11, 'the cover and one image per card');
    assert.ok(files.every((f) => f.w === 1080 && f.h === 1920));
    assert.equal(files[0].name, 'us-mese-00.jpg');
    // Back to Ricordi: October opened, no partner yet.
    await page.evaluate(() => window.UsMese.close());
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#ricordiCarte .slot.closed').count(), 0);
    assert.deepEqual(errors, []);
    await page.context().close();
  } finally { await h.close(); }
});

test('a month opened before: a card of a deleted memory is off; Back closes layer by layer', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, errors } = await mesePage(h, { width: 390, height: 844 });
    await openCarte(page);
    const gone = await page.evaluate(() => { const m = window.__QA.mese; const id = Object.keys(m.packs).find((k) => m.packs[k].cards.some((c) => c.gone)); return id; });
    await page.evaluate((id) => document.querySelector(`#ricordiCarte [data-uc-month="${id}"]`).click(), gone);
    await page.waitForSelector('#usMese [data-um-l="sheet"]:not([hidden])');
    assert.match(await page.locator('#usMese .um-sheet-l header').innerText(), /non c’è più/);
    await page.evaluate(() => document.querySelectorAll('#usMese .fan .mini')[4].click());
    await page.waitForSelector('#usMese [data-um-l="viewer"]:not([hidden])');
    assert.equal(await page.locator('#usMese .um-vbox .um-card.spenta').count(), 1);
    assert.equal(await page.locator('#usMese .um-vbox img').count(), 0, 'nothing of it is shown');
    assert.equal(await page.locator('#usMese .um-vbox .gone').innerText(), 'Questo ricordo non c’è più');
    assert.equal(await page.locator('#usMese [data-um="save"]').count(), 0);
    await page.keyboard.press('Escape');
    assert.ok(await page.locator('#usMese [data-um-l="viewer"]').isHidden());
    assert.ok(await page.locator('#usMese [data-um-l="sheet"]').isVisible());
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window.UsMese.isOpen()), false);
    assert.deepEqual(errors, []);
  } finally { await h.close(); }
});

test('360×640 and reduced motion: everything fits, no sideways page, the pack opens without tearing', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, errors } = await mesePage(h, { width: 360, height: 640, reduced: true });
    await openCarte(page);
    assert.ok(await noSideScroll(page));
    await openLastPack(page);
    const fits = async (sel) => page.locator(sel).evaluateAll((els) => els.every((e) => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1; }));
    assert.ok(await fits('#usMese .pack'), 'the pack');
    assert.ok(await fits('#usMese [data-um="open"]'), 'Apri senza strappare');
    await page.click('#usMese [data-um="open"]');
    await page.waitForFunction(() => document.querySelector('#usMese [data-um-part="pile"]')?.hidden === false);
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
    }
    await page.waitForSelector('#usMese [data-um-part="finale"]:not([hidden])', { timeout: 4000 });
    assert.ok(await fits('#usMese .actions'), 'the buttons of the end');
    await page.evaluate(() => document.querySelectorAll('#usMese .fan .mini')[9].click());
    assert.ok(await fits('#usMese .um-vbox'), 'the big card');
    assert.ok(await fits('#usMese [data-um="save"]'));
    assert.ok(await noSideScroll(page));
    assert.deepEqual(errors, []);
  } finally { await h.close(); }
});
