// Personaggi: the wardrobe on the levels of the Sintonia (founder, 24/11/2026,
// «proposta A»; since il grande bilanciamento, 28/11/2026, every accessory has
// its own level of the one ladder): the client levels are the server's, and
// the level moment names them. The Simbolo US stays.
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
vm.runInContext(`${fn(read('progression.js'), 'looksStartingLevels')}\nthis.looksStartingLevels = looksStartingLevels;`, ctx);

test('the client levels are the ones of the server (20261128104932_bilanciamento_v1)', () => {
  assert.deepEqual({ ...P.LOOK_LEVELS }, { occhiali: 2, cappello: 4, fiocco: 7, sciarpina: 9, sole: 12, gala: 14, cuffie: 17, coroncina: 20, corona: 25 });
  const sql = read('supabase/migrations/20261128104932_bilanciamento_v1.sql');
  for (const [item, level] of Object.entries(P.LOOK_LEVELS)) assert.ok(sql.includes(`('${item}', ${level})`), `${item} ${level} as on the server`);
});

test('the level moment names the accessories of the levels just reached, and takes you to try them', () => {
  assert.deepEqual([...ctx.looksStartingLevels(13, 14)], ['Gala']);
  assert.deepEqual([...ctx.looksStartingLevels(16, 17)], ['Cuffie']);
  assert.deepEqual([...ctx.looksStartingLevels(11, 20)], ['Occhiali da sole', 'Gala', 'Cuffie', 'Coroncina']);
  assert.deepEqual([...ctx.looksStartingLevels(2, 3)], [], 'level 3 is the Battito of the Simbolo, no accessory');
  assert.deepEqual([...ctx.looksStartingLevels(24, 25)], ['Corona']);
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
