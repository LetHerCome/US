// M12C — Risonanza V2 is a read-only explanation of recent real XP awards.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT=path.resolve(__dirname,'..');
const read=(f)=>fs.readFileSync(path.join(ROOT,f),'utf8');
const app=read('app.js'),html=read('index.html'),css=read('styles.css');
function slice(from,to){const a=app.indexOf(from),b=app.indexOf(to,a);assert.ok(a>=0&&b>a,`${from}…${to}`);return app.slice(a,b);}
function api(){
  const window={};
  const context=vm.createContext({window,document:{getElementById:()=>null},console,escapeHtml:String});
  vm.runInContext(`${slice('const RESONANCE_HISTORY_LIMIT=6;','function hashSeed(text){')}\nwindow.api=window.UsResonance;`,context);
  return window.api;
}
const q=(id,at,xp=40,extra={})=>({id,title:'Quest '+id,xp,completed_at:at,...extra});
const e=(id,at,xp=25,extra={})=>({id,xp_awarded:xp,completed_at:at,event_title_snapshot:'Evento '+id,...extra});
const h=(id,title='Titolo storico',source='snapshot')=>({source_ref:id,title,title_source:source,completed_at:'2026-09-01T12:00:00Z'});

test('M12C: recent growth merges only completed positive-XP Quest/Event awards, newest first',()=>{
  const entries=api().historyEntries([q('q1','2026-09-01T10:00:00Z',30),q('q2','2026-09-03T10:00:00Z',0),q('q3',null,50)],[e('e1','2026-09-02T10:00:00Z',25),e('e2','2026-09-04T10:00:00Z',60)],[h('e1','Cena'),h('e2','Viaggio')]);
  assert.deepEqual(Array.from(entries,x=>x.sourceKey),['shared_event_completion:e2','shared_event_completion:e1','quest:q1']);
  assert.deepEqual(Array.from(entries,x=>x.xp),[60,25,30]);
  assert.ok(entries.length<=6);
});

test('M12C: Event history owns displayed title and declares legacy live fallback',()=>{
  const entries=api().historyEntries([], [e('e1','2026-09-02T10:00:00Z',35,{event_title_snapshot:null})], [h('e1','Titolo attuale','live')]);
  assert.equal(entries[0].title,'Titolo attuale');
  assert.equal(entries[0].titleSource,'live');
});

test('M12C: canonical identity prevents duplicate rows',()=>{
  const entries=api().historyEntries([q('q1','2026-09-01T10:00:00Z'),q('q1','2026-09-01T10:00:00Z')],[e('e1','2026-09-02T10:00:00Z'),e('e1','2026-09-02T10:00:00Z')],[h('e1')]);
  assert.deepEqual(Array.from(entries,x=>x.sourceKey),['shared_event_completion:e1','quest:q1']);
});

test('M12C: UI explains XP history, never relationship quality or a second score',()=>{
  const section=html.match(/<section class="noi-resonance-history"[\s\S]*?<\/section>/)?.[0]||'';
  assert.match(section,/ULTIME CRESCITE/);
  assert.match(section,/XP realmente aggiunti/);
  assert.doesNotMatch(section,/qualit[àa]|compatibilit|salute|score|punteggio|valutazione/i);
  assert.match(app,/sb\.from\('couples'\)\.select\('bond_xp'\)/);
  assert.doesNotMatch(slice('const RESONANCE_HISTORY_LIMIT=6;','function hashSeed(text){'),/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
});

test('M12C: hydration reads same-couple authorities and guards identity switches',()=>{
  const block=slice('async function hydrateResonanceHistory(){','window.hydrateResonanceHistory=hydrateResonanceHistory;');
  assert.match(block,/from\('bond_weekly_quests'\)[\s\S]*?\.eq\('couple_id',coupleId\)/);
  assert.match(block,/from\('shared_event_completions'\)[\s\S]*?\.eq\('couple_id',coupleId\)/);
  assert.match(block,/from\('relationship_event_history'\)/);
  assert.match(block,/if\(window\.usProfile!==profile\)return;/);
});

test('M12C: opening Risonanza refreshes history without changing other Noi routes',()=>{
  const block=slice('function openNoiSection(view){','function closeNoiSection(){');
  assert.match(block,/if\(view==='resonance'\)window\.hydrateResonanceHistory\?\.\(\)/);
  assert.match(block,/if\(view==='da-vivere'/);
  assert.match(block,/if\(view==='eventi'\)/);
});

test('M12C: new surface hides outside Risonanza, can scroll, and shares reduced-motion behavior',()=>{
  assert.match(css,/noi-resonance-history\{display:none!important\}/);
  assert.match(css,/data-noi-view="resonance"\]\{height:auto!important;[\s\S]*?overflow:visible!important\}/);
  assert.match(css,/:is\(\.noi-resonance,\.noi-resonance-history,\.noi-resonance-guide/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});

test('M12C: no migration/backfill and Game V2 untouched',()=>{
  const migrations=fs.readdirSync(path.join(ROOT,'supabase/migrations')).sort();
  assert.equal(migrations.at(-1),'20261001093123_m12b_4_daily_question_keepsakes.sql');
  assert.doesNotMatch(slice('const RESONANCE_HISTORY_LIMIT=6;','function hashSeed(text){'),/game_v2|backfill/i);
});
