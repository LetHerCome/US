const test=require('node:test');
const assert=require('node:assert/strict');
const h=require('./helpers/mc2-db');
let db;
test.beforeEach(async()=>{db=await h.database();});
test.afterEach(async()=>{await db?.close();});
test('DB-01–03,06: atomic create/invite/join and state retries',async()=>{
  const c=await h.create(db); assert.equal(c.status,'created');
  assert.deepEqual(await h.create(db),{status:'already_member',couple_id:c.couple_id});
  const i=await h.invite(db); const j=await h.accept(db,h.U2,i.code); assert.deepEqual(j,{status:'joined',couple_id:c.couple_id});
  assert.deepEqual(await h.accept(db,h.U2,i.code),{status:'already_joined',couple_id:c.couple_id});
  const rows=await h.as(db,h.U2,'select id,role from public.profiles order by role'); assert.equal(rows.length,2);
  assert.deepEqual(rows.map(x=>x.role),['beatrice','francesco']);
  const m=await h.membership(db,h.U1);assert.equal(m.partner_joined,true);assert.equal(m.invite.status,'used');
});

const denied=(promise,message,code='P0001')=>assert.rejects(promise,e=>e.code===code && e.message===message);
const profiles=async()=> (await db.query('select * from public.profiles order by id')).rows;
test('DB-04,05,10: used/expired/revoked/rotated/malformed/random rejects are indistinguishable',async()=>{
  await h.create(db); const old=await h.invite(db); const active=await h.invite(db);
  for(const code of [old.code,'bad','0000-0000-0000-0000-0000-0000-00']) await denied(h.accept(db,h.U3,code),'invite_invalid');
  await h.revoke(db); await denied(h.accept(db,h.U3,active.code),'invite_invalid');
  assert.equal((await h.membership(db,h.U1)).invite.status,'revoked');
  const expired=await h.invite(db);
  await db.exec("update public.couple_invites set created_at=now()-interval '3 days',expires_at=now()-interval '1 day' where used_at is null");
  await denied(h.accept(db,h.U3,expired.code),'invite_invalid');
  assert.equal((await h.membership(db,h.U1)).invite.status,'expired');
  const used=await h.invite(db); await h.accept(db,h.U2,used.code);
  await denied(h.accept(db,h.U3,used.code),'invite_invalid'); await denied(h.invite(db),'couple_full');
});
test('DB-07–09,24: membership writes fail at grants even with a deliberately permissive RLS policy',async()=>{
  for(const role of ['anon','authenticated']){
    const r=await db.query("select has_table_privilege($1,'public.profiles','INSERT') i,has_table_privilege($1,'public.profiles','DELETE') d,has_table_privilege($1,'public.profiles','TRUNCATE') t,has_table_privilege($1,'public.profiles','MAINTAIN') m",[role]);
    assert.deepEqual(r.rows[0],{i:false,d:false,t:false,m:false});
  }
  await db.exec('create policy mc2_deliberately_permissive on public.profiles for all to authenticated using(true) with check(true)');
  for(const sql of [
    `insert into public.profiles(id,display_name,couple_id,role) values('${h.U3}','Intruder','${h.A}','beatrice')`,
    `delete from public.profiles where id='${h.F}'`, 'truncate public.profiles',
    `update public.profiles set couple_id='${h.A}' where id='${h.F}'`,
    `update public.profiles set role='beatrice' where id='${h.F}'`, 'select * from public.couple_invites'
  ]) await assert.rejects(h.as(db,h.U3,sql),e=>e.code==='42501');
  await h.as(db,h.F,"update public.profiles set avatar_path='test/avatar' where id=$1",[h.F]);
  assert.equal((await h.as(db,h.F,'select avatar_path from public.profiles where id=$1',[h.F]))[0].avatar_path,'test/avatar');
  await db.exec('drop policy mc2_deliberately_permissive on public.profiles');
  assert.deepEqual(await h.as(db,h.U3,'select * from public.profiles'),[]);
  assert.deepEqual(await h.as(db,h.U3,'select * from public.couples'),[]);
});
test('DB-11: 128-bit Crockford tokens, canonicalization, hashes only, exact 48h expiry',async()=>{
  await h.create(db); const i=await h.invite(db);
  assert.match(i.code,/^(?:[0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{2}$/);
  const row=(await db.query('select * from public.couple_invites where used_at is null')).rows[0];
  assert.equal(Date.parse(row.expires_at)-Date.parse(row.created_at),48*60*60*1000);
  assert.match(row.code_hash,/^[0-9a-f]{64}$/); assert.ok(!JSON.stringify(row).includes(i.code.replaceAll('-','')));
  const tokens=(await db.query('select private.mc2_new_code() code from generate_series(1,1000)')).rows.map(r=>r.code);
  assert.equal(new Set(tokens).size,1000); tokens.forEach(t=>assert.match(t,/^[0-9A-HJKMNP-TV-Z]{26}$/));
  const variant=i.code.toLowerCase().replaceAll('0','o').replaceAll('1','l').replaceAll('-',' \t');
  assert.equal((await h.accept(db,h.U2,variant)).status,'joined');
});
test('DB-12–14,16: cross-couple codes cannot replace membership; Couple A stays byte-identical',async()=>{
  const before=await profiles(); const legacy=(await db.query('select * from public.couple_invites order by id')).rows;
  await h.create(db); const b=await h.invite(db);
  await denied(h.accept(db,h.F,b.code),'already_in_couple'); await denied(h.invite(db,h.F),'couple_full');
  assert.deepEqual(await h.revoke(db,h.F),{revoked:false});
  assert.deepEqual((await profiles()).filter(p=>[h.F,h.B].includes(p.id)),before);
  assert.deepEqual((await db.query('select * from public.couple_invites where couple_id=$1 order by id',[h.A])).rows,legacy);
  await h.accept(db,h.U2,b.code); await h.create(db,h.U3); const c=await h.invite(db,h.U3);
  const snapshot=await profiles(); await denied(h.accept(db,h.U2,c.code),'already_in_couple'); assert.deepEqual(await profiles(),snapshot);
  assert.equal((await h.membership(db,h.U3)).invite.status,'pending');
});
test('DB-15,23: live anonymous sessions and metadata spoofing never gain MC2 eligibility',async()=>{
  const before=await profiles();
  for(const u of [h.ANON,h.UNCONFIRMED,h.BANNED,null]) {
    const msg=u?'account_not_eligible':'authentication_required';
    for(const call of [()=>h.create(db,u),()=>h.invite(db,u),()=>h.revoke(db,u),()=>h.accept(db,u,'0'.repeat(26))]) await denied(call(),msg,'42501');
    assert.deepEqual(await h.membership(db,u),{member:false});
  }
  assert.equal((await db.query('select count(*)::int n from auth.sessions where user_id=$1',[h.ANON])).rows[0].n,1);
  await db.query("update auth.users set email='spoof@example.test',email_confirmed_at=now(),raw_user_meta_data=$2 where id=$1",[h.ANON,{is_anonymous:false,couple_id:h.A}]);
  for(const call of [()=>h.create(db,h.ANON),()=>h.invite(db,h.ANON),()=>h.revoke(db,h.ANON),()=>h.accept(db,h.ANON,'0'.repeat(26))]) await denied(call(),'account_not_eligible','42501');
  assert.deepEqual(await h.membership(db,h.ANON),{member:false}); assert.deepEqual(await profiles(),before);
});
test('DB-17: public APIs only authenticated; private helpers owner-only and no authority input',async()=>{
  const rows=(await db.query("select p.oid,n.nspname,p.proname,p.prosecdef,p.proconfig,p.proargnames,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') client,exists(select 1 from aclexplode(p.proacl) a where a.grantee=0) public from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='private' and p.proname like 'mc2\\_%') or (n.nspname='public' and p.proname in('create_couple','create_partner_invite','revoke_partner_invite','accept_partner_invite','get_couple_membership'))")).rows;
  assert.equal(rows.length,10);
  for(const r of rows){assert.equal(r.anon,false);assert.equal(r.public,false);assert.equal(r.client,r.nspname==='public');assert.equal(r.prosecdef,r.nspname==='public');assert.deepEqual(r.proconfig,['search_path=""']);assert.ok(!(r.proargnames||[]).some(n=>/couple_id|invite_id|user_id|role/.test(n)));}
});
test('DB-18: legacy preconditions abort atomically without adding columns or APIs',async()=>{
  await db.close(); db=await h.database({mc2:false});
  const cases=[
    "update public.couple_invites set used_at=null,used_by=null where role='beatrice'",
    `insert into public.profiles(id,display_name,role) values('${h.U3}','Orphan','francesco')`,
    `drop index public.profiles_one_role_per_couple; insert into public.profiles(id,display_name,couple_id,role) values('${h.U3}','Third','${h.A}','francesco')`,
    'create function public.create_couple() returns void language sql as $$ select $$',
    'alter table public.couple_invites add column revoked_at timestamptz'
  ];
  for(const sql of cases){await db.exec('begin');try {await db.exec(sql);await assert.rejects(db.exec(h.MC2()),e=>e.message.startsWith('mc2_'));}finally{await db.exec('rollback');}
    assert.equal((await db.query("select to_regprocedure('public.create_partner_invite()') p")).rows[0].p,null);
    assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='couple_invites' and table_schema='public'")).rows[0].n,7);
  }
});
test('DB-19: exact target reruns are no-ops; partial schema/body/signature/ACL drift aborts',async()=>{
  await h.create(db); await h.invite(db);
  const snapshot=async()=> (await db.query("select (select jsonb_agg(i order by id) from public.couple_invites i) invites,(select jsonb_agg(p order by id) from public.profiles p) profiles,(select jsonb_agg(p order by oid) from pg_proc p where proname like 'mc2\\_%' or proname in('create_couple','create_partner_invite','revoke_partner_invite','accept_partner_invite','get_couple_membership')) funcs")).rows;
  const before=await snapshot(); await db.exec(h.MC2()); assert.deepEqual(await snapshot(),before);
  for(const sql of [
    'alter table public.couple_invites alter column expires_at drop not null',
    'alter table public.couple_invites alter column revoked_at set default now()',
    'alter table public.couple_invites alter column id set default null',
    'alter table public.couple_invites alter column created_at set default clock_timestamp()',
    'alter table public.couple_invites drop constraint couple_invites_couple_id_fkey; alter table public.couple_invites add constraint couple_invites_couple_id_fkey foreign key(couple_id) references public.couples(id) on delete restrict',
    'alter table public.profiles drop constraint profiles_id_fkey; alter table public.profiles add constraint profiles_id_fkey foreign key(id) references auth.users(id) on delete restrict',
    'grant references(couple_id) on public.profiles to authenticated',
    'grant maintain on public.couple_invites to authenticated',
    'create policy mc2_bad_select on public.profiles for select to authenticated using(true)',
    'alter policy couples_update_own on public.couples with check(true)',
    'grant insert on public.couples to authenticated',
    'grant select on public.couples to anon',
    'grant update(id) on public.couples to authenticated',
    'grant select on public.profiles to public',
    'grant select on public.profiles to authenticated with grant option',
    'alter table public.couple_invites drop constraint couple_invites_used_xor_revoked',
    'grant execute on function public.create_partner_invite() to anon',
    'grant insert on public.profiles to authenticated',
    'grant insert(couple_id) on public.profiles to authenticated',
    'drop function public.accept_partner_invite(text,text)',
    'create function public.accept_partner_invite(uuid) returns jsonb language sql as $$select null::jsonb$$',
    'create or replace function private.mc2_lock_user() returns void language plpgsql set search_path = \'\' as $$begin null;end$$'
  ]){await db.exec('begin');try {await db.exec(sql);await assert.rejects(db.exec(h.MC2()),e=>e.message.startsWith('mc2_'));}finally{await db.exec('rollback');}assert.deepEqual(await snapshot(),before);}
});
test('DB-20–22: empty couple, membership shapes and unsupported orphan profiles',async()=>{
  assert.deepEqual(await h.membership(db,h.U3),{member:false});
  const c=await h.create(db); assert.equal((await h.membership(db,h.U1)).invite.status,'none');
  const i=await h.invite(db); let m=await h.membership(db,h.U1); assert.equal(m.invite.status,'pending'); assert.equal(m.partner_joined,false);
  assert.deepEqual(Object.keys(m.invite).sort(),['expires_at','status']);
  await db.exec(`insert into public.profiles(id,display_name,role) values('${h.U3}','Orphan','francesco')`);
  await denied(h.create(db,h.U3),'profile_state_unsupported','42501');await denied(h.accept(db,h.U3,i.code),'profile_state_unsupported','42501');
  await db.exec(`delete from auth.users where id='${h.U1}'`);
  await denied(h.accept(db,h.U2,i.code),'invite_invalid');
  assert.equal((await db.query('select count(*)::int n from public.profiles where couple_id=$1',[c.couple_id])).rows[0].n,0);
});
test('DB-25: confirmed orphan with session can create or join an isolated couple',async()=>{
  const c=await h.create(db,h.U3); assert.equal(c.status,'created'); assert.notEqual(c.couple_id,h.A);
  const code=await h.invite(db,h.U3); assert.equal((await h.accept(db,h.U4,code.code)).couple_id,c.couple_id);
  assert.equal((await h.as(db,h.F,'select * from public.couples where id=$1',[c.couple_id])).length,0);
  assert.equal((await h.as(db,h.U3,'select * from public.couples where id=$1',[h.A])).length,0);
});
test('Input boundaries reject before writes; legacy rows survive upgrade and second fresh rebuild',async()=>{
  for(const n of [null,'',' '.repeat(5),'x'.repeat(41),'bad\nname'])await denied(h.create(db,h.U1,n),'display_name_invalid','22023');
  for(const d of [null,'1899-12-31','2999-01-01'])await denied(h.create(db,h.U1,'Alex',d),'started_on_invalid','22023');
  for(const n of ['','x'.repeat(41)])await denied(h.create(db,h.U1,'Alex','2026-01-01',n),'couple_name_invalid','22023');
  await db.close(); db=await h.database({mc2:false});
  const before=(await db.query('select id,couple_id,role,code_hash,used_by,used_at,created_at from public.couple_invites order by id')).rows;
  const oldProfiles=await profiles();const oldCouples=(await db.query('select * from public.couples')).rows;
  await db.exec(h.MC2()); assert.deepEqual((await db.query('select id,couple_id,role,code_hash,used_by,used_at,created_at from public.couple_invites order by id')).rows,before);
  assert.deepEqual(await profiles(),oldProfiles); assert.deepEqual((await db.query('select * from public.couples')).rows,oldCouples);
  await db.close();db=await h.database();assert.equal((await h.create(db)).status,'created');
});
