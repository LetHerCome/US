// Premi Sintonia V2, Fase 1, in the app (founder, 29/10/2026): «Prossimo
// sblocco» shows the next HEADLINE reward (or companion), with an estimate in
// days on the couple's own pace, and a Plus extra says it needs US Plus.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'progression.js'), 'utf8');
const slice = (from, to) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));

test('the estimate in days follows the couple\'s last 14 days, and says nothing without a pace', () => {
  const box = {};
  vm.runInNewContext(slice('function daysEstimate(', '// One tile of the collection') + ';this.f=daysEstimate;', box);
  assert.equal(box.f(280, { xp_last_14_days: 490 }), 'circa 8 giorni', '35 a day');
  assert.equal(box.f(20, { xp_last_14_days: 490 }), 'circa 1 giorno');
  assert.equal(box.f(280, { xp_last_14_days: 0 }), '');
  assert.equal(box.f(0, { xp_last_14_days: 490 }), '');
  assert.equal(box.f(99999, { xp_last_14_days: 14 }), '', 'beyond a year it is not an estimate any more');
});

test('Prossimo sblocco prefers the next headline reward, and adds the estimate', () => {
  const render = slice('function renderNext(', '// One tile of the collection');
  assert.match(render, /const headline=headlineReward\(next\);/);
  assert.match(render, /const estimate=daysEstimate\(/);
  assert.match(src, /function headlineReward\(next\)\{/);
});

test('a locked Plus extra says so on its tile', () => {
  const tile = slice('function tileMarkup(', 'function rewardTile(');
  assert.match(tile, /locked \? \(plus \? `Livello \$\{level\} · US Plus` : `Livello \$\{level\}`\)/);
  assert.match(slice('function rewardTile(', 'function defaultTile('), /plus: Boolean\(reward\.requires_plus\)/);
});
