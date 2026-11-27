// Come stai che conta (grill del founder del 27/11/2026) in the real app with
// the fake Supabase: the gesture under the other person's state (sheet and
// Oggi row, then «Mandato ♡»), the things on the characters, the line of US
// vi ricorda after two hours with a fixed clock, Oggi's suggestion and
// «in viaggio», and «In viaggio» → the Noi calendar. COME_STAI_SHOTS=<dir>
// also saves the screenshots for the founder.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, pageFor } = require('./helpers/countdown-browser');

const SHOTS = process.env.COME_STAI_SHOTS || '';
async function shot(page, name, locator = null) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `comestai-${name}.png`);
  if (locator) await locator.screenshot({ path: file });
  else await page.screenshot({ path: file });
}

// The other person's row arrives as Realtime would bring it (member-status.js onChange).
async function partnerIs(page, status, hoursAgo = 1, extra = {}) {
  await page.evaluate(([s, h, more]) => {
    const now = Date.now();
    const row = { user_id: 'b1', couple_id: 'c1', status: s, form: null, set_at: new Date(now - h * 3600e3).toISOString(), expires_at: new Date(now + (12 - h) * 3600e3).toISOString(), reply_gesture: null, reply_at: null, ...more };
    window.__partnerRow = row;
    window.UsMemberStatus.onChange({ eventType: 'UPDATE', new: row });
  }, [status, hoursAgo, extra]);
}
async function meIs(page, status, extra = {}) {
  await page.evaluate(([s, more]) => {
    const now = Date.now();
    window.UsMemberStatus.onChange({ eventType: 'UPDATE', new: { user_id: window.usProfile.id, couple_id: 'c1', status: s, form: null, set_at: s ? new Date(now - 600e3).toISOString() : null, expires_at: s ? new Date(now + 11 * 3600e3).toISOString() : null, ...more } });
  }, [status, extra]);
}
async function ready(page) {
  await page.waitForFunction(() => window.UsMemberStatus?.respond && window.UsPersonaggi && window.usProfile?.couple_id && document.getElementById('usOggiStatus') && !document.getElementById('usOggiStatus').hidden, null, { timeout: 30000 });
  await page.evaluate(() => {
    window.__pushes = [];
    window.sendWebPushEvent = (type) => { window.__pushes.push(type); return Promise.resolve({}); };
    window.__QA.rpc.respond_member_status = async (args) => { window.__respond = args; return { data: { gesture: args.p_gesture, at: new Date().toISOString(), set_at: args.p_status_set_at, already: false }, error: null }; };
    window.__QA.rpc.set_member_status = async ({ p_status }) => { const now = Date.now(); return { data: { status: p_status, form: null, set_at: p_status ? new Date(now).toISOString() : null, expires_at: p_status ? new Date(now + 12 * 3600e3).toISOString() : null }, error: null }; };
    window.UsAngolo?.isola?.(false);
  });
}

test('the gesture under the other person\'s state: one tap from the sheet, then «Mandato ♡»; the push and the reaction', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await ready(page);
    await partnerIs(page, 'giu', 3);
    // The Oggi row: the small action beside the pill.
    const quick = page.locator('#usOggiStatusReply');
    await quick.waitFor({ state: 'visible' });
    assert.equal(await quick.innerText(), '🤗');
    assert.match(await quick.getAttribute('aria-label'), /Rispondi a Beatrice: Ti mando un abbraccio/);
    const box = await quick.boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, 'tap target');
    // The sheet: the partner's line and the gesture under it.
    await page.click('#usOggiStatus');
    const respond = page.locator('#usStatusRespond');
    await respond.waitFor({ state: 'visible' });
    assert.equal((await respond.innerText()).trim(), 'Ti mando un abbraccio');
    assert.match(await page.locator('#usStatusPartnerLine').innerText(), /Beatrice: 😔 giù · da 3 ore/);
    await page.waitForTimeout(400);
    await shot(page, 'scheda-gesto');
    await respond.click();
    await page.waitForFunction(() => document.getElementById('usStatusRespond')?.dataset.sent === 'true');
    assert.equal((await respond.innerText()).trim(), 'Mandato ♡');
    assert.equal(await respond.getAttribute('aria-disabled'), 'true');
    const sent = await page.evaluate(() => ({ args: window.__respond, pushes: window.__pushes, setAt: window.__partnerRow.set_at }));
    assert.deepEqual(sent.args, { p_status_set_at: sent.setAt, p_gesture: 'abbraccio' }, 'the state the phone saw, its gesture');
    assert.deepEqual(sent.pushes, ['status_response']);
    await shot(page, 'scheda-mandato');
    // A second tap sends nothing.
    await page.evaluate(() => document.getElementById('usStatusRespond').click());
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => window.__pushes), ['status_response']);
    // On the Oggi row «Mandato ♡» for a moment, then the action goes.
    await page.click('#usStatusSheet [data-status-close].us-modal-close');
    await page.waitForFunction(() => document.getElementById('usOggiStatusReply')?.hidden === true, null, { timeout: 6000 });

    // The other way: my state got an answer. A toast once, a heart by my character.
    await meIs(page, 'stanco', { reply_gesture: 'riposati', reply_at: new Date().toISOString() });
    await page.waitForFunction(() => /Beatrice: Riposati/.test(document.getElementById('toast')?.textContent || ''));
    await page.waitForFunction(() => document.querySelector('.top [data-us-self] svg')?.dataset.reaction === 'coccola');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});

test('the six things on the characters, in the app as on the widgets; the faces follow at once', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await ready(page);
    // The other person at work: their character in the island carries the briefcase, at once.
    await partnerIs(page, 'lavoro', 1);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-us-isola-duo] .us-char')].some((svg) => svg.querySelector('[data-thing="valigetta"]')), null, { timeout: 5000 });
    // A board of the six, as the founder will see them.
    await page.evaluate(() => {
      const P = window.UsPersonaggi;
      const board = document.createElement('div');
      board.id = 'qaThings';
      board.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:28px 16px;background:#120d11;color:#f7efe9;font:600 14px Figtree,sans-serif;align-content:start';
      const rows = [['lavoro', 'palla', 'var(--us-rosa)', 'al lavoro'], ['studio', 'quadrato', 'var(--us-lilla)', 'sui libri'], ['palestra', 'triangolo', '#8fd49b', 'in palestra'], ['viaggio', 'goccia', '#6fd6c8', 'in viaggio'], ['tavola', 'nuvola', '#ff9f6e', 'a tavola'], ['malato', 'palla', '#a98bff', 'non sto bene']];
      board.innerHTML = rows.map(([mood, shape, color, label]) => `<figure style="margin:0;display:grid;justify-items:center;gap:6px">${P.character({ shape, color }, { mood, reaction: '', size: 96 })}<figcaption>${label}</figcaption></figure>`).join('')
        + `<figure style="margin:0;display:grid;justify-items:center;gap:6px">${P.character({ shape: 'palla', color: '#a98bff' }, { mood: 'malato', reaction: 'sera', size: 96 })}<figcaption>non sto bene, di notte</figcaption></figure>`
        + `<figure style="margin:0;display:grid;justify-items:center;gap:6px">${P.character({ shape: 'palla', color: 'var(--us-rosa)' }, { mood: 'lavoro', reaction: 'sera', size: 96 })}<figcaption>al lavoro, di notte</figcaption></figure>`
        + `<figure style="margin:0;display:grid;justify-items:center;gap:6px">${P.character({ shape: 'quadrato', color: 'var(--us-lilla)' }, { mood: 'stanco', reaction: 'coccola', size: 96 })}<figcaption>ha ricevuto un gesto</figcaption></figure>`;
      document.body.appendChild(board);
    });
    const things = await page.evaluate(() => [...document.querySelectorAll('#qaThings [data-thing]')].map((g) => g.dataset.thing));
    assert.deepEqual(things, ['valigetta', 'libro', 'fascia', 'valigia', 'forchetta', 'termometro', 'termometro']);
    assert.equal(await page.locator('#qaThings figure:nth-child(8) text').count(), 2, 'the others sleep');
    assert.equal(await page.locator('#qaThings figure:nth-child(7) text').count(), 0, 'not feeling well never sleeps');
    await shot(page, 'oggetti');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});

test('US vi ricorda after two hours, with a fixed clock: «Beatrice è giù da 3 ore. Un pensiero?», once, with Ti penso or the gesture', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await ready(page);
    await page.waitForFunction(() => window.UsAngolo?.parla && window.UsRicorda?.say && document.getElementById('usIsola') && !document.getElementById('usIsola').hidden, null, { timeout: 30000 });
    await page.evaluate(() => {
      const me = window.usProfile.id;
      localStorage.removeItem(`us:ricorda:v1:${me}`);
      localStorage.setItem(`us:ricorda:intro:v1:${me}`, '1');
      window.__usRicordaNow = { day: '2026-11-27', hour: 15 };
      window.__thinks = 0;
      window.sendThinkSignal = () => { window.__thinks += 1; };
      window.UsAngolo.isola(false);
    });
    // Before two hours: nothing.
    await partnerIs(page, 'giu', 1.5);
    await page.evaluate(() => window.UsRicorda.say());
    await page.waitForTimeout(2200);
    assert.equal(await page.locator('#usFumetto[data-open]').count(), 0);
    await partnerIs(page, 'giu', 3);
    await page.evaluate(() => window.UsRicorda.say());
    await page.waitForSelector('#usFumetto[data-open]', { timeout: 8000 });
    assert.equal((await page.locator('#usFumetto [data-us-fumetto-text]').innerText()).trim(), 'Beatrice è giù da 3 ore. Un pensiero?');
    await page.waitForTimeout(500);
    await shot(page, 'us-ricorda');
    // The sheet: Ti penso or the gesture of their state.
    await page.click('#usFumetto [data-us-fumetto-text]');
    await page.waitForSelector('#usBattuta.open [data-battuta-gesture]');
    assert.equal((await page.locator('#usBattuta [data-battuta-think]').innerText()).trim(), 'Ti penso');
    assert.equal((await page.locator('#usBattuta [data-battuta-gesture]').innerText()).trim(), 'Ti mando un abbraccio');
    await page.waitForTimeout(400);
    await shot(page, 'us-ricorda-scheda');
    await page.click('#usBattuta [data-battuta-gesture]');
    await page.waitForFunction(() => window.__respond?.p_gesture === 'abbraccio');
    // Once per state: said, it is not said again.
    await page.evaluate(() => { localStorage.removeItem(`us:ricorda:v1:${window.usProfile.id}`); window.UsAngolo.isola(false); window.UsRicorda.say(); });
    await page.waitForTimeout(2200);
    assert.equal(await page.locator('#usFumetto[data-open]').count(), 0);
    // At night it never speaks.
    await partnerIs(page, 'malato', 4);
    await page.evaluate(() => { localStorage.removeItem(`us:ricorda:v1:${window.usProfile.id}`); window.__usRicordaNow = { day: '2026-11-27', hour: 23 }; window.UsRicorda.say(); });
    await page.waitForTimeout(2200);
    assert.equal(await page.locator('#usFumetto[data-open]').count(), 0);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});

test('Oggi: one light suggestion from your two states, never over today\'s commitment; the distance says «in viaggio»', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await ready(page);
    const next = page.locator('#usOggiNext');
    await partnerIs(page, 'stanco', 1);
    await page.waitForFunction(() => document.getElementById('usOggiNext')?.dataset.usNextKind === 'hint');
    assert.equal((await page.locator('#usOggiNextTitle').innerText()).trim(), 'Lascia un vocale a Beatrice');
    assert.equal(await page.locator('#usOggiNext .us-icon').getAttribute('data-us-icon'), 'microphone');
    await page.waitForTimeout(300);
    await shot(page, 'oggi-vocale', page.locator('#usOggiDock'));
    await page.evaluate(() => { window.__opened = null; window.UsLeftForYou = { ...(window.UsLeftForYou || {}), openComposer: (o) => { window.__opened = o; } }; });
    await next.click();
    assert.deepEqual(await page.evaluate(() => window.__opened), { kind: 'audio' });
    // Both happy: a game.
    await partnerIs(page, 'felice', 1);
    await meIs(page, 'innamorato');
    await page.waitForFunction(() => document.getElementById('usOggiNextTitle')?.textContent === 'Una partita?');
    assert.equal(await page.locator('#usOggiNext .us-icon').getAttribute('data-us-icon'), 'game-controller');
    await shot(page, 'oggi-partita', page.locator('#usOggiDock'));
    // A commitment of today wins; tomorrow's gives way to the suggestion.
    const today = await page.evaluate(() => window.localDateISO());
    await page.evaluate((d) => window.UsOggiNext.render({ id: 'e9', kind: 'event', date: d, day: 'Oggi', time: '20:00', when: 'Oggi, 20:00', title: 'Cena da Marco' }), today);
    assert.equal((await page.locator('#usOggiNextTitle').innerText()).trim(), 'Cena da Marco');
    assert.equal(await page.locator('#usOggiNext .us-icon').getAttribute('data-us-icon'), 'calendar-blank');
    await page.evaluate(() => window.UsOggiNext.render({ id: 'e9', kind: 'event', date: '2099-01-01', day: 'Domani', time: '', when: 'Domani', title: 'Cena da Marco' }));
    assert.equal((await page.locator('#usOggiNextTitle').innerText()).trim(), 'Una partita?');
    // Nothing special: the row is the calendar's again.
    await partnerIs(page, 'lavoro', 1);
    await page.waitForFunction(() => document.getElementById('usOggiNextTitle')?.textContent === 'Cena da Marco');
    // In viaggio: the distance pill says so.
    await page.evaluate(() => window.renderDistanceCapsule({ visible: true, state: 'ready', near: false, km: 120, text: '120 km' }));
    assert.equal((await page.locator('#distanceValue').innerText()).trim(), '120 km');
    await partnerIs(page, 'viaggio', 1);
    await page.waitForFunction(() => document.getElementById('distanceValue')?.textContent === 'in viaggio');
    assert.equal(await page.locator('#distanceWidget').getAttribute('aria-label'), 'Beatrice è in viaggio');
    await shot(page, 'oggi-in-viaggio', page.locator('#usOggiDock'));
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});

test('«In viaggio» offers the Noi calendar once: dismissable, or the editor with «In viaggio» today', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await ready(page);
    await page.click('#usOggiStatus');
    await page.waitForSelector('#usStatusSheet.open [data-status="viaggio"]');
    await page.click('#usStatusSheet [data-status="viaggio"]');
    const trip = page.locator('#usStatusTrip');
    await trip.waitFor({ state: 'visible' });
    assert.equal((await page.locator('#usStatusTripText').innerText()).trim(), 'Lo segno nel calendario di Noi?');
    assert.ok(await page.locator('#usStatusSheet.open').count(), 'the sheet stays open');
    assert.deepEqual(await page.evaluate(() => window.__pushes), ['partner_status'], 'the other person\'s widgets follow');
    await page.waitForTimeout(300);
    await shot(page, 'viaggio-calendario');
    // «No, grazie» closes it.
    await page.click('#usStatusTripNo');
    await page.waitForFunction(() => !document.getElementById('usStatusSheet').classList.contains('open'));
    // Again, and yes: the Noi editor, «In viaggio», today, all day; the person saves it.
    await page.click('#usOggiStatus');
    await page.waitForSelector('#usStatusSheet.open [data-status="viaggio"]');
    await page.click('#usStatusSheet [data-status="viaggio"]');
    await trip.waitFor({ state: 'visible' });
    await page.click('#usStatusTripYes');
    await page.waitForFunction(() => document.getElementById('usCalendarFormSheet')?.classList.contains('open'), null, { timeout: 8000 });
    const form = await page.evaluate(() => ({ title: document.getElementById('usCalendarTitleInput').value, allDay: document.getElementById('usCalendarAllDayInput').checked, date: document.getElementById('usCalendarDateInput').value, today: window.localDateISO() }));
    assert.deepEqual({ title: form.title, allDay: form.allDay, date: form.date }, { title: 'In viaggio', allDay: true, date: form.today });
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});
