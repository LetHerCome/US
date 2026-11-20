// Oggi is one page (founder, 20/11/2026: «la home deve essere una pagina unica
// senza scorrere»). In the real app with the fake Supabase, on Android-sized
// screens with a status bar and a gesture bar, for every state of the question
// of today: the document is never taller than the screen, the photo keeps a
// usable size and every button of the question and of the notice sits above
// the bottom bar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, pageFor } = require('./helpers/countdown-browser');

test('Oggi static: the column fills the screen and the photo takes what is left', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'diario.css'), 'utf8');
  assert.match(css, /\.dy-oggi\{box-sizing:border-box;display:flex;flex-direction:column;min-height:calc\(var\(--us-viewport-height,100dvh\) - var\(--us-safe-top\)\)/);
  assert.match(css, /\.dy-stage\{position:relative;flex:1 1 0;min-height:220px/);
  // In the app #home starts under the status bar (native-frameless.css): the column is the whole screen.
  const native = fs.readFileSync(path.join(__dirname, '..', 'native-frameless.css'), 'utf8');
  assert.match(native, /html\.us-native \.dy-oggi \{\s*min-height: var\(--us-viewport-height, 100dvh\);/);
  assert.doesNotMatch(css, /\.dy-photo\{[^}]*height:362px/);
});

const STATES = {
  answer: { my_answer: null, partner_has_answer: false, both_answered: false },
  invited: { my_answer: null, partner_has_answer: true, both_answered: false },
  waiting: { my_answer: 'La passeggiata al mare quando ci siamo raccontati tutto fino a tardi, e poi il gelato', partner_has_answer: false, both_answered: false },
  unread: { my_answer: 'La passeggiata al mare', partner_has_answer: true, both_answered: true, partner_answer: 'La cena da tua nonna' },
  ready: { my_answer: 'La passeggiata al mare quando ci siamo raccontati tutto fino a tardi', partner_has_answer: true, both_answered: true, partner_answer: 'La cena da tua nonna, con tutti, e la torta bruciata che abbiamo mangiato lo stesso' }
};
const VIEWPORTS = [[360, 780], [390, 844], [412, 915]];

test('Oggi geometry: one page without scrolling, buttons above the bar', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    for (const [name, state] of Object.entries(STATES)) {
      for (const [width, height] of VIEWPORTS) {
        await t.test(`${name} @ ${width}x${height}`, async () => {
          const { page, ctx, errors } = await pageFor(h, { width, height });
          try {
            // The Android app: the native bundle adds native-frameless.css (scripts/build-capacitor-web.mjs).
            await page.addStyleTag({ url: '/native-frameless.css' });
            await page.evaluate(({ state, name }) => {
              document.documentElement.classList.add('us-native', 'us-native-android');
              document.documentElement.style.setProperty('--us-safe-top', '32px');
              document.documentElement.style.setProperty('--us-safe-bottom', '24px');
              window.__QA.rpc.get_daily_state = async () => ({ data: state, error: null });
              window.__QA.rpc.get_daily_reveal_meta = async () => ({ data: { question_id: 'dq1', both_answered: state.both_answered, my_reveal_seen_at: name === 'ready' ? '2026-11-20T08:00:00Z' : null }, error: null });
              return window.hydrateToday?.();
            }, { state, name });
            await page.waitForTimeout(900);
            const m = await page.evaluate(() => {
              const nav = document.querySelector('.dy-nav').getBoundingClientRect();
              const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden'; };
              const buttons = [...document.querySelectorAll('#dyQuestion button, #dyMore button')].filter(visible).map((el) => el.getBoundingClientRect().bottom);
              return { scrollHeight: document.scrollingElement.scrollHeight, innerHeight, navTop: nav.top, buttons, photo: document.getElementById('dyPhoto').getBoundingClientRect().height, question: !document.getElementById('dyQuestion').hidden };
            });
            assert.ok(m.question, 'the question of today is on Oggi');
            assert.ok(m.scrollHeight <= m.innerHeight, `Oggi scrolls: ${m.scrollHeight} > ${m.innerHeight}`);
            assert.ok(m.photo >= 200, `photo too small: ${m.photo}`);
            assert.ok(m.buttons.length >= 1);
            for (const bottom of m.buttons) assert.ok(bottom <= m.navTop + 0.5, `a button under the bar: ${bottom} > ${m.navTop}`);
            assert.deepEqual(errors, []);
          } finally { await ctx.close(); }
        });
      }
    }
  } finally { await h.close(); }
});

test('Oggi geometry on the web (the staging site in a phone browser): one page too', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    for (const [width, height] of [[360, 640], [390, 664]]) {
      const { page, ctx, errors } = await pageFor(h, { width, height });
      try {
        await page.evaluate(() => window.hydrateToday?.());
        await page.waitForTimeout(700);
        const m = await page.evaluate(() => ({ scrollHeight: document.scrollingElement.scrollHeight, innerHeight, navTop: document.querySelector('.dy-nav').getBoundingClientRect().top, answer: document.querySelector('#dyQuestion [data-dy="answer"]')?.getBoundingClientRect().bottom }));
        assert.ok(m.scrollHeight <= m.innerHeight, `${width}x${height}: Oggi scrolls ${m.scrollHeight} > ${m.innerHeight}`);
        assert.ok(m.answer && m.answer <= m.navTop + 0.5, `${width}x${height}: «Rispondi» under the bar`);
        assert.deepEqual(errors, []);
      } finally { await ctx.close(); }
    }
  } finally { await h.close(); }
});
