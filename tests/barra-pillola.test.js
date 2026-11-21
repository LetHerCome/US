// La barra (founder, 21/11/2026: «la nav bar più semplice come quella di
// Claude»): a pill floating over the page, five places (Oggi, Noi, Ti penso,
// Ricordi, Gioca), icon and name, the page you are on in a soft pill; the Ti
// penso in the middle sent by holding the heart until it is full. It replaced
// the barra a goccia of 20/11 (the ball and the wave), which is in git history.
// Lasciato per te top left on Oggi and your character top right on every page.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, pageFor } = require('./helpers/countdown-browser');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Barra a pillola static: five places with the heart in the middle', () => {
  const html = read('index.html');
  const nav = html.match(/<nav class="dy-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  const order = [...nav.matchAll(/data-page="(\w+)"|id="(thinkButton)"/g)].map((m) => m[1] || m[2]);
  assert.deepEqual(order, ['home', 'bond', 'thinkButton', 'moments', 'quiz']);
  assert.doesNotMatch(nav, /dy-nav-bg|dy-nav-ball/, 'no ball, no wave');
  // Every place shows its name under the icon.
  assert.equal((nav.match(/<span class="nlabel">/g) || []).length, 4);
  assert.match(nav, /id="dyThinkFly"/);
  assert.doesNotMatch(nav, /onclick="sendThinkSignal\(\)"/, 'the heart is held, not clicked');
  const css = read('diario.css');
  assert.match(css, /\.dy-nav\{position:fixed;left:calc\(14px \+ var\(--us-safe-left\)\);right:calc\(14px \+ var\(--us-safe-right\)\);bottom:max\(12px,var\(--us-safe-bottom\)\);[^}]*grid-template-columns:1fr 1fr 60px 1fr 1fr;height:64px;[^}]*border-radius:32px;/);
  assert.match(css, /\.dy-nav button\{[^}]*color:var\(--us-ink-60\)/, 'the icons of the other pages are readable');
  assert.match(css, /\.dy-nav \.nlabel\{font:inherit;font-size:11px;/);
  assert.match(css, /\.dy-nav button\[data-page\]\.active\{background:var\(--us-ink-08\)\}/);
  assert.match(css, /\.dy-nav \.dy-nav-icon\{width:22px;height:22px;/);
  assert.doesNotMatch(read('diario.js'), /function goccia\(|GOCCIA_/, 'the goccia code is gone');
  // No page hides the heart any more (it was a floating button over the content).
  assert.doesNotMatch(read('games.css'), /#thinkButton\{display:none/);
  assert.doesNotMatch(read('moments-albums.css'), /body:has\(#moments\.page\.active\) #thinkButton/);
});

test('Barra a pillola static: Lasciato per te top left, you top right on every page', () => {
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

test('Barra a pillola browser: the pill follows the page, the heart sends only when held', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    try {
      await page.evaluate(() => {
        window.__sent = 0;
        window.sendThinkSignal = async () => { window.__sent += 1; return true; };
      });
      // The pill: it floats, names under the icons, the page you are on in a soft pill.
      const bar = () => page.evaluate(() => {
        const nav = document.querySelector('.dy-nav'), n = nav.getBoundingClientRect();
        const act = [...nav.querySelectorAll('button[data-page]')].filter((x) => x.classList.contains('active')).map((x) => x.dataset.page);
        const bg = getComputedStyle(nav.querySelector('button.active') || nav).backgroundColor;
        const label = nav.querySelector('button[data-page="bond"] .nlabel').getBoundingClientRect();
        return { left: n.left, right: innerWidth - n.right, bottom: innerHeight - n.bottom, h: n.height, act, bg, label: label.width > 10 && label.height > 8 };
      });
      await page.waitForTimeout(400);
      const b0 = await bar();
      assert.ok(b0.left >= 14 && b0.right >= 14 && b0.bottom >= 12, 'it floats, off the edges');
      assert.equal(b0.h, 64);
      assert.ok(b0.label, 'the names show under the icons');
      assert.deepEqual(b0.act, ['home']);
      assert.notEqual(b0.bg, 'rgba(0, 0, 0, 0)', 'the page you are on has its pill');
      for (const p of ['bond', 'moments', 'quiz']) {
        await page.click(`.dy-nav button[data-page="${p}"]`);
        await page.waitForTimeout(700);
        assert.deepEqual((await bar()).act, [p], `the pill moves to ${p}`);
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
