const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Foundation 01 distribuisce quattro destinazioni bottom-nav con touch target preservato', () => {
  const html = read('index.html');
  const css = read('fix4.css');
  // Il diario, ma pulito (15/11/2026): <nav class="dy-nav">, a bar fixed to the
  // bottom edge: 4 equal columns; each button is the bar height minus 8px of top
  // padding (the bar height comes from --us-nav-height; 52px in short landscape, fix4.css).
  const nav = html.match(/<nav class="dy-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  const diario = read('diario.css');

  assert.deepEqual([...nav.matchAll(/data-page="([^"]+)"/g)].map((match) => match[1]), ['home', 'bond', 'moments', 'quiz']);
  assert.match(diario, /\.dy-nav\{position:fixed;left:0;right:0;bottom:0;[^}]*display:grid;grid-template-columns:1fr 1fr 86px 1fr 1fr;height:calc\(var\(--us-nav-height\) \+ max\(18px,var\(--us-safe-bottom\)\)\);padding:6px calc\(10px \+ var\(--us-safe-right\)\) max\(18px,var\(--us-safe-bottom\)\)/);
  assert.match(read('ui-foundation.css'), /--us-nav-height:56px;/);
  assert.match(css, /@media \(orientation:landscape\) and \(max-height:560px\)\{:root\{--us-nav-height:52px\}/);
  assert.match(diario, /\.dy-nav button\{[^}]*min-width:0;/);
});

test('Foundation 01 mantiene il contratto completo di navigation e Oggi', () => {
  const html = read('index.html');
  const app = read('app.js');

  assert.deepEqual([...html.matchAll(/<button[^>]+data-page="([^"]+)"[^>]*aria-label="([^"]+)"/g)].map((match) => [match[1], match[2]]), [
    ['home', 'Oggi'], ['bond', 'Noi'], ['moments', 'Ricordi'], ['quiz', 'Gioca'],
  ]);
  assert.match(app, /const pages=\['home','bond','moments','quiz','settings'\]/);
  // Store S1-A (#179): no global swipe between tabs.
  assert.doesNotMatch(app, /const swipePages=/);
  assert.doesNotMatch(html, /data-page="settings"/);
  assert.match(html, /id="usTodayPriorityRegion" hidden aria-live="polite"><\/div>/);
  // Il diario, ma pulito (15/11/2026): the region is empty in the markup (the old lazy
  // pattern ran across the rest of the page, which now follows the region).
  assert.doesNotMatch(html, /usTodayPriorityRegion[^>]*>(?:(?!<\/div>)[\s\S])*?(received|reveal ready|waiting for me|priority card)/i);
});

test('partner apre solo Lasciato per te e il profilo resta un controllo foto', () => {
  const html = read('index.html');
  const stories = read('stories.js');

  assert.match(html, /id="leftForYouPartnerEntry"[\s\S]{0,180}onclick="usEnvelopeTap\(\)"/);
  assert.doesNotMatch(html, /id="profileAvatarBtn"/, 'nessun avatar/foto legacy nel top chrome');
  assert.match(html, /id="profileAvatarFile"/, 'il flusso foto profilo resta vivo tramite Impostazioni');
  // Il diario, ma pulito (15/11/2026): the row carries its inline stroke icon before the label.
  assert.match(html, /data-us-setting="profile-photo"[\s\S]{0,700}<b>Foto profilo<\/b>/);
  assert.doesNotMatch(html, /onclick="openOwnStories\(\)"/);
  assert.match(stories, /__US_LEFT_FOR_YOU_ACTIVE__/);
  assert.match(html, /id="usSettingsEntry"[\s\S]{0,160}onclick="go\('settings',\{nav:true\}\)"/);
  assert.match(read('identity.css'), /\.us-calendar-btn\{width:44px;min-width:44px;height:44px;min-height:44px/);
  assert.doesNotMatch(html, /id="usCalendarBtn"/);
  // M12A: il centro è il marchio US; "I nostri eventi" resta raggiungibile da Noi
  // (US 1.0: il vecchio calendario a schermo intero non c'è più, Eventi è il link sotto il calendario di Noi).
  assert.doesNotMatch(html, /id="usEventsTopEntry"/);
  // Il diario, ma pulito (15/11/2026): the centre of the Oggi header is «us» (dy-mark).
  assert.match(html, /class="dy-mark"[^>]*role="img" aria-label="US"/);
  // Noi nuova (03/11/2026): Eventi si apre dalle date del calendario di Noi.
  assert.match(read('noi-v2.js'), /window\.openNoiSection\?\.\('eventi'\)/);
  assert.match(html, /data-us-setting="profile-photo"[\s\S]{0,700}<b>Foto profilo<\/b>/);
  assert.match(read('settings.js'), /window\.pickProfilePhoto\?\.\(\)/);
});
