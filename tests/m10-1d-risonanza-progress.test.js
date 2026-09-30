// M10.1D — the Risonanza bar is REAL progress: (Bond XP − floor of the current
// level) / XP of the current level, from the single existing authority
// bondLevelInfo(). No decorative percentage, no relationship-quality language.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const app = read('app.js');
const html = read('index.html');
const slice = (from, to) => { const a = app.indexOf(from); const b = app.indexOf(to, a); assert.ok(a >= 0 && b > a, `${from}…${to}`); return app.slice(a, b); };

// Independent oracle: level n needs 200 + (n-1)*150 XP, thresholds are cumulative.
const needed = (level) => 200 + (level - 1) * 150;
const floorOf = (level) => { let f = 0; for (let l = 1; l < level; l++) f += needed(l); return f; };

function fakeEl() { const attrs = {}; return { textContent: '', style: {}, dataset: {}, setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: (k) => attrs[k] ?? null, attrs }; }
function harness() {
  const ids = ['heroBondLevel', 'heroBondXp', 'bondFill', 'bondLevelValue', 'bondTotalXp', 'bondRankTitle', 'bondNextXp', 'bondPageFill', 'bondLevelXp', 'bondResonanceLevel', 'bondProgressTrack', 'noiHubResonanceTitle', 'noiHubResonanceMeta', 'noiHubResonanceFill', 'noiResonanceTotal'];
  const els = Object.fromEntries(ids.map((id) => [id, fakeEl()]));
  const window = {};
  const context = vm.createContext({ console, window, document: { getElementById: (id) => els[id] || null }, renderBondBadges() {}, escapeHtml: String });
  vm.runInContext(`${slice('function bondLevelInfo(totalXp=0){', 'function bondBadgeIcon(level){')}\n${slice('function renderBondProgress(totalXp){', 'async function hydrateBondSummary(){')}\nwindow.info=bondLevelInfo;window.render=renderBondProgress;`, context);
  return { window, els };
}

test('M10.1D: progress is measured inside the CURRENT level, never total / next threshold', () => {
  const { window } = harness();
  // Level 3 starts at 550 and needs 500 (next threshold 1050).
  const info = window.info(610);
  assert.equal(info.level, 3);
  assert.equal(info.current, 60);
  assert.equal(info.needed, 500);
  assert.equal(info.progress, (610 - 550) / 500 * 100);
  assert.notEqual(info.progress, 610 / 1050 * 100, 'not the naive total / next-threshold ratio');
  assert.equal(window.info(1035).progress, (1035 - 550) / 500 * 100);
});

test('M10.1D: the level lower bound and the next threshold are respected for every XP value', () => {
  const { window } = harness();
  for (let xp = 0; xp <= 6000; xp += 7) {
    const i = window.info(xp);
    const lo = floorOf(i.level); const hi = lo + needed(i.level);
    assert.ok(xp >= lo && xp < hi, `xp ${xp} sits inside level ${i.level} [${lo}, ${hi})`);
    assert.equal(i.current, xp - lo);
    assert.equal(i.needed, needed(i.level));
    assert.ok(Math.abs(i.progress - ((xp - lo) / needed(i.level)) * 100) < 1e-9);
    assert.ok(i.progress >= 0 && i.progress < 100, 'a level is never displayed as full');
  }
});

test('M10.1D: crossing a threshold advances the level and restarts the bar in the new range', () => {
  const { window } = harness();
  const before = window.info(549); const at = window.info(550);
  assert.equal(before.level, 2);
  assert.ok(before.progress > 99);
  assert.equal(at.level, 3);
  assert.equal(at.current, 0);
  assert.equal(at.progress, 0);
  assert.equal(window.info(200).level, 2);
  assert.equal(window.info(199).level, 1);
  assert.equal(window.info(1050).level, 4);
  assert.equal(window.info(-5).progress, 0, 'negative/invalid XP never yields a bar');
  assert.equal(window.info('abc').level, 1);
});

test('M10.1D: the rendered bar, labels and progressbar semantics all come from the same numbers', () => {
  const { window, els } = harness();
  window.render(610);
  assert.equal(els.bondPageFill.style.width, '12%');
  assert.equal(els.noiHubResonanceFill.style.width, '12%', 'hub and Risonanza never disagree');
  assert.equal(els.bondResonanceLevel.textContent, 'Livello 3');
  assert.equal(els.bondNextXp.textContent, '440 XP al prossimo livello');
  assert.deepEqual(['aria-valuenow', 'aria-valuemax', 'aria-valuetext'].map((a) => els.bondProgressTrack.getAttribute(a)), ['60', '500', '60 di 500 XP nel livello 3']);
  assert.equal(els.noiResonanceTotal.textContent, '610');
  // XP grows → the bar advances; crossing the threshold → new level range.
  window.render(800);
  assert.equal(els.bondPageFill.style.width, `${(800 - 550) / 500 * 100}%`);
  assert.ok(parseFloat(els.bondPageFill.style.width) > 12);
  window.render(1049);
  assert.equal(els.bondNextXp.textContent, '1 XP al prossimo livello');
  window.render(1050);
  assert.equal(els.bondResonanceLevel.textContent, 'Livello 4');
  assert.equal(els.bondPageFill.style.width, '0%');
  assert.equal(els.bondNextXp.textContent, '650 XP al prossimo livello');
  assert.equal(els.bondProgressTrack.getAttribute('aria-valuemax'), '650');
  assert.equal(window.usBondXp, 1050);
});

test('M10.1D: no static or fake percentage — width is only ever written from bondLevelInfo', () => {
  assert.match(html, /<div id="bondPageFill"><\/div>/, 'no inline width in the markup');
  assert.doesNotMatch(html, /id="(?:bondPageFill|noiHubResonanceFill|bondFill)"[^>]*style=/);
  const widthWrites = app.match(/(?:pageFill|hubFill|heroFill)\.style\.width=`[^`]*`/g) || [];
  assert.equal(widthWrites.length, 3);
  for (const w of widthWrites) assert.match(w, /\$\{info\.progress\}%/);
  assert.equal((app.match(/function bondLevelInfo\(/g) || []).length, 1, 'a single XP formula');
  assert.doesNotMatch(app, /bondPageFill'\)[^;]*\.style\.width='?\d/);
});

test('M10.1D: the Risonanza card is level, bar and XP to the next level — no redundant numbers', () => {
  const card = html.match(/<article class="noi-resonance"[\s\S]*?<\/article>/)[0];
  const visible = card.replace(/<div class="noi-resonance-legacy"[\s\S]*?<\/div>\s*(?=<\/article>)/, '');
  assert.match(visible, /id="bondResonanceLevel"/);
  assert.match(visible, /id="bondProgressTrack" role="progressbar"/);
  assert.match(visible, /<span id="bondNextXp">/);
  assert.equal((html.match(/id="bondNextXp"/g) || []).length, 1, 'one element per id');
  assert.doesNotMatch(visible, /id="bondTotalXp"|id="bondLevelXp"/, 'the legacy counters are not shown');
  assert.doesNotMatch(html, /id="noiResonanceLevel"|id="noiResonanceNext"/, 'the guide no longer repeats level and next-level numbers');
});

test('M10.1D: Risonanza is progress accumulated inside US — never relationship quality', () => {
  const card = html.match(/<article class="noi-resonance"[\s\S]*?<\/article>/)[0] + html.match(/<section class="noi-resonance-guide"[\s\S]*?<\/section>/)[0];
  const ui = card + slice('function renderBondProgress(totalXp){', 'async function hydrateBondSummary(){') + read('fix4.js').match(/window\.bondRankTitle = [\s\S]*?\};/)[0];
  assert.doesNotMatch(ui, /qualit[àa]|compatibilit|salute della|health|punteggio|score|valut|affiatamento|percentuale di/i);
});
