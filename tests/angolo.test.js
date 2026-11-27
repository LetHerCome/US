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
  // Fase 6 (D11): no week strip either; the empty painter is gone too (27/11/2026).
  assert.doesNotMatch(app, /paintDailyInGioca/);
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
  assert.match(sheet, /<section id="usGiocaSintonia" class="us-gioca-sintonia" aria-label="Sintonia">/);
  // Tavola «US · Oggi e il vostro angolo» (25/11/2026): the level, then Voi · Guardaroba · Premi.
  assert.match(sheet, /<div class="us-angolo-livello" data-angolo-slot="livello"><\/div>/);
  assert.match(sheet, /role="tablist" aria-label="Il vostro angolo"/);
  for (const [tab, panel] of [['Voi', 'usAngoloVoi'], ['Look', 'usAngoloLook'], ['Premi', 'usAngoloPremi']]) {
    assert.match(sheet, new RegExp(`role="tab" id="usAngoloTab${tab}" aria-selected="(true|false)" aria-controls="${panel}"`), tab);
    assert.match(sheet, new RegExp(`id="${panel}" role="tabpanel" aria-labelledby="usAngoloTab${tab}"`), panel);
  }
  for (const go of ['daily', 'games', 'memory', 'ideas']) assert.match(sheet, new RegExp(`id="usAngoloCresci"[\\s\\S]*data-sintonia-go="${go}"`), go);
  // Oggi: no characters on the photo any more (founder: they cover it); the island at the top opens it.
  assert.doesNotMatch(block('<main id="home"', '</main>'), /us-angolo-entry/);
  assert.match(read('index.html'), /<div class="us-top-brand" role="img" aria-label="US">[^\n]*?<\/div><button type="button" class="us-isola" id="usIsola" aria-expanded="false" aria-label="US: tocca per Il vostro angolo" data-us-isola hidden>/);
});

test('who opens it: the characters, the Sintonia links, a finished mission; Back closes it', () => {
  const p = read('personaggi.js');
  assert.match(p, /const entry = target\.closest\('\[data-us-angolo\]'\);\n      if \(entry\) \{ openAngolo\(entry\.dataset\.usAngolo \|\| ''\); return; \}/);
  assert.match(p, /w\.UsAngolo = Object\.freeze\(\{ open: openAngolo, close: closeAngolo, tab: showTab, isola: setIsola, parla \}\);/);
  // L'isola (25/11/2026): first tap opens it, second opens the angolo; by itself the first time and at a new level.
  // Only the island's button: the open bar carries data-us-isola too, and a tap on the envelope or the bubble is not a tap on the island.
  assert.match(p, /if \(target\.closest\('button\[data-us-isola\]'\)\) \{ tapIsola\(\); return; \}/);
  assert.match(p, /if \(isola\(\)\?\.getAttribute\('aria-expanded'\) === 'true'\) \{ setIsola\(false\); openAngolo\(\); \}/);
  // US vi ricorda (25/11/2026, D19): the first time is the characters' introduction (us-ricorda.js);
  // a new level is said in the bubble, with the party.
  assert.match(p, /if \(!seen\) \{ writeSeen\(level\); if \(!w\.UsRicorda\) setIsola\(true, \{ ms: PEEK_MS, reaction: 'cuore' \}\); return; \}/);
  assert.match(p, /if \(level > \(Number\(seen\.level\) \|\| 0\)\) \{\s*writeSeen\(level\);[\s\S]{0,200}parla\(\{ text: rank \? `Siete al livello \$\{level\}: \$\{rank\}!`/);
  assert.match(p, /showTab\(place === 'look' \? 'look' : 'voi', \{ focus: false \}\);/, 'Cambia look opens the Guardaroba');
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
