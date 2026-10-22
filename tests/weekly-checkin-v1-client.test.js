// Weekly check-in V1, client: the pure rules behind the sheet, the Oggi card,
// the Noi line and Ricordi, plus how the module is wired into the app shell.
// The server rules are proven in weekly-checkin-v1-db.test.js.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const C=require('../weekly-checkin.js');

const me=(over={})=>({closeness:4,closeness_note:null,energy:3,energy_note:null,appreciation:'Grazie',support_last:null,support_request:null,appreciation_reaction:null,version:1,submitted_at:'2026-10-21T10:00:00Z',...over});
const st=(over={})=>({week_start:'2026-10-19',next_week_start:'2026-10-26',me:null,partner_submitted:false,revealed:false,partner:null,previous_request:null,kept:false,...over});

test('phase follows the server state, never a guess',()=>{
  assert.equal(C.phase(null),'loading');
  assert.equal(C.phase(st()),'todo');
  assert.equal(C.phase(st({partner_submitted:true})),'your_turn');
  assert.equal(C.phase(st({me:me()})),'waiting');
  assert.equal(C.phase(st({me:me(),partner_submitted:true,revealed:true,partner:me()})),'ready');
});

test('Oggi gets one card only when something waits for me',()=>{
  assert.equal(C.todayPriority(st(),'Bea'),null,'nothing to do yet: no card, the Noi line is enough');
  assert.equal(C.todayPriority(st({me:me()}),'Bea'),null,'waiting for the other: no card');
  const turn=C.todayPriority(st({partner_submitted:true}),'Bea');
  assert.equal(turn.category,'waiting_for_me');assert.equal(turn.action,'checkin');assert.equal(turn.attention,true);
  assert.match(turn.title,/^Bea /);assert.equal(turn.factKey,'checkin:2026-10-19:turn');
  const ready=st({me:me(),partner_submitted:true,revealed:true,partner:me()});
  const card=C.todayPriority(ready,'Bea');
  assert.equal(card.category,'answers_ready');assert.equal(card.factKey,'checkin:2026-10-19:ready');
  assert.equal(C.todayPriority(ready,'Bea',{seen:new Set(['2026-10-19'])}),null,'results already opened');
});

test('the Noi line says where the week stands',()=>{
  assert.match(C.noiLine(st(),'Bea').detail,/Rispondi/);
  assert.match(C.noiLine(st({partner_submitted:true}),'Bea').detail,/Bea/);
  assert.match(C.noiLine(st({me:me()}),'Bea').detail,/Bea/);
  const ready=C.noiLine(st({me:me(),partner_submitted:true,revealed:true,partner:me({support_request:'Una cena fuori'})}),'Bea');
  assert.equal(ready.request,'Una cena fuori','after the reveal the line carries the other\'s request for this week');
  assert.equal(C.noiLine(null,'Bea'),null);
});

test('payload: trimmed text, levels as numbers, skipped fields as null',()=>{
  const p=C.payload({closeness:'4',closeness_note:'  ',energy:null,energy_note:' Stanco ',appreciation:'  Il caffè ',support_last:2,support_request:''});
  assert.deepEqual(p,{closeness:4,closeness_note:null,energy:null,energy_note:'Stanco',appreciation:'Il caffè',support_last:2,support_request:null});
  assert.deepEqual(Object.keys(C.payload({})).sort(),['appreciation','closeness','closeness_note','energy','energy_note','support_last','support_request']);
  assert.equal(C.payload({support_last:2},{previousRequest:false}).support_last,null,'no request last week: nothing to answer');
});

test('validation matches the server limits',()=>{
  assert.equal(C.validate(C.payload({appreciation:'Grazie'})),'');
  assert.match(C.validate(C.payload({appreciation:'  '})),/apprezzato/);
  assert.match(C.validate(C.payload({appreciation:'x'.repeat(501)})),/500/);
  assert.match(C.validate(C.payload({appreciation:'ok',closeness_note:'x'.repeat(281)})),/280/);
  assert.match(C.validate(C.payload({appreciation:'ok',support_request:'x'.repeat(281)})),/280/);
});

test('levels are said in words; prompts follow how close you felt',()=>{
  assert.equal(C.CLOSENESS.length,5);assert.equal(C.ENERGY.length,5);
  assert.equal(C.levelLabel('closeness',1),'Lontani');assert.equal(C.levelLabel('closeness',5),'Vicinissimi');
  assert.equal(C.levelLabel('closeness',null),'');
  assert.notDeepEqual(C.closenessPrompts(1),C.closenessPrompts(5));
  assert.deepEqual(C.closenessPrompts(2),C.closenessPrompts(1));
  assert.equal(C.SUPPORT_LAST[1],'Sì');assert.equal(C.SUPPORT_LAST[3],'Non ancora');
});

test('two distant weeks in a row: one calm line, nothing more',()=>{
  const w=(me,partner)=>({week_start:'x',me,partner});
  assert.equal(C.distantTwice({weeks:[w(1,1),w(1,1)]}),true);
  assert.equal(C.distantTwice({weeks:[w(1,1),w(1,2)]}),false);
  assert.equal(C.distantTwice({weeks:[w(1,1)]}),false);
  assert.equal(C.distantTwice(null),false);
});

test('shell: loaded, precached, built, back-closable and reset on logout',()=>{
  const html=read('index.html');
  assert.match(html,/<script defer src="\/weekly-checkin\.js\?v=[^"]+"/);
  assert.match(html,/<link rel="stylesheet" href="\/weekly-checkin\.css\?v=[^"]+"/);
  assert.match(html,/id="usCheckinSheet"[^>]*data-us-modal/);
  assert.match(html,/id="noiCheckinRow"/);
  const sw=read('service-worker.js');
  assert.ok(sw.includes('versioned("/weekly-checkin.js")')&&sw.includes('versioned("/weekly-checkin.css")'));
  for(const f of ['scripts/build-cloudflare-pages.mjs','scripts/build-capacitor-web.mjs']){
    assert.ok(read(f).includes("'weekly-checkin.js'"),f);assert.ok(read(f).includes("'weekly-checkin.css'"),f);
  }
  const nav=read('navigation.js');
  assert.match(nav,/name:'weekly-checkin'[\s\S]{0,200}usCheckinSheet[\s\S]{0,200}UsWeeklyCheckin\?\.close/);
  const app=read('app.js');
  assert.match(app,/UsWeeklyCheckin\?\.reset\?\.\(\)/,'cleared with the other private state');
  assert.match(app,/UsWeeklyCheckin\?\.todayPriority\?\.\(/,'Oggi asks the module for its card');
  assert.match(app,/action==='checkin'\)window\.UsWeeklyCheckin\?\.open\?\.\(\)/);
  assert.match(app,/weekly_checkin_keepsakes/,'Ricordi reads the kept appreciations');
  assert.match(app,/weekly_checkin:/,'with their canonical source key');
});

test('only RPCs and the keepsake table: no direct table access, no XP',()=>{
  const js=read('weekly-checkin.js');
  for(const rpc of ['get_weekly_checkin_state','submit_weekly_checkin','get_weekly_checkin_history','set_weekly_checkin_reaction','keep_weekly_appreciation'])
    assert.ok(js.includes(`'${rpc}'`),rpc);
  assert.doesNotMatch(js,/\.from\(['"]weekly_checkins/);
  const code=js.replace(/^\s*\/\/.*$/gm,'');
  assert.doesNotMatch(code,/\bxp\b|streak/i);
});

test('what people write is shown as text, never as markup',()=>{
  const evil='<img src=x onerror=alert(1)>';
  const ready=st({me:me({appreciation:evil,closeness_note:evil}),partner_submitted:true,revealed:true,
    partner:me({appreciation:evil,energy_note:evil,support_request:evil}),previous_request:{week_start:'2026-10-12',text:evil}});
  const ctx={partnerName:'<b>Bea</b>',history:{weeks:[]}};
  for(const html of [C.renderResults(ready,ctx),C.renderStep({...me({closeness_note:evil}),appreciation:evil},1,{...ctx,state:ready}),
    C.renderStep({},4,{...ctx,state:ready})]){
    assert.doesNotMatch(html,/<img|<b>Bea/);
    assert.match(html,/&lt;img/);
  }
  assert.match(C.renderResults(ready,ctx),/translate="no"/,'written text is never translated');
});

test('results: both levels in words, the other\'s appreciation, the request for this week',()=>{
  const ready=st({me:me({closeness:4,support_request:'Ricordami di staccare'}),partner_submitted:true,revealed:true,
    partner:me({closeness:5,appreciation:'Mi hai ascoltata',support_request:'Una cena fuori',support_last:1})});
  const html=C.renderResults(ready,{partnerName:'Bea',history:{weeks:[{week_start:'2026-10-12',me:3,partner:4},{week_start:'2026-10-19',me:4,partner:5}]}});
  for(const s of ['Vicini','Vicinissimi','Mi hai ascoltata','Una cena fuori','data-checkin-react="heart"','data-checkin-keep'])assert.ok(html.includes(s),s);
  assert.match(html,/data-checkin-trend/);
  assert.doesNotMatch(C.renderResults({...ready,kept:true},{partnerName:'Bea',history:{weeks:[]}}),/data-checkin-keep(?!ed)/,'kept: no second keep button');
});

test('English: every fixed line of the sheet has a translation',()=>{
  const en=read('i18n-en.js');
  for(const it of ['Il punto della settimana','Quanta vicinanza hai sentito con {name} questa settimana?','Come stai di energia?',
    'Cosa ha fatto {name} questa settimana che hai apprezzato?','Questa settimana ti aiuterebbe se {name}…','Lontani','Vicinissimi','Invia','Non ancora'])
    assert.ok(en.includes(`'${it}'`)||en.includes(`"${it}"`),it);
  assert.match(read('docs/product/i18n-glossary.md'),/Il punto della settimana/);
});
