const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(ROOT,p),'utf8');
const html=read('index.html'), js=read('progression.js'), css=read('progression.css'), worker=read('service-worker.js'), native=read('scripts/build-capacitor-web.mjs');

test('Progression V1: user-facing Risonanza becomes Sintonia and exposes Ritmo + full unlock catalog',()=>{
  const bond=html.match(/<main id="bond"[\s\S]*?<\/main>/)?.[0]||'';
  assert.match(bond,/>Sintonia</);
  assert.match(bond,/aria-label="Sintonia attuale"/);
  assert.match(bond,/id="usProgressionRhythmValue"/);
  assert.match(bond,/id="usProgressionNext"/);
  assert.match(bond,/id="usProgressionRewards"/);
  assert.doesNotMatch(bond,/>Risonanza</);
});

test('Progression V1: unlock moment is prominent, actionable and server-acknowledged exactly through RPCs',()=>{
  assert.match(html,/id="usProgressionUnlock"[^>]*aria-hidden="true"/);
  assert.match(html,/id="usProgressionUnlockUse"/);
  assert.match(html,/id="usProgressionUnlockLater"/);
  assert.match(js,/sb\.rpc\('ack_progression_unlock'/);
  assert.match(js,/sb\.rpc\('equip_progression_reward'/);
  assert.match(js,/pending_unlocks/);
  assert.match(css,/@keyframes us-progression-swoosh/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.doesNotMatch(js,/localStorage|sessionStorage|indexedDB/,'unlock authority is never device-local');
  assert.match(js,/In uso · tocca per togliere/);
});

test('Progression V1: reward collection scales as an internal scrollable grid',()=>{\n  assert.match(css,/grid-template-columns:repeat\\(2,minmax\\(0,1fr\\)\\)/);\n  assert.match(css,/max-height:min\\(330px,42dvh\\)/);\n  assert.match(css,/overflow-y:auto/);\n});\n\ntest('Progression V1: cosmetic preferences map only to explicit theme/frame/effect datasets',()=>{
  assert.match(js,/dataset\.usTheme/);
  assert.match(js,/dataset\.usEffect/);
  assert.match(js,/dataset\.usFrame/);
  assert.match(css,/:root\[data-us-theme="rose"\]/);
  assert.match(css,/:root\[data-us-theme="midnight"\]/);
  assert.match(css,/#homeHero\[data-us-frame="glow"\]::after/);
  assert.match(css,/#homeHero\[data-us-frame="aurora"\]::after/);
  assert.match(css,/:root\[data-us-effect="pulse"\] \.us-top-brand-art/);
});

test('Progression V1: progression client has no direct writes to authority tables',()=>{
  assert.match(js,/sb\.rpc\('get_progression_v1'/);
  assert.doesNotMatch(js,/\.from\('(?:progression_events|progression_reward_catalog|couple_reward_unlocks|progression_reward_views|couple_progression_preferences)'\)/);
  assert.doesNotMatch(js,/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test('Progression V1: new runtime files are versioned, offline-preached and staged for Capacitor',()=>{
  assert.match(html,/progression\.css\?v=/);
  assert.match(html,/progression\.js\?v=/);
  assert.match(worker,/versioned\("\/progression\.css"\)/);
  assert.match(worker,/versioned\("\/progression\.js"\)/);
  assert.match(native,/'progression\.css'/);
  assert.match(native,/'progression\.js'/);
});

test('Progression V1: old device-local level celebration is gone; server pending unlocks own the moment',()=>{
  const app=read('app.js');
  assert.doesNotMatch(app,/usBondLastLevel/);
  assert.match(app,/window\.renderBondProgress=renderBondProgress/);
  assert.match(app,/window\.USProgression\?\.refreshAfterAction\?\.\(\)/);
});
