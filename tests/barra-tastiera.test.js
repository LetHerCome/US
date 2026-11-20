// Barra e tastiera (founder, 20/11/2026), after the barra a goccia:
// - off the four pages (Impostazioni) the ball sinks and the bar is flat, the
//   heart stays in the middle (no hole); back on a page the ball rises there;
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

test('Barra e tastiera browser: in Impostazioni the bar is flat with the heart; back on a page the ball rises', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    try {
      await page.waitForTimeout(500);
      await page.click('.dy-nav button[data-page="quiz"]'); await page.waitForTimeout(900);
      const state = () => page.evaluate(() => {
        const nav = document.querySelector('.dy-nav'), n = nav.getBoundingClientRect();
        const b = document.querySelector('circle.dy-nav-ball').getBoundingClientRect();
        const ys = (document.querySelector('.dy-nav-edge').getAttribute('d').match(/-?[\d.]+ (-?[\d.]+)/g) || []).map((p) => Number(p.split(' ')[1]));
        const heart = document.getElementById('thinkButton');
        return { ballTop: b.top - n.top, flat: Math.max(...ys) - Math.min(...ys), heart: getComputedStyle(heart).display !== 'none' && heart.getBoundingClientRect().width > 30 };
      });
      await page.evaluate(() => go('settings', { nav: true })); await page.waitForTimeout(700);
      const away = await state();
      assert.ok(away.ballTop > 0, 'the ball is under the edge (hidden in the bar)');
      assert.ok(away.flat < 0.5, 'the top edge is flat: no cradle where no page is yours');
      assert.ok(away.heart, 'the heart stays in the middle of the bar');
      await page.click('.dy-nav button[data-page="home"]'); await page.waitForTimeout(900);
      const back = await state();
      assert.ok(back.ballTop < 0, 'the ball floats again');
      const inside = await page.evaluate(() => {
        const b = document.querySelector('circle.dy-nav-ball').getBoundingClientRect();
        const i = document.querySelector('.dy-nav button.active .dy-nav-icon').getBoundingClientRect();
        const c = document.querySelector('.dy-nav button[data-page="home"]').getBoundingClientRect();
        return { dx: Math.abs(b.left + b.width / 2 - (c.left + c.width / 2)), ix: Math.abs(i.left + i.width / 2 - (b.left + b.width / 2)), iy: Math.abs(i.top + i.height / 2 - (b.top + b.height / 2)) };
      });
      assert.ok(inside.dx < 3 && inside.ix < 1.5 && inside.iy < 1.5, 'over Oggi, with its icon inside');
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
