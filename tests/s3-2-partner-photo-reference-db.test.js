// US Store S3.2 Phase 2.4: disposable PostgreSQL only.
// Partner-owned photo metadata continuity. No media copy, Auth deletion, or live SQL.
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const h=require('./helpers/mc2-db');
const parentDraft=fs.readFileSync(path.join(__dirname,'../docs/missions/us-store-s3-2-preserved-moments-calendar-draft.sql'),'utf8');
const photoDraft=fs.readFileSync(path.join(__dirname,'../docs/missions/us-store-s3-2-partner-photo-reference-vault-draft.sql'),'utf8');
let db;
test.beforeEach(async()=>{db=await h.database();await db.exec(parentDraft);await db.exec(photoDraft);});
test.afterEach(async()=>{await db?.close();db=null;});
const q=async(sql,params=[])=>db.query(sql,params);
const one=async(sql,params=[])=> (await q(sql,params)).rows[0];
const count=async(t)=>Number((await one('select count(*)::int n from public.'+t)).n);
async function seed(){
 const c=await h.create(db,h.U1,'Synthetic couple B','2026-04-01');
 const invite=await h.invite(db,h.U1);await h.accept(db,h.U2,invite.code);
 const pairs=[[h.A,h.F,h.B,'A'],[c.couple_id,h.U1,h.U2,'B']];
 const out=[];
 for(const [couple,actor,survivor,mark] of pairs){
  const m=(await q('insert into public.moments(couple_id,created_by,storage_path,thumbnail_path,caption,moment_date) values($1,$2,$3,$4,$5,$6) returning id',
   [couple,actor,couple+'/'+actor+'/moment-albums/test/original.webp',couple+'/'+actor+'/moment-albums/test/thumb.webp','S32 moment '+mark,'2026-10-02'])).rows[0].id;
  const partner=(await q('insert into public.moment_photos(couple_id,moment_id,created_by,storage_path,caption,position) values($1,$2,$3,$4,$5,1) returning id',
   [couple,m,survivor,couple+'/'+survivor+'/moment-albums/test/partner.webp','SURVIVOR CANONICAL '+mark])).rows[0].id;
  const author=(await q('insert into public.moment_photos(couple_id,moment_id,created_by,storage_path,caption,position) values($1,$2,$3,$4,$5,2) returning id',
   [couple,m,actor,couple+'/'+actor+'/moment-albums/test/author.webp','DEPARTING PHOTO '+mark])).rows[0].id;
  out.push({couple,actor,survivor,moment:m,partner,author});
 }
 return out;
}
async function reviewedMoment(item){
 const a=(await q("insert into private.s32_content_preservation_approvals(content_type,source_id,couple_id,retaining_user_id,review_basis,reviewed_at,retention_expires_at) values('moment',$1,$2,$3,'ELIGIBLE_SHARED_REVIEWED',now(),now()+interval '2 hours') returning id,reviewed_at,retention_expires_at",
  [item.moment,item.couple,item.survivor])).rows[0];
 await q("insert into public.s32_preserved_moments(source_moment_id,couple_id,retaining_user_id,caption,moment_date,original_created_at,review_receipt,reviewed_at,retention_expires_at) values($1,$2,$3,'FORGED','2020-01-01',now(),$4,$5,$6)",
 [item.moment,item.couple,item.survivor,a.id,a.reviewed_at,a.retention_expires_at]);
}
async function reviewedPhoto(item,overrides={}){
 const source=overrides.sourcePhoto||item.partner;
 const sourceMoment=overrides.sourceMoment||item.moment;
 const couple=overrides.couple||item.couple;
 const retaining=overrides.retaining||item.survivor;
 const a=(await q("insert into private.s32_partner_photo_review_approvals(source_photo_id,source_moment_id,couple_id,retaining_user_id,review_basis,reviewed_at,retention_expires_at) values($1,$2,$3,$4,'ELIGIBLE_PARTNER_PHOTO_REVIEWED',now(),now()+interval '2 hours') returning id,reviewed_at,retention_expires_at",
  [source,sourceMoment,couple,retaining])).rows[0];
 return q("insert into public.s32_preserved_partner_photos(source_photo_id,source_moment_id,couple_id,retaining_user_id,caption,position,original_created_at,media_state,review_receipt,reviewed_at,retention_expires_at) values($1,$2,$3,$4,'FORGED PHOTO',77,'2020-01-01','BLOCKED_PENDING_RIGHTS_STORAGE_AND_PARENT_REBIND',$5,$6,$7) returning id",
  [source,sourceMoment,couple,retaining,overrides.receipt||a.id,a.reviewed_at,a.retention_expires_at]);
}
test('default fail-closed: nothing archived, two couples and all photo DB rows preserved',async()=>{
 await seed();
 assert.equal(await count('s32_preserved_partner_photos'),0);
 assert.equal(await count('moment_photos'),4);
 assert.equal(await count('moments'),2);
});
test('partner photo preserves canonical metadata only, with no media path or forged fields',async()=>{
 const [a]=await seed();await reviewedMoment(a);await reviewedPhoto(a);
 const row=await one('select * from public.s32_preserved_partner_photos');
 assert.equal(row.caption,'SURVIVOR CANONICAL A');
 assert.equal(row.position,1);
 assert.equal(row.source_photo_id,a.partner);
 assert.equal(row.media_state,'BLOCKED_PENDING_RIGHTS_STORAGE_AND_PARENT_REBIND');
 assert.ok(!('storage_path' in row));
 assert.ok(!('created_by' in row));
 assert.ok(!('bytes' in row));
 assert.doesNotMatch(JSON.stringify(row),/FORGED|partner.webp|original.webp|DEPARTING PHOTO/);
});
test('REVIEWED metadata survives source Auth cascade, and all original rows restore after ROLLBACK',async()=>{
 const [a,b]=await seed();await reviewedMoment(a);await reviewedPhoto(a);
 assert.equal((await h.as(db,a.survivor,'select count(*)::int n from public.s32_preserved_partner_photos'))[0].n,1);
 assert.equal((await h.as(db,a.actor,'select count(*)::int n from public.s32_preserved_partner_photos'))[0].n,0);
 assert.equal((await h.as(db,b.survivor,'select count(*)::int n from public.s32_preserved_partner_photos'))[0].n,0);
 await db.exec('BEGIN');
 try {
  await q('DELETE FROM auth.users WHERE id=$1',[a.actor]);
  assert.equal((await one('select count(*)::int n from public.moments where id=$1',[a.moment])).n,0);
  assert.equal((await one('select count(*)::int n from public.moment_photos where id=$1',[a.partner])).n,0);
  assert.equal(await count('s32_preserved_partner_photos'),1);
  assert.equal((await one('select count(*)::int n from public.moment_photos where id=$1',[b.partner])).n,1);
  await db.exec('SET LOCAL ROLE authenticated');
  await q("select set_config('request.jwt.claim.sub',$1,true)",[a.survivor]);
  assert.equal((await q('select count(*)::int n from public.s32_preserved_partner_photos')).rows[0].n,1);
 } finally {await db.exec('ROLLBACK');}
 assert.equal((await one('select count(*)::int n from auth.users where id=$1',[a.actor])).n,1);
 assert.equal(await count('moments'),2);
 assert.equal(await count('moment_photos'),4);
 assert.equal(await count('s32_preserved_partner_photos'),1);
});
test('unreviewed parent Moment blocks partner-photo archive, even with mock photo approval',async()=>{
 const [a]=await seed();
 await assert.rejects(reviewedPhoto(a),e=>e.code==='23514');
 assert.equal(await count('s32_preserved_partner_photos'),0);
});
test('departing-owned photo, self-retention and foreign-couple photo cannot be archived',async()=>{
 const [a,b]=await seed();await reviewedMoment(a);
 for(const attempt of [
  {sourcePhoto:a.author},
  {retaining:a.actor},
  {sourcePhoto:b.partner},
  {couple:b.couple}
 ]){
  await db.exec('BEGIN');
  try {await assert.rejects(reviewedPhoto(a,attempt),e=>e.code==='23514');}
  finally {await db.exec('ROLLBACK');}
 }
 assert.equal(await count('s32_preserved_partner_photos'),0);
});
test('random photo receipt denied; expiry and duplicates cannot create another archive',async()=>{
 const [a]=await seed();await reviewedMoment(a);
 const random='99999999-9999-4999-8999-999999999999';
 await db.exec('BEGIN');
 try{await assert.rejects(reviewedPhoto(a,{receipt:random}),e=>e.code==='23514');}
 finally{await db.exec('ROLLBACK');}
 await reviewedPhoto(a);
 await db.exec('BEGIN');
 try{await assert.rejects(reviewedPhoto(a),e=>e.code==='23505');}
 finally{await db.exec('ROLLBACK');}
 const row=await one('select id from public.s32_preserved_partner_photos');
 await assert.rejects(q("UPDATE public.s32_preserved_partner_photos SET caption='modified' WHERE id=$1",[row.id]),e=>e.code==='42501');
 assert.equal(await count('s32_preserved_partner_photos'),1);
});
test('authenticated reads only own reviewed nonexpired archive; no insert/update/delete or ledger access',async()=>{
 const [a,b]=await seed();await reviewedMoment(a);await reviewedPhoto(a);
 const p=await one("select has_table_privilege('authenticated','public.s32_preserved_partner_photos','SELECT') s,has_table_privilege('authenticated','public.s32_preserved_partner_photos','INSERT') i,has_table_privilege('authenticated','public.s32_preserved_partner_photos','UPDATE') u,has_table_privilege('authenticated','public.s32_preserved_partner_photos','DELETE') d");
 assert.deepEqual(p,{s:true,i:false,u:false,d:false});
 assert.equal((await one("select has_table_privilege('anon','public.s32_preserved_partner_photos','SELECT') s")).s,false);
 assert.equal((await one("select has_table_privilege('authenticated','private.s32_partner_photo_review_approvals','SELECT') s")).s,false);
 assert.equal((await h.as(db,a.survivor,'select count(*)::int n from public.s32_preserved_partner_photos'))[0].n,1);
 assert.equal((await h.as(db,a.actor,'select count(*)::int n from public.s32_preserved_partner_photos'))[0].n,0);
 assert.equal((await h.as(db,b.survivor,'select count(*)::int n from public.s32_preserved_partner_photos'))[0].n,0);
 await assert.rejects(h.as(db,a.survivor,'delete from public.s32_preserved_partner_photos'),e=>e.code==='42501');
 const policy=await one("select qual from pg_policies where schemaname='public' and tablename='s32_preserved_partner_photos'");
 assert.match(policy.qual,/retention_expires_at > now\(\)/);
 assert.match(policy.qual,/retaining_user_id = auth.uid\(\)/);
});
test('archive has no FK to departing user/photo/Moment and draft is never auto-migrated',async()=>{
 await seed();
 const constraints=(await q("select confrelid::regclass::text target from pg_constraint where conrelid='public.s32_preserved_partner_photos'::regclass and contype='f'")).rows.map(x=>x.target).sort();
 assert.deepEqual(constraints,['couples','profiles']);
 const security=await one("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.s32_preserved_partner_photos'::regclass");
 assert.deepEqual(security,{relrowsecurity:true,relforcerowsecurity:true});
 assert.equal(fs.readdirSync(h.DIR).some(n=>n.includes('partner_photo_reference')),false);
 assert.doesNotMatch(photoDraft,/\bDELETE\s+FROM\s+(?:auth\.users|public\.moment_photos)\b/i);
 try{await assert.rejects(db.exec(photoDraft),e=>e.code==='P0001');}
 finally{await db.exec('ROLLBACK');}
});
