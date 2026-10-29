// Ti penso animato (Premi Sintonia V2, livello 5, 29/10/2026): when a Ti
// penso arrives, hearts in the couple's two colours burst up the screen. A
// Sintonia reward like the others: in the collection, «Classico» is free and
// «Cuori» is unlocked at level 5; this phone's choice is how it receives.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

function fakeDoc() {
  const appended = [];
  const anims = [];
  const doc = {
    body: { appendChild: (n) => appended.push(n) },
    documentElement: { clientWidth: 400, clientHeight: 800 },
    createElement: () => ({ style: {}, className: '', setAttribute() {}, remove() {}, animate: (k, o) => { const a = { k, o, onfinish: null }; anims.push(a); return a; } }),
  };
  return { doc, appended, anims };
}

test('heartBurst(): hearts in both colours rise across the screen, then go', () => {
  const F = require('../ui-foundation.js');
  const { doc, appended, anims } = fakeDoc();
  assert.equal(F.heartBurst({ doc }), true);
  assert.equal(appended.length, 18);
  assert.ok(appended.every((h) => h.className === 'us-heart-burst'));
  const colours = new Set(appended.map((h) => h.style.background));
  assert.deepEqual([...colours].sort(), ['var(--us-lilla)', 'var(--us-rosa)'], 'the two colours of the couple');
  assert.ok(anims.every((a) => a.o.duration >= 1200 && a.o.duration <= 2200));
  assert.equal(F.heartBurst({ doc: null }), false);
});

test('heartBurst(): with reduced motion nothing moves', () => {
  const src = read('ui-foundation.js');
  const body = src.slice(src.indexOf('function heartBurst('), src.indexOf('// A new item (a memory, an idea)'));
  assert.match(body, /if \(!d\?\.body \|\| activeMotion\.isReducedMotion\(\)\) return false;/);
  assert.match(src, /    heartBurst,\n/);
  assert.match(read('dc-gioca.css'), /\.us-heart-burst\{position:fixed;[^}]*pointer-events:none[^}]*\}/);
});

test('the reward: a Ti penso group in the collection, Classico free, Cuori from the server', () => {
  const p = read('progression.js');
  assert.match(p, /ti_penso: \{ pref: 'ti_penso', label: 'Ti penso', /);
  assert.match(p, /ti_penso: \{ id: 'classic', title: 'Classico', /);
  assert.match(p, /if \(cat === 'ti_penso'\) return /);
  assert.match(p, /const think = value\('ti_penso'\);/);
  assert.match(p, /if \(root\.dataset\.usThinkFx !== \(think \|\| undefined\)\) \{ if \(think\) root\.dataset\.usThinkFx = think; else delete root\.dataset\.usThinkFx; \}/);
});

test('a Ti penso that arrives bursts into hearts when this phone chose them', () => {
  const app = read('app.js');
  const handler = app.slice(app.indexOf('function handleIncomingThink('), app.indexOf('const usRealtimeRefreshTimers'));
  assert.match(handler, /if\(document\.documentElement\.dataset\.usThinkFx==='hearts'\)window\.UsUiFoundation\?\.heartBurst\?\.\(\);/);
});
