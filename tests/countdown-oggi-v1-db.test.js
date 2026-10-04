const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {fresh,asUser,uuid}=require('./helpers/progression-db');
const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261004204518_countdown_oggi_v1.sql'),'utf8');
const get=(db,u)=>asUser(db,u,()=>db.query('select public.get_countdown_oggi_v1() s').then(r=>r.rows[0].s));
const save=(db,u,s,v)=>asUser(db,u,()=>db.query('select public.save_countdown_oggi_v1($1::jsonb,$2) s',[JSON.stringify(s),v]).then(r=>r.rows[0].s));
async function fixture(){const f=await fresh();await f.db.exec('alter table public.couples add column started_on date;');await f.db.exec(sql);return f;}
const item=(style='editorial')=>({id:uuid(),title:'Ancora noi',mode:'clock',target:'2027-10-04T18:42:17.000Z',style});
test('shared CRUD derives relationship date; stale partner saves cannot overwrite',async()=>{
 const {db,c,f,b}=await fixture();try{
 await db.query("update public.couples set started_on='2026-01-01' where id=$1",[c]);
 let s=await get(db,f);assert.equal(s.started_on,'2026-01-01');assert.equal(s.version,0);
 const e=item();s=await save(db,f,{items:[e],active_id:e.id,together_style:'editorial'},0);
 assert.equal(s.version,1);assert.equal((await get(db,b)).items[0].title,'Ancora noi');
 await assert.rejects(save(db,b,{items:[],active_id:null,together_style:'editorial'},0),/countdown_conflict/);
 s=await save(db,b,{items:[{...e,title:'Il viaggio'}],active_id:'together',together_style:'glass'},1);assert.equal(s.items[0].title,'Il viaggio');
 s=await save(db,f,{items:[],active_id:null,together_style:'editorial'},2);assert.deepEqual(s.items,[]);assert.equal(s.active_id,null);
 }finally{await db.close();}
});
test('RPC rejects unauthenticated/orphan callers and tables cannot be accessed directly',async()=>{
 const {db,f}=await fixture();try{
 await assert.rejects(get(db,null),/membership|authentication/);
 await assert.rejects(get(db,uuid()),/membership/);
 await assert.rejects(save(db,null,{items:[],active_id:null,together_style:'editorial'},0),/authentication/);
 const other=uuid(),outsider=uuid();
 await db.query('insert into public.couples(id) values($1)',[other]);await db.query("insert into public.profiles(id,couple_id,role) values($1,$2,'francesco')",[outsider,other]);
 const e=item();await save(db,f,{items:[e],active_id:e.id,together_style:'editorial'},0);
 assert.deepEqual((await get(db,outsider)).items,[]);
 await asUser(db,f,async()=>{await db.exec('begin read only');try{const s=await db.query('select public.get_countdown_oggi_v1() s');assert.equal(s.rows[0].s.items[0].id,e.id);}finally{await db.exec('rollback');}});
 await assert.rejects(asUser(db,f,()=>db.query('select * from public.couple_countdown_preferences')),/permission denied/);
 await assert.rejects(asUser(db,f,()=>db.query("insert into public.couple_countdown_preferences(couple_id) values (gen_random_uuid())")),/permission denied/);
 }finally{await db.close();}
});
test('server enforces reward unlock, bounds, unique IDs and valid active selection',async()=>{
 const {db,c,f}=await fixture();try{
 const e=item('aurora');const s={items:[e],active_id:e.id,together_style:'editorial'};
 await assert.rejects(save(db,f,s,0),/countdown_style_locked/);
 await db.query('update public.couples set bond_xp=1050 where id=$1',[c]);
 assert.equal((await save(db,f,s,0)).items[0].style,'aurora');
 for(const bad of [{...s,active_id:uuid()},{...s,items:[e,e]},{...s,items:[{...e,title:'x'.repeat(33)}]},{...s,items:[{...e,mode:'days',target:'2026-02-30'}]},{...s,items:[{...e,target:'not-a-date'}]},{...s,items:Array.from({length:13},()=>item())}])await assert.rejects(save(db,f,bad,1));
 assert.equal((await get(db,f)).version,1);
 assert.equal((await db.query('select bond_xp from public.couples where id=$1',[c])).rows[0].bond_xp,1050);
 }finally{await db.close();}
});
