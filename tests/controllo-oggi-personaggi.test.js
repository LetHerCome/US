// Controllo 27/11/2026 — Oggi, i personaggi e US vi ricorda: what the audit found, kept fixed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, loadChromium } = require('./helpers/oggi-browser');

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const ricordaSrc = read('us-ricorda.js');
const settings = read('settings.js');
const intro = read('intro.js');
const personaggi = read('personaggi.js');
const onboarding = read('onboarding.js');
const app = read('app.js');
const css = read('struttura.css');
const R = require('../us-ricorda.js');

test('«Non dirmelo più»: every kind it switches off has its switch back in Profilo › Notifiche', () => {
  const sql = read('supabase/migrations/20261125200000_us_vi_ricorda_v1.sql');
  const kinds = sql.match(/constraint us_battute_mute_kind check \(kind in \(([^)]+)\)\)/)[1].match(/'([a-z_*]+)'/g).map((k) => k.slice(1, -1)).filter((k) => k !== '*');
  assert.deepEqual(Object.keys(R.KIND_NAMES).sort(), kinds.sort(), 'one name per kind the server can keep muted');
  // Back on is the same RPC with p_muted false (it deletes only that kind).
  assert.match(sql, /delete from public\.us_battute_mute mu where mu\.user_id = me and mu\.kind = p_kind;/);
  assert.match(ricordaSrc, /set_my_battute_mute_v1', \{ p_kind: kind, p_muted: !on \}/);
  assert.match(settings, /data-us-voce="\$\{esc\(kind\)\}"/);
  assert.match(settings, /window\.UsRicorda\?\.setKind\?\.\(btn\.dataset\.usVoce,next\)/);
  // The promise in the sheet is now true.
  assert.match(ricordaSrc, /Puoi riaccenderle da Profilo › Notifiche\./);
  // A failed save says so and mutes nothing.
  const ask = ricordaSrc.slice(ricordaSrc.indexOf('async function askMute'), ricordaSrc.indexOf('async function loadMutes'));
  assert.ok(ask.indexOf("if (!saved) { w.toast?.('Non riesco a salvarlo. Riprova.'); return; }") < ask.indexOf('mutedKinds.add(b.kind)'));
});

test('Profilo › Notifiche reads the voices from the server before showing the switch', () => {
  const modal = settings.slice(settings.indexOf('async function notificationsModal'), settings.indexOf('async function syncStatusModal'));
  assert.ok(modal.indexOf('await window.UsRicorda?.loadMutes?.()') > 0);
  assert.ok(modal.indexOf('await window.UsRicorda?.loadMutes?.()') < modal.indexOf("openModal('Notifiche'"));
  assert.match(modal, /\$\{vociToggle\(ricorda\)\}/);
  assert.match(ricordaSrc, /client\.from\('us_battute_mute'\)\.select\('kind'\)/);
});

test('the intro closing tries again what it held back', () => {
  assert.match(intro, /w\.dispatchEvent\?\.\(new CustomEvent\('us:intro-done'\)\)/);
  assert.match(ricordaSrc, /w\.addEventListener\('us:intro-done', \(\) => maybeSay\(\)\);/);
  assert.match(personaggi, /w\.addEventListener\('us:intro-done', \(\) => maybePeek\(\)\);/);
});

test('words: neutral, and a name at the start of a sentence takes a capital', () => {
  const all = [];
  const cases = [['compleanno', { days: 0, name: 'Bea' }], ['compleanno', { days: 1, name: 'Bea' }], ['compleanno', { days: 7, name: 'Bea', date: '2026-12-03' }], ['traguardo', { count: 100 }], ['traguardo', { what: 'luogo', place: 'Roma' }], ['un_anno_fa', { source: 'meet', title: 'Cena' }], ['ti_aspetta', { what: 'game' }], ['ti_aspetta', { what: 'daily' }]];
  for (const [kind, v] of cases) all.push(...R.lines(kind, v, 'la tua persona'));
  for (const line of all) {
    assert.doesNotMatch(line, /Pronto\?|Siete arrivati|vi siete visti|tutti e due/, line);
    assert.match(line, /^[^a-z]/, `starts with a capital: ${line}`);
  }
  assert.ok(R.lines('ti_aspetta', { what: 'daily' }, 'la tua persona').includes('La tua persona ha già risposto alla domanda di oggi. Tocca a te.'));
  assert.ok(R.lines('ti_aspetta', { what: 'daily' }, 'Bea').includes('La risposta di Bea c\'è già: manca la tua.'));
  assert.doesNotMatch(intro, /tutti e due/);
  assert.doesNotMatch(settings.slice(settings.indexOf('function personColorLockedModal'), settings.indexOf('async function plusSoonModal') + 2000), /tutti e due|ognuno di voi/);
});

test('the intro waits a moment for what it lights, and the last stop always says «Fine»', () => {
  assert.doesNotMatch(intro, /steps\(\{ force \}\)\.filter\(/, 'no stop is dropped once, at the start');
  assert.match(intro, /const TARGET_WAIT = 1500;/);
  assert.match(intro, /nextBtn\.textContent = last \? 'Fine' : step\.cta \|\| 'Avanti';/);
  assert.match(intro, /if \(waitTimer\) return; \/\/ the next stop is still being waited for/);
});

test('the intro colours: the other person\'s usual colour is taken even before their profile is read', () => {
  assert.match(intro, /if \(!list\.some\(\(p\) => p\?\.id && p\.id !== w\.usProfile\?\.id\)\) list\.push\(\{ id: STAND_IN, role: other\(\), person_color: null \}\);/);
  assert.match(intro, /applyCoupleColors\?\.\(realCouple\(\)\)/, 'the stand-in never paints the page');
  const colors = require('../person-colors.js');
  const taken = colors.choices([{ id: 'me', role: 'francesco' }, { id: '~partner', role: 'beatrice', person_color: null }], 'me').filter((c) => c.taken).map((c) => c.id);
  assert.deepEqual(taken, ['lilla']);
});

test('touch targets: 44px for the island, the angolo tabs, «Non dirmelo più» and the intro colours', () => {
  assert.match(css, /\.top\.us-premium-top \.us-isola\{[^}]*width:56px;height:44px;/);
  assert.match(css, /#usAngolo \.us-angolo-tabs \[role="tab"\]\{min-height:44px;/);
  assert.match(css, /#usBattuta \.us-battuta-never\{align-self:center;min-height:44px;/);
  assert.match(css, /@media \(max-width:401px\)\{\.us-intro-swatches\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\);row-gap:4px\}\}/);
  // A taken colour says whose it is, in the setup as in the intro.
  assert.match(onboarding, /aria-label="\$\{escapeAttr\(c\.taken\?`\$\{c\.name\}, \$\{whose\(\)\}`:c\.name\)\}"/);
  assert.match(intro, /aria-label="\$\{esc\(c\.taken \? `\$\{c\.name\}, \$\{whose\}` : c\.name\)\}"/);
});

test('the revealed Domanda di oggi has a visible «Togli», not only the swipe', () => {
  const html = read('index.html');
  assert.match(html, /<button type="button" class="us-daily-ritual-close" id="usDailyRitualClose" hidden aria-label="Togli la domanda di oggi"><span class="us-icon" data-us-icon="x" aria-hidden="true"><\/span><span>Togli<\/span><\/button>/);
  assert.ok(html.indexOf('id="usDailyRitualClose"') < html.indexOf('id="usDailyRitual"'));
  assert.match(app, /close\.hidden=!\(card&&!card\.hidden&&card\.dataset\.state==='revealed'&&card\.dataset\.questionId\);/);
  assert.match(read('dc-oggi.css'), /#home #usDailyRitualClose\{[^}]*min-width:44px;min-height:44px;/);
});

test('one list of shapes: the setup reads personaggi.js', () => {
  assert.match(onboarding, /globalThis\.UsPersonaggi\?\.SHAPES/);
  assert.match(onboarding, /globalThis\.UsPersonaggi\?\.SHAPE_NAMES\?\.\[shape\]/);
  assert.doesNotMatch(onboarding, /\bSHAPE_ORDER\b|\bSHAPE_LABEL\b/);
});

test('dead code: what the page no longer has is no longer looked for', () => {
  const html = read('index.html');
  for (const id of ['homeMemorySection', 'homeMemoryCard', 'heroBondLevel', 'heroBondXp', 'bondFill', 'thinkMonthCount', 'syncReadyBadge', 'todayStatusPill', 'momentsStatusPill', 'pushEnableBtn', 'profileAvatarBtn']) {
    assert.doesNotMatch(html, new RegExp(`id="${id}"`), `${id} is not in the page`);
    assert.doesNotMatch(app, new RegExp(`'${id}'`), `${id} is not looked for`);
  }
  assert.doesNotMatch(app, /hydrateHomeMemory|updateHomeStatus/);
  assert.doesNotMatch(read('dc-oggi.css') + read('identity.css') + read('giorno.css'), /us-top-think|us-shell-icon--think/);
  for (const file of ['dc-popup.css', 'modal-center.css', 'giorno.css']) assert.doesNotMatch(read(file), /usCalendarOverlay/, file);
  assert.doesNotMatch(html, /Voi due on the photo/);
});

test('the wardrobe keeps the keyboard focus: the minute repaint leaves the open angolo alone', () => {
  assert.doesNotMatch(personaggi, /setInterval\(\(\) => \{ if \(!d\.hidden\) paintAll\(\); \}, 60000\);/);
  assert.match(personaggi, /if \(!angolo\(\)\?\.classList\.contains\('open'\)\) \{ paintDuo\(\); paintWardrobe\(\); \}/);
  assert.match(personaggi, /if \(focusKey\) root\.querySelector\(focusKey\)\?\.focus\(\{ preventScroll: true \}\);/);
});

// ---------------------------------------------------------------- in the real app
async function withPage(t, run, size) {
  const chromium = loadChromium();
  if (!chromium) return t.skip('Playwright unavailable');
  const { start, pageFor } = require('./helpers/countdown-browser');
  const h = await start();
  try {
    const { page, ctx, errors } = await pageFor(h, size || { width: 390, height: 844 });
    try { await run(page); assert.deepEqual(errors, []); } finally { await ctx.close(); }
  } finally { await h.close(); }
}

test('real app: the voices switches come from the server, a muted kind comes back on', async (t) => withPage(t, async (page) => {
  await page.evaluate(() => {
    const qa = window.__QA; qa.calls = [];
    qa.tables.us_battute_mute = [{ user_id: 'f1', kind: '*' }, { user_id: 'f1', kind: 'compleanno' }];
    qa.rpc.set_my_battute_mute_v1 = async (a) => { qa.calls.push([a.p_kind, a.p_muted]); return { data: true, error: null }; };
    document.querySelector('[data-us-setting="notifications"]').click();
  });
  await page.waitForSelector('#usSettingsModalBody [data-us-voce="compleanno"]', { timeout: 8000 });
  const shown = await page.evaluate(() => ({
    voci: document.querySelector('#usSettingsModalBody [data-us-voci]')?.getAttribute('aria-pressed'),
    kinds: [...document.querySelectorAll('#usSettingsModalBody [data-us-voce]')].map((b) => [b.dataset.usVoce, b.getAttribute('aria-pressed'), b.querySelector('b').textContent])
  }));
  assert.deepEqual(shown, { voci: 'false', kinds: [['compleanno', 'false', 'I compleanni']] });
  await page.click('#usSettingsModalBody [data-us-voce="compleanno"]');
  await page.waitForFunction(() => document.querySelector('#usSettingsModalBody [data-us-voce="compleanno"]').getAttribute('aria-pressed') === 'true');
  assert.deepEqual(await page.evaluate(() => ({ calls: window.__QA.calls, muted: window.UsRicorda.mutedKinds() })), { calls: [['compleanno', false]], muted: [] });
}));

test('real app: «Non dirmelo più» that does not reach the server says so and mutes nothing', async (t) => withPage(t, async (page) => {
  await page.evaluate(() => {
    const qa = window.__QA; qa.fail = true; qa.toasts = [];
    const said = window.toast; window.toast = (m, o) => { qa.toasts.push(String(m)); return said(m, o); };
    qa.rpc.set_my_battute_mute_v1 = async () => (qa.fail ? { data: null, error: { message: 'offline' } } : { data: true, error: null });
    window.UsRicorda.open({ kind: 'compleanno', ref_key: 'compleanno:x', speaker: 'me', slot: 'mattina', vars: { days: 1, name: 'Beatrice' } });
  });
  await page.click('[data-battuta-never]');
  await page.click('[data-us-confirm="ok"]');
  await page.waitForFunction(() => window.__QA.toasts.includes('Non riesco a salvarlo. Riprova.'));
  assert.deepEqual(await page.evaluate(() => ({ open: document.getElementById('usBattuta').classList.contains('open'), muted: window.UsRicorda.mutedKinds() })), { open: true, muted: [] });
  await page.evaluate(() => { window.__QA.fail = false; });
  await page.click('[data-battuta-never]');
  await page.click('[data-us-confirm="ok"]');
  await page.waitForFunction(() => !document.getElementById('usBattuta').classList.contains('open'));
  assert.deepEqual(await page.evaluate(() => window.UsRicorda.mutedKinds()), ['compleanno']);
}));

test('real app: «Togli» takes the revealed card away and remembers it, like the swipe', async (t) => withPage(t, async (page) => {
  const before = await page.evaluate(() => {
    window.UsDailyRitual.render({ questionId: 'dq1', question: 'Quale piccolo momento vorresti rivivere?', kicker: 'Domanda di oggi', state: 'revealed', meta: 'Svelate · domani una nuova domanda', glyph: 'noi', cta: 'Rivedi', attention: false });
    const close = document.getElementById('usDailyRitualClose'), card = document.getElementById('usDailyRitual');
    const c = close.getBoundingClientRect(), k = card.getBoundingClientRect();
    return { shown: !close.hidden, h: c.height, w: c.width, inside: c.top >= k.top && c.bottom <= k.bottom && c.right <= k.right + 0.5, name: close.getAttribute('aria-label') };
  });
  assert.equal(before.shown, true);
  assert.ok(before.h >= 44 && before.w >= 44, `44px to touch (${before.w}x${before.h})`);
  assert.ok(before.inside, 'on the card\'s corner');
  assert.equal(before.name, 'Togli la domanda di oggi');
  await page.click('#usDailyRitualClose');
  await page.waitForFunction(() => document.getElementById('usDailyRitual').hidden);
  assert.deepEqual(await page.evaluate(() => ({ close: document.getElementById('usDailyRitualClose').hidden, kept: localStorage.getItem('us-daily-dismissed') })), { close: true, kept: 'dq1' });
  // Not revealed yet: no «Togli».
  assert.equal(await page.evaluate(() => { window.UsDailyRitual.render({ questionId: 'dq2', question: 'Un\'altra?', kicker: 'Domanda di oggi', state: 'answer', meta: 'Una domanda, due risposte', glyph: 'none', cta: 'Rispondi', attention: true }); return document.getElementById('usDailyRitualClose').hidden; }), true);
}));

test('real app: the intro waits for a stop that comes late and says «Fine» on the last one shown', async (t) => withPage(t, async (page) => {
  // The island never shows (no couple yet on screen): the tour ends at the Profilo, with «Fine».
  await page.addStyleTag({ content: '#usIsola{display:none!important}' });
  assert.equal(await page.evaluate(() => window.UsIntro.start({ force: true })), true);
  await page.waitForTimeout(1700);
  const seen = [];
  for (let i = 0; i < 10 && await page.evaluate(() => window.UsIntro.active()); i++) {
    seen.push(await page.evaluate(() => [document.getElementById('usIntro').dataset.step, document.querySelector('[data-intro-next]').textContent]));
    await page.click('[data-intro-next]');
    await page.waitForTimeout(120);
  }
  assert.deepEqual(seen.map((s) => s[0]), ['crea', 'ciao', 'domanda', 'tipenso', 'noi', 'ricordi', 'gioca', 'profilo']);
  assert.equal(seen[seen.length - 1][1], 'Fine');
  assert.ok(seen.slice(0, -1).every((s) => s[1] !== 'Fine'));
  // A stop that is not on screen yet when the intro starts is waited for, not dropped.
  await page.addStyleTag({ content: 'html.us-late #usDailyRitual{display:none!important}' });
  await page.evaluate(() => {
    document.documentElement.classList.add('us-late');
    window.UsIntro.start({ force: true });
    // crea → ciao → (domanda, not there yet): the second tap waits instead of skipping it.
    document.querySelector('[data-intro-next]').click();
    document.querySelector('[data-intro-next]').click();
    document.querySelector('[data-intro-next]').click();
  });
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => document.getElementById('usIntro').dataset.step), 'ciao', 'still waiting for the question');
  await page.evaluate(() => document.documentElement.classList.remove('us-late'));
  await page.waitForFunction(() => document.getElementById('usIntro').dataset.step === 'domanda', null, { timeout: 2000 });
  await page.click('[data-intro-skip]');
}));

test('real app: when the intro closes, the new level and the line it held back come out', async (t) => withPage(t, async (page) => {
  await page.evaluate(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
    window.__usRicordaNow = { day: today, hour: 12 };
    localStorage.removeItem('us:ricorda:v1:f1'); localStorage.removeItem('us:ricorda:intro:v1:f1');
    window.UsIntro.start({ force: true });
    // A level reached while the intro was open (the island had seen level 1).
    localStorage.setItem('us:isola:v1:f1', JSON.stringify({ level: 1 }));
  });
  await page.waitForTimeout(300);
  await page.click('[data-intro-skip]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('us:isola:v1:f1') || '{}').level > 1, null, { timeout: 4000 });
  await page.waitForFunction(() => localStorage.getItem('us:ricorda:intro:v1:f1') === '1', null, { timeout: 5000 });
}));

test('real app: a wardrobe repaint keeps the chip that has the focus', async (t) => withPage(t, async (page) => {
  const kept = await page.evaluate(() => {
    window.UsAngolo.open('look');
    const chip = document.querySelector('#usAngoloLook [data-us-look]:not([aria-disabled="true"])');
    chip.focus();
    const key = chip.dataset.usLook;
    window.UsPersonaggi.paintWardrobe();
    window.dispatchEvent(new Event('us:progression-updated'));
    return document.activeElement?.dataset?.usLook === key;
  });
  assert.equal(kept, true);
}));
