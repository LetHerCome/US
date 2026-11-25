// Apertura A (founder 25/11/2026, tavola «US · Icona e apertura»: «La A»): after
// the Android splash, your two characters lean out from behind the logo, a heart
// and «il vostro spazio», then the app. The characters come from the phone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, pageFor } = require('./helpers/countdown-browser');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('the opening: logo, the two slots, the heart and the words; only safe saved characters', () => {
  const html = read('index.html');
  assert.match(html, /<div class="us-launch-intro" id="usLaunchIntro" aria-hidden="true"><span class="stage"><span class="duo"><span class="me"><\/span><span class="them"><\/span><\/span><span class="logo"><\/span><svg class="heart"[^>]*>.*?<\/svg><\/span><p class="word">il vostro spazio<\/p><\/div>/);
  assert.match(html, /svg\.startsWith\('<svg class="us-char'\) && !\/<script\|<foreignObject\|<image\|\\son\[a-z\]\+\\s\*=\|javascript:\|href\\s\*=\/i\.test\(svg\)/);
  assert.match(html, /else slots\?\.remove\(\);/, 'no characters saved yet: the logo alone');
  const p = read('personaggi.js');
  assert.match(p, /w\.localStorage\.setItem\('us:launch-duo:v1', JSON\.stringify\(duo\)\);/);
  assert.match(p, /if \(!profileOf\(me\) \|\| !profileOf\(them\)\) return;/, 'only a couple of two');
  assert.match(read('app.js'), /'us:launch-duo:v1'\n  \];/, 'signing out forgets them');
});

test('in the installed app: the two lean out, then the opening goes away', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await page.waitForFunction(() => localStorage.getItem('us:launch-duo:v1'), null, { timeout: 15000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('us:launch-duo:v1')));
    assert.doesNotMatch(saved.me + saved.them, /var\(--/, 'colours resolved when saved');
    await page.addInitScript((duo) => {
      localStorage.setItem('us:launch-duo:v1', JSON.stringify(duo));
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q) => (q === '(display-mode: standalone)' ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : real(q));
    }, saved);
    await page.reload();
    await page.waitForSelector('html.us-launch-play #usLaunchIntro .duo .me svg.us-char', { state: 'attached', timeout: 5000 });
    assert.equal(await page.locator('#usLaunchIntro .duo .them svg.us-char').count(), 1);
    await page.waitForFunction(() => !document.getElementById('usLaunchIntro') && !document.documentElement.classList.contains('us-launch-play'), null, { timeout: 5000 });
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});
