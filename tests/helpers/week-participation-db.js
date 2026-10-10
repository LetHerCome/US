// Real current baseline + forward SQL, isolated embedded Postgres only.
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID:id}=require('node:crypto');
const {newDb}=require('../../scripts/supabase-baseline/rebuild.cjs');
const ROOT=path.resolve(__dirname,'../..');
const DIR=path.join(ROOT,'supabase/migrations');
const FILE=fs.readdirSync(DIR).find(f=>f.endsWith('_us_v6_week_participation.sql'));
const sql=()=>fs.readFileSync(path.join(DIR,FILE),'utf8');
async function base({exclude=[]}={}){
 const db=await newDb();
 const excluded=new Set(exclude);
 try{for(const f of fs.readdirSync(DIR).filter(f=>f.endsWith('.sql')&&f!==FILE&&!excluded.has(f)).sort())await db.exec(fs.readFileSync(path.join(DIR,f),'utf8'));return db;}
 catch(e){await db.close();throw e;}
}
async function pair(db){
 const c=id(),a=id(),b=id();
 await db.query('insert into public.couples(id,name,started_on) values ($1,$2,$3)',[c,'Coppia fixture','2026-01-01']);
 await db.query('insert into auth.users(id,is_anonymous) values ($1,false),($2,false)',[a,b]);
 await db.query("insert into public.profiles(id,couple_id,role,display_name) values ($1,$3,'francesco','Alex'),($2,$3,'beatrice','Sam')",[a,b,c]);
 return {c,a,b};
}
async function question(db,date){return (await db.query('insert into public.daily_questions(question_date,question) values ($1,$2) on conflict (question_date) do update set question=excluded.question returning id',[date,'Quale momento vorresti rivivere?'])).rows[0].id;}
async function as(db,user,text,params=[],role='authenticated'){
 await db.exec('savepoint week_actor');
 try{
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user||'']);
  await db.exec(`set local role ${role}`);
  const result=await db.query(text,params);
  await db.exec('reset role; release savepoint week_actor');
  await db.query("select set_config('request.jwt.claim.sub','',true)");
  return result.rows;
 }catch(e){await db.exec('rollback to savepoint week_actor; release savepoint week_actor');throw e;}
}
async function answer(db,p,user,q,extra={}){
 return (await as(db,user,`insert into public.daily_answers(question_id,user_id,couple_id,answer,created_at,updated_at,server_answered_at)
 values ($1,$2,$3,'Una risposta',$4,$4,$4) on conflict (question_id,user_id) do update set answer=excluded.answer,updated_at=excluded.updated_at,server_answered_at=excluded.server_answered_at returning *`,[q,user,p.c,extra.time||'1999-01-01T12:00:00Z']))[0];
}
async function game(db,p,{date,a=date,b=date,shared=date}={}){
 const s=id();
 await db.query("insert into public.game_sessions(id,couple_id,game_family,content_source,started_by_role,create_request_id,completed_at) values ($1,$2,'scopritevi','curated','francesco',$3,$4)",[s,p.c,id(),shared||null]);
 await db.query("insert into public.game_session_sides(session_id,actor_role,completed_at) values ($1,'francesco',$2),($1,'beatrice',$3)",[s,a||null,b||null]);
 return s;
}
const read=async(db,user)=>(await as(db,user,'select public.get_couple_week_participation_v1() r'))[0].r;
const at=async(db,p,date)=>(await db.query('select private.couple_week_participation_v1($1,$2::date) r',[p.c,date])).rows[0].r;
// Trusted test clock fixture only: never shipped/applied to a Supabase project.
async function receiptsAt(db,p,q,time){
 await db.exec('alter table public.daily_answers disable trigger us_v6_daily_answer_receipt');
 try{await db.query('update public.daily_answers set server_answered_at=$1 where couple_id=$2 and question_id=$3',[time,p.c,q]);}
 finally{await db.exec('alter table public.daily_answers enable trigger us_v6_daily_answer_receipt');}
}
module.exports={ROOT,FILE,sql,base,pair,question,as,answer,game,read,at,receiptsAt,id};
