const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
const start = source.indexOf('function resolveUsIdentity(');
const end = source.indexOf('\nfunction usIdentity()', start);
const resolve = start < 0 ? () => ({}) : vm.runInNewContext(`(${source.slice(start, end)})`);
const rows = (couple, names) => names.map((display_name, i) => ({id: `${couple}${i}`, couple_id: couple, role: i ? 'beatrice' : 'francesco', display_name}));
for (const names of [['Francesco','Beatrice'], ['Sam','Alex'], ['Alex','Anna']]) {
  test(`D5 resolves actual members ${names.join('/')}`, () => {
    const profiles = rows('b', names);
    const result = resolve({viewerId:'b0',coupleId:'b',profiles: [...rows('a',['Private','Secret']), ...profiles]});
    assert.equal(result.ownName, names[0]);
    assert.equal(result.partnerName, names[1]);
    assert.equal(result.nameForRole('beatrice'), names[1]);
    assert.equal(result.pairLabel, names.join(' + '));
    assert.notEqual(result.initialForRole('francesco'), result.initialForRole('beatrice'));
  });
}
test('D5 logged out, missing viewer and switched tenant stay neutral', () => {
  for (const input of [{}, {viewerId:'b0',coupleId:'b',profiles:rows('a',['Francesco','Beatrice'])}]) {
    const result=resolve(input);
    assert.equal(result.ownName,'Tu');
    assert.equal(result.partnerName,'La tua persona');
    assert.equal(result.pairLabel,'Voi due');
  }
});
test('D5 one member does not guess a partner by role', () => {
  const result=resolve({viewerId:'b0',coupleId:'b',profiles:rows('b',['Sam'])});
  assert.equal(result.partnerName,'La tua persona');
  assert.equal(result.nameForRole('beatrice'),'La tua persona');
});
test('D5 names remain data; HTML sinks must escape them', () => {
  const name='<img src=x onerror=alert(1)>';
  const result=resolve({viewerId:'b0',coupleId:'b',profiles:rows('b',[name,'Sam'])});
  assert.equal(result.ownName,name);
});

function runtime(options={}){
  let release;
  const pending=new Promise(r=>{release=r;});
  const window={dispatchEvent(){},addEventListener(){}};
  const chain={select(){return this;},eq(){return this;},maybeSingle(){return pending.then(()=>({data:{id:'b'},error:null}));},order(){return pending.then(()=>{if(options.failure)throw new Error('offline');return {data:rows('b',['Alex','Sam']),error:null};});}};
  const ctx=vm.createContext({window,document:{getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return [];}},CustomEvent:class{},sb:{from(){return chain;}},updateTogetherDays(){},console});
  vm.runInContext(source.slice(start,source.indexOf("window.addEventListener('us-app-lock-change'",start)),ctx);
  return {ctx,window,release};
}
test('D5 late hydration cannot revive names after logout',async()=>{
  const {ctx,window,release}=runtime();
  window.usProfile={id:'b0',couple_id:'b'};
  const pending=window.UsCoupleContext.hydrate();
  window.usProfile=null;window.UsCoupleContext.clear();release();await pending;
  assert.equal(window.UsIdentity.current().pairLabel,'Voi due');
  assert.equal(window.UsCoupleContext.snapshot().profiles.length,0);
});
test('D5 in-place couple switch invalidates delayed response',async()=>{
  const {window,release}=runtime();
  window.usProfile={id:'b0',couple_id:'b'};
  const pending=window.UsCoupleContext.hydrate();window.usProfile.couple_id='a';release();await pending;
  assert.equal(window.UsIdentity.current().partnerName,'La tua persona');
});
test('D5 successful late arrival and app lock presentation',async()=>{
  const {window,release}=runtime();
  window.usProfile={id:'b0',couple_id:'b'};
  const pending=window.UsCoupleContext.hydrate();
  assert.equal(window.UsIdentity.current().partnerName,'La tua persona');
  release();await pending;
  assert.equal(window.UsIdentity.current().partnerName,'Sam');
  window.UsAppLock={isLocked:()=>true};
  assert.equal(window.UsIdentity.current().pairLabel,'Voi due');
});
test('D5 late Think reactions cannot update a replacement session',async()=>{
  let release;const pending=new Promise(r=>{release=r;});
  const viewer={id:'b0',couple_id:'b'};
  const window={usProfile:viewer};
  const builder={select(){return this;},eq(){return this;},order(){return this;},gte(){return this;},limit(){return this;},then(ok){return Promise.resolve({data:[{id:'msg'}],count:1,error:null}).then(ok);}};
  const ctx=vm.createContext({window,partnerFromProfiles:()=>null,getCoupleProfiles:async()=>rows('b',['Alex','Sam']),sb:{from(table){return table==='think_reactions'?{select(){return this;},in(){return pending;}}:builder;}},console,Date});
  const a=source.indexOf('async function hydrateThink(){'),b=source.indexOf('window.hydrateThink=hydrateThink;',a);
  vm.runInContext(source.slice(a,b),ctx);
  const task=vm.runInContext('hydrateThink()',ctx);
  await new Promise(r=>setImmediate(r));window.usProfile=null;release({data:[],error:null});
  await assert.doesNotReject(task);
});
test('D5 failed refresh removes cached names and stays usable offline',async()=>{
  const options={}, {window,release}=runtime(options);
  window.usProfile={id:'b0',couple_id:'b'};
  const pending=window.UsCoupleContext.hydrate();release();await pending;
  assert.equal(window.UsIdentity.current().partnerName,'Sam');
  options.failure=true;
  await assert.doesNotReject(window.UsCoupleContext.hydrate());
  assert.equal(window.UsIdentity.current().partnerName,'La tua persona');
});
