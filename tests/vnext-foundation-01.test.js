const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Foundation 01 distribuisce quattro destinazioni bottom-nav con touch target preservato', () => {
  const html = read('index.html');
  // US-HUMAN-UI-01: the dock is owned by ui-foundation.css (fix4 keeps only button basics).
  const css = read('fix4.css') + read('ui-foundation.css');
  const nav = html.match(/<nav class="nav us-nav us-nav-premium"[\s\S]*?<\/nav>/)?.[0] || '';

  assert.deepEqual([...nav.matchAll(/data-page="([^"]+)"/g)].map((match) => match[1]), ['home', 'bond', 'moments', 'quiz']);
  assert.match(css, /\.us-nav\.us-nav-premium\{[^}]*bottom:max\(8px,var\(--us-safe-bottom\)\)[^}]*grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /\.us-nav\.us-nav-premium>button\{[^}]*min-width:44px;min-height:52px/);
  assert.match(css, /\.nav button\{min-width:0;touch-action:manipulation/);
  assert.match(css, /@media \(orientation:landscape\) and \(max-height:560px\)\{[\s\S]{0,400}\.us-nav\.us-nav-premium>button\{min-height:44px/);
});

test('Foundation 01 mantiene il contratto completo di navigation e Oggi', () => {
  const html = read('index.html');
  const app = read('app.js');

  assert.deepEqual([...html.matchAll(/<button[^>]+data-page="([^"]+)"[^>]*aria-label="([^"]+)"/g)].map((match) => [match[1], match[2]]), [
    ['home', 'Oggi'], ['bond', 'Noi'], ['moments', 'Ricordi'], ['quiz', 'Gioca'],
  ]);
  assert.match(app, /const pages=\['home','bond','moments','quiz','settings'\]/);
  assert.match(app, /const swipePages=\['home','bond','moments','quiz'\]/);
  assert.doesNotMatch(html, /data-page="settings"/);
  assert.match(html, /id="usTodayPriorityRegion" hidden aria-live="polite"><\/div>/);
  assert.doesNotMatch(html, /usTodayPriorityRegion[^>]*>[\s\S]*?(received|reveal ready|waiting for me|priority card)/i);
});

test('partner apre solo Lasciato per te e il profilo resta un controllo foto', () => {
  const html = read('index.html');
  const stories = read('stories.js');

  assert.match(html, /id="leftForYouPartnerEntry"[\s\S]{0,180}onclick="usEnvelopeTap\(\)"/);
  assert.doesNotMatch(html, /id="profileAvatarBtn"/, 'nessun avatar/foto legacy nel top chrome');
  assert.match(html, /id="profileAvatarFile"/, 'il flusso foto profilo resta vivo tramite Impostazioni');
  assert.match(html, /data-us-setting="profile-photo"[\s\S]{0,220}Cambia foto profilo/);
  assert.doesNotMatch(html, /onclick="openOwnStories\(\)"/);
  assert.match(stories, /__US_LEFT_FOR_YOU_ACTIVE__/);
  assert.match(html, /id="usSettingsEntry"[\s\S]{0,160}onclick="go\('settings',\{nav:true\}\)"/);
  assert.match(read('identity.css'), /\.us-calendar-btn\{width:44px;min-width:44px;height:44px;min-height:44px/);
  assert.doesNotMatch(html, /id="usCalendarBtn"/);
  // US-HUMAN-UI-01: il marchio US vive nella capsule; "I nostri eventi" resta raggiungibile dal Calendario.
  assert.doesNotMatch(html, /id="usEventsTopEntry"/);
  assert.match(html, /<template id="usCapsuleMark"><img class="us-brand-symbol-art us-capsule-mark"/);
  assert.match(html, /id="usCalendarEventsLink"[\s\S]{0,200}Eventi/);
  assert.match(html, /data-us-setting="profile-photo"[\s\S]{0,220}Cambia foto profilo/);
  assert.match(read('settings.js'), /window\.pickProfilePhoto\?\.\(\)/);
});
