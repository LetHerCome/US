const {startServer,FAKE_SUPABASE,loadChromium}=require('./oggi-browser');
async function start(){const chromium=loadChromium();if(!chromium)return null;const server=await startServer();let browser;try{browser=await chromium.launch();}catch(e){await new Promise(r=>server.close(r));throw e;}return {browser,server,base:`http://127.0.0.1:${server.address().port}`,close:async()=>{await browser.close();await new Promise(r=>server.close(r));}};}
// Shared in-page fixture (fake Supabase answers from window.__QA). Exported so
// other real-app browser tests (startup, navigation soak) run the same couple.
const qaFixture=({style,mode,unlocked,missing,started,active})=>{
  const now=new Date(),date=new Date(+now+12*86400000).toLocaleDateString('en-CA');
  const item={id:'00000000-0000-4000-8000-000000000001',title:'Il nostro viaggio',mode,target:mode==='days'?date:new Date(+now+31337000).toISOString(),style};
  const countdown={items:[item],active_id:active==='together'?'together':active==='none'?null:item.id,together_style:style,version:0,started_on:started};
  const rewards=[['frame_aurora',4],['ring_orbit',9],['frame_chrome',12]].map(([id,level_required])=>({id,token:id,level_required,unlocked,category:id.startsWith('ring')?'ring':'frame',title:id,description:'',equipped:false}));
  const me='f1',couple='c1',today=now.toLocaleDateString('en-CA',{timeZone:'Europe/Rome'});
  window.__QA={me,countdown,missing,tables:{profiles:[{id:me,couple_id:couple,role:'francesco',display_name:'Francesco'},{id:'b1',couple_id:couple,role:'beatrice',display_name:'Beatrice'}],couples:[{id:couple,bond_xp:17000,started_on:started}],moments:[{id:'m1',couple_id:couple,created_by:me,storage_path:'c1/f1/qa.webp',moment_date:today,created_at:now.toISOString()}],shared_events:[{id:'e1',couple_id:couple,created_by:me,title:'Una sera per noi',event_date:date,recurs_yearly:false}],moment_photos:[],daily_answers:[],calendar_entries:[],calendar_reminders:[],bucket_items:[],bond_weekly_quests:[],stories:[],couple_locations:[],shared_event_completions:[],relationship_milestones:[]},rpc:{
   get_countdown_oggi_v1:async()=>{window.__QA.readCalls=(window.__QA.readCalls||0)+1;if(window.__QA.readDelay)await new Promise(r=>setTimeout(r,window.__QA.readDelay));return window.__QA.missing?{data:null,error:{code:'PGRST202'}}:{data:structuredClone(window.__QA.countdown),error:null};},
   save_countdown_oggi_v1:async({next_state,expected_version})=>{
    const qa=window.__QA;if(qa.saveDelay)await new Promise(r=>setTimeout(r,qa.saveDelay));
    if(qa.saveError)return {data:null,error:{message:qa.saveError}};
    if(expected_version!==qa.countdown.version)return {data:null,error:{code:'40001',message:'countdown_conflict'}};
    qa.countdown={...next_state,version:expected_version+1,started_on:qa.countdown.started_on};return {data:structuredClone(qa.countdown),error:null};
   },
   get_progression_v1:async()=>({data:{rewards,total_xp:17000,level:15,preferences:{},pending_unlocks:[],rhythm_days:0},error:null}),
   get_or_create_daily_question:async()=>({data:{id:'dq1',question_date:today,question:'Quale piccolo momento vorresti rivivere insieme a me?'},error:null}),
   get_daily_state:async()=>({data:{my_answer:null,partner_has_answer:false,both_answered:false},error:null}),
   get_notification_preferences:async()=>({data:{think:true,today:true,bond:true},error:null})
  }};
  localStorage.clear();sessionStorage.clear();
 };
async function pageFor(h,{width=390,height=844,reduced=false,style='editorial',mode='days',unlocked=true,missing=false,started='2022-06-23',active='custom'}={}){
 const ctx=await h.browser.newContext({viewport:{width,height},isMobile:width<800,hasTouch:true,timezoneId:'Europe/Rome',serviceWorkers:'block',reducedMotion:reduced?'reduce':'no-preference'});
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const u=route.request().url();if(u.startsWith(h.base))return route.continue();if(/supabase-js/.test(u))return route.fulfill({contentType:'text/javascript',body:FAKE_SUPABASE});return route.abort();});
 await page.addInitScript(qaFixture,{style,mode,unlocked,missing,started,active});
 await page.goto(h.base+'/?us-dev=1',{waitUntil:'load'});
 await page.waitForFunction(()=>window.usProfile&&window.USCountdown?.open);
 await page.waitForTimeout(1700);
 return {page,ctx,errors};
}
module.exports={start,pageFor,qaFixture};
