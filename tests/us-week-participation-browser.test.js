const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {start,pageFor}=require('./helpers/countdown-browser');
const ROOT=path.resolve(__dirname,'..');
const BASE='b0c9f82d7830f13a0310016067e36da961855d23';
const shots=process.env.US_WEEK_QA_SHOTS;
async function settleWeek(page){
 // Let the real transient nudge expire; do not hide product UI with injected CSS.
 await page.waitForSelector('#usDailyNudge',{state:'hidden',timeout:12000});
 await page.locator('.us-gv4-week').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
 await page.waitForTimeout(350);
}
async function fixture(page){
 await page.evaluate(()=>{
  const home={per_voi:{state:'idle'},open_rounds:[],recent:[],weekly:null,allowance:{used:1,limit:3,free_used:1,free_limit:2,families:{}}};
  window.__QA.week={week_start:'2026-10-05',week_end:'2026-10-11',today:'2026-10-09',timezone:'Europe/Rome',completed_days:1,weekly_xp_awarded:32,
   days:Array.from({length:7},(_,i)=>({date:`2026-10-${String(i+5).padStart(2,'0')}`,daily_complete:i===0||i===2,game_complete:i===2||i===4,complete:i===2,status:i===2?'complete':i===3?'unverifiable':'incomplete'}))};
  window.__QA.rpc.get_game_v2_home=async()=>({data:home,error:null});
  window.__QA.rpc.get_couple_week_participation_v1=async()=>window.__QA.weekError?{data:null,error:{code:'PGRST202',message:'offline/unavailable'}}:{data:structuredClone(window.__QA.week),error:null};
  document.documentElement.classList.add('us-native','us-native-android');
  document.documentElement.style.setProperty('--us-safe-top','24px');document.documentElement.style.setProperty('--us-safe-bottom','20px');
  window.go('quiz',{nav:true});return window.USGameV2.load();
 });
}
test('week rail mobile: before/after, server checks/count/XP, incomplete and unverifiable states, all three viewports',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{for(const [width,height] of [[320,568],[390,844],[844,390]])await t.test(`${width}x${height}`,async()=>{
  const {page,ctx,errors}=await pageFor(h,{width,height,reduced:true});
  try{
   if(shots){
    for(const file of ['games.js','games.css'])await page.route(`**/${file}*`,route=>route.fulfill({contentType:file.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8',body:execFileSync('git',['show',`${BASE}:${file}`],{cwd:ROOT})}));
    await page.reload({waitUntil:'load'});await page.waitForFunction(()=>window.usProfile&&window.USGameV2);await fixture(page);
    await settleWeek(page);fs.mkdirSync(path.join(shots,'before'),{recursive:true});await page.screenshot({path:path.join(shots,'before',`week-${width}x${height}.png`)});
    for(const file of ['games.js','games.css'])await page.unroute(`**/${file}*`);
    await page.reload({waitUntil:'load'});await page.waitForFunction(()=>window.usProfile&&window.USGameV2);
   }
   await fixture(page);await page.waitForSelector('[data-gv2-week][data-state="ready"]');
   assert.equal(await page.locator('.us-gv4-day').count(),7);assert.equal(await page.locator('.us-gv4-day.is-complete').count(),1);
   assert.match(await page.locator('.us-gv4-week').innerText(),/1 di 7 giornate complete/);assert.match(await page.locator('.us-gv4-week').innerText(),/32 XP questa settimana/);
   assert.equal(await page.locator('.us-gv4-day[data-date="2026-10-05"]').getAttribute('data-state'),'incomplete');
   assert.equal(await page.locator('.us-gv4-day[data-date="2026-10-08"]').getAttribute('data-state'),'unverifiable');
   assert.equal(await page.locator('.us-gv4-day[aria-current="date"]').getAttribute('data-date'),'2026-10-09');
   await settleWeek(page);
   const geometry=await page.locator('.us-gv4-week').evaluate(el=>{const r=el.getBoundingClientRect(),summary=el.querySelector('.us-gv4-week-summary'),s=summary.getBoundingClientRect(),nav=document.querySelector('.nav').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,navTop:nav.top,summaryVisible:summary.contains(document.elementFromPoint(s.left+s.width/2,s.top+s.height/2)),scroll:document.documentElement.scrollWidth,width:innerWidth};});
   assert.ok(geometry.left>=0&&geometry.right<=width+1,JSON.stringify(geometry));assert.ok(geometry.scroll<=geometry.width+1);
   assert.ok(geometry.top>=24&&geometry.bottom<geometry.navTop,JSON.stringify(geometry));assert.equal(geometry.summaryVisible,true,'ledger XP summary is visible and unobstructed');
   if(shots){fs.mkdirSync(path.join(shots,'after'),{recursive:true});await page.screenshot({path:path.join(shots,'after',`week-${width}x${height}.png`)});}
   await page.evaluate(()=>{window.__QA.weekError=true;return window.USGameV2.refreshParticipation();});
   assert.equal(await page.locator('.us-gv4-day').count(),0);assert.match(await page.locator('.us-gv4-week').innerText(),/Settimana non disponibile/);
   const retry=page.locator('[data-gv2-action="week-retry"]');await retry.scrollIntoViewIfNeeded();assert.ok((await retry.boundingBox()).height>=44);
   await page.evaluate(()=>{window.__QA.weekError=false;});await retry.click();await page.waitForSelector('.us-gv4-day.is-complete');
   await page.evaluate(()=>window.openToday());await page.waitForSelector('#today.open');
   await page.evaluate(()=>window.UsNavigation.handleNativeBack());await page.waitForSelector('#today.open',{state:'hidden'});
   assert.deepEqual(errors,[]);
  }finally{await ctx.close();}
 });}finally{await h.close();}
});
