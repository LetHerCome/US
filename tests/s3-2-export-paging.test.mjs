import test from 'node:test';
import assert from 'node:assert/strict';
import {collectDomainRows,sortKeyForExportDomain,EXPORT_PAGE_SIZE,EXPORT_PAGE_LIMIT}
 from '../supabase/functions/_shared/s3-2-export-paging.mjs';
import {EXPORT_DOMAINS,buildPersonalExport}
 from '../supabase/functions/_shared/s3-2-export-core.mjs';

const id=n=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0');
const owner='e8c90d50-81e9-4a0d-beeb-5886c63c4963';
const couple='46155127-5742-42d0-8195-5f6d0992ae7b';
const spec=EXPORT_DOMAINS.find(x=>x.table==='moments');
const fakeRow=n=>({id:id(n),couple_id:couple,created_by:owner,storage_path:null,
  thumbnail_path:null,caption:'Own memory',moment_date:'2026-10-12',created_at:'2026-10-12T00:00:00Z',
  place_lat:null,place_lon:null,place_label:null,place_source:null});
const failCode=(code)=>e=>e?.code===code;
function mockPager(data,observed=[]){
 return async ({spec:called,sortKey,cursor,limit})=>{
  observed.push({spec:called.table,sortKey,cursor,limit});
  return data.filter(x=>cursor===null||x[sortKey]>cursor).slice(0,limit);
 };
}
test('keyset traversal returns every row in 3 pages with deterministic ordering',async()=>{
 const data=Array.from({length:125},(_,i)=>fakeRow(i+1));
 const calls=[];
 const rows=await collectDomainRows({spec,fetchPage:mockPager(data,calls)});
 assert.equal(rows.length,125);
 assert.deepEqual(rows.map(x=>x.id),data.map(x=>x.id));
 assert.equal(calls.length,3);
 assert.deepEqual(calls.map(c=>c.cursor),[null,id(50),id(100)]);
 assert.equal(EXPORT_PAGE_SIZE,50);
 assert.equal(EXPORT_PAGE_LIMIT,500);
});

test('500 records exact boundary succeeds only after empty extra-page check',async()=>{
 const data=Array.from({length:500},(_,i)=>fakeRow(i+1));
 const calls=[];
 const rows=await collectDomainRows({spec,fetchPage:mockPager(data,calls)});
 assert.equal(rows.length,500);
 assert.equal(calls.length,11);
 assert.equal(calls.at(-1).cursor,id(500));
});
test('501st record must fail rather than silently claim export complete',async()=>{
 const data=Array.from({length:501},(_,i)=>fakeRow(i+1));
 await assert.rejects(
   collectDomainRows({spec,fetchPage:mockPager(data)}),
   failCode('export_too_large')
 );
});
test('rejects repeated, unsorted or invalid cursor results, including across pages',async()=>{
 const duplicate=Array.from({length:50},(_,i)=>fakeRow(i+1));
 for(const second of [duplicate.slice(0,2),[fakeRow(49)],[{...fakeRow(51),id:'invalid'}]]) {
  let n=0;
  await assert.rejects(
   collectDomainRows({spec,fetchPage:async()=>++n===1?duplicate:second}),
   failCode('export_paging_inconsistent_cursor')
  );
 }
 const tooMany=Array.from({length:51},(_,i)=>fakeRow(i+1));
 await assert.rejects(collectDomainRows({spec,fetchPage:async()=>tooMany}),failCode('export_paging_bad_page'));
});
test('rejects bad paging configuration, schema keys and partial network failures',async()=>{
 const fn=async()=>[];
 for(const input of [
   {spec:null,fetchPage:fn},{spec,fetchPage:null},{spec,fetchPage:fn,pageSize:101},
   {spec,fetchPage:fn,maxRows:501},{spec:{...spec,fields:['created_by']},fetchPage:fn}
 ]) await assert.rejects(collectDomainRows(input),e=>e.code?.startsWith('export_paging_'));
 await assert.rejects(collectDomainRows({spec,fetchPage:async()=>{throw Error('network');}}),/network/);
});
test('notification preferences use unique user_id, other tables use their id',()=>{
 assert.equal(sortKeyForExportDomain('notification_preferences'),'user_id');
 assert.equal(sortKeyForExportDomain('moments'),'id');
 assert.throws(()=>sortKeyForExportDomain('foo; delete from auth.users'),failCode('export_paging_bad_table'));
});
test('paged rows still pass through serializer tenant/owner privacy checks',async()=>{
 const one=await collectDomainRows({spec,fetchPage:mockPager([fakeRow(1)])});
 const byDomain=Object.fromEntries(EXPORT_DOMAINS.map(s=>{
  const row={};for(const key of s.fields)row[key]=null;
  row[s.owner]=owner;
  if(s.tenant)row.couple_id=couple;
  if(s.fields.includes('id')&&s.owner!=='id')row.id=id(99);
  return [s.table,[row]];
 }));
 byDomain.moments=one;
 const arg={ownerId:owner,coupleId:couple,email:'qa@example.invalid',
 profile:{id:owner,couple_id:couple},generatedAt:'2026-10-12T00:00:00Z',rowsByDomain:byDomain};
 const payload=buildPersonalExport(arg);
 assert.equal(payload.data.moments.length,1);
 byDomain.moments=[{...fakeRow(1),created_by:'01d5fe3d-1e8e-4872-b453-01918de88893'}];
 assert.throws(()=>buildPersonalExport(arg),e=>e.code==='export_owner_mismatch');
});
