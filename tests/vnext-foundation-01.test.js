const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Foundation 01 distribuisce quattro destinazioni bottom-nav con touch target preservato', () => {
  const html = read('index.html');
  const css = read('fix4.css');
  const nav = html.match(/<nav class="nav us-nav us-nav-premium"[\s\S]*?<\/nav>/)?.[0] || '';

  assert.deepEqual([...nav.matchAll(/data-page="([^"]+)"/g)].map((match) => match[1]), ['home', 'bond', 'moments', 'quiz']);
  assert.match(css, /grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(css, /\.nav button\{min-width:0;min-height:52px/);
  assert.match(css, /bottom:max\(8px,var\(--us-safe-bottom\)\)/);
  assert.match(css, /@media \(orientation:landscape\) and \(max-height:560px\)[\s\S]{0,1600}\.nav button\{min-height:46px/);
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
  assert.match(html, /id="profileAvatarBtn"[\s\S]{0,180}aria-label="Aggiorna foto profilo"[\s\S]{0,100}onclick="pickProfilePhoto\(\)"/);
  assert.doesNotMatch(html, /onclick="openOwnStories\(\)"/);
  assert.match(stories, /__US_LEFT_FOR_YOU_ACTIVE__/);
  assert.match(html, /id="usSettingsEntry"[\s\S]{0,160}onclick="go\('settings',\{nav:true\}\)"/);
  assert.match(read('identity.css'), /\.us-calendar-btn\{width:44px;min-width:44px;height:44px;min-height:44px/);
  assert.doesNotMatch(html, /id="usCalendarBtn"/);
  assert.match(html, /id="usEventsTopEntry"[\s\S]{0,180}onclick="openEvents\(\)"/);
  assert.match(html, /data-us-setting="profile-photo"[\s\S]{0,220}Cambia foto profilo/);
  assert.match(read('settings.js'), /window\.pickProfilePhoto\?\.\(\)/);
});
