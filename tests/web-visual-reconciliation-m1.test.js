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

test('M1 active orbit è continua, non intercetta touch e rispetta reduced motion', () => {
  const css = identity();
  assert.match(css, /@keyframes us-nav-orbit/);
  assert.match(css, /animation:us-nav-orbit [^;]+infinite/);
  assert.match(css, /pointer-events:none/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)[\s\S]*?us-nav-premium button\.active \.nicon::before\{animation:none!important\}/);
});

test('M1 conserva target touch da 44px anche con cerchio visuale da 38px', () => {
  const css = identity();
  assert.match(css, /\.us-nav-premium button\{[\s\S]*?min-width:44px!important;[\s\S]*?min-height:58px!important/);
  assert.match(css, /\.us-nav-premium button \.nicon\{[\s\S]*?width:38px!important;[\s\S]*?height:38px!important/);
});

test('M1 applica il top chrome APK senza introdurre fullscreen/settings o relocation Home', () => {
  const css = identity();
  const html = index();
  assert.match(css, /\.top\.us-premium-top\{position:absolute/);
  assert.match(css, /\.top\.us-premium-top::before\{content:""/);
  assert.doesNotMatch(html, /data-us-fullscreen-page|usSettingsBack|usHeroOverlayLayer|thinkReceivedContext/);
  assert.doesNotMatch(html, /native-entry\.js|reliability\.js|vendor\/supabase\.js/);
});

test('M1 ancora il top chrome al contenitore mobile .app, non al viewport desktop', () => {
  const css = read('fix4.css') + read('identity.css');
  assert.match(css, /\.app\{[^}]*position:relative/);
  assert.match(css, /\.top\.us-premium-top\{position:absolute/);
});

test('M1 shell assets sono presenti nel Web source e non dipendono dal bundle APK', () => {
  const required = [
    'assets/fonts/Inter-Variable.woff2',
    'assets/fonts/Newsreader-Variable.woff2',
    ...PHOSPHOR_NAV_ASSETS.map((asset) => `assets/icons/phosphor/${asset}`),
  ];
  for (const file of required) assert.equal(fs.existsSync(path.join(ROOT, file)), true, file);
});
