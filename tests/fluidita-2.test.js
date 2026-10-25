// Fluidità 2 (docs/missions/fluidita-2.md): every small shared action ends
// with a «fatto!»: the cue, a short pop and the sparks; with reduced motion
// only the cue. The five moments A–E use the one shared helper.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const app = read('app.js');
const en = read('i18n-en.js');

function fakeElement() {
  const appended = [];
  const anims = [];
  const doc = {
    body: { appendChild: (n) => appended.push(n) },
    createElement: () => ({ style: {}, setAttribute() {}, remove() {}, animate: (k, o) => { const a = { k, o }; anims.push(a); return a; } })
  };
  return {
    appended, anims,
    el: { ownerDocument: doc, getBoundingClientRect: () => ({ left: 10, top: 10, width: 40, height: 20 }), animate: (k, o) => { anims.push({ k, o, own: true }); } }
  };
}

test('done(): the cue, the pop and six sparks; enter(): one short arrival', () => {
  const F = require('../ui-foundation.js');
  const calls = [];
  globalThis.UsFeedback = { success: () => calls.push('success'), action: () => calls.push('action') };
  try {
    const { el, appended, anims } = fakeElement();
    assert.equal(F.done(el), true);
    assert.deepEqual(calls, ['success']);
    assert.equal(appended.length, 6, 'six sparks');
    assert.ok(anims.some((a) => a.own && a.o.duration === 260), 'the touched element pops');
    F.done(el, { feel: 'action', sparks: 3 });
    assert.deepEqual(calls, ['success', 'action']);
    assert.equal(F.done(null), false, 'no element: only the cue');
    assert.deepEqual(calls, ['success', 'action', 'success']);
    const arrived = fakeElement();
    assert.equal(F.enter(arrived.el), true);
    assert.equal(arrived.anims[0].o.duration, 320);
    assert.equal(F.enter(null), false);
  } finally { delete globalThis.UsFeedback; }
});

test('done() and enter(): reduced motion keeps only the cue', () => {
  const src = read('ui-foundation.js');
  const body = src.slice(src.indexOf('function done('), src.indexOf('  return {\n    install,'));
  assert.match(body, /scope\.UsFeedback\?\.\[feel\]\?\.\(\);\n    const d = element\?\.ownerDocument;\n    if \(!element\?\.getBoundingClientRect \|\| !d\?\.body \|\| activeMotion\.isReducedMotion\(\)\) return false;/, 'the cue first, then nothing moves with reduced motion');
  assert.match(body, /function enter\(element\) \{\n    if \(!element \|\| typeof element\.animate !== 'function' \|\| activeMotion\.isReducedMotion\(\)\) return false;/);
  assert.match(read('dc-gioca.css'), /\.us-spark\{position:fixed;[^}]*pointer-events:none\}/, 'the sparks never take a tap');
});

test('A: the answer sent has its cue, and a human error', () => {
  assert.match(app, /if\(theyAnswered&&window\.UsUiFoundation\?\.done\)window\.UsUiFoundation\.done\(btn\);else window\.UsFeedback\?\.success\?\.\(\);/);
  assert.doesNotMatch(app, /Errore sync Today/);
  assert.match(app, /window\.UsFeedback\?\.error\?\.\(\);return toast\('Non riesco a inviare la risposta\. Riprova\.'\);/);
  assert.ok(en.includes("'Non riesco a inviare la risposta. Riprova.': "));
  assert.ok(!en.includes("'Errore sync Today'"));
});

test('B: a reaction answers the tap (Ti penso and the daily answers)', () => {
  assert.match(app, /window\.UsUiFoundation\?\.done\?\.\(document\.querySelector\(`\[data-think-reaction="\$\{usThinkReactionFinal\}"\]`\),\{feel:'action'\}\);/);
  assert.match(app, /if\(next\)window\.UsUiFoundation\?\.done\?\.\(document\.querySelector\(`#todayReveal \[data-daily-reaction="\$\{next\}"\]`\),\{feel:'action'\}\);/, 'not when the reaction is taken back');
});

test('C and D: kept in Ricordi gets the cue; a new memory keeps its own arrival', () => {
  assert.match(app, /if\(data\.status==='kept'\)\{window\.UsFeedback\?\.success\?\.\(\);toast\('Conservato nei Ricordi'/);
  assert.match(app, /return Boolean\(window\.UsUiFoundation\?\.playOnce\?\.\(card,'ricordi-new',1300\)\);/, 'M12A: the memory settles once');
  assert.match(app, /window\.UsFeedback\?\.success\?\.\(\);\n    resetMomentComposer\(\);/, 'and its cue');
});

test('E: a new idea arrives in its list once, with the cue', () => {
  assert.match(app, /window\.UsFeedback\?\.action\?\.\(\);\n    if\(row\?\.id\)window\.UsUiFoundation\?\.enter\?\.\(document\.querySelector\(`#noiIdeaList \[data-id="\$\{CSS\.escape\(String\(row\.id\)\)\}"\]`\)\);/);
});
