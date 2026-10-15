// S3.2 — destructive baseline inspection ONLY on a disposable PGlite clone.
// Rebuilds US schema in memory; transaction ROLLBACK means no actual account
// deletion. No Supabase connection, no real users, no real media objects.
const test=require('node:test');
const assert=require('node:assert/strict');
const h=require('./helpers/mc2-db');
// Pre-v1 schema on purpose: this file documents the risk that account
// deletion v1 (tests/s32-account-deletion-db.test.js) now closes.

let db;
test.beforeEach(async()=>{db=await h.database({s32:false});});
test.afterEach(async()=>{await db?.close();db=null;});
const one=async(sql,params=[])=> (await db.query(sql,params)).rows[0];
const count=async(table,condition='true')=> Number((await one(
  'select count(*)::int n from public.'+table+' where '+condition
)).n);
const fixtures=async()=>{
 const c=await h.create(db,h.U1,'Other test', '2026-02-02');
 assert.equal(c.status,'created');
 const inv=await h.invite(db,h.U1);await h.accept(db,h.U2,inv.code,'Other partner');
 const b=c.couple_id;
 const insert=async(sql,params)=>db.query(sql,params);
 for(const [couple,sender,recipient,mark] of [[h.A,h.F,h.B,'A'],[b,h.U1,h.U2,'B']]){
  await insert('insert into public.shared_messages(couple_id,sender_id,recipient_id,body,kind) values($1,$2,$3,$4,$5)',[couple,sender,recipient,'S32_MARK_'+mark,'normal']);
  await insert('insert into public.moments(couple_id,created_by,storage_path,caption) values($1,$2,$3,$4)',[couple,sender,couple+'/'+sender+'/S32_NO_REAL_MEDIA.jpg','S32_MARK_'+mark]);
  await insert("insert into public.calendar_entries(couple_id,entry_type,created_by,title,is_all_day,start_date,end_date) values($1,'shared',$2,$3,true,'2026-10-12','2026-10-12')",[couple,sender,'S32_MARK_'+mark]);
 }
 return b;
};
const snapshot=async()=>({
 users:(await one('select count(*)::int n from auth.users')).n,
 profiles:(await one('select count(*)::int n from public.profiles')).n,
 messages:(await count('shared_messages')),
 moments:(await count('moments')),
 calendar:(await count('calendar_entries')),
 pairA:(await one('select count(*)::int n from public.profiles where couple_id=$1',[h.A])).n,
 foreignMessages:(await one("select count(*)::int n from public.shared_messages where body='S32_MARK_B'")).n,
 foreignMoments:(await one("select count(*)::int n from public.moments where caption='S32_MARK_B'")).n,
 foreignCalendar:(await one("select count(*)::int n from public.calendar_entries where title='S32_MARK_B'")).n,
});

test('REAL schema: naive user deletion would silently destroy partner-visible message, moment, calendar; ROLLBACK restores everything',async()=>{
 await fixtures();
 const before=await snapshot();
 assert.equal(before.messages,2);assert.equal(before.moments,2);assert.equal(before.calendar,2);
 await db.exec('BEGIN');
 try {
  await db.query('DELETE FROM auth.users WHERE id=$1',[h.F]);
  const during=await snapshot();
  assert.equal(during.users,before.users-1);
  assert.equal(during.profiles,before.profiles-1);
  assert.equal(during.pairA,1,'remaining partner should not be removed');
  assert.equal(during.messages,before.messages-1,'lost message with departing sender and survivor recipient');
  assert.equal(during.moments,before.moments-1,'lost shared moment');
  assert.equal(during.calendar,before.calendar-1,'lost shared calendar event');
  assert.equal(during.foreignMessages,1);
  assert.equal(during.foreignMoments,1);
  assert.equal(during.foreignCalendar,1);
 } finally {await db.exec('ROLLBACK');}
 assert.deepEqual(await snapshot(),before,'the destructive rehearsal must leave no persistent changes');
 assert.equal((await one('select count(*)::int n from auth.users where id=$1',[h.F])).n,1);
});

test('a second independent couple remains untouched by account-removal rehearsal',async()=>{
 const coupleB=await fixtures();
 const before=await snapshot();
 await db.exec('BEGIN');
 try {
   await db.query('DELETE FROM auth.users WHERE id=$1',[h.U1]);
   assert.equal((await one('select count(*)::int n from public.profiles where couple_id=$1',[coupleB])).n,1);
   assert.equal((await one("select count(*)::int n from public.shared_messages where body='S32_MARK_A'")).n,1);
   assert.equal((await one("select count(*)::int n from public.moments where caption='S32_MARK_A'")).n,1);
   assert.equal((await one("select count(*)::int n from public.calendar_entries where title='S32_MARK_A'")).n,1);
 } finally {await db.exec('ROLLBACK');}
 assert.deepEqual(await snapshot(),before);
});

test('NO ACTION completed-by reference blocks naive author deletion, not a successful erase',async()=>{
 await fixtures();
 const event=(await db.query("insert into public.shared_events(couple_id,created_by,title,event_date) values($1,$2,'S32 Event','2026-10-12') returning id",[h.A,h.F])).rows[0];
 await db.query("insert into public.shared_event_completions(event_id,couple_id,occurrence_date,completed_by,xp_awarded) values($1,$2,'2026-10-12',$3,10)",[event.id,h.A,h.F]);
 const before=await snapshot();
 await db.exec('BEGIN');
 try {
   await assert.rejects(db.query('delete from auth.users where id=$1',[h.F]),e=>e.code==='23503');
 } finally {await db.exec('ROLLBACK');}
 assert.deepEqual(await snapshot(),before);
 assert.equal((await one('select count(*)::int n from public.shared_event_completions where completed_by=$1',[h.F])).n,1);
});

test('no deletion endpoint, schema migration, or media cleanup is performed by this test suite',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const source=fs.readFileSync(__filename,'utf8');
 assert.match(source,/ROLLBACK/);
 assert.doesNotMatch(source,/supabase\.co|createClient\(|fetch\(|\.remove\(/);
 const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/missions/us-store-s3-2-lifecycle-contract-20261012.json'),'utf8'));
 assert.equal(cfg.destructiveActionsEnabled,false);
 assert.equal(cfg.automatedDeletionAllowed,false);
});
