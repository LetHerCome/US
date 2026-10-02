const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const ROOT = path.resolve(__dirname, '..');
const MIGRATION = path.join(ROOT, 'supabase/migrations/20261002181500_us_progression_v1.sql');
const TOGGLE_MIGRATION = path.join(ROOT, 'supabase/migrations/20261002181501_progression_reward_toggle_unequip.sql');
const sql = () => `${fs.readFileSync(MIGRATION, 'utf8')}\n${fs.readFileSync(TOGGLE_MIGRATION, 'utf8')}`;
const uuid = (() => { let n = 1; return () => `00000000-0000-4000-8000-${String(n++).padStart(12,'0')}`; })();

const FIXTURE = `
create role anon;
create role authenticated;
create schema auth;
create schema private;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.couples(id uuid primary key, bond_xp integer not null default 0);
create table public.profiles(id uuid primary key, couple_id uuid references public.couples(id), role text, created_at timestamptz default now());
create function private.current_couple_id() returns uuid language sql stable security definer set search_path='' as $$
  select p.couple_id from public.profiles p where p.id=auth.uid()
$$;

create table public.bond_weekly_quests(
 id uuid primary key, couple_id uuid not null references public.couples(id), xp smallint not null,
 completed_at timestamptz
);
create table public.shared_event_completions(
 id uuid primary key, event_id uuid not null, couple_id uuid not null references public.couples(id),
 occurrence_date date not null, completed_by uuid not null references public.profiles(id),
 xp_awarded integer not null, completed_at timestamptz not null default now()
);
create table public.relationship_milestones(
 id uuid primary key, couple_id uuid not null references public.couples(id), milestone_date date not null,
 kind text not null, months_together integer not null, xp_awarded integer not null, awarded_at timestamptz not null default now()
);
create table public.game_sessions(
 id uuid primary key, couple_id uuid not null references public.couples(id), completed_at timestamptz
);
create table public.daily_answers(
 id uuid primary key default gen_random_uuid(), question_id uuid not null, user_id uuid not null references public.profiles(id),
 couple_id uuid not null references public.couples(id), answer text not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(question_id,user_id)
);
create table public.shared_messages(
 id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
 sender_id uuid not null references public.profiles(id), recipient_id uuid not null references public.profiles(id),
 kind text not null default 'normal', created_at timestamptz not null default now()
);
create table public.moments(
 id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
`;

async function fresh() {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(sql());
  const c=uuid(),f=uuid(),b=uuid();
  await db.query('insert into public.couples(id,bond_xp) values ($1,0)',[c]);
  await db.query("insert into public.profiles(id,couple_id,role) values ($1,$3,'francesco'),($2,$3,'beatrice')",[f,b,c]);
  return {db,c,f,b};
}
async function asUser(db,uid,fn){
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${uid||''}',false);`);
  try{return await fn();}finally{await db.exec("reset role; select set_config('request.jwt.claim.sub','',false);");}
}
const state = (db,uid) => asUser(db,uid,()=>db.query('select public.get_progression_v1() s').then(r=>r.rows[0].s));

test('Progression V1: reward catalog and level thresholds match the existing Bond curve', async()=>{
  const {db,c}=await fresh();
  const rewards=(await db.query('select id,level_required from public.progression_reward_catalog order by sort_order')).rows;
  assert.deepEqual(rewards.map(r=>[r.id,r.level_required]),[
    ['frame_glow',2],['theme_rose',3],['frame_aurora',4],['theme_midnight',5],['effect_pulse',6]
  ]);
  for(const [xp,level] of [[0,1],[199,1],[200,2],[549,2],[550,3],[1050,4],[1700,5],[2500,6]]){
    assert.equal((await db.query('select private.progression_level($1) l',[xp])).rows[0].l,level);
  }
  await db.query('update public.couples set bond_xp=550 where id=$1',[c]);
  assert.deepEqual((await db.query('select reward_id from public.couple_reward_unlocks where couple_id=$1 order by reward_id',[c])).rows.map(r=>r.reward_id).sort(),['frame_glow','theme_rose']);
});

test('Progression V1: one source can never add Sintonia twice',async()=>{
  const {db,c,f}=await fresh();
  const first=(await db.query("select private.progression_award($1,$2,'moment','same',10,now(),true,true) s",[c,f])).rows[0].s;
  const again=(await db.query("select private.progression_award($1,$2,'moment','same',10,now(),true,true) s",[c,f])).rows[0].s;
  assert.equal(first.recorded,true); assert.equal(first.xp_added,10);
  assert.equal(again.recorded,false); assert.equal(again.xp_added,0);
  assert.equal((await db.query('select bond_xp from public.couples where id=$1',[c])).rows[0].bond_xp,10);
  assert.equal((await db.query('select count(*)::int n from public.progression_events where couple_id=$1',[c])).rows[0].n,1);
});

test('Progression V1: Daily awards once when both answered; Think and Moment cap each actor to once per Rome day',async()=>{
  const {db,c,f,b}=await fresh();
  const q=uuid();
  await db.query("insert into public.daily_answers(question_id,user_id,couple_id,answer,created_at,updated_at) values ($1,$2,$3,'A','2026-10-02T10:00:00Z','2026-10-02T10:00:00Z')",[q,f,c]);
  assert.equal((await db.query('select bond_xp from public.couples where id=$1',[c])).rows[0].bond_xp,0);
  await db.query("insert into public.daily_answers(question_id,user_id,couple_id,answer,created_at,updated_at) values ($1,$2,$3,'B','2026-10-02T10:02:00Z','2026-10-02T10:02:00Z')",[q,b,c]);
  await db.query("update public.daily_answers set answer='B2',updated_at='2026-10-02T10:03:00Z' where question_id=$1 and user_id=$2",[q,b]);
  assert.equal((await db.query('select bond_xp from public.couples where id=$1',[c])).rows[0].bond_xp,10);

  await db.query("insert into public.shared_messages(couple_id,sender_id,recipient_id,kind,created_at) values ($1,$2,$3,'think','2026-10-02T12:00:00Z'),($1,$2,$3,'think','2026-10-02T13:00:00Z')",[c,f,b]);
  assert.equal((await db.query('select bond_xp from public.couples where id=$1',[c])).rows[0].bond_xp,12);

  await db.query("insert into public.moments(couple_id,created_by,created_at) values ($1,$2,'2026-10-02T14:00:00Z'),($1,$2,'2026-10-02T15:00:00Z')",[c,f]);
  assert.equal((await db.query('select bond_xp from public.couples where id=$1',[c])).rows[0].bond_xp,22);
});

test('Progression V1: completed Game adds 15 once; existing Quest/Event XP is only logged, never doubled',async()=>{
  const {db,c,f}=await fresh();
  const game=uuid();
  await db.query('insert into public.game_sessions(id,couple_id) values ($1,$2)',[game,c]);
  await db.query("update public.game_sessions set completed_at='2026-10-02T16:00:00Z' where id=$1",[game]);
  await db.query("update public.game_sessions set completed_at='2026-10-02T16:01:00Z' where id=$1",[game]);
  assert.equal((await db.query('select bond_xp from public.couples where id=$1',[c])).rows[0].bond_xp,15);

  const quest=uuid();
  await db.query('insert into public.bond_weekly_quests(id,couple_id,xp) values ($1,$2,40)',[quest,c]);
  await db.query("update public.bond_weekly_quests set completed_at='2026-10-02T17:00:00Z' where id=$1",[quest]);
  assert.equal((await db.query('select bond_xp from public.couples where id=$1',[c])).rows[0].bond_xp,15,'Quest trigger only mirrors its existing award');

  const event=uuid();
  await db.query("insert into public.shared_event_completions(id,event_id,couple_id,occurrence_date,completed_by,xp_awarded,completed_at) values ($1,$2,$3,'2026-10-02',$4,35,'2026-10-02T18:00:00Z')",[event,uuid(),c,f]);
  assert.equal((await db.query('select bond_xp from public.couples where id=$1',[c])).rows[0].bond_xp,15,'Event trigger only mirrors its existing award');
  assert.equal((await db.query("select count(*)::int n from public.progression_events where source_kind in ('quest','event') and couple_id=$1",[c])).rows[0].n,2);
});

test('Progression V1: Ritmo is couple-level, Rome-day consecutive, and automatic milestones do not maintain it',async()=>{
  const {db,c,f}=await fresh();
  const today=(await db.query("select ((now() at time zone 'Europe/Rome')::date)::text d")).rows[0].d;
  await db.query("select private.progression_award($1,$2,'think','r1',0,now()-interval '2 days',true,false)",[c,f]);
  await db.query("select private.progression_award($1,$2,'think','r2',0,now()-interval '1 day',true,false)",[c,f]);
  await db.query("select private.progression_award($1,$2,'think','r3',0,now(),true,false)",[c,f]);
  const s=await state(db,f);
  assert.equal(s.rhythm_days,3); assert.equal(s.rhythm_today,true);
  assert.equal(String(s.today).slice(0,10),today);

  const {db:db2,c:c2,f:f2}=await fresh();
  await db2.query("select private.progression_award($1,null,'milestone','auto',60,now(),false,false)",[c2]);
  const s2=await state(db2,f2);
  assert.equal(s2.rhythm_days,0); assert.equal(s2.rhythm_today,false);
});

test('Progression V1: pending unlock is per person; equip requires an unlocked reward and is shared',async()=>{
  const {db,c,f,b}=await fresh();
  await db.query('update public.couples set bond_xp=600 where id=$1',[c]);
  let sf=await state(db,f), sb=await state(db,b);
  assert.deepEqual(sf.pending_unlocks.map(r=>r.id),['frame_glow','theme_rose']);
  assert.deepEqual(sb.pending_unlocks.map(r=>r.id),['frame_glow','theme_rose']);

  await asUser(db,f,()=>db.query("select public.ack_progression_unlock('frame_glow')"));
  sf=await state(db,f); sb=await state(db,b);
  assert.deepEqual(sf.pending_unlocks.map(r=>r.id),['theme_rose']);
  assert.deepEqual(sb.pending_unlocks.map(r=>r.id),['frame_glow','theme_rose']);

  await asUser(db,f,()=>db.query("select public.equip_progression_reward('frame_glow')"));
  sb=await state(db,b);
  assert.equal(sb.preferences.frame_reward_id,'frame_glow');
  assert.equal(sb.rewards.find(r=>r.id==='frame_glow').equipped,true);

  await asUser(db,f,()=>db.query("select public.equip_progression_reward('frame_glow')"));
  sb=await state(db,b);
  assert.equal(sb.preferences.frame_reward_id,null,'clicking the equipped reward unequips it for the couple');
  assert.equal(Boolean(sb.rewards.find(r=>r.id==='frame_glow').equipped),false);

  await asUser(db,f,()=>db.query("select public.equip_progression_reward('frame_glow')"));
  sb=await state(db,b);
  assert.equal(sb.preferences.frame_reward_id,'frame_glow','clicking again equips it');
  await assert.rejects(asUser(db,f,()=>db.query("select public.equip_progression_reward('frame_aurora')")),/reward not unlocked/);
});

test('Progression V1: progression tables are server-only; authenticated users use RPCs',async()=>{
  const {db,f}=await fresh();
  await assert.rejects(asUser(db,f,()=>db.query('select * from public.progression_events')),/permission denied|row-level security/);
  await assert.rejects(asUser(db,f,()=>db.query('select * from public.progression_reward_catalog')),/permission denied|row-level security/);
  const funcs=(await db.query("select proname,prosecdef from pg_proc where proname in ('get_progression_v1','ack_progression_unlock','equip_progression_reward') order by proname")).rows;
  assert.equal(funcs.length,3); assert.ok(funcs.every(f=>f.prosecdef===true));
  assert.match(sql(),/revoke all on public\.progression_events from public, anon, authenticated/);
  assert.match(sql(),/pg_advisory_xact_lock/);
});
