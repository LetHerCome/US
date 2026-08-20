const pages=['home','moments','quiz','bond','think'];
const swipePages=['home','bond','moments','quiz'];
function go(id,options={}){
  const current=document.querySelector('.page.active')?.id;
  if(current===id){
    scrollTo({top:0,behavior:'smooth'});
    if(id==='moments' && window.usProfile)hydrateMoments();
    if(id==='bond' && window.usProfile)hydrateBond();
    if(id==='think' && window.usProfile)hydrateThink();
    return;
  }
  pages.forEach(pageId=>{
    const el=document.getElementById(pageId);
    el.classList.remove('swipe-next','swipe-prev');
    if(pageId===id && options.swipe)el.classList.add(options.swipe==='next'?'swipe-next':'swipe-prev');
    el.classList.toggle('active',pageId===id);
  });
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===id));
  if(options.swipe)setTimeout(()=>document.getElementById(id)?.classList.remove('swipe-next','swipe-prev'),190);
  scrollTo({top:0,behavior:options.swipe?'auto':'smooth'});
  if(id==='moments' && window.usProfile) hydrateMoments();
  if(id==='bond' && window.usProfile) hydrateBond();
  if(id==='think' && window.usProfile) hydrateThink();
}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1700)}
let quizCat='',quizPos=0,quizSelected=null,quizQuestions=[],quizSet=null,quizState=null;
let weeklyQuizSignature='',weeklyQuizWeekStart='',weeklyQuizTimer=null;
const QUIZ_META={
  preferenze:{emoji:'💜',desc:'Gusti, abitudini e piccole scelte.'},
  noi:{emoji:'❤️',desc:'Ricordi e dettagli della relazione.'},
  quotidiano:{emoji:'☕',desc:'Come vivete le piccole cose.'},
  futuro:{emoji:'✨',desc:'Sogni, progetti e desideri.'},
  comunicazione:{emoji:'💬',desc:'Come vi capite quando conta.'},
  viaggi:{emoji:'✈️',desc:'Il vostro modo ideale di partire.'},
  intimita:{emoji:'🫶',desc:'Affetto, vicinanza e attenzioni.'},
  nerd:{emoji:'🎮',desc:'Gaming, film, fantasy e serate.'},
  random:{emoji:'🎲',desc:'Domande imprevedibili per scoprirvi ancora.'}
};
function formatQuizWeekDate(value){
  if(!value)return '';
  return new Date(value+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'short'});
}
async function loadWeeklyQuizHub(force=false){
  if(!window.usProfile)return;
  const grid=document.getElementById('weeklyQuizGrid');
  if(!grid)return;
  try{
    const {data,error}=await sb.rpc('get_weekly_quiz_sets');
    if(error)throw error;
    const sets=Array.isArray(data?.sets)?data.sets:[];
    const signature=JSON.stringify([data?.week_start||'',sets.map(x=>x.slug)]);
    if(!force&&signature===weeklyQuizSignature)return;
    weeklyQuizSignature=signature;weeklyQuizWeekStart=data?.week_start||'';
    const label=document.getElementById('quizWeekLabel');
    const reset=document.getElementById('quizWeekReset');
    if(label)label.textContent='Settimana del '+formatQuizWeekDate(data?.week_start);
    if(reset)reset.textContent='Nuovi quiz il '+formatQuizWeekDate(data?.next_refresh)+' · stessi per entrambi';
    if(!sets.length){grid.innerHTML='<div class="quiz-week-loading">Nessun quiz disponibile.</div>';return;}
    grid.innerHTML=sets.map((set,index)=>{
      const meta=QUIZ_META[set.slug]||{emoji:'◎',desc:'10 domande per conoscervi meglio.'};
      return `<button type="button" class="quiz-cat weekly-quiz-card" style="--quiz-delay:${index*55}ms" onclick="startQuiz('${escapeHtml(set.slug)}')"><span class="quiz-week-number">0${index+1}</span><span class="emoji">${meta.emoji}</span><b>${escapeHtml(set.title)}</b><small>${escapeHtml(meta.desc)}</small><i>10 domande</i></button>`;
    }).join('');
  }catch(error){
    console.warn(error);
    grid.innerHTML='<div class="quiz-week-loading">Non riesco a caricare i quiz. Riprova tra poco.</div>';
  }
}
window.loadWeeklyQuizHub=loadWeeklyQuizHub;
function openQuizHub(){go('quiz');resetQuiz({reload:false});loadWeeklyQuizHub()}
async function startQuiz(cat){
  if(!window.usProfile){toast('Sync non pronta');return;}
  quizCat=cat;quizPos=0;quizSelected=null;quizQuestions=[];quizSet=null;quizState=null;
  document.getElementById('quizHub').classList.add('hidden');
  document.getElementById('quizResult').classList.add('hidden');
  document.getElementById('quizPlay').classList.remove('hidden');
  document.getElementById('quizQuestion').textContent='Carico il set…';
  document.getElementById('quizAnswers').innerHTML='';
  try{
    const {data:set,error:setError}=await sb.from('quiz_sets').select('id,slug,title,category').eq('slug',cat).single();
    if(setError) throw setError;
    const {data:questions,error:qError}=await sb.from('quiz_questions').select('id,position,question,options').eq('set_id',set.id).order('position',{ascending:true});
    if(qError) throw qError;
    if(!questions || !questions.length) throw new Error('Set vuoto');
    quizSet=set;quizQuestions=questions;
    const {data:state,error:stateError}=await sb.rpc('get_quiz_state',{target_set_id:set.id});
    if(stateError) throw stateError;
    quizState=state;
    if(state?.my_complete){showQuizState(state,false);return;}
    const mine=state?.my_answers||{};
    const first=quizQuestions.findIndex(q=>mine[String(q.id)]===undefined);
    quizPos=first>=0?first:0;
    renderQuiz();
  }catch(e){
    console.warn(e);resetQuiz();toast('Errore caricamento quiz');
  }
}
function renderQuiz(){
  const item=quizQuestions[quizPos];if(!item)return;
  quizSelected=null;
  document.getElementById('quizCategory').textContent=(quizSet?.title||quizCat).toUpperCase();
  document.getElementById('quizIndex').textContent=quizPos+1;
  document.getElementById('quizProgress').style.width=(((quizPos+1)/quizQuestions.length)*100)+'%';
  document.getElementById('quizQuestion').textContent=item.question;
  document.getElementById('quizWho').textContent='Rispondi per te. Il confronto resta nascosto fino alla fine.';
  const box=document.getElementById('quizAnswers');box.innerHTML='';
  (item.options||[]).forEach((ans,i)=>{
    const b=document.createElement('button');b.className='answer-btn';b.textContent=ans;
    b.onclick=()=>{document.querySelectorAll('#quizAnswers .answer-btn').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');quizSelected=i;document.getElementById('quizNext').disabled=false};
    box.appendChild(b);
  });
  document.getElementById('quizNext').disabled=true;
  document.getElementById('quizNext').textContent=quizPos===quizQuestions.length-1?'Completa':'Conferma';
}
async function nextQuiz(){
  if(quizSelected===null || !quizSet)return;
  const btn=document.getElementById('quizNext');btn.disabled=true;btn.textContent='Salvo…';
  const item=quizQuestions[quizPos];
  const {error}=await sb.rpc('save_quiz_answer',{target_question_id:item.id,target_answer_index:quizSelected});
  if(error){console.warn(error);toast('Errore sync quiz');renderQuiz();return;}
  const {data:state,error:stateError}=await sb.rpc('get_quiz_state',{target_set_id:quizSet.id});
  if(stateError){console.warn(stateError);toast('Errore stato quiz');renderQuiz();return;}
  quizState=state;updateHomeStatus();
  if(state.my_complete){showQuizState(state,true);return;}
  const mine=state.my_answers||{};
  const next=quizQuestions.findIndex((q,i)=>i>quizPos && mine[String(q.id)]===undefined);
  const any=quizQuestions.findIndex(q=>mine[String(q.id)]===undefined);
  quizPos=next>=0?next:any;renderQuiz();
}
function renderQuizDifferences(state){
  const root=document.getElementById('quizMatches');if(!root)return;
  const mine=state?.my_answers||{},partner=state?.partner_answers||{};
  const different=(quizQuestions||[]).filter(q=>mine[String(q.id)]!==undefined&&partner[String(q.id)]!==undefined&&mine[String(q.id)]!==partner[String(q.id)]);
  root.classList.remove('hidden');
  if(!different.length){root.innerHTML='<div class="quiz-match-empty">Avete risposto uguale a tutto. Nessuna risposta diversa da mostrare ♡</div>';return;}
  const partnerName=window.usProfile?.role==='francesco'?'Bea':'Francesco';
  root.innerHTML='<div class="quiz-match-title">Dove avete risposto diversamente</div>'+different.map(q=>{
    const myIdx=Number(mine[String(q.id)]),partnerIdx=Number(partner[String(q.id)]);
    const myAnswer=(q.options||[])[myIdx]??'—',partnerAnswer=(q.options||[])[partnerIdx]??'—';
    return `<article class="quiz-match quiz-difference"><small>${escapeHtml(q.question)}</small><div><span>Tu</span><b>${escapeHtml(String(myAnswer))}</b></div><div><span>${escapeHtml(partnerName)}</span><b>${escapeHtml(String(partnerAnswer))}</b></div></article>`;
  }).join('');
}
function showQuizState(state,notify=false){
  document.getElementById('quizPlay').classList.add('hidden');
  document.getElementById('quizResult').classList.remove('hidden');
  const xpRoot=document.getElementById('quizXpEarned');
  if(state.both_complete){
    const score=Number(state.score||0),total=Number(state.total||10),xp=Number(state.xp_awarded||0);
    document.getElementById('scoreValue').textContent=score+'/'+total;
    document.getElementById('scoreRing').style.setProperty('--score',Math.round(score/total*100));
    document.getElementById('scoreText').textContent=score>=9?'Siete praticamente sincronizzati 😏':score>=7?'Molto allineati ❤️':score>=5?'Niente male, ma avete ancora cose da scoprire 👀':'Due teste, parecchie sorprese 😂';
    document.getElementById('scoreSub').textContent='Ogni risposta uguale vale 5 XP. Qui sotto mostro solo dove avete risposto diversamente.';
    if(xpRoot){xpRoot.classList.remove('hidden');xpRoot.innerHTML=`<span>✦</span><b>+${xp} XP Bond</b><small>${score} risposte uguali</small>`;}
    renderQuizDifferences(state);
    if(typeof hydrateBondSummary==='function')hydrateBondSummary();
    if(notify&&state.reward_granted_now)toast(`+${xp} XP Bond ✦`);
    else if(notify)toast('Confronto sbloccato ♡');
  }else{
    document.getElementById('scoreValue').textContent='✓';
    document.getElementById('scoreRing').style.setProperty('--score',100);
    document.getElementById('scoreText').textContent='Hai completato il set ♡';
    const matches=document.getElementById('quizMatches');if(matches){matches.classList.add('hidden');matches.innerHTML='';}
    if(xpRoot){xpRoot.classList.add('hidden');xpRoot.innerHTML='';}
    const partner=window.usProfile?.role==='francesco'?'Bea':'Francesco';
    document.getElementById('scoreSub').textContent='Ora aspettiamo '+partner+'. Il risultato e gli XP si sbloccano quando completa anche '+partner+'.';
  }
}
async function refreshQuizState(){
  if(!quizSet || !window.usProfile)return;
  const resultVisible=!document.getElementById('quizResult').classList.contains('hidden');
  if(!resultVisible)return;
  const wasBoth=Boolean(quizState?.both_complete);
  const {data:state}=await sb.rpc('get_quiz_state',{target_set_id:quizSet.id});
  if(state){quizState=state;showQuizState(state,!wasBoth&&Boolean(state.both_complete));updateHomeStatus();}
}
function resetQuiz(options={}){
  quizSet=null;quizQuestions=[];quizState=null;quizPos=0;quizSelected=null;
  const matches=document.getElementById('quizMatches');if(matches){matches.classList.add('hidden');matches.innerHTML='';}
  const xpRoot=document.getElementById('quizXpEarned');if(xpRoot){xpRoot.classList.add('hidden');xpRoot.innerHTML='';}
  document.getElementById('quizHub').classList.remove('hidden');
  document.getElementById('quizPlay').classList.add('hidden');
  document.getElementById('quizResult').classList.add('hidden');
  if(options.reload!==false)loadWeeklyQuizHub();
}
function startWeeklyQuizRefresh(){
  if(weeklyQuizTimer)clearInterval(weeklyQuizTimer);
  weeklyQuizTimer=setInterval(()=>{
    if(document.hidden||!window.usProfile)return;
    if(document.getElementById('quiz')?.classList.contains('active')&&!document.getElementById('quizHub')?.classList.contains('hidden'))loadWeeklyQuizHub();
  },15*60*1000);
}
startWeeklyQuizRefresh();
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.getElementById('quiz')?.classList.contains('active'))loadWeeklyQuizHub();});

function updateTogetherDays(){
  const start = new Date('2026-04-21T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.max(0,Math.floor((today - start)/86400000));
  const el=document.getElementById('daysTogether');
  if(el)el.textContent = diff.toLocaleString('it-IT');
}
updateTogetherDays();


const SB_URL = 'https://iiakdfsxpywdkxravqjh.supabase.co';
const SB_KEY = 'sb_publishable_JAB6USqhccAUg8_0ujgQ1A_NkRJRv_A';
const sb = window.supabase.createClient(SB_URL, SB_KEY);

// ===== US v20 · Web Push Foundation =====
const US_VAPID_PUBLIC_KEY='BChjUsr-rF5fq-qgLrbsFn76z9GQaWJ7-a-_UX0gzU6hkSRC4r4GLwmQLtkuad_ntDBE6Fhr76jr_r7OBQdfuss';
let usPushUiBusy=false;
let usPendingPushTarget=null;

function isIosDevice(){return /iphone|ipad|ipod/i.test(navigator.userAgent||'');}
function isStandaloneUs(){return Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches||window.navigator.standalone===true);}
function isWebPushSupported(){return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}
function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);const out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}
async function getUsServiceWorkerRegistration(){
  if(!('serviceWorker' in navigator))return null;
  await navigator.serviceWorker.register('/service-worker.js',{updateViaCache:'none'});
  return navigator.serviceWorker.ready;
}
async function getCurrentPushSubscription(){
  try{const reg=await getUsServiceWorkerRegistration();return reg?await reg.pushManager.getSubscription():null;}catch(error){console.warn('[US Push] subscription check',error);return null;}
}
async function syncPushSubscriptionToSupabase(subscription){
  if(!subscription||!window.usProfile)return false;
  const json=subscription.toJSON();
  const {error}=await sb.rpc('register_web_push_subscription',{
    target_endpoint:json.endpoint,
    target_p256dh:json.keys?.p256dh||'',
    target_auth:json.keys?.auth||'',
    target_expiration_time:json.expirationTime??null,
    target_user_agent:(navigator.userAgent||'').slice(0,500)
  });
  if(error){console.warn('[US Push] subscription sync failed',error);return false;}
  return true;
}
async function sendWebPushEvent(type,referenceId=null){
  try{
    const {data:{session}}=await sb.auth.getSession();
    if(!session?.access_token)return null;
    const response=await fetch(`${SB_URL}/functions/v1/send-web-push`,{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SB_KEY,'Authorization':`Bearer ${session.access_token}`},
      body:JSON.stringify({type,reference_id:referenceId||undefined})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)console.warn('[US Push] send failed',response.status,payload);
    return payload;
  }catch(error){console.warn('[US Push] send unavailable',error);return null;}
}
window.sendWebPushEvent=sendWebPushEvent;

function setPushSettingsState(kind,title,detail,actionLabel=''){
  const row=document.getElementById('pushSettingsRow'),status=document.getElementById('pushSettingsStatus'),info=document.getElementById('pushSettingsDetail'),button=document.getElementById('pushDisableBtn');
  if(!row)return;
  row.hidden=false;row.classList.toggle('active',kind==='active');row.classList.toggle('denied',kind==='denied');
  if(status)status.textContent=title;if(info)info.textContent=detail;
  if(button){
    if(!actionLabel){button.hidden=true;}
    else{button.hidden=false;button.textContent=actionLabel;button.setAttribute('onclick',kind==='active'?'disableWebPush()':'enableWebPush()');}
  }
}
async function refreshWebPushUi(){
  const card=document.getElementById('pushOptInCard'),title=document.getElementById('pushOptInTitle'),text=document.getElementById('pushOptInText'),button=document.getElementById('pushEnableBtn'),settings=document.getElementById('pushSettingsRow');
  if(!card||!window.usProfile){if(card)card.hidden=true;if(settings)settings.hidden=true;return;}
  card.classList.remove('install-only','denied');
  if(!isWebPushSupported()){
    card.hidden=true;if(settings)settings.hidden=true;return;
  }
  if(isIosDevice()&&!isStandaloneUs()){
    card.hidden=false;card.classList.add('install-only');
    if(title)title.textContent='Aggiungi US alla schermata Home';
    if(text)text.textContent='Su iPhone le notifiche funzionano dalla web app installata nella Home.';
    if(button)button.hidden=true;
    if(settings)settings.hidden=true;
    return;
  }
  if(Notification.permission==='denied'){
    card.hidden=false;card.classList.add('denied');
    if(title)title.textContent='Notifiche disattivate';
    if(text)text.textContent='Riattivale dalle impostazioni notifiche del telefono per US.';
    if(button)button.hidden=true;
    setPushSettingsState('denied','Notifiche bloccate','Riattivale dalle impostazioni del telefono.','');
    return;
  }
  const subscription=await getCurrentPushSubscription();
  if(Notification.permission==='granted'&&subscription){
    await syncPushSubscriptionToSupabase(subscription);
    card.hidden=true;
    setPushSettingsState('active','Notifiche attive','Ti penso, Today e Bond possono raggiungerti a US chiusa.','Disattiva');
    return;
  }
  card.hidden=false;
  if(title)title.textContent='Rimani vicino anche quando US è chiusa';
  if(text)text.textContent='Ricevi “Ti penso”, risposte e quest condivise.';
  if(button){button.hidden=false;button.disabled=false;button.textContent=Notification.permission==='granted'?'Completa attivazione':'Attiva notifiche';}
  setPushSettingsState('inactive','Notifiche non attive','Attivale quando vuoi.','Attiva');
}
window.refreshWebPushUi=refreshWebPushUi;

async function enableWebPush(){
  if(usPushUiBusy||!window.usProfile)return;
  if(!isWebPushSupported())return toast('Notifiche non supportate su questo browser');
  if(isIosDevice()&&!isStandaloneUs())return refreshWebPushUi();
  const button=document.getElementById('pushEnableBtn');usPushUiBusy=true;if(button){button.disabled=true;button.textContent='Attivo…';}
  try{
    let permission=Notification.permission;
    if(permission==='default')permission=await Notification.requestPermission();
    if(permission!=='granted'){await refreshWebPushUi();return;}
    const reg=await getUsServiceWorkerRegistration();
    if(!reg)throw new Error('Service worker unavailable');
    let subscription=await reg.pushManager.getSubscription();
    if(!subscription){
      subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(US_VAPID_PUBLIC_KEY)});
    }
    const synced=await syncPushSubscriptionToSupabase(subscription);
    if(!synced)throw new Error('Subscription sync failed');
    toast('Notifiche attive ♡');
    await refreshWebPushUi();
    setTimeout(()=>sendWebPushEvent('test'),350);
  }catch(error){console.warn('[US Push] enable failed',error);toast('Non riesco ad attivare le notifiche');await refreshWebPushUi();}
  finally{usPushUiBusy=false;if(button)button.disabled=false;}
}
window.enableWebPush=enableWebPush;

async function disableWebPush(){
  if(usPushUiBusy)return;usPushUiBusy=true;
  try{
    const subscription=await getCurrentPushSubscription();
    if(subscription){
      const endpoint=subscription.endpoint;
      const {error}=await sb.rpc('remove_web_push_subscription',{target_endpoint:endpoint});
      if(error)console.warn('[US Push] remove subscription',error);
      await subscription.unsubscribe().catch(()=>false);
    }
    toast('Notifiche disattivate');
  }catch(error){console.warn('[US Push] disable failed',error);toast('Non riesco a disattivare le notifiche');}
  finally{usPushUiBusy=false;await refreshWebPushUi();}
}
window.disableWebPush=disableWebPush;

function performPushNavigation(target){
  if(!target)return;
  if(!window.usProfile){usPendingPushTarget=target;return;}
  if(target==='today'){openToday();return;}
  if(pages.includes(target))go(target);
}
function captureInitialPushTarget(){
  try{
    const url=new URL(location.href),target=url.searchParams.get('open');
    if(target){usPendingPushTarget=target;url.searchParams.delete('open');url.searchParams.delete('from');history.replaceState({},'',url.pathname+url.search+url.hash);}
  }catch(_e){}
}
function flushPendingPushTarget(){if(usPendingPushTarget){const target=usPendingPushTarget;usPendingPushTarget=null;setTimeout(()=>performPushNavigation(target),120);}}
captureInitialPushTarget();
if('serviceWorker' in navigator){navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='US_PUSH_NAVIGATE')performPushNavigation(event.data.target);});}


let selectedRole = null;
let usNativeWidgetBridge = null;

function getNativeWidgetBridge(){
  const cap=window.Capacitor;
  if(!cap || typeof cap.isNativePlatform!=='function' || !cap.isNativePlatform() || typeof cap.registerPlugin!=='function')return null;
  if(!usNativeWidgetBridge)usNativeWidgetBridge=cap.registerPlugin('UsWidgetBridge');
  return usNativeWidgetBridge;
}

async function syncNativeWidgetBridge(sessionOverride=null){
  const bridge=getNativeWidgetBridge();
  if(!bridge || !window.usProfile)return;
  try{
    let session=sessionOverride;
    if(!session){
      const {data}=await sb.auth.getSession();
      session=data?.session||null;
    }
    if(!session?.access_token || !session?.refresh_token)return;
    const profiles=await getCoupleProfiles();
    const partner=partnerFromProfiles(profiles);
    if(!partner)return;
    const {data:lastReceived,error:lastReceivedError}=await sb.from('shared_messages')
      .select('created_at')
      .eq('kind','think')
      .eq('sender_id',partner.id)
      .eq('recipient_id',window.usProfile.id)
      .order('created_at',{ascending:false})
      .limit(1)
      .maybeSingle();
    if(lastReceivedError)console.warn(lastReceivedError);
    await bridge.configure({
      supabaseUrl:SB_URL,
      supabaseKey:SB_KEY,
      accessToken:session.access_token,
      refreshToken:session.refresh_token,
      userId:window.usProfile.id,
      coupleId:window.usProfile.couple_id,
      displayName:window.usProfile.display_name||'',
      partnerId:partner.id,
      partnerName:partner.display_name||'',
      lastReceivedAt:lastReceived?.created_at||''
    });
  }catch(error){
    console.warn('Widget bridge non disponibile',error);
  }
}
window.syncNativeWidgetBridge=syncNativeWidgetBridge;

async function initCloud(){
  const { data: { session } } = await sb.auth.getSession();
  if(!session){
    window.usProfile = null;
    setCloudBadge(false,'offline');
    document.getElementById('authOverlay').classList.remove('hidden');
    showAuthStep('authPair');
    return;
  }
  const {data:profile,error} = await sb.from('profiles').select('id,display_name,role,couple_id,avatar_path').eq('id',session.user.id).maybeSingle();
  if(error) console.warn(error);
  if(!profile){
    window.usProfile = null;
    setCloudBadge(false,'da collegare');
    document.getElementById('authOverlay').classList.remove('hidden');
    showAuthStep('authPair');
    return;
  }
  window.usProfile = profile;
  selectedRole = profile.role;
  document.getElementById('authOverlay').classList.add('hidden');
  setCloudBadge(true, profile.display_name);
  const syncBadge=document.getElementById('syncReadyBadge'); if(syncBadge) syncBadge.textContent='SYNC ATTIVO';
  await hydrateProfileAvatars();
  await hydrateHomePhoto();
  await hydrateCloud();
  await syncNativeWidgetBridge(session);
  startUsRealtime();
  await maybeAutoRefreshLocation();
  startLocationRefreshTimer();
  refreshWebPushUi().catch(()=>{});
  flushPendingPushTarget();
}

function showAuthStep(id){
  document.querySelectorAll('.auth-step').forEach(x=>x.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function setCloudBadge(ok,text){
  const b=document.getElementById('onlineBadge');
  b.className='online-badge '+(ok?'ok':'warn');
  b.textContent=(ok?'● sync · ':'● ')+text;
}


let locationRefreshInFlight=false;
let locationTimer=null;

function distanceKm(aLat,aLon,bLat,bLon){
  const rad=value=>value*Math.PI/180;
  const earthKm=6371;
  const dLat=rad(bLat-aLat),dLon=rad(bLon-aLon);
  const x=Math.sin(dLat/2)**2+Math.cos(rad(aLat))*Math.cos(rad(bLat))*Math.sin(dLon/2)**2;
  return earthKm*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

function relativeLocationAge(dateString){
  const ms=Math.max(0,Date.now()-new Date(dateString).getTime());
  const minutes=Math.floor(ms/60000);
  if(minutes<1)return 'ora';
  if(minutes<60)return `${minutes} min fa`;
  const hours=Math.floor(minutes/60);
  if(hours<24)return `${hours} ${hours===1?'ora':'ore'} fa`;
  const days=Math.floor(hours/24);
  return `${days} ${days===1?'giorno':'giorni'} fa`;
}

function renderDistanceState(state,detail='',action='Aggiorna'){
  const root=document.getElementById('distanceWidget');
  const value=document.getElementById('distanceValue');
  const meta=document.getElementById('distanceMeta');
  const btn=document.getElementById('distanceAction');
  if(!root||!value||!meta||!btn)return;
  root.classList.remove('ready','denied');
  if(state==='ready')root.classList.add('ready');
  if(state==='denied')root.classList.add('denied');
  value.textContent=state==='unsupported'?'Posizione non supportata':state==='denied'?'Posizione disattivata':state==='loading'?'Aggiorno la distanza…':detail||'Attiva la distanza';
  if(state==='unsupported')meta.textContent='Questo dispositivo non espone la geolocalizzazione.';
  else if(state==='denied')meta.textContent='Riattiva la posizione dalle impostazioni del sito/app.';
  else if(state==='loading')meta.textContent='Uso la posizione solo per calcolare quanto siete lontani.';
  btn.textContent=state==='denied'?'Permessi':action;
  btn.disabled=state==='loading';
}

function formatDistance(km){
  if(km<1)return `${Math.max(1,Math.round(km*1000))} m`;
  if(km<10)return `${km.toFixed(1).replace('.',',')} km`;
  return `${Math.round(km).toLocaleString('it-IT')} km`;
}

async function hydrateDistance(){
  if(!window.usProfile)return;
  const {data:rows,error}=await sb.from('couple_locations')
    .select('user_id,latitude,longitude,accuracy_m,updated_at')
    .eq('couple_id',window.usProfile.couple_id);
  if(error){console.warn(error);return;}
  const mine=(rows||[]).find(row=>row.user_id===window.usProfile.id);
  const partner=(rows||[]).find(row=>row.user_id!==window.usProfile.id);
  const partnerName=window.usProfile.role==='francesco'?'Beatrice':'Francesco';
  const root=document.getElementById('distanceWidget');
  const value=document.getElementById('distanceValue');
  const meta=document.getElementById('distanceMeta');
  const btn=document.getElementById('distanceAction');
  if(!root||!value||!meta||!btn)return;
  root.classList.remove('denied');
  if(!mine){
    root.classList.remove('ready');
    value.textContent='Attiva la distanza';
    meta.textContent=`Condividi la tua posizione per vedere quanto sei lontano da ${partnerName}.`;
    btn.textContent='Attiva';btn.disabled=false;
    return;
  }
  if(!partner){
    root.classList.add('ready');
    value.textContent=`In attesa di ${partnerName}`;
    meta.textContent=`La tua posizione è aggiornata · ${relativeLocationAge(mine.updated_at)}.`;
    btn.textContent='Aggiorna';btn.disabled=false;
    return;
  }
  const km=distanceKm(mine.latitude,mine.longitude,partner.latitude,partner.longitude);
  window.usDistanceKm=km;
  root.classList.add('ready');
  value.textContent=`♡ ${formatDistance(km)} da ${partnerName}`;
  const accuracy=Number.isFinite(Number(partner.accuracy_m))?` · precisione ±${Math.round(Number(partner.accuracy_m))} m`:'';
  meta.textContent=`Posizione di ${partnerName} aggiornata ${relativeLocationAge(partner.updated_at)}${accuracy}.`;
  btn.textContent='↻';btn.disabled=false;
}

async function saveMyLocation(position){
  if(!window.usProfile)return;
  const payload={
    user_id:window.usProfile.id,
    couple_id:window.usProfile.couple_id,
    latitude:Number(position.coords.latitude.toFixed(6)),
    longitude:Number(position.coords.longitude.toFixed(6)),
    accuracy_m:Number.isFinite(position.coords.accuracy)?position.coords.accuracy:null,
    updated_at:new Date(position.timestamp||Date.now()).toISOString()
  };
  const {error}=await sb.from('couple_locations').upsert(payload,{onConflict:'user_id'});
  if(error)throw error;
  localStorage.setItem('usLocationEnabled','1');
}

function geolocationError(error,silent=false){
  if(error?.code===1){
    localStorage.removeItem('usLocationEnabled');
    renderDistanceState('denied');
    if(!silent)toast('Permesso posizione non attivo');
  }else{
    if(!silent)toast('Non riesco ad aggiornare la posizione');
    hydrateDistance();
  }
}

function refreshMyLocation(options={}){
  const silent=Boolean(options?.silent);
  if(!window.usProfile)return toast('Connessione non pronta');
  if(!navigator.geolocation){
    renderDistanceState('unsupported');
    return;
  }
  if(locationRefreshInFlight)return;
  locationRefreshInFlight=true;
  if(!silent)renderDistanceState('loading');
  navigator.geolocation.getCurrentPosition(async position=>{
    try{
      await saveMyLocation(position);
      await hydrateDistance();
      if(!silent)toast('Distanza aggiornata ♡');
    }catch(error){
      console.warn(error);
      if(!silent)toast('Errore sync posizione');
    }finally{
      locationRefreshInFlight=false;
    }
  },error=>{
    locationRefreshInFlight=false;
    geolocationError(error,silent);
  },{
    enableHighAccuracy:true,
    timeout:20000,
    maximumAge:silent?30000:0
  });
}
window.refreshMyLocation=refreshMyLocation;

async function maybeAutoRefreshLocation(){
  if(!window.usProfile||!navigator.geolocation)return hydrateDistance();
  await hydrateDistance();
  if(localStorage.getItem('usLocationEnabled')==='1'){
    refreshMyLocation({silent:true});
    return;
  }
  if(!navigator.permissions?.query)return;
  try{
    const permission=await navigator.permissions.query({name:'geolocation'});
    if(permission.state==='granted')refreshMyLocation({silent:true});
    if(permission.state==='denied')renderDistanceState('denied');
    permission.onchange=()=>{
      if(permission.state==='granted')refreshMyLocation({silent:true});
      else if(permission.state==='denied')renderDistanceState('denied');
      else hydrateDistance();
    };
  }catch(_e){}
}

function startLocationRefreshTimer(){
  if(locationTimer)clearInterval(locationTimer);
  locationTimer=setInterval(()=>{
    if(document.hidden||!window.usProfile)return;
    if(localStorage.getItem('usLocationEnabled')==='1'){
      refreshMyLocation({silent:true});
      return;
    }
    if(navigator.permissions?.query){
      navigator.permissions.query({name:'geolocation'}).then(permission=>{
        if(permission.state==='granted')refreshMyLocation({silent:true});
      }).catch(()=>{});
    }
  },5*60*1000);
}

function setAvatarSlot(containerId,signedUrl){
  const root=document.getElementById(containerId);if(!root)return;
  const img=root.querySelector('img'),fallback=root.querySelector('.fallback');
  if(signedUrl){img.src=signedUrl;img.hidden=false;if(fallback)fallback.style.display='none';}
  else{img.removeAttribute('src');img.hidden=true;if(fallback)fallback.style.display='grid';}
}

async function signedAvatarUrl(path){
  if(!path)return null;
  const {data,error}=await sb.storage.from('us-media').createSignedUrl(path,21600);
  if(error){console.warn(error);return null;}
  return data?.signedUrl||null;
}

async function hydrateProfileAvatars(){
  if(!window.usProfile)return;
  const fallback=document.getElementById('profileAvatarFallback');
  if(fallback)fallback.textContent=(window.usProfile.display_name||'?').slice(0,1).toUpperCase();
  const {data:profiles,error}=await sb.from('profiles').select('id,display_name,role,avatar_path').eq('couple_id',window.usProfile.couple_id);
  if(error){console.warn(error);return;}
  for(const profile of profiles||[]){
    const url=await signedAvatarUrl(profile.avatar_path);
    if(profile.role==='francesco')setAvatarSlot('pairAvatarFrancesco',url);
    if(profile.role==='beatrice')setAvatarSlot('pairAvatarBeatrice',url);
    if(profile.id===window.usProfile.id){
      const img=document.getElementById('profileAvatarImg');
      if(url){img.src=url;img.hidden=false;if(fallback)fallback.style.display='none';}
      else{img.removeAttribute('src');img.hidden=true;if(fallback)fallback.style.display='grid';}
      window.usProfile.avatar_path=profile.avatar_path||null;
    }
  }
}
window.hydrateProfileAvatars=hydrateProfileAvatars;

function pickProfilePhoto(){
  if(!window.usProfile)return toast('Connessione non pronta');
  document.getElementById('profileAvatarFile').click();
}
window.pickProfilePhoto=pickProfilePhoto;



async function compressImageFile(file,{maxDimension=1920,quality=.82}={}){
  if(!file)return null;
  if(file.size>20*1024*1024)throw new Error('SOURCE_TOO_LARGE');
  let bitmap=null;
  try{
    if('createImageBitmap' in window) bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
  }catch(_e){}
  let width,height,drawSource,revokeUrl=null;
  if(bitmap){width=bitmap.width;height=bitmap.height;drawSource=bitmap;}
  else{
    const url=URL.createObjectURL(file);revokeUrl=url;
    const img=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=reject;el.src=url;});
    width=img.naturalWidth||img.width;height=img.naturalHeight||img.height;drawSource=img;
  }
  if(!width||!height)throw new Error('INVALID_IMAGE');
  const scale=Math.min(1,maxDimension/Math.max(width,height));
  const outW=Math.max(1,Math.round(width*scale));
  const outH=Math.max(1,Math.round(height*scale));
  const canvas=document.createElement('canvas');canvas.width=outW;canvas.height=outH;
  const ctx=canvas.getContext('2d',{alpha:false});
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(drawSource,0,0,outW,outH);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
  if(bitmap?.close)bitmap.close();
  if(revokeUrl)URL.revokeObjectURL(revokeUrl);
  if(!blob)throw new Error('COMPRESSION_FAILED');
  return new File([blob],(file.name||'image').replace(/\.[^.]+$/,'')+'.webp',{type:'image/webp',lastModified:Date.now()});
}

function avatarExt(_file){return 'webp';}

async function uploadProfilePhoto(file){
  if(!window.usProfile||!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))return toast('Per ora usa JPG, PNG o WebP');
  if(file.size>20*1024*1024)return toast('Foto troppo grande: massimo 20 MB');
  const oldPath=window.usProfile.avatar_path||null;
  const btn=document.getElementById('profileAvatarBtn');btn.disabled=true;
  try{
    const compressed=await compressImageFile(file,{maxDimension:512,quality:.82});
    const path=`${window.usProfile.couple_id}/${window.usProfile.id}/avatar-${Date.now()}-${crypto.randomUUID()}.webp`;
    const {error:uploadError}=await sb.storage.from('us-media').upload(path,compressed,{contentType:'image/webp',upsert:false,cacheControl:'3600'});
    if(uploadError)throw uploadError;
    const {error:updateError}=await sb.from('profiles').update({avatar_path:path}).eq('id',window.usProfile.id);
    if(updateError){await sb.storage.from('us-media').remove([path]);throw updateError;}
    window.usProfile.avatar_path=path;
    if(oldPath && oldPath!==path)await sb.storage.from('us-media').remove([oldPath]);
    toast('Foto profilo aggiornata ♡');
    await hydrateProfileAvatars();
  }catch(err){console.warn(err);toast(err?.message==='SOURCE_TOO_LARGE'?'Foto troppo grande: massimo 20 MB':'Non riesco ad aggiornare la foto');}
  finally{btn.disabled=false;document.getElementById('profileAvatarFile').value='';}
}

const profileAvatarFile=document.getElementById('profileAvatarFile');
if(profileAvatarFile)profileAvatarFile.addEventListener('change',(event)=>uploadProfilePhoto(event.target.files?.[0]||null));


let homePhotoRotationTimer=null;
let homePhotoActiveLayer='A';
let homePhotoHourKey='';
let homePhotoPath='';

function homeRotationKey(){
  const d=new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}T${String(d.getUTCHours()).padStart(2,'0')}`;
}

function homeStableIndex(seed,count){
  let h=2166136261;
  for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}
  return count?((h>>>0)%count):0;
}

async function getHomeRotationPath(){
  if(!window.usProfile)return null;
  const {data:rows,error}=await sb.from('moments')
    .select('id,storage_path,moment_date,created_at')
    .eq('couple_id',window.usProfile.couple_id)
    .order('moment_date',{ascending:false})
    .order('created_at',{ascending:false})
    .limit(120);
  if(error){console.warn(error);return null;}
  if(rows?.length){
    const key=homeRotationKey();
    let idx=homeStableIndex(`${window.usProfile.couple_id}|${key}|home`,rows.length);
    if(rows.length>1&&rows[idx]?.storage_path===homePhotoPath)idx=(idx+1)%rows.length;
    return rows[idx]?.storage_path||null;
  }
  const {data:couple}=await sb.from('couples').select('home_photo_path').eq('id',window.usProfile.couple_id).maybeSingle();
  return couple?.home_photo_path||null;
}

function crossfadeHomePhoto(url){
  const hero=document.getElementById('homeHero');
  const nextKey=homePhotoActiveLayer==='A'?'B':'A';
  const current=document.getElementById(`homePhotoLayer${homePhotoActiveLayer}`);
  const next=document.getElementById(`homePhotoLayer${nextKey}`);
  if(!hero||!current||!next)return;
  const apply=()=>{
    next.style.backgroundImage=url?`url("${url}")`:'';
    requestAnimationFrame(()=>{
      next.classList.add('active');
      current.classList.remove('active');
      homePhotoActiveLayer=nextKey;
    });
  };
  if(!url){apply();return;}
  const preload=new Image();
  preload.onload=apply;
  preload.onerror=()=>console.warn('[US Home] preload foto fallito');
  preload.src=url;
}

async function hydrateHomePhoto(force=false){
  if(!window.usProfile)return;
  const hourKey=homeRotationKey();
  if(!force && homePhotoHourKey===hourKey && homePhotoPath)return;
  const path=await getHomeRotationPath();
  homePhotoHourKey=hourKey;
  if(!path){
    homePhotoPath='';
    crossfadeHomePhoto('');
    return;
  }
  if(!force && path===homePhotoPath)return;
  const {data:signed,error}=await sb.storage.from('us-media').createSignedUrl(path,3900);
  if(error||!signed?.signedUrl){console.warn(error);return;}
  homePhotoPath=path;
  crossfadeHomePhoto(signed.signedUrl);
}
window.hydrateHomePhoto=hydrateHomePhoto;

function startHomePhotoRotation(){
  if(homePhotoRotationTimer)clearInterval(homePhotoRotationTimer);
  const tick=()=>{
    if(document.hidden||!window.usProfile)return;
    if(homePhotoHourKey!==homeRotationKey())hydrateHomePhoto(true);
  };
  homePhotoRotationTimer=setInterval(tick,60000);
}
startHomePhotoRotation();

function selectRole(role){
  selectedRole=role;
  document.querySelectorAll('.role-btn').forEach(btn=>btn.classList.toggle('selected',btn.dataset.role===role));
  document.getElementById('pairStatus').textContent='';
}
window.selectRole=selectRole;

async function pairAccount(){
  const code=document.getElementById('pairCode').value.trim().toUpperCase();
  const s=document.getElementById('pairStatus');
  const btn=document.getElementById('pairBtn');
  if(!selectedRole){s.textContent='Prima scegli Francesco o Beatrice.';return;}
  if(!code){s.textContent='Inserisci il codice privato.';return;}
  btn.disabled=true;
  s.textContent='Accesso…';
  try{
    let {data:{session},error:sessionError}=await sb.auth.getSession();
    if(sessionError) throw sessionError;
    if(!session){
      const anon = await sb.auth.signInAnonymously();
      if(anon.error) throw anon.error;
      session = anon.data.session;
    }
    const {error}=await sb.rpc('claim_us_role',{invite_code:code,chosen_role:selectedRole});
    if(error) throw error;
    s.textContent='Questo telefono è collegato ♡';
    document.getElementById('pairCode').value='';
    await initCloud();
  }catch(err){
    const msg=String(err?.message||'accesso non riuscito');
    if(/anonymous sign-ins are disabled|anonymous/i.test(msg) && /disabled|not enabled/i.test(msg)){
      s.textContent='Accesso anonimo non ancora attivo su Supabase.';
    }else if(/Invalid private code/i.test(msg)){
      s.textContent='Codice privato non corretto.';
    }else{
      s.textContent='Errore: '+msg;
    }
  }finally{
    btn.disabled=false;
  }
}
window.pairAccount=pairAccount;

function localDateISO(){
  const d=new Date(), y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function openToday(){
  const root=document.getElementById('today');
  if(!root)return;
  root.classList.add('open');
  root.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  hydrateToday();
}
window.openToday=openToday;
function closeToday(){
  const root=document.getElementById('today');
  root?.classList.remove('open');
  root?.setAttribute('aria-hidden','true');
  document.body.style.overflow='';
}
window.closeToday=closeToday;

async function hydrateToday(){
  if(!window.usProfile)return;
  const {data:q,error:qError}=await sb.from('daily_questions').select('id,question').eq('question_date',localDateISO()).maybeSingle();
  if(qError){console.warn(qError);return;}
  const qel=document.querySelector('#today .qtext');
  const locked=document.getElementById('locked'), reveal=document.getElementById('todayReveal'), btn=document.getElementById('todaySaveBtn');
  const answerEl=document.getElementById('answer');
  if(!q){
    window.todayQuestion=null; window.todayState=null;
    if(qel)qel.textContent='La prossima domanda sta arrivando…';
    locked.textContent='Nessuna domanda disponibile per oggi.';
    reveal.classList.add('hidden');
    answerEl.disabled=true; btn.disabled=true; btn.textContent='Nessuna domanda';
    updateHomeStatus();
    return;
  }
  answerEl.disabled=false; btn.disabled=false;
  window.todayQuestion=q;if(qel)qel.textContent=q.question;
  const {data:state,error}=await sb.rpc('get_daily_state',{target_question_id:q.id});
  if(error){console.warn(error);return;}
  window.todayState=state;
  if(state?.my_answer){
    document.getElementById('answer').value=state.my_answer;
    btn.textContent='Aggiorna risposta';
  }else{
    btn.textContent='Rispondi';
  }
  if(state?.both_answered){
    const partner=window.usProfile.role==='francesco'?'Bea':'Francesco';
    locked.innerHTML='♡ <b>Reveal sbloccato.</b> Avete risposto entrambi.';
    reveal.className='today-reveal';
    reveal.innerHTML='<div class="today-answer"><b>La tua risposta</b><p>'+escapeHtml(state.my_answer||'')+'</p></div><div class="today-answer"><b>'+partner+'</b><p>'+escapeHtml(state.partner_answer||'')+'</p></div>';
    answerEl.disabled=true; btn.disabled=true; btn.textContent='Risposte sbloccate';
  }else{
    reveal.classList.add('hidden');reveal.innerHTML='';
    if(state?.my_answer){
      const partner=window.usProfile.role==='francesco'?'Bea':'Francesco';
      locked.innerHTML='✓ Hai risposto. <b>In attesa di '+partner+'…</b>';
    }else if(state?.partner_has_answer){
      locked.innerHTML='🔒 L’altra risposta è già arrivata. <b>Rispondi per sbloccarla.</b>';
    }else{
      locked.innerHTML='🔒 Le risposte si sbloccano quando avete risposto entrambi.';
    }
  }
  updateHomeStatus();
}

async function updateHomeStatus(){
  if(!window.usProfile)return;
  const todayPill=document.getElementById('todayStatusPill');
  const quizPill=document.getElementById('quizStatusPill');
  const todayOrb=document.getElementById('todayOrb');
  const todayOrbDot=document.getElementById('todayOrbDot');
  const st=window.todayState;
  if(todayOrb){
    todayOrb.classList.toggle('done',Boolean(st?.my_answer));
    todayOrb.classList.toggle('reveal',Boolean(st?.both_answered));
  }
  if(todayOrbDot)todayOrbDot.hidden=Boolean(st?.my_answer);
  const partner=window.usProfile.role==='francesco'?'Bea':'Francesco';
  if(todayPill){
    if(st?.both_answered) todayPill.textContent='💬 Today · reveal sbloccato';
    else if(st?.my_answer) todayPill.textContent='💬 Today · in attesa di '+partner;
    else if(st?.partner_has_answer) todayPill.textContent='💬 Today · risposta in attesa';
    else todayPill.textContent='💬 Today · da fare';
  }
  try{
    const {count,error}=await sb.from('quiz_responses').select('id',{count:'exact',head:true});
    if(!error && quizPill) quizPill.textContent='🎯 Quiz · '+Number(count||0)+' risposte';
  }catch(_e){}
}

let pendingMomentFile=null;
let pendingMomentPreviewUrl=null;
let pendingMomentDate=localDateISO();

function formatMomentDetectedDate(value){
  try{return new Date(value+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'});}catch(_){return value;}
}

function parseExifDateString(value){
  const m=String(value||'').match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if(!m)return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

async function readJpegExifDate(file){
  if(file?.type!=='image/jpeg')return null;
  try{
    const buffer=await file.slice(0,Math.min(file.size,512*1024)).arrayBuffer();
    const view=new DataView(buffer);
    if(view.byteLength<4||view.getUint16(0,false)!==0xFFD8)return null;
    let offset=2;
    const readAscii=(pos,len)=>{let out='';for(let i=0;i<len&&pos+i<view.byteLength;i++){const c=view.getUint8(pos+i);if(!c)break;out+=String.fromCharCode(c);}return out;};
    while(offset+4<view.byteLength){
      if(view.getUint8(offset)!==0xFF){offset++;continue;}
      const marker=view.getUint8(offset+1);offset+=2;
      if(marker===0xDA||marker===0xD9)break;
      if(offset+2>view.byteLength)break;
      const size=view.getUint16(offset,false);
      if(size<2||offset+size>view.byteLength)break;
      if(marker===0xE1&&size>=8&&readAscii(offset+2,6).startsWith('Exif')){
        const tiff=offset+8;
        const little=view.getUint16(tiff,false)===0x4949;
        const u16=(p)=>view.getUint16(p,little),u32=(p)=>view.getUint32(p,little);
        const readIfd=(ifdPos)=>{
          if(ifdPos+2>view.byteLength)return {date:null,exif:null};
          const count=u16(ifdPos);let date=null,exif=null;
          for(let i=0;i<count;i++){
            const e=ifdPos+2+i*12;if(e+12>view.byteLength)break;
            const tag=u16(e),type=u16(e+2),num=u32(e+4),value=u32(e+8);
            if(tag===0x8769)exif=tiff+value;
            if((tag===0x0132||tag===0x9003||tag===0x9004)&&type===2&&num>0){
              const pos=num<=4?e+8:tiff+value;
              const raw=readAscii(pos,Math.min(num,32));
              date=parseExifDateString(raw)||date;
            }
          }
          return {date,exif};
        };
        const ifd0=tiff+u32(tiff+4);
        const first=readIfd(ifd0);
        if(first.exif){const ex=readIfd(first.exif);if(ex.date)return ex.date;}
        if(first.date)return first.date;
      }
      offset+=size;
    }
  }catch(error){console.warn('[US Moments] EXIF date',error);}
  return null;
}

async function detectMomentDate(file){
  const exif=await readJpegExifDate(file);
  if(exif)return exif;
  if(Number.isFinite(file?.lastModified)&&file.lastModified>0){
    const d=new Date(file.lastModified);
    if(!Number.isNaN(d.getTime()))return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  return localDateISO();
}

function updateDetectedMomentDate(){
  const el=document.getElementById('momentDetectedDate');
  if(el)el.textContent=`Data foto · ${formatMomentDetectedDate(pendingMomentDate)}`;
}

function pickMomentPhoto(){
  document.getElementById('momentFile').click();
}
window.pickMomentPhoto=pickMomentPhoto;

function resetMomentComposer(){
  pendingMomentFile=null;
  pendingMomentDate=localDateISO();
  if(pendingMomentPreviewUrl){URL.revokeObjectURL(pendingMomentPreviewUrl);pendingMomentPreviewUrl=null;}
  const fileInput=document.getElementById('momentFile');if(fileInput)fileInput.value='';
  const caption=document.getElementById('momentCaption');if(caption)caption.value='';
  const img=document.getElementById('momentPreviewImg');if(img)img.removeAttribute('src');
  document.getElementById('momentCompose')?.classList.remove('has-photo');
  const detected=document.getElementById('momentDetectedDate');if(detected)detected.textContent='La data verrà letta automaticamente dalla foto.';
}

document.getElementById('momentFile')?.addEventListener('change',async(event)=>{
  const file=event.target.files?.[0]||null;
  const compose=document.getElementById('momentCompose');
  const img=document.getElementById('momentPreviewImg');
  if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
    event.target.value='';
    return toast('Per ora usa JPG, PNG o WebP');
  }
  if(file.size>20*1024*1024){
    event.target.value='';
    return toast('Foto troppo grande: massimo 20 MB');
  }
  pendingMomentFile=file;
  pendingMomentDate=await detectMomentDate(file);
  updateDetectedMomentDate();
  if(pendingMomentPreviewUrl)URL.revokeObjectURL(pendingMomentPreviewUrl);
  pendingMomentPreviewUrl=URL.createObjectURL(file);
  img.src=pendingMomentPreviewUrl;
  compose?.classList.add('has-photo');
});

function momentExt(_file){return 'webp';}

async function uploadMoment(){
  if(!window.usProfile)return toast('Connessione non pronta');
  if(!pendingMomentFile)return toast('Scegli prima una foto');
  const btn=document.getElementById('momentUploadBtn');
  const caption=document.getElementById('momentCaption').value.trim();
  const momentDate=pendingMomentDate||localDateISO();
  const file=pendingMomentFile;
  btn.disabled=true;btn.textContent='Ottimizzo…';
  try{
    const compressed=await compressImageFile(file,{maxDimension:1920,quality:.82});
    const safeName=`${Date.now()}-${crypto.randomUUID()}.webp`;
    const path=`${window.usProfile.couple_id}/${window.usProfile.id}/${safeName}`;
    btn.textContent='Carico…';
    const {error:uploadError}=await sb.storage.from('us-media').upload(path,compressed,{contentType:'image/webp',upsert:false,cacheControl:'3600'});
    if(uploadError)throw uploadError;
    const {error:rowError}=await sb.from('moments').insert({
      couple_id:window.usProfile.couple_id,
      created_by:window.usProfile.id,
      storage_path:path,
      caption:caption||null,
      moment_date:momentDate
    });
    if(rowError){await sb.storage.from('us-media').remove([path]);throw rowError;}
    resetMomentComposer();
    toast('Ricordo aggiunto ♡');
    await hydrateMoments();
    await hydrateHomeMemory();
    if(!homePhotoPath)await hydrateHomePhoto(true);
  }catch(err){console.warn(err);toast(err?.message==='SOURCE_TOO_LARGE'?'Foto troppo grande: massimo 20 MB':'Upload non riuscito');}
  finally{btn.disabled=false;btn.textContent='Salva ricordo';}
}
window.uploadMoment=uploadMoment;

async function hydrateMoments(){
  if(!window.usProfile)return;
  const grid=document.getElementById('momentsGrid');
  const pill=document.getElementById('momentsStatusPill');
  if(!grid)return;
  if(grid.dataset.loaded!=='1')grid.innerHTML='<div class="empty-state moment-loading"><div class="emoji">↻</div><b>Carico i vostri ricordi…</b></div>';
  const [{data:rows,error},{data:profiles,error:profilesError}]=await Promise.all([
    sb.from('moments').select('id,created_by,storage_path,caption,moment_date,created_at').order('moment_date',{ascending:false}).order('created_at',{ascending:false}),
    sb.from('profiles').select('id,display_name').eq('couple_id',window.usProfile.couple_id)
  ]);
  if(error){console.warn(error);if(grid.dataset.loaded!=='1')grid.innerHTML='<div class="empty-state moment-loading"><div class="emoji">!</div><b>Moments non disponibile</b><p>Riprova tra un momento.</p></div>';return;}
  if(profilesError)console.warn(profilesError);
  if(pill)pill.textContent='📸 Moments · '+(rows?.length||0);
  const signature=JSON.stringify((rows||[]).map(r=>[r.id,r.created_by,r.storage_path,r.caption||'',r.moment_date,r.created_at]));
  if(grid.dataset.loaded==='1'&&grid.dataset.signature===signature)return;
  if(!rows?.length){grid.innerHTML='<div class="empty-state moment-loading"><div class="emoji">📸</div><b>Il primo ricordo parte da qui.</b><p>Scegli una foto: la data verrà letta automaticamente.</p></div>';grid.dataset.loaded='1';grid.dataset.signature=signature;return;}
  const names=new Map((profiles||[]).map(profile=>[profile.id,profile.display_name||'Noi']));
  const cards=[];
  for(const row of rows){
    const {data:signed,error:signedError}=await sb.storage.from('us-media').createSignedUrl(row.storage_path,21600);
    if(signedError||!signed?.signedUrl){console.warn(signedError);continue;}
    const dateLabel=new Date(row.moment_date+'T12:00:00').toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'});
    const own=row.created_by===window.usProfile.id;
    const author=names.get(row.created_by)||(own?window.usProfile.display_name:'Noi');
    cards.push(`<article class="moment-card moment-postit" role="button" tabindex="0" data-url="${escapeHtml(signed.signedUrl)}" data-author="${escapeHtml(author||'Noi')}" data-date="${escapeHtml(dateLabel)}" data-caption="${escapeHtml(row.caption||'')}" onclick="openMomentViewer(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openMomentViewer(this)}"><img src="${escapeHtml(signed.signedUrl)}" alt="Ricordo condiviso" loading="lazy">${own?`<button class="moment-delete" type="button" aria-label="Elimina ricordo" onclick="event.stopPropagation();deleteMoment('${row.id}','${escapeHtml(row.storage_path)}')">×</button>`:''}<div class="moment-meta"><div class="moment-by">${escapeHtml(author||'Noi')}</div><b>${dateLabel}</b>${row.caption?`<p>${escapeHtml(row.caption)}</p>`:''}</div></article>`);
  }
  if(cards.length){grid.innerHTML=cards.join('');grid.dataset.loaded='1';grid.dataset.signature=signature;}
  else if(grid.dataset.loaded!=='1')grid.innerHTML='<div class="empty-state moment-loading"><div class="emoji">!</div><b>Foto non disponibili</b><p>Riprova tra un momento.</p></div>';
}
window.hydrateMoments=hydrateMoments;

let homeMemoryOffset=0;
async function hydrateHomeMemory(forceNext=false){
  if(!window.usProfile)return;
  const section=document.getElementById('homeMemorySection');
  const card=document.getElementById('homeMemoryCard');
  if(!section||!card)return;
  const [{data:rows,error},{data:profiles,error:profilesError}]=await Promise.all([
    sb.from('moments').select('id,created_by,storage_path,caption,moment_date,created_at').order('created_at',{ascending:false}).limit(24),
    sb.from('profiles').select('id,display_name').eq('couple_id',window.usProfile.couple_id)
  ]);
  if(error){console.warn(error);section.hidden=true;return;}
  if(profilesError)console.warn(profilesError);
  if(!rows?.length){section.hidden=true;return;}
  if(forceNext)homeMemoryOffset=(homeMemoryOffset+1)%rows.length;
  const daySeed=Number(localDateISO().replaceAll('-',''))||0;
  const row=rows[(daySeed+homeMemoryOffset)%rows.length];
  const names=new Map((profiles||[]).map(profile=>[profile.id,profile.display_name||'Noi']));
  const {data:signed,error:signedError}=await sb.storage.from('us-media').createSignedUrl(row.storage_path,21600);
  if(signedError||!signed?.signedUrl){console.warn(signedError);section.hidden=true;return;}
  const dateLabel=new Date(row.moment_date+'T12:00:00').toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'});
  const author=names.get(row.created_by)||'Noi';
  document.getElementById('homeMemoryImg').src=signed.signedUrl;
  document.getElementById('homeMemoryAuthor').textContent=author;
  document.getElementById('homeMemoryDate').textContent=dateLabel;
  const caption=document.getElementById('homeMemoryCaption');
  caption.textContent=row.caption||'';
  caption.hidden=!row.caption;
  card.dataset.url=signed.signedUrl;
  card.dataset.author=author;
  card.dataset.date=dateLabel;
  card.dataset.caption=row.caption||'';
  section.hidden=false;
}
window.hydrateHomeMemory=hydrateHomeMemory;

function openMomentViewer(card){
  const viewer=document.getElementById('momentViewer');
  document.getElementById('momentViewerImg').src=card.dataset.url||'';
  document.getElementById('momentViewerAuthor').textContent=card.dataset.author||'Noi';
  document.getElementById('momentViewerDate').textContent=card.dataset.date||'';
  const caption=document.getElementById('momentViewerCaption');
  caption.textContent=card.dataset.caption||'';
  caption.hidden=!card.dataset.caption;
  viewer.classList.add('show');
  viewer.setAttribute('aria-hidden','false');
  document.body.classList.add('viewer-open');
}
window.openMomentViewer=openMomentViewer;

function closeMomentViewer(){
  const viewer=document.getElementById('momentViewer');
  if(!viewer?.classList.contains('show'))return;
  viewer.classList.remove('show');
  viewer.setAttribute('aria-hidden','true');
  document.body.classList.remove('viewer-open');
  setTimeout(()=>document.getElementById('momentViewerImg').removeAttribute('src'),180);
}
window.closeMomentViewer=closeMomentViewer;

document.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeMomentViewer();});

let momentViewerTouchY=null;
const momentViewer=document.getElementById('momentViewer');
if(momentViewer){
  momentViewer.addEventListener('touchstart',(event)=>{momentViewerTouchY=event.touches?.[0]?.clientY??null;},{passive:true});
  momentViewer.addEventListener('touchend',(event)=>{
    if(momentViewerTouchY===null)return;
    const endY=event.changedTouches?.[0]?.clientY??momentViewerTouchY;
    if(endY-momentViewerTouchY>70)closeMomentViewer();
    momentViewerTouchY=null;
  },{passive:true});
}

async function deleteMoment(id,path){
  if(!window.usProfile)return;
  if(!confirm('Eliminare questo ricordo?'))return;
  const {error:storageError}=await sb.storage.from('us-media').remove([path]);
  if(storageError){console.warn(storageError);return toast('Non riesco a eliminare la foto');}
  const {error:rowError}=await sb.from('moments').delete().eq('id',id).eq('created_by',window.usProfile.id);
  if(rowError){console.warn(rowError);return toast('Foto eliminata, aggiorno Moments');}
  toast('Ricordo eliminato');
  await hydrateMoments();
  await hydrateHomeMemory();
  if(path===homePhotoPath){homePhotoPath='';await hydrateHomePhoto(true);}
}
window.deleteMoment=deleteMoment;



// ===== Bond progression + Weekly Quests =====
function weekStartISO(){
  const now=new Date();
  const d=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const mondayOffset=(d.getDay()+6)%7;
  d.setDate(d.getDate()-mondayOffset);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function nextWeekLabel(){
  const [y,m,d]=weekStartISO().split('-').map(Number);
  const next=new Date(y,m-1,d+7);
  return next.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'short'});
}
function bondLevelInfo(totalXp=0){
  const total=Math.max(0,Number(totalXp)||0);
  let level=1,floor=0,needed=200;
  while(total>=floor+needed){
    floor+=needed;
    level+=1;
    needed=200+(level-1)*150;
    if(level>999)break;
  }
  const current=total-floor;
  return {total,level,current,needed,progress:Math.max(0,Math.min(100,current/needed*100))};
}
function bondRankTitle(level){
  if(level<=1)return 'First Link';
  if(level===2)return 'Party Formed';
  if(level===3)return 'Resonance';
  if(level===4)return 'Synced Souls';
  if(level<=7)return 'Soulbound';
  if(level<=12)return 'Legendary Duo';
  if(level<=20)return 'Mythic Bond';
  return 'Eternal Party';
}
function bondBadgeIcon(level){
  const icons=['♡','✦','∞','⌁','✧','☾','◇','♜','⚡','♛'];
  return icons[(Math.max(1,level)-1)%icons.length];
}
function renderBondBadges(level){
  const root=document.getElementById('bondBadges');
  if(!root)return;
  if(root.dataset.level===String(level))return;
  root.dataset.level=String(level);
  const maxShown=Math.max(3,Math.min(level+2,12));
  const cards=[];
  for(let l=1;l<=maxShown;l++){
    const unlocked=l<=level;
    cards.push(`<div class="bond-badge-card ${unlocked?'unlocked':'locked'}"><span>${bondBadgeIcon(l)}</span><b>LV. ${l}</b><small>${escapeHtml(bondRankTitle(l))}</small></div>`);
  }
  root.innerHTML=cards.join('');
  try{
    const key=`usBondLastLevel:${window.usProfile?.couple_id||'local'}`;
    const prev=Number(localStorage.getItem(key)||0);
    if(prev>0&&level>prev){toast(`Badge LV. ${level} sbloccato ✦`);navigator.vibrate?.([35,20,55]);}
    if(level>prev)localStorage.setItem(key,String(level));
  }catch(_e){}
}

function renderBondProgress(totalXp){
  const info=bondLevelInfo(totalXp);
  const heroLevel=document.getElementById('heroBondLevel');
  const heroXp=document.getElementById('heroBondXp');
  const heroFill=document.getElementById('bondFill');
  if(heroLevel)heroLevel.textContent=`BOND LV. ${info.level}`;
  if(heroXp)heroXp.textContent=`${info.current.toLocaleString('it-IT')} / ${info.needed.toLocaleString('it-IT')} XP`;
  if(heroFill)heroFill.style.width=`${info.progress}%`;
  const levelEl=document.getElementById('bondLevelValue');if(levelEl)levelEl.textContent=info.level;
  const totalEl=document.getElementById('bondTotalXp');if(totalEl)totalEl.textContent=`${info.total.toLocaleString('it-IT')} XP totali`;
  const rankEl=document.getElementById('bondRankTitle');if(rankEl)rankEl.textContent=bondRankTitle(info.level);
  const nextEl=document.getElementById('bondNextXp');if(nextEl)nextEl.textContent=`${(info.needed-info.current).toLocaleString('it-IT')} XP al prossimo livello`;
  const pageFill=document.getElementById('bondPageFill');if(pageFill)pageFill.style.width=`${info.progress}%`;
  const line=document.getElementById('bondLevelXp');if(line)line.textContent=`${info.current.toLocaleString('it-IT')} / ${info.needed.toLocaleString('it-IT')} XP`;
  window.usBondXp=info.total;
  renderBondBadges(info.level);
}
async function hydrateBondSummary(){
  if(!window.usProfile)return;
  const {data,error}=await sb.from('couples').select('bond_xp').eq('id',window.usProfile.couple_id).maybeSingle();
  if(error){console.warn(error);return;}
  renderBondProgress(data?.bond_xp||0);
}
window.hydrateBondSummary=hydrateBondSummary;

function hashSeed(text){
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  return h>>>0;
}
async function currentQuestMode(){
  if(Number.isFinite(window.usDistanceKm))return window.usDistanceKm>50?'far':'near';
  const {data:rows}=await sb.from('couple_locations').select('user_id,latitude,longitude').eq('couple_id',window.usProfile.couple_id);
  if(!rows||rows.length<2)return 'any';
  const km=distanceKm(rows[0].latitude,rows[0].longitude,rows[1].latitude,rows[1].longitude);
  window.usDistanceKm=km;
  return km>50?'far':'near';
}
function selectInitialQuestTemplates(templates,mode,week,coupleId){
  const eligible=templates.filter(t=>t.mode==='any'||t.mode===mode).sort((a,b)=>a.key.localeCompare(b.key));
  const used=new Set();
  const slots=[
    eligible.filter(t=>['common','uncommon'].includes(t.rarity)),
    eligible.filter(t=>['uncommon','rare'].includes(t.rarity)),
    eligible.filter(t=>['rare','epic'].includes(t.rarity))
  ];
  return slots.map((pool,index)=>{
    const candidates=(pool.length?pool:eligible).filter(t=>!used.has(t.key));
    const seed=hashSeed(`${coupleId}|${week}|${index+1}|bond`);
    const picked=candidates[seed%candidates.length];
    if(picked)used.add(picked.key);
    return picked;
  }).filter(Boolean);
}
async function ensureBondWeek(){
  if(!window.usProfile)return;
  const coupleId=window.usProfile.couple_id,week=weekStartISO();
  const {data:state}=await sb.from('bond_weekly_state').select('couple_id,week_start,rerolls_used').eq('couple_id',coupleId).eq('week_start',week).maybeSingle();
  if(!state){
    const {error}=await sb.from('bond_weekly_state').insert({couple_id:coupleId,week_start:week});
    if(error&&error.code!=='23505')console.warn(error);
  }
  const {data:existing,error:questError}=await sb.from('bond_weekly_quests').select('id,slot').eq('couple_id',coupleId).eq('week_start',week).order('slot');
  if(questError){console.warn(questError);return;}
  if((existing||[]).length>=3)return;
  const [{data:templates,error:templatesError},mode]=await Promise.all([
    sb.from('bond_quest_templates').select('key,title,category,rarity,xp,mode').eq('active',true),
    currentQuestMode()
  ]);
  if(templatesError||!templates?.length){console.warn(templatesError);return;}
  const picks=selectInitialQuestTemplates(templates,mode,week,coupleId);
  const existingSlots=new Set((existing||[]).map(q=>q.slot));
  for(let i=0;i<3;i++){
    const slot=i+1,t=picks[i];
    if(existingSlots.has(slot)||!t)continue;
    const {error}=await sb.from('bond_weekly_quests').insert({couple_id:coupleId,week_start:week,slot,template_key:t.key,title:t.title,category:t.category,rarity:t.rarity,xp:t.xp});
    if(error&&error.code!=='23505')console.warn(error);
  }
}
function questCategoryIcon(category){
  return ({connection:'♡',fun:'✦',adventure:'⌁',discover:'?',memory:'▧',surprise:'✧',chill:'☕'})[category]||'✦';
}
function questCategoryLabel(category){
  return ({connection:'Connection',fun:'Fun',adventure:'Adventure',discover:'Discover',memory:'Memory',surprise:'Surprise',chill:'Chill'})[category]||category;
}
function renderBondQuest(q,state,profiles){
  const confirmed=Array.isArray(q.confirmed_by)?q.confirmed_by:[];
  const mine=confirmed.includes(window.usProfile.id);
  const partner=(profiles||[]).find(p=>p.id!==window.usProfile.id);
  const partnerConfirmed=partner?confirmed.includes(partner.id):false;
  const complete=Boolean(q.completed_at);
  const rerollsLeft=Math.max(0,3-Number(state?.rerolls_used||0));
  const canReroll=!complete&&confirmed.length===0&&rerollsLeft>0;
  const myInitial=(window.usProfile.display_name||'Tu').slice(0,1).toUpperCase();
  const partnerInitial=(partner?.display_name||'B').slice(0,1).toUpperCase();
  const confirmText=complete?`Completata · +${q.xp} XP`:mine?'✓ Confermata da te':'Ho completato questa quest';
  return `<article class="bond-quest rarity-${escapeHtml(q.rarity)} ${complete?'completed':''}">
    <div class="quest-top"><span class="quest-category"><i>${questCategoryIcon(q.category)}</i>${escapeHtml(questCategoryLabel(q.category))}</span><span class="quest-rarity">${escapeHtml(q.rarity.toUpperCase())} · +${q.xp} XP</span></div>
    <h4>${escapeHtml(q.title)}</h4>
    <div class="quest-confirmers"><span class="${mine?'checked':''}">${myInitial}${mine?' ✓':''}</span><span class="quest-link"></span><span class="${partnerConfirmed?'checked':''}">${partnerInitial}${partnerConfirmed?' ✓':''}</span><small>${complete?'XP assegnati':'Conferma di entrambi'}</small></div>
    <div class="quest-actions">
      <button type="button" class="quest-confirm ${mine||complete?'confirmed':''}" ${mine||complete?'disabled':''} onclick="confirmBondQuest('${q.id}')">${confirmText}</button>
      ${canReroll?`<button type="button" class="quest-reroll" onclick="rerollBondQuest('${q.id}')" aria-label="Cambia questa quest">↻</button>`:''}
    </div>
  </article>`;
}
async function hydrateBond(){
  if(!window.usProfile)return;
  const list=document.getElementById('bondQuestList');
  if(!list)return;
  if(list.dataset.loaded!=='1')list.innerHTML='<div class="empty-state"><div class="emoji">✦</div><b>Preparo le vostre quest…</b></div>';
  await ensureBondWeek();
  const week=weekStartISO(),coupleId=window.usProfile.couple_id;
  const [{data:state,error:stateError},{data:quests,error:questError},{data:profiles,error:profilesError},{data:couple,error:coupleError},{count:completedCount,error:countError}]=await Promise.all([
    sb.from('bond_weekly_state').select('rerolls_used').eq('couple_id',coupleId).eq('week_start',week).maybeSingle(),
    sb.from('bond_weekly_quests').select('id,slot,template_key,title,category,rarity,xp,confirmed_by,completed_at').eq('couple_id',coupleId).eq('week_start',week).order('slot'),
    sb.from('profiles').select('id,display_name,role').eq('couple_id',coupleId),
    sb.from('couples').select('bond_xp').eq('id',coupleId).maybeSingle(),
    sb.from('bond_weekly_quests').select('id',{count:'exact',head:true}).eq('couple_id',coupleId).not('completed_at','is',null)
  ]);
  if(stateError||questError||profilesError||coupleError){console.warn(stateError||questError||profilesError||coupleError);if(list.dataset.loaded!=='1')list.innerHTML='<div class="empty-state"><div class="emoji">!</div><b>Bond non disponibile</b><p>Riprova tra un momento.</p></div>';return;}
  if(countError)console.warn(countError);
  window.usBondProfiles=profiles||[];
  window.usBondState=state||{rerolls_used:0};
  window.usBondQuests=quests||[];
  renderBondProgress(couple?.bond_xp||0);
  const countEl=document.getElementById('bondCompletedCount');if(countEl)countEl.textContent=`${Number(completedCount||0)} quest completate`;
  const rerollsLeft=Math.max(0,3-Number(state?.rerolls_used||0));
  const rerollEl=document.getElementById('bondRerollsLeft');if(rerollEl)rerollEl.textContent=rerollsLeft;
  const resetEl=document.getElementById('bondWeekReset');if(resetEl)resetEl.textContent=`Nuove quest ${nextWeekLabel()}`;
  const signature=JSON.stringify([state?.rerolls_used||0,couple?.bond_xp||0,completedCount||0,(quests||[]).map(q=>[q.id,q.template_key,q.title,q.rarity,q.xp,q.confirmed_by,q.completed_at])]);
  if(list.dataset.loaded==='1'&&list.dataset.signature===signature)return;
  list.innerHTML=(quests||[]).map(q=>renderBondQuest(q,state,profiles)).join('')||'<div class="empty-state"><b>Nessuna quest disponibile.</b></div>';
  list.dataset.loaded='1';list.dataset.signature=signature;
}
window.hydrateBond=hydrateBond;
async function confirmBondQuest(id){
  if(!window.usProfile)return;
  const {data,error}=await sb.rpc('confirm_bond_quest',{target_quest_id:id});
  if(error){console.warn(error);toast('Non riesco a confermare la quest');return;}
  sendWebPushEvent('quest_confirmed',id).catch(()=>{});
  if(data?.xp_awarded){toast(`+${data.xp_awarded} Bond XP ♡`);navigator.vibrate?.([35,25,55]);}
  else toast('Confermata. Aspettiamo l’altro ♡');
  await hydrateBond();
  await hydrateBondSummary();
}
window.confirmBondQuest=confirmBondQuest;
async function rerollBondQuest(id){
  const state=window.usBondState||{rerolls_used:3};
  if(Number(state.rerolls_used)>=3)return toast('Avete finito i 3 refresh');
  const current=(window.usBondQuests||[]).find(q=>q.id===id);
  if(!current||current.completed_at||(current.confirmed_by||[]).length)return toast('Questa quest è già stata confermata');
  const mode=await currentQuestMode();
  const {data:templates,error}=await sb.from('bond_quest_templates').select('key,title,category,rarity,xp,mode').eq('active',true);
  if(error||!templates?.length){console.warn(error);return toast('Nessuna quest disponibile');}
  const used=new Set((window.usBondQuests||[]).map(q=>q.template_key));
  const candidates=templates.filter(t=>(t.mode==='any'||t.mode===mode)&&!used.has(t.key));
  if(!candidates.length)return toast('Nessuna alternativa disponibile');
  const pick=candidates[Math.floor(Math.random()*candidates.length)];
  const result=await sb.rpc('reroll_bond_quest',{target_quest_id:id,target_template_key:pick.key});
  if(result.error){console.warn(result.error);toast(result.error.message?.includes('No rerolls')?'Avete finito i 3 refresh':'Non riesco a cambiare la quest');return;}
  toast(`Nuova quest · ${3-Number(result.data?.rerolls_used||3)} refresh rimasti`);
  await hydrateBond();
}
window.rerollBondQuest=rerollBondQuest;

// ===== Ti penso =====
let usRealtimeChannel=null;
function partnerFromProfiles(profiles){return (profiles||[]).find(p=>p.id!==window.usProfile?.id)||null;}
async function getCoupleProfiles(){
  if(window.usBondProfiles?.length)return window.usBondProfiles;
  const {data,error}=await sb.from('profiles').select('id,display_name,role').eq('couple_id',window.usProfile.couple_id);
  if(error){console.warn(error);return [];}
  window.usBondProfiles=data||[];return window.usBondProfiles;
}
function relativeSignalAge(dateString){
  if(!dateString)return '';
  const ms=Math.max(0,Date.now()-new Date(dateString).getTime());
  const min=Math.floor(ms/60000);
  if(min<1)return 'proprio ora';
  if(min<60)return `${min} min fa`;
  const h=Math.floor(min/60);if(h<24)return `${h} ${h===1?'ora':'ore'} fa`;
  const d=Math.floor(h/24);return `${d} ${d===1?'giorno':'giorni'} fa`;
}
async function hydrateThink(){
  if(!window.usProfile)return;
  const [profiles,{data:rows,error},{count,error:countError}]=await Promise.all([
    getCoupleProfiles(),
    sb.from('shared_messages').select('id,sender_id,recipient_id,kind,created_at').eq('kind','think').order('created_at',{ascending:false}).limit(60),
    sb.from('shared_messages').select('id',{count:'exact',head:true}).eq('kind','think').gte('created_at',new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString())
  ]);
  if(error){console.warn(error);return;}if(countError)console.warn(countError);
  const partner=partnerFromProfiles(profiles),partnerName=partner?.display_name||'L’altra persona';
  const received=(rows||[]).find(r=>r.sender_id!==window.usProfile.id);
  const sent=(rows||[]).find(r=>r.sender_id===window.usProfile.id);
  const receivedEl=document.getElementById('thinkLastReceived');if(receivedEl)receivedEl.textContent=received?`${partnerName} ti ha pensato ${relativeSignalAge(received.created_at)}`:'Ancora nessun segnale';
  const sentEl=document.getElementById('thinkLastSent');if(sentEl)sentEl.textContent=sent?`Hai pensato a ${partnerName} ${relativeSignalAge(sent.created_at)}`:'Non ne hai ancora inviati';
  const monthEl=document.getElementById('thinkMonthCount');if(monthEl)monthEl.textContent=Number(count||0).toLocaleString('it-IT');
  const live=document.getElementById('thinkLiveText');if(live&&received)live.textContent=`Ultimo segnale da ${partnerName} · ${relativeSignalAge(received.created_at)}`;
}
window.hydrateThink=hydrateThink;
async function sendThinkSignal(){
  if(!window.usProfile)return toast('Connessione non pronta');
  const btn=document.getElementById('thinkButton');if(btn?.disabled)return;
  const profiles=await getCoupleProfiles(),partner=partnerFromProfiles(profiles);
  if(!partner)return toast('L’altro profilo non è ancora collegato');
  if(btn)btn.disabled=true;
  const {data:message,error}=await sb.from('shared_messages').insert({couple_id:window.usProfile.couple_id,sender_id:window.usProfile.id,recipient_id:partner.id,kind:'think',body:'♡'}).select('id').single();
  if(error){console.warn(error);toast('Non riesco a inviare il segnale');if(btn)btn.disabled=false;return;}
  if(message?.id)sendWebPushEvent('think',message.id).catch(()=>{});
  btn?.classList.add('sent');setTimeout(()=>btn?.classList.remove('sent'),700);
  navigator.vibrate?.([30,25,45]);
  toast(`${partner.display_name} lo saprà ♡`);
  await hydrateThink();
  syncNativeWidgetBridge().catch(()=>{});
  setTimeout(()=>{if(btn)btn.disabled=false;},1800);
}
window.sendThinkSignal=sendThinkSignal;
function handleIncomingThink(row){
  if(!row||row.kind!=='think'||row.recipient_id!==window.usProfile?.id)return;
  const partner=partnerFromProfiles(window.usBondProfiles||[]);
  toast(`${partner?.display_name||'L’altra persona'} ti pensa ♡`);
  navigator.vibrate?.([45,35,80]);
  const heart=document.getElementById('thinkButton');heart?.classList.add('received');setTimeout(()=>heart?.classList.remove('received'),900);
  hydrateThink();
  syncNativeWidgetBridge().catch(()=>{});
}
function startUsRealtime(){
  if(!window.usProfile)return;
  if(usRealtimeChannel){sb.removeChannel(usRealtimeChannel);usRealtimeChannel=null;}
  const userId=window.usProfile.id,coupleId=window.usProfile.couple_id;
  usRealtimeChannel=sb.channel(`us-live-${userId}`)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'shared_messages',filter:`recipient_id=eq.${userId}`},payload=>handleIncomingThink(payload.new))
    .on('postgres_changes',{event:'*',schema:'public',table:'bond_weekly_quests',filter:`couple_id=eq.${coupleId}`},()=>{hydrateBondSummary();if(document.getElementById('bond')?.classList.contains('active'))hydrateBond();})
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'couples',filter:`id=eq.${coupleId}`},payload=>renderBondProgress(payload.new?.bond_xp||0))
    .subscribe();
}
window.startUsRealtime=startUsRealtime;

async function hydrateCloud(){
  try{
    await hydrateToday();
    await hydrateMoments();
    await hydrateHomeMemory();
    if(!homePhotoPath)await hydrateHomePhoto(true);
    await updateHomeStatus();
    await hydrateBondSummary();
    await hydrateThink();
    if(document.getElementById('bond')?.classList.contains('active'))await hydrateBond();
  }catch(e){console.warn(e)}
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

saveAnswer = async function(){
  if(!window.usProfile || !window.todayQuestion){toast('Sync non pronta, riprova tra un attimo');return;}
  const v=document.getElementById('answer').value.trim();
  if(!v)return toast('Scrivi qualcosa prima :)');
  const btn=document.getElementById('todaySaveBtn');btn.disabled=true;btn.textContent='Salvo…';
  const {error}=await sb.from('daily_answers').upsert({
    question_id:window.todayQuestion.id,
    user_id:window.usProfile.id,
    couple_id:window.usProfile.couple_id,
    answer:v,
    updated_at:new Date().toISOString()
  },{onConflict:'question_id,user_id'});
  btn.disabled=false;
  if(error){console.warn(error);btn.textContent='Riprova';return toast('Errore sync Today');}
  toast('Salvato online ♡');
  sendWebPushEvent('daily_answer',window.todayQuestion.id).catch(()=>{});
  await hydrateToday();
}
window.saveAnswer=saveAnswer;



let swipeGesture=null;
function swipeBlockedTarget(target){
  return Boolean(target?.closest?.('input,textarea,select,button,[contenteditable="true"],.modal,.moment-viewer,.auth-overlay,.today-overlay,.us-story-viewer,.us-camera-viewer'));
}
function resetSwipeVisual(page){
  if(!page)return;
  page.style.transition='transform .11s ease-out, opacity .11s ease-out';
  page.style.transform='';
  page.style.opacity='';
  setTimeout(()=>{page.style.transition='';},120);
}
document.addEventListener('touchstart',event=>{
  if(event.touches.length!==1||swipeBlockedTarget(event.target))return;
  const activePage=document.querySelector('.page.active');
  if(!activePage||!swipePages.includes(activePage.id))return;
  const touch=event.touches[0];
  if(touch.clientX<12||touch.clientX>window.innerWidth-12)return;
  swipeGesture={page:activePage,startX:touch.clientX,startY:touch.clientY,lastX:touch.clientX,startTime:performance.now(),axis:null};
},{passive:true});
document.addEventListener('touchmove',event=>{
  if(!swipeGesture||event.touches.length!==1)return;
  const touch=event.touches[0];
  const dx=touch.clientX-swipeGesture.startX;
  const dy=touch.clientY-swipeGesture.startY;
  if(!swipeGesture.axis && (Math.abs(dx)>7||Math.abs(dy)>7)){
    swipeGesture.axis=Math.abs(dx)>Math.abs(dy)*1.08?'x':'y';
  }
  if(swipeGesture.axis!=='x')return;
  event.preventDefault();
  swipeGesture.lastX=touch.clientX;
  const index=swipePages.indexOf(swipeGesture.page.id);
  const atEdge=(dx>0&&index===0)||(dx<0&&index===swipePages.length-1);
  const resistance=atEdge ? 0.13 : 0.34;
  const visualDx=Math.max(-58,Math.min(58,dx*resistance));
  swipeGesture.page.style.transition='none';
  swipeGesture.page.style.transform=`translate3d(${visualDx}px,0,0)`;
  swipeGesture.page.style.opacity=String(Math.max(.91,1-Math.abs(visualDx)/620));
},{passive:false});
document.addEventListener('touchend',event=>{
  if(!swipeGesture)return;
  const gesture=swipeGesture;swipeGesture=null;
  const touch=event.changedTouches?.[0];
  const dx=(touch?.clientX??gesture.lastX)-gesture.startX;
  const dy=(touch?.clientY??gesture.startY)-gesture.startY;
  const elapsed=Math.max(1,performance.now()-gesture.startTime);
  const velocity=Math.abs(dx)/elapsed;
  resetSwipeVisual(gesture.page);
  if(gesture.axis!=='x'||Math.abs(dx)<34||Math.abs(dx)<Math.abs(dy)*1.05)return;
  if(Math.abs(dx)<48&&velocity<.32)return;
  const index=swipePages.indexOf(gesture.page.id);
  if(dx<0&&index<swipePages.length-1)go(swipePages[index+1],{swipe:'next'});
  else if(dx>0&&index>0)go(swipePages[index-1],{swipe:'prev'});
},{passive:true});
document.addEventListener('touchcancel',()=>{
  if(!swipeGesture)return;
  resetSwipeVisual(swipeGesture.page);
  swipeGesture=null;
},{passive:true});

setInterval(()=>{ if(window.usProfile){ hydrateToday(); refreshQuizState(); hydrateDistance(); hydrateBondSummary(); if(document.getElementById('think')?.classList.contains('active'))hydrateThink(); } },15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden && window.usProfile){hydrateCloud();refreshQuizState();maybeAutoRefreshLocation();}});
sb.auth.onAuthStateChange((_event,_session)=>{ setTimeout(initCloud,0); });
const pairBtn=document.getElementById('pairBtn');
if(pairBtn) pairBtn.addEventListener('click', pairAccount);

initCloud();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js",{updateViaCache:"none"}).catch((err) => {
      console.warn("US. service worker non registrato:", err);
    });
  });
}


document.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeToday();});
