import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EXPORT_DOMAINS, MAX_ROWS_PER_DOMAIN, MAX_RESPONSE_BYTES,
  buildPersonalExport, classifyExportError
} from '../supabase/functions/_shared/s3-2-export-core.mjs';

const ownerId='e8c90d50-81e9-4a0d-beeb-5886c63c4963';
const partnerId='01d5fe3d-1e8e-4872-b453-01918de88893';
const coupleId='46155127-5742-42d0-8195-5f6d0992ae7b';
const anotherCouple='7e4ff7be-f3f3-44aa-ac8d-b587375e81a4';
const rowId='40e0af3a-f851-46e1-93ab-cc710d10c901';
const forbiddenSecret='DELIBERATELY_PRIVATE_TOKEN_VALUE';
const fakeRow=(spec)=>{
  const row={};
  for(const key of spec.fields)row[key]=null;
  if(spec.fields.includes('id'))row.id=rowId;
  row[spec.owner]=ownerId;
  if(spec.tenant)row.couple_id=coupleId;
  return row;
};
const baseData=()=>Object.fromEntries(EXPORT_DOMAINS.map(def=>[def.table,[fakeRow(def)]]));
const generate=rowsByDomain=>buildPersonalExport({
  ownerId,coupleId,email:'own@example.invalid',
  generatedAt:'2026-10-12T00:05:00.000Z',
  profile:{id:ownerId,couple_id:coupleId},
  rowsByDomain
});
const expectBlocked=(fn,match)=>assert.throws(fn,e=>e instanceof Error&&
  (typeof match==='string'?e.code===match:true));
const read=(file)=>fs.readFileSync(new URL(file,import.meta.url),'utf8');

test('strict owner-only export contains 14 domains without partner secrets',()=>{
  assert.equal(EXPORT_DOMAINS.length,14);
  const data=baseData();
  data.moments[0].caption='Own lovely memory';
  data.moments[0].storage_path=forbiddenSecret;
  data.moments[0].thumbnail_path=forbiddenSecret;
  data.profiles[0].avatar_path=forbiddenSecret;
  data.left_for_you[0].media_path=forbiddenSecret;
  data.shared_messages[0].body='Text sent by the requesting user';
  data.shared_messages[0].recipient_id=partnerId;
  data.daily_answers[0].answer='My own private answer';
  data.moments[0].service_role=forbiddenSecret;
  const exportData=generate(data);
  assert.equal(exportData.schemaVersion,1);
  assert.equal(exportData.scope,'SELF_AUTHORED_FIRST_STAGE');
  assert.equal(exportData.executableDeletion,false);
  assert.equal(exportData.mediaBinaryIncluded,false);
  assert.equal(exportData.data.moments[0].caption,'Own lovely memory');
  assert.equal(exportData.data.shared_messages[0].recipient_id,partnerId);
  assert.equal(exportData.data.daily_answers[0].answer,'My own private answer');
  assert.deepEqual(Object.keys(exportData.data),EXPORT_DOMAINS.map(x=>x.table));
  const str=JSON.stringify(exportData);
  assert.doesNotMatch(str,/DELIBERATELY_PRIVATE_TOKEN_VALUE|service_role|password_hash|refresh_token=|session_token=/i);
  assert.ok(exportData.exclusions.includes('media_binary_and_download_urls'));
  assert.ok(exportData.exclusions.includes('partner_authored_or_unreviewed_shared_content'));
});

test('throws on any unexpected other-couple record, not partial export',()=>{
  const data=baseData();
  data.moments[0].couple_id=anotherCouple;
  expectBlocked(()=>generate(data),'export_tenant_mismatch');
  data.moments[0].couple_id=coupleId;
  data.shared_messages[0].sender_id=partnerId;
  expectBlocked(()=>generate(data),'export_owner_mismatch');
  data.shared_messages[0].sender_id=ownerId;
  data.profiles[0].id=partnerId;
  expectBlocked(()=>generate(data),'export_owner_mismatch');
});

test('missing or corrupt fields reject rather than export a truncated dataset',()=>{
  const data=baseData();
  delete data.moods[0].mood_date;
  expectBlocked(()=>generate(data),'export_missing_required_field');
  data.moods[0].mood_date={unexpected:'object'};
  expectBlocked(()=>generate(data),'export_unexpected_field_type');
  data.moods=[null];
  expectBlocked(()=>generate(data),'export_record_invalid');
  data.moods=[fakeRow(EXPORT_DOMAINS.find(x=>x.table==='moods'))];
  delete data.calendar_entries;
  expectBlocked(()=>generate(data),'export_domain_missing');
});

test('rejects large row sets and data payloads; never silently returns first page',()=>{
  const data=baseData();
  data.moments=Array.from({length:MAX_ROWS_PER_DOMAIN+1},()=>fakeRow(EXPORT_DOMAINS.find(x=>x.table==='moments')));
  expectBlocked(()=>generate(data),'export_too_large');
  const more=baseData();
  more.moments[0].caption='x'.repeat(MAX_RESPONSE_BYTES+1);
  expectBlocked(()=>generate(more),'export_too_large');
});

test('unauthorized caller, missing verified profile and invalid email fail closed',()=>{
  const data=baseData();
  expectBlocked(()=>buildPersonalExport({
    ownerId:partnerId,coupleId,email:'p@example.invalid',profile:{id:ownerId,couple_id:coupleId},
    rowsByDomain:data,generatedAt:'2026-10-12T00:00:00Z'
  }),'export_identity_invalid');
  expectBlocked(()=>buildPersonalExport({
    ownerId,coupleId,email:'not-email',profile:{id:ownerId,couple_id:coupleId},
    rowsByDomain:data,generatedAt:'2026-10-12T00:00:00Z'
  }),'export_email_invalid');
  expectBlocked(()=>buildPersonalExport({
    ownerId,coupleId,email:'own@example.invalid',profile:{id:ownerId,couple_id:anotherCouple},
    rowsByDomain:data,generatedAt:'2026-10-12T00:00:00Z'
  }),'export_identity_invalid');
  assert.equal(classifyExportError({code:'export_tenant_mismatch'}),'NOT_AUTHORIZED');
  assert.equal(classifyExportError({code:'export_too_large'}),'EXPORT_TOO_LARGE');
});

test('endpoint is STAGING locked, caller-JWT RLS only and has no mutation capability',()=>{
  const src=read('../supabase/functions/export-my-data/index.ts');
  assert.match(src,/US_S32_EXPORT_ENABLED/);
  assert.match(src,/https:\/\/dugmhngrfkuieeletatb\.supabase\.co/);
  assert.match(src,/auth\.getUser\(token\)/);
  assert.match(src,/Authorization:"Bearer "\+token/);
  assert.match(src,/\.eq\(spec\.owner,ownerId\)/);
  assert.match(src,/\.eq\("couple_id",coupleId\)/);
  assert.match(src,/MEMBERSHIP_CHANGED/);
  assert.match(src,/Cache-Control.*no-store/);
  assert.match(src,/Content-Disposition/);
  assert.doesNotMatch(src,/supabaseSecretKey|SERVICE_ROLE_KEY|admin\.from/);
  assert.doesNotMatch(src,/\.delete\(|\.insert\(|\.update\(|\.upsert\(|\.remove\(/);
  assert.doesNotMatch(src,/console\.(log|error)\(/);
  assert.match(src,/collectDomainRows\(\{spec,fetchPage\}\)/);
  assert.match(src,/\.gt\(sortKey,cursor\)/);
  assert.match(src,/\.order\(sortKey,\{ascending:true\}\)\.limit\(limit\)/);
});
