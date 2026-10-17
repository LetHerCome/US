// S3.2 integrated preservation rehearsal: all four draft vaults cooperate.
// Disposable PGlite rebuilt from repository migrations; NOTHING touches live
// Supabase, production accounts, photos, Auth API or actual Storage objects.
// Synthetic approvals here are hypothetical fixtures, NOT real consent.
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const h=require('./helpers/mc2-db');
// Pre-v1 schema on purpose: this file documents the risk that account
// deletion v1 (tests/s32-account-deletion-db.test.js) now closes.

const docs=name=>fs.readFileSync(path.join(__dirname,'../docs/missions/',name),'utf8');
const drafts=[
 'us-store-s3-2-preserved-message-vault-draft.sql',
 'us-store-s3-2-preserved-moments-calendar-draft.sql',
 'us-store-s3-2-partner-photo-reference-vault-draft.sql',
 'us-store-s3-2-partner-photo-storage-ref-draft.sql'
];
const A={couple:h.A,departing:h.F,survivor:h.B,tag:'A'};
let db;
test.beforeEach(async()=>{
 db=await h.database({s32:false});
 for(const name of drafts)await db.exec(docs(name));
});
test.afterEach(async()=>{await db?.close();db=null;});
const q=(sql,parameters=[])=>db.query(sql,parameters);
const one=async(sql,parameters=[])=> (await q(sql,parameters)).rows[0];
const n=async(table,where='true',params=[])=>Number((await one(
 'select count(*)::int n from '+table+' where '+where,params)).n);

async function seed(){
 const created=await h.create(db,h.U1,'Entirely fictional QA couple','2026-10-01');
 const invite=await h.invite(db,h.U1);
 await h.accept(db,h.U2,invite.code);
 const B={couple:created.couple_id,departing:h.U1,survivor:h.U2,tag:'B'};
 for(const pair of [A,B]){
  pair.message=(await q(
   "insert into public.shared_messages(couple_id,sender_id,recipient_id,body,kind) values($1,$2,$3,$4,'normal') returning id",
   [pair.couple,pair.departing,pair.survivor,'S32 synthetic message '+pair.tag])).rows[0].id;
  pair.moment=(await q(
   'insert into public.moments(couple_id,created_by,storage_path,caption,moment_date) values($1,$2,$3,$4,$5) returning id',
   [pair.couple,pair.departing,pair.couple+'/'+pair.departing+'/moment-albums/qa-only/original.webp','S32 synthetic Moment '+pair.tag,'2026-10-01']
  )).rows[0].id;
  pair.photoPath=[pair.couple,pair.survivor,'moment-albums',pair.moment,'qa-survivor-photo.webp'].join('/');
  pair.photo=(await q(
   "insert into public.moment_photos(couple_id,moment_id,created_by,storage_path,caption,position) values($1,$2,$3,$4,$5,1) returning id",
   [pair.couple,pair.moment,pair.survivor,pair.photoPath,'S32 own photo '+pair.tag]
  )).rows[0].id;
  pair.calendar=(await q(
   "insert into public.calendar_entries(couple_id,entry_type,created_by,title,is_all_day,start_date,end_date) values($1,'shared',$2,$3,true,'2026-10-02','2026-10-02') returning id",
   [pair.couple,pair.departing,'S32 shared calendar '+pair.tag])).rows[0].id;
 }
 return {A:{...A},B:{...B}};
}
async function approveMessage(pair){
 const receipt=(await q(
  "insert into private.s32_message_preservation_approvals(source_message_id,couple_id,retaining_user_id,rights_basis,reviewed_at,retention_expires_at) values($1,$2,$3,'ELIGIBLE_SHARED_REVIEWED',now(),now()+interval '2 hours') returning id,reviewed_at,retention_expires_at",
  [pair.message,pair.couple,pair.survivor])).rows[0];
 return (await q(
  "insert into public.s32_preserved_messages(source_message_id,couple_id,retaining_user_id,kind,body,message_created_at,rights_review_receipt,rights_reviewed_at,retention_expires_at) values($1,$2,$3,'normal','FORGED CONTENT',now(),$4,$5,$6) returning id",
  [pair.message,pair.couple,pair.survivor,receipt.id,receipt.reviewed_at,receipt.retention_expires_at])).rows[0].id;
}
async function approveContent(pair,type){
 const source=type==='moment'?pair.moment:pair.calendar;
 const category=type==='moment'?'moment':'calendar_shared';
 const receipt=(await q(
  "insert into private.s32_content_preservation_approvals(content_type,source_id,couple_id,retaining_user_id,review_basis,reviewed_at,retention_expires_at) values($1,$2,$3,$4,'ELIGIBLE_SHARED_REVIEWED',now(),now()+interval '2 hours') returning id,reviewed_at,retention_expires_at",
  [category,source,pair.couple,pair.survivor])).rows[0];
 if(type==='moment')return (await q(
  "insert into public.s32_preserved_moments(source_moment_id,couple_id,retaining_user_id,caption,moment_date,original_created_at,review_receipt,reviewed_at,retention_expires_at) values($1,$2,$3,'FORGED','2020-01-01',now(),$4,$5,$6) returning id",
  [source,pair.couple,pair.survivor,receipt.id,receipt.reviewed_at,receipt.retention_expires_at])).rows[0].id;
 return (await q(
  "insert into public.s32_preserved_calendar(source_entry_id,couple_id,retaining_user_id,title,is_all_day,original_created_at,review_receipt,reviewed_at,retention_expires_at) values($1,$2,$3,'FORGED',true,now(),$4,$5,$6) returning id",
  [source,pair.couple,pair.survivor,receipt.id,receipt.reviewed_at,receipt.retention_expires_at])).rows[0].id;
}
async function approvePhoto(pair,sourcePhoto=pair.photo){
 const receipt=(await q(
  "insert into private.s32_partner_photo_review_approvals(source_photo_id,source_moment_id,couple_id,retaining_user_id,review_basis,reviewed_at,retention_expires_at) values($1,$2,$3,$4,'ELIGIBLE_PARTNER_PHOTO_REVIEWED',now(),now()+interval '2 hours') returning id,reviewed_at,retention_expires_at",
  [sourcePhoto,pair.moment,pair.couple,pair.survivor])).rows[0];
 const kept=(await q(
  "insert into public.s32_preserved_partner_photos(source_photo_id,source_moment_id,couple_id,retaining_user_id,caption,position,original_created_at,review_receipt,reviewed_at,retention_expires_at) values($1,$2,$3,$4,'FAKE PHOTO',99,now(),$5,$6,$7) returning id",
  [sourcePhoto,pair.moment,pair.couple,pair.survivor,receipt.id,receipt.reviewed_at,receipt.retention_expires_at])).rows[0].id;
 await q(
  "insert into private.s32_partner_photo_storage_refs(preserved_photo_id,couple_id,retaining_user_id,bucket_id,storage_path) values($1,$2,$3,'wrong-bucket','attacker/path.png')",
  [kept,pair.couple,pair.survivor]);
 return kept;
}
async function archive(pair){
 return {
  message:await approveMessage(pair),
  moment:await approveContent(pair,'moment'),
  calendar:await approveContent(pair,'calendar'),
  photo:await approvePhoto(pair)
 };
}
async function counts(){
 const tables=[
  'public.shared_messages','public.moments','public.calendar_entries','public.moment_photos',
  'public.s32_preserved_messages','public.s32_preserved_moments',
  'public.s32_preserved_calendar','public.s32_preserved_partner_photos',
  'private.s32_partner_photo_storage_refs'
 ];
 const values=await Promise.all(tables.map(t=>n(t)));
 return Object.fromEntries(tables.map((t,i)=>[t,values[i]]));
}

test('all four new vaults start empty and preserve source references',async()=>{
 await seed();
 const x=await counts();
 assert.deepEqual(Object.values(x),[2,2,2,2,0,0,0,0,0]);
});
test('one atomically reviewed relationship history remains after author cascade; both couples restored by rollback',async()=>{
 const {A:a,B:b}=await seed();
 const kept=await archive(a);
 const before=await counts();
 assert.deepEqual(Object.values(before),[2,2,2,2,1,1,1,1,1]);
 const canonical=await one('select storage_path,bucket_id,verification_state from private.s32_partner_photo_storage_refs where preserved_photo_id=$1',[kept.photo]);
 assert.equal(canonical.storage_path,a.photoPath);
 assert.equal(canonical.bucket_id,'us-media');
 assert.equal(canonical.verification_state,'BLOCKED_PENDING_REAL_STORAGE_AUTH_AND_BYTES');
 const info=await one('select body from public.s32_preserved_messages where id=$1',[kept.message]);
 assert.equal(info.body,'S32 synthetic message A');
 await db.exec('BEGIN');
 try {
  await q('delete from auth.users where id=$1',[a.departing]);
  for(const [table,id] of [
   ['shared_messages',a.message],['moments',a.moment],['calendar_entries',a.calendar],
   ['moment_photos',a.photo]
  ])assert.equal(await n('public.'+table,'id=$1',[id]),0,'source removed: '+table);
  assert.equal(await n('public.s32_preserved_messages'),1);
  assert.equal(await n('public.s32_preserved_moments'),1);
  assert.equal(await n('public.s32_preserved_calendar'),1);
  assert.equal(await n('public.s32_preserved_partner_photos'),1);
  assert.equal(await n('private.s32_partner_photo_storage_refs'),1);
  assert.equal((await one('select storage_path from private.s32_partner_photo_storage_refs where preserved_photo_id=$1',[kept.photo])).storage_path,a.photoPath);
  for(const [table,id] of [
   ['shared_messages',b.message],['moments',b.moment],['calendar_entries',b.calendar],
   ['moment_photos',b.photo]
  ])assert.equal(await n('public.'+table,'id=$1',[id]),1,'other couple unchanged '+table);
  // Test actual PostgreSQL authenticated RLS without using service-role visibility.
  await db.exec('SET LOCAL ROLE authenticated');
  await q("select set_config('request.jwt.claim.sub',$1,true)",[a.survivor]);
  for(const table of [
   's32_preserved_messages','s32_preserved_moments',
   's32_preserved_calendar','s32_preserved_partner_photos'
  ])assert.equal((await q('select count(*)::int n from public.'+table)).rows[0].n,1,table);
  // These metadata copies still cannot reveal private Storage paths.
  assert.equal((await q("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='s32_preserved_partner_photos' and column_name='storage_path'")).rows[0].n,0);
 }finally{await db.exec('ROLLBACK');}
 assert.deepEqual(await counts(),before,'every synthetic source and archive restored after rollback');
 assert.equal(await n('auth.users','id=$1',[a.departing]),1);
});
test('departing author and unrelated couple see no reviewed archive through RLS',async()=>{
 const {A:a,B:b}=await seed();
 await archive(a);
 const tables=[
  's32_preserved_messages','s32_preserved_moments',
  's32_preserved_calendar','s32_preserved_partner_photos'
 ];
 for(const actor of [a.departing,b.departing,b.survivor]){
  for(const table of tables){
   const rows=await h.as(db,actor,'select count(*)::int n from public.'+table);
   assert.equal(rows[0].n,0,actor+' '+table);
  }
 }
 assert.equal((await h.as(db,a.survivor,'select count(*)::int n from public.s32_preserved_partner_photos'))[0].n,1);
 await assert.rejects(h.as(db,a.survivor,'select storage_path from private.s32_partner_photo_storage_refs'),e=>e.code==='42501');
});
test('all-or-nothing batch rollback when final photo approval targets another couple',async()=>{
 const {A:a,B:b}=await seed();
 const before=await counts();
 await db.exec('BEGIN');
 try {
  await approveMessage(a);
  await approveContent(a,'moment');
  await approveContent(a,'calendar');
  await assert.rejects(approvePhoto(a,b.photo),e=>e.code==='23514');
 }finally{await db.exec('ROLLBACK');}
 assert.deepEqual(await counts(),before);
 assert.equal(await n('private.s32_message_preservation_approvals'),0);
 assert.equal(await n('private.s32_content_preservation_approvals'),0);
 assert.equal(await n('private.s32_partner_photo_review_approvals'),0);
});
test('an unreviewed couple never gains a single preserved record through approved partner metadata',async()=>{
 const {A:a,B:b}=await seed();
 await archive(a);
 for(const table of [
 's32_preserved_messages','s32_preserved_moments',
 's32_preserved_calendar','s32_preserved_partner_photos'
 ])assert.equal(await n('public.'+table,'couple_id=$1',[b.couple]),0);
 assert.equal(await n('private.s32_partner_photo_storage_refs','couple_id=$1',[b.couple]),0);
});
test('integrated rehearsal cannot act as account deletion or media transfer tool',()=>{
 const source=fs.readFileSync(__filename,'utf8');
 assert.doesNotMatch(source,/supabase\.co|createClient\(|https:\/\/|\.storage\.from\(/);
 assert.match(source,/ROLLBACK/);
 for(const sql of drafts){
  assert.ok(!sql.startsWith('supabase/migrations/'));
 }
});
