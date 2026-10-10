const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const tick=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const payload=(extra={})=>({week_start:'2026-10-05',week_end:'2026-10-11',today:'2026-10-09',timezone:'Europe/Rome',completed_days:1,weekly_xp_awarded:17,
 days:Array.from({length:7},(_,i)=>({date:`2026-10-${String(5+i).padStart(2,'0')}`,daily_complete:i===2,game_complete:i===2,complete:i===2,status:i===2?'complete':'incomplete'})),...extra});
function harness(read=()=>payload()){
 const nodes={},events=new Map(),calls=[];
 for(const id of ['quizHub','usGameV2Panel','usPerVoiTop'])nodes[id]={innerHTML:'',dataset:{},classList:{add(){},remove(){},contains(){return false;}},setAttribute(){},removeAttribute(){},addEventListener(){},querySelectorAll(){return[];},querySelector(selector){
  if(selector!=='[data-gv2-week]'||!this.innerHTML.includes('data-gv2-week'))return null;
  const root=this;return {set outerHTML(html){root.innerHTML=root.innerHTML.replace(/<section class="us-gv4-week[\s\S]*?<\/section>/,html);}};
 }};
 const window={usProfile:{id:'user-a',couple_id:'couple-a',role:'francesco'},crypto:{randomUUID:()=> 'request-id'},
  addEventListener(name,fn){events.set(name,fn);},UsIdentity:{current:()=>({partnerName:'Sam',nameForRole:()=> 'Alex'})}};
 const sb={rpc:async(name,args)=>{calls.push([name,args]);if(name==='get_couple_week_participation_v1')return {data:await read(),error:null};return {data:{per_voi:{state:'idle'},open_rounds:[],recent:[],allowance:{used:3,limit:3,free_used:2,free_limit:2}},error:null};}};
 const context={window,sb,document:{readyState:'complete',hidden:false,getElementById:id=>nodes[id],querySelector:()=>({id:'quiz'}),addEventListener(){}},console:{warn(){}},setInterval(){},setTimeout(){},toast(){},Date,Intl};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../games.js'),'utf8'),context);
 return {api:window.USGameV2,window,nodes,events,calls,setRead(fn){read=fn;}};
}
test('week rail uses server dates, server green flags/count and actual ledger XP without changing three-game allowance',async()=>{
 const h=harness();await tick();const html=h.nodes.quizHub.innerHTML;
 assert.match(html,/data-gv2-week/);assert.match(html,/1 di 7 giornate complete/);assert.match(html,/17 XP questa settimana/);
 assert.equal((html.match(/is-complete/g)||[]).length,1);assert.match(html,/data-date="2026-10-07"/);assert.match(html,/data-gv2-icon="check"/);
 assert.match(html,/0 rimasti/);assert.deepEqual(h.calls.find(([n])=>n==='get_couple_week_participation_v1'),['get_couple_week_participation_v1',undefined]);
});
test('loading, unavailable RPC and offline never become zero/green/XP and do not block games',async()=>{
 const pending=deferred(),h=harness(()=>pending.promise);await tick();
 assert.match(h.nodes.quizHub.innerHTML,/Sincronizzo la vostra settimana/);assert.match(h.nodes.quizHub.innerHTML,/I vostri giochi/);
 pending.reject(new Error('offline'));await tick();
 assert.match(h.nodes.quizHub.innerHTML,/Settimana non disponibile/);assert.match(h.nodes.quizHub.innerHTML,/week-retry/);
 assert.doesNotMatch(h.nodes.quizHub.innerHTML,/giornate complete|XP questa settimana|is-complete/);
 h.setRead(()=>payload());await h.api.refreshParticipation();assert.match(h.nodes.quizHub.innerHTML,/17 XP/);
 h.setRead(()=>{throw Error('RPC absent');});await h.api.refreshParticipation();assert.doesNotMatch(h.nodes.quizHub.innerHTML,/17 XP|is-complete/);
});
test('legacy unverifiable data is explicit and never green; malformed aggregates are rejected',async()=>{
 const data=payload({completed_days:0});data.days[2]={...data.days[2],daily_complete:false,complete:false,status:'unverifiable'};
 const h=harness(()=>data);await tick();assert.match(h.nodes.quizHub.innerHTML,/non verificabili/);assert.doesNotMatch(h.nodes.quizHub.innerHTML,/is-complete/);
 h.setRead(()=>payload({completed_days:6}));await h.api.refreshParticipation();assert.match(h.nodes.quizHub.innerHTML,/Settimana non disponibile/);
});
test('out of order reads and A→B→A identity cycles cannot apply previous tenant state',async()=>{
 const old=deferred(),h=harness(()=>old.promise);await tick();
 h.setRead(()=>payload({weekly_xp_awarded:31}));await h.api.refreshParticipation();old.resolve(payload({weekly_xp_awarded:999}));await tick();
 assert.match(h.nodes.quizHub.innerHTML,/31 XP/);assert.doesNotMatch(h.nodes.quizHub.innerHTML,/999 XP/);
 const late=deferred();h.setRead(()=>late.promise);const request=h.api.refreshParticipation();
 h.window.usProfile={id:'user-b',couple_id:'couple-b',role:'francesco'};h.events.get('us-identity-change')({detail:{identityKey:'B'}});
 assert.doesNotMatch(h.nodes.quizHub.innerHTML,/31 XP|is-complete/);
 h.window.usProfile={id:'user-a',couple_id:'couple-a',role:'francesco'};h.events.get('us-identity-change')({detail:{identityKey:'A'}});
 h.setRead(()=>payload({weekly_xp_awarded:42}));await h.api.refreshParticipation();late.resolve(payload({weekly_xp_awarded:888}));await request;
 assert.match(h.nodes.quizHub.innerHTML,/42 XP/);assert.doesNotMatch(h.nodes.quizHub.innerHTML,/888 XP/);
});
test('new server week replaces the old rail and reconnect refetches instead of inventing progression',async()=>{
 const h=harness();await tick();const monday=payload({week_start:'2026-10-12',week_end:'2026-10-18',today:'2026-10-12',completed_days:0,weekly_xp_awarded:0});
 monday.days=monday.days.map((d,i)=>({...d,date:`2026-10-${12+i}`,daily_complete:false,game_complete:false,complete:false,status:'incomplete'}));
 h.setRead(()=>monday);await h.api.refreshParticipation();assert.doesNotMatch(h.nodes.quizHub.innerHTML,/data-date="2026-10-07"|is-complete/);assert.match(h.nodes.quizHub.innerHTML,/data-date="2026-10-12"/);
 const count=h.calls.length;h.events.get('online')();await tick();assert.ok(h.calls.length>count);
});
