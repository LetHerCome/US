const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const games=read('games.js'),app=read('app.js'),cal=read('calendar.js'),noi=read('noi-v2.js');

test('game reveal: exact revealed choices are equal/different, never free-text guesses',()=>{
 const a=games.indexOf('function revealKind(item){'),b=games.indexOf('\nfunction revealCompactItem',a);
 assert.ok(a>=0&&b>a);
 const box={};vm.runInNewContext(games.slice(a,b)+';this.revealKind=revealKind;',box);
 const kind=box.revealKind;
 assert.equal(kind({answer_kind:'choice',my_answer_index:0,partner_answer_index:0}),'same');
 assert.equal(kind({answer_kind:'choice',my_answer_index:0,partner_answer_index:1}),'different');
 assert.equal(kind({answer_kind:'choice',my_answer_index:0,partner_answer_index:null}),'open');
 assert.equal(kind({answer_kind:'open',my_answer_text:'Same',partner_answer_text:'Same'}),'open');
 assert.equal(kind({mechanic:'prediction',prediction_matched:true}),'same');
 assert.equal(kind({mechanic:'prediction',prediction_matched:false}),'different');
 assert.equal(kind({mechanic:'prediction',prediction_matched:null}),'open');
 assert.match(games,/data-gv5-group=/);
 assert.match(games,/mark_game_session_reveal_seen/);
 assert.doesNotMatch(games.slice(games.indexOf('function renderCompactReveal'),games.indexOf('const WEEKLY_MORPH_MS')),/us-gv2-reveal-card|us-gv2-swipe-reveal-card/);
});
test('daily reveal: question and two answers only; no comments/reactions or duplicate input', async()=>{
 const {installToday}=require('./helpers/m10-2-harness.js');
 const text=app.slice(app.indexOf('function renderTodayReveal(){'),app.indexOf('// "Visto" = il reveal'));
 assert.match(text,/data-us-daily-answer="mine"/);
 assert.match(text,/data-us-daily-answer="partner"/);
 assert.doesNotMatch(text,/data-daily-reaction|today-reactions|today-outcome/);
 const t=installToday();await t.hydrate();
 assert.match(t.nodes.todayReveal.innerHTML,/data-us-daily-answer="partner"/);
 assert.doesNotMatch(t.nodes.todayReveal.innerHTML,/data-daily-reaction|ha reagito|Parlatene insieme/);
 assert.equal(t.nodes.answer.hidden,true);
 assert.equal(t.nodes.todaySaveBtn.hidden,true);
 assert.equal(t.nodes.locked.hidden,true);
 assert.match(app,/dailyQuestionOutcomes.hide\(\)/);
 assert.match(app,/UsDailyKeepsake\?\.load\?\./);
});
test('Noi: selected day labels both individual owners and the shared couple',()=>{
 const a=noi.indexOf('function ownerLabel('),b=noi.indexOf('// Only the weeks',a);
 assert.ok(a>=0&&b>a);
 const box={snapshot:{profiles:[{id:'p1',display_name:'Giulia'},{id:'p2',display_name:'Marco'}],appointments:[
  {id:'a',entry_type:'personal',owner_id:'p1',title:'Lavoro',is_all_day:true,dates:['2026-10-09']},
  {id:'b',entry_type:'personal',owner_id:'p2',title:'Palestra',is_all_day:true,dates:['2026-10-09']},
  {id:'c',entry_type:'shared',owner_id:null,title:'Cena',is_all_day:true,dates:['2026-10-09']}],events:[],startedOn:null},
  year:2026,month:9,relationshipDate:()=>'',recurringDate:()=>'',dateOf:x=>new Date(x+'T12:00:00'),today:()=>'2026-10-09',
  esc:x=>String(x??'').replace(/[&<>"']/g,'?'),icon:x=>'<i>'+x+'</i>'};
 vm.runInNewContext(noi.slice(a,b)+';this.api={ownerLabel,itemsByDate,itemMarkup};',box);
 const index=box.api.itemsByDate();
 const html=index.get('2026-10-09').map(item=>box.api.itemMarkup('2026-10-09',item)).join('');
 for(const name of ['Giulia','Marco','Giulia e Marco'])assert.ok(html.includes(name),name);
 assert.equal(box.api.ownerLabel({kind:'calendar',entryType:'personal',ownerId:'other'}),'Impegno personale');
 assert.doesNotMatch(noi.slice(a,b),/Francesco|Beatrice/);
});
test('calendar owner names come only from current couple-scoped profile rows',()=>{
 assert.match(cal,/\.from\('profiles'\)\.select\('id,display_name,role,couple_id'\)\.eq\('couple_id',viewer\.couple_id\)/);
 assert.match(cal,/\.filter\(p=>p\.couple_id===viewer\.couple_id\)/);
 assert.match(cal,/if\(window\.usProfile!==viewer\|\|window\.usProfile\?\.couple_id!==viewer\.couple_id\)return null/);
 assert.match(cal,/profiles:profileRows/);
});
