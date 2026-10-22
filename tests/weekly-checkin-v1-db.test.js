// Weekly check-in V1 («Il punto della settimana»), on the full repo schema in
// disposable PGlite with two synthetic couples. Proves the seal (nothing of
// the partner before both answered), edits only before the partner answers,
// last week's support request, reactions and Conservati after the reveal,
// couple isolation, explicit grants, and the S3.2 lifecycle (leave, delete,
// export). Spec: docs/missions/weekly-checkin-v1.md.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const h=require('./helpers/mc2-db');

const DIR=path.join(__dirname,'../supabase/migrations');
const FILE=fs.readdirSync(DIR).find(f=>/_weekly_checkin_v1\.sql$/.test(f));

let db,C2;
const F=h.F,B=h.B;                 // couple A
const q=async(sql,p=[])=>(await db.query(sql,p)).rows;
const one=async(sql,p=[])=>(await q(sql,p))[0];
const svc=(sql,p=[])=>h.as(db,null,sql,p,'service_role');
const state=(u,week=null)=>h.as(db,u,'select public.get_weekly_checkin_state($1::date) r',[week]);
const submit=(u,payload,version=0)=>h.as(db,u,'select public.submit_weekly_checkin($1::jsonb,$2) r',[JSON.stringify(payload),version]);
const history=(u,weeks=8)=>h.as(db,u,'select public.get_weekly_checkin_history($1) r',[weeks]);
const react=(u,week,reaction)=>h.as(db,u,'select public.set_weekly_checkin_reaction($1::date,$2) r',[week,reaction]);
const keep=(u,week)=>h.as(db,u,'select public.keep_weekly_appreciation($1::date) r',[week]);
const full=(over={})=>({closeness:4,closeness_note:'Bella settimana',energy:3,energy_note:null,appreciation:'Mi hai portato il caffè',support_last:null,support_request:'Ricordami di staccare',...over});
const thisWeek=async()=>(await one('select private.bond_week_start_rome(now())::text w')).w;
const weeksAgo=async n=>(await one("select (private.bond_week_start_rome(now()) - ($1::int * 7))::text w",[n])).w;
// Rows of past weeks are written directly, as the owner would have done then.
const seedRow=(couple,user,week,over={})=>q(`insert into public.weekly_checkins
  (couple_id,user_id,week_start,closeness,energy,appreciation,support_request,submitted_at,updated_at)
  values($1,$2,$3::date,$4,$5,$6,$7,now(),now())`,
  [couple,user,week,over.closeness??3,over.energy??3,over.appreciation??'Grazie',over.support_request??null]);

test.beforeEach(async()=>{
  db=await h.database();
  const c=await h.create(db,h.U1,'Other','2026-02-02');C2=c.couple_id;
  const inv=await h.invite(db,h.U1);await h.accept(db,h.U2,inv.code,'Other partner');
});
test.afterEach(async()=>{await db?.close();db=null;});

test('migration exists, comes after S3.2 and is listed in the baseline cutoff',()=>{
  assert.ok(FILE,'missing supabase/migrations/*_weekly_checkin_v1.sql');
  const cutoff=JSON.parse(fs.readFileSync(path.join(__dirname,'../supabase/baseline/MIGRATION_CUTOFF.json'),'utf8'));
  assert.ok(cutoff.executable_migrations.includes(FILE));
  assert.ok(cutoff.forward_migrations.includes(FILE));
  assert.ok(FILE>'20261019120000_us_1_0_content_time_neutral.sql');
});

test('grants are explicit: tables closed to clients, RPCs only for authenticated',async()=>{
  const sql=fs.readFileSync(path.join(DIR,FILE),'utf8');
  for(const t of ['public.weekly_checkins','public.weekly_checkin_keepsakes'])
    assert.ok(sql.includes(`revoke all on table ${t} from public, anon, authenticated, service_role;`),t);
  assert.ok(sql.includes('grant select on table public.weekly_checkins to service_role;'));
  assert.ok(sql.includes('grant select on table public.weekly_checkin_keepsakes to authenticated, service_role;'));
  for(const sig of ['public.get_weekly_checkin_state(date)','public.submit_weekly_checkin(jsonb, integer)','public.get_weekly_checkin_history(integer)',
    'public.set_weekly_checkin_reaction(date, text)','public.keep_weekly_appreciation(date)']){
    assert.ok(sql.includes(`revoke all on function ${sig} from public, anon, authenticated, service_role;`),sig);
    assert.ok(sql.includes(`grant execute on function ${sig} to authenticated;`),sig);
  }
  const acl=await q(`select p.oid::regprocedure::text s, has_function_privilege('anon',p.oid,'execute') anon,
    has_function_privilege('authenticated',p.oid,'execute') auth
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('get_weekly_checkin_state','submit_weekly_checkin','get_weekly_checkin_history','set_weekly_checkin_reaction','keep_weekly_appreciation')`);
  assert.equal(acl.length,5);
  for(const r of acl){assert.equal(r.anon,false,r.s);assert.equal(r.auth,true,r.s);}
  for(const role of ['anon','authenticated']){
    const t=await one(`select has_table_privilege($1,'public.weekly_checkins','select') s, has_table_privilege($1,'public.weekly_checkins','insert') i`,[role]);
    assert.equal(t.s,false,role);assert.equal(t.i,false,role);
  }
  assert.equal((await one("select has_table_privilege('service_role','public.weekly_checkins','select') s")).s,true);
  assert.equal((await one("select has_table_privilege('authenticated','public.weekly_checkin_keepsakes','update') u")).u,false);
  assert.equal((await one("select relrowsecurity r from pg_class where oid='public.weekly_checkins'::regclass")).r,true);
  await assert.rejects(h.as(db,F,'select * from public.weekly_checkins'),/permission denied/);
});

test('sealed until both answered, then both see everything',async()=>{
  const week=await thisWeek();
  let s=await state(F);
  assert.equal(s.week_start,week);assert.equal(s.me,null);assert.equal(s.partner,null);
  assert.equal(s.partner_submitted,false);assert.equal(s.revealed,false);

  s=await submit(F,full());
  assert.equal(s.me.appreciation,'Mi hai portato il caffè');assert.equal(s.me.version,1);
  assert.equal(s.partner,null);assert.equal(s.revealed,false);

  const forB=await state(B);
  assert.equal(forB.partner_submitted,true);assert.equal(forB.revealed,false);
  assert.equal(forB.partner,null);
  assert.doesNotMatch(JSON.stringify(forB),/caffè|Bella settimana|staccare/,'nothing of F before the reveal');

  s=await submit(B,full({closeness:5,appreciation:'Mi hai ascoltata',support_request:null}));
  assert.equal(s.revealed,true);assert.equal(s.partner.appreciation,'Mi hai portato il caffè');
  assert.equal(s.partner.closeness,4);assert.equal(s.partner.support_request,'Ricordami di staccare');
  const forF=await state(F);
  assert.equal(forF.revealed,true);assert.equal(forF.partner.appreciation,'Mi hai ascoltata');
  assert.equal(forF.partner.closeness,5);assert.equal('version' in forF.partner,false);
});

test('edits only before the partner answers, with version check',async()=>{
  let s=await submit(F,full());
  s=await submit(F,full({closeness:2,appreciation:'Rivisto'}),1);
  assert.equal(s.me.version,2);assert.equal(s.me.closeness,2);
  await assert.rejects(submit(F,full(),1),/weekly_checkin_conflict/);
  await assert.rejects(submit(B,full(),3),/weekly_checkin_conflict/,'a first answer starts from version 0');
  await submit(B,full());
  await assert.rejects(submit(F,full({appreciation:'Troppo tardi'}),2),/weekly_checkin_sealed/);
  await assert.rejects(submit(B,full({appreciation:'Troppo tardi'}),1),/weekly_checkin_sealed/);
  assert.equal((await state(F)).me.appreciation,'Rivisto');
});

test('server validates every field',async()=>{
  const bad=[
    full({appreciation:null}),full({appreciation:'   '}),full({appreciation:'x'.repeat(501)}),
    full({closeness:0}),full({closeness:6}),full({energy:'4'}),full({closeness:2.5}),
    full({closeness_note:'x'.repeat(281)}),full({energy_note:'x'.repeat(281)}),full({support_request:'x'.repeat(281)}),
    full({support_last:1}),            // no request from last week to answer
    {...full(),extra:true},
  ];
  for(const p of bad)await assert.rejects(submit(F,p),/weekly_checkin_invalid/,JSON.stringify(p).slice(0,80));
  await assert.rejects(h.as(db,F,"select public.submit_weekly_checkin('[]'::jsonb,0) r"),/weekly_checkin_invalid/);
  const s=await submit(F,full({closeness:null,closeness_note:'  ',energy:null,support_request:'  ',appreciation:'  Grazie  '}));
  assert.equal(s.me.closeness,null);assert.equal(s.me.closeness_note,null);assert.equal(s.me.support_request,null);
  assert.equal(s.me.appreciation,'Grazie');
});

test("last week's request: only when that week was revealed, answered next week",async()=>{
  const last=await weeksAgo(1);
  await seedRow(h.A,F,last,{support_request:'Aiutami con la cena'});
  await seedRow(h.A,B,last,{support_request:'Stammi vicino lunedì'});
  let s=await state(F);
  assert.deepEqual(s.previous_request,{week_start:last,text:'Stammi vicino lunedì'});
  assert.equal((await state(B)).previous_request.text,'Aiutami con la cena');
  await assert.rejects(submit(F,full({support_last:4})),/weekly_checkin_invalid/);
  s=await submit(F,full({support_last:2}));assert.equal(s.me.support_last,2);
  await submit(B,full({support_last:1}));
  assert.equal((await state(F)).partner.support_last,1);

  // A week where only one of the two answered stays sealed for ever.
  const older=await weeksAgo(2);
  await seedRow(h.A,F,older,{appreciation:'Solo io',support_request:'Mai visto'});
  const past=await state(B,older);
  assert.equal(past.revealed,false);assert.equal(past.partner,null);
  assert.doesNotMatch(JSON.stringify(past),/Solo io|Mai visto/);
});

test('history: closeness of revealed weeks only, at most 8, oldest first',async()=>{
  for(let i=1;i<=10;i++){
    const w=await weeksAgo(i);
    await seedRow(h.A,F,w,{closeness:(i%5)+1});
    if(i!==3)await seedRow(h.A,B,w,{closeness:5});
  }
  const r=await history(F,20);
  assert.equal(r.weeks.length,8);
  const weeks=r.weeks.map(x=>x.week_start);
  assert.deepEqual(weeks,[...weeks].sort());
  assert.ok(!weeks.includes(await weeksAgo(3)),'unrevealed week left out');
  assert.equal(r.weeks.at(-1).week_start,await weeksAgo(1));
  assert.equal(r.weeks.at(-1).me,2);assert.equal(r.weeks.at(-1).partner,5);
  assert.deepEqual(Object.keys(r.weeks[0]).sort(),['me','partner','week_start']);
  assert.equal((await history(B,2)).weeks.length,2);
  assert.equal((await history(h.U1)).weeks.length,0,'other couple sees nothing');
});

test('reaction and Conservati only after the reveal',async()=>{
  const week=await thisWeek();
  await submit(F,full());
  await assert.rejects(react(F,week,'heart'),/weekly_checkin_not_revealed/);
  await assert.rejects(keep(F,week),/weekly_checkin_not_revealed/);
  await submit(B,full({appreciation:'Mi hai ascoltata'}));
  await assert.rejects(react(F,week,'wow'),/weekly_checkin_invalid/);
  let s=await react(F,week,'heart');
  assert.equal(s.me.appreciation_reaction,'heart');
  assert.equal((await state(B)).partner.appreciation_reaction,'heart');
  s=await react(F,week,null);assert.equal(s.me.appreciation_reaction,null);

  const k=await keep(F,week);assert.equal(k.status,'kept');
  assert.equal((await keep(F,week)).status,'already_kept');
  assert.equal((await state(F)).kept,true);
  assert.equal((await state(B)).kept,false,'B kept nothing yet');
  const rows=await h.as(db,B,'select source_key,appreciation,author_role,kept_by_role,week_start::text w from public.weekly_checkin_keepsakes');
  assert.equal(rows.length,1);
  assert.equal(rows[0].appreciation,'Mi hai ascoltata');assert.equal(rows[0].author_role,'beatrice');
  assert.equal(rows[0].kept_by_role,'francesco');assert.equal(rows[0].w,week);
  assert.match(rows[0].source_key,/^weekly_checkin:[0-9a-f-]{36}$/);
  assert.deepEqual(await h.as(db,h.U1,'select id from public.weekly_checkin_keepsakes'),[],'other couple');
  await assert.rejects(h.as(db,B,"update public.weekly_checkin_keepsakes set appreciation='x'"),/permission denied/);
  await assert.rejects(h.as(db,B,'delete from public.weekly_checkin_keepsakes'),/permission denied/);
});

test('callers without a couple or a partner are refused; couples are isolated',async()=>{
  await assert.rejects(state(null),/authentication required/);
  await assert.rejects(state(h.U3),/couple membership required/);
  await assert.rejects(submit(h.U3,full()),/couple membership required/);
  await submit(F,full());
  const other=await state(h.U1);
  assert.equal(other.me,null);assert.equal(other.partner_submitted,false);
  // A couple left with one member cannot start a round.
  await svc('select public.s32_leave_couple($1,$2) r',[h.U2,'app']);
  await assert.rejects(submit(h.U1,full()),/weekly_checkin_partner_required|couple membership required/);
});

test('reads work in a read-only transaction',async()=>{
  await submit(F,full());
  await db.exec('begin read only');
  try{
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[F]);
    await db.exec('set local role authenticated');
    const r=await db.query('select public.get_weekly_checkin_state(null) s, public.get_weekly_checkin_history(8) h');
    assert.equal(r.rows[0].s.me.closeness,4);
  }finally{await db.exec('rollback');}
});

test('lifecycle: leaving and deleting remove the member rows, kept memories stay, export lists them',async()=>{
  const week=await thisWeek();
  await seedRow(h.A,F,await weeksAgo(1));await seedRow(h.A,B,await weeksAgo(1));
  await submit(F,full());await submit(B,full({appreciation:'Mi hai ascoltata'}));
  await keep(B,week);                         // B keeps what F wrote

  const exp=await svc('select public.s32_export_user_data($1) r',[F]);
  assert.equal(exp.personal.weekly_checkins.length,2);
  assert.equal(exp.personal.weekly_checkins.at(-1).appreciation,'Mi hai portato il caffè');
  for(const k of ['couple_id','user_id','id'])assert.equal(k in exp.personal.weekly_checkins[0],false,k);

  await svc('select public.s32_leave_couple($1,$2) r',[F,'app']);
  assert.equal(Number((await one('select count(*) n from public.weekly_checkins where user_id=$1',[F])).n),0);
  assert.equal(Number((await one('select count(*) n from public.weekly_checkins where user_id=$1',[B])).n),2);
  const kept=await q('select appreciation,author_role from public.weekly_checkin_keepsakes where couple_id=$1',[h.A]);
  assert.deepEqual(kept,[{appreciation:'Mi hai portato il caffè',author_role:'francesco'}],'Policy A: the kept memory stays');

  await svc('select public.s32_delete_account_data($1,$2) r',[B,'app']);
  assert.equal(Number((await one('select count(*) n from public.weekly_checkins where couple_id=$1',[h.A])).n),0);
});

test('export redefinition is guarded by the audited body',()=>{
  const sql=fs.readFileSync(path.join(DIR,FILE),'utf8');
  assert.match(sql,/to_regprocedure\('public\.s32_export_user_data\(uuid\)'\)/);
  assert.ok(sql.includes("'c56f572867f6ec5c6d6ae175c3dbfdd1'"),'audited md5 of the S3.2 export body');
  assert.ok(sql.includes('revoke all on function public.s32_export_user_data(uuid) from public, anon, authenticated;'));
  assert.ok(sql.includes('grant execute on function public.s32_export_user_data(uuid) to service_role;'));
  assert.doesNotMatch(sql,/create or replace function (private\.s32_close_membership|public\.s32_delete_account_data|public\.s32_leave_couple)/,
    'deletion and leave are not redefined: rows go with the profile (FK cascade)');
});
