const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {start,pageFor}=require('./helpers/countdown-browser');
const shots=process.env.US_V6_QA_SHOTS;

test('Daily mobile: centred safe panel, two distinct answers, long text scroll and reopen',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  for(const [width,height] of [[320,568],[390,844],[844,390]]){
   await t.test(`${width}x${height}`,async()=>{
   const v=await pageFor(h,{width,height});const {page,ctx}=v;
   try{
    await page.evaluate(()=>{
     document.documentElement.classList.add('us-native','us-native-android');
     const q=window.todayQuestion;
     window.__QA.rpc.get_or_create_daily_question=async()=>({data:{...q,question:'Quale momento di questa settimana vorresti rivivere insieme?'},error:null});
     window.__QA.rpc.get_daily_state=async()=>({data:{my_answer:'La passeggiata, quando ci siamo raccontati tutto.\n'+ 'Un pensiero lungo. '.repeat(25),partner_has_answer:true,both_answered:true,partner_answer:'La nostra serata: '+ 'Una risposta senza fretta. '.repeat(25)+'x'.repeat(160)},error:null});
     const meta={question_id:q.id,both_answered:true,my_reveal_seen_at:null};
     window.__QA.rpc.get_daily_reveal_meta=async()=>({data:meta,error:null});
     window.__QA.rpc.mark_daily_reveal_seen=async()=>({data:{...meta,my_reveal_seen_at:new Date().toISOString()},error:null});
     document.documentElement.style.setProperty('--us-safe-top','24px');
     document.documentElement.style.setProperty('--us-safe-bottom','20px');
     window.go('quiz',{nav:true});window.openToday();
    });
    await page.waitForSelector('[data-us-daily-answer="partner"]');await page.waitForTimeout(350);
    if(shots){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,`daily-${width}x${height}.png`)});}
    const g=await page.evaluate(()=>{
     const panel=document.querySelector('#today [data-us-modal-panel]'),r=panel.getBoundingClientRect(),s=getComputedStyle(panel);
     return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,scroll:panel.scrollHeight>panel.clientHeight,overflow:getComputedStyle(document.getElementById('today')).overflowY,view:innerHeight,scrollWidth:panel.scrollWidth,clientWidth:panel.clientWidth,
      inputs:[...document.querySelectorAll('#today textarea')].filter(e=>e.getBoundingClientRect().height>0).length,
      reactions:document.querySelectorAll('#today [data-daily-reaction]').length,answers:document.querySelectorAll('[data-us-daily-answer]').length,
      safeHeight:s.maxHeight};
    });
    assert.equal(g.answers,2);assert.equal(g.inputs,0);assert.equal(g.reactions,0);
    assert.ok(g.left>=0&&g.right<=width+.5);assert.ok(g.top>=24&&g.bottom<=height-20,JSON.stringify(g));
    assert.ok(g.scroll,'long answers scroll inside panel');assert.ok(g.scrollWidth<=g.clientWidth+1,'no horizontal overflow');
    assert.equal(g.overflow,'hidden','only the panel scrolls');
    await page.locator('#today [data-us-modal-panel]').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    await page.waitForFunction(()=>document.querySelector('#today [data-us-modal-panel]').scrollTop>0);
    await page.evaluate(()=>window.closeToday());await page.waitForSelector('#today.open',{state:'hidden'});
    await page.evaluate(()=>window.openToday());await page.waitForTimeout(350);
    assert.equal(await page.locator('#today [data-us-modal-panel]').evaluate(el=>el.scrollTop),0);
    await page.evaluate(()=>window.UsNavigation.handleNativeBack());await page.waitForSelector('#today.open',{state:'hidden'});
   }finally{await ctx.close();}
   });
  }
 }finally{await h.close();}
});

test('Daily mobile: waiting, retry, keyboard-height viewport and reduced motion remain usable',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  const {page,ctx}=await pageFor(h,{width:390,height:844,reduced:true});
  try{
   await page.evaluate(()=>window.openToday());await page.waitForSelector('#answer:not([hidden])');
   await page.locator('#answer').fill('Una bozza da conservare');
   await page.setViewportSize({width:390,height:360});
   await page.evaluate(()=>document.documentElement.style.setProperty('--us-viewport-height','360px'));
   await page.waitForTimeout(150);
   assert.equal(await page.locator('#answer').inputValue(),'Una bozza da conservare');
   await page.locator('#todaySaveBtn').scrollIntoViewIfNeeded();assert.equal(await page.locator('#todaySaveBtn').isVisible(),true);
   await page.evaluate(()=>{window.__QA.rpc.get_daily_state=async()=>({data:{my_answer:'Una bozza da conservare',partner_has_answer:false,both_answered:false,partner_answer:null},error:null});return window.hydrateToday();});
   await page.waitForFunction(()=>document.getElementById('locked').textContent.includes('In attesa'));
   await page.evaluate(()=>{window.__QA.rpc.get_daily_state=async()=>{throw new Error('offline');};return window.hydrateToday();});
   assert.equal(await page.locator('#todayRetryBtn').isVisible(),true);
   await page.evaluate(()=>{window.__QA.rpc.get_daily_state=async()=>({data:{my_answer:null,partner_has_answer:false,both_answered:false,partner_answer:null},error:null});});
   await page.locator('#todayRetryBtn').click();await page.waitForFunction(()=>document.getElementById('todayRetryBtn').hidden);
   assert.equal(await page.locator('#answer').isDisabled(),false);
   await page.evaluate(()=>window.closeToday());
   assert.equal(await page.locator('#today').getAttribute('aria-hidden'),'true');
  }finally{await ctx.close();}
 }finally{await h.close();}
});

test('Daily mobile: short reveal shows question, both answers and Conserva with couple names',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  for(const [width,height] of [[320,568],[390,844],[844,390]]){
   const {page,ctx}=await pageFor(h,{width,height});
   try{
    await page.evaluate(()=>{
     document.documentElement.classList.add('us-native','us-native-android');
     const q=window.todayQuestion;
     const profiles=window.__QA.tables.profiles;
     profiles[0].display_name='Giulia';profiles[1].display_name='Marco';
     window.__QA.rpc.get_daily_state=async()=>({data:{my_answer:'Il nostro pranzo insieme.',partner_has_answer:true,both_answered:true,partner_answer:'La passeggiata al tramonto.'},error:null});
     window.__QA.rpc.get_daily_reveal_meta=async()=>({data:{question_id:q.id,both_answered:true,my_reveal_seen_at:'2026-10-09T10:00:00Z'},error:null});
     window.UsCoupleContext.hydrate().then(()=>window.openToday());
    });
    await page.waitForSelector('[data-us-daily-answer="partner"]');await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-us-daily-answer="partner"] b').textContent(),'Marco');
    await page.waitForSelector('[data-us-daily-keep]');
    assert.equal(await page.locator('[data-us-daily-keep]').isEnabled(),true);
    if(shots){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,`daily-short-${width}x${height}.png`)});}
    // On short landscape the existing panel must scroll to the action.
    await page.locator('[data-us-daily-keep]').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('[data-us-daily-keep]').isVisible(),true);
   }finally{await ctx.close();}
  }
 }finally{await h.close();}
});
