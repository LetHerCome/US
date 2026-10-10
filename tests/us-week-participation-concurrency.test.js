// Two real PostgreSQL connections, current baseline and every forward migration.
// Never PGlite queueing disguised as concurrent transactions; mandatory in CI.
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID:id}=require('node:crypto');
const pg=require('./helpers/mc2-pg'),h=require('./helpers/mc2-db');
if(process.env.US_WEEK_RACE_REQUIRED==='1'&&!pg.CAN_RUN)throw Error(pg.SKIP);
let server;
test.before(()=>{if(pg.CAN_RUN)server=pg.startServer({excludeUndeployedV3:process.env.US_WEEK_PROD_SCHEMA==='1'});});
test.after(()=>server?.stop());
const actor=u=>pg.asUser(u);
function statementAs(u,sql){return server.sql(`begin; ${actor(u)} ${sql}; commit;`);}
function setupDaily(){
 server.reset();const q=id();
 server.sql(`insert into public.daily_questions(id,question_date,question) values ('${q}',(now() at time zone 'Europe/Rome')::date,'Una domanda fixture') on conflict(question_date) do update set question=excluded.question;`);
 return server.sql("select id from public.daily_questions where question_date=(now() at time zone 'Europe/Rome')::date");
}
const insert=(q,u,tag)=>`insert into public.daily_answers(question_id,user_id,couple_id,answer,server_answered_at)
 values ('${q}','${u}','${h.A}','Una risposta fixture','1999-01-01')
 on conflict(question_id,user_id) do update set answer=excluded.answer,server_answered_at=excluded.server_answered_at
 returning '${tag}:'||server_answered_at::text;`;
function currentDayComplete(){return statementAs(h.F,"select 'complete:'||(public.get_couple_week_participation_v1()->>'completed_days')").split('\n').find(x=>x.startsWith('complete:'));}

test('real PG: racing Daily upserts retain the first server receipt, including BEFORE INSERT conflict path', {skip:pg.SKIP},async()=>{
 const q=setupDaily(),a=server.session(),b=server.session();
 try{
  a.send(`begin; ${actor(h.F)} ${insert(q,h.F,'first')}`);
  await pg.waitFor(()=>a.peek().out.includes('first:'),'first INSERT');
  b.send(`begin; ${actor(h.F)} ${insert(q,h.F,'second')}`);
  await pg.waitFor(()=>server.lockWaiters()>0,'second upsert blocks on first receipt');
  assert.equal(server.sql(`select count(*) from public.daily_answers where question_id='${q}'`),'0','uncommitted response is not visible');
  a.send('commit;');await pg.waitFor(()=>b.peek().out.includes('second:'),'retry finished');b.send('commit;');
  const [one,two]=await Promise.all([a.end(),b.end()]);assert.equal(one.err,'');assert.equal(two.err,'');
  const stamp=one.out.split('\n').find(x=>x.startsWith('first:')).slice(6);
  assert.equal(two.out.split('\n').find(x=>x.startsWith('second:')).slice(7),stamp);
  assert.equal(server.sql(`select count(*) from public.daily_answers where question_id='${q}'`),'1');
  statementAs(h.B,insert(q,h.B,'partner'));
  const xp=server.sql(`select bond_xp from public.couples where id='${h.A}'`);
  statementAs(h.B,insert(q,h.B,'retry'));
  assert.equal(server.sql(`select bond_xp from public.couples where id='${h.A}'`),xp);
  assert.equal(server.sql(`select count(*) from public.progression_events where couple_id='${h.A}' and source_kind='daily'`),'1');
 }finally{await Promise.all([a.end(),b.end()]);}
});

test('real PG: shared game completions serialize, no green before both commits, existing XP and three-game budget are unchanged',{skip:pg.SKIP},async()=>{
 const q=setupDaily();statementAs(h.F,insert(q,h.F,'a'));statementAs(h.B,insert(q,h.B,'b'));
 const output=statementAs(h.F,`select public.start_game_round('scopritevi','${id()}')->>'id'`);
 const session=output.split('\n').find(x=>/^[a-f0-9-]{36}$/.test(x)&&x!==h.F);assert.ok(session,output);
 const items=JSON.parse(server.sql(`select json_agg(json_build_object('id',id,'kind',answer_kind) order by position) from public.game_session_items where session_id='${session}'`));
 for(const u of [h.F,h.B])for(const item of items)statementAs(u,
  `select public.save_game_session_answer('${session}','${item.id}',${item.kind==='choice'?'null':"'Una risposta fixture'"},${item.kind==='choice'?'0::smallint':'null'})`);
 const a=server.session(),b=server.session();
 try{
  a.send(`begin; ${actor(h.F)} select 'side-a:'||(public.complete_game_session_side('${session}')->>'my_complete');`);
  await pg.waitFor(()=>a.peek().out.includes('side-a:true'),'first completion');
  b.send(`begin; ${actor(h.B)} select 'side-b:'||(public.complete_game_session_side('${session}')->>'my_complete');`);
  await pg.waitFor(()=>server.lockWaiters()>0,'partner completion waits');
  assert.equal(currentDayComplete(),'complete:0');
  a.send('commit;');await pg.waitFor(()=>b.peek().out.includes('side-b:true'),'partner finalized but uncommitted');
  assert.equal(currentDayComplete(),'complete:0');
  b.send('commit;');const results=await Promise.all([a.end(),b.end()]);for(const r of results)assert.equal(r.err,'');
  assert.equal(currentDayComplete(),'complete:1');
  const xp=server.sql(`select bond_xp from public.couples where id='${h.A}'`);
  statementAs(h.B,`select public.complete_game_session_side('${session}')`);currentDayComplete();
  assert.equal(server.sql(`select bond_xp from public.couples where id='${h.A}'`),xp);
  assert.equal(server.sql(`select count(*) from public.progression_events where couple_id='${h.A}' and source_kind='game'`),'1');
  const budget=statementAs(h.F,"select 'budget:'||(public.get_game_v2_home()->'allowance')::text").split('\n').find(x=>x.startsWith('budget:'));
  const allowance=JSON.parse(budget.slice(7));assert.equal(allowance.limit,3);assert.equal(allowance.used,1);
 }finally{await Promise.all([a.end(),b.end()]);}
});
