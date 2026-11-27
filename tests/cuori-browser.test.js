// I cuori (founder, 27/11/2026, prototype https://claude.ai/artifact/2NXZSrS4EypVcsAVBNDRVy),
// in the real app with the fake Supabase: Ti penso ×N («Uno solo ×N»), the
// reply heart that stays and grows («Resta e cresce») and the hug drawn with
// the couple's own characters.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, pageFor } = require('./helpers/countdown-browser');

const recordThinks = (page) => page.evaluate(() => {
  window.__QA.thinks = [];
  window.__QA.rpc.send_think = async (args) => { window.__QA.thinks.push(args); return { data: [{ message_id: `m${window.__QA.thinks.length}`, duplicate: false }], error: null }; };
  // Every canvas of little hearts that reaches the page.
  window.__QA.canvases = 0;
  new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => { if (n.classList?.contains('us-hearts-fx')) window.__QA.canvases++; }))).observe(document.body, { childList: true });
});
const tap = async (page, times) => { for (let i = 0; i < times; i++) await page.click('#thinkButton', { delay: 0 }); };

test('Ti penso ×N: five quick taps send ONE Ti penso with 5 taps; ×5 shows, then clears; the toast says ×5', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await recordThinks(page);
    await tap(page, 5);
    assert.equal(await page.locator('#thinkButton .us-nav-combo').innerText(), '×5');
    assert.ok(await page.locator('#thinkButton .us-nav-combo').isVisible(), 'the number above the heart');
    assert.equal(await page.evaluate(() => window.__QA.thinks.length), 0, 'nothing leaves while the taps go on');
    assert.ok(await page.evaluate(() => window.__QA.canvases) >= 1, 'little hearts on the canvas');
    assert.equal(await page.locator('#thinkButton').isDisabled(), false, 'the heart is never disabled during a combo');
    await page.waitForFunction(() => window.__QA.thinks.length === 1, null, { timeout: 5000 });
    const sent = await page.evaluate(() => window.__QA.thinks);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].p_taps, 5);
    assert.match(sent[0].operation_id, /^[0-9a-f-]{36}$/);
    await page.waitForFunction(() => /Ti penso ×5 inviato a Beatrice/.test(document.getElementById('toast')?.textContent || ''));
    await page.waitForFunction(() => document.querySelector('#thinkButton .us-nav-combo')?.hidden === true, null, { timeout: 3000 });
    // A single tap afterwards: a new Ti penso of 1, the old call shape (no p_taps).
    await tap(page, 1);
    await page.waitForFunction(() => window.__QA.thinks.length === 2, null, { timeout: 5000 });
    assert.equal('p_taps' in (await page.evaluate(() => window.__QA.thinks[1])), false);
    await page.waitForFunction(() => /^Ti penso inviato a Beatrice$/.test(document.querySelector('#toast .us-toast-text')?.textContent || ''));
    assert.notEqual((await page.evaluate(() => window.__QA.thinks))[0].operation_id, (await page.evaluate(() => window.__QA.thinks))[1].operation_id);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});

test('Ti penso ×N with reduced motion: the bounce and the number, no canvas of little hearts', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844, reduced: true });
    await recordThinks(page);
    await tap(page, 3);
    assert.equal(await page.locator('#thinkButton .us-nav-combo').innerText(), '×3');
    assert.equal(await page.evaluate(() => window.UsUiFoundation.heartSpray(document.getElementById('thinkButton'), { level: 3 })), false);
    await page.waitForFunction(() => window.__QA.thinks.length === 1, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => window.__QA.thinks[0].p_taps), 3);
    assert.equal(await page.evaluate(() => window.__QA.canvases + document.querySelectorAll('.us-hearts-fx').length), 0, 'no canvas work at all');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});

async function openReveal(page) {
  await page.evaluate(() => {
    const q = window.todayQuestion;
    window.__QA.rpc.get_daily_state = async () => ({ data: { my_answer: 'La passeggiata', partner_has_answer: true, both_answered: true, partner_answer: 'La nostra serata' }, error: null });
    window.__QA.meta = { question_id: q.id, both_answered: true, my_reveal_seen_at: new Date().toISOString(), my_reaction: null, partner_reaction: null };
    window.__QA.reactions = [];
    window.__QA.rpc.get_daily_reveal_meta = async () => ({ data: { ...window.__QA.meta }, error: null });
    window.__QA.rpc.mark_daily_reveal_seen = async () => ({ data: { ...window.__QA.meta }, error: null });
    window.__QA.rpc.set_daily_answer_reaction = async ({ target_reaction }) => {
      window.__QA.reactions.push(target_reaction);
      window.__QA.meta = { ...window.__QA.meta, my_reaction: target_reaction };
      return { data: { ...window.__QA.meta }, error: null };
    };
    window.openToday();
  });
  await page.waitForSelector('#todayReveal [data-daily-reaction="heart"]');
  await page.waitForTimeout(400);
}

test('the reply heart stays and grows: 3 taps = one saved reaction and ×3; held, it goes away', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await openReveal(page);
    const heart = '#todayReveal [data-daily-reaction="heart"]';
    await page.click(heart);
    await page.waitForFunction(() => window.__QA.reactions.length === 1);
    await page.waitForFunction(() => document.querySelector('#todayReveal [data-daily-reaction="heart"]')?.getAttribute('aria-pressed') === 'true');
    await page.click(heart);
    await page.click(heart);
    assert.equal(await page.locator(`${heart} .us-heart-count`).innerText(), '×3');
    assert.deepEqual(await page.evaluate(() => window.__QA.reactions), ['heart'], 'one reaction saved, no second push');
    assert.equal(await page.locator('#usHeartStatus').innerText(), '3 cuori', 'screen readers hear the count');
    assert.equal(await page.locator(heart).getAttribute('aria-pressed'), 'true');

    // Held ~650 ms: the border fills, then the heart empties; the release is not a tap.
    const box = await page.locator(heart).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    assert.equal(await page.locator(`${heart} .us-heart-hold`).count(), 1, 'the border fills while holding');
    await page.waitForFunction(() => window.__QA.reactions.length === 2, null, { timeout: 3000 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    assert.deepEqual(await page.evaluate(() => window.__QA.reactions), ['heart', null], 'the hold took it back and did not tap again');
    assert.equal(await page.locator(heart).getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator(`${heart} .us-heart-count`).count(), 0);
    assert.equal(await page.locator('#usHeartStatus').innerText(), 'Cuore tolto');

    // A short press on an empty heart just gives it again; Backspace takes it back.
    await page.click(heart);
    await page.waitForFunction(() => window.__QA.reactions.length === 3);
    await page.waitForFunction(() => document.querySelector('#todayReveal [data-daily-reaction="heart"]')?.getAttribute('aria-pressed') === 'true');
    await page.focus(heart);
    await page.keyboard.press('Backspace');
    await page.waitForFunction(() => window.__QA.reactions.length === 4);
    assert.deepEqual(await page.evaluate(() => window.__QA.reactions), ['heart', null, 'heart', null]);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});

test('the hug button shows the couple’s own characters, and follows a change of shape', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    const open = () => page.evaluate(async () => {
      window.__QA.tables.shared_messages = [{ id: '00000000-0000-4000-8000-0000000000aa', couple_id: 'c1', sender_id: 'b1', recipient_id: 'f1', kind: 'think', created_at: new Date().toISOString(), think_taps: 4 }];
      await window.hydrateThink();
      window.closeThinkArrival();
      window.openThinkArrival();
    });
    const drawn = () => page.evaluate(() => {
      const glyph = document.querySelector('#thinkArrival [data-think-reaction="hug"] .think-reaction-hug');
      const P = window.UsPersonaggi, same = (role) => { const d = document.createElement('div'); d.innerHTML = P.character(role, { size: 30, reaction: '', mood: 'innamorato', className: 'think-hug-char' }); return d.innerHTML; };
      return { me: glyph.querySelector('.think-hug-me').innerHTML === same('francesco'), them: glyph.querySelector('.think-hug-them').innerHTML, expected: same('beatrice'), chars: glyph.querySelectorAll('svg.us-char').length, heart: glyph.querySelectorAll('.think-hug-heart path').length, label: glyph.closest('button').getAttribute('aria-label') };
    });
    await open();
    await page.waitForSelector('#thinkArrival.open');
    let g = await drawn();
    assert.equal(g.chars, 2, 'the two characters');
    assert.equal(g.me, true, 'mine, as the app draws it');
    assert.equal(g.them, g.expected, 'theirs, as the app draws it');
    assert.equal(g.heart, 2, 'a heart in your two colours');
    assert.equal(g.label, 'Rispondi con un abbraccio');
    // A Ti penso of 4 taps says so.
    assert.match(await page.locator('#thinkArrivalTitle').innerText(), /ti pensa ×4/);
    // The reply heart: one reaction saved, the next taps only grow it.
    await page.evaluate(() => { window.__QA.thinkReactions = []; window.__QA.rpc.set_think_reaction = async (args) => { window.__QA.thinkReactions.push(args.target_reaction); return { data: [{ status: 'saved', reaction: args.target_reaction }], error: null }; }; });
    const replyHeart = '#thinkArrival [data-think-reaction="heart"]';
    await page.click(replyHeart);
    await page.waitForFunction(() => window.__QA.thinkReactions.length === 1);
    await page.waitForFunction(() => document.querySelector('#thinkArrival .think-arrival-sheet').dataset.thinkState === 'heart');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-think-reaction="hug"]').isVisible(), false, 'after a heart only the heart stays');
    await page.click(replyHeart);
    await page.click(replyHeart);
    assert.equal(await page.locator(`${replyHeart} .us-heart-count`).innerText(), '×3');
    assert.deepEqual(await page.evaluate(() => window.__QA.thinkReactions), ['heart']);
    assert.equal(await page.locator('#thinkArrivalStatus').innerText(), '3 cuori');
    assert.equal(await page.locator('[data-think-reaction="hug"]').isDisabled(), true, 'the reaction stays one');

    const before = g.them;
    await page.evaluate(() => { window.__QA.tables.profiles[1].character_shape = window.__QA.tables.profiles[1].character_shape === 'nuvola' ? 'palla' : 'nuvola'; return window.UsCoupleContext.hydrate(); });
    await page.waitForTimeout(300);
    await open();
    g = await drawn();
    assert.notEqual(g.them, before, 'a new shape, a new hug');
    assert.equal(g.them, g.expected);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});
