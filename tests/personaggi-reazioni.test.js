// Personaggi, fase 3 (founder, 20/11/2026, D9 and D16): a few reactions over
// the face of Come stai (festa on your day, heart eyes after a Ti penso, the
// other waves when they answered, both sleepy at night), and the festa of an
// unlock on Oggi with «Mettilo», once per accessory, never a flood.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, pageFor } = require('./helpers/countdown-browser');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Reazioni static: the signal of the last Ti penso, the reactions only where asked, motion that can stop', () => {
  const app = read('app.js');
  assert.match(app, /if\(window\.usThinkLastReceivedAt!==lastReceivedAt\)\{window\.usThinkLastReceivedAt=lastReceivedAt;window\.dispatchEvent\(new Event\('us:think-updated'\)\);\}/);
  const js = read('diario.js');
  assert.match(js, /const REACTION_HOURS = 3;/);
  assert.match(js, /character\(role, \{ size: 34, react: true \}\)/, 'you, top right');
  assert.match(js, /reaction: ''\s*\}\);\n/, 'the wardrobe previews stay neutral');
  const css = read('diario.css');
  assert.match(css, /\.dy-wave\{[^}]*animation:dy-wave 1\.4s ease-in-out 2\}/, 'the wave does not loop forever');
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.dy-wave,\.dy-confetto\{animation:none\}\}/);
});

test('Reazioni browser: festa on the day, heart eyes after a Ti penso, the other waves, sleepy at night', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx } = await pageFor(h, { width: 390, height: 844 });
    try {
      const r = await page.evaluate(() => {
        const D = window.UsDiario, c = D.roles(), started = window.UsCoupleContext.snapshot().couple.started_on;
        const [y, m, d] = started.split('-').map(Number);
        const at = (Y, M, Dd, H) => new Date(Y, M - 1, Dd, H, 0, 0);
        const out = {};
        window.usThinkLastReceivedAt = '';
        out.mesiversario = D.reactionOf(c.myRole, at(2026, 11, d, 15));
        out.anniversario = D.reactionOf(c.partnerRole, at(2026, m, d, 15));
        out.giornoNormale = D.reactionOf(c.myRole, at(2026, 11, d === 10 ? 11 : 10, 15));
        out.sera = D.reactionOf(c.myRole, at(2026, 11, d === 10 ? 11 : 10, 23));
        const noon = at(2026, 11, d === 10 ? 11 : 10, 12);
        window.usThinkLastReceivedAt = new Date(noon.getTime() - 3600e3).toISOString();
        out.cuore = D.reactionOf(c.myRole, noon);
        out.cuoreSoloMio = D.reactionOf(c.partnerRole, noon);
        window.usThinkLastReceivedAt = new Date(noon.getTime() - 4 * 3600e3).toISOString();
        out.cuorePassato = D.reactionOf(c.myRole, noon);
        const saved = { st: window.todayState, q: window.todayQuestion };
        window.todayQuestion = saved.q || { id: 'q1', question: 'x' };
        window.todayState = { partner_has_answer: true, both_answered: false, my_answer: null };
        out.saluta = D.reactionOf(c.partnerRole, noon);
        window.todayState = saved.st; window.todayQuestion = saved.q;
        return out;
      });
      assert.equal(r.mesiversario, 'festa');
      assert.equal(r.anniversario, 'festa');
      assert.equal(r.giornoNormale, '');
      assert.equal(r.sera, 'sera');
      assert.equal(r.cuore, 'cuore');
      assert.equal(r.cuoreSoloMio, '', 'the heart eyes are mine, not the other\'s');
      assert.equal(r.cuorePassato, '', 'after three hours it is gone');
      assert.equal(r.saluta, 'saluta');
    } finally { await ctx.close(); }
  } finally { await h.close(); }
});

test('Reazioni browser: the festa of an unlock, «Mettilo» wears it, then it is gone; first time no flood', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    try {
      // First time on this phone: what is already open counts as seen.
      assert.equal(await page.locator('#dyUnlock').count(), 0);
      await page.evaluate(() => { localStorage.setItem(`us:look:seen:v1:${window.usProfile.id}`, JSON.stringify(['occhiali'])); window.dispatchEvent(new Event('us:progression-updated')); });
      await page.waitForTimeout(400);
      const item = await page.locator('#dyUnlock').getAttribute('data-item');
      assert.equal(item, 'corona', 'several at once: the highest threshold');
      await page.click('[data-dy-unlock="wear"]'); await page.waitForTimeout(500);
      assert.equal(await page.locator('#dyUnlock').count(), 0, 'one festa, the rest counted as seen');
      assert.equal(await page.evaluate(() => window.UsDiario.lookOf(window.UsDiario.roles().myRole).head), 'corona');
      await page.evaluate(() => window.dispatchEvent(new Event('us:progression-updated'))); await page.waitForTimeout(300);
      assert.equal(await page.locator('#dyUnlock').count(), 0, 'never twice');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  } finally { await h.close(); }
});
