// Navigation soak — the real app in Chromium (fake Supabase from the shared
// fixture), driven with real taps and the system Back, several full cycles:
// Oggi → Noi → Gioca → Ricordi → Oggi → Ti penso → Back → Lasciato per te →
// Back → Noi section → Back → Countdown → close → Oggi. After every cycle the
// shell must be exactly as clean as at the start.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, pageFor } = require('./helpers/countdown-browser');

const CYCLES = 4;

function shellState() {
  const visible = (el) => {
    if (!el) return false;
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.01 && rect.width > 0 && rect.height > 0;
  };
  const pet = document.getElementById('usPetLayer');
  return {
    pages: [...document.querySelectorAll('.page.active')].map((page) => page.id),
    navActive: [...document.querySelectorAll('.nav button.active')].map((button) => button.dataset.page),
    navCount: document.querySelectorAll('nav.nav').length,
    openModals: [...document.querySelectorAll('[data-us-modal]')]
      .filter((modal) => !modal.hidden && modal.getAttribute('aria-hidden') !== 'true').map((modal) => modal.id || modal.className),
    visibleOverlays: [...document.querySelectorAll('.open,.show')].filter(visible).map((el) => el.id || el.className),
    inert: [...document.querySelectorAll('[inert]')].map((el) => el.id || el.className),
    bodyClasses: [...document.body.classList].sort(),
    bodySurface: document.body.getAttribute('data-us-surface'),
    bodyOverflow: document.body.style.overflow,
    noiSection: document.getElementById('noiHub')?.hidden === true,
    pet: { visibility: getComputedStyle(pet).visibility, blockers: window.USPet.blockers(), running: window.USPet.snapshot().running },
    overflowX: document.scrollingElement.scrollWidth > innerWidth,
    history: history.state && { kind: history.state.kind, page: history.state.page, layer: history.state.layer || null }
  };
}

const CLEAN_OGGI = {
  pages: ['home'], navActive: ['home'], navCount: 1, openModals: [], visibleOverlays: [], inert: [], bodyClasses: [],
  bodySurface: null, bodyOverflow: '', noiSection: false,
  pet: { visibility: 'visible', blockers: [], running: true }, overflowX: false,
  history: { kind: 'page', page: 'home', layer: null }
};

async function settle(page, ms = 450) { await page.waitForTimeout(ms); }

test('navigation soak: repeated cycles through every primary surface leave one clean, deterministic shell', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, {});
    const consoleErrors = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    const tab = async (name) => { await page.click(`.nav button[data-page="${name}"]`); await settle(page); };
    const back = async () => { await page.goBack(); await settle(page, 600); };
    const expectPage = async (label, id) => {
      const state = await page.evaluate(shellState);
      assert.deepEqual({ pages: state.pages, openModals: state.openModals }, { pages: [id], openModals: [] }, label);
    };

    assert.deepEqual(await page.evaluate(shellState), CLEAN_OGGI, 'starting shell');
    for (let cycle = 0; cycle < CYCLES; cycle += 1) {
      await tab('bond'); await expectPage(`${cycle} Noi`, 'bond');
      await tab('quiz'); await expectPage(`${cycle} Gioca`, 'quiz');
      await tab('moments'); await expectPage(`${cycle} Ricordi`, 'moments');
      await tab('home'); await expectPage(`${cycle} Oggi`, 'home');

      // Ti penso arrives: a transient surface, the PET stays; Back closes it on Oggi.
      await page.evaluate(() => { usIncomingThink = { id: `qa-think-${Date.now()}`, sender_id: 'b1', created_at: new Date().toISOString() }; window.openThinkArrival(); });
      await settle(page);
      const arrival = await page.evaluate(shellState);
      assert.deepEqual({ modals: arrival.openModals, pet: arrival.pet.visibility }, { modals: ['thinkArrival'], pet: 'visible' }, `${cycle} Ti penso`);
      await back(); await expectPage(`${cycle} Ti penso → Back`, 'home');

      // Lasciato per te with nothing waiting opens the composer: Back closes it, Oggi stays.
      await page.waitForFunction(() => document.getElementById('leftForYouPartnerEntry')?.getAttribute('aria-busy') !== 'true');
      await page.click('#leftForYouPartnerEntry'); await settle(page);
      assert.deepEqual((await page.evaluate(shellState)).openModals, ['leftForYouComposerOverlay'], `${cycle} Lasciato per te`);
      await back(); await expectPage(`${cycle} Lasciato per te → Back`, 'home');

      // A Noi section, then Back to the Noi hub.
      await tab('bond');
      await page.click('[data-noi-open="resonance"]'); await settle(page);
      assert.equal((await page.evaluate(shellState)).noiSection, true, `${cycle} Noi section open`);
      await back();
      const hub = await page.evaluate(shellState);
      assert.deepEqual({ pages: hub.pages, noiSection: hub.noiSection, modals: hub.openModals }, { pages: ['bond'], noiSection: false, modals: [] }, `${cycle} Noi section → Back`);

      // Countdown from Oggi, closed with its own button.
      await tab('home');
      await page.click('#usCountdownDisplay'); await settle(page);
      assert.deepEqual((await page.evaluate(shellState)).openModals, ['usCountdownSheet'], `${cycle} Countdown`);
      await page.click('#usCountdownSheet [data-us-modal-close]'); await settle(page, 700);

      assert.deepEqual(await page.evaluate(shellState), CLEAN_OGGI, `cycle ${cycle} ends on a clean Oggi`);
    }

    // Back stays deterministic after all the cycles: it unwinds page by page,
    // never reopens a closed surface and never leaves a page half-active.
    const unwound = [];
    for (let i = 0; i < 4; i += 1) {
      await back();
      const state = await page.evaluate(shellState);
      assert.equal(state.pages.length, 1, 'exactly one active page');
      assert.deepEqual(state.openModals, [], 'no surface comes back from history');
      assert.deepEqual(state.navActive, state.pages.filter((id) => id !== 'settings'), 'bottom nav follows the page');
      unwound.push(state.pages[0]);
    }
    assert.deepEqual(unwound, ['bond', 'home', 'moments', 'quiz'], 'Back walks the real page trail');
    assert.deepEqual(errors, []);
    assert.deepEqual(consoleErrors, []);
    await ctx.close();
  } finally { await h.close(); }
});

test('navigation: Back unwinds a three-deep stack one level at a time (Noi section → Calendar → form)', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, {});
    const state = () => page.evaluate(() => ({
      noiSection: document.getElementById('noiHub').hidden === true,
      calendar: document.getElementById('usCalendarOverlay').classList.contains('open'),
      form: Boolean(document.getElementById('usCalendarFormSheet')?.classList.contains('open'))
    }));
    await page.click('.nav button[data-page="bond"]');
    await page.click('[data-noi-open="eventi"]'); await settle(page);
    await page.evaluate(() => window.openCalendarSurface()); await settle(page);
    await page.click('#usCalendarAddEntry'); await settle(page);
    assert.deepEqual(await state(), { noiSection: true, calendar: true, form: true });
    await page.goBack(); await settle(page, 600);
    assert.deepEqual(await state(), { noiSection: true, calendar: true, form: false }, 'Back closes only the form');
    await page.goBack(); await settle(page, 600);
    assert.deepEqual(await state(), { noiSection: true, calendar: false, form: false }, 'then only the calendar');
    await page.goBack(); await settle(page, 600);
    assert.deepEqual(await state(), { noiSection: false, calendar: false, form: false }, 'then the section');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await h.close(); }
});
