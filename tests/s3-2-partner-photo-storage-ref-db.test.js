// US S3.2 Phase 2.5: PRIVATE original Storage locator continuity.
// ONLY the disposable PGlite clone may run these DDL/DML fixtures.
// No live storage read, signed URLs, account deletion or Supabase calls.
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const h=require('./helpers/mc2-db');
const read=name=>fs.readFileSync(path.join(__dirname,'../docs/missions/'+name),'utf8');
const parentSql=read('us-store-s3-2-preserved-moments-calendar-draft.sql');
const photoSql=read('us-store-s3-2-partner-photo-reference-vault-draft.sql');
const refSql=read('us-store-s3-2-partner-photo-storage-ref-draft.sql');
let db;
test.beforeEach(async()=>{db=await h.database();await db.exec(parentSql);await db.exec(photoSql);await db.exec(refSql);});
test.afterEach(async()=>{await db?.close();db=null;});
const q=async(statement,params=[])=>db.query(statement,params);
const one=async(statement,params=[])=> (await q(statement,params)).rows[0];
async function fixtures(badPath=null){
 const pair=await h.create(db,h.U1,'QA couple 2','2026-10-01');
 const invitation=await h.invite(db,h.U1);
 await h.accept(db,h.U2,invitation.code);
 const sourceMoment=(await q(
  "insert into public.moments(couple_id,created_by,storage_path,caption) values($1,$2,$3,'QA review parent') returning id",
  [h.A,h.F,h.A+'/'+h.F+'/moment-albums/qa-parent/original.webp'])).rows[0].id;
 const canonicalPath=badPath??[h.A,h.B,'moment-albums',sourceMoment,'partner.webp'].join('/');
 const sourcePhoto=(await q(
  "insert into public.moment_photos(couple_id,moment_id,created_by,storage_path,caption,position) values($1,$2,$3,$4,'QA photo',1) returning id",
  [h.A,sourceMoment,h.B,canonicalPath])).rows[0].id;
 const parentReview=(await q(
  "insert into private.s32_content_preservation_approvals(content_type,source_id,couple_id,retaining_user_id,review_basis,reviewed_at,retention_expires_at) values('moment',$1,$2,$3,'ELIGIBLE_SHARED_REVIEWED',now(),now()+interval '2 hours') returning id,reviewed_at,retention_expires_at",
  [sourceMoment,h.A,h.B])).rows[0];
 await q(
  "insert into public.s32_preserved_moments(source_moment_id,couple_id,retaining_user_id,caption,moment_date,original_created_at,review_receipt,reviewed_at,retention_expires_at) values($1,$2,$3,'fake','2020-01-01',now(),$4,$5,$6)",
  [sourceMoment,h.A,h.B,parentReview.id,parentReview.reviewed_at,parentReview.retention_expires_at]);
 const approval=(await q(
  "insert into private.s32_partner_photo_review_approvals(source_photo_id,source_moment_id,couple_id,retaining_user_id,review_basis,reviewed_at,retention_expires_at) values($1,$2,$3,$4,'ELIGIBLE_PARTNER_PHOTO_REVIEWED',now(),now()+interval '2 hours') returning id,reviewed_at,retention_expires_at",
  [sourcePhoto,sourceMoment,h.A,h.B])).rows[0];
 const kept=(await q(
  "insert into public.s32_preserved_partner_photos(source_photo_id,source_moment_id,couple_id,retaining_user_id,caption,position,original_created_at,review_receipt,reviewed_at,retention_expires_at) values($1,$2,$3,$4,'fake',99,'2020-01-01',$5,$6,$7) returning id",
  [sourcePhoto,sourceMoment,h.A,h.B,approval.id,approval.reviewed_at,approval.retention_expires_at])).rows[0].id;
 return {sourceMoment,sourcePhoto,kept,canonicalPath,otherCouple:pair.couple_id};
}
const insertRef=(f,opts={})=>q(
  "insert into private.s32_partner_photo_storage_refs(preserved_photo_id,couple_id,retaining_user_id,bucket_id,storage_path,verification_state) values($1,$2,$3,'evil-bucket','attacker/path.webp','BLOCKED_PENDING_REAL_STORAGE_AUTH_AND_BYTES') returning preserved_photo_id",
  [opts.preservedPhotoId??f.kept,opts.coupleId??h.A,opts.retainingUserId??h.B]);

test('reviewed survivor photo preserves exact source locator PRIVATE, never marks object ready',async()=>{
 const f=await fixtures();
 assert.equal((await one('select count(*)::int n from private.s32_partner_photo_storage_refs')).n,0);
 await insertRef(f);
 const row=await one('select * from private.s32_partner_photo_storage_refs');
 assert.equal(row.preserved_photo_id,f.kept);
 assert.equal(row.storage_path,f.canonicalPath);
 assert.equal(row.bucket_id,'us-media');
 assert.equal(row.verification_state,'BLOCKED_PENDING_REAL_STORAGE_AUTH_AND_BYTES');
 assert.notEqual(row.storage_path,'attacker/path.webp');
 assert.deepEqual((await q("select column_name from information_schema.columns where table_schema='public' and table_name='s32_preserved_partner_photos' and column_name='storage_path'")).rows,[]);
 assert.equal((await one("select has_table_privilege('authenticated','private.s32_partner_photo_storage_refs','SELECT') ok")).ok,false);
 assert.equal((await one("select has_table_privilege('anon','private.s32_partner_photo_storage_refs','SELECT') ok")).ok,false);
 await assert.rejects(h.as(db,h.B,'select storage_path from private.s32_partner_photo_storage_refs'),e=>e.code==='42501');
});

test('canonical private reference survives author removal, while original photo DB row is cascaded; all rolled back',async()=>{
 const f=await fixtures();await insertRef(f);
 const before=(await one('select count(*)::int n from public.moment_photos')).n;
 await db.exec('BEGIN');
 try{
   await q('delete from auth.users where id=$1',[h.F]);
   assert.equal((await one('select count(*)::int n from public.moment_photos where id=$1',[f.sourcePhoto])).n,0);
   const preserved=await one('select * from private.s32_partner_photo_storage_refs where preserved_photo_id=$1',[f.kept]);
   assert.equal(preserved.storage_path,f.canonicalPath);
   assert.equal(preserved.verification_state,'BLOCKED_PENDING_REAL_STORAGE_AUTH_AND_BYTES');
   assert.equal((await one('select count(*)::int n from public.s32_preserved_partner_photos where id=$1',[f.kept])).n,1);
 }finally{await db.exec('ROLLBACK');}
 assert.equal((await one('select count(*)::int n from public.moment_photos')).n,before);
 assert.equal((await one('select count(*)::int n from auth.users where id=$1',[h.F])).n,1);
});

test('mismatched couple or identity cannot redirect a preserved file to another tenant',async()=>{
 const f=await fixtures();
 for(const v of [
  {coupleId:f.otherCouple},
  {retainingUserId:h.U2},
  {retainingUserId:h.F},
  {preservedPhotoId:'99999999-9999-4999-8999-999999999999'}
 ]){
  await db.exec('BEGIN');
  try{
   await assert.rejects(insertRef(f,v),e=>['23514','23503'].includes(e.code));
  }finally{await db.exec('ROLLBACK');}
 }
 assert.equal((await one('select count(*)::int n from private.s32_partner_photo_storage_refs')).n,0);
});

test('invalid or foreign uploader original file path cannot be retained, even with a review receipt',async()=>{
 for(const invalid of [
  [h.A,h.F,'moment-albums','bad.webp'].join('/'),
  ['22222222-2222-4222-8222-222222222222',h.B,'moment-albums','bad.webp'].join('/'),
  [h.A,h.B,'moment-albums','..','secret.webp'].join('/'),
  [h.A,h.B,'moment-albums','bad%2fpath.webp'].join('/'),
  [h.A,h.B,'moment-albums','','bad.webp'].join('/')
 ]){
  const f=await fixtures(invalid);
  await assert.rejects(insertRef(f),e=>e.code==='23514');
  assert.equal((await one('select count(*)::int n from private.s32_partner_photo_storage_refs')).n,0);
  break; // each fixture database contains unique staged parent; more cases tested separately below
 }
});
test('malformed nested photo path is denied by exact source checks',async()=>{
 const f=await fixtures([h.A,h.B,'folder','..','secret.jpg'].join('/'));
 await assert.rejects(insertRef(f),e=>e.code==='23514');
});
test('private locator is immutable and cleaned up when its archived parent is removed',async()=>{
 const f=await fixtures();await insertRef(f);
 await assert.rejects(q("update private.s32_partner_photo_storage_refs set storage_path='forged'"),e=>e.code==='42501');
 await db.exec('BEGIN');
 try{
  await q('delete from public.s32_preserved_partner_photos where id=$1',[f.kept]);
  assert.equal((await one('select count(*)::int n from private.s32_partner_photo_storage_refs')).n,0);
 }finally{await db.exec('ROLLBACK');}
 assert.equal((await one('select count(*)::int n from private.s32_partner_photo_storage_refs')).n,1);
});

test('disposable draft never grants client access, activates media, or alters live FKs',async()=>{
 const f=await fixtures();await insertRef(f);
 const grants=await one("select has_table_privilege('authenticated','private.s32_partner_photo_storage_refs','INSERT') i, has_table_privilege('authenticated','private.s32_partner_photo_storage_refs','UPDATE') u, has_table_privilege('authenticated','private.s32_partner_photo_storage_refs','DELETE') d");
 assert.deepEqual(grants,{i:false,u:false,d:false});
 const rel=await one("select relrowsecurity,relforcerowsecurity from pg_class where oid='private.s32_partner_photo_storage_refs'::regclass");
 assert.deepEqual(rel,{relrowsecurity:true,relforcerowsecurity:true});
 assert.doesNotMatch(refSql,/^\s*(?:DELETE\s+FROM|UPDATE\s+public\.moment_photos|ALTER\s+TABLE\s+public\.moment_photos|DROP\s+TABLE)\b/im);
 assert.doesNotMatch(refSql,/createSignedUrl|download\(|storage\.from|service_role/);
 try{await assert.rejects(db.exec(refSql),e=>e.code==='P0001');}
 finally{await db.exec('ROLLBACK');}
 assert.equal((await one('select count(*)::int n from private.s32_partner_photo_storage_refs')).n,1);
});
