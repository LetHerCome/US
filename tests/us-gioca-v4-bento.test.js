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
// Round 3 parity (062-tab-gioca): the mockup's Giochi is Sfida di oggi, then
// the seven days of this week (L … D, Monday first, today in milk), then the
// game bento. The weekly budget strip is gone (the limit is said in the
// confirm and on the tiles it locks). A day gets a dot only from data the app
// already has: a round completed that day, and today's daily question.
// Redesign definitivo (23/11/2026, D11): la domanda di oggi left Gioca (it
// stays on Oggi); the week leads, then the games.
test('Fase 6 (D11): the tokens lead Gioca, then the games (Per voi first, Questo o quello last); no week, no daily question', async()=>{
  const html=await gameHub().html();
  const all = html.slice(html.indexOf('class="us-gv2-all"'));
  assert.doesNotMatch(html,/data-gv4-daily-slot|us-gv4-daily-pending|id="usGv2Week"|us-gv2-wd/);
  const keys=['class="us-gv2-choose"','data-gv2-action="per-voi"','data-gv2-action="swipe"','class="us-gv2-all"'];
  const positions=keys.map(k=>html.indexOf(k));
  assert.ok(positions.every(v=>v>=0),JSON.stringify(positions));
  assert.deepEqual([...positions].sort((a,b)=>a-b),positions);
  assert.equal((html.match(/data-gv2-action="per-voi"/g)||[]).length,1);
  assert.equal((html.match(/data-gv2-action="swipe"/g)||[]).length,1);
  // G7 1.0 — "E se…?" is no longer offered as a tile.
  assert.equal((all.match(/data-gv2-family="/g)||[]).length,5);
  // 25/11/2026: plus «Il gioco di oggi», one of them, in the giostra.
  assert.equal((html.match(/data-gv2-family="/g)||[]).length,6);
  assert.doesNotMatch(html,/us-gv2-rhythm|us-gv4-week|us-gv4-day/,'no budget strip, no old rail');
  assert.doesNotMatch(html,/data-streak|data-completed-days|day-played/,'no fictitious past-day progress');
});
test('1.0 G1: games.js keeps no day rail code and still hands the slot to the Daily engine',()=>{
  const games=read('games.js');
  assert.doesNotMatch(games,/function dayRail|function romeDayISO|\$\{dayRail\(\)\}/);
  assert.match(games,/window\.UsDailyQuestionHub\?\.paintCard\?\.\(\)/);
});
// Redesign definitivo (23/11/2026, D11): the card left Gioca. The model stays
// (UsDailyQuestionHub.model), canonical and without the partner's answer; the
// paint only repaints the week of answers.
test('V4 → 1.0: the daily model follows the existing Daily engine; Gioca paints nothing of it (fase 6)',()=>{
  const app=read('app.js');
  const start=app.indexOf('// ===== 1.0 — La domanda di oggi in Gioca');
  const end=app.indexOf('// F2 — Gioca has no turn API',start);
  assert.ok(start>=0&&end>start);
  let weeks=0;
  const hub={classList:{contains:()=>false}};
  const window={USGameV2:{paintWeek:()=>{weeks++;}}};
  const sandbox={window,document:{getElementById:id=>id==='quizHub'?hub:null},oggiPartnerName:()=>'Bea',escapeHtml:value=>String(value??'').replace(/[&<>"']/g,'?')};
  const vmContext=vm.createContext(sandbox);
  vm.runInContext(app.slice(start,end),vmContext);
  vm.runInContext('paintDailyInGioca()',vmContext);
  assert.equal(weeks,0,'no week strip since fase 6');
  assert.equal(vm.runInContext('dailyHubModel()',vmContext),null);
  window.todayQuestion={id:'q-1',question:'Un ricordo speciale?'};
  window.todayState={my_answer:null,partner_has_answer:true,both_answered:false,partner_answer:'Risposta segreta'};
  const model=vm.runInContext('dailyHubModel()',vmContext);
  assert.equal(model.meta,'Bea ha già risposto · tocca a te');
  assert.doesNotMatch(JSON.stringify(model),/Risposta segreta/);
  window.todayState={my_answer:'Mia',partner_has_answer:false,both_answered:false};
  assert.equal(vm.runInContext('dailyHubModel()',vmContext).state,'waiting');
  assert.doesNotMatch(app,/data-us-daily-entry|function dailyHubMarkup/);
  assert.match(app,/window\.UsDailyQuestionHub=Object\.freeze\(\{model:dailyHubModel,paint:paintDailyInGioca,paintCard:paintDailyCardAndTurn,open:openToday\}\);/);
});
test('V4: mobile-safe bento grid with existing icons; Sintonia reached from Il vostro angolo',()=>{
  const css=read('games.css'),html=read('index.html');
  assert.match(css,/#quiz \.us-gv2-pervoi,[\s\S]*?grid-column:1;grid-row:span 2;/);
  assert.match(css,/#quiz \.us-gv2-game\.is-swipe\{[\s\S]*?grid-column:2;grid-row:1;/);
  assert.match(read('dc-gioca.css'),/#quiz \.us-gv2-week\{display:grid;grid-template-columns:repeat\(7,1fr\)/);
  assert.match(css,/@media\(max-width:360px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  // Redesign definitivo (D3): no tabs in Gioca; Sintonia is in Il vostro angolo.
  assert.doesNotMatch(html,/id="usGiocaTabGames"|id="usGiocaTabSintonia"/);
  assert.match(html,/<div id="usAngolo"[\s\S]*?id="usGiocaSintonia"/);
  assert.match(read('games.js'),/get_game_v2_home/);
  assert.match(read('games.js'),/const tileStatus=\(f\)=>\{const r=tileRound\(f\.id\);if\(r\)onTiles\.add\(r\.id\);return modeStatus\(f,r\);\};/);
});
