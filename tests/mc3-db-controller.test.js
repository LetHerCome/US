const test=require('node:test');
const assert=require('node:assert/strict');
const MC3=require('../onboarding');
const h=require('./helpers/mc2-db');
test('MC3 controller consumes real MC2 SQL: four users, two isolated couples, no repeated create/join',async()=>{
 const db=await h.database();
 try{
  // PGlite is a single connection: serialize profile/membership reads while the
  // production controller still requests both concurrently.
  let tail=Promise.resolve();const original=h.as;
  // Each controller's adapters use a connection queue, not nested transactions.
  const queued=user=>{
   const enqueue=fn=>{const p=tail.then(fn);tail=p.catch(()=>{});return p;};
   const rpcFns={get_couple_membership:()=>h.membership(db,user),create_couple:a=>h.create(db,user,a.p_display_name,a.p_started_on,a.p_couple_name),accept_partner_invite:a=>h.accept(db,user,a.p_code,a.p_display_name),create_partner_invite:()=>h.invite(db,user),revoke_partner_invite:()=>h.revoke(db,user)};
   return MC3.createController({readProfile:id=>enqueue(async()=>({data:(await original(db,user,'select id,display_name,role,couple_id from public.profiles where id=$1',[id]))[0]||null})),rpc:(name,args)=>enqueue(async()=>{try{return {data:await rpcFns[name](args)};}catch(error){return {error};}})});
  };
  const a=queued(h.F),aPartner=queued(h.B),creator=queued(h.U1),joiner=queued(h.U2);
  for(const [c,user] of [[a,h.F],[aPartner,h.B],[creator,h.U1],[joiner,h.U2]])await c.load({user:{id:user}});
  assert.equal(a.state.kind,'PAIRED');assert.equal(aPartner.state.kind,'PAIRED');assert.equal(creator.state.kind,'AUTHENTICATED_NO_PROFILE');
  await creator.create({name:'Mira',date:'2024-02-29'});assert.equal(creator.state.kind,'MEMBER_WAITING_PARTNER');await creator.generate();const old=creator.state.code;await creator.generate();const code=creator.state.code;assert.notEqual(code,old);
  await joiner.join({name:'Nico',code:old});assert.match(joiner.state.message,/Codice non valido/);
  await joiner.join({name:'Nico',code});assert.equal(joiner.state.kind,'PAIRED');await creator.refresh();assert.equal(creator.state.kind,'PAIRED');
  assert.equal((await h.as(db,h.F,'select id from public.profiles')).length,2);
  assert.equal((await h.as(db,h.U1,'select id from public.profiles')).length,2);
  assert.notEqual(a.state.profile.couple_id,creator.state.profile.couple_id);
  assert.equal((await db.query('select count(*)::int n from public.profiles')).rows[0].n,4);
  for(const user of [h.ANON,h.UNCONFIRMED,h.BANNED]){const c=queued(user);await c.load({user:{id:user}});await c.create({name:'Beta',date:'2024-01-01'});assert.equal(c.state.kind,'ERROR_OR_INELIGIBLE');assert.match(c.state.message,/Questo account/);}
 }finally{await db.close();}
});
