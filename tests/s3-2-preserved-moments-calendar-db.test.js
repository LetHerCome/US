// US S3.2 policy A: metadata-only historical preservation tests.
// Isolated in-memory PostgreSQL rebuilt from full US migrations.
// Test-only rights decisions are hypothetical, never live approval.
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const h=require('./helpers/mc2-db');
const draft=fs.readFileSync(path.join(__dirname,'../docs/missions/us-store-s3-2-preserved-moments-calendar-draft.sql'),'utf8');
let db;
test.beforeEach(async()=>{db=await h.database();await db.exec(draft);});
test.afterEach(async()=>{await db?.close();db=null;});
const sql=async(q,p=[])=>db.query(q,p);
const one=async(q,p=[])=> (await sql(q,p)).rows[0];
const as=async(id,q,p=[])=>h.as(db,id,q,p);
const count=async(t)=>Number((await one('select count(*)::int n from public.'+t)).n);
const seed=async()=>{
 const c=await h.create(db,h.U1,'synthetic second couple','2026-02-01');
 const code=await h.invite(db,h.U1);await h.accept(db,h.U2,code.code);
 const pairs=[[h.A,h.F,h.B,'A'],[c.couple_id,h.U1,h.U2,'B']];
 const out=[];
 for(const [cid,author,retaining,mark] of pairs){
   const moment=(await sql('insert into public.moments(couple_id,created_by,storage_path,thumbnail_path,caption,moment_date) values($1,$2,$3,$4,$5,$6) returning id',
     [cid,author,cid+'/'+author+'/sensitive-original.jpg',cid+'/'+author+'/thumb.jpg','Original moment '+mark,'2026-10-01'])).rows[0].id;
   const photo=(await sql('insert into public.moment_photos(couple_id,moment_id,created_by,storage_path,caption,position) values($1,$2,$3,$4,$5,1) returning id',
     [cid,moment,author,cid+'/'+author+'/image2.jpg','second '+mark])).rows[0].id;
   const shared=(await sql("insert into public.calendar_entries(couple_id,entry_type,created_by,title,description,location,is_all_day,start_date,end_date) values($1,'shared',$2,$3,$4,$5,true,'2026-11-01','2026-11-01') returning id",
     [cid,author,'Shared calendar '+mark,'Private plan '+mark,'EXACT PERSONAL LOCATION '+mark])).rows[0].id;
   const personal=(await sql("insert into public.calendar_entries(couple_id,entry_type,owner_id,created_by,title,is_all_day,start_date,end_date) values($1,'personal',$2,$2,$3,true,'2026-11-02','2026-11-02') returning id",
     [cid,author,'Never shared '+mark])).rows[0].id;
   out.push({cid,author,retaining,moment,photo,shared,personal});
 }
 return out;
};
async function review(item,type,retaining=item.retaining,cid=item.cid,source=type==='moment'?item.moment:item.shared){
 const a=(await sql("insert into private.s32_content_preservation_approvals(content_type,source_id,couple_id,retaining_user_id,review_basis,reviewed_at,retention_expires_at) values($1,$2,$3,$4,'ELIGIBLE_SHARED_REVIEWED',now(),now()+interval '2 hours') returning id,reviewed_at,retention_expires_at",
  [type,source,cid,retaining])).rows[0];
 const table=type==='moment'?'s32_preserved_moments':'s32_preserved_calendar';
 const sourceColumn=type==='moment'?'source_moment_id':'source_entry_id';
 const fields=type==='moment'
  ?'caption,moment_date,original_created_at,media_state'
  :'entry_type,title,description,is_all_day,original_created_at';
 const values=type==='moment'
  ?"'FORGED CAPTION','2020-01-01','2020-01-01','FORGED MEDIA STATE'"
  :"'shared','FORGED TITLE','FORGED DESCRIPTION',true,'2020-01-01'";
 return sql('insert into public.'+table+'('+sourceColumn+',couple_id,retaining_user_id,review_receipt,reviewed_at,retention_expires_at,'+fields+') values($1,$2,$3,$4,$5,$6,'+values+') returning id',
  [source,cid,retaining,a.id,a.reviewed_at,a.retention_expires_at]);
}
test('default preserve nothing, sources and Storage references remain unchanged',async()=>{
 await seed();
 assert.equal(await count('s32_preserved_moments'),0);
 assert.equal(await count('s32_preserved_calendar'),0);
 assert.equal(await count('moments'),2);
 assert.equal(await count('moment_photos'),2);
 assert.equal(await count('calendar_entries'),4);
});
test('only reviewed shared metadata copied canonically; no media paths or calendar location',async()=>{
 const [a]=await seed();
 await review(a,'moment');
 await review(a,'calendar_shared');
 const m=await one('select * from public.s32_preserved_moments');
 const c=await one('select * from public.s32_preserved_calendar');
 assert.equal(m.caption,'Original moment A');
 assert.equal(m.moment_date,'2026-10-01');
 assert.equal(m.media_state,'BLOCKED_PENDING_STORAGE_TRANSFER');
 assert.equal(c.title,'Shared calendar A');
 assert.equal(c.description,'Private plan A');
 assert.equal(c.entry_type,'shared');
 assert.equal(c.is_all_day,true);
 assert.equal(c.start_date,'2026-11-01');
 assert.ok(!('storage_path' in m) && !('thumbnail_path' in m));
 assert.ok(!('location' in c) && !('owner_id' in c) && !('created_by' in c));
 assert.doesNotMatch(JSON.stringify([m,c]),/sensitive-original|thumb\.jpg|EXACT PERSONAL LOCATION|FORGED/);
});
test('approved metadata survives account cascade in ROLLBACK; photo bytes remain unresolved',async()=>{
 const [a,b]=await seed();
 await review(a,'moment');await review(a,'calendar_shared');
 assert.equal((await as(a.retaining,'select count(*)::int n from public.s32_preserved_moments'))[0].n,1);
 assert.equal((await as(a.author,'select count(*)::int n from public.s32_preserved_moments'))[0].n,0);
 assert.equal((await as(b.retaining,'select count(*)::int n from public.s32_preserved_calendar'))[0].n,0);
 await db.exec('BEGIN');
 try {
  await sql('DELETE FROM auth.users WHERE id=$1',[a.author]);
  assert.equal((await one('select count(*)::int n from public.moments where id=$1',[a.moment])).n,0);
  assert.equal((await one('select count(*)::int n from public.moment_photos where id=$1',[a.photo])).n,0);
  assert.equal((await one('select count(*)::int n from public.calendar_entries where id=$1',[a.shared])).n,0);
  assert.equal(await count('s32_preserved_moments'),1);
  assert.equal(await count('s32_preserved_calendar'),1);
  await db.exec('SET LOCAL ROLE authenticated');
  await sql("select set_config('request.jwt.claim.sub',$1,true)",[a.retaining]);
  assert.equal((await sql('select count(*)::int n from public.s32_preserved_moments')).rows[0].n,1);
  assert.equal((await sql('select count(*)::int n from public.s32_preserved_calendar')).rows[0].n,1);
 }finally{await db.exec('ROLLBACK');}
 assert.equal((await one('select count(*)::int n from auth.users where id=$1',[a.author])).n,1);
 assert.equal(await count('moments'),2);
 assert.equal(await count('moment_photos'),2);
 assert.equal(await count('calendar_entries'),4);
});
test('personal calendar items are excluded regardless of fake approval receipt',async()=>{
 const [a]=await seed();
 await db.exec('BEGIN');
 try {
  await assert.rejects(review(a,'calendar_shared',a.retaining,a.cid,a.personal),e=>e.code==='23514');
 }finally{await db.exec('ROLLBACK');}
 assert.equal(await count('s32_preserved_calendar'),0);
});
test('foreign couple/member, self-owned item, missing source or forged approval cannot be retained',async()=>{
 const [a,b]=await seed();
 const invalid=[
  ()=>review(a,'moment',b.retaining,b.cid,a.moment),
  ()=>review(a,'moment',b.retaining,a.cid,a.moment),
  ()=>review(a,'moment',a.author,a.cid,a.moment),
  ()=>review(a,'calendar_shared',a.author,a.cid,a.shared),
  ()=>review(a,'calendar_shared',b.retaining,b.cid,a.shared),
 ];
 for(const fn of invalid){
  await db.exec('BEGIN');
  try{await assert.rejects(fn(),e=>e.code==='23514');}
  finally{await db.exec('ROLLBACK');}
 }
 const random='99999999-9999-4999-8999-999999999999';
 await assert.rejects(sql("insert into public.s32_preserved_moments(source_moment_id,couple_id,retaining_user_id,caption,moment_date,original_created_at,review_receipt,reviewed_at,retention_expires_at) values($1,$2,$3,'Forged','2026-01-01',now(),$4,now(),now()+interval '2 hours')",
 [a.moment,a.cid,a.retaining,random]),e=>e.code==='23514');
 assert.equal(await count('s32_preserved_moments'),0);
 assert.equal(await count('s32_preserved_calendar'),0);
});
test('client cannot read private approvals, write preserved history or access cross-couple history',async()=>{
 const [a,b]=await seed();
 await review(a,'moment');await review(a,'calendar_shared');
 for(const table of ['s32_preserved_moments','s32_preserved_calendar']){
  const access=(await one("select has_table_privilege('authenticated',$1,'SELECT') s,has_table_privilege('authenticated',$1,'INSERT') i,has_table_privilege('authenticated',$1,'UPDATE') u,has_table_privilege('authenticated',$1,'DELETE') d",['public.'+table]));
  assert.deepEqual(access,{s:true,i:false,u:false,d:false});
  assert.equal((await one("select has_table_privilege('anon',$1,'SELECT') s",['public.'+table])).s,false);
  assert.equal((await as(b.retaining,'select count(*)::int n from public.'+table))[0].n,0);
  assert.equal((await as(a.retaining,'select count(*)::int n from public.'+table))[0].n,1);
  await assert.rejects(as(a.retaining,'delete from public.'+table),e=>e.code==='42501');
 }
 assert.equal((await one("select has_table_privilege('authenticated','private.s32_content_preservation_approvals','SELECT') v")).v,false);
 assert.equal((await one("select has_table_privilege('authenticated','private.s32_content_preservation_approvals','INSERT') v")).v,false);
});
test('archive immutable, rights expiration enforced in forced RLS and repeated installation denied',async()=>{
 const [a]=await seed();
 await review(a,'moment');await review(a,'calendar_shared');
 await assert.rejects(sql("UPDATE public.s32_preserved_moments SET caption='tampered'"),e=>e.code==='42501');
 await assert.rejects(sql("UPDATE public.s32_preserved_calendar SET title='tampered'"),e=>e.code==='42501');
 for(const table of ['s32_preserved_moments','s32_preserved_calendar']){
  const info=await one("select c.relrowsecurity,c.relforcerowsecurity from pg_class c where c.oid=$1::regclass",['public.'+table]);
  assert.deepEqual(info,{relrowsecurity:true,relforcerowsecurity:true});
  const policy=await one("select qual from pg_policies where schemaname='public' and tablename=$1",[table]);
  assert.match(policy.qual,/retention_expires_at > now\(\)/);
  assert.match(policy.qual,/retaining_user_id = auth.uid\(\)/);
 }
 try{await assert.rejects(db.exec(draft),e=>e.code==='P0001');}finally{await db.exec('ROLLBACK');}
 assert.equal(await count('s32_preserved_moments'),1);
 assert.equal(await count('s32_preserved_calendar'),1);
});
