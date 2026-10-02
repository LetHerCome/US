const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const index = () => read('index.html');
const foundation = () => read('ui-foundation.css');
const identity = () => read('identity.css');

const PHOSPHOR_NAV_ASSETS = [
  'house-regular.svg',
  'house-fill.svg',
  'heart-straight-regular.svg',
  'heart-straight-fill.svg',
  'images-regular.svg',
  'images-fill.svg',
  'cards-three-regular.svg',
  'cards-three-fill.svg',
];

test('M1 usa Inter e Newsreader self-hosted con fallback locale', () => {
  const css = foundation();
  assert.match(css, /@font-face\{font-family:"Newsreader"/);
  assert.match(css, /url\("\/assets\/fonts\/Newsreader-Variable\.woff2"\)/);
  assert.match(css, /@font-face\{font-family:"Inter"/);
  assert.match(css, /url\("\/assets\/fonts\/Inter-Variable\.woff2"\)/);
  assert.match(css, /--us-font-editorial:"Newsreader",Georgia,serif/);
  assert.match(css, /--us-font-ui:"Inter",system-ui/);
});

test('M1 bottom navigation usa Phosphor regular/fill senza cambiare le quattro root tab', () => {
  const html = index();
  for (const asset of PHOSPHOR_NAV_ASSETS) {
    assert.match(html, new RegExp(`data-icon="/assets/icons/phosphor/${asset}"`));
  }
  assert.equal((html.match(/<button[^>]+data-page="(?:home|bond|moments|quiz)"/g) || []).length, 4);
  assert.doesNotMatch(html, /data-page="settings"/);
});

// HUMAN-UI-02 retired the infinite active orbit: the nav carries no looping animation.
test('HUMAN-UI-02 la nav attiva non ha animazioni in loop', () => {
  const css = identity();
  assert.doesNotMatch(css, /us-nav-orbit/);
  assert.doesNotMatch(css, /us-nav-premium[^{]*\{[^}]*animation:[^;}]*infinite/);
});

test('HUMAN-UI-02 conserva target touch >= 44px con una nav compatta', () => {
  const css = identity();
  assert.match(css, /\.us-nav-premium button\{[\s\S]*?min-width:44px!important;[\s\S]*?min-height:46px!important/);
  assert.match(css, /\.us-nav-premium button \.nicon\{[\s\S]*?width:32px!important;[\s\S]*?height:28px!important/);
});

test('M1 applica il top chrome APK senza introdurre fullscreen/settings o relocation Home', () => {
  const css = identity();
  const html = index();
  // HUMAN-UI-03: the APK top chrome is now the US Island (glass pill on ::before).
  const foundation = read('ui-foundation.css');
  assert.match(foundation, /\.us-island\{position:fixed;/);
  assert.match(foundation, /\.us-island-shell::before\{content:""/);
  assert.doesNotMatch(html, /data-us-fullscreen-page|usSettingsBack|usHeroOverlayLayer|thinkReceivedContext/);
  assert.doesNotMatch(html, /native-entry\.js|reliability\.js|vendor\/supabase\.js/);
});

test('M1 (HUMAN-UI-03) la top shell è un oggetto centrato che rispetta gli inset, non una barra a tutta larghezza', () => {
  const css = read('fix4.css') + read('identity.css');
  assert.match(css, /\.app\{[^}]*position:relative/);
  const foundation = read('ui-foundation.css');
  assert.match(foundation, /\.us-island\{[^}]*left:max\(12px,var\(--us-safe-left\)\);right:max\(12px,var\(--us-safe-right\)\)[^}]*justify-content:center/);
  assert.match(index(), /<div class="app">\s*<!--[\s\S]*?-->\s*<div class="us-status-veil" aria-hidden="true"><\/div>\s*<div class="us-island" id="usIsland"/);
});

test('M1.2 usa una clearance authority e riserva spazio sulle tre secondary root pages', () => {
  const css = read('identity.css') + read('fix4.css') + read('ui-foundation.css');
  // HUMAN-UI-03: one clearance authority — the Island row (44px) + its offset; pages add the safe-top inset themselves.
  assert.match(css, /--us-island-hit:44px/);
  assert.match(css, /--us-top-chrome-clearance:48px/);
  assert.match(css, /\.us-island\{[^}]*height:var\(--us-island-hit\)/);
  assert.match(css, /#bond,#moments,#quiz\{padding-top:calc\(var\(--us-safe-top\) \+ var\(--us-top-chrome-clearance\)\);box-sizing:border-box\}/);
  assert.match(css, /#bond>\.section,#moments>\.section,#quiz>\.section\{margin-top:0!important\}/);
  assert.doesNotMatch(css, /#home\{padding-top:/);
  assert.match(css, /#settings\{height:var\(--us-viewport-height\);[^}]*padding-top:calc\(var\(--us-safe-top\) \+ var\(--us-top-chrome-clearance\)\)/);
});

test('M1.3 (M12A) il centro della top chrome è il marchio US; I nostri eventi vive nel Calendario', () => {
  const html = read('index.html');
  const css = read('identity.css') + read('ui-foundation.css');
  assert.doesNotMatch(html, /id="usEventsTopEntry"/);
  assert.match(html, /id="usCalendarEventsLink"[^>]*aria-label="Apri i nostri eventi"/);
  assert.doesNotMatch(html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '', /class="us-event-add"/);
  assert.match(css, /\.us-island-mark-art\{[^}]*pointer-events:none/);
  assert.doesNotMatch(css, /us-events-top/);
});

test('M1.4 (HUMAN-UI-03) la top chrome è una floating pill: l’Isola US', () => {
  const css = read('ui-foundation.css');
  assert.match(css, /\.us-island-shell\{[^}]*overflow-x:clip/);
  assert.match(css, /\.us-island-shell::before\{[^}]*border-radius:var\(--us-radius-pill\)/);
  assert.match(css, /\.us-island-mark-art\{[^}]*overflow:hidden/);
});

test('M1.5 nasconde la priority region solo in Home e preserva il runtime Daily/Events', () => {
  const html = read('index.html');
  const css = read('identity.css') + read('fix4.css') + read('styles.css');
  const app = read('app.js');
  assert.match(html, /<main id="home"[\s\S]*id="usTodayPriorityRegion" hidden aria-live="polite"><\/div>/);
  assert.match(css, /#home #usTodayPriorityRegion\[hidden\]\{display:none!important\}/);
  assert.match(app, /function dailyTodayPriorityViewModel/);
  assert.match(app, /function eventTodayPriorityViewModel/);
  assert.match(app, /data-us-today-action/);
  assert.match(app, /if\(action==='today'\)window\.openToday\?\./);
  assert.match(app, /if\(action==='events'\)window\.openEvents\?\./);
});

test('M1.6 rende Home full-bleed senza cambiare il padding globale delle secondary pages', () => {
  const css = read('identity.css') + read('fix4.css') + read('styles.css');
  // M12B.1: Oggi fits by dropping the nav clearance of .app, never by clipping overflow.
  assert.match(css, /#home\.page\.active\{padding-bottom:0!important\}/);
  assert.match(css, /body:has\(#home\.page\.active\) \.app\{padding-bottom:0!important\}/);
  // HUMAN-UI-03: edge-to-edge — the Oggi frame starts at y=0 and is the whole viewport.
  assert.match(css, /#home \.home-hero-only\{[^}]*height:var\(--us-viewport-height\)!important[^}]*min-height:0!important/);
  assert.match(css, /\.app\{[^}]*padding-top:0!important/);
  assert.match(css, /#home \.home-distance-pill\{[^}]*bottom:calc\(var\(--us-nav-height\) \+ var\(--us-safe-bottom\) \+ 18px\)!important/);
  assert.match(css, /#home \.push-optin-card\{[^}]*bottom:calc\(var\(--us-nav-height\) \+ var\(--us-safe-bottom\) \+ 83px\)!important/);
  assert.match(css, /\.app\{[^}]*padding-bottom:calc\(var\(--us-nav-height\) \+ var\(--us-safe-bottom\) \+ 34px\)!important/);
  assert.match(css, /\.home-photo-layer\{[\s\S]*background-size:cover/);
});

test('M1 topbar refinement (HUMAN-UI-03): Per voi · US · Lasciato per te senza ridurre i touch target', () => {
  const css = read('ui-foundation.css');
  assert.match(css, /\.us-island-mark\{[^}]*width:48px;height:var\(--us-island-hit\)/);
  assert.match(css, /\.us-island-action\{[^}]*height:var\(--us-island-hit\);min-width:44px/);
  assert.match(css, /\.us-island-notice\{[^}]*height:var\(--us-island-hit\)/);
});

test('M1 shell assets sono presenti nel Web source e non dipendono dal bundle APK', () => {
  const required = [
    'assets/fonts/Inter-Variable.woff2',
    'assets/fonts/Newsreader-Variable.woff2',
    ...PHOSPHOR_NAV_ASSETS.map((asset) => `assets/icons/phosphor/${asset}`),
  ];
  for (const file of required) assert.equal(fs.existsSync(path.join(ROOT, file)), true, file);
});
