const test=require('node:test');
const assert=require('node:assert/strict');
const {start,pageFor}=require('./helpers/countdown-browser');
for(const [width,height] of [[320,568],[390,844],[844,390]]){
  test(`D5 real UI identity switch and escaping ${width}x${height}`,async t=>{
    const h=await start();if(!h)return t.skip('Playwright unavailable');
    try{
      const {page,ctx,errors}=await pageFor(h,{width,height});
      await page.waitForFunction(()=>window.UsIdentity?.current().partnerName==='Beatrice');
      await page.evaluate(async()=>{
        await window.hydrateUsSettings();
        window.todayState={both_answered:true,my_answer:'Private A',partner_answer:'Private B'};
        window.todayQuestion={id:'daily-old',question:'Old question'};
      });
      await page.evaluate(async()=>{
        window.__QA.rpc.get_game_session=async()=>({data:{id:'s1',my_complete:true,reveal_ready:false,items:[]},error:null});
        await window.USGameV2.openSession('s1');
      });
      assert.match(await page.locator('#usGameV2Panel').innerHTML(),/Beatrice/);
      await page.evaluate(async()=>{
        const members=[{id:'f1',couple_id:'c2',role:'beatrice',display_name:'Sam'},{id:'b1',couple_id:'c2',role:'francesco',display_name:'Alex'}];
        window.UsCoupleContext.clear();window.usProfile=members[0];window.__QA.tables.profiles=members;window.__QA.tables.couples=[{id:'c2',started_on:'2025-01-01'}];
        await window.UsCoupleContext.hydrate();window.go('bond');
      });
      assert.equal(await page.locator('[data-noi-couple-name="francesco"]').innerText(),'Alex');
      assert.equal(await page.locator('[data-noi-couple-name="beatrice"]').innerText(),'Sam');
      assert.equal(await page.locator('#usGameV2Panel').innerHTML(),'');
      assert.equal(await page.evaluate(()=>window.todayState),null);
      assert.doesNotMatch(await page.locator('#usCoupleAvatars').innerHTML(),/Francesco|Beatrice/);
      assert.doesNotMatch(await page.locator('body').innerText(),/Francesco|Beatrice|\bBea\b/);
      await page.evaluate(async()=>{
        window.__QA.tables.profiles[0].display_name='<img src=x onerror="window.__injected=1">';
        await window.UsCoupleContext.hydrate();
      });
      assert.match(await page.locator('[data-noi-couple-name="beatrice"]').innerText(),/^<img/);
      assert.equal(await page.evaluate(()=>window.__injected),undefined);
      await page.evaluate(()=>{window.usProfile=null;window.UsCoupleContext.clear();});
      assert.equal(await page.locator('#noiCouple').getAttribute('aria-label'),'Voi due');
      assert.doesNotMatch(await page.locator('body').innerText(),/Alex|Sam|<img/);
      assert.deepEqual(errors,[]);
      await ctx.close();
    }finally{await h.close();}
  });
}
