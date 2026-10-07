const test=require('node:test');const assert=require('node:assert/strict');
const h=require('./helpers/mc2-db');const p=require('./helpers/mc2-pg');
if(process.env.MC2_RACE_REQUIRED==='1' && !p.CAN_RUN)throw Error(p.SKIP);
let pg;
test.before(()=>{if(p.CAN_RUN)pg=p.startServer();});
test.after(()=>pg?.stop());
test.beforeEach(()=>pg?.reset());
const create=u=>`select public.create_couple('Alex','2026-01-01',null);`;
const accept=(code)=>`select public.accept_partner_invite('${code}','Sam');`;
const setup=()=>{
  const c=JSON.parse(pg.sql(`begin; ${p.asUser(h.U1)} ${create()} commit;`).split('\n').find(l=>l.startsWith('{')));
  const i=JSON.parse(pg.sql(`begin; ${p.asUser(h.U1)} select public.create_partner_invite(); commit;`).split('\n').find(l=>l.startsWith('{')));
  return{cid:c.couple_id,code:i.code};
};
async function interleave(u1,sql1,u2,sql2){
  const s1=pg.session(),s2=pg.session();
  try{
    s1.send(`begin; ${p.asUser(u1)} ${sql1}\n\\echo FIRST_DONE`);
    await p.waitFor(()=>s1.peek().out.includes('FIRST_DONE'),'first RPC completed, transaction holds its locks');
    assert.equal(s1.peek().err,'');
    s2.send(`begin; ${p.asUser(u2)} ${sql2} commit;`);
    await p.waitFor(()=>pg.lockWaiters()>0,'second session really waits on lock');
    s1.send('commit;');
    const results=await Promise.all([s1.end(),s2.end()]);
    for(const r of results)assert.doesNotMatch(r.err,/40P01|55P03|57014/,'no deadlock or timeout');
    return results;
  }catch(e){s1.send('rollback;');s2.send('rollback;');await Promise.all([s1.end(),s2.end()]);throw e;}
}
const members=cid=>Number(pg.sql(`select count(*) from public.profiles where couple_id='${cid}'`));
test('RACE-01: two users accepting one bearer token serialize on a real row lock',{skip:p.SKIP},async()=>{
  const i=setup();const [a,b]=await interleave(h.U2,accept(i.code),h.U3,accept(i.code));
  assert.match(a.out,/"status": "joined"/);assert.match(b.err,/P0001:.*invite_invalid/);assert.equal(members(i.cid),2);
});
test('RACE-02: impossible duplicate invite rows still cannot bypass the unique membership slot',{skip:p.SKIP},async()=>{
  const i=setup(); const second='123456789ABCDEFGHJKMNPQRST';
  pg.sql(`alter table public.couple_invites drop constraint couple_invites_couple_id_role_key;
    insert into public.couple_invites(couple_id,role,code_hash,created_at,expires_at) values('${i.cid}','beatrice',encode(extensions.digest('${second}','sha256'),'hex'),now(),now()+interval '48 hours');`);
  const s1=pg.session(),s2=pg.session(),gate=pg.session();
  try{
    // Both different invite rows pass count=1 and wait at profile INSERT.
    pg.sql(`create function public.mc2_test_insert_gate() returns trigger language plpgsql as $$begin if new.couple_id='${i.cid}' then perform pg_advisory_xact_lock(909090); end if;return new;end$$;
      create trigger mc2_test_gate before insert on public.profiles for each row execute function public.mc2_test_insert_gate();`);
    gate.send('begin;select pg_advisory_xact_lock(909090);\n\\echo GATE');await p.waitFor(()=>gate.peek().out.includes('GATE'),'gate held');
    s1.send(`begin;${p.asUser(h.U2)}${accept(i.code)}commit;`);s2.send(`begin;${p.asUser(h.U3)}${accept(second)}commit;`);
    await p.waitFor(()=>pg.lockWaiters()>=2,'both candidates pass checks and wait at insert');gate.send('commit;');await gate.end();
    const r=await Promise.all([s1.end(),s2.end()]);assert.equal(r.filter(x=>x.out.includes('"status": "joined"')).length,1);assert.equal(r.filter(x=>x.err.includes('invite_invalid')).length,1);assert.equal(members(i.cid),2);
  }finally{gate.send('rollback;');s1.send('rollback;');s2.send('rollback;');
    await Promise.all([gate.end(),s1.end(),s2.end()]);
    pg.sql('drop trigger if exists mc2_test_gate on public.profiles;drop function if exists public.mc2_test_insert_gate();delete from public.couple_invites where id in(select id from(select id,row_number() over(partition by couple_id,role order by used_at nulls last) n from public.couple_invites) x where n>1);alter table public.couple_invites add constraint couple_invites_couple_id_role_key unique(couple_id,role);');}
});
for(const first of ['accept','rotate'])test(`RACE-03: ${first} wins accept/rotate contention`,{skip:p.SKIP},async()=>{
  const i=setup();const r=first==='accept'?await interleave(h.U2,accept(i.code),h.U1,'select public.create_partner_invite();'):await interleave(h.U1,'select public.create_partner_invite();',h.U2,accept(i.code));
  assert.match(r[1].err,first==='accept'?/couple_full/:/invite_invalid/);
  assert.equal(Number(pg.sql(`select count(*) from public.couple_invites i where used_at is null and revoked_at is null and exists(select 1 from public.profiles p where p.couple_id=i.couple_id and p.role=i.role)`)),0);
});
for(const first of ['accept','revoke'])test(`RACE-04: ${first} wins accept/revoke contention`,{skip:p.SKIP},async()=>{
  const i=setup();const r=first==='accept'?await interleave(h.U2,accept(i.code),h.U1,'select public.revoke_partner_invite();'):await interleave(h.U1,'select public.revoke_partner_invite();',h.U2,accept(i.code));
  if(first==='accept'){assert.equal(r[1].err,'');assert.match(r[1].out,/"revoked": false/);}else assert.match(r[1].err,/invite_invalid/);
  assert.equal(Number(pg.sql('select count(*) from public.couple_invites where used_at is not null and revoked_at is not null')),0);
});
for(const first of ['create','accept'])test(`RACE-05: same user ${first} wins create/accept`,{skip:p.SKIP},async()=>{
  const i=setup();const r=first==='create'?await interleave(h.U2,create(),h.U2,accept(i.code)):await interleave(h.U2,accept(i.code),h.U2,create());
  if(first==='create')assert.match(r[1].err,/already_in_couple/);else assert.match(r[1].out,/already_member/);
  assert.equal(Number(pg.sql(`select count(*) from public.profiles where id='${h.U2}'`)),1);
});
test('RACE-06: same-user duplicate accept returns joined then already_joined',{skip:p.SKIP},async()=>{
  const i=setup();const [a,b]=await interleave(h.U2,accept(i.code),h.U2,accept(i.code));
  assert.match(a.out,/"status": "joined"/);assert.match(b.out,/"status": "already_joined"/);assert.equal(b.err,'');assert.equal(members(i.cid),2);
});
test('R6/R7: duplicate create and duplicate invite rotation serialize',{skip:p.SKIP},async()=>{
  let r=await interleave(h.U1,create(),h.U1,create());assert.match(r[0].out,/created/);assert.match(r[1].out,/already_member/);
  r=await interleave(h.U1,'select public.create_partner_invite();',h.U1,'select public.create_partner_invite();');assert.equal(r[1].err,'');
  assert.equal(Number(pg.sql(`select count(*) from public.couple_invites where couple_id=(select couple_id from public.profiles where id='${h.U1}')`)),1);
});
test('Expiry: waiting on creator membership cannot accept a token after its deadline',{skip:p.SKIP},async()=>{
  const i=setup(),gate=pg.session(),joiner=pg.session();
  try{
    gate.send(`begin;select id from public.profiles where id='${h.U1}' for update;\n\\echo CREATOR_LOCKED`);
    await p.waitFor(()=>gate.peek().out.includes('CREATOR_LOCKED'),'creator row locked');
    pg.sql(`update public.couple_invites set expires_at=clock_timestamp()+interval '2 seconds' where couple_id='${i.cid}'`);
    joiner.send(`begin;${p.asUser(h.U2)}${accept(i.code)}commit;`);
    await p.waitFor(()=>pg.lockWaiters()>0,'accept waits after invite validation on creator');
    await p.waitFor(()=>pg.sql(`select clock_timestamp()>expires_at from public.couple_invites where couple_id='${i.cid}'`)==='t','invite deadline passes');
    gate.send('commit;');await gate.end();const result=await joiner.end();
    assert.match(result.err,/P0001:.*invite_invalid/);assert.equal(members(i.cid),1);
    assert.equal(pg.sql(`select used_at is null from public.couple_invites where couple_id='${i.cid}'`),'t');
  }finally{gate.send('rollback;');joiner.send('rollback;');await Promise.all([gate.end(),joiner.end()]);}
});
