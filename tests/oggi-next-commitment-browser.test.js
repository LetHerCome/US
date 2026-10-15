// Round 3 (founder, 2026-10-15): a commitment added for tomorrow in the Noi
// calendar shows on Oggi as the mockup does ("Domani, 21:00 · Cena da Marco"),
// at once, follows a delete, includes the partner's commitments, and a tap
// opens it in the Noi calendar.
const test=require('node:test');const assert=require('node:assert/strict');
const {start,pageFor}=require('./helpers/countdown-browser');

const pill=page=>page.evaluate(()=>{const b=document.getElementById('usOggiNext');return {hidden:b.hidden,when:document.getElementById('usOggiNextWhen').textContent,title:document.getElementById('usOggiNextTitle').textContent,kind:b.dataset.usNextKind,label:b.getAttribute('aria-label')};});

test('a commitment for tomorrow added in Noi is Oggi\'s next one, refreshed after add, delete and the way back',async t=>{
 const h=await start();if(!h)return t.skip('Playwright unavailable');
 try{
  const {page,ctx,errors}=await pageFor(h);
  await page.evaluate(()=>{window.__QA.persistWrites=true;});
  assert.equal((await pill(page)).hidden,true,'nothing within two days yet (the only event is 12 days away)');
  const tomorrow=await page.evaluate(()=>{const d=new Date();d.setDate(d.getDate()+1);return d.toLocaleDateString('en-CA');});
  // Noi -> tomorrow -> + -> "Cena da Marco", 21:00-23:30 -> Salva impegno.
  await page.locator('.nav button:has-text("Noi")').first().tap();await page.waitForTimeout(900);
  await page.locator(`[data-noi-day="${tomorrow}"]`).first().tap();
  await page.locator('[data-noi-add]').first().tap();
  await page.waitForSelector('#usCalendarTitleInput',{state:'visible'});
  await page.locator('#usCalendarTitleInput').fill('Cena da Marco');
  await page.locator('#usCalendarStartTimeInput').fill('21:00');await page.locator('#usCalendarEndTimeInput').fill('23:30');
  await page.locator('#usCalendarFormSave').tap();
  await page.waitForFunction(()=>document.getElementById('usOggiNextTitle').textContent==='Cena da Marco');
  assert.deepEqual(await pill(page),{hidden:false,when:'Domani, 21:00',title:'Cena da Marco',kind:'calendar',label:'Prossimo impegno: Domani alle 21:00, Cena da Marco. Apri Noi'});
  await page.locator('.nav button:has-text("Oggi")').first().tap();
  // The page change (Due colori flood) ignores navigation until it ends, as the mockup does.
  await page.waitForFunction(()=>document.querySelector('.page.active')?.id==='home'&&!window.UsDueColori?.isFlooding?.());
  assert.equal(await page.locator('#usOggiNext').isVisible(),true);
  // A tap opens it in the Noi calendar; deleting it there takes it off Oggi.
  await page.locator('#usOggiNext').tap();
  await page.waitForFunction(()=>document.getElementById('usCalendarDetailSheet')?.getAttribute('aria-hidden')==='false');
  await page.waitForFunction(()=>document.querySelector('.page.active')?.id==='bond',null,{timeout:5000});
  assert.equal(await page.locator('#usCalendarDetailTitle').innerText(),'Cena da Marco');
  await page.locator('#usCalendarDetailDelete').tap();await page.locator('[data-us-confirm="ok"]').tap();
  await page.waitForFunction(()=>document.getElementById('usOggiNext').hidden);
  // The partner's commitments count too; returning to Oggi reads them.
  await page.evaluate(day=>{const [y,m,d]=day.split('-').map(Number);window.__QA.tables.calendar_entries.push({id:'c0ffee00-0000-4000-8000-000000000002',couple_id:'c1',entry_type:'personal',owner_id:'b1',created_by:'b1',title:'Lezione di yoga',is_all_day:false,starts_at:new Date(y,m-1,d,19,0).toISOString(),ends_at:new Date(y,m-1,d,20,0).toISOString(),start_date:null,end_date:null,visibility:'full'});},tomorrow);
  await page.locator('.nav button:has-text("Oggi")').first().tap();
  await page.waitForFunction(()=>document.getElementById('usOggiNextTitle').textContent==='Lezione di yoga');
  assert.equal((await pill(page)).when,'Domani, 19:00');
  assert.deepEqual(errors,[]);await ctx.close();
 }finally{await h.close();}
});
