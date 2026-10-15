// Round 3 (founder, 2026-10-15: "l'inserimento dei countdown non funziona").
// The real path on a phone (touch): Oggi -> countdown -> Crea countdown -> name ->
// date (both modes) -> Salva e mostra, against a save that applies the rules of
// save_countdown_oggi_v1 (supabase/migrations/20261004231911_countdown_oggi_v1.sql).
const test=require('node:test');const assert=require('node:assert/strict');
const {start,pageFor}=require('./helpers/countdown-browser');

// In-page mirror of the server checks the editor's payload must pass.
function strictSave(){
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const fail=(code,message)=>({data:null,error:{code,message}});
  window.__QA.rpc.save_countdown_oggi_v1=async({next_state:s,expected_version:v})=>{
    const qa=window.__QA,cur=qa.countdown;(qa.saves||=[]).push(structuredClone(s));
    if(cur.version!==v)return fail('40001','countdown_conflict');
    if(!s||!Array.isArray(s.items)||s.items.length>12||typeof s.together_style!=='string'||!('active_id' in s))return fail('22023','countdown_invalid');
    const ids=[];
    for(const e of s.items){
      if(!uuid.test(e.id)||ids.includes(e.id)||typeof e.title!=='string'||e.title.trim().length<1||e.title.length>32||!['days','clock'].includes(e.mode))return fail('22023','countdown_invalid_item');
      ids.push(e.id);
      if(e.mode==='days'&&(!/^\d{4}-\d{2}-\d{2}$/.test(e.target)||e.target<'2000-01-01'||e.target>'2100-12-31'))return fail('P0001','countdown_invalid_date');
      if(e.mode==='clock'&&!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(e.target))return fail('P0001','countdown_invalid_date');
    }
    if(s.active_id!==null&&s.active_id!=='together'&&!ids.includes(s.active_id))return fail('P0001','countdown_invalid_selection');
    const locked={aurora:'frame_aurora',orbit:'ring_orbit',chrome:'frame_chrome'};
    for(const style of [s.together_style,...s.items.map(e=>e.style)]){
      if(!['editorial','signal','glass','aurora','orbit','chrome'].includes(style))return fail('P0001','countdown_invalid_style');
      if(locked[style]&&!qa.unlockedStyles?.includes(style))return fail('42501','countdown_style_locked');
    }
    qa.countdown={items:structuredClone(s.items),active_id:s.active_id,together_style:s.together_style,version:v+1,started_on:cur.started_on};
    return {data:structuredClone(qa.countdown),error:null};
  };
}
const closed=page=>page.waitForFunction(()=>document.getElementById('usCountdownSheet').getAttribute('aria-hidden')==='true');

test('a countdown is added from Oggi on a phone, in both modes, and its payload passes the server rules',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  for(const [width,height] of [[390,844],[360,780]]){
   const {page,ctx,errors}=await pageFor(h,{width,height,unlocked:false,active:'together'});
   await page.evaluate(strictSave);
   // Oggi's countdown opens the list (mockup 032), with "Crea countdown" right there.
   await page.locator('#usCountdownDisplay').tap();
   await page.waitForSelector('#usCountdownCollection:not([hidden])');
   assert.equal(await page.locator('#usCountdownEditor').isHidden(),true,'not straight into the "Insieme da" editor');
   await page.locator('#usCountdownNew').tap();
   await page.waitForSelector('#usCountdownEditor:not([hidden])');
   assert.equal(await page.locator('#usCountdownSave').isDisabled(),false,'Save is never a dead, spinning button');
   assert.equal(await page.locator('#usCountdownSave').getAttribute('aria-busy'),null);
   await page.locator('#usCountdownTitle').tap();await page.keyboard.type('Cena da Marco');
   await page.locator('#usCountdownDate').fill('2027-12-24');
   // Switching the Tempo keeps the day chosen (it used to be wiped, and Save with it).
   await page.locator('[data-countdown-mode="clock"]').tap();
   assert.equal(await page.inputValue('#usCountdownDate'),'2027-12-24T00:00');
   await page.locator('#usCountdownDate').fill('2027-12-24T18:30');
   await page.locator('[data-countdown-mode="days"]').tap();
   assert.equal(await page.inputValue('#usCountdownDate'),'2027-12-24');
   await page.locator('[data-countdown-mode="clock"]').tap();
   assert.equal(await page.inputValue('#usCountdownDate'),'2027-12-24T18:30','the time chosen for that day comes back');
   await page.locator('#usCountdownSave').tap();
   await closed(page);
   const saved=await page.evaluate(()=>({qa:window.__QA.countdown,toast:document.getElementById('toast').innerText,label:document.getElementById('usCountdownDisplay').getAttribute('aria-label')}));
   const item=saved.qa.items.at(-1);
   assert.equal(saved.qa.active_id,item.id,'the new one is on Oggi');
   assert.deepEqual({title:item.title,mode:item.mode,style:item.style},{title:'Cena da Marco',mode:'clock',style:'editorial'});
   assert.equal(item.target,await page.evaluate(()=>new Date('2027-12-24T18:30').toISOString()),'the local time, as an instant');
   assert.match(saved.toast,/Salvato e in Oggi/);assert.match(saved.label,/Cena da Marco/);
   // A days countdown too, with a style chosen in the editor.
   await page.locator('#usCountdownDisplay').tap();await page.locator('#usCountdownNew').tap();
   await page.locator('#usCountdownTitle').fill('La laurea');await page.locator('#usCountdownDate').fill('2027-11-27');
   await page.locator('[data-countdown-style-pick="signal"]').tap();
   await page.locator('#usCountdownSave').tap();await closed(page);
   const days=await page.evaluate(()=>window.__QA.countdown.items.at(-1));
   assert.deepEqual({mode:days.mode,target:days.target,style:days.style},{mode:'days',target:'2027-11-27',style:'signal'});
   assert.equal((await page.evaluate(()=>window.__QA.saves)).length,2,'no rejected or extra writes');
   assert.deepEqual(errors,[]);await ctx.close();
  }
 }finally{await h.close();}
});

test('the "Insieme da" editor says why it has no fields and offers the styles (mockup 033)',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  const {page,ctx,errors}=await pageFor(h,{active:'together',unlocked:true});
  await page.evaluate(strictSave);await page.evaluate(()=>{window.__QA.unlockedStyles=['aurora','orbit','chrome'];});
  await page.click('#usCountdownDisplay');await page.click('[data-countdown-edit="together"]');
  assert.equal(await page.locator('#usCountdownHeading').innerText(),'Modifica countdown');
  assert.equal(await page.locator('#usCountdownTogetherNote').isVisible(),true);
  assert.equal(await page.locator('#usCountdownFields').isHidden(),true);
  assert.equal(await page.locator('#usCountdownStyles .is-locked').count(),0,'unlocked styles are offered');
  assert.equal(await page.locator('[data-countdown-style-pick="aurora"] small').innerText(),'Sbloccato');
  await page.click('[data-countdown-style-pick="aurora"]');await page.click('#usCountdownSave');await closed(page);
  assert.deepEqual(await page.evaluate(()=>({style:window.__QA.countdown.together_style,active:window.__QA.countdown.active_id})),{style:'aurora',active:'together'});
  assert.equal(await page.locator('#usCountdownDisplay .us-countdown-art').getAttribute('data-countdown-style'),'aurora');
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{await h.close();}
});
