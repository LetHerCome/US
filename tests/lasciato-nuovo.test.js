// Lasciato per te nuovo (founder 25/11/2026, tavola «US · Lasciato per te»: «perfetto
// puoi unire»). Receiving: the sender's character, an envelope in their colour sealed
// with their shape, a sheet of paper (a polaroid, a bubble for a vocale). Writing: the
// paper stays, one thing can be added, its words travel with it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, pageFor } = require('./helpers/countdown-browser');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('markup: the cast, «Tienila», the paper first and four things to add', () => {
  const html = read('index.html');
  assert.match(html, /<div class="left-for-you-cast" id="leftForYouCast" aria-hidden="true"><\/div>/);
  assert.match(html, /<button type="button" id="leftForYouConserve">Tienila<\/button>/);
  const composer = html.slice(html.indexOf('id="leftForYouComposerOverlay"'), html.indexOf('id="leftForYouComposerSend"'));
  assert.ok(composer.indexOf('data-us-composer-panel="text"') < composer.indexOf('class="left-for-you-composer-kinds"'), 'the paper comes first');
  assert.match(composer, /data-us-composer-kind="text" hidden>Testo<\/button>/);
  for (const [kind, icon] of [['photo', 'image'], ['audio', 'microphone'], ['video', 'video-camera'], ['music', 'music-note']]) {
    assert.match(composer, new RegExp(`data-us-composer-kind="${kind}"><span class="us-icon" data-us-icon="${icon}"`), kind);
  }
});

test('logic: the paper stays, a second tap removes what was added, words travel with it', () => {
  const js = read('left-for-you.js');
  assert.match(js, /panel\.hidden = panel\.dataset\.usComposerPanel !== kind && panel\.dataset\.usComposerPanel !== 'text';/);
  assert.match(js, /setComposerKind\(composer\.kind === tab\.dataset\.usComposerKind \? 'text' : tab\.dataset\.usComposerKind\)/);
  assert.match(js, /return value \|\| paperText\(\) \|\| null;/);
  assert.match(js, /if \(kind === 'video' \|\| kind === 'music'\) body = paperText\(\) \|\| null;/);
  // It opens by itself after a moment, or at a tap on the seal; seen as before.
  assert.match(js, /letterTimer = setTimeout\(\(\) => openLetter\(scope\), 950\);/);
  assert.match(js, /if \(seal\) \{ clearTimeout\(letterTimer\); openLetter\(document\.getElementById\('leftForYouContent'\)\); return; \}/);
  assert.match(js, /function keepWord\(kind\) \{ return kind === 'text' \|\| kind === 'photo' \? 'Tienila' : 'Tienilo'; \}/);
});

test('in the app: Bea brings the letter, it opens into paper; the composer keeps the paper', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await page.waitForFunction(() => window.UsPersonaggi && window.openLeftForYou);
    await page.evaluate(() => {
      window.UsAngolo?.isola?.(false);
      window.__QA.tables.left_for_you = [{ id: 't1', kind: 'text', body: 'Ciao, ti penso', couple_id: window.__QA.tables.profiles[0].couple_id, sender_id: 'b1', recipient_id: window.__QA.me, media_path: null, created_at: new Date().toISOString(), seen_at: null }];
      window.__QA.rpc.mark_left_item_seen = async () => ({ data: [{ status: 'seen' }], error: null });
      window.openLeftForYou();
    });
    await page.waitForSelector('#leftForYouCast svg.us-char');
    await page.waitForSelector('#leftForYouContent .left-for-you-env-seal .us-char');
    await page.click('#leftForYouContent .left-for-you-env-seal');
    await page.waitForSelector('#leftForYouContent .left-for-you-env.is-open', { timeout: 10000 });
    assert.match(await page.locator('#leftForYouContent .left-for-you-env-letter').innerText(), /Ciao, ti penso/);
    assert.equal(await page.locator('#leftForYouConserve').innerText(), 'Tienila');
    await page.evaluate(() => { window.UsLeftForYou.close(); window.UsLeftForYou.openComposer({}); });
    await page.click('#leftForYouComposerOverlay [data-us-composer-kind="photo"]');
    assert.equal(await page.locator('#leftForYouComposerOverlay [data-us-composer-panel="text"]').isVisible(), true, 'the paper stays');
    assert.equal(await page.locator('#leftForYouComposerOverlay [data-us-composer-panel="photo"]').isVisible(), true);
    await page.click('#leftForYouComposerOverlay [data-us-composer-kind="photo"]');
    assert.equal(await page.locator('#leftForYouComposerOverlay [data-us-composer-panel="photo"]').isVisible(), false, 'a second tap takes it away');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});
