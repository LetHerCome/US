const pages=['home','bond','moments','quiz','settings'];
const swipePages=['home','bond','moments','quiz'];
const US_MOTION_FAST_MS=180;
const US_MOTION_BASE_MS=220;
const US_MOTION_SURFACE_MS=260;
function isReducedMotion(){return Boolean(window.UsUiFoundation?.isReducedMotion?.());}
function clearPageEntry(page){page?.classList.remove('us-motion5-enter-next','us-motion5-enter-prev');}
function animatePageEntry(page,direction){
  if(!page||isReducedMotion())return;
  const entry=direction>0?'us-motion5-enter-next':'us-motion5-enter-prev';
  clearPageEntry(page);
  page.classList.add(entry);
  setTimeout(()=>page.classList.remove(entry),US_MOTION_FAST_MS);
}
function go(id,options={}){
  const current=document.querySelector('.page.active')?.id;
  if(current===id){
    if(id==='bond'&&options.nav)window.closeNoiSection?.();
    scrollTo({top:0,behavior:options.motionCommit?'auto':'smooth'});
    if(id==='moments' && window.usProfile)hydrateMoments();
    if(id==='bond' && window.usProfile){hydrateBond();hydrateNoiIdeas();}
    if(id==='settings' && window.usProfile)window.hydrateUsSettings?.();
    if(id==='home' && window.usProfile)window.refreshOggiCalendarWidget?.();
    return;
  }
  if(current==='bond')window.closeNoiSection?.();
  const direction=Math.sign(pages.indexOf(id)-pages.indexOf(current));
  pages.forEach(pageId=>{
    const el=document.getElementById(pageId);
    el.classList.remove('swipe-next','swipe-prev');
    clearPageEntry(el);
    if(pageId===id && options.swipe && !options.motionCommit)el.classList.add(options.swipe==='next'?'swipe-next':'swipe-prev');
    el.classList.toggle('active',pageId===id);
  });
  if(options.nav&&!options.motionCommit&&direction)animatePageEntry(document.getElementById(id),direction);
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===id));
  if(options.swipe&&!options.motionCommit)setTimeout(()=>document.getElementById(id)?.classList.remove('swipe-next','swipe-prev'),190);
  scrollTo({top:0,behavior:(options.swipe||options.motionCommit)?'auto':'smooth'});
  if(id==='moments' && window.usProfile) hydrateMoments();
  if(id==='bond' && window.usProfile){hydrateBond();hydrateNoiIdeas();}
  if(id==='settings' && window.usProfile) window.hydrateUsSettings?.();
  if(id==='home' && window.usProfile) window.refreshOggiCalendarWidget?.();
}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1700)}
// The one US confirmation sheet (ui-foundation); the platform dialog only as a fallback.
function usConfirm(options){const ui=window.UsUiFoundation;return ui&&typeof ui.confirm==='function'?ui.confirm(options):Promise.resolve(window.confirm(options.title));}
// Game V2 — Gioca is owned by games.js (window.USGameV2); the legacy weekly quiz UI is retired.
function openQuizHub(options={}){go('quiz',options);window.USGameV2?.showHub();}
function resetQuiz(){window.USGameV2?.showHub();}
window.openQuizHub=openQuizHub;
window.resetQuiz=resetQuiz;

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
const sb = window.supabase.createClient(SB_URL, SB_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.usDurableAuthStorage
  }
});

window.UsWidgetCredentialApi=Object.freeze({
  async issue(deviceIdHash){
    if(!window.UsPlatform?.isNative||!/^[a-f0-9]{64}$/.test(String(deviceIdHash||'')))return null;
    const {data,error}=await sb.functions.invoke('widget-device-token',{body:{operation:'issue',deviceIdHash}});
    if(error||!data?.token)throw error||new Error('Widget credential unavailable');
    return {token:data.token,expiresAt:data.expiresAt||''};
  },
  async revoke(deviceIdHash){
    if(!window.UsPlatform?.isNative||!/^[a-f0-9]{64}$/.test(String(deviceIdHash||'')))return false;
    const {error}=await sb.functions.invoke('widget-device-token',{body:{operation:'revoke',deviceIdHash}});
    if(error)throw error;
    return true;
  }
});

const US_SIGNED_URL_CACHE=new Map();
const US_SIGNED_URL_SKEW_MS=5*60*1000;
const US_SIGNED_URL_STORAGE_KEY='us:signed-url-cache:v2';

function usLoadSignedUrlCache(){
  try{
    const raw=JSON.parse(localStorage.getItem(US_SIGNED_URL_STORAGE_KEY)||'{}');
    const now=Date.now();
    for(const [path,hit] of Object.entries(raw||{})){
      if(hit?.url&&Number(hit.expiresAt||0)-now>US_SIGNED_URL_SKEW_MS){
        US_SIGNED_URL_CACHE.set(path,{url:hit.url,expiresAt:Number(hit.expiresAt)});
      }
    }
  }catch(_e){}
}
function usPersistSignedUrlCache(){
  try{
    const now=Date.now();
    const out={};
    let count=0;
    for(const [path,hit] of US_SIGNED_URL_CACHE){
      if(hit?.url&&hit.expiresAt-now>US_SIGNED_URL_SKEW_MS&&count<80){
        out[path]=hit;count++;
      }
    }
    localStorage.setItem(US_SIGNED_URL_STORAGE_KEY,JSON.stringify(out));
  }catch(_e){}
}
function usReadSignedUrlCache(path){
  const hit=US_SIGNED_URL_CACHE.get(path);
  if(!hit||!hit.url||hit.expiresAt-Date.now()<=US_SIGNED_URL_SKEW_MS){
    US_SIGNED_URL_CACHE.delete(path);
    return null;
  }
  return hit.url;
}
function usWriteSignedUrlCache(path,url,expiresIn){
  if(path&&url){
    US_SIGNED_URL_CACHE.set(path,{url,expiresAt:Date.now()+Math.max(60,Number(expiresIn)||60)*1000});
    usPersistSignedUrlCache();
  }
  return url||null;
}
usLoadSignedUrlCache();
async function usGetSignedUrl(path,expiresIn=21600){
  if(!path)return null;
  const cached=usReadSignedUrlCache(path);if(cached)return cached;
  const {data,error}=await sb.storage.from('us-media').createSignedUrl(path,expiresIn);
  if(error||!data?.signedUrl){if(error)console.warn('[US Media] signed url',error);return null;}
  return usWriteSignedUrlCache(path,data.signedUrl,expiresIn);
}
async function usGetSignedUrls(paths,expiresIn=21600){
  const unique=[...new Set((paths||[]).filter(Boolean))];
  const result=new Map(),missing=[];
  for(const path of unique){
    const cached=usReadSignedUrlCache(path);
    if(cached)result.set(path,cached);else missing.push(path);
  }
  if(!missing.length)return result;
  const bucket=sb.storage.from('us-media');
  if(typeof bucket.createSignedUrls==='function'){
    const {data,error}=await bucket.createSignedUrls(missing,expiresIn);
    if(!error&&Array.isArray(data)){
      for(const item of data){
        if(item?.signedUrl&&item?.path){
          result.set(item.path,usWriteSignedUrlCache(item.path,item.signedUrl,expiresIn));
        }
      }
    }else if(error)console.warn('[US Media] batch signed urls',error);
  }
  const unresolved=missing.filter(path=>!result.has(path));
  if(unresolved.length){
    const fallback=await Promise.all(unresolved.map(async path=>[path,await usGetSignedUrl(path,expiresIn)]));
    for(const [path,url] of fallback)if(url)result.set(path,url);
  }
  return result;
}
window.usGetSignedUrl=usGetSignedUrl;
window.usGetSignedUrls=usGetSignedUrls;

// ===== US v20 · Web Push Foundation =====
const US_VAPID_PUBLIC_KEY='BChjUsr-rF5fq-qgLrbsFn76z9GQaWJ7-a-_UX0gzU6hkSRC4r4GLwmQLtkuad_ntDBE6Fhr76jr_r7OBQdfuss';
let usPushUiBusy=false;
let usPushOperationInFlight=null;
let usPendingPushTarget=null;

function isIosDevice(){return /iphone|ipad|ipod/i.test(navigator.userAgent||'');}
function isStandaloneUs(){return Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches||window.navigator.standalone===true);}
function isWebPushSupported(){return !window.__US_LOCAL_DEV__&&window.UsPlatform?.canUseWebPush!==false&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}
function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);const out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}
function canUseUsServiceWorker(){return !window.__US_LOCAL_DEV__&&window.UsPlatform?.canUseServiceWorker!==false&&'serviceWorker' in navigator;}
async function getUsServiceWorkerRegistration(){
  if(!canUseUsServiceWorker())return null;
  await navigator.serviceWorker.register('/service-worker.js',{updateViaCache:'none'});
  return navigator.serviceWorker.ready;
}
async function getCurrentPushSubscription(){
  try{const reg=await getUsServiceWorkerRegistration();return reg?await reg.pushManager.getSubscription():null;}catch(error){console.warn('[US Push] subscription check',error);return null;}
}
async function syncPushSubscriptionToSupabase(subscription){
  if(!subscription||!window.usProfile)return false;
  const json=subscription.toJSON();
  const signature=JSON.stringify([json.endpoint,json.keys?.p256dh||'',json.keys?.auth||'',json.expirationTime??null]);
  const cacheKey=`us:push:subscription:${window.usProfile.id}`;
  try{if(localStorage.getItem(cacheKey)===signature)return true;}catch(_e){}
  const {error}=await sb.rpc('register_web_push_subscription',{
    target_endpoint:json.endpoint,
    target_p256dh:json.keys?.p256dh||'',
    target_auth:json.keys?.auth||'',
    target_expiration_time:json.expirationTime??null,
    target_user_agent:(navigator.userAgent||'').slice(0,500)
  });
  if(error){console.warn('[US Push] subscription sync failed',error);return false;}
  try{localStorage.setItem(cacheKey,signature);}catch(_e){}
  return true;
}
async function sendWebPushEvent(type,referenceId=null,extra={}){
  try{
    const {data:{session}}=await sb.auth.getSession();
    if(!session?.access_token)return null;
    // M11D: Game V2 events have their own function; send-web-push is unchanged.
    const endpoint=String(type).startsWith('game_')?'game-v2-push':'send-web-push';
    const response=await fetch(`${SB_URL}/functions/v1/${endpoint}`,{
      method:'POST',
      // keepalive: la richiesta sopravvive se la PWA va in background o si chiude subito dopo l'invio.
      keepalive:true,
      headers:{'Content-Type':'application/json','apikey':SB_KEY,'Authorization':`Bearer ${session.access_token}`},
      body:JSON.stringify({type,reference_id:referenceId||undefined,...extra})
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
    if(text)text.textContent='Su iPhone le notifiche funzionano solo dall’app installata.';
    if(button)button.hidden=true;
    if(settings)settings.hidden=true;
    return;
  }
  if(Notification.permission==='denied'){
    card.hidden=false;card.classList.add('denied');
    if(title)title.textContent='Notifiche disattivate';
    if(text)text.textContent='Riattivale dalle impostazioni del telefono.';
    if(button)button.hidden=true;
    setPushSettingsState('denied','Notifiche bloccate','Riattivale dalle impostazioni del telefono.','');
    return;
  }
  const subscription=await getCurrentPushSubscription();
  if(Notification.permission==='granted'&&subscription){
    await syncPushSubscriptionToSupabase(subscription);
    card.hidden=true;
    setPushSettingsState('active','Notifiche attive','Anche a US chiusa.','Disattiva');
    return;
  }
  card.hidden=false;
  if(title)title.textContent='Attiva le notifiche';
  if(text)text.textContent='Ti penso, risposte e quest, anche a US chiusa.';
  if(button){button.hidden=false;button.disabled=false;button.textContent=Notification.permission==='granted'?'Completa attivazione':'Attiva';}
  setPushSettingsState('inactive','Notifiche non attive','','Attiva');
}
window.refreshWebPushUi=refreshWebPushUi;

async function enableWebPush(){
  if(usPushUiBusy||!window.usProfile)return;
  if(!isWebPushSupported())return toast('Notifiche non supportate su questo browser');
  if(isIosDevice()&&!isStandaloneUs())return refreshWebPushUi();
  const button=document.getElementById('pushEnableBtn');
  let finishOperation;
  const operationDone=new Promise(resolve=>{finishOperation=resolve;});
  usPushOperationInFlight=operationDone;
  usPushUiBusy=true;if(button){button.disabled=true;button.textContent='Attivo…';}
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
  finally{
    usPushUiBusy=false;if(button)button.disabled=false;
    if(usPushOperationInFlight===operationDone)usPushOperationInFlight=null;
    finishOperation();
  }
}
window.enableWebPush=enableWebPush;

async function disableWebPush(options={}){
  const silent=options?.silent===true;
  if(silent&&usPushOperationInFlight)try{await usPushOperationInFlight;}catch(_e){}
  if(usPushUiBusy)return false;
  let finishOperation;
  const operationDone=new Promise(resolve=>{finishOperation=resolve;});
  usPushOperationInFlight=operationDone;
  usPushUiBusy=true;
  const refreshUi=options?.refreshUi!==false;
  const profileId=options?.profileId||window.usProfile?.id||'';
  let subscription=null;
  let disableFailed=false;
  try{
    subscription=await getCurrentPushSubscription();
    if(subscription){
      try{
        const {error}=await sb.rpc('remove_web_push_subscription',{target_endpoint:subscription.endpoint});
        if(error)console.warn('[US Push] remove subscription',error);
      }catch(error){disableFailed=true;console.warn('[US Push] remove subscription',error);}
      try{await subscription.unsubscribe();}catch(error){console.warn('[US Push] unsubscribe',error);}
    }
    try{if(profileId)localStorage.removeItem(`us:push:subscription:${profileId}`);}catch(_e){}
    if(!silent)toast(disableFailed?'Non riesco a disattivare le notifiche':'Notifiche disattivate');
    return !disableFailed;
  }catch(error){
    console.warn('[US Push] disable failed',error);
    if(!silent)toast('Non riesco a disattivare le notifiche');
    return false;
  }finally{
    usPushUiBusy=false;
    if(refreshUi)try{await refreshWebPushUi();}catch(error){console.warn('[US Push] refresh after disable',error);}
    if(usPushOperationInFlight===operationDone)usPushOperationInFlight=null;
    finishOperation();
  }
}
window.disableWebPush=disableWebPush;

function performPushNavigation(target){
  if(!target)return;
  if(!window.usProfile){usPendingPushTarget=target;return;}
  if(target==='today'){openToday();return;}
  if(target==='left_for_you'){
    if(document.querySelector('.page.active')?.id!=='home')go('home',{motionCommit:true});
    setTimeout(()=>window.openLeftForYou?.(),120);
    return;
  }
  if(target==='quiz'){openQuizHub();return;}
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
if(canUseUsServiceWorker()){navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='US_PUSH_NAVIGATE')performPushNavigation(event.data.target);});}


let selectedRole = null;

async function clearPrivateDeviceState(profileId=window.usProfile?.id||''){
  try{US_SIGNED_URL_CACHE.clear();}catch(_e){}
  const storageKeys=[
    'us:fix4:last-profile',
    US_SIGNED_URL_STORAGE_KEY,
    US_HOME_BOOT_CACHE_KEY,
    'us:home-photo:boot:v1'
  ];
  if(profileId)storageKeys.push(`us:push:subscription:${profileId}`);
  for(const key of storageKeys){
    try{localStorage.removeItem(key);}catch(_e){}
  }
  try{await caches.delete('us-private-media-v1');}catch(error){console.warn('[US Logout] private media cache',error);}
}

async function revokeCurrentDevice(){
  const profileId=window.usProfile?.id||'';
  try{await disableWebPush({silent:true,refreshUi:false,profileId});}catch(error){console.warn('[US Logout] push revoke',error);}
  try{await clearPrivateDeviceState(profileId);}catch(error){console.warn('[US Logout] private cleanup',error);}
  try{await window.UsThinkWidget?.clear?.();}catch(error){console.warn('[US Logout] widget cleanup',error);}
}
window.revokeCurrentDevice=revokeCurrentDevice;

let usInitCloudInFlight=null;

function usRunWhenIdle(task,timeout=1000){
  const run=()=>Promise.resolve().then(task).catch(error=>console.warn('[US Boot] deferred task',error));
  if('requestIdleCallback' in window){
    requestIdleCallback(run,{timeout});
    return;
  }
  setTimeout(run,Math.min(120,timeout));
}

async function initCloud(){
  if(usInitCloudInFlight)return usInitCloudInFlight;

  usInitCloudInFlight=(async()=>{
    let cachedDeviceProfile=null;
    try{
      const cached=JSON.parse(localStorage.getItem('us:fix4:last-profile')||'null');
      if(cached?.id&&cached?.couple_id)cachedDeviceProfile=cached;
    }catch(_e){}

    let { data: { session } } = await sb.auth.getSession();

    // A returning PWA can briefly report no session while its durable
    // IndexedDB storage is warming. Never flash the pairing UI for that race.
    if(!session&&cachedDeviceProfile){
      // Cold PWA launch: give durable storage time to resolve, but never force
      // refreshSession here. Supabase auto-refresh + its lock own token rotation.
      await new Promise(resolve=>setTimeout(resolve,420));
      try{
        const retry=await sb.auth.getSession();
        session=retry?.data?.session||null;
      }catch(_e){}
    }

    if(!session){
      resetNoiIdeasForIdentityChange();
      window.usProfile = null;
      window.UsThinkWidget?.clear?.().catch(()=>{});
      document.documentElement.classList.remove('us-returning-device','us-auth-pending');
      setCloudBadge(false,'offline');
      document.getElementById('authOverlay').classList.remove('hidden');
      showAuthStep('authPair');
      window.dispatchEvent(new CustomEvent('us-auth-resolved',{detail:{paired:false}}));
      return;
    }

    // The device is already paired: show the shell immediately from the
    // profile snapshot while Supabase validates/freshens it in background.
    let cachedProfile=null;
    try{
      if(cachedDeviceProfile?.id===session.user.id)cachedProfile=cachedDeviceProfile;
    }catch(_e){}

    if(cachedProfile){
      resetNoiIdeasForIdentityChange();
      window.usProfile=cachedProfile;
      selectedRole=cachedProfile.role;
      document.getElementById('authOverlay').classList.add('hidden');
      setCloudBadge(true,cachedProfile.display_name||'sync');
    }

    const {data:freshProfile,error}=await sb.from('profiles')
      .select('id,display_name,role,couple_id,avatar_path')
      .eq('id',session.user.id)
      .maybeSingle();

    if(error)console.warn(error);
    const profile=freshProfile||cachedProfile;

    if(!profile){
      resetNoiIdeasForIdentityChange();
      window.usProfile = null;
      window.UsThinkWidget?.clear?.().catch(()=>{});
      document.documentElement.classList.remove('us-returning-device','us-auth-pending');
      setCloudBadge(false,'da collegare');
      document.getElementById('authOverlay').classList.remove('hidden');
      if(session.user && !session.user.is_anonymous){
        // Permanent authenticated user without a valid US profile:
        // show an error, never create or migrate anything.
        showAuthStep('authLogin');
        const st=document.getElementById('loginStatus');
        if(st)st.textContent='Nessun profilo US valido associato a questo account. Accesso negato.';
      }else{
        showAuthStep('authPair');
      }
      window.dispatchEvent(new CustomEvent('us-auth-resolved',{detail:{paired:false}}));
      return;
    }

    resetNoiIdeasForIdentityChange();
    window.usProfile = profile;
    window.UsThinkWidget?.authReady?.(profile).catch(error=>console.warn('[US Widget] auth ready',error));
    selectedRole = profile.role;
    try{localStorage.setItem('us:fix4:last-profile',JSON.stringify(profile));}catch(_e){}
    document.getElementById('authOverlay').classList.add('hidden');
    document.documentElement.classList.remove('us-auth-pending');
    document.documentElement.classList.add('us-auth-ready','us-returning-device');
    window.dispatchEvent(new CustomEvent('us-auth-resolved',{detail:{paired:true}}));
    setCloudBadge(true, profile.display_name);
    const syncBadge=document.getElementById('syncReadyBadge');
    if(syncBadge)syncBadge.textContent='SYNC ATTIVO';

    // First usable Home paint wins. Live subscriptions and device maintenance
    // start immediately after, but no longer compete with the first image/data.
    hydrateCloud().catch(error=>console.warn('[US Boot] hydrate',error));

    usRunWhenIdle(()=>startUsRealtime(),420);
    usRunWhenIdle(()=>startLocationRefreshTimer(),650);
    usRunWhenIdle(()=>hydrateProfileAvatars(),520);
    usRunWhenIdle(()=>maybeAutoRefreshLocation('launch'),1400);
    usRunWhenIdle(()=>refreshWebPushUi(),1100);
    usRunWhenIdle(()=>hydrateThink(),900);

    // Push navigation itself is user intent, so keep it immediate.
    flushPendingPushTarget();
  })();

  try{
    return await usInitCloudInFlight;
  }finally{
    usInitCloudInFlight=null;
  }
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


// ===== M12A — Location V2: ambient, automatic distance =====
// The distance refreshes itself; nobody is asked to press "Aggiorna".
//  - Triggers (event driven, no polling loop): US ready after launch, return to
//    the foreground, and a slow visible-only check while the session stays open.
//  - A reading is FRESH for 10 min (no geolocation call at all), becomes
//    eligible for an automatic refresh after that, and is shown as STALE (quiet
//    capsule, value kept) after 60 min.
//  - Geolocation is only asked automatically when the browser already says
//    "granted" (or cannot tell and the user enabled it before). "prompt" never
//    triggers a dialog by itself; "denied" stops everything until the browser
//    permission changes. Failures keep the last good distance and back off.
let locationRefreshInFlight=false;
let locationTimer=null;
const US_LOCATION_FRESH_MS=10*60*1000;
const US_LOCATION_STALE_DISPLAY_MS=60*60*1000;
const US_LOCATION_MIN_GAP_MS=45*1000;
const US_LOCATION_FAILURE_BACKOFF_MS=5*60*1000;
const US_LOCATION_CHECK_INTERVAL_MS=5*60*1000;
const usLocationRuntime={permission:'unknown',lastAttemptAt:0,lastFailureAt:0,mineUpdatedAt:null,watching:false,snapshot:null,rows:null};

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
function locationAgeMs(dateString){
  const timestamp=Date.parse(dateString||'');
  return Number.isFinite(timestamp)?Math.max(0,Date.now()-timestamp):Infinity;
}
function validCoordinate(value,min,max){
  const number=Number(value);
  return Number.isFinite(number)&&number>=min&&number<=max;
}

function formatDistance(km){
  const unit=localStorage.getItem('us:settings:distance-unit')||'km';
  if(unit==='mi'){
    const miles=km*0.621371;
    if(miles<0.1)return `${Math.max(1,Math.round(km*3280.84))} ft`;
    if(miles<10)return `${miles.toFixed(1).replace('.',',')} mi`;
    return `${Math.round(miles).toLocaleString('it-IT')} mi`;
  }
  if(km<1)return `${Math.max(1,Math.round(km*1000))} m`;
  if(km<10)return `${km.toFixed(1).replace('.',',')} km`;
  return `${Math.round(km).toLocaleString('it-IT')} km`;
}

// Pure: should an automatic geolocation read happen right now?
function decideLocationRefresh({now=Date.now(),mineUpdatedAt=null,lastAttemptAt=0,lastFailureAt=0,permission='unknown',enabledBefore=false,hidden=false,inFlight=false}={}){
  if(inFlight)return {refresh:false,why:'in-flight'};
  if(hidden)return {refresh:false,why:'hidden'};
  if(permission==='denied')return {refresh:false,why:'denied'};
  if(permission==='prompt')return {refresh:false,why:'needs-user-permission'};
  if(permission!=='granted'&&!enabledBefore)return {refresh:false,why:'not-enabled'};
  if(lastAttemptAt&&now-lastAttemptAt<US_LOCATION_MIN_GAP_MS)return {refresh:false,why:'too-soon'};
  if(lastFailureAt&&now-lastFailureAt<US_LOCATION_FAILURE_BACKOFF_MS)return {refresh:false,why:'failure-backoff'};
  const updated=Date.parse(mineUpdatedAt||'');
  if(Number.isFinite(updated)&&now-updated<US_LOCATION_FRESH_MS)return {refresh:false,why:'fresh'};
  return {refresh:true,why:Number.isFinite(updated)?'stale':'no-reading'};
}

// Pure: what the capsule says. `snapshot` is the last known couple reading.
function distanceCapsuleModel({mine=null,partner=null,partnerName='',permission='unknown',supported=true,now=Date.now()}={}){
  if(!supported)return {state:'unsupported',visible:false,text:'',detail:'Posizione non disponibile'};
  const coords=row=>row&&validCoordinate(row.latitude,-90,90)&&validCoordinate(row.longitude,-180,180);
  if(!mine){
    if(permission==='denied')return {state:'denied',visible:true,text:'Posizione non disponibile',detail:'Riattivala dalle impostazioni del telefono.'};
    if(permission==='granted')return {state:'pending',visible:false,text:'',detail:''};
    return {state:'needs-permission',visible:true,text:'Attiva posizione',detail:'Serve solo per la distanza tra voi.'};
  }
  if(!partner)return {state:'waiting',visible:true,text:'In attesa',detail:`In attesa di ${partnerName||'chi ami'}`,age:mine.updated_at};
  if(!coords(mine)||!coords(partner))return {state:'unavailable',visible:true,text:'Posizione non disponibile',detail:'Coordinate non valide.'};
  const km=distanceKm(Number(mine.latitude),Number(mine.longitude),Number(partner.latitude),Number(partner.longitude));
  const oldest=Math.max(locationAgeMs(mine.updated_at),locationAgeMs(partner.updated_at));
  const stale=oldest>US_LOCATION_STALE_DISPLAY_MS;
  const older=locationAgeMs(mine.updated_at)>=locationAgeMs(partner.updated_at)?mine.updated_at:partner.updated_at;
  return {state:stale?'stale':'ready',visible:true,km,text:formatDistance(km),detail:`${formatDistance(km)} tra voi`,age:older,stale};
}

function renderDistanceCapsule(model){
  const root=document.getElementById('distanceWidget');
  const value=document.getElementById('distanceValue');
  if(!root||!value)return;
  root.hidden=!model.visible;
  root.dataset.usDistanceState=model.state;
  value.textContent=model.text||'';
  root.setAttribute('aria-label',model.visible?`Distanza tra voi: ${model.text}`:'Distanza tra voi');
}

// Last good reading (shown again on any temporary failure) + current model.
function applyLocationRows(rows){
  const mine=(rows||[]).find(row=>row.user_id===window.usProfile.id)||null;
  const partner=(rows||[]).find(row=>row.user_id!==window.usProfile.id)||null;
  usLocationRuntime.rows=rows||[];
  usLocationRuntime.mineUpdatedAt=mine?.updated_at||null;
  const partnerName=window.usProfile.role==='francesco'?'Beatrice':'Francesco';
  const model=distanceCapsuleModel({mine,partner,partnerName,permission:usLocationRuntime.permission,supported:Boolean(navigator.geolocation)});
  if(model.km!==undefined)window.usDistanceKm=model.km;
  usLocationRuntime.snapshot=model;
  renderDistanceCapsule(model);
  return model;
}

async function hydrateDistance(){
  if(!window.usProfile)return;
  const {data:rows,error}=await sb.from('couple_locations')
    .select('user_id,latitude,longitude,accuracy_m,updated_at')
    .eq('couple_id',window.usProfile.couple_id);
  // A failed read never replaces a valid last-known distance.
  if(error){console.warn(error);return;}
  return applyLocationRows(rows);
}
window.hydrateDistance=hydrateDistance;

async function saveMyLocation(position){
  if(window.__US_LOCAL_DEV__)return false;
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
  usLocationRuntime.lastFailureAt=Date.now();
  if(error?.code===1){
    // Permission refused: stop trying until the browser permission changes.
    usLocationRuntime.permission='denied';
    localStorage.removeItem('usLocationEnabled');
    if(!silent)toast('Permesso posizione non attivo');
  }else if(!silent)toast('Non riesco ad aggiornare la posizione');
  // The last good distance (if any) stays on screen.
  return hydrateDistance();
}

// Manual entry point: only the genuine "Attiva posizione" / Settings paths use
// it without `silent`. Automatic refreshes always pass {silent:true}.
function refreshMyLocation(options={}){
  if(window.__US_LOCAL_DEV__)return;
  const silent=Boolean(options?.silent);
  if(!window.usProfile)return toast('Connessione non pronta');
  if(!navigator.geolocation){
    renderDistanceCapsule(distanceCapsuleModel({supported:false}));
    return;
  }
  if(locationRefreshInFlight)return;
  locationRefreshInFlight=true;
  usLocationRuntime.lastAttemptAt=Date.now();
  navigator.geolocation.getCurrentPosition(async position=>{
    try{
      usLocationRuntime.permission='granted';
      await saveMyLocation(position);
      usLocationRuntime.lastFailureAt=0;
      await hydrateDistance();
      if(!silent)toast('Distanza aggiornata ♡');
    }catch(error){
      usLocationRuntime.lastFailureAt=Date.now();
      console.warn(error);
      if(!silent)toast('Errore sync posizione');
    }finally{
      locationRefreshInFlight=false;
    }
  },error=>{
    locationRefreshInFlight=false;
    geolocationError(error,silent);
  },{
    // A city-to-city distance does not need GPS: cheap reads for automatic refreshes.
    enableHighAccuracy:!silent,
    timeout:silent?15000:20000,
    maximumAge:silent?120000:0
  });
}
window.refreshMyLocation=refreshMyLocation;

async function locationPermissionState(){
  try{
    if(!navigator.permissions?.query)return 'unknown';
    const permission=await navigator.permissions.query({name:'geolocation'});
    return permission.state||'unknown';
  }catch(_e){return 'unknown';}
}
function watchLocationPermission(){
  if(usLocationRuntime.watching||!navigator.permissions?.query)return;
  usLocationRuntime.watching=true;
  navigator.permissions.query({name:'geolocation'}).then(permission=>{
    permission.onchange=()=>{
      usLocationRuntime.permission=permission.state||'unknown';
      usLocationRuntime.lastFailureAt=0;
      if(permission.state==='granted')refreshMyLocation({silent:true});
      else hydrateDistance();
    };
  }).catch(()=>{usLocationRuntime.watching=false;});
}

// Called for: launch, foreground return, and the slow visible-only check.
async function maybeAutoRefreshLocation(reason='resume'){
  if(window.__US_LOCAL_DEV__)return;
  if(!window.usProfile)return;
  if(!navigator.geolocation){renderDistanceCapsule(distanceCapsuleModel({supported:false}));return;}
  await hydrateDistance();
  usLocationRuntime.permission=await locationPermissionState();
  watchLocationPermission();
  if(usLocationRuntime.rows)applyLocationRows(usLocationRuntime.rows);
  const decision=decideLocationRefresh({
    mineUpdatedAt:usLocationRuntime.mineUpdatedAt,
    lastAttemptAt:usLocationRuntime.lastAttemptAt,
    lastFailureAt:usLocationRuntime.lastFailureAt,
    permission:usLocationRuntime.permission,
    enabledBefore:localStorage.getItem('usLocationEnabled')==='1',
    hidden:document.hidden,
    inFlight:locationRefreshInFlight
  });
  if(decision.refresh)refreshMyLocation({silent:true});
  return {reason,...decision};
}

// Slow, visible-only safety net for a session that simply stays open. It asks
// the same policy as every other trigger, so a fresh reading never reads GPS.
function startLocationRefreshTimer(){
  if(window.__US_LOCAL_DEV__)return;
  if(locationTimer)clearInterval(locationTimer);
  locationTimer=setInterval(()=>{
    if(window.__US_LOCAL_DEV__)return;
    if(document.hidden||!window.usProfile)return;
    maybeAutoRefreshLocation('check').catch(()=>{});
  },US_LOCATION_CHECK_INTERVAL_MS);
}

// The capsule's only interaction: a tiny sheet (same canonical surface as every
// confirmation). "Attiva posizione" exists only where the permission is
// genuinely still needed; there is never a manual refresh.
async function openDistanceDetail(){
  const model=usLocationRuntime.snapshot||distanceCapsuleModel({permission:usLocationRuntime.permission,supported:Boolean(navigator.geolocation)});
  const ui=window.UsUiFoundation;
  if(model.state==='needs-permission'){
    const ok=await ui?.confirm?.({kicker:'POSIZIONE',title:'Attiva la posizione',body:model.detail,confirmLabel:'Attiva',cancelLabel:'Non ora'});
    if(ok)refreshMyLocation({});
    return;
  }
  const age=model.age?`Aggiornata ${relativeLocationAge(model.age)}`:'';
  await ui?.notice?.({kicker:'DISTANZA',title:model.detail||'Posizione non disponibile',body:age});
}
window.openDistanceDetail=openDistanceDetail;

function setAvatarSlot(containerId,signedUrl){
  const root=document.getElementById(containerId);if(!root)return;
  const img=root.querySelector('img'),fallback=root.querySelector('.fallback');
  if(signedUrl){img.src=signedUrl;img.hidden=false;if(fallback)fallback.style.display='none';}
  else{img.removeAttribute('src');img.hidden=true;if(fallback)fallback.style.display='grid';}
}

async function signedAvatarUrl(path){
  return usGetSignedUrl(path,21600);
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
      if(img){
        if(url){img.src=url;img.hidden=false;if(fallback)fallback.style.display='none';}
        else{img.removeAttribute('src');img.hidden=true;if(fallback)fallback.style.display='grid';}
      }
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
  const btn=document.getElementById('profileAvatarBtn');
  if(btn)btn.disabled=true;
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
  finally{if(btn)btn.disabled=false;document.getElementById('profileAvatarFile').value='';}
}

const profileAvatarFile=document.getElementById('profileAvatarFile');
if(profileAvatarFile)profileAvatarFile.addEventListener('change',(event)=>uploadProfilePhoto(event.target.files?.[0]||null));


let homePhotoRotationTimer=null;
let homePhotoActiveLayer='A';
let homePhotoHourKey='';
let homePhotoPath='';
let homePhotoRequestId=0;
let homePhotoHasPainted=false;
const US_HOME_BOOT_CACHE_KEY='us:boot:home-photo:v1';

function readHomeBootCache(hourKey){
  try{
    const cached=JSON.parse(localStorage.getItem(US_HOME_BOOT_CACHE_KEY)||'null');
    if(!cached?.url||!cached?.path||!cached?.coupleId)return null;
    if(cached.coupleId!==window.usProfile?.couple_id)return null;
    if(Number(cached.expiresAt||0)-Date.now()<60*1000)return null;
    return {...cached,currentHour:cached.hourKey===hourKey};
  }catch(_e){return null;}
}
function writeHomeBootCache(hourKey,path,url){
  try{
    localStorage.setItem(US_HOME_BOOT_CACHE_KEY,JSON.stringify({
      coupleId:window.usProfile?.couple_id||'',
      hourKey,
      path,
      url,
      // Home URLs now last 6h. Keep a safety margin.
      expiresAt:Date.now()+5.5*60*60*1000
    }));
  }catch(_e){}
}

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
  if(error){console.warn(error);return undefined;}
  if(rows?.length){
    const key=homeRotationKey();
    let idx=homeStableIndex(`${window.usProfile.couple_id}|${key}|home`,rows.length);
    if(rows.length>1&&rows[idx]?.storage_path===homePhotoPath)idx=(idx+1)%rows.length;
    return rows[idx]?.storage_path||null;
  }
  const {data:couple,error:coupleError}=await sb.from('couples').select('home_photo_path').eq('id',window.usProfile.couple_id).maybeSingle();
  if(coupleError){console.warn(coupleError);return undefined;}
  return couple?.home_photo_path||null;
}

function crossfadeHomePhoto(url){
  const requestId=++homePhotoRequestId;
  const hero=document.getElementById('homeHero');
  const empty=document.getElementById('homeEmptyState');
  const nextKey=homePhotoActiveLayer==='A'?'B':'A';
  const current=document.getElementById(`homePhotoLayer${homePhotoActiveLayer}`);
  const next=document.getElementById(`homePhotoLayer${nextKey}`);
  if(!hero||!current||!next)return;
  const apply=()=>{
    if(requestId!==homePhotoRequestId)return;
    const firstValid=Boolean(url)&&!homePhotoHasPainted;
    hero.classList.toggle('is-empty',!url);
    if(empty)empty.hidden=Boolean(url);
    if(!url&&typeof layoutOggiEmptyState==='function')requestAnimationFrame(layoutOggiEmptyState);
    next.style.backgroundImage=url?`url("${url}")`:'';
    const paint=()=>{
      next.classList.add('active');
      current.classList.remove('active');
      homePhotoActiveLayer=nextKey;
      if(url)homePhotoHasPainted=true;
      else homePhotoHasPainted=false;
    };
    if(firstValid){
      hero.setAttribute('data-us-home-photo-instant','');
      paint();
      requestAnimationFrame(()=>hero.removeAttribute('data-us-home-photo-instant'));
      return;
    }
    requestAnimationFrame(paint);
  };
  if(!url){apply();return;}
  const preload=new Image();
  preload.onload=async()=>{
    try{if(typeof preload.decode==='function')await preload.decode();}catch(_e){}
    apply();
  };
  preload.onerror=()=>console.warn('[US Home] preload foto fallito');
  preload.src=url;
}

async function hydrateHomePhoto(force=false){
  if(!window.usProfile)return;
  const hourKey=homeRotationKey();
  if(!force && homePhotoHourKey===hourKey && homePhotoPath)return;

  // Paint the previous valid image first, even if the rotation hour changed.
  // Then refresh the correct hourly image silently in the background.
  if(!force && !homePhotoPath){
    const cached=readHomeBootCache(hourKey);
    if(cached){
      homePhotoHourKey=cached.hourKey||'';
      homePhotoPath=cached.path;
      crossfadeHomePhoto(cached.url);
      if(cached.currentHour)return;
    }
  }

  const path=await getHomeRotationPath();
  if(path===undefined)return;
  homePhotoHourKey=hourKey;
  if(!path){
    homePhotoPath='';
    try{localStorage.removeItem(US_HOME_BOOT_CACHE_KEY);}catch(_e){}
    crossfadeHomePhoto('');
    return;
  }
  if(!force && path===homePhotoPath){
    // It is already visible; only normalize the current rotation key.
    homePhotoHourKey=hourKey;
    return;
  }
  const signedUrl=await usGetSignedUrl(path,21600);
  if(!signedUrl)return;
  homePhotoPath=path;
  writeHomeBootCache(hourKey,path,signedUrl);
  crossfadeHomePhoto(signedUrl);
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

// M6E — Oggi calendar widget + Focus Photo. A single small glass card, fed by
// calendar.js's window.getOggiCalendarInsightSource() (which itself reuses
// UsCalendarDomain.computeFreeTogether — no algorithm is duplicated here).
// Tapping it opens the existing Calendar on the exact date carried by the
// fact; tapping the hero background instead toggles Focus Photo, fading this
// widget plus the two pre-existing hero overlays (distance pill, push card)
// while the photo and the bottom nav stay fully usable.
function renderOggiCalendarWidget(fact){
  const container=document.getElementById('usOggiCalendarWidget');
  if(!container)return;
  if(!fact){container.hidden=true;container.innerHTML='';return;}
  if(fact.type==='loading'){
    container.hidden=false;
    container.innerHTML='<div class="us-oggi-card is-loading" aria-hidden="true"></div>';
    return;
  }
  container.hidden=false;
  container.innerHTML=`<button type="button" class="us-oggi-card" data-us-oggi-date="${escapeHtml(fact.dateISO)}" aria-label="${escapeHtml(fact.title)}: ${escapeHtml(fact.detail)}"><span class="us-oggi-card-mark" aria-hidden="true">♡</span><span class="us-oggi-card-copy"><b>${escapeHtml(fact.title)}</b><small>${escapeHtml(fact.detail)}</small></span></button>`;
}
document.getElementById('usOggiCalendarWidget')?.addEventListener('click',event=>{
  const btn=event.target.closest?.('[data-us-oggi-date]');
  if(!btn)return;
  window.openCalendarSurface?.(btn.dataset.usOggiDate);
});
let usOggiCalendarRefreshId=0;
async function refreshOggiCalendarWidget(){
  // The id bumps before the no-profile early return too, so a logout/re-pair
  // that fires while a previous refresh is still in flight always invalidates
  // it — otherwise that stale call could still land its render after this one.
  const refreshId=++usOggiCalendarRefreshId;
  if(!window.usProfile){renderOggiCalendarWidget(null);return;}
  const profileId=window.usProfile.id;
  const coupleId=window.usProfile.couple_id;
  // A newer refresh (refreshId mismatch) already owns the UI — leave it alone.
  // Same generation but the identity moved (re-pair/logout) must clear the
  // stale card rather than silently keeping whatever was on screen before.
  const isCurrentGeneration=()=>refreshId===usOggiCalendarRefreshId;
  const identityUnchanged=()=>Boolean(window.usProfile)&&window.usProfile.id===profileId&&window.usProfile.couple_id===coupleId;
  renderOggiCalendarWidget({type:'loading'});
  try{
    const fact=await window.getOggiCalendarInsightSource?.();
    if(!isCurrentGeneration())return;
    if(!identityUnchanged()){renderOggiCalendarWidget(null);return;}
    renderOggiCalendarWidget(fact||null);
  }catch(error){
    console.warn('[US Oggi] calendar widget',error);
    if(!isCurrentGeneration())return;
    if(!identityUnchanged()){renderOggiCalendarWidget(null);return;}
    renderOggiCalendarWidget(null);
  }
}
window.refreshOggiCalendarWidget=refreshOggiCalendarWidget;
window.UsOggiCalendarWidget=Object.freeze({render:renderOggiCalendarWidget,refresh:refreshOggiCalendarWidget});

// Focus Photo: a tap anywhere on the hero background toggles it; a tap on the
// widget itself, the distance pill, the push card or the empty-state CTA
// never does (they keep their own taps).
function oggiIsWidgetTarget(target){
  return Boolean(target&&typeof target.closest==='function'&&target.closest('.us-oggi-stack,.us-oggi-widgets,.home-distance-pill,.push-optin-card,.home-empty-state'));
}
let usOggiFocusPhotoActive=false;
function setOggiFocusPhoto(active){
  usOggiFocusPhotoActive=active;
  const hero=document.getElementById('homeHero');
  hero?.classList.toggle('us-oggi-focus',active);
  document.getElementById('usOggiFocusToggle')?.setAttribute('aria-pressed',String(active));
  const fadeTargets=[document.getElementById('usTodayPriorityRegion'),document.getElementById('usOggiCalendarWidget'),document.getElementById('usDailyRitual'),document.getElementById('distanceWidget'),document.getElementById('pushOptInCard')];
  for(const el of fadeTargets){
    if(!el)continue;
    if(active)el.setAttribute('inert','');else el.removeAttribute('inert');
  }
}
function toggleOggiFocusPhoto(){setOggiFocusPhoto(!usOggiFocusPhotoActive);}
window.toggleOggiFocusPhoto=toggleOggiFocusPhoto;
document.getElementById('homeHero')?.addEventListener('click',event=>{
  if(oggiIsWidgetTarget(event.target))return;
  toggleOggiFocusPhoto();
});

// M10A — the empty-state invitation is a passive widget: it sits in the free
// band between the Oggi stack and the bottom row, and drops its secondary lines
// when that band is short, so it never slides under the stack.
function layoutOggiEmptyState(){
  const hero=document.getElementById('homeHero'),empty=document.getElementById('homeEmptyState'),stack=document.getElementById('usOggiStack');
  if(!hero||!empty||!stack||empty.hidden)return;
  const box=hero.getBoundingClientRect();
  if(!box.height)return;
  const gap=12;
  const top=stack.getBoundingClientRect().bottom-box.top+gap;
  let bottom=box.height-gap;
  for(const id of ['distanceWidget','pushOptInCard']){
    const el=document.getElementById(id);
    const rect=el&&!el.hidden?el.getBoundingClientRect():null;
    if(rect?.height)bottom=Math.min(bottom,rect.top-box.top-gap);
  }
  empty.classList.remove('is-compact');
  if(empty.offsetHeight>bottom-top)empty.classList.add('is-compact');
  const half=empty.offsetHeight/2,preferred=box.height*.48;
  const center=top+half<=bottom-half?Math.min(Math.max(preferred,top+half),bottom-half):(top+bottom)/2;
  empty.style.top=`${Math.round(center)}px`;
}
if(typeof ResizeObserver==='function'){
  const oggiLayoutObserver=new ResizeObserver(()=>layoutOggiEmptyState());
  for(const id of ['homeHero','usOggiStack','distanceWidget','pushOptInCard']){
    const el=document.getElementById(id);
    if(el)oggiLayoutObserver.observe(el);
  }
}

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
      s.textContent='Accesso non disponibile per ora.';
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

async function loginAccount(){
  const email=document.getElementById('loginEmail').value.trim();
  const password=document.getElementById('loginPassword').value;
  const s=document.getElementById('loginStatus');
  const btn=document.getElementById('loginBtn');
  if(!email||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){s.textContent='Inserisci un indirizzo email valido.';return;}
  if(!password){s.textContent='Inserisci la password.';return;}
  btn.disabled=true;
  s.textContent='Accesso…';
  try{
    const {error}=await sb.auth.signInWithPassword({email,password});
    if(error) throw error;
    document.getElementById('loginPassword').value='';
    await initCloud();
  }catch(err){
    const msg=String(err?.message||'invio non riuscito');
    s.textContent='Errore: '+msg;
  }finally{
    btn.disabled=false;
  }
}
window.loginAccount=loginAccount;

// Called only from a trusted, already authenticated session. The caller owns
// password entry; this function never logs, persists, or transmits it elsewhere.
// expectedUserId must match the current session user id (works for any account,
// e.g. after the anonymous -> email upgrade).
async function setPasswordFromActiveSession(password, expectedUserId){
  if(typeof password!=='string'||password.length<6)throw new Error('La password deve contenere almeno 6 caratteri.');
  if(typeof expectedUserId!=='string'||!expectedUserId)throw new Error('Sessione non valida.');
  const {data:{user},error:userError}=await sb.auth.getUser();
  if(userError)throw userError;
  if(!user)throw new Error('Sessione non valida.');
  // Hard guards: original UID match, account no longer anonymous, email confirmed.
  if(user.id!==expectedUserId)throw new Error('Sessione non valida per questo account.');
  if(user.is_anonymous)throw new Error('L\'account deve prima confermare l\'email.');
  if(!user.email||!user.email_confirmed_at)throw new Error('L\'email non è ancora verificata.');
  const {error}=await sb.auth.updateUser({password});
  if(error)throw error;
  return true;
}
window.setPasswordFromActiveSession=setPasswordFromActiveSession;

// Anonymous -> email upgrade for the CURRENT active session only.
// Single email attempt: on rate limit the error propagates and the caller stops.
// Never creates a new auth user (updateUser mutates the existing one in place).
// The ORIGINAL anonymous UID is captured BEFORE the email update and persisted
// as non-sensitive metadata only (never the email itself): it is the authority
// for the whole flow, so the password step cannot be self-referential.
const ACCOUNT_UPGRADE_KEY='us:account-upgrade';
const ACCOUNT_UPGRADE_PHASES=['awaiting_email_confirmation','admin_fallback_required'];
function readPendingAccountUpgrade(){
  try{
    const raw=localStorage.getItem(ACCOUNT_UPGRADE_KEY);
    if(!raw)return null;
    const pending=JSON.parse(raw);
    if(!pending||pending.expectedUserId==null||!ACCOUNT_UPGRADE_PHASES.includes(pending.phase))return null;
    return pending;
  }catch(_){return null;}
}
window.readPendingAccountUpgrade=readPendingAccountUpgrade;
function clearPendingAccountUpgrade(){
  try{localStorage.removeItem(ACCOUNT_UPGRADE_KEY);}catch(_){}
}
window.clearPendingAccountUpgrade=clearPendingAccountUpgrade;
async function requestAccountEmailUpgrade(email){
  const normalized=typeof email==='string'?email.trim().toLowerCase():'';
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized))throw new Error('Inserisci un indirizzo email valido.');
  const {data:{user},error:userError}=await sb.auth.getUser();
  if(userError)throw userError;
  if(!user)throw new Error('Sessione non valida.');
  if(!user.is_anonymous)throw new Error('Questo account non è anonimo.');
  // Authority: the ORIGINAL anonymous UID, captured before any mutation.
  const expectedUserId=user.id;
  const {error}=await sb.auth.updateUser({email:normalized});
  if(error){
    if(/rate|too many/i.test(error.message||'')){
      // Rate limit: persist the original UID so the admin fallback can run on
      // the same account. No second email attempt is possible from here.
      try{localStorage.setItem(ACCOUNT_UPGRADE_KEY,JSON.stringify({expectedUserId,phase:'admin_fallback_required'}));}catch(_){}
      throw error;
    }
    // Any other error: no pending state must survive (no false "email sent").
    throw error;
  }
  try{localStorage.setItem(ACCOUNT_UPGRADE_KEY,JSON.stringify({expectedUserId,phase:'awaiting_email_confirmation'}));}catch(_){}
  return true;
}
window.requestAccountEmailUpgrade=requestAccountEmailUpgrade;

async function sendMagicLinkRecovery(){
  const email=document.getElementById('loginEmail').value.trim();
  const s=document.getElementById('loginStatus');
  const btn=document.getElementById('magicLinkBtn');
  if(!email||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){s.textContent='Inserisci un indirizzo email valido.';return;}
  btn.disabled=true;
  try{
    const {error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:false,emailRedirectTo:location.origin+'/'}});
    if(error)throw error;
    s.textContent='Link di recupero inviato a '+email+'.';
  }catch(err){s.textContent='Errore: '+String(err?.message||'invio non riuscito');}
  finally{btn.disabled=false;}
}
window.sendMagicLinkRecovery=sendMagicLinkRecovery;

let usIncomingThink=null;
let usThinkOperationId=null;
let usThinkReactionFinal=null;
let usThinkReactionInFlight=false;
let usThinkKnownReactionSignature='';

const US_TODAY_PRIORITY_ORDER=Object.freeze({received_ready:1,answers_ready:2,waiting_for_me:3,couple_context:4});
const US_TODAY_PRIORITY_LABELS=Object.freeze({
  received_ready:'Pronto per voi',
  answers_ready:'Risposte pronte',
  waiting_for_me:'Aspetta te',
  couple_context:'Tra voi oggi'
});
let usTodayPriorityRefreshId=0;
let usTodayPriorityQueue=[];
const usTodayConsumedFacts=new Set();

function usTodayPriorityNumber(value,fallback){
  if(value===null||value===undefined||value==='')return fallback;
  const number=Number(value);
  return Number.isFinite(number)?number:fallback;
}
function composeTodayPriorities(candidates=[]){
  const ordered=(Array.isArray(candidates)?candidates:[])
    .filter(item=>item?.id&&US_TODAY_PRIORITY_ORDER[item.category]&&!usTodayConsumedFacts.has(String(item.factKey||item.id)))
    .slice()
    .sort((a,b)=>US_TODAY_PRIORITY_ORDER[a.category]-US_TODAY_PRIORITY_ORDER[b.category]
      ||usTodayPriorityNumber(a.urgency,Number.MAX_SAFE_INTEGER)-usTodayPriorityNumber(b.urgency,Number.MAX_SAFE_INTEGER)
      ||usTodayPriorityNumber(b.recency,0)-usTodayPriorityNumber(a.recency,0)
      ||String(a.id).localeCompare(String(b.id)));
  const categories=new Set(),facts=new Set(),result=[];
  for(const item of ordered){
    const factKey=String(item.factKey||item.id);
    if(categories.has(item.category)||facts.has(factKey))continue;
    categories.add(item.category);facts.add(factKey);result.push(item);
    if(result.length===3)break;
  }
  return result;
}
// M10.2 — stato PERSONALE del reveal (get_daily_reveal_meta): l'avviso "Risposte
// pronte" esiste solo per la domanda di OGGI (giorno Europe/Rome), a reveal
// sbloccato, finché IO non l'ho né aperto né nascosto. Senza meta caricata
// (errore/offline) non si inventa nulla: né avviso né link.
function dailyRevealAccess(source){
  const question=source?.question,state=source?.state,meta=source?.reveal;
  if(!question?.id||!state?.both_answered||!meta?.both_answered||meta.question_id!==question.id)return null;
  const today=typeof usDailyQuestionDay==='function'?usDailyQuestionDay():null;
  if(today&&question.question_date&&String(question.question_date)!==today)return null;
  return {question,unread:!meta.my_reveal_seen_at&&!meta.my_notice_dismissed_at};
}
function dailyTodayPriorityViewModel(source){
  const access=dailyRevealAccess(source);
  if(!access?.unread)return null;
  const question=access.question;
  const urgency=Date.parse(`${question.question_date||''}T23:59:59`);
  return {
    id:`daily-ready:${question.id}`,factKey:`daily:${question.id}`,category:'answers_ready',
    arrivalType:'daily-reveal-ready',questionId:question.id,
    // Personale e reale finché non l'ho aperto o nascosto: stesso orbit M10.
    attention:true,canonical:true,dismissLabel:'Nascondi avviso Risposte pronte',
    urgency:Number.isFinite(urgency)?urgency:Number.MAX_SAFE_INTEGER,recency:0,
    title:'Le vostre risposte sono pronte',detail:'',action:'today',actionLabel:'Scopri'
  };
}
// Accesso secondario, passivo: reveal di oggi già aperto o avviso nascosto.
function dailyRevealLinkViewModel(source){
  const access=dailyRevealAccess(source);
  if(!access||access.unread)return null;
  return {questionId:access.question.id,label:'Rivedi le risposte di oggi'};
}
function renderDailyRevealLink(model){
  const link=document.getElementById('usDailyRevealLink');
  if(!link)return;
  if(!model){link.hidden=true;link.textContent='';link.removeAttribute('data-us-question-id');return;}
  link.textContent=model.label;
  link.dataset.usQuestionId=model.questionId;
  link.hidden=false;
}
function eventTodayPriorityViewModel(source){
  if(source?.days_left===null||source?.days_left===undefined||!source?.effective_date)return null;
  const days=Number(source?.days_left);
  if(!source?.id||!source?.title||!Number.isFinite(days)||days<0||days>2)return null;
  const time=source.event_time?String(source.event_time).slice(0,5):'';
  const when=days===0?'Oggi':days===1?'Domani':'Entro 48 ore';
  const detail=[when,time,source.location].filter(Boolean).join(' · ');
  const urgency=Date.parse(`${source.effective_date}T${time||'23:59'}:00`);
  const recency=Date.parse(source.updated_at||source.created_at||'');
  return {
    id:`event:${source.id}:${source.effective_date}`,
    factKey:`event:${source.id}:${source.effective_date}`,
    category:'couple_context',
    // Un impegno è informazione, non un'azione personale: niente attenzione.
    attention:false,
    title:String(source.title),detail,action:'events',actionLabel:'Apri eventi',
    urgency:Number.isFinite(urgency)?urgency:Number.MAX_SAFE_INTEGER,
    recency:Number.isFinite(recency)?recency:0
  };
}
function renderTodayPriorityItem(item,total=0){
  const region=document.getElementById('usTodayPriorityRegion');
  if(!region)return;
  if(!item){region.innerHTML='';region.hidden=true;return;}
  const queueLabel=total>1?` · 1/${total}`:'';
  const card=`<button type="button" class="us-today-priority-card us-attention-orbit" data-us-attention="${item.attention?'on':'off'}" data-us-today-action="${escapeHtml(item.action)}" data-us-arrival-type="${escapeHtml(item.arrivalType||item.category||'arrival')}" aria-label="${escapeHtml(item.actionLabel)}: ${escapeHtml(item.title)}"><span class="us-today-priority-kind">${escapeHtml(US_TODAY_PRIORITY_LABELS[item.category]||'Oggi')}${queueLabel}</span><span class="us-today-priority-copy"><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.detail||'')}</small></span><span class="us-today-priority-action">${escapeHtml(item.actionLabel)}</span></button>`;
  // M10.2 — avviso nascondibile: swipe orizzontale O bottone accessibile, stessa autorità.
  region.innerHTML=item.dismissLabel
    ?`<div class="us-today-priority-swipe has-dismiss" data-us-swipe-item data-us-question-id="${escapeHtml(item.questionId||'')}">${card}<button type="button" class="us-today-priority-dismiss" data-us-today-dismiss aria-label="${escapeHtml(item.dismissLabel)}"><span class="us-icon" data-us-icon="x" aria-hidden="true"></span></button></div>`
    :card;
  region.hidden=false;
}
function renderTodayPriorities(priorities=[]){
  usTodayPriorityQueue=Array.isArray(priorities)?priorities.slice():[];
  renderTodayPriorityItem(usTodayPriorityQueue[0],usTodayPriorityQueue.length);
}
function thinkTodayPriorityViewModel(){
  const signal=typeof usIncomingThink!=='undefined'?usIncomingThink:null;
  const finalReaction=typeof usThinkReactionFinal!=='undefined'?usThinkReactionFinal:null;
  if(!signal?.id||finalReaction)return null;
  const partner=partnerFromProfiles(window.usBondProfiles||[]);
  return {
    id:`think-received:${signal.id}`,
    factKey:`think:${signal.id}`,
    arrivalType:'think-received',
    category:'received_ready',
    // M10E.3 — un Ti penso ricevuto e non ancora gestito (nessuna reazione
    // finale) è un'azione reale per CHI lo riceve.
    attention:true,
    title:`${partner?.display_name||'La tua persona'} ti pensa`,
    detail:'Ha lasciato un segnale per te.',
    action:'think',
    actionLabel:'Apri'
  };
}
// ===== M9B — Domanda del giorno: il rituale quotidiano su Oggi =====
// Legge SOLO lo stato canonico di get_daily_state (window.todayState via
// hydrateToday): nessuna copia locale delle risposte, nessun reveal anticipato.
// La card apre il foglio esistente (openToday), che resta l'unico flusso.
function dailyRitualPartnerName(){
  const partner=partnerFromProfiles(window.usBondProfiles||[]);
  if(partner?.display_name)return partner.display_name;
  return window.usProfile?.role==='francesco'?'Beatrice':'Francesco';
}
function dailyRitualViewModel(source){
  // M10.1A — la card su Oggi dice a CHI guarda "hai ancora qualcosa da fare":
  // esiste SOLO finché manca la MIA risposta (get_daily_state().my_answer ==
  // null). Dopo la mia risposta sparisce del tutto (niente "Risposto", attesa,
  // reveal): il foglio Today resta il flusso completo. Mai both_answered.
  const kicker='Domanda del giorno';
  // M9E: errore reale del backend → stato onesto con Riprova (apre il foglio,
  // che ritenta get_or_create_daily_question). Mai una domanda inventata.
  if(source?.status==='error')return {questionId:null,question:'La domanda di oggi non è arrivata.',state:'error',kicker,status:'',cta:'Riprova',attention:false};
  const question=source?.question,state=source?.state;
  if(!question?.id||!question.question||!state)return null;
  if(state.my_answer!=null)return null;
  return {questionId:question.id,question:String(question.question),kicker,state:state.partner_has_answer?'invited':'answer',status:'',cta:'Rispondi',attention:true};
}
function renderDailyRitual(model){
  const card=document.getElementById('usDailyRitual');
  if(!card)return;
  if(!model){card.hidden=true;card.innerHTML='';card.removeAttribute('data-state');card.dataset.usAttention='off';return;}
  card.dataset.state=model.state;
  card.dataset.usAttention=model.attention?'on':'off';
  card.setAttribute('aria-label',`${model.kicker}: ${model.question}. ${model.cta}`);
  card.innerHTML=`<span class="us-daily-ritual-head"><span class="us-daily-ritual-mark us-phosphor-question" data-us-attention-icon aria-hidden="true"></span><span class="us-daily-ritual-kicker">${escapeHtml(model.kicker)}</span></span><span class="us-daily-ritual-question">${escapeHtml(model.question)}</span><span class="us-daily-ritual-cta">${escapeHtml(model.cta)}</span>`;
  card.hidden=false;
}
window.UsDailyRitual=Object.freeze({viewModel:dailyRitualViewModel,render:renderDailyRitual});
async function refreshTodayPriorities({daily}={}){
  const refreshId=++usTodayPriorityRefreshId;
  const dailySource=daily===undefined&&window.todayQuestion?{
    question:window.todayQuestion,
    state:window.todayState,
    reveal:window.todayRevealMeta,
    partnerName:dailyRitualPartnerName()
  }:daily;
  const candidates=[];
  const thinkPriority=thinkTodayPriorityViewModel();
  if(thinkPriority)candidates.push(thinkPriority);
  // M9B: la Domanda del giorno ha la sua card su Oggi (renderDailyRitual):
  // non entra più nella coda priority, così non compare due volte.
  renderDailyRitual(dailyRitualViewModel(dailySource));
  // M10.2 — "Risposte pronte": piccolo avviso personale, mai la card Daily.
  const revealNotice=dailyTodayPriorityViewModel(dailySource);
  if(revealNotice)candidates.push(revealNotice);
  try{
    const eventSource=await window.getTodayEventPrioritySource?.();
    const eventPriority=eventTodayPriorityViewModel(eventSource);
    if(eventPriority)candidates.push(eventPriority);
  }catch(error){console.warn('[US Oggi] Events priority',error);}
  if(refreshId!==usTodayPriorityRefreshId)return [];
  const priorities=composeTodayPriorities(candidates);
  renderTodayPriorities(priorities);
  // Un solo ingresso: il link passivo compare solo quando l'avviso non è in coda.
  renderDailyRevealLink(priorities.some(item=>item.category==='answers_ready')?null:dailyRevealLinkViewModel(dailySource));
  return priorities;
}
document.getElementById('usTodayPriorityRegion')?.addEventListener('click',event=>{
  if(usTodaySwipeState.suppressClick){usTodaySwipeState.suppressClick=false;event.preventDefault?.();return;}
  const control=event.target.closest?.('[data-us-today-action]');
  const action=control?.dataset.usTodayAction;
  if(!action){
    // Bottone accessibile "Nascondi avviso": stessa autorità dello swipe.
    const dismiss=event.target.closest?.('[data-us-today-dismiss]');
    const questionId=dismiss?event.target.closest('[data-us-swipe-item]')?.dataset.usQuestionId:'';
    if(questionId)window.dismissDailyRevealNotice?.(questionId);
    return;
  }
  // M10.2: l'avviso Risposte pronte è stato canonico (server): sparisce solo
  // quando il reveal è davvero aperto (hydrateToday → mark_daily_reveal_seen).
  const current=usTodayPriorityQueue[0];
  if(!current?.canonical){
    usTodayPriorityQueue.shift();
    if(current)usTodayConsumedFacts.add(String(current.factKey||current.id));
    renderTodayPriorityItem(usTodayPriorityQueue[0],usTodayPriorityQueue.length);
  }
  if(action==='today')window.openToday?.();
  if(action==='events')window.openEvents?.();
  if(action==='think')window.openThinkArrival?.();
});
// M10.2 — nascondere l'avviso "Risposte pronte" = "non lo voglio più su Oggi",
// MAI "ho visto le risposte". L'autorità è window.dismissDailyRevealNotice
// (definita accanto al reveal, dove vive l'accesso al backend): solo dopo il
// dismiss canonico l'avviso resta nascosto, altrimenti la card torna al suo posto.
const usTodaySwipeState={gesture:null,suppressClick:false};
const US_SWIPE_INTENT_PX=10,US_SWIPE_MIN_PX=50,US_SWIPE_MAX_PX=70;
function usTodaySwipeThreshold(width){return Math.min(US_SWIPE_MAX_PX,Math.max(US_SWIPE_MIN_PX,(Number(width)||0)*0.2));}
function usTodaySwipeMotion(item,{transform,opacity,animate}){
  const reduced=Boolean(window.UsUiFoundation?.isReducedMotion?.());
  item.style.transition=animate&&!reduced?'transform .2s ease-out,opacity .2s ease-out':'none';
  item.style.transform=transform;
  item.style.opacity=opacity;
}
function usTodaySwipeReset(item){usTodaySwipeMotion(item,{transform:'translateX(0)',opacity:'',animate:true});}
function installTodayNoticeSwipe(region){
  if(!region?.addEventListener)return;
  const itemOf=event=>event.target?.closest?.('[data-us-swipe-item]')||null;
  region.addEventListener('pointerdown',event=>{
    const item=itemOf(event);
    if(!item||(event.button!==undefined&&event.button!==0)||event.target.closest?.('[data-us-today-dismiss]'))return;
    usTodaySwipeState.gesture={item,pointerId:event.pointerId,x:event.clientX,y:event.clientY,dx:0,phase:'pending'};
  });
  region.addEventListener('pointermove',event=>{
    const g=usTodaySwipeState.gesture;
    if(!g||g.pointerId!==event.pointerId||g.phase==='ignored')return;
    const dx=event.clientX-g.x,dy=event.clientY-g.y;
    if(g.phase==='pending'){
      const ax=Math.abs(dx),ay=Math.abs(dy);
      if(ax<US_SWIPE_INTENT_PX&&ay<US_SWIPE_INTENT_PX)return;
      // Intento orizzontale chiaro, altrimenti è scroll verticale: non si tocca.
      if(ax>ay*1.5){g.phase='drag';g.item.setPointerCapture?.(event.pointerId);}
      else{g.phase='ignored';return;}
    }
    g.dx=dx;
    const width=g.item.getBoundingClientRect?.().width||0;
    const fade=width?Math.min(Math.abs(dx)/width,1)*0.55:0;
    usTodaySwipeMotion(g.item,{transform:`translateX(${dx}px)`,opacity:String(1-fade),animate:false});
    event.preventDefault?.();
  });
  const finish=async(event,cancelled)=>{
    const g=usTodaySwipeState.gesture;
    if(!g||g.pointerId!==event.pointerId)return;
    usTodaySwipeState.gesture=null;
    if(g.phase!=='drag')return;
    // Il click sintetico dopo un drag non deve aprire il reveal.
    usTodaySwipeState.suppressClick=true;
    setTimeout(()=>{usTodaySwipeState.suppressClick=false;},0);
    const width=g.item.getBoundingClientRect?.().width||0;
    if(cancelled||Math.abs(g.dx)<usTodaySwipeThreshold(width)){usTodaySwipeReset(g.item);return;}
    const exit=(g.dx<0?-1:1)*Math.max(width,1);
    usTodaySwipeMotion(g.item,{transform:`translateX(${exit}px)`,opacity:'0',animate:true});
    const result=(await window.dismissDailyRevealNotice?.(g.item.dataset.usQuestionId))||{status:'error'};
    // Dismiss non riuscito → la card torna (se il DOM è ancora quello).
    if(result.status!=='dismissed'&&g.item.isConnected!==false)usTodaySwipeReset(g.item);
  };
  region.addEventListener('pointerup',event=>finish(event,false));
  region.addEventListener('pointercancel',event=>finish(event,true));
}
installTodayNoticeSwipe(document.getElementById('usTodayPriorityRegion'));
window.UsTodayPriority=Object.freeze({
  revealLinkViewModel:dailyRevealLinkViewModel,
  compose:composeTodayPriorities,
  dailyViewModel:dailyTodayPriorityViewModel,
  eventViewModel:eventTodayPriorityViewModel,
  render:renderTodayPriorities,
  refresh:refreshTodayPriorities
});

// ===== M12A — Oggi arbitration =====
// The photo stays the dominant surface: at any moment Oggi shows AT MOST ONE
// primary attention item and AT MOST ONE quiet informational item. The
// choice is deterministic (slot, then rank, then id); surfaces that lose are
// only suppressed (display), never destroyed, so they return the moment the
// winner is resolved. Distance is a tiny ambient capsule and does not count.
//
//   PRIMARY (something for ME to do / see)        QUIET (information)
//   10 Ti penso received                          10 today's / tomorrow's event
//   20 "Risposte pronte" (reveal ready)           20 calendar insight
//   30 waiting for me (priority queue)            30 "Rivedi le risposte di oggi"
//   40 Daily Question, partner already answered   40 push opt-in / install hint
//   50 Daily Question available
//   60 Daily Question error (Riprova)
const US_OGGI_PRIMARY_RANK=Object.freeze({received_ready:10,answers_ready:20,waiting_for_me:30});
const US_OGGI_DAILY_RANK=Object.freeze({invited:40,answer:50,error:60});
function arbitrateOggi(candidates=[]){
  const best={primary:null,quiet:null};
  for(const item of Array.isArray(candidates)?candidates:[]){
    if(!item||!item.id||!(item.slot in best))continue;
    const current=best[item.slot];
    const rank=Number(item.rank);
    if(!Number.isFinite(rank))continue;
    if(!current||rank<current.rank||(rank===current.rank&&String(item.id)<String(current.id)))best[item.slot]={id:String(item.id),rank};
  }
  return {primary:best.primary?.id||null,quiet:best.quiet?.id||null};
}
const US_OGGI_SURFACES=Object.freeze(['usTodayPriorityRegion','usOggiCalendarWidget','usDailyRitual','usDailyRevealLink','pushOptInCard']);
function collectOggiCandidates(){
  const live=id=>{const el=document.getElementById(id);return el&&!el.hidden?el:null;};
  const candidates=[];
  if(live('usTodayPriorityRegion')){
    const head=usTodayPriorityQueue[0];
    if(US_OGGI_PRIMARY_RANK[head?.category])candidates.push({id:'usTodayPriorityRegion',slot:'primary',rank:US_OGGI_PRIMARY_RANK[head.category]});
    else candidates.push({id:'usTodayPriorityRegion',slot:'quiet',rank:10});
  }
  const daily=live('usDailyRitual');
  if(daily)candidates.push({id:'usDailyRitual',slot:'primary',rank:US_OGGI_DAILY_RANK[daily.dataset.state]||US_OGGI_DAILY_RANK.answer});
  if(live('usOggiCalendarWidget'))candidates.push({id:'usOggiCalendarWidget',slot:'quiet',rank:20});
  if(live('usDailyRevealLink'))candidates.push({id:'usDailyRevealLink',slot:'quiet',rank:30});
  if(live('pushOptInCard'))candidates.push({id:'pushOptInCard',slot:'quiet',rank:40});
  return candidates;
}
function applyOggiArbitration(){
  const winner=arbitrateOggi(collectOggiCandidates());
  for(const id of US_OGGI_SURFACES){
    const el=document.getElementById(id);
    if(!el)continue;
    if(el.hidden){el.removeAttribute('data-us-oggi-slot');continue;}
    el.setAttribute('data-us-oggi-slot',winner.primary===id?'primary':winner.quiet===id?'quiet':'suppressed');
  }
  return winner;
}
window.UsOggi=Object.freeze({arbitrate:arbitrateOggi,apply:applyOggiArbitration,collect:collectOggiCandidates});
(()=>{
  const hero=document.getElementById('homeHero');
  if(!hero||typeof MutationObserver!=='function')return;
  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;applyOggiArbitration();});};
  new MutationObserver(schedule).observe(hero,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','data-state']});
  schedule();
})();

function localDateISO(){
  const d=new Date(), y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function openToday(){
  const root=document.getElementById('today');
  if(!root)return;
  window.UsUiFoundation?.cancelSurfaceExit?.(root);
  root.classList.add('open');
  root.setAttribute('aria-hidden','false');
  document.body.style.overflow='hidden';
  hydrateToday();
}
window.openToday=openToday;
function closeToday(){
  const root=document.getElementById('today');
  if(!root)return;
  const finalize=()=>{
    root.classList.remove('open');
    root.setAttribute('aria-hidden','true');
    document.body.style.overflow='';
  };
  if(window.UsUiFoundation?.exitSurface)window.UsUiFoundation.exitSurface(root,finalize);else finalize();
}
window.closeToday=closeToday;

function thinkReactionLabel(reaction){return ({heart:'❤️',hug:'🫂',miss_you:'miss_you'})[reaction]||reaction||'';}
function renderThinkReactionUi(){
  const root=document.getElementById('thinkArrival');
  if(!root)return;
  const title=document.getElementById('thinkArrivalTitle');
  const copy=document.getElementById('thinkArrivalCopy');
  const status=document.getElementById('thinkArrivalStatus');
  const buttons=root.querySelectorAll('[data-think-reaction]');
  const partner=partnerFromProfiles(window.usBondProfiles||[]);
  if(title)title.textContent=`${partner?.display_name||'La tua persona'} ti pensa`;
  if(copy)copy.hidden=true;
  buttons.forEach(button=>{
    const reaction=button.dataset.thinkReaction;
    button.classList.toggle('selected',reaction===usThinkReactionFinal);
    button.disabled=Boolean(usThinkReactionFinal||usThinkReactionInFlight);
    button.setAttribute('aria-pressed',String(reaction===usThinkReactionFinal));
  });
  if(status)status.textContent=usThinkReactionFinal?`Hai risposto ${thinkReactionLabel(usThinkReactionFinal)}.`:usThinkReactionInFlight?'Invio…':'';
}
function openThinkArrival(){
  const root=document.getElementById('thinkArrival');
  if(!root||!usIncomingThink)return;
  window.UsUiFoundation?.cancelSurfaceExit?.(root);
  root.classList.add('open');
  root.setAttribute('aria-hidden','false');
  renderThinkReactionUi();
}
window.openThinkArrival=openThinkArrival;
function closeThinkArrival(){
  const root=document.getElementById('thinkArrival');
  if(!root)return;
  const finalize=()=>{root.classList.remove('open');root.setAttribute('aria-hidden','true');};
  if(window.UsUiFoundation?.exitSurface)window.UsUiFoundation.exitSurface(root,finalize);else finalize();
}
window.closeThinkArrival=closeThinkArrival;
async function sendThinkReaction(reaction){
  if(!usIncomingThink?.id||usThinkReactionFinal||usThinkReactionInFlight)return false;
  if(!['heart','hug','miss_you'].includes(reaction))return false;
  usThinkReactionInFlight=true;renderThinkReactionUi();
  const {data,error}=await sb.rpc('set_think_reaction',{target_message_id:usIncomingThink.id,target_reaction:reaction});
  if(error){
    const terminal=error.code==='23505'&&String(error.message||'').includes('already_reacted');
    if(terminal){
      const {data:existing,error:readError}=await sb.from('think_reactions').select('message_id,reaction').eq('message_id',usIncomingThink.id).maybeSingle();
      if(!readError&&existing?.reaction){
        usThinkReactionFinal=existing.reaction;
        usIncomingThink={...usIncomingThink,reaction:usThinkReactionFinal};
        usThinkReactionInFlight=false;
        renderThinkReactionUi();
        sendWebPushEvent('think_reaction',usIncomingThink.id,{reaction:usThinkReactionFinal}).catch(()=>{});
        window.UsTodayPriority?.refresh?.();
        toast('Reazione già inviata');
        setTimeout(()=>closeThinkArrival(),620);
        return true;
      }
    }
    console.warn('[US Think] reaction',error);usThinkReactionInFlight=false;renderThinkReactionUi();toast('Non riesco a inviare la reazione');return false;
  }
  const result=Array.isArray(data)?data[0]:data;
  if(result?.status==='saved'||result?.status==='duplicate'){
    usThinkReactionFinal=result.reaction||reaction;
    usIncomingThink={...usIncomingThink,reaction:usThinkReactionFinal};
    usThinkReactionInFlight=false;
    renderThinkReactionUi();
    sendWebPushEvent('think_reaction',usIncomingThink.id,{reaction:usThinkReactionFinal}).catch(()=>{});
    window.UsTodayPriority?.refresh?.();
    toast('Reazione inviata');
    setTimeout(()=>closeThinkArrival(),620);
    return true;
  }
  usThinkReactionInFlight=false;renderThinkReactionUi();return false;
}
window.sendThinkReaction=sendThinkReaction;
document.getElementById('thinkArrival')?.addEventListener('click',event=>{
  const reaction=event.target.closest?.('[data-think-reaction]')?.dataset.thinkReaction;
  if(reaction)sendThinkReaction(reaction);
});

function dailyQuestionOutcomeRuntime(){
  const ownRole=()=>window.usProfile?.role||'';
  const partnerLabel=()=>ownRole()==='francesco'?'Bea':'Francesco';
  const emptyState=(questionId='')=>({questionId,rows:[],draft:'',status:'idle'});
  const current=()=>window.todayOutcomeState||emptyState(window.todayQuestion?.id);
  const operationId=()=>globalThis.crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,char=>{
    const value=Math.floor(Math.random()*16);return (char==='x'?value:(value&3|8)).toString(16);
  });
  const ownOutcome=(state=current())=>state.rows.find(row=>row.author_role===ownRole())||null;
  const outcomeLabel=(row)=>row.author_role===ownRole()?'La tua riflessione':partnerLabel();
  const statusCopy=(status)=>({
    loading:'Carico…', saved:'Riflessione salvata.', duplicate:'Riflessione già salvata.',
    stale:'È arrivata una versione più recente: ho ricaricato il confronto.', already_absent:'La riflessione era già stata eliminata.',
    deleted:'Riflessione eliminata.', error:'Non riesco a sincronizzare ora. Il reveal resta disponibile.'
  })[status]||'';
  const view=()=>{
    const state=current(),mine=ownOutcome(state),partner=state.rows.filter(row=>row.author_role!==ownRole());
    const rows=[...partner,...(mine?[mine]:[])].map(row=>`<article class="today-outcome-entry" data-us-today-outcome-${row.author_role===ownRole()?'owner':'partner'}><b>${escapeHtml(outcomeLabel(row))}</b><p>${escapeHtml(row.body||'')}</p></article>`).join('');
    const status=statusCopy(state.status);
    return `<div class="today-outcome-head"><div><h3>Parlatene insieme</h3></div></div><p class="today-outcome-copy">Facoltativa e privata.</p>${rows?`<div class="today-outcome-list">${rows}</div>`:''}<div class="today-outcome-compose" data-us-today-outcome-owner><label class="tiny" for="todayOutcomeBody">La tua riflessione</label><textarea id="todayOutcomeBody" rows="3" maxlength="1000" placeholder="Un pensiero…">${escapeHtml(state.draft||mine?.body||'')}</textarea><div class="today-outcome-actions"><button type="button" class="primary" onclick="saveDailyQuestionOutcome()">Salva riflessione</button>${mine?'<button type="button" class="today-outcome-delete" onclick="deleteDailyQuestionOutcome()">Elimina</button>':''}</div></div>${status?`<p class="today-outcome-status ${state.status==='error'?'error':''}" role="status">${status}</p>`:''}`;
  };
  const render=()=>{
    const root=document.getElementById('todayOutcome');
    if(!root)return;
    const active=Boolean(current().questionId&&window.todayState?.both_answered);
    root.hidden=!active;root.classList.toggle('hidden',!active);
    if(active)root.innerHTML=view();
  };
  const hide=()=>{window.todayOutcomeState=emptyState();render();};
  const load=async(question,state)=>{
    if(!question?.id||!state?.both_answered){hide();return {status:'not_ready'};}
    const previous=current();
    window.todayOutcomeState={...emptyState(question.id),draft:previous.questionId===question.id?previous.draft:'',status:'loading'};
    render();
    const {data,error}=await sb.from('daily_question_outcomes').select('id,author_role,body,revision').eq('question_id',question.id).order('created_at');
    if(window.todayQuestion?.id!==question.id)return {status:'stale_question'};
    if(error){console.warn(error);window.todayOutcomeState.status='error';render();return {status:'error',error};}
    window.todayOutcomeState.rows=Array.isArray(data)?data:[];
    window.todayOutcomeState.status='idle';render();return {status:'loaded'};
  };
  const save=async(value)=>{
    const state=current(),questionId=state.questionId||window.todayQuestion?.id,body=String(value??'').trim();
    if(!questionId||!window.todayState?.both_answered)return {status:'not_ready'};
    state.draft=body;
    if(!body||body.length>1000){state.status='error';render();return {status:'error'};}
    const mine=ownOutcome(state);
    const {data,error}=await sb.rpc('save_daily_question_outcome',{target_question_id:questionId,target_body:body,operation_id:operationId(),expected_revision:mine?.revision??null});
    if(error){console.warn(error);state.status='error';render();return {status:'error',error};}
    if(data?.status==='saved'||data?.status==='duplicate'){
      const row={id:data.id,author_role:ownRole(),body:data.body||body,revision:data.revision};
      state.rows=[...state.rows.filter(item=>item.author_role!==ownRole()),row];state.draft=row.body;state.status=data.status;render();return data;
    }
    if(data?.status==='stale'){state.status='stale';render();await load({id:questionId},{both_answered:true});return data;}
    state.status='error';render();return {status:'error'};
  };
  const remove=async()=>{
    const state=current(),questionId=state.questionId||window.todayQuestion?.id,mine=ownOutcome(state);
    if(!questionId||!mine)return {status:'already_absent'};
    const {data,error}=await sb.rpc('delete_daily_question_outcome',{target_question_id:questionId,expected_revision:mine.revision});
    if(error){console.warn(error);state.status='error';render();return {status:'error',error};}
    if(data?.status==='deleted'||data?.status==='already_absent'){
      state.rows=state.rows.filter(row=>row.author_role!==ownRole());state.draft='';state.status=data.status;render();return data;
    }
    if(data?.status==='stale'){state.status='stale';render();await load({id:questionId},{both_answered:true});return data;}
    state.status='error';render();return {status:'error'};
  };
  return {hide,load,remove,render,save,view};
}
const dailyQuestionOutcomes=dailyQuestionOutcomeRuntime();
window.saveDailyQuestionOutcome=async()=>{
  const result=await dailyQuestionOutcomes.save(document.getElementById('todayOutcomeBody')?.value||'');
  if(result.status==='error')toast('Riflessione non salvata: riprova quando torni online');
};
window.deleteDailyQuestionOutcome=async()=>{
  const result=await dailyQuestionOutcomes.remove();
  if(result.status==='error')toast('Riflessione non eliminata: riprova quando torni online');
};

// M12B.4 — Conserva: dopo il reveal, uno dei due può conservare lo scambio
// della domanda nei Ricordi. Il server decide (keep_daily_question: reveal di
// get_daily_state, una sola copia per coppia e domanda, snapshot lato server);
// qui solo lo stato del bottone. Lo stato "già conservata" si rilegge dalla
// tabella (RLS: stessa coppia) a ogni apertura, mai da una copia locale.
function dailyKeepsakeRuntime(){
  let state={questionId:null,status:'hidden'};
  const unavailable=(error)=>['42P01','PGRST205','PGRST202','42883'].includes(error?.code)||/daily_question_keepsake|keep_daily_question/.test(String(error?.message||''))&&/does not exist|could not find|schema cache/i.test(String(error?.message||''));
  const active=()=>Boolean(state.questionId&&state.questionId===window.todayQuestion?.id&&window.todayState?.both_answered);
  const view=()=>{
    if(state.status==='kept')return '<p class="today-keep-done" role="status"><span class="us-icon" data-us-icon="check" aria-hidden="true"></span>Conservato nei Ricordi</p>';
    const saving=state.status==='saving',failed=state.status==='error';
    return `<button type="button" class="today-keep-button" data-us-daily-keep ${saving?'disabled aria-busy="true"':''}>${saving?'Conservo…':failed?'Riprova':'Conserva'}</button>${failed?'<p class="today-keep-status" role="status">Non conservata. Riprova quando torni online.</p>':''}`;
  };
  const render=()=>{
    const root=document.getElementById('todayKeep');
    if(!root)return;
    const show=active()&&['idle','saving','error','kept'].includes(state.status);
    root.hidden=!show;
    root.innerHTML=show?view():'';
  };
  const hide=()=>{state={questionId:null,status:'hidden'};render();};
  const load=async(questionId)=>{
    state={questionId,status:'loading'};render();
    try{
      const {data,error}=await sb.from('daily_question_keepsakes').select('id,kept_at,kept_by_role').eq('question_id',questionId).limit(1);
      if(state.questionId!==questionId)return state;
      if(error)throw error;
      state={questionId,status:Array.isArray(data)&&data.length?'kept':'idle'};
    }catch(error){
      if(state.questionId!==questionId)return state;
      console.warn('[US Today] Conserva stato',error);
      // Senza backend Conserva (migration non applicata) niente bottone; un
      // errore di rete lascia Conserva: la RPC è idempotente e risponde 'existing'.
      state={questionId,status:unavailable(error)?'hidden':'idle'};
    }
    render();return state;
  };
  const keep=async()=>{
    const questionId=state.questionId;
    if(!active()||state.status==='saving'||state.status==='kept')return {status:'noop'};
    state={questionId,status:'saving'};render();
    try{
      const {data,error}=await sb.rpc('keep_daily_question',{target_question_id:questionId});
      if(error)throw error;
      if(!['kept','existing'].includes(data?.status)||data.question_id!==questionId)throw new Error('daily_keepsake_invalid');
      if(state.questionId!==questionId)return {status:'stale'};
      state={questionId,status:'kept'};render();
      if(data.status==='kept')toast('Conservato nei Ricordi ♡');
      if(document.getElementById('momentsGrid')?.dataset.loaded==='1')Promise.resolve(window.hydrateMoments?.()).catch(()=>{});
      return data;
    }catch(error){
      console.warn('[US Today] Conserva',error);
      if(state.questionId!==questionId)return {status:'stale'};
      state={questionId,status:/daily_question_reveal_not_ready/.test(String(error?.message||''))||unavailable(error)?'hidden':'error'};render();
      return {status:'error',error};
    }
  };
  return {hide,load,keep,render,state:()=>state};
}
const dailyKeepsake=dailyKeepsakeRuntime();
window.UsDailyKeepsake=dailyKeepsake;
document.getElementById('todayKeep')?.addEventListener?.('click',event=>{
  if(event.target.closest?.('[data-us-daily-keep]'))dailyKeepsake.keep();
});

// M9E — la domanda di oggi arriva SOLO da get_or_create_daily_question: il
// server decide il giorno (Europe/Rome) e materializza una sola istanza in
// daily_questions. Qui non si calcola più la data sul client.
const US_DAILY_QUESTION_TIMEZONE='Europe/Rome';
function usDailyQuestionDay(at=new Date()){
  try{return new Intl.DateTimeFormat('en-CA',{timeZone:US_DAILY_QUESTION_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(at);}
  catch(_e){return localDateISO();}
}
function validDailyQuestion(q){
  return q&&typeof q==='object'&&typeof q.id==='string'&&q.id&&typeof q.question==='string'&&q.question.trim()?q:null;
}
// Stati senza domanda valida: 'loading' (in arrivo) o 'error' (backend/rete).
// In entrambi niente textarea né invio: solo, in errore, un Riprova onesto.
function renderTodayQuestionUnavailable(status){
  const qel=document.querySelector('#today .qtext');
  const locked=document.getElementById('locked'), reveal=document.getElementById('todayReveal'), btn=document.getElementById('todaySaveBtn');
  const answerEl=document.getElementById('answer');
  const failed=status==='error';
  window.todayQuestion=null; window.todayState=null; window.todayRevealMeta=null;
  dailyQuestionOutcomes.hide();
  window.UsDailyKeepsake?.hide?.();
  if(qel)qel.textContent=failed?'Non riesco a caricare la domanda di oggi.':'Un attimo…';
  if(locked)locked.textContent=failed?'Controlla la connessione e riprova.':'Un attimo, arriva subito.';
  if(reveal){reveal.classList.add('hidden');reveal.innerHTML='';}
  if(answerEl){answerEl.value='';answerEl.disabled=true;answerEl.hidden=true;}
  if(btn){
    btn.dataset.usTodayMode=failed?'retry':'loading';
    btn.hidden=!failed; btn.disabled=!failed; btn.textContent=failed?'Riprova':'Un attimo…';
  }
}
// M10.2 — reveal Daily: risposte da get_daily_state (invariata), stato PERSONALE
// (ricevuta, avviso nascosto, reazione) da get_daily_reveal_meta. Il server è
// l'unica autorità: nessuna copia locale, nessuno stato ottimistico che resti.
const US_DAILY_REACTIONS=Object.freeze({heart:{glyph:'❤️',label:'Reagisci con cuore'},angry:{glyph:'😡',label:'Reagisci con faccina arrabbiata'},cry:{glyph:'😭',label:'Reagisci con pianto'}});
async function loadDailyRevealMeta(questionId){
  try{
    const {data,error}=await sb.rpc('get_daily_reveal_meta',{target_question_id:questionId});
    if(error||!data||data.question_id!==questionId)throw error||new Error('daily_reveal_meta_invalid');
    return data;
  }catch(error){console.warn('[US Today] Reveal meta',error);return null;}
}
function dailyRevealPartnerLabel(){return window.usProfile?.role==='francesco'?'Bea':'Francesco';}
function renderTodayReveal(){
  const reveal=document.getElementById('todayReveal'),state=window.todayState;
  if(!reveal||!state?.both_answered)return;
  const meta=window.todayRevealMeta,partner=dailyRevealPartnerLabel();
  const mine=meta?.my_reaction,theirs=meta?.partner_reaction;
  // Sulla MIA risposta: solo la reazione del partner, passiva. Sulla risposta
  // del PARTNER: i miei controlli (mai reagire alla propria).
  const partnerNote=theirs&&US_DAILY_REACTIONS[theirs]?`<div class="today-reaction-note" data-us-daily-partner-reaction="${escapeHtml(theirs)}">${escapeHtml(partner)} ha reagito <span aria-hidden="true">${US_DAILY_REACTIONS[theirs].glyph}</span><span class="sr-only">${escapeHtml(US_DAILY_REACTIONS[theirs].label.replace('Reagisci con','con'))}</span></div>`:'';
  const controls=meta?`<div class="today-reactions" role="group" aria-label="Reagisci alla risposta di ${escapeHtml(partner)}">${Object.entries(US_DAILY_REACTIONS).map(([key,item])=>`<button type="button" class="today-reaction" data-daily-reaction="${key}" aria-label="${escapeHtml(item.label)}" aria-pressed="${mine===key}"><span aria-hidden="true">${item.glyph}</span></button>`).join('')}</div>`:'';
  reveal.className='today-reveal';
  reveal.innerHTML='<div class="today-answer" data-us-daily-answer="mine"><b>La tua risposta</b><p>'+escapeHtml(state.my_answer||'')+'</p>'+partnerNote+'</div><div class="today-answer" data-us-daily-answer="partner"><b>'+escapeHtml(partner)+'</b><p>'+escapeHtml(state.partner_answer||'')+'</p>'+controls+'</div>';
}
// "Visto" = il reveal è davvero mostrato in un foglio Today aperto: non il push,
// non l'hydrate della Home, non il solo both_answered.
let usDailyRevealSeenInFlight=null;
async function markDailyRevealSeenIfVisible(questionId,seq){
  const meta=window.todayRevealMeta;
  const open=document.getElementById('today')?.classList.contains('open');
  if(!open||!meta||meta.question_id!==questionId||meta.my_reveal_seen_at||usDailyRevealSeenInFlight===questionId)return;
  usDailyRevealSeenInFlight=questionId;
  try{
    const {data,error}=await sb.rpc('mark_daily_reveal_seen',{target_question_id:questionId});
    if(error||!data||data.question_id!==questionId)throw error||new Error('daily_reveal_seen_invalid');
    if(window.todayQuestion?.id===questionId)window.todayRevealMeta=data;
  }catch(error){
    // Il reveal resta leggibile e la meta canonica resta invariata: l'avviso
    // rimane su Oggi, quindi basta riaprirlo per riprovare.
    console.warn('[US Today] Reveal seen non salvato',error);
  }finally{usDailyRevealSeenInFlight=null;}
}
let usDailyReactionInFlight=false;
async function setDailyAnswerReaction(reaction){
  const questionId=window.todayQuestion?.id,meta=window.todayRevealMeta;
  if(!questionId||!meta||!window.todayState?.both_answered||usDailyReactionInFlight)return {status:'noop'};
  if(!US_DAILY_REACTIONS[reaction])return {status:'noop'};
  const previous=meta;
  const next=meta.my_reaction===reaction?null:reaction;
  usDailyReactionInFlight=true;
  // Pressed provvisorio, con rollback: il server decide.
  window.todayRevealMeta={...meta,my_reaction:next};renderTodayReveal();
  try{
    const {data,error}=await sb.rpc('set_daily_answer_reaction',{target_question_id:questionId,target_reaction:next});
    if(error||!data||data.question_id!==questionId)throw error||new Error('daily_reaction_invalid');
    if(window.todayQuestion?.id===questionId)window.todayRevealMeta=data;
    renderTodayReveal();
    return {status:'saved'};
  }catch(error){
    console.warn('[US Today] Reazione non salvata',error);
    if(window.todayQuestion?.id===questionId)window.todayRevealMeta=previous;
    renderTodayReveal();
    toast('Reazione non salvata. Riprova.');
    return {status:'error'};
  }finally{usDailyReactionInFlight=false;}
}
window.setDailyAnswerReaction=setDailyAnswerReaction;
document.getElementById('todayReveal')?.addEventListener?.('click',event=>{
  const button=event.target.closest?.('[data-daily-reaction]');
  if(button)setDailyAnswerReaction(button.dataset.dailyReaction);
});
let usDailyRevealDismissInFlight=false;
async function dismissDailyRevealNotice(questionId){
  if(!questionId||usDailyRevealDismissInFlight)return {status:'busy'};
  usDailyRevealDismissInFlight=true;
  try{
    const {data,error}=await sb.rpc('dismiss_daily_reveal_notice',{target_question_id:questionId});
    if(error||!data||data.question_id!==questionId)throw error||new Error('daily_reveal_dismiss_invalid');
    if(window.todayQuestion?.id===questionId)window.todayRevealMeta=data;
    await refreshTodayPriorities();
    return {status:'dismissed'};
  }catch(error){
    console.warn('[US Oggi] Dismiss Risposte pronte',error);
    toast('Non riesco a nascondere l’avviso. Riprova.');
    return {status:'error'};
  }finally{usDailyRevealDismissInFlight=false;}
}
window.dismissDailyRevealNotice=dismissDailyRevealNotice;
let usTodayHydrateSeq=0;
async function hydrateToday(){
  if(!window.usProfile){window.UsTodayPriority?.render?.([]);return;}
  const seq=++usTodayHydrateSeq;
  const previous=window.todayQuestion;
  const keepPrevious=Boolean(previous?.id&&previous.question_date===usDailyQuestionDay());
  if(!keepPrevious)renderTodayQuestionUnavailable('loading');
  let q=null,qError=null;
  try{
    const result=await sb.rpc('get_or_create_daily_question');
    qError=result.error||null;
    q=validDailyQuestion(result.data);
    if(!qError&&!q)qError=new Error('daily_question_invalid_payload');
  }catch(error){qError=error;}
  if(seq!==usTodayHydrateSeq)return;
  if(qError){
    console.warn('[US Today] Daily question',qError);
    // Un errore transitorio non cancella la domanda già valida di oggi.
    if(keepPrevious)return;
    renderTodayQuestionUnavailable('error');
    updateHomeStatus();
    window.UsTodayPriority?.refresh?.({daily:{status:'error'}});
    return;
  }
  const qel=document.querySelector('#today .qtext');
  const locked=document.getElementById('locked'), reveal=document.getElementById('todayReveal'), btn=document.getElementById('todaySaveBtn');
  const answerEl=document.getElementById('answer');
  if(previous?.id!==q.id){window.todayState=null;window.todayRevealMeta=null;if(previous?.id)answerEl.value='';}
  answerEl.hidden=false; answerEl.disabled=false;
  btn.hidden=false; btn.disabled=false; delete btn.dataset.usTodayMode;
  if(!keepPrevious)btn.textContent='Rispondi';
  window.todayQuestion=q;if(qel)qel.textContent=q.question;
  const {data:state,error}=await sb.rpc('get_daily_state',{target_question_id:q.id});
  if(seq!==usTodayHydrateSeq)return;
  if(error){console.warn(error);window.UsTodayPriority?.refresh?.({daily:null});return;}
  window.todayState=state;
  if(state?.my_answer){
    document.getElementById('answer').value=state.my_answer;
    btn.textContent='Aggiorna risposta';
  }else{
    btn.textContent='Rispondi';
  }
  if(state?.both_answered){
    locked.innerHTML='♡ <b>Risposte sbloccate</b>';
    answerEl.disabled=true; btn.disabled=true; btn.textContent='Risposte sbloccate';
    // M10.2 — stato personale (ricevuta, avviso, reazioni) dal server; mai testo qui.
    renderTodayReveal();
    const meta=await loadDailyRevealMeta(q.id);
    if(seq!==usTodayHydrateSeq)return;
    if(meta)window.todayRevealMeta=meta;
    renderTodayReveal();
    await markDailyRevealSeenIfVisible(q.id,seq);
    if(seq!==usTodayHydrateSeq)return;
    await dailyQuestionOutcomes.load(q,state);
    if(seq!==usTodayHydrateSeq)return;
    // M12B.4 — Conserva solo qui, dove lo scambio è legittimamente visibile.
    await window.UsDailyKeepsake?.load?.(q.id);
    if(seq!==usTodayHydrateSeq)return;
  }else{
    window.todayRevealMeta=null;
    reveal.classList.add('hidden');reveal.innerHTML='';
    dailyQuestionOutcomes.hide();
    window.UsDailyKeepsake?.hide?.();
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
  window.UsTodayPriority?.refresh?.({daily:{
    question:q,
    state,
    reveal:window.todayRevealMeta,
    partnerName:dailyRitualPartnerName()
  }});
}

async function updateHomeStatus(){
  if(!window.usProfile)return;
  const todayPill=document.getElementById('todayStatusPill');
  const st=window.todayState;
  const partner=window.usProfile.role==='francesco'?'Bea':'Francesco';
  if(todayPill){
    if(st?.both_answered) todayPill.textContent='💬 Today · reveal sbloccato';
    else if(st?.my_answer) todayPill.textContent='💬 Today · in attesa di '+partner;
    else if(st?.partner_has_answer) todayPill.textContent='💬 Today · risposta in attesa';
    else todayPill.textContent='💬 Today · da fare';
  }
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
  const detected=document.getElementById('momentDetectedDate');if(detected)detected.textContent='';
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

// M12A — a newly created Ricordo settles in and catches the light ONCE. The id
// is remembered until its card is first rendered (a concurrent refresh may
// draw the grid before our own), then forgotten: scrolling, later refreshes
// and every other card never replay it.
let usFreshRicordo=null;
const US_FRESH_RICORDO_TTL_MS=30000;
function markFreshRicordo(id){usFreshRicordo={id:String(id),at:Date.now()};}
function consumeFreshRicordo(grid){
  if(!usFreshRicordo)return false;
  if(Date.now()-usFreshRicordo.at>US_FRESH_RICORDO_TTL_MS){usFreshRicordo=null;return false;}
  const card=[...(grid?.querySelectorAll?.('.moment-card[data-moment-id]')||[])].find(c=>c.dataset.momentId===usFreshRicordo.id);
  if(!card)return false;
  usFreshRicordo=null;
  return Boolean(window.UsUiFoundation?.playOnce?.(card,'ricordi-new',1300));
}
window.UsRicordiFresh=Object.freeze({mark:markFreshRicordo,consume:consumeFreshRicordo});

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
    const {data:created,error:rowError}=await sb.from('moments').insert({
      couple_id:window.usProfile.couple_id,
      created_by:window.usProfile.id,
      storage_path:path,
      caption:caption||null,
      moment_date:momentDate
    }).select('id').single();
    if(rowError){await sb.storage.from('us-media').remove([path]);throw rowError;}
    // M12A — only THIS creation earns the one-shot light catch (see consumeFreshRicordo).
    if(created?.id)markFreshRicordo(created.id);
    window.UsFeedback?.success?.();
    resetMomentComposer();
    toast('Ricordo aggiunto ♡');
    await hydrateMoments();
    await hydrateHomeMemory();
    if(!homePhotoPath)await hydrateHomePhoto(true);
  }catch(err){console.warn(err);toast(err?.message==='SOURCE_TOO_LARGE'?'Foto troppo grande: massimo 20 MB':'Upload non riuscito');}
  finally{btn.disabled=false;btn.textContent='Salva ricordo';}
}
window.uploadMoment=uploadMoment;

// ===== M8A — Ricordi living archive =====
// Ricordi da album a storia viva, SOLO da dati reali e dalle loro fonti:
// moments (+ moment_photos via albums), le esperienze Da vivere vissute
// (bucket_items status=lived), le occorrenze di Eventi vissute
// (relationship_event_history, M12B.3) e le Domande del giorno conservate
// (M12B.4); sola lettura, mai copiate. Nessuna tabella,
// nessun ranking, nessun testo generato: Rivivi riemerge un ricordo vero,
// La vostra storia è cronologica, Capitoli raggruppa per anno.
const RICORDI_MONTHS=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
function ricordiDayDiff(aISO,bISO){
  const a=Date.UTC(...aISO.split('-').map((v,i)=>i===1?Number(v)-1:Number(v)));
  const b=Date.UTC(...bISO.split('-').map((v,i)=>i===1?Number(v)-1:Number(v)));
  return Math.round((a-b)/86400000);
}
function ricordiLocalISO(instant){
  const d=new Date(instant);
  if(Number.isNaN(d.getTime()))return null;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
// M12B.5 — un solo modello d'archivio sopra i dati esistenti, mai una copia.
// Ogni voce porta la sua identità canonica (sourceKey):
//   moment:<id>                    Moment senza provenienza
//   da_vivere:<bucket_item id>     esperienza Da vivere vissuta
//   shared_event_completion:<id>   occorrenza di un Evento vissuta
//   daily_question:<question id>   Domanda del giorno conservata (M12B.4)
// Un Moment collegato da living_provenance (M12B.3) NON è una seconda
// esperienza: prende la chiave della sua fonte e ne diventa la foto. La
// deduplica è solo per chiave canonica, mai per titolo.
const RICORDI_SOURCE_LABEL=Object.freeze({experience:'Da vivere',event:'Evento vissuto',daily:'Domanda del giorno'});
function ricordiTimeline(moments,lived,kept,events,provenance){
  const byKey=new Map();
  const add=entry=>{if(!byKey.has(entry.sourceKey))byKey.set(entry.sourceKey,entry);return byKey.get(entry.sourceKey);};
  for(const row of lived||[]){const date=ricordiLocalISO(row?.completed_at);if(row?.id&&date)add({kind:'experience',sourceKey:`da_vivere:${row.id}`,date,at:row.completed_at,row,title:row.title||'',moment:null});}
  for(const row of events||[]){
    if(!row?.source_ref||!/^\d{4}-\d{2}-\d{2}$/.test(String(row.occurrence_date||'')))continue;
    add({kind:'event',sourceKey:`shared_event_completion:${row.source_ref}`,date:String(row.occurrence_date),at:row.completed_at||'',row,title:row.title||'',moment:null});
  }
  for(const row of kept||[])if(row?.id&&/^daily_question:/.test(String(row.source_key||''))&&/^\d{4}-\d{2}-\d{2}$/.test(String(row.question_date||''))&&row.question_text)add({kind:'daily',sourceKey:String(row.source_key),date:String(row.question_date),at:row.revealed_at||'',row,title:row.question_text,moment:null});
  // Moment → fonte: dalla tabella di provenienza e, per gli Eventi, dalla vista storica.
  const sourceOf=new Map();
  for(const p of provenance||[]){
    if(p?.target_moment_id&&p.source_kind&&p.source_ref)sourceOf.set(p.target_moment_id,p);
    // Per Da vivere la provenance congela il fatto storico quando la foto
    // viene collegata: data vissuta server-authoritative e titolo di allora.
    // Lo snapshot resta la verità anche se il bucket item è ancora leggibile
    // (e magari in seguito rinominato). Gli Eventi invece restano autorità
    // di relationship_event_history, incluso il fallback title_source='live'.
    if(p?.source_kind==='da_vivere'&&p.source_ref){
      const existing=byKey.get(`da_vivere:${p.source_ref}`);
      if(existing){
        if(/^\d{4}-\d{2}-\d{2}$/.test(String(p.source_date||'')))existing.date=String(p.source_date);
        if(p.source_title){existing.title=p.source_title;existing.row={...existing.row,title:p.source_title};}
      }
    }
  }
  for(const row of events||[])if(row?.moment_id&&row.source_ref&&!sourceOf.has(row.moment_id))sourceOf.set(row.moment_id,{source_kind:'shared_event_completion',source_ref:row.source_ref});
  for(const row of moments||[]){
    if(!row?.id||!row.moment_date)continue;
    const p=sourceOf.get(row.id);
    const kind=p?.source_kind==='da_vivere'?'experience':p?.source_kind==='shared_event_completion'?'event':null;
    if(!kind){add({kind:'moment',sourceKey:`moment:${row.id}`,date:row.moment_date,at:row.created_at||'',row,title:row.caption||'',moment:row});continue;}
    const sourceKey=`${p.source_kind}:${p.source_ref}`;
    const existing=byKey.get(sourceKey);
    if(existing){if(!existing.moment)existing.moment=row;continue;}
    // Fonte non leggibile (non più vissuta o rimossa): resta la sua istantanea.
    const date=/^\d{4}-\d{2}-\d{2}$/.test(String(p.source_date||''))?String(p.source_date):row.moment_date;
    add({kind,sourceKey,date,at:row.created_at||'',row:{id:p.source_ref,title:p.source_title||''},title:p.source_title||row.caption||'',moment:row,orphan:true});
  }
  return [...byKey.values()].sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:(a.at<b.at?1:a.at>b.at?-1:(a.sourceKey<b.sourceKey?-1:a.sourceKey>b.sourceKey?1:0)));
}
function ricordiPeriodKey(dateISO){return dateISO.slice(0,7);}
function ricordiPeriodLabel(dateISO){const [y,m]=dateISO.split('-');return {month:RICORDI_MONTHS[Number(m)-1]||'',year:y};}
// Rivivi: consuma le stesse voci della storia (stessa verità di Capitoli).
// Prima un anniversario vero (stesso periodo dell'anno, ±3 giorni, in un anno
// passato; il più vicino, poi il più recente, poi la chiave), altrimenti una
// voce di almeno 30 giorni fa scelta per il giorno: stabile per tutta la
// giornata e diversa dal giorno prima (indice = giorno dall'epoca). Niente di
// recente, niente riempitivi, niente casualità.
function ricordiPickRivivi(entries,todayISO){
  const rows=(entries||[]).filter(e=>e?.sourceKey&&/^\d{4}-\d{2}-\d{2}$/.test(String(e.date||''))&&e.date<todayISO);
  if(!rows.length)return null;
  const [ty]=todayISO.split('-').map(Number);
  let best=null;
  for(const e of rows){
    const years=ty-Number(e.date.slice(0,4));
    if(years<1)continue;
    const sameYearDay=`${ty}${e.date.slice(4)}`;
    const off=Math.abs(ricordiDayDiff(sameYearDay,todayISO));
    if(off<=3&&(!best||off<best.off||(off===best.off&&(years<best.years||(years===best.years&&e.sourceKey<best.entry.sourceKey)))))best={entry:e,off,years};
  }
  if(best)return {entry:best.entry,row:best.entry.row,reason:'anniversary',label:best.years===1?'Un anno fa, in questi giorni':`${best.years} anni fa, in questi giorni`};
  const older=rows.filter(e=>ricordiDayDiff(todayISO,e.date)>=30).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:(a.sourceKey<b.sourceKey?-1:1));
  if(!older.length)return null;
  const dayIndex=Math.max(0,ricordiDayDiff(todayISO,'1970-01-01'));
  const entry=older[dayIndex%older.length];
  const days=ricordiDayDiff(todayISO,entry.date);
  const months=Math.floor(days/30.44);
  const label=days>=365?(Math.floor(days/365)===1?'Un anno fa':`${Math.floor(days/365)} anni fa`):(months<=1?'Un mese fa':`${months} mesi fa`);
  return {entry,row:entry.row,reason:'resurface',label};
}
// Capitoli: raccolte secondarie per anno, contate sulle stesse voci (una
// esperienza con la sua foto conta una volta), copertina = foto più recente.
function ricordiChapters(timeline){
  const byYear=new Map();
  for(const item of timeline){
    const year=item.date.slice(0,4);
    if(!byYear.has(year))byYear.set(year,{year,count:0,moments:0,experiences:0,dailies:0,cover:null});
    const ch=byYear.get(year);
    ch.count++;
    if(item.kind==='moment')ch.moments++;else if(item.kind==='daily')ch.dailies++;else ch.experiences++;
    if(!ch.cover&&item.moment)ch.cover=item.moment;
  }
  return [...byYear.values()];
}
window.UsRicordiArchive=Object.freeze({timeline:ricordiTimeline,pickRivivi:ricordiPickRivivi,chapters:ricordiChapters,periodLabel:ricordiPeriodLabel});

function ricordiMomentCard(row,signedUrl,author,own,feature,source){
  const displayISO=/^\d{4}-\d{2}-\d{2}$/.test(String(source?.date||''))?String(source.date):row.moment_date;
  const dateLabel=new Date(displayISO+'T12:00:00').toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'});
  return `<article class="moment-card moment-postit${feature?' ricordi-feature':''}" role="button" tabindex="0" data-moment-id="${escapeHtml(row.id)}" data-moment-owner="${escapeHtml(row.created_by)}" data-moment-iso="${escapeHtml(displayISO)}" data-url="${escapeHtml(signedUrl)}" data-author="${escapeHtml(author||'Noi')}" data-date="${escapeHtml(dateLabel)}" data-caption="${escapeHtml(row.caption||'')}" onclick="openMomentViewer(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openMomentViewer(this)}"><img src="${escapeHtml(signedUrl)}" alt="Ricordo condiviso" loading="lazy">${own?`<button class="moment-delete" type="button" aria-label="Elimina ricordo" onclick="event.stopPropagation();deleteMoment('${row.id}','${escapeHtml(row.storage_path)}')"><span class="us-overflow-icon" aria-hidden="true"><svg viewBox="0 0 18 6"><circle cx="3" cy="3" r="2"/><circle cx="9" cy="3" r="2"/><circle cx="15" cy="3" r="2"/></svg></span></button>`:''}<div class="moment-meta"><div class="moment-by">${escapeHtml(author||'Noi')}</div><b>${dateLabel}</b>${source?`<small class="ricordi-moment-source" data-source-key="${escapeHtml(source.sourceKey)}">${escapeHtml(RICORDI_SOURCE_LABEL[source.kind]||'')}${source.title?` · ${escapeHtml(source.title)}`:''}</small>`:''}${row.caption?`<p>${escapeHtml(row.caption)}</p>`:''}</div></article>`;
}
function ricordiExperienceCard(row,sourceDate){
  const date=/^\d{4}-\d{2}-\d{2}$/.test(String(sourceDate||''))?String(sourceDate):ricordiLocalISO(row.completed_at);
  const day=new Date(date+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long'});
  return `<button type="button" class="ricordi-experience" data-ricordi-experience="${escapeHtml(row.id)}"><span class="ricordi-experience-mark" aria-hidden="true"></span><span class="ricordi-experience-copy"><small>Vissuta insieme · ${escapeHtml(day)}</small><b>${escapeHtml(row.title)}</b></span><span class="ricordi-experience-source">Da vivere</span></button>`;
}
// M12B.4 — una Domanda del giorno conservata: provenienza esplicita e le due
// risposte come erano al reveal (snapshot del server), apribile sul posto.
function ricordiDailyCard(row){
  const day=new Date(String(row.question_date)+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long'});
  return `<details class="ricordi-daily" data-ricordi-daily="${escapeHtml(row.id)}" data-source-key="${escapeHtml(row.source_key||'')}"><summary><span class="ricordi-experience-mark ricordi-daily-mark" aria-hidden="true"></span><span class="ricordi-experience-copy"><small>Domanda del giorno · ${escapeHtml(day)}</small><b>${escapeHtml(row.question_text)}</b></span><span class="ricordi-experience-source">Conservata</span></summary>${ricordiDailyAnswers(row)}</details>`;
}
function ricordiDailyAnswers(row){
  const answer=(label,text)=>`<div class="ricordi-daily-answer"><b>${escapeHtml(label)}</b><p>${escapeHtml(text||'')}</p></div>`;
  return `<div class="ricordi-daily-answers">${answer('Francesco',row.francesco_answer)}${answer('Bea',row.beatrice_answer)}</div>`;
}
// M12B.5 — un Evento vissuto senza foto resta un record evento (D3=A): titolo
// storico (snapshot al completamento, altrimenti il titolo attuale dichiarato
// come tale), data dell'occorrenza, nessuna azione sull'evento mutabile.
function ricordiEventTitle(row){return row?.title||'Evento';}
function ricordiEventCard(row){
  const day=new Date(String(row.occurrence_date)+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long'});
  return `<article class="ricordi-experience ricordi-event" data-source-key="shared_event_completion:${escapeHtml(row.source_ref)}" data-title-source="${escapeHtml(row.title_source||'')}"><span class="ricordi-experience-mark ricordi-event-mark" aria-hidden="true"></span><span class="ricordi-experience-copy"><small>Vissuto insieme · ${escapeHtml(day)}</small><b>${escapeHtml(ricordiEventTitle(row))}</b></span><span class="ricordi-experience-source">Evento</span></article>`;
}
// M12B.5 — Rivivi parla la lingua della fonte, in un solo linguaggio visivo:
// con foto apre il Moment viewer esistente (anche quando la foto è l'immagine
// di un'esperienza o di un Evento vissuto); senza foto si apre sul posto in
// sola lettura con i valori storici (risposte conservate, data vissuta).
function ricordiRiviviDate(iso){return new Date(String(iso)+'T12:00:00').toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'});}
function ricordiRiviviTitle(entry){
  if(entry.kind==='moment')return entry.row.caption||'';
  if(entry.kind==='event')return entry.orphan?(entry.title||'Evento'):ricordiEventTitle(entry.row);
  return entry.title||'';
}
function renderRicordiRivivi(pick,signedUrls,names){
  const root=document.getElementById('ricordiRivivi');
  if(!root)return;
  const entry=pick?.entry;
  if(!entry){root.hidden=true;root.innerHTML='';return;}
  const date=ricordiRiviviDate(entry.date);
  const title=ricordiRiviviTitle(entry);
  const url=entry.moment?signedUrls.get(entry.moment.storage_path):null;
  if(url){
    const m=entry.moment;
    const author=names.get(m.created_by)||'Noi';
    const meta=entry.kind==='moment'?author:RICORDI_SOURCE_LABEL[entry.kind];
    const viewerISO=entry.kind==='moment'?m.moment_date:entry.date;
    const viewerDate=new Date(viewerISO+'T12:00:00').toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'});
    root.innerHTML=`<div class="ricordi-kicker">RIVIVI</div><button type="button" class="ricordi-rivivi-card" data-ricordi-open="${escapeHtml(m.id)}" data-source-key="${escapeHtml(entry.sourceKey)}" data-rivivi-kind="${escapeHtml(entry.kind)}" data-url="${escapeHtml(url)}" data-author="${escapeHtml(author)}" data-date="${escapeHtml(viewerDate)}" data-caption="${escapeHtml(m.caption||title)}" aria-label="Rivivi: ${escapeHtml(title||date)}"><img src="${escapeHtml(url)}" alt="" loading="lazy"><span class="ricordi-rivivi-copy"><small>${escapeHtml(pick.label)}</small><b>${escapeHtml(title||date)}</b><span>${escapeHtml(date)} · ${escapeHtml(meta)}</span></span></button>`;
    root.hidden=false;
    return;
  }
  if(entry.kind==='moment'){root.hidden=true;root.innerHTML='';return;}
  let body='';
  if(entry.kind==='daily')body=ricordiDailyAnswers(entry.row);
  else if(entry.kind==='event')body=`<p class="ricordi-rivivi-detail">Vissuto insieme il ${escapeHtml(date)}.${entry.row.title_source==='live'?' Il titolo è quello di oggi: quello di allora non era registrato.':''}</p>`;
  else body=`<p class="ricordi-rivivi-detail">Vissuta insieme il ${escapeHtml(date)}.</p>${entry.orphan?'':`<button type="button" class="ricordi-rivivi-link" data-ricordi-experience="${escapeHtml(entry.row.id)}">Apri in Da vivere</button>`}`;
  root.innerHTML=`<div class="ricordi-kicker">RIVIVI</div><details class="ricordi-rivivi-card ricordi-rivivi-note" data-source-key="${escapeHtml(entry.sourceKey)}" data-rivivi-kind="${escapeHtml(entry.kind)}"><summary aria-label="Rivivi: ${escapeHtml(title||date)}"><span class="ricordi-rivivi-mark ricordi-rivivi-mark-${escapeHtml(entry.kind)}" aria-hidden="true"></span><span class="ricordi-rivivi-text"><small>${escapeHtml(pick.label)}</small><b>${escapeHtml(title||date)}</b><span>${escapeHtml(date)} · ${escapeHtml(RICORDI_SOURCE_LABEL[entry.kind])}</span></span></summary><div class="ricordi-rivivi-body">${body}</div></details>`;
  root.hidden=false;
}
function renderRicordiChapters(chapters,signedUrls){
  const root=document.getElementById('ricordiChapters');
  if(!root)return;
  if(!chapters.length){root.hidden=true;root.innerHTML='';return;}
  root.innerHTML=`<div class="ricordi-section-head"><div class="ricordi-kicker">CAPITOLI</div><h3>Per anno</h3></div><div class="ricordi-chapter-row">${chapters.map(ch=>{
    const url=ch.cover?signedUrls.get(ch.cover.storage_path):null;
    const parts=[ch.moments?`${ch.moments} ${ch.moments===1?'ricordo':'ricordi'}`:'',ch.experiences?`${ch.experiences} ${ch.experiences===1?'esperienza':'esperienze'}`:'',ch.dailies?`${ch.dailies} ${ch.dailies===1?'domanda':'domande'}`:''].filter(Boolean).join(' · ');
    return `<button type="button" class="ricordi-chapter" data-ricordi-year="${escapeHtml(ch.year)}">${url?`<img src="${escapeHtml(url)}" alt="" loading="lazy">`:''}<span><b>${escapeHtml(ch.year)}</b><small>${escapeHtml(parts)}</small></span></button>`;
  }).join('')}</div>`;
  root.hidden=false;
}
function openRicordiExperience(id){
  go('bond',{nav:true});
  Promise.resolve(window.hydrateNoiIdeas?.()).then(()=>window.openNoiIdeaDetail?.(id)).catch(()=>{});
}
document.getElementById('moments')?.addEventListener('click',event=>{
  const rivivi=event.target.closest('[data-ricordi-open]');
  if(rivivi){openMomentViewer(rivivi);return;}
  const experience=event.target.closest('[data-ricordi-experience]');
  if(experience){openRicordiExperience(experience.dataset.ricordiExperience);return;}
  const chapter=event.target.closest('[data-ricordi-year]');
  if(chapter){
    const target=document.querySelector(`#momentsGrid .ricordi-period[data-year="${chapter.dataset.ricordiYear}"]`);
    target?.scrollIntoView({behavior:window.UsUiFoundation?.isReducedMotion?.()?'auto':'smooth',block:'start'});
  }
});

async function hydrateMomentsCore(){
  if(!window.usProfile)return;
  const grid=document.getElementById('momentsGrid');
  const pill=document.getElementById('momentsStatusPill');
  if(!grid)return;
  const profile=window.usProfile;
  if(grid.dataset.loaded!=='1')grid.innerHTML='<div class="empty-state moment-loading"><div class="emoji"><span class="us-icon" data-us-icon="arrows-clockwise" aria-hidden="true"></span></div><b>Carico…</b></div>';
  const [{data:rows,error},{data:profiles,error:profilesError},{data:lived,error:livedError},{data:kept,error:keptError},{data:events,error:eventsError},{data:provenance,error:provenanceError}]=await Promise.all([
    sb.from('moments').select('id,created_by,storage_path,caption,moment_date,created_at').order('moment_date',{ascending:false}).order('created_at',{ascending:false}),
    sb.from('profiles').select('id,display_name').eq('couple_id',profile.couple_id),
    sb.from('bucket_items').select('id,title,completed_at').eq('couple_id',profile.couple_id).eq('status','lived'),
    sb.from('daily_question_keepsakes').select('id,source_key,question_text,question_date,francesco_answer,beatrice_answer,revealed_at').order('question_date',{ascending:false}),
    sb.from('relationship_event_history').select('source_ref,occurrence_date,completed_at,title,title_source,moment_id'),
    sb.from('living_provenance').select('source_kind,source_ref,source_title,source_date,target_moment_id')
  ]);
  if(window.usProfile!==profile)return;
  if(error){console.warn(error);if(grid.dataset.loaded!=='1')grid.innerHTML='<div class="empty-state moment-loading"><div class="emoji">!</div><b>Ricordi non disponibili</b><p>Riprova tra un momento.</p></div>';return;}
  if(profilesError)console.warn(profilesError);
  // Le esperienze vissute sono un arricchimento: se non si leggono, la storia
  // resta quella dei Moments, mai un errore dell'intera pagina.
  if(livedError)console.warn(livedError);
  const livedRows=livedError?[]:(lived||[]);
  if(keptError)console.warn(keptError);
  const keptRows=keptError?[]:(kept||[]);
  // M12B.5: Eventi vissuti e provenienza sono arricchimenti come i precedenti.
  // Senza provenienza un Moment collegato e la sua fonte restano due voci
  // finché la lettura non torna: mai inventate, mai unite per titolo.
  if(eventsError)console.warn(eventsError);
  const eventRows=eventsError?[]:(events||[]);
  if(provenanceError)console.warn(provenanceError);
  const provenanceRows=provenanceError?[]:(provenance||[]);
  if(pill)pill.textContent='📸 Moments · '+(rows?.length||0);
  const today=localDateISO();
  const signature=JSON.stringify([today,(rows||[]).map(r=>[r.id,r.created_by,r.storage_path,r.caption||'',r.moment_date,r.created_at]),livedRows.map(r=>[r.id,r.title,r.completed_at]),keptRows.map(r=>[r.id,r.question_date]),eventRows.map(r=>[r.source_ref,r.occurrence_date,r.title,r.title_source,r.moment_id]),provenanceRows.map(r=>[r.source_kind,r.source_ref,r.target_moment_id])]);
  if(grid.dataset.loaded==='1'&&grid.dataset.signature===signature)return;
  if(!rows?.length&&!livedRows.length&&!keptRows.length&&!eventRows.length){
    grid.innerHTML='<div class="empty-state moment-loading ricordi-empty"><b>La vostra storia parte da qui</b></div>';
    renderRicordiRivivi(null,new Map(),new Map());
    renderRicordiChapters([],new Map());
    grid.dataset.loaded='1';grid.dataset.signature=signature;return;
  }
  const names=new Map((profiles||[]).map(p=>[p.id,p.display_name||'Noi']));
  const signedUrls=await usGetSignedUrls((rows||[]).map(row=>row.storage_path),21600);
  if(window.usProfile!==profile)return;
  const timeline=ricordiTimeline((rows||[]).filter(r=>signedUrls.get(r.storage_path)),livedRows,keptRows,eventRows,provenanceRows);
  const html=[];
  let period='';
  // Ritmo editoriale: la prima foto del mese è a tutta larghezza, le altre in
  // coppia; una foto rimasta sola prima di una voce larga si allarga anch'essa.
  let loneHalf=-1;
  const closeRow=()=>{if(loneHalf>=0){html[loneHalf]=html[loneHalf].replace('class="moment-card moment-postit"','class="moment-card moment-postit ricordi-wide"');loneHalf=-1;}};
  for(const item of timeline){
    const key=ricordiPeriodKey(item.date);
    const opensPeriod=key!==period;
    if(opensPeriod){
      closeRow();
      period=key;
      const {month,year}=ricordiPeriodLabel(item.date);
      html.push(`<div class="ricordi-period" data-period="${key}" data-year="${year}"><b>${month}</b><span>${year}</span></div>`);
    }
    if(item.kind==='experience'&&!item.moment){closeRow();html.push(ricordiExperienceCard(item.row,item.date));continue;}
    if(item.kind==='event'&&!item.moment){closeRow();html.push(ricordiEventCard(item.row));continue;}
    if(item.kind==='daily'){closeRow();html.push(ricordiDailyCard(item.row));continue;}
    // Un Moment, o la foto di un'esperienza/Evento vissuto: una sola voce.
    const row=item.moment;
    const own=row.created_by===profile.id;
    const author=names.get(row.created_by)||(own?profile.display_name:'Noi');
    html.push(ricordiMomentCard(row,signedUrls.get(row.storage_path),author,own,opensPeriod,item.kind==='moment'?null:{kind:item.kind,sourceKey:item.sourceKey,title:ricordiRiviviTitle(item),date:item.date}));
    if(!opensPeriod)loneHalf=loneHalf>=0?-1:html.length-1;
  }
  closeRow();
  if(timeline.length){
    grid.innerHTML=html.join('');grid.dataset.loaded='1';grid.dataset.signature=signature;
    consumeFreshRicordo(grid);
    renderRicordiRivivi(ricordiPickRivivi(timeline,today),signedUrls,names);
    renderRicordiChapters(ricordiChapters(timeline),signedUrls);
  }
  else if(grid.dataset.loaded!=='1')grid.innerHTML='<div class="empty-state moment-loading"><div class="emoji">!</div><b>Foto non disponibili</b><p>Riprova tra un momento.</p></div>';
}
let momentsHydrateInFlight=null;
async function hydrateMoments(){
  if(momentsHydrateInFlight)return momentsHydrateInFlight;
  momentsHydrateInFlight=hydrateMomentsCore().finally(()=>{momentsHydrateInFlight=null;});
  return momentsHydrateInFlight;
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
  const signedUrl=await usGetSignedUrl(row.storage_path,21600);
  if(!signedUrl){section.hidden=true;return;}
  const dateLabel=new Date(row.moment_date+'T12:00:00').toLocaleDateString('it-IT',{day:'2-digit',month:'long',year:'numeric'});
  const author=names.get(row.created_by)||'Noi';
  document.getElementById('homeMemoryImg').src=signedUrl;
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

let momentViewerMediaToken=0;
function showMomentViewer(viewer){
  viewer.classList.add('show');
  viewer.setAttribute('aria-hidden','false');
  document.body.classList.add('viewer-open');
}
function openMomentViewer(card){
  const viewer=document.getElementById('momentViewer');
  const img=document.getElementById('momentViewerImg');
  window.UsUiFoundation?.cancelSurfaceExit?.(viewer);
  const mediaToken=++momentViewerMediaToken;
  const previewUrl=card.querySelector('img')?.currentSrc||card.querySelector('img')?.src||'';
  const url=card.dataset.url||previewUrl;
  img.classList.remove('is-media-ready');
  viewer.classList.toggle('is-media-preview',Boolean(previewUrl));
  img.onload=null;img.onerror=null;
  if(previewUrl)img.src=previewUrl;else img.removeAttribute('src');
  document.getElementById('momentViewerAuthor').textContent=card.dataset.author||'Noi';
  document.getElementById('momentViewerDate').textContent=card.dataset.date||'';
  const caption=document.getElementById('momentViewerCaption');
  caption.textContent=card.dataset.caption||'';
  caption.hidden=!card.dataset.caption;
  showMomentViewer(viewer);
  if(!url){viewer.classList.remove('is-media-preview');img.classList.add('is-media-ready');return;}
  const preload=new Image();
  preload.onload=async()=>{
    try{if(typeof preload.decode==='function')await preload.decode();}catch(_e){}
    if(mediaToken!==momentViewerMediaToken||!viewer.classList.contains('show'))return;
    img.onload=async()=>{
      try{if(typeof img.decode==='function')await img.decode();}catch(_e){}
      if(mediaToken===momentViewerMediaToken&&viewer.classList.contains('show')){
        viewer.classList.remove('is-media-preview');img.classList.add('is-media-ready');
      }
    };
    img.onerror=()=>{if(mediaToken===momentViewerMediaToken){viewer.classList.remove('is-media-preview');img.classList.add('is-media-ready');}};
    img.src=url;
    if(img.complete)img.onload?.();
  };
  preload.onerror=()=>{if(mediaToken===momentViewerMediaToken){viewer.classList.remove('is-media-preview');img.classList.add('is-media-ready');}};
  preload.src=url;
}
window.openMomentViewer=openMomentViewer;

function closeMomentViewer(){
  const viewer=document.getElementById('momentViewer');
  if(!viewer?.classList.contains('show'))return;
  ++momentViewerMediaToken;
  const finalize=()=>{
    viewer.classList.remove('show');
    viewer.setAttribute('aria-hidden','true');
    viewer.classList.remove('is-media-preview');document.getElementById('momentViewerImg').classList.remove('is-media-ready');
    document.body.classList.remove('viewer-open');
    document.getElementById('momentViewerImg').removeAttribute('src');
  };
  if(window.UsUiFoundation?.exitSurface)window.UsUiFoundation.exitSurface(viewer,finalize);else finalize();
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
  if(!(await usConfirm({kicker:'RICORDI',title:'Eliminare questo ricordo?',body:'La foto sparirà per entrambi.',confirmLabel:'Elimina',tone:'danger'})))return;
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
  if(level<=1)return 'Primo legame';
  if(level===2)return 'Complici';
  if(level===3)return 'In sintonia';
  if(level===4)return 'Stessa frequenza';
  if(level<=7)return 'Intesa rara';
  if(level<=12)return 'Indivisibili';
  if(level<=20)return 'Legame leggendario';
  return 'Noi, senza limite';
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
    if(prev>0&&level>prev){window.usCelebrateLevel?.(level,bondRankTitle(level))||toast(`LV. ${level} · ${bondRankTitle(level)}`);window.UsFeedback?.success?.();}
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
  // M10.1D — la barra è il progresso REALE dentro il livello corrente (bondLevelInfo:
  // (XP totali - soglia del livello) / XP del livello), mai un valore decorativo.
  const levelLabel=document.getElementById('bondResonanceLevel');if(levelLabel)levelLabel.textContent=`Livello ${info.level}`;
  const track=document.getElementById('bondProgressTrack');
  if(track){
    track.setAttribute('aria-valuemax',String(info.needed));
    track.setAttribute('aria-valuenow',String(info.current));
    track.setAttribute('aria-valuetext',`${info.current.toLocaleString('it-IT')} di ${info.needed.toLocaleString('it-IT')} XP nel livello ${info.level}`);
  }
  const line=document.getElementById('bondLevelXp');if(line)line.textContent=`${info.current.toLocaleString('it-IT')} / ${info.needed.toLocaleString('it-IT')} XP`;
  // M9D — hub Noi e superficie Risonanza: stessi numeri di couples.bond_xp.
  const hubTitle=document.getElementById('noiHubResonanceTitle');if(hubTitle)hubTitle.textContent=bondRankTitle(info.level);
  const hubMeta=document.getElementById('noiHubResonanceMeta');if(hubMeta)hubMeta.textContent=`Livello ${info.level}`;
  const hubFill=document.getElementById('noiHubResonanceFill');if(hubFill)hubFill.style.width=`${info.progress}%`;
  const resTotal=document.getElementById('noiResonanceTotal');if(resTotal)resTotal.textContent=info.total.toLocaleString('it-IT');
  window.usBondXp=info.total;
  renderBondBadges(info.level);
}
async function hydrateBondSummary(){
  if(!window.usProfile)return;
  const {data,error}=await sb.from('couples').select('bond_xp').eq('id',window.usProfile.couple_id).maybeSingle();
  if(error){console.warn(error);return;}
  renderBondProgress(data?.bond_xp||0);
  window.hydrateNoiEvents?.();
}
window.hydrateBondSummary=hydrateBondSummary;

// ===== M12C · Risonanza V2 — recent real growth, read-only =====
const RESONANCE_HISTORY_LIMIT=6;
function resonanceHistoryEntries(quests,eventCompletions,eventHistory){
  const historyByRef=new Map((eventHistory||[]).filter(row=>row?.source_ref).map(row=>[String(row.source_ref),row]));
  const byKey=new Map();
  for(const row of quests||[]){
    const xp=Math.max(0,Number(row?.xp)||0);
    if(!row?.id||!row.completed_at||xp<=0)continue;
    const sourceKey=`quest:${row.id}`;
    if(!byKey.has(sourceKey))byKey.set(sourceKey,{kind:'quest',sourceKey,title:row.title||'Quest di coppia',xp,at:row.completed_at,titleSource:'snapshot'});
  }
  for(const row of eventCompletions||[]){
    const xp=Math.max(0,Number(row?.xp_awarded)||0);
    if(!row?.id||!row.completed_at||xp<=0)continue;
    const history=historyByRef.get(String(row.id));
    const sourceKey=`shared_event_completion:${row.id}`;
    const title=history?.title||row.event_title_snapshot||'Evento vissuto';
    if(!byKey.has(sourceKey))byKey.set(sourceKey,{kind:'event',sourceKey,title,xp,at:row.completed_at,titleSource:history?.title_source||(row.event_title_snapshot?'snapshot':'missing')});
  }
  return [...byKey.values()]
    .sort((a,b)=>a.at<b.at?1:a.at>b.at?-1:(a.sourceKey<b.sourceKey?-1:a.sourceKey>b.sourceKey?1:0))
    .slice(0,RESONANCE_HISTORY_LIMIT);
}
function resonanceHistoryDate(at){
  const d=new Date(at);
  return Number.isNaN(d.getTime())?'':d.toLocaleDateString('it-IT',{day:'numeric',month:'short'});
}
function renderResonanceHistory(entries){
  const root=document.getElementById('noiResonanceHistory');
  if(!root)return;
  root.setAttribute('aria-busy','false');
  if(!entries?.length){
    root.innerHTML='<div class="noi-resonance-history-empty"><b>La prossima crescita apparirà qui</b><span>Quest ed eventi completati aggiungono XP reali alla vostra Risonanza.</span></div>';
    return;
  }
  root.innerHTML=entries.map(entry=>{
    const kindLabel=entry.kind==='quest'?'Quest di coppia':'Evento vissuto';
    const liveNote=entry.kind==='event'&&entry.titleSource==='live'?' · titolo attuale':'';
    const date=resonanceHistoryDate(entry.at);
    return `<article class="noi-resonance-history-row" data-resonance-source="${escapeHtml(entry.sourceKey)}" data-resonance-kind="${escapeHtml(entry.kind)}"><span class="noi-resonance-history-mark" aria-hidden="true"></span><span class="noi-resonance-history-copy"><small>${escapeHtml(kindLabel)}${date?` · ${escapeHtml(date)}`:''}${liveNote}</small><b>${escapeHtml(entry.title)}</b></span><strong>+${entry.xp.toLocaleString('it-IT')} XP</strong></article>`;
  }).join('');
}
async function hydrateResonanceHistory(){
  const profile=window.usProfile;
  const root=document.getElementById('noiResonanceHistory');
  if(!profile||!root)return;
  root.setAttribute('aria-busy','true');
  const coupleId=profile.couple_id;
  const [{data:quests,error:questError},{data:events,error:eventError},{data:history,error:historyError}]=await Promise.all([
    sb.from('bond_weekly_quests').select('id,title,xp,completed_at').eq('couple_id',coupleId).not('completed_at','is',null).order('completed_at',{ascending:false}).limit(8),
    sb.from('shared_event_completions').select('id,xp_awarded,completed_at,event_title_snapshot').eq('couple_id',coupleId).order('completed_at',{ascending:false}).limit(8),
    sb.from('relationship_event_history').select('source_ref,title,title_source,completed_at').order('completed_at',{ascending:false}).limit(8)
  ]);
  if(window.usProfile!==profile)return;
  if(questError)console.warn(questError);
  if(eventError)console.warn(eventError);
  if(historyError)console.warn(historyError);
  if(questError&&eventError){
    root.setAttribute('aria-busy','false');
    root.innerHTML='<div class="noi-resonance-history-empty"><b>Crescita non disponibile</b><span>Riprova tra un momento.</span></div>';
    return;
  }
  renderResonanceHistory(resonanceHistoryEntries(questError?[]:(quests||[]),eventError?[]:(events||[]),historyError?[]:(history||[])));
}
window.hydrateResonanceHistory=hydrateResonanceHistory;
window.UsResonance=Object.freeze({historyEntries:resonanceHistoryEntries,renderHistory:renderResonanceHistory});

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
      ${canReroll?`<button type="button" class="quest-reroll" onclick="rerollBondQuest('${q.id}')" aria-label="Cambia questa quest"><span class="us-icon" data-us-icon="arrows-clockwise" aria-hidden="true"></span></button>`:''}
    </div>
  </article>`;
}
async function hydrateBond(){
  if(!window.usProfile)return;
  const list=document.getElementById('bondQuestList');
  if(!list)return;
  if(list.dataset.loaded!=='1')list.innerHTML='<div class="empty-state"><div class="emoji">✦</div><b>Carico…</b></div>';
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
  renderNoiHubSummary();
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
  if(data?.xp_awarded){toast(`+${data.xp_awarded} Bond XP ♡`);window.UsFeedback?.success?.();}
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

// ===== M7B — Da vivere (bucket_items) =====
// Solo bucket_items (M7A). Nessuna nuova tabella/RPC/persistenza locale.
// Update: mai completed/completed_at/calendar_entry_id; solo title/note/link_url,
// o status='archived' per l'archiviazione esplicita (mai schedulazione/lived qui).
const NOI_IDEA_LINK_RE=/^https?:\/\//i;
let noiIdeaRequestGen=0;
let noiIdeaIdentityGen=0;
let noiIdeaState={loaded:false,busy:false,error:false,activeItems:[],livedItems:[],showLived:false,selectedId:null,identityKey:null,calendarById:new Map()};

function noiIdeaNormalizeLink(raw){
  const value=(raw||'').trim();
  if(!value)return null;
  return NOI_IDEA_LINK_RE.test(value)?value:null;
}
// M7C — "quando" arriva sempre dal Calendario (UsCalendarLinks), mai da una
// copia su bucket_items: se l'evento non è leggibile resta "In calendario".
function noiIdeaWhen(item){
  const entry=item?.calendar_entry_id?noiIdeaState.calendarById.get(item.calendar_entry_id):null;
  return entry?(window.UsCalendarLinks?.whenLabel?.(entry)||''):'';
}
function noiIdeaStateLabel(item){
  if(item.status==='scheduled'){const when=noiIdeaWhen(item);return when?`In calendario · ${when.split(',')[0]}`:'In calendario';}
  if(item.status==='lived')return 'Vissuta';
  return '';
}
function noiIdeaSnippet(note){
  if(!note)return '';
  return note.length>90?`${note.slice(0,90)}…`:note;
}
function noiIdeaCardHtml(item){
  const label=noiIdeaStateLabel(item);
  const noteHtml=item.note?`<small>${escapeHtml(noiIdeaSnippet(item.note))}</small>`:'';
  return `<button type="button" class="noi-idea-card" data-id="${escapeHtml(item.id)}"><span class="noi-idea-card-copy"><b>${escapeHtml(item.title)}</b>${noteHtml}</span>${label?`<span class="noi-idea-state">${escapeHtml(label)}</span>`:''}</button>`;
}
function renderNoiIdeaActiveList(){
  const root=document.getElementById('noiIdeaList');
  if(!root)return;
  root.setAttribute('aria-busy','false');
  if(noiIdeaState.error){
    root.innerHTML='<div class="empty-state noi-idea-error"><div class="emoji">!</div><b>Non riesco a caricare le idee.</b><p>Riprova tra un momento.</p><button type="button" onclick="hydrateNoiIdeas()">Riprova</button></div>';
    return;
  }
  renderNoiHubSummary();
  if(!noiIdeaState.activeItems.length){
    root.innerHTML='<div class="noi-quiet-state"><b>Niente in lista</b><span>Aggiungete la prima.</span></div>';
    return;
  }
  root.innerHTML=noiIdeaState.activeItems.map(noiIdeaCardHtml).join('');
}
// M9D — riepilogo delle card del hub Noi, solo da dati già caricati.
function renderNoiHubSummary(){
  const ideasTitle=document.getElementById('noiHubIdeasTitle');
  const ideasMeta=document.getElementById('noiHubIdeasMeta');
  if(ideasTitle&&ideasMeta){
    if(noiIdeaState.loaded&&!noiIdeaState.error){
      const count=noiIdeaState.activeItems.length;
      const scheduled=noiIdeaState.activeItems.filter(i=>i.status==='scheduled').length;
      ideasTitle.textContent=count?`${count} ${count===1?'idea':'idee'} da vivere`:'Nessuna idea';
      ideasMeta.textContent=scheduled?`${scheduled} in calendario`:'';
    }else{
      ideasTitle.textContent='Le vostre idee';
      ideasMeta.textContent='';
    }
  }
  const questTitle=document.getElementById('noiHubQuestTitle');
  const questMeta=document.getElementById('noiHubQuestMeta');
  const quests=Array.isArray(window.usBondQuests)?window.usBondQuests:[];
  if(questTitle&&questMeta){
    if(quests.length){
      const done=quests.filter(q=>q.completed_at).length;
      questTitle.textContent=done===quests.length?'Tutte completate':`${done} di ${quests.length} completate`;
      questMeta.textContent='';
    }else{
      questTitle.textContent='Questa settimana';
      questMeta.textContent='';
    }
  }
}
function renderNoiIdeaLivedList(){
  const toggle=document.getElementById('noiIdeaLivedToggle');
  const root=document.getElementById('noiIdeaLivedList');
  if(!toggle||!root)return;
  toggle.hidden=!noiIdeaState.livedItems.length;
  toggle.textContent=`Idee vissute (${noiIdeaState.livedItems.length})`;
  toggle.setAttribute('aria-expanded',String(noiIdeaState.showLived));
  root.hidden=!noiIdeaState.showLived;
  root.innerHTML=noiIdeaState.showLived?noiIdeaState.livedItems.map(noiIdeaCardHtml).join(''):'';
}
async function hydrateNoiIdeas(){
  if(!window.usProfile)return;
  const userId=window.usProfile.id,coupleId=window.usProfile.couple_id;
  const identityKey=`${userId}|${coupleId}`;
  // Account/couple switch: wipe the previous profile's in-memory ideas and
  // close any open detail/quick-add BEFORE issuing the new request, so a
  // slow response never leaves the old identity's private data on screen.
  if(noiIdeaState.identityKey&&noiIdeaState.identityKey!==identityKey)resetNoiIdeasForIdentityChange();
  noiIdeaState.identityKey=identityKey;
  const gen=++noiIdeaRequestGen;
  const section=document.querySelector('.noi-idea-section');
  if(section)section.hidden=false;
  const list=document.getElementById('noiIdeaList');
  if(list&&!noiIdeaState.loaded){
    list.setAttribute('aria-busy','true');
    list.innerHTML='<div class="empty-state" aria-busy="true"><div class="emoji"><span class="us-icon" data-us-icon="arrows-clockwise" aria-hidden="true"></span></div><b>Carico…</b></div>';
  }
  const {data,error}=await sb.from('bucket_items')
    .select('id,title,note,link_url,status,calendar_entry_id,completed_at,created_at,lived_proposed_by')
    .eq('couple_id',coupleId)
    .neq('status','archived')
    .order('created_at',{ascending:false});
  // Stale-response guard: ignore this result if a newer hydrateNoiIdeas call
  // started, or the signed-in identity moved on, while this request was in
  // flight. Never mutate state/DOM from an outdated response.
  if(gen!==noiIdeaRequestGen||window.usProfile?.id!==userId||window.usProfile?.couple_id!==coupleId)return;
  if(error){
    console.warn(error);
    noiIdeaState.error=true;
    renderNoiIdeaActiveList();
    return;
  }
  noiIdeaState.error=false;
  noiIdeaState.loaded=true;
  const rows=data||[];
  noiIdeaState.activeItems=rows.filter(r=>r.status!=='lived');
  noiIdeaState.livedItems=rows.filter(r=>r.status==='lived');
  renderNoiIdeaActiveList();
  renderNoiIdeaLivedList();
  await refreshNoiIdeaCalendarLinks(rows.map(r=>r.calendar_entry_id),gen,userId,coupleId);
}
async function refreshNoiIdeaCalendarLinks(ids,gen,userId,coupleId){
  const reader=window.UsCalendarLinks?.getEntriesByIds;
  if(typeof reader!=='function'||!ids.some(Boolean))return;
  let map;
  try{map=await reader(ids);}catch(e){console.warn('[US Da vivere] calendar links',e);return;}
  if((gen!=null&&gen!==noiIdeaRequestGen)||window.usProfile?.id!==userId||window.usProfile?.couple_id!==coupleId)return;
  for(const [id,entry] of map)noiIdeaState.calendarById.set(id,entry);
  renderNoiIdeaActiveList();
  renderNoiIdeaLivedList();
  if(noiIdeaState.selectedId)renderNoiIdeaDetailState(noiIdeaFindItem(noiIdeaState.selectedId));
}
window.hydrateNoiIdeas=hydrateNoiIdeas;
function resetNoiIdeasForIdentityChange(){
  noiIdeaIdentityGen++;
  noiIdeaRequestGen++;
  noiIdeaState={loaded:false,busy:false,error:false,activeItems:[],livedItems:[],showLived:false,selectedId:null,identityKey:null,calendarById:new Map()};
  const active=document.getElementById('noiIdeaList');
  if(active){active.innerHTML='';active.setAttribute('aria-busy','false');}
  const lived=document.getElementById('noiIdeaLivedList');
  if(lived){lived.innerHTML='';lived.hidden=true;}
  const toggle=document.getElementById('noiIdeaLivedToggle');
  if(toggle){toggle.hidden=true;toggle.textContent='Idee vissute';toggle.setAttribute('aria-expanded','false');}
  const section=document.querySelector('.noi-idea-section');
  if(section)section.hidden=true;
  closeNoiSection();
  renderNoiHubSummary();
  closeNoiIdeaDetail();
  toggleNoiIdeaQuickForm(false);
  const save=document.getElementById('noiIdeaQuickSave');if(save)save.disabled=false;
  const detailSave=document.getElementById('noiIdeaDetailSave');if(detailSave)detailSave.disabled=false;
  const archive=document.getElementById('noiIdeaDetailArchive');
  if(archive){archive.disabled=false;archive.dataset.confirm='';archive.textContent='Archivia';}
}
function noiIdeaOperationIsCurrent(userId,coupleId,identityGen){
  return noiIdeaIdentityGen===identityGen&&window.usProfile?.id===userId&&window.usProfile?.couple_id===coupleId;
}
function noiIdeaFindItem(id){
  return noiIdeaState.activeItems.find(i=>i.id===id)||noiIdeaState.livedItems.find(i=>i.id===id)||null;
}
// Applies a confirmed write to whatever row object the CURRENT state holds for
// this id: a hydrate that landed while the write was in flight replaces the
// arrays, so patching the object captured before the await would be lost.
function noiIdeaPatchItem(id,patch){
  const current=noiIdeaFindItem(id);
  if(current)Object.assign(current,patch);
  return current;
}
function toggleNoiIdeaQuickForm(open){
  const form=document.getElementById('noiIdeaQuickForm');
  const btn=document.getElementById('noiIdeaAddToggle');
  if(!form||!btn)return;
  form.hidden=!open;
  btn.setAttribute('aria-expanded',open?'true':'false');
  if(open){document.getElementById('noiIdeaQuickTitle')?.focus();return;}
  form.reset();
  const extra=document.getElementById('noiIdeaQuickExtra');
  if(extra)extra.hidden=true;
  document.getElementById('noiIdeaQuickMoreToggle')?.setAttribute('aria-expanded','false');
  const status=document.getElementById('noiIdeaQuickStatus');
  if(status)status.textContent='';
}
function noiIdeaDetailHint(_item){
  return '';
}
function noiIdeaLivedOnLabel(item){
  const d=item?.completed_at?new Date(item.completed_at):null;
  if(!d||Number.isNaN(d.getTime()))return '';
  return d.toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'});
}
function noiIdeaPartnerName(){
  return window.usProfile?.role==='francesco'?'Beatrice':'Francesco';
}
// none: nessuno ha proposto · mine: ho proposto io, attendo · partner: ha
// proposto l'altra persona, tocca a me · lived: confermata da entrambi.
function noiIdeaLivedPhase(item){
  if(item.status==='lived')return 'lived';
  if(item.status!=='idea'&&item.status!=='scheduled')return 'lived';
  if(!item.lived_proposed_by)return 'none';
  return item.lived_proposed_by===window.usProfile?.id?'mine':'partner';
}
// Stato "quando" del dettaglio: un'idea senza data offre "Metti in
// calendario"; una collegata mostra il quando (dal Calendario) e apre
// l'evento vero, mai un secondo editor di data.
function renderNoiIdeaDetailState(item){
  if(!item)return;
  const hintEl=document.getElementById('noiIdeaDetailHint');
  if(hintEl)hintEl.textContent=noiIdeaDetailHint(item);
  const cal=document.getElementById('noiIdeaDetailCalendar');
  const when=document.getElementById('noiIdeaDetailWhen');
  const schedule=document.getElementById('noiIdeaDetailSchedule');
  const linked=Boolean(item.calendar_entry_id)&&item.status!=='archived';
  if(cal)cal.hidden=!linked;
  if(when)when.textContent=linked?noiIdeaWhen(item):'';
  if(schedule)schedule.hidden=item.status!=='idea';
  // M7D — vissuta solo in due: chi propone aspetta, l'altra persona conferma.
  // Dopo la conferma reciproca (lived) resta solo un invito discreto al ricordo.
  const livedBtn=document.getElementById('noiIdeaDetailLived');
  const pending=noiIdeaLivedPhase(item);
  if(livedBtn){
    livedBtn.hidden=!(pending==='none'||pending==='partner');
    livedBtn.dataset.confirm='';
    livedBtn.textContent=pending==='partner'?"Sì, l'abbiamo vissuta":"L'abbiamo vissuta";
    livedBtn.disabled=false;
  }
  const livedWait=document.getElementById('noiIdeaDetailLivedWait');
  if(livedWait){
    livedWait.hidden=pending==='none'||pending==='lived';
    livedWait.textContent=pending==='mine'?`In attesa della conferma di ${noiIdeaPartnerName()}`:pending==='partner'?`${noiIdeaPartnerName()} dice che l'avete vissuta`:'';
  }
  const memory=document.getElementById('noiIdeaDetailMemory');
  if(memory)memory.hidden=item.status!=='lived';
  const livedOn=document.getElementById('noiIdeaDetailLivedOn');
  if(livedOn){const on=noiIdeaLivedOnLabel(item);livedOn.textContent=on?`il ${on}`:'';}
}
function openNoiIdeaDetail(id){
  const item=noiIdeaFindItem(id);
  if(!item)return;
  openNoiSection('da-vivere');
  noiIdeaState.selectedId=id;
  const titleEl=document.getElementById('noiIdeaDetailTitle');
  const noteEl=document.getElementById('noiIdeaDetailNote');
  const linkEl=document.getElementById('noiIdeaDetailLink');
  const hintEl=document.getElementById('noiIdeaDetailHint');
  const statusEl=document.getElementById('noiIdeaDetailStatus');
  const archiveBtn=document.getElementById('noiIdeaDetailArchive');
  if(titleEl)titleEl.value=item.title||'';
  if(noteEl)noteEl.value=item.note||'';
  if(linkEl)linkEl.value=item.link_url||'';
  renderNoiIdeaDetailState(item);
  if(statusEl)statusEl.textContent='';
  if(archiveBtn){archiveBtn.textContent='Archivia';archiveBtn.dataset.confirm='';}
  const browse=document.getElementById('noiIdeaBrowse');
  const detail=document.getElementById('noiIdeaDetail');
  if(browse)browse.hidden=true;
  if(detail)detail.hidden=false;
  titleEl?.focus();
}
function closeNoiIdeaDetail(){
  noiIdeaState.selectedId=null;
  const browse=document.getElementById('noiIdeaBrowse');
  const detail=document.getElementById('noiIdeaDetail');
  if(detail)detail.hidden=true;
  if(browse)browse.hidden=false;
}
async function submitNoiIdeaQuickAdd(event){
  event.preventDefault();
  if(noiIdeaState.busy||!window.usProfile)return;
  const status=document.getElementById('noiIdeaQuickStatus');
  const title=(document.getElementById('noiIdeaQuickTitle')?.value||'').trim();
  if(!title){if(status)status.textContent='Serve almeno un titolo.';return;}
  const userId=window.usProfile.id,coupleId=window.usProfile.couple_id,identityGen=noiIdeaIdentityGen;
  const note=(document.getElementById('noiIdeaQuickNote')?.value||'').trim()||null;
  const linkRaw=document.getElementById('noiIdeaQuickLink')?.value||'';
  if(linkRaw.trim()&&!noiIdeaNormalizeLink(linkRaw)){
    if(status)status.textContent='Il link deve iniziare con http:// o https://';
    return;
  }
  const link=noiIdeaNormalizeLink(linkRaw);
  noiIdeaState.busy=true;
  const saveBtn=document.getElementById('noiIdeaQuickSave');
  if(saveBtn)saveBtn.disabled=true;
  if(status)status.textContent='Salvo…';
  try{
    const {data,error}=await sb.from('bucket_items').insert({
      title,note,link_url:link,
      created_by:userId,
      couple_id:coupleId,
      status:'idea',completed:false
    }).select('id,title,note,link_url,status,calendar_entry_id,completed_at,created_at');
    if(!noiIdeaOperationIsCurrent(userId,coupleId,identityGen))return;
    if(error)throw error;
    const row=Array.isArray(data)&&data[0]?data[0]:null;
    if(row&&!noiIdeaFindItem(row.id))noiIdeaState.activeItems.unshift(row);
    renderNoiIdeaActiveList();
    toggleNoiIdeaQuickForm(false);
    toast('Idea aggiunta');
  }catch(e){
    if(!noiIdeaOperationIsCurrent(userId,coupleId,identityGen))return;
    console.warn(e);
    if(status)status.textContent='Non riesco a salvarla. Riprova.';
  }finally{
    if(!noiIdeaOperationIsCurrent(userId,coupleId,identityGen))return;
    noiIdeaState.busy=false;
    if(saveBtn)saveBtn.disabled=false;
  }
}
async function submitNoiIdeaDetail(event){
  event.preventDefault();
  if(noiIdeaState.busy)return;
  const id=noiIdeaState.selectedId;
  const item=id?noiIdeaFindItem(id):null;
  if(!item)return;
  const userId=window.usProfile.id,coupleId=window.usProfile.couple_id,identityGen=noiIdeaIdentityGen;
  const statusEl=document.getElementById('noiIdeaDetailStatus');
  const title=(document.getElementById('noiIdeaDetailTitle')?.value||'').trim();
  if(!title){if(statusEl)statusEl.textContent='Serve almeno un titolo.';return;}
  const note=(document.getElementById('noiIdeaDetailNote')?.value||'').trim()||null;
  const linkRaw=document.getElementById('noiIdeaDetailLink')?.value||'';
  if(linkRaw.trim()&&!noiIdeaNormalizeLink(linkRaw)){
    if(statusEl)statusEl.textContent='Il link deve iniziare con http:// o https://';
    return;
  }
  const link=noiIdeaNormalizeLink(linkRaw);
  noiIdeaState.busy=true;
  const saveBtn=document.getElementById('noiIdeaDetailSave');
  if(saveBtn)saveBtn.disabled=true;
  if(statusEl)statusEl.textContent='Salvo…';
  try{
    const {data:updated,error}=await sb.from('bucket_items').update({title,note,link_url:link}).eq('id',id).eq('couple_id',coupleId).select('id').maybeSingle();
    if(!noiIdeaOperationIsCurrent(userId,coupleId,identityGen))return;
    if(error)throw error;
    if(!updated)throw new Error('bucket_items_update_no_row');
    noiIdeaPatchItem(id,{title,note,link_url:link});
    renderNoiIdeaActiveList();
    renderNoiIdeaLivedList();
    toast('Idea aggiornata');
    closeNoiIdeaDetail();
  }catch(e){
    if(!noiIdeaOperationIsCurrent(userId,coupleId,identityGen))return;
    console.warn(e);
    if(statusEl)statusEl.textContent='Non riesco a salvarla. Riprova.';
  }finally{
    if(!noiIdeaOperationIsCurrent(userId,coupleId,identityGen))return;
    noiIdeaState.busy=false;
    if(saveBtn)saveBtn.disabled=false;
  }
}
async function archiveNoiIdea(){
  if(noiIdeaState.busy)return;
  const id=noiIdeaState.selectedId;
  const item=id?noiIdeaFindItem(id):null;
  if(!item)return;
  const btn=document.getElementById('noiIdeaDetailArchive');
  if(btn&&btn.dataset.confirm!=='1'){
    btn.dataset.confirm='1';
    btn.textContent='Confermi? Tocca di nuovo';
    setTimeout(()=>{if(btn.dataset.confirm==='1'){btn.dataset.confirm='';btn.textContent='Archivia';}},3000);
    return;
  }
  const userId=window.usProfile.id,coupleId=window.usProfile.couple_id,identityGen=noiIdeaIdentityGen;
  const statusEl=document.getElementById('noiIdeaDetailStatus');
  noiIdeaState.busy=true;
  if(btn)btn.disabled=true;
  if(statusEl)statusEl.textContent='Archivio…';
  try{
    const {data:archived,error}=await sb.from('bucket_items').update({status:'archived'}).eq('id',id).eq('couple_id',coupleId).select('id').maybeSingle();
    if(!noiIdeaOperationIsCurrent(userId,coupleId,identityGen))return;
    if(error)throw error;
    if(!archived)throw new Error('bucket_items_archive_no_row');
    noiIdeaState.activeItems=noiIdeaState.activeItems.filter(i=>i.id!==id);
    noiIdeaState.livedItems=noiIdeaState.livedItems.filter(i=>i.id!==id);
    renderNoiIdeaActiveList();
    renderNoiIdeaLivedList();
    toast('Idea archiviata');
    closeNoiIdeaDetail();
  }catch(e){
    if(!noiIdeaOperationIsCurrent(userId,coupleId,identityGen))return;
    console.warn(e);
    if(statusEl)statusEl.textContent='Non riesco ad archiviarla. Riprova.';
  }finally{
    if(!noiIdeaOperationIsCurrent(userId,coupleId,identityGen))return;
    noiIdeaState.busy=false;
    if(btn){btn.disabled=false;btn.dataset.confirm='';btn.textContent='Archivia';}
  }
}
// M7C — collegamento idea -> evento shared appena creato dal Calendario.
// Scrive solo status/calendar_entry_id su bucket_items, e solo se la riga è
// ancora un'idea senza link (guardia contro la race con l'altra persona o con
// un'archiviazione): 0 righe = 'stale', mai un successo silenzioso.
async function linkNoiIdeaToCalendar(id,entryId){
  if(!window.usProfile||!id||!entryId)return {ok:false,reason:'error'};
  const userId=window.usProfile.id,coupleId=window.usProfile.couple_id,identityGen=noiIdeaIdentityGen;
  const {data,error}=await sb.from('bucket_items')
    .update({status:'scheduled',calendar_entry_id:entryId})
    .eq('id',id).eq('couple_id',coupleId).eq('status','idea').is('calendar_entry_id',null)
    .select('id,status,calendar_entry_id').maybeSingle();
  if(error){console.warn(error);return {ok:false,reason:'error'};}
  if(!data)return {ok:false,reason:'stale'};
  if(!noiIdeaOperationIsCurrent(userId,coupleId,identityGen))return {ok:true};
  noiIdeaPatchItem(id,{status:'scheduled',calendar_entry_id:entryId});
  renderNoiIdeaActiveList();
  if(noiIdeaState.selectedId===id)renderNoiIdeaDetailState(noiIdeaFindItem(id));
  refreshNoiIdeaCalendarLinks([entryId],null,userId,coupleId);
  return {ok:true};
}
window.UsDaVivere=Object.freeze({linkCalendarEntry:linkNoiIdeaToCalendar});
function scheduleNoiIdea(){
  const item=noiIdeaState.selectedId?noiIdeaFindItem(noiIdeaState.selectedId):null;
  if(!item||item.status!=='idea'||noiIdeaState.busy)return;
  const opener=window.UsCalendarLinks?.openForIdea;
  if(typeof opener!=='function'){toast('Il calendario non è pronto. Riprova.');return;}
  opener({id:item.id,title:item.title,note:item.note});
}
function openNoiIdeaCalendarEntry(){
  const item=noiIdeaState.selectedId?noiIdeaFindItem(noiIdeaState.selectedId):null;
  if(!item?.calendar_entry_id)return;
  window.UsCalendarLinks?.openEntry?.(item.calendar_entry_id);
}
// M7D — "L'abbiamo vissuta", in due: la prima persona propone, l'altra conferma
// e solo allora il server porta l'idea a lived (RPC confirm_bucket_item_lived;
// nessuna scrittura diretta di status/completed). Non tocca calendar_entry_id
// (il link al giorno vero resta com'era) né crea un Moment: il ricordo, se c'è,
// lo aggiunge la coppia con una foto vera dall'azione discreta successiva.
async function markNoiIdeaLived(){
  if(noiIdeaState.busy||!window.usProfile)return;
  const id=noiIdeaState.selectedId;
  const item=id?noiIdeaFindItem(id):null;
  const phase=item?noiIdeaLivedPhase(item):'lived';
  if(!item||!(phase==='none'||phase==='partner'))return;
  const btn=document.getElementById('noiIdeaDetailLived');
  // Chiudere è irreversibile: la conferma finale vale due tocchi.
  if(phase==='partner'&&btn&&btn.dataset.confirm!=='1'){
    btn.dataset.confirm='1';
    btn.textContent='Confermo, l\'abbiamo vissuta';
    setTimeout(()=>{if(btn.dataset.confirm==='1'){btn.dataset.confirm='';btn.textContent="Sì, l'abbiamo vissuta";}},3000);
    return;
  }
  const userId=window.usProfile.id,coupleId=window.usProfile.couple_id,identityGen=noiIdeaIdentityGen;
  const statusEl=document.getElementById('noiIdeaDetailStatus');
  noiIdeaState.busy=true;
  if(btn)btn.disabled=true;
  if(statusEl)statusEl.textContent='Salvo…';
  try{
    const {data:res,error}=await sb.rpc('confirm_bucket_item_lived',{p_item_id:id});
    if(!noiIdeaOperationIsCurrent(userId,coupleId,identityGen))return;
    if(error)throw error;
    if(!res){
      if(statusEl)statusEl.textContent='È già cambiata: aggiorno la lista.';
      hydrateNoiIdeas();
      return;
    }
    if(statusEl)statusEl.textContent='';
    if(res.status==='lived'){
      const current=noiIdeaPatchItem(id,{status:'lived',completed_at:res.completed_at||new Date().toISOString(),calendar_entry_id:res.calendar_entry_id??item.calendar_entry_id,lived_proposed_by:res.lived_proposed_by});
      noiIdeaState.activeItems=noiIdeaState.activeItems.filter(i=>i.id!==id);
      if(current&&!noiIdeaState.livedItems.some(i=>i.id===id))noiIdeaState.livedItems.unshift(current);
      renderNoiIdeaActiveList();
      renderNoiIdeaLivedList();
      renderNoiIdeaDetailState(noiIdeaFindItem(id));
      toast('Vissuta insieme ♡');
    }else{
      noiIdeaPatchItem(id,{lived_proposed_by:res.lived_proposed_by});
      renderNoiIdeaDetailState(noiIdeaFindItem(id));
      toast(`Ora manca ${noiIdeaPartnerName()} ♡`);
    }
  }catch(e){
    if(!noiIdeaOperationIsCurrent(userId,coupleId,identityGen))return;
    console.warn(e);
    if(statusEl)statusEl.textContent='Non riesco a salvarla. Riprova.';
  }finally{
    if(!noiIdeaOperationIsCurrent(userId,coupleId,identityGen))return;
    noiIdeaState.busy=false;
    if(btn)btn.disabled=false;
  }
}
// Il ponte verso Ricordi: apre il composer esistente dei Moments con il
// titolo come nota suggerita. Nessun Moment nasce senza una foto scelta.
function addNoiIdeaMemory(){
  const item=noiIdeaState.selectedId?noiIdeaFindItem(noiIdeaState.selectedId):null;
  if(!item||item.status!=='lived')return;
  const composer=window.UsMomentComposer?.open;
  go('moments',{nav:true});
  if(typeof composer==='function')setTimeout(()=>composer({caption:item.title}),60);
}
document.getElementById('noiIdeaDetailLived')?.addEventListener('click',markNoiIdeaLived);
document.getElementById('noiIdeaDetailMemoryAdd')?.addEventListener('click',addNoiIdeaMemory);
document.getElementById('noiIdeaDetailSchedule')?.addEventListener('click',scheduleNoiIdea);
document.getElementById('noiIdeaDetailOpenCalendar')?.addEventListener('click',openNoiIdeaCalendarEntry);
window.openNoiIdeaDetail=openNoiIdeaDetail;
window.closeNoiIdeaDetail=closeNoiIdeaDetail;

// ===== M9D · Noi hub =====
// Noi è un hub: quattro card aprono superfici interne della stessa pagina
// (nessun nuovo tab). Risonanza, Da vivere e Quest riusano i blocchi M3/M7
// già presenti; Calendario apre l'overlay esistente. Il ritorno al hub passa
// dal layer di navigation.js ('noi-section'), quindi anche il Back di sistema.
const NOI_SECTIONS=['resonance','da-vivere','quest','eventi'];
function noiCanonicalPage(){return document.querySelector('#bond .noi-canonical-page');}
function openNoiSection(view){
  const page=noiCanonicalPage();
  if(!page||!NOI_SECTIONS.includes(view))return;
  if(page.dataset.noiView===view)return;
  page.dataset.noiView=view;
  const bar=document.getElementById('noiSectionBar');if(bar)bar.hidden=false;
  const hub=document.getElementById('noiHub');if(hub)hub.hidden=true;
  scrollTo({top:0,behavior:'auto'});
  if(view==='resonance')window.hydrateResonanceHistory?.();
  if(view==='da-vivere'&&window.usProfile&&!noiIdeaState.loaded)hydrateNoiIdeas();
  if(view==='eventi')window.hydrateEvents?.();
  document.getElementById('noiSectionBack')?.focus({preventScroll:true});
}
function closeNoiSection(){
  const page=noiCanonicalPage();
  if(!page||!page.dataset.noiView||page.dataset.noiView==='hub')return;
  const from=page.dataset.noiView;
  page.dataset.noiView='hub';
  if(from==='da-vivere'){closeNoiIdeaDetail();toggleNoiIdeaQuickForm(false);}
  const bar=document.getElementById('noiSectionBar');if(bar)bar.hidden=true;
  const hub=document.getElementById('noiHub');if(hub)hub.hidden=false;
  if(document.getElementById('bond')?.classList.contains('active')){
    scrollTo({top:0,behavior:'auto'});
    hub?.querySelector(`[data-noi-open="${from}"]`)?.focus({preventScroll:true});
  }
}
window.openNoiSection=openNoiSection;
window.closeNoiSection=closeNoiSection;
document.getElementById('noiHub')?.addEventListener('click',(event)=>{
  const card=event.target.closest('[data-noi-open]');
  if(card)openNoiSection(card.dataset.noiOpen);
});
document.getElementById('noiSectionBack')?.addEventListener('click',closeNoiSection);
document.getElementById('noiIdeaAddToggle')?.addEventListener('click',()=>{
  toggleNoiIdeaQuickForm(Boolean(document.getElementById('noiIdeaQuickForm')?.hidden));
});
document.getElementById('noiIdeaQuickCancel')?.addEventListener('click',()=>toggleNoiIdeaQuickForm(false));
document.getElementById('noiIdeaQuickMoreToggle')?.addEventListener('click',()=>{
  const extra=document.getElementById('noiIdeaQuickExtra');
  const btn=document.getElementById('noiIdeaQuickMoreToggle');
  const open=Boolean(extra?.hidden);
  if(extra)extra.hidden=!open;
  btn?.setAttribute('aria-expanded',open?'true':'false');
  if(open)document.getElementById('noiIdeaQuickNote')?.focus();
});
document.getElementById('noiIdeaLivedToggle')?.addEventListener('click',()=>{
  noiIdeaState.showLived=!noiIdeaState.showLived;
  renderNoiIdeaLivedList();
});
document.getElementById('noiIdeaQuickForm')?.addEventListener('submit',submitNoiIdeaQuickAdd);
document.getElementById('noiIdeaDetailForm')?.addEventListener('submit',submitNoiIdeaDetail);
document.getElementById('noiIdeaDetailBack')?.addEventListener('click',closeNoiIdeaDetail);
document.getElementById('noiIdeaDetailArchive')?.addEventListener('click',archiveNoiIdea);
document.getElementById('noiIdeaList')?.addEventListener('click',(event)=>{
  const card=event.target.closest('.noi-idea-card');
  if(card?.dataset.id)openNoiIdeaDetail(card.dataset.id);
});
document.getElementById('noiIdeaLivedList')?.addEventListener('click',(event)=>{
  const card=event.target.closest('.noi-idea-card');
  if(card?.dataset.id)openNoiIdeaDetail(card.dataset.id);
});

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
  const messageIds=(rows||[]).map(row=>row.id).filter(Boolean);
  let reactionRows=[];
  if(messageIds.length){
    const reactionResult=await sb.from('think_reactions').select('message_id,reaction,updated_at').in('message_id',messageIds);
    if(reactionResult.error)console.warn('[US Think] reactions',reactionResult.error);else reactionRows=reactionResult.data||[];
  }
  const reactions=new Map(reactionRows.map(row=>[row.message_id,row]));
  const partner=partnerFromProfiles(profiles),partnerName=partner?.display_name||'L’altra persona';
  const received=(rows||[]).find(r=>r.sender_id!==window.usProfile.id);
  const sent=(rows||[]).find(r=>r.sender_id===window.usProfile.id);
  const receivedReaction=received?reactions.get(received.id):null;
  const sentReaction=sent?reactions.get(sent.id):null;
  if(received&&!receivedReaction){usIncomingThink=received;usThinkReactionFinal=null;}
  else if(!received||receivedReaction){usIncomingThink=null;usThinkReactionFinal=receivedReaction?.reaction||null;}
  const receivedEl=document.getElementById('thinkLastReceived');if(receivedEl)receivedEl.textContent=received?(receivedReaction?`${partnerName} ha reagito al tuo Ti penso`:`${partnerName} ti ha pensato ${relativeSignalAge(received.created_at)}`):'Ancora nessun segnale';
  const sentEl=document.getElementById('thinkLastSent');if(sentEl)sentEl.textContent=sent?(sentReaction?`${partnerName} ha reagito ${thinkReactionLabel(sentReaction.reaction)}`:`Hai pensato a ${partnerName} ${relativeSignalAge(sent.created_at)}`):'Non ne hai ancora inviati';
  const monthEl=document.getElementById('thinkMonthCount');if(monthEl)monthEl.textContent=Number(count||0).toLocaleString('it-IT');
  const live=document.getElementById('thinkLiveText');if(live&&received)live.textContent=`Ultimo segnale da ${partnerName} · ${relativeSignalAge(received.created_at)}`;
  if(sentReaction){
    const signature=`${sent.id}:${sentReaction.reaction}:${sentReaction.updated_at||''}`;
    if(usThinkKnownReactionSignature&&usThinkKnownReactionSignature!==signature)toast(`Ha reagito ${thinkReactionLabel(sentReaction.reaction)}`);
    usThinkKnownReactionSignature=signature;
  }
  window.UsTodayPriority?.refresh?.();
  window.UsThinkWidget?.publishThink?.({partnerName,lastReceivedAt:received?.created_at||'',lastSentAt:sent?.created_at||''}).catch(()=>{});
}
window.hydrateThink=hydrateThink;
async function sendThinkSignal(){
  if(!window.usProfile){toast('Connessione non pronta');return false;}
  const btn=document.getElementById('thinkButton');if(btn?.disabled)return false;
  const profiles=await getCoupleProfiles(),partner=partnerFromProfiles(profiles);
  if(!partner){toast('L’altro profilo non è ancora collegato');return false;}
  if(!usThinkOperationId)usThinkOperationId=globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(16).slice(2);
  if(btn)btn.disabled=true;
  const {data,error}=await sb.rpc('send_think',{operation_id:usThinkOperationId});
  if(error){console.warn(error);toast('Non riesco a inviare il segnale');if(btn)btn.disabled=false;return false;}
  const result=Array.isArray(data)?data[0]:data;
  const messageId=result?.message_id;
  usThinkOperationId=null;
  if(messageId)sendWebPushEvent('think',messageId).catch(()=>{});
  btn?.classList.add('sent');setTimeout(()=>btn?.classList.remove('sent'),700);
  window.UsFeedback?.action?.();
  toast(result?.duplicate?'Già inviato':'Inviato');
  await hydrateThink();
  setTimeout(()=>{if(btn)btn.disabled=false;},1800);
  return true;
}
window.sendThinkSignal=sendThinkSignal;
function handleIncomingThink(row){
  if(!row||row.kind!=='think'||row.recipient_id!==window.usProfile?.id)return;
  usIncomingThink={...row};usThinkReactionFinal=null;usThinkReactionInFlight=false;
  const partner=partnerFromProfiles(window.usBondProfiles||[]);
  toast(`${partner?.display_name||'L’altra persona'} ti pensa ♡`);
  const heart=document.getElementById('thinkButton');heart?.classList.add('received');setTimeout(()=>heart?.classList.remove('received'),900);
  hydrateThink().catch(()=>{});
  // M12A — the arrival is one calm event: the shared attention state (driven
  // by the priority item), ONE soft halo on it, the aurora reaction and the
  // attention tone — only because US is active right now.
  window.UsFeedback?.attention?.();
  window.UsUiFoundation?.auroraPulse?.();
  Promise.resolve(window.UsTodayPriority?.refresh?.()).then(()=>{
    const card=document.querySelector('#usTodayPriorityRegion [data-us-arrival-type="think-received"]');
    window.UsUiFoundation?.playOnce?.(card,'us-attention-pulse',900);
  }).catch(()=>{});
}
const usRealtimeRefreshTimers=new Map();
function scheduleUsRealtimeRefresh(kind){
  const previous=usRealtimeRefreshTimers.get(kind);
  if(previous)clearTimeout(previous);
  const timer=setTimeout(()=>{
    usRealtimeRefreshTimers.delete(kind);
    if(!window.usProfile||document.hidden)return;
    const active=document.querySelector('.page.active')?.id;
    if(kind==='daily'){hydrateToday();return;}
    if(kind==='quiz'){window.USGameV2?.refresh();return;}
    if(kind==='location'){if(active==='home')hydrateDistance();return;}
    if(kind==='moments'){
      if(active==='moments')hydrateMoments();
      window.refreshOpenMomentAlbum?.();
      return;
    }
    if(kind==='events'){
      if(document.getElementById('usEventsOverlay')?.classList.contains('open'))window.hydrateEvents?.();
      window.UsTodayPriority?.refresh?.();
    }
    if(kind==='think-reaction'){hydrateThink().catch(()=>{});return;}
  },180);
  usRealtimeRefreshTimers.set(kind,timer);
}
function startUsRealtime(){
  if(!window.usProfile)return;
  if(usRealtimeChannel){sb.removeChannel(usRealtimeChannel);usRealtimeChannel=null;}
  const userId=window.usProfile.id,coupleId=window.usProfile.couple_id;
  usRealtimeChannel=sb.channel(`us-live-${userId}`)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'shared_messages',filter:`recipient_id=eq.${userId}`},payload=>handleIncomingThink(payload.new))
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'think_reactions'},()=>scheduleUsRealtimeRefresh('think-reaction'))
    .on('postgres_changes',{event:'*',schema:'public',table:'daily_answers',filter:`couple_id=eq.${coupleId}`},()=>scheduleUsRealtimeRefresh('daily'))
    .on('postgres_changes',{event:'*',schema:'public',table:'couple_locations',filter:`couple_id=eq.${coupleId}`},()=>scheduleUsRealtimeRefresh('location'))
    .on('postgres_changes',{event:'*',schema:'public',table:'moments',filter:`couple_id=eq.${coupleId}`},()=>scheduleUsRealtimeRefresh('moments'))
    .on('postgres_changes',{event:'*',schema:'public',table:'moment_photos',filter:`couple_id=eq.${coupleId}`},()=>scheduleUsRealtimeRefresh('moments'))
    .on('postgres_changes',{event:'*',schema:'public',table:'shared_events',filter:`couple_id=eq.${coupleId}`},()=>scheduleUsRealtimeRefresh('events'))
    .on('postgres_changes',{event:'*',schema:'public',table:'shared_event_completions',filter:`couple_id=eq.${coupleId}`},()=>{scheduleUsRealtimeRefresh('events');hydrateBondSummary();})
    .on('postgres_changes',{event:'*',schema:'public',table:'relationship_milestones',filter:`couple_id=eq.${coupleId}`},()=>{scheduleUsRealtimeRefresh('events');hydrateBondSummary();})
    .on('postgres_changes',{event:'*',schema:'public',table:'bond_weekly_quests',filter:`couple_id=eq.${coupleId}`},()=>{hydrateBondSummary();if(document.getElementById('bond')?.classList.contains('active'))hydrateBond();})
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'couples',filter:`id=eq.${coupleId}`},payload=>renderBondProgress(payload.new?.bond_xp||0))
    .subscribe();
}
window.startUsRealtime=startUsRealtime;

async function hydrateCloud(){
  try{
    const active=document.querySelector('.page.active')?.id;
    const critical=[];

    // Home image is the visual first paint priority.
    if(!homePhotoPath)critical.push(hydrateHomePhoto(false));

    // Only a directly-opened heavy page joins the critical lane.
    if(active==='moments')critical.push(hydrateMoments());
    if(active==='bond'){critical.push(hydrateBond());critical.push(hydrateNoiIdeas());}
    if(active==='settings')critical.push(Promise.resolve(window.hydrateUsSettings?.()));

    const results=await Promise.allSettled(critical);
    results.forEach(result=>{
      if(result.status==='rejected')console.warn('[US Boot] hydrate task',result.reason);
    });

    // Today is important but does not need to compete with the Home image.
    usRunWhenIdle(()=>hydrateToday(),320);
    // M6E — Oggi calendar widget: small, secondary, only relevant on Home.
    if(active==='home')usRunWhenIdle(()=>window.refreshOggiCalendarWidget?.(),260);
  }catch(e){console.warn(e)}
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

saveAnswer = async function(){
  if(!window.usProfile){toast('Riprova tra un attimo');return;}
  // M9E: senza una domanda valida il bottone è solo "Riprova", mai un invio.
  if(!window.todayQuestion)return hydrateToday();
  const v=document.getElementById('answer').value.trim();
  if(!v)return toast('Scrivi qualcosa prima');
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
let swipeRaf=0;
let swipePreviewPage=null;

const US_SWIPE_COMMIT_RATIO=.34;
const US_SWIPE_FLICK_VELOCITY=.86;
const US_SWIPE_MIN_FLICK_DISTANCE=58;
const US_SWIPE_TRACKING=.94;

function swipeBlockedTarget(target){
  if(!target?.closest)return false;
  if(target.closest(
    'input,textarea,select,[contenteditable="true"],' +
    '.modal,.moment-viewer,.auth-overlay,.today-overlay,' +
    '.us-story-viewer,.us-camera-viewer,.us-events-overlay.open,' +
    '.us-settings-overlay.open,.us-album-overlay.show,' +
    '.us-album-lightbox.show,.us-moment-compose-overlay.show,' +
    '.us-gv2-panel'
  ))return true;
  const button=target.closest('button');
  if(button&&!button.classList.contains('us-setting-row'))return true;
  return false;
}

function appViewportBounds(){
  const app=document.querySelector('.app');
  const rect=app?.getBoundingClientRect();
  const width=Math.min(window.innerWidth,rect?.width||window.innerWidth);
  const left=rect?Math.max(0,rect.left):Math.max(0,(window.innerWidth-width)/2);
  const navTop=document.querySelector('.nav')?.getBoundingClientRect()?.top||window.innerHeight;
  const topRect=document.querySelector('.top')?.getBoundingClientRect();
  const top=Math.max(0,topRect?.bottom||0);
  return {left,width,top,bottom:Math.min(window.innerHeight,navTop)};
}

function recordSwipeSample(g,x,time){
  g.samples.push({x,time});
  while(g.samples.length>6||g.samples[0]?.time<time-95)g.samples.shift();
}
function swipeVelocity(g){
  if(g.samples.length<2)return 0;
  const first=g.samples[0],last=g.samples[g.samples.length-1];
  return (last.x-first.x)/Math.max(1,last.time-first.time);
}

function clearMotionPage(page){
  if(!page)return;
  clearPageEntry(page);
  page.classList.remove(
    'us-motion31-current',
    'us-motion31-preview',
    'us-motion31-animating',
    'us-motion31-returning',
    'us-motion31-promote'
  );
  page.style.removeProperty('--us-motion31-x');
  page.style.removeProperty('--us-motion31-left');
  page.style.removeProperty('--us-motion31-width');
  page.style.removeProperty('--us-motion31-top');
  page.style.removeProperty('--us-motion31-bottom');
  page.style.removeProperty('pointer-events');
  page.removeAttribute('aria-hidden');
}

function destroySwipePreview(){
  if(swipePreviewPage)clearMotionPage(swipePreviewPage);
  swipePreviewPage=null;
}

function prepareSwipePreview(g,direction){
  if(g.previewDirection===direction&&swipePreviewPage)return swipePreviewPage;

  destroySwipePreview();

  const index=swipePages.indexOf(g.page.id);
  const targetIndex=index+direction;
  if(targetIndex<0||targetIndex>=swipePages.length){
    g.previewDirection=direction;
    g.targetIndex=-1;
    return null;
  }

  const target=document.getElementById(swipePages[targetIndex]);
  if(!target)return null;

  const bounds=appViewportBounds();
  g.previewDirection=direction;
  g.targetIndex=targetIndex;
  swipePreviewPage=target;

  // Important: preview is NOT .active.
  // .us-motion31-preview alone overrides display:none, so the normal
  // .page.active fade never starts during the gesture.
  target.classList.add('us-motion31-preview');
  target.setAttribute('aria-hidden','true');
  target.style.pointerEvents='none';
  target.style.setProperty('--us-motion31-left',`${bounds.left}px`);
  target.style.setProperty('--us-motion31-width',`${bounds.width}px`);
  target.style.setProperty('--us-motion31-top',`${bounds.top}px`);
  target.style.setProperty('--us-motion31-bottom',`${Math.max(0,window.innerHeight-bounds.bottom)}px`);

  return target;
}

function applySwipeVisual(){
  swipeRaf=0;
  const g=swipeGesture;
  if(!g||g.axis!=='x')return;

  const rawDx=g.currentX-g.startX;
  const direction=rawDx<0?1:-1;
  const index=swipePages.indexOf(g.page.id);
  const targetIndex=index+direction;
  const atEdge=targetIndex<0||targetIndex>=swipePages.length;
  const width=Math.max(1,appViewportBounds().width);

  // Nearly 1:1 tracking is perceived as smoother. Accidental navigation is
  // prevented by the much stronger commit thresholds, not by artificial lag.
  const resistance=atEdge?.20:US_SWIPE_TRACKING;
  const currentX=Math.max(-width*.92,Math.min(width*.92,rawDx*resistance));

  g.page.classList.add('us-motion31-current');
  g.page.style.setProperty('--us-motion31-x',`${currentX}px`);

  if(atEdge){
    destroySwipePreview();
    return;
  }

  const preview=prepareSwipePreview(g,direction);
  if(!preview)return;

  // Exact edge-to-edge continuity. No opacity crossfade: it was one of the
  // things making Motion 3 look like a web transition instead of native motion.
  const previewX=(direction>0?width:-width)+currentX;
  preview.style.setProperty('--us-motion31-x',`${previewX}px`);
}

function resetSwipeVisual(g){
  if(!g?.page)return;
  const current=g.page;
  const preview=swipePreviewPage;
  const width=Math.max(1,appViewportBounds().width);
  const direction=g.previewDirection||1;

  current.classList.remove('us-motion31-current');
  current.classList.add('us-motion31-returning');
  current.style.setProperty('--us-motion31-x','0px');

  if(preview){
    preview.classList.add('us-motion31-returning');
    preview.style.setProperty('--us-motion31-x',`${direction>0?width:-width}px`);
  }

  setTimeout(()=>{
    clearMotionPage(current);
    destroySwipePreview();
  },isReducedMotion()?0:US_MOTION_BASE_MS);
}

function completeSwipe(g,direction){
  const target=swipePreviewPage;
  if(!target||g.targetIndex<0){
    resetSwipeVisual(g);
    return;
  }

  const width=Math.max(1,appViewportBounds().width);
  const current=g.page;
  const targetId=swipePages[g.targetIndex];

  current.classList.remove('us-motion31-current');
  current.classList.add('us-motion31-animating');
  target.classList.add('us-motion31-animating');

  current.style.setProperty('--us-motion31-x',`${direction>0?-width:width}px`);
  target.style.setProperty('--us-motion31-x','0px');

  setTimeout(()=>{
    // Seamless promotion:
    // 1. target is already visually at x=0 as preview
    // 2. go() marks the SAME DOM node active, with page-entry animation disabled
    // 3. only on the following frames do we remove fixed-preview positioning
    document.documentElement.classList.add('us-motion31-promoting');
    target.classList.add('us-motion31-promote');

    go(targetId,{motionCommit:true});

    requestAnimationFrame(()=>{
      requestAnimationFrame(()=>{
        clearMotionPage(current);
        clearMotionPage(target);
        swipePreviewPage=null;
        document.documentElement.classList.remove('us-motion31-promoting');
      });
    });
  },isReducedMotion()?0:US_MOTION_SURFACE_MS);
}

document.addEventListener('touchstart',event=>{
  if(event.touches.length!==1||swipeBlockedTarget(event.target))return;
  const activePage=document.querySelector('.page.active');
  if(!activePage||!swipePages.includes(activePage.id))return;
  clearPageEntry(activePage);

  const touch=event.touches[0];
  if(touch.clientX<20||touch.clientX>window.innerWidth-20)return;

  const now=performance.now();
  swipeGesture={
    page:activePage,
    startX:touch.clientX,
    startY:touch.clientY,
    currentX:touch.clientX,
    currentY:touch.clientY,
    axis:null,
    previewDirection:0,
    targetIndex:-1,
    samples:[{x:touch.clientX,time:now}]
  };
},{passive:true});

document.addEventListener('touchmove',event=>{
  const g=swipeGesture;
  if(!g||event.touches.length!==1)return;

  const touch=event.touches[0];
  const dx=touch.clientX-g.startX;
  const dy=touch.clientY-g.startY;

  if(!g.axis&&(Math.abs(dx)>7||Math.abs(dy)>7)){
    g.axis=Math.abs(dx)>Math.abs(dy)*1.32?'x':'y';
    if(g.axis==='y'){
      swipeGesture=null;
      destroySwipePreview();
      return;
    }
  }

  if(g.axis!=='x')return;

  event.preventDefault();
  g.currentX=touch.clientX;
  g.currentY=touch.clientY;
  recordSwipeSample(g,touch.clientX,performance.now());

  if(!swipeRaf)swipeRaf=requestAnimationFrame(applySwipeVisual);
},{passive:false});

document.addEventListener('touchend',event=>{
  const g=swipeGesture;
  swipeGesture=null;

  if(swipeRaf){
    cancelAnimationFrame(swipeRaf);
    swipeRaf=0;
  }
  if(!g)return;

  const touch=event.changedTouches?.[0];
  if(touch){
    g.currentX=touch.clientX;
    g.currentY=touch.clientY;
    recordSwipeSample(g,touch.clientX,performance.now());
  }

  const dx=g.currentX-g.startX;
  const dy=g.currentY-g.startY;

  if(g.axis!=='x'||Math.abs(dx)<Math.abs(dy)*1.16){
    resetSwipeVisual(g);
    return;
  }

  const direction=dx<0?1:-1;
  const index=swipePages.indexOf(g.page.id);
  const targetIndex=index+direction;

  if(targetIndex<0||targetIndex>=swipePages.length){
    resetSwipeVisual(g);
    return;
  }

  const width=Math.max(1,appViewportBounds().width);
  const distanceEnough=Math.abs(dx)>=width*US_SWIPE_COMMIT_RATIO;
  const velocity=Math.abs(swipeVelocity(g));
  const flickEnough=velocity>=US_SWIPE_FLICK_VELOCITY&&Math.abs(dx)>=US_SWIPE_MIN_FLICK_DISTANCE;

  if(!distanceEnough&&!flickEnough){
    resetSwipeVisual(g);
    return;
  }

  prepareSwipePreview(g,direction);
  completeSwipe(g,direction);
},{passive:true});

document.addEventListener('touchcancel',()=>{
  if(swipeRaf){
    cancelAnimationFrame(swipeRaf);
    swipeRaf=0;
  }
  const g=swipeGesture;
  swipeGesture=null;
  if(g)resetSwipeVisual(g);
  else destroySwipePreview();
},{passive:true});

async function refreshVisibleState(options={}){
  if(!window.usProfile||document.hidden)return;
  if(options.foreground)hydrateThink().catch(()=>{});
  const active=document.querySelector('.page.active')?.id;
  const todayOpen=document.getElementById('today')?.classList.contains('open');
  // M12A — returning to the foreground re-checks the location wherever the user lands.
  if(options.foreground)maybeAutoRefreshLocation('resume').catch(()=>{});
  if(active==='home'||todayOpen){
    await hydrateToday();
    if(!options.foreground)hydrateDistance();
    return;
  }
  if(active==='moments'){await hydrateMoments();return;}
  if(active==='quiz'){await window.USGameV2?.refresh();return;}
  if(active==='bond'){await hydrateBondSummary();return;}
  if(active==='settings'){await window.hydrateUsSettings?.();}
}
setInterval(()=>refreshVisibleState(),60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&window.usProfile)refreshVisibleState({foreground:true});});
sb.auth.onAuthStateChange((event,_session)=>{
  if(event==='INITIAL_SESSION'||event==='TOKEN_REFRESHED')return;
  setTimeout(initCloud,0);
});
const pairBtn=document.getElementById('pairBtn');
if(pairBtn) pairBtn.addEventListener('click', pairAccount);
const loginBtn=document.getElementById('loginBtn');
if(loginBtn) loginBtn.addEventListener('click', loginAccount);
const magicLinkBtn=document.getElementById('magicLinkBtn');
if(magicLinkBtn) magicLinkBtn.addEventListener('click', sendMagicLinkRecovery);
const loginEnter=document.getElementById('loginEmail');
if(loginEnter) loginEnter.addEventListener('keydown',(e)=>{if(e.key==='Enter')loginAccount();});

initCloud();

if (canUseUsServiceWorker()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js",{updateViaCache:"none"}).catch((err) => {
      console.warn("US. service worker non registrato:", err);
    });
  });
}


document.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeToday();});

(() => {
  if (window.__usFastRefreshV19Installed) return;
  window.__usFastRefreshV19Installed = true;
  console.info('[US Sync] legacy polling 3s disattivato · Performance 1');
})();
