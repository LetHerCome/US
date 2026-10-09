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
test('V4: daily slot leads Gioca; day rail precedes weekly budget and existing game bento', async()=>{
  const html=await gameHub().html();
  const keys=['data-gv4-daily-slot','class="us-gv4-week"','class="us-gv2-head"','class="us-gv2-choose"','data-gv2-action="per-voi"','data-gv2-action="swipe"','data-gv2-family="scopritevi"'];
  const positions=keys.map(k=>html.indexOf(k));
  assert.ok(positions.every(v=>v>=0),JSON.stringify(positions));
  assert.deepEqual([...positions].sort((a,b)=>a-b),positions);
  assert.equal((html.match(/data-gv2-action="per-voi"/g)||[]).length,1);
  assert.equal((html.match(/data-gv2-action="swipe"/g)||[]).length,1);
  assert.equal((html.match(/data-gv2-family="/g)||[]).length,6);
  assert.equal((html.match(/us-gv4-day(?: is-today)?"/g)||[]).length,7);
  assert.equal((html.match(/aria-current="date"/g)||[]).length,1);
  assert.doesNotMatch(html,/data-streak|data-completed-days|day-played/,'no fictitious past-day progress');
});
test('V4: Europe/Rome day rail respects October clock boundary',async()=>{
  const html=await gameHub('2026-10-09T22:30:00Z').html();
  assert.match(html,/aria-label="sabato 10 ottobre, oggi"/,'Rome is already Saturday although UTC is Friday');
  assert.match(html,/class="us-gv4-day is-today" aria-current="date" aria-label="sabato 10 ottobre, oggi"/);
});
test('V4: Daily Challenge is one stable slot; only existing Daily engine supplies question/response state',()=>{
  const source=read('home-cleanup.js');
  const start=source.indexOf('function dailyMarkup(model){');
  const end=source.indexOf('\nconst nudgeSeen',start);
  assert.ok(start>=0&&end>start);
  const slot={dataset:{},innerHTML:'',setAttribute(){}},hub={classList:{contains:()=>false},querySelector:selector=>selector==='.us-gv2-daily-slot'?slot:null};
  let model=null;
  const sandbox={$:id=>id==='quizHub'?hub:null,dailyModel:()=>model,esc:value=>String(value??'').replace(/[&<>"']/g,'?')};
  const vmContext=vm.createContext(sandbox);
  vm.runInContext(source.slice(start,end),vmContext);
  vm.runInContext('paintDailyInGioca()',vmContext);
  assert.match(slot.innerHTML,/non è ancora disponibile/);
  model={questionId:'q-1',question:'Un ricordo speciale?',state:'answer',meta:'Tocca a te',cta:'Rispondi',nudge:true};
  vm.runInContext('paintDailyInGioca()',vmContext);
  assert.equal((slot.innerHTML.match(/data-us-daily-entry/g)||[]).length,1);
  assert.match(slot.innerHTML,/Daily<br>Challenge/);
  assert.match(slot.innerHTML,/Un ricordo speciale/);
  model={...model,state:'waiting',meta:'Aspettiamo Bea',cta:'Apri'};
  vm.runInContext('paintDailyInGioca()',vmContext);
  assert.equal((slot.innerHTML.match(/data-us-daily-entry/g)||[]).length,1);
  assert.match(slot.innerHTML,/data-daily-state="waiting"/);
  assert.doesNotMatch(slot.innerHTML,/partner_answer|Risposta segreta/);
  assert.match(read('games.js'),/window\.UsDailyQuestionHub\?\.paintCard\?\.\(\)/);
  assert.match(source,/paintCard: paintDailyInGioca/);
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
