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
  'game-controller-regular.svg',
  'game-controller-fill.svg',
];

test('Due colori usa Fraunces e Figtree self-hosted con fallback locale', () => {
  const css = foundation();
  assert.match(css, /@font-face\{font-family:"Fraunces";src:url\("\/assets\/fonts\/Fraunces-Soft-Roman\.woff2"\)/);
  assert.match(css, /@font-face\{font-family:"Fraunces";src:url\("\/assets\/fonts\/Fraunces-Soft-Italic\.woff2"\)[^}]*font-style:italic/);
  assert.match(css, /@font-face\{font-family:"Figtree";src:url\("\/assets\/fonts\/Figtree-Latin\.woff2"\)/);
  assert.match(css, /@font-face\{font-family:"Figtree";src:url\("\/assets\/fonts\/Figtree-LatinExt\.woff2"\)/);
  assert.match(css, /--us-font-editorial:"Fraunces",Georgia,"Times New Roman",serif/);
  assert.match(css, /--us-font-ui:"Figtree",system-ui/);
  assert.doesNotMatch(css, /fonts\.googleapis|fonts\.gstatic/);
});

// Il diario, ma pulito (15/11/2026): the nav draws the mockup's stroke icons
// inline instead of the Phosphor regular/fill pairs; same four root tabs.
test('M1 bottom navigation usa Phosphor regular/fill senza cambiare le quattro root tab', () => {
  const html = index();
  const nav = html.match(/<nav class="dy-nav"[\s\S]*?<\/nav>/)?.[0] || '';
  for (const asset of PHOSPHOR_NAV_ASSETS) assert.doesNotMatch(nav, new RegExp(asset.replace('.', '\\.')));
  assert.equal((nav.match(/<svg class="dy-nav-icon"/g) || []).length, 4);
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
  // Il diario, ma pulito (15/11/2026): four equal columns of a full-width bar;
  // each button is the bar height (--us-nav-height) minus its padding, 44px+ even in short landscape.
  const css = read('diario.css');
  assert.match(css, /\.dy-nav\{[^}]*grid-template-columns:1fr 1fr 76px 1fr 1fr;height:calc\(var\(--us-nav-height\) \+ max\(18px,var\(--us-safe-bottom\)\)\);padding:6px /);
  assert.match(foundation(), /--us-nav-height:56px;/);
  assert.match(read('fix4.css'), /\{:root\{--us-nav-height:52px\}/);
  assert.match(css, /\.dy-nav \.dy-nav-icon\{width:24px;height:24px;/);
});

test('M1 applica il top chrome APK senza introdurre fullscreen/settings o relocation Home', () => {
  const css = identity();
  const html = index();
  // Il diario, ma pulito (15/11/2026): the APK top pill is a hidden holder; the header of Oggi is in the page.
  assert.match(html, /<div class="top us-premium-top" hidden>/);
  assert.doesNotMatch(css, /\.top\.us-premium-top\{position:absolute/);
  assert.doesNotMatch(html, /data-us-fullscreen-page|usSettingsBack|usHeroOverlayLayer|thinkReceivedContext/);
  assert.doesNotMatch(html, /native-entry\.js|reliability\.js|vendor\/supabase\.js/);
});

test('M1 ancora il top chrome al contenitore mobile .app, non al viewport desktop', () => {
  const css = read('fix4.css') + read('identity.css');
  assert.match(css, /\.app\{[^}]*position:relative/);
  // Il diario, ma pulito (15/11/2026): the header of Oggi lives inside .app.
  assert.ok(index().indexOf('<div class="app">') < index().indexOf('<header class="dy-head">'));
});

test('M1.2 usa una clearance authority e riserva spazio sulle tre secondary root pages', () => {
  const css = read('identity.css') + read('fix4.css') + read('ui-foundation.css');
  assert.match(css, /--us-top-chrome-height:46px/);
  assert.match(css, /--us-top-chrome-clearance:56px/);
  // Il diario, ma pulito (15/11/2026): the pill rules went with the pill; the clearance
  // token still reserves space on the secondary pages (0 outside Oggi, top-chrome.css).
  assert.match(read('top-chrome.css'), /body:has\(\.app > \.page\.active:not\(#home\)\) \{\s*--us-top-chrome-clearance: 0px;/);
  assert.match(css, /#bond,#moments,#quiz\{padding-top:calc\(var\(--us-top-chrome-clearance\) \+ var\(--us-space-2\)\);box-sizing:border-box\}/);
  assert.match(css, /#bond>\.section,#moments>\.section,#quiz>\.section\{margin-top:0!important\}/);
  assert.doesNotMatch(css, /#home\{padding-top:/);
  assert.match(css, /#settings\{height:calc\(var\(--us-viewport-height\) - var\(--us-safe-top\)\)/);
});

test('M1.3 (M12A) il centro della top chrome è il marchio US; I nostri eventi vive nel Calendario', () => {
  const html = read('index.html');
  const css = read('identity.css');
  assert.doesNotMatch(html, /id="usEventsTopEntry"/);
  // Noi nuova (03/11/2026): no Eventi tile; Eventi opens from the dates of the Noi calendar.
  assert.match(read('noi-v2.js'), /window\.openNoiSection\?\.\('eventi'\)/);
  assert.doesNotMatch(html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '', /class="us-event-add"/);
  // Il diario, ma pulito (15/11/2026): the centre of the header is «us» (dy-mark), not a control.
  assert.match(html, /<span class="dy-mark" role="img" aria-label="US">us<\/span>/);
  assert.doesNotMatch(css, /us-events-top/);
});

test('M1.4 rende la top chrome una floating pill contenuta nella shell', { skip: 'Il diario, ma pulito (15/11/2026): la barra in alto a pillola fluttuante (M1/M12A) è tolta; Oggi ha la sua testata su carta' }, () => {
  const css = read('identity.css');
  assert.match(css, /\.top\.us-premium-top\{[^}]*left:10px;right:10px/);
  assert.match(css, /\.top\.us-premium-top\{[^}]*border-radius:28px/);
  assert.match(css, /\.top\.us-premium-top\{[^}]*overflow:hidden/);
  assert.match(css, /\.top\.us-premium-top::before\{[^}]*border-radius:inherit/);
  assert.match(css, /\.top\.us-premium-top \.us-top-brand\{[^}]*overflow:hidden/);
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
  // Il diario, ma pulito (15/11/2026): the full-bleed photo hero is hidden; the
  // page of today clears the nav itself and its photo fills its frame.
  const diario = read('diario.css');
  // One page (founder, 20/11/2026): the column fills the screen and keeps the bar clearance.
  assert.match(diario, /\.dy-oggi\{box-sizing:border-box;display:flex;flex-direction:column;min-height:[^}]*padding:0 0 calc\(var\(--us-nav-height\) \+ max\(18px,var\(--us-safe-bottom\)\) \+ 12px \+ var\(--us-nav-rise\)\)\}/);
  assert.match(diario, /\.dy-photo-img\{[^}]*object-fit:cover\}/);
  assert.match(css, /\.app\{[^}]*padding-bottom:calc\(var\(--us-nav-height\) \+ var\(--us-safe-bottom\) \+ 34px\)!important/);
});

test('M1 topbar refinement bilancia tre zone senza ridurre i touch target', { skip: 'Il diario, ma pulito (15/11/2026): la barra in alto a pillola fluttuante (M1/M12A) è tolta; Oggi ha la sua testata su carta' }, () => {
  const css = read('identity.css');
  assert.match(css, /\.top\.us-premium-top\{[^}]*display:grid[^}]*grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);
  assert.match(css, /\.top\.us-premium-top \.us-top-brand\{[^}]*grid-column:2/);
  assert.match(css, /\.top\.us-premium-top \.top-actions\{[^}]*grid-column:3[^}]*justify-self:end/);
  assert.match(css, /\.top\.us-premium-top \.us-top-brand\{[^}]*justify-self:center/);
  assert.match(css, /\.us-top-brand-art\{[^}]*height:58px/);
  assert.match(css, /\.top\.us-premium-top \.profile-avatar[^}]*min-width:44px/);
  assert.match(css, /\.top\.us-premium-top \.us-calendar-btn[^}]*min-width:44px/);
});

test('M1 shell assets sono presenti nel Web source e non dipendono dal bundle APK', () => {
  const required = [
    'assets/fonts/Fraunces-Soft-Roman.woff2',
    'assets/fonts/Fraunces-Soft-Italic.woff2',
    'assets/fonts/Figtree-Latin.woff2',
    'assets/fonts/Figtree-LatinExt.woff2',
    'assets/fonts/Fraunces-OFL.txt',
    'assets/fonts/Figtree-OFL.txt',
    ...PHOSPHOR_NAV_ASSETS.map((asset) => `assets/icons/phosphor/${asset}`),
  ];
  for (const file of required) assert.equal(fs.existsSync(path.join(ROOT, file)), true, file);
});
