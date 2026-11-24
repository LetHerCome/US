// Redesign definitivo (founder 23/11/2026, D3 e D11; «togliere la domanda di
// oggi e spostare Sintonia come nel redesign»): Gioca has no daily question and
// no Sintonia tab; Sintonia lives in «Il vostro angolo», opened by tapping the
// two characters on the photo of Oggi.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('index.html');
const block = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));

test('Gioca: no daily question and no Giochi/Sintonia tabs', () => {
  const quiz = block('<main id="quiz"', '</main>');
  assert.doesNotMatch(quiz, /usGiocaTabs|usGiocaTabSintonia|usGiocaSintonia/);
  assert.match(quiz, /<div id="usGiocaGames" class="us-gioca-games">/);
  assert.doesNotMatch(read('games.js'), /us-gv2-daily-slot|bindTabMotion/);
  const app = read('app.js');
  assert.doesNotMatch(app, /function dailyHubMarkup|data-us-daily-entry/);
  // Fase 6 (D11): no week strip either; the painter stays as a name for its callers.
  assert.match(app, /function paintDailyInGioca\(\)\{\}/);
  assert.doesNotMatch(read('games.js'), /paintWeek|id="usGv2Week"/);
  // La domanda di oggi stays on Oggi.
  assert.match(block('<main id="home"', '</main>'), /id="usDailyRitual"/);
});

test('Il vostro angolo: a sheet with the two characters and Sintonia inside', () => {
  const sheet = block('<div id="usAngolo"', '<div id="usStatusSheet"');
  assert.match(sheet, /class="us-angolo-overlay" aria-hidden="true" data-us-modal/);
  assert.match(sheet, /role="dialog" aria-modal="true" aria-labelledby="usAngoloHeading"/);
  assert.match(sheet, /<h2 id="usAngoloHeading">Il vostro angolo<\/h2>/);
  assert.match(sheet, /data-angolo-close aria-label="Chiudi Il vostro angolo"/);
  assert.match(sheet, /<div class="us-angolo-duo" data-us-duo="big"><\/div>/);
  assert.match(sheet, /<section id="usGiocaSintonia" class="us-gioca-sintonia" aria-label="Sintonia"><\/section>/);
  // Oggi: the two characters on the photo open it.
  assert.match(block('<main id="home"', '</main>'), /<button type="button" class="us-angolo-entry" data-us-angolo data-us-duo aria-label="Voi due: apri Il vostro angolo" hidden><\/button>/);
});

test('who opens it: the characters, the Sintonia links, a finished mission; Back closes it', () => {
  const p = read('personaggi.js');
  assert.match(p, /const entry = target\.closest\('\[data-us-angolo\]'\);\n      if \(entry\) \{ openAngolo\(entry\.dataset\.usAngolo \|\| ''\); return; \}/);
  assert.match(p, /w\.UsAngolo = Object\.freeze\(\{ open: openAngolo, close: closeAngolo \}\);/);
  // What the Sintonia tab loaded before.
  assert.match(p, /w\.hydrateBond\?\.\(\);\n    w\.hydrateResonanceHistory\?\.\(\);\n    w\.USProgression\?\.hydrate\?\.\(\{ showUnlocks: true, force: true \}\);/);
  const noi = read('noi-v2.js');
  assert.match(noi, /openSintonia:\(\)=>window\.UsAngolo\?\.open\?\.\(\),/);
  assert.doesNotMatch(noi, /setTab\(|giocaTab/);
  const progression = read('progression.js');
  assert.match(progression, /return Boolean\(panel && \$\('usAngolo'\)\?\.classList\?\.contains\('open'\) && !document\.hidden\);/);
  assert.doesNotMatch(progression, /usGiocaTab/);
  assert.match(read('navigation.js'), /name:'angolo',\n    find:\(\)=>document\.getElementById\('usAngolo'\),/);
});

test('Sintonia keeps its look in the angolo: its rules moved with it', () => {
  for (const file of ['dc-gioca.css', 'noi-v2.css']) {
    const css = read(file);
    assert.doesNotMatch(css, /#quiz \.us-gioca-sintonia/, file);
    assert.match(css, /#usAngolo \.us-gioca-sintonia/, file);
  }
  const colori = read('colori.css');
  assert.match(colori, /#usAngolo\{--us-pg:var\(--us-noi\)\}/, 'the angolo is yours both: the colour of Noi');
  assert.match(read('struttura.css'), /#usAngolo \.us-gioca-sintonia\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
});
