const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const tick = async () => {for(let i=0;i<7;i++)await new Promise(resolve=>setImmediate(resolve));};

function gameHub(instant='2026-10-09T22:30:00Z'){
  const nodes={};
  const node=id=>(nodes[id] ||= {id,innerHTML:'',dataset:{},classList:{add(){},remove(){},contains:()=>false},setAttribute(){},removeAttribute(){},addEventListener(){},querySelector:()=>null});
  const window={usProfile:{role:'francesco'},crypto:{randomUUID:()=> 'req'},go(){}};
  class FrozenDate extends Date {constructor(...args){super(...(args.length?args:[instant]));}}
  const state={per_voi:{state:'idle'},open_rounds:[],recent:[],weekly:null,allowance:{used:0,limit:3,per_voi_available:true,free_available:true,free_limit:2,free_used:0,families:{}}};
  const sandbox={window,Date:FrozenDate,Intl,document:{readyState:'complete',hidden:false,getElementById:node,addEventListener(){},querySelector:()=>({id:'quiz'})},sb:{rpc:async()=>({data:state,error:null})},toast(){},FormData:class{},console:{warn(){}},setTimeout:()=>1,setInterval:()=>1};
  node('quizHub');node('usGameV2Panel');node('usPerVoiTop');
  require('./helpers/identity-fixture').install(sandbox);
  vm.runInNewContext(read('games.js'),sandbox);
  return {html:async()=>{await tick();return nodes.quizHub.innerHTML;},window};
}
// 1.0 (G1): one name, "La domanda di oggi", opened in place; the 7-day strip
// is gone (the "double bar" was the transient DOMANDA DI OGGI bar, removed with
// home-cleanup.js). The weekly budget strip stays (3 a settimana: TIENI).
test('1.0 G1: La domanda di oggi leads Gioca, then the weekly budget and the existing game bento; no day rail', async()=>{
  const html=await gameHub().html();
  const keys=['data-gv4-daily-slot','class="us-gv2-head"','class="us-gv2-choose"','data-gv2-action="per-voi"','data-gv2-action="swipe"','data-gv2-family="scopritevi"'];
  const positions=keys.map(k=>html.indexOf(k));
  assert.ok(positions.every(v=>v>=0),JSON.stringify(positions));
  assert.deepEqual([...positions].sort((a,b)=>a-b),positions);
  assert.equal((html.match(/data-gv2-action="per-voi"/g)||[]).length,1);
  assert.equal((html.match(/data-gv2-action="swipe"/g)||[]).length,1);
  // G7 1.0 — "E se…?" is no longer offered as a tile.
  assert.equal((html.match(/data-gv2-family="/g)||[]).length,5);
  assert.doesNotMatch(html,/us-gv4-week|us-gv4-day|aria-current="date"/,'no day rail');
  assert.equal((html.match(/us-gv2-rhythm"/g)||[]).length,1,'one weekly budget strip');
  assert.match(html,/<span class="us-gv4-daily-pending-title">La domanda di oggi<\/span><small>Preparo la domanda di oggi…<\/small>/);
  assert.doesNotMatch(html,/Sfida di oggi|SFIDA DI OGGI/);
  assert.doesNotMatch(html,/data-streak|data-completed-days|day-played/,'no fictitious past-day progress');
});
test('1.0 G1: games.js keeps no day rail code and still hands the slot to the Daily engine',()=>{
  const games=read('games.js');
  assert.doesNotMatch(games,/function dayRail|function romeDayISO|\$\{dayRail\(\)\}/);
  assert.match(games,/window\.UsDailyQuestionHub\?\.paintCard\?\.\(\)/);
});
test('V4 → 1.0: La domanda di oggi is one stable slot; only the existing Daily engine supplies question/response state',()=>{
  const app=read('app.js');
  const start=app.indexOf('// ===== 1.0 — La domanda di oggi in Gioca');
  const end=app.indexOf('// F2 — Gioca has no turn API',start);
  assert.ok(start>=0&&end>start);
  const slot={dataset:{},innerHTML:'',setAttribute(){}},hub={classList:{contains:()=>false},querySelector:selector=>selector==='.us-gv2-daily-slot'?slot:null};
  const window={};
  const sandbox={window,document:{getElementById:id=>id==='quizHub'?hub:null},oggiPartnerName:()=>'Bea',escapeHtml:value=>String(value??'').replace(/[&<>"']/g,'?')};
  const vmContext=vm.createContext(sandbox);
  vm.runInContext(app.slice(start,end),vmContext);
  vm.runInContext('paintDailyInGioca()',vmContext);
  assert.match(slot.innerHTML,/non è ancora disponibile/);
  assert.match(slot.innerHTML,/La domanda di oggi/);
  window.todayQuestion={id:'q-1',question:'Un ricordo speciale?'};
  window.todayState={my_answer:null,partner_has_answer:true,both_answered:false,partner_answer:'Risposta segreta'};
  vm.runInContext('paintDailyInGioca()',vmContext);
  assert.equal((slot.innerHTML.match(/data-us-daily-entry/g)||[]).length,1);
  assert.match(slot.innerHTML,/LA DOMANDA DI OGGI/);
  assert.doesNotMatch(slot.innerHTML,/SFIDA DI OGGI/);
  assert.match(slot.innerHTML,/Un ricordo speciale/);
  assert.match(slot.innerHTML,/Bea ha già risposto · tocca a te/);
  window.todayState={my_answer:'Mia',partner_has_answer:false,both_answered:false};
  vm.runInContext('paintDailyInGioca()',vmContext);
  assert.equal((slot.innerHTML.match(/data-us-daily-entry/g)||[]).length,1);
  assert.match(slot.innerHTML,/data-daily-state="waiting"/);
  assert.doesNotMatch(slot.innerHTML,/partner_answer|Risposta segreta|Mia/);
  // Tap opens the sheet where you are (no tab switch).
  assert.match(app,/document\.getElementById\('quizHub'\)\?\.addEventListener\('click',event=>\{\n  if\(!event\.target\.closest\?\.\('\[data-us-daily-entry\]'\)\)return;\n  event\.preventDefault\(\);\n  openToday\(\);/);
  assert.match(app,/window\.UsDailyQuestionHub=Object\.freeze\(\{model:dailyHubModel,paint:paintDailyInGioca,paintCard:paintDailyCardAndTurn,open:openToday\}\);/);
});
test('V4: mobile-safe bento grid with existing icons and preserved Sintonia navigation',()=>{
  const css=read('games.css'),html=read('index.html');
  assert.match(css,/#quiz \.us-gv2-pervoi,[\s\S]*?grid-column:1;grid-row:span 2;/);
  assert.match(css,/#quiz \.us-gv2-game\.is-swipe\{[\s\S]*?grid-column:2;grid-row:1;/);
  assert.match(css,/#quiz \.us-gv4-days\{display:grid;grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:360px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(html,/id="usGiocaTabGames"/);assert.match(html,/id="usGiocaTabSintonia"/);
  assert.match(read('games.js'),/get_game_v2_home/);
  assert.match(read('games.js'),/modeStatus\(f,openByFamily\.get\(f\.id\)\)/);
});
