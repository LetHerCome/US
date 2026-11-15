// First run in the browser. Il diario, ma pulito (15/11/2026, mockup v4.1
// «L'entrata»): the welcome before the account, «Da dove partite?», «Tu» with
// the character, the colour and the birthday, «Da quando state insieme?», the
// code with the notifications and today's question once it is sent, and the
// arrival «Ora siete in due» once after pairing (never for a session restored
// at launch).
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
    }else if(name==='set_my_color'){
      if(p)p.person_color=args.p_color;data={color:args.p_color};
    }else if(name==='set_my_character_shape'){
      // Written, not applied yet (supabase/migrations/20261115183900): the app keeps the shape on the phone.
      error={code:'PGRST202',message:'Could not find the function public.set_my_character_shape'};
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
    for(const name of ['create_couple','create_partner_invite','revoke_partner_invite','accept_partner_invite','get_couple_membership','set_my_color','set_my_character_shape'])window.__QA.rpc[name]=async args=>{
      const r=await window.__dcRpc(name,args,window.__QA.me);Object.assign(window.__QA.tables,r.tables);return {data:r.data,error:r.error};
    };
  },{user,profiles:b.profiles,couples:b.couples,signedOut,deviceProfile});
  await page.goto(h.base+'/?us-dev=1',{waitUntil:'load'});
  return {page,ctx,errors,outside};
}
// Design parity: the onboarding forms join the column (display:contents), so a
// form is on screen when one of its children is.
const visible=(page,id)=>page.waitForFunction(id=>{const el=document.getElementById(id);const shown=n=>n.getClientRects().length>0||(getComputedStyle(n).display==='contents'&&[...n.children].some(shown));return el&&!el.hidden&&shown(el);},id);
// The waiting screen checks by itself every 10 s: a manual refresh only when it is still there.
const refreshIfWaiting=page=>page.evaluate(()=>{const b=document.getElementById('mc3Refresh');if(b&&b.getClientRects().length&&!b.disabled)b.click();});
const text=(page,selector)=>page.locator(selector).evaluate(el=>el.textContent.replace(/\s+/g,' ').trim());

// Il diario, ma pulito (15/11/2026): from «Da dove partite?» to the code.
// Whoever creates: «Tu», «Da quando state insieme?», then the code (it comes by itself).
async function createUntilCode(page,name,{date=['1','1','2024']}={}){
  await visible(page,'mc3Choice');
  await page.click('#mc3ChooseCreate');await visible(page,'mc3Me');
  await page.fill('#mc3Name',name);await page.click('#mc3MeNext');
  await visible(page,'mc3Create');
  await page.selectOption('#mc3DateDay',date[0]);await page.selectOption('#mc3DateMonth',date[1]);await page.selectOption('#mc3DateYear',date[2]);
  await page.click('#mc3CreateNext');
  await visible(page,'mc3Waiting');await page.waitForFunction(()=>document.getElementById('mc3Code').value.length>0);
  return page.inputValue('#mc3Code');
}
// Whoever joins: the code first, then «Tu», and «Entra nel diario».
async function joinWith(page,name,token){
  await visible(page,'mc3Choice');
  await page.click('#mc3ChooseJoin');await visible(page,'mc3Join');
  await page.fill('#mc3JoinCode',token);await page.click('#mc3JoinNext');
  await visible(page,'mc3Me');await page.fill('#mc3Name',name);await page.click('#mc3MeNext');
}

test('first run welcome: only on a phone where nobody signed in, one screen, no network, then login',async t=>{
  const h=await start();if(!h)return t.skip('Playwright unavailable');const b=backend();
  try{
    const {page,ctx,errors,outside}=await pageFor(h,b,{signedOut:true});
    await visible(page,'usTour');
    assert.equal(await page.locator('#loginEmail').isVisible(),false);
    assert.equal(await page.locator('.app').evaluate(el=>getComputedStyle(el).visibility),'hidden');
    const before=b.calls.length,outsideBefore=outside.length;
    assert.equal(await text(page,'#usTourTitle'),'Il diario della coppia');
    assert.equal(await text(page,'#usTourNext'),'Inizia');assert.equal(await text(page,'#usTourLogin'),'Ho già un account');
    // The two characters, drawn by diario.js.
    await page.waitForFunction(()=>document.querySelectorAll('#usTourDuo .dy-char').length===2);
    for(const button of await page.locator('#usTour button').all()){const box=await button.boundingBox();assert.ok(box.height>=44&&box.width>=44,`44px targets: ${await button.evaluate(el=>el.id)} ${box.width}x${box.height}`);}
    assert.equal(b.calls.length,before,'no backend call on the welcome');assert.equal(outside.length,outsideBefore,'no network on the welcome');
    await page.click('#usTourLogin');
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

test('first run: Tu with character, colour and birthday, the date, the code; the partner joins; each phone sees the arrival once',async t=>{
  const h=await start();if(!h)return t.skip('Playwright unavailable');const b=backend();
  try{
    const creator=await pageFor(h,b,{user:'u1'});const page=creator.page;
    await visible(page,'mc3Choice');
    assert.equal(await text(page,'#mc3Title'),'Da dove partite?');
    assert.equal(await page.locator('.app').evaluate(el=>el.inert),true,'the app stays inert during onboarding');
    await page.click('#mc3ChooseCreate');await visible(page,'mc3Me');
    assert.equal(await text(page,'#mc3Kicker'),'1 di 3');assert.equal(await text(page,'#mc3Title'),'Iniziamo da te');
    // Five shapes, eight colours; the big character takes them at once.
    await page.waitForFunction(()=>document.querySelectorAll('#mc3Shapes [data-shape]').length===5&&document.querySelectorAll('#mc3Colors [data-colour]').length===8);
    await page.click('[data-shape="nuvola"]');await page.click('[data-colour="menta"]');
    assert.equal(await page.getAttribute('[data-shape="nuvola"]','aria-pressed'),'true');assert.equal(await page.getAttribute('[data-colour="menta"]','aria-pressed'),'true');
    assert.equal(await page.locator('#usOnboarding').evaluate(el=>el.style.getPropertyValue('--dy-pick')),'#6fd6c8');
    // Validation of the birthday pair, then a valid choice.
    await page.fill('#mc3Name','Mira');await page.selectOption('#mc3BirthDay','12');await page.click('#mc3MeNext');
    await page.waitForFunction(()=>document.getElementById('mc3Status').textContent.includes('giorno e mese'));
    assert.equal(await page.locator('#mc3Me').isVisible(),true);
    await page.selectOption('#mc3BirthMonth','3');await page.click('#mc3MeNext');
    await visible(page,'mc3Create');assert.equal(await text(page,'#mc3Kicker'),'2 di 3');assert.equal(await text(page,'#mc3Title'),'Da quando state insieme?');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('us:onboarding:v1:birthday:u1')),'{"day":12,"month":3}');
    // Back keeps what was typed and picked.
    await page.click('#mc3Back');await visible(page,'mc3Me');
    assert.equal(await page.inputValue('#mc3Name'),'Mira');assert.equal(await page.inputValue('#mc3BirthMonth'),'3');
    assert.equal(await page.getAttribute('[data-shape="nuvola"]','aria-pressed'),'true');
    await page.click('#mc3MeNext');await visible(page,'mc3Create');
    await page.selectOption('#mc3DateDay','1');await page.selectOption('#mc3DateMonth','1');await page.selectOption('#mc3DateYear','2024');
    assert.match(await text(page,'#mc3DaysTag'),/^[\d.]+ giorni insieme$/);
    await page.click('#mc3CreateNext');
    await visible(page,'mc3Waiting');assert.equal(await text(page,'#mc3Title'),'Il suo posto è pronto');assert.equal(await text(page,'#mc3Kicker'),'3 di 3');
    // The first code comes by itself.
    await page.waitForFunction(()=>document.getElementById('mc3Code').value.length>0);
    assert.match(await text(page,'#mc3InviteStatus'),/^Invito in attesa · scade il \d+ \S+ alle \d\d:\d\d$/);
    assert.equal(b.calls.filter(c=>c.name==='create_partner_invite').length,1,'one code, once');
    await page.waitForFunction(()=>(window.__QA.inserts||[]).length===1);
    const today=await page.evaluate(()=>new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Rome'}));
    assert.deepEqual(await page.evaluate(()=>window.__QA.inserts),[{table:'shared_events',row:{title:'Compleanno di Mira',event_date:OB.nextBirthday(12,3,today),event_time:null,location:null,note:null,recurs_yearly:true,couple_id:'c2',created_by:'u1'}}]);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('us:onboarding:v1:birthday:u1')),null);
    assert.equal(await page.evaluate(()=>localStorage.getItem('us:onboarding:v1:birthday-saved:u1')),'1');
    assert.equal(await page.evaluate(()=>localStorage.getItem('us:setup:v1:pending:u1')),'created');
    assert.deepEqual(b.calls.find(c=>c.name==='create_couple').args,{p_display_name:'Mira',p_started_on:'2024-01-01',p_couple_name:'US.'});
    // The look: the colour on the server, the shape kept on this phone while its function is not there.
    await page.waitForFunction(()=>localStorage.getItem('us:character-shape:u1')==='nuvola');
    assert.deepEqual(b.calls.find(c=>c.name==='set_my_color').args,{p_color:'menta'});
    assert.deepEqual(b.calls.find(c=>c.name==='set_my_character_shape').args,{p_shape:'nuvola'});
    const token=await page.inputValue('#mc3Code');

    // The partner: the code, then «Tu» without a birthday, and in.
    const partner=await pageFor(h,b,{user:'u2'});
    await visible(partner.page,'mc3Choice');await partner.page.click('#mc3ChooseJoin');await visible(partner.page,'mc3Join');
    assert.equal(await text(partner.page,'#mc3Kicker'),'1 di 2');
    await partner.page.fill('#mc3JoinCode','not a code');await partner.page.click('#mc3JoinNext');
    await partner.page.waitForFunction(()=>document.getElementById('mc3Status').textContent.includes('26 caratteri'));
    await partner.page.fill('#mc3JoinCode',`Ti aspetto su US ♡\n${token}`);await partner.page.click('#mc3JoinNext');
    await visible(partner.page,'mc3Me');assert.equal(await text(partner.page,'#mc3Kicker'),'2 di 2');
    await partner.page.fill('#mc3Name','Nico');await partner.page.click('#mc3MeNext');
    await partner.page.waitForFunction(()=>window.usProfile?.id==='u2');
    assert.deepEqual(b.calls.find(c=>c.name==='accept_partner_invite').args,{p_code:token,p_display_name:'Nico'});
    await visible(partner.page,'usDeviceSetup');await partner.page.waitForFunction(()=>document.getElementById('usDeviceSetup').dataset.step==='arrivo');
    assert.equal(await text(partner.page,'#usSetupTitle'),'Ora siete in due');
    await partner.page.waitForFunction(()=>/^Mira ti aspettava\. Il suo colore è il menta, il tuo il lilla\.$/.test(document.getElementById('usSetupCopy').textContent));
    await partner.page.waitForFunction(()=>document.activeElement?.id==='usSetupTitle',null,{timeout:3000});
    assert.equal(await partner.page.locator('.app').evaluate(el=>el.inert&&el.getAttribute('aria-hidden')==='true'),true,'the app behind is unreachable');
    assert.equal(await partner.page.locator('#usSetupPair .dy-char').count(),2);
    assert.equal(await partner.page.evaluate(()=>(window.__QA.inserts||[]).length),0,'no birthday, no event');
    assert.equal(await text(partner.page,'#usSetupPrimary'),'Entra nel diario');
    await partner.page.click('#usSetupPrimary');
    await partner.page.waitForFunction(()=>document.getElementById('usDeviceSetup').hidden);
    assert.equal(await partner.page.locator('.app').evaluate(el=>el.inert||el.hasAttribute('aria-hidden')),false);
    assert.equal(await partner.page.evaluate(()=>localStorage.getItem('us:setup:v1:done:u2')),'1');
    assert.equal(await partner.page.evaluate(()=>localStorage.getItem('us:setup:v1:pending:u2')),null);
    assert.equal(await partner.page.evaluate(()=>usOnboarding.setup.maybeOpen(window.usProfile)),false,'once per user');
    assert.equal(await partner.page.locator('#usDeviceSetup').isHidden(),true);

    // The creator learns it on the next refresh, or the automatic check got there first: «Ora siete in due».
    await refreshIfWaiting(page);await page.waitForFunction(()=>window.usProfile?.id==='u1');
    await page.waitForFunction(()=>document.getElementById('usDeviceSetup').dataset.step==='arrivo');
    await page.waitForFunction(()=>/^Nico è qui, adesso\. Il suo colore è il lilla\.$/.test(document.getElementById('usSetupCopy').textContent));
    await page.click('#usSetupPrimary');await page.waitForFunction(()=>document.getElementById('usDeviceSetup').hidden);
    assert.equal(await page.evaluate(()=>(window.__QA.inserts||[]).length),1,'the birthday is written once');
    for(const x of [creator,partner]){assert.deepEqual(x.errors,[]);await x.ctx.close();}
  }finally{await h.close();}
});

test('first run: a session restored at launch never sees the arrival; a password sign-in on a new phone has nothing left to ask',async t=>{
  const h=await start();if(!h)return t.skip('Playwright unavailable');const b=backend();
  try{
    const restored=await pageFor(h,b,{user:'f1'});
    await restored.page.waitForFunction(()=>window.usProfile?.id==='f1');await restored.page.waitForTimeout(300);
    assert.equal(await restored.page.locator('#usDeviceSetup').isHidden(),true);assert.equal(await restored.page.locator('#usTour').isHidden(),true);
    assert.equal(await restored.page.evaluate(()=>localStorage.getItem('us:tour:v1:seen')),'1','a signed-in phone never shows the welcome later');
    assert.deepEqual(restored.errors,[]);await restored.ctx.close();

    const fresh=await pageFor(h,b,{user:'f1',signedOut:true,deviceProfile:{id:'f1',couple_id:'c1',display_name:'Francesco',role:'francesco'}});const page=fresh.page;
    await page.waitForFunction(()=>document.getElementById('authLogin').classList.contains('active')&&!document.documentElement.classList.contains('us-auth-pending'));
    await page.fill('#loginEmail','qa@example.test');await page.fill('#loginPassword','synthetic-local-password');await page.click('#loginBtn');
    await page.waitForFunction(()=>window.usProfile?.id==='f1');await page.waitForTimeout(300);
    // Il diario, ma pulito (15/11/2026): no Notifiche or Posizione steps after pairing any more.
    assert.equal(await page.locator('#usDeviceSetup').isHidden(),true);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('us:setup:v1:password-sign-in')),null,'the sign-in marker is spent');
    assert.equal(await page.evaluate(()=>localStorage.getItem('us:setup:v1:done:f1')),'1');
    assert.equal(await page.evaluate(()=>window.UsLocation.isSharing()),false,'the position is never turned on by the first run');
    assert.deepEqual(fresh.errors,[]);await fresh.ctx.close();
  }finally{await h.close();}
});

test('1.0 A1: sign-up waits for the 18+ and Terms box and records it with the account',async t=>{
  const h=await start();if(!h)return t.skip('Playwright unavailable');const b=backend();
  try{
    const {page,ctx,errors}=await pageFor(h,b,{signedOut:true,releaseSignup:true});
    await visible(page,'usTour');
    // Il diario, ma pulito (15/11/2026): one welcome, «Inizia», then «Il tuo account».
    await page.click('#usTourNext');
    await page.waitForFunction(()=>document.getElementById('usSignup').classList.contains('active'));
    assert.equal(await text(page,'#usSignupHeading'),'Il tuo account');
    const submit=page.locator('#usSignupSubmit');
    assert.equal(await submit.isDisabled(),true,'off before anything');
    await page.fill('#usSignupEmail','new@example.test');await page.fill('#usSignupPassword','synthetic-pass-123');await page.fill('#usSignupConfirm','synthetic-pass-123');
    assert.equal(await submit.isDisabled(),true,'off until the box is ticked');
    assert.equal(await text(page,'#usSignup .us-auth-consent'),'Ho almeno 18 anni e accetto i Termini e la Privacy');
    // The public pages exist (public-auth.js LEGAL_URLS): the words link to them, in a new tab.
    assert.deepEqual(await page.locator('#usSignup a[data-us-legal]').evaluateAll(links=>links.map(a=>[a.getAttribute('href'),a.target,a.rel])),[['https://www.uscouple.app/termini','_blank','noopener noreferrer'],['https://www.uscouple.app/privacy','_blank','noopener noreferrer']]);
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
    // «Indietro» on the account goes back to the welcome.
    await page.click('#usVerifyBack');await page.waitForFunction(()=>document.getElementById('authLogin').classList.contains('active'));
    await page.click('#usShowSignup');await page.click('#usSignupHome');await visible(page,'usTour');
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
    const token=await createUntilCode(page,'Mira');
    for(const id of ['mc3ShareCode','mc3CopyCode']){const box=await page.locator('#'+id).boundingBox();assert.ok(box.height>=44&&box.width>=44,id);}
    // First the code, then the question and the notifications.
    assert.equal(await page.locator('#mc3Today').isHidden(),true);assert.equal(await page.locator('#mc3Notify').isHidden(),true);
    await page.click('#mc3ShareCode');
    await page.waitForFunction(()=>document.getElementById('mc3Status').textContent.includes('Fatto.'));
    await page.waitForFunction(()=>document.getElementById('mc3CodeArea').hasAttribute('data-sent'));
    assert.equal(await text(page,'#mc3CodeArea .dy-ent-sent b'),'Codice mandato');
    const [shared]=await page.evaluate(()=>window.__shared);
    assert.deepEqual(Object.keys(shared),['text']);
    const lines=shared.text.split('\n');
    assert.equal(lines[0],'Ti aspetto su US ♡');assert.equal(lines.at(-2),'Apri il mio invito:');
    assert.equal(OB.inviteFromLink(lines.at(-1)),token);
    await page.waitForFunction(()=>!document.getElementById('mc3Today').hidden);
    // Off to WhatsApp and back: off the screen while away, back on return.
    await page.evaluate(()=>window.__setHidden(true));assert.equal(await page.inputValue('#mc3Code'),'');
    await page.evaluate(()=>window.__setHidden(false));
    await page.waitForFunction(code=>document.getElementById('mc3Code').value===code&&!document.getElementById('mc3Waiting').hidden,token);
    const secrets=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage},url:location.href}));assert.equal(secrets.includes(token),false,'memory only');
    // The partner joins; the creator does nothing and still finds out.
    const membership=()=>b.calls.filter(c=>c.name==='get_couple_membership'&&c.user==='u1').length;
    const before=membership();
    const partner=await pageFor(h,b,{user:'u2'});
    await joinWith(partner.page,'Nico',token);
    await partner.page.waitForFunction(()=>window.usProfile?.id==='u2');
    await page.waitForFunction(()=>document.getElementById('usDeviceSetup').dataset.step==='arrivo',null,{timeout:25000});
    assert.ok(membership()>before,'found by the automatic check');
    assert.equal(await page.evaluate(()=>window.usProfile?.id),'u1');
    // Paired: no more checks.
    const settled=membership();await page.waitForTimeout(10600);assert.ok(membership()-settled<=1,'the check stops once paired');
    for(const x of [creator,partner]){assert.deepEqual(x.errors,[]);await x.ctx.close();}
  }finally{await h.close();}
});

test('Il diario, ma pulito (15/11/2026): «Ti avviso quando entra?» after the code is sent, with the existing enable flow',async t=>{
  const h=await start();if(!h)return t.skip('Playwright unavailable');const b=backend();
  try{
    const creator=await pageFor(h,b,{user:'u1'});const page=creator.page;
    // A phone with native notifications not yet on (the flow itself is notifications.js, tested on its own).
    await page.evaluate(()=>{window.__push=[];window.UsNotifications={supported:()=>true,authReady:async p=>{window.__push.push('ready:'+p.id);},getState:async()=>({supported:true,kind:'inactive'}),enable:async()=>{window.__push.push('enable');return {ok:true,kind:'active'};},signedOut(){window.__push.push('signedOut');},resume:async()=>{},onNavigate(){}};});
    await createUntilCode(page,'Mira');
    assert.equal(await page.locator('#mc3Notify').isHidden(),true,'not before the code leaves');
    await page.click('#mc3CopyCode');
    await page.waitForFunction(()=>!document.getElementById('mc3Notify').hidden);
    assert.equal(await text(page,'#mc3NotifyTitle'),'Ti avviso quando entra?');
    await page.click('#mc3NotifyYes');
    await page.waitForFunction(()=>document.getElementById('mc3NotifyTitle').textContent==='Ti avviso io');
    assert.equal(await page.locator('#mc3NotifyYes').isHidden(),true);
    const push=await page.evaluate(()=>window.__push);
    assert.ok(push.includes('ready:u1'),'the native flow, for this member');assert.equal(push.filter(x=>x==='enable').length,1);
    // Back from another app: who waits keeps this phone's notifications.
    await page.evaluate(()=>{window.__push.length=0;document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForTimeout(800);
    assert.equal(await page.evaluate(()=>window.__push.includes('signedOut')),false);
    assert.deepEqual(creator.errors,[]);await creator.ctx.close();
  }finally{await h.close();}
});

// Il diario, ma pulito (15/11/2026): «Tutto pronto» (and its widget offer) left the
// first run with the steps after pairing; the widget is added from Impostazioni › Widget.
test.skip('Il diario, ma pulito (15/11/2026): «Tutto pronto» and its widget offer left the first run',()=>{});
