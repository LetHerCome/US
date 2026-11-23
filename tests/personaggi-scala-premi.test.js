// Personaggi: the wardrobe on the empty levels of the Sintonia (founder,
// 24/11/2026, «proposta A»): the client thresholds are the server's, the last
// four start a level, and the level moment names them. The Simbolo US stays.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const P = require('../personaggi.js');
const fn = (source, name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} missing`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} not closed`);
};
const ctx = { window: { UsPersonaggi: P } };
vm.createContext(ctx);
vm.runInContext(`${fn(read('app.js'), 'bondLevelInfo')}\n${fn(read('progression.js'), 'looksStartingLevels')}\nthis.bondLevelInfo = bondLevelInfo; this.looksStartingLevels = looksStartingLevels;`, ctx);

test('the client thresholds are the ones of the new migration', () => {
  assert.deepEqual({ ...P.LOOK_POINTS }, { occhiali: 150, cappello: 400, fiocco: 700, sciarpina: 1000, sole: 1350, gala: 4550, cuffie: 8750, coroncina: 14300, corona: 26550 });
  const sql = read('supabase/migrations/20261123231417_personaggi_scala_premi.sql');
  for (const [item, points] of Object.entries(P.LOOK_POINTS)) assert.ok(sql.includes(`('${item}', ${points})`), `${item} ${points} as on the server`);
});

test('gala, cuffie, coroncina and corona start levels 8, 11, 14 and 19 (bondLevelInfo)', () => {
  for (const [item, level] of [['gala', 8], ['cuffie', 11], ['coroncina', 14], ['corona', 19]]) {
    assert.equal(ctx.bondLevelInfo(P.LOOK_POINTS[item]).level, level, `${item} at level ${level}`);
    assert.equal(ctx.bondLevelInfo(P.LOOK_POINTS[item] - 1).level, level - 1, `${item} not before`);
  }
});

test('the level moment names the accessory that starts the level, and takes you to try it', () => {
  assert.deepEqual([...ctx.looksStartingLevels(7, 8)], ['Gala']);
  assert.deepEqual([...ctx.looksStartingLevels(10, 11)], ['Cuffie']);
  assert.deepEqual([...ctx.looksStartingLevels(7, 14)], ['Gala', 'Cuffie', 'Coroncina']);
  assert.deepEqual([...ctx.looksStartingLevels(1, 7)], [], 'the first five come between levels, not with one');
  assert.deepEqual([...ctx.looksStartingLevels(18, 19)], ['Corona']);
  const js = read('progression.js');
  assert.match(js, /const action = unlocks\.length === 1 \? 'Scoprilo' : unlocks\.length > 1 \? 'Scoprili' : looks\.length \? 'Prova il look' : 'Chiudi';/);
  assert.match(js, /<span class="us-level-moment-chip us-level-moment-look"><i><\/i>\$\{esc\(lookChip\)\}<\/span>/);
  assert.match(js, /else if \(look\) window\.UsAngolo\?\.open\?\.\('look'\);/);
  assert.match(read('i18n-en.js'), /'\{name\} nel guardaroba': '\{name\} in the wardrobe',\n    'Prova il look': 'Try the look',/);
});

test('the Simbolo US stays among the Sintonia rewards (founder, 24/11/2026)', () => {
  const js = read('progression.js');
  assert.match(js, /\n  effect: \{ pref: 'effect_reward_id', label: 'Simbolo US',/);
  assert.match(read('index.html'), /<div class="us-top-brand" role="img" aria-label="US">/);
});
