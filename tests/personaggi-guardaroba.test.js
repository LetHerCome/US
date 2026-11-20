// Personaggi: il guardaroba e l'angolo di noi (founder, 20–21/11/2026,
// grill-me D3–D19, tavola approvata). One thing on the head, one on the face
// or at the neck, unlocked by the couple's points on thresholds of their own
// or by real moments; the angolo di noi replaces «Voi due».
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, pageFor } = require('./helpers/countdown-browser');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Guardaroba static: the same places, thresholds and moments as the server', () => {
  const js = read('diario.js');
  const sql = read('supabase/migrations/20261120232852_personaggi_guardaroba.sql');
  assert.match(js, /const LOOK_HEAD = Object\.freeze\(\['cappello', 'fiocco', 'cuffie', 'corona', 'coroncina', 'festa', 'cento'\]\);/);
  assert.match(js, /const LOOK_FACE = Object\.freeze\(\['occhiali', 'sole', 'sciarpina', 'gala', 'macchinetta'\]\);/);
  const points = Object.fromEntries([...js.match(/const LOOK_POINTS = Object\.freeze\(\{([^}]+)\}\)/)[1].matchAll(/(\w+): (\d+)/g)].map((m) => [m[1], Number(m[2])]));
  const server = Object.fromEntries([...sql.matchAll(/\('(\w+)', (\d+)\)/g)].map((m) => [m[1], Number(m[2])]));
  assert.deepEqual(points, server, 'client and server thresholds match');
  assert.deepEqual(points, { occhiali: 150, cappello: 400, fiocco: 700, sciarpina: 1000, sole: 1350, gala: 1700, cuffie: 2100, coroncina: 2550, corona: 3000 });
  assert.match(sql, /select 'macchinetta' where exists/);
  assert.match(sql, /interval '100 days'/);
  assert.match(sql, /interval '365 days'/);
  // Read on both phones; an older server is read as before.
  assert.match(read('app.js'), /select\('id,display_name,role,couple_id,person_color,character_shape,character_head,character_face'\)/);
  // «Voi due» became the angolo di noi; the old level-based preview is gone.
  assert.match(js, /id="dyVoiDueTitle">L’angolo <em>di noi<\/em><\/h2>/);
  assert.doesNotMatch(js, /const ACCESSORIES =/);
  assert.match(read('index.html'), /id="dyDuo" aria-label="L’angolo di noi"/);
  assert.match(read('settings.js'), /window\.UsSettingsPage=\{paint:paintSettingsPage,action:\(name\)=>action\(name\)\};/);
});

test('Guardaroba browser: dress your character, everyone sees it; locked things say how they unlock', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    try {
      await page.click('#dyDuo'); await page.waitForTimeout(1000);
      assert.match(await page.locator('#dyVoiDueTitle').innerText(), /L’angolo di noi/);
      // The couple here has many points: the Sintonia series is open, the moments of the years are not.
      const lockedFesta = await page.locator('[data-dy-look="head:festa"]').getAttribute('aria-disabled');
      assert.equal(lockedFesta, 'true');
      assert.match(await page.locator('[data-dy-look="head:festa"] small').innerText(), /il primo anno in US/);
      await page.click('[data-dy-look="head:cappello"]'); await page.waitForTimeout(400);
      await page.click('[data-dy-look="face:occhiali"]'); await page.waitForTimeout(400);
      assert.equal(await page.locator('[data-dy-look="head:cappello"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-dy-look="face:occhiali"]').getAttribute('aria-pressed'), 'true');
      // A locked one does not change anything.
      await page.locator('[data-dy-look="head:festa"]').dispatchEvent('click'); await page.waitForTimeout(300);
      assert.equal(await page.locator('[data-dy-look="head:cappello"]').getAttribute('aria-pressed'), 'true');
      // The peek at the other: how they are, what they wear, a Ti penso.
      await page.click('[data-dy="peek"]'); await page.waitForTimeout(300);
      assert.match(await page.locator('.dy-peek').innerText(), /Come sta:[\s\S]*Indossa:/);
      await page.evaluate(() => document.querySelector('#dyVoiDue [data-dy="close"].dy-close')?.click()); await page.waitForTimeout(500);
      // Oggi's duo and the top right character wear it (one more path each: the hat's pompon is the 8.5px wide ellipse at y-24).
      const worn = await page.evaluate(() => ({
        duo: document.querySelector('#dyDuo').innerHTML.includes('#F7B58E'),
        me: [...document.querySelectorAll('[data-dy-me]')].some((el) => el.innerHTML.includes('#F7B58E')),
      }));
      assert.deepEqual(worn, { duo: true, me: true });
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  } finally { await h.close(); }
});
