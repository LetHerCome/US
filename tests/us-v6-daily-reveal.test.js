const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read, slice, el, state, meta } = require('./helpers/m10-2-harness');
const flush = () => new Promise(r => setImmediate(r));

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
function daily({ rpc, upsert } = {}) {
  const date = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const question = {id:'q-1', question_date:date, question:'Che cosa vuoi raccontarmi?'};
  const nodes = Object.fromEntries(['today','qtext','locked','todayReveal','todaySaveBtn','answer','todaySyncStatus','todayRetryBtn','todayKeep','panel'].map(id => [id, el()]));
  nodes.today.setAttribute = () => {};
  nodes.today.querySelector = () => nodes.panel;
  nodes.todayReveal.addEventListener = () => {};
  const calls = [];
  const sb = {
    async rpc(name, args) {
      calls.push([name,args]);
      if(rpc) { const result = rpc(name,args); if(result !== undefined) return result; }
      if(name==='get_or_create_daily_question') return {data:question,error:null};
      if(name==='get_daily_state') return {data:state(null,null),error:null};
      if(name==='get_daily_reveal_meta') return {data:meta(),error:null};
      if(name==='mark_daily_reveal_seen') return {data:meta({my_reveal_seen_at:'2026-10-09T10:00:00Z'}),error:null};
      throw new Error(name);
    },
    from:()=>({upsert:async (...args)=>{calls.push(['upsert',...args]);return upsert ? upsert(...args) : {error:null};}})
  };
  const window = {usProfile:{id:'f',couple_id:'c',role:'francesco'},UsTodayPriority:{refresh(){},render(){}},UsDailyKeepsake:{hide(){},async load(){}}};
  const document = {body:{style:{overflow:'clip'}},getElementById:id=>nodes[id]||null,querySelector:s=>s==='#today .qtext'?nodes.qtext:null,querySelectorAll:()=>[]};
  const context = vm.createContext({window,document,sb,console:{warn(){}},Intl,Date,Error,Promise,Object,
    dailyQuestionOutcomes:{hide(){}},updateHomeStatus(){},dailyRitualPartnerName:()=> 'Beatrice',localDateISO:()=>date,
    escapeHtml:v=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])),toast(){},sendWebPushEvent:()=>Promise.resolve()});
  require('./helpers/identity-fixture').install(context);
  vm.runInContext(slice('// M9E — la domanda di oggi','async function updateHomeStatus')+';window.hydrateToday=hydrateToday;',context);
  vm.runInContext(slice('let usTodayPreviousOverflow=null;','function thinkReactionLabel('),context);
  vm.runInContext(slice('saveAnswer = async function(){','window.saveAnswer=saveAnswer;')+';window.saveAnswer=saveAnswer;',context);
  return {nodes,window,calls,question,document,hydrate:()=>window.hydrateToday()};
}

test('Daily: state read pending never exposes an editor without verified state', async()=>{
  const wait=deferred();const t=daily({rpc:name=>name==='get_daily_state'?wait.promise:undefined});
  const run=t.hydrate();await flush();
  assert.equal(t.nodes.answer.hidden,true);
  assert.equal(t.nodes.todaySaveBtn.disabled,true);
  wait.resolve({data:state(null,null),error:null});await run;
  assert.equal(t.nodes.answer.hidden,false);assert.equal(t.nodes.answer.disabled,false);
});

for(const failure of ['returned','thrown','invalid'])test(`Daily: ${failure} state failure has retry and cannot submit`,async()=>{
  const t=daily({rpc:name=>name==='get_daily_state'?(failure==='thrown'?Promise.reject(new Error('offline')):Promise.resolve({data:failure==='invalid'?{}:null,error:failure==='returned'?{message:'offline'}:null})):undefined});
  await t.hydrate();
  assert.equal(t.nodes.answer.hidden,true);
  assert.equal(t.nodes.todaySaveBtn.dataset.usTodayMode,'retry');
  assert.equal(t.nodes.locked.hidden,false);
  await t.window.saveAnswer();
  assert.equal(t.calls.filter(c=>c[0]==='upsert').length,0);
});

test('Daily: refreshing a reveal keeps two answers with no editor, including network failure',async()=>{
  let phase='ready';const wait=deferred();
  const t=daily({rpc:name=>name==='get_daily_state'?(phase==='ready'?{data:state('Mia','Sua'),error:null}:wait.promise):undefined});
  t.nodes.today.classList.add('open');await t.hydrate();phase='pending';
  const run=t.hydrate();await flush();
  assert.equal(t.nodes.answer.hidden,true);assert.equal(t.nodes.todaySaveBtn.hidden,true);
  assert.match(t.nodes.todayReveal.innerHTML,/Mia[\s\S]*Sua/);
  wait.resolve({data:null,error:{message:'offline'}});await run;
  assert.match(t.nodes.todayReveal.innerHTML,/Mia[\s\S]*Sua/);
  assert.equal(t.nodes.todaySyncStatus.hidden,false);assert.equal(t.nodes.todayRetryBtn.hidden,false);
});

test('Daily: a refresh does not overwrite a locally edited answer',async()=>{
  const t=daily({rpc:name=>name==='get_daily_state'?{data:state('Inviata',null),error:null}:undefined});
  await t.hydrate();t.nodes.answer.value='La mia bozza';await t.hydrate();
  assert.equal(t.nodes.answer.value,'La mia bozza');
});

test('Daily: late state from a different identity is discarded',async()=>{
  const wait=deferred();const t=daily({rpc:name=>name==='get_daily_state'?wait.promise:undefined});
  const run=t.hydrate();await flush();
  t.window.usProfile={id:'other',couple_id:'other-couple',role:'beatrice'};
  wait.resolve({data:state('A','B'),error:null});await run;
  assert.doesNotMatch(t.nodes.todayReveal.innerHTML,/data-us-daily-answer/);
});

test('Daily: failed answer submission preserves draft and can be retried',async()=>{
  let fail=true;
  const t=daily({upsert:()=>fail?Promise.reject(new Error('offline')):Promise.resolve({error:null})});
  await t.hydrate();t.nodes.answer.value='La mia risposta';
  await t.window.saveAnswer();
  assert.equal(t.nodes.answer.value,'La mia risposta');
  assert.equal(t.nodes.todaySaveBtn.disabled,false);
  fail=false;await t.window.saveAnswer();
  assert.equal(t.calls.filter(c=>c[0]==='upsert').length,2);
});

test('Daily: double submit writes once and identity switch cannot apply late save UI',async()=>{
  const wait=deferred();const t=daily({upsert:()=>wait.promise});
  await t.hydrate();t.nodes.answer.value='Mia';
  const run=t.window.saveAnswer();await t.window.saveAnswer();
  assert.equal(t.calls.filter(c=>c[0]==='upsert').length,1);
  t.window.usProfile={id:'other',couple_id:'other',role:'beatrice'};
  t.nodes.todaySaveBtn.textContent='Nuova coppia';
  wait.resolve({error:null});await run;
  assert.equal(t.nodes.todaySaveBtn.textContent,'Nuova coppia');
});

test('Daily: a refresh during saving does not permit another outstanding write',async()=>{
  const wait=deferred();const t=daily({upsert:()=>wait.promise});
  await t.hydrate();t.nodes.answer.value='La mia risposta';
  const run=t.window.saveAnswer();await t.hydrate();
  assert.equal(t.nodes.todaySaveBtn.disabled,true);
  await t.window.saveAnswer();assert.equal(t.calls.filter(c=>c[0]==='upsert').length,1);
  wait.resolve({error:null});await run;
});

test('Daily: an old A save cannot change a newer A save after an identity cycle',async()=>{
  const waits=[deferred(),deferred(),deferred()];let count=0;
  const t=daily({upsert:()=>waits[count++].promise});await t.hydrate();
  t.nodes.answer.value='Prima A';const oldA=t.window.saveAnswer();
  t.window.usProfile={id:'B',couple_id:'B',role:'beatrice'};await t.hydrate();
  t.nodes.answer.value='B';const other=t.window.saveAnswer();
  t.window.usProfile={id:'f',couple_id:'c',role:'francesco'};await t.hydrate();
  t.nodes.answer.value='Nuova A';const newA=t.window.saveAnswer();
  waits[0].resolve({error:{message:'old failure'}});await oldA;
  assert.equal(t.nodes.todaySaveBtn.disabled,true);assert.equal(t.nodes.todaySaveBtn.textContent,'Salvo…');
  waits[1].resolve({error:null});await other;
  waits[2].resolve({error:null});await newA;
});

test('Daily: a late seen receipt is not applied to a new identity',async()=>{
  const wait=deferred();const t=daily({rpc:name=>name==='get_daily_state'?{data:state('A','B'),error:null}:name==='mark_daily_reveal_seen'?wait.promise:undefined});
  t.nodes.today.classList.add('open');const run=t.hydrate();await flush();
  t.window.usProfile={id:'other',couple_id:'other',role:'beatrice'};
  t.window.todayRevealMeta=null;
  wait.resolve({data:meta({my_reveal_seen_at:'2026-10-09T10:00:00Z'}),error:null});await run;
  assert.equal(t.window.todayRevealMeta,null);
});

test('Daily: reopen starts at the question and close restores previous body scroll',async()=>{
  const t=daily();t.nodes.panel.scrollTop=900;t.nodes.today.scrollTop=80;
  t.window.openToday();await Promise.resolve();
  assert.equal(t.nodes.panel.scrollTop,0);assert.equal(t.nodes.today.scrollTop,0);
  t.window.closeToday();
  // A subsequent open/close must preserve the original nonempty overflow too.
  assert.equal(t.nodes.today.classList.contains('open'),false);
  assert.equal(t.document.body.style.overflow,'clip');
});

test('Daily: retired comments and reactions have no frontend mutation entry point',()=>{
  const t=daily();
  assert.equal(t.window.setDailyAnswerReaction,undefined);
  const app=read('app.js'),today=read('index.html').match(/<main id="today"[\s\S]*?<\/main>/)[0];
  assert.doesNotMatch(today,/todayOutcome|data-daily-reaction/);
  assert.doesNotMatch(app,/function dailyQuestionOutcomeRuntime|window\.saveDailyQuestionOutcome/);
  assert.doesNotMatch(read('stories.js'),/wireTodayAutoClose|scheduleTodayCloseIfNeeded/);
});

module.exports={daily};
