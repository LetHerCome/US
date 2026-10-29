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

const look = fs.readFileSync(path.join(__dirname, '..', 'oggi-look.js'), 'utf8');
const lookCss = fs.readFileSync(path.join(__dirname, '..', 'oggi-look.css'), 'utf8');

test('Aurora: the Plus extra of level 4, an effect of Oggi like the others', () => {
  assert.match(look, /\{ id: 'aurora', name: 'Aurora', note: '[^']+', reward: 'oggi_effect_aurora', level: 4, count: \d+ \}/);
  assert.match(look, /aurora: \{ s: \[/);
  assert.match(lookCss, /\.us-oggi-fx\[data-fx="aurora"\]>i\{/);
  assert.match(lookCss, /@keyframes us-fx-aurora\{/);
});

test('a locked Plus look says US Plus, in the chip and on the button', () => {
  assert.match(look, /return \{ state: 'locked', level: Number\(reward\.level_required\) \|\| look\.level \|\| 0, plus: Boolean\(reward\.requires_plus\) \};/);
  assert.match(look, /Livello \$\{s\.level\}\$\{s\.plus \? ' · US Plus' : ''\}/);
  assert.match(look, /Si sblocca al livello \$\{s\.level\} di Sintonia\$\{s\.plus \? ' con US Plus' : ''\}/);
});

test('Tema delle stagioni: one theme that follows the season in Rome', () => {
  const box = {};
  vm.runInNewContext(look.slice(look.indexOf('function seasonFor('), look.indexOf('// ---------- particles')) + ';this.f=seasonFor;', box);
  assert.deepEqual(['2026-03-01', '2026-05-31', '2026-06-01', '2026-08-31', '2026-09-01', '2026-11-30', '2026-12-01', '2027-02-28'].map((d) => box.f(d)),
    ['spring', 'spring', 'summer', 'summer', 'autumn', 'autumn', 'winter', 'winter']);
  assert.match(look, /\{ id: 'seasonal', name: 'Stagioni', kicker: 'Stagioni', note: '[^']+', reward: 'oggi_theme_seasonal', level: 10 \}/);
  assert.match(look, /if \(theme === 'seasonal'\) root\.dataset\.usOggiSeason = seasonFor\(\); else delete root\.dataset\.usOggiSeason;/);
  assert.match(look, /data-oggi-season="\$\{esc\(seasonFor\(\)\)\}"/, 'the preview shows this season too');
  for (const season of ['spring', 'summer', 'winter']) {
    assert.ok(lookCss.includes(`html[data-us-oggi-theme="seasonal"][data-us-oggi-season="${season}"],\n.us-look-phone[data-oggi-theme="seasonal"][data-oggi-season="${season}"]{`), season);
  }
});
