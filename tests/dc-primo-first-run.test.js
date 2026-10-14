// Due colori — first run (dc-primo): tour gating, the birthday written once,
// the phone setup after pairing and the split of the onboarding steps.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const OB=require('../onboarding.js');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function memory(initial={}){
  const map=new Map(Object.entries(initial));
  return {map,getItem:key=>map.has(key)?map.get(key):null,setItem:(key,value)=>{map.set(key,String(value));},removeItem:key=>{map.delete(key);}};
}
const broken={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
const K=OB.FIRST_RUN_KEYS;
const profile={id:'u1',couple_id:'c1',display_name:' Mira ',role:'francesco'};

test('first run: the tour is only for a phone where nobody has signed in',()=>{
  assert.equal(OB.tourWanted(memory()),true);
  assert.equal(OB.tourWanted(memory({[K.tourSeen]:'1'})),false);
  assert.equal(OB.tourWanted(memory({[K.deviceProfile]:JSON.stringify({id:'f1',couple_id:'c1'})})),false);
  assert.equal(OB.tourWanted(memory({[K.deviceProfile]:'{not json'})),true);
  assert.equal(OB.tourWanted(broken),true);
  assert.equal(K.tourSeen,'us:tour:v1:seen');assert.equal(K.deviceProfile,'us:fix4:last-profile');
});

test('first run: birthday day and month are both optional together and must exist',()=>{
  assert.deepEqual(OB.birthdayCheck('',''),{ok:true,value:null});
  assert.equal(OB.birthdayCheck('12','').ok,false);assert.equal(OB.birthdayCheck('','3').ok,false);
  assert.equal(OB.birthdayCheck('31','4').ok,false);assert.equal(OB.birthdayCheck('30','2').ok,false);
  assert.deepEqual(OB.birthdayCheck('29','2'),{ok:true,value:{day:29,month:2}});
  assert.deepEqual(OB.birthdayCheck(12,3),{ok:true,value:{day:12,month:3}});
});

test('first run: next birthday in Rome counts today and waits for a leap year for 29 February',()=>{
  assert.equal(OB.nextBirthday(14,10,'2026-10-14'),'2026-10-14');
  assert.equal(OB.nextBirthday(13,10,'2026-10-14'),'2027-10-13');
  assert.equal(OB.nextBirthday(12,3,'2026-10-14'),'2027-03-12');
  assert.equal(OB.nextBirthday(31,12,'2026-10-14'),'2026-12-31');
  assert.equal(OB.nextBirthday(29,2,'2026-10-14'),'2028-02-29');
  assert.equal(OB.nextBirthday(29,2,'2028-02-29'),'2028-02-29');
  assert.equal(OB.nextBirthday(29,2,'2028-03-01'),'2032-02-29');
  assert.equal(OB.nextBirthday(29,2,'2096-03-01'),'2104-02-29');
  assert.equal(OB.nextBirthday(31,4,'2026-10-14'),null);
  // "today" is Rome's date: 23:30 UTC on 13 October is already the 14th in Rome.
  assert.equal(OB.nextBirthday(14,10,OB.romeToday(new Date('2026-10-13T23:30:00Z'))),'2026-10-14');
});

test('first run: the birthday event has exactly the eight columns events.js writes',()=>{
  const row=OB.birthdayEvent({name:' Mira ',day:12,month:3,profile,today:'2026-10-14'});
  assert.deepEqual(row,{title:'Compleanno di Mira',event_date:'2027-03-12',event_time:null,location:null,note:null,recurs_yearly:true,couple_id:'c1',created_by:'u1'});
  assert.deepEqual(Object.keys(row).sort(),['couple_id','created_by','event_date','event_time','location','note','recurs_yearly','title']);
  assert.equal(OB.birthdayEvent({name:'',day:12,month:3,profile,today:'2026-10-14'}),null);
  assert.equal(OB.birthdayEvent({name:'Mira',day:12,month:3,profile:{id:'u1'},today:'2026-10-14'}),null);
});

test('first run: the birthday is inserted at most once per user and the pending value is cleared',async()=>{
  const local=memory(),session=memory(),rows=[];
  const insertEvent=async row=>{assert.equal(local.getItem(K.birthdaySaved('u1')),'1','marker is written before the request');rows.push(row);return {data:null,error:null};};
  assert.deepEqual(await OB.saveBirthday({profile,local,session,insertEvent,today:'2026-10-14'}),{ok:false,kind:'none'});
  assert.equal(OB.rememberBirthday(session,'u1',{day:12,month:3}),true);
  assert.equal(session.getItem(K.birthdayPending('u1')),'{"day":12,"month":3}');
  // No couple yet: nothing is written and the value waits.
  assert.deepEqual(await OB.saveBirthday({profile:{...profile,couple_id:null},local,session,insertEvent,today:'2026-10-14'}),{ok:false,kind:'skipped'});
  assert.ok(session.getItem(K.birthdayPending('u1')));
  const first=await OB.saveBirthday({profile,local,session,insertEvent,today:'2026-10-14'});
  assert.equal(first.ok,true);assert.equal(rows.length,1);assert.equal(rows[0].title,'Compleanno di Mira');
  assert.equal(session.getItem(K.birthdayPending('u1')),null);
  OB.rememberBirthday(session,'u1',{day:1,month:1});
  assert.deepEqual(await OB.saveBirthday({profile,local,session,insertEvent,today:'2026-10-14'}),{ok:false,kind:'already'});
  assert.equal(rows.length,1);assert.equal(session.getItem(K.birthdayPending('u1')),null);
  // Another user on the same phone has a separate marker.
  OB.rememberBirthday(session,'u2',{day:2,month:2});
  await OB.saveBirthday({profile:{id:'u2',couple_id:'c1',display_name:'Nico'},local,session,insertEvent,today:'2026-10-14'});
  assert.equal(rows.length,2);assert.equal(rows[1].created_by,'u2');
  // Clearing the choice removes it.
  OB.rememberBirthday(session,'u3',{day:3,month:3});OB.rememberBirthday(session,'u3',null);
  assert.equal(session.getItem(K.birthdayPending('u3')),null);
});

test('first run: a failed birthday insert is best effort and never retried',async()=>{
  const local=memory(),session=memory();let calls=0;
  OB.rememberBirthday(session,'u1',{day:12,month:3});
  const failing=async()=>{calls++;return {error:{message:'offline'}};};
  assert.deepEqual(await OB.saveBirthday({profile,local,session,insertEvent:failing,today:'2026-10-14'}),{ok:false,kind:'error'});
  OB.rememberBirthday(session,'u1',{day:12,month:3});
  assert.deepEqual(await OB.saveBirthday({profile,local,session,insertEvent:async()=>{throw Error('x');},today:'2026-10-14'}),{ok:false,kind:'already'});
  assert.equal(calls,1);
  // Without storage the marker cannot be kept, so nothing is sent.
  let sent=0;const session2=memory();OB.rememberBirthday(session2,'u9',{day:1,month:5});
  assert.deepEqual(await OB.saveBirthday({profile:{...profile,id:'u9'},local:broken,session:session2,insertEvent:async()=>{sent++;},today:'2026-10-14'}),{ok:false,kind:'storage'});
  assert.equal(sent,0);
});

test('first run: the phone setup opens once per user, only after onboarding here or a password sign-in',()=>{
  const local=memory(),session=memory();
  assert.equal(OB.setupMode({userId:'u1',local,session}),null,'a session restored at launch gets nothing');
  local.setItem(K.setupPending('u1'),'created');assert.equal(OB.setupMode({userId:'u1',local,session}),'created');
  local.setItem(K.setupPending('u1'),'joined');assert.equal(OB.setupMode({userId:'u1',local,session}),'joined');
  assert.equal(OB.setupMode({userId:'u2',local,session}),null);
  session.setItem(K.passwordSignIn,'u2');assert.equal(OB.setupMode({userId:'u2',local,session}),'device');
  assert.equal(OB.setupMode({userId:'u3',local,session}),null,'the sign-in belongs to one account');
  local.setItem(K.setupDone('u1'),'1');local.setItem(K.setupDone('u2'),'1');
  assert.equal(OB.setupMode({userId:'u1',local,session}),null);assert.equal(OB.setupMode({userId:'u2',local,session}),null);
  assert.equal(OB.setupMode({userId:'',local,session}),null);
  assert.equal(OB.setupMode({userId:'u1',local:broken,session:broken}),null);
});

test('first run: setup steps follow the order and skip what is already done',()=>{
  assert.deepEqual(OB.setupSteps({mode:'created',push:true,place:true}),['noi','push','place','ready']);
  assert.deepEqual(OB.setupSteps({mode:'joined',push:false,place:true}),['color','place','ready']);
  assert.deepEqual(OB.setupSteps({mode:'joined',push:false,place:false}),['color','ready']);
  assert.deepEqual(OB.setupSteps({mode:'device',push:true,place:false}),['push','ready']);
  assert.deepEqual(OB.setupSteps({mode:'device',push:false,place:false}),[]);
  assert.deepEqual(OB.setupSteps({mode:null,push:true,place:true}),[]);
});

test('first run: notifications are skipped when unsupported, active or unavailable',async()=>{
  assert.deepEqual(await OB.pushStepState(undefined),{wanted:false,kind:'unsupported'});
  assert.deepEqual(await OB.pushStepState({supported:()=>false,getState:async()=>({kind:'inactive'})}),{wanted:false,kind:'unsupported'});
  const with_=kind=>({supported:()=>true,getState:async()=>({supported:true,kind})});
  assert.equal((await OB.pushStepState(with_('active'))).wanted,false);
  assert.equal((await OB.pushStepState(with_('unavailable'))).wanted,false);
  assert.equal((await OB.pushStepState(with_('inactive'))).wanted,true);
  assert.equal((await OB.pushStepState(with_('denied'))).wanted,true);
  assert.equal((await OB.pushStepState({supported:()=>true,getState:async()=>{throw Error('x');}})).wanted,false);
});

test('first run: position is skipped when sharing is already on or cannot start',()=>{
  const location=sharing=>({start(){return true;},isSharing:()=>sharing});
  assert.equal(OB.placeStepWanted(location(false),true),true);
  assert.equal(OB.placeStepWanted(location(true),true),false);
  assert.equal(OB.placeStepWanted(location(false),false),false);
  assert.equal(OB.placeStepWanted({isSharing:()=>false},true),false);
  assert.equal(OB.placeStepWanted(undefined,true),false);
});

test('first run: summary helpers',()=>{
  assert.equal(OB.daysTogether('2026-10-01',new Date(2026,9,14,12)),13);
  assert.equal(OB.daysTogether('',new Date()),null);
  assert.equal(OB.inviteExpiry('2026-10-16T12:03:00Z'),'scade il 16 ottobre alle 14:03');
  assert.equal(OB.inviteExpiry('nope'),'');
});

test('first run: the step split keeps the controller fields and the only new write is the birthday',()=>{
  const html=read('index.html'),app=read('app.js'),ob=read('onboarding.js');
  const onboarding=html.match(/<section[^>]+id="usOnboarding"[\s\S]*?<\/section>/)?.[0]||'';
  assert.match(onboarding,/<form id="mc3Me"[^>]*hidden/);
  assert.match(onboarding,/<input id="mc3Name"[^>]*required>/);
  assert.match(onboarding,/<label[^>]*for="mc3CreateName" hidden>/);assert.match(onboarding,/<label[^>]*for="mc3JoinName" hidden>/);
  assert.match(onboarding,/id="mc3BirthDay"/);assert.match(onboarding,/id="mc3BirthMonth"/);
  for(const id of ['mc3CreateName','mc3JoinName','mc3Date','mc3CoupleName','mc3JoinCode','mc3ChooseCreate','mc3ChooseJoin','mc3Color','mc3ColorNext','mc3Waiting','mc3Generate','mc3CopyCode','mc3Revoke','mc3Refresh','mc3Retry','mc3Exit'])assert.match(onboarding,new RegExp(`id="${id}"`),id);
  // The controller still reads the create/join name fields, filled from "Tu".
  assert.match(ob,/controller\.create\(\{name:node\('mc3CreateName'\)\.value/);
  assert.match(ob,/name:node\('mc3JoinName'\)\.value,code:node\('mc3JoinCode'\)\.value/);
  assert.match(ob,/node\('mc3CreateName'\)\.value=me\.name/);assert.match(ob,/node\('mc3JoinName'\)\.value=me\.name/);
  // No Supabase client in onboarding.js; the one insert is wired in app.js.
  assert.doesNotMatch(ob,/\bsb\.|supabase|\.from\('/);
  assert.match(app,/insertEvent:row=>sb\.from\('shared_events'\)\.insert\(row\)/);
  assert.equal((app.match(/from\('shared_events'\)\.insert/g)||[]).length,1);
  // The tour, the setup overlay and the lock screen keep their hooks.
  assert.match(html,/<section class="us-tour" id="usTour"[^>]*hidden/);
  assert.match(html,/id="usDeviceSetup" role="dialog" aria-modal="true"/);
  assert.doesNotMatch(read('public-auth.js'),/localStorage|sessionStorage/);
  // The location step reuses the confirmed half of the existing disclosure.
  assert.match(app,/function startLocationSharing\(\)\{\s*setLocationConsent\(true\);/);
  assert.match(app,/if\(!ok\)return false;\s*return startLocationSharing\(\);/);
});
