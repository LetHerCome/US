// Redesign definitivo, fase 3 (founder 23/11/2026, D7 e D8): the four pages
// are four steps from your colour to the other person's, mixed in OKLCH; each
// phone starts from its own; every step reads on the night and under the dark
// ink of a button; the Atmosfere and the Colore di Noi are retired.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const C = require('../person-colors.js');

const channel = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
const luminance = (hex) => { const [r, g, b] = channel(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
// Chroma in OKLab, to see that a step never fades to grey.
function chroma(hex) {
  const [r, g, b] = channel(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return Math.hypot(1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s);
}
const NIGHT = '#140c14';
const INK = '#1a1020';
const ids = Object.keys(C.PALETTE);

test('every step of every pair reads at 7:1 on the night and 4.5:1 under the dark ink', () => {
  let worst = Infinity, worstInk = Infinity;
  for (const a of ids) for (const b of ids) {
    if (a === b) continue;
    const steps = C.pageColors(C.PALETTE[a], C.PALETTE[b]);
    for (const hex of Object.values(steps)) {
      assert.match(hex, /^#[0-9a-f]{6}$/);
      worst = Math.min(worst, contrast(hex, NIGHT));
      worstInk = Math.min(worstInk, contrast(hex, INK));
    }
  }
  assert.ok(worst >= 7, `night ${worst.toFixed(2)}`);
  assert.ok(worstInk >= 4.5, `ink ${worstInk.toFixed(2)}`);
});

test('the steps go from yours to theirs and never fade to grey on the way', () => {
  const s = C.pageColors(C.PALETTE.blu, C.PALETTE.pesca);
  assert.equal(s.home, C.PALETTE.blu);
  assert.equal(s.quiz, C.PALETTE.pesca);
  for (const a of ids) for (const b of ids) {
    if (a === b) continue;
    const steps = C.pageColors(C.PALETTE[a], C.PALETTE[b]);
    const floor = Math.min(chroma(C.PALETTE[a]), chroma(C.PALETTE[b])) - 0.002;
    for (const page of ['bond', 'moments', 'noi']) assert.ok(chroma(steps[page]) >= floor, `${a}→${b} ${page} ${steps[page]}`);
  }
  // Noi is the middle: the same on both phones.
  assert.equal(C.pageColors(C.PALETTE.salvia, C.PALETTE.prugna).noi, C.pageColors(C.PALETTE.prugna, C.PALETTE.salvia).noi);
});

test('colori.css holds the steps of the usual rosa and lilla, for either phone', () => {
  const css = read('colori.css');
  const mine = C.pageColors(C.PALETTE.rosa, C.PALETTE.lilla);
  const bea = C.pageColors(C.PALETTE.lilla, C.PALETTE.rosa);
  assert.ok(css.includes(`:root{--us-pg-home:${mine.home};--us-pg-bond:${mine.bond};--us-pg-moments:${mine.moments};--us-pg-quiz:${mine.quiz};--us-noi:${mine.noi}}`));
  assert.ok(css.includes(`:root[data-us-me="beatrice"]{--us-pg-home:${bea.home};--us-pg-bond:${bea.bond};--us-pg-moments:${bea.moments};--us-pg-quiz:${bea.quiz}}`));
});

test('the steps go on <html> from the chosen colours, starting from whose phone it is', () => {
  const set = new Map();
  const target = { style: { setProperty: (k, v) => set.set(k, v), removeProperty: (k) => set.delete(k) }, dataset: {} };
  const F = { id: 'f', role: 'francesco', person_color: 'blu' };
  const B = { id: 'b', role: 'beatrice', person_color: 'pesca' };
  C.applyCoupleColors([F, B], target, 'francesco');
  assert.equal(set.get('--us-pg-home'), C.PALETTE.blu);
  assert.equal(set.get('--us-pg-quiz'), C.PALETTE.pesca);
  assert.equal(set.get('--us-noi'), C.pageColors(C.PALETTE.blu, C.PALETTE.pesca).noi);
  assert.ok(target.dataset.usPagine.startsWith(C.PALETTE.blu));
  C.applyCoupleColors([F, B], target, 'beatrice');
  assert.equal(set.get('--us-pg-home'), C.PALETTE.pesca, 'Bea starts from her own');
  assert.equal(set.get('--us-pg-quiz'), C.PALETTE.blu);
  // Only one chosen: the other keeps the usual one.
  C.applyCoupleColors([{ ...F, person_color: null }, B], target, 'francesco');
  assert.equal(set.get('--us-pg-home'), C.PALETTE.rosa);
  assert.equal(set.get('--us-pg-quiz'), C.PALETTE.pesca);
  // No choice: back to colori.css.
  C.applyCoupleColors([], target, 'francesco');
  assert.equal(set.size, 0);
  assert.equal(target.dataset.usPagine, undefined);
});

test('the bar, the glow, each page and the main buttons take the steps', () => {
  const css = read('colori.css');
  for (const page of ['home', 'bond', 'moments', 'quiz']) {
    assert.ok(css.includes(`.us-nav-premium button[data-page="${page}"]{--us-nav-c:var(--us-pg-${page})}`), page);
    assert.ok(css.includes(`.us-nav:has(> button[data-page="${page}"].active){--us-nav-blob:var(--us-pg-${page})}`), page);
    assert.ok(css.includes(`:root:has(#${page}.page.active){--us-tab:var(--us-pg-${page})}`), page);
  }
  assert.match(css, /#moments,#ricordiChapterOverlay,[^{]*\{--us-pg:var\(--us-pg-moments\);--us-ambra:var\(--us-pg\)\}/);
  assert.match(css, /#quiz\{--us-pg:var\(--us-pg-quiz\);--us-menta:var\(--us-pg\);--us-noi:var\(--us-pg\)\}/);
  assert.match(css, /--us-accent-gradient:linear-gradient\(90deg,var\(--us-tu\),var\(--us-partner\)\)/);
  // The colour between pages is read per tab and per couple (due-colori.js).
  assert.match(read('due-colori.js'), /\$\{root\.dataset\.usPagine \|\| ''\}`;/);
  const html = read('index.html');
  assert.ok(html.indexOf('/struttura.css?v=') < html.indexOf('/colori.css?v='), 'colori.css comes last');
  for (const file of ['scripts/build-capacitor-web.mjs', 'scripts/build-cloudflare-pages.mjs']) assert.match(read(file), /'colori\.css',/);
  assert.match(read('service-worker.js'), /versioned\("\/colori\.css"\)/);
});

test('the Atmosfere and the Colore di Noi are retired: never painted, never offered', () => {
  const progression = read('progression.js');
  assert.match(progression, /theme: \{ pref: 'theme_reward_id', retired: true, label: 'Atmosfera'/);
  assert.match(progression, /accent: \{ pref: 'accent_reward_id', retired: true, label: 'Colore di Noi'/);
  assert.match(progression, /const value = \(category\) => \(SLOTS\[category\]\.retired \? '' : slotValue/);
});
