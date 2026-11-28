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
test('tab change: the production tide, with the soft-edged colour', () => {
  const js = read('due-colori.js');
  const css = read('due-colori.css');
  // «Vedi su produzione com'è reattivo» (founder, 25/11/2026): production's
  // times, curve and second tap (retarget), with staging's soft edge.
  assert.match(js, /const COVER_MS = 260;/);
  assert.match(js, /const REVEAL_MS = 340;/);
  assert.match(js, /const IO = 'cubic-bezier\(\.7,0,\.2,1\)';/);
  assert.match(js, /const STAGGER_DELAY = 160;\nconst STAGGER_STEP = 50;\nconst STAGGER_MS = 460;/);
  assert.match(js, /if \(button && busy && !slideJob && retarget\(button, this, id, options\)\) return undefined;/);
  assert.match(js, /function retarget\(button, self, id, options\) \{[\s\S]*?if \(id === current\.from\) \{[\s\S]*?current\.cover\?\.reverse\(\)/, 'the tab it left turns the colour back');
  assert.match(js, /disc\.style\.setProperty\('--us-flood', tabColor\(button\)\);\n    return true;/, 'while it rises the colour turns to the new tab');
  assert.doesNotMatch(js, /function rush\(|const discs = \[\]/);
  // No sharp edge (founder, 24/11/2026): a soft disc covers; a soft hole opens.
  assert.match(css, /\.us-flood-disc\{[^}]*background:radial-gradient\(circle closest-side,var\(--c\) 52%,[^}]*transparent 100%\)/);
  assert.match(js, /disc\.animate\(\[\{ transform: 'scale\(0\.002\)', opacity: 1 \}, \{ transform: `scale\(\$\{grown\.toFixed\(3\)\}\)`, opacity: 1 \}\],\n      \{ duration: COVER_MS, easing: IO, fill: 'both' \}\)/, 'the colour grows with transform');
  assert.match(js, /el\.animate\(\[\{ '--us-hole': '0px' \}, \{ '--us-hole': `\$\{radius \+ HOLE_EDGE\}px` \}\]/, 'the page opens through a soft hole');
  assert.match(css, /\.us-flood\.is-opening\{-webkit-mask-image:radial-gradient\(circle at var\(--us-hole-x,50%\) var\(--us-hole-y,100%\),transparent calc\(var\(--us-hole,0px\) - 140px\),#000 var\(--us-hole,0px\)\)/);
  assert.match(js, /const FADE_MS = 180;/, 'reduced motion keeps its short fade');
  // Revisione (24/11/2026): a small disc drawn once, on a layer that stays in the page.
  assert.match(js, /const DISC = 480;/);
  assert.match(js, /if \(doc\.body\) prepare\(\); else doc\.addEventListener\('DOMContentLoaded', prepare, \{ once: true \}\);/);
  assert.match(css, /\.us-flood\{[^}]*opacity:0;will-change:opacity\}\n\.us-flood\[data-on="1"\]\{opacity:1\}/);
  assert.match(js, /await covered\(current\.cover\);/, 'the page changes once the screen is covered');
  // The tabs' colours are kept per Giorno and Notte too.
  assert.match(js, /\$\{button\.dataset\.page\}\|\$\{root\.dataset\.usLuce \|\| ''\}\|/);
  assert.doesNotMatch(js, /clipPath/);
  assert.match(css, /\.us-flood-disc\{[^}]*border-radius:50%[^}]*will-change:transform[^}]*\}/);
  assert.match(read('ui-foundation.js'), /const later = environment\.UsDueColori\?\.afterMotion;/, 'the sound engine is never built mid-motion');
});
