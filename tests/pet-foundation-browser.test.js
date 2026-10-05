const test=require('node:test');const assert=require('node:assert/strict');
const {start,pageFor}=require('./helpers/countdown-browser');
const fs=require('node:fs');const path=require('node:path');
const output=process.env.PET_SCREENSHOTS;
async function shot(page,name){if(!output)return;fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,`${name}.png`)});}
async function preview(h,options){
 const view=await pageFor(h,options);
 await view.page.goto(h.base+'/?us-dev=1&us-pet=preview',{waitUntil:'load'});
 await view.page.waitForFunction(()=>window.USPet?.enabled&&document.getElementById('usPetLayer').dataset.petState);
 // Daily Question and Ti penso are transient: the PET must stay alive above both.
 await view.page.evaluate(()=>{
   document.getElementById('usDailyNudge').hidden=false;
   document.getElementById('toast').classList.add('show');
   // The real arrival path: openThinkArrival() makes it an (aria) modal.
   usIncomingThink={id:'qa-think',sender_id:'b1',created_at:new Date().toISOString()};window.openThinkArrival();
 });
 await view.page.waitForTimeout(300);
 const overlay=await view.page.evaluate(()=>{
   const pet=document.getElementById('usPetLayer'),nudge=document.getElementById('usDailyNudge'),toast=document.getElementById('toast'),think=document.querySelector('.think-arrival-overlay');
   return {
     visibility:getComputedStyle(pet).visibility,
     petZ:Number(getComputedStyle(pet).zIndex),
     nudgeZ:Number(getComputedStyle(nudge).zIndex),
     toastZ:Number(getComputedStyle(toast).zIndex),
     thinkZ:Number(getComputedStyle(think).zIndex),
     blockers:window.USPet.blockers(),
     running:window.USPet.snapshot().running,
     react:window.USPet.react('reward')
   };
 });
 assert.equal(overlay.visibility,'visible');
 assert.ok(overlay.petZ>overlay.nudgeZ&&overlay.petZ>overlay.toastZ&&overlay.petZ>overlay.thinkZ,JSON.stringify(overlay));
 assert.deepEqual({blockers:overlay.blockers,running:overlay.running,react:overlay.react},{blockers:[],running:true,react:true});
 await view.page.evaluate(()=>{
   document.getElementById('usDailyNudge').hidden=true;
   document.getElementById('toast').classList.remove('show');
   window.closeThinkArrival();
   document.documentElement.style.setProperty('--us-safe-bottom','20px');
   window.dispatchEvent(new Event('resize'));
 });
 await view.page.waitForTimeout(400);
 assert.equal(await view.page.evaluate(()=>window.USPet.snapshot().running),true);
 return view;
}
const geometry=page=>page.evaluate(()=>{
 const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
 const nav=document.querySelector('.nav'),layer=document.getElementById('usPetLayer'),actor=layer.querySelector('.us-pet-actor');
 const tabs=[...nav.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return b.contains(hit);});
 const a=actor.getBoundingClientRect();const onPet=document.elementFromPoint(a.x+a.width/2,a.y+a.height/2);
 return {nav:box(nav),layer:box(layer),actor:box(actor),tabs,petTakesInput:Boolean(onPet&&layer.contains(onPet)),visibility:getComputedStyle(layer).visibility,sw:document.scrollingElement.scrollWidth,w:innerWidth};
});

test('PET production kitten mounts without a preview query',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  const {page,ctx,errors}=await pageFor(h,{});
  await page.waitForFunction(()=>window.USPet?.enabled&&document.getElementById('usPetLayer').dataset.petRenderer==='sprite');
  assert.equal(await page.evaluate(()=>window.USPet.enabled),true);
  assert.equal(await page.evaluate(()=>document.getElementById('usPetLayer').dataset.petRenderer),'sprite');
  assert.equal(await page.locator('#usPetLayer [data-pet-production="kitten-v0"]').count(),1);
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{await h.close();}
});
test('PET preview lives on the nav rim, never covers or blocks a tab, at every base viewport',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{for(const [width,height] of [[320,568],[390,844],[844,390]]){
  const {page,ctx,errors}=await preview(h,{width,height,style:'editorial'});
  const m=await geometry(page);
  assert.ok(m.layer.bottom<=m.nav.y+3.5&&m.layer.bottom>=m.nav.y-1,`${width}×${height} pet stands on the nav rim ${JSON.stringify(m)}`);
  assert.ok(m.layer.x>=m.nav.x-.5&&m.layer.right<=m.nav.right+.5,`${width}×${height} pet stays inside the nav width`);
  assert.ok(m.actor.x>=m.nav.x&&m.actor.right<=m.nav.right,`${width}×${height} actor inside track`);
  assert.deepEqual(m.tabs,[true,true,true,true],`${width}×${height} every tab still receives its tap`);
  assert.equal(m.petTakesInput,false);assert.ok(m.sw<=m.w);
  await page.evaluate(()=>window.USPet.react('reward'));
  assert.equal(await page.evaluate(()=>document.getElementById('usPetLayer').dataset.petState),'react');
  await shot(page,`pet-preview-${width}x${height}`);
  assert.deepEqual(errors,[]);await ctx.close();
 }}finally{await h.close();}
});

test('PET steps aside for the keyboard, sleeps in background and never walks with reduced motion',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  const {page,ctx,errors}=await preview(h,{});
  await page.evaluate(()=>document.body.classList.add('us-keyboard-open'));await page.waitForTimeout(350);
  assert.equal((await geometry(page)).visibility,'hidden');
  assert.deepEqual(await page.evaluate(()=>({blockers:window.USPet.blockers(),running:window.USPet.snapshot().running,react:window.USPet.react('think')})),{blockers:['keyboard'],running:false,react:false});
  await page.evaluate(()=>document.body.classList.remove('us-keyboard-open'));await page.waitForTimeout(350);
  assert.equal((await geometry(page)).visibility,'visible');
  assert.deepEqual(await page.evaluate(()=>({blockers:window.USPet.blockers(),running:window.USPet.snapshot().running,state:window.USPet.snapshot().state})),{blockers:[],running:true,state:'idle'});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await page.evaluate(()=>window.USPet.snapshot().running),false);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await page.evaluate(()=>window.USPet.snapshot().running),true);
  assert.deepEqual(errors,[]);await ctx.close();
  const reduced=await preview(h,{reduced:true});
  const motion=await reduced.page.evaluate(()=>{const a=document.querySelector('.us-pet-actor');return {transition:getComputedStyle(a).transitionDuration,reduced:window.USPet.snapshot().reduced};});
  assert.deepEqual(motion,{transition:'0s',reduced:true});
  const states=new Set();for(let i=0;i<6;i++){states.add(await reduced.page.evaluate(()=>window.USPet.snapshot().state));await reduced.page.waitForTimeout(250);}
  assert.equal(states.has('walk'),false);
  await reduced.ctx.close();
 }finally{await h.close();}
});

test('unlock moment preview: Aurora frame announces its Countdown style (screenshot strategy)',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  const {page,ctx,errors}=await pageFor(h,{});
  await page.evaluate(async()=>{
   const reward={id:'frame_aurora',token:'frame_aurora',category:'frame',level_required:4,title:'Aurora',description:'Un bordo iridescente, sottile, attorno alla foto di Oggi.',unlocked:true,equipped:false};
   window.__QA.rpc.get_progression_v1=async()=>({data:{rewards:[reward],total_xp:900,level:4,preferences:{},pending_unlocks:[reward],rhythm_days:2},error:null});
   await window.USProgression.hydrate({showUnlocks:true,force:true});
  });
  await page.waitForSelector('#usProgressionUnlock.open');await page.waitForTimeout(1500);
  assert.match(await page.locator('#usProgressionUnlockExtra').innerText(),/Stile Countdown «Aurora»/);
  assert.equal(await page.locator('#usProgressionUnlockPlace').innerText(),'Sulla foto di Oggi');
  const card=await page.locator('.us-progression-unlock-card').boundingBox();const vp=page.viewportSize();
  assert.ok(card.y>=0&&card.y+card.height<=vp.height,'card fits the viewport');
  await shot(page,'unlock-frame-aurora-390x844');
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{await h.close();}
});

test('Sintonia collection preview: Countdown styles group with real locks (screenshot strategy)',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  const {page,ctx,errors}=await pageFor(h,{});
  await page.evaluate(async()=>{
   const row=(id,category,level_required,title,unlocked)=>({id,token:id,category,level_required,title,description:'',unlocked,equipped:false});
   const rewards=[row('frame_aurora','frame',4,'Aurora',true),row('ring_orbit','ring',9,'Orbita',true),row('frame_chrome','frame',12,'Cromo',false)];
   window.__QA.rpc.get_progression_v1=async()=>({data:{rewards,total_xp:4000,level:9,preferences:{},pending_unlocks:[],rhythm_days:3},error:null});
   window.go('bond',{nav:true});window.openNoiSection('resonance');
   await window.USProgression.hydrate({showUnlocks:false,force:true});
  });
  await page.waitForSelector('#usProgressionRewards [data-category="countdown"]');
  await page.locator('#usProgressionRewards [data-category="countdown"]').scrollIntoViewIfNeeded();await page.waitForTimeout(400);
  assert.equal(await page.locator('[data-countdown-style-open]').count(),6);
  assert.equal(await page.locator('[data-countdown-style-open][disabled]').count(),1);
  const art=await page.locator('[data-countdown-style-open="orbit"] .us-countdown-art').boundingBox();
  const tile=await page.locator('[data-countdown-style-open="orbit"] .us-progression-reward-preview').boundingBox();
  assert.ok(art.x>=tile.x-1&&art.x+art.width<=tile.x+tile.width+1,'preview art is centered inside its tile');
  await shot(page,'sintonia-countdown-styles-390x844');
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{await h.close();}
});

test('F4/F5 in a real DOM: failed renderer swap keeps the live placeholder; reactions refused before observer delivery',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  const {page,ctx,errors}=await preview(h,{});
  const swap=await page.evaluate(()=>{
   const actor=document.querySelector('#usPetLayer .us-pet-actor');
   const host=actor.firstElementChild,figure=host.querySelector('[data-pet-placeholder]'),html=host.innerHTML;
   window.USPet.registerRenderer({id:'qa-throws',mount(stage){stage.innerHTML='<b>half</b>';stage.dataset.broken='1';throw new Error('qa');}});
   const warn=console.warn;console.warn=()=>{};let ok;try{ok=window.USPet.useRenderer('qa-throws');}finally{console.warn=warn;}
   return {ok,children:actor.children.length,sameHost:actor.firstElementChild===host,sameFigure:host.querySelector('[data-pet-placeholder]')===figure&&figure.isConnected,html:host.innerHTML===html,renderer:document.getElementById('usPetLayer').dataset.petRenderer,stray:!!document.querySelector('[data-broken]')};
  });
  assert.deepEqual(swap,{ok:false,children:1,sameHost:true,sameFigure:true,html:true,renderer:'placeholder',stray:false});
  // preview() ends on a reaction that lasts TIMING.react: start from a settled PET.
  await page.waitForFunction(()=>window.USPet.snapshot().state!=='react');
  const sync=await page.evaluate(()=>{
   // Same synchronous task: the MutationObserver cannot have delivered yet.
   document.body.classList.add('us-keyboard-open');
   const running=window.USPet.snapshot().running;
   const api=window.USPet.react('reward');
   window.dispatchEvent(new CustomEvent('us:pet',{detail:{type:'react',reason:'think'}}));
   const state=window.USPet.snapshot().state;
   return {running,api,state};
  });
  assert.deepEqual(sync,{running:true,api:false,state:'idle'});
  await page.waitForFunction(()=>window.USPet.snapshot().running===false);
  await page.evaluate(()=>document.body.classList.remove('us-keyboard-open'));
  await page.waitForFunction(()=>window.USPet.snapshot().running===true);
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{await h.close();}
});

test('PET stays through notices and the Ti penso arrival, steps aside for exclusive sheets and comes back after navigation',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  const {page,ctx,errors}=await pageFor(h,{});
  const pet=()=>page.evaluate(()=>({vis:getComputedStyle(document.getElementById('usPetLayer')).visibility,blockers:window.USPet.blockers(),running:window.USPet.snapshot().running,inert:document.getElementById('usPetLayer').hasAttribute('inert')}));
  const alive={vis:'visible',blockers:[],running:true,inert:false};
  await page.waitForFunction(()=>window.USPet?.enabled);
  // Offline/online status line and the update bar are notices, not exclusive states.
  await page.evaluate(()=>{const s=document.getElementById('appStatusBar'),u=document.getElementById('appUpdateBar');s.textContent='Sei offline. Riprendo appena torni online.';s.hidden=false;u.hidden=false;document.body.classList.add('us-status-visible','us-update-visible');});
  await page.waitForTimeout(250);assert.deepEqual(await pet(),alive,'status + update bars');
  await page.evaluate(()=>{document.getElementById('appStatusBar').hidden=true;document.getElementById('appUpdateBar').hidden=true;document.body.classList.remove('us-status-visible','us-update-visible');});
  // Ti penso arrival is transient: the PET stays above it.
  await page.evaluate(()=>{usIncomingThink={id:'qa-think',sender_id:'b1',created_at:new Date().toISOString()};window.openThinkArrival();});
  await page.waitForTimeout(300);assert.deepEqual(await pet(),alive,'Ti penso arrival');
  await page.evaluate(()=>window.closeThinkArrival());await page.waitForTimeout(400);
  // Exclusive sheets: the PET steps aside, then returns.
  for(const [name,open,close] of [
   ['countdown',()=>window.USCountdown.open(),()=>window.USCountdown.close()],
   ['calendar',()=>window.openCalendarSurface(),()=>window.closeCalendarSurface()],
   ['left-for-you',()=>window.UsLeftForYou.openComposer(),()=>window.UsLeftForYou.closeComposer()]
  ]){
   await page.evaluate(open);await page.waitForTimeout(350);
   const during=await pet();assert.deepEqual({vis:during.vis,blockers:during.blockers,running:during.running},{vis:'hidden',blockers:['surface'],running:false},name);
   await page.evaluate(close);await page.waitForTimeout(700);
   assert.deepEqual(await pet(),alive,`${name} closed`);
  }
  // Focus Photo is an Oggi state: leaving Oggi gives the PET (and Oggi's widgets) back.
  await page.evaluate(()=>window.toggleOggiFocusPhoto());await page.waitForTimeout(250);
  assert.deepEqual((await pet()).blockers,['focus']);
  await page.click('.nav button[data-page="bond"]');await page.waitForTimeout(350);
  assert.deepEqual(await pet(),alive,'Focus Photo does not follow the user to Noi');
  await page.click('.nav button[data-page="home"]');await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>document.getElementById('usTodayPriorityRegion').hasAttribute('inert')),false,'Oggi widgets are usable again');
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{await h.close();}
});

test('layer ladder: content < nav < notices < Ti penso < PET < every sheet < confirm, auth above sheets',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  const {page,ctx,errors}=await pageFor(h,{});
  const z=await page.evaluate(()=>{const v=q=>Number(getComputedStyle(document.querySelector(q)).zIndex);
   return {nav:v('.nav'),toast:v('#toast'),nudge:v('#usDailyNudge'),status:v('#appStatusBar'),update:v('#appUpdateBar'),think:v('#thinkArrival'),pet:v('#usPetLayer'),
    sheets:['#today','#usCountdownSheet','#usEventsOverlay','#leftForYouOverlay','#leftForYouComposerOverlay','#leftForYouCameraOverlay','#momentViewer','#usMomentComposeOverlay','#usSettingsOverlay','#usCalendarOverlay','#conservatiOverlay','#usAlbumOverlay'].map(q=>[q,v(q)]),
    unlock:v('#usProgressionUnlock'),auth:v('#authOverlay')};});
  assert.ok(z.nav<z.toast&&z.toast<=z.nudge&&z.nudge<=z.status&&z.status===z.update&&z.update<z.think&&z.think<z.pet,JSON.stringify(z));
  for(const [q,value] of z.sheets)assert.ok(value>z.pet,`${q} (${value}) sits above the PET (${z.pet})`);
  assert.ok(z.unlock>z.pet);
  assert.ok(z.sheets.every(([,value])=>z.auth>value),'auth covers any sheet it interrupts');
  const confirmZ=await page.evaluate(()=>{const answer=window.UsUiFoundation.confirm({title:'QA',confirmLabel:'Ok'});const value=Number(getComputedStyle(document.querySelector('.us-confirm')).zIndex);document.querySelector('[data-us-confirm="cancel"]')?.click();return answer.then(()=>value);});
  assert.ok(z.sheets.every(([,value])=>confirmZ>value)&&confirmZ>z.pet,`confirm ${confirmZ}`);
  // No accidental stacking context traps a fixed surface below its rung.
  const trapped=await page.evaluate(()=>['#thinkArrival','#usPetLayer','#today','#usCountdownSheet','#authOverlay','#toast','#usDailyNudge'].filter(q=>{
   for(let p=document.querySelector(q).parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p);if(s.transform!=='none'||s.filter!=='none'||s.isolation==='isolate'||(s.position!=='static'&&s.zIndex!=='auto')||Number(s.opacity)<1)return true;}return false;}));
  assert.deepEqual(trapped,[]);
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{await h.close();}
});
