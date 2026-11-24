// Fluidità 1 (docs/missions/fluidita-1.md): first loads show placeholders in
// the shape of what is coming instead of a «Carico…» line, screen readers
// still hear it, motion stops with reduced motion; and the interface no
// longer says «entrambi».
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const between = (src, from, to) => { const a = src.indexOf(from); return a < 0 ? '' : src.slice(a, src.indexOf(to, a + from.length)); };

test('foundation: one skeleton primitive and one screen-reader-only class', () => {
  const css = read('ui-foundation.css');
  assert.match(css, /\.us-skeleton\{[^}]*background:var\(--us-color-surface-2\)/);
  assert.match(css, /@keyframes us-skeleton-sweep/);
  assert.match(css, /:root\[data-us-motion="reduced"\] \.us-skeleton::after\{[^}]*animation:none/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{[^}]*\.us-skeleton::after\{[^}]*animation:none/);
  assert.match(css, /\.us-sr\{[^}]*clip:rect\(0 0 0 0\)/);
  for (const shape of ['us-skeleton-calendar', 'us-skeleton-rows', 'us-skeleton-tiles']) assert.match(css, new RegExp(`\\.${shape}\\{`), shape);
});

test('first loads of Noi and Ricordi are placeholders, still announced', () => {
  const html = read('index.html');
  const calendar = between(html, '<div id="usNoiV2Content"', '</div></div>');
  assert.match(calendar, /class="us-skeleton-calendar" role="status"/);
  assert.match(calendar, /<span class="us-sr">Carico il calendario…<\/span>/);
  const events = between(html, 'id="noiEventsBody"', '</div></div>');
  assert.match(events, /class="us-skeleton-rows" role="status"/);
  assert.match(events, /<span class="us-sr">Carico i vostri eventi…<\/span>/);
  assert.doesNotMatch(html, /<p class="us-noi-v2-empty">Carico il calendario…<\/p>/);
  assert.match(read('noi-v2.js'), /us-skeleton-rows" role="status"><span class="us-sr">Carico i vostri momenti…<\/span>/);
  const ricordi = between(read('app.js'), "if(grid.dataset.loaded!=='1')grid.innerHTML='", "';");
  assert.match(ricordi, /us-skeleton-tiles" role="status"/);
  assert.match(ricordi, /<span class="us-sr">Carico i ricordi…<\/span>/);
  assert.doesNotMatch(ricordi, /arrows-clockwise/);
});

test('the interface says «voi due», never «entrambi»', () => {
  const ui = [read('app.js').replace(/^\s*\/\/.*$/gm, ''), read('index.html').replace(/<!--[\s\S]*?-->/g, '')];
  for (const src of ui) {
    const strings = src.match(/(['"`>])[^'"`<>]*\bentramb[ie]\b[^'"`<>]*/g) || [];
    assert.deepEqual(strings, [], 'no «entrambi» in what people read');
  }
  for (const f of ['calendar.js', 'countdown.js', 'events.js', 'moments-albums.js', 'games.js']) {
    assert.doesNotMatch(read(f).replace(/^\s*\/\/.*$/gm, ''), /['"`][^'"`]*\bentramb[ie]\b(?! i telefoni)[^'"`]*['"`]/, f);
  }
  const en = read('i18n-en.js');
  for (const key of ['Le risposte si svelano quando avete risposto voi due.', 'Sparirà per voi due.', 'Sparirà dal vostro calendario.',
    'Le vostre idee · per voi due', 'Elimina questo ricordo per voi due']) {
    assert.ok(en.includes(`'${key}'`), `English for «${key}»`);
  }
});

// Fluidità 2 (founder, 24/11/2026: «veloci ma non fluide»): still quick, but
// on the compositor (transform and opacity), with a softer curve; the page
// changes as soon as the colour covers the screen.
test('tab change: a tide of colour floods the page, on the compositor', () => {
  const js = read('due-colori.js');
  // Founder, 24/11/2026: «una vera marea di colore… un'onda che pixel dopo pixel mangia la pagina».
  assert.match(js, /const RISE_MS = 520;/);
  assert.match(js, /const LEAVE_MS = 480;/);
  assert.match(js, /const FADE_MS = 180;/, 'reduced motion keeps its short fade');
  assert.match(js, /const WAVE = 'M0 30C50 30 100 10 150 10S250 34 300 34/, 'a wavy crest, repeating at half its width');
  assert.match(js, /band\.animate\(\[\{ transform: place\.start \}, \{ transform: place\.over \}\]/, 'the tide rises with transform');
  assert.match(js, /await covered\(current\.cover, place\.covered\);/, 'the page changes once the screen is under');
  assert.match(js, /band\.animate\(\[\{ transform: place\.over \}, \{ transform: place\.gone \}\]/, 'then it goes on up and out');
  assert.match(js, /const lean = \(0\.5 - at\.x \/ at\.w\) \* TILT;/, 'higher on the side of the tapped tab');
  assert.doesNotMatch(js, /clipPath/, 'no clip-path repainted at every frame');
  const css = read('due-colori.css');
  assert.match(css, /\.us-tide\{[^}]*will-change:transform\}/);
  assert.match(css, /\.us-tide\.is-back\{opacity:\.45\}/, 'a lighter wave runs ahead');
  assert.match(read('ui-foundation.js'), /const later = environment\.UsDueColori\?\.afterMotion;/, 'the sound engine is never built mid-motion');
});
