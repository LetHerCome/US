// Fully mocked S3.3 setup contract. No real JWTs, passwords, SQL, Storage or network.
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateConfig,prepareAndVerify,isCollision,FIXTURE_MOMENT}
  =require('../scripts/s3-3-seed-and-verify-stage.cjs');
const {STAGING}=require('../scripts/s3-3-storage-jwt-readonly.cjs');
const ids={
 A1:'aaaaaaaa-0000-4000-8000-000000000001',
 A2:'aaaaaaaa-0000-4000-8000-000000000002',
 B1:'bbbbbbbb-0000-4000-8000-000000000001',
 B2:'bbbbbbbb-0000-4000-8000-000000000002'
};
const couples={A:'11111111-1111-4111-8111-111111111111',B:'22222222-2222-4222-8222-222222222222'};
const actors=Object.keys(ids);
const mkJwt=actor=>['header',Buffer.from(JSON.stringify({
 role:'authenticated',iss:STAGING+'/auth/v1',aud:'authenticated',
 sub:ids[actor],exp:Math.floor(Date.now()/1000)+3600
})).toString('base64url'),'signature'].join('.');
function cfg(){
 const env={
  US_S33_SEED_CONFIRM:'US_S33_SYNTHETIC_STAGE_ONLY',
  US_S33_QA_ATTESTATION:'FOUR_INDEPENDENT_SYNTHETIC_QA_ACCOUNTS',
  US_S33_STAGING_PUBLISHABLE_KEY:'sb_publishable_s33_unprivileged_test_key'
 };
 for(const actor of actors){
  env['US_S33_'+actor+'_EMAIL']='synthetic-'+actor.toLowerCase()+'@qa.invalid';
  env['US_S33_'+actor+'_PASSWORD']='private-test-only-'+actor;
 }
 return env;
}
function fakeSetup({wrongCouple=false,wrongIdentity=false,tamperFreshUpload=false}={}){
 const store=new Map(),events=[],clients=[];
 function createClient(url,key,opts){
  events.push('client');
  assert.equal(url,STAGING);
  assert.match(key,/^sb_publishable_/);
  assert.equal(opts.auth.persistSession,false);
  assert.equal(opts.auth.autoRefreshToken,false);
  assert.equal(opts.auth.detectSessionInUrl,false);
  const actor=actors[clients.length]; assert.ok(actor);
  const config=cfg(),email=config['US_S33_'+actor+'_EMAIL'];
  const instance={
   auth:{
    signInWithPassword:async({email:input,password})=>{
     events.push('login:'+actor);
     assert.equal(input,email);
     assert.equal(password,config['US_S33_'+actor+'_PASSWORD']);
     return {data:{session:{access_token:mkJwt(actor)},user:{id:ids[actor]}},error:null};
    },
    getUser:async()=>{
     events.push('auth:'+actor);
     return {data:{user:{id:wrongIdentity&&actor==='B2'?ids.A1:ids[actor],
       email,email_confirmed_at:'2026-10-12T00:00:00Z'}},error:null};
    }
   },
   from:table=>{
    assert.equal(table,'profiles');
    return {select:fields=>{
     assert.equal(fields,'id,couple_id');
     return {eq:(column,value)=>{
      assert.equal(column,'id');assert.equal(value,ids[actor]);
      return {single:async()=>{
       events.push('profile:'+actor);
       return {data:{id:ids[actor],couple_id:wrongCouple&&actor==='B2'?couples.A:couples[actor[0]]},error:null};
      }};
     }};
    }};
   },
   storage:{from:bucket=>{
    assert.equal(bucket,'us-media');
    return {
     upload:async(path,buffer,opts)=>{
      events.push('upload:'+actor);
      assert.match(path,/\/moment-albums\//);
      assert.match(path,/s33-qa-[ab][12]-v1\.png$/);
      assert.equal(opts.upsert,false);
      assert.equal(opts.contentType,'image/png');
      assert.equal(opts.cacheControl,'0');
      assert.ok(Buffer.isBuffer(buffer));
      assert.ok(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
      if(store.has(path))return {error:{statusCode:'400',message:'Asset Already Exists'}};
      store.set(path,tamperFreshUpload&&actor==='A1'
        ?Buffer.from('corrupted-after-upload'):Buffer.from(buffer));
      return {data:{path},error:null};
     },
     download:async(path)=>{
      events.push('download:'+actor);
      const v=store.get(path);
      if(!v)return {data:null,error:{message:'not found'}};
      return {data:{arrayBuffer:async()=>Uint8Array.from(v).buffer},error:null};
     }
    };
   }}
  };
  clients.push(instance);
  return instance;
 }
 const verify=async plan=>{
  events.push('verify');
  assert.equal(plan.checks.length,24);
  assert.equal(plan.accounts.A1.couple,plan.accounts.A2.couple);
  assert.equal(plan.accounts.B1.couple,plan.accounts.B2.couple);
  assert.notEqual(plan.accounts.A1.couple,plan.accounts.B1.couple);
  assert.ok(actors.every(actor=>plan.accounts[actor].path.includes(FIXTURE_MOMENT)));
  return {status:'S33_READONLY_JWT_MATRIX_PASS',checked:24,
   authVerified:4,expectedAllow:8,expectedDeny:16};
 };
 return {store,events,clients,createClient,verify};
}
test('explicit local synthetic QA attestation and four distinct logins before any network',()=>{
 for(const bad of [
  e=>delete e.US_S33_SEED_CONFIRM,
  e=>delete e.US_S33_QA_ATTESTATION,
  e=>e.US_S33_STAGING_PUBLISHABLE_KEY='sb_secret_fake',
  e=>delete e.US_S33_B2_EMAIL,
  e=>e.US_S33_B2_EMAIL=e.US_S33_A1_EMAIL,
  e=>e.US_S33_A1_PASSWORD=''
 ]){
  const env=cfg();bad(env);
  assert.throws(()=>validateConfig(env),/S33_SEED_BLOCKED_/);
 }
});
test('four login + memberships before first write; then 4 non-upsert synthetic uploads and matrix',async()=>{
 const env=cfg(),fixture=fakeSetup();
 const result=await prepareAndVerify(validateConfig(env),
  {createClientImpl:fixture.createClient,runPlanImpl:fixture.verify});
 assert.equal(result.status,'S33_STAGE_FIXTURES_AND_READONLY_MATRIX_PASS');
 assert.equal(result.created,4);assert.equal(result.reused,0);
 assert.equal(result.remoteFixtureBytesVerified,4);
 assert.equal(result.checked,24);assert.equal(result.filesDeleted,0);
 assert.equal(result.overwrites,0);assert.equal(result.accountDeletionEnabled,false);
 assert.equal(result.productionChanged,false);
 assert.equal(fixture.store.size,4);
 assert.equal(fixture.events.filter(x=>x.startsWith('login:')).length,4);
 assert.equal(fixture.events.filter(x=>x.startsWith('upload:')).length,4);
 assert.equal(fixture.events.filter(x=>x.startsWith('download:')).length,4);
 assert.ok(fixture.events.indexOf('download:B2')<fixture.events.indexOf('verify'),
  'all four remote SHA-256 checks must finish before the JWT matrix');
 assert.ok(fixture.events.indexOf('profile:B2')<fixture.events.indexOf('upload:A1'));
 assert.equal(fixture.events.at(-1),'verify');
 assert.doesNotMatch(JSON.stringify(result),/email|password|token|jwt|path|couple_id/i);
});
test('safe rerun only reuses four byte-identical QA objects, never upserts',async()=>{
 const env=validateConfig(cfg()),fixture=fakeSetup();
 await prepareAndVerify(env,{createClientImpl:fixture.createClient,runPlanImpl:fixture.verify});
 // Reset client count to return a new set of four isolated clients.
 fixture.clients.length=0;
 const result=await prepareAndVerify(env,
  {createClientImpl:fixture.createClient,runPlanImpl:fixture.verify});
 assert.deepEqual([result.created,result.reused,fixture.store.size],[0,4,4]);
 assert.equal(result.remoteFixtureBytesVerified,4);
 assert.equal(fixture.events.filter(x=>x.startsWith('download:')).length,8);
});
test('mismatched couple or claimed Auth identity cannot create any Storage file',async()=>{
 for(const flags of [{wrongCouple:true},{wrongIdentity:true}]){
  const fixture=fakeSetup(flags);
  await assert.rejects(prepareAndVerify(validateConfig(cfg()),
   {createClientImpl:fixture.createClient,runPlanImpl:fixture.verify}),
   /S33_SEED_BLOCKED_|S33_BLOCKED_/);
  assert.equal(fixture.events.filter(x=>x.startsWith('upload:')).length,0);
  assert.equal(fixture.store.size,0);
 }
});
test('existing conflicting image is rejected, no overwrite or false verification',async()=>{
 const fixture=fakeSetup();
 await prepareAndVerify(validateConfig(cfg()),
  {createClientImpl:fixture.createClient,runPlanImpl:fixture.verify});
 const path=[...fixture.store.keys()].find(x=>x.includes('/'+ids.A1+'/'));
 fixture.store.set(path,Buffer.from('malicious preexisting data'));
 fixture.clients.length=0;
 const before=fixture.events.filter(x=>x==='verify').length;
 await assert.rejects(prepareAndVerify(validateConfig(cfg()),
  {createClientImpl:fixture.createClient,runPlanImpl:fixture.verify}),
  /S33_SEED_BLOCKED_QA_EXISTING_OBJECT_NOT_IDENTICAL/);
 assert.equal(fixture.events.filter(x=>x==='verify').length,before);
 assert.equal(fixture.store.size,4);
});
test('fresh-upload remote byte corruption blocks the JWT access matrix',async()=>{
 const fixture=fakeSetup({tamperFreshUpload:true});
 await assert.rejects(prepareAndVerify(validateConfig(cfg()),
  {createClientImpl:fixture.createClient,runPlanImpl:fixture.verify}),
  /S33_SEED_BLOCKED_QA_UPLOADED_OBJECT_NOT_IDENTICAL/);
 assert.equal(fixture.events.filter(x=>x==='verify').length,0);
 assert.equal(fixture.events.filter(x=>x.startsWith('upload:')).length,1);
 assert.equal(fixture.events.filter(x=>x.startsWith('download:')).length,1);
});
test('an incomplete or falsely reported GET gate is never considered successful',async()=>{
 const fixture=fakeSetup();
 await assert.rejects(prepareAndVerify(validateConfig(cfg()),
  {createClientImpl:fixture.createClient,runPlanImpl:async()=>({
   status:'S33_READONLY_JWT_MATRIX_PASS',checked:23,authVerified:4,expectedAllow:8,expectedDeny:16
  })}),/S33_SEED_BLOCKED_LIVE_GET_MATRIX_NOT_VERIFIED/);
});
test('only an actual file collision is eligible for identical-byte reuse',()=>{
 assert.equal(isCollision({statusCode:'400',message:'Asset Already Exists'}),true);
 assert.equal(isCollision({statusCode:'400',message:'Invalid upload path'}),false);
 assert.equal(isCollision({statusCode:'403',message:'Asset Already Exists'}),false);
 assert.equal(isCollision({statusCode:'409',message:'Duplicate object'}),true);
});
