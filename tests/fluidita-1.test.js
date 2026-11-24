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
test('tab change: the tide is quick and runs on the compositor', () => {
  const js = read('due-colori.js');
  assert.match(js, /const COVER_MS = 460;/);
  assert.match(js, /const REVEAL_MS = 300;/);
  // «Non rifà una nuova transizione» (founder, 25/11/2026): a tap while the
  // colour moves is a new flood at once, with its own disc from the new tab.
  assert.match(js, /if \(button && busy && !slideJob && flooding\(\)\) \{ flood\(button, this, id, options\); return undefined; \}/);
  assert.match(js, /turn = 1 - turn;\n  const disc = discs\[turn\];/);
  assert.match(js, /if \(doc\.querySelector\('\.page\.active'\)\?\.id === to\) pending = null;/, 'back to the page on screen: nothing reloads');
  assert.doesNotMatch(js, /function rush\(/);
  assert.match(js, /const GROW = 'cubic-bezier\(\.4,\.05,\.45,1\)';/);
  // No sharp edge (founder, 24/11/2026): the colour takes the page little by little.
  assert.match(read('due-colori.css'), /\.us-flood-disc\{[^}]*background:radial-gradient\(circle closest-side,var\(--c\) 52%,[^}]*transparent 100%\)/);
  assert.match(js, /const FADE_MS = 180;/, 'reduced motion keeps its short fade');
  assert.match(js, /disc\.animate\(\[\{ transform: 'scale\(0\.002\)', opacity: 1 \}, \{ transform: `scale\(\$\{grown\.toFixed\(3\)\}\)`, opacity: 1 \}\]/, 'the colour grows with transform');
  // Revisione (24/11/2026): a small disc drawn once, on a layer that stays in the page.
  assert.match(js, /const DISC = 480;/);
  assert.match(js, /if \(doc\.body\) prepare\(\); else doc\.addEventListener\('DOMContentLoaded', prepare, \{ once: true \}\);/);
  assert.match(read('due-colori.css'), /\.us-flood\{[^}]*opacity:0;will-change:opacity\}\n\.us-flood\[data-on="1"\]\{opacity:1\}/);
  assert.match(js, /await covered\(current\.cover\);/, 'the page changes once the screen is covered');
  assert.match(js, /return d\.animate\(\[\{ opacity: Number\.isFinite\(now\) \? now : 1 \}, \{ opacity: 0 \}\]/, 'each disc dissolves with opacity');
  // The tabs' colours are kept per Giorno and Notte too.
  assert.match(js, /\$\{button\.dataset\.page\}\|\$\{root\.dataset\.usLuce \|\| ''\}\|/);
  assert.doesNotMatch(js, /clipPath/, 'no clip-path repainted at every frame');
  assert.match(read('due-colori.css'), /\.us-flood-disc\{[^}]*border-radius:50%[^}]*will-change:transform\}/);
  assert.match(read('ui-foundation.js'), /const later = environment\.UsDueColori\?\.afterMotion;/, 'the sound engine is never built mid-motion');
});
