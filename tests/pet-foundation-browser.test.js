const test=require('node:test');const assert=require('node:assert/strict');
const {start,pageFor}=require('./helpers/countdown-browser');
const fs=require('node:fs');const path=require('node:path');
const output=process.env.PET_SCREENSHOTS;
async function shot(page,name){if(!output)return;fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,`${name}.png`)});}
async function preview(h,options){
 const view=await pageFor(h,options);
 await view.page.goto(h.base+'/?us-dev=1&us-pet=preview',{waitUntil:'load'});
 await view.page.waitForFunction(()=>window.USPet?.enabled&&document.getElementById('usPetLayer').dataset.petState);
 // The Daily nudge is transient (6.5 s) and owns the space above the nav while shown.
 await view.page.evaluate(()=>{document.getElementById('usDailyNudge').hidden=false;});await view.page.waitForTimeout(300);
 assert.equal(await view.page.evaluate(()=>getComputedStyle(document.getElementById('usPetLayer')).visibility),'hidden');
 await view.page.evaluate(()=>{document.getElementById('usDailyNudge').hidden=true;document.documentElement.style.setProperty('--us-safe-bottom','20px');window.dispatchEvent(new Event('resize'));});
 await view.page.waitForTimeout(400);
 return view;
}
const geometry=page=>page.evaluate(()=>{
 const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
 const nav=document.querySelector('.nav'),layer=document.getElementById('usPetLayer'),actor=layer.querySelector('.us-pet-actor');
 const tabs=[...nav.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return b.contains(hit);});
 const a=actor.getBoundingClientRect();const onPet=document.elementFromPoint(a.x+a.width/2,a.y+a.height/2);
 return {nav:box(nav),layer:box(layer),actor:box(actor),tabs,petTakesInput:Boolean(onPet&&layer.contains(onPet)),visibility:getComputedStyle(layer).visibility,sw:document.scrollingElement.scrollWidth,w:innerWidth};
});

test('PET is unmounted without an approved asset or an explicit preview',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  const {page,ctx,errors}=await pageFor(h,{});
  assert.equal(await page.evaluate(()=>window.USPet.enabled),false);
  assert.equal(await page.locator('#usPetLayer').isHidden(),true);
  assert.equal(await page.evaluate(()=>document.querySelector('#usPetLayer .us-pet-actor').innerHTML),'');
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
  await page.evaluate(()=>document.body.classList.remove('us-keyboard-open'));await page.waitForTimeout(350);
  assert.equal((await geometry(page)).visibility,'visible');
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
