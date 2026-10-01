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

// US-HUMAN-UI-01: the dock selection is the indicator + filled icon + label
// weight; the continuous orbit, glow and dot are gone. The dock lives in
// ui-foundation.css (its only owner now).
test('M1 dock: nessuna orbit continua, selezione senza colore soltanto, reduced motion', () => {
  const css = foundation() + identity();
  assert.doesNotMatch(css, /us-nav-orbit/);
  assert.doesNotMatch(css, /\.us-nav[^{]*\{[^}]*infinite/, 'nothing in the dock loops');
  assert.match(foundation(), /\.us-nav\.us-nav-premium>button\.active \.nlabel\{font-weight:680\}/);
  assert.match(foundation(), /\.us-nav\.us-nav-premium>button\.active \.us-nav-icon\{animation:us-nav-settle 380ms var\(--us-ease-enter\) 1 both\}/);
  assert.match(foundation(), /:root\[data-us-motion="reduced"\] \.us-nav\.us-nav-premium>button\.active \.us-nav-icon\{animation:none\}/);
  assert.match(foundation(), /\.us-nav-track\{[^}]*pointer-events:none/);
});

test('M1 dock conserva target touch da 44px (slot alto 52px)', () => {
  const css = foundation();
  assert.match(css, /\.us-nav\.us-nav-premium>button\{[^}]*min-width:44px;min-height:52px/);
  assert.match(css, /@media \(orientation:landscape\) and \(max-height:560px\)\{[\s\S]*?\.us-nav\.us-nav-premium>button\{min-height:44px/);
});

test('M1 applica il top chrome APK senza introdurre fullscreen/settings o relocation Home', () => {
  const css = foundation();
  const html = index();
  assert.match(css, /\.top\.us-premium-top\{position:absolute/);
  assert.doesNotMatch(identity(), /\.top\.us-premium-top::before/);
  assert.doesNotMatch(html, /data-us-fullscreen-page|usSettingsBack|usHeroOverlayLayer|thinkReceivedContext/);
  assert.doesNotMatch(html, /native-entry\.js|reliability\.js|vendor\/supabase\.js/);
});

test('M1 ancora il controllo superiore al contenitore mobile .app, non al viewport desktop', () => {
  const css = read('fix4.css') + read('identity.css') + read('ui-foundation.css');
  assert.match(css, /\.app\{[^}]*position:relative/);
  assert.match(css, /\.top\.us-premium-top\{position:absolute/);
});

// US-HUMAN-UI-01: no top bar. The floating corner control is 44px; pages keep
// a small clearance and their title rows leave the corner to the control.
test('M1.2 usa una clearance authority e riserva spazio sulle tre secondary root pages', () => {
  const css = read('identity.css') + read('fix4.css') + read('ui-foundation.css');
  assert.match(css, /--us-top-chrome-height:44px/);
  assert.match(css, /--us-top-chrome-clearance:8px/);
  assert.match(css, /--us-shell-top:calc\(var\(--us-safe-top\) \+ 6px\)/);
  assert.match(css, /\.top\.us-premium-top\{[^}]*height:var\(--us-top-chrome-height\)/);
  assert.match(css, /#bond,#moments,#quiz\{padding-top:var\(--us-top-chrome-clearance\);box-sizing:border-box\}/);
  assert.match(css, /\.noi-canonical-head,\.us-moments-head,\.us-gv2-head,\.us-settings2-head,\.noi-section-bar\{padding-right:var\(--us-shell-control-space\)/);
  assert.match(css, /#bond>\.section,#moments>\.section,#quiz>\.section\{margin-top:0!important\}/);
  assert.doesNotMatch(css, /#home\{padding-top:/);
  assert.match(css, /#settings\{height:calc\(var\(--us-viewport-height\) - var\(--us-safe-top\)\)/);
});

test('M1.3 (US-HUMAN-UI-01) il marchio US vive nella capsule; I nostri eventi vive nel Calendario', () => {
  const html = read('index.html');
  const css = read('identity.css');
  assert.doesNotMatch(html, /id="usEventsTopEntry"/);
  assert.match(html, /id="usCalendarEventsLink"[^>]*aria-label="Apri i nostri eventi"/);
  assert.doesNotMatch(html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0] || '', /class="us-event-add"/);
  assert.match(html, /<template id="usCapsuleMark"><img class="us-brand-symbol-art us-capsule-mark"/);
  assert.doesNotMatch(css, /us-events-top|us-top-brand/);
});

test('M1.4 il controllo superiore è un angolo flottante, senza barra né vetro a tutta larghezza', () => {
  const css = foundation();
  assert.match(css, /\.top\.us-premium-top\{[^}]*right:max\(10px,calc\(var\(--us-safe-right\) \+ 10px\)\);left:auto;width:auto/);
  assert.match(css, /\.top\.us-premium-top\{[^}]*background:none;border:0;border-radius:0;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none/);
  assert.match(css, /\.top\.us-premium-top>\*\{pointer-events:auto\}/);
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
  assert.match(css, /#home\.page\.active\{padding-bottom:0!important;margin-top:0\}/);
  // US-HUMAN-UI-01: the Oggi photo reaches the physical top edge (behind the status bar).
  assert.match(css, /#home \.home-hero-only\{[^}]*height:var\(--us-viewport-height\)!important[^}]*min-height:0!important/);
  assert.match(css, /body:has\(#home\.page\.active\) \.app\{padding-top:0!important;padding-bottom:0!important\}/);
  assert.match(css, /#home \.home-distance-pill\{[^}]*bottom:calc\(var\(--us-nav-height\) \+ var\(--us-safe-bottom\) \+ 18px\)!important/);
  assert.match(css, /#home \.push-optin-card\{[^}]*bottom:calc\(var\(--us-nav-height\) \+ var\(--us-safe-bottom\) \+ 83px\)!important/);
  assert.match(css, /\.app\{[^}]*padding-bottom:calc\(var\(--us-nav-height\) \+ var\(--us-safe-bottom\) \+ 34px\)!important/);
  assert.match(css, /\.home-photo-layer\{[\s\S]*background-size:cover/);
});

test('M1 il controllo flottante conserva il target touch da 44px', () => {
  const css = read('left-for-you.css') + foundation();
  assert.match(css, /--us-top-chrome-height:44px/);
  assert.match(css, /\.top\.us-premium-top\{[^}]*height:var\(--us-top-chrome-height\)/);
  assert.match(read('left-for-you.css'), /\.us-envelope-control\{[^}]*width:44px[^}]*height:44px/);
});

test('M1 shell assets sono presenti nel Web source e non dipendono dal bundle APK', () => {
  const required = [
    'assets/fonts/Inter-Variable.woff2',
    'assets/fonts/Newsreader-Variable.woff2',
    ...PHOSPHOR_NAV_ASSETS.map((asset) => `assets/icons/phosphor/${asset}`),
  ];
  for (const file of required) assert.equal(fs.existsSync(path.join(ROOT, file)), true, file);
});
