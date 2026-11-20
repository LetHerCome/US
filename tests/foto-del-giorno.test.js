// La foto del giorno (founder, 20/11/2026: «le foto che scorrono hanno poco
// senso»): one photo for the whole day, chosen for a reason (this very day in
// a past year, then one just added, else one that stays the day), a tap opens
// its Ricordo, holding it offers «Non mostrarla più in Oggi» (this phone).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, qaFixture } = require('./helpers/countdown-browser');
const { FAKE_SUPABASE } = require('./helpers/oggi-browser');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Foto del giorno static: a day key, not the hour; tap opens, hold hides', () => {
  const app = read('app.js');
  assert.match(app, /function homeDayPick\(rows,day=homeDayKey\(\)/);
  assert.match(app, /\.in\('moment_date',homeAnniversaryDates\(\)\)/, 'anniversaries are read even when older than the last 120');
  assert.match(app, /window\.UsOggiPhoto=Object\.freeze\(\{current:usOggiPhotoCurrent,next:usOggiPhotoNext,open:usOggiPhotoOpen,hide:usOggiPhotoHide,/);
  const diario = read('diario.js');
  assert.match(diario, /w\.UsOggiPhoto\?\.open\?\.\(\);/);
  assert.doesNotMatch(diario, /Tocca per la prossima/);
  assert.match(read('index.html'), /id="dyPhoto" aria-label="La foto del giorno\. Apri il ricordo" aria-description="Per non mostrarla più in Oggi, tienila premuta"/);
});

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function pageWith(h, moments) {
  const ctx = await h.browser.newContext({ locale: 'it-IT', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Rome', serviceWorkers: 'block' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith(h.base)) return route.continue(); if (/supabase-js/.test(u)) return route.fulfill({ contentType: 'text/javascript', body: FAKE_SUPABASE }); return route.abort(); });
  await page.addInitScript(qaFixture, { style: 'editorial', mode: 'days', unlocked: true, missing: false, started: '2022-06-23', active: 'custom' });
  await page.addInitScript((list) => {
    const t = window.__QA.tables, c = t.profiles[0].couple_id, me = window.__QA.me;
    t.moments = list.map((m, i) => ({ id: m.id, couple_id: c, created_by: i % 2 ? 'b1' : me, storage_path: `c1/${m.id}/qa.webp`, moment_date: m.date, created_at: m.created, caption: m.caption }));
    t.moment_photos = t.moments.map((m) => ({ id: 'p' + m.id, moment_id: m.id, couple_id: c, storage_path: m.storage_path, caption: m.caption, position: 0, created_by: m.created_by }));
  }, moments);
  await page.goto(h.base + '/?us-dev=1', { waitUntil: 'load' });
  await page.waitForFunction(() => window.usProfile && window.UsOggiPhoto);
  await page.waitForTimeout(1800);
  return { page, ctx, errors };
}

test('Foto del giorno: this day years ago first, then one just added, else one that stays the day', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx } = await pageWith(h, []);
    try {
      const r = await page.evaluate(() => {
        const P = window.UsOggiPhoto, day = P.dayKey();
        const [y, m, d] = day.split('-');
        const row = (id, date, created) => ({ id, storage_path: `x/${id}`, moment_date: date, created_at: created || `${date}T10:00:00Z` });
        const old = [row('a', '2020-03-03'), row('b', '2021-07-09'), row('c', `${y - 2}-${m}-${d}`), row('e', `${y - 1}-${m}-${d}`)];
        const now = Date.now();
        const fresh = row('f', '2019-01-01', new Date(now - 3600e3).toISOString());
        const many = Array.from({ length: 30 }, (_, i) => row('n' + i, `2018-0${(i % 9) + 1}-1${i % 9}`));
        return {
          year: P.pick(old, day, { now, hidden: new Set() })?.id,
          yearHidden: P.pick(old, day, { now, hidden: new Set(['e']) })?.id,
          fresh: P.pick([...many, fresh], day, { now, hidden: new Set() })?.id,
          sameAllDay: P.pick(many, day, { now, hidden: new Set() })?.id === P.pick(many, day, { now: now + 5 * 3600e3, hidden: new Set() })?.id,
          allHidden: P.pick([row('z', '2018-01-01')], day, { now, hidden: new Set(['z']) })?.id,
        };
      });
      assert.equal(r.year, 'e', 'one year ago, the nearest year');
      assert.equal(r.yearHidden, 'c', 'hidden on this phone: the year before');
      assert.equal(r.fresh, 'f', 'one added in the last hours');
      assert.ok(r.sameAllDay, 'the same photo the whole day');
      assert.equal(r.allHidden, 'z', 'with every photo hidden it still shows one');
    } finally { await ctx.close(); }
  } finally { await h.close(); }
});

test('Foto del giorno browser: Oggi shows this day a year ago and says so; a tap opens it; holding hides it', async (t) => {
  const h = await start(); if (!h) return t.skip('Playwright unavailable');
  try {
    const now = new Date(), year = new Date(now); year.setFullYear(now.getFullYear() - 1);
    const old = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return d; };
    const moments = [
      { id: 'm1', date: iso(old(9)), created: old(9).toISOString(), caption: 'Colazione lenta' },
      { id: 'm2', date: iso(old(40)), created: old(40).toISOString(), caption: 'Il treno per Padova' },
      { id: 'my', date: iso(year), created: year.toISOString(), caption: 'Quella sera a Roma' },
    ];
    const { page, ctx, errors } = await pageWith(h, moments);
    try {
      await page.waitForFunction(() => window.UsOggiPhoto.current().path, null, { timeout: 5000 });
      assert.equal(await page.evaluate(() => window.UsOggiPhoto.current().path), 'c1/my/qa.webp');
      assert.match(await page.locator('#dyFrase').innerText(), /Un anno fa, proprio oggi/);
      // A tap opens its Ricordo in Ricordi.
      await page.click('#dyPhoto'); await page.waitForTimeout(900);
      assert.equal(await page.evaluate(() => document.querySelector('.page.active')?.id), 'moments');
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      await page.evaluate(() => go('home', { nav: true })); await page.waitForTimeout(700);
      // Holding it: «Non mostrarla più in Oggi?», then another photo.
      const b = await page.locator('#dyPhoto').boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(750); await page.mouse.up();
      await page.waitForSelector('[data-us-confirm="ok"]', { state: 'visible', timeout: 3000 });
      await page.click('[data-us-confirm="ok"]'); await page.waitForTimeout(1200);
      assert.notEqual(await page.evaluate(() => window.UsOggiPhoto.current().path), 'c1/my/qa.webp');
      assert.equal(await page.evaluate(() => document.querySelector('.page.active')?.id), 'home', 'holding did not open it');
      assert.deepEqual(errors, []);
    } finally { await ctx.close(); }
  } finally { await h.close(); }
});
