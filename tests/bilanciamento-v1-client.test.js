// Il grande bilanciamento v1 (founder, 28/11/2026): the app keeps the one
// curve of the server (the table of 20261128104932_bilanciamento_v1) in
// app.js, the widget Edge Function and the wardrobe; settings and the level
// moment read it; the Plus icons are never "the next unlock"; Play Us shows
// the points it really gave.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const STARTS = [0, 150, 300, 475, 675, 875, 1100, 1350, 1625, 1975, 2375, 2800, 3250, 3750, 4275, 4825, 5425, 6050, 6700, 7400, 8125, 8875, 9675, 12075, 15475, 20075];
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
const ctx = {};
vm.createContext(ctx);
vm.runInContext(`${fn(read('app.js'), 'bondLevelStart')}\n${fn(read('app.js'), 'bondLevelInfo')}\nthis.bondLevelStart = bondLevelStart; this.bondLevelInfo = bondLevelInfo;`, ctx);

test('app.js: the levels start at the table of the server, then +5000', () => {
  const sql = read('supabase/migrations/20261128104932_bilanciamento_v1.sql');
  assert.ok(sql.includes(`'{${STARTS.join(',')}}'::integer[]`), 'the same table as private.progression_level_start');
  for (let level = 1; level <= 26; level += 1) {
    assert.equal(ctx.bondLevelStart(level), STARTS[level - 1]);
    if (level > 1) {
      assert.equal(ctx.bondLevelInfo(STARTS[level - 1]).level, level, `level ${level}`);
      assert.equal(ctx.bondLevelInfo(STARTS[level - 1] - 1).level, level - 1, `not before ${STARTS[level - 1]}`);
    }
  }
  assert.equal(ctx.bondLevelStart(27), 25075);
  assert.deepEqual({ ...ctx.bondLevelInfo(1700) }, { total: 1700, level: 9, current: 75, needed: 350, progress: (75 / 350) * 100 });
  assert.equal(ctx.bondLevelInfo(30075).level, 28);
  assert.equal(ctx.bondLevelInfo(0).needed, 150);
});

test('the widget and settings use the same curve; no copy of the old formula is left', () => {
  const widget = read('supabase/functions/us-widget-state/index.ts');
  assert.ok(widget.includes(`const BOND_LEVEL_STARTS = [${STARTS.join(', ')}];`));
  assert.match(read('settings.js'), /return typeof window\.bondLevelInfo==='function'\?window\.bondLevelInfo\(totalXp\)\.level:1;/);
  for (const f of ['app.js', 'settings.js', 'progression.js', 'personaggi.js', 'supabase/functions/us-widget-state/index.ts']) {
    assert.doesNotMatch(read(f), /\(level-1\)\*150|\(level - 1\) \* 150|75 \* \(n - 1\)/, `${f} still has the old curve`);
  }
});

test('the wardrobe is on the ladder, the same levels as the server', () => {
  const P = require('../personaggi.js');
  const levels = { occhiali: 2, cappello: 4, fiocco: 7, sciarpina: 9, sole: 12, gala: 14, cuffie: 17, coroncina: 20, corona: 25 };
  assert.deepEqual({ ...P.LOOK_LEVELS }, levels);
  assert.equal(P.LOOK_POINTS, undefined);
  const sql = read('supabase/migrations/20261128104932_bilanciamento_v1.sql');
  for (const [item, level] of Object.entries(levels)) assert.ok(sql.includes(`('${item}', ${level})`), `${item} at ${level} as on the server`);
  const moment = { window: { UsPersonaggi: P } };
  vm.createContext(moment);
  vm.runInContext(`${fn(read('progression.js'), 'looksStartingLevels')}\nthis.looksStartingLevels = looksStartingLevels;`, moment);
  assert.deepEqual([...moment.looksStartingLevels(1, 2)], ['Occhiali']);
  assert.deepEqual([...moment.looksStartingLevels(3, 9)], ['Cappello', 'Fiocco', 'Sciarpina']);
  assert.deepEqual([...moment.looksStartingLevels(25, 26)], []);
});

test('US Plus extras are never the next unlock; a Plus-only tile says «Con US Plus»', () => {
  const js = read('progression.js');
  assert.match(fn(js, 'nextPresentedRewards'), /!reward\.unlocked && !reward\.requires_plus && presented\(reward\)/);
  assert.match(js, /const plusOnly = plus && !\(Number\(level\) > 1\);\n  const status = on \? 'In uso' : locked \? \(plusOnly \? 'Con US Plus'/);
  assert.match(read('i18n-en.js'), /'Con US Plus': 'With US Plus',/);
});

test('Play Us shows the points it gave, nothing when it gave none', () => {
  const js = read('play-us.js');
  assert.doesNotMatch(js, /r\.xp \|\| 30/);
  assert.match(js, /Number\(r\.xp\) > 0 \? `<p class="us-play-center-line"><b>\+\$\{Number\(r\.xp\)\}<\/b> punti per il vostro livello/);
});
