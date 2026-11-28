// Redesign definitivo, fase 2 (founder 23/11/2026, D6): Ti penso in the middle
// of the bar, the envelope top left on Oggi, your character top right on the
// four pages, the Profilo with its back arrow to where you came from.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('index.html');
const nav = html.slice(html.indexOf('<nav class="nav us-nav'), html.indexOf('</nav>', html.indexOf('<nav class="nav us-nav')));
const top = html.slice(html.indexOf('<div class="top us-premium-top">'), html.indexOf('<main id="home"'));

test('the bar is Oggi, Noi, the heart, Ricordi, Gioca; a tap on the heart sends', () => {
  const order = [...nav.matchAll(/<button[^>]*?(?:data-page="(\w+)"|id="(thinkButton)")/g)].map((m) => m[1] || m[2]);
  assert.deepEqual(order, ['home', 'bond', 'thinkButton', 'moments', 'quiz']);
  assert.match(nav, /id="thinkButton" class="us-nav-think"[^>]*onclick="usNavHeartTap\(this\)"[^>]*aria-label="Manda un Ti penso"/);
  const css = read('struttura.css');
  assert.match(css, /grid-template-columns:1fr 1fr 70px 1fr 1fr!important/);
  assert.match(css, /button\[data-page="moments"\]\.active\)\{--us-nav-x:calc\(200% \+ 70px\)\}/);
  // No page hides the heart any more (it lived top left on Oggi before).
  for (const file of ['games.css', 'moments-albums.css', 'settings2.css']) assert.doesNotMatch(read(file), /#thinkButton\{display:none|#thinkButton\{\s*display:none/);
  const app = read('app.js');
  assert.match(app, /function usNavHeartTap\(btn\)\{/);
  // I cuori (27/11/2026): rapid taps add up, one send per combo with its taps.
  assert.match(app, /Promise\.resolve\(sendThinkSignal\(\{taps\}\)\)/);
  assert.match(app, /usThinkCombo\.timer=setTimeout\(\(\)=>usThinkComboSend\(btn\),US_THINK_COMBO_MS\);/);
  // The burst plays at the taps: the send does not play a second heart on the bar.
  const send = app.slice(app.indexOf('async function usSendThinkNow('), app.indexOf('window.sendThinkSignal=sendThinkSignal;'));
  assert.doesNotMatch(send, /usHeartLike|heartSpray/);
});

test('Oggi: the envelope top left, your character top right', () => {
  const left = top.slice(top.indexOf('<div class="us-top-left">'), top.indexOf('<div class="us-top-brand"'));
  assert.match(left, /id="leftForYouPartnerEntry"/);
  assert.doesNotMatch(top, /thinkButton/);
  const right = top.slice(top.indexOf('<div class="top-actions">'));
  assert.match(right, /class="us-me" data-us-self onclick="go\('settings',\{nav:true\}\)" aria-label="Il tuo profilo e le Impostazioni"/);
});

test('your character opens the Profilo from all four pages; no gear in Noi', () => {
  const noi = html.slice(html.indexOf('<main id="bond"'), html.indexOf('</main>', html.indexOf('<main id="bond"')));
  const gioca = html.slice(html.indexOf('<main id="quiz"'), html.indexOf('</main>', html.indexOf('<main id="quiz"')));
  assert.match(noi, /data-us-self onclick="go\('settings'/);
  assert.match(gioca, /<header class="us-page-head" data-s><h2>Gioca<\/h2><button type="button" class="us-me" data-us-self/);
  assert.match(read('moments-albums.js'), /class="us-me" data-us-self onclick="go\('settings',\{nav:true\}\)"/);
  assert.doesNotMatch(html, /id="usSettingsEntry"|us-noi-v2-settings/);
  // <html data-us-me="…"> is the viewer's role (due-colori.css): the
  // placeholder must never be [data-us-me], or painting it replaces the page.
  assert.doesNotMatch(read('personaggi.js'), /\[data-us-me\]/);
  assert.match(read('personaggi.js'), /querySelectorAll\('\[data-us-self\]'\)/);
});

test('the Profilo: your card on top, the back arrow to where you came from', () => {
  const settings = html.slice(html.indexOf('<main id="settings"'), html.indexOf('<!-- US-SETTINGS-ORGANIZE-01'));
  assert.match(settings, /onclick="usSettingsReturn\(\)"[\s\S]*?<span id="usSettingsFromLabel">Oggi<\/span>/);
  assert.match(settings, /<h2 data-s>Profilo<\/h2>/);
  assert.match(settings, /id="usProfileChar"[\s\S]*?id="usProfileName"[\s\S]*?id="usProfileShape"[\s\S]*?id="usProfileColor"[\s\S]*?id="usProfileMood" hidden/);
  const app = read('app.js');
  assert.match(app, /if\(id==='settings'&&current&&current!=='settings'\)\{window\.usSettingsFrom=current;document\.documentElement\.dataset\.usFrom=current;window\.usPaintSettingsBack\?\.\(\);\}/);
  const settingsJs = read('settings.js');
  assert.match(settingsJs, /const US_SETTINGS_FROM=Object\.freeze\(\{home:'Oggi',bond:'Noi',moments:'Ricordi',quiz:'Gioca'\}\);/);
  assert.match(settingsJs, /if\(from==='quiz'&&typeof window\.openQuizHub==='function'\)return window\.openQuizHub\(\{nav:true\}\);/);
  const due = read('due-colori.js');
  assert.match(due, /const subOf = \(child, parent\) => child === 'settings' && TABS\.has\(parent\);/);
  assert.doesNotMatch(due, /PARENT\[/);
});

test('the profiles read the characters, and fall back on a server without them', () => {
  const app = read('app.js');
  assert.match(app, /select\('id,display_name,role,couple_id,person_color,character_shape,character_head,character_face'\)[\s\S]{0,120}\.then\(r=>r\?\.error\?sb\.from\('profiles'\)\.select\('id,display_name,role,couple_id,person_color'\)/);
});

test('the new files ship in every build and in the service worker', () => {
  for (const file of ['scripts/build-capacitor-web.mjs', 'scripts/build-cloudflare-pages.mjs']) {
    const s = read(file);
    assert.match(s, /'personaggi\.js',/);
    assert.match(s, /'struttura\.css',/);
  }
  const sw = read('service-worker.js');
  assert.match(sw, /versioned\("\/personaggi\.js"\)/);
  assert.match(sw, /versioned\("\/struttura\.css"\)/);
  assert.match(html, /<script defer src="\/personaggi\.js\?v=[^"]+"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\/struttura\.css\?v=[^"]+"\/>/);
});

test('personaggi.js draws a role in its colour, its shape and what it wears', () => {
  const api = require('../personaggi.js');
  const ball = api.character('francesco', { size: 34 });
  assert.match(ball, /^<svg class="us-char" viewBox="-4 6 108 100"/);
  // Stile unico (24/11/2026): the outline in the dark of its own colour, never black.
  assert.match(ball, /style="fill:var\(--us-rosa\);stroke:color-mix\(in srgb, var\(--us-rosa\) 42%, #1a1020\)"/);
  assert.doesNotMatch(ball, /stroke="#14120E" stroke-width="3\.4"/);
  assert.match(ball, /M12 60 a38 36/); // the ball, without a chosen shape
  const square = api.character('beatrice', { size: 56 });
  assert.match(square, /style="fill:var\(--us-lilla\);stroke:/);
  assert.match(square, /M36 24 H64/);
  const drop = api.character({ shape: 'goccia', color: '#6f9bff' }, { head: 'cappello', mood: 'stanco' });
  assert.match(drop, /style="fill:#6f9bff;stroke:/);
  assert.match(drop, /M50 14 C61 30/);
  assert.match(drop, /fill="#F7B58E"/); // the hat
  assert.doesNotMatch(drop, /us-char-eyes/); // tired: eyes closed
  assert.equal(api.SHAPE_NAMES.nuvola, 'Nuvola');
  assert.match(api.slot('quadrato', 40), /stroke-dasharray="7 6"/);
});
