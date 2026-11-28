// L'intro col tuo personaggio (tavola approved 26/11/2026): eight stops on Oggi, once per person,
// right after the first «Entra in US»; «Salta» always; «Rivedi l'intro» in the Profilo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadChromium } = require('./helpers/oggi-browser');

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const intro = read('intro.js');

test('intro: shipped like every other script (page, service worker, both builds)', () => {
  assert.match(read('index.html'), /<script defer src="\/intro\.js\?v=[^"]+"><\/script>/);
  assert.match(read('service-worker.js'), /versioned\("\/intro\.js"\)/);
  assert.match(read('scripts/build-capacitor-web.mjs'), /'intro\.js'/);
  assert.match(read('scripts/build-cloudflare-pages.mjs'), /'intro\.js'/);
});

test('intro: eight stops in the approved order, two lines of the other person, neutral words', () => {
  const ids = [...intro.matchAll(/\{ id: '([a-z]+)'/g)].map((m) => m[1]);
  // «crea» comes first only for whoever never made their character (see below).
  // 27/11/2026: distance and battery, Come stai, the Ti penso ×N, US (the app that remembers) and US Plus.
  assert.deepEqual(ids, ['crea', 'ciao', 'domanda', 'distanza', 'comestai', 'tipenso', 'noi', 'ricordi', 'gioca', 'playus', 'profilo', 'angolo', 'us', 'mese', 'plus']);
  // 28/11/2026: Play Us and the month pack each bring a line of the other person.
  assert.equal((intro.match(/other: '/g) || []).length, 6);
  assert.match(intro, /other: 'Ti batto io, vedrai.'/);
  assert.match(intro, /other: 'Io faccio collezione di quelle rare.'/);
  assert.match(intro, /other: 'Io li conto tutti, eh\.'/);
  assert.match(intro, /other: 'Una specie di amico che non dimentica niente\.'/);
  assert.match(intro, /other: 'Io intanto mi prenoto un cappello nuovo\.', cta: 'Fine'/);
  assert.doesNotMatch(intro, /Cupido/, 'the system is called US');
  assert.match(intro, /other: 'Ci vediamo qui ogni giorno!'/);
  // The logo opens into the bar, as if tapped (it is only the logo before).
  assert.match(intro, /island: true/);
  assert.match(intro, /w\.UsAngolo\?\.isola\?\.\(true/);
  assert.doesNotMatch(intro, /\bla stai pensando\b|\bmandale\b/i, 'no guess about who the other person is');
});

test('intro: only the first entry starts it, on this phone, and the Profilo starts it again', () => {
  const onboarding = read('onboarding.js');
  assert.match(onboarding, /const firstEntry=!silent&&mode!=='device';/);
  assert.match(onboarding, /if\(firstEntry\)setTimeout\(\(\)=>window\.UsIntro\?\.start\?\.\(\)/);
  assert.match(intro, /const SEEN = \(\) => `us:intro:v1:\$\{w\.usProfile\?\.id \|\| ''\}`;/);
  assert.match(intro, /if \(!force && store\.get\(SEEN\(\)\)\) return false;/);
  assert.match(read('index.html'), /data-us-setting="intro"[\s\S]{0,260}Rivedi l’intro/);
  assert.match(read('settings.js'), /if\(name==='intro'\)\{window\.usSettingsReturn\?\.\(\);return window\.UsIntro\?\.start\?\.\(\{force:true\}\);\}/);
});

test('intro: nothing else talks over it; reduced motion keeps it still', () => {
  assert.match(read('us-ricorda.js'), /muted \|\| w\.UsIntro\?\.active\?\.\(\)\) return;/);
  // The island waits for the intro's end (us:intro-done) instead of retrying under it.
  assert.match(read('personaggi.js'), /if \(w\.UsIntro\?\.active\?\.\(\)\) return;/);
  const css = read('struttura.css');
  assert.match(css, /html\.us-intro-open \.us-fumetto\{visibility:hidden\}/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.us-intro,\.us-intro-hole,\.us-intro-guide,\.us-intro-bubble,\.us-intro-other\{transition:none!important\}/);
  assert.match(css, /\.us-intro-skip\{min-height:44px;/);
  assert.match(css, /\.us-intro-next\{min-height:44px;/);
});

test('intro: who already has US gets it once with the update, on Oggi, by itself', async (t) => {
  assert.match(intro, /function autoStart\(\)/);
  assert.match(intro, /const automated = \(\) => Boolean\(w\.navigator\?\.webdriver\) && !w\.__usIntroAuto;/);
  const chromium = loadChromium();
  if (!chromium) return t.skip('Playwright unavailable');
  const { start, qaFixture } = require('./helpers/countdown-browser');
  const { FAKE_SUPABASE } = require('./helpers/oggi-browser');
  const h = await start();
  try {
    const ctx = await h.browser.newContext({ locale: 'it-IT', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Europe/Rome', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith(h.base)) return route.continue(); if (/supabase-js/.test(u)) return route.fulfill({ contentType: 'text/javascript', body: FAKE_SUPABASE }); return route.abort(); });
    await page.addInitScript(qaFixture, { style: 'editorial', mode: 'days', unlocked: true, missing: false, started: '2022-06-23', active: 'custom' });
    await page.addInitScript(() => { window.__usIntroAuto = true; });
    await page.goto(`${h.base}/?us-dev=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.UsIntro?.active(), null, { timeout: 15000 });
    // The test couple never made a character: the update starts from «crea».
    assert.equal(await page.evaluate(() => document.getElementById('usIntro').dataset.step), 'crea');
    await page.click('[data-intro-skip]');
    // Back to the app later (the fixture wipes storage on reload, so the return is simulated): it does not come back.
    assert.equal(await page.evaluate(() => window.UsIntro.seen()), true);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(4500);
    assert.equal(await page.evaluate(() => window.UsIntro.active()), false);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await h.close(); }
});

test('intro: in the real app it walks the eight stops and is not shown twice', async (t) => {
  const chromium = loadChromium();
  if (!chromium) return t.skip('Playwright unavailable');
  const { start, pageFor } = require('./helpers/countdown-browser');
  const h = await start();
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    assert.equal(await page.evaluate(() => window.UsIntro.start()), true);
    const seen = [];
    for (let i = 0; i < 16 && await page.evaluate(() => window.UsIntro.active()); i++) {
      await page.waitForTimeout(250);
      seen.push(await page.evaluate(() => document.getElementById('usIntro').dataset.step));
      const inside = await page.evaluate(() => { const b = document.querySelector('[data-intro-bubble]').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; });
      assert.ok(inside, `bubble on screen at ${seen[i]}`);
      await page.click('[data-intro-next]');
    }
    // Nobody in the test couple made a character yet: first «crea», then the eight stops.
    // The test couple shares no distance: that stop is waited for, then left out.
    assert.deepEqual(seen, ['crea', 'ciao', 'domanda', 'comestai', 'tipenso', 'noi', 'ricordi', 'gioca', 'playus', 'profilo', 'angolo', 'us', 'mese', 'plus']);
    assert.deepEqual(await page.evaluate(() => ({ active: window.UsIntro.active(), seen: window.UsIntro.seen(), again: window.UsIntro.start() })), { active: false, seen: true, again: false });
    // «Salta» closes it at once.
    assert.equal(await page.evaluate(() => window.UsIntro.start({ force: true })), true);
    await page.click('[data-intro-skip]');
    assert.equal(await page.evaluate(() => window.UsIntro.active()), false);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await h.close(); }
});

// Founder, 27/11/2026: who has US from before (the update) never made a character. Before the tour
// they make it: the five shapes and the colours, the other person's taken; the guardaroba stays in
// the angolo. Who already made it goes straight to the tour.
test('intro: «crea» before the tour, shapes and colours only, saved with the usual rules', () => {
  // A shape or a colour picked at the first opening counts, also before the couple is read again.
  assert.ok(intro.includes('const made = () => Boolean(mine()?.character_shape || mine()?.person_color || w.usProfile?.character_shape || w.usProfile?.person_color);'));
  assert.match(intro, /const maker = canMake\(\) && \(force \|\| !made\(\)\);/);
  assert.match(intro, /save\('set_my_character_shape', \{ p_shape: shape \}\)/);
  assert.match(intro, /save\('set_my_color', \{ p_color: colour \}\)/);
  assert.doesNotMatch(intro, /set_my_character_look|LOOK_HEAD|LOOK_FACE/, 'no guardaroba in the intro');
  assert.match(intro, /Gli accessori arrivano dopo: li sbloccate insieme, nel vostro angolo\./);
  assert.match(read('struttura.css'), /\.us-intro-swatch\{display:grid;place-items:center;width:100%;height:44px;/, 'each colour 44px tall (two rows of four on a narrow bubble, controllo-oggi-personaggi.test.js)');
});

test('intro: in the real app you make your character, then the tour; once made, no «crea»', async (t) => {
  const chromium = loadChromium();
  if (!chromium) return t.skip('Playwright unavailable');
  const { start, pageFor } = require('./helpers/countdown-browser');
  const h = await start();
  try {
    const { page, ctx, errors } = await pageFor(h, { width: 390, height: 844 });
    await page.evaluate(() => {
      const qa = window.__QA; qa.calls = [];
      const self = () => qa.tables.profiles.find((p) => p.id === qa.me);
      qa.rpc.set_my_character_shape = async (a) => { qa.calls.push(['shape', a.p_shape]); self().character_shape = a.p_shape; return { data: { shape: a.p_shape }, error: null }; };
      qa.rpc.set_my_color = async (a) => { qa.calls.push(['color', a.p_color]); self().person_color = a.p_color; return { data: { color: a.p_color }, error: null }; };
    });
    assert.equal(await page.evaluate(() => window.UsIntro.start()), true);
    await page.waitForTimeout(300);
    const first = await page.evaluate(() => {
      const r = document.getElementById('usIntro'), b = r.querySelector('[data-intro-bubble]').getBoundingClientRect();
      return { step: r.dataset.step, shapes: r.querySelectorAll('[data-intro-shape]').length, pressed: r.querySelector('[data-intro-shape][aria-pressed="true"]')?.dataset.introShape, taken: [...r.querySelectorAll('[data-intro-colour]:disabled')].map((x) => x.dataset.introColour), inside: b.top >= 0 && b.bottom <= innerHeight, wardrobe: r.querySelectorAll('[data-us-look]').length };
    });
    assert.deepEqual(first, { step: 'crea', shapes: 5, pressed: 'palla', taken: ['lilla'], inside: true, wardrobe: 0 });
    await page.click('[data-intro-shape="nuvola"]');
    await page.click('[data-intro-colour="blu"]');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => {
      const r = document.getElementById('usIntro');
      return { calls: window.__QA.calls, pressed: r.querySelector('[data-intro-shape][aria-pressed="true"]')?.dataset.introShape, colour: r.querySelector('[data-intro-colour][aria-pressed="true"]')?.dataset.introColour, guide: (() => { const t = document.createElement('div'); t.innerHTML = window.UsPersonaggi.character('francesco', { size: 72, reaction: 'saluta', shape: 'nuvola' }); return r.querySelector('[data-intro-guide]').innerHTML === t.innerHTML; })(), tu: ['#6f9bff', '#8faad6'].includes(getComputedStyle(document.documentElement).getPropertyValue('--us-rosa').trim().toLowerCase()) };
    });
    assert.deepEqual(after, { calls: [['shape', 'nuvola'], ['color', 'blu']], pressed: 'nuvola', colour: 'blu', guide: true, tu: true });
    await page.click('[data-intro-next]');
    assert.equal(await page.evaluate(() => document.getElementById('usIntro').dataset.step), 'ciao');
    await page.click('[data-intro-skip]');
    // Made now: the next first time (another phone) starts from «ciao».
    await page.evaluate(async () => { await window.UsCoupleContext?.hydrate?.(); localStorage.removeItem(`us:intro:v1:${window.usProfile.id}`); });
    assert.equal(await page.evaluate(() => window.UsIntro.start()), true);
    assert.equal(await page.evaluate(() => document.getElementById('usIntro').dataset.step), 'ciao');
    await page.click('[data-intro-skip]');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await h.close(); }
});

test('intro più fluida (28/11/2026): the light grows with the bar, «us» keeps it open, the page holds its endless animations, never over the opening', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'intro.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'struttura.css'), 'utf8');
  assert.match(src, /id: 'us', target: \(\) => firstVisible\('#usIsola'\), pill: true, keep: true/);
  assert.match(src, /if \(step\.keep && isolaAperta\(\)\)/);
  assert.match(src, /function followIsola\(step\)/);
  assert.match(src, /\}, reduced\(\) \? 200 : 500\);/, 'the bar opens after half a second, not 1.1 s');
  assert.match(src, /!d\.documentElement\.classList\.contains\('us-launch-play'\)/);
  assert.match(css, /\.us-intro-hole\.is-follow\{transition:none\}/);
  assert.match(css, /html\.us-intro-open \.app \*,html\.us-intro-open \.app \*::before,html\.us-intro-open \.app \*::after\{animation-play-state:paused!important\}/);
});
