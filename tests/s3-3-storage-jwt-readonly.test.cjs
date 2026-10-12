// S3.3 harness self-tests: synthetic fixtures, no network or real credentials.
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makePlan,runPlan,loadFromEnv,STAGING}=require('../scripts/s3-3-storage-jwt-readonly.cjs');
const ids={
 A1:'aaaaaaaa-0000-4000-8000-000000000001',
 A2:'aaaaaaaa-0000-4000-8000-000000000002',
 B1:'bbbbbbbb-0000-4000-8000-000000000001',
 B2:'bbbbbbbb-0000-4000-8000-000000000002'
};
const couples={A:'11111111-1111-4111-8111-111111111111',B:'22222222-2222-4222-8222-222222222222'};
const encode=claims=>['test',Buffer.from(JSON.stringify(claims)).toString('base64url'),'test'].join('.');
const future=()=>Math.floor(Date.now()/1000)+3600;
function fixture(){
 const accounts={};
 for(const id of Object.keys(ids))accounts[id]={
  jwt:encode({role:'authenticated',sub:ids[id],exp:future()}),
  path:couples[id[0]]+'/'+ids[id]+'/moment-albums/33333333-3333-4333-8333-333333333333/qa-'+id+'.webp'
 };
 return {confirm:'US_S33_READ_ONLY_STAGE',apikey:'sb_publishable_fake_test_key',accounts};
}
test('fail closed without confirmation, four accounts, distinct JWT users or safe object paths',()=>{
 for(const change of [
  f=>{delete f.confirm;}, f=>{f.apikey='sb_secret_not_allowed';},
  f=>{delete f.accounts.B2;}, f=>{f.accounts.B2.jwt=f.accounts.A1.jwt;},
  f=>{f.accounts.B1.path=f.accounts.A1.path;},
  f=>{f.accounts.B2.path=f.accounts.B2.path.replace(couples.B,couples.A);},
  f=>{f.accounts.A1.path+='?download=true';},
  f=>{f.accounts.A1.jwt=encode({role:'service_role',sub:ids.A1,exp:future()});},
  f=>{f.accounts.A1.jwt=encode({role:'authenticated',sub:ids.A1,exp:1});}
 ]){
  const f=fixture();change(f);
  assert.throws(()=>makePlan(f),/S33_BLOCKED_/);
 }
});
test('24 GET-only checks: 8 same-couple allow, 8 cross-couple + 8 anonymous/public deny',async()=>{
 const plan=makePlan(fixture());
 assert.equal(plan.checks.length,24);
 const calls=[];
 const fakeFetch=async(url,opts)=>{
  assert.equal(opts.method,'GET');
  assert.equal(opts.redirect,'manual');
  assert.ok(url.startsWith(STAGING+'/storage/v1/object/'));
  assert.ok(!url.includes('iiakdfsxpywdkxravqjh'));
  calls.push({url,opts});
  const object=Object.keys(ids).find(id=>url.endsWith('/'+plan.accounts[id].path));
  const viewer=Object.keys(ids).find(id=>opts.headers.authorization==='Bearer '+plan.accounts[id].jwt);
  const allow=viewer&&plan.accounts[viewer].couple===plan.accounts[object].couple
     &&url.includes('/object/authenticated/');
  return {status:allow?200:403,body:{cancel:async()=>{}}};
 };
 const result=await runPlan(plan,{fetchImpl:fakeFetch});
 assert.deepEqual([result.checked,result.expectedAllow,result.expectedDeny],[24,8,16]);
 assert.equal(result.deletionEnabled,false);
 assert.equal(calls.length,24);
 assert.ok(calls.every(c=>c.opts.method==='GET'));
 assert.ok(calls.filter(c=>c.url.includes('/object/public/')).every(c=>!c.opts.headers.authorization));
});
test('any unauthorized success, missing same-couple asset or network failure blocks proof',async()=>{
 const plan=makePlan(fixture());
 await assert.rejects(runPlan(plan,{fetchImpl:async()=>({status:200,body:{cancel:async()=>{}}})}),/S33_BLOCKED_ACCESS_MATRIX_MISMATCH/);
 await assert.rejects(runPlan(plan,{fetchImpl:async()=>({status:404,body:{cancel:async()=>{}}})}),/S33_BLOCKED_ACCESS_MATRIX_MISMATCH/);
 await assert.rejects(runPlan(plan,{fetchImpl:async()=>{throw Error('NETWORK_DOWN')}}),/NETWORK_DOWN/);
});
test('no secret/env fixtures silently defaults to a fake passed live test',()=>{
 const vars=loadFromEnv({});
 assert.equal(vars.apikey,undefined);
 assert.equal(vars.confirm,undefined);
 assert.throws(()=>makePlan(vars),/S33_BLOCKED_/);
});
