// S3.2 STAGING-draft RPC installed ONLY on disposable, in-memory PGlite.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const h=require('./helpers/mc2-db');
const file=path.join(__dirname,'../docs/missions/us-store-s3-2-stage1-exit-preview-draft.sql');
const sql=fs.readFileSync(file,'utf8');
let db;
test.beforeEach(async()=>{ db=await h.database(); await db.exec(sql); });
test.afterEach(async()=>{await db?.close();db=null;});
const preview=async(actor)=>h.as(db,actor,'select public.s32_preview_account_exit() r');
const seed=async()=>{
 const pair=await h.create(db,h.U1,'Second test couple','2026-01-01');
 const code=await h.invite(db,h.U1);await h.accept(db,h.U2,code.code);
 for(const [cid,sender,recipient,tag] of [
  [h.A,h.F,h.B,'alpha'],[pair.couple_id,h.U1,h.U2,'beta']
 ]){
  await db.query("insert into public.shared_messages(couple_id,sender_id,recipient_id,body,kind) values($1,$2,$3,$4,'normal')",[cid,sender,recipient,'synthetic_'+tag]);
  await db.query('insert into public.moments(couple_id,created_by,storage_path,caption) values($1,$2,$3,$4)',[cid,sender,cid+'/'+sender+'/NO_REAL_MEDIA.jpg','synthetic_'+tag]);
  await db.query("insert into public.calendar_entries(couple_id,entry_type,created_by,title,is_all_day,start_date,end_date) values($1,'shared',$2,$3,true,'2026-10-12','2026-10-12')",[cid,sender,'synthetic_'+tag]);
 }
 return pair.couple_id;
};
test('own account impact preview counts outgoing/incoming without touching other data',async()=>{
 await seed();
 const own=await preview(h.F);
 assert.equal(own.mode,'READ_ONLY_PREVIEW');
 assert.equal(own.scope,'REQUESTING_MEMBER_ONLY');
 assert.equal(own.individual_account_deletion_enabled,false);
 assert.equal(own.couple_deletion_enabled,false);
 assert.equal(own.member_count,2);
 assert.equal(Number(own.self_sent_messages),1);
 assert.equal(Number(own.self_received_messages),0);
 assert.equal(Number(own.self_created_moments),1);
 assert.equal(Number(own.self_created_calendar_entries),1);
 assert.equal(own.requires_fkey_migration,true);
 assert.equal(own.requires_storage_cleanup,true);
 const partner=await preview(h.B);
 assert.equal(Number(partner.self_sent_messages),0);
 assert.equal(Number(partner.self_received_messages),1);
 assert.equal(Number(partner.self_created_moments),0);
 assert.equal(Number(partner.self_created_calendar_entries),0);
 assert.equal(partner.member_count,2);
 assert.ok(!JSON.stringify(own).includes(h.F));
 assert.ok(!JSON.stringify(own).includes(h.B));
 assert.ok(!JSON.stringify(own).includes(h.A));
 assert.ok(!JSON.stringify(own).includes('synthetic_alpha'));
});
test('separate couple has no access or count contamination from first couple',async()=>{
 const other=await seed();
 const b=await preview(h.U1);
 assert.equal(b.member_count,2);
 assert.equal(Number(b.self_sent_messages),1);
 assert.equal(Number(b.self_created_moments),1);
 assert.equal(Number(b.self_created_calendar_entries),1);
 assert.ok(!JSON.stringify(b).includes(h.A));
 assert.ok(!JSON.stringify(b).includes(other));
});
test('anon lacks grants and unlinked or unauthenticated users have no preview',async()=>{
 assert.equal((await db.query("select has_function_privilege('anon','public.s32_preview_account_exit()','EXECUTE') ok")).rows[0].ok,false);
 assert.equal((await db.query("select has_function_privilege('authenticated','public.s32_preview_account_exit()','EXECUTE') ok")).rows[0].ok,true);
 assert.equal((await db.query("select count(*)::int n from pg_proc p, lateral aclexplode(p.proacl) acl where p.oid='public.s32_preview_account_exit()'::regprocedure and acl.grantee=0")).rows[0].n,0);
 await assert.rejects(h.as(db,h.F,'select public.s32_preview_account_exit() r',[],'anon'),e=>e.code==='42501');
 await assert.rejects(preview(h.U3),e=>e.code==='42501');
 await assert.rejects(preview(h.ANON),e=>e.code==='42501');
});
test('RPC remains read-only, SECURITY DEFINER with empty search_path, never returns identifiers',async()=>{
 const stored=(await db.query("select p.prosecdef,p.provolatile,p.proconfig from pg_proc p where p.oid='public.s32_preview_account_exit()'::regprocedure")).rows[0];
 assert.equal(stored.prosecdef,true);
 assert.equal(stored.provolatile,'s');
 assert.deepEqual(stored.proconfig,['search_path=""']);
 const before=(await db.query('select count(*)::int n from public.profiles')).rows[0].n;
 await preview(h.F);
 const after=(await db.query('select count(*)::int n from public.profiles')).rows[0].n;
 assert.equal(after,before);
 assert.match(sql,/SECURITY DEFINER/);
 assert.doesNotMatch(sql,/^\s*(?:DELETE|UPDATE|INSERT|TRUNCATE)\b/im);
 assert.doesNotMatch(sql,/SERVICE_ROLE_KEY|supabaseSecretKey|Authorization: Bearer/);
});
test('draft migration intentionally refuses second execution instead of overwriting a function',async()=>{
 try{await assert.rejects(db.exec(sql),e=>e.code==='P0001');}finally{await db.exec('ROLLBACK');}
 const p=await preview(h.F);
 assert.equal(p.individual_account_deletion_enabled,false);
});
