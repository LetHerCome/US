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
  assert.match(app, /const rootPages=\['home','bond','moments','quiz'\]/);
  assert.match(app, /const swipePages=\['home','bond','moments','quiz'\]/);
  assert.doesNotMatch(html, /data-page="settings"/);
  assert.match(html, /id="usTodayPriorityRegion" hidden aria-live="polite"><\/div>/);
  assert.match(html, /id="homeHero"[^>]*>[\s\S]*id="usHeroOverlayLayer"[^>]*data-us-hero-overlay-layer/);
  assert.match(html, /id="usHeroOverlayLayer"[\s\S]*id="usTodayPriorityRegion"/);
  assert.match(html, /id="settings"[^>]*data-us-fullscreen-page/);
});

test('Foundation 01 keeps Oggi hero geometry independent from structural overlay content', () => {
  const html = read('index.html');
  const css = read('ui-foundation.css');

  assert.match(html, /<section class="hero home-hero-only" id="homeHero"/);
  assert.match(html, /id="usHeroOverlayLayer"[^>]*data-us-hero-overlay-layer/);
  assert.match(css, /\[data-us-hero-overlay-layer\][\s\S]*position:absolute/);
  assert.match(css, /\.home-hero-only[\s\S]*position:relative/);
  assert.match(css, /\[data-us-hero-overlay-layer\][\s\S]*inset:0/);
});

test('Foundation 01 defines fullscreen Settings and reduced-motion shell contracts', () => {
  const html = read('index.html');
  const foundation = read('ui-foundation.css');
  const app = read('app.js');

  assert.match(html, /id="settings"[^>]*data-us-fullscreen-page/);
  assert.match(foundation, /\.us-nav[\s\S]*padding-bottom:var\(--us-safe-bottom\)/);
  assert.match(foundation, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(foundation, /data-us-motion="reduced"/);
  assert.match(app, /rootPages/);
});

test('avatar apre Stories personali, Settings ha un entry dedicato ed Events vive sotto Noi', () => {
  const html = read('index.html');
  const stories = read('stories.js');

  assert.match(html, /id="profileAvatarBtn"[\s\S]{0,180}aria-label="Apri le tue Stories"[\s\S]{0,100}onclick="openOwnStories\(\)"/);
  assert.match(stories, /window\.openOwnStories = function openOwnStories\(\) \{[\s\S]{0,180}openStoriesFor\(window\.usProfile\.id, true\)/);
  assert.match(html, /id="usSettingsEntry"[\s\S]{0,160}onclick="go\('settings',\{nav:true\}\)"/);
  assert.match(read('identity.css'), /\.us-calendar-btn\{width:44px;min-width:44px;height:44px;min-height:44px/);
  assert.doesNotMatch(html, /id="usCalendarBtn"/);
  assert.match(html, /id="bond"[\s\S]{0,500}onclick="openEvents\(\)"/);
  assert.match(html, /data-us-setting="profile-photo"[\s\S]{0,220}Cambia foto profilo/);
  assert.match(read('settings.js'), /window\.pickProfilePhoto\?\.\(\)/);
});
