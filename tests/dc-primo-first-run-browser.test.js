// Due colori — first run in the browser: the tour before the account, the
// "Tu" step with the birthday, the person colour, and the phone setup that
// opens once after pairing (never for a session restored at launch).
const test=require('node:test');
const assert=require('node:assert/strict');
const {start,qaFixture}=require('./helpers/countdown-browser');
const {FAKE_SUPABASE}=require('./helpers/oggi-browser');
const OB=require('../onboarding.js');
const code=n=>String(n).padStart(26,'A');
function backend(){
  const profiles=[{id:'f1',couple_id:'c1',display_name:'Francesco',role:'francesco'},{id:'b1',couple_id:'c1',display_name:'Beatrice',role:'beatrice'}];
  const couples=[{id:'c1',name:'US.',started_on:'2022-06-23'}],invites=new Map(),calls=[];let sequence=0;
  return {profiles,couples,calls,invites,async rpc(name,args,user){
    calls.push({name,args,user});
    const p=profiles.find(x=>x.id===user);let data=null,error=null;
    if(name==='get_couple_membership'){
      const i=p&&invites.get(p.couple_id);
      data=p?{member:true,couple_id:p.couple_id,partner_joined:profiles.some(o=>o.couple_id===p.couple_id&&o.id!==user),invite:{status:i?.status||'none',expires_at:i?.expires_at||null}}:{member:false};
    }else if(name==='create_couple'){
      if(p)data={status:'already_member',couple_id:p.couple_id};
      else{couples.push({id:'c2',name:args.p_couple_name,started_on:args.p_started_on});profiles.push({id:user,couple_id:'c2',display_name:args.p_display_name,role:'beatrice'});data={status:'created',couple_id:'c2'};}
    }else if(name==='create_partner_invite'){
      data={code:code(++sequence),expires_at:new Date(Date.now()+48*3600000).toISOString()};invites.set(p.couple_id,{...data,status:'pending'});
    }else if(name==='accept_partner_invite'){
      const entry=[...invites].find(([,i])=>i.code===args.p_code&&i.status==='pending');
      if(!entry||p)error={code:'P0001',message:'invite_invalid'};
      else{const [cid,i]=entry;i.status='used';profiles.push({id:user,couple_id:cid,display_name:args.p_display_name,role:'francesco'});data={status:'joined',couple_id:cid};}
    }
    return {data,error,tables:{profiles:structuredClone(profiles),couples:structuredClone(couples)}};
  }};
}
async function pageFor(h,b,{user='u1',signedOut=false,deviceProfile=null,reduced=true,width=390,height=844,releaseSignup=false,init=null}={}){
  const ctx=await h.browser.newContext({viewport:{width,height},locale:'it-IT',timezoneId:'Europe/Rome',serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'});
  await ctx.grantPermissions(['clipboard-read','clipboard-write']);
  const page=await ctx.newPage(),errors=[],outside=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith(h.base)&&!r.url().startsWith('data:'))outside.push(r.url());});
  await page.exposeFunction('__dcRpc',(name,args,uid)=>b.rpc(name,args,uid));
  const fake=FAKE_SUPABASE.replace("const session = () => ({", "const session = () => Q().signedOut ? null : ({")
    .replace("onAuthStateChange: () =>", "onAuthStateChange: (fn) => {(window.__authListeners ||= []).push(fn);window.__authCallback=(...args)=>window.__authListeners.forEach(listener=>listener(...args));return")
    .replace("unsubscribe() {} } } }),", "unsubscribe() {} } } });},")
    .replace("signOut: async () => ({ error: null })", "signOut: async () => {Q().signedOut=true;window.__authCallback?.('SIGNED_OUT',null);return {error:null};}")
    .replace("signInWithPassword: async () => ({ data: null, error: { message: 'qa' } })", "signInWithPassword: async () => {Q().signedOut=false;window.__authCallback?.('SIGNED_IN',session());return {data:{session:session()},error:null};}")
    .replace("insert(p) { op = 'insert'; payload = p; return b; }", "insert(p) { op = 'insert'; payload = p; (Q().inserts ||= []).push({table, row: structuredClone(p)}); return b; }")
    .replace("getSession: async () =>", "signUp: async (x) => {(Q().signUps ||= []).push(structuredClone(x));return {data:{user:{id:'new'},session:null},error:null};}, resend: async () => ({error:null}), resetPasswordForEmail: async () => ({error:null}), updateUser: async () => ({error:null}), getSession: async () =>");
  await page.route('**/*',async route=>{
    const u=route.request().url();
    // Signup is mounted only on US-STAGING: these tests turn the release switch on in the page.
    if(releaseSignup&&u.startsWith(h.base+'/public-auth.js')){const r=await route.fetch();return route.fulfill({response:r,body:(await r.text()).replace('const PRODUCTION_SIGNUP_RELEASED = false;','const PRODUCTION_SIGNUP_RELEASED = true;')});}
    if(u.startsWith(h.base))return route.continue();if(/supabase-js/.test(u))return route.fulfill({contentType:'text/javascript',body:fake});return route.abort();
  });
  if(init)await page.addInitScript(init);
  await page.addInitScript(qaFixture,{style:'editorial',mode:'days',unlocked:true,missing:false,started:'2022-06-23',active:'custom'});
  await page.addInitScript(({user,profiles,couples,signedOut,deviceProfile})=>{
    window.__QA.me=user;window.__QA.signedOut=signedOut;window.__QA.tables.profiles=profiles;window.__QA.tables.couples=couples;
    if(deviceProfile)localStorage.setItem('us:fix4:last-profile',JSON.stringify(deviceProfile));
    for(const name of ['create_couple','create_partner_invite','revoke_partner_invite','accept_partner_invite','get_couple_membership'])window.__QA.rpc[name]=async args=>{
      const r=await window.__dcRpc(name,args,window.__QA.me);Object.assign(window.__QA.tables,r.tables);return {data:r.data,error:r.error};
    };
  },{user,profiles:b.profiles,couples:b.couples,signedOut,deviceProfile});
  await page.goto(h.base+'/?us-dev=1',{waitUntil:'load'});
  return {page,ctx,errors,outside};
}
const visible=(page,id)=>page.waitForFunction(id=>{const el=document.getElementById(id);return el&&!el.hidden&&el.getClientRects().length>0;},id);
// The waiting screen checks by itself every 10 s: a manual refresh only when it is still there.
const refreshIfWaiting=page=>page.evaluate(()=>{const b=document.getElementById('mc3Refresh');if(b&&b.getClientRects().length&&!b.disabled)b.click();});
const text=(page,selector)=>page.locator(selector).evaluate(el=>el.textContent.replace(/\s+/g,' ').trim());

test('first run tour: only on a phone where nobody signed in, three cards, no network, then login',async t=>{
  const h=await start();if(!h)return t.skip('Playwright unavailable');const b=backend();
  try{
    const {page,ctx,errors,outside}=await pageFor(h,b,{signedOut:true});
    await visible(page,'usTour');
    assert.equal(await page.locator('#loginEmail').isVisible(),false);
    assert.equal(await page.locator('.app').evaluate(el=>getComputedStyle(el).visibility),'hidden');
    const before=b.calls.length,outsideBefore=outside.length;
    assert.equal(await page.getAttribute('[data-us-tour-dot]:nth-of-type(1)','aria-current'),'true');
    assert.equal(await text(page,'#usTourNext'),'Avanti');
    await page.click('#usTourNext');await page.waitForFunction(()=>document.querySelectorAll('[data-us-tour-dot]')[1].getAttribute('aria-current')==='true');
    await page.click('#usTourNext');await page.waitForFunction(()=>document.querySelectorAll('[data-us-tour-dot]')[2].getAttribute('aria-current')==='true');
    assert.equal(await text(page,'#usTourNext'),'Iniziamo');
    await page.click('[data-us-tour-dot]:nth-of-type(1)');await page.waitForFunction(()=>document.querySelectorAll('[data-us-tour-dot]')[0].getAttribute('aria-current')==='true');
    for(const button of await page.locator('#usTour button').all()){const box=await button.boundingBox();assert.ok(box.height>=44&&box.width>=44,'44px targets');}
    assert.equal(b.calls.length,before,'no backend call during the tour');assert.equal(outside.length,outsideBefore,'no network during the tour');
    await page.click('#usTourSkip');
    await visible(page,'authLogin');assert.equal(await page.locator('#usTour').isHidden(),true);
    assert.equal(await page.evaluate(()=>document.activeElement?.closest('#authLogin')!==null),true,'focus moves to the login');
    assert.equal(await page.evaluate(()=>localStorage.getItem('us:tour:v1:seen')),'1');
    assert.match(await text(page,'#authLogin h2'),/Eccoti di nuovo/);
    assert.deepEqual(errors,[]);await ctx.close();
    // A phone that already knows an account goes straight to the login.
    const again=await pageFor(h,b,{signedOut:true,deviceProfile:{id:'f1',couple_id:'c1',display_name:'Francesco',role:'francesco'}});
    await again.page.waitForFunction(()=>document.getElementById('authLogin').classList.contains('active')&&!document.documentElement.classList.contains('us-auth-pending'));
    await again.page.waitForTimeout(200);
    assert.equal(await again.page.locator('#usTour').isHidden(),true);assert.equal(await again.page.locator('#loginEmail').isVisible(),true);
    assert.deepEqual(again.errors,[]);await again.ctx.close();
  }finally{await h.close();}
});

test('first run: Tu with birthday, create, colour, invite; the partner joins; each phone sets up once',async t=>{
  const h=await start();if(!h)return t.skip('Playwright unavailable');const b=backend();
  try{
    const creator=await pageFor(h,b,{user:'u1'});const page=creator.page;
    await visible(page,'mc3Me');
    assert.equal(await text(page,'#mc3Kicker'),'Tu · 1 di 4');
    assert.equal(await page.locator('.app').evaluate(el=>el.inert),true,'the app stays inert during onboarding');
    // Validation of the birthday pair, then a valid choice.
    await page.fill('#mc3Name','Mira');await page.selectOption('#mc3BirthDay','12');await page.click('#mc3MeNext');
    await page.waitForFunction(()=>document.getElementById('mc3Status').textContent.includes('giorno e mese'));
    assert.equal(await page.locator('#mc3Me').isVisible(),true);
    await page.selectOption('#mc3BirthMonth','3');await page.click('#mc3MeNext');
    await visible(page,'mc3Choice');assert.equal(await text(page,'#mc3Kicker'),'Voi · 2 di 4');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('us:onboarding:v1:birthday:u1')),'{"day":12,"month":3}');
    // Back keeps what was typed.
    await page.click('#mc3BackMe');await visible(page,'mc3Me');assert.equal(await page.inputValue('#mc3Name'),'Mira');assert.equal(await page.inputValue('#mc3BirthMonth'),'3');
    await page.click('#mc3MeNext');await visible(page,'mc3Choice');
    await page.click('#mc3ChooseCreate');await page.fill('#mc3Date','2024-01-01');await page.locator('#mc3Create button[type=submit]').click();
    await visible(page,'mc3Color');
    assert.equal(await text(page,'#mc3Title'),'Il tuo colore è il lilla');
    await page.waitForFunction(()=>(window.__QA.inserts||[]).length===1);
    const today=await page.evaluate(()=>new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Rome'}));
    assert.deepEqual(await page.evaluate(()=>window.__QA.inserts),[{table:'shared_events',row:{title:'Compleanno di Mira',event_date:OB.nextBirthday(12,3,today),event_time:null,location:null,note:null,recurs_yearly:true,couple_id:'c2',created_by:'u1'}}]);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('us:onboarding:v1:birthday:u1')),null);
    assert.equal(await page.evaluate(()=>localStorage.getItem('us:onboarding:v1:birthday-saved:u1')),'1');
    assert.equal(await page.evaluate(()=>localStorage.getItem('us:setup:v1:pending:u1')),'created');
    assert.deepEqual(b.calls.find(c=>c.name==='create_couple').args,{p_display_name:'Mira',p_started_on:'2024-01-01',p_couple_name:'US.'});
    await page.click('#mc3ColorNext');await visible(page,'mc3Waiting');
    await page.click('#mc3Generate');await page.waitForFunction(()=>document.getElementById('mc3Code').value.length>0);
    assert.match(await text(page,'#mc3InviteStatus'),/^Invito in attesa · scade il \d+ \S+ alle \d\d:\d\d$/);
    const token=await page.inputValue('#mc3Code');

    // The partner: no birthday, joins, sees their colour once.
    const partner=await pageFor(h,b,{user:'u2'});
    await visible(partner.page,'mc3Me');await partner.page.fill('#mc3Name','Nico');await partner.page.click('#mc3MeNext');
    await partner.page.click('#mc3ChooseJoin');await partner.page.fill('#mc3JoinCode',token);await partner.page.locator('#mc3Join button[type=submit]').click();
    await partner.page.waitForFunction(()=>window.usProfile?.id==='u2');
    await visible(partner.page,'usDeviceSetup');await partner.page.waitForFunction(()=>document.getElementById('usDeviceSetup').dataset.step==='color');
    assert.equal(await text(partner.page,'#usSetupTitle'),'Il tuo colore è il rosa');
    assert.equal(await text(partner.page,'#usSetupKicker'),'Voi · 2 di 4');
    assert.equal(await partner.page.evaluate(()=>document.activeElement?.id),'usSetupTitle');
    assert.equal(await partner.page.locator('.app').evaluate(el=>el.inert&&el.getAttribute('aria-hidden')==='true'),true,'the app behind is unreachable');
    assert.equal(await partner.page.evaluate(()=>(window.__QA.inserts||[]).length),0,'no birthday, no event');
    await partner.page.click('#usSetupPrimary');
    // On the web there are no native notifications: the next step is the distance.
    await partner.page.waitForFunction(()=>document.getElementById('usDeviceSetup').dataset.step==='place');
    assert.equal(await text(partner.page,'#usSetupKicker'),'Posizione · 4 di 4');
    assert.equal(await text(partner.page,'#usSetupTitle'),'Anche da lontano');
    const points=await text(partner.page,'#usSetupPoints');
    assert.match(points,/Mira vede solo la distanza, mai dove sei\./);assert.match(points,/Sotto i 3 km vedete solo «vicini»/);assert.match(points,/Solo mentre US è aperta/);
    assert.doesNotMatch(points+await text(partner.page,'#usSetupBody'),/circa 1 km/);
    await partner.page.click('#usSetupSecondary');
    await partner.page.waitForFunction(()=>document.getElementById('usDeviceSetup').dataset.step==='ready');
    assert.equal(await text(partner.page,'#usSetupTitle'),'Il vostro US è pronto');
    const ready=await text(partner.page,'#usSetupReady');
    assert.match(ready,/Nico/);assert.match(ready,/Compleanno da aggiungere in Noi/);assert.match(ready,/Insieme da/);assert.match(ready,/Distanza non attiva/);
    assert.doesNotMatch(ready,/Notifiche/);
    await partner.page.click('#usSetupPrimary');
    await partner.page.waitForFunction(()=>document.getElementById('usDeviceSetup').hidden);
    assert.equal(await partner.page.locator('.app').evaluate(el=>el.inert||el.hasAttribute('aria-hidden')),false);
    assert.equal(await partner.page.evaluate(()=>localStorage.getItem('us:setup:v1:done:u2')),'1');
    assert.equal(await partner.page.evaluate(()=>localStorage.getItem('us:setup:v1:pending:u2')),null);
    assert.equal(await partner.page.evaluate(()=>usOnboarding.setup.maybeOpen(window.usProfile)),false,'once per user');
    assert.equal(await partner.page.locator('#usDeviceSetup').isHidden(),true);

    // The creator learns it on the next refresh, or the automatic check got there first: "Ora siete un Noi".
    await refreshIfWaiting(page);await page.waitForFunction(()=>window.usProfile?.id==='u1');
    await page.waitForFunction(()=>document.getElementById('usDeviceSetup').dataset.step==='noi');
    assert.equal(await text(page,'#usSetupTitle'),'Ora siete un Noi');
    await page.click('#usSetupPrimary');await page.waitForFunction(()=>document.getElementById('usDeviceSetup').dataset.step==='place');
    await page.click('#usSetupSecondary');await page.waitForFunction(()=>document.getElementById('usDeviceSetup').dataset.step==='ready');
    assert.match(await text(page,'#usSetupReady'),/Compleanno il 12 marzo/);
    await page.click('#usSetupPrimary');await page.waitForFunction(()=>document.getElementById('usDeviceSetup').hidden);
    assert.equal(await page.evaluate(()=>(window.__QA.inserts||[]).length),1,'the birthday is written once');
    for(const x of [creator,partner]){assert.deepEqual(x.errors,[]);await x.ctx.close();}
  }finally{await h.close();}
});

test('first run: a session restored at launch never sees the setup; a password sign-in on a new phone does, once',async t=>{
  const h=await start();if(!h)return t.skip('Playwright unavailable');const b=backend();
  try{
    const restored=await pageFor(h,b,{user:'f1'});
    await restored.page.waitForFunction(()=>window.usProfile?.id==='f1');await restored.page.waitForTimeout(300);
    assert.equal(await restored.page.locator('#usDeviceSetup').isHidden(),true);assert.equal(await restored.page.locator('#usTour').isHidden(),true);
    assert.equal(await restored.page.evaluate(()=>localStorage.getItem('us:tour:v1:seen')),'1','a signed-in phone never shows the tour later');
    assert.deepEqual(restored.errors,[]);await restored.ctx.close();

    const fresh=await pageFor(h,b,{user:'f1',signedOut:true,deviceProfile:{id:'f1',couple_id:'c1',display_name:'Francesco',role:'francesco'}});const page=fresh.page;
    await page.waitForFunction(()=>document.getElementById('authLogin').classList.contains('active')&&!document.documentElement.classList.contains('us-auth-pending'));
    await page.fill('#loginEmail','qa@example.test');await page.fill('#loginPassword','synthetic-local-password');await page.click('#loginBtn');
    await page.waitForFunction(()=>window.usProfile?.id==='f1');
    await page.waitForFunction(()=>document.getElementById('usDeviceSetup').dataset.step==='place');
    assert.equal(await text(page,'#usSetupKicker'),'Posizione · 1 di 1');
    await page.click('#usSetupPrimary');
    await page.waitForFunction(()=>document.getElementById('usDeviceSetup').dataset.step==='ready');
    assert.equal(await text(page,'#usSetupTitle'),'Eccoti di nuovo');
    const ready=await text(page,'#usSetupReady');assert.match(ready,/Distanza attiva/);assert.doesNotMatch(ready,/Compleanno|Insieme da/);
    assert.equal(await page.evaluate(()=>window.UsLocation.isSharing()),true);
    await page.click('#usSetupPrimary');await page.waitForFunction(()=>document.getElementById('usDeviceSetup').hidden);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('us:setup:v1:password-sign-in')),null);
    assert.equal(await page.evaluate(()=>localStorage.getItem('us:setup:v1:done:f1')),'1');
    // Distance already on and nothing else to ask: a new sign-in shows nothing.
    await page.evaluate(()=>{localStorage.removeItem('us:setup:v1:done:f1');usOnboarding.setup.markPasswordSignIn('f1');});
    assert.equal(await page.evaluate(()=>usOnboarding.setup.maybeOpen(window.usProfile)),false);
    assert.equal(await page.locator('#usDeviceSetup').isHidden(),true);
    assert.deepEqual(fresh.errors,[]);await fresh.ctx.close();
  }finally{await h.close();}
});

test('1.0 A1: sign-up waits for the 18+ and Terms box and records it with the account',async t=>{
  const h=await start();if(!h)return t.skip('Playwright unavailable');const b=backend();
  try{
    const {page,ctx,errors}=await pageFor(h,b,{signedOut:true,releaseSignup:true});
    await visible(page,'usTour');
    for(let i=0;i<3;i++)await page.click('#usTourNext');
    await page.waitForFunction(()=>document.getElementById('usSignup').classList.contains('active'));
    const submit=page.locator('#usSignupSubmit');
    assert.equal(await submit.isDisabled(),true,'off before anything');
    await page.fill('#usSignupEmail','new@example.test');await page.fill('#usSignupPassword','synthetic-pass-123');await page.fill('#usSignupConfirm','synthetic-pass-123');
    assert.equal(await submit.isDisabled(),true,'off until the box is ticked');
    assert.equal(await text(page,'#usSignup .us-auth-consent'),'Ho almeno 18 anni e accetto i Termini e la Privacy');
    // No public page yet: the words carry no link.
    assert.equal(await page.locator('#usSignup a[data-us-legal]').evaluateAll(links=>links.filter(a=>a.hasAttribute('href')).length),0);
    const box=await page.locator('#usSignup .us-auth-consent').boundingBox();assert.ok(box.height>=44,'44px target');
    await page.click('#usSignup .us-auth-consent span');assert.equal(await page.isChecked('#usSignupTerms'),true,'the sentence ticks the box');
    assert.equal(await submit.isDisabled(),false);
    await page.click('#usSignupTerms');assert.equal(await submit.isDisabled(),true);
    await page.click('#usSignupTerms');await submit.click();
    await page.waitForFunction(()=>document.getElementById('usVerifyEmail').classList.contains('active'));
    const [call]=await page.evaluate(()=>window.__QA.signUps);
    assert.equal(call.email,'new@example.test');assert.equal(call.options.data.locale,'it');
    assert.ok(Math.abs(Date.parse(call.options.data.terms_accepted_at)-Date.now())<60000);
    assert.equal(await page.isChecked('#usSignupTerms'),false,'a next account asks again');
    assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('new@example.test')),false);
    assert.deepEqual(errors,[]);await ctx.close();
  }finally{await h.close();}
});

test('1.0 A2: Condividi, the code through a trip to another app, and the partner found without a tap',async t=>{
  const h=await start();if(!h)return t.skip('Playwright unavailable');const b=backend();
  try{
    const creator=await pageFor(h,b,{user:'u1',init:()=>{
      Object.defineProperty(Navigator.prototype,'share',{configurable:true,value:async data=>{(window.__shared||=[]).push(data);}});
      Object.defineProperty(Navigator.prototype,'canShare',{configurable:true,value:()=>true});
      let hidden=false;window.__setHidden=value=>{hidden=value;document.dispatchEvent(new Event('visibilitychange'));};
      Object.defineProperty(Document.prototype,'hidden',{configurable:true,get:()=>hidden});
      Object.defineProperty(Document.prototype,'visibilityState',{configurable:true,get:()=>hidden?'hidden':'visible'});
    }});
    const page=creator.page;
    await visible(page,'mc3Me');await page.fill('#mc3Name','Mira');await page.click('#mc3MeNext');
    await page.click('#mc3ChooseCreate');await page.fill('#mc3Date','2024-01-01');await page.locator('#mc3Create button[type=submit]').click();
    await visible(page,'mc3Color');await page.click('#mc3ColorNext');await visible(page,'mc3Waiting');
    assert.equal(await page.locator('#mc3ShareCode').isVisible(),false,'nothing to share before a code');
    await page.click('#mc3Generate');await page.waitForFunction(()=>document.getElementById('mc3Code').value.length>0);
    const token=await page.inputValue('#mc3Code');
    for(const id of ['mc3ShareCode','mc3CopyCode']){const box=await page.locator('#'+id).boundingBox();assert.ok(box.height>=44&&box.width>=120,id);}
    await page.click('#mc3ShareCode');
    await page.waitForFunction(()=>document.getElementById('mc3Status').textContent.includes('Fatto.'));
    const [shared]=await page.evaluate(()=>window.__shared);
    assert.deepEqual(Object.keys(shared),['text']);
    assert.match(shared.text,/^Ti aspetto su US ♡\nScegli «Ho un codice d’invito» e incolla questo codice:\n/);
    assert.ok(shared.text.split('\n')[2]===token);assert.match(shared.text,/\nScade il \d+ \S+ alle \d\d:\d\d\.$/);
    // Off to WhatsApp and back: off the screen while away, back on return.
    await page.evaluate(()=>window.__setHidden(true));assert.equal(await page.inputValue('#mc3Code'),'');
    await page.evaluate(()=>window.__setHidden(false));
    await page.waitForFunction(code=>document.getElementById('mc3Code').value===code&&!document.getElementById('mc3Waiting').hidden,token);
    const secrets=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage},url:location.href}));assert.equal(secrets.includes(token),false,'memory only');
    // The partner joins; the creator does nothing and still finds out.
    const membership=()=>b.calls.filter(c=>c.name==='get_couple_membership'&&c.user==='u1').length;
    const before=membership();
    const partner=await pageFor(h,b,{user:'u2'});
    await visible(partner.page,'mc3Me');await partner.page.fill('#mc3Name','Nico');await partner.page.click('#mc3MeNext');
    await partner.page.click('#mc3ChooseJoin');await partner.page.fill('#mc3JoinCode',token);await partner.page.locator('#mc3Join button[type=submit]').click();
    await partner.page.waitForFunction(()=>window.usProfile?.id==='u2');
    await page.waitForFunction(()=>document.getElementById('usDeviceSetup').dataset.step==='noi',null,{timeout:25000});
    assert.ok(membership()>before,'found by the automatic check');
    assert.equal(await page.evaluate(()=>window.usProfile?.id),'u1');
    // Paired: no more checks.
    const settled=membership();await page.waitForTimeout(10600);assert.ok(membership()-settled<=1,'the check stops once paired');
    for(const x of [creator,partner]){assert.deepEqual(x.errors,[]);await x.ctx.close();}
  }finally{await h.close();}
});

test('1.0 F5: on Android "Tutto pronto" offers the Ti penso widget once the launcher can pin it',async t=>{
  const h=await start();if(!h)return t.skip('Playwright unavailable');const b=backend();
  try{
    // The creator waits; the partner (this phone) joins with an Android launcher that can pin.
    const creator=await pageFor(h,b,{user:'u1'});const c=creator.page;
    await visible(c,'mc3Me');await c.fill('#mc3Name','Mira');await c.click('#mc3MeNext');
    await c.click('#mc3ChooseCreate');await c.fill('#mc3Date','2024-01-01');await c.locator('#mc3Create button[type=submit]').click();
    await visible(c,'mc3Color');await c.click('#mc3ColorNext');await c.click('#mc3Generate');await c.waitForFunction(()=>document.getElementById('mc3Code').value.length>0);
    const token=await c.inputValue('#mc3Code');
    const partner=await pageFor(h,b,{user:'u2'});const page=partner.page;
    await page.evaluate(()=>{
      window.__pins=[];
      window.UsWidgets={...window.UsWidgets,isAvailable:()=>true,installed:async()=>({installed:{think:window.__placed?1:0},pinSupported:true,vendor:'android'}),requestPin:async kind=>{window.__pins.push(kind);return {supported:true,requested:true};}};
    });
    await visible(page,'mc3Me');await page.fill('#mc3Name','Nico');await page.click('#mc3MeNext');
    await page.click('#mc3ChooseJoin');await page.fill('#mc3JoinCode',token);await page.locator('#mc3Join button[type=submit]').click();
    await page.waitForFunction(()=>document.getElementById('usDeviceSetup').dataset.step==='color');
    await page.click('#usSetupPrimary');await page.waitForFunction(()=>document.getElementById('usDeviceSetup').dataset.step==='place');
    await page.click('#usSetupSecondary');await page.waitForFunction(()=>document.getElementById('usDeviceSetup').dataset.step==='ready');
    const row=page.locator('#usSetupReady [data-row="widget"]');
    assert.equal(await text(page,'#usSetupReady [data-row="widget"] b'),'Widget Ti penso');
    assert.equal(await text(page,'#usSetupReady [data-row="widget"] small'),'Un pensiero con un tocco, anche con US chiusa.');
    const add=row.locator('button');assert.equal(await text(page,'#usSetupReady [data-row="widget"] button'),'Aggiungi il widget');
    const box=await add.boundingBox();assert.ok(box.height>=44);
    await add.click();
    await page.waitForFunction(()=>document.querySelector('#usSetupReady [data-row="widget"] small').textContent==='Conferma sulla schermata che si è aperta.');
    assert.deepEqual(await page.evaluate(()=>window.__pins),['think']);
    assert.equal(await page.evaluate(()=>document.activeElement?.matches('[data-us-setup-widget]')),true,'focus stays on the row');
    // The launcher confirms.
    await page.evaluate(()=>{window.__placed=true;window.dispatchEvent(new CustomEvent('us:widget-pinned',{detail:{kind:'think',placed:true}}));});
    await page.waitForFunction(()=>document.querySelector('#usSetupReady [data-row="widget"]').classList.contains('is-ok'));
    assert.equal(await text(page,'#usSetupReady [data-row="widget"] b'),'Widget sulla Home');
    assert.equal(await row.locator('button').count(),0);
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'usSetupPrimary');
    await page.click('#usSetupPrimary');await page.waitForFunction(()=>document.getElementById('usDeviceSetup').hidden);
    // The creator, on the web: no widget row.
    await refreshIfWaiting(c);
    await c.waitForFunction(()=>document.getElementById('usDeviceSetup').dataset.step==='noi');
    await c.click('#usSetupPrimary');await c.waitForFunction(()=>document.getElementById('usDeviceSetup').dataset.step==='place');
    await c.click('#usSetupSecondary');await c.waitForFunction(()=>document.getElementById('usDeviceSetup').dataset.step==='ready');
    assert.equal(await c.locator('#usSetupReady [data-row="widget"]').count(),0);
    assert.doesNotMatch(await text(c,'#usSetupReady'),/Widget/);
    for(const x of [creator,partner]){assert.deepEqual(x.errors,[]);await x.ctx.close();}
  }finally{await h.close();}
});
