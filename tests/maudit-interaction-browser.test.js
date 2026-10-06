// Maudit Interaction V1 — the real app in Chromium (fake Supabase fixture),
// driven with real touch input (CDP touch events → Pointer Events) and mouse.
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
const tab = async (page, name) => { await page.click(`.nav button[data-page="${name}"]`); await settle(page, 750); };
const hitCenter = (page) => page.evaluate(() => { const r = document.querySelector('#usPetLayer .us-pet-hit').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 - 2 }; });
const state = (page) => page.evaluate(() => ({ snap: window.USPet.snapshot(), placement: window.USPet.placement(), inspect: window.USPet.inspect(),
  saved: JSON.parse(localStorage.getItem('us:maudit:v1:placement') || 'null'), dx: document.getElementById('usPetLayer').style.getPropertyValue('--us-pet-dx') }));
const plane = (page, id) => page.evaluate((target) => window.USPet.planes().find((p) => p.id === target) || null, id);
// Finger position that lands the cat's feet on `actorLeft` along a rim (scruff grip, 40px box).
const gripFor = (rim, actorLeft) => ({ x: actorLeft + 20, y: rim - 26 });
async function pickUp(view, wait = 340) {
  const from = await hitCenter(view.page);
  await view.touch.start(from); await view.page.waitForTimeout(wait);
  return from;
}
async function carryTo(view, from, to) { await view.touch.path(from, to); await view.touch.end(); await settle(view.page, 1100); }
const actorBox = (page) => page.evaluate(() => { const r = document.querySelector('#usPetLayer .us-pet-actor').getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; });
// Every point of the viewport that the PET swallows must lie inside the bounded hit target.
const pointerFootprint = (page) => page.evaluate(() => {
  const layer = document.getElementById('usPetLayer'); const hit = layer.querySelector('.us-pet-hit');
  const before = hit ? hit.getBoundingClientRect() : null; const points = [];
  for (let y = 2; y < innerHeight; y += 6) for (let x = 2; x < innerWidth; x += 6) {
    const el = document.elementFromPoint(x, y);
    if (el && layer.contains(el)) points.push([x, y]);
  }
  // Maudit may stroll during the scan: the hit target sweeps from its first to its last box.
  const after = hit ? hit.getBoundingClientRect() : null;
  const box = before && after ? { left: Math.min(before.left, after.left), right: Math.max(before.right, after.right), top: Math.min(before.top, after.top), bottom: Math.max(before.bottom, after.bottom) } : null;
  // 1px tolerance: hit testing snaps fractional boxes to device pixels.
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
      inspect: { mounted: false, listeners: 0, observers: 0, timers: 0, pressing: false, held: false, falling: false, hit: false },
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

test('tap pets Maudit exactly once, never starts a drag and never reaches the control underneath', async (t) => {
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
    const tapped = await page.evaluate(() => ({ states: [...window.__maudit.states], clicks: window.__clicks, held: window.USPet.inspect().held }));
    assert.deepEqual(tapped.states, ['pet'], 'one pet reaction, no held/snap');
    assert.equal(tapped.clicks.under, 0, 'the control under Maudit is not activated');
    assert.equal(tapped.held, false);
    await shot(page, 'maudit-pet-390x844');
    await settle(page, 1500);
    assert.equal((await state(page)).snap.state, 'idle', 'the stroke settles back to idle');
    // Mouse: same single path.
    await page.evaluate(() => { window.__maudit.states.length = 0; });
    await page.mouse.click(p.x, p.y);
    await settle(page, 150);
    assert.deepEqual(await page.evaluate(() => window.__maudit.states), ['pet']);
    assert.equal(await page.evaluate(() => window.__clicks.under), 0);
    await clean(view);
  } finally { await h.close(); }
});

test('pickup and drag: hold threshold, sideways pull, gravity falls onto a card plane and remembers the landing', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const view = await open(h, {});
    const { page, touch } = view;
    await tab(page, 'bond');
    const sintonia = await plane(page, 'noi-sintonia-top');
    assert.ok(sintonia, 'Noi offers a card plane beside the nav');
    // Under the hold threshold nothing is picked up yet.
    const from = await hitCenter(page);
    await touch.start(from); await page.waitForTimeout(120);
    assert.equal((await state(page)).snap.state === 'held', false, 'not before the hold threshold');
    await page.waitForTimeout(220);
    const held = await state(page);
    assert.deepEqual([held.snap.state, held.inspect.held], ['held', true], 'a still press past the threshold picks up');
    const [a, b] = sintonia.segments[0];
    const target = gripFor(sintonia.rim, Math.round((a + b) / 2));
    await touch.path(from, { x: target.x, y: target.y - 60 });
    // gotpointercapture is delivered with the next pointer event after the capture.
    assert.ok(await page.evaluate(() => window.__maudit.captures >= 1), 'pointer capture taken');
    assert.equal(await page.evaluate(() => scrollY), 0, 'no page scroll while held');
    await shot(page, 'maudit-held-390x844');
    await touch.path({ x: target.x, y: target.y - 60 }, { x: target.x, y: target.y - 90 }, 4);
    await page.evaluate(() => { window.__maudit.states.length = 0; });
    await touch.end();
    await page.waitForFunction(() => window.USPet.snapshot().state === 'fall');
    const airborne = await state(page);
    assert.equal(airborne.saved, null, 'nothing persisted while airborne');
    const airBox = await actorBox(page);
    await settle(page, 100);
    const lowerBox = await actorBox(page);
    assert.ok(lowerBox.y > airBox.y, `gravity moves down ${airBox.y} → ${lowerBox.y}`);
    await page.waitForFunction(() => window.USPet.snapshot().state !== 'fall', { timeout: 1800 });
    await settle(page, 300);
    const landed = await state(page);
    assert.equal(landed.placement.kind, 'page');
    assert.equal(landed.placement.id, 'noi-sintonia-top');
    assert.equal(landed.saved.plane, 'noi-sintonia-top');
    assert.ok(landed.saved.x >= 0 && landed.saved.x <= 1, `normalized x ${landed.saved.x}`);
    assert.deepEqual([landed.snap.state, landed.inspect.held, landed.inspect.pressing, landed.dx], ['idle', false, false, '0px']);
    assert.ok(await page.evaluate(() => window.__maudit.lost >= 1), 'pointer capture released');
    assert.deepEqual(await page.evaluate(() => window.__maudit.states.slice(-3)), ['fall', 'snap', 'idle'], 'fall → snap → idle');
    const box = await actorBox(page);
    assert.ok(Math.abs(box.bottom - sintonia.rim) <= 1.5, `stands on the rim ${box.bottom} vs ${sintonia.rim}`);
    assert.ok(box.x >= a - 1 && box.x <= b + 1, 'inside the free segment');
    await shot(page, 'maudit-landed-noi-390x844');
    // A sideways pull picks up at once, without waiting for the hold.
    const again = await hitCenter(page);
    await touch.start(again);
    await touch.path(again, { x: again.x - 40, y: again.y + 4 }, 4);
    assert.equal((await state(page)).snap.state, 'held', 'sideways pull');
    await carryTo(view, { x: again.x - 40, y: again.y + 4 }, gripFor((await page.evaluate(() => document.querySelector('.nav').getBoundingClientRect().top)) + 3, 120));
    const navDrop = await state(page);
    assert.deepEqual([navDrop.placement.kind, navDrop.saved.plane], ['nav', 'nav'], 'dropped onto the nav rim');
    await clean(view);
  } finally { await h.close(); }
});

test('vertical swipes on Maudit scroll the page; cancel, navigation and a modal all end a drag in a safe state', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const view = await open(h, { width: 320, height: 568 });
    const { page, touch } = view;
    await tab(page, 'moments');
    const from = await hitCenter(page);
    await touch.start(from); await touch.path(from, { x: from.x + 2, y: from.y - 120 }, 10); await touch.end(); await settle(page, 400);
    const scrolled = await page.evaluate(() => ({ y: scrollY, states: [...window.__maudit.states] }));
    assert.ok(scrolled.y > 0, 'the page scrolled');
    assert.equal(scrolled.states.includes('held'), false, 'no accidental pickup');
    await page.evaluate(() => scrollTo(0, 0)); await settle(page, 300);
    const bodyBefore = await page.evaluate(() => [...document.body.classList].sort());
    // pointercancel while held → back to where it was, nothing stuck.
    let p = await pickUp(view);
    await touch.path(p, { x: p.x + 60, y: p.y - 200 }, 6);
    await touch.cancel(); await settle(page, 600);
    let s = await state(page);
    assert.deepEqual([s.snap.state, s.inspect.held, s.inspect.pressing, s.placement.kind, s.dx, s.saved], ['idle', false, false, 'nav', '0px', null]);
    // Navigation during a drag.
    p = await pickUp(view);
    await touch.path(p, { x: p.x + 40, y: p.y - 150 }, 4);
    await page.evaluate(() => window.go('quiz', { nav: true })); await settle(page, 600);
    s = await state(page);
    assert.deepEqual([s.inspect.held, s.inspect.pressing, s.snap.state === 'held', s.placement.kind, s.dx, s.saved], [false, false, false, 'nav', '0px', null], 'navigation cancels the drag');
    await touch.end(); await settle(page, 300);
    // A blocking sheet during a drag.
    p = await pickUp(view);
    await touch.path(p, { x: p.x + 30, y: p.y - 100 }, 4);
    await page.evaluate(() => window.USCountdown.open()); await settle(page, 400);
    s = await state(page);
    const during = await page.evaluate(() => ({ vis: getComputedStyle(document.getElementById('usPetLayer')).visibility, blockers: window.USPet.blockers(), lost: window.__maudit.lost }));
    assert.deepEqual([s.inspect.held, s.inspect.pressing, s.snap.running, s.snap.state, s.dx, during.vis, during.blockers], [false, false, false, 'idle', '0px', 'hidden', ['surface']]);
    assert.ok(during.lost >= 3, 'every interrupted drag released its pointer capture');
    await touch.end();
    await page.evaluate(() => window.USCountdown.close()); await settle(page, 700);
    s = await state(page);
    assert.deepEqual([s.snap.running, await page.evaluate(() => getComputedStyle(document.getElementById('usPetLayer')).visibility)], [true, 'visible']);
    assert.deepEqual(await page.evaluate(() => [...document.body.classList].sort()), bodyBefore, 'no body class left behind');
    const back = await hitCenter(page);
    assert.equal(await page.evaluate((q) => document.elementFromPoint(q.x, q.y)?.classList.contains('us-pet-hit'), back), true, 'Maudit is touchable again');
    await clean(view);
  } finally { await h.close(); }
});

test('planes: first valid card below wins, hidden cards are ignored, nav catches fall-through, saved plane is page-scoped and restores', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const view = await open(h, {});
    const { page, touch } = view;
    await tab(page, 'moments');
    const planes = await page.evaluate(() => window.USPet.planes().map((p) => p.id));
    assert.ok(planes.includes('ricordi-conservati-top') && planes.includes('ricordi-month-top'), planes.join());
    // Hidden card → its plane is ignored.
    await page.evaluate(() => { document.getElementById('conservatiEntry').hidden = true; });
    assert.equal((await page.evaluate(() => window.USPet.planes().map((p) => p.id))).includes('ricordi-conservati-top'), false);
    await page.evaluate(() => { document.getElementById('conservatiEntry').hidden = false; });
    // Released above two rims: the first valid one below catches the fall.
    const conservati = await plane(page, 'ricordi-conservati-top');
    const month = await plane(page, 'ricordi-month-top');
    let p = await pickUp(view);
    const first = conservati.rim < month.rim ? conservati : month;
    const sharedLeft = Math.max(conservati.segments[0][0], month.segments[0][0]) + 12;
    const upperY = Math.min(conservati.rim, month.rim) - 90;
    await carryTo(view, p, { x: sharedLeft + 20, y: upperY - 14 });
    let s = await state(page);
    assert.equal(s.placement.id, first.id, `first plane below wins: ${conservati.rim}/${month.rim}`);
    // Where no card segment catches, the nav is the final floor.
    p = await pickUp(view);
    await carryTo(view, p, { x: 8, y: upperY - 14 });
    s = await state(page);
    assert.deepEqual([s.placement.kind, s.saved.plane, s.snap.state], ['nav', 'nav', 'idle'], 'nav floor; no floating mid-screen');
    // Another page: temporary nav, the saved Ricordi placement is not corrupted.
    await tab(page, 'home');
    s = await state(page);
    assert.deepEqual([s.placement.kind, s.saved.plane], ['nav', 'ricordi-month-top']);
    await tab(page, 'moments'); await settle(page, 300);
    s = await state(page);
    assert.equal(s.placement.id, 'ricordi-month-top', 'restored on return');
    const box = await actorBox(page);
    assert.ok(Math.abs(box.bottom - month.rim) <= 3);
    await shot(page, 'maudit-ricordi-month-390x844');
    // Same semantic placement on a narrower phone.
    const stored = await page.evaluate(() => Object.entries(localStorage).filter(([k]) => k.startsWith('us:maudit:')));
    await view.ctx.close();
    const narrow = await open(h, { width: 320, height: 568 });
    await narrow.page.addInitScript((entries) => { for (const [k, v] of entries) localStorage.setItem(k, v); }, stored);
    await narrow.page.reload({ waitUntil: 'load' });
    await narrow.page.waitForFunction(() => window.usProfile && window.USPet?.enabled);
    await settle(narrow.page, 1200);
    await tab(narrow.page, 'moments');
    const n = await state(narrow.page);
    assert.equal(n.placement.id, 'ricordi-month-top', 'placement survives a different phone width');
    const nb = await actorBox(narrow.page);
    assert.ok(nb.x >= 0 && nb.right <= 320 && nb.y >= 0 && nb.bottom <= 568, JSON.stringify(nb));
    assert.ok(nb.x >= n.placement.a - 1 && nb.x <= n.placement.b + 1, 'clamped into the live segment');
    await shot(narrow.page, 'maudit-ricordi-month-320x568');
    assert.deepEqual(view.errors, []); assert.deepEqual(view.consoleErrors, []);
    await clean(narrow);
  } finally { await h.close(); }
});

test('navigation cycles with a moved Maudit: one instance, stable listeners/observers, no orphan or invisible blocker', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const view = await open(h, {});
    const { page } = view;
    await tab(page, 'bond');
    const sintonia = await plane(page, 'noi-sintonia-top');
    const p = await pickUp(view);
    await carryTo(view, p, gripFor(sintonia.rim, sintonia.segments[0][0] + 20));
    assert.equal((await state(page)).saved.plane, 'noi-sintonia-top');
    const baseline = (await state(page)).inspect;
    const audit = () => page.evaluate(() => ({
      layers: document.querySelectorAll('#usPetLayer,.us-pet-layer').length,
      hits: document.querySelectorAll('.us-pet-hit').length,
      renderers: document.querySelectorAll('.us-pet-renderer').length,
      figures: document.querySelectorAll('.us-pet-figure').length,
      connected: document.querySelector('.us-pet-hit')?.isConnected === true,
      page: document.querySelector('.page.active').id,
      placement: window.USPet.placement(),
      inspect: window.USPet.inspect(),
      running: window.USPet.snapshot().running,
      overflow: document.scrollingElement.scrollWidth > innerWidth
    }));
    for (let cycle = 0; cycle < 3; cycle += 1) {
      for (const name of ['home', 'bond', 'moments', 'quiz', 'bond', 'home']) {
        await tab(page, name); await settle(page, 200);
        const a = await audit();
        const label = `${cycle} ${name}`;
        assert.deepEqual({ layers: a.layers, hits: a.hits, renderers: a.renderers, figures: a.figures, connected: a.connected, running: a.running, overflow: a.overflow },
          { layers: 1, hits: 1, renderers: 1, figures: 1, connected: true, running: true, overflow: false }, label);
        const scroll = a.placement.kind === 'page' ? 1 : 0;
        assert.equal(a.inspect.listeners - scroll, baseline.listeners - 1, `${label}: listeners stable`);
        assert.equal(a.inspect.observers, baseline.observers, `${label}: observers stable`);
        assert.equal(a.inspect.timers, 0, `${label}: no pending settle/arrive timers`);
        assert.equal(a.placement.kind === 'page' ? a.placement.page : 'nav', name === 'bond' ? 'bond' : 'nav', `${label}: plane belongs to the active page`);
        const footprint = await pointerFootprint(page);
        assert.equal(footprint.outside, 0, `${label}: no invisible pointer-blocking region`);
        assert.ok(footprint.swallowed <= 60, `${label}: footprint is the cat only (${footprint.swallowed})`);
      }
    }
    await clean(view);
  } finally { await h.close(); }
});

test('layering: transient notices keep Maudit touchable; exclusive blockers still hide it and remove its hit target', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const view = await open(h, {});
    const { page } = view;
    const alive = () => page.evaluate(() => { const hit = document.querySelector('.us-pet-hit').getBoundingClientRect();
      const el = document.elementFromPoint(hit.x + hit.width / 2, hit.y + hit.height / 2);
      return { blockers: window.USPet.blockers(), running: window.USPet.snapshot().running, vis: getComputedStyle(document.getElementById('usPetLayer')).visibility, touchable: Boolean(el?.classList.contains('us-pet-hit')) }; });
    await page.evaluate(() => { document.getElementById('usDailyNudge').hidden = false; document.getElementById('toast').classList.add('show'); });
    await settle(page, 250);
    assert.deepEqual(await alive(), { blockers: [], running: true, vis: 'visible', touchable: true }, 'Daily nudge + toast');
    await page.evaluate(() => { usIncomingThink = { id: 'qa-think', sender_id: 'b1', created_at: new Date().toISOString() }; window.openThinkArrival(); });
    await settle(page, 300);
    assert.deepEqual(await alive(), { blockers: [], running: true, vis: 'visible', touchable: true }, 'Ti penso arrival');
    await page.evaluate(() => window.closeThinkArrival()); await settle(page, 400);
    for (const [name, block, unblock, blocker] of [
      ['keyboard', () => document.body.classList.add('us-keyboard-open'), () => document.body.classList.remove('us-keyboard-open'), 'keyboard'],
      ['calendar', () => window.openCalendarSurface(), () => window.closeCalendarSurface(), 'surface']
    ]) {
      await page.evaluate(block); await settle(page, 400);
      const during = await alive();
      assert.deepEqual([during.blockers, during.running, during.vis, during.touchable], [[blocker], false, 'hidden', false], name);
      await page.evaluate(unblock); await settle(page, 700);
      assert.deepEqual((await alive()).running, true, `${name} released`);
    }
    await clean(view);
  } finally { await h.close(); }
});

test('geometry 320 / 390 / 412 / landscape: inside the safe viewport, no overflow, no overlap with nav controls after a snap', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    for (const [width, height] of [[320, 568], [390, 844], [412, 915], [844, 390]]) {
      const view = await open(h, { width, height });
      const { page } = view;
      const label = `${width}x${height}`;
      const check = async (where) => {
        const g = await page.evaluate(() => {
          const nav = document.querySelector('.nav').getBoundingClientRect(); const hit = document.querySelector('.us-pet-hit').getBoundingClientRect();
          const actor = document.querySelector('.us-pet-actor').getBoundingClientRect();
          const tabs = [...document.querySelectorAll('.nav button')].map((b) => { const r = b.getBoundingClientRect(); return b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); });
          return { navTop: nav.top, hitBottom: hit.bottom, actor: { x: actor.x, y: actor.y, right: actor.right, bottom: actor.bottom }, tabs, overflow: document.scrollingElement.scrollWidth > innerWidth, vw: innerWidth, vh: innerHeight };
        });
        assert.ok(g.actor.x >= 0 && g.actor.right <= g.vw && g.actor.y >= 0 && g.actor.bottom <= g.vh, `${label} ${where}: inside viewport ${JSON.stringify(g.actor)}`);
        assert.ok(g.hitBottom <= g.navTop + 0.5, `${label} ${where}: hit target clear of the nav (${g.hitBottom} vs ${g.navTop})`);
        assert.deepEqual(g.tabs, [true, true, true, true], `${label} ${where}: every tab keeps its tap`);
        assert.equal(g.overflow, false, `${label} ${where}: no horizontal overflow`);
      };
      await check('nav');
      await tab(page, 'quiz');
      const planes = await page.evaluate(() => window.USPet.planes());
      if (planes.length) {
        const target = planes[0];
        const p = await pickUp(view);
        await carryTo(view, p, gripFor(target.rim, target.segments[0][1]));
        assert.equal((await state(page)).placement.id, target.id, `${label}: snapped onto ${target.id}`);
        await check(target.id);
        await shot(page, `maudit-gioca-${label}`);
      } else {
        assert.ok(height < 500, `${label}: only a short landscape viewport may offer the nav plane alone`);
      }
      // Back onto the nav rim, at its far end.
      const navTop = await page.evaluate(() => document.querySelector('.nav').getBoundingClientRect().top);
      const p = await pickUp(view);
      await carryTo(view, p, gripFor(navTop + 3, width));
      assert.equal((await state(page)).placement.kind, 'nav');
      await check('nav end');
      // Orientation / viewport change re-derives the plane from live geometry.
      await page.setViewportSize({ width: height, height: width }); await settle(page, 600);
      await check('rotated');
      await clean(view);
    }
  } finally { await h.close(); }
});

test('reduced motion: tap, pickup, drag, snap and the toggle all still work', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const view = await open(h, { reduced: true });
    const { page, touch } = view;
    assert.equal(await page.evaluate(() => window.USPet.snapshot().reduced), true);
    let p = await hitCenter(page);
    await touch.start(p); await page.waitForTimeout(60); await touch.end(); await settle(page, 120);
    assert.equal((await state(page)).snap.state, 'pet');
    await settle(page, 1500);
    await tab(page, 'quiz');
    const target = (await page.evaluate(() => window.USPet.planes()))[0];
    p = await pickUp(view);
    assert.equal((await state(page)).snap.state, 'held');
    const transition = await page.evaluate(() => getComputedStyle(document.querySelector('.us-pet-actor')).transitionDuration);
    assert.equal(transition, '0s', 'no animated travel');
    await carryTo(view, p, gripFor(target.rim, target.segments[0][0]));
    const s = await state(page);
    assert.deepEqual([s.placement.id, s.snap.state], [target.id, 'idle']);
    await page.evaluate(() => window.USPet.setEnabled(false));
    assert.equal(await page.evaluate(() => window.USPet.enabled), false);
    await page.evaluate(() => window.USPet.setEnabled(true)); await settle(page, 400);
    assert.equal((await state(page)).placement.id, target.id, 'On restores the saved plane');
    await clean(view);
  } finally { await h.close(); }
});
