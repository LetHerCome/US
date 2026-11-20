// Il colore di noi (founder, 20/11/2026): B «con misura» with Gioca a tessere.
// The main action of a page is the couple blend, Gioca is a grid of pastel
// tiles, the night paper has a touch of plum, and every word written on a
// photo stays light and readable on a bright photo, in both themes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, qaFixture } = require('./helpers/countdown-browser');
const { FAKE_SUPABASE } = require('./helpers/oggi-browser');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Colore di noi: the tokens are one authority in ui-foundation.css', () => {
  const css = read('ui-foundation.css');
  assert.match(css, /--us-noi-grad:linear-gradient\(120deg,var\(--us-tu\),var\(--us-partner\)\);/);
  assert.match(css, /--us-noi-soft:color-mix\(/);
  assert.match(css, /--us-on-photo:#FBF8F1;/);
  for (let i = 1; i <= 6; i += 1) assert.match(css, new RegExp(`--us-game-${i}:#`));
  // The night paper: a touch of plum, in the automatic and the fixed dark theme.
  assert.equal((css.match(/--us-paper:#1A1419;--us-beige:#33272F;--us-card:#261D24;/g) || []).length, 2);
  assert.doesNotMatch(css, /#16130F/);
  assert.match(read('diario.js'), /isDark\(\) \? '#1A1419' : '#FAF7F1'/);
});

test('Colore di noi: main actions are the blend with dark text, Gioca is tiles', () => {
  const css = read('diario.css');
  assert.match(css, /\.dy-ib\.is-dark\{background:var\(--us-noi-grad\);color:var\(--us-on\)\}/);
  assert.match(css, /\.dy-btn-noi\{background:var\(--us-noi-grad\);color:var\(--us-on\)\}/);
  assert.match(css, /\.dy-card\.dy-question\{background:var\(--us-noi-soft\)\}/);
  assert.match(css, /\.dy-chip\[data-dy-who="tutti"\]\[aria-pressed="true"\]\{background:var\(--us-noi-grad\);color:var\(--us-on\)\}/);
  assert.match(css, /\.dy-notice-action\{[^}]*background:var\(--us-miele\);color:var\(--us-on\)/);
  assert.match(css, /\.dy-game-list\{display:grid;grid-template-columns:1fr 1fr;gap:10px\}/);
  assert.match(css, /\.dy-game:first-child\{grid-column:1\/-1;[^}]*background:var\(--us-noi-grad\)\}/);
  assert.match(read('diario.js'), /ghostBtn \? ' dy-btn-ghost' : ' dy-btn-noi'/);
  assert.match(read('couple-notes.css'), /\.us-noi-board-new\{[^}]*background:var\(--us-noi-grad\);color:var\(--us-on\)/);
  // A game not started says nothing: no «da giocare» repeated on every tile.
  assert.doesNotMatch(read('games.js'), /t\('da giocare'/);
});

test('Scritte sulle foto: light in both themes, never the paper colour', () => {
  const diario = read('diario.css');
  assert.match(diario, /\.dy-photo-cap\{[^}]*color:var\(--us-on-photo\);text-shadow:var\(--us-photo-shadow\)/);
  const ricordi = read('dc-ricordi.css');
  // --us-latte is the paper since the diario: dark at night. Text on the photo of the viewer must not use it.
  const viewerText = ricordi.split('\n').filter((l) => /#usAlbumOverlay\[data-us-galleria\] \.us-album-(title|byline|caption-postit|ask|carousel-status|place)/.test(l));
  assert.ok(viewerText.length >= 6);
  for (const line of viewerText) assert.doesNotMatch(line, /color:[^;]*var\(--us-latte\)/, line.slice(0, 90));
});

// A bright, almost white photo: the worst case for light text.
const BRIGHT = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe5f7"/><stop offset=".5" stop-color="#fbf6ea"/><stop offset="1" stop-color="#f6ecd8"/></linearGradient></defs><rect width="900" height="1200" fill="url(#g)"/></svg>').toString('base64');
const FAKE = FAKE_SUPABASE.replace(/const photo = \(\) => .*$/m, `const photo = () => ${JSON.stringify(BRIGHT)};`);

// Worst contrast of each text box against what is behind it (text hidden for the shot).
async function contrasts(page, selector) {
  const boxes = await page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && !e.closest('[hidden]') && e.textContent.trim(); }).map((e) => {
    const r = e.getBoundingClientRect(); const s = getComputedStyle(e); const color = s.color; const size = parseFloat(s.fontSize);
    e.style.setProperty('color', 'transparent', 'important'); e.style.setProperty('text-shadow', 'none', 'important');
    return { text: e.textContent.trim().slice(0, 30), x: r.left, y: r.top, w: r.width, h: r.height, color, size };
  }), selector);
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(async ({ shot, boxes }) => {
    const img = new Image(); img.src = `data:image/png;base64,${shot}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const k = img.width / innerWidth;
    const lum = (r, gg, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b); };
    const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    return boxes.map((b) => {
      const d = g.getImageData(b.x * k, b.y * k, Math.max(1, b.w * k), Math.max(1, b.h * k)).data; const L = [];
      for (let i = 0; i < d.length; i += 4) L.push(lum(d[i], d[i + 1], d[i + 2]));
      L.sort((x, y) => x - y);
      const m = b.color.match(/[\d.]+/g).map(Number); if (b.color.startsWith('color(')) { m[0] *= 255; m[1] *= 255; m[2] *= 255; }
      const alpha = m[3] ?? 1; const mid = L[L.length >> 1]; const t = lum(m[0], m[1], m[2]) * alpha + mid * (1 - alpha);
      return { text: b.text, size: b.size, worst: Math.min(ratio(t, L[Math.floor(L.length * 0.95)]), ratio(t, L[Math.floor(L.length * 0.05)])) };
    });
  }, { shot, boxes });
}

test('Scritte sulle foto: readable on a bright photo, in light and in dark', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    for (const colorScheme of ['light', 'dark']) {
      await t.test(colorScheme, async () => {
        const ctx = await h.browser.newContext({ locale: 'it-IT', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Rome', serviceWorkers: 'block', colorScheme });
        const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
        try {
          await page.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith(h.base)) return route.continue(); if (/supabase-js/.test(u)) return route.fulfill({ contentType: 'text/javascript', body: FAKE }); return route.abort(); });
          await page.addInitScript(qaFixture, { style: 'editorial', mode: 'days', unlocked: true, missing: false, started: '2022-06-23', active: 'custom' });
          await page.addInitScript(() => {
            const tb = window.__QA.tables; const c = tb.profiles[0].couple_id; const day = new Date().toISOString().slice(0, 10);
            tb.moments = [{ id: 'm0', couple_id: c, created_by: window.__QA.me, storage_path: 'c1/f0/qa.webp', moment_date: day, created_at: new Date().toISOString(), caption: 'Al mare, finalmente' }];
            tb.moment_photos = [{ id: 'p0', moment_id: 'm0', couple_id: c, storage_path: 'c1/f0/qa.webp', caption: 'Al mare, finalmente', position: 0, created_by: window.__QA.me }];
          });
          await page.goto(`${h.base}/?us-dev=1`, { waitUntil: 'load' });
          await page.waitForFunction(() => window.usProfile);
          await page.waitForTimeout(1800);
          const checks = [...await contrasts(page, '#dyPhotoCap')];
          await page.click('nav button[data-page="moments"]'); await page.waitForTimeout(700);
          await page.click('[data-dy-moment]'); await page.waitForTimeout(1200);
          checks.push(...await contrasts(page, '#usAlbumOverlay .us-album-title, #usAlbumOverlay .us-album-byline, #usAlbumOverlay .us-album-ask, #usAlbumOverlay .us-album-place'));
          assert.ok(checks.length >= 4, `texts measured: ${checks.map((c) => c.text).join(', ')}`);
          // WCAG AA: 4.5 for small text, 3 for large (24px and up).
          for (const c of checks) assert.ok(c.worst >= (c.size >= 24 ? 3 : 4.5), `«${c.text}» ${c.worst.toFixed(2)} on a bright photo`);
          assert.deepEqual(errors, []);
        } finally { await ctx.close(); }
      });
    }
  } finally { await h.close(); }
});
