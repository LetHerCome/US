// Maudit 1.0 — the real app in Chromium (fake Supabase fixture),
// driven with real touch input (CDP touch events → Pointer Events) and mouse.
// Maudit sits still in its home spot (the approved mockup): it is never
// picked up, dragged or moved; only its state changes.
// Every test fails on an uncaught page error or a console error.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, pageFor } = require('./helpers/countdown-browser');

const output = process.env.MAUDIT_SCREENSHOTS;
async function shot(page, name) { if (!output) return; fs.mkdirSync(output, { recursive: true }); await page.screenshot({ path: path.join(output, `${name}.png`) }); }

async function open(h, options = {}) {
  const view = await pageFor(h, options);
  view.consoleErrors = [];
  view.page.on('console', (message) => { if (message.type() === 'error') view.consoleErrors.push(message.text()); });
  const cdp = await view.ctx.newCDPSession(view.page);
  const send = (type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ x: point.x, y: point.y, id: 1 }] : [] });
  view.touch = {
    start: (p) => send('touchStart', p), move: (p) => send('touchMove', p), end: () => send('touchEnd'), cancel: () => send('touchCancel'),
    async path(from, to, steps = 12) {
      for (let i = 1; i <= steps; i += 1) { await send('touchMove', { x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }); await view.page.waitForTimeout(16); }
    }
  };
  await view.page.evaluate(() => {
    // Instrumentation only: which states the one machine rendered, which pointer captures happened.
    const layer = document.getElementById('usPetLayer');
    window.__maudit = { states: [], captures: 0, lost: 0 };
    new MutationObserver(() => { const s = layer.dataset.petState; const list = window.__maudit.states; if (s && list[list.length - 1] !== s) list.push(s); }).observe(layer, { attributes: true, attributeFilter: ['data-pet-state'] });
    document.addEventListener('gotpointercapture', (e) => { if (layer.contains(e.target)) window.__maudit.captures += 1; }, true);
    document.addEventListener('lostpointercapture', (e) => { if (layer.contains(e.target)) window.__maudit.lost += 1; }, true);
  });
  return view;
}
async function clean(view) {
  assert.deepEqual(view.errors, [], 'no uncaught page errors');
  assert.deepEqual(view.consoleErrors, [], 'no console errors');
  await view.ctx.close();
}
const settle = (page, ms = 450) => page.waitForTimeout(ms);
const tab = async (page, name) => {
  await page.click(`.nav button[data-page="${name}"]`);
  await page.waitForFunction(() => !window.UsDueColori?.isFlooding?.());
  await settle(page, 200);
};
const hitCenter = (page) => page.evaluate(() => { const r = document.querySelector('#usPetLayer .us-pet-hit').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const state = (page) => page.evaluate(() => ({ snap: window.USPet.snapshot(), inspect: window.USPet.inspect() }));
const home = (page) => page.evaluate(() => {
  const r = document.querySelector('#usPetLayer').getBoundingClientRect();
  const nav = document.querySelector('.nav').getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), navRight: Math.round(nav.right), navTop: Math.round(nav.top) };
});
// Every point of the viewport that the PET swallows must lie inside the hit target.
const pointerFootprint = (page) => page.evaluate(() => {
  const layer = document.getElementById('usPetLayer'); const hit = layer.querySelector('.us-pet-hit');
  const box = hit ? hit.getBoundingClientRect() : null; const points = [];
  for (let y = 2; y < innerHeight; y += 6) for (let x = 2; x < innerWidth; x += 6) {
    const el = document.elementFromPoint(x, y);
    if (el && layer.contains(el)) points.push([x, y]);
  }
  const outside = points.filter(([x, y]) => !box || x < box.left - 1 || x > box.right + 1 || y < box.top - 1 || y > box.bottom + 1).length;
  return { swallowed: points.length, outside };
});

test('Maudit toggle: on by default; Off removes renderer, hit target and activity; persists across reload; On restores', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const view = await open(h, {});
    const { page } = view;
    const before = await hitCenter(page);
    await page.evaluate(() => window.go('settings', { nav: true })); await settle(page, 700);
    const row = page.locator('#usMauditSetting');
    assert.equal(await row.getAttribute('aria-checked'), 'true', 'default on');
    assert.equal(await row.getAttribute('role'), 'switch');
    await shot(page, 'maudit-settings-on-390x844');
    await row.click(); await settle(page, 300);
    const off = await page.evaluate((p) => {
      const layer = document.getElementById('usPetLayer'); const el = document.elementFromPoint(p.x, p.y);
      return { checked: document.getElementById('usMauditSetting').getAttribute('aria-checked'), hidden: layer.hidden, display: getComputedStyle(layer).display,
        hits: document.querySelectorAll('.us-pet-hit').length, renderers: layer.querySelectorAll('.us-pet-renderer').length, inspect: window.USPet.inspect(),
        snap: window.USPet.snapshot(), enabled: window.USPet.enabled, react: window.USPet.react('reward'), swallowed: Boolean(el && layer.contains(el)),
        stored: localStorage.getItem('us:maudit:v1:enabled') };
    }, before);
    assert.deepEqual(off, { checked: 'false', hidden: true, display: 'none', hits: 0, renderers: 0,
      inspect: { mounted: false, listeners: 0, observers: 0, timers: 0, hit: false },
      snap: { state: 'disabled', running: false }, enabled: false, react: false, swallowed: false, stored: '0' });
    assert.deepEqual(await pointerFootprint(page), { swallowed: 0, outside: 0 }, 'Off leaves no invisible hitbox');
    await shot(page, 'maudit-settings-off-390x844');
    // Reload with this device's storage: Off survives, nothing mounts at boot.
    const stored = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('us:maudit:')));
    await page.addInitScript((entries) => { for (const [k, v] of entries) localStorage.setItem(k, v); }, stored);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.usProfile && window.USPet && typeof window.USPet.setEnabled === 'function');
    await settle(page, 1200);
    assert.deepEqual(await page.evaluate(() => ({ enabled: window.USPet.enabled, hidden: document.getElementById('usPetLayer').hidden, hits: document.querySelectorAll('.us-pet-hit').length })),
      { enabled: false, hidden: true, hits: 0 });
    await page.evaluate(() => window.go('settings', { nav: true })); await settle(page, 700);
    assert.equal(await row.getAttribute('aria-checked'), 'false', 'the row reflects the stored preference');
    await row.click(); await settle(page, 400);
    const on = await page.evaluate(() => ({ checked: document.getElementById('usMauditSetting').getAttribute('aria-checked'), enabled: window.USPet.enabled, running: window.USPet.snapshot().running,
      vis: getComputedStyle(document.getElementById('usPetLayer')).visibility, hits: document.querySelectorAll('.us-pet-hit').length, renderers: document.querySelectorAll('#usPetLayer .us-pet-renderer').length, stored: localStorage.getItem('us:maudit:v1:enabled') }));
    assert.deepEqual(on, { checked: 'true', enabled: true, running: true, vis: 'visible', hits: 1, renderers: 1, stored: '1' });
    await clean(view);
  } finally { await h.close(); }
});

test('tap pets Maudit, every third tap is happy, and the control underneath is never reached', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const view = await open(h, {});
    const { page, touch } = view;
    const p = await hitCenter(page);
    await page.evaluate((point) => {
      const layer = document.getElementById('usPetLayer');
      window.__under = [...document.elementsFromPoint(point.x, point.y)].find((n) => !layer.contains(n));
      window.__clicks = { under: 0, pet: 0 };
      document.addEventListener('click', (e) => { if (layer.contains(e.target)) window.__clicks.pet += 1; else if (window.__under?.contains(e.target) || e.target.contains?.(window.__under)) window.__clicks.under += 1; }, true);
      window.__maudit.states.length = 0;
    }, p);
    await touch.start(p); await page.waitForTimeout(70); await touch.end(); await settle(page, 200);
    const tapped = await page.evaluate(() => ({ states: [...window.__maudit.states], clicks: window.__clicks }));
    assert.deepEqual(tapped.states, ['pet'], 'one pet reaction');
    assert.equal(tapped.clicks.under, 0, 'the control under Maudit is not activated');
    await shot(page, 'maudit-pet-390x844');
    await settle(page, 1700);
    assert.equal((await state(page)).snap.state, 'idle', 'the stroke settles back to idle');
    // Mouse: same single path; the third tap is the happy one.
    await page.evaluate(() => { window.__maudit.states.length = 0; });
    await page.mouse.click(p.x, p.y); await settle(page, 150);
    await page.mouse.click(p.x, p.y); await settle(page, 150);
    assert.deepEqual(await page.evaluate(() => window.__maudit.states), ['pet', 'happy']);
    assert.equal(await page.evaluate(() => window.__clicks.under), 0);
    await clean(view);
  } finally { await h.close(); }
});

test('Maudit never moves: a long press or a drag on it leaves it in its home spot; vertical swipes still scroll', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const view = await open(h, { width: 320, height: 568 });
    const { page, touch } = view;
    const spot = await home(page);
    const from = await hitCenter(page);
    // Long still press, then a sideways pull: nothing picks it up.
    await touch.start(from); await page.waitForTimeout(600);
    await touch.path(from, { x: from.x - 120, y: from.y - 200 }, 10);
    assert.deepEqual(await home(page), spot, 'still during the drag');
    await touch.end(); await settle(page, 600);
    assert.deepEqual(await home(page), spot, 'still after the drag');
    assert.equal(await page.evaluate(() => localStorage.getItem('us:maudit:v1:placement')), null, 'no placement is ever stored');
    // A vertical swipe that starts on Maudit scrolls the page (Noi is taller than the screen).
    await tab(page, 'bond');
    await touch.start(from); await touch.path(from, { x: from.x + 2, y: from.y - 120 }, 10); await touch.end(); await settle(page, 400);
    assert.ok(await page.evaluate(() => scrollY) > 0, 'the page scrolled');
    assert.deepEqual(await home(page), spot, 'fixed to the screen, not to the page');
    await clean(view);
  } finally { await h.close(); }
});

test('home spot on every tab: one instance, same place, stable listeners/observers, no invisible blocker', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const view = await open(h, {});
    const { page } = view;
    const spot = await home(page);
    // The mockup's .maudit-home: 54 x 48, 10 px in from the bar's right end, 4 px over its top.
    assert.deepEqual([spot.w, spot.h], [54, 48]);
    assert.equal(spot.x + spot.w, spot.navRight - 10);
    assert.equal(spot.y + spot.h, spot.navTop + 4);
    const baseline = (await state(page)).inspect;
    const audit = () => page.evaluate(() => ({
      layers: document.querySelectorAll('#usPetLayer,.us-pet-layer').length,
      hits: document.querySelectorAll('.us-pet-hit').length,
      renderers: document.querySelectorAll('.us-pet-renderer').length,
      figures: document.querySelectorAll('.us-pet-figure').length,
      inspect: window.USPet.inspect(),
      running: window.USPet.snapshot().running,
      vis: getComputedStyle(document.getElementById('usPetLayer')).visibility,
      overflow: document.scrollingElement.scrollWidth > innerWidth
    }));
    for (let cycle = 0; cycle < 2; cycle += 1) {
      for (const name of ['bond', 'moments', 'quiz', 'bond', 'home']) {
        await tab(page, name);
        const a = await audit();
        const label = `${cycle} ${name}`;
        assert.deepEqual({ layers: a.layers, hits: a.hits, renderers: a.renderers, figures: a.figures, running: a.running, vis: a.vis, overflow: a.overflow },
          { layers: 1, hits: 1, renderers: 1, figures: 1, running: true, vis: 'visible', overflow: false }, label);
        assert.equal(a.inspect.listeners, baseline.listeners, `${label}: listeners stable`);
        assert.equal(a.inspect.observers, baseline.observers, `${label}: observers stable`);
        assert.deepEqual(await home(page), spot, `${label}: same home spot`);
        const footprint = await pointerFootprint(page);
        assert.equal(footprint.outside, 0, `${label}: no invisible pointer-blocking region`);
        assert.ok(footprint.swallowed <= 90, `${label}: footprint is the cat only (${footprint.swallowed})`);
      }
    }
    await clean(view);
  } finally { await h.close(); }
});

test('layering: notices and sheets leave Maudit in place; the keyboard sends it off its spot', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const view = await open(h, {});
    const { page } = view;
    const alive = () => page.evaluate(() => { const hit = document.querySelector('.us-pet-hit').getBoundingClientRect();
      const el = document.elementFromPoint(hit.x + hit.width / 2, hit.y + hit.height / 2);
      return { blockers: window.USPet.blockers(), running: window.USPet.snapshot().running, vis: getComputedStyle(document.getElementById('usPetLayer')).visibility, touchable: Boolean(el?.classList.contains('us-pet-hit')) }; });
    await page.evaluate(() => { document.getElementById('toast').classList.add('show'); });
    await settle(page, 250);
    assert.deepEqual(await alive(), { blockers: [], running: true, vis: 'visible', touchable: true }, 'toast');
    await page.evaluate(() => { document.getElementById('toast').classList.remove('show'); });
    // A sheet covers Maudit with its scrim (mockup): it keeps running, untouchable under the sheet.
    await page.evaluate(() => window.USCountdown.open()); await settle(page, 700);
    const sheet = await alive();
    assert.deepEqual([sheet.blockers, sheet.running, sheet.vis, sheet.touchable], [[], true, 'visible', false], 'Countdown sheet');
    await page.evaluate(() => window.USCountdown.close()); await settle(page, 700);
    assert.equal((await alive()).touchable, true, 'touchable again after the sheet');
    await page.evaluate(() => document.body.classList.add('us-keyboard-open')); await settle(page, 400);
    const kb = await alive();
    assert.deepEqual([kb.blockers, kb.running, kb.vis, kb.touchable], [['keyboard'], false, 'hidden', false], 'keyboard');
    await page.evaluate(() => document.body.classList.remove('us-keyboard-open')); await settle(page, 700);
    assert.equal((await alive()).running, true, 'keyboard released');
    await clean(view);
  } finally { await h.close(); }
});

test('geometry 320 / 390 / 412 / landscape: inside the viewport, no overflow, every nav tab keeps its tap', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    for (const [width, height] of [[320, 568], [390, 844], [412, 915], [844, 390]]) {
      const view = await open(h, { width, height });
      const { page } = view;
      const label = `${width}x${height}`;
      const check = async (where) => {
        const g = await page.evaluate(() => {
          const actor = document.querySelector('.us-pet-layer').getBoundingClientRect();
          const tabs = [...document.querySelectorAll('.nav button')].map((b) => { const r = b.getBoundingClientRect(); return b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); });
          return { actor: { x: actor.x, y: actor.y, right: actor.right, bottom: actor.bottom }, tabs, overflow: document.scrollingElement.scrollWidth > innerWidth, vw: innerWidth, vh: innerHeight };
        });
        assert.ok(g.actor.x >= 0 && g.actor.right <= g.vw && g.actor.y >= 0 && g.actor.bottom <= g.vh, `${label} ${where}: inside viewport ${JSON.stringify(g.actor)}`);
        assert.deepEqual(g.tabs, [true, true, true, true], `${label} ${where}: every tab keeps its tap`);
        assert.equal(g.overflow, false, `${label} ${where}: no horizontal overflow`);
      };
      await check('home');
      await tab(page, 'quiz');
      await check('quiz');
      await shot(page, `maudit-gioca-${label}`);
      await page.setViewportSize({ width: height, height: width }); await settle(page, 600);
      await check('rotated');
      await clean(view);
    }
  } finally { await h.close(); }
});

test('reduced motion: tap and the toggle still work; no hop', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const view = await open(h, { reduced: true });
    const { page, touch } = view;
    const p = await hitCenter(page);
    await touch.start(p); await page.waitForTimeout(60); await touch.end(); await settle(page, 120);
    assert.equal((await state(page)).snap.state, 'pet');
    await page.evaluate(() => window.USPet.react('think')); await settle(page, 60);
    assert.deepEqual(await page.evaluate(() => [window.USPet.snapshot().state, document.querySelector('#usPetLayer .us-pet-figure').getAnimations().length]), ['happy', 0], 'happy without the hop');
    await page.evaluate(() => window.USPet.setEnabled(false));
    assert.equal(await page.evaluate(() => window.USPet.enabled), false);
    await page.evaluate(() => window.USPet.setEnabled(true)); await settle(page, 400);
    assert.equal(await page.evaluate(() => window.USPet.snapshot().running), true);
    await clean(view);
  } finally { await h.close(); }
});
