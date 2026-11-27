// I cuoricini volano nell'isola (founder, 27/11/2026: «dove risiedono loro»), in
// the real app with the fake Supabase. A Ti penso ×N sent: the hearts rise into
// the island at the top, which opens with the other person's character in heart
// eyes and «×N», then closes. Fallbacks: the old flight when the island is not
// there to see (another island moment, a page that covers it, the intro);
// reduced motion: no flight, only the island for a moment.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, pageFor } = require('./helpers/countdown-browser');

// send_think succeeds; every heartFlight call and every canvas of hearts is recorded.
const prepare = (page) => page.evaluate(() => {
  window.__QA.thinks = [];
  window.__QA.rpc.send_think = async (args) => { window.__QA.thinks.push(args); return { data: [{ message_id: `m${window.__QA.thinks.length}`, duplicate: false }], error: null }; };
  window.__QA.flights = [];
  const F = window.UsUiFoundation, fly = F.heartFlight;
  window.__QA.arrived = 0;
  F.heartFlight = (el, o = {}) => { const r = fly(el, o.onArrive ? { ...o, onArrive: (i) => { window.__QA.arrived++; return o.onArrive(i); } } : o); window.__QA.flights.push({ into: Boolean(o.into), to: o.to || null, count: o.count, result: r }); return r; };
  window.__QA.canvases = 0;
  new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach((n) => { if (n.classList?.contains('us-hearts-fx')) window.__QA.canvases++; }))).observe(document.body, { childList: true });
});
// The island's own first moments (the first peek, US vi ricorda) close before the test taps.
async function quietIsland(page) {
  await page.waitForFunction(() => document.getElementById('usIsola')?.getAttribute('aria-expanded') === 'true', null, { timeout: 4000 }).catch(() => {});
  await page.evaluate(() => window.UsAngolo.isola(false));
  await page.waitForTimeout(500);
}
const tapHeart = (page, times) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.usNavHeartTap(document.getElementById('thinkButton')); }, times);
const island = (page) => page.evaluate(() => {
  const b = document.getElementById('usIsola');
  return {
    expanded: b.getAttribute('aria-expanded'),
    receiving: b.classList.contains('is-receiving'),
    count: b.querySelector('.us-isola-count')?.textContent || null,
    reactions: [...b.querySelectorAll('[data-us-isola-duo] .us-char')].map((c) => c.getAttribute('data-reaction')),
    focusables: b.querySelectorAll('button, a, input, [tabindex]').length,
    label: b.getAttribute('aria-label')
  };
});

test('a Ti penso ×5: the hearts fly into the island, the other person receives them, then it closes', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await prepare(page);
    await quietIsland(page);
    const target = await page.evaluate(() => window.UsAngolo.cuoriVerso());
    assert.ok(target, 'the island is there to see on Oggi');
    for (let i = 0; i < 5; i++) await page.click('#thinkButton', { delay: 0 });
    assert.equal((await island(page)).receiving, false, 'during the taps the sprays stay by the heart');
    await page.waitForFunction(() => window.__QA.thinks.length === 1, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => window.__QA.thinks[0].p_taps), 5);
    const flights = await page.evaluate(() => window.__QA.flights);
    assert.equal(flights.length, 1);
    assert.equal(flights[0].into, true, 'the arc into the island');
    assert.deepEqual(flights[0].to, target, 'towards the other person in the island');
    assert.ok(flights[0].result > 500 && flights[0].result < 2500, `the last heart arrives in ${flights[0].result} ms`);
    const open = await island(page);
    assert.equal(open.expanded, 'true');
    assert.equal(open.receiving, true);
    assert.equal(open.count, '×5');
    assert.deepEqual(open.reactions, [null, 'cuore'], 'mine as usual, theirs with heart eyes');
    assert.equal(open.focusables, 0, 'nothing focusable added');
    // The point lies on the other person's character in the open island.
    await page.waitForTimeout(700);
    const box = await page.evaluate(() => { const r = document.querySelectorAll('#usIsola [data-us-isola-duo] .us-char')[1].getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
    assert.ok(target.x >= box.l - 4 && target.x <= box.r + 4, `x ${target.x} in ${box.l}–${box.r}`);
    assert.ok(target.y >= box.t - 12 && target.y <= box.b + 4, `y ${target.y} in ${box.t}–${box.b}`);
    assert.ok(await page.evaluate(() => window.__QA.canvases) >= 1);
    // Every heart arrives once (the other person hops, at most every 150 ms).
    await page.waitForFunction(() => window.__QA.arrived === 9, null, { timeout: 3000 });
    // The reply after the send repaints the island: the heart eyes stay.
    await page.evaluate(() => window.dispatchEvent(new Event('us:think-updated')));
    assert.deepEqual((await island(page)).reactions, [null, 'cuore']);
    await page.waitForFunction(() => /Ti penso ×5 inviato a Beatrice/.test(document.getElementById('toast')?.textContent || ''));
    // About 2 s after the last heart: back to the symbol.
    await page.waitForFunction(() => document.getElementById('usIsola').getAttribute('aria-expanded') === 'false', null, { timeout: 6000 });
    const closed = await island(page);
    assert.equal(closed.receiving, false);
    assert.equal(closed.count, null);
    assert.equal(closed.label, 'US: tocca per Il vostro angolo');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});

test('not sent: the island closes at once', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await prepare(page);
    await quietIsland(page);
    await page.evaluate(() => { window.__QA.failed = 0; window.__QA.rpc.send_think = async () => { await new Promise((r) => setTimeout(r, 300)); window.__QA.failed++; return { data: null, error: { message: 'offline' } }; }; });
    await tapHeart(page, 3);
    await page.waitForFunction(() => document.getElementById('usIsola').classList.contains('is-receiving'), null, { timeout: 4000 });
    await page.waitForFunction(() => window.__QA.failed === 1, null, { timeout: 3000 });
    await page.waitForFunction(() => document.getElementById('usIsola').getAttribute('aria-expanded') === 'false', null, { timeout: 600 });
    assert.equal((await island(page)).receiving, false);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});

test('the island busy or out of sight: the old flight, and the island is left alone', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await prepare(page);
    await quietIsland(page);
    // Another island moment (US vi ricorda speaking): not interrupted.
    assert.equal(await page.evaluate(() => window.UsAngolo.parla({ text: 'Una cosa da ricordare', speaker: 'me' })), true);
    assert.equal(await page.evaluate(() => window.UsAngolo.cuoriVerso()), null);
    await tapHeart(page, 4);
    await page.waitForFunction(() => window.__QA.thinks.length === 1, null, { timeout: 5000 });
    let flights = await page.evaluate(() => window.__QA.flights);
    assert.equal(flights.length, 1);
    assert.equal(flights[0].into, false, 'the flight of before');
    assert.equal(flights[0].to, null);
    assert.equal((await island(page)).receiving, false);
    assert.equal(await page.evaluate(() => document.getElementById('usFumetto').hidden), false, 'the bubble stays');
    await page.evaluate(() => window.UsAngolo.isola(false));
    // A page that covers the top bar (the Impostazioni): no island.
    await page.evaluate(() => window.go('settings', { nav: true }));
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => window.UsAngolo.cuoriVerso()), null);
    await tapHeart(page, 2);
    await page.waitForFunction(() => window.__QA.thinks.length === 2, null, { timeout: 5000 });
    flights = await page.evaluate(() => window.__QA.flights);
    assert.equal(flights[1].into, false);
    assert.equal((await island(page)).expanded, 'false');
    // The other pages with the bar (Noi): the island takes them.
    await page.evaluate(() => window.go('noi', { nav: true }));
    await page.waitForTimeout(700);
    assert.ok(await page.evaluate(() => window.UsAngolo.cuoriVerso()), 'Noi shows the island');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});

test('never during the intro: the old flight, the island stays closed', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await prepare(page);
    await quietIsland(page);
    assert.equal(await page.evaluate(() => window.UsIntro.start({ force: true })), true);
    assert.equal(await page.evaluate(() => window.UsAngolo.cuoriVerso()), null);
    await tapHeart(page, 3);
    await page.waitForFunction(() => window.__QA.thinks.length === 1, null, { timeout: 5000 });
    assert.equal((await page.evaluate(() => window.__QA.flights))[0].into, false);
    const s = await island(page);
    assert.equal(s.expanded, 'false');
    assert.equal(s.receiving, false);
    await page.evaluate(() => window.UsIntro.stop());
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});

test('reduced motion: no flight, the island shows their heart eyes for a moment', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844, reduced: true });
    await prepare(page);
    await quietIsland(page);
    await tapHeart(page, 3);
    await page.waitForFunction(() => window.__QA.thinks.length === 1, null, { timeout: 5000 });
    const s = await island(page);
    assert.equal(s.expanded, 'true');
    assert.equal(s.receiving, true);
    assert.equal(s.count, '×3');
    assert.deepEqual(s.reactions, [null, 'cuore']);
    assert.equal(await page.evaluate(() => window.__QA.flights.length), 0, 'no flight asked');
    assert.equal(await page.evaluate(() => window.__QA.canvases + document.querySelectorAll('.us-hearts-fx').length), 0, 'no canvas work at all');
    await page.waitForFunction(() => document.getElementById('usIsola').getAttribute('aria-expanded') === 'false', null, { timeout: 4000 });
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});
