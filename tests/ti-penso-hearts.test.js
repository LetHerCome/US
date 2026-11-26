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

// Premi, fase 2 (grill D20–D21, 25/11/2026): the reward plays when the Ti
// penso is opened, after its scene, so it is seen even when read later; once
// per Ti penso, never with reduced motion. «Cuori» from the heart eyes of who
// thinks of you, a touch pops one; «Lettera» a real envelope, seal, flap, sheet.
test('the Ti penso rewards play when the Ti penso is opened, once, after the scene', () => {
  const app = read('app.js');
  const handler = app.slice(app.indexOf('function handleIncomingThink('), app.indexOf('const usRealtimeRefreshTimers'));
  assert.doesNotMatch(handler, /heartBurst|letterOpen/, 'nothing over Oggi at arrival any more');
  const open = app.slice(app.indexOf('function openThinkArrival('), app.indexOf('window.openThinkArrival=openThinkArrival;'));
  assert.match(open, /window\.UsThinkReward\?\.play\?\.\(root,\{id:usIncomingThink\.id,created_at:usIncomingThink\.created_at,name:/);
  const reward = read('think-reward.js');
  assert.match(reward, /if \(!root \|\| \(kind !== 'hearts' && kind !== 'letter'\) \|\| reduced\(\)\) return false;/);
  assert.match(reward, /if \(key && played\.has\(key\)\) return false;/);
  assert.match(reward, /\}, 900\);/, 'after the scene (the sheet floods in 700 ms)');
  assert.match(reward, /const eye = \(x\) =>/, 'the hearts leave the heart eyes');
  assert.match(reward, /sheet\.addEventListener\('pointerdown', onDown\);/, 'a touch pops a heart; the reply buttons keep theirs');
  assert.match(reward, /Tocca il sigillo/);
  for (const step of ['o1', 'o2', 'o3', 'o4']) assert.ok(reward.includes(`['${step}', `), step);
  const html = read('index.html');
  assert.ok(html.indexOf('/think-reward.js?v=') > 0);
  assert.ok(read('service-worker.js').includes('versioned("/think-reward.js")'));
  for (const build of ['scripts/build-cloudflare-pages.mjs', 'scripts/build-capacitor-web.mjs']) assert.ok(read(build).includes("'think-reward.js'"), build);
});

test('the letter opens in the middle of the screen, not with reduced motion, and cleans up after itself', () => {
  const ui = read('ui-foundation.js');
  const fn = ui.slice(ui.indexOf('function letterOpen('), ui.indexOf('// A new item (a memory, an idea)'));
  assert.match(fn, /if \(!d\?\.body \|\| activeMotion\.isReducedMotion\(\)\) return false;/);
  assert.match(ui, /const LETTER_ART = '\/assets\/derived\/rewards\/us-think-letter-';/);
  assert.match(fn, /\$\{LETTER_ART\}closed-v1\.webp[\s\S]*\$\{LETTER_ART\}open-v1\.webp/);
  assert.match(fn, /anim\.onfinish = \(\) => box\.remove\(\);/);
  assert.match(ui, /\n    letterOpen,\n/);
  assert.match(read('dc-gioca.css'), /\.us-think-letter\{position:fixed;z-index:10320;/);
});
