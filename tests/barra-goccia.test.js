// La barra a goccia (founder, 20/11/2026): five places (Oggi, Noi, Ti penso,
// Ricordi, Gioca), 56 px plus the gesture strip, icons only, a ball floating in
// a round cradle with the icon of the page you are on (it sinks, slides as a
// wave and rises again under the new tab, like the founder's video), the Ti penso in the middle sent by holding the heart until
// it is full, Lasciato per te top left on Oggi and your character top right on
// every page (profile and Impostazioni; the gear left Noi).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, pageFor } = require('./helpers/countdown-browser');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Barra a goccia static: five places with the heart in the middle', () => {
  const html = read('index.html');
  const nav = html.match(/<nav class="dy-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  const order = [...nav.matchAll(/data-page="(\w+)"|id="(thinkButton)"/g)].map((m) => m[1] || m[2]);
  assert.deepEqual(order, ['home', 'bond', 'thinkButton', 'moments', 'quiz']);
  assert.match(nav, /<svg class="dy-nav-bg" aria-hidden="true" focusable="false">.*<g class="dy-nav-shape"><path class="dy-nav-fill"\/><circle class="dy-nav-ball"\/><\/g><path class="dy-nav-edge"\/><circle class="dy-nav-ball"\/><circle class="dy-nav-ball-edge" mask="url\(#dyNavMask\)"\/><\/svg>/);
  // Every place keeps its name for screen readers; on screen only the icons.
  assert.equal((nav.match(/<span class="nlabel">/g) || []).length, 4);
  assert.match(nav, /id="dyThinkFly"/);
  assert.doesNotMatch(nav, /onclick="sendThinkSignal\(\)"/, 'the heart is held, not clicked');
  const css = read('diario.css');
  assert.match(css, /\.dy-nav\{[^}]*grid-template-columns:1fr 1fr 86px 1fr 1fr;/);
  assert.match(css, /\.dy-nav button\{[^}]*color:var\(--us-ink-60\)/, 'the icons of the other pages are readable');
  assert.match(css, /\.dy-nav \.nlabel\{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset\(50%\)/);
  assert.match(css, /\.dy-nav button\.active \.dy-nav-icon\{transform:translateY\(var\(--dy-ball-dy,-16px\)\)/);
  assert.match(css, /\.dy-nav\.is-moving button\[data-page\] \.dy-nav-icon,\.dy-nav\.is-moving \.dy-think\{transition:none\}/);
  assert.match(read('ui-foundation.css'), /--us-nav-height:50px;/);
  assert.match(read('ui-foundation.css'), /--us-nav-rise:16px;/);
  // No page hides the heart any more (it was a floating button over the content).
  assert.doesNotMatch(read('games.css'), /#thinkButton\{display:none/);
  assert.doesNotMatch(read('moments-albums.css'), /body:has\(#moments\.page\.active\) #thinkButton/);
});

test('Barra a goccia static: Lasciato per te top left, you top right on every page', () => {
  const html = read('index.html');
  const head = html.match(/<header class="dy-head">[\s\S]*?<\/header>/)?.[0] || '';
  assert.ok(head.indexOf('id="leftForYouPartnerEntry"') < head.indexOf('class="dy-mark"'));
  assert.ok(head.indexOf('class="dy-mark"') < head.indexOf('data-dy-me'));
  assert.doesNotMatch(head, /thinkButton/);
  // Oggi, Noi, Ricordi in the page; Gioca in its hub.
  assert.equal((html.match(/data-dy-me onclick="go\('settings',\{nav:true\}\)"/g) || []).length, 3);
  assert.match(read('games.js'), /class="dy-ib dy-me" data-dy-me onclick="go\('settings',\{nav:true\}\)"/);
  assert.doesNotMatch(html, /aria-label="Impostazioni"><svg/, 'the gear left Noi');
});

const tap = async (page, sel, hold) => {
  const b = await page.locator(sel).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down(); await page.waitForTimeout(hold); await page.mouse.up();
};

test('Barra a goccia browser: the hill follows the page, the heart sends only when held', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    try {
      await page.evaluate(() => {
        window.__sent = 0;
        window.sendThinkSignal = async () => { window.__sent += 1; return true; };
      });
      // The ball: where it is, and whether it floats over the bar with the icon inside.
      const ball = () => page.evaluate(() => {
        const nav = document.querySelector('.dy-nav');
        const b = document.querySelector('circle.dy-nav-ball').getBoundingClientRect();
        const n = nav.getBoundingClientRect();
        const i = document.querySelector('.dy-nav button.active .dy-nav-icon').getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2, d: b.width, top: n.top, ix: i.left + i.width / 2, iy: i.top + i.height / 2, moving: nav.classList.contains('is-moving') };
      });
      const peakX = async () => (await ball()).x;
      const centre = (page_) => page.evaluate((p) => { const b = document.querySelector(`.dy-nav button[data-page="${p}"]`).getBoundingClientRect(); return b.left + b.width / 2; }, page_);
      await page.waitForTimeout(400);
      assert.ok(Math.abs(await peakX() - await centre('home')) < 3, 'the ball starts over Oggi');
      const b0 = await ball();
      assert.ok(Math.abs(b0.d - 54) < 1, 'a ball of 54 px, as in the video');
      assert.ok(b0.y > b0.top && b0.y - b0.d / 2 < b0.top - 12, 'it sits deep in the bar, its top rising over the edge');
      assert.ok(Math.abs(b0.ix - b0.x) < 1.5 && Math.abs(b0.iy - b0.y) < 1.5, 'the icon of the page is inside the ball');
      for (const p of ['bond', 'moments', 'quiz']) {
        await page.click(`.dy-nav button[data-page="${p}"]`);
        await page.waitForTimeout(1300);
        const b = await ball();
        assert.ok(Math.abs(b.x - await centre(p)) < 3, `the ball settles over ${p}`);
        assert.ok(!b.moving && Math.abs(b.ix - b.x) < 1.5 && Math.abs(b.iy - b.y) < 1.5, `the ${p} icon is back inside the ball`);
        assert.ok(await page.locator('#thinkButton').isVisible(), `the heart is in the bar on ${p}`);
        assert.ok(await page.locator(`#${p} [data-dy-me] svg`).count() >= 1, `your character is top right on ${p}`);
      }
      await page.click('.dy-nav button[data-page="home"]'); await page.waitForTimeout(900);
      // A quick tap does not send; it says how.
      await tap(page, '#thinkButton', 120);
      await page.waitForTimeout(300);
      assert.equal(await page.evaluate(() => window.__sent), 0);
      assert.match(await page.locator('#dyToast').innerText(), /Tieni premuto il cuore/);
      // Holding fills the heart and sends once.
      await tap(page, '#thinkButton', 900);
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.__sent), 1);
      // Keyboard and screen readers send at once (after fix4's 650 ms double-tap guard).
      await page.waitForTimeout(700);
      await page.focus('#thinkButton'); await page.keyboard.press('Enter');
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.__sent), 2);
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  } finally { await h.close(); }
});
