// L'apertura che accoglie (founder 27/11/2026, prototipo «L'apertura di US»; it
// replaces Apertura A): at a cold start of the installed app your two characters
// lean out from behind the logo, a heart is born, US says hello by name; it waits
// for the app (UsAppReady: 1.4 s at least, 3.2 s at most), then the two fly into
// the island and the app opens from behind. Back after more than an hour: «Eccoti».
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, pageFor } = require('./helpers/countdown-browser');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('index.html');
const launchScript = () => {
  const at = html.indexOf('<div class="us-launch-intro"');
  const from = html.indexOf('<script>', at) + 8;
  return html.slice(from, html.indexOf('</script>', from));
};

test('the opening: markup, the safe saved characters, the timings and the way out', () => {
  assert.match(html, /<div class="us-launch-intro" id="usLaunchIntro" aria-hidden="true"><span class="bg"><\/span><span class="duo"><span class="me"><\/span><span class="them"><\/span><svg class="heart"[^>]*>.*?<\/svg><\/span><span class="logo"><\/span><span class="hello" translate="no"><b><\/b><span><\/span><\/span><\/div>/);
  const js = launchScript();
  // Installed app only; with Riduci movimento it still plays (no longer removed).
  assert.match(js, /if \(!intro \|\| \(!native && !standalone\)\) \{ intro\?\.remove\(\); return; \}/);
  assert.doesNotMatch(js, /reduced\) \{ intro\?\.remove/);
  assert.match(js, /const MIN_MS = 1400, MAX_MS = 3200, CALM_MIN_MS = 900, FLY_MS = 600;/);
  assert.match(js, /Promise\.race\(\[Promise\.all\(\[ready, wait\(min\)\]\), wait\(MAX_MS\)\]\)/);
  assert.match(js, /const ready = Promise\.resolve\(w\.UsAppReady\?\.whenReady\);/);
  // The safety net always takes the overlay away, and a throw ends it at once.
  assert.match(js, /setTimeout\(done, MAX_MS \+ 1600\);/);
  assert.match(js, /try \{ play\(\); \} catch \(_\) \{ done\(\); \}/);
  assert.match(js, /\}\)\.then\(done, done\);/);
  // The saved characters keep their check; the hello is text, never markup.
  assert.match(js, /svg\.startsWith\('<svg class="us-char'\) && !\/<script\|<foreignObject\|<image\|\\son\[a-z\]\+\\s\*=\|javascript:\|href\\s\*=\/i\.test\(svg\)/);
  assert.match(js, /line\.textContent = words\.hello; sub\.textContent = words\.sub;/);
  assert.doesNotMatch(js.replace(/me\.innerHTML = saved\.me; them\.innerHTML = saved\.them;/, ''), /innerHTML/);
  // One curve, 30 samples, easeInOutCubic, linear between samples; only transform and opacity.
  assert.match(js, /const N = 30, ctrl = \{ x: dx \* 0\.12, y: dy \* 0\.72 \}/);
  assert.match(js, /\{ duration: FLY_MS, easing: 'linear' \}/);
  assert.doesNotMatch(html.slice(html.indexOf('<style id="usLaunchIntroStyle">'), html.indexOf('</script>', html.indexOf('<div class="us-launch-intro"'))), /filter\s*:/);
  // Haptics through the one feedback engine, only in the native app.
  assert.match(js, /if \(native\) w\.UsFeedback\?\.landing\?\.\(\);/);
});

test('what the opening reads: kept by personaggi.js, forgotten at sign-out, in English too', () => {
  const p = read('personaggi.js');
  assert.match(p, /w\.localStorage\.setItem\('us:launch-duo:v1', JSON\.stringify\(duo\)\);/);
  assert.match(p, /w\.localStorage\.setItem\('us:launch-hello:v1', JSON\.stringify\(hello\)\);/);
  assert.match(p, /if \(!profileOf\(me\) \|\| !profileOf\(them\)\) return;/, 'only a couple of two');
  assert.match(read('app.js'), /'us:launch-duo:v1',\n    'us:launch-hello:v1'\n  \];/, 'signing out forgets them');
  const en = require('../i18n-en.js');
  for (const key of ['Buongiorno, {name}', 'Buon pomeriggio, {name}', 'Buonasera, {name}', 'Notte fonda, {name}', 'tu e {name}', 'Un attimo, vi preparo la giornata', 'Eccoti, {name}', '{n} giorni insieme', '1 giorno insieme']) assert.ok(en[key], key);
  // Never «Bentornato»: it has a gender.
  assert.doesNotMatch(p + launchScript(), /Bentornat/);
});

// The real app, installed (display-mode: standalone), with the moment it is ready
// decided by the test: a frozen UsAppReady the page cannot replace.
async function launch(h, { readyAt = 2600, reduced = false, hideIsola = false, throwAnimate = false, rejectReady = false, saved } = {}) {
  const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844, reduced });
  if (!saved) {
    await page.waitForFunction(() => localStorage.getItem('us:launch-duo:v1') && localStorage.getItem('us:launch-hello:v1'), null, { timeout: 15000 });
    saved = await page.evaluate(() => ({ duo: JSON.parse(localStorage.getItem('us:launch-duo:v1')), hello: JSON.parse(localStorage.getItem('us:launch-hello:v1')) }));
  }
  await page.addInitScript((o) => {
    localStorage.setItem('us:launch-duo:v1', JSON.stringify(o.saved.duo));
    localStorage.setItem('us:launch-hello:v1', JSON.stringify(o.saved.hello));
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q) => (q === '(display-mode: standalone)' ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : real(q));
    const log = window.__launch = { calls: [], playAt: 0, removedAt: 0, flyEnd: null, readyAt: 0 };
    let open;
    const whenReady = o.rejectReady ? Promise.reject(new Error('not ready')) : new Promise((resolve) => { open = resolve; });
    whenReady.catch(() => {});
    if (!o.rejectReady && o.readyAt >= 0) setTimeout(() => { log.readyAt = performance.now(); open({ reason: 'oggi', at: log.readyAt }); }, o.readyAt);
    Object.defineProperty(window, 'UsAppReady', { value: Object.freeze({ mark() {}, whenReady, ready: false, detail: null }), writable: false, configurable: false });
    if (o.hideIsola) document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '#usIsola{display:none!important}'; document.head.appendChild(s); });
    const animate = Element.prototype.animate;
    const box = (sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; };
    Element.prototype.animate = function (frames, opts) {
      const mine = Boolean(this.closest?.('#usLaunchIntro'));
      if (o.throwAnimate && mine) throw new Error('animate broke');
      const a = animate.call(this, frames, opts);
      if (mine) {
        const who = this.id || String(this.className?.baseVal ?? this.className ?? this.tagName);
        log.calls.push({ at: performance.now(), who, n: frames.length, duration: opts?.duration, last: JSON.stringify(frames[frames.length - 1]) });
        if (who === 'duo' && frames.length === 31) {
          a.finished.then(() => { log.flyEnd = { me: box('#usLaunchIntro .me svg'), them: box('#usLaunchIntro .them svg'), arriving: document.getElementById('usIsola')?.dataset.usArriving || '' }; }, () => {});
        }
      }
      return a;
    };
    let seen = false;
    new MutationObserver(() => {
      const intro = document.getElementById('usLaunchIntro');
      if (intro) seen = true;
      if (!log.playAt && document.documentElement.classList.contains('us-launch-play')) {
        log.playAt = performance.now();
        log.hello = intro?.querySelector('.hello b')?.textContent ?? null;
        log.sub = intro?.querySelector('.hello span')?.textContent ?? null;
        log.chars = intro ? intro.querySelectorAll('.duo svg.us-char').length : -1;
      }
      if (seen && !intro && !log.removedAt) log.removedAt = performance.now();
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }, { saved, readyAt, hideIsola, throwAnimate, rejectReady });
  await page.reload({ waitUntil: 'commit' });
  return { page, ctx, errors, saved };
}
const gone = (page, timeout = 6000) => page.waitForFunction(() => window.__launch?.removedAt && !document.documentElement.classList.contains('us-launch-play'), null, { timeout });
const log = (page) => page.evaluate(() => window.__launch);
const exitOf = (l) => l.calls.find((c) => (c.who === 'duo' && c.n === 31) || (c.who === 'usLaunchIntro'));

test('in the installed app: the hello by name, the two lean out, then they fly into the island when the app is ready', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors, saved } = await launch(h, { readyAt: 2600 });
    assert.deepEqual({ name: saved.hello.name, partner: saved.hello.partner, since: saved.hello.since }, { name: 'Francesco', partner: 'Beatrice', since: '2022-06-23' });
    assert.doesNotMatch(saved.duo.me + saved.duo.them, /var\(--/, 'colours resolved when saved');
    await gone(page);
    const l = await log(page);
    assert.equal(l.chars, 2, 'the two saved characters are in the opening');
    assert.match(l.hello, /^(Buongiorno|Buon pomeriggio|Buonasera|Notte fonda), Francesco$/);
    const now = new Date(), days = Math.floor((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(2022, 5, 23)) / 864e5);
    assert.equal(l.sub, `tu e Beatrice · ${days.toLocaleString('it-IT')} giorni insieme`);
    const fly = exitOf(l);
    assert.equal(fly?.who, 'duo', 'they flew (no plain fade)');
    // Timers on a loaded machine run late: never before the app is ready, soon after.
    assert.ok(fly.at >= l.readyAt - 5 && fly.at - l.readyAt < 600, `the flight starts when the app is ready (${Math.round(fly.at - l.readyAt)} ms after)`);
    assert.ok(l.removedAt - fly.at >= 560 && l.removedAt - fly.at < 1000, `about 600 ms of flight (${Math.round(l.removedAt - fly.at)})`);
    // They land exactly on the island's own two, which were hidden while flying and are back now.
    assert.equal(l.flyEnd?.arriving, '1', 'the island kept its own two out of sight during the flight');
    // Measured once the landing squash is over.
    await page.waitForFunction(() => document.getElementById('usIsola').getAnimations().length === 0, null, { timeout: 3000 });
    const island = await page.evaluate(() => ({
      open: document.getElementById('usIsola').getAttribute('aria-expanded'),
      arriving: document.getElementById('usIsola').dataset.usArriving || '',
      chars: [...document.querySelectorAll('#usIsola [data-us-isola-duo] .us-char')].map((c) => { const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, vis: getComputedStyle(c).visibility }; })
    }));
    assert.equal(island.open, 'true');
    assert.equal(island.arriving, '');
    assert.deepEqual(island.chars.map((c) => c.vis), ['visible', 'visible']);
    for (const [flown, home] of [[l.flyEnd.me, island.chars[0]], [l.flyEnd.them, island.chars[1]]]) {
      assert.ok(Math.abs(flown.x - home.x) < 3 && Math.abs(flown.y - home.y) < 3 && Math.abs(flown.w - home.w) < 3, `landed on the island (${JSON.stringify(flown)} vs ${JSON.stringify(home)})`);
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});

test('the opening waits for the app: at least 1.4 s, at most 3.2 s, and always goes away', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    // Ready early: still 1.4 s of opening.
    {
      const { page, ctx, errors } = await launch(h, { readyAt: 100 });
      await gone(page);
      const l = await log(page);
      const exit = exitOf(l).at - l.playAt;
      // Never before 1.4 s; a page busy loading can only make the timer late, never past the cap.
      assert.ok(exit >= 1390 && exit < 3300, `the minimum (${Math.round(exit)} ms)`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    // Never ready: it stops at 3.2 s anyway.
    {
      const { page, ctx, errors } = await launch(h, { readyAt: -1 });
      await page.waitForFunction(() => document.querySelector('#usLaunchIntro .hello span')?.textContent === 'Un attimo, vi preparo la giornata', null, { timeout: 4000 });
      await gone(page);
      const l = await log(page);
      const exit = exitOf(l).at - l.playAt;
      assert.ok(exit >= 3190 && exit < 3700, `the maximum (${Math.round(exit)} ms)`);
      assert.ok(l.removedAt - l.playAt < 4800, 'gone within the safety net');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    // Something breaks (the ready promise fails, an animation throws): the overlay still goes.
    for (const broken of [{ rejectReady: true }, { throwAnimate: true }]) {
      const { page, ctx } = await launch(h, broken);
      await gone(page, 5500);
      await ctx.close();
    }
  } finally {
    await h.close();
  }
});

test('no island to fly to: the plain fade; Riduci movimento: logo and hello, then a fade', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    {
      const { page, ctx, errors } = await launch(h, { readyAt: 2000, hideIsola: true });
      await gone(page);
      const l = await log(page);
      assert.ok(!l.calls.some((c) => c.who === 'duo' && c.n === 31), 'no flight');
      const fade = l.calls.find((c) => c.who === 'usLaunchIntro');
      assert.equal(fade?.duration, 400);
      assert.match(fade.last, /"opacity":0.*scale\(1\.05\)/);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    {
      const { page, ctx, errors } = await launch(h, { readyAt: 100, reduced: true });
      await gone(page);
      const l = await log(page);
      assert.match(l.hello, /, Francesco$/, 'the hello stays');
      assert.ok(!l.calls.some((c) => c.who === 'me' || c.who === 'them' || c.who === 'duo' || c.who === 'logo'), 'nothing moves but the words');
      const fade = l.calls.find((c) => c.who === 'usLaunchIntro');
      assert.equal(fade?.duration, 300);
      const exit = fade.at - l.playAt;
      assert.ok(exit >= 890 && exit < 1200, `at least 0.9 s (${Math.round(exit)} ms)`);
      assert.deepEqual(errors, []);
      await ctx.close();
    }
  } finally {
    await h.close();
  }
});

test('back after more than an hour: «Eccoti» in the island, then as it was; signing out forgets the opening', async (t) => {
  const h = await start();
  if (!h) return t.skip('Playwright unavailable');
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await page.waitForFunction(() => localStorage.getItem('us:launch-hello:v1'), null, { timeout: 15000 });
    await page.waitForFunction(() => !document.getElementById('usIsola').hidden, null, { timeout: 10000 });
    await page.evaluate(() => window.UsAngolo.isola(false));
    const away = (ms) => page.evaluate((gap) => {
      let hidden = false;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      hidden = true; document.dispatchEvent(new Event('visibilitychange'));
      const real = Date.now.bind(Date), shift = gap;
      Date.now = () => real() + shift;
      hidden = false; document.dispatchEvent(new Event('visibilitychange'));
      Date.now = real;
    }, ms);
    const title = () => page.evaluate(() => ({ open: document.getElementById('usIsola').getAttribute('aria-expanded'), b: document.querySelector('#usIsola .us-isola-words b').textContent }));
    // Under an hour: nothing.
    await away(20 * 60000);
    await page.waitForTimeout(900);
    assert.deepEqual(await title(), { open: 'false', b: 'Il vostro angolo' });
    // More than an hour: the island says hello, then closes as it was.
    await away(2 * 3600000);
    await page.waitForFunction(() => document.querySelector('#usIsola .us-isola-words b').textContent === 'Eccoti, Francesco', null, { timeout: 3000 });
    assert.equal((await title()).open, 'true');
    await page.waitForFunction(() => document.getElementById('usIsola').getAttribute('aria-expanded') === 'false', null, { timeout: 5000 });
    assert.equal((await title()).b, 'Il vostro angolo');
    // Sign-out clears both keys of the opening.
    await page.evaluate(() => clearPrivateDeviceState());
    assert.deepEqual(await page.evaluate(() => [localStorage.getItem('us:launch-duo:v1'), localStorage.getItem('us:launch-hello:v1')]), [null, null]);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally {
    await h.close();
  }
});
