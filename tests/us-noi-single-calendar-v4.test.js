// US Noi V4 — one user-visible Calendar, old editor authority preserved.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const html=read('index.html'),noi=read('noi-v2.js'),calendar=read('calendar.js'),css=read('noi-v2.css');
test('Noi is the only user-facing calendar; legacy launchers delegate rather than opening old overlay',()=>{
  assert.match(calendar,/if\(window\.USNoiV2\?\.openCalendar\)\{\s*window\.USNoiV2\.openCalendar\(\{date:targetDateISO,mode:arguments\[1\]\?\.mode\}\);\s*return;/);
  assert.match(noi,/openCalendar:\(\{date,mode:requestedMode\}=\{\}\)=>openMainCalendar\(date,requestedMode\)/);
  assert.match(noi,/mode=requestedMode==='week'\?'week':'calendar'/);
  assert.match(noi,/window\.go\?\.\('bond',\{nav:true\}\)/);
  assert.match(noi,/window\.closeNoiSection\?\.\(\)/);
  assert.match(html,/id="usNoiV2" aria-label="Il nostro calendario"/);
  assert.match(calendar,/function ensureNoiEditorSheets\(\)/);
  for(const id of ['usCalendarFormSheet','usCalendarDetailSheet'])assert.match(calendar,new RegExp("'"+id+"'"));
});
test('Noi add uses existing date-aware editor directly, preserving all-day, start/end, edit and reminders',()=>{
  assert.match(html,/id="usNoiV2AddTop" data-noi-add/);
  assert.equal((html.match(/class="us-noi-v2-add"[^>]*data-noi-add/g)||[]).length,1);
  assert.match(noi,/window\.UsCalendarLinks\.createForDate\(selected\)/);
  assert.match(calendar,/startCreateForDate\(dateISO\);\s*void prepareNoiEntryDate\(dateISO\)\.then/,'editor opens before waiting on reads');
  assert.match(calendar,/ensureNoiEditorSheets\(\)/);
  for(const id of ['usCalendarTitleInput','usCalendarAllDayInput','usCalendarStartTimeInput','usCalendarEndTimeInput','usCalendarFormSave','usCalendarDateInput'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(calendar,/await Promise\.all\(\[\s*fetchEntriesForRange\(coupleId,dateISO,shiftISODate\(dateISO,1\)\),\s*loadProfiles\(\),\s*loadEntryReminders\(\)/);
  assert.match(calendar,/window\.USNoiV2\?\.refresh\?\.\(\)/);
  assert.match(calendar,/function closeCalendarFormSheet\(\)/);
  assert.match(calendar,/closeCalendarDetailSheet\(\);\s*closeCalendarFormSheet\(\);\s*clearIdeaPick\(\)/,'identity changes close independent editor sheets');
  assert.match(calendar,/async function openCalendarEntry\(entryId\)/);
});
test('Lavagna week is in Noi and restores month, linked-idea picker remains date-authoritative',()=>{
  assert.match(noi,/function weekMarkup\(index\)/);
  assert.match(noi,/if\(link==='lavagna'\)\{mode='week';render\(\)/);
  assert.match(html,/id="usNoiV2WeekBack" hidden/);
  assert.match(noi,/window\.UsCalendarLinks\?\.createForIdeaDate/);
  assert.match(calendar,/async function createCalendarEntryForIdeaDate\(dateISO\)/);
  assert.match(calendar,/openIdeaForm\(pick,dateISO\)/);
  assert.match(html,/id="usNoiV2IdeaCancel"/);
});
test('Noi Phosphor icons are centered in their approved circular and square controls',()=>{
  for(const selector of ['us-noi-v2-settings','us-noi-v2-nav','us-noi-v2-add','us-noi-v2-item-icon','us-noi-v2-link-icon'])assert.ok(css.includes('.'+selector),selector);
  assert.match(css,/#bond \.us-noi-v2 \.us-noi-v2-add,[\s\S]*?display:grid;\s*place-items:center;/);
  assert.match(css,/#bond \.us-noi-v2 \.us-icon\{[\s\S]*?display:block;/);
  assert.match(html,/data-us-icon="plus"/);
  assert.doesNotMatch(html,/<span class="us-icon"\s+<img/);
});
function elem(id){
  const handlers={};
  const classes=new Set();
  return {id,hidden:false,dataset:{},innerHTML:'',textContent:'',
    classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n),toggle:(n,on)=>on?classes.add(n):classes.delete(n)},
    setAttribute(){},addEventListener:(kind,fn)=>{(handlers[kind]||=([])).push(fn);},
    emit:(kind,event)=>{for(const f of handlers[kind]||[])f(event);},
    querySelector:()=>null,scrollIntoView(){},focus(){}
  };
}
test('Noi: external date opens selected month and plus calls create on that exact date',async()=>{
  const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,elem(id));return nodes.get(id)};
  const profile={id:'u1',couple_id:'c1'};const opened=[],routes=[];
  const window={usProfile:profile,matchMedia:()=>({matches:true}),USNoiCalendarRead:{readMonth:async()=>({appointments:[],events:[],startedOn:'2020-05-15'})},UsCalendarLinks:{createForDate:date=>opened.push(date)},go:(id)=>routes.push(id),closeNoiSection(){},addEventListener(){}};
  node('bond').classList.add('active');
  const document={readyState:'complete',hidden:false,getElementById:node,querySelector:()=>null,addEventListener(){}};
  vm.runInNewContext(noi,{window,document,console:{warn(){}},MutationObserver:class{observe(){}},Promise,Date,setTimeout,Set,Map});
  window.USNoiV2.openCalendar({date:'2026-12-24'});
  assert.equal(node('usNoiV2Month').textContent,'Dicembre 2026');
  assert.equal(node('usNoiV2AddTop').getAttribute?.('aria-label'),undefined); // fake attribute intentionally ignored
  node('usNoiV2').emit('click',{target:{closest:selector=>selector==='[data-noi-add]'?{}:null}});
  assert.deepEqual(opened,['2026-12-24']);
  assert.ok(routes.includes('bond'));
});
