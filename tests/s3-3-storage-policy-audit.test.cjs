// US S3.3: isolated policy-drift tests. NO Supabase login or network.
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {checkStoragePolicies,checkBaselineDocument}
 =require('../scripts/s3-3-storage-policy-audit.cjs');
const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,
 '../docs/missions/us-store-s3-3-storage-policy-baseline-20261012.json'),'utf8'));
const copy=()=>structuredClone(baseline);
const expected='S33_STORAGE_POLICY_BASELINE_STABLE_NOT_LIVE_PROOF';
const blocked='S33_STORAGE_POLICY_DRIFT_BLOCKED';
const checkBad=change=>{
 const s=copy();
 change(s);
 const r=checkBaselineDocument(s);
 assert.equal(r.status,blocked,JSON.stringify(change.toString()));
 assert.equal(r.releaseReady,false);
 assert.equal(r.actualJwtProof,false);
};
test('all four live STAGING schema policies, roles and full SQL match pinned baseline',()=>{
 assert.equal(baseline.readonly,true);
 assert.equal(baseline.project,'dugmhngrfkuieeletatb');
 assert.equal(baseline.policies.length,4);
 assert.deepEqual(baseline.policies.map(x=>x.policyname),[
 'us_media_delete_own','us_media_insert_own_folder',
 'us_media_select_same_couple','us_media_update_own'
 ]);
 const a=checkBaselineDocument(baseline);
 assert.equal(a.status,expected);
 assert.equal(a.policyCount,4);
 assert.equal(a.releaseReady,false,'policy snapshot is NOT an actual Storage authorization pass');
 assert.equal(a.actualJwtProof,false);
});
test('a fifth permissive OR policy or removed legacy policy blocks immediately',()=>{
 checkBad(s=>s.policies.push({
  policyname:'any_user_sees_any_file',cmd:'SELECT',roles:'{public}',
  permissive:'PERMISSIVE',qual:'true',with_check:null
 }));
 checkBad(s=>s.policies.pop());
 checkBad(s=>s.policies[0]=structuredClone(s.policies[1]));
});
test('a forged OR TRUE addition cannot satisfy partial predicate checks',()=>{
 checkBad(s=>s.policies.find(p=>p.cmd==='SELECT').qual+=' OR true');
 checkBad(s=>s.policies.find(p=>p.cmd==='UPDATE').qual+=' OR (auth.uid() IS NOT NULL)');
 checkBad(s=>s.policies.find(p=>p.cmd==='INSERT').with_check+=' OR true');
 checkBad(s=>s.policies.find(p=>p.cmd==='DELETE').qual+=' OR true');
});
test('broadened roles, lost bucket guard, owner checks and uploader checks are rejected',()=>{
 checkBad(s=>s.policies[0].roles='{authenticated,anon}');
 checkBad(s=>s.policies[0].permissive='RESTRICTIVE');
 checkBad(s=>s.policies[0].cmd='SELECT');
 checkBad(s=>s.policies.find(p=>p.cmd==='SELECT').qual="true");
 checkBad(s=>s.policies.find(p=>p.cmd==='INSERT').with_check=
   s.policies.find(p=>p.cmd==='SELECT').qual);
 checkBad(s=>s.policies.find(p=>p.cmd==='UPDATE').qual=
   s.policies.find(p=>p.cmd==='SELECT').qual);
 checkBad(s=>s.policies.find(p=>p.cmd==='DELETE').qual=
   s.policies.find(p=>p.cmd==='SELECT').qual);
});
test('metadata corruption, different project or missing full policy list is blocked',()=>{
 checkBad(s=>s.readonly=false);
 checkBad(s=>s.project='iiakdfsxpywdkxravqjh');
 checkBad(s=>s.environment='US-PRODUCTION');
 checkBad(s=>s.schemaVersion=2);
 checkBad(s=>s.policies=[]);
 const empty=checkStoragePolicies(null);
 assert.equal(empty.status,blocked);
 assert.equal(empty.releaseReady,false);
});
test('the baseline cannot be described as a real Storage HTTP/JWT proof',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../scripts/s3-3-storage-policy-audit.cjs'),'utf8');
 assert.doesNotMatch(src,/createClient\(|\bfetch\(|https:\/\/|storage\.from\(/);
 assert.doesNotMatch(src,/deleteUser|auth\.admin|\.insert\(|\.update\(|\.delete\(/);
 const result=checkBaselineDocument(baseline);
 assert.match(result.status,/NOT_LIVE_PROOF/);
 assert.equal(result.actualJwtProof,false);
});
