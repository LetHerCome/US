// Policy A narrow prototype: local-only review vault, no remote database.
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const h=require('./helpers/mc2-db');
const sql=fs.readFileSync(path.join(__dirname,'../docs/missions/us-store-s3-2-preserved-message-vault-draft.sql'),'utf8');
const REVIEW='c0b1cc2f-a3f7-4fd4-9b13-80bd3c0fea31';
const bogus='99999999-9999-4999-8999-999999999999';
let db;
test.beforeEach(async()=>{db=await h.database();await db.exec(sql);});
test.afterEach(async()=>{await db?.close();db=null;});
const one=async(sql,params=[])=> (await db.query(sql,params)).rows[0];
const as=async(id,statement,params=[])=>h.as(db,id,statement,params);
const seed=async()=>{
 const pair=await h.create(db,h.U1,'Second synthetic couple','2026-01-01');
 const invite=await h.invite(db,h.U1);await h.accept(db,h.U2,invite.code);
 const a=(await db.query("insert into public.shared_messages(couple_id,sender_id,recipient_id,kind,title,body) values($1,$2,$3,'normal','Approved mock','synthetic PRIVATE A') returning id",
  [h.A,h.F,h.B])).rows[0].id;
 const b=(await db.query("insert into public.shared_messages(couple_id,sender_id,recipient_id,kind,title,body) values($1,$2,$3,'normal','Other mock','synthetic PRIVATE B') returning id",
  [pair.couple_id,h.U1,h.U2])).rows[0].id;
 return {a,b,cidB:pair.couple_id};
};
const grantReview=async(source,retaining,couple,expires="now() + interval '2 hours'")=>
 db.query("insert into public.s32_preserved_messages(source_message_id,couple_id,retaining_user_id,kind,title,body,message_created_at,rights_review_receipt,rights_reviewed_at,retention_expires_at) values ($1,$2,$3,'forged','FORGED','FORGED','2021-01-01', $4,now(), "+expires+") returning id",
 [source,couple,retaining,REVIEW]);
test('default is zero preserved rows; vault does not automatically copy content',async()=>{
 const f=await seed();
 assert.equal((await one('select count(*)::int n from public.s32_preserved_messages')).n,0);
 assert.equal((await as(h.B,'select * from public.s32_preserved_messages')).length,0);
 assert.equal((await one('select count(*)::int n from public.shared_messages')).n,2);
});
test('only explicit review archive survives source account cascade and ROLLBACK restores',async()=>{
 const f=await seed();
 const inserted=(await grantReview(f.a,h.B,h.A)).rows[0];
 const raw=await one('select body,title,kind,source_message_id from public.s32_preserved_messages where id=$1',[inserted.id]);
 assert.equal(raw.body,'synthetic PRIVATE A','body must be copied from canonical source, never forged');
 assert.equal(raw.title,'Approved mock');
 assert.equal(raw.kind,'normal');
 assert.equal(raw.source_message_id,f.a);
 const survivor=await as(h.B,'select body from public.s32_preserved_messages');
 assert.deepEqual(survivor.map(x=>x.body),['synthetic PRIVATE A']);
 assert.deepEqual(await as(h.F,'select id from public.s32_preserved_messages'),[]);
 assert.deepEqual(await as(h.U1,'select id from public.s32_preserved_messages'),[]);
 assert.deepEqual(await as(h.U2,'select id from public.s32_preserved_messages'),[]);
 const before=(await one('select count(*)::int n from auth.users')).n;
 await db.exec('BEGIN');
 try{
   await db.query('DELETE FROM auth.users WHERE id=$1',[h.F]);
   assert.equal((await one('select count(*)::int n from auth.users')).n,before-1);
   assert.equal((await one('select count(*)::int n from public.shared_messages where id=$1',[f.a])).n,0);
   assert.equal((await one('select count(*)::int n from public.s32_preserved_messages where id=$1',[inserted.id])).n,1);
   // Simulate an authenticated SELECT in the same uncommitted DB transaction.
   await db.exec('SET LOCAL ROLE authenticated');
   await db.query("select set_config('request.jwt.claim.sub',$1,true)",[h.B]);
   const visible=(await db.query('select body from public.s32_preserved_messages')).rows;
   assert.deepEqual(visible,[{body:'synthetic PRIVATE A'}]);
   // No account-altered app operation, and no client deletion permission.
 }finally{await db.exec('ROLLBACK');}
 assert.equal((await one('select count(*)::int n from auth.users')).n,before);
 assert.equal((await one('select count(*)::int n from public.shared_messages where id=$1',[f.a])).n,1);
 assert.equal((await one('select count(*)::int n from public.s32_preserved_messages where id=$1',[inserted.id])).n,1);
});
test('cross-tenant reviewed copy is rejected even for table owner; no mixed-couple material',async()=>{
 const f=await seed();
 for(const [id,cid,user] of [
   [f.a,f.cidB,h.U2],[f.b,h.A,h.B],[f.a,h.A,h.U2],
   [bogus,h.A,h.B]
 ]){
  await assert.rejects(grantReview(id,user,cid),e=>e.code==='23514');
 }
 assert.equal((await one('select count(*)::int n from public.s32_preserved_messages')).n,0);
});
test('review receipt, finite retention and source timestamp cannot be omitted or falsified',async()=>{
 const f=await seed();
 await assert.rejects(grantReview(f.a,h.B,h.A,"now() - interval '1 minute'"),e=>e.code==='23514');
 await assert.rejects(db.query("insert into public.s32_preserved_messages(source_message_id,couple_id,retaining_user_id,rights_review_receipt,rights_reviewed_at,retention_expires_at) values ($1,$2,$3,null,now(),now()+interval '2 hours')",[f.a,h.A,h.B]),e=>e.code==='23502');
 assert.equal((await one('select count(*)::int n from public.s32_preserved_messages')).n,0);
});
test('anonymous cannot read; authenticated cannot insert/update/delete or nominate rights review',async()=>{
 const f=await seed();
 await grantReview(f.a,h.B,h.A);
 for(const role of ['anon','authenticated']){
  const check=(await db.query("select has_table_privilege($1,'public.s32_preserved_messages','INSERT') i,has_table_privilege($1,'public.s32_preserved_messages','UPDATE') u,has_table_privilege($1,'public.s32_preserved_messages','DELETE') d,has_table_privilege($1,'public.s32_preserved_messages','TRUNCATE') t",[role])).rows[0];
  assert.deepEqual(check,{i:false,u:false,d:false,t:false});
 }
 const readGrant=(await db.query("select has_table_privilege('authenticated','public.s32_preserved_messages','SELECT') ok")).rows[0];
 assert.equal(readGrant.ok,true);
 assert.equal((await db.query("select has_table_privilege('anon','public.s32_preserved_messages','SELECT') ok")).rows[0].ok,false);
 await assert.rejects(h.as(db,h.B,'update public.s32_preserved_messages set body=$1',['malicious']),e=>e.code==='42501');
 await assert.rejects(h.as(db,h.U1,'select body from public.s32_preserved_messages',[],'anon'),e=>e.code==='42501');
 assert.deepEqual(await as(h.B,'select body from public.s32_preserved_messages'),[{body:'synthetic PRIVATE A'}]);
});
test('archive is immutable, archived entry expires under restrictive row policy',async()=>{
 const f=await seed();
 const r=(await grantReview(f.a,h.B,h.A)).rows[0];
 await assert.rejects(db.query("update public.s32_preserved_messages set body='altered' where id=$1",[r.id]),e=>e.code==='42501');
 const policies=(await db.query("select qual from pg_policies where schemaname='public' and tablename='s32_preserved_messages'")).rows;
 assert.equal(policies.length,1);
 assert.match(policies[0].qual,/retention_expires_at > now\(\)/);
 assert.match(policies[0].qual,/retaining_user_id = auth.uid\(\)/);
 assert.match(policies[0].qual,/couple_id = private.current_couple_id\(\)/);
});
test('repeated draft install does not overwrite data or silently re-enable permissions',async()=>{
 const f=await seed();
 const r=(await grantReview(f.a,h.B,h.A)).rows[0];
 try{await assert.rejects(db.exec(sql),e=>e.code==='P0001');}finally{await db.exec('ROLLBACK');}
 assert.equal((await one('select count(*)::int n from public.s32_preserved_messages where id=$1',[r.id])).n,1);
 assert.equal((await as(h.B,'select body from public.s32_preserved_messages')).length,1);
});
test('draft never alters production FKs, creates erasure endpoint or uses remote resources',async()=>{
 const currentFKs=(await db.query("select confdeltype from pg_constraint where conname in ('shared_messages_sender_id_fkey','shared_messages_recipient_id_fkey') order by conname")).rows;
 assert.deepEqual(currentFKs,[{confdeltype:'c'},{confdeltype:'c'}]);
 const count=(await one("select count(*)::int n from pg_proc where proname in ('s32_delete_account','s32_unpair')")).n;
 assert.equal(count,0);
 assert.doesNotMatch(sql,/supabase\.co|SERVICE_ROLE_KEY|auth\.admin|deleteUser|DELETE\s+FROM\s+auth\.users/);
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);
});
