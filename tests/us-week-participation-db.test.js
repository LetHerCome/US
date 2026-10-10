const test=require('node:test'),assert=require('node:assert/strict');
const h=require('./helpers/week-participation-db');
let db,p,other,q,today,legacy,legacyQ,before,authority;
const code=c=>e=>e.code===c;
const snapshot=async()=>JSON.stringify((await db.query(`select c.bond_xp,(select jsonb_agg(e order by e.id) from public.progression_events e where e.couple_id=c.id) events from public.couples c order by id`)).rows);
test.before(async()=>{
 db=await h.base();p=await h.pair(db);other=await h.pair(db);
 today=(await db.query("select (now() at time zone 'Europe/Rome')::date::text d")).rows[0].d;
 legacyQ=await h.question(db,'2026-01-01');q=await h.question(db,today);
 legacy=(await db.query("insert into public.daily_answers(question_id,user_id,couple_id,answer) values ($1,$2,$3,'Risposta storica') returning *",[legacyQ,p.a,p.c])).rows[0];
 before=await snapshot();
 authority=(await db.query("select p.oid,md5(pg_get_functiondef(p.oid)) body from pg_proc p where p.proname like 'progression_%' or p.proname in ('start_game_round','complete_game_session_side','get_game_v2_home','game_v2_week_start','game_v2_week_usage') order by p.oid")).rows;
 await db.exec(h.sql());
});
test.after(async()=>{await db?.close();});
test.beforeEach(async()=>{await db.exec('begin');});
test.afterEach(async()=>{await db.exec('rollback');});
async function both(question=q){await h.answer(db,p,p.a,question);await h.answer(db,p,p.b,question);}
const dayOf=(r,d=today)=>r.days.find(x=>x.date===d);

test('week migration preserves legacy timestamps, history, ledger and XP; legacy update stays unverifiable',async()=>{
 assert.equal(await snapshot(),before);
 assert.deepEqual((await db.query("select p.oid,md5(pg_get_functiondef(p.oid)) body from pg_proc p where p.proname like 'progression_%' or p.proname in ('start_game_round','complete_game_session_side','get_game_v2_home','game_v2_week_start','game_v2_week_usage') order by p.oid")).rows,authority);
 const row=(await db.query('select * from public.daily_answers where id=$1',[legacy.id])).rows[0];
 assert.equal(row.server_answered_at,null);
 assert.deepEqual(Object.fromEntries(Object.entries(row).filter(([k])=>k!=='server_answered_at')),legacy);
 await h.answer(db,p,p.a,legacyQ,{time:today+'T12:00:00Z'});
 assert.equal((await db.query('select server_answered_at from public.daily_answers where id=$1',[legacy.id])).rows[0].server_answered_at,null);
 assert.equal(dayOf(await h.at(db,p,'2026-01-01'),'2026-01-01').status,'unverifiable');
});
test('Daily first receipt is server assigned and immutable across malicious UPDATE and upsert retry',async()=>{
 const a=await h.answer(db,p,p.a,q);
 assert.equal(new Date(a.server_answered_at).toISOString().slice(0,4),today.slice(0,4));
 const stamp=new Date(a.server_answered_at).toISOString();
 const updated=(await h.as(db,p.a,'update public.daily_answers set server_answered_at=$1,created_at=$1,updated_at=$1 where id=$2 returning *',['2080-01-01T00:00Z',a.id]))[0];
 assert.equal(new Date(updated.server_answered_at).toISOString(),stamp);
 const retried=await h.answer(db,p,p.a,q,{time:'2080-01-01T00:00Z'});
 assert.equal(new Date(retried.server_answered_at).toISOString(),stamp);
 assert.equal((await h.read(db,p.a)).completed_days,0);
});
test('only two Daily plus the same shared completed session make one green day, reads never award XP',async()=>{
 await both();assert.equal(dayOf(await h.read(db,p.a)).daily_complete,true);
 assert.equal(dayOf(await h.read(db,p.a)).complete,false);
 const instant=(await db.query('select now() t')).rows[0].t;
 await h.game(db,p,{date:instant});const snap=await snapshot();
 const r=await h.read(db,p.a);
 assert.equal(dayOf(r).complete,true);assert.equal(dayOf(r).status,'complete');assert.equal(r.completed_days,1);
 assert.equal(r.timezone,'Europe/Rome');assert.equal(r.days.length,7);
 assert.deepEqual(await h.read(db,p.b),r);assert.equal(await snapshot(),snap);
 assert.ok(!JSON.stringify(r).includes(p.c));assert.ok(!JSON.stringify(r).includes('Una risposta'));
});
test('different sessions, one completed side or missing shared completion cannot be combined',async()=>{
 await both();const instant=(await db.query('select now() t')).rows[0].t;
 await h.game(db,p,{date:instant,b:null,shared:null});await h.game(db,p,{date:instant,a:null,shared:null});
 assert.equal(dayOf(await h.read(db,p.a)).game_complete,false);
 await h.game(db,p,{date:instant,shared:null});assert.equal(dayOf(await h.read(db,p.a)).complete,false);
});
test('same shared session whose sides straddle Rome midnight does not complete either day',async()=>{
 const d='2026-10-09',qDate=await h.question(db,d);await both(qDate);
 await h.receiptsAt(db,p,qDate,'2026-10-09T12:00Z');
 await h.game(db,p,{date:'2026-10-09T22:00:01Z',a:'2026-10-09T21:59:59Z'});
 assert.equal(dayOf(await h.at(db,p,d),d).complete,false);
 assert.equal(dayOf(await h.at(db,p,'2026-10-10'),'2026-10-10').complete,false);
});
test('Daily for a different date does not qualify; old unverifiable answers never create a green day',async()=>{
 await both(legacyQ);const instant=(await db.query('select now() t')).rows[0].t;
 await h.game(db,p,{date:instant});assert.equal(dayOf(await h.read(db,p.a)).daily_complete,false);
});
test('Rome week switches on Monday and DST days use local midnight bounds',async()=>{
 for(const [d,inside,outside,week] of [
  ['2026-03-29','2026-03-29T21:59:59Z','2026-03-29T22:00:00Z','2026-03-23'],
  ['2026-10-25','2026-10-25T22:59:59Z','2026-10-25T23:00:00Z','2026-10-19']]){
  const question=await h.question(db,d);await both(question);await h.receiptsAt(db,p,question,inside);
  const session=await h.game(db,p,{date:inside});let r=await h.at(db,p,d);
  assert.equal(r.week_start,week);assert.equal(dayOf(r,d).complete,true);
  await db.query('update public.game_sessions set completed_at=$1 where id=$2',[outside,session]);
  assert.equal(dayOf(await h.at(db,p,d),d).complete,false);
 }
 assert.equal((await h.at(db,p,'2026-10-11')).week_start,'2026-10-05');
 const monday=await h.at(db,p,'2026-10-12');assert.equal(monday.week_start,'2026-10-12');assert.equal(monday.week_end,'2026-10-18');
});
test('weekly XP is the actual tenant ledger sum by action_day, not completion count or created_at',async()=>{
 const values=[[p.c,'2026-10-05',13],[p.c,'2026-10-11',7],[p.c,'2026-10-12',100],[other.c,'2026-10-06',999]];
 for(const [c,d,xp] of values)await db.query("insert into public.progression_events(couple_id,source_kind,source_key,xp_awarded,action_day,created_at) values ($1,'daily',$2,$3,$4,'1999-01-01')",[c,h.id(),xp,d]);
 const snap=await snapshot();assert.equal((await h.at(db,p,'2026-10-09')).weekly_xp_awarded,20);assert.equal(await snapshot(),snap);
});
test('cross couple writes, identity transfers, blank answers and destructive provenance resets are denied',async()=>{
 const a=await h.answer(db,p,p.a,q);
 await assert.rejects(h.as(db,p.a,'update public.daily_answers set question_id=$1 where id=$2',[legacyQ,a.id]),code('42501'));
 await assert.rejects(h.as(db,p.a,'update public.daily_answers set id=$1 where id=$2',[h.id(),a.id]),code('42501'));
 await assert.rejects(h.as(db,p.a,'update public.daily_answers set couple_id=$1 where id=$2',[other.c,a.id]),code('42501'));
 await assert.rejects(h.answer(db,other,p.a,q),code('42501'));
 for(const table of ['game_sessions','game_session_sides'])await assert.rejects(h.as(db,p.a,`update public.${table} set completed_at='2080-01-01'`),code('42501'));
 await assert.rejects(h.as(db,p.a,"update public.daily_answers set answer='   ' where id=$1",[a.id]),code('22023'));
 for(const table of ['daily_answers','daily_questions']){
  await assert.rejects(h.as(db,p.a,`delete from public.${table}`),code('42501'));
  await assert.rejects(h.as(db,p.a,`truncate public.${table} cascade`),code('42501'));
 }
});
test('RPC refuses anon, missing auth/profile/couple and private argument spoofing; other couple sees only itself',async()=>{
 await both();await h.game(db,p,{date:(await db.query('select now() t')).rows[0].t});
 assert.equal((await h.read(db,other.a)).completed_days,0);
 await assert.rejects(h.as(db,p.a,'select public.get_couple_week_participation_v1()',[],'anon'),code('42501'));
 await assert.rejects(h.read(db,null),code('42501'));
 await assert.rejects(h.read(db,h.id()),code('42501'));
 await assert.rejects(h.as(db,p.a,'select private.couple_week_participation_v1($1,$2::date)',[other.c,today]),code('42501'));
 await db.query('update auth.users set is_anonymous=true,raw_user_meta_data=$1 where id=$2',[JSON.stringify({couple_id:p.c,role:'francesco',is_anonymous:false}),p.a]);
 await assert.rejects(h.read(db,p.a),code('42501'));
});
test('single member cannot claim both sides; membership move immediately changes tenant authority',async()=>{
 await both();await h.game(db,p,{date:(await db.query('select now() t')).rows[0].t});
 await db.query('delete from public.profiles where id=$1',[p.b]);
 assert.equal((await h.read(db,p.a)).completed_days,0);
 await db.query('update public.profiles set couple_id=null where id=$1',[p.a]);
 await assert.rejects(h.read(db,p.a),code('42501'));
});
test('Day tables never expose MAINTAIN to anonymous or authenticated clients',async()=>{
 for(const table of ['daily_answers','daily_questions']){
  for(const role of ['anon','authenticated']){
   const row=(await db.query('select pg_catalog.has_table_privilege($1,$2,$3) granted',[role,'public.'+table,'MAINTAIN'])).rows[0];
   assert.equal(row.granted,false,role+' must not have MAINTAIN on '+table);
  }
 }
});
test('partner roles are already unique per couple through the existing partial index',async()=>{
 const index=(await db.query("select indexdef from pg_indexes where schemaname='public' and indexname='profiles_one_role_per_couple'")).rows[0];
 assert.ok(index&&/UNIQUE INDEX/i.test(index.indexdef));
 await assert.rejects(db.query('update public.profiles set role=$1 where id=$2',['francesco',p.b]),/duplicate key|unique constraint/i);
});
test('migration refuses unexpected client Game grants before changing the substrate',async()=>{
 const isolated=await h.base();
 try{
  for(const operation of ['update','insert']){
   await isolated.exec(`grant ${operation}(completed_at) on public.game_session_sides to authenticated`);
   await assert.rejects(isolated.exec(h.sql()),/requires server-only Game mutations/);
   await isolated.exec('rollback');
   assert.equal((await isolated.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='daily_answers' and column_name='server_answered_at'")).rows[0].n,0);
   await isolated.exec(`revoke ${operation}(completed_at) on public.game_session_sides from authenticated`);
  }
 }finally{await isolated.close();}
});
