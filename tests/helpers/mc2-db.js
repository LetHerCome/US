// MC2-only platform completion; never applied to Supabase or historical baseline.
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../../scripts/supabase-baseline/evidence.cjs');
const { newDb } = require('../../scripts/supabase-baseline/rebuild.cjs');
const DIR = path.join(ROOT, 'supabase/migrations');
const FILE = fs.readdirSync(DIR).find(f => /_mc2_couple_invites.sql$/.test(f));
const MC2 = () => fs.readFileSync(path.join(DIR, FILE), 'utf8');
const A = '11111111-1111-4111-8111-111111111111';
const uid = n => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const F = uid(1), B = uid(2), U1 = uid(3), U2 = uid(4), U3 = uid(5), U4 = uid(6), ANON = uid(7), UNCONFIRMED = uid(8), BANNED = uid(9);
const PLATFORM = `alter table auth.users add column banned_until timestamptz;
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade);
create index mc2_test_sessions_user on auth.sessions(user_id);`;
const SEED = `insert into auth.users(id,email,email_confirmed_at,is_anonymous,banned_until) values
${[F,B,U1,U2,U3,U4].map((u,i)=>`('${u}','u${i}@example.test',now(),false,null)`).join(',')},
('${ANON}',null,null,true,null), ('${UNCONFIRMED}','unconfirmed@example.test',null,false,null),
('${BANNED}','banned@example.test',now(),false,now()+interval '1 day');
insert into auth.sessions(user_id) select id from auth.users;
insert into public.couples(id,name,started_on) values ('${A}','US.','2026-04-21');
insert into public.profiles(id,display_name,couple_id,role) values ('${F}','Francesco','${A}','francesco'),('${B}','Beatrice','${A}','beatrice');
insert into public.couple_invites(couple_id,role,code_hash,used_by,used_at) values
('${A}','francesco',repeat('a',64),'${F}',now()),('${A}','beatrice',repeat('b',64),'${B}',now());`;
async function database({mc2=true, seed=true}={}) {
  const db = await newDb();
  try {
    await db.exec(PLATFORM);
    const files=fs.readdirSync(DIR).filter(f=>f.endsWith('.sql')).sort();
    // MC2 upgrade fixtures deliberately delay MC2 itself. Its dependent read model
    // must wait too; a pre-MC2 substrate has unprotected membership parents.
    const week=files.filter(f=>f.endsWith('_us_v6_week_participation.sql'));
    for (const f of files.filter(f=>f!==FILE&&!week.includes(f))) await db.exec(fs.readFileSync(path.join(DIR,f),'utf8'));
    if(seed) await db.exec(SEED);
    if(mc2){await db.exec(MC2());for(const f of week)await db.exec(fs.readFileSync(path.join(DIR,f),'utf8'));}
    return db;
  } catch(e) { await db.close(); throw e; }
}
async function as(db,user,sql,params=[],role='authenticated') {
  await db.exec('begin');
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user || '']);
    await db.exec(`set local role ${role}`);
    const r=await db.query(sql,params); await db.exec('commit'); return r.rows[0]?.r ?? r.rows;
  } catch(e) {await db.exec('rollback'); throw e;}
}
const create=(db,u=U1,name='Alex',date='2026-01-01',couple=null)=>as(db,u,'select public.create_couple($1,$2::date,$3) r',[name,date,couple]);
const invite=(db,u=U1)=>as(db,u,'select public.create_partner_invite() r');
const accept=(db,u,code,name='Sam')=>as(db,u,'select public.accept_partner_invite($1,$2) r',[code,name]);
const membership=(db,u)=>as(db,u,'select public.get_couple_membership() r');
const revoke=(db,u=U1)=>as(db,u,'select public.revoke_partner_invite() r');
module.exports={ROOT,DIR,FILE,MC2,PLATFORM,SEED,A,F,B,U1,U2,U3,U4,ANON,UNCONFIRMED,BANNED,database,as,create,invite,accept,membership,revoke,uid};
