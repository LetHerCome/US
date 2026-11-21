// Barra e tastiera (founder, 20/11/2026), after the barra a goccia:
// - off the four pages (Impostazioni) no place is marked, the heart stays in
//   the middle (no hole); back on a page its pill comes back (since 21/11 the
//   bar is a pill like the Claude app);
// - the keyboard: the diary name takes emoji, the CONFIRM fields keep their
//   capitals with no spellcheck on Android, a preset title is cut by
//   characters (an emoji is never cut in half).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, pageFor } = require('./helpers/countdown-browser');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Barra e tastiera static: no rule hides the heart in Impostazioni; the diary name takes emoji', () => {
  assert.doesNotMatch(read('settings2.css'), /#settings\.page\.active\) #thinkButton/);
  const tag = /<input id="mc3CoupleName"[^>]*>/.exec(read('index.html'))?.[0] || '';
  assert.ok(tag);
  assert.doesNotMatch(tag, /autocomplete="off"/);
  assert.match(read('app.js'), /if\(el\.getAttribute\?\.\('spellcheck'\)==='false'\|\|el\.getAttribute\?\.\('autocapitalize'\)==='characters'\)continue;/);
});

test('Barra e tastiera: a preset title is cut by characters, never in the middle of an emoji', () => {
  const src = read('calendar.js');
  assert.match(src, /Array\.from\(String\(title \?\? ''\)\.replace\(\/\\s\+\/g, ' '\)\.trim\(\)\)\.slice\(0, 30\)\.join\(''\)/);
  const title = 'a'.repeat(29) + '😀';
  assert.equal(Array.from(title).slice(0, 30).join(''), title, 'the emoji at the end stays whole');
  assert.notEqual(title.slice(0, 30), title, 'the old cut broke it');
});

test('Barra e tastiera browser: in Impostazioni no place is marked and the heart stays; back on a page it is marked', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    try {
      await page.waitForTimeout(500);
      await page.click('.dy-nav button[data-page="quiz"]'); await page.waitForTimeout(900);
      const state = () => page.evaluate(() => {
        const heart = document.getElementById('thinkButton');
        return { act: [...document.querySelectorAll('.dy-nav button[data-page].active')].map((x) => x.dataset.page), heart: getComputedStyle(heart).display !== 'none' && heart.getBoundingClientRect().width > 30 };
      });
      await page.evaluate(() => go('settings', { nav: true })); await page.waitForTimeout(700);
      const away = await state();
      assert.deepEqual(away.act, [], 'no place is yours in Impostazioni');
      assert.ok(away.heart, 'the heart stays in the middle of the bar');
      await page.click('.dy-nav button[data-page="home"]'); await page.waitForTimeout(900);
      assert.deepEqual((await state()).act, ['home'], 'Oggi is marked again');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  } finally { await h.close(); }
});

test('Barra e tastiera browser: on Android the CONFIRM fields keep capitals and no spellcheck', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx } = await pageFor(h, { width: 390, height: 844 });
    try {
      const got = await page.evaluate(() => {
        document.documentElement.classList.add('us-native-android');
        const was = window.UsPlatform; window.UsPlatform = { ...(was || {}), isNative: true };
        const box = document.createElement('div');
        box.innerHTML = '<input id="qaConfirm" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false"><textarea id="qaNote"></textarea>';
        document.body.appendChild(box);
        normalizeAndroidNaturalTextInputs(box);
        const a = (id) => { const el = document.getElementById(id); return { cap: el.getAttribute('autocapitalize'), spell: el.getAttribute('spellcheck'), corr: el.getAttribute('autocorrect') }; };
        const out = { confirm: a('qaConfirm'), note: a('qaNote') };
        box.remove(); window.UsPlatform = was; document.documentElement.classList.remove('us-native-android');
        return out;
      });
      assert.deepEqual(got.confirm, { cap: 'characters', spell: 'false', corr: null });
      assert.deepEqual(got.note, { cap: 'sentences', spell: 'true', corr: 'on' });
    } finally { await ctx.close(); }
  } finally { await h.close(); }
});
