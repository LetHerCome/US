const test=require('node:test');const assert=require('node:assert/strict');
const {start,pageFor}=require('./helpers/countdown-browser');
const fs=require('node:fs');const path=require('node:path');
const output=process.env.COUNTDOWN_SCREENSHOTS;
test('countdown and daily question never overlap at base viewports, all styles and both time formats',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{for(const [width,height] of [[320,568],[390,844],[844,390]])for(const style of ['editorial','signal','glass','aurora','orbit','chrome']){
  const {page,ctx,errors}=await pageFor(h,{width,height,style,mode:style==='signal'?'clock':'days'});
  await page.evaluate(()=>{document.documentElement.style.setProperty('--us-safe-top','24px');document.documentElement.style.setProperty('--us-safe-bottom','20px');});
  await page.waitForSelector('#usCountdownDisplay:not([hidden])');
  const m=await page.evaluate(()=>{
   const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
   const visible=e=>!e.hidden&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
   return {count:box(document.getElementById('usCountdownDisplay')),number:box(document.querySelector('#usCountdownDisplay .us-countdown-number')),stack:box(document.getElementById('usOggiStack')),top:box(document.querySelector('.top')),nav:box(document.querySelector('.nav')),surfaces:[...document.querySelectorAll('#usOggiStack > *')].filter(visible).map(box),sw:document.scrollingElement.scrollWidth,sh:document.scrollingElement.scrollHeight,w:innerWidth,h:innerHeight};
  });
  const overlap=(a,b)=>a.x<b.right-.5&&b.x<a.right-.5&&a.y<b.bottom-.5&&b.y<a.bottom-.5;
  assert.ok(m.count.y-m.top.bottom>=8&&m.count.y-m.top.bottom<=32,`${width}×${height} ${style} must sit immediately below top bar: ${JSON.stringify(m)}`);
  assert.equal(overlap(m.count,m.stack),false,`${width}×${height} ${style} collision ${JSON.stringify(m)}`);
  for(const b of [m.count,...m.surfaces]){assert.ok(b.y>=m.top.bottom-.5&&b.bottom<=m.nav.y+.5,`${style} outside chrome ${JSON.stringify(m)}`);assert.ok(b.x>=0&&b.right<=width+.5,`${style} horizontal overflow`);}
  assert.ok(m.number.x>=0&&m.number.right<=width+.5);assert.ok(m.sh<=m.h);assert.ok(m.sw<=m.w);assert.deepEqual(errors,[]);
  if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,`${style}-${width}x${height}.png`)});if(style==='editorial'&&width===390){await page.evaluate(()=>{document.getElementById('usCountdownDisplay').hidden=true;document.getElementById('homeHero').removeAttribute('data-us-countdown');});await page.screenshot({path:path.join(output,'before-390x844.png')});}}
  await ctx.close();
 }}finally{await h.close();}
});
test('shared editor creates, edits, selects, hides and deletes without lost or fake successful writes',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  const {page,ctx,errors}=await pageFor(h,{unlocked:false});
  await page.click('#usCountdownDisplay');await page.click('#usCountdownBack');await page.click('#usCountdownNew');
  await page.fill('#usCountdownDate','2027-12-24');assert.equal(await page.locator('#usCountdownSave').isDisabled(),true,'a valid date must not enable an empty title');
  await page.fill('#usCountdownTitle','   ');assert.equal(await page.locator('#usCountdownSave').isDisabled(),true,'whitespace is not a title');
  await page.fill('#usCountdownTitle','La nostra cena');
  assert.equal(await page.locator('#usCountdownStyles').count(),0,'style selection lives only in the Sintonia collection');
  assert.equal(await page.locator('[data-countdown-pick]').count(),0,'editor has no duplicate cosmetic picker');
  await page.click('#usCountdownSave');
  await page.waitForSelector('#usCountdownCollection:not([hidden])');assert.equal(await page.locator('#usCountdownList [data-countdown-select]').count(),3);
  await page.click('#usCountdownHide');await page.waitForSelector('#usCountdownDisplay[hidden]',{state:'attached'});
  await page.click('[data-countdown-select="together"]');await page.waitForSelector('#usCountdownDisplay:not([hidden])');assert.match(await page.locator('#usCountdownDisplay').getAttribute('aria-label'),/Insieme da/);
  await page.click('#usCountdownList .us-countdown-row:last-child [data-countdown-edit]');await page.fill('#usCountdownTitle','La cena per due');
  await page.evaluate(()=>window.__QA.saveError='offline');await page.click('#usCountdownSave');assert.match(await page.locator('#usCountdownStatus').innerText(),/Non salvato/);assert.equal(await page.locator('#usCountdownTitle').inputValue(),'La cena per due');
  await page.evaluate(()=>{window.__QA.saveError=null;window.__QA.countdown.version++;});await page.click('#usCountdownSave');assert.match(await page.locator('#usCountdownStatus').innerText(),/altro telefono/);
  await page.click('#usCountdownSave');await page.waitForSelector('#usCountdownCollection:not([hidden])');assert.match(await page.locator('#usCountdownList').innerText(),/La cena per due/);
  await page.click('#usCountdownList .us-countdown-row:last-child [data-countdown-edit]');await page.click('#usCountdownDelete');await page.click('[data-us-confirm="ok"]');await page.waitForSelector('#usCountdownCollection:not([hidden])');assert.equal(await page.locator('#usCountdownList [data-countdown-select]').count(),2);
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{await h.close();}
});
test('unavailable backend retries are throttled',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  const missing=await pageFor(h,{missing:true});const reads=await missing.page.evaluate(()=>window.__QA.readCalls);await missing.page.waitForTimeout(2300);assert.equal(await missing.page.evaluate(()=>window.__QA.readCalls),reads,'failed background reads must wait at least a minute');await missing.ctx.close();
 }finally{await h.close();}
});
test('ownership switch during a slow save restores fields for the next identity',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  const {page,ctx}=await pageFor(h);await page.click('#usCountdownDisplay');await page.click('#usCountdownBack');await page.click('#usCountdownNew');await page.fill('#usCountdownTitle','Prima coppia');await page.fill('#usCountdownDate','2027-12-24');
  await page.evaluate(()=>window.__QA.saveDelay=1800);await page.click('#usCountdownSave');assert.equal(await page.locator('#usCountdownTitle').isDisabled(),true);
  await page.evaluate(()=>{window.usProfile={id:'new-user',couple_id:'new-couple',role:'francesco'};});await page.waitForTimeout(2200);
  await page.evaluate(()=>window.USCountdown.open());await page.click('#usCountdownNew');
  for(const id of ['usCountdownTitle','usCountdownMode','usCountdownDate'])assert.equal(await page.locator('#'+id).isDisabled(),false,`${id} stays usable after owner reset`);
  await ctx.close();
 }finally{await h.close();}
});
test('editing a DST fold instant preserves its exact target and saving locks the form',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  const {page,ctx}=await pageFor(h,{mode:'clock'});
  await page.evaluate(()=>{const s=window.__QA.countdown;s.items[0].target='2026-10-25T01:30:37.000Z';return window.USCountdown.refresh();});
  await page.click('#usCountdownDisplay');await page.fill('#usCountdownTitle','Un nuovo titolo');await page.click('#usCountdownSave');await page.waitForSelector('#usCountdownCollection:not([hidden])');
  assert.equal(await page.evaluate(()=>window.__QA.countdown.items[0].target),'2026-10-25T01:30:37.000Z','title/style-only edits preserve both fold offset and seconds');
  await page.click('#usCountdownList .us-countdown-row:last-child [data-countdown-edit]');await page.fill('#usCountdownTitle','Ultima modifica');await page.evaluate(()=>window.__QA.saveDelay=800);await page.click('#usCountdownSave');
  assert.equal(await page.locator('#usCountdownTitle').isDisabled(),true,'typing must not silently change the draft after its payload was sent');assert.equal(await page.locator('#usCountdownMode').isDisabled(),true);assert.equal(await page.locator('#usCountdownDate').isDisabled(),true);
  await page.waitForSelector('#usCountdownCollection:not([hidden])');
  await ctx.close();
 }finally{await h.close();}
});

test('reduced motion, keyboard, focus return, back navigation, missing backend and logout isolation',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  const {page,ctx}=await pageFor(h,{reduced:true,style:'orbit'});
  assert.equal(await page.locator('#usCountdownDisplay .us-countdown-art').evaluate(e=>getComputedStyle(e,'::after').animationName),'none');
  await page.click('#usCountdownDisplay');await page.click('#usCountdownBack');await page.click('#usCountdownNew');await page.fill('#usCountdownTitle','Con te');
  await page.setViewportSize({width:390,height:420});await page.fill('#usCountdownDate','2027-02-14');await page.locator('#usCountdownSave').scrollIntoViewIfNeeded();assert.equal(await page.locator('#usCountdownSave').isVisible(),true);
  await page.click('[data-countdown-close][data-us-modal-close]');await page.waitForFunction(()=>document.getElementById('usCountdownSheet').getAttribute('aria-hidden')==='true');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'usCountdownDisplay');
  await page.click('#usCountdownDisplay');await page.goBack();await page.waitForFunction(()=>!document.getElementById('usCountdownSheet').classList.contains('open'));
  await page.evaluate(()=>window.toggleOggiFocusPhoto());assert.equal(await page.locator('#usCountdownDisplay').getAttribute('inert'),'');await page.evaluate(()=>window.toggleOggiFocusPhoto());
  await page.evaluate(()=>{window.__QA.readDelay=700;window.USCountdown.refresh();window.usProfile=null;});await page.waitForTimeout(1300);assert.equal(await page.locator('#usCountdownDisplay').isHidden(),true);assert.equal(await page.locator('#usCountdownSheet').getAttribute('aria-hidden'),'true');
  await ctx.close();
  const missing=await pageFor(h,{missing:true});await missing.page.evaluate(()=>window.USCountdown.open());assert.match(await missing.page.locator('#usCountdownStatus').innerText(),/non disponibile/);assert.equal(await missing.page.locator('#usCountdownNew').isDisabled(),true);await missing.ctx.close();
 }finally{await h.close();}
});

test('unselected, automatic relationship, empty photo, long titles and safe areas keep Oggi clear',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{for(const [width,height] of [[320,568],[390,844],[844,390]]){
  const {page,ctx}=await pageFor(h,{width,height,active:'together',style:'glass',started:'1900-01-01'});
  await page.evaluate(()=>{const css=document.documentElement.style;css.setProperty('--us-safe-top','24px');css.setProperty('--us-safe-bottom','20px');window.__QA.tables.couple_locations=[{couple_id:'c1',user_id:'f1',latitude:41.9,longitude:12.5,accuracy:30,updated_at:new Date().toISOString()},{couple_id:'c1',user_id:'b1',latitude:45.46,longitude:9.19,accuracy:30,updated_at:new Date().toISOString()}];});
  await page.evaluate(()=>window.hydrateDistance?.());await page.waitForTimeout(120);
  const clear=()=>page.evaluate(()=>{
   const visible=e=>e&&!e.hidden&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden';
   const ids=['usCountdownDisplay','distanceWidget','usDailyRitual','usOggiCalendarWidget','homeEmptyState'];
   const list=ids.map(id=>document.getElementById(id)).filter(visible).map(e=>({id:e.id,r:e.getBoundingClientRect().toJSON()}));
   const collisions=[];for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){const a=list[i],b=list[j];if(a.r.left<b.r.right-.5&&b.r.left<a.r.right-.5&&a.r.top<b.r.bottom-.5&&b.r.top<a.r.bottom-.5)collisions.push(`${a.id}/${b.id}`);}return {collisions,width:document.scrollingElement.scrollWidth,height:document.scrollingElement.scrollHeight,w:innerWidth,h:innerHeight};
  });
  let m=await clear();assert.deepEqual(m.collisions,[],`${width} together ${JSON.stringify(m)}`);assert.ok(m.width<=m.w&&m.height<=m.h);
  await page.evaluate(()=>{window.__QA.countdown.active_id=null;return window.USCountdown.refresh();});m=await clear();assert.deepEqual(m.collisions,[],`${width} none`);
  await page.evaluate(()=>{const s=window.__QA.countdown;s.active_id=s.items[0].id;s.items[0].title='x'.repeat(32);return window.USCountdown.refresh();});m=await clear();assert.deepEqual(m.collisions,[],`${width} title`);assert.ok(m.width<=m.w);
  await page.evaluate(()=>{document.getElementById('homeHero').classList.add('is-empty');document.getElementById('homeEmptyState').hidden=false;});await page.waitForTimeout(1100);assert.equal(await page.locator('#usCountdownDisplay').isHidden(),true);
  m=await clear();assert.deepEqual(m.collisions,[],`${width} empty photo`);
  await ctx.close();
 }}finally{await h.close();}
});

test('a slow Countdown answer never replaces a new countdown or edits the user already started',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  const {page,ctx,errors}=await pageFor(h);
  // Opened from the Oggi countdown (active editor) while the read is still in flight.
  await page.evaluate(()=>window.__QA.readDelay=1200);
  await page.click('#usCountdownDisplay');await page.click('#usCountdownBack');await page.click('#usCountdownNew');
  await page.fill('#usCountdownTitle','Nuovo viaggio');await page.fill('#usCountdownDate','2027-03-01');
  await page.waitForTimeout(1400); // the 1.2 s read has answered
  assert.deepEqual(await page.evaluate(()=>({title:document.getElementById('usCountdownTitle').value,date:document.getElementById('usCountdownDate').value,heading:document.getElementById('usCountdownEditorHeading').textContent})),
   {title:'Nuovo viaggio',date:'2027-03-01',heading:'Un momento da aspettare'},'the new draft survives the late answer');
  await page.click('#usCountdownSave');await page.waitForSelector('#usCountdownCollection:not([hidden])');
  assert.deepEqual(await page.evaluate(()=>window.__QA.countdown.items.map(i=>i.title)),['Il nostro viaggio','Nuovo viaggio']);
  // Editing the active one: typing before the answer arrives is kept and saved.
  await page.click('[data-countdown-close][data-us-modal-close]');await page.waitForFunction(()=>document.getElementById('usCountdownSheet').getAttribute('aria-hidden')==='true');
  await page.click('#usCountdownDisplay');await page.fill('#usCountdownTitle','La cena per due');await page.waitForTimeout(1500);
  assert.equal(await page.inputValue('#usCountdownTitle'),'La cena per due');
  await page.click('#usCountdownSave');await page.waitForSelector('#usCountdownCollection:not([hidden])');
  assert.equal(await page.evaluate(()=>window.__QA.countdown.items.find(i=>i.id===window.__QA.countdown.active_id).title),'La cena per due');
  // Untouched, the same editor still follows the fresh state (partner edit).
  await page.evaluate(()=>{window.__QA.countdown.items[0].title='Cambiato da Beatrice';window.__QA.countdown.active_id=window.__QA.countdown.items[0].id;window.__QA.countdown.version++;});
  await page.click('[data-countdown-close][data-us-modal-close]');await page.waitForFunction(()=>document.getElementById('usCountdownSheet').getAttribute('aria-hidden')==='true');
  await page.evaluate(()=>window.USCountdown.open('active'));await page.waitForTimeout(1500);
  assert.equal(await page.inputValue('#usCountdownTitle'),'Cambiato da Beatrice');
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{await h.close();}
});

test('a date picker that only reports "change" still enables Save (iOS/Android native pickers)',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  const {page,ctx,errors}=await pageFor(h);
  await page.evaluate(()=>window.USCountdown.open());await page.click('#usCountdownNew');
  await page.fill('#usCountdownTitle','Il concerto');
  assert.equal(await page.locator('#usCountdownSave').isDisabled(),true);
  await page.evaluate(()=>{const input=document.getElementById('usCountdownDate');input.value='2027-05-20';input.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await page.locator('#usCountdownSave').isDisabled(),false);
  await page.click('#usCountdownSave');await page.waitForSelector('#usCountdownCollection:not([hidden])');
  assert.equal(await page.evaluate(()=>window.__QA.countdown.items.at(-1).target),'2027-05-20');
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{await h.close();}
});
