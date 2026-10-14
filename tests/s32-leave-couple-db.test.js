// Leave the couple (founder decision 3, 2026-10-14), reports and the data
// export, on the full repo schema in disposable PGlite with two synthetic
// couples. Leaving closes the couple exactly like an account deletion
// (Policy A, D-5 separation) but keeps both accounts.
const test=require('node:test');
const assert=require('node:assert/strict');
const h=require('./helpers/mc2-db');
const {seeder}=require('./helpers/s32-seed');

let db,C2,seed;
const L=h.F,S=h.B;                 // couple A: L leaves, S stays
const q=async(sql,p=[])=>(await db.query(sql,p)).rows;
const one=async(sql,p=[])=>(await q(sql,p))[0];
const n=async(sql,p=[])=>Number((await one(sql,p)).n);
const svc=async(sql,p=[])=>h.as(db,null,sql,p,'service_role');
const leave=(u,ch='app')=>svc('select public.s32_leave_couple($1,$2) r',[u,ch]);
const del=(u,ch='app')=>svc('select public.s32_delete_account_data($1,$2) r',[u,ch]);
const report=(u,cat,details)=>h.as(db,u,'select public.submit_user_report($1,$2) r',[cat,details]);
const SHARED=['moments','moment_photos','shared_messages','calendar_entries','shared_events','bucket_items','left_for_you','daily_answers','stories','conserva_contributions'];

test.beforeEach(async()=>{
  db=await h.database();
  const c=await h.create(db,h.U1,'Other','2026-02-02');C2=c.couple_id;
  const inv=await h.invite(db,h.U1);await h.accept(db,h.U2,inv.code,'Other partner');
  seed=seeder(db);
  await seed.seedCouple(h.A,L,S,'A');
  await seed.seedCouple(C2,h.U1,h.U2,'B');
});
test.afterEach(async()=>{await db?.close();db=null;});

test('only service_role runs leave, export and operator lookups; the app can only file a report',async()=>{
  for(const fn of ['public.s32_leave_couple(uuid,text)','public.s32_couple_departure_plan(uuid,uuid)','public.s32_mark_couple_departure(uuid,uuid,text,text)',
    'public.s32_claim_pending_couple_departures(integer)','public.s32_export_user_data(uuid)','public.s32_user_id_by_email(text)','public.get_internal_operator_key()']){
    for(const role of ['anon','authenticated'])
      assert.equal((await one("select has_function_privilege($1,$2,'execute') r",[role,fn])).r,false,role+' '+fn);
    assert.equal((await one("select has_function_privilege('service_role',$1,'execute') r",[fn])).r,true,fn);
  }
  assert.equal((await one("select has_function_privilege('authenticated','public.submit_user_report(text,text)','execute') r")).r,true);
  assert.equal((await one("select has_function_privilege('anon','public.submit_user_report(text,text)','execute') r")).r,false);
  await assert.rejects(h.as(db,S,'select public.s32_leave_couple($1,$2) r',[S,'app']),/permission denied/);
  await assert.rejects(h.as(db,S,'select count(*) r from public.user_reports'),/permission denied/);
  await assert.rejects(h.as(db,S,'select count(*) r from private.couple_departures'),/permission denied/);
});

test('leaving: the partner keeps the shared content without author, the leaver keeps the account and starts over',async()=>{
  const otherBefore=await seed.coupleFingerprint(C2);
  const r=await leave(L);
  assert.equal(r.status,'db_done');assert.equal(r.mode,'departed');assert.equal(r.state,'db_done');
  assert.equal(r.storage_prefix,`${h.A}/${L}/`);
  // Kept media of the leaver stay for the partner; personal media do not.
  for(const p of ['m1.webp','derived-thumbnails/m1.webp','moment-albums/x/p1.webp','moment-albums/y/p3.webp','left/kept.webp'])
    assert.ok(r.keep_paths.includes(`${h.A}/${L}/${p}`),p);
  for(const p of ['story.webp','avatar.webp','left/gone.webp'])assert.ok(!r.keep_paths.includes(`${h.A}/${L}/${p}`),p);

  // Same outcome as Policy A: nothing in public data mentions the leaver.
  assert.deepEqual(await seed.rowsMentioning(L),[]);
  assert.equal(await n('select count(*)::int n from public.moments where couple_id=$1',[h.A]),2);
  assert.equal(await n('select count(*)::int n from public.moments where couple_id=$1 and created_by is null',[h.A]),1);
  assert.equal(await n("select count(*)::int n from public.shared_messages where couple_id=$1 and kind='scheduled'",[h.A]),0,'undelivered scheduled message dropped');
  assert.deepEqual(await seed.coupleFingerprint(C2),otherBefore,'the other couple is untouched');

  // The account stays: same auth user, no deletion receipt, back to onboarding.
  assert.equal(await n('select count(*)::int n from auth.users where id=$1',[L]),1);
  assert.equal(await n('select count(*)::int n from private.account_deletions'),0);
  assert.deepEqual(await h.membership(db,L),{member:false});
  const m=await h.membership(db,S);assert.equal(m.partner_joined,true);assert.equal(m.partner_departed,true);

  // The old space is closed: no invite, nobody joins, the leaver sees nothing of it.
  await assert.rejects(h.invite(db,S),/couple_closed/);
  for(const t of SHARED)assert.equal(Number(await h.as(db,L,`select count(*)::int r from public.${t} where couple_id=$1`,[h.A])),0,t);

  // A new couple for the leaver, fully separate from the old archive.
  const fresh=await h.create(db,L,'Di nuovo','2026-10-14');
  assert.equal(fresh.status,'created');assert.notEqual(fresh.couple_id,h.A);
  const code=(await h.invite(db,L)).code;await h.accept(db,h.U3,code,'Nuova persona');
  for(const u of [L,h.U3])for(const t of SHARED)
    assert.equal(Number(await h.as(db,u,`select count(*)::int r from public.${t} where couple_id=$1`,[h.A])),0,t);
  assert.equal(Number(await h.as(db,S,'select count(*)::int r from public.profiles where couple_id=$1',[fresh.couple_id])),0,'the old partner sees nothing of the new couple');
});

test('Storage after leaving: the partner keeps the archive media, the leaver and the new couple reach nothing',async()=>{
  await q('grant select, insert on storage.objects to authenticated');
  const put=(name,owner)=>q("insert into storage.objects(bucket_id,name,owner_id) values('us-media',$1,$2)",[name,owner]);
  const sees=(u,prefix)=>h.as(db,u,"select count(*)::int r from storage.objects where bucket_id='us-media' and name like $1",[prefix+'%']);
  const upload=(u,name)=>h.as(db,u,"insert into storage.objects(bucket_id,name,owner_id) values('us-media',$1,auth.uid()::text) returning 1 r",[name]);
  await put(`${h.A}/${L}/m1.webp`,L);await put(`${h.A}/${S}/m2.webp`,S);
  await leave(L);
  assert.equal(await sees(S,h.A+'/'),2,'the partner still reads the shared media');
  assert.equal(await sees(L,h.A+'/'),0);
  await assert.rejects(upload(L,`${h.A}/${L}/again.webp`),/row-level security/);
  const fresh=await h.create(db,L,'Di nuovo','2026-10-14');
  assert.equal(await sees(L,h.A+'/'),0,'the new space does not open the old one');
  await upload(L,`${fresh.couple_id}/${L}/n.webp`);
  assert.equal(await sees(S,fresh.couple_id+'/'),0);
});

test('leave retries resume the same request; the state machine has no auth step',async()=>{
  const first=await leave(L);
  const again=await leave(L);
  assert.equal(again.status,'already_done');assert.equal(again.storage_prefix,first.storage_prefix);
  assert.deepEqual(again.keep_paths,first.keep_paths);
  const done=await svc("select public.s32_mark_couple_departure($1,$2,'completed') r",[L,h.A]);
  assert.equal(done.state,'completed');
  await assert.rejects(leave(L),/not_in_couple/,'nothing left to leave');
  await assert.rejects(svc("select public.s32_mark_couple_departure($1,$2,'storage_done') r",[L,h.A]),/state_transition_invalid/);
  await assert.rejects(svc("select public.s32_mark_couple_departure($1,$2,'failed','Bad code') r",[L,h.A]),/error_code_invalid/);
  await assert.rejects(leave(h.U4),/not_in_couple/,'a user without a couple');
});

test('the last member leaving erases the couple space and keeps the account',async()=>{
  await leave(L);
  const r=await leave(S);
  assert.equal(r.mode,'couple_erased');assert.equal(r.storage_prefix,`${h.A}/`);assert.deepEqual(r.keep_paths,[]);
  assert.equal(await n('select count(*)::int n from public.couples where id=$1',[h.A]),0);
  assert.deepEqual(await seed.rowsMentioning(h.A),[]);
  assert.deepEqual(await h.membership(db,S),{member:false});
  assert.equal((await h.create(db,S,'Ancora','2026-10-14')).status,'created');
});

test('a member who left can later delete the account; a deleted account cannot leave',async()=>{
  await leave(L);
  const fresh=await h.create(db,L,'Di nuovo','2026-10-14');
  const code=(await h.invite(db,L)).code;await h.accept(db,h.U3,code,'Nuova persona');
  const r=await del(L);
  assert.equal(r.mode,'departed');assert.equal(r.storage_prefix,`${fresh.couple_id}/${L}/`);
  await q('delete from auth.users where id=$1',[L]);
  await assert.rejects(leave(L),/account_deleted/);
  await del(h.U2);
  await assert.rejects(leave(h.U2),/account_deleted/);
});

test('retry worker claims unfinished departures, oldest first, and stops after 10 failures',async()=>{
  await leave(L);await leave(h.U1);
  let claimed=await svc('select public.s32_claim_pending_couple_departures(10) r');
  assert.deepEqual(claimed.map(x=>x.user_id),[L,h.U1]);
  for(let i=0;i<10;i++)await svc("select public.s32_mark_couple_departure($1,$2,'failed','storage_list_failed') r",[L,h.A]);
  claimed=await svc('select public.s32_claim_pending_couple_departures(10) r');
  assert.deepEqual(claimed.map(x=>x.user_id),[h.U1]);
  await svc("select public.s32_mark_couple_departure($1,$2,'completed') r",[h.U1,C2]);
  await q("update private.couple_departures set completed_at=now()-interval '13 months' where user_id=$1",[h.U1]);
  assert.equal(await svc('select public.s32_purge_account_deletion_receipts() r'),1);
  assert.equal(await n('select count(*)::int n from private.couple_departures'),1);
});

test('reports: write-only for the app, validated, rate limited, kept without the reporter after deletion',async()=>{
  assert.deepEqual(await report(S,'person','Mi scrive cose che mi fanno paura'),{status:'received'});
  const row=await one('select * from public.user_reports');
  assert.equal(row.reporter_id,S);assert.equal(row.couple_id,h.A);assert.equal(row.status,'open');
  await assert.rejects(report(S,'spam','x'),/report_category_invalid/);
  await assert.rejects(report(S,'content','   '),/report_details_invalid/);
  await assert.rejects(report(S,'content','x'.repeat(2001)),/report_details_invalid/);
  for(let i=0;i<4;i++)await report(S,'app_problem','Problema '+i);
  await assert.rejects(report(S,'content','sesta'),/report_rate_limited/);
  await assert.rejects(h.as(db,h.ANON,"select public.submit_user_report('content','x') r"),/./,'anonymous sessions cannot report');
  // The partner cannot see the report, not even through its own couple.
  await assert.rejects(h.as(db,L,'select count(*) r from public.user_reports'),/permission denied/);
  await del(S);
  assert.equal(await n('select count(*)::int n from public.user_reports where reporter_id is null'),5);
  await q("update public.user_reports set created_at=now()-interval '13 months'");
  await svc('select public.s32_purge_account_deletion_receipts() r');
  assert.equal(await n('select count(*)::int n from public.user_reports'),0,'reports expire after 12 months');
});

test('export: only what the user created or is about them, no partner ids, media inside the couple',async()=>{
  const e=await svc('select public.s32_export_user_data($1) r',[S]);
  assert.equal(e.schema_version,1);assert.equal(e.user_id,S);
  assert.equal(e.profile.display_name,'Beatrice');assert.equal(e.couple.name,'US.');
  assert.equal(e.personal.daily_answers.length,1);assert.equal(e.personal.daily_answers[0].question,'Q');
  assert.equal(e.personal.moods.length,1);assert.ok(e.personal.location);
  assert.deepEqual(e.created.moments.map(m=>m.caption),['A_moment_b']);
  assert.deepEqual(e.created.messages_sent.map(m=>m.body),['A_msg_b_to_a']);
  assert.equal(e.created.left_for_you_sent.length,1);
  assert.ok(e.media.length>0);
  for(const p of e.media)assert.ok(p.startsWith(`${h.A}/${S}/`),p);
  const json=JSON.stringify(e);
  assert.ok(!json.includes(L),'no id of the partner');
  for(const words of ['A_moment_a','A_msg_a_to_b','A_cal_personal_a'])assert.ok(!json.includes(words),words);
  assert.equal(await svc('select public.s32_user_id_by_email($1) r',['  U1@Example.test ']),S);
  assert.equal(await svc("select coalesce(public.s32_user_id_by_email($1)::text,'none') r",['nobody@example.test']),'none');
  await assert.rejects(svc('select public.s32_export_user_data($1) r',['00000000-0000-4000-8000-000000000000']),/user_not_found/);
  assert.equal(await n("select count(*)::int n from storage.buckets where id='us-exports' and not public"),1);
});
