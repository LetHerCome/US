const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {start,qaFixture}=require('./helpers/countdown-browser');
const {FAKE_SUPABASE}=require('./helpers/oggi-browser');
const code=n=>String(n).padStart(26,'A');
function backend(){
 const profiles=[{id:'f1',couple_id:'c1',display_name:'Francesco',role:'francesco'},{id:'b1',couple_id:'c1',display_name:'Beatrice',role:'beatrice'}];
 const couples=[{id:'c1',name:'US.',started_on:'2022-06-23'}],invites=new Map(),calls=[];let sequence=0;
 return {profiles,couples,calls,invites,fail:false,delay:null,async rpc(name,args,user){
  calls.push({name,args,user});if(this.delay)await this.delay;
  const p=profiles.find(p=>p.id===user);let data=null,error=null;
  if(this.fail){error={message:'transport private metadata'};}
  else if(['anon','banned','unconfirmed'].includes(user)&&name!=='get_couple_membership'){error={code:'42501',message:'account_not_eligible'};}
  else if(name==='get_couple_membership'){
   const i=p&&invites.get(p.couple_id);
   data=p?{member:true,couple_id:p.couple_id,partner_joined:profiles.some(other=>other.couple_id===p.couple_id&&other.id!==user),invite:{status:i?.status||'none',expires_at:i?.expires_at||null}}:{member:false};
  }else if(name==='create_couple'){
   if(p)data={status:'already_member',couple_id:p.couple_id};
   else {const cid='c2';couples.push({id:cid,name:args.p_couple_name,started_on:args.p_started_on});profiles.push({id:user,couple_id:cid,display_name:args.p_display_name,role:'beatrice'});data={status:'created',couple_id:cid};}
  }else if(name==='create_partner_invite'){
   if(profiles.filter(x=>x.couple_id===p?.couple_id).length!==1)error={code:'P0001',message:'couple_full'};
   else {data={code:code(++sequence),expires_at:new Date(Date.now()+48*3600000).toISOString()};invites.set(p.couple_id,{...data,status:'pending'});}
  }else if(name==='revoke_partner_invite'){
   const i=invites.get(p.couple_id);if(i)i.status='revoked';data={revoked:!!i};
  }else if(name==='accept_partner_invite'){
   const entry=[...invites].find(([,i])=>i.code===args.p_code&&i.status==='pending');
   if(!entry||p)error={code:'P0001',message:'invite_invalid victim private metadata'};
   else{const [cid,i]=entry;i.status='used';profiles.push({id:user,couple_id:cid,display_name:args.p_display_name,role:'francesco'});data={status:'joined',couple_id:cid};}
  }
  return {data,error,tables:{profiles:structuredClone(profiles),couples:structuredClone(couples)}};
 }};
}
async function pageFor(h,b,{user='u1',width=390,height=844,reduced=false,signedOut=false}={}){
 const ctx=await h.browser.newContext({viewport:{width,height},timezoneId:'Europe/Rome',serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'});
 await ctx.grantPermissions(['clipboard-read','clipboard-write']);
 const page=await ctx.newPage(),errors=[],logs=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>logs.push(m.text()));
 await page.exposeFunction('__mc3Rpc',(name,args,uid)=>b.rpc(name,args,uid));
 const fake=FAKE_SUPABASE.replace("const session = () => ({", "const session = () => Q().signedOut ? null : ({")
 .replace("onAuthStateChange: () =>", "onAuthStateChange: (fn) => {(window.__authListeners ||= []).push(fn);window.__authCallback=(...args)=>window.__authListeners.forEach(listener=>listener(...args));return")
 .replace("unsubscribe() {} } } }),", "unsubscribe() {} } } });},")
 .replace("signOut: async () => ({ error: null })", "signOut: async () => {Q().signedOut=true;window.__authCallback?.('SIGNED_OUT',null);return {error:null};}")
 .replace("signInWithPassword: async () => ({ data: null, error: { message: 'qa' } })", "signInWithPassword: async () => {Q().signedOut=false;window.__authCallback?.('SIGNED_IN',session());return {data:{session:session()},error:null};}")
 .replace("maybeSingle() { return Promise.resolve({", "maybeSingle() { if(table==='profiles'&&Q().profileError)return Promise.resolve({data:null,error:{message:'offline'}});return Promise.resolve({");
 await page.route('**/*',route=>{const u=route.request().url();if(u.startsWith(h.base))return route.continue();if(/supabase-js/.test(u))return route.fulfill({contentType:'text/javascript',body:fake});return route.abort();});
 await page.addInitScript(qaFixture,{style:'editorial',mode:'days',unlocked:true,missing:false,started:'2022-06-23',active:'custom'});
 await page.addInitScript(({user,profiles,couples,signedOut})=>{
  window.__QA.me=user;window.__QA.signedOut=signedOut;window.__QA.tables.profiles=profiles;window.__QA.tables.couples=couples;
  for(const name of ['create_couple','create_partner_invite','revoke_partner_invite','accept_partner_invite','get_couple_membership'])window.__QA.rpc[name]=async args=>{
   const r=await window.__mc3Rpc(name,args,window.__QA.me);Object.assign(window.__QA.tables,r.tables);return {data:r.data,error:r.error};
  };
 },{user,profiles:b.profiles,couples:b.couples,signedOut});
 await page.goto(h.base+'/?us-dev=1',{waitUntil:'load'});
 return {page,ctx,errors,logs};
}
const capture=async(page,label,width)=>{if(process.env.MC3_ARTIFACTS)await page.screenshot({path:path.join(process.env.MC3_ARTIFACTS,`mc3-${label}-${width}.png`),fullPage:true});};
for(const [width,height] of [[320,568],[390,844],[844,390]])test(`MC3 create/invite/copy/revoke/refresh and mobile geometry ${width}x${height}`,async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');const b=backend();
 try{const {page,ctx,errors,logs}=await pageFor(h,b,{width,height,reduced:true});
  await page.waitForFunction(()=>document.getElementById('mc3Choice').hidden===false&&document.getElementById('usOnboarding').classList.contains('active'));
  assert.equal(await page.locator('.app').evaluate(el=>getComputedStyle(el).visibility),'hidden');
  assert.equal(await page.locator('.app').evaluate(el=>el.inert),true);assert.equal(await page.locator('#usAuthInstall').isVisible(),false);
  await capture(page,'choice',width);await page.click('#mc3ChooseCreate');
  assert.equal(await page.locator('#mc3CreateName').evaluate(el=>el===document.activeElement),true);
  await page.fill('#mc3CreateName','Mira');await page.fill('#mc3Date','2024-02-29');await capture(page,'create',width);
  await page.setViewportSize({width,height:320});await page.locator('#mc3CoupleName').focus();await page.locator('#mc3CoupleName').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#mc3CoupleName').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),true);
  await capture(page,'keyboard',width);await page.setViewportSize({width,height});
  await page.locator('#mc3Create button[type=submit]').click();await page.waitForFunction(()=>!document.getElementById('mc3Waiting').hidden);
  assert.equal(await page.evaluate(()=>window.usProfile),null);
  await page.click('#mc3Generate');await page.waitForFunction(()=>document.getElementById('mc3Code').value.length>0);
  const token=await page.inputValue('#mc3Code');await page.click('#mc3CopyCode');assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),token);
  await capture(page,'waiting',width);
  await page.locator('#mc3Refresh').scrollIntoViewIfNeeded();await capture(page,'waiting-actions',width);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const secrets=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage},url:location.href,html:[...document.querySelectorAll('[value]')].map(el=>el.getAttribute('value'))}));assert.ok(!secrets.includes(token));assert.ok(!logs.join('\n').includes(token));
  await page.click('#mc3Refresh');await page.waitForFunction(()=>!document.getElementById('mc3Refresh').disabled);assert.equal(await page.inputValue('#mc3Code'),'');
  await page.click('#mc3Revoke');await page.waitForFunction(()=>document.getElementById('mc3InviteStatus').textContent.includes('revocato'));
  await page.click('#mc3Generate');await page.waitForFunction(()=>document.getElementById('mc3Code').value.length>0);assert.notEqual(await page.inputValue('#mc3Code'),token);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('us-app-lock-change',{detail:{locked:true}})));assert.equal(await page.inputValue('#mc3Code'),'');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('us-app-lock-change',{detail:{locked:false}})));await page.waitForFunction(()=>!document.getElementById('mc3Waiting').hidden);
  await page.click('#mc3Exit');await page.waitForFunction(()=>document.getElementById('authLogin').classList.contains('active'));assert.equal(await page.inputValue('#mc3Code'),'');
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{await h.close();}
});
test('MC3 four users / two couples: partner join and creator soft transition preserve reversed slots',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');const b=backend();
 try{const creator=await pageFor(h,b);const a=await pageFor(h,b,{user:'f1'});
  await a.page.waitForFunction(()=>window.UsIdentity?.current().partnerName==='Beatrice');assert.equal(await a.page.locator('#usOnboarding').isVisible(),false);await capture(a.page,'paired',390);
  await creator.page.click('#mc3ChooseCreate');await creator.page.fill('#mc3CreateName','Mira');await creator.page.fill('#mc3Date','2024-01-01');await creator.page.locator('#mc3Create button[type=submit]').click();await creator.page.waitForFunction(()=>!document.getElementById('mc3Waiting').hidden);
  await creator.page.click('#mc3Generate');await creator.page.waitForFunction(()=>document.getElementById('mc3Code').value);const token=await creator.page.inputValue('#mc3Code');
  const partner=await pageFor(h,b,{user:'u2'});await partner.page.click('#mc3ChooseJoin');await partner.page.fill('#mc3JoinName','Nico');await partner.page.fill('#mc3JoinCode',token.match(/.{1,4}/g).join(' - '));await partner.page.locator('#mc3Join button[type=submit]').click();
  await partner.page.waitForFunction(()=>window.usProfile?.id==='u2'&&window.UsIdentity?.current().partnerName==='Mira');
  await creator.page.click('#mc3Refresh');await creator.page.waitForFunction(()=>window.usProfile?.id==='u1'&&window.UsIdentity?.current().partnerName==='Nico');
  assert.equal(await creator.page.evaluate(()=>window.usProfile.role),'beatrice');assert.equal(await partner.page.evaluate(()=>window.usProfile.role),'francesco');
  assert.equal(await creator.page.inputValue('#mc3Code'),'');assert.equal(b.profiles.length,4);assert.equal(b.couples.length,2);
  assert.deepEqual(b.calls.find(c=>c.name==='create_couple').args,{p_display_name:'Mira',p_started_on:'2024-01-01',p_couple_name:'US.'});
  for(const x of [creator,partner,a]){assert.deepEqual(x.errors,[]);await x.ctx.close();}
 }finally{await h.close();}
});
test('MC3 auth switch, suspended reads, offline verification and neutral errors',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');const b=backend();
 try{const {page,ctx,errors}=await pageFor(h,b,{user:'f1'});await page.waitForFunction(()=>window.usProfile?.id==='f1');
  let release;b.delay=new Promise(r=>release=r);
  await page.evaluate(()=>{window.__QA.me='u1';window.__authCallback('SIGNED_IN',{user:{id:'u1'}});});
  await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.usProfile),null);assert.equal(await page.locator('.app').evaluate(el=>getComputedStyle(el).visibility),'hidden');
  await page.evaluate(()=>{window.__QA.me='u2';window.__authCallback('SIGNED_IN',{user:{id:'u2'}});});release();b.delay=null;
  await page.waitForFunction(()=>document.getElementById('mc3Choice').hidden===false&&document.getElementById('usOnboarding').classList.contains('active'));
  await page.click('#mc3ChooseJoin');await page.fill('#mc3JoinName','<img src=x onerror=window.__injected=1>');await page.fill('#mc3JoinCode','A'.repeat(26));await page.locator('#mc3Join button[type=submit]').click();await page.waitForFunction(()=>document.getElementById('mc3Status').textContent.includes('Codice non valido'));
  assert.doesNotMatch(await page.locator('#mc3Status').innerText(),/victim|metadata/);assert.equal(await page.evaluate(()=>window.__injected),undefined);
  await page.evaluate(()=>{window.__QA.profileError=true;window.__authCallback('SIGNED_IN',{user:{id:'u2'}});});await page.waitForFunction(()=>!document.getElementById('mc3Retry').hidden);assert.equal(await page.locator('#mc3Choice').isVisible(),false);
  await page.evaluate(()=>localStorage.setItem('us:fix4:last-profile',JSON.stringify({id:'f1',couple_id:'c1',display_name:'Francesco',role:'francesco'})));
  await ctx.setOffline(true);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.usProfile),null);assert.equal(await page.locator('.app').evaluate(el=>getComputedStyle(el).visibility),'hidden');await ctx.setOffline(false);
  await page.evaluate(()=>{window.__QA.profileError=false;});await page.click('#mc3Retry');await page.waitForFunction(()=>!document.getElementById('mc3Choice').hidden);
  await page.evaluate(()=>{window.__QA.me='banned';window.__authCallback('SIGNED_IN',{user:{id:'banned'}});});await page.waitForFunction(()=>!document.getElementById('mc3Choice').hidden);await page.click('#mc3ChooseCreate');await page.fill('#mc3CreateName','Beta');await page.fill('#mc3Date','2024-01-01');await page.locator('#mc3Create button[type=submit]').click();await page.waitForFunction(()=>!document.getElementById('mc3Retry').hidden);
  assert.match(await page.locator('#mc3Status').innerText(),/Questo account/);assert.deepEqual(errors,[]);await ctx.close();
 }finally{await h.close();}
});
test('MC3 password login and simultaneous Auth callback share bootstrap without losing permanent session',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');const b=backend();
 try{const {page,ctx,errors}=await pageFor(h,b,{signedOut:true});
  await page.waitForFunction(()=>document.getElementById('authLogin').classList.contains('active')&&!document.documentElement.classList.contains('us-auth-pending'));
  await page.fill('#loginEmail','beta@example.test');await page.fill('#loginPassword','synthetic-local-password');await page.click('#loginBtn');
  await page.waitForFunction(()=>document.getElementById('usOnboarding').classList.contains('active')&&!document.getElementById('loginBtn').disabled);
  assert.equal(await page.inputValue('#loginPassword'),'');assert.equal(await page.evaluate(()=>window.__QA.signedOut),false);
  assert.equal(await page.locator('#authLogin').isVisible(),false);assert.equal(await page.locator('.app').evaluate(el=>getComputedStyle(el).visibility),'hidden');
  assert.ok(b.calls.filter(c=>c.name==='get_couple_membership').length<=2);assert.equal(b.calls.some(c=>c.name!=='get_couple_membership'),false);
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{await h.close();}
});
test('MC3 late Home image from A cannot paint or be cached as paired B',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');const b=backend();
 b.profiles.push({id:'u1',couple_id:'c2',display_name:'Mira',role:'beatrice'},{id:'u2',couple_id:'c2',display_name:'Nico',role:'francesco'});b.couples.push({id:'c2',started_on:'2024-01-01'});
 try{const {page,ctx,errors}=await pageFor(h,b,{user:'f1'});await page.waitForFunction(()=>window.usProfile?.id==='f1');
  await page.evaluate(()=>{
   const RealImage=window.Image;window.Image=class {constructor(){window.__latePhoto=this;}decode(){return Promise.resolve();}set src(value){this.source=value;}};
   crossfadeHomePhoto('https://private.invalid/photo-A',{path:'c1/f1/private-A.webp',hourKey:'old'});window.Image=RealImage;
   window.__QA.me='u1';window.__QA.tables.profiles.push({id:'u1',couple_id:'c2',display_name:'Mira',role:'beatrice'},{id:'u2',couple_id:'c2',display_name:'Nico',role:'francesco'});window.__authCallback('SIGNED_IN',{user:{id:'u1'}});
  });
  await page.waitForFunction(()=>window.usProfile?.id==='u1'&&window.UsIdentity?.current().partnerName==='Nico');
  await page.evaluate(async()=>{await window.__latePhoto.onload();});await page.waitForTimeout(100);
  assert.doesNotMatch(await page.locator('#homeHero').innerHTML(),/private-A|private.invalid/);
  assert.doesNotMatch(await page.evaluate(()=>localStorage.getItem('us:boot:home-photo:v1')||''),/private-A|private.invalid/);
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{await h.close();}
});
