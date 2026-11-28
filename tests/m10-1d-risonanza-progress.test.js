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

// Independent oracle: where each level starts (the table of il grande
// bilanciamento, 28/11/2026; after 26, +5000 a level).
const STARTS = [0, 150, 300, 475, 675, 875, 1100, 1350, 1625, 1975, 2375, 2800, 3250, 3750, 4275, 4825, 5425, 6050, 6700, 7400, 8125, 8875, 9675, 12075, 15475, 20075];
const floorOf = (level) => (level <= STARTS.length ? STARTS[level - 1] : STARTS[STARTS.length - 1] + (level - STARTS.length) * 5000);
const needed = (level) => floorOf(level + 1) - floorOf(level);

function fakeEl() { const attrs = {}; return { textContent: '', style: {}, dataset: {}, setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: (k) => attrs[k] ?? null, attrs }; }
function harness() {
  const ids = ['bondLevelValue', 'bondTotalXp', 'bondRankTitle', 'bondNextXp', 'bondPageFill', 'bondLevelXp', 'bondResonanceLevel', 'bondProgressTrack', 'noiHubResonanceTitle', 'noiHubResonanceMeta', 'noiHubResonanceFill', 'noiResonanceTotal'];
  const els = Object.fromEntries(ids.map((id) => [id, fakeEl()]));
  const window = {};
  const context = vm.createContext({ console, window, document: { getElementById: (id) => els[id] || null }, renderBondBadges() {}, escapeHtml: String });
  vm.runInContext(`${slice('function bondLevelStart(level){', 'function bondBadgeIcon(level){')}\n${slice('function renderBondProgress(totalXp){', 'async function hydrateBondSummary(){')}\nwindow.info=bondLevelInfo;window.render=renderBondProgress;`, context);
  return { window, els };
}

test('M10.1D: progress is measured inside the CURRENT level, never total / next threshold', () => {
  const { window } = harness();
  // Level 4 starts at 475 and needs 200 (next threshold 675).
  const info = window.info(610);
  assert.equal(info.level, 4);
  assert.equal(info.current, 135);
  assert.equal(info.needed, 200);
  assert.equal(info.progress, (610 - 475) / 200 * 100);
  assert.notEqual(info.progress, 610 / 675 * 100, 'not the naive total / next-threshold ratio');
  assert.equal(window.info(660).progress, (660 - 475) / 200 * 100);
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
  const before = window.info(474); const at = window.info(475);
  assert.equal(before.level, 3);
  assert.ok(before.progress > 99);
  assert.equal(at.level, 4);
  assert.equal(at.current, 0);
  assert.equal(at.progress, 0);
  assert.equal(window.info(150).level, 2);
  assert.equal(window.info(149).level, 1);
  assert.equal(window.info(675).level, 5);
  assert.equal(window.info(20075).level, 26);
  assert.equal(window.info(25075).level, 27);
  assert.equal(window.info(-5).progress, 0, 'negative/invalid XP never yields a bar');
  assert.equal(window.info('abc').level, 1);
});

test('M10.1D: the rendered bar, labels and progressbar semantics all come from the same numbers', () => {
  const { window, els } = harness();
  window.render(610);
  assert.equal(els.bondPageFill.style.width, '67.5%');
  assert.equal(els.noiHubResonanceFill.style.width, '67.5%', 'hub and Risonanza never disagree');
  assert.equal(els.bondResonanceLevel.textContent, 'Livello 4');
  // Round 3 (mockup parity): under the bar, the points inside the level and the points to the next one.
  assert.equal(els.bondLevelXp.textContent, '135 / 200 punti');
  assert.equal(els.bondNextXp.textContent, '65 punti al livello 5');
  assert.deepEqual(['aria-valuenow', 'aria-valuemax', 'aria-valuetext'].map((a) => els.bondProgressTrack.getAttribute(a)), ['135', '200', '135 di 200 punti nel livello 4']);
  assert.equal(els.noiResonanceTotal.textContent, '610');
  // XP grows → the bar advances; crossing the threshold → new level range.
  window.render(650);
  assert.equal(els.bondPageFill.style.width, `${(650 - 475) / 200 * 100}%`);
  assert.ok(parseFloat(els.bondPageFill.style.width) > 67.5);
  window.render(674);
  assert.equal(els.bondNextXp.textContent, '1 punto al livello 5');
  window.render(675);
  assert.equal(els.bondResonanceLevel.textContent, 'Livello 5');
  assert.equal(els.bondPageFill.style.width, '0%');
  assert.equal(els.bondNextXp.textContent, '200 punti al livello 6');
  assert.equal(els.bondProgressTrack.getAttribute('aria-valuemax'), '200');
  assert.equal(window.usBondXp, 675);
});

test('M10.1D: no static or fake percentage — width is only ever written from bondLevelInfo', () => {
  assert.match(html, /<div id="bondPageFill"><\/div>/, 'no inline width in the markup');
  assert.doesNotMatch(html, /id="(?:bondPageFill|noiHubResonanceFill|bondFill)"[^>]*style=/);
  // 27/11/2026: the hero bar (#bondFill) left the page long ago; its write went with the dead code.
  const widthWrites = app.match(/(?:pageFill|hubFill|heroFill)\.style\.width=`[^`]*`/g) || [];
  assert.equal(widthWrites.length, 2);
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
  // Round 3 (mockup parity): "760 / 800 XP" is shown under the bar; the total stays a legacy counter.
  assert.match(visible, /<span id="bondLevelXp">/);
  assert.doesNotMatch(visible, /id="bondTotalXp"/, 'the legacy total is not shown');
  assert.doesNotMatch(html, /id="noiResonanceLevel"|id="noiResonanceNext"/, 'the guide no longer repeats level and next-level numbers');
});

test('M10.1D: Risonanza is progress accumulated inside US — never relationship quality', () => {
  // Round 3 (mockup parity): "Come cresce la Sintonia" is the mockup's fold under the collection.
  const card = html.match(/<article class="noi-resonance"[\s\S]*?<\/article>/)[0];
  const guide = html.match(/<section class="noi-resonance-guide"[\s\S]*?<\/section>/)[0];
  const ui = card + guide + slice('function renderBondProgress(totalXp){', 'async function hydrateBondSummary(){') + read('fix4.js').match(/window\.bondRankTitle = [\s\S]*?\};/)[0];
  assert.doesNotMatch(ui, /qualit[àa]|compatibilit|salute della|health|punteggio|score|valut|affiatamento|percentuale di/i);
});
