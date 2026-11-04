// Le sei Atmosfere (founder, 04/11/2026; canvas «Widget, sfondi e Ricordi»,
// tavola Atmosfere.dc.html): US starts on Vino, a dark wine gradient, never
// flat black; every theme reward paints its own gradient; Rosé becomes
// Prugna and Mezzanotte Notte blu, with the same ids and levels.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('Vino is the canvas of US: a gradient that holds the screen while the page scrolls', () => {
  const foundation = read('ui-foundation.css');
  assert.match(foundation, /--us-color-bg:#140c14;/);
  assert.match(foundation, /--us-atmo:radial-gradient\([^;]*rgba\(255,124,150,\.24\)[^;]*linear-gradient\(180deg,#3a1426 0%,#22101d 50%,#140c14 100%\);/);
  const canvas = read('due-colori.css');
  assert.match(canvas, /html,:root\[data-us-theme\]\{\s*background:var\(--us-atmo\),var\(--us-color-bg\);\s*background-attachment:fixed;/);
  assert.doesNotMatch(canvas, /body,:root\[data-us-theme\] body\{\s*background:[^}]*var\(--us-color-bg\)/, 'the body lets the Atmosfera through');
});

test('every Atmosfera reward has its own gradient, Grafite with a silver sheen', () => {
  const css = read('progression.css');
  for (const theme of ['rose', 'midnight', 'film', 'blue_hour', 'graphite']) {
    const rule = css.match(new RegExp(`:root\\[data-us-theme="${theme}"\\],\\.us-cos-theme\\[data-theme="${theme}"\\]\\{[^}]*\\}`))?.[0] || '';
    assert.match(rule, /--us-atmo:[^;]*linear-gradient\(180deg,/, `${theme} paints a gradient`);
  }
  assert.match(css, /data-theme="graphite"\]\{[^}]*--us-atmo:linear-gradient\(115deg,transparent 30%,rgba\(255,255,255,\.055\) 44%,transparent 58%\)/);
  assert.match(css, /\.us-cos-theme\[data-theme="us"\]\{[^}]*--us-atmo:/, 'the free look previews as Vino even under another Atmosfera');
  assert.match(read('dc-gioca.css'), /\.us-cos-theme\{background:var\(--us-atmo\),var\(--us-color-bg\)\}/);
});

test('the free look is Vino; Rosé is now Prugna and Mezzanotte Notte blu, same ids', () => {
  assert.match(read('progression.js'), /theme: \{ id: 'us', title: 'Vino',/);
  const sql = read('supabase/migrations/20261104140000_atmosfere_gradienti.sql');
  assert.match(sql, /\('theme_rose', 'Prugna',/);
  assert.match(sql, /\('theme_midnight', 'Notte blu',/);
  assert.match(sql, /\('theme_graphite', 'Grafite',/);
  const code = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(code, /level_required|\bdelete\b|\binsert\b|\bdrop\b|\bgrant\b/i, 'only titles and descriptions change');
  const en = read('i18n-en.js');
  for (const it of ['Vino', 'Prugna', "'Notte blu'"]) assert.ok(en.includes(`    ${it}: '`), `${it} in English`);
});
