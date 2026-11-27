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

test('the second row: their face and state, the red gesture, «✓ Mandato»; their sheet; my pill and the gesture I got', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await ready(page);
    // Nobody said anything yet: one glass pill like the distance, «Beatrice ?» | «＋ Tu» with its beat.
    const her = page.locator('#usOggiPartner');
    await her.waitFor({ state: 'visible' });
    const words = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();
    assert.equal(await words(her), 'Beatrice ?');
    assert.equal(await page.locator('#usOggiStatus').getAttribute('data-mine'), 'none');
    assert.equal(await words(page.locator('#usOggiStatus')), '＋ Tu');
    assert.ok(await page.locator('#usOggiStatus .us-status-plus').isVisible());
    assert.notEqual(await page.locator('#usOggiStatus .us-status-plus').evaluate((el) => getComputedStyle(el).animationName), 'none', 'a light beat');
    assert.ok(await her.locator('[data-status-face] svg').count(), 'their real face');
    await page.evaluate(() => window.renderDistanceCapsule({ visible: true, state: 'ready', near: false, km: 120, text: '120 km' }));
    await page.waitForTimeout(150);
    const look = await page.evaluate(() => {
      const cs = (id) => getComputedStyle(document.getElementById(id));
      const g = cs('usOggiStatusGroup'), d = cs('distanceWidget');
      const box = (id) => document.getElementById(id).getBoundingClientRect();
      return { bg: [g.backgroundColor, d.backgroundColor], color: [g.color, d.color], h: [box('usOggiStatusGroup').height, box('distanceWidget').height], top: [box('usOggiStatusGroup').top, box('distanceWidget').top] };
    });
    assert.equal(look.bg[0], look.bg[1], 'the distance\'s ground');
    assert.equal(look.color[0], look.color[1], 'the distance\'s ink');
    assert.equal(look.h[0], look.h[1], 'the distance\'s height');
    assert.equal(look.top[0], look.top[1], 'beside the distance');
    await shot(page, 'v2-390-senza-stato');
    await partnerIs(page, 'giu', 3);
    assert.match(await words(her), /^(Beatrice )?giù$/);
    const quick = page.locator('#usOggiStatusReply');
    await quick.waitFor({ state: 'visible' });
    assert.match(await words(quick), /^🤗( Abbraccio)?$/);
    assert.equal(await quick.getAttribute('aria-label'), 'Manda un abbraccio');
    const color = await quick.evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.equal(color, 'rgb(184, 67, 47)', 'ceralacca');
    const box = await page.locator('#usOggiStatusGroup').boundingBox();
    assert.equal(box.height, 40, 'as tall as every pill of the row');
    assert.ok(box.width >= 150, 'readable');
    await shot(page, 'v2-390-con-stato');
    // Their sheet: the big character, how and until when, the gesture in full, Ti penso, a voice message.
    await her.click();
    const sheet = page.locator('#usStatusPerson.open');
    await sheet.waitFor({ state: 'visible' });
    assert.equal((await page.locator('#usStatusPersonTitle').innerText()).trim(), 'Beatrice è giù');
    assert.match(await page.locator('#usStatusPersonSince').innerText(), /^😔 da 3 ore · fino alle \d\d:\d\d$/);
    assert.ok(await page.locator('#usStatusPersonChar svg').count());
    const respond = page.locator('#usStatusRespond');
    assert.equal((await respond.innerText()).trim(), '🤗 Manda un abbraccio');
    await page.waitForTimeout(400);
    await shot(page, 'v2-foglio-persona');
    await respond.click();
    await page.waitForFunction(() => document.getElementById('usStatusRespond')?.dataset.sent === 'true');
    assert.equal((await respond.innerText()).trim(), '✓ Mandato');
    assert.equal(await respond.isDisabled(), true);
    const sent = await page.evaluate(() => ({ args: window.__respond, pushes: window.__pushes, setAt: window.__partnerRow.set_at }));
    assert.deepEqual(sent.args, { p_status_set_at: sent.setAt, p_gesture: 'abbraccio' }, 'the state the phone saw, its gesture');
    assert.deepEqual(sent.pushes, ['status_response']);
    await page.click('#usStatusPerson .us-modal-close');
    await page.waitForFunction(() => !document.getElementById('usStatusPerson').classList.contains('open'));
    // On the row: a pale «✓ Mandato» that does nothing more.
    assert.match(await words(quick), /^✓( Mandato)?$/);
    assert.equal(await quick.getAttribute('aria-disabled'), 'true');
    await page.evaluate(() => document.getElementById('usOggiStatusReply').click());
    await page.waitForTimeout(200);
    assert.deepEqual(await page.evaluate(() => window.__pushes), ['status_response']);
    await shot(page, 'v2-390-mandato');
    // Ti penso and the voice message from their sheet.
    await page.evaluate(() => { window.__thinks = 0; window.sendThinkSignal = () => { window.__thinks += 1; }; window.__opened = null; window.UsLeftForYou = { ...(window.UsLeftForYou || {}), openComposer: (o) => { window.__opened = o; } }; });
    await her.click();
    await sheet.waitFor({ state: 'visible' });
    await page.click('#usStatusPersonThink');
    assert.equal(await page.evaluate(() => window.__thinks), 1);
    await her.click();
    await sheet.waitFor({ state: 'visible' });
    await page.click('#usStatusPersonVoice');
    assert.deepEqual(await page.evaluate(() => window.__opened), { kind: 'audio' });
    await page.waitForFunction(() => document.getElementById('usStatusPerson').getAttribute('aria-hidden') === 'true');
    await page.waitForTimeout(500);

    // The other way: my state got an answer. «😴 Tu · stanco», «🌙 da Beatrice» beside it, a toast («Beatrice ti dice «Riposati»»), a heart by my character.
    await meIs(page, 'stanco', { form: 'm', reply_gesture: 'riposati', reply_at: new Date().toISOString() });
    await page.waitForFunction(() => /Beatrice ti dice «Riposati»/.test(document.getElementById('toast')?.textContent || ''));
    const got = page.locator('#usOggiGot');
    await got.waitFor({ state: 'visible' });
    assert.equal(await got.getAttribute('title'), 'Beatrice ti dice «Riposati»');
    assert.match(await got.innerText(), /🌙\s*(da Beatrice)?/);
    assert.match((await page.locator('#usOggiStatus').innerText()).replace(/\s+/g, ' '), /😴/);
    await page.waitForFunction(() => document.querySelector('.top [data-us-self] svg')?.dataset.reaction === 'coccola');
    await shot(page, 'v2-390-ricevuto');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});

// «Deve entrare tutto lì in Oggi senza spostare niente» (founder, 27/11/2026).
test('360×640: Oggi does not move or scroll whatever Come stai says, and the second row never wraps', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 360, height: 640 });
    await ready(page);
    const geometry = () => page.evaluate(() => {
      const r = (id) => { const e = document.getElementById(id); if (!e || e.hidden) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.height)]; };
      const group = document.getElementById('usOggiStatusGroup');
      const tops = [...group.querySelectorAll('button')].filter((c) => !c.hidden && c.getBoundingClientRect().width).map((c) => { const b = c.getBoundingClientRect(); return Math.round(b.top + b.height / 2); });
      return {
        scroll: document.documentElement.scrollHeight - innerHeight,
        days: r('usCountdownDisplay'), caption: r('usOggiCaption'), row: r('usOggiRow'), card: r('usDailyRitual'),
        oneLine: new Set(tops).size === 1, overflow: group.scrollWidth - group.clientWidth, fit: group.dataset.fit, width: Math.round(group.getBoundingClientRect().width),
      };
    });
    await page.evaluate(() => { window.__QA.tables.profiles[1].display_name = 'Beatrice Maria Antonietta'; return window.UsCoupleContext?.hydrate?.(); });
    await page.waitForTimeout(400);
    const base = await geometry();
    assert.equal(base.scroll, 0, 'no scroll');
    assert.ok(base.oneLine);
    const cases = [
      ['palestra', null, null], ['giu', 'giu', null], ['viaggio', 'lavoro', 'forza'], ['palestra', 'malato', 'abbraccio'], ['festa', null, 'cuore'],
    ];
    for (const [theirs, mine, got] of cases) {
      await partnerIs(page, theirs, 2);
      await meIs(page, mine, got ? { reply_gesture: got, reply_at: new Date().toISOString() } : {});
      await page.waitForTimeout(250);
      const now = await geometry();
      const label = `${theirs}/${mine}/${got}`;
      assert.deepEqual({ days: now.days, caption: now.caption, row: now.row, card: now.card, scroll: now.scroll }, { days: base.days, caption: base.caption, row: base.row, card: base.card, scroll: 0 }, label);
      assert.ok(now.oneLine, `${label}: one line`);
      assert.ok(now.overflow <= 1, `${label}: nothing cut off (${now.overflow}px, fit ${now.fit})`);
      // No room for its word: the gesture is its emoji, its label stays whole.
      if (theirs === 'palestra' && !got) assert.equal(await page.locator('#usOggiStatusReply').getAttribute('aria-label'), 'Manda «Spacca tutto!»');
      assert.ok(now.width >= 150, `${label}: readable (${now.width}px)`);
    }
    await partnerIs(page, 'palestra', 2);
    await meIs(page, 'giu', {});
    await page.waitForTimeout(250);
    await shot(page, 'v2-360-con-stato');
    await meIs(page, 'giu', { reply_gesture: 'abbraccio', reply_at: new Date().toISOString() });
    await page.waitForTimeout(250);
    await shot(page, 'v2-360-ricevuto');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});

test('the sheet of the twelve: «Beatrice lo vede subito», two groups; both lights readable', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 360, height: 640 });
    await ready(page);
    await page.click('#usOggiStatus');
    await page.waitForSelector('#usStatusSheet.open [data-status="festa"]');
    assert.equal((await page.locator('#usStatusNote').innerText()).trim(), 'Beatrice lo vede subito, anche nel widget. Dura 12 ore.');
    const heads = await page.locator('#usStatusSheet .us-status-group-head').allInnerTexts();
    assert.deepEqual(heads.map((x) => x.trim().toLowerCase()), ['come ti senti', 'cosa stai facendo']);
    await page.waitForTimeout(400);
    await shot(page, 'v2-foglio-stati');
    await page.click('#usStatusSheet .us-modal-close');
    await page.waitForFunction(() => !document.getElementById('usStatusSheet').classList.contains('open'));
    // Readable in both lights: dark ink on paper, light ink on the night glass.
    await partnerIs(page, 'stanco', 2);
    for (const luce of ['giorno', 'notte']) {
      await page.evaluate((l) => window.UsAspetto?.set?.(l), luce);
      await page.waitForTimeout(250);
      const ink = await page.evaluate(() => {
        const lum = (c) => { const m = c.match(/\d+(\.\d+)?/g).map(Number); const [r, g, b] = m.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const ratio = (el) => { const cs = getComputedStyle(el); let bg = cs.backgroundColor; if (/rgba\(.*, 0\)|transparent/.test(bg)) return null; const a = lum(cs.color), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
        // The pill's ground is its group's (28/11: one pill); the night glass is see-through, read on the dock's dark.
        return ['usOggiNext', 'usOggiStatusGroup'].map((id) => [id, ratio(document.getElementById(id))]);
      });
      for (const [id, r] of ink) if (r !== null) assert.ok(r >= 4.5, `${luce} ${id}: contrast ${r?.toFixed(2)}`);
      await shot(page, `v2-${luce}`, page.locator('#usOggiDock'));
    }
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
    // By day: from 22 to 6 the characters sleep and carry nothing (personaggi.js «sera»).
    await page.clock.setFixedTime(new Date(new Date().setHours(15, 0, 0, 0)));
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
    await shot(page, 'v2-oggetti');
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
    await shot(page, 'v2-us-ricorda');
    // The sheet: Ti penso or the gesture of their state.
    await page.click('#usFumetto [data-us-fumetto-text]');
    await page.waitForSelector('#usBattuta.open [data-battuta-gesture]');
    assert.equal((await page.locator('#usBattuta [data-battuta-think]').innerText()).trim(), 'Ti penso');
    assert.equal((await page.locator('#usBattuta [data-battuta-gesture]').innerText()).trim(), '🤗 Manda un abbraccio');
    await page.waitForTimeout(400);
    await shot(page, 'v2-us-ricorda-scheda');
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
    // Without a commitment there is no row 1: the suggestion never adds one.
    await partnerIs(page, 'stanco', 1);
    await page.waitForTimeout(300);
    assert.equal(await next.isHidden(), true, 'never a row more');
    // With tomorrow's commitment, the suggestion takes its place.
    await page.evaluate(() => window.UsOggiNext.render({ id: 'e9', kind: 'event', date: '2099-01-01', day: 'Domani', time: '', when: 'Domani', title: 'Cena da Marco' }));
    await page.waitForFunction(() => document.getElementById('usOggiNext')?.dataset.usNextKind === 'hint');
    assert.equal((await page.locator('#usOggiNextTitle').innerText()).trim(), '🎙 Un vocale a Beatrice?');
    assert.equal(await page.locator('#usOggiNext .us-icon').isHidden(), true, 'the emoji says it');
    await page.waitForTimeout(300);
    await shot(page, 'v2-oggi-vocale', page.locator('#usOggiDock'));
    await page.evaluate(() => { window.__opened = null; window.UsLeftForYou = { ...(window.UsLeftForYou || {}), openComposer: (o) => { window.__opened = o; } }; });
    await next.click();
    assert.deepEqual(await page.evaluate(() => window.__opened), { kind: 'audio' });
    // Both happy: a game.
    await partnerIs(page, 'felice', 1);
    await meIs(page, 'innamorato');
    await page.waitForFunction(() => document.getElementById('usOggiNextTitle')?.textContent === '🎲 Una partita?');
    assert.equal(await page.locator('#usOggiNext .us-icon').isHidden(), true);
    await shot(page, 'v2-oggi-partita', page.locator('#usOggiDock'));
    // A commitment of today wins; tomorrow's gives way to the suggestion.
    const today = await page.evaluate(() => window.localDateISO());
    await page.evaluate((d) => window.UsOggiNext.render({ id: 'e9', kind: 'event', date: d, day: 'Oggi', time: '20:00', when: 'Oggi, 20:00', title: 'Cena da Marco' }), today);
    assert.equal((await page.locator('#usOggiNextTitle').innerText()).trim(), 'Cena da Marco');
    assert.equal(await page.locator('#usOggiNext .us-icon').isVisible(), true, 'the calendar icon is back');
    await page.evaluate(() => window.UsOggiNext.render({ id: 'e9', kind: 'event', date: '2099-01-01', day: 'Domani', time: '', when: 'Domani', title: 'Cena da Marco' }));
    assert.equal((await page.locator('#usOggiNextTitle').innerText()).trim(), '🎲 Una partita?');
    // Nothing special: the row is the calendar's again.
    await partnerIs(page, 'lavoro', 1);
    await page.waitForFunction(() => document.getElementById('usOggiNextTitle')?.textContent === 'Cena da Marco');
    // In viaggio: the distance pill says so.
    await page.evaluate(() => window.renderDistanceCapsule({ visible: true, state: 'ready', near: false, km: 120, text: '120 km' }));
    assert.equal((await page.locator('#distanceValue').innerText()).trim(), '120 km');
    await partnerIs(page, 'viaggio', 1);
    await page.waitForFunction(() => document.getElementById('distanceValue')?.textContent === '🚗 in viaggio');
    assert.equal(await page.locator('#distanceWidget').getAttribute('aria-label'), 'Beatrice è in viaggio');
    await shot(page, 'v2-oggi-in-viaggio', page.locator('#usOggiDock'));
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
    await shot(page, 'v2-viaggio-calendario');
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
