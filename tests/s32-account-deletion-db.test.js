// S3.2 account deletion v1 — full repo schema in disposable PGlite, two
// synthetic couples. Proves Policy A: the leaving member's personal data is
// deleted, shared content stays with the partner without author, the other
// couple is untouched, and every other deletion path fails closed.
const test=require('node:test');
const assert=require('node:assert/strict');
const h=require('./helpers/mc2-db');

let db,C2;
const L=h.F,S=h.B;                 // couple A: L leaves, S stays
const q=async(sql,p=[])=>(await db.query(sql,p)).rows;
const one=async(sql,p=[])=>(await q(sql,p))[0];
const n=async(sql,p=[])=>Number((await one(sql,p)).n);
const svc=async(sql,p=[])=>h.as(db,null,sql,p,'service_role');
const del=(u,ch='app')=>svc('select public.s32_delete_account_data($1,$2) r',[u,ch]);
const path=(c,u,f)=>`${c}/${u}/${f}`;

async function seedCouple(c,a,b,tag){
  const ins=async(sql,p)=>(await q(sql+' returning id',p))[0]?.id;
  const ids={};
  ids.msgAB=await ins("insert into public.shared_messages(couple_id,sender_id,recipient_id,body,kind) values($1,$2,$3,$4,'normal')",[c,a,b,tag+'_msg_a_to_b']);
  ids.msgBA=await ins("insert into public.shared_messages(couple_id,sender_id,recipient_id,body,kind) values($1,$2,$3,$4,'normal')",[c,b,a,tag+'_msg_b_to_a']);
  ids.msgSched=await ins("insert into public.shared_messages(couple_id,sender_id,recipient_id,body,kind,unlock_at) values($1,$2,$3,$4,'scheduled',now()+interval '3 days')",[c,a,b,tag+'_msg_scheduled']);
  ids.momA=await ins('insert into public.moments(couple_id,created_by,storage_path,thumbnail_path,caption) values($1,$2,$3,$4,$5)',[c,a,path(c,a,'m1.webp'),path(c,a,'derived-thumbnails/m1.webp'),tag+'_moment_a']);
  ids.momB=await ins('insert into public.moments(couple_id,created_by,storage_path,caption) values($1,$2,$3,$4)',[c,b,path(c,b,'m2.webp'),tag+'_moment_b']);
  ids.photoAinA=await ins('insert into public.moment_photos(moment_id,couple_id,created_by,storage_path,position) values($1,$2,$3,$4,1)',[ids.momA,c,a,path(c,a,'moment-albums/x/p1.webp')]);
  ids.photoBinA=await ins('insert into public.moment_photos(moment_id,couple_id,created_by,storage_path,position) values($1,$2,$3,$4,2)',[ids.momA,c,b,path(c,b,'moment-albums/x/p2.webp')]);
  ids.photoAinB=await ins('insert into public.moment_photos(moment_id,couple_id,created_by,storage_path,position) values($1,$2,$3,$4,1)',[ids.momB,c,a,path(c,a,'moment-albums/y/p3.webp')]);
  ids.calShared=await ins("insert into public.calendar_entries(couple_id,entry_type,created_by,title,is_all_day,start_date,end_date) values($1,'shared',$2,$3,true,'2026-10-20','2026-10-20')",[c,a,tag+'_cal_shared']);
  ids.calPersA=await ins("insert into public.calendar_entries(couple_id,entry_type,created_by,owner_id,title,is_all_day,start_date,end_date) values($1,'personal',$2,$2,$3,true,'2026-10-21','2026-10-21')",[c,a,tag+'_cal_personal_a']);
  ids.calPersB=await ins("insert into public.calendar_entries(couple_id,entry_type,created_by,owner_id,title,is_all_day,start_date,end_date) values($1,'personal',$2,$2,$3,true,'2026-10-22','2026-10-22')",[c,b,tag+'_cal_personal_b']);
  ids.event=await ins("insert into public.shared_events(couple_id,created_by,title,event_date) values($1,$2,$3,'2026-10-12')",[c,a,tag+'_event']);
  await q("insert into public.shared_event_completions(event_id,couple_id,occurrence_date,completed_by,xp_awarded) values($1,$2,'2026-10-12',$3,10)",[ids.event,c,a]);
  ids.bucket=await ins('insert into public.bucket_items(couple_id,created_by,title) values($1,$2,$3)',[c,a,tag+'_wish']);
  ids.leftKept=await ins("insert into public.left_for_you(couple_id,sender_id,recipient_id,kind,media_path) values($1,$2,$3,'photo',$4)",[c,a,b,path(c,a,'left/kept.webp')]);
  ids.leftGone=await ins("insert into public.left_for_you(couple_id,sender_id,recipient_id,kind,media_path) values($1,$2,$3,'photo',$4)",[c,a,b,path(c,a,'left/gone.webp')]);
  ids.leftToA=await ins("insert into public.left_for_you(couple_id,sender_id,recipient_id,kind,body) values($1,$2,$3,'text',$4)",[c,b,a,tag+'_left_b_to_a']);
  await q('insert into public.conserva_contributions(couple_id,source_item_id,conserved_by,source_sender_id) values($1,$2,$3,$4)',[c,ids.leftKept,b,a]);
  const dq=(await one("insert into public.daily_questions(question_date,question) values(('2026-10-1'||$1::text)::date,'Q') returning id",[tag==='A'?'1':'2'])).id;
  for(const u of [a,b]){
    await q("insert into public.daily_answers(question_id,user_id,couple_id,answer) values($1,$2,$3,'ans')",[dq,u,c]);
    await q("insert into public.moods(couple_id,user_id,mood) values($1,$2,'ok')",[c,u]);
    await q('insert into public.stories(couple_id,author_id,media_path) values($1,$2,$3)',[c,u,path(c,u,'story.webp')]);
    await q("insert into public.device_push_tokens(user_id,couple_id,token,platform,installation_id,provider) values($1,$2,$3,'android',gen_random_uuid(),'fcm')",[u,c,'tok_'+u]);
    await q('insert into public.couple_locations(user_id,couple_id,latitude,longitude) values($1,$2,45.123456,9.123456)',[u,c]);
    await q('insert into public.widget_tokens(couple_id,profile_id,token_hash) values($1,$2,$3)',[c,u,'hash_'+u]);
    await q('update public.profiles set avatar_path=$2 where id=$1',[u,path(c,u,'avatar.webp')]);
  }
  return ids;
}

// Every row of every public table that mentions a user id, as text.
async function rowsMentioning(user){
  const tables=await q("select table_name t from information_schema.tables where table_schema='public' and table_type='BASE TABLE'");
  const hits=[];
  for(const {t} of tables){
    // Storage locators of kept media keep their folder name (a random id
    // that no longer maps to any account); every other column must be clean.
    const r=await one(`select count(*)::int n from public.${t} x where position($1 in (to_jsonb(x)-'storage_path'-'thumbnail_path'-'media_path'-'avatar_path'-'home_photo_path')::text)>0`,[user]);
    if(r.n)hits.push(`${t}:${r.n}`);
  }
  return hits;
}
// Fingerprint of everything belonging to one couple, to prove isolation.
async function coupleFingerprint(c){
  const tables=await q("select table_name t from information_schema.columns where table_schema='public' and column_name='couple_id' and table_name in (select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE')");
  const out={};
  for(const {t} of tables) out[t]=(await one(`select coalesce(md5(string_agg(x::text,'|' order by x::text)),'') h from public.${t} x where couple_id=$1`,[c])).h;
  out.couple=(await one('select md5(x::text) h from public.couples x where id=$1',[c])).h;
  return out;
}

let A_ids,B_ids;
test.beforeEach(async()=>{
  db=await h.database();
  const c=await h.create(db,h.U1,'Other','2026-02-02');C2=c.couple_id;
  const inv=await h.invite(db,h.U1);await h.accept(db,h.U2,inv.code,'Other partner');
  A_ids=await seedCouple(h.A,L,S,'A');
  B_ids=await seedCouple(C2,h.U1,h.U2,'B');
});
test.afterEach(async()=>{await db?.close();db=null;});

test('only service_role can run the deletion; clients cannot read receipts',async()=>{
  for(const role of ['anon','authenticated']){
    for(const fn of ['public.s32_delete_account_data(uuid,text)','public.s32_account_deletion_storage_plan(uuid)','public.s32_mark_account_deletion(uuid,text,text)'])
      assert.equal((await one('select has_function_privilege($1,$2,\'execute\') r',[role,fn])).r,false,role+' '+fn);
    assert.equal((await one("select has_table_privilege($1,'private.account_deletions','select') r",[role])).r,false);
  }
  await assert.rejects(h.as(db,L,'select public.s32_delete_account_data($1,$2) r',[L,'app']),/permission denied/);
  assert.equal(await n('select count(*)::int n from public.profiles where id=$1',[L]),1);
});

test('every other deletion path fails closed and changes nothing',async()=>{
  const before=await coupleFingerprint(h.A);
  await assert.rejects(q('delete from auth.users where id=$1',[L]),/foreign key|violates/);
  await assert.rejects(q('delete from public.profiles where id=$1',[L]),/foreign key|violates/);
  await assert.rejects(q('delete from auth.users where id=$1',[S]),/foreign key|violates/);
  assert.deepEqual(await coupleFingerprint(h.A),before);
});

test('Policy A: leaving member personal data deleted, shared content stays with the partner without author',async()=>{
  const otherBefore=await coupleFingerprint(C2);
  const sRowsBefore=await rowsMentioning(S);
  const r=await del(L,'app');
  assert.equal(r.status,'db_done');assert.equal(r.mode,'departed');
  assert.equal(r.storage_prefix,`${h.A}/${L}/`);

  // personal data gone
  for(const [t,col] of [['profiles','id'],['daily_answers','user_id'],['moods','user_id'],['device_push_tokens','user_id'],['couple_locations','user_id'],['widget_tokens','profile_id'],['stories','author_id']])
    assert.equal(await n(`select count(*)::int n from public.${t} where ${col}=$1`,[L]),0,t);
  assert.equal(await n('select count(*)::int n from public.calendar_entries where id=$1',[A_ids.calPersA]),0);
  assert.equal(await n('select count(*)::int n from public.shared_messages where id=$1',[A_ids.msgSched]),0,'undelivered scheduled message is not delivered');
  assert.equal(await n('select count(*)::int n from public.left_for_you where id=$1',[A_ids.leftGone]),0);
  assert.deepEqual(await rowsMentioning(L),[],'no public row mentions the deleted user any more');

  // shared content kept, anonymous
  assert.equal((await one('select sender_id from public.shared_messages where id=$1',[A_ids.msgAB])).sender_id,null);
  assert.equal((await one('select recipient_id,sender_id from public.shared_messages where id=$1',[A_ids.msgBA])).sender_id,S);
  assert.equal((await one('select created_by from public.moments where id=$1',[A_ids.momA])).created_by,null);
  assert.equal((await one('select created_by from public.moment_photos where id=$1',[A_ids.photoBinA])).created_by,S,'partner photo inside the leaving member Momento survives');
  assert.equal((await one('select created_by from public.moment_photos where id=$1',[A_ids.photoAinB])).created_by,null);
  assert.equal((await one('select created_by from public.calendar_entries where id=$1',[A_ids.calShared])).created_by,null);
  assert.equal((await one('select created_by from public.shared_events where id=$1',[A_ids.event])).created_by,null);
  assert.equal(await n('select count(*)::int n from public.shared_event_completions where event_id=$1 and completed_by is null',[A_ids.event]),1);
  assert.equal((await one('select created_by from public.bucket_items where id=$1',[A_ids.bucket])).created_by,null);
  assert.equal((await one('select sender_id from public.left_for_you where id=$1',[A_ids.leftKept])).sender_id,null);
  assert.equal(await n('select count(*)::int n from public.conserva_contributions where source_item_id=$1 and conserved_by=$2',[A_ids.leftKept,S]),1,'partner Conservati survive');
  assert.equal(await n('select count(*)::int n from public.left_for_you where id=$1 and recipient_id is null',[A_ids.leftToA]),1);

  // nothing that belongs to the partner was deleted
  // Only two rows that mention the partner disappear, both authored by the
  // leaving member: the undelivered scheduled message and the "lasciato per
  // te" the partner did not keep.
  const expected=sRowsBefore.map(x=>x==='shared_messages:3'?'shared_messages:2':x==='left_for_you:3'?'left_for_you:2':x);
  assert.deepEqual(await rowsMentioning(S),expected,'partner rows unchanged in every table');
  assert.equal(await n('select count(*)::int n from public.calendar_entries where id=$1',[A_ids.calPersB]),1);
  // the other couple is bit-for-bit identical
  assert.deepEqual(await coupleFingerprint(C2),otherBefore);

  // storage plan: keep what the partner still sees, delete the rest
  const keep=r.keep_paths;
  for(const p of [path(h.A,L,'m1.webp'),path(h.A,L,'derived-thumbnails/m1.webp'),path(h.A,L,'moment-albums/x/p1.webp'),path(h.A,L,'moment-albums/y/p3.webp'),path(h.A,L,'left/kept.webp')]) assert.ok(keep.includes(p),p);
  for(const p of [path(h.A,L,'avatar.webp'),path(h.A,L,'story.webp'),path(h.A,L,'left/gone.webp')]) assert.ok(!keep.includes(p),p);
  assert.ok(keep.every(p=>p.startsWith(`${h.A}/${L}/`)),'plan never reaches outside the leaving member prefix');

  // the Auth user can now be deleted (Admin API deleteUser equivalent)
  await q('delete from auth.users where id=$1',[L]);
  const receipt=await one('select user_id,mode,state,channel,couple_id from private.account_deletions where user_id=$1',[L]);
  assert.deepEqual({...receipt},{user_id:L,mode:'departed',state:'db_done',channel:'app',couple_id:h.A});
});

test('survivor stays in the app, keeps control, and the couple is closed',async()=>{
  await del(L);
  const m=await h.membership(db,S);
  assert.equal(m.member,true);assert.equal(m.partner_joined,true);assert.equal(m.partner_departed,true);
  assert.equal(Number(await h.as(db,S,'select count(*)::int r from public.moments')),2);
  assert.equal(Number(await h.as(db,S,'select count(*)::int r from public.shared_messages')),2);
  assert.equal(Number(await h.as(db,S,'select count(*)::int r from public.left_for_you')),2);
  await assert.rejects(h.invite(db,S),/couple_closed/);
  // the anonymous content can be removed by the survivor, not by others
  assert.equal(Number(await h.as(db,h.U1,'with d as (delete from public.moment_photos where id=$1 returning 1) select count(*)::int r from d',[A_ids.photoAinB])),0);
  assert.equal(Number(await h.as(db,S,'with d as (delete from public.moment_photos where id=$1 returning 1) select count(*)::int r from d',[A_ids.photoAinB])),1);
  assert.equal(Number(await h.as(db,S,'with d as (delete from public.calendar_entries where id=$1 returning 1) select count(*)::int r from d',[A_ids.calShared])),1);
  assert.equal(Number(await h.as(db,S,'with d as (delete from public.moments where id=$1 returning 1) select count(*)::int r from d',[A_ids.momA])),1);
  // the other couple still sees nothing of couple A
  assert.equal(Number(await h.as(db,h.U1,'select count(*)::int r from public.moments where couple_id=$1',[h.A])),0);
});

test('a deleted account sees nothing and cannot come back with a still-valid token',async()=>{
  // An old invite code for the departed slot must not let a third person in.
  await q("update public.couple_invites set used_at=null,used_by=null,code_hash=encode(extensions.digest('S32TESTCODE00000000000000A','sha256'),'hex'),expires_at=now()+interval '1 day' where couple_id=$1 and role='francesco'",[h.A]);
  await del(L);
  assert.equal(Number(await h.as(db,L,'select count(*)::int r from public.moments')),0);
  assert.equal(Number(await h.as(db,L,'select count(*)::int r from public.shared_messages')),0);
  assert.deepEqual(await h.membership(db,L),{member:false});
  await assert.rejects(h.create(db,L,'Again','2026-01-01'),/account_deleted/);
  await assert.rejects(h.accept(db,h.U3,'S32TESTCODE00000000000000A','Third'),/couple_closed|invite_invalid/);
  assert.equal(await n('select count(*)::int n from public.profiles where couple_id=$1',[h.A]),1);
});

test('last member: the whole couple space is deleted, including what the first leaver left',async()=>{
  await del(L);
  const r=await del(S,'web');
  assert.equal(r.mode,'couple_erased');assert.equal(r.storage_prefix,`${h.A}/`);
  assert.deepEqual(r.keep_paths,[]);
  assert.equal(await n('select count(*)::int n from public.couples where id=$1',[h.A]),0);
  assert.deepEqual(await rowsMentioning(h.A),[]);
  await q('delete from auth.users where id = any($1)',[[L,S]]);
  assert.equal(await n('select count(*)::int n from public.profiles where couple_id=$1',[C2]),2,'other couple untouched');
});

test('idempotent retries and receipt state machine',async()=>{
  const first=await del(L);
  const again=await del(L);
  assert.equal(again.status,'already_done');assert.deepEqual(again.keep_paths,first.keep_paths);
  await assert.rejects(svc("select public.s32_mark_account_deletion($1,'completed') r",[L]),/state_transition_invalid/);
  await svc("select public.s32_mark_account_deletion($1,'failed','storage_incomplete') r",[L]);
  assert.equal((await one('select attempts,last_error_code from private.account_deletions where user_id=$1',[L])).last_error_code,'storage_incomplete');
  assert.equal((await svc("select public.s32_mark_account_deletion($1,'storage_done') r",[L])).state,'storage_done');
  assert.equal((await svc("select public.s32_mark_account_deletion($1,'completed') r",[L])).state,'completed');
  await assert.rejects(svc("select public.s32_mark_account_deletion($1,'failed','Bad Code!') r",[L]),/error_code_invalid/);
});

test('a user without a couple is deleted without touching anyone',async()=>{
  const before=await coupleFingerprint(h.A);
  const r=await del(h.U3);
  assert.equal(r.mode,'no_couple');assert.equal(r.storage_prefix,null);
  await q('delete from auth.users where id=$1',[h.U3]);
  assert.deepEqual(await coupleFingerprint(h.A),before);
});

test('retry worker claims only unfinished requests; receipts expire 12 months after completion',async()=>{
  await del(L);await del(h.U3);
  await svc("select public.s32_mark_account_deletion($1,'storage_done') r",[h.U3]);
  assert.deepEqual([...(await svc('select public.s32_claim_pending_account_deletions(20) r'))].sort(),[L,h.U3].sort());
  for(let i=0;i<10;i++)await svc("select public.s32_mark_account_deletion($1,'failed','storage_incomplete') r",[L]);
  assert.deepEqual([...(await svc('select public.s32_claim_pending_account_deletions(20) r'))],[h.U3],'after 10 failures an operator takes over');
  await svc("select public.s32_mark_account_deletion($1,'completed') r",[h.U3]);
  assert.deepEqual([...(await svc('select public.s32_claim_pending_account_deletions(20) r'))],[]);
  assert.equal(Number(await svc('select public.s32_purge_account_deletion_receipts() r')),0,'recent receipts are kept');
  await q("update private.account_deletions set completed_at=now()-interval '13 months' where user_id=$1",[h.U3]);
  assert.equal(Number(await svc('select public.s32_purge_account_deletion_receipts() r')),1);
  assert.equal(await n('select count(*)::int n from private.account_deletions'),1,'unfinished request is never purged');
  for(const role of ['anon','authenticated'])for(const fn of ['public.s32_claim_pending_account_deletions(integer)','public.s32_purge_account_deletion_receipts()','public.get_internal_account_deletion_cron_key()'])
    assert.equal((await one("select has_function_privilege($1,$2,'execute') r",[role,fn])).r,false,role+' '+fn);
});

// D-5 (approved 2026-10-13): the survivor can bond again; the old archive is
// isolated from the new partner and goes with the survivor's own deletion.
const startNew=(u)=>h.as(db,u,"select public.start_new_couple_after_departure('2026-10-13'::date,'Nuovo') r",[],'service_role');
async function contentOf(c){
  return {moments:await n('select count(*)::int n from public.moments where couple_id=$1',[c]),
    messages:await n('select count(*)::int n from public.shared_messages where couple_id=$1',[c]),
    calendar:await n('select count(*)::int n from public.calendar_entries where couple_id=$1',[c])};
}

test('D-5: survivor starts a new couple; the new partner cannot reach the old archive',async()=>{
  await assert.rejects(startNew(h.U1),/couple_not_closed/,'only the survivor of a closed couple');
  assert.equal((await one("select has_function_privilege('authenticated','public.start_new_couple_after_departure(date,text)','execute') r")).r,false,'not exposed to the app until the archive view exists');
  await del(L);
  const archived=await contentOf(h.A);
  const r=await startNew(S);
  assert.equal(r.status,'created');const C3=r.couple_id;assert.notEqual(C3,h.A);
  assert.equal(await n('select count(*)::int n from private.couple_archive_access where couple_id=$1 and user_id=$2',[h.A,S]),1);
  for(const t of ['device_push_tokens','couple_locations'])assert.equal(await n(`select count(*)::int n from public.${t} where user_id=$1`,[S]),0,t);
  assert.equal(await n('select count(*)::int n from public.widget_tokens where profile_id=$1',[S]),0);
  // the archive is intact and nobody can join the old couple
  assert.deepEqual(await contentOf(h.A),archived);
  assert.equal((await one('select member_departed_at is not null r from public.couples where id=$1',[h.A])).r,true);

  const code=(await h.invite(db,S)).code;
  assert.equal((await h.accept(db,h.U3,code,'Nuova persona')).status,'joined');
  const m=await h.membership(db,h.U3);assert.equal(m.couple_id,C3);assert.equal(m.partner_joined,true);
  for(const u of [h.U3,S]){
    for(const t of ['moments','moment_photos','shared_messages','calendar_entries','shared_events','bucket_items','left_for_you','daily_answers','stories','conserva_contributions'])
    {
      // The survivor still reads their own daily answers (own personal data,
      // policy user_id = auth.uid()); never anything written by someone else.
      const own=u===S&&t==='daily_answers'?' and user_id<>auth.uid()':'';
      assert.equal(Number(await h.as(db,u,`select count(*)::int r from public.${t} where couple_id=$1${own}`,[h.A])),0,`${u===S?'survivor':'new partner'} sees no ${t} of the old couple through the app API`);
    }
    assert.equal(Number(await h.as(db,u,'select count(*)::int r from public.profiles where couple_id=$1',[h.A])),0);
  }
  await assert.rejects(h.as(db,h.U3,'select count(*) r from private.couple_archive_access'),/permission denied/);
});

test('D-5: the survivor deleting their account also erases the old archive, the new partner keeps theirs',async()=>{
  await del(L);
  const C3=(await startNew(S)).couple_id;
  const code=(await h.invite(db,S)).code;await h.accept(db,h.U3,code,'Nuova persona');
  await q("insert into public.moments(couple_id,created_by,storage_path) values($1,$2,$3)",[C3,h.U3,`${C3}/${h.U3}/n.webp`]);
  const otherBefore=await coupleFingerprint(C2);
  const r=await del(S);
  assert.equal(r.mode,'departed');assert.equal(r.storage_prefix,`${C3}/${S}/`);
  assert.deepEqual(r.archive_prefixes,[`${h.A}/`]);
  assert.equal(await n('select count(*)::int n from public.couples where id=$1',[h.A]),0,'old archive erased with its last member');
  assert.deepEqual(await rowsMentioning(h.A),[]);
  assert.equal(await n('select count(*)::int n from private.couple_archive_access'),0);
  assert.equal(await n('select count(*)::int n from public.moments where couple_id=$1',[C3]),1,'new partner content kept');
  assert.deepEqual(await coupleFingerprint(C2),otherBefore);
  await q('delete from auth.users where id=$1',[S]);
  assert.deepEqual((await svc('select public.s32_account_deletion_storage_plan($1) r',[S])).archive_prefixes,[`${h.A}/`]);
});
