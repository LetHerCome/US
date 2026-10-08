const test=require('node:test');
const assert=require('node:assert/strict');
const MC3=require('../onboarding.js');
const session=id=>({user:{id}});
const profile=(id='u',cid='c')=>({id,couple_id:cid,display_name:'Mira',role:'beatrice'});
const member=(paired=false,cid='c')=>({member:true,couple_id:cid,partner_joined:paired,invite:{status:'none',expires_at:null}});
test('MC3 routes only authoritative consistent profile and membership',()=>{
 assert.equal(MC3.route(null,null,null).kind,'SIGNED_OUT');
 assert.equal(MC3.route(session('u'),null,{member:false}).kind,'AUTHENTICATED_NO_PROFILE');
 assert.equal(MC3.route(session('u'),profile(),member()).kind,'MEMBER_WAITING_PARTNER');
 assert.equal(MC3.route(session('u'),profile(),member(true)).kind,'PAIRED');
 for(const [p,m] of [[null,member()],[profile(),{member:false}],[profile(),member(true,'other')],[profile('other'),member(true)],[null,null]])assert.equal(MC3.route(session('u'),p,m).kind,'ERROR_OR_INELIGIBLE');
});
test('MC3 validates Unicode names, calendar dates in Rome and paste friendly codes',()=>{
 assert.equal(MC3.validName('😀'.repeat(40)),true);assert.equal(MC3.validName('😀'.repeat(41)),false);
 assert.equal(MC3.validName('x\n'),false);assert.equal(MC3.validName('   '),false);
 assert.equal(MC3.validDate('2024-02-30','2026-10-08'),false);
 assert.equal(MC3.validDate('2026-10-09','2026-10-08'),false);
 assert.equal(MC3.validDate('1899-12-31','2026-10-08'),false);
 assert.equal(MC3.romeToday(new Date('2026-10-07T23:30:00Z')),'2026-10-08');
 assert.equal(MC3.normalizeCode(' oill- '+ 'a'.repeat(22)), '0111'+'A'.repeat(22));
 assert.equal(MC3.validCode('Z'.repeat(26)),true);assert.equal(MC3.validCode('U'.repeat(26)),false);
});
function harness(){let p=null,m={member:false};const calls=[];const handlers={};const c=MC3.createController({readProfile:async()=>({data:p,error:null}),rpc:async(n,a)=>{calls.push([n,a]);return handlers[n]?handlers[n](a):{data:m,error:null};}});return {c,calls,handlers,set:(np,nm)=>{p=np;m=nm;}};}
test('MC3 create uses exact args and reconciles ambiguous commit without repeating mutation',async()=>{
 const h=harness();await h.c.load(session('u'));
 h.handlers.create_couple=async()=>{h.set(profile(),member());throw Error('transport');};
 await h.c.create({name:' Mira ',date:'2024-01-02',coupleName:''});
 assert.equal(h.c.state.kind,'MEMBER_WAITING_PARTNER');
 assert.deepEqual(h.calls.filter(([n])=>n==='create_couple'),[['create_couple',{p_display_name:'Mira',p_started_on:'2024-01-02',p_couple_name:'US.'}]]);
});
test('MC3 join sends only code/name, errors are neutral and never leak backend metadata',async()=>{
 const h=harness();await h.c.load(session('u'));h.handlers.accept_partner_invite=async()=>({error:{code:'P0001',message:'invite_invalid private victim'}});
 await h.c.join({name:'Mira',code:'A'.repeat(26)});
 assert.match(h.c.state.message,/Codice non valido, scaduto o già utilizzato/);
 assert.deepEqual(h.calls.find(([n])=>n==='accept_partner_invite')[1],{p_code:'A'.repeat(26),p_display_name:'Mira'});
 assert.equal(MC3.errorMessage({code:'42501',message:'banned uid'}).includes('banned'),false);
});
test('MC3 read failures never become absence',async()=>{
 const c=MC3.createController({readProfile:async()=>({data:null,error:{message:'RLS'}}),rpc:async()=>({data:{member:false}})});
 await c.load(session('u'));assert.equal(c.state.kind,'ERROR_OR_INELIGIBLE');
});
test('MC3 generate is single flight, not retried, code purged on refresh/suspend/account switch',async()=>{
 const h=harness();h.set(profile(),member());await h.c.load(session('u'));
 let resolve;h.handlers.create_partner_invite=()=>new Promise(r=>resolve=r);
 const first=h.c.generate();const second=h.c.generate();assert.equal(h.calls.filter(([n])=>n==='create_partner_invite').length,1);
 resolve({data:{code:'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AA',expires_at:'2026-10-10T00:00:00Z'}});await Promise.all([first,second]);assert.ok(h.c.state.code);
 await h.c.refresh();assert.equal(h.c.state.code,'');
 const pending=h.c.generate();h.c.suspend();resolve({data:{code:'secret',expires_at:'date'}});await pending;assert.equal(h.c.state.code,'');
 h.c.reset();assert.equal(h.c.state.kind,'SIGNED_OUT');
});
test('MC3 suspended old read cannot restore a different account',async()=>{
 let finish;const c=MC3.createController({readProfile:()=>new Promise(r=>finish=r),rpc:async()=>({data:member(true)})});
 const pending=c.load(session('u'));c.reset();finish({data:profile()});await pending;assert.equal(c.state.kind,'SIGNED_OUT');
});
test('MC3 full couples cannot generate and revoke is not optimistic',async()=>{
 const h=harness();h.set(profile(),member(true));await h.c.load(session('u'));await h.c.generate();assert.equal(h.calls.some(([n])=>n==='create_partner_invite'),false);
 h.set(profile(),member());await h.c.load(session('u'));h.handlers.revoke_partner_invite=async()=>({error:{code:'42501'}});await h.c.revoke();assert.equal(h.c.state.kind,'ERROR_OR_INELIGIBLE');
});
test('MC3 foreground and repeated boot cannot release an unsettled invite mutation',async()=>{
 const h=harness();h.set(profile(),member());await h.c.load(session('u'));
 let finish;h.handlers.create_partner_invite=()=>new Promise(r=>finish=r);
 const pending=h.c.generate();h.c.suspend();await h.c.load(session('u'));
 await h.c.generate();assert.equal(h.calls.filter(([name])=>name==='create_partner_invite').length,1);
 assert.equal(h.c.state.busy,true);
 finish({data:{code:'A'.repeat(26),expires_at:'2026-10-10T00:00:00Z'}});await pending;
 assert.equal(h.c.state.busy,false);assert.equal(h.c.state.code,'');
});
