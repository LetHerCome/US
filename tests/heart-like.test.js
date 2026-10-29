// Il cuore (founder, 29/10/2026): the heart on the partner's answer in Oggi and
// the heart that answers a Ti penso play one animation: the heart goes, a disc
// opens into a ring from rosa to lilla, seven pairs of dots fly out, the heart
// springs back. Every third heart of a person is the big one: wider, with
// fireworks that rise and fall. Taking a heart back plays nothing; with
// reduced motion only the cue stays.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

function fakeButton() {
  const anims = [];
  const appended = [];
  const node = () => {
    const n = { style: {}, children: [], className: '', setAttribute() {}, remove() { n.removed = true; } };
    n.appendChild = (c) => { n.children.push(c); return c; };
    n.animate = (k, o) => { const a = { k, o, el: n }; anims.push(a); return a; };
    return n;
  };
  const doc = { body: { appendChild: (n) => appended.push(n) }, createElement: node };
  const glyph = node();
  glyph.getBoundingClientRect = () => ({ left: 100, top: 200, width: 20, height: 20 });
  const button = node();
  button.ownerDocument = doc;
  button.getBoundingClientRect = () => ({ left: 90, top: 190, width: 40, height: 40 });
  button.querySelector = () => glyph;
  return { button, glyph, anims, appended };
}
const pieces = (layer, kind) => layer.children.filter((c) => c.className === kind);

test('a heart: the cue, the heart springs back, the bloom and seven pairs of dots', () => {
  const F = require('../ui-foundation.js');
  const calls = [];
  globalThis.UsFeedback = { action: () => calls.push('action'), success: () => calls.push('success') };
  try {
    const { button, glyph, anims, appended } = fakeButton();
    assert.equal(F.heart(button), true);
    assert.deepEqual(calls, ['action']);
    assert.equal(appended.length, 1, 'one layer over the page');
    const layer = appended[0];
    assert.equal(layer.className, 'us-heart-fx');
    assert.equal(layer.style.left, '110px', 'centred on the heart');
    assert.equal(layer.style.top, '210px');
    assert.equal(pieces(layer, 'us-heart-bloom').length, 1);
    assert.equal(pieces(layer, 'us-heart-dot').length, 14);
    assert.equal(pieces(layer, 'us-heart-spark').length, 0, 'no fireworks');
    const pop = anims.find((a) => a.el === glyph);
    assert.equal(pop.o.duration, 760);
    assert.equal(pop.k[0].scale, 0, 'the heart is gone while the bloom opens');
  } finally { delete globalThis.UsFeedback; }
});

test('the big one: a stronger cue, a wider bloom and the fireworks', () => {
  const F = require('../ui-foundation.js');
  const calls = [];
  globalThis.UsFeedback = { action: () => calls.push('action'), success: () => calls.push('success') };
  try {
    const small = fakeButton();
    F.heart(small.button);
    const big = fakeButton();
    assert.equal(F.heart(big.button, { big: true }), true);
    assert.deepEqual(calls, ['action', 'success']);
    const layer = big.appended[0];
    assert.ok(pieces(layer, 'us-heart-spark').length >= 16, 'fireworks');
    const width = (l) => parseFloat(pieces(l, 'us-heart-bloom')[0].style.width);
    assert.ok(width(layer) > width(small.appended[0]), 'wider');
    assert.ok(big.anims.find((a) => a.el === big.glyph).o.duration > 760);
  } finally { delete globalThis.UsFeedback; }
});

test('every third heart of a person is the big one', () => {
  const F = require('../ui-foundation.js');
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
  const turns = Array.from({ length: 7 }, () => F.heartTurn('f', storage).big);
  assert.deepEqual(turns, [false, false, true, false, false, true, false]);
  assert.equal(F.heartTurn('b', storage).big, false, 'each person counts their own');
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(F.heartTurn('f', broken).big, false, 'without storage it is the usual heart');
});

test('reduced motion: only the cue; nothing without an element', () => {
  const src = read('ui-foundation.js');
  const body = src.slice(src.indexOf('function heart('), src.indexOf('  return {\n    install,'));
  assert.match(body, /scope\.UsFeedback\?\.\[big \? 'success' : 'action'\]\?\.\(\);\n    const d = element\?\.ownerDocument;\n    if \(!element\?\.getBoundingClientRect \|\| !d\?\.body \|\| activeMotion\.isReducedMotion\(\)\) return false;/);
  assert.match(read('ui-foundation.css'), /\.us-heart-fx\{position:fixed;[^}]*pointer-events:none\}/, 'the layer never takes a tap');
});

test('wired: Oggi and Ti penso play it when a heart is given, never when taken back', () => {
  const app = read('app.js');
  assert.match(app, /function usHeartLike\(button\)\{const turn=window\.UsUiFoundation\?\.heartTurn\?\.\(window\.usProfile\?\.id\);window\.UsUiFoundation\?\.heart\?\.\(button,\{big:Boolean\(turn\?\.big\)\}\);\}/);
  // Oggi: at the tap (the reaction is shown at once), on the button just drawn.
  assert.match(app, /window\.todayRevealMeta=\{\.\.\.meta,my_reaction:next\};renderTodayReveal\(\);\n  if\(next==='heart'\)usHeartLike\(document\.querySelector\('#todayReveal \[data-daily-reaction="heart"\]'\)\);/);
  assert.match(app, /if\(next&&next!=='heart'\)window\.UsUiFoundation\?\.done\?\.\(/, 'the heart has its own animation');
  // The reply from the server draws the same thing: the button stays, the animation goes on.
  assert.match(app, /if\(usTodayRevealDrawn===html&&reveal\.firstElementChild\)return;usTodayRevealDrawn=html;reveal\.innerHTML=html;/);
  // Ti penso: the heart plays at the tap; the other reactions keep their «fatto!».
  assert.match(app, /if\(reaction==='heart'\)usHeartLike\(document\.querySelector\('#thinkArrival \[data-think-reaction="heart"\]'\)\);/);
  assert.match(app, /if\(usThinkReactionFinal!=='heart'\)window\.UsUiFoundation\?\.done\?\.\(/);
});

test('the Ti penso at the top left plays the same heart when it is sent, not when it was already sent', () => {
  const app = read('app.js');
  const send = app.slice(app.indexOf('async function sendThinkSignal('), app.indexOf('window.sendThinkSignal=sendThinkSignal;'));
  assert.match(send, /if\(btn&&!result\?\.duplicate\)usHeartLike\(btn\);else window\.UsFeedback\?\.action\?\.\(\);/);
  assert.doesNotMatch(app, /thinkSparks/, 'the two old sparks are gone');
  assert.match(read('ui-foundation.js'), /element\.querySelector\?\.\('\.us-icon, \.think-reaction-glyph, \.us-shell-icon'\)/, 'its heart is the one that springs back');
});
