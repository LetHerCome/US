// Accessibilità (founder, 20/11/2026): the text follows the phone's font size
// (Android text zoom, iPhone Dynamic Type), the grey text reads at 4.5:1 in
// both themes, very large text never leaves its box, the Ti penso says what a
// screen reader does with it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, pageFor } = require('./helpers/countdown-browser');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Accessibilità static: the phone font size reaches the WebView on Android and iPhone', () => {
  const view = read('android/app/src/main/java/com/usapp/us/UsWebView.java');
  assert.match(view, /getSettings\(\)\.setTextZoom\(Math\.max\(85, Math\.min\(200, Math\.round\(fontScale \* 100\)\)\)\);/);
  const platform = read('platform.js');
  assert.match(platform, /font:-apple-system-body/);
  assert.match(platform, /el\.style\.setProperty\('-webkit-text-size-adjust', pct\)/);
  assert.match(platform, /addEventListener\('visibilitychange', \(\) => \{ if \(!document\.hidden\) applyIosTextSize\(\); \}\)/);
});

test('Accessibilità static: readable sizes and colours, wrapping titles, a one-column Gioca for large text', () => {
  const css = read('diario.css');
  assert.match(css, /\.dy-tag-s\{[^}]*font-size:12px\}/);
  assert.match(css, /\.dy-cal-wd\{font:700 12px\/1\.4 var\(--us-font-ui\);color:var\(--us-ink-60\)/);
  assert.match(css, /\.dy-cal-day\.is-past \.dy-cal-n\{color:color-mix\(in srgb,var\(--us-ink-100\) 64%,transparent\)\}/);
  assert.match(css, /\.dy-hd \.dy-h2\{min-width:0;[^}]*overflow-wrap:break-word;hyphens:auto\}/);
  assert.match(css, /\.dy-game-list\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,max\(140px,9\.5em\)\),1fr\)\);gap:10px\}/);
  assert.match(read('lavagna.css'), /\.us-lav-tile-label\{[^}]*color:var\(--us-on-photo\)/);
  assert.match(read('couple-notes.css'), /\.us-postit :is\(\.us-notes-title,\.us-notes-text,\.us-notes-item-text\):focus-visible\{/);
  const heart = /<button type="button" id="thinkButton"[^>]*>/.exec(read('index.html'))?.[0] || '';
  assert.match(heart, /aria-label="Manda un Ti penso"/, 'a screen reader activates it and it sends');
  // Since 21/11/2026 a tap sends it, for everyone: nothing more to explain.
  assert.doesNotMatch(heart, /tieni premuto/);
  assert.match(read('i18n.js'), /const ATTRS = \['placeholder', 'aria-label', 'aria-description', 'title', 'alt'\];/);
});

const contrast = (page) => page.evaluate(() => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (m) { const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; } const k = c.match(/color\(srgb ([^)]+)\)/); const p = k[1].split(/[\s/]+/).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
  const bgOf = (el) => { const st = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c[3] > 0) { st.push(c); if (c[3] >= 1) break; } } let bg = [255, 255, 255]; for (const c of st.reverse()) bg = over(c, bg); return bg; };
  const ratio = (el) => { const bg = bgOf(el), c = over(parse(getComputedStyle(el).color), bg), a = lum(c), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const past = document.querySelector('.dy-cal-day.is-past .dy-cal-n'), wd = document.querySelector('.dy-cal-wd');
  return { past: past ? ratio(past) : null, weekday: wd ? ratio(wd) : null };
});

test('Accessibilità browser: past days and weekday letters read at 4.5:1 in both themes', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    for (const scheme of ['light', 'dark']) {
      const { page, ctx } = await pageFor(h, { width: 390, height: 844 });
      try {
        await page.emulateMedia({ colorScheme: scheme });
        await page.click('.dy-nav button[data-page="bond"]'); await page.waitForTimeout(900);
        const r = await contrast(page);
        if (r.past != null) assert.ok(r.past >= 4.5, `${scheme}: past day ${r.past.toFixed(2)}`);
        assert.ok(r.weekday >= 4.5, `${scheme}: weekday ${r.weekday?.toFixed(2)}`);
      } finally { await ctx.close(); }
    }
  } finally { await h.close(); }
});

test('Accessibilità browser: at the phone\'s largest text Gioca is one tile a row, at normal text two', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx } = await pageFor(h, { width: 390, height: 844 });
    try {
      await page.click('.dy-nav button[data-page="quiz"]'); await page.waitForTimeout(900);
      const cols = () => page.evaluate(() => getComputedStyle(document.querySelector('#quiz .dy-game-list')).gridTemplateColumns.split(' ').length);
      assert.equal(await cols(), 2);
      // Android text zoom at 200%: every font size doubled.
      await page.evaluate(() => { const all = [...document.querySelectorAll('body *')]; const fs = all.map((el) => getComputedStyle(el).fontSize); all.forEach((el, i) => { el.style.fontSize = (parseFloat(fs[i]) * 2) + 'px'; }); });
      assert.equal(await cols(), 1);
      const spill = await page.evaluate(() => [...document.querySelectorAll('#quiz .dy-game')].filter((g) => g.scrollWidth > g.clientWidth + 1).length);
      assert.equal(spill, 0, 'no word leaves its tile');
    } finally { await ctx.close(); }
  } finally { await h.close(); }
});
