const pages=['home','bond','moments','quiz','settings'];
const US_MOTION_FAST_MS=250;
const US_MOTION_BASE_MS=220;
const US_MOTION_SURFACE_MS=260;
const usEntryTimers = new WeakMap();
function isReducedMotion(){return Boolean(window.UsUiFoundation?.isReducedMotion?.());}
function clearPageEntry(page){
  if(!page)return;
  const old=usEntryTimers.get(page);
  if(old!==undefined){clearTimeout(old);usEntryTimers.delete(page);}
  page.classList.remove('us-motion5-enter-next','us-motion5-enter-prev');
}
function animatePageEntry(page,direction){
  if(!page||isReducedMotion())return;
  const entry=direction>0?'us-motion5-enter-next':'us-motion5-enter-prev';
  clearPageEntry(page);
  page.classList.add(entry);
  // Old navigation timers must never interrupt a new entrance.
  const timer=setTimeout(()=>{
    if(usEntryTimers.get(page)!==timer)return;
    page.classList.remove(entry);
    usEntryTimers.delete(page);
  },US_MOTION_FAST_MS);
  usEntryTimers.set(page,timer);
}
let usPageHydrationTicket=0;
const US_HEAVY_PAGE_HYDRATION_FRESH_MS=15000;
const usPageHydratedAt=new Map();
async function hydrateActivePage(id,{force=false}={}){
  if(!window.usProfile||document.querySelector('.page.active')?.id!==id)return;
  const heavy=id==='moments'||id==='bond'||id==='settings';
  const last=usPageHydratedAt.get(id)||0;
  if(heavy&&!force&&Date.now()-last<US_HEAVY_PAGE_HYDRATION_FRESH_MS)return;
  const work=[];
  if(id==='moments')work.push(Promise.resolve(hydrateMoments()));
  if(id==='bond'){work.push(Promise.resolve(hydrateBond()));work.push(Promise.resolve(hydrateNoiIdeas()));}
  if(id==='settings')work.push(Promise.resolve(window.hydrateUsSettings?.()));
  if(id==='home')work.push(Promise.resolve(window.refreshOggiCalendarWidget?.()));
  if(!work.length)return;
  await Promise.allSettled(work);
  if(heavy&&document.querySelector('.page.active')?.id===id)usPageHydratedAt.set(id,Date.now());
}
function schedulePageHydration(id,{force=false}={}){
  const ticket=++usPageHydrationTicket;
  // Let the tab become visible first. Heavy Supabase/DOM work starts after the
  // browser has had one frame to commit the navigation.
  requestAnimationFrame(()=>setTimeout(()=>{
    if(ticket!==usPageHydrationTicket)return;
    hydrateActivePage(id,{force}).catch(()=>{});
  },0));
}
function go(id,options={}){
  const current=document.querySelector('.page.active')?.id;
  if(current===id){
    if(id==='bond'&&options.nav)window.closeNoiSection?.();
    scrollTo({top:0,behavior:options.motionCommit?'auto':'smooth'});
    schedulePageHydration(id,{force:true});
    return;
  }
  if(current==='bond')window.closeNoiSection?.();
  // Focus Photo is a state of Oggi only: left on, it kept Oggi's widgets inert
  // and the PET hidden on every other page until the user came back and tapped.
  if(current==='home'&&document.getElementById('homeHero')?.classList.contains('us-oggi-focus'))setOggiFocusPhoto(false);
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
  schedulePageHydration(id);
}
// Due colori: my colour follows my place in the couple, the same on both
// phones. Whoever created the couple (role francesco) is rosa, whoever joined
// with the code (role beatrice) is lilla. Presentation only, never authorization.
function usApplyPersonColor(profile){
  const root=document.documentElement,role=profile?.role;
  if(role==='francesco'||role==='beatrice')root.dataset.usMe=role;
  else delete root.dataset.usMe;
}
// One timer for the one toast (the Avviso pill at the top, 2.3 s as in the mockup): a second message
// restarts the ~2 s window instead of being cut short by the first message's
// pending hide. Optional {icon, quiet}: a shared Phosphor icon name and the
// quiet (night) look. Without quiet, a message that ends with ♡ ✦ ✓ is a
// good moment (warm latte pill); anything else is quiet.
let usToastTimer=null;
function toast(msg,options){const t=document.getElementById('toast');if(!t)return;const opts=options&&typeof options==='object'?options:{};const text=String(msg??'');const quiet=typeof opts.quiet==='boolean'?opts.quiet:!/[♡✦✓]\s*$/.test(text);t.classList.toggle('is-quiet',quiet);t.textContent='';if(opts.icon){const icon=document.createElement('span');icon.className='us-icon';icon.setAttribute('data-us-icon',String(opts.icon));icon.setAttribute('aria-hidden','true');t.appendChild(icon);}const label=document.createElement('span');label.className='us-toast-text';label.textContent=text;t.appendChild(label);t.classList.add('show');clearTimeout(usToastTimer);usToastTimer=setTimeout(()=>t.classList.remove('show'),2300)}
// The one US confirmation sheet (ui-foundation); the platform dialog only as a fallback.
function usConfirm(options){const ui=window.UsUiFoundation;return ui&&typeof ui.confirm==='function'?ui.confirm(options):Promise.resolve(window.confirm(options.title));}
// Game V2 — Gioca is owned by games.js (window.USGameV2); the legacy weekly quiz UI is retired.
function openQuizHub(options={}){go('quiz',options);window.USGameV2?.showHub();}
function resetQuiz(){window.USGameV2?.showHub();}
window.openQuizHub=openQuizHub;
window.resetQuiz=resetQuiz;

function updateTogetherDays(startedOn){
  const el=document.getElementById('daysTogether');
  if(!el)return;
  if(!startedOn){el.textContent='—';return;}
  const [year,month,day]=String(startedOn).split('-').map(Number);
  if(!year||!month||!day){el.textContent='—';return;}
  const start=Date.UTC(year,month-1,day);
  const now=new Date();
  const today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  const diff=Math.max(0,Math.floor((today-start)/86400000));
  el.textContent=diff.toLocaleString((globalThis.UsI18n?.tag||'it-IT'));
}


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


// Presentation only: membership remains profiles.id / profiles.couple_id.
function resolveUsIdentity({viewerId,coupleId,profiles=[]}={}){
  const members=viewerId&&coupleId?profiles.filter(p=>p.couple_id===coupleId):[];
  const own=members.find(p=>p.id===viewerId);
  const partner=own?members.find(p=>p.id!==viewerId):null;
  const name=p=>typeof p?.display_name==='string'?p.display_name.trim():'';
  const nameForRole=role=>{const p=own?members.find(p=>p.role===role):null;return name(p)||(p?.id===viewerId?'Tu':'La tua persona');};
  const initialForRole=role=>{
    const p=own?members.find(p=>p.role===role):null;
    const initial=Array.from(name(p))[0]?.toLocaleUpperCase('it')||'·';
    const collision=p&&members.some(other=>other.id!==p.id&&Array.from(name(other))[0]?.toLocaleUpperCase('it')===initial);
    return collision?`${initial}${role==='francesco'?'1':'2'}`:initial;
  };
  return {ownName:name(own)||'Tu',partnerName:name(partner)||'La tua persona',nameForRole,initialForRole,
    pairLabel:own&&partner&&name(own)&&name(partner)?[...members].sort((a,b)=>String(a.role).localeCompare(String(b.role))).reverse().map(name).join(' + '):'Voi due'};
}
function usIdentity(){
  const profile=window.usProfile;
  const ready=profile?.id&&profile?.couple_id&&usCoupleContextState.identityKey===`${profile.id}:${profile.couple_id}`&&!window.UsAppLock?.isLocked?.();
  return resolveUsIdentity(ready?{viewerId:profile.id,coupleId:profile.couple_id,profiles:usCoupleContextState.profiles}:{});
}
window.UsIdentity=Object.freeze({resolve:resolveUsIdentity,current:usIdentity});
function refreshUsIdentityLabels(){
  const identity=usIdentity();
  // A real name stays as written (translate="no"); only the Tu / La tua persona / Voi due placeholders follow the language.
  for(const role of ['francesco','beatrice']){
    const label=document.querySelector(`[data-noi-couple-name="${role}"]`);
    if(label){const name=identity.nameForRole(role);label.textContent=name;label.translate=name==='Tu'||name==='La tua persona';}
    const root=document.getElementById(role==='francesco'?'pairAvatarFrancesco':'pairAvatarBeatrice');
    const fallback=root?.querySelector('.fallback');
    if(fallback)fallback.textContent=identity.initialForRole(role);
  }
  for(const id of ['noiCoupleCard','noiCouple'])document.getElementById(id)?.setAttribute('aria-label',identity.pairLabel);
  const pair=document.getElementById('usCoupleNames');if(pair){pair.textContent=identity.pairLabel;pair.translate=identity.pairLabel==='Voi due';}
  const ownInitial=document.getElementById('profileAvatarFallback');if(ownInitial)ownInitial.textContent=identity.initialForRole(window.usProfile?.role);
  const title=document.getElementById('thinkArrivalTitle');if(title)title.textContent=`${identity.partnerName} ti pensa`;
  window.dispatchEvent(new CustomEvent('us-identity-change',{detail:{identityKey:usCoupleContextState.identityKey}}));
}
const usCoupleContextState={couple:null,profiles:[],identityKey:'',generation:0};
function clearUsCoupleContext(){
  usCoupleContextState.generation++;
  usCoupleContextState.couple=null;
  usCoupleContextState.profiles=[];
  usCoupleContextState.identityKey='';
  updateTogetherDays(null);
  window.usBondProfiles=[];
  for(const id of ['pairAvatarFrancesco','pairAvatarBeatrice']){
    const root=document.getElementById(id),image=root?.querySelector('img');
    if(image){image.hidden=true;image.removeAttribute('src');}
    const fallback=root?.querySelector('.fallback');if(fallback)fallback.hidden=false;
  }
  const profileImage=document.getElementById('profileAvatarImg');
  if(profileImage){profileImage.hidden=true;profileImage.removeAttribute('src');}
  const profileInitial=document.getElementById('profileAvatarFallback');if(profileInitial)profileInitial.textContent='·';
  refreshUsIdentityLabels();
}
async function hydrateUsCoupleContext(){
  const profile=window.usProfile;
  const coupleId=profile?.couple_id;
  if(!profile?.id||!coupleId){clearUsCoupleContext();return null;}
  const identityKey=`${profile.id}:${coupleId}`;
  if(usCoupleContextState.identityKey!==identityKey)clearUsCoupleContext();
  const generation=++usCoupleContextState.generation;
  let coupleResult,profilesResult;
  try{
    [coupleResult,profilesResult]=await Promise.all([
      sb.from('couples').select('id,name,started_on').eq('id',coupleId).maybeSingle(),
      sb.from('profiles').select('id,display_name,role,couple_id').eq('couple_id',coupleId).order('created_at',{ascending:true})
    ]);
  }catch(error){
    if(window.usProfile===profile&&window.usProfile?.couple_id===coupleId&&generation===usCoupleContextState.generation)clearUsCoupleContext();
    console.warn('[US Couple] context unavailable',error);
    return null;
  }
  if(window.usProfile!==profile||window.usProfile?.couple_id!==coupleId||generation!==usCoupleContextState.generation)return null;
  if(coupleResult.error||profilesResult.error){
    console.warn('[US Couple] context',coupleResult.error||profilesResult.error);
    clearUsCoupleContext();
    return null;
  }
  usCoupleContextState.couple=coupleResult.data||null;
  usCoupleContextState.profiles=(profilesResult.data||[]).filter(row=>row.couple_id===coupleId);
  usCoupleContextState.identityKey=identityKey;
  updateTogetherDays(usCoupleContextState.couple?.started_on);
  refreshUsIdentityLabels();
  return {
    couple:usCoupleContextState.couple?{...usCoupleContextState.couple}:null,
    profiles:usCoupleContextState.profiles.map(row=>({...row}))
  };
}
window.UsCoupleContext=Object.freeze({
  hydrate:hydrateUsCoupleContext,
  clear:clearUsCoupleContext,
  snapshot:()=>({
    couple:usCoupleContextState.couple?{...usCoupleContextState.couple}:null,
    profiles:usCoupleContextState.profiles.map(row=>({...row}))
  })
});
window.addEventListener('us-app-lock-change',()=>refreshUsIdentityLabels());
window.addEventListener('us-identity-change',event=>{
  if(!event.detail?.identityKey){
    usTodayHydrateSeq++;
    window.todayQuestion=null;window.todayState=null;window.todayRevealMeta=null;
    usIncomingThink=null;usThinkReactionFinal=null;closeThinkArrival();
    usLocationRuntime.server=null;usLocationRuntime.snapshot=null;window.usDistanceKm=null;
    renderDistanceCapsule({visible:false,text:''});
    dailyKeepsake.hide();closeToday();
    const reveal=document.getElementById('todayReveal');if(reveal)reveal.innerHTML='';
    const answer=document.getElementById('answer');if(answer)answer.value='';
    for(const id of ['thinkLastReceived','thinkLastSent','thinkLiveText']){
      const label=document.getElementById(id);if(label)label.textContent='Ancora nessun segnale';
    }
    for(const id of ['momentsGrid','ricordiRivivi','ricordiChapters']){
      const root=document.getElementById(id);if(root){root.innerHTML='';delete root.dataset.loaded;}
    }
    window.UsTodayPriority?.render?.([]);
    return;
  }
  window.UsTodayPriority?.refresh?.();
  if(window.usProfile&&usLocationRuntime.server)applyServerDistance(usLocationRuntime.server);
  renderTodayReveal();
  if(window.todayState?.my_answer!=null&&!window.todayState?.both_answered){
    const locked=document.getElementById('locked');
    if(locked)locked.innerHTML='✓ Hai risposto. <b>In attesa di '+escapeHtml(usIdentity().partnerName)+'…</b>';
  }
  document.querySelectorAll('[data-ricordi-daily]').forEach(root=>{
    const labels=root.querySelectorAll('.ricordi-daily-answer b');
    ['francesco','beatrice'].forEach((role,i)=>{if(labels[i])labels[i].textContent=usIdentity().nameForRole(role);});
  });
  if(noiIdeaState.selectedId)renderNoiIdeaDetailState(noiIdeaFindItem(noiIdeaState.selectedId));
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

// Native widgets read US through this narrow door: semantic values and, for
// Foto & Noi, a short-lived signed URL that stays inside the WebView (widgets.js
// downloads and downsizes the image, native only ever receives bytes).
window.UsWidgetDataApi=Object.freeze({
  async couple(){
    const profile=window.usProfile,cid=profile?.couple_id;
    if(!window.UsPlatform?.isNative||!cid)return null;
    const [coupleRes,profilesRes]=await Promise.all([
      sb.from('couples').select('started_on').eq('id',cid).maybeSingle(),
      sb.from('profiles').select('display_name').eq('couple_id',cid).order('created_at',{ascending:true})
    ]);
    if(window.usProfile!==profile||window.usProfile?.couple_id!==cid)return null;
    if(coupleRes.error||profilesRes.error)throw coupleRes.error||profilesRes.error;
    return {startedOn:coupleRes.data?.started_on||'',names:(profilesRes.data||[]).map(p=>p.display_name).filter(Boolean)};
  },
  // A last-known, already-rendered distance label, never coordinates.
  noiDistance(){
    const line=noiDistanceLine(usLocationRuntime.snapshot);
    return {distanceText:line.state==='unknown'?'':line.text,
      distanceState:line.state==='stale'?'stale':'ready'};
  },
  // The exact two profile portraits displayed in Noi; signed URLs stay inside the WebView.
  noiAvatarSources(){
    return ['pairAvatarFrancesco','pairAvatarBeatrice'].map(id=>{
      const img=document.getElementById(id)?.querySelector('img');
      const src=img&&!img.hidden?(img.currentSrc||img.src):'';
      return /^https:\/\//.test(src)?src:'';
    });
  },
  // Same source of truth as Oggi's painted hero, NOT the latest Ricordo.
  // undefined = Home is still loading; do not erase the native cached photo.
  // null = Home resolved with no photo; clear the widget only then.
  async latestPhoto(){
    if(!window.UsPlatform?.isNative||!window.usProfile)return undefined;
    if(!homePhotoHasPainted||!homePhotoPath){
      return homePhotoHourKey===homeRotationKey() ? null : undefined;
    }
    const viewer=window.usProfile,epoch=usAuthEpoch;
    const path=homePhotoPath;
    const url=await usGetSignedUrl(path,3600);
    if(window.usProfile!==viewer||epoch!==usAuthEpoch)return undefined;
    if(!url)throw new Error('widget_photo_unavailable');
    return {id:'oggi',path,sourcePath:path,takenOn:'',url};
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
function usInvalidateSignedUrl(path){
  if(!path)return;
  US_SIGNED_URL_CACHE.delete(path);
  usPersistSignedUrlCache();
}
function usStoragePathFromSignedUrl(url){
  const marker='/storage/v1/object/sign/us-media/';
  const value=String(url||'');
  const index=value.indexOf(marker);
  if(index<0)return '';
  const raw=value.slice(index+marker.length).split('?')[0];
  try{return decodeURIComponent(raw);}catch(_e){return raw;}
}
function usWriteSignedUrlCache(path,url,expiresIn){
  if(path&&url){
    US_SIGNED_URL_CACHE.set(path,{url,expiresAt:Date.now()+Math.max(60,Number(expiresIn)||60)*1000});
    usPersistSignedUrlCache();
  }
  return url||null;
}
usLoadSignedUrlCache();
async function usGetSignedUrl(path,expiresIn=21600,options={}){
  if(!path)return null;
  if(options.force)usInvalidateSignedUrl(path);
  const cached=usReadSignedUrlCache(path);if(cached)return cached;
  const {data,error}=await sb.storage.from('us-media').createSignedUrl(path,expiresIn);
  if(error||!data?.signedUrl){if(error)console.warn('[US Media] signed url',error);return null;}
  return usWriteSignedUrlCache(path,data.signedUrl,expiresIn);
}
async function usGetSignedUrls(paths,expiresIn=21600,options={}){
  const unique=[...new Set((paths||[]).filter(Boolean))];
  const result=new Map(),missing=[];
  for(const path of unique){
    if(options.force)usInvalidateSignedUrl(path);
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
    const fallback=await Promise.all(unresolved.map(async path=>[path,await usGetSignedUrl(path,expiresIn,{force:options.force})]));
    for(const [path,url] of fallback)if(url)result.set(path,url);
  }
  return result;
}
async function usRecoverPrivateImage(img,path=''){
  if(!img)return false;
  const storagePath=path||img.dataset?.usMediaPath||img.closest?.('[data-storage-path]')?.dataset?.storagePath||'';
  if(!storagePath||img.dataset?.usMediaRetry==='1')return false;
  img.dataset.usMediaRetry='1';
  usInvalidateSignedUrl(storagePath);
  const fresh=await usGetSignedUrl(storagePath,21600,{force:true});
  if(!fresh)return false;
  img.src=fresh;
  return true;
}
window.usGetSignedUrl=usGetSignedUrl;
window.usGetSignedUrls=usGetSignedUrls;
window.usInvalidateSignedUrl=usInvalidateSignedUrl;
window.usRecoverPrivateImage=usRecoverPrivateImage;

let usNativeMediaPrewarmedFor='';
async function usPrewarmNativeMomentMedia(limit=4){
  const profile=window.usProfile;
  if(!window.UsPlatform?.isNative||!profile?.couple_id||usNativeMediaPrewarmedFor===profile.couple_id)return;
  const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  if(connection?.saveData||String(connection?.effectiveType||'').includes('2g'))return;
  usNativeMediaPrewarmedFor=profile.couple_id;
  try{
    const {data:rows,error}=await sb.from('moments')
      .select('storage_path,thumbnail_path')
      .eq('couple_id',profile.couple_id)
      .order('moment_date',{ascending:false})
      .order('created_at',{ascending:false})
      .limit(limit);
    if(error||window.usProfile!==profile){if(error)throw error;return;}
    const urls=await usGetSignedUrls((rows||[]).map(row=>row.thumbnail_path||row.storage_path),21600);
    await Promise.allSettled([...urls.values()].slice(0,limit).map(url=>new Promise(resolve=>{
      const img=new Image();
      img.decoding='async';
      try{img.fetchPriority='low';}catch(_e){}
      img.onload=img.onerror=()=>resolve();
      img.src=url;
    })));
  }catch(error){
    usNativeMediaPrewarmedFor='';
    console.warn('[US Media] native prewarm',error);
  }
}

// ===== US v20 · Web Push Foundation =====
const US_VAPID_PUBLIC_KEY='BChjUsr-rF5fq-qgLrbsFn76z9GQaWJ7-a-_UX0gzU6hkSRC4r4GLwmQLtkuad_ntDBE6Fhr76jr_r7OBQdfuss';
let usPushUiBusy=false;
let usPushOperationInFlight=null;
let usPushCleanup=Promise.resolve();
const US_PUSH_RETIRED_KEY='us:push:retired:v1';
const usPushWaiters=new Set();
let usPushSubscriptionPending=0;
function usPushWaitScope(){
  const profile=window.usProfile,epoch=usAuthEpoch;
  let cancelled=false,release;
  const cancellation=new Promise(resolve=>{release=resolve;});
  const current=()=>!cancelled&&window.usProfile===profile&&usAuthEpoch===epoch;
  const cancel=()=>{cancelled=true;release();};
  usPushWaiters.add(cancel);
  return {current,finish:()=>usPushWaiters.delete(cancel),async wait(promise){
    const result=await Promise.race([usWithDeadline(Promise.resolve(promise),15000),cancellation]);
    if(!current())throw new Error('push_identity_changed');
    return result;
  },subscription(promise){
    usPushSubscriptionPending++;
    const request=Promise.resolve(promise).then(async subscription=>{
      if(subscription&&!current()){
        usSaveRetiredWebPush([...usRetiredWebPush().filter(x=>x.endpoint!==subscription.endpoint),{userId:profile.id,endpoint:subscription.endpoint}]);
        try{await usWithDeadline(subscription.unsubscribe(),5000);}catch(_e){}
      }
      return subscription;
    }).finally(()=>{usPushSubscriptionPending--;});
    return this.wait(request);
  }};
}
function usRetiredWebPush(){
  try{return JSON.parse(localStorage.getItem(US_PUSH_RETIRED_KEY)||'[]');}catch(_e){return [];}
}
function usSaveRetiredWebPush(list){
  if(list.length)localStorage.setItem(US_PUSH_RETIRED_KEY,JSON.stringify(list));
  else localStorage.removeItem(US_PUSH_RETIRED_KEY);
}
async function usRetryRetiredWebPush(profileId){
  for(const entry of usRetiredWebPush()){
    if(entry.userId!==profileId)continue;
    try{
      if(window.usProfile?.id!==profileId)return;
      const {error}=await usWithDeadline(sb.rpc('remove_web_push_subscription',{target_endpoint:entry.endpoint}),5000);
      if(!error&&window.usProfile?.id===profileId)usSaveRetiredWebPush(usRetiredWebPush().filter(x=>x.endpoint!==entry.endpoint));
    }catch(_e){}
  }
}
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
async function syncPushSubscriptionToSupabase(subscription,operation=null){
  if(!subscription||!window.usProfile)return false;
  const profile=window.usProfile,epoch=usAuthEpoch;
  // An active operation must never join cleanup that may be waiting for it.
  if(!operation)await usPushCleanup;
  if(window.usProfile!==profile||usAuthEpoch!==epoch)return false;
  await usRetryRetiredWebPush(profile.id);
  if(window.usProfile!==profile||usAuthEpoch!==epoch)return false;
  const json=subscription.toJSON();
  if(usRetiredWebPush().some(entry=>entry.endpoint===json.endpoint))return false;
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
  if(window.usProfile!==profile||usAuthEpoch!==epoch)return false;
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
// US 1.0: questions, games and pushes come in this person's language. The
// server keeps it on the profile (set_my_locale); this phone sends it once per
// person and language. A database without the function yet just stays Italian.
async function usSyncContentLocale(profile){
  const locale=window.UsI18n?.locale;
  if(!profile?.id||!['it','en'].includes(locale))return;
  const key=`us:lang:v1:synced:${profile.id}`;
  try{if(localStorage.getItem(key)===locale)return;}catch(_e){}
  try{
    const {error}=await sb.rpc('set_my_locale',{p_locale:locale});
    if(error)return;
    if(window.usProfile?.id===profile.id){try{localStorage.setItem(key,locale);}catch(_e){}}
  }catch(_e){}
}
// English readers also ask for the computed English column (question or
// mission title); a database without it answers the plain Italian read.
async function usReadLocalized(query,columns,localized){
  if(window.UsI18n?.locale!=='en')return query(columns);
  const result=await query(`${columns},${localized}`);
  return result?.error?query(columns):result;
}
// Missions: show the English title where the server gave one.
const usLocalizedTitles=result=>Array.isArray(result?.data)?{...result,data:result.data.map(row=>row?.title_localized?{...row,title:row.title_localized}:row)}:result;

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
  // Cleanup may be waiting for this operation: never join it from inside it.
  if(usPushUiBusy)return;
  const viewer=window.usProfile,epoch=usAuthEpoch;
  if(viewer){
    await usPushCleanup;
    if(window.usProfile!==viewer||usAuthEpoch!==epoch)return;
    await usRetryRetiredWebPush(viewer.id);
    if(window.usProfile!==viewer||usAuthEpoch!==epoch)return;
  }
  const card=document.getElementById('pushOptInCard'),title=document.getElementById('pushOptInTitle'),text=document.getElementById('pushOptInText'),button=document.getElementById('pushEnableBtn'),settings=document.getElementById('pushSettingsRow');
  if(!card||!window.usProfile){if(card)card.hidden=true;if(settings)settings.hidden=true;return;}
  card.classList.remove('install-only','denied');
  if(window.UsNotifications?.supported?.()){
    // Native app: the card only invites; the OS permission is asked after "Attiva".
    // Denied / unavailable / settings states live in Settings › Notifiche.
    const state=await window.UsNotifications.getState();
    if(settings)settings.hidden=true;
    if(state.kind!=='inactive'){card.hidden=true;return;}
    card.hidden=false;
    if(title)title.textContent='Attiva le notifiche';
    if(text)text.textContent='Ti penso, risposte e missioni, anche a US chiusa.';
    if(button){button.hidden=false;button.disabled=false;button.textContent='Attiva';}
    return;
  }
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
  if(text)text.textContent='Ti penso, risposte e missioni, anche a US chiusa.';
  if(button){button.hidden=false;button.disabled=false;button.textContent=Notification.permission==='granted'?'Completa attivazione':'Attiva';}
  setPushSettingsState('inactive','Notifiche non attive','','Attiva');
}
window.refreshWebPushUi=refreshWebPushUi;

async function enableNativePush(){
  const button=document.getElementById('pushEnableBtn');
  if(button){button.disabled=true;button.textContent='Attivo…';}
  let result={ok:false,kind:'error'};
  try{result=await window.UsNotifications.enable();}catch(error){console.warn('[US Notifications] enable',error);}
  if(result.ok){toast('Notifiche attive ♡');setTimeout(()=>sendWebPushEvent('test'),350);}
  else if(result.kind==='denied')toast('Permesso negato: puoi consentirle dalle impostazioni del telefono');
  else if(result.kind==='unavailable')toast('Notifiche non disponibili in questa versione di US');
  else if(result.kind!=='busy')toast('Non riesco ad attivare le notifiche');
  if(button)button.disabled=false;
  try{await refreshWebPushUi();}catch(_e){}
  return result;
}
async function enableWebPush(){
  if(window.UsNotifications?.supported?.())return enableNativePush();
  if(usPushUiBusy||!window.usProfile)return;
  if(!isWebPushSupported())return toast('Notifiche non supportate su questo browser');
  if(isIosDevice()&&!isStandaloneUs())return refreshWebPushUi();
  const operation=usPushWaitScope();
  try{await operation.wait(usPushCleanup);}catch(_e){operation.finish();return;}
  if(usPushUiBusy||usPushSubscriptionPending||!operation.current()){operation.finish();return;}
  const button=document.getElementById('pushEnableBtn');
  let finishOperation;
  const operationDone=new Promise(resolve=>{finishOperation=resolve;});
  usPushOperationInFlight=operationDone;
  usPushUiBusy=true;if(button){button.disabled=true;button.textContent='Attivo…';}
  const profile=window.usProfile,epoch=usAuthEpoch;
  try{
    let permission=Notification.permission;
    if(permission==='default')permission=await operation.wait(Notification.requestPermission());
    if(permission!=='granted'){await refreshWebPushUi();return;}
    const reg=await operation.wait(getUsServiceWorkerRegistration());
    if(window.usProfile!==profile||usAuthEpoch!==epoch)return;
    if(!reg)throw new Error('Service worker unavailable');
    let subscription=await operation.subscription(reg.pushManager.getSubscription());
    if(!subscription){
      subscription=await operation.subscription(reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(US_VAPID_PUBLIC_KEY)}));
    }
    if(window.usProfile!==profile||usAuthEpoch!==epoch){await subscription.unsubscribe();return;}
    const synced=await operation.wait(syncPushSubscriptionToSupabase(subscription,operation));
    if(!synced)throw new Error('Subscription sync failed');
    toast('Notifiche attive ♡');
    await refreshWebPushUi();
    setTimeout(()=>sendWebPushEvent('test'),350);
  }catch(error){if(operation.current()){console.warn('[US Push] enable failed',error);toast('Non riesco ad attivare le notifiche');}}
  finally{
    operation.finish();
    usPushUiBusy=false;if(button)button.disabled=false;
    if(usPushOperationInFlight===operationDone)usPushOperationInFlight=null;
    finishOperation();
    refreshWebPushUi().catch(()=>{});
  }
}
window.enableWebPush=enableWebPush;

async function disableWebPush(options={}){
  const silent=options?.silent===true;
  const priorOperation=Object.hasOwn(options,'waitForOperation')?options.waitForOperation:usPushOperationInFlight;
  if(silent&&priorOperation)try{await usWithDeadline(priorOperation,15000);}catch(_e){}
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
    subscription=await usWithDeadline(getCurrentPushSubscription(),5000);
    if(subscription){
      usSaveRetiredWebPush([...usRetiredWebPush().filter(x=>x.endpoint!==subscription.endpoint),{userId:profileId,endpoint:subscription.endpoint}]);
      try{
        const {error}=options?.localOnly?{error:true}:await usWithDeadline(sb.rpc('remove_web_push_subscription',{target_endpoint:subscription.endpoint}),5000);
        if(error)disableFailed=true;
        else usSaveRetiredWebPush(usRetiredWebPush().filter(x=>x.endpoint!==subscription.endpoint));
      }catch(error){disableFailed=true;console.warn('[US Push] remove subscription',error);}
      let unsubscribed=false;
      try{unsubscribed=await usWithDeadline(subscription.unsubscribe(),5000);}catch(error){console.warn('[US Push] unsubscribe',error);}
      if(!unsubscribed){
        disableFailed=true;
        usSaveRetiredWebPush([...usRetiredWebPush().filter(x=>x.endpoint!==subscription.endpoint),{userId:profileId,endpoint:subscription.endpoint}]);
      }
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
    if(usPushOperationInFlight===operationDone)usPushOperationInFlight=null;
    finishOperation();
    if(refreshUi)try{await refreshWebPushUi();}catch(error){console.warn('[US Push] refresh after disable',error);}
  }
}
window.disableWebPush=disableWebPush;

// Native Notifications V1: one allow-listed target per notification (Web Push
// and native alike), never a URL. `ref` (a UUID, native only) narrows the
// surface; every surface re-reads its data through the normal RLS/RPC paths.
const US_PUSH_TARGETS=Object.freeze(['home','today','think','left_for_you','quiz','bond','calendar','events']);
async function performPushNavigation(target,intent={}){
  if(!US_PUSH_TARGETS.includes(target))return;
  if(!window.usProfile){usPendingPushTarget=target;return;}
  const ref=typeof intent?.ref==='string'?intent.ref:'';
  if(target==='today'){openToday();return;}
  if(target==='think'){
    // Ti penso and its "Ricambia" action: the one-tap reaction sheet, nothing is sent from here.
    if(document.querySelector('.page.active')?.id!=='home')go('home',{motionCommit:true});
    try{await hydrateThink();}catch(error){console.warn('[US Push] think',error);}
    if(usIncomingThink&&(!ref||usIncomingThink.id===ref))openThinkArrival();
    return;
  }
  if(target==='left_for_you'){
    if(document.querySelector('.page.active')?.id!=='home')go('home',{motionCommit:true});
    setTimeout(()=>window.openLeftForYou?.(),120);
    return;
  }
  if(target==='quiz'){
    openQuizHub();
    if(ref)window.USGameV2?.openSession?.(ref);
    return;
  }
  if(target==='calendar'){
    if(ref&&window.UsCalendarLinks?.openEntry)window.UsCalendarLinks.openEntry(ref);
    else window.openCalendarSurface?.();
    return;
  }
  // A mission push opens Missioni itself, not only the Noi page.
  if(target==='bond'){
    if(document.querySelector('.page.active')?.id!=='bond')go('bond',{motionCommit:true});
    setTimeout(()=>window.openNoiSection?.('quest'),120);
    return;
  }
  // Mesiversario and anniversary pushes: Eventi on Noi.
  if(target==='events'){
    if(document.querySelector('.page.active')?.id!=='bond')go('bond',{motionCommit:true});
    setTimeout(()=>window.openNoiSection?.('eventi'),120);
    return;
  }
  if(pages.includes(target))go(target);
}
window.UsNotifications?.onNavigate?.(intent=>performPushNavigation(intent.target,intent));
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
  window.UsCoupleContext?.clear?.();
  window.USCountdown?.reset?.();
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
  // Capture native identity synchronously, before the Web Push await or invalidation.
  const nativeRevocation=window.UsNotifications?.revokeDevice?.();
  try{await disableWebPush({silent:true,refreshUi:false,profileId});}catch(error){console.warn('[US Logout] push revoke',error);}
  // Native app: only this installation's push registration, with a retry if offline.
  try{await nativeRevocation;}catch(error){console.warn('[US Logout] native push revoke',error);}
  try{await clearPrivateDeviceState(profileId);}catch(error){console.warn('[US Logout] private cleanup',error);}
  try{await window.UsWidgets?.clear?.();}catch(error){console.warn('[US Logout] widget cleanup',error);}
}
window.revokeCurrentDevice=revokeCurrentDevice;

// Native Security V1 — the app lock (app-lock.js) never decides on its own
// whether the account is still valid: before it opens US it asks Supabase, and
// its "account login" fallback destroys the local session first.
async function usVerifySessionForAppLock(){
  let session=null;
  try{
    const state=await usWithDeadline(sb.auth.getSession(),US_AUTH_SESSION_TIMEOUT_MS,'app lock session check timed out');
    session=state?.data?.session||null;
  }catch(_e){return 'unknown';}
  if(!session)return 'invalid';
  // A cached Supabase session can still exist while its access token is already
  // expired. Offline we cannot ask the server, so fail closed on local expiry
  // and only allow the offline path while the cached access token is current.
  const expiresAtMs=Number(session.expires_at||0)*1000;
  if(expiresAtMs&&expiresAtMs<=Date.now()+5000)return 'invalid';
  if(!navigator.onLine)return 'valid';
  try{
    const {data,error}=await usWithDeadline(sb.auth.getUser(),2500,'app lock user check timed out');
    if(error){
      const status=Number(error.status||0);
      return status===401||status===403||error.name==='AuthSessionMissingError'?'invalid':'unknown';
    }
    return data?.user?.id===session.user.id?'valid':'invalid';
  }catch(_e){return 'unknown';}
}

async function usAppLockAccountLogin(){
  try{await revokeCurrentDevice();}catch(error){console.warn('[US AppLock] device cleanup',error);}
  try{
    const {error}=await sb.auth.signOut({scope:'local'});
    if(!error)return true;
  }catch(_e){}
  // Offline or server unreachable: drop the local copy of the session directly.
  try{
    await window.usDurableAuthStorage?.removeItem?.(sb.auth.storageKey||'sb-iiakdfsxpywdkxravqjh-auth-token');
    return true;
  }catch(error){console.warn('[US AppLock] local session removal',error);return false;}
}

window.UsAppLock?.configure?.({verifySession:usVerifySessionForAppLock,accountLogin:usAppLockAccountLogin});

let usInitCloudInFlight=null;
let usAuthEpoch=0;
let usAuthUserId='';
let usInitCloudAgain=false;
const usOnboarding=window.UsOnboarding.mount({
  readProfile:id=>usWithDeadline(sb.from('profiles').select('id,display_name,role,couple_id,avatar_path').eq('id',id).maybeSingle(),5000),
  // A mutation retains its guard until the real request settles: a local timer
  // cannot cancel a database transaction or safely authorize another rotation.
  rpc:(name,args)=>{
    const request=args===undefined?sb.rpc(name):sb.rpc(name,args);
    return name==='get_couple_membership'?usWithDeadline(request,5000):request;
  },
  resume:()=>{setTimeout(initCloud,0);},
  // First run: the tour hands over to these steps; the optional birthday from
  // the "Tu" step is one yearly event, through the same insert as events.js.
  openStep:id=>showAuthStep(id),
  insertEvent:row=>sb.from('shared_events').insert(row),
  signOut:async()=>{
    const revocation=revokeCurrentDevice();
    usInvalidateAuth({revokePush:false});
    try{
      await revocation;
      const result=await usWithDeadline(sb.auth.signOut(),5000);
      if(result?.error)throw result.error;
      window.UsAppLock?.reset?.();
      await initCloud();
    }catch(_error){await initCloud();}
  }
});
function usInvalidateAuth({revokePush=true}={}){
  usAuthEpoch++;
  for(const cancel of usPushWaiters)cancel();
  const previousId=window.usProfile?.id||usAuthUserId;
  if(revokePush&&previousId){
    // Auth already moved: never issue an A revocation with B's credentials.
    const priorOperation=usPushOperationInFlight;
    usPushCleanup=usPushCleanup.then(()=>disableWebPush({silent:true,refreshUi:false,profileId:previousId,localOnly:true,waitForOperation:priorOperation})).catch(()=>{});
  }
  homePhotoRequestId++;
  homePhotoPath='';homePhotoHourKey='';homePhotoHasPainted=false;if(typeof usHomePhotoMeta!=='undefined')usHomePhotoMeta=null;if(typeof renderOggiCaption==='function')renderOggiCaption(null);if(typeof renderOggiNext==='function')renderOggiNext(null);
  document.body.classList.remove('us-fastboot-photo');
  clearPrivateDeviceState(previousId).catch(()=>{});
  for(const id of ['homePhotoLayerA','homePhotoLayerB']){
    const layer=document.getElementById(id);if(layer)layer.style.backgroundImage='';
  }
  usOnboarding.reset();
  usOnboarding.setup?.close?.();
  resetNoiIdeasForIdentityChange();
  window.usProfile=null;
  if(typeof usApplyPersonColor==='function')usApplyPersonColor(null);
  window.UsCoupleContext?.clear?.();
  window.UsWidgets?.clear?.().catch(()=>{});
  window.UsNotifications?.signedOut?.();
  if(usRealtimeChannel){sb.removeChannel(usRealtimeChannel);usRealtimeChannel=null;}
  document.documentElement.classList.remove('us-auth-ready','us-returning-device');
  document.documentElement.classList.add('us-auth-pending');
}
window.addEventListener('us-app-lock-change',event=>{if(event.detail?.locked)usAuthEpoch++;});

function usRunWhenIdle(task,timeout=1000){
  const run=()=>Promise.resolve().then(task).catch(error=>console.warn('[US Boot] deferred task',error));
  if('requestIdleCallback' in window){
    requestIdleCallback(run,{timeout});
    return;
  }
  setTimeout(run,Math.min(120,timeout));
}

const US_AUTH_SESSION_TIMEOUT_MS=3200;
function usWithDeadline(promise,ms,label='operation timeout'){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{
      if(settled)return;
      settled=true;
      reject(new Error(label));
    },ms);
    Promise.resolve(promise).then(
      value=>{
        if(settled)return;
        settled=true;
        clearTimeout(timer);
        resolve(value);
      },
      error=>{
        if(settled)return;
        settled=true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function initCloud(){
  // A Supabase PASSWORD_RECOVERY session is a credential-changing grant, not
  // permission to open couple-private US content. Stay inside the auth overlay.
  if(window.usS31Auth?.recoveryActive){
    document.getElementById('authOverlay').classList.remove('hidden');
    showAuthStep('usRecovery');
    return;
  }
  if(usInitCloudInFlight){usInitCloudAgain=true;return usInitCloudInFlight;}
  const bootEpoch=usAuthEpoch;

  usInitCloudInFlight=(async()=>{
    let cachedDeviceProfile=null;
    try{
      const cached=JSON.parse(localStorage.getItem('us:fix4:last-profile')||'null');
      if(cached?.id&&cached?.couple_id){cachedDeviceProfile=cached;usApplyPersonColor(cached);}
    }catch(_e){}

    let session=null;
    let authBootstrapIssue=false;
    try{
      const authState=await usWithDeadline(
        sb.auth.getSession(),
        US_AUTH_SESSION_TIMEOUT_MS,
        'auth session restore timed out'
      );
      session=authState?.data?.session||null;
      if(window.usS31Auth?.recoveryActive){
        document.getElementById('authOverlay').classList.remove('hidden');
        showAuthStep('usRecovery');
        return;
      }
    }catch(error){
      authBootstrapIssue=true;
      console.warn('[US Auth] session restore unavailable',error);
    }

    // A returning PWA can briefly report no session while its durable
    // IndexedDB storage is warming. Never flash the pairing UI for that race.
    if(!session&&cachedDeviceProfile){
      // Cold PWA launch: give durable storage time to resolve, but never force
      // refreshSession here. Supabase auto-refresh + its lock own token rotation.
      await new Promise(resolve=>setTimeout(resolve,420));
      try{
        const retry=await usWithDeadline(
          sb.auth.getSession(),
          1600,
          'auth session retry timed out'
        );
        session=retry?.data?.session||null;
        if(session)authBootstrapIssue=false;
      }catch(_e){}
    }

    if(bootEpoch!==usAuthEpoch)return;
    // Native Security V1: with biometric protection on, nothing private is
    // painted or fetched until the person unlocks (or chooses the account login).
    if(session&&window.UsAppLock){
      const access=await window.UsAppLock.gate({userId:session.user.id});
      if(access!=='open'||bootEpoch!==usAuthEpoch)return;
    }

    usAuthUserId=session?.user?.id||'';
    if(session)usOnboarding.tour?.markSeen?.();
    if(!session){
      usOnboarding.reset();
      // No session on this phone: nothing left to protect, the login is the way in.
      try{await window.UsAppLock?.signedOut?.();}catch(_e){}
      window.UsNotifications?.signedOut?.();
      const returningDevice=Boolean(cachedDeviceProfile);
      resetNoiIdeasForIdentityChange();
      window.usProfile = null;
      window.UsCoupleContext?.clear?.();
      window.UsWidgets?.clear?.().catch(()=>{});
      document.documentElement.classList.remove('us-returning-device','us-auth-pending','us-auth-ready');
      setCloudBadge(false,navigator.onLine?'accesso richiesto':'offline');
      document.getElementById('authOverlay').classList.remove('hidden');
      showAuthStep('authLogin');
      setAuthStatus(
        'loginStatus',
        navigator.onLine
          ? (authBootstrapIssue
              ? 'Non riesco a ripristinare la sessione. Accedi di nuovo per continuare.'
              : (returningDevice
                  ? 'Accedi di nuovo con email e password per continuare.'
                  : 'Accedi con email e password per entrare in US.'))
          : 'Sei offline. Riconnettiti per accedere.',
        // The plain welcome line is for screen readers; the design shows no box.
        navigator.onLine?(authBootstrapIssue?'neutral':'hint'):'error'
      );
      usOnboarding.tour?.maybeOpen?.({returningDevice});
      window.dispatchEvent(new CustomEvent('us-auth-resolved',{detail:{paired:false,returningDevice}}));
      return;
    }

    // Cached profiles never authorize membership. These reads run in parallel,
    // after the native lock, and must both succeed before revealing the shell.
    const result=await usOnboarding.load(session);
    if(bootEpoch!==usAuthEpoch||window.UsAppLock?.isLocked?.()||!result)return;
    if(result.kind!=='PAIRED'){
      resetNoiIdeasForIdentityChange();
      window.UsNotifications?.signedOut?.();
      window.usProfile = null;
      window.UsCoupleContext?.clear?.();
      window.UsWidgets?.clear?.().catch(()=>{});
      if(usRealtimeChannel){sb.removeChannel(usRealtimeChannel);usRealtimeChannel=null;}
      setCloudBadge(false,'da collegare');
      window.dispatchEvent(new CustomEvent('us-auth-resolved',{detail:{paired:false}}));
      return;
    }
    const profile=result.profile;

    resetNoiIdeasForIdentityChange();
    clearUsCoupleContext();
    window.usProfile = profile;
    usApplyPersonColor(profile);
    window.UsWidgets?.authReady?.(profile).catch(error=>console.warn('[US Widget] auth ready',error));
    // Native push: pending notification taps run now (after the lock gate above),
    // then this installation's registration is refreshed if it was activated here.
    window.UsNotifications?.authReady?.(profile)?.catch?.(error=>console.warn('[US Notifications] auth ready',error));
    selectedRole = profile.role;
    try{localStorage.setItem('us:fix4:last-profile',JSON.stringify(profile));}catch(_e){}
    // First run: once per user on this phone, after onboarding here or a
    // password sign-in in this tab. Never for a session restored at launch.
    usOnboarding.setup?.maybeOpen?.(profile)?.catch?.(error=>console.warn('[US Setup] open',error));
    document.getElementById('authOverlay').classList.add('hidden');
    document.documentElement.classList.remove('us-auth-pending');
    document.documentElement.classList.add('us-auth-ready','us-returning-device');
    window.dispatchEvent(new CustomEvent('us-auth-resolved',{detail:{paired:true}}));
    setCloudBadge(true, usIdentity().ownName);
    hydrateUsCoupleContext().catch(error=>console.warn('[US Couple] boot context',error));
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
    // Native has no service-worker image cache. Prewarm only the first few
    // Ricordi after Home is usable so opening the archive feels immediate.
    usRunWhenIdle(()=>usPrewarmNativeMomentMedia(),2200);
    usRunWhenIdle(()=>usSyncContentLocale(profile),1600);

    // Push navigation itself is user intent, so keep it immediate.
    flushPendingPushTarget();
  })();

  try{
    return await usInitCloudInFlight;
  }finally{
    usInitCloudInFlight=null;
    if(usInitCloudAgain){usInitCloudAgain=false;setTimeout(initCloud,0);}
  }
}

function setAuthStatus(id,message='',kind='neutral'){
  const node=document.getElementById(id);
  if(!node)return;
  const again=node.textContent!==message||node.dataset.kind!==kind;
  node.textContent=message;
  if(message)node.dataset.kind=kind;
  else node.removeAttribute('data-kind');
  if(message&&kind==='error'&&again)window.UsOnboarding?.shake?.(node);
}
window.setAuthStatus=setAuthStatus;

function showAuthStep(id){
  // The step on screen leaves as in the design; the page itself switches now.
  window.UsOnboarding?.authSwap?.(id);
  if(id!=='authLogin')usOnboarding.tour?.close?.();
  document.querySelectorAll('.auth-step').forEach(x=>x.classList.remove('active'));
  const next=document.getElementById(id);
  if(next)next.classList.add('active');
  window.UsOnboarding?.authArrive?.(id);
  window.dispatchEvent(new CustomEvent('us-onboarding-view-change'));
}

function setCloudBadge(ok,text){
  const b=document.getElementById('onlineBadge');
  b.className='online-badge '+(ok?'ok':'warn');
  b.textContent=(ok?'● sync · ':'● ')+text;
}


// ===== M12A — Location V2: ambient, automatic distance =====
// US 1.0 Location A (founder decision 14/10): approximate location only.
//  - Nothing is read before the person has seen the explanation and tapped
//    "Attiva" (consent stored on this phone). "Smetti e cancella" removes the
//    consent and deletes the saved reading on the server.
//  - The phone snaps every reading to a grid cell of about 4.9 km2 before
//    sending it (Play: approximate = an area of at least 3 km2); the database
//    snaps again (migration location_approximate_v1).
//  - The partner never receives coordinates: `couple_distance()` returns only
//    a rounded distance, or "near" under 3 km.
// Refresh policy (unchanged):
//  - Triggers (event driven, no polling loop): US ready after launch, return to
//    the foreground, and a slow visible-only check while the session stays open.
//  - A reading is FRESH for 10 min (no geolocation call at all), becomes
//    eligible for an automatic refresh after that, and is shown as STALE (quiet
//    capsule, value kept) after 60 min.
//  - Geolocation is only asked automatically after consent, when the browser
//    says "granted" (or cannot tell). "prompt" never triggers a dialog by
//    itself; "denied" stops everything until the browser permission changes.
//    Failures keep the last good distance and back off.
let locationRefreshInFlight=false;
let locationTimer=null;
const US_LOCATION_FRESH_MS=10*60*1000;
const US_LOCATION_STALE_DISPLAY_MS=60*60*1000;
const US_LOCATION_MIN_GAP_MS=45*1000;
const US_LOCATION_FAILURE_BACKOFF_MS=5*60*1000;
const US_LOCATION_CHECK_INTERVAL_MS=5*60*1000;
const US_LOCATION_CELL_DEG=0.02;
const US_LOCATION_CONSENT_KEY='us:location:consent';
const US_LOCATION_CONSENT_VERSION='approximate-v1';
const usLocationRuntime={permission:'unknown',lastAttemptAt:0,lastFailureAt:0,mineUpdatedAt:null,watching:false,snapshot:null,server:null};

// Same grid as private.location_cell(): 0.02 degrees of latitude, and as many
// equal longitude cells per latitude band as keep each cell about 2.2 km wide.
function usLocationCell(latitude,longitude){
  const lat=Number(latitude),lon=Number(longitude);
  if(!validCoordinate(lat,-90,90)||!validCoordinate(lon,-180,180))return null;
  const latIndex=Math.min(Math.floor((lat+90)/US_LOCATION_CELL_DEG),8999);
  const centreLat=-90+(latIndex+0.5)*US_LOCATION_CELL_DEG;
  const lonCells=Math.max(1,Math.floor(360*Math.cos(centreLat*Math.PI/180)/US_LOCATION_CELL_DEG));
  const lonStep=360/lonCells;
  const lonIndex=Math.min(Math.floor((lon+180)/lonStep),lonCells-1);
  return {latitude:Number(centreLat.toFixed(6)),longitude:Number((-180+(lonIndex+0.5)*lonStep).toFixed(6))};
}

function locationConsentGiven(){
  try{return localStorage.getItem(US_LOCATION_CONSENT_KEY)===US_LOCATION_CONSENT_VERSION;}catch(_e){return false;}
}
function setLocationConsent(given){
  try{
    if(given)localStorage.setItem(US_LOCATION_CONSENT_KEY,US_LOCATION_CONSENT_VERSION);
    else localStorage.removeItem(US_LOCATION_CONSENT_KEY);
    // Pre-1.0 flag: it allowed automatic reads without the explanation.
    localStorage.removeItem('usLocationEnabled');
  }catch(_e){}
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

// The server already rounds to whole kilometres (3 km or more).
function formatDistance(km){
  const unit=localStorage.getItem('us:settings:distance-unit')||'km';
  if(unit==='mi')return `${Math.max(2,Math.round(km*0.621371)).toLocaleString((globalThis.UsI18n?.tag||'it-IT'))} mi`;
  return `${Math.max(3,Math.round(km)).toLocaleString((globalThis.UsI18n?.tag||'it-IT'))} km`;
}

// Pure: should an automatic geolocation read happen right now?
function decideLocationRefresh({now=Date.now(),mineUpdatedAt=null,lastAttemptAt=0,lastFailureAt=0,permission='unknown',consent=false,hidden=false,inFlight=false}={}){
  if(inFlight)return {refresh:false,why:'in-flight'};
  if(hidden)return {refresh:false,why:'hidden'};
  if(!consent)return {refresh:false,why:'no-consent'};
  if(permission==='denied')return {refresh:false,why:'denied'};
  if(permission==='prompt')return {refresh:false,why:'needs-user-permission'};
  if(lastAttemptAt&&now-lastAttemptAt<US_LOCATION_MIN_GAP_MS)return {refresh:false,why:'too-soon'};
  if(lastFailureAt&&now-lastFailureAt<US_LOCATION_FAILURE_BACKOFF_MS)return {refresh:false,why:'failure-backoff'};
  const updated=Date.parse(mineUpdatedAt||'');
  if(Number.isFinite(updated)&&now-updated<US_LOCATION_FRESH_MS)return {refresh:false,why:'fresh'};
  return {refresh:true,why:Number.isFinite(updated)?'stale':'no-reading'};
}

// Pure: what the capsule says. `server` is the last couple_distance() result.
function distanceCapsuleModel({server=null,partnerName='',permission='unknown',supported=true,consent=false}={}){
  if(!supported)return {state:'unsupported',visible:false,text:'',detail:'Posizione non disponibile'};
  if(!server?.sharing){
    if(consent&&permission==='denied')return {state:'denied',visible:true,text:'Posizione non disponibile',detail:'Riattivala dalle impostazioni del telefono.'};
    if(consent&&permission!=='prompt')return {state:'pending',visible:false,text:'',detail:''};
    return {state:'needs-permission',visible:true,text:'Attiva posizione',detail:'Mostra la distanza tra voi.'};
  }
  if(!server.partner_sharing)return {state:'waiting',visible:true,text:'In attesa',detail:`In attesa di ${partnerName||'chi ami'}`,age:server.my_updated_at};
  const near=server.near===true;
  const km=Number(server.distance_km);
  if(!near&&!Number.isFinite(km))return {state:'unavailable',visible:true,text:'Posizione non disponibile',detail:'Distanza non disponibile.'};
  const oldest=Math.max(locationAgeMs(server.my_updated_at),locationAgeMs(server.partner_updated_at));
  const stale=oldest>US_LOCATION_STALE_DISPLAY_MS;
  const older=locationAgeMs(server.my_updated_at)>=locationAgeMs(server.partner_updated_at)?server.my_updated_at:server.partner_updated_at;
  const text=near?'vicini':formatDistance(km);
  return {state:stale?'stale':'ready',visible:true,near,km:near?0:km,text,detail:near?'Siete vicini':`${text} tra voi`,age:older,stale};
}

// HUMAN-UI-02 — the Noi couple row reads the same model. Only a real reading
// (ready, or stale = last known) carries a value; every other state is shown
// as unknown.
function noiDistanceLine(model){
  const state=model?.state||'unknown';
  if(state==='ready'&&model.text)return {state,text:model.text,label:model.near?'Siete vicini':`${model.text} tra voi`};
  if(state==='stale'&&model.text)return {state,text:model.text,label:model.near?'Ultima distanza nota: vicini':`Ultima distanza nota: ${model.text}`};
  return {state:'unknown',text:'distanza non nota',label:'Distanza tra voi non nota'};
}
function renderNoiDistance(model){
  const link=document.getElementById('noiCoupleLink');
  const value=document.getElementById('noiCoupleDistance');
  if(!link||!value)return;
  const line=noiDistanceLine(model);
  link.dataset.usDistanceState=line.state;
  value.textContent=line.text;
  link.setAttribute('aria-label',line.label);
}

function renderDistanceCapsule(model){
  renderNoiDistance(model);
  const root=document.getElementById('distanceWidget');
  const value=document.getElementById('distanceValue');
  if(!root||!value)return;
  root.hidden=!model.visible;
  root.dataset.usDistanceState=model.state;
  value.textContent=model.text||'';
  root.setAttribute('aria-label',model.visible?(model.near?'Siete vicini':`Distanza tra voi: ${model.text}`):'Distanza tra voi');
  if(typeof syncOggiRow==='function')syncOggiRow();
  if (typeof Event === 'function' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event('us:distance-changed'));
  }
}

// Last good server answer (shown again on any temporary failure) + current model.
function applyServerDistance(server){
  usLocationRuntime.server=server||null;
  usLocationRuntime.mineUpdatedAt=server?.my_updated_at||null;
  const partnerName=usIdentity().partnerName;
  const model=distanceCapsuleModel({server,partnerName,permission:usLocationRuntime.permission,supported:Boolean(navigator.geolocation),consent:locationConsentGiven()});
  window.usDistanceKm=model.km!==undefined?model.km:null;
  usLocationRuntime.snapshot=model;
  renderDistanceCapsule(model);
  return model;
}

async function hydrateDistance(){
  const viewer=window.usProfile,coupleId=viewer?.couple_id;
  if(!viewer)return;
  const {data,error}=await sb.rpc('couple_distance');
  if(window.usProfile!==viewer||window.usProfile?.couple_id!==coupleId)return;
  // A failed read never replaces a valid last-known distance.
  if(error){console.warn(error);return;}
  return applyServerDistance(data);
}
window.hydrateDistance=hydrateDistance;

async function saveMyLocation(position){
  if(window.__US_LOCAL_DEV__)return false;
  if(!window.usProfile)return;
  const cell=usLocationCell(position.coords.latitude,position.coords.longitude);
  if(!cell)throw new Error('invalid coordinates');
  const payload={
    user_id:window.usProfile.id,
    couple_id:window.usProfile.couple_id,
    latitude:cell.latitude,
    longitude:cell.longitude,
    accuracy_m:null,
    updated_at:new Date(position.timestamp||Date.now()).toISOString()
  };
  const {error}=await sb.from('couple_locations').upsert(payload,{onConflict:'user_id'});
  if(error)throw error;
}

function geolocationError(error,silent=false){
  usLocationRuntime.lastFailureAt=Date.now();
  if(error?.code===1){
    // Permission refused: stop trying until the browser permission changes.
    usLocationRuntime.permission='denied';
    if(!silent)toast('Permesso posizione non attivo');
  }else if(!silent)toast('Non riesco ad aggiornare la posizione');
  // The last good distance (if any) stays on screen.
  return hydrateDistance();
}

// Reads the position only after consent. Only the explanation's "Attiva" uses
// it without `silent`; automatic refreshes always pass {silent:true}.
function refreshMyLocation(options={}){
  if(window.__US_LOCAL_DEV__)return;
  const silent=Boolean(options?.silent);
  if(!window.usProfile)return toast('Connessione non pronta');
  if(!locationConsentGiven())return;
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
    // Approximate is all US uses: never ask the device for GPS precision.
    enableHighAccuracy:false,
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
      if(permission.state==='granted'&&locationConsentGiven())refreshMyLocation({silent:true});
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
  if(usLocationRuntime.server)applyServerDistance(usLocationRuntime.server);
  const decision=decideLocationRefresh({
    mineUpdatedAt:usLocationRuntime.mineUpdatedAt,
    lastAttemptAt:usLocationRuntime.lastAttemptAt,
    lastFailureAt:usLocationRuntime.lastFailureAt,
    permission:usLocationRuntime.permission,
    consent:locationConsentGiven(),
    hidden:document.hidden,
    inFlight:locationRefreshInFlight
  });
  if(decision.refresh)refreshMyLocation({silent:true});
  return {reason,...decision};
}

// Slow, visible-only safety net for a session that simply stays open. It asks
// the same policy as every other trigger, so a fresh reading never reads GPS.
// It also brings in the partner's newer reading (their row is not readable,
// so there is no Realtime event for it).
function startLocationRefreshTimer(){
  if(window.__US_LOCAL_DEV__)return;
  if(locationTimer)clearInterval(locationTimer);
  locationTimer=setInterval(()=>{
    if(window.__US_LOCAL_DEV__)return;
    if(document.hidden||!window.usProfile)return;
    maybeAutoRefreshLocation('check').catch(()=>{});
  },US_LOCATION_CHECK_INTERVAL_MS);
}

// The explanation shown before the system permission dialog (Play prominent
// disclosure). Nothing is read unless the person taps "Attiva".
async function openLocationDisclosure(){
  const partner=usIdentity().partnerName||'La tua persona';
  const ok=await window.UsUiFoundation?.confirm?.({
    kicker:'POSIZIONE',
    icon:'map-pin',
    title:'Attiva la posizione',
    body:`US usa la posizione approssimativa di questo telefono, solo ad app aperta, per calcolare la distanza tra voi. ${partner} vede solo la distanza, mai dove sei. Puoi smettere quando vuoi.`,
    confirmLabel:'Attiva',
    cancelLabel:'Non ora'
  });
  if(!ok)return false;
  return startLocationSharing();
}
window.openLocationDisclosure=openLocationDisclosure;
// What "Attiva" does once the person has read the explanation (here, or in
// the first-run Posizione step, which shows the same facts).
function startLocationSharing(){
  setLocationConsent(true);
  usLocationRuntime.lastFailureAt=0;
  refreshMyLocation({});
  return true;
}

// "Smetti e cancella": consent off on this phone, saved reading deleted.
async function stopSharingLocation(){
  if(window.__US_LOCAL_DEV__)return false;
  const {error}=await sb.rpc('stop_sharing_location');
  if(error){console.warn(error);toast('Non riesco a cancellare la posizione. Riprova.');return false;}
  setLocationConsent(false);
  usLocationRuntime.lastAttemptAt=0;
  usLocationRuntime.lastFailureAt=0;
  usLocationRuntime.mineUpdatedAt=null;
  await hydrateDistance();
  toast('Posizione cancellata');
  return true;
}
window.stopSharingLocation=stopSharingLocation;

function locationSharingActive(){
  return Boolean(usLocationRuntime.server?.sharing)||locationConsentGiven();
}

// Settings › Posizione.
async function openLocationSettings(){
  const ui=window.UsUiFoundation;
  if(locationSharingActive()){
    const partner=usIdentity().partnerName||'La tua persona';
    const stop=await ui?.confirm?.({
      kicker:'POSIZIONE',
      title:'Posizione condivisa',
      body:`US usa la posizione approssimativa di questo telefono, solo ad app aperta. ${partner} vede solo la distanza tra voi, mai dove sei. Se smetti, la posizione salvata viene cancellata subito.`,
      confirmLabel:'Smetti e cancella',
      cancelLabel:'Chiudi',
      tone:'danger'
    });
    if(stop)await stopSharingLocation();
    return;
  }
  if(!navigator.geolocation){
    await ui?.notice?.({kicker:'POSIZIONE',title:'Posizione non disponibile',body:'Questo telefono non può condividere la posizione.'});
    return;
  }
  return openLocationDisclosure();
}
window.UsLocation=Object.freeze({
  openSettings:openLocationSettings,
  isSharing:locationSharingActive,
  start:startLocationSharing,
  stop:stopSharingLocation
});

// The capsule's only interaction: a tiny sheet (same canonical surface as every
// confirmation). "Attiva posizione" exists only where sharing is still off;
// there is never a manual refresh.
async function openDistanceDetail(){
  const model=usLocationRuntime.snapshot||distanceCapsuleModel({permission:usLocationRuntime.permission,supported:Boolean(navigator.geolocation),consent:locationConsentGiven()});
  const ui=window.UsUiFoundation;
  if(model.state==='needs-permission'){
    await openLocationDisclosure();
    return;
  }
  const age=model.age?`Aggiornata ${relativeLocationAge(model.age)}. `:'';
  await ui?.notice?.({kicker:'DISTANZA',icon:'map-pin',title:model.detail||'Posizione non disponibile',body:`${age}Puoi smettere di condividerla da Impostazioni › Posizione.`});
}
window.openDistanceDetail=openDistanceDetail;

function setAvatarImage(img,fallback,path,signedUrl){
  if(!img)return;
  const showFallback=()=>{img.hidden=true;if(fallback)fallback.style.display='grid';};
  img.onload=()=>{img.hidden=false;if(fallback)fallback.style.display='none';img.dataset.usMediaRetry='0';};
  img.onerror=async()=>{
    showFallback();
    const retryPath=path||img.dataset?.usMediaPath||'';
    if(!retryPath||img.dataset.usMediaRetry==='1')return;
    img.dataset.usMediaRetry='1';
    usInvalidateSignedUrl(retryPath);
    const fresh=await usGetSignedUrl(retryPath,21600,{force:true});
    if(fresh)img.src=fresh;
  };
  if(!signedUrl){img.removeAttribute('src');showFallback();return;}
  showFallback();
  img.dataset.usMediaRetry='0';
  img.src=signedUrl;
}
function setAvatarSlot(containerId,signedUrl,path=''){
  const root=document.getElementById(containerId);if(!root)return;
  setAvatarImage(root.querySelector('img'),root.querySelector('.fallback'),path||usStoragePathFromSignedUrl(signedUrl),signedUrl);
}

async function signedAvatarUrl(path){
  return usGetSignedUrl(path,21600);
}

async function hydrateProfileAvatars(){
  const viewer=window.usProfile, coupleId=viewer?.couple_id;
  if(!viewer)return;
  const fallback=document.getElementById('profileAvatarFallback');
  if(fallback)fallback.textContent=usIdentity().initialForRole(viewer.role);
  const {data:profiles,error}=await sb.from('profiles').select('id,display_name,role,avatar_path,couple_id').eq('couple_id',coupleId);
  if(window.usProfile!==viewer||window.usProfile?.couple_id!==coupleId)return;
  if(error){console.warn(error);return;}
  for(const profile of (profiles||[]).filter(p=>p.couple_id===coupleId)){
    const url=await signedAvatarUrl(profile.avatar_path);
    if(window.usProfile!==viewer||window.usProfile?.couple_id!==coupleId)return;
    if(profile.role==='francesco')setAvatarSlot('pairAvatarFrancesco',url);
    if(profile.role==='beatrice')setAvatarSlot('pairAvatarBeatrice',url);
    if(profile.id===window.usProfile.id){
      const img=document.getElementById('profileAvatarImg');
      if(img){
        setAvatarImage(img,fallback,profile.avatar_path,url);
      }
      window.usProfile.avatar_path=profile.avatar_path||null;
    }
  }

  window.dispatchEvent(new Event('us:noi-portraits-ready'));
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

let usRicordiThumbnailBackfillBusy=false;
async function usMissingRicordiThumbnailCount(){
  if(!window.usProfile)return 0;
  const {count,error}=await sb.from('moments')
    .select('id',{count:'exact',head:true})
    .eq('couple_id',window.usProfile.couple_id)
    .is('thumbnail_path',null);
  if(error)throw error;
  return Number(count||0);
}
async function usOptimizeLegacyRicordiThumbnails({onProgress}={}){
  if(usRicordiThumbnailBackfillBusy)return {ok:false,code:'busy'};
  if(!window.UsPlatform?.isNative)return {ok:false,code:'native_only'};
  if(!window.usProfile)return {ok:false,code:'not_ready'};
  if(!navigator.onLine)return {ok:false,code:'offline'};
  const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  if(connection?.saveData)return {ok:false,code:'data_saver'};
  usRicordiThumbnailBackfillBusy=true;
  const createdPaths=[];
  try{
    const {data:rows,error}=await sb.from('moments')
      .select('id,storage_path,thumbnail_path,created_at')
      .eq('couple_id',window.usProfile.couple_id)
      .is('thumbnail_path',null)
      .order('created_at',{ascending:false});
    if(error)throw error;
    const total=(rows||[]).length;
    let done=0,failed=0;
    for(const row of rows||[]){
      let thumbnailPath='';
      try{
        onProgress?.({done,total,failed,current:row.id});
        const signedUrl=await usGetSignedUrl(row.storage_path,21600);
        if(!signedUrl)throw new Error('source_url_unavailable');
        const response=await fetch(signedUrl,{cache:'force-cache'});
        if(!response.ok)throw new Error('source_download_failed');
        const blob=await response.blob();
        if(!blob.type.startsWith('image/'))throw new Error('source_not_image');
        const sourceFile=new File([blob],`moment-${row.id}`,{type:blob.type,lastModified:Date.now()});
        const thumbnail=await compressImageFile(sourceFile,{maxDimension:720,quality:.72});
        thumbnailPath=`${window.usProfile.couple_id}/${window.usProfile.id}/derived-thumbnails/${row.id}-${crypto.randomUUID()}.webp`;
        const {error:uploadError}=await sb.storage.from('us-media').upload(thumbnailPath,thumbnail,{
          contentType:'image/webp',upsert:false,cacheControl:'31536000'
        });
        if(uploadError)throw uploadError;
        createdPaths.push(thumbnailPath);
        const {data:set,error:setError}=await sb.rpc('set_moment_thumbnail',{
          target_moment_id:row.id,
          target_thumbnail_path:thumbnailPath
        });
        if(setError||set!==true){
          await sb.storage.from('us-media').remove([thumbnailPath]).catch?.(()=>{});
          const index=createdPaths.indexOf(thumbnailPath);if(index>=0)createdPaths.splice(index,1);
          if(setError)throw setError;
          throw new Error('thumbnail_not_attached');
        }
        done++;
      }catch(error){
        failed++;
        console.warn('[US Media] legacy thumbnail',error);
        if(thumbnailPath&&createdPaths.includes(thumbnailPath)){
          try{await sb.storage.from('us-media').remove([thumbnailPath]);}catch(_e){}
          const index=createdPaths.indexOf(thumbnailPath);if(index>=0)createdPaths.splice(index,1);
        }
      }
      onProgress?.({done,total,failed,current:null});
    }
    try{await hydrateMoments({forceMedia:true});}catch(_e){}
    return {ok:failed===0,done,total,failed,remaining:Math.max(0,total-done)};
  }finally{
    usRicordiThumbnailBackfillBusy=false;
  }
}
window.UsRicordiThumbnails=Object.freeze({
  missingCount:usMissingRicordiThumbnailCount,
  optimizeLegacy:usOptimizeLegacyRicordiThumbnails,
  busy:()=>usRicordiThumbnailBackfillBusy
});

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
    const {error:uploadError}=await sb.storage.from('us-media').upload(path,compressed,{contentType:'image/webp',upsert:false,cacheControl:'31536000'});
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
  const viewer=window.usProfile,epoch=usAuthEpoch;
  const {data:rows,error}=await sb.from('moments')
    .select('id,storage_path,moment_date,created_at,caption,created_by')
    .eq('couple_id',window.usProfile.couple_id)
    .order('moment_date',{ascending:false})
    .order('created_at',{ascending:false})
    .limit(120);
  if(window.usProfile!==viewer||epoch!==usAuthEpoch)return undefined;
  if(error){console.warn(error);return undefined;}
  if(rows?.length){
    const key=homeRotationKey();
    let idx=homeStableIndex(`${window.usProfile.couple_id}|${key}|home`,rows.length);
    if(rows.length>1&&rows[idx]?.storage_path===homePhotoPath)idx=(idx+1)%rows.length;
    usHomePhotoMeta=rows[idx]?.storage_path?{path:rows[idx].storage_path,caption:rows[idx].caption||'',date:rows[idx].moment_date||'',author:rows[idx].created_by||''}:null;
    return rows[idx]?.storage_path||null;
  }
  const {data:couple,error:coupleError}=await sb.from('couples').select('home_photo_path').eq('id',window.usProfile.couple_id).maybeSingle();
  if(window.usProfile!==viewer||epoch!==usAuthEpoch)return undefined;
  if(coupleError){console.warn(coupleError);return undefined;}
  return couple?.home_photo_path||null;
}

function crossfadeHomePhoto(url,{path='',hourKey='',allowRetry=true}={}){
  const requestId=++homePhotoRequestId;
  const viewer=window.usProfile,epoch=usAuthEpoch;
  const currentViewer=()=>requestId===homePhotoRequestId&&window.usProfile===viewer&&epoch===usAuthEpoch;
  const hero=document.getElementById('homeHero');
  const empty=document.getElementById('homeEmptyState');
  const nextKey=homePhotoActiveLayer==='A'?'B':'A';
  const current=document.getElementById(`homePhotoLayer${homePhotoActiveLayer}`);
  const next=document.getElementById(`homePhotoLayer${nextKey}`);
  if(!hero||!current||!next)return;
  const apply=()=>{
    if(!currentViewer())return;
    const firstValid=Boolean(url)&&!homePhotoHasPainted;
    hero.classList.toggle('is-empty',!url);
    if(empty)empty.hidden=Boolean(url);
    if(!url&&typeof layoutOggiEmptyState==='function')requestAnimationFrame(layoutOggiEmptyState);
    next.style.backgroundImage=url?`url("${url}")`:'';
    const paint=()=>{
      if(!currentViewer())return;
      next.classList.add('active');
      current.classList.remove('active');
      homePhotoActiveLayer=nextKey;
      if(url){
        homePhotoHasPainted=true;
        if(path){
          homePhotoPath=path;
          homePhotoHourKey=hourKey||homeRotationKey();
          writeHomeBootCache(homePhotoHourKey,path,url);
        }
      }else{
        homePhotoHasPainted=false;
        homePhotoPath='';
      }
      if(typeof renderOggiCaption==='function')renderOggiCaption(url&&path&&typeof usHomePhotoMeta!=='undefined'&&usHomePhotoMeta?.path===path?usHomePhotoMeta:null);
      // Native Foto & Noi follows the image actually displayed by Oggi.
      // The event carries no private path or signed URL.
      window.dispatchEvent(new Event('us:home-photo-changed'));
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
  preload.onerror=async()=>{
    if(!currentViewer())return;
    console.warn('[US Home] preload foto fallito');
    if(path&&allowRetry){
      usInvalidateSignedUrl(path);
      const fresh=await usGetSignedUrl(path,21600,{force:true});
      if(!currentViewer())return;
      if(fresh&&fresh!==url){
        crossfadeHomePhoto(fresh,{path,hourKey,allowRetry:false});
        return;
      }
    }
    homePhotoPath='';
    homePhotoHasPainted=false;
    try{
      const cached=JSON.parse(localStorage.getItem(US_HOME_BOOT_CACHE_KEY)||'null');
      if(!path||cached?.path===path)localStorage.removeItem(US_HOME_BOOT_CACHE_KEY);
    }catch(_e){}
  };
  preload.src=url;
}

async function hydrateHomePhoto(force=false){
  if(!window.usProfile)return;
  const viewer=window.usProfile,epoch=usAuthEpoch;
  const hourKey=homeRotationKey();
  if(!force && homePhotoHourKey===hourKey && homePhotoPath && homePhotoHasPainted)return;

  // Paint the previous valid image first, even if the rotation hour changed.
  // Then refresh the correct hourly image silently in the background.
  if(!force && !homePhotoPath){
    const cached=readHomeBootCache(hourKey);
    if(cached){
      crossfadeHomePhoto(cached.url,{path:cached.path,hourKey:cached.hourKey||hourKey});
      if(cached.currentHour)return;
    }
  }

  const path=await getHomeRotationPath();
  if(window.usProfile!==viewer||epoch!==usAuthEpoch)return;
  if(path===undefined)return;
  if(!path){
    homePhotoHourKey=hourKey;
    homePhotoPath='';
    try{localStorage.removeItem(US_HOME_BOOT_CACHE_KEY);}catch(_e){}
    crossfadeHomePhoto('');
    return;
  }
  if(!force && path===homePhotoPath && homePhotoHasPainted){
    homePhotoHourKey=hourKey;
    return;
  }
  const signedUrl=await usGetSignedUrl(path,21600,{force});
  if(window.usProfile!==viewer||epoch!==usAuthEpoch)return;
  if(!signedUrl)return;
  crossfadeHomePhoto(signedUrl,{path,hourKey});
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

// Parity with the approved mockup: under the time, the photo speaks — its
// caption in Fraunces italic, then the day and who took it, with that
// person's colour. Then one row: the next thing you'll do together and the
// distance (they step aside while a card waits for me).
let usHomePhotoMeta=null;
function oggiLocaleTag(){return globalThis.UsI18n?.tag||'it-IT';}
function oggiCaptionViewModel(meta,{viewerId=window.usProfile?.id,identity=usIdentity(),today=oggiTodayISO()}={}){
  if(!meta?.path)return null;
  const text=String(meta.caption||'').trim();
  const day=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(meta.date||''));
  let date='';
  if(day){
    const at=new Date(Date.UTC(+day[1],+day[2]-1,+day[3],12));
    const sameYear=String(today||'').slice(0,4)===day[1];
    try{date=at.toLocaleDateString(oggiLocaleTag(),{day:'numeric',month:'long',...(sameYear?{}:{year:'numeric'}),timeZone:'UTC'});}catch(_){date='';}
  }
  const mine=Boolean(meta.author&&meta.author===viewerId);
  const name=meta.author?(mine?identity.ownName:identity.partnerName):'';
  if(!text&&!date)return null;
  return {text,date,name,who:meta.author?(mine?'tu':'partner'):'noi',meta:date&&name?`${date} · di ${name}`:date};
}
function renderOggiCaption(meta){
  const root=document.getElementById('usOggiCaption');
  if(!root)return;
  const model=oggiCaptionViewModel(meta);
  if(!model){root.hidden=true;return;}
  const em=document.getElementById('usOggiCaptionText'),dot=document.getElementById('usOggiCaptionDot'),line=document.getElementById('usOggiCaptionMeta');
  if(em){em.textContent=model.text;em.hidden=!model.text;}
  if(dot)dot.dataset.who=model.who;
  // One text: "3 settembre · di Francesco" (English through its {date}/{name} pattern).
  if(line)line.textContent=model.meta;
  root.hidden=false;
}
window.UsOggiCaption=Object.freeze({viewModel:oggiCaptionViewModel,render:renderOggiCaption});
function oggiNextEventViewModel(source){
  if(!source?.id||!source?.title||source.days_left===null||source.days_left===undefined||!source.effective_date)return null;
  const days=Number(source.days_left);
  if(!Number.isFinite(days)||days<0||days>2)return null;
  const time=source.event_time?String(source.event_time).slice(0,5):'';
  let day=days===0?'Oggi':days===1?'Domani':'';
  if(!day){
    const d=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(source.effective_date));
    try{day=d?new Date(Date.UTC(+d[1],+d[2]-1,+d[3],12)).toLocaleDateString(oggiLocaleTag(),{weekday:'long',timeZone:'UTC'}):'';}catch(_){day='';}
    day=day?day.charAt(0).toLocaleUpperCase(oggiLocaleTag())+day.slice(1):'';
  }
  if(!day)return null;
  return {id:String(source.id),when:time?`${day}, ${time}`:day,title:String(source.title)};
}
function syncOggiRow(){
  const row=document.getElementById('usOggiRow');
  if(!row)return;
  const next=document.getElementById('usOggiNext'),pill=document.getElementById('distanceWidget');
  row.hidden=Boolean((!next||next.hidden)&&(!pill||pill.hidden));
}
function renderOggiNext(model){
  const button=document.getElementById('usOggiNext');
  if(!button)return;
  if(!model){button.hidden=true;button.removeAttribute('aria-label');syncOggiRow();return;}
  document.getElementById('usOggiNextWhen').textContent=model.when;
  document.getElementById('usOggiNextTitle').textContent=model.title;
  button.dataset.usEventId=model.id;
  button.hidden=false;
  syncOggiRow();
}
document.getElementById('usOggiNext')?.addEventListener('click',()=>{window.go?.('bond',{nav:true});});
window.UsOggiNext=Object.freeze({viewModel:oggiNextEventViewModel,render:renderOggiNext});

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
  const rows=Array.isArray(fact.rows)?fact.rows.filter(row=>row&&row.label&&row.value):[];
  const rowsHtml=rows.length
    ? `<span class="us-oggi-card-lines">${rows.map(row=>`<span class="us-oggi-card-line" data-kind="${escapeHtml(row.kind||'person')}"><span class="us-oggi-card-line-label"${row.kind==='person'?' translate="no"':''}>${escapeHtml(row.label)}</span><span class="us-oggi-card-line-value"${row.kind==='person'&&row.value!=='Nessun impegno'?' translate="no"':''}>${escapeHtml(row.value)}</span></span>`).join('')}</span>`
    : `<small>${escapeHtml(fact.detail)}</small>`;
  const ariaDetail=rows.length?rows.map(row=>`${row.label} ${row.value}`).join('. '):fact.detail;
  container.innerHTML=`<button type="button" class="us-oggi-card" data-us-oggi-date="${escapeHtml(fact.dateISO)}" aria-label="${escapeHtml(fact.title)}: ${escapeHtml(ariaDetail)}"><span class="us-oggi-card-mark" aria-hidden="true">♡</span><span class="us-oggi-card-copy"><b>${escapeHtml(fact.title)}</b>${rowsHtml}</span></button>`;
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
  return Boolean(target&&typeof target.closest==='function'&&target.closest('#usTodayPriorityRegion,.us-oggi-dock,.us-oggi-stack,.us-oggi-widgets,.home-distance-pill,.push-optin-card,.home-empty-state,.us-countdown-display,.us-countdown-entry'));
}
let usOggiFocusPhotoActive=false;
function setOggiFocusPhoto(active){
  usOggiFocusPhotoActive=active;
  const hero=document.getElementById('homeHero');
  hero?.classList.toggle('us-oggi-focus',active);
  document.getElementById('usOggiFocusToggle')?.setAttribute('aria-pressed',String(active));
  const fadeTargets=[document.getElementById('usTodayPriorityRegion'),document.getElementById('usOggiCalendarWidget'),document.getElementById('usDailyRitual'),document.getElementById('distanceWidget'),document.getElementById('pushOptInCard'),document.getElementById('usCountdownDisplay'),document.getElementById('usCountdownEntry'),document.getElementById('usOggiNext')];
  for(const el of fadeTargets){
    if(!el)continue;
    if(active)el.setAttribute('inert','');else el.removeAttribute('inert');
  }
}
// The first time the photo takes the screen, a quiet line says how to come back (mockup).
let usOggiFocusTipShown=false;
function toggleOggiFocusPhoto(){
  setOggiFocusPhoto(!usOggiFocusPhotoActive);
  if(usOggiFocusPhotoActive&&!usOggiFocusTipShown){usOggiFocusTipShown=true;setTimeout(()=>{if(usOggiFocusPhotoActive)toast('Tocca di nuovo per tornare',{quiet:true});},300);}
}
window.toggleOggiFocusPhoto=toggleOggiFocusPhoto;
document.getElementById('homeHero')?.addEventListener('click',event=>{
  // A card that re-rendered under the tap (e.g. a notice that opened its sheet) is no photo tap.
  if(event.target&&event.target.isConnected===false)return;
  if(oggiIsWidgetTarget(event.target))return;
  toggleOggiFocusPhoto();
});
// The US mark at the top of Oggi is not a control: as in the approved mockup
// (where the header lies on the photo) a tap on it, or on the bar around it,
// is a tap on the photo: Focus Photo, the screen with nothing but you two.
// Ti penso and the envelope keep their own taps.
document.querySelector?.('.app>.top')?.addEventListener?.('click',event=>{
  if(document.querySelector('.page.active')?.id!=='home')return;
  if(event.target?.closest?.('button,a[href],input,label,[role="button"],.online-badge'))return;
  toggleOggiFocusPhoto();
});

// M10A — the empty-state invitation is a passive widget: it sits in the free
// band between the countdown (1.0: visible without a photo too) and the dock
// above the nav, and drops its secondary lines when that band is short, so it
// never slides under either.
function layoutOggiEmptyState(){
  const hero=document.getElementById('homeHero'),empty=document.getElementById('homeEmptyState'),stack=document.getElementById('usOggiStack');
  if(!hero||!empty||!stack||empty.hidden)return;
  const box=hero.getBoundingClientRect();
  if(!box.height)return;
  const gap=12;
  // The legacy stack is retired (height 0): it bounds the band only if it shows.
  const stackBox=stack.getBoundingClientRect();
  const chrome=document.querySelector('.app>.top')?.getBoundingClientRect();
  let top=stackBox.height?stackBox.bottom-box.top+gap:Math.max(gap,(chrome?.bottom||0)-box.top+gap);
  for(const id of ['usCountdownDisplay','usCountdownEntry']){
    const el=document.getElementById(id);
    const rect=el&&!el.hidden?el.getBoundingClientRect():null;
    if(rect?.height)top=Math.max(top,rect.bottom-box.top+gap);
  }
  let bottom=box.height-gap;
  for(const id of ['distanceWidget','usOggiDock']){
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
  for(const id of ['homeHero','usOggiStack','distanceWidget','usOggiDock','usCountdownDisplay']){
    const el=document.getElementById(id);
    if(el)oggiLayoutObserver.observe(el);
  }
}

async function loginAccount(){
  const email=document.getElementById('loginEmail').value.trim();
  const password=document.getElementById('loginPassword').value;
  const s=document.getElementById('loginStatus');
  const btn=document.getElementById('loginBtn');
  if(!email||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){setAuthStatus('loginStatus','Inserisci un indirizzo email valido.','error');return;}
  if(!password){setAuthStatus('loginStatus','Inserisci la password.','error');return;}
  btn.disabled=true;
  setAuthStatus('loginStatus','Accesso…');
  try{
    const {data,error}=await sb.auth.signInWithPassword({email,password});
    if(error) throw error;
    usOnboarding.setup?.markPasswordSignIn?.(data?.user?.id||data?.session?.user?.id||'');
    document.getElementById('loginPassword').value='';
    await initCloud();
  }catch(err){
    const msg=String(err?.message||'invio non riuscito');
    setAuthStatus('loginStatus','Accesso non riuscito: '+msg,'error');
  }finally{
    btn.disabled=false;
  }
}
window.loginAccount=loginAccount;
// The extra Auth UI is compiled but only mounted when the Supabase backend
// is exactly US-STAGING. Production remains login-only, without a signup path.
window.usS31Auth = window.UsPublicAuthS31?.mount({
  auth: sb.auth, endpoint: SB_URL, openStep: showAuthStep
}) || null;

let usIncomingThink=null;
let usThinkOperationId=null;
let usThinkReactionFinal=null;
let usThinkReactionInFlight=false;
let usThinkKnownReactionSignature='';

// 1.0 — what Oggi may put in its one priority card, in this order: something
// that arrived for me (Ti penso, Lasciato per te), the answers ready, where
// the other is waiting for me ("Tocca a te": a game round, a mission to
// confirm), today's mesiversario, and (never shown on Oggi) passive events.
const US_TODAY_PRIORITY_ORDER=Object.freeze({received_ready:1,left_ready:2,answers_ready:3,waiting_for_me:4,celebration:5,couple_context:6});
const US_TODAY_PRIORITY_LABELS=Object.freeze({
  received_ready:'Aspetta te',
  left_ready:'Lasciato per te',
  answers_ready:'Risposte pronte',
  waiting_for_me:'Tocca a te',
  celebration:'Tra voi oggi',
  couple_context:'Tra voi oggi'
});
const US_TODAY_PRIORITY_LIMIT=5;
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
    if(result.length===US_TODAY_PRIORITY_LIMIT)break;
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
  // Oggi keeps only actionable personal notices. Passive calendar/event facts
  // live in Noi/Lavagna after the Home cleanup.
  usTodayPriorityQueue=(Array.isArray(priorities)?priorities:[]).filter(item=>item?.attention).slice();
  renderTodayPriorityItem(usTodayPriorityQueue[0],usTodayPriorityQueue.length);
}
// The partner's name for Oggi copy. Defensive: the Oggi runtime is also
// exercised on its own, without the identity resolver.
function oggiPartnerName(){
  try{return (typeof usIdentity==='function'?usIdentity().partnerName:'')||'La tua persona';}catch(_){return 'La tua persona';}
}
// O6 — a Ti penso is a moment: the card says when it arrived ("2 ore fa") and
// leaves Oggi 24 hours later (the heart keeps its history).
const US_THINK_CARD_TTL_MS=24*60*60*1000;
function thinkTodayPriorityViewModel(now=Date.now()){
  const signal=typeof usIncomingThink!=='undefined'?usIncomingThink:null;
  const finalReaction=typeof usThinkReactionFinal!=='undefined'?usThinkReactionFinal:null;
  if(!signal?.id||finalReaction)return null;
  const at=Date.parse(signal.created_at||'');
  if(Number.isFinite(at)&&now-at>US_THINK_CARD_TTL_MS)return null;
  const ago=Number.isFinite(at)&&typeof relativeSignalAge==='function'?relativeSignalAge(signal.created_at):'';
  const age=ago?ago.charAt(0).toUpperCase()+ago.slice(1):'';
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
    detail:age||'Ha lasciato un segnale per te.',
    recency:Number.isFinite(at)?at:0,
    action:'think',
    actionLabel:'Apri'
  };
}
// L4 — something new in Lasciato per te. The envelope (left-for-you.js) is the
// authority on "is there anything unseen"; Oggi only names who and what, from
// the same unseen rows (oldest first, the one that opens first).
const US_LEFT_KIND_COPY=Object.freeze({text:'un messaggio',photo:'una foto',audio:'un vocale',video:'un video',music:'una canzone'});
const usOggiLeft={items:[]};
function leftTodayPriorityViewModel(items=usOggiLeft.items){
  const list=(Array.isArray(items)?items:[]).filter(item=>item?.id);
  if(!list.length)return null;
  const first=list[0],name=oggiPartnerName();
  const title=list.length>1?`${name} ti ha lasciato ${list.length} cose`:`${name} ti ha lasciato ${US_LEFT_KIND_COPY[first.kind]||'qualcosa'}`;
  const at=Date.parse(first.created_at||'');
  return {
    id:`left:${first.id}`,factKey:`left:${list.map(item=>item.id).join(',')}`,
    arrivalType:'left-for-you',category:'left_ready',attention:true,
    title,detail:'',recency:Number.isFinite(at)?at:0,action:'left',actionLabel:'Apri'
  };
}
// F2 — "Tocca a te": a game round where the other is waiting for me (read
// from the Gioca hub that games.js renders) and, from Friday, a mission the
// other already confirmed.
let usOggiGameTurn=null;
function gameTurnTodayPriorityViewModel(turn=usOggiGameTurn){
  if(!turn?.game)return null;
  const key=turn.session||turn.game;
  return {
    id:`game-turn:${key}`,factKey:`game:${key}`,arrivalType:'game-turn',category:'waiting_for_me',attention:true,
    title:`${oggiPartnerName()} ti aspetta`,detail:turn.game,action:'game',actionLabel:'Gioca',
    session:turn.session||'',perVoi:Boolean(turn.perVoi)
  };
}
function missionTodayPriorityViewModel(mission){
  if(!mission?.id)return null;
  return {
    id:`mission:${mission.id}`,factKey:`mission:${mission.id}`,arrivalType:'mission-confirm',category:'waiting_for_me',attention:true,
    title:'Manca solo la tua conferma',detail:String(mission.title||''),action:'mission',actionLabel:'Apri'
  };
}
// O10 — the mesiversario, on the day. A start on the 29th, 30th or 31st counts
// on the last day of shorter months (same rule as Eventi).
function oggiMonthiversary(startedOn,todayISO){
  const s=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startedOn||'')),t=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(todayISO||''));
  if(!s||!t)return null;
  const [sy,sm,sd]=s.slice(1).map(Number),[ty,tm,td]=t.slice(1).map(Number);
  const months=(ty-sy)*12+(tm-sm);
  if(months<=0)return null;
  const last=new Date(Date.UTC(ty,tm,0)).getUTCDate();
  if(Math.min(sd,last)!==td)return null;
  return {months,years:months%12===0?months/12:0};
}
function celebrationTodayPriorityViewModel(startedOn,todayISO){
  const day=oggiMonthiversary(startedOn,todayISO);
  if(!day)return null;
  const title=day.years
    ?(day.years===1?'Oggi è un anno ♡':`Oggi sono ${day.years} anni ♡`)
    :(day.months===1?'Oggi è un mese ♡':`Oggi sono ${day.months} mesi ♡`);
  return {
    id:`celebration:${todayISO}`,factKey:`celebration:${todayISO}`,arrivalType:'monthiversary',category:'celebration',attention:true,
    title,detail:day.years?'Il vostro anniversario':'Il vostro mesiversario',action:'events',actionLabel:'Apri'
  };
}
function oggiStartedOn(){
  try{return window.UsCoupleContext?.snapshot?.()?.couple?.started_on||null;}catch(_){return null;}
}
function oggiTodayISO(){
  return typeof usDailyQuestionDay==='function'?usDailyQuestionDay():new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome'}).format(new Date());
}
// F2 — a dot on the Oggi tab while the other is waiting for me: the Domanda di
// oggi they already answered, a game round, a mission to confirm (from Friday).
function renderToccaATe({daily=false,game=false,mission=false}={}){
  const tab=document.querySelector?.('.nav button[data-page="home"]');
  if(!tab)return false;
  const on=Boolean(daily||game||mission);
  if(on)tab.setAttribute('data-us-tocca','on');else tab.removeAttribute('data-us-tocca');
  tab.setAttribute('aria-label',on?'Oggi, tocca a te':'Oggi');
  return on;
}
// S12 — Maudit hops once when something arrives for me (Ti penso, Lasciato
// per te) and when the answers of the day are revealed. A blocked or switched
// off Maudit does not hop, and the hop is tried again at the next refresh.
const usOggiPetHops=new Set();
function oggiPetHop(reason,key){
  if(!key||usOggiPetHops.has(key))return false;
  let hopped=false;
  try{hopped=Boolean(window.USPet?.react?.(reason));}catch(_){hopped=false;}
  if(hopped)usOggiPetHops.add(key);
  return hopped;
}
// ===== M9B — Domanda di oggi: il rituale quotidiano su Oggi =====
// Legge SOLO lo stato canonico di get_daily_state (window.todayState via
// hydrateToday): nessuna copia locale delle risposte, nessun reveal anticipato.
// La card apre il foglio esistente (openToday) dove sei, senza cambiare tab.
function dailyRitualPartnerName(){
  return usIdentity().partnerName;
}
function dailyRitualViewModel(source){
  // O1 (1.0) — the card stays on Oggi until BOTH answered: "Aspetta te" when
  // the other already answered, a quiet waiting state after my answer. Its
  // attention is personal: on only while MY answer is missing. Never the
  // answer text: that lives in the sheet, after the reveal. (Mockup look:
  // the two circles tell each state.)
  const kicker='La domanda di oggi';
  // M9E: errore reale del backend → stato onesto con Riprova (apre il foglio,
  // che ritenta get_or_create_daily_question). Mai una domanda inventata.
  if(source?.status==='error')return {questionId:null,question:'La domanda di oggi non è arrivata.',state:'error',kicker,meta:'',glyph:'none',cta:'Riprova',attention:false};
  const question=source?.question,state=source?.state;
  if(!question?.id||!question.question||!state)return null;
  const partner=source.partnerName||oggiPartnerName();
  const base={questionId:question.id,question:String(question.question),kicker};
  if(state.my_answer==null){
    if(state.partner_has_answer)return {...base,kicker:'Aspetta te',state:'invited',meta:`${partner} ha già risposto · tocca a te`,glyph:'partner',cta:'Rispondi',attention:true};
    return {...base,state:'answer',meta:'Una domanda, due risposte',glyph:'none',cta:'Rispondi',attention:true};
  }
  if(!state.both_answered)return {...base,state:'waiting',meta:`Hai risposto · aspettiamo ${partner}`,glyph:'mine',cta:'Apri',attention:false};
  // Both answered: while "Risposte pronte" waits in the priority card, that
  // card speaks for the day (never two cards for one fact). Once seen or
  // hidden, the card offers to read them again until tomorrow.
  const access=dailyRevealAccess(source);
  if(!access||access.unread)return null;
  const felt=typeof dailyPartnerReactionLine==='function'?dailyPartnerReactionLine(source.reveal,partner):'';
  return {...base,state:'revealed',meta:felt||'Svelate · domani una nuova domanda',glyph:'noi',cta:'Rivedi',attention:false};
}
// The two circles of the mockup (Oggi card): theirs on the right, mine on the
// left, dashed until I answer and filled from below when I do; together they
// become one circle of Noi with a heart (Phosphor heart-straight-fill, its own path).
const US_DAILY_RING_STATE=Object.freeze({answer:'vuoto',invited:'tocca',waiting:'attesa',ready:'pronte',revealed:'svelate',error:'vuoto'});
function dailyRitualRingMarkup(model){
  const st=US_DAILY_RING_STATE[model.state]||'vuoto';
  return `<svg class="ring us-daily-ritual-ring" viewBox="0 0 48 30" data-st="${st}" data-glyph="${escapeHtml(model.glyph||'none')}" data-us-attention-icon aria-hidden="true" focusable="false"><defs><clipPath id="usDailyRingMe"><circle cx="17" cy="15" r="11"/></clipPath></defs><circle class="r-bloom" cx="24" cy="15" r="13" fill="none" stroke-width="1.5"/><g class="r-you"><circle class="r-you-full" cx="31" cy="15" r="11"/><circle class="r-you-wait" cx="31" cy="15" r="10.2" stroke-width="1.6" stroke-dasharray="3 2.6"/></g><g class="r-me"><circle class="r-me-ring" cx="17" cy="15" r="10.2" stroke-width="1.6" stroke-dasharray="3 2.6"/><g clip-path="url(#usDailyRingMe)"><rect class="r-fill" x="4" y="2" width="26" height="26"/></g></g><g class="r-noi"><circle cx="24" cy="15" r="13"/><path transform="translate(18.4 10.3) scale(.044)" d="M240,98a57.63,57.63,0,0,1-17,41L133.7,229.62a8,8,0,0,1-11.4,0L33,139a58,58,0,0,1,82-82.1L128,69.05l13.09-12.19A58,58,0,0,1,240,98Z"/></g></svg>`;
}
// Mockup motion (oggi.js setDQ after "Invia"): my circle fills from below,
// the two circles meet, one circle of Noi blooms and the card breathes once.
// Only when I just answered, on Oggi, with motion allowed.
const US_DAILY_EASE={out:'cubic-bezier(.2,.8,.2,1)',io:'cubic-bezier(.7,0,.2,1)'};
function dailyRitualReducedMotion(){
  try{return Boolean(window.UsUiFoundation?.isReducedMotion?.())||Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);}catch(_){return false;}
}
async function playDailyRitualAnswered(card,merge){
  const ring=card?.querySelector?.('.ring');
  if(!ring||typeof ring.animate!=='function')return false;
  const me=ring.querySelector('.r-me'),you=ring.querySelector('.r-you'),fill=ring.querySelector('.r-fill'),noi=ring.querySelector('.r-noi'),bloom=ring.querySelector('.r-bloom');
  const final=ring.dataset.st;
  // Start from "tocca": my circle still empty, the two apart.
  ring.dataset.st=merge?'tocca':'vuoto';
  // The sheet goes away first, then the circles move (one thing at a time).
  const sheet=document.getElementById('today');
  for(let waited=0;sheet?.classList.contains('open')&&waited<900;waited+=50)await new Promise(r=>setTimeout(r,50));
  if(!card.isConnected||card.querySelector('.ring')!==ring)return false;
  try{
    await fill.animate([{transform:'translateY(26px)'},{transform:'translateY(0)'}],{duration:560,easing:US_DAILY_EASE.out,fill:'forwards'}).finished;
    if(merge){
      await Promise.all([
        me.animate([{transform:'translateX(0)'},{transform:'translateX(7px)'}],{duration:420,easing:US_DAILY_EASE.io,fill:'forwards'}).finished,
        you.animate([{transform:'translateX(0)'},{transform:'translateX(-7px)'}],{duration:420,easing:US_DAILY_EASE.io,fill:'forwards'}).finished
      ]);
    }
  }catch(_){/* cancelled by a newer render */}
  if(!card.isConnected||card.querySelector('.ring')!==ring){return false;}
  ring.dataset.st=final;
  if(merge){
    noi.animate([{opacity:0,transform:'scale(.7)'},{opacity:1,transform:'scale(1.12)',offset:.6},{opacity:1,transform:'scale(1)'}],{duration:520,easing:'ease-out'});
    bloom.animate([{opacity:.9,transform:'scale(1)'},{opacity:0,transform:'scale(2.2)'}],{duration:800,easing:US_DAILY_EASE.out});
    card.animate([{scale:1},{scale:1.02,offset:.4},{scale:1}],{duration:500,easing:'ease-out'});
  }
  [me,you,fill].forEach(el=>el.getAnimations?.().forEach(a=>a.cancel()));
  return true;
}
let usDailyRitualAnswerPending=false;
function renderDailyRitual(model){
  const card=document.getElementById('usDailyRitual');
  if(!card)return;
  const before=card.dataset.state||'';
  if(!model){card.hidden=true;card.innerHTML='';card.usDailyHtml='';card.removeAttribute('data-state');card.dataset.usAttention='off';return;}
  card.dataset.state=model.state;
  card.dataset.usAttention=model.attention?'on':'off';
  // The visible words are the accessible name (and the English translation).
  card.removeAttribute('aria-label');
  const html=`${dailyRitualRingMarkup(model)}<span class="eyebrow us-daily-ritual-kicker">${escapeHtml(model.kicker)}</span><span class="dq-q us-daily-ritual-question">${escapeHtml(model.question)}</span><span class="dq-foot">${model.meta?`<span class="dq-sub us-daily-ritual-meta">${escapeHtml(model.meta)}</span>`:''}<span class="btn-primary us-daily-ritual-cta">${escapeHtml(model.cta)}<span class="us-daily-ritual-arrow" aria-hidden="true"></span></span></span>`;
  // Same words, same circles: leave the card (and a running animation) alone.
  if(card.hidden||card.usDailyHtml!==html){card.innerHTML=html;card.usDailyHtml=html;}
  card.hidden=false;
  // I just sent my answer: the circles tell it (mockup), once.
  const answered=usDailyRitualAnswerPending&&before==='answer'&&model.state==='waiting';
  if(answered){
    usDailyRitualAnswerPending=false;
    const onOggi=document.getElementById('home')?.classList?.contains?.('active');
    if(onOggi&&!dailyRitualReducedMotion())playDailyRitualAnswered(card,false);
  }
}
window.UsDailyRitual=Object.freeze({viewModel:dailyRitualViewModel,render:renderDailyRitual});
async function refreshTodayPriorities({daily,freshEvents=false}={}){
  const refreshId=++usTodayPriorityRefreshId;
  const dailySource=daily===undefined&&window.todayQuestion?{
    question:window.todayQuestion,
    state:window.todayState,
    reveal:window.todayRevealMeta,
    partnerName:oggiPartnerName()
  }:daily;
  const candidates=[];
  const thinkPriority=thinkTodayPriorityViewModel();
  if(thinkPriority)candidates.push(thinkPriority);
  const leftPriority=leftTodayPriorityViewModel();
  if(leftPriority)candidates.push(leftPriority);
  // M9B: la Domanda di oggi ha la sua card su Oggi (renderDailyRitual):
  // non entra nella coda priority, così non compare due volte.
  renderDailyRitual(dailyRitualViewModel(dailySource));
  // M10.2 — "Risposte pronte": piccolo avviso personale, mai la card Daily.
  const revealNotice=dailyTodayPriorityViewModel(dailySource);
  if(revealNotice)candidates.push(revealNotice);
  const gameTurn=gameTurnTodayPriorityViewModel();
  if(gameTurn)candidates.push(gameTurn);
  const celebration=celebrationTodayPriorityViewModel(oggiStartedOn(),oggiTodayISO());
  if(celebration)candidates.push(celebration);
  let mission=null;
  try{
    const eventSource=await window.getTodayEventPrioritySource?.({fresh:freshEvents});
    const eventPriority=eventTodayPriorityViewModel(eventSource);
    if(eventPriority)candidates.push(eventPriority);
    // The next event's row above the Daily card (mockup og-next).
    if(refreshId===usTodayPriorityRefreshId&&typeof renderOggiNext==='function')renderOggiNext(oggiNextEventViewModel(eventSource));
  }catch(error){console.warn('[US Oggi] Events priority',error);}
  try{mission=missionTodayPriorityViewModel(await window.oggiMissionToConfirm?.());}catch(_){mission=null;}
  if(mission)candidates.push(mission);
  if(refreshId!==usTodayPriorityRefreshId)return [];
  const priorities=composeTodayPriorities(candidates);
  renderTodayPriorities(priorities);
  if(thinkPriority)oggiPetHop('think',thinkPriority.factKey);
  if(leftPriority)oggiPetHop('left-for-you',leftPriority.factKey);
  if(revealNotice)oggiPetHop('daily-question',revealNotice.factKey);
  // Un solo ingresso: il link passivo compare solo quando l'avviso non è in coda.
  renderDailyRevealLink(priorities.some(item=>item.category==='answers_ready')?null:dailyRevealLinkViewModel(dailySource));
  const dailyState=dailySource?.state;
  renderToccaATe({daily:Boolean(dailyState&&dailyState.my_answer==null&&dailyState.partner_has_answer),game:Boolean(gameTurn),mission:Boolean(mission)});
  window.UsDailyQuestionHub?.paint?.();
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
  if(action==='left')window.openLeftForYou?.();
  if(action==='game'){
    // The round itself lives in Gioca: open the hub, then that round.
    window.openQuizHub?.({nav:true});
    if(current?.session)window.USGameV2?.openSession?.(current.session);
    else if(current?.perVoi)window.USGameV2?.openPerVoi?.();
  }
  if(action==='mission')window.openOggiMission?.();
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

// ===== M12A → 1.0 — Oggi arbitration =====
// The photo stays the dominant surface. Above the nav (#usOggiDock) Oggi shows
// AT MOST ONE evidence card and the Domanda di oggi card. The choice is
// deterministic (slot, then rank, then id); surfaces that lose are only
// suppressed (display), never destroyed, so they return the moment the
// winner is resolved. Distance is a tiny ambient capsule and does not count.
//
//   EVIDENCE (one at a time)                       DAILY
//   10 Ti penso received                           the Domanda di oggi, until
//   15 Lasciato per te                             both answered (O1), then
//   20 "Risposte pronte" (reveal ready)            "Rivedi" until tomorrow
//   30 Tocca a te (game round, mission)
//   35 Mesiversario / anniversario
//   90 notifications invite, until enabled (O5)
//
// The legacy calendar widget and reveal link stay mounted in the hidden
// stack: they never take a slot.
const US_OGGI_PRIMARY_RANK=Object.freeze({received_ready:10,left_ready:15,answers_ready:20,waiting_for_me:30,celebration:35});
const US_OGGI_PUSH_RANK=90;
function arbitrateOggi(candidates=[]){
  const best={evidence:null,daily:null};
  for(const item of Array.isArray(candidates)?candidates:[]){
    if(!item||!item.id||!(item.slot in best))continue;
    const current=best[item.slot];
    const rank=Number(item.rank);
    if(!Number.isFinite(rank))continue;
    if(!current||rank<current.rank||(rank===current.rank&&String(item.id)<String(current.id)))best[item.slot]={id:String(item.id),rank};
  }
  return {evidence:best.evidence?.id||null,daily:best.daily?.id||null};
}
const US_OGGI_SURFACES=Object.freeze(['usTodayPriorityRegion','usDailyRitual','pushOptInCard','usOggiCalendarWidget','usDailyRevealLink']);
function collectOggiCandidates(){
  const live=id=>{const el=document.getElementById(id);return el&&!el.hidden?el:null;};
  const candidates=[];
  if(live('usTodayPriorityRegion')){
    const head=usTodayPriorityQueue[0];
    candidates.push({id:'usTodayPriorityRegion',slot:'evidence',rank:US_OGGI_PRIMARY_RANK[head?.category]||US_OGGI_PUSH_RANK-1});
  }
  if(live('pushOptInCard'))candidates.push({id:'pushOptInCard',slot:'evidence',rank:US_OGGI_PUSH_RANK});
  if(live('usDailyRitual'))candidates.push({id:'usDailyRitual',slot:'daily',rank:0});
  return candidates;
}
function applyOggiArbitration(){
  const winner=arbitrateOggi(collectOggiCandidates());
  for(const id of US_OGGI_SURFACES){
    const el=document.getElementById(id);
    if(!el)continue;
    if(el.hidden){el.removeAttribute('data-us-oggi-slot');continue;}
    el.setAttribute('data-us-oggi-slot',winner.evidence===id?'evidence':winner.daily===id?'daily':'suppressed');
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
let usTodayPreviousOverflow=null;
function openToday(){
  const root=document.getElementById('today');
  if(!root)return;
  window.UsUiFoundation?.cancelSurfaceExit?.(root);
  if(usTodayPreviousOverflow===null)usTodayPreviousOverflow=document.body.style.overflow;
  root.classList.add('open');
  root.scrollTop=0;
  const panel=root.querySelector('[data-us-modal-panel]');if(panel)panel.scrollTop=0;
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
    document.body.style.overflow=usTodayPreviousOverflow??'';
    usTodayPreviousOverflow=null;
  };
  if(window.UsUiFoundation?.exitSurface)window.UsUiFoundation.exitSurface(root,finalize);else finalize();
}
window.closeToday=closeToday;

// ===== 1.0 — La domanda di oggi in Gioca (was home-cleanup.js) =====
// Same question, same sheet: the Gioca card opens it where you are, like the
// Oggi card. It only reads the canonical state hydrateToday already loaded.
function dailyHubModel(){
  const question=window.todayQuestion,state=window.todayState;
  if(!question?.id||!question.question||!state)return null;
  const partner=oggiPartnerName(),base={questionId:question.id,question:String(question.question)};
  if(state.both_answered){
    const seen=Boolean(window.todayRevealMeta?.my_reveal_seen_at);
    return {...base,state:'reveal',meta:seen?'Risposte viste · puoi rileggerle':'Le vostre risposte sono pronte',cta:seen?'Rivedi':'Scopri'};
  }
  if(state.my_answer!=null)return {...base,state:'waiting',meta:`Hai risposto · aspettiamo ${partner}`,cta:'Apri'};
  if(state.partner_has_answer)return {...base,state:'answer',meta:`${partner} ha già risposto · tocca a te`,cta:'Rispondi'};
  return {...base,state:'answer',meta:'Una domanda per voi oggi',cta:'Rispondi'};
}
function dailyHubMarkup(model){
  if(!model)return '<div class="us-gv4-daily-pending" role="status"><span class="us-gv4-daily-pending-title">La domanda di oggi</span><small>La domanda di oggi non è ancora disponibile.</small></div>';
  // Never the hidden answers here: question, state and the way in.
  return `<button type="button" class="us-gv2-daily" data-us-daily-entry data-daily-state="${escapeHtml(model.state)}">
   <span class="us-gv4-daily-art" aria-hidden="true"><span class="us-gv4-art-ring"></span><span class="us-gv4-art-heart"></span></span>
   <span class="us-gv2-daily-copy"><small>LA DOMANDA DI OGGI</small><b>${escapeHtml(model.question)}</b><span class="us-gv2-daily-state">${escapeHtml(model.meta)}</span></span>
   <span class="us-gv4-daily-footer"><span>Una domanda, due risposte</span><span class="us-gv2-daily-cta">${escapeHtml(model.cta)} <span aria-hidden="true">›</span></span></span>
  </button>`;
}
function paintDailyInGioca(){
  const hub=document.getElementById('quizHub');
  if(!hub||hub.classList.contains('hidden'))return;
  const slot=hub.querySelector('.us-gv2-daily-slot');
  if(!slot)return;
  const model=dailyHubModel();
  const signature=model?`${model.questionId}:${model.state}:${model.cta}:${model.meta}`:'unavailable';
  if(slot.dataset.usDailySignature===signature)return;
  slot.dataset.usDailySignature=signature;
  slot.innerHTML=dailyHubMarkup(model);
}
// F2 — Gioca has no turn API: Oggi reads "Tocca a te" from the hub games.js
// just rendered (a round where the other is waiting, or Per voi pending).
let usOggiGameTurnTimer=0;
function readGameTurnFromHub(){
  const hub=document.getElementById('quizHub');
  if(!hub||hub.classList.contains('hidden'))return;
  const row=hub.querySelector('.us-gv2-continue .us-gv2-row[data-tone="turn"][data-gv2-session]');
  const perVoi=hub.querySelector('[data-gv2-action="per-voi"][data-gv2-state="pending"]');
  const next=row?{game:row.querySelector('b')?.textContent?.trim()||'Gioca',session:row.dataset.gv2Session}:perVoi?{game:'Per voi',perVoi:true}:null;
  const key=turn=>turn?`${turn.session||''}:${turn.game}:${turn.perVoi?1:0}`:'';
  if(key(next)===key(usOggiGameTurn))return;
  usOggiGameTurn=next;
  clearTimeout(usOggiGameTurnTimer);
  usOggiGameTurnTimer=setTimeout(()=>{if(window.usProfile)refreshTodayPriorities();},120);
}
function paintDailyCardAndTurn(){paintDailyInGioca();readGameTurnFromHub();}
document.getElementById('quizHub')?.addEventListener('click',event=>{
  if(!event.target.closest?.('[data-us-daily-entry]'))return;
  event.preventDefault();
  openToday();
});
window.addEventListener('us-identity-change',()=>paintDailyInGioca());
window.UsDailyQuestionHub=Object.freeze({model:dailyHubModel,paint:paintDailyInGioca,paintCard:paintDailyCardAndTurn,open:openToday});

// L4 — who left what in Lasciato per te. left-for-you.js owns the envelope and
// its unseen count; Oggi follows the envelope and reads only the unseen rows
// (oldest first: the one that opens first) to name the kind.
let usOggiLeftTimer=0,usOggiLeftSeq=0;
async function loadOggiLeftItems(){
  const seq=++usOggiLeftSeq,me=window.usProfile;
  const envelope=document.getElementById('leftForYouPartnerEntry');
  const before=usOggiLeft.items.map(item=>item.id).join(',');
  if(!me?.id||!envelope?.classList.contains('is-closed')){usOggiLeft.items=[];}
  else{
    try{
      const {data,error}=await sb.from('left_for_you').select('id,kind,created_at').eq('recipient_id',me.id).is('seen_at',null).order('created_at',{ascending:true}).limit(20);
      if(error)throw error;
      if(seq!==usOggiLeftSeq||window.usProfile?.id!==me.id)return;
      usOggiLeft.items=(data||[]).filter(item=>item?.id);
    }catch(error){console.warn('[US Oggi] Lasciato per te',error);return;}
  }
  if(before!==usOggiLeft.items.map(item=>item.id).join(','))refreshTodayPriorities();
}
(()=>{
  const envelope=document.getElementById('leftForYouPartnerEntry');
  if(!envelope||typeof MutationObserver!=='function')return;
  new MutationObserver(()=>{
    clearTimeout(usOggiLeftTimer);
    usOggiLeftTimer=setTimeout(()=>{loadOggiLeftItems();},250);
  }).observe(envelope,{attributes:true,attributeFilter:['class','aria-label','data-us-attention']});
})();

// F2/N5 — from Friday (Rome), a mission the other already confirmed and I did
// not: "Manca solo la tua conferma" on Oggi. Read-only, cached for a minute.
function oggiRomeWeekday(at=new Date()){
  try{return new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',weekday:'short'}).format(at);}catch(_){return '';}
}
const usOggiMission={key:'',at:0,item:null,loading:null};
async function oggiMissionToConfirm(){
  const me=window.usProfile;
  if(!me?.id||!me.couple_id||typeof sb==='undefined'||typeof weekStartISO!=='function')return null;
  if(!['Fri','Sat','Sun'].includes(oggiRomeWeekday()))return null;
  const week=weekStartISO(),key=`${me.id}:${me.couple_id}:${week}`;
  if(usOggiMission.key===key&&Date.now()-usOggiMission.at<60000)return usOggiMission.item;
  if(usOggiMission.key===key&&usOggiMission.loading)return usOggiMission.loading;
  if(usOggiMission.key!==key){usOggiMission.key=key;usOggiMission.item=null;usOggiMission.at=0;}
  const task=(async()=>{
    try{
      const {data,error}=await sb.from('bond_weekly_quests').select('id,title,confirmed_by,completed_at').eq('couple_id',me.couple_id).eq('week_start',week).order('slot');
      if(error)throw error;
      const item=(data||[]).find(row=>{
        const confirmed=(Array.isArray(row?.confirmed_by)?row.confirmed_by:[]).map(String);
        return !row.completed_at&&confirmed.length>0&&!confirmed.includes(String(me.id));
      })||null;
      if(usOggiMission.key===key){usOggiMission.item=item?{id:item.id,title:item.title}:null;usOggiMission.at=Date.now();}
    }catch(error){console.warn('[US Oggi] Missioni',error);}
    return usOggiMission.key===key?usOggiMission.item:null;
  })();
  usOggiMission.loading=task;
  try{return await task;}finally{if(usOggiMission.loading===task)usOggiMission.loading=null;}
}
window.oggiMissionToConfirm=oggiMissionToConfirm;
// The Oggi card opens Missioni in Noi.
function openOggiMission(){
  go('bond',{nav:true});
  openNoiSection('quest');
}
window.openOggiMission=openOggiMission;

function thinkReactionLabel(reaction){return ({heart:'con un cuore',hug:'con un abbraccio',miss_you:'con un pensiero'})[reaction]||reaction||'';}
function renderThinkReactionUi(){
  const root=document.getElementById('thinkArrival');
  if(!root)return;
  const title=document.getElementById('thinkArrivalTitle');
  const copy=document.getElementById('thinkArrivalCopy');
  const status=document.getElementById('thinkArrivalStatus');
  const buttons=root.querySelectorAll('[data-think-reaction]');
  const partner=partnerFromProfiles(window.usBondProfiles||[]);
  // Momento: the name on one line, "ti pensa" in italic in their colour (same words).
  if(title)title.innerHTML=`<span class="think-arrival-name"${partner?.display_name?' translate="no"':''}>${escapeHtml(partner?.display_name||'La tua persona')}</span> <em>ti pensa</em>`;
  // Mockup: when it arrived, in plain words ("adesso", "5 min fa").
  if(copy){const at=usIncomingThink?.created_at;const fresh=at&&Date.now()-Date.parse(at)<60000;copy.textContent=at?(fresh?'adesso':relativeSignalAge(at)):'';copy.hidden=!copy.textContent;}
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
    toast('Reazione inviata',{icon:'check',quiet:false});
    setTimeout(()=>closeThinkArrival(),1300);
    return true;
  }
  usThinkReactionInFlight=false;renderThinkReactionUi();return false;
}
window.sendThinkReaction=sendThinkReaction;
document.getElementById('thinkArrival')?.addEventListener('click',event=>{
  const reaction=event.target.closest?.('[data-think-reaction]')?.dataset.thinkReaction;
  if(reaction)sendThinkReaction(reaction);
});

// M12B.4 — Conserva: dopo il reveal, uno dei due può conservare lo scambio
// della domanda nei Ricordi. Il server decide (keep_daily_question: reveal di
// get_daily_state, una sola copia per coppia e domanda, snapshot lato server);
// qui solo lo stato del bottone. Lo stato "già conservata" si rilegge dalla
// tabella (RLS: stessa coppia) a ogni apertura, mai da una copia locale.
function dailyKeepsakeRuntime(){
  let state={questionId:null,status:'hidden'};
  let generation=0;
  const identity=()=>`${window.usProfile?.id}:${window.usProfile?.couple_id}`;
  const unavailable=(error)=>['42P01','PGRST205','PGRST202','42883'].includes(error?.code)||/daily_question_keepsake|keep_daily_question/.test(String(error?.message||''))&&/does not exist|could not find|schema cache/i.test(String(error?.message||''));
  const active=()=>Boolean(state.owner===identity()&&state.questionId&&state.questionId===window.todayQuestion?.id&&window.todayState?.both_answered);
  // Mockup #sheetReveal: Conserva (sparkle) → Conservo… → ✓ Conservato nei
  // Ricordi, with one line under it that says where it goes.
  const note='<p class="today-keep-note">Conservata, la domanda di oggi resta nei vostri Ricordi.</p>';
  let fresh=false;
  const view=()=>{
    if(state.status==='kept'){const html=`<p class="today-keep-done${fresh?' is-fresh':''}" role="status"><span class="us-icon" data-us-icon="check" aria-hidden="true"></span>Conservato nei Ricordi</p>${note}`;fresh=false;return html;}
    const saving=state.status==='saving',failed=state.status==='error';
    return `<button type="button" class="today-keep-button" data-us-daily-keep ${saving?'disabled aria-busy="true"':''}>${saving?'Conservo…':failed?'Riprova':'Conserva'}</button>${failed?'<p class="today-keep-status" role="status">Non conservata. Riprova quando torni online.</p>':note}`;
  };
  const render=()=>{
    const root=document.getElementById('todayKeep');
    if(!root)return;
    const show=active()&&['idle','saving','error','kept'].includes(state.status);
    root.hidden=!show;
    root.innerHTML=show?view():'';
  };
  const hide=()=>{generation++;state={questionId:null,status:'hidden'};render();};
  const load=async(questionId)=>{
    if(active()&&state.questionId===questionId&&state.status==='saving')return state;
    const owner=identity(),seq=++generation;
    const current=()=>seq===generation&&owner===identity()&&state.questionId===questionId;
    state={questionId,owner,status:'loading'};render();
    try{
      const {data,error}=await sb.from('daily_question_keepsakes').select('id,kept_at,kept_by_role').eq('question_id',questionId).limit(1);
      if(!current())return state;
      if(error)throw error;
      state={questionId,owner,status:Array.isArray(data)&&data.length?'kept':'idle'};
    }catch(error){
      if(!current())return state;
      console.warn('[US Today] Conserva stato',error);
      // Senza backend Conserva (migration non applicata) niente bottone; un
      // errore di rete lascia Conserva: la RPC è idempotente e risponde 'existing'.
      state={questionId,owner,status:unavailable(error)?'hidden':'idle'};
    }
    render();return state;
  };
  const keep=async()=>{
    const questionId=state.questionId;
    if(!active()||state.status==='saving'||state.status==='kept')return {status:'noop'};
    const owner=identity(),seq=++generation;
    const current=()=>seq===generation&&owner===identity()&&state.questionId===questionId;
    state={questionId,owner,status:'saving'};render();
    try{
      const {data,error}=await sb.rpc('keep_daily_question',{target_question_id:questionId});
      if(error)throw error;
      if(!['kept','existing'].includes(data?.status)||data.question_id!==questionId)throw new Error('daily_keepsake_invalid');
      if(!current())return {status:'stale'};
      fresh=true;state={questionId,owner,status:'kept'};render();
      if(data.status==='kept')toast('Conservato nei Ricordi',{icon:'sparkle',quiet:false});
      if(document.getElementById('momentsGrid')?.dataset.loaded==='1')Promise.resolve(window.hydrateMoments?.()).catch(()=>{});
      return data;
    }catch(error){
      console.warn('[US Today] Conserva',error);
      if(!current())return {status:'stale'};
      state={questionId,owner,status:/daily_question_reveal_not_ready/.test(String(error?.message||''))||unavailable(error)?'hidden':'error'};render();
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
function renderTodaySyncError(failed){
  const status=document.getElementById('todaySyncStatus'),retry=document.getElementById('todayRetryBtn');
  if(status){status.hidden=!failed;status.textContent=failed?'Non riesco ad aggiornare ora. Riprova quando torni online.':'';}
  if(retry)retry.hidden=!failed;
}
// Stati senza domanda valida: 'loading' (in arrivo) o 'error' (backend/rete).
// In entrambi niente textarea né invio: solo, in errore, un Riprova onesto.
function renderTodayQuestionUnavailable(status){
  const qel=document.querySelector('#today .qtext');
  const locked=document.getElementById('locked'), reveal=document.getElementById('todayReveal'), btn=document.getElementById('todaySaveBtn');
  const answerEl=document.getElementById('answer');
  const failed=status==='error';
  window.todayQuestion=null; window.todayState=null; window.todayRevealMeta=null;
  renderTodaySyncError(false);
  window.UsDailyKeepsake?.hide?.();
  if(qel)qel.textContent=failed?'Non riesco a caricare la domanda di oggi.':'Un attimo…';
  if(locked){locked.hidden=false;locked.textContent=failed?'Controlla la connessione e riprova.':'Un attimo, arriva subito.';}
  if(reveal){reveal.classList.add('hidden');reveal.innerHTML='';}
  if(answerEl){if(!failed)answerEl.value='';answerEl.disabled=true;answerEl.hidden=true;}
  if(btn){
    btn.dataset.usTodayMode=failed?'retry':'loading';
    btn.hidden=!failed; btn.disabled=!failed; btn.textContent=failed?'Riprova':'Un attimo…';
  }
}
// M10.2 — reveal Daily: risposte da get_daily_state (invariata), stato PERSONALE
// (ricevuta, avviso nascosto, reazione) da get_daily_reveal_meta. Il server è
// l'unica autorità: nessuna copia locale, nessuno stato ottimistico che resti.
async function loadDailyRevealMeta(questionId){
  try{
    const {data,error}=await sb.rpc('get_daily_reveal_meta',{target_question_id:questionId});
    if(error||!data||data.question_id!==questionId)throw error||new Error('daily_reveal_meta_invalid');
    return data;
  }catch(error){console.warn('[US Today] Reveal meta',error);return null;}
}
function dailyRevealPartnerLabel(){return usIdentity().partnerName;}
// Reveal: the two real answers. O2 (1.0) — one tap on the other's answer,
// only ♥ or "mi hai commosso" (never "arrabbiato"); under my answer, what the
// other felt. Receipt/notice and keepsake authorities stay untouched.
const US_DAILY_REACTIONS=Object.freeze({
  heart:{label:'Metti un cuore alla risposta'},
  cry:{label:'Mi hai commosso'}
});
// What the other felt about my answer (also the Oggi card's line). Never "angry".
function dailyPartnerReactionLine(meta,partner){
  if(meta?.partner_reaction==='heart')return `${partner} ha messo ♥ alla tua risposta`;
  if(meta?.partner_reaction==='cry')return `${partner}: mi hai commosso`;
  return '';
}
function renderTodayReveal(){
  const reveal=document.getElementById('todayReveal'),state=window.todayState;
  if(!reveal||!state?.both_answered)return;
  const partner=dailyRevealPartnerLabel(),meta=window.todayRevealMeta;
  const mine=US_DAILY_REACTIONS[meta?.my_reaction]?meta.my_reaction:null;
  const felt=dailyPartnerReactionLine(meta,partner);
  const note=felt?`<p class="today-reaction-note" data-us-daily-partner-reaction="${escapeHtml(meta.partner_reaction)}">${escapeHtml(felt)}</p>`:'';
  // Without the personal meta (offline) there is nothing to react on.
  const controls=meta?`<div class="today-reactions" role="group" aria-label="La tua reazione"><button type="button" class="today-reaction" data-daily-reaction="heart" aria-label="${escapeHtml(US_DAILY_REACTIONS.heart.label)}" aria-pressed="${mine==='heart'}"><span class="us-icon" data-us-icon="${mine==='heart'?'heart-fill':'heart'}" aria-hidden="true"></span></button><button type="button" class="today-reaction today-reaction--words" data-daily-reaction="cry" aria-pressed="${mine==='cry'}">${escapeHtml(US_DAILY_REACTIONS.cry.label)}</button></div>`:'';
  reveal.className='today-reveal today-reveal--simple';
  reveal.innerHTML='<div class="today-answer" data-us-daily-answer="mine"><b>Tu</b><p translate="no">'+escapeHtml(state.my_answer||'')+'</p>'+note+'</div>'+
    '<div class="today-answer" data-us-daily-answer="partner"><b translate="no">'+escapeHtml(partner)+'</b><p translate="no">'+escapeHtml(state.partner_answer||'')+'</p>'+controls+'</div>';
}
// One tap = my reaction; the same tap again takes it back. The server
// (set_daily_answer_reaction) decides; on error everything goes back.
let usDailyReactionInFlight=false;
async function setDailyAnswerReaction(reaction){
  const questionId=window.todayQuestion?.id,meta=window.todayRevealMeta;
  if(!questionId||!meta||meta.question_id!==questionId||!window.todayState?.both_answered||usDailyReactionInFlight)return {status:'noop'};
  if(!US_DAILY_REACTIONS[reaction])return {status:'noop'};
  const previous=meta,next=meta.my_reaction===reaction?null:reaction;
  usDailyReactionInFlight=true;
  window.todayRevealMeta={...meta,my_reaction:next};renderTodayReveal();
  try{
    const {data,error}=await sb.rpc('set_daily_answer_reaction',{target_question_id:questionId,target_reaction:next});
    if(error||!data||data.question_id!==questionId)throw error||new Error('daily_reaction_invalid');
    if(window.todayQuestion?.id===questionId)window.todayRevealMeta=data;
    renderTodayReveal();
    // O2: the other phone hears about a ♥ or "mi hai commosso" (the server reads it back).
    if(next)sendWebPushEvent('daily_reaction',questionId);
    return {status:'saved'};
  }catch(error){
    console.warn('[US Today] Reazione',error);
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

// "Visto" = il reveal è davvero mostrato in un foglio Today aperto: non il push,
// non l'hydrate della Home, non il solo both_answered.
let usDailyRevealSeenInFlight=null;
async function markDailyRevealSeenIfVisible(questionId,seq){
  const viewerId=window.usProfile?.id,coupleId=window.usProfile?.couple_id;
  const meta=window.todayRevealMeta;
  const open=document.getElementById('today')?.classList.contains('open');
  if(!open||!meta||meta.question_id!==questionId||meta.my_reveal_seen_at||usDailyRevealSeenInFlight===questionId)return;
  usDailyRevealSeenInFlight=questionId;
  try{
    const {data,error}=await sb.rpc('mark_daily_reveal_seen',{target_question_id:questionId});
    if(error||!data||data.question_id!==questionId)throw error||new Error('daily_reveal_seen_invalid');
    if(seq===usTodayHydrateSeq&&window.usProfile?.id===viewerId&&window.usProfile?.couple_id===coupleId&&window.todayQuestion?.id===questionId)window.todayRevealMeta=data;
  }catch(error){
    // Il reveal resta leggibile e la meta canonica resta invariata: l'avviso
    // rimane su Oggi, quindi basta riaprirlo per riprovare.
    console.warn('[US Today] Reveal seen non salvato',error);
  }finally{usDailyRevealSeenInFlight=null;}
}
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
let usTodayAnswerSave=null;
function todayAnswerIsSaving(){
  return Boolean(usTodayAnswerSave&&usTodayAnswerSave.viewerId===window.usProfile?.id&&usTodayAnswerSave.coupleId===window.usProfile?.couple_id&&usTodayAnswerSave.questionId===window.todayQuestion?.id);
}
async function hydrateToday(){
  if(!window.usProfile){window.UsTodayPriority?.render?.([]);return;}
  const viewer=window.usProfile;
  const seq=++usTodayHydrateSeq;
  const current=()=>seq===usTodayHydrateSeq&&window.usProfile?.id===viewer.id&&window.usProfile?.couple_id===viewer.couple_id;
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
  if(!current())return;
  if(qError){
    console.warn('[US Today] Daily question',qError);
    // Un errore transitorio non cancella la domanda già valida di oggi.
    if(keepPrevious){renderTodaySyncError(true);return;}
    renderTodayQuestionUnavailable('error');
    updateHomeStatus();
    window.UsTodayPriority?.refresh?.({daily:{status:'error'}});
    return;
  }
  const qel=document.querySelector('#today .qtext');
  const locked=document.getElementById('locked'), reveal=document.getElementById('todayReveal'), btn=document.getElementById('todaySaveBtn');
  const answerEl=document.getElementById('answer');
  const sameQuestion=previous?.id===q.id&&keepPrevious;
  if(!sameQuestion){renderTodayQuestionUnavailable('loading');if(previous?.id)answerEl.value='';}
  window.todayQuestion=q;if(qel)qel.textContent=q.question;
  let state,error;
  try{
    const result=await sb.rpc('get_daily_state',{target_question_id:q.id});
    state=result.data;error=result.error;
    if(!error&&(!state||typeof state.both_answered!=='boolean'||typeof state.partner_has_answer!=='boolean'||
      (state.both_answered&&(typeof state.my_answer!=='string'||typeof state.partner_answer!=='string'))))error=new Error('daily_state_invalid');
  }catch(cause){error=cause;}
  if(!current())return;
  if(error){
    console.warn('[US Today] Daily state',error);
    if(sameQuestion&&window.todayState){renderTodaySyncError(true);return;}
    renderTodayQuestionUnavailable('error');
    window.UsTodayPriority?.refresh?.({daily:{status:'error'}});return;
  }
  renderTodaySyncError(false);
  const previousAnswer=window.todayState?.my_answer||'';
  const hasDraft=sameQuestion&&answerEl.value!==previousAnswer;
  window.todayState=state;
  delete btn.dataset.usTodayMode;
  if(state?.my_answer&&!hasDraft){
    document.getElementById('answer').value=state.my_answer;
    btn.textContent='Aggiorna risposta';
  }else{
    btn.textContent='Invia la mia risposta';
  }
  // The sheet's eyebrow names what it shows (mockup): the question, then the two answers.
  const head=document.querySelector('#today .today-sheet-head h2');
  if(head)head.textContent=state?.both_answered?'Le vostre risposte':'La domanda di oggi';
  if(state?.both_answered){
    // Reveal is strictly question + two answers. Do not leave a duplicate,
    // disabled composer or "Risposte sbloccate" banner above the real answers.
    locked.hidden=true;locked.textContent='';
    answerEl.hidden=true;answerEl.disabled=true;
    btn.hidden=true;btn.disabled=true;
    // M10.2 — stato personale (ricevuta, avviso, reazioni) dal server; mai testo qui.
    renderTodayReveal();
    const meta=await loadDailyRevealMeta(q.id);
    if(!current())return;
    if(meta)window.todayRevealMeta=meta;
    renderTodayReveal();
    await markDailyRevealSeenIfVisible(q.id,seq);
    if(!current())return;
    // M12B.4 — Conserva solo qui, dove lo scambio è legittimamente visibile.
    await window.UsDailyKeepsake?.load?.(q.id);
    if(!current())return;
  }else{
    locked.hidden=false;
    answerEl.hidden=false;answerEl.disabled=false;btn.hidden=false;btn.disabled=todayAnswerIsSaving();
    btn.textContent=todayAnswerIsSaving()?'Salvo…':state.my_answer?'Aggiorna risposta':'Invia la mia risposta';
    window.todayRevealMeta=null;
    reveal.classList.add('hidden');reveal.innerHTML='';
    window.UsDailyKeepsake?.hide?.();
    // Mockup: a dot in the colour of whoever the line is about, then plain words.
    const partner=usIdentity().partnerName;
    if(state?.my_answer){
      locked.innerHTML='<span class="dot" data-who="tu" aria-hidden="true"></span><span>'+escapeHtml(`Hai risposto. In attesa di ${partner}…`)+'</span>';
    }else if(state?.partner_has_answer){
      locked.innerHTML='<span class="dot" data-who="partner" aria-hidden="true"></span><span>'+escapeHtml(`${partner} ha già risposto. Vedrete le risposte insieme appena invii la tua.`)+'</span>';
    }else{
      locked.innerHTML='<span class="dot" data-who="noi" aria-hidden="true"></span><span>Le risposte si sbloccano quando avete risposto entrambi.</span>';
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
  const partner=usIdentity().partnerName;
  if(todayPill){
    if(st?.both_answered) todayPill.textContent='💬 Today · reveal sbloccato';
    else if(st?.my_answer) todayPill.textContent='💬 Today · in attesa di '+partner;
    else if(st?.partner_has_answer) todayPill.textContent='💬 Today · risposta in attesa';
    else todayPill.textContent='💬 Today · da fare';
  }
}

let pendingMomentFile=null;
// R1 — several photos at once: the first is the cover, the others go into the
// memory's album (moment_photos, the same path as the album's "Aggiungi foto").
let pendingMomentExtras=[];
let pendingMomentExtraUrls=[];
let pendingMomentPreviewUrl=null;
let pendingMomentDate=localDateISO();
// R6 — "Aggiungi la foto" on something lived: the new memory becomes its photo.
let pendingMomentSource=null;
// The source asked for by the tap that opened the gallery; it applies only once
// photos are actually picked (undefined: keep the current one, e.g. "Cambia foto").
let pendingMomentSourceNext;
let pendingMomentPickToken=0;
const US_MOMENT_MAX_PHOTOS=10;
const US_MOMENT_TYPES=['image/jpeg','image/png','image/webp'];

function formatMomentDetectedDate(value){
  try{return new Date(value+'T12:00:00').toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{day:'numeric',month:'long',year:'numeric'});}catch(_){return value;}
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

// R1 — the date is read from the photo (EXIF, then the file) and stays editable.
function validMomentDate(value){
  const iso=String(value||'');
  return /^\d{4}-\d{2}-\d{2}$/.test(iso)&&iso<=localDateISO()?iso:'';
}
// 1.0 parity: the label says the day, as in the design ("Data foto · 12 ottobre").
function updateMomentDateWhen(){
  const out=document.getElementById('momentDateWhen');
  const iso=validMomentDate(document.getElementById('momentDate')?.value);
  if(out)out.textContent=iso?` · ${new Date(iso+'T12:00:00').toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{day:'numeric',month:'long'})}`:'';
}
function updateDetectedMomentDate(){
  const input=document.getElementById('momentDate');
  if(!input)return;
  input.max=localDateISO();
  input.value=validMomentDate(pendingMomentDate)||localDateISO();
  updateMomentDateWhen();
}
document.getElementById('momentDate')?.addEventListener('change',event=>{
  const iso=validMomentDate(event.target.value);
  if(iso)pendingMomentDate=iso;
  else event.target.value=validMomentDate(pendingMomentDate)||localDateISO();
  updateMomentDateWhen();
});
// The note is one line of meaning: Enter does not start a new line.
document.getElementById('momentCaption')?.addEventListener('keydown',event=>{if(event.key==='Enter')event.preventDefault();});
// 1.0 parity: the design's amber upload bar (to 45% while optimising, then to the end).
function momentUpBar(stage){
  const bar=document.getElementById('momentUpBar');
  const fill=bar?.firstElementChild;
  if(!bar||!fill)return;
  if(stage==='done'){bar.hidden=true;fill.getAnimations?.().forEach(a=>a.cancel());fill.style.width='0%';return;}
  bar.hidden=false;
  const [from,to,duration]=stage==='optimize'?['0%','45%',700]:['45%','100%',800];
  fill.style.width=to;
  if(typeof fill.animate==='function'&&!window.UsUiFoundation?.isReducedMotion?.())fill.animate([{width:from},{width:to}],{duration,easing:'cubic-bezier(.2,.8,.2,1)'});
}

function pickMomentPhoto(){
  document.getElementById('momentFile').click();
}
window.pickMomentPhoto=pickMomentPhoto;

// The source of "Aggiungi la foto" (a lived Da vivere or Event): its day is the
// memory's day, and once saved the photo is linked to it (link_moment_to_source).
function setMomentComposerSource(source){
  const kind=source?.kind==='da_vivere'||source?.kind==='shared_event_completion'?source.kind:'';
  pendingMomentSourceNext=kind&&source?.ref?{kind,ref:String(source.ref),date:validMomentDate(source.date)}:null;
}
window.UsRicordiCompose=Object.freeze({setSource:setMomentComposerSource});

function renderMomentExtras(){
  const box=document.getElementById('momentExtra');
  const row=document.getElementById('momentExtraRow');
  const count=document.getElementById('momentExtraCount');
  pendingMomentExtraUrls.forEach(url=>URL.revokeObjectURL(url));
  pendingMomentExtraUrls=[];
  if(!box||!row)return;
  if(!pendingMomentExtras.length){box.hidden=true;row.replaceChildren();if(count)count.textContent='';return;}
  // Only a few small previews are decoded; the count says the rest.
  pendingMomentExtraUrls=pendingMomentExtras.slice(0,3).map(file=>URL.createObjectURL(file));
  const more=pendingMomentExtras.length-pendingMomentExtraUrls.length;
  row.innerHTML=pendingMomentExtraUrls.map(url=>`<img src="${escapeHtml(url)}" alt="" decoding="async">`).join('')+(more>0?`<span class="moment-extra-more">+${more}</span>`:'');
  if(count)count.textContent=pendingMomentExtras.length===1?'La prima è la copertina, l’altra va nell’album.':`La prima è la copertina, le altre ${pendingMomentExtras.length} vanno nell’album.`;
  box.hidden=false;
}

function resetMomentComposer(){
  pendingMomentFile=null;
  pendingMomentExtras=[];
  pendingMomentSource=null;
  pendingMomentSourceNext=undefined;
  pendingMomentPickToken++;
  pendingMomentDate=localDateISO();
  if(pendingMomentPreviewUrl){URL.revokeObjectURL(pendingMomentPreviewUrl);pendingMomentPreviewUrl=null;}
  renderMomentExtras();
  const fileInput=document.getElementById('momentFile');if(fileInput)fileInput.value='';
  const caption=document.getElementById('momentCaption');if(caption)caption.value='';
  const img=document.getElementById('momentPreviewImg');if(img)img.removeAttribute('src');
  document.getElementById('momentCompose')?.classList.remove('has-photo');
  const date=document.getElementById('momentDate');if(date)date.value='';
  updateMomentDateWhen();
}

document.getElementById('momentFile')?.addEventListener('change',async(event)=>{
  const picked=[...(event.target.files||[])];
  const compose=document.getElementById('momentCompose');
  const img=document.getElementById('momentPreviewImg');
  event.target.value='';
  if(!picked.length)return;
  const valid=picked.filter(file=>US_MOMENT_TYPES.includes(file.type)&&file.size<=20*1024*1024);
  if(!valid.length)return toast(picked.some(file=>US_MOMENT_TYPES.includes(file.type))?'Foto troppo grande: massimo 20 MB':'Per ora usa JPG, PNG o WebP');
  const skipped=picked.length-valid.length;
  if(valid.length>US_MOMENT_MAX_PHOTOS)toast('Al massimo 10 foto alla volta: tengo le prime 10');
  else if(skipped)toast(skipped===1?'Una foto saltata: usa JPG, PNG o WebP fino a 20 MB':`${skipped} foto saltate: usa JPG, PNG o WebP fino a 20 MB`);
  const files=valid.slice(0,US_MOMENT_MAX_PHOTOS);
  const token=++pendingMomentPickToken;
  if(pendingMomentSourceNext!==undefined){pendingMomentSource=pendingMomentSourceNext;pendingMomentSourceNext=undefined;}
  if(pendingMomentSource?.date)pendingMomentDate=pendingMomentSource.date;
  pendingMomentFile=files[0];
  pendingMomentExtras=files.slice(1);
  if(pendingMomentPreviewUrl)URL.revokeObjectURL(pendingMomentPreviewUrl);
  pendingMomentPreviewUrl=URL.createObjectURL(files[0]);
  img.src=pendingMomentPreviewUrl;
  compose?.classList.add('has-photo');
  renderMomentExtras();
  updateDetectedMomentDate();
  window.UsMomentComposer?.show?.();
  // A lived source already knows its day; otherwise the first photo says it.
  if(pendingMomentSource?.date)return;
  const detected=await detectMomentDate(files[0]);
  if(token!==pendingMomentPickToken)return;
  pendingMomentDate=detected;
  updateDetectedMomentDate();
});

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
  if(btn.disabled)return;
  const caption=document.getElementById('momentCaption').value.trim();
  const momentDate=validMomentDate(document.getElementById('momentDate')?.value)||validMomentDate(pendingMomentDate)||localDateISO();
  const file=pendingMomentFile;
  const extras=[...pendingMomentExtras];
  const source=pendingMomentSource;
  const total=1+extras.length;
  btn.disabled=true;btn.textContent='Ottimizzo…';momentUpBar('optimize');
  try{
    const compressed=await compressImageFile(file,{maxDimension:1920,quality:.82});
    const thumbnail=await compressImageFile(file,{maxDimension:720,quality:.72});
    const safeName=`${Date.now()}-${crypto.randomUUID()}.webp`;
    const path=`${window.usProfile.couple_id}/${window.usProfile.id}/${safeName}`;
    const thumbnailPath=`${window.usProfile.couple_id}/${window.usProfile.id}/derived-thumbnails/${crypto.randomUUID()}.webp`;
    btn.textContent=total>1?`Carico 1 di ${total}…`:'Carico…';momentUpBar('upload');
    const {error:uploadError}=await sb.storage.from('us-media').upload(path,compressed,{contentType:'image/webp',upsert:false,cacheControl:'31536000'});
    if(uploadError)throw uploadError;
    let uploadedThumbnail=false;
    try{
      const {error:thumbnailError}=await sb.storage.from('us-media').upload(thumbnailPath,thumbnail,{contentType:'image/webp',upsert:false,cacheControl:'31536000'});
      if(thumbnailError)throw thumbnailError;
      uploadedThumbnail=true;
    }catch(error){
      console.warn('[US Media] thumbnail upload',error);
    }
    const {data:created,error:rowError}=await sb.from('moments').insert({
      couple_id:window.usProfile.couple_id,
      created_by:window.usProfile.id,
      storage_path:path,
      thumbnail_path:uploadedThumbnail?thumbnailPath:null,
      caption:caption||null,
      moment_date:momentDate
    }).select('id').single();
    if(rowError){
      const cleanup=[path];if(uploadedThumbnail)cleanup.push(thumbnailPath);
      await sb.storage.from('us-media').remove(cleanup);
      throw rowError;
    }
    // M12A — only THIS creation earns the one-shot light catch (see consumeFreshRicordo).
    if(created?.id)markFreshRicordo(created.id);
    // R6 — the photo of something lived: one card "L'avete fatto". If the link
    // is refused the memory still exists, as a memory of its own.
    if(created?.id&&source){
      try{
        const {error:linkError}=await sb.rpc('link_moment_to_source',{target_moment_id:created.id,source_kind:source.kind,source_ref:source.ref});
        if(linkError)throw linkError;
      }catch(error){console.warn('[US Ricordi] link source',error);}
    }
    // R1 — the other photos join the memory's album, in the order they were picked.
    let failed=0;
    for(let i=0;i<extras.length;i++){
      btn.textContent=`Carico ${i+2} di ${total}…`;
      let ok=false;
      try{ok=Boolean(created?.id)&&await window.UsMomentAlbums?.uploadPhoto?.(created.id,extras[i],{position:i+1})===true;}
      catch(error){console.warn('[US Ricordi] album photo',error);}
      if(!ok)failed++;
    }
    window.UsFeedback?.success?.();
    resetMomentComposer();
    toast(failed?`Ricordo aggiunto. ${failed} foto non sono entrate: riprova dall’album`:total>1?`Ricordo aggiunto con ${total} foto ♡`:'Ricordo aggiunto ♡');
    await hydrateMoments();
    await hydrateHomeMemory();
    if(!homePhotoPath)await hydrateHomePhoto(true);
  }catch(err){console.warn(err);window.UsFeedback?.error?.();toast(err?.message==='SOURCE_TOO_LARGE'?'Foto troppo grande: massimo 20 MB':'Caricamento non riuscito');}
  finally{btn.disabled=false;btn.textContent='Salva ricordo';momentUpBar('done');}
}
window.uploadMoment=uploadMoment;

// R11 — Android: on the web the service worker keeps private photos in the
// "us-private-media-v1" cache, keyed by storage path. The app has no service
// worker, so Ricordi keeps its thumbnails in that same cache with the same key
// (logout already clears it): a thumbnail is downloaded once, not again every
// time its signed link changes. Web and iOS are unchanged.
const US_RICORDI_MEDIA_CACHE='us-private-media-v1';
const US_RICORDI_MEDIA_CACHE_MAX=240;
const usRicordiMediaBlobs=new Map();
function usRicordiMediaCacheOn(){
  const runtime=window.UsCapacitorRuntime||window.Capacitor;
  return Boolean(window.UsPlatform?.isNative&&runtime?.getPlatform?.()==='android'&&typeof caches!=='undefined'&&window.isSecureContext);
}
function usRicordiMediaKey(path){return new Request(`${location.origin}/__us_media_cache__?path=${encodeURIComponent(path)}`);}
// The paths already on this phone, as local URLs; the others keep their signed URL.
async function usRicordiCachedMedia(paths){
  const found=new Map();
  if(!usRicordiMediaCacheOn())return found;
  try{
    const cache=await caches.open(US_RICORDI_MEDIA_CACHE);
    await Promise.all([...new Set((paths||[]).filter(Boolean))].map(async path=>{
      if(usRicordiMediaBlobs.has(path)){found.set(path,usRicordiMediaBlobs.get(path));return;}
      const hit=await cache.match(usRicordiMediaKey(path));
      if(!hit)return;
      const blob=await hit.blob();
      if(!String(blob.type||'').startsWith('image/'))return;
      const url=URL.createObjectURL(blob);
      usRicordiMediaBlobs.set(path,url);
      found.set(path,url);
    }));
  }catch(error){console.warn('[US Ricordi] media cache',error);}
  return found;
}
// Once the page is painted, keep the thumbnails it just showed (the WebView
// normally still has them, so this is not a second download).
function usRicordiKeepMedia(entries){
  if(!usRicordiMediaCacheOn()||!entries?.length)return;
  usRunWhenIdle(async()=>{
    try{
      const cache=await caches.open(US_RICORDI_MEDIA_CACHE);
      for(const [path,url] of entries){
        if(!path||!url||usRicordiMediaBlobs.has(path)||await cache.match(usRicordiMediaKey(path)))continue;
        const response=await fetch(url,{credentials:'omit'});
        if(!response.ok||!String(response.headers.get('content-type')||'').startsWith('image/'))continue;
        await cache.put(usRicordiMediaKey(path),response);
      }
      const keys=await cache.keys();
      if(keys.length>US_RICORDI_MEDIA_CACHE_MAX)await Promise.all(keys.slice(0,keys.length-US_RICORDI_MEDIA_CACHE_MAX).map(key=>cache.delete(key)));
    }catch(error){console.warn('[US Ricordi] media cache keep',error);}
  },2400);
}

// R5 — "Nuovo da <Nome>": worked out on this phone only, per person. It keeps
// when this phone started counting, when Ricordi was last looked at and which
// memories were opened. Nothing is written to the server.
const US_RICORDI_NEW_DAYS=30;
function ricordiNewKey(){return window.usProfile?.id?`us:ricordi:new:v1:${window.usProfile.id}`:'';}
function ricordiNewWrite(state){
  const key=ricordiNewKey();
  if(!key||!state)return;
  try{localStorage.setItem(key,JSON.stringify({since:state.since,tab:state.tab||state.since,opened:(state.opened||[]).slice(-200)}));}catch(_e){}
}
function ricordiNewRead(){
  const key=ricordiNewKey();
  if(!key)return null;
  let state=null;
  try{state=JSON.parse(localStorage.getItem(key)||'null');}catch(_e){}
  if(!state||typeof state!=='object'||!Date.parse(state.since)){
    // First time on this phone: what is already there is not "new".
    const now=new Date().toISOString();
    state={since:now,tab:now,opened:[]};
    ricordiNewWrite(state);
  }
  if(!Array.isArray(state.opened))state.opened=[];
  return state;
}
function ricordiNewRows(rows,state){
  const me=window.usProfile?.id;
  const since=Date.parse(state.since)||Date.now();
  const cutoff=Date.now()-US_RICORDI_NEW_DAYS*86400000;
  const opened=new Set(state.opened.map(String));
  return (rows||[]).filter(row=>{
    const at=Date.parse(row?.created_at);
    return row?.id&&row.created_by&&row.created_by!==me&&!opened.has(String(row.id))&&at>since&&at>cutoff;
  });
}
function ricordiPaintTabDot(on){
  const tab=document.querySelector('.nav button[data-page="moments"]');
  if(!tab)return;
  tab.toggleAttribute('data-ricordi-new',Boolean(on));
  tab.setAttribute('aria-label',on?'Ricordi, c’è qualcosa di nuovo':'Ricordi');
}
function ricordiOnPage(){return Boolean(document.getElementById('moments')?.classList.contains('active'))&&!document.hidden;}
function ricordiNewSeen(){
  const state=ricordiNewRead();
  if(!state)return;
  state.tab=new Date().toISOString();
  ricordiNewWrite(state);
  ricordiPaintTabDot(false);
}
// rows: moments with id, created_by, created_at. Returns the ids still new.
function ricordiNewSync(rows){
  const state=ricordiNewRead();
  if(!state)return new Set();
  const fresh=ricordiNewRows(rows,state);
  if(ricordiOnPage())ricordiNewSeen();
  else{
    const tabSince=Date.parse(state.tab)||0;
    ricordiPaintTabDot(fresh.some(row=>Date.parse(row.created_at)>tabSince));
  }
  return new Set(fresh.map(row=>String(row.id)));
}
// Away from Ricordi: one light read, only to light the dot on the tab.
async function ricordiCheckNew(){
  const profile=window.usProfile;
  if(!profile?.couple_id||document.hidden||ricordiOnPage())return;
  const {data,error}=await sb.from('moments').select('id,created_by,created_at').eq('couple_id',profile.couple_id).neq('created_by',profile.id).order('created_at',{ascending:false}).limit(30);
  if(error){console.warn('[US Ricordi] new',error);return;}
  if(window.usProfile!==profile||ricordiOnPage())return;
  ricordiNewSync(data||[]);
}
function ricordiMarkOpened(id){
  const key=String(id||'');
  const state=ricordiNewRead();
  if(!state||!key)return;
  if(!state.opened.map(String).includes(key)){state.opened.push(key);ricordiNewWrite(state);}
  for(const card of document.querySelectorAll('#momentsGrid .moment-card[data-ricordi-new]')){
    if(card.dataset.momentId!==key)continue;
    card.removeAttribute('data-ricordi-new');
    card.querySelector('.ricordi-new-label')?.remove();
  }
}
window.UsRicordiNew=Object.freeze({markOpened:ricordiMarkOpened,check:()=>ricordiCheckNew().catch(()=>{})});
window.addEventListener('us-auth-resolved',()=>usRunWhenIdle(()=>ricordiCheckNew().catch(()=>{}),1800));
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&window.usProfile)ricordiCheckNew().catch(()=>{});});
// Opening Ricordi clears the dot at once, even when the page does not reload.
(()=>{
  const page=document.getElementById('moments');
  if(!page||typeof MutationObserver!=='function')return;
  let shown=page.classList.contains('active');
  new MutationObserver(()=>{
    const now=page.classList.contains('active');
    if(now&&!shown&&window.usProfile){ricordiNewSeen();window.dispatchEvent(new CustomEvent('us:ricordi-shown'));}
    shown=now;
  }).observe(page,{attributes:true,attributeFilter:['class']});
})();

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
const RICORDI_SOURCE_LABEL=Object.freeze({experience:'Le vostre idee',event:'Evento vissuto',daily:'Domanda del giorno'});
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
// Rivivi selector: keeps the archive's deterministic historical selection
// contract. The 1.0 surface applies a stricter presentation gate in hydrate:
// only a true anniversary is shown to the couple.
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
    if(!byYear.has(year))byYear.set(year,{year,count:0,moments:0,experiences:0,dailies:0,cover:null,first:item.date});
    const ch=byYear.get(year);
    ch.count++;
    if(item.date<ch.first)ch.first=item.date;
    if(item.kind==='moment')ch.moments++;else if(item.kind==='daily')ch.dailies++;else ch.experiences++;
    if(!ch.cover&&item.moment)ch.cover=item.moment;
  }
  return [...byYear.values()];
}
window.UsRicordiArchive=Object.freeze({timeline:ricordiTimeline,pickRivivi:ricordiPickRivivi,chapters:ricordiChapters,periodLabel:ricordiPeriodLabel});

function ricordiPreviewPath(row){return row?.thumbnail_path||row?.storage_path||'';}
function ricordiPreviewUrl(row,signedUrls){return signedUrls.get(ricordiPreviewPath(row))||signedUrls.get(row?.storage_path)||null;}
// R6 — a memory that is the photo of something lived (a Da vivere or an Event)
// is one card, "L'avete fatto", with the photo. R5 — a memory the partner added
// and this phone has not opened yet says "Nuovo da <Nome>".
function ricordiNewLabel(name){
  const who=String(name||'').trim();
  return who&&who!=='La tua persona'&&who!=='Noi'?`Nuovo da ${who}`:'Nuovo dalla tua persona';
}
function ricordiMomentCard(row,signedUrls,author,canDelete,feature,source,priority=false,fresh=false){
  const displayISO=/^\d{4}-\d{2}-\d{2}$/.test(String(source?.date||''))?String(source.date):row.moment_date;
  const dateLabel=new Date(displayISO+'T12:00:00').toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{day:'2-digit',month:'short',year:'numeric'});
  // The month and year already head the group: the card says only the day.
  const shortLabel=new Date(displayISO+'T12:00:00').toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{day:'numeric',month:'short'});
  const fullUrl=signedUrls.get(row.storage_path);
  const previewPath=ricordiPreviewPath(row);
  const previewUrl=ricordiPreviewUrl(row,signedUrls);
  if(!fullUrl||!previewUrl)return '';
  const done=Boolean(source);
  const sourceTitle=source?.title||'';
  const title=row.caption||sourceTitle;
  const kicker=done?`<small class="ricordi-moment-source ricordi-done-kicker" data-source-key="${escapeHtml(source.sourceKey)}">L’avete fatto${row.caption&&sourceTitle&&sourceTitle!==row.caption?`<span translate="no"> · ${escapeHtml(sourceTitle)}</span>`:''}</small>`:'';
  const freshLabel=fresh?`<span class="ricordi-new-label">${escapeHtml(ricordiNewLabel(author))}</span>`:'';
  return `<article class="moment-card moment-postit${feature?' ricordi-feature':''}${done?' ricordi-done ricordi-wide':''}" role="button" tabindex="0" data-moment-id="${escapeHtml(row.id)}" data-moment-owner="${escapeHtml(row.created_by)}" data-storage-path="${escapeHtml(row.storage_path)}" data-moment-iso="${escapeHtml(displayISO)}" data-url="${escapeHtml(fullUrl)}" data-author="${escapeHtml(author||'Noi')}" data-date="${escapeHtml(dateLabel)}" data-caption="${escapeHtml(title)}"${fresh?' data-ricordi-new':''} onclick="openMomentViewer(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openMomentViewer(this)}"><img src="${escapeHtml(previewUrl)}" data-us-media-path="${escapeHtml(previewPath)}" onerror="usRecoverPrivateImage(this)" alt="Ricordo condiviso" loading="${priority?'eager':'lazy'}" decoding="async"${priority?' fetchpriority="high"':''}>${freshLabel}${canDelete?`<button class="moment-delete" type="button" aria-label="Elimina ricordo" onclick="event.stopPropagation();deleteMoment('${row.id}')">Elimina</button>`:''}<div class="moment-meta">${kicker}${title?`<p translate="no">${escapeHtml(title)}</p>`:''}<span class="moment-line"><i class="moment-dot" data-owner="${row.created_by===window.usProfile?.id?'tu':'partner'}" aria-hidden="true"></i><b>${escapeHtml(shortLabel)}</b><span aria-hidden="true">·</span><span class="moment-by" translate="no">${escapeHtml(author||'Noi')}</span></span></div></article>`;
}
function ricordiExperienceCard(row,sourceDate){
  const date=/^\d{4}-\d{2}-\d{2}$/.test(String(sourceDate||''))?String(sourceDate):ricordiLocalISO(row.completed_at);
  const day=new Date(date+'T12:00:00').toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{day:'numeric',month:'long'});
  return `<button type="button" class="ricordi-experience" data-ricordi-experience="${escapeHtml(row.id)}"><span class="ricordi-experience-mark" aria-hidden="true"></span><span class="ricordi-experience-copy"><small>Vissuta insieme · ${escapeHtml(day)}</small><b translate="no">${escapeHtml(row.title)}</b></span><span class="ricordi-experience-source">Le vostre idee</span></button>`;
}
// M12B.4 — una Domanda del giorno conservata: provenienza esplicita e le due
// risposte come erano al reveal (snapshot del server), apribile sul posto.
function ricordiDailyCard(row){
  const day=new Date(String(row.question_date)+'T12:00:00').toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{day:'numeric',month:'long'});
  return `<details class="ricordi-daily" data-ricordi-daily="${escapeHtml(row.id)}" data-source-key="${escapeHtml(row.source_key||'')}"><summary><span class="ricordi-experience-mark ricordi-daily-mark" aria-hidden="true"></span><span class="ricordi-experience-copy"><small>Domanda del giorno · ${escapeHtml(day)}</small><b>${escapeHtml(row.question_text)}</b></span><span class="ricordi-experience-source">Conservata</span></summary>${ricordiDailyAnswers(row)}</details>`;
}
function ricordiDailyAnswers(row){
  const answer=(label,text)=>`<div class="ricordi-daily-answer"><b translate="no">${escapeHtml(label)}</b><p translate="no">${escapeHtml(text||'')}</p></div>`;
  return `<div class="ricordi-daily-answers">${answer(usIdentity().nameForRole('francesco'),row.francesco_answer)}${answer(usIdentity().nameForRole('beatrice'),row.beatrice_answer)}</div>`;
}
// M12B.5 — un Evento vissuto senza foto resta un record evento (D3=A): titolo
// storico (snapshot al completamento, altrimenti il titolo attuale dichiarato
// come tale), data dell'occorrenza, nessuna azione sull'evento mutabile.
function ricordiEventTitle(row){return row?.title||'Evento';}
function ricordiEventCard(row){
  const day=new Date(String(row.occurrence_date)+'T12:00:00').toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{day:'numeric',month:'long'});
  return `<article class="ricordi-experience ricordi-event" data-source-key="shared_event_completion:${escapeHtml(row.source_ref)}" data-title-source="${escapeHtml(row.title_source||'')}"><span class="ricordi-experience-mark ricordi-event-mark" aria-hidden="true"></span><span class="ricordi-experience-copy"><small>Vissuto insieme · ${escapeHtml(day)}</small><b${row?.title?' translate="no"':''}>${escapeHtml(ricordiEventTitle(row))}</b></span><span class="ricordi-experience-source">Evento</span></article>`;
}
// R6 — something lived without its photo yet: "Aggiungi la foto" picks it from
// the gallery; once saved, the photo is linked to it and the two become one card.
function ricordiAddPhotoAction(item){
  const kind=item?.kind==='experience'?'da_vivere':item?.kind==='event'?'shared_event_completion':'';
  const ref=item?.kind==='experience'?item.row?.id:item?.row?.source_ref;
  if(!kind||!ref||item.orphan||item.moment)return '';
  const label=item.title?`Aggiungi la foto di «${item.title}»`:'Aggiungi la foto';
  return `<button type="button" class="ricordi-add-photo" data-ricordi-add-photo="${escapeHtml(kind)}" data-source-ref="${escapeHtml(ref)}" data-source-date="${escapeHtml(item.date||'')}" aria-label="${escapeHtml(label)}"><span class="us-icon" data-us-icon="plus" aria-hidden="true"></span><span>Aggiungi la foto</span></button>`;
}
function ricordiLivedCard(cardHtml,item){
  const action=ricordiAddPhotoAction(item);
  return action?`<div class="ricordi-lived" data-source-key="${escapeHtml(item.sourceKey)}">${cardHtml}${action}</div>`:cardHtml;
}
// M12B.5 — Rivivi parla la lingua della fonte, in un solo linguaggio visivo:
// con foto apre il Moment viewer esistente (anche quando la foto è l'immagine
// di un'esperienza o di un Evento vissuto); senza foto si apre sul posto in
// sola lettura con i valori storici (risposte conservate, data vissuta).
function ricordiRiviviDate(iso){return new Date(String(iso)+'T12:00:00').toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{day:'numeric',month:'long',year:'numeric'});}
function ricordiRiviviTitle(entry){
  if(entry.kind==='moment')return entry.row.caption||'';
  if(entry.kind==='event')return entry.orphan?(entry.title||'Evento'):ricordiEventTitle(entry.row);
  return entry.title||'';
}
// R7 — "Mandalo a <Nome>": the memory becomes a thought in Lasciato per te,
// "Ti ricordi? …", written by the sender before it leaves.
function ricordiPartnerName(){
  const name=typeof usIdentity==='function'?usIdentity().partnerName:'';
  return name&&name!=='La tua persona'?name:'';
}
function ricordiSendButton(title,date){
  const name=ricordiPartnerName();
  if(!name||typeof window.UsLeftForYou?.openComposer!=='function')return '';
  return `<button type="button" class="ricordi-rivivi-send" data-ricordi-send data-send-title="${escapeHtml(title||'')}" data-send-date="${escapeHtml(date)}"><span class="us-icon" data-us-icon="envelope" aria-hidden="true"></span><span>Mandalo a ${escapeHtml(name)}</span></button>`;
}
function ricordiT(text,vars){
  if(typeof window.usT==='function')return window.usT(text,vars);
  return String(text).replace(/\{([a-z]+)\}/gi,(all,key)=>vars?.[key]??all);
}
function ricordiSendToPartner(title,date){
  const what=title?`${title} · ${date}`:date;
  window.UsLeftForYou?.openComposer?.({kind:'text',text:ricordiT('Ti ricordi? {what} ♡',{what})});
}
function renderRicordiRivivi(pick,signedUrls,names){
  const root=document.getElementById('ricordiRivivi');
  if(!root)return;
  const entry=pick?.entry;
  if(!entry){root.hidden=true;root.innerHTML='';return;}
  const date=ricordiRiviviDate(entry.date);
  const title=ricordiRiviviTitle(entry);
  const fullUrl=entry.moment?signedUrls.get(entry.moment.storage_path):null;
  if(fullUrl){
    const m=entry.moment;
    const previewPath=ricordiPreviewPath(m);
    const previewUrl=ricordiPreviewUrl(m,signedUrls)||fullUrl;
    const author=names.get(m.created_by)||'Noi';
    const meta=entry.kind==='moment'?author:RICORDI_SOURCE_LABEL[entry.kind];
    const viewerISO=entry.kind==='moment'?m.moment_date:entry.date;
    const viewerDate=new Date(viewerISO+'T12:00:00').toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{day:'2-digit',month:'short',year:'numeric'});
    root.innerHTML=`<div class="ricordi-kicker">RIVIVI</div><button type="button" class="ricordi-rivivi-card" data-ricordi-open="${escapeHtml(m.id)}" data-source-key="${escapeHtml(entry.sourceKey)}" data-rivivi-kind="${escapeHtml(entry.kind)}" data-url="${escapeHtml(fullUrl)}" data-author="${escapeHtml(author)}" data-date="${escapeHtml(viewerDate)}" data-caption="${escapeHtml(m.caption||title)}" data-moment-id="${escapeHtml(m.id)}" data-moment-owner="${escapeHtml(m.created_by||'')}" data-storage-path="${escapeHtml(m.storage_path)}" data-moment-iso="${escapeHtml(viewerISO)}" aria-label="Rivivi: ${escapeHtml(title||date)}"><img src="${escapeHtml(previewUrl)}" data-us-media-path="${escapeHtml(previewPath)}" onerror="usRecoverPrivateImage(this)" alt="" loading="eager" decoding="async" fetchpriority="high"><span class="ricordi-rivivi-copy"><small>${escapeHtml(pick.label)}</small><b${entry.kind==='daily'?'':' translate="no"'}>${escapeHtml(title||date)}</b><span>${escapeHtml(date)} · ${escapeHtml(meta)}</span></span></button>${ricordiSendButton(title,date)}`;
    root.hidden=false;
    return;
  }
  if(entry.kind==='moment'){root.hidden=true;root.innerHTML='';return;}
  let body='';
  if(entry.kind==='daily')body=ricordiDailyAnswers(entry.row);
  else if(entry.kind==='event')body=`<p class="ricordi-rivivi-detail">Vissuto insieme il ${escapeHtml(date)}.${entry.row.title_source==='live'?' Il titolo è quello di oggi: quello di allora non era registrato.':''}</p>`;
  else body=`<p class="ricordi-rivivi-detail">Vissuta insieme il ${escapeHtml(date)}.</p>${entry.orphan?'':`<button type="button" class="ricordi-rivivi-link" data-ricordi-experience="${escapeHtml(entry.row.id)}">Apri nelle vostre idee</button>`}`;
  root.innerHTML=`<div class="ricordi-kicker">RIVIVI</div><details class="ricordi-rivivi-card ricordi-rivivi-note" data-source-key="${escapeHtml(entry.sourceKey)}" data-rivivi-kind="${escapeHtml(entry.kind)}"><summary aria-label="Rivivi: ${escapeHtml(title||date)}"><span class="ricordi-rivivi-mark ricordi-rivivi-mark-${escapeHtml(entry.kind)}" aria-hidden="true"></span><span class="ricordi-rivivi-text"><small>${escapeHtml(pick.label)}</small><b${entry.kind==='daily'?'':' translate="no"'}>${escapeHtml(title||date)}</b><span>${escapeHtml(date)} · ${escapeHtml(RICORDI_SOURCE_LABEL[entry.kind])}</span></span></summary><div class="ricordi-rivivi-body">${body}</div></details>${ricordiSendButton(title,date)}`;
  root.hidden=false;
}
// R9 — Capitoli wait for two years of history: before that the story is short
// enough to read month by month.
const RICORDI_CHAPTERS_MIN_DAYS=730;
function ricordiChaptersReady(chapters,todayISO){
  const oldest=chapters.map(ch=>ch.first).filter(Boolean).sort()[0];
  return Boolean(oldest&&todayISO)&&ricordiDayDiff(todayISO,oldest)>=RICORDI_CHAPTERS_MIN_DAYS;
}
function renderRicordiChapters(chapters,signedUrls,todayISO){
  const root=document.getElementById('ricordiChapters');
  if(!root)return;
  if(!chapters.length||!ricordiChaptersReady(chapters,todayISO)){root.hidden=true;root.innerHTML='';return;}
  root.innerHTML=`<div class="ricordi-section-head"><div class="ricordi-kicker">CAPITOLI</div><h3>Per anno</h3></div><div class="ricordi-chapter-row">${chapters.map(ch=>{
    const previewPath=ch.cover?ricordiPreviewPath(ch.cover):'';
    const url=ch.cover?ricordiPreviewUrl(ch.cover,signedUrls):null;
    const parts=[ch.moments?`${ch.moments} ${ch.moments===1?'ricordo':'ricordi'}`:'',ch.experiences?`${ch.experiences} ${ch.experiences===1?'esperienza':'esperienze'}`:'',ch.dailies?`${ch.dailies} ${ch.dailies===1?'domanda':'domande'}`:''].filter(Boolean).join(' · ');
    return `<button type="button" class="ricordi-chapter" data-ricordi-year="${escapeHtml(ch.year)}">${url?`<img src="${escapeHtml(url)}" data-us-media-path="${escapeHtml(previewPath)}" onerror="usRecoverPrivateImage(this)" alt="" loading="lazy" decoding="async">`:''}<span><b>${escapeHtml(ch.year)}</b><small>${escapeHtml(parts)}</small></span></button>`;
  }).join('')}</div>`;
  root.hidden=false;
}
// Capitoli (1.0 parity): a year opens as a sheet of its photos, as in the
// design; each photo opens its own album (Galleria) from where it was tapped.
let ricordiArchiveState=null;
function ricordiChapterRange(items,year){
  const dates=items.map(item=>item.date).filter(Boolean).sort();
  if(!dates.length)return '';
  const tag=globalThis.UsI18n?.tag||'it-IT';
  const at=iso=>new Date(iso+'T12:00:00');
  const firstDay=at(dates[0]).getDate();
  const first=at(dates[0]).toLocaleDateString(tag,{day:'numeric',month:'long'});
  const from=firstDay===8||firstDay===11?`dall’${first}`:`dal ${first}`;
  if(dates.length===1)return `, il ${first}.`;
  if(String(year)===localDateISO().slice(0,4))return `, ${from} a oggi.`;
  const month=at(dates[dates.length-1]).toLocaleDateString(tag,{month:'long'});
  const lastMonth=Number(dates[dates.length-1].slice(5,7));
  return `, ${from} ${[4,8,10].includes(lastMonth)?'ad':'a'} ${month}.`;
}
function openRicordiChapter(year){
  const overlay=document.getElementById('ricordiChapterOverlay');
  const state=ricordiArchiveState;
  if(!overlay||!state)return;
  const items=state.timeline.filter(item=>item.date.slice(0,4)===String(year));
  const chapter=ricordiChapters(items)[0];
  if(!chapter)return;
  const parts=[chapter.moments?`${chapter.moments} ${chapter.moments===1?'ricordo':'ricordi'}`:'',chapter.experiences?`${chapter.experiences} ${chapter.experiences===1?'esperienza':'esperienze'}`:'',chapter.dailies?`${chapter.dailies} ${chapter.dailies===1?'domanda':'domande'}`:''].filter(Boolean).join(' · ');
  document.getElementById('ricordiChapterTitle').textContent=String(year);
  document.getElementById('ricordiChapterLead').innerHTML=`<span>${escapeHtml(parts)}</span><span>${escapeHtml(ricordiChapterRange(items,year))}</span>`;
  const tag=globalThis.UsI18n?.tag||'it-IT';
  document.getElementById('ricordiChapterThumbs').innerHTML=items.filter(item=>item.moment).map(item=>{
    const row=item.moment;
    const fullUrl=state.urls.get(row.storage_path);
    const previewUrl=ricordiPreviewUrl(row,state.urls)||fullUrl;
    if(!fullUrl)return '';
    const author=state.names.get(row.created_by)||'Noi';
    const iso=item.kind==='moment'?row.moment_date:item.date;
    const date=new Date(iso+'T12:00:00').toLocaleDateString(tag,{day:'2-digit',month:'short',year:'numeric'});
    const caption=row.caption||(item.kind==='moment'?'':ricordiRiviviTitle(item));
    return `<button type="button" class="ricordi-chapter-thumb" data-moment-id="${escapeHtml(row.id)}" data-moment-owner="${escapeHtml(row.created_by||'')}" data-storage-path="${escapeHtml(row.storage_path)}" data-moment-iso="${escapeHtml(iso)}" data-url="${escapeHtml(fullUrl)}" data-author="${escapeHtml(author)}" data-date="${escapeHtml(date)}" data-caption="${escapeHtml(caption)}" aria-label="Apri il ricordo"><img src="${escapeHtml(previewUrl)}" data-us-media-path="${escapeHtml(ricordiPreviewPath(row))}" onerror="usRecoverPrivateImage(this)" alt="" loading="lazy" decoding="async"></button>`;
  }).join('');
  window.UsUiFoundation?.cancelSurfaceExit?.(overlay);
  overlay.classList.add('show');
  overlay.setAttribute('aria-hidden','false');
  overlay.querySelector('[data-us-modal-panel]')?.scrollTo?.(0,0);
}
function closeRicordiChapter(){
  const overlay=document.getElementById('ricordiChapterOverlay');
  if(!overlay?.classList.contains('show'))return;
  const finalize=()=>{overlay.classList.remove('show');overlay.setAttribute('aria-hidden','true');};
  if(window.UsUiFoundation?.exitSurface)window.UsUiFoundation.exitSurface(overlay,finalize);else finalize();
}
window.openRicordiChapter=openRicordiChapter;
window.closeRicordiChapter=closeRicordiChapter;
document.getElementById('ricordiChapterOverlay')?.addEventListener('click',event=>{
  if(event.target.closest('#ricordiChapterClose,#ricordiChapterBackdrop')){closeRicordiChapter();return;}
  const thumb=event.target.closest('.ricordi-chapter-thumb[data-moment-id]');
  if(thumb)openMomentViewer(thumb);
});
document.addEventListener?.('keydown',event=>{
  if(event.key==='Escape'&&document.getElementById('ricordiChapterOverlay')?.classList.contains('show')&&!document.getElementById('usAlbumOverlay')?.classList.contains('show'))closeRicordiChapter();
});
function openRicordiExperience(id){
  go('bond',{nav:true});
  Promise.resolve(window.hydrateNoiIdeas?.()).then(()=>window.openNoiIdeaDetail?.(id)).catch(()=>{});
}
document.getElementById('moments')?.addEventListener('click',event=>{
  const send=event.target.closest('[data-ricordi-send]');
  if(send){ricordiSendToPartner(send.dataset.sendTitle,send.dataset.sendDate);return;}
  const addPhoto=event.target.closest('[data-ricordi-add-photo]');
  if(addPhoto){window.UsMomentComposer?.pick?.({source:{kind:addPhoto.dataset.ricordiAddPhoto,ref:addPhoto.dataset.sourceRef,date:addPhoto.dataset.sourceDate}});return;}
  const rivivi=event.target.closest('[data-ricordi-open]');
  if(rivivi){openMomentViewer(rivivi);return;}
  const experience=event.target.closest('[data-ricordi-experience]');
  if(experience){openRicordiExperience(experience.dataset.ricordiExperience);return;}
  const chapter=event.target.closest('[data-ricordi-year]');
  if(chapter)openRicordiChapter(chapter.dataset.ricordiYear);
});

let usForceMomentsMediaRefresh=false;
async function hydrateMomentsCore(){
  const forceMedia=usForceMomentsMediaRefresh;
  usForceMomentsMediaRefresh=false;
  if(!window.usProfile)return;
  const grid=document.getElementById('momentsGrid');
  const pill=document.getElementById('momentsStatusPill');
  if(!grid)return;
  const profile=window.usProfile;
  if(grid.dataset.loaded!=='1')grid.innerHTML='<div class="empty-state moment-loading"><div class="emoji"><span class="us-icon" data-us-icon="arrows-clockwise" aria-hidden="true"></span></div><b>Carico…</b></div>';
  // Start all archive reads together, but as soon as Moments arrive start
  // resolving their signed media URLs too. Previously media resolution waited
  // for every enrichment query, adding a full network round-trip to first paint.
  const momentsPromise=sb.from('moments').select('id,created_by,storage_path,thumbnail_path,caption,moment_date,created_at').order('moment_date',{ascending:false}).order('created_at',{ascending:false});
  const profilesPromise=sb.from('profiles').select('id,display_name').eq('couple_id',profile.couple_id);
  const livedPromise=sb.from('bucket_items').select('id,title,completed_at').eq('couple_id',profile.couple_id).eq('status','lived');
  const keptPromise=usReadLocalized(columns=>sb.from('daily_question_keepsakes').select(columns).order('question_date',{ascending:false}),'id,source_key,question_text,question_date,francesco_answer,beatrice_answer,revealed_at','question_text_localized');
  const eventsPromise=sb.from('relationship_event_history').select('source_ref,occurrence_date,completed_at,title,title_source,moment_id');
  const provenancePromise=sb.from('living_provenance').select('source_kind,source_ref,source_title,source_date,target_moment_id');
  const {data:rows,error}=await momentsPromise;
  if(window.usProfile!==profile)return;
  if(error){console.warn(error);if(grid.dataset.loaded!=='1')grid.innerHTML='<div class="empty-state moment-loading"><div class="emoji">!</div><b>Ricordi non disponibili</b><p>Riprova tra un momento.</p></div>';return;}
  const mediaPaths=[...new Set((rows||[]).flatMap(row=>[row.storage_path,row.thumbnail_path]).filter(Boolean))];
  if(forceMedia)mediaPaths.forEach(usInvalidateSignedUrl);
  const signedUrlsPromise=usGetSignedUrls(mediaPaths,21600);
  const [
    {data:profiles,error:profilesError},
    {data:lived,error:livedError},
    {data:kept,error:keptError},
    {data:events,error:eventsError},
    {data:provenance,error:provenanceError},
    signedUrls
  ]=await Promise.all([profilesPromise,livedPromise,keptPromise,eventsPromise,provenancePromise,signedUrlsPromise]);
  if(window.usProfile!==profile)return;
  if(profilesError)console.warn(profilesError);
  // Le esperienze vissute sono un arricchimento: se non si leggono, la storia
  // resta quella dei Moments, mai un errore dell'intera pagina.
  if(livedError)console.warn(livedError);
  const livedRows=livedError?[]:(lived||[]);
  if(keptError)console.warn(keptError);
  const keptRows=keptError?[]:(kept||[]).map(row=>row.question_text_localized?{...row,question_text:row.question_text_localized}:row);
  // M12B.5: Eventi vissuti e provenienza sono arricchimenti come i precedenti.
  // Senza provenienza un Moment collegato e la sua fonte restano due voci
  // finché la lettura non torna: mai inventate, mai unite per titolo.
  if(eventsError)console.warn(eventsError);
  const eventRows=eventsError?[]:(events||[]);
  if(provenanceError)console.warn(provenanceError);
  const provenanceRows=provenanceError?[]:(provenance||[]);
  if(pill)pill.textContent=`Ricordi · ${rows?.length||0}`;
  const today=localDateISO();
  // R5 — before the "nothing changed" shortcut: the dot follows the visit.
  const freshIds=ricordiNewSync(rows||[]);
  const signature=JSON.stringify([today,(rows||[]).map(r=>[r.id,r.created_by,r.storage_path,r.thumbnail_path||'',r.caption||'',r.moment_date,r.created_at]),livedRows.map(r=>[r.id,r.title,r.completed_at]),keptRows.map(r=>[r.id,r.question_date]),eventRows.map(r=>[r.source_ref,r.occurrence_date,r.title,r.title_source,r.moment_id]),provenanceRows.map(r=>[r.source_kind,r.source_ref,r.target_moment_id])]);
  if(grid.dataset.loaded==='1'&&grid.dataset.signature===signature&&!forceMedia)return;
  if(!rows?.length&&!livedRows.length&&!keptRows.length&&!eventRows.length){
    grid.innerHTML='<div class="empty-state moment-loading ricordi-empty"><b>La vostra storia parte da qui</b></div>';
    renderRicordiRivivi(null,new Map(),new Map());
    renderRicordiChapters([],new Map(),today);
    grid.dataset.loaded='1';grid.dataset.signature=signature;window.dispatchEvent(new CustomEvent('us:moments-updated'));return;
  }
  const names=new Map((profiles||[]).map(p=>[p.id,p.display_name||'Noi']));
  const timeline=ricordiTimeline((rows||[]).filter(r=>signedUrls.get(r.storage_path)),livedRows,keptRows,eventRows,provenanceRows);
  // R11 — on Android the small images already kept on the phone are shown from there.
  const thumbPaths=(rows||[]).map(r=>r.thumbnail_path).filter(Boolean);
  const localMedia=await usRicordiCachedMedia(thumbPaths);
  if(window.usProfile!==profile)return;
  const displayUrls=localMedia.size?new Map([...signedUrls,...localMedia]):signedUrls;
  const html=[];
  let period='';
  // Ritmo editoriale: la prima foto del mese è a tutta larghezza, le altre in
  // coppia; una foto rimasta sola prima di una voce larga si allarga anch'essa.
  let loneHalf=-1;
  let visiblePhotoIndex=0;
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
    if(item.kind==='experience'&&!item.moment){closeRow();html.push(ricordiLivedCard(ricordiExperienceCard(item.row,item.date),item));continue;}
    if(item.kind==='event'&&!item.moment){closeRow();html.push(ricordiLivedCard(ricordiEventCard(item.row),item));continue;}
    if(item.kind==='daily'){closeRow();html.push(ricordiDailyCard(item.row));continue;}
    // Un Moment, o la foto di un'esperienza/Evento vissuto: una sola voce.
    const row=item.moment;
    const own=row.created_by===profile.id;
    const author=names.get(row.created_by)||(own?profile.display_name:'Noi');
    // R2 — only who created a memory can delete it (the album asks first,
    // "per tutti e due"); the partner never sees Elimina on it.
    const source=item.kind==='moment'?null:{kind:item.kind,sourceKey:item.sourceKey,title:ricordiRiviviTitle(item),date:item.date};
    // R6 — "L'avete fatto" always takes the whole row.
    if(source)closeRow();
    html.push(ricordiMomentCard(row,displayUrls,author,own,opensPeriod,source,visiblePhotoIndex++<2,freshIds.has(String(row.id))));
    if(!opensPeriod&&!source)loneHalf=loneHalf>=0?-1:html.length-1;
  }
  closeRow();
  if(timeline.length){
    grid.innerHTML=html.join('');grid.dataset.loaded='1';grid.dataset.signature=signature;
    consumeFreshRicordo(grid);
    window.dispatchEvent(new CustomEvent('us:moments-updated'));
    // R7 — Rivivi also brings back "X mesi fa", not only anniversaries.
    renderRicordiRivivi(ricordiPickRivivi(timeline,today),displayUrls,names);
    ricordiArchiveState={timeline,urls:displayUrls,names};
    renderRicordiChapters(ricordiChapters(timeline),displayUrls,today);
    usRicordiKeepMedia(thumbPaths.filter(path=>!localMedia.has(path)).map(path=>[path,signedUrls.get(path)]));
  }
  else if(grid.dataset.loaded!=='1')grid.innerHTML='<div class="empty-state moment-loading"><div class="emoji">!</div><b>Foto non disponibili</b><p>Riprova tra un momento.</p></div>';
}
let momentsHydrateInFlight=null;
async function hydrateMoments(options={}){
  if(options.forceMedia)usForceMomentsMediaRefresh=true;
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
    sb.from('moments').select('id,created_by,storage_path,thumbnail_path,caption,moment_date,created_at').order('created_at',{ascending:false}).limit(24),
    sb.from('profiles').select('id,display_name').eq('couple_id',window.usProfile.couple_id)
  ]);
  if(error){console.warn(error);section.hidden=true;return;}
  if(profilesError)console.warn(profilesError);
  if(!rows?.length){section.hidden=true;return;}
  if(forceNext)homeMemoryOffset=(homeMemoryOffset+1)%rows.length;
  const daySeed=Number(localDateISO().replaceAll('-',''))||0;
  const row=rows[(daySeed+homeMemoryOffset)%rows.length];
  const names=new Map((profiles||[]).map(profile=>[profile.id,profile.display_name||'Noi']));
  const paths=[row.storage_path,row.thumbnail_path].filter(Boolean);
  const urls=await usGetSignedUrls(paths,21600);
  const signedUrl=urls.get(row.storage_path);
  const previewUrl=urls.get(row.thumbnail_path)||signedUrl;
  if(!signedUrl||!previewUrl){section.hidden=true;return;}
  const dateLabel=new Date(row.moment_date+'T12:00:00').toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{day:'2-digit',month:'long',year:'numeric'});
  const author=names.get(row.created_by)||'Noi';
  document.getElementById('homeMemoryImg').src=previewUrl;
  document.getElementById('homeMemoryAuthor').textContent=author;
  document.getElementById('homeMemoryDate').textContent=dateLabel;
  const caption=document.getElementById('homeMemoryCaption');
  caption.textContent=row.caption||'';
  caption.hidden=!row.caption;
  card.dataset.url=signedUrl;
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

// Ricordi delete — the ONLY client entry point for permanent Moment removal.
// Callers own the undo grace period (moments-albums.js); this runs once it has
// expired. The authenticated Edge Function re-validates same-couple membership,
// deletes the shared Moment, then cleans its us-media objects server-side.
async function commitMomentDeletion(id){
  if(!window.usProfile||!id)return false;
  const {data,error}=await sb.functions.invoke('delete-moment',{body:{moment_id:id}});
  if(error||data?.deleted!==true){
    console.warn('[US Ricordi] delete moment',error||data||'not deleted');
    return false;
  }
  if(data?.storage_cleanup===false)console.warn('[US Ricordi] moment deleted; storage cleanup will need recovery');
  try{
    await hydrateMoments();
    await hydrateHomeMemory();
    homePhotoPath='';
    await hydrateHomePhoto(true);
  }catch(refreshError){console.warn('[US Ricordi] refresh after delete',refreshError);}
  return true;
}
window.usCommitMomentDeletion=commitMomentDeletion;

// The visible Elimina button opens the Moment and focuses the 4-second undo control.
function deleteMoment(id){
  const card=[...document.querySelectorAll('#momentsGrid .moment-card[data-moment-id]')].find(c=>c.dataset.momentId===id);
  if(card&&typeof window.openUsMomentAlbum==='function')window.openUsMomentAlbum(card,{focusDelete:true});
}
window.deleteMoment=deleteMoment;



// ===== Bond progression + Weekly Quests =====
// M12D: the Quest week is the Monday of the Europe/Rome calendar (same clock
// as Daily and Game V2), so two phones in different time zones share it.
const QUEST_WEEK_TIMEZONE='Europe/Rome';
function questRomeDay(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:QUEST_WEEK_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get=type=>Number(parts.find(p=>p.type===type)?.value);
  return new Date(Date.UTC(get('year'),get('month')-1,get('day')));
}
function weekStartISO(now=new Date()){
  const d=questRomeDay(now);
  d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
  return d.toISOString().slice(0,10);
}
function questWeekDate(week,days=0){
  const [y,m,d]=String(week).split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d+days));
}
function questDayLabel(date,options){return date.toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{timeZone:'UTC',...options});}
function nextWeekLabel(week=weekStartISO()){
  return questDayLabel(questWeekDate(week,7),{weekday:'long',day:'numeric',month:'short'});
}
// "12–18 ott" inside one month, "28 set – 4 ott" across two (the mockup's
// kicker); month:'long' for the past weeks ("5–11 ottobre").
function questWeekRangeLabel(week,month='short'){
  const from=questWeekDate(week),to=questWeekDate(week,6);
  if(from.getUTCMonth()===to.getUTCMonth())return `${from.getUTCDate()}–${questDayLabel(to,{day:'numeric',month})}`;
  return `${questDayLabel(from,{day:'numeric',month})} – ${questDayLabel(to,{day:'numeric',month})}`;
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
}

function renderBondProgress(totalXp){
  // While Sintonia plays a gain (bar, circles, new level) it owns the card;
  // it renders the latest total when the animation ends.
  if(window.USProgression?.holdsCard?.(totalXp))return;
  // The same total is never painted twice (Sintonia hydrates on every tab
  // switch, while its entrance plays): no mutation, no relayout.
  const painted=document.getElementById('bondLevelXp');
  if(painted&&painted.__usTotal===totalXp)return;
  if(painted)painted.__usTotal=totalXp;
  const info=bondLevelInfo(totalXp);
  const heroLevel=document.getElementById('heroBondLevel');
  const heroXp=document.getElementById('heroBondXp');
  const heroFill=document.getElementById('bondFill');
  if(heroLevel)heroLevel.textContent=`Livello ${info.level}`;
  if(heroXp)heroXp.textContent=`${info.current.toLocaleString((globalThis.UsI18n?.tag||'it-IT'))} / ${info.needed.toLocaleString((globalThis.UsI18n?.tag||'it-IT'))}`;
  if(heroFill)heroFill.style.width=`${info.progress}%`;
  const levelEl=document.getElementById('bondLevelValue');if(levelEl)levelEl.textContent=info.level;
  const totalEl=document.getElementById('bondTotalXp');if(totalEl)totalEl.textContent=`${info.total.toLocaleString((globalThis.UsI18n?.tag||'it-IT'))} punti`;
  const rankEl=document.getElementById('bondRankTitle');if(rankEl)rankEl.textContent=bondRankTitle(info.level);
  // As the mockup: the points inside the level and the points to the next one.
  const tag=(globalThis.UsI18n?.tag||'it-IT');
  const nextEl=document.getElementById('bondNextXp');if(nextEl)nextEl.textContent=`${(info.needed-info.current).toLocaleString(tag)} XP al livello ${info.level+1}`;
  const pageFill=document.getElementById('bondPageFill');if(pageFill)pageFill.style.width=`${info.progress}%`;
  // M10.1D — la barra è il progresso REALE dentro il livello corrente (bondLevelInfo:
  // (XP totali - soglia del livello) / XP del livello), mai un valore decorativo.
  const levelLabel=document.getElementById('bondResonanceLevel');if(levelLabel)levelLabel.textContent=`Livello ${info.level}`;
  const track=document.getElementById('bondProgressTrack');
  if(track){
    track.setAttribute('aria-valuemax',String(info.needed));
    track.setAttribute('aria-valuenow',String(info.current));
    track.setAttribute('aria-valuetext',`${info.current.toLocaleString((globalThis.UsI18n?.tag||'it-IT'))} di ${info.needed.toLocaleString((globalThis.UsI18n?.tag||'it-IT'))} punti nel livello ${info.level}`);
  }
  const line=document.getElementById('bondLevelXp');if(line)line.textContent=`${info.current.toLocaleString(tag)} / ${info.needed.toLocaleString(tag)} XP`;
  // M9D — hub Noi e superficie Risonanza: stessi numeri di couples.bond_xp.
  const hubTitle=document.getElementById('noiHubResonanceTitle');if(hubTitle)hubTitle.textContent=bondRankTitle(info.level);
  const hubMeta=document.getElementById('noiHubResonanceMeta');if(hubMeta)hubMeta.textContent=`Livello ${info.level}`;
  const hubFill=document.getElementById('noiHubResonanceFill');if(hubFill)hubFill.style.width=`${info.progress}%`;
  const resTotal=document.getElementById('noiResonanceTotal');if(resTotal)resTotal.textContent=info.total.toLocaleString((globalThis.UsI18n?.tag||'it-IT'));
  window.usBondXp=info.total;
  renderBondBadges(info.level);
}
window.renderBondProgress=renderBondProgress;
async function hydrateBondSummary(){
  if(!window.usProfile)return;
  const {data,error}=await sb.from('couples').select('bond_xp').eq('id',window.usProfile.couple_id).maybeSingle();
  if(error){console.warn(error);return;}
  renderBondProgress(data?.bond_xp||0);
  window.hydrateNoiEvents?.();
}
window.hydrateBondSummary=hydrateBondSummary;

// ===== M12C · Risonanza V2 — recent real growth, read-only =====
// "Ultime crescite" (a fold under the collection, as in the mockup): missions,
// lived events and mesiversari, newest first, each with the points it gave.
const RESONANCE_HISTORY_LIMIT=6;
const resonanceTime=at=>{const t=Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(String(at||''))?`${at}T12:00:00`:at);return Number.isFinite(t)?t:0;};
function resonanceHistoryEntries(quests,eventCompletions,eventHistory,milestones=[]){
  const historyByRef=new Map((eventHistory||[]).filter(row=>row?.source_ref).map(row=>[String(row.source_ref),row]));
  const byKey=new Map();
  for(const row of quests||[]){
    const xp=Math.max(0,Number(row?.xp)||0);
    if(!row?.id||!row.completed_at||xp<=0)continue;
    const sourceKey=`quest:${row.id}`;
    if(!byKey.has(sourceKey))byKey.set(sourceKey,{kind:'quest',sourceKey,title:row.title||'Missione di coppia',xp,at:row.completed_at,titleSource:'snapshot'});
  }
  for(const row of eventCompletions||[]){
    const xp=Math.max(0,Number(row?.xp_awarded)||0);
    if(!row?.id||!row.completed_at||xp<=0)continue;
    const history=historyByRef.get(String(row.id));
    const sourceKey=`shared_event_completion:${row.id}`;
    const title=history?.title||row.event_title_snapshot||'Evento vissuto';
    if(!byKey.has(sourceKey))byKey.set(sourceKey,{kind:'event',sourceKey,title,xp,at:row.completed_at,titleSource:history?.title_source||(row.event_title_snapshot?'snapshot':'missing')});
  }
  for(const row of milestones||[]){
    const months=Math.max(0,Math.floor(Number(row?.months_together)||0));
    if(!row?.milestone_date||!months)continue;
    const kind=row.kind==='anniversary'?'anniversary':'monthiversary';
    const sourceKey=`milestone:${row.milestone_date}:${kind}`;
    if(!byKey.has(sourceKey))byKey.set(sourceKey,{kind:'milestone',milestone:kind,months,sourceKey,title:'',xp:Math.max(0,Number(row.xp_awarded)||0),at:row.milestone_date});
  }
  return [...byKey.values()]
    .sort((a,b)=>resonanceTime(b.at)-resonanceTime(a.at)||(a.sourceKey<b.sourceKey?-1:a.sourceKey>b.sourceKey?1:0))
    .slice(0,RESONANCE_HISTORY_LIMIT);
}
function resonanceHistoryDate(at){
  const t=resonanceTime(at);
  return t?new Date(t).toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{day:'numeric',month:'short'}):'';
}
// The mockup's row: an icon, what it was, "what · when", and its points.
function resonanceHistoryWhat(entry){
  if(entry.kind==='milestone'){
    if(entry.milestone==='anniversary'){const years=Math.max(1,Math.round(entry.months/12));return {title:'Anniversario',detail:years===1?'1 anno insieme':`${years} anni insieme`,own:false};}
    return {title:'Mesiversario',detail:entry.months===1?'1 mese insieme':`${entry.months} mesi insieme`,own:false};
  }
  return {title:entry.kind==='quest'?'Missione di coppia':'Evento vissuto',detail:entry.title,own:entry.kind==='event'&&entry.titleSource!=='missing',live:entry.kind==='event'&&entry.titleSource==='live'};
}
function renderResonanceHistory(entries){
  const root=document.getElementById('noiResonanceHistory');
  if(!root)return;
  root.setAttribute('aria-busy','false');
  placeResonanceHistory(root);
  // The same rows are never rebuilt (Sintonia hydrates on every tab switch, while its entrance plays).
  const paint=(html)=>{if(root.__usMarkup===html&&root.innerHTML)return;root.__usMarkup=html;root.innerHTML=html;};
  if(!entries?.length){
    paint('<div class="noi-resonance-history-empty"><b>La prossima crescita apparirà qui</b><span>Missioni, eventi vissuti e mesiversari: le cose che fate insieme.</span></div>');
    return;
  }
  paint(entries.map(entry=>{
    const date=resonanceHistoryDate(entry.at);
    const what=resonanceHistoryWhat(entry);
    const detail=`<span${what.own?' translate="no"':''}>${escapeHtml(what.detail)}</span>${what.live?' <span>(titolo attuale)</span>':''}${date?` · <time>${escapeHtml(date)}</time>`:''}`;
    return `<article class="noi-resonance-history-row" data-resonance-source="${escapeHtml(entry.sourceKey)}" data-resonance-kind="${escapeHtml(entry.kind)}"><span class="noi-resonance-history-mark" aria-hidden="true"></span><p class="noi-resonance-history-copy">${escapeHtml(what.title)}<small>${detail}</small></p>${entry.xp>0?`<b class="noi-resonance-history-xp">+${entry.xp} XP</b>`:''}</article>`;
  }).join(''));
}
// The fold sits after the collection, as in the mockup.
function placeResonanceHistory(root){
  const section=root?.closest?.('.noi-resonance-history');
  const rewards=section?.parentElement?.querySelector?.(':scope > .us-progression-rewards-section');
  if(rewards&&rewards.nextElementSibling!==section)rewards.after(section);
}
async function hydrateResonanceHistory(){
  const profile=window.usProfile;
  const root=document.getElementById('noiResonanceHistory');
  if(!profile||!root)return;
  placeResonanceHistory(root);
  root.setAttribute('aria-busy','true');
  const coupleId=profile.couple_id;
  const [{data:quests,error:questError},{data:events,error:eventError},{data:history,error:historyError},{data:milestones,error:milestoneError}]=await Promise.all([
    usReadLocalized(columns=>sb.from('bond_weekly_quests').select(columns).eq('couple_id',coupleId).not('completed_at','is',null).order('completed_at',{ascending:false}).limit(8),'id,title,xp,completed_at','title_localized').then(usLocalizedTitles),
    sb.from('shared_event_completions').select('id,xp_awarded,completed_at,event_title_snapshot').eq('couple_id',coupleId).order('completed_at',{ascending:false}).limit(8),
    sb.from('relationship_event_history').select('source_ref,title,title_source,completed_at').order('completed_at',{ascending:false}).limit(8),
    sb.from('relationship_milestones').select('milestone_date,kind,months_together,xp_awarded').eq('couple_id',coupleId).order('milestone_date',{ascending:false}).limit(6)
  ]);
  if(window.usProfile!==profile)return;
  if(questError)console.warn(questError);
  if(eventError)console.warn(eventError);
  if(historyError)console.warn(historyError);
  if(milestoneError)console.warn(milestoneError);
  if(questError&&eventError&&milestoneError){
    root.setAttribute('aria-busy','false');
    root.__usMarkup='';
    root.innerHTML='<div class="noi-resonance-history-empty"><b>Crescita non disponibile</b><span>Riprova tra un momento.</span></div>';
    return;
  }
  renderResonanceHistory(resonanceHistoryEntries(questError?[]:(quests||[]),eventError?[]:(events||[]),historyError?[]:(history||[]),milestoneError?[]:(milestones||[])));
}
window.hydrateResonanceHistory=hydrateResonanceHistory;
window.UsResonance=Object.freeze({historyEntries:resonanceHistoryEntries,renderHistory:renderResonanceHistory});

function hashSeed(text){
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  return h>>>0;
}
async function currentQuestMode(){
  // Distance comes from couple_distance(); the partner's coordinates are not readable.
  if(!Number.isFinite(window.usDistanceKm)){try{await window.hydrateDistance?.();}catch(_e){}}
  if(!Number.isFinite(window.usDistanceKm))return 'any';
  return window.usDistanceKm>50?'far':'near';
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
// M12D: a reroll proposes the same mode-eligible, not-already-on-the-board
// templates as before, but picks deterministically (no Math.random): both
// phones propose the same replacement and reroll_bond_quest stays the authority.
function pickRerollQuestTemplate(templates,mode,usedKeys,seedText){
  const used=usedKeys instanceof Set?usedKeys:new Set(usedKeys||[]);
  const candidates=(templates||[]).filter(t=>(t.mode==='any'||t.mode===mode)&&!used.has(t.key)).sort((a,b)=>a.key.localeCompare(b.key));
  return candidates.length?candidates[hashSeed(seedText)%candidates.length]:null;
}
async function ensureBondWeek(profile=window.usProfile){
  if(!profile)return;
  const {error}=await sb.rpc('ensure_bond_week');
  if(error)console.warn(error);
}

// ===== M12D · Quest V2 — one weekly board over the existing Quest domain =====
// Server authority is explicit: ensure_bond_week owns weekly creation,
// confirm_bond_quest owns both-partner completion and the XP award, and
// reroll_bond_quest owns the weekly reroll budget. The client only reads the
// persisted bond_weekly_state / bond_weekly_quests rows and invokes those RPCs.
const QUEST_SLOTS=3,QUEST_WEEKLY_REROLLS=3,QUEST_RECENT_WEEKS=3;
const questActionsInFlight=new Set();
let questBoardSeq=0,questBoardView=null;
function questCategoryLabel(category){
  return ({connection:'Connessione',fun:'Divertimento',adventure:'Avventura',discover:'Scoperta',memory:'Ricordo',surprise:'Sorpresa',chill:'Relax'})[category]||category||'Missione';
}
// Missions that ask for a photo open "add a memory" (the Ricordi composer).
const QUEST_PHOTO_KEYS=new Set(['any-week-photo','any-intentional-memory','any-old-photo','far-thought-photo','near-recreate-photo']);
function questAsksPhoto(q){return QUEST_PHOTO_KEYS.has(String(q?.template_key||''));}
function questRerollsLeft(state){
  return Math.max(0,QUEST_WEEKLY_REROLLS-Math.max(0,Number(state?.rerolls_used)||0));
}
function questOwnerKey(profile){return profile?`${profile.couple_id}|${profile.id}`:'';}
function questPartner(profiles,me){return (profiles||[]).find(p=>p&&p.id!==me)||null;}
function questViewState(q,{me,partnerId,rerollsLeft}){
  const confirmed=(Array.isArray(q?.confirmed_by)?q.confirmed_by:[]).map(String);
  const mine=Boolean(me)&&confirmed.includes(String(me));
  const partner=partnerId?confirmed.includes(String(partnerId)):confirmed.some(id=>id!==String(me));
  const completed=Boolean(q?.completed_at);
  const status=completed?'completed':mine?'you-confirmed':partner?'partner-confirmed':'available';
  const lockReason=completed?'completed':confirmed.length?'confirmed':rerollsLeft<=0?'budget':null;
  return {status,mine,partner,completed,rerollable:!lockReason,lockReason};
}
function questBoardSummary(quests,state){
  const rows=Array.isArray(quests)?quests:[];
  return {total:QUEST_SLOTS,present:rows.length,completed:rows.filter(q=>q?.completed_at).length,rerollsLeft:questRerollsLeft(state)};
}
function questRecentWeeks(rows,currentWeek,limit=QUEST_RECENT_WEEKS){
  const byWeek=new Map();
  for(const row of rows||[]){
    if(!row?.week_start||row.week_start>=currentWeek)continue;
    if(!byWeek.has(row.week_start))byWeek.set(row.week_start,[]);
    byWeek.get(row.week_start).push(row);
  }
  return [...byWeek.entries()].sort((a,b)=>a[0]<b[0]?1:-1).slice(0,limit).map(([week,list])=>{
    const done=list.filter(q=>q.completed_at).sort((a,b)=>(a.slot||0)-(b.slot||0));
    return {week,completed:done.length,total:Math.max(QUEST_SLOTS,list.length),titles:done.map(q=>q.title||'Missione di coppia')};
  });
}
function questIcon(name){return `<span class="us-icon" data-us-icon="${name}" aria-hidden="true"></span>`;}
function questCountLabel(n,one,many){return `${n} ${n===1?one:many}`;}
function renderQuestWeekHeader(summary,week,{stale=false}={}){
  const marks=Array.from({length:summary.total},(_,i)=>`<i class="${i<summary.completed?'is-done':''}"></i>`).join('');
  // The two numbers of the mockup: done this week, changes left.
  const rerollText=summary.rerollsLeft>0?`<b>${summary.rerollsLeft}</b> ${summary.rerollsLeft===1?'cambio rimasto':'cambi rimasti'}`:'<b>0</b> Cambi finiti';
  return `<div class="quest-week-top"><div class="quest-week-id"><span class="tiny">Questa settimana</span><b>${escapeHtml(questWeekRangeLabel(week))}</b></div><div class="quest-week-count"><b>${summary.completed}</b><span>/ ${summary.total}</span><small>completate</small></div></div>
    <div class="quest-week-track" role="progressbar" aria-label="Missioni completate questa settimana" aria-valuemin="0" aria-valuemax="${summary.total}" aria-valuenow="${summary.completed}" aria-valuetext="${summary.completed} di ${summary.total} completate">${marks}</div>
    <div class="quest-week-meta"><span class="quest-week-rerolls" data-quest-rerolls="${summary.rerollsLeft}">${rerollText}</span><span class="quest-week-reset">${questIcon('calendar-heart')}Nuove missioni ${escapeHtml(nextWeekLabel(week))}</span></div>
    ${stale?`<div class="quest-week-stale" role="status"><span>Non aggiornato: controlla la connessione.</span><button type="button" class="quest-week-retry" data-quest-retry>Riprova</button></div>`:''}`;
}
function questStatusLine(view,partnerName){
  if(view.status==='completed')return `${questIcon('check')}<span>Completata insieme</span>`;
  if(view.status==='you-confirmed')return `<span>Hai confermato · aspettiamo ${escapeHtml(partnerName)}</span>`;
  if(view.status==='partner-confirmed')return `<span>${escapeHtml(partnerName)} ha confermato · manca la tua conferma</span>`;
  return '<span>Si completa quando confermate tutti e due</span>';
}
function renderBondQuest(q,ctx){
  const me=ctx.me,partner=ctx.partner;
  const view=questViewState(q,{me,partnerId:partner?.id,rerollsLeft:ctx.rerollsLeft});
  const partnerName=partner?.display_name||'la tua persona';
  const confirmBusy=questActionsInFlight.has(`confirm:${q.id}`);
  const rerollBusy=questActionsInFlight.has(`reroll:${q.id}`);
  const confirmText=confirmBusy?'Confermo…':view.completed?'Completata':view.mine?'Confermata da te':view.partner?'Conferma anche tu':'Ho completato questa missione';
  const confirmDisabled=view.completed||view.mine||confirmBusy;
  const person=(name,done,label,own=false)=>`<li class="quest-person ${done?'checked':''}"><span class="quest-person-initial" aria-hidden="true">${escapeHtml((name||'?').slice(0,1).toUpperCase())}</span><span class="quest-person-name"${own?' translate="no"':''}>${escapeHtml(label)}</span><span class="quest-person-state">${done?`${questIcon('check')}<span class="sr-only">confermato</span>`:'in attesa'}</span></li>`;
  const lockText=view.lockReason==='confirmed'?'Già confermata: non si può più cambiare':'Cambi finiti per questa settimana';
  const reroll=view.completed?'':view.rerollable
    ?`<button type="button" class="quest-reroll" data-quest-action="reroll" ${rerollBusy?'disabled aria-busy="true"':''} onclick="rerollBondQuest('${escapeHtml(q.id)}')" aria-label="Cambia questa missione (${questCountLabel(ctx.rerollsLeft,'cambio rimasto','cambi rimasti')})">${questIcon('arrows-clockwise')}<span class="quest-reroll-label" aria-hidden="true">Cambia</span></button>`
    :`<button type="button" class="quest-reroll is-locked" data-quest-action="reroll" disabled aria-label="${lockText}" title="${lockText}">${questIcon('lock')}</button>`;
  // Done together: offer to keep it as a memory. A photo mission opens the
  // same door before, so the photo can be added right away.
  const memory=view.completed
    ?`<button type="button" class="quest-memory" data-quest-action="memory" onclick="addQuestMemory('${escapeHtml(q.id)}')">${questIcon('image')}<span>Salvatelo come ricordo</span></button>`
    :questAsksPhoto(q)?`<button type="button" class="quest-memory" data-quest-action="photo" onclick="addQuestMemory('${escapeHtml(q.id)}')">${questIcon('image')}<span>Aggiungi la foto</span></button>`:'';
  return `<article class="bond-quest quest-v2 ${view.completed?'completed':''}" data-quest-id="${escapeHtml(q.id)}" data-quest-slot="${escapeHtml(q.slot)}" data-quest-state="${view.status}" data-quest-reroll="${view.rerollable?'rerollable':'locked'}">
    <div class="quest-top"><span class="quest-category">${escapeHtml(questCategoryLabel(q.category))}</span></div>
    <h4>${escapeHtml(q.title)}</h4>
    <p class="quest-status">${questStatusLine(view,partnerName)}</p>
    <ul class="quest-confirmers" aria-label="Conferme">${person(ctx.myName,view.mine,'Tu')}${person(partnerName,view.partner,partnerName,Boolean(partner?.display_name))}</ul>
    <div class="quest-actions">
      <button type="button" class="quest-confirm ${confirmDisabled?'confirmed':''}" data-quest-action="confirm" ${confirmDisabled?'disabled':''} ${confirmBusy?'aria-busy="true"':''} onclick="confirmBondQuest('${escapeHtml(q.id)}')">${confirmText}</button>
      ${reroll}
    </div>
    ${memory}
  </article>`;
}
// The existing "add a memory" door, with the mission as its suggested note.
// The couple still picks the photo; nothing is created on their behalf.
function addQuestMemory(id){
  const quest=(window.usBondQuests||[]).find(q=>q.id===id);
  if(quest)openMemoryComposer(quest.title||'');
}
window.addQuestMemory=addQuestMemory;
function renderQuestRecent(weeks){
  const root=document.getElementById('questRecent');
  const list=document.getElementById('questRecentList');
  if(!root||!list)return;
  if(!weeks?.length){root.hidden=true;list.innerHTML='';return;}
  // The mockup's folder rows: the week, how many were done, which ones.
  list.innerHTML=weeks.map(w=>`<li class="quest-recent-week" data-quest-week="${escapeHtml(w.week)}"><i class="quest-recent-icon" aria-hidden="true">${questIcon('flag-banner')}</i><span class="quest-recent-head"><b>${escapeHtml(questWeekRangeLabel(w.week,'long'))}</b><span>${w.completed} di ${w.total} completate</span><span class="quest-recent-titles">${w.titles.length?w.titles.map(escapeHtml).join(' · '):'Nessuna completata'}</span></span></li>`).join('');
  root.hidden=false;
}
function paintQuestBoard(){
  const v=questBoardView;
  const list=document.getElementById('bondQuestList');
  if(!v||!list||list.dataset.owner!==v.owner)return;
  const summary=questBoardSummary(v.quests,v.state);
  const header=document.getElementById('questWeekBoard');
  if(header){header.innerHTML=renderQuestWeekHeader(summary,v.week,{stale:v.stale});header.hidden=false;}
  const kicker=document.getElementById('noiQuestKicker');
  if(kicker)kicker.textContent=`Questa settimana · ${questWeekRangeLabel(v.week)}`;
  const ctx={me:v.me,partner:questPartner(v.profiles,v.me),rerollsLeft:summary.rerollsLeft,myName:v.myName};
  const signature=JSON.stringify([v.week,summary.rerollsLeft,[...questActionsInFlight].sort(),v.quests.map(q=>[q.id,q.slot,q.template_key,q.title,q.category,q.rarity,q.xp,q.confirmed_by,q.completed_at]),(v.profiles||[]).map(p=>[p.id,p.display_name])]);
  if(list.dataset.loaded==='1'&&list.dataset.signature===signature)return;
  list.innerHTML=v.quests.map(q=>renderBondQuest(q,ctx)).join('')||'<div class="empty-state quest-empty"><b>Le missioni della settimana stanno arrivando</b><p>Riprova tra un momento.</p><button type="button" class="ghost quest-week-retry" data-quest-retry>Riprova</button></div>';
  list.dataset.loaded='1';list.dataset.signature=signature;
}
function resetQuestBoard(list,owner){
  list.dataset.owner=owner;list.dataset.loaded='';list.dataset.signature='';
  questBoardView=null;questActionsInFlight.clear();
  window.usBondQuests=[];window.usBondState=null;window.usBondProfiles=[];
  const header=document.getElementById('questWeekBoard');if(header){header.innerHTML='';header.hidden=true;}
  renderQuestRecent([]);
}
async function hydrateBond(){
  const profile=window.usProfile;
  if(!profile)return;
  const list=document.getElementById('bondQuestList');
  if(!list)return;
  const owner=questOwnerKey(profile);
  // Identity switch: never keep the previous actor's or couple's confirmations on screen.
  if(list.dataset.owner!==owner)resetQuestBoard(list,owner);
  const seq=++questBoardSeq;
  const current=()=>seq===questBoardSeq&&questOwnerKey(window.usProfile)===owner;
  if(list.dataset.loaded!=='1')list.innerHTML='<div class="empty-state" aria-busy="true"><div class="emoji">✦</div><b>Carico…</b></div>';
  const week=weekStartISO(),coupleId=profile.couple_id;
  await ensureBondWeek(profile);
  if(!current())return;
  const [{data:state,error:stateError},{data:quests,error:questError},{data:profiles,error:profilesError},{data:couple,error:coupleError},{count:completedCount,error:countError},{data:recent,error:recentError}]=await Promise.all([
    sb.from('bond_weekly_state').select('rerolls_used').eq('couple_id',coupleId).eq('week_start',week).maybeSingle(),
    usReadLocalized(columns=>sb.from('bond_weekly_quests').select(columns).eq('couple_id',coupleId).eq('week_start',week).order('slot'),'id,slot,template_key,title,category,rarity,xp,confirmed_by,completed_at','title_localized').then(usLocalizedTitles),
    sb.from('profiles').select('id,display_name,role,couple_id').eq('couple_id',coupleId),
    sb.from('couples').select('bond_xp').eq('id',coupleId).maybeSingle(),
    sb.from('bond_weekly_quests').select('id',{count:'exact',head:true}).eq('couple_id',coupleId).not('completed_at','is',null),
    usReadLocalized(columns=>sb.from('bond_weekly_quests').select(columns).eq('couple_id',coupleId).lt('week_start',week).order('week_start',{ascending:false}).order('slot').limit(QUEST_SLOTS*QUEST_RECENT_WEEKS),'id,week_start,slot,title,completed_at','title_localized').then(usLocalizedTitles)
  ]);
  if(!current())return;
  if(stateError||questError||profilesError||coupleError){
    console.warn(stateError||questError||profilesError||coupleError);
    if(list.dataset.loaded==='1'&&questBoardView){questBoardView.stale=true;list.dataset.signature='';paintQuestBoard();}
    else list.innerHTML='<div class="empty-state quest-error" role="status"><div class="emoji">!</div><b>Missioni non disponibili</b><p>Controlla la connessione e riprova.</p><button type="button" class="ghost quest-week-retry" data-quest-retry>Riprova</button></div>';
    return;
  }
  if(countError)console.warn(countError);
  if(recentError)console.warn(recentError);
  window.usBondProfiles=profiles||[];
  window.usBondState=state||{rerolls_used:0};
  window.usBondQuests=quests||[];
  renderBondProgress(couple?.bond_xp||0);
  const countEl=document.getElementById('bondCompletedCount');if(countEl)countEl.textContent=`${Number(completedCount||0)} missioni completate`;
  const rerollEl=document.getElementById('bondRerollsLeft');if(rerollEl)rerollEl.textContent=questRerollsLeft(state);
  const resetEl=document.getElementById('bondWeekReset');if(resetEl)resetEl.textContent=`Nuove missioni ${nextWeekLabel(week)}`;
  const me=profile.id;
  questBoardView={owner,week,me,myName:profile.display_name||'Tu',profiles:profiles||[],state:state||{rerolls_used:0},quests:quests||[],stale:false};
  paintQuestBoard();
  renderQuestRecent(recentError?[]:questRecentWeeks(recent,week));
}
window.hydrateBond=hydrateBond;
function setQuestAction(key,busy){
  if(busy)questActionsInFlight.add(key);else questActionsInFlight.delete(key);
  const list=document.getElementById('bondQuestList');if(list)list.dataset.signature='';
  paintQuestBoard();
}
async function confirmBondQuest(id){
  const profile=window.usProfile;
  if(!profile||!id)return;
  const key=`confirm:${id}`;
  if(questActionsInFlight.has(key))return;
  const current=(window.usBondQuests||[]).find(q=>q.id===id);
  if(current&&(current.completed_at||(current.confirmed_by||[]).includes(profile.id)))return;
  const owner=questOwnerKey(profile);
  setQuestAction(key,true);
  let result;
  try{result=await sb.rpc('confirm_bond_quest',{target_quest_id:id});}
  catch(error){result={data:null,error};}
  finally{questActionsInFlight.delete(key);}
  if(questOwnerKey(window.usProfile)!==owner)return;
  if(result.error){console.warn(result.error);toast('Conferma non riuscita. Riprova.');}
  else{
    sendWebPushEvent('quest_confirmed',id).catch(()=>{});
    const awarded=Number(result.data?.xp_awarded)||0;
    const partnerName=questPartner(window.usBondProfiles,profile.id)?.display_name||'';
    // As the mockup: the card sparkles, the sheet closes and Sintonia shows the points growing.
    if(awarded>0){if(!window.USProgression?.missionCompleted?.({xp:awarded,questId:id})){toast('Missione completata insieme ♡');window.UsFeedback?.success?.();}}
    else toast(partnerName?`Confermata. Ora tocca a ${partnerName} ♡`:'Confermata. Ora tocca alla tua persona ♡');
  }
  setQuestAction(key,false);
  await hydrateBond();
  await hydrateBondSummary();
}
window.confirmBondQuest=confirmBondQuest;
async function rerollBondQuest(id){
  const profile=window.usProfile;
  if(!profile||!id)return;
  const key=`reroll:${id}`;
  // One reroll at a time per phone: the weekly budget is shared by the whole board.
  if([...questActionsInFlight].some(k=>k.startsWith('reroll:')))return;
  const state=window.usBondState;
  const rerollsLeft=questRerollsLeft(state||{rerolls_used:QUEST_WEEKLY_REROLLS});
  if(rerollsLeft<=0)return toast('Avete finito i cambi di questa settimana');
  const current=(window.usBondQuests||[]).find(q=>q.id===id);
  if(!current)return;
  const view=questViewState(current,{me:profile.id,partnerId:questPartner(window.usBondProfiles,profile.id)?.id,rerollsLeft});
  if(!view.rerollable)return toast(view.completed?'Questa missione è già completata':'Questa missione è già stata confermata');
  const owner=questOwnerKey(profile);
  setQuestAction(key,true);
  let result=null;
  try{
    const week=weekStartISO();
    const [mode,{data:templates,error}]=await Promise.all([
      currentQuestMode(),
      sb.from('bond_quest_templates').select('key,title,category,rarity,xp,mode').eq('active',true)
    ]);
    if(error||!templates?.length){console.warn(error);result={skip:'Nessuna missione disponibile'};}
    else{
      const used=new Set((window.usBondQuests||[]).map(q=>q.template_key));
      const pick=pickRerollQuestTemplate(templates,mode,used,`${profile.couple_id}|${week}|${current.slot}|reroll|${Number(state?.rerolls_used)||0}|${current.template_key}`);
      result=pick?await sb.rpc('reroll_bond_quest',{target_quest_id:id,target_template_key:pick.key}):{skip:'Nessuna alternativa disponibile'};
    }
  }catch(error){result={error};}
  finally{questActionsInFlight.delete(key);}
  if(questOwnerKey(window.usProfile)!==owner)return;
  if(result?.skip)toast(result.skip);
  else if(result?.error){console.warn(result.error);toast(String(result.error.message||'').includes('No rerolls')?'Avete finito i cambi di questa settimana':'Cambio non riuscito. Riprova.');}
  else{
    const used=Number(result?.data?.rerolls_used);
    toast(Number.isFinite(used)?`Nuova missione · ${questCountLabel(Math.max(0,QUEST_WEEKLY_REROLLS-used),'cambio rimasto','cambi rimasti')}`:'Nuova missione');
  }
  setQuestAction(key,false);
  await hydrateBond();
}
window.rerollBondQuest=rerollBondQuest;
document.addEventListener('click',event=>{
  if(!event.target?.closest?.('[data-quest-retry]'))return;
  event.preventDefault();
  hydrateBond();
});
window.addEventListener('online',()=>{if(document.getElementById('bond')?.classList.contains('active'))hydrateBond();});
window.UsQuest=Object.freeze({viewState:questViewState,summary:questBoardSummary,recentWeeks:questRecentWeeks,pickReroll:pickRerollQuestTemplate,weekStart:weekStartISO,weekRange:questWeekRangeLabel,nextWeek:nextWeekLabel});

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
function noiIdeaCardHtml(item,{lived=false}={}){
  // A lived idea reads like the mockup's history row: the title and "Vissuta insieme".
  if(lived)return `<button type="button" class="noi-idea-card is-lived" data-id="${escapeHtml(item.id)}"><span class="noi-idea-card-copy"><b translate="no">${escapeHtml(item.title)}</b><small>Vissuta insieme</small></span></button>`;
  const label=noiIdeaStateLabel(item);
  const noteHtml=item.note?`<small translate="no">${escapeHtml(noiIdeaSnippet(item.note))}</small>`:'';
  return `<button type="button" class="noi-idea-card" data-id="${escapeHtml(item.id)}"><span class="noi-idea-card-copy"><b translate="no">${escapeHtml(item.title)}</b>${noteHtml}</span>${label?`<span class="noi-idea-state">${escapeHtml(label)}</span>`:''}</button>`;
}
function renderNoiIdeaActiveList(){
  const root=document.getElementById('noiIdeaList');
  if(!root)return;
  root.setAttribute('aria-busy','false');
  if(noiIdeaState.error){
    root.innerHTML='<div class="empty-state noi-idea-error"><div class="emoji">!</div><b>Non riesco a caricare le idee.</b><p>Riprova tra un momento.</p><button type="button" onclick="hydrateNoiIdeas()">Riprova</button></div>';
    return;
  }
  if(!noiIdeaState.activeItems.length){
    root.innerHTML='<div class="noi-quiet-state"><b>Niente in lista</b><span>Aggiungete la prima.</span></div>';
    return;
  }
  root.innerHTML=noiIdeaState.activeItems.map(noiIdeaCardHtml).join('');
}
function renderNoiIdeaLivedList(){
  const toggle=document.getElementById('noiIdeaLivedToggle');
  const root=document.getElementById('noiIdeaLivedList');
  if(!toggle||!root)return;
  toggle.hidden=!noiIdeaState.livedItems.length;
  toggle.textContent=`Idee vissute (${noiIdeaState.livedItems.length})`;
  // The mockup's fold: the count, then one quiet line under it.
  const sub=document.createElement?.('small');
  if(sub){sub.textContent='Quelle che avete già fatto';toggle.append?.(sub);}
  toggle.setAttribute('aria-expanded',String(noiIdeaState.showLived));
  root.hidden=!noiIdeaState.showLived;
  root.innerHTML=noiIdeaState.showLived?noiIdeaState.livedItems.map(item=>noiIdeaCardHtml(item,{lived:true})).join(''):'';
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
  return d.toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{day:'numeric',month:'long',year:'numeric'});
}
function noiIdeaPartnerName(){
  return usIdentity().partnerName;
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
  openNoiSection('quest');
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
  // Inside Missioni, an open idea is the whole screen until Back.
  const living=document.querySelector('#bond .noi-living-section');
  if(living?.dataset)living.dataset.ideaDetail='open';
  window.scrollTo?.({top:0,behavior:'auto'});
  titleEl?.focus({preventScroll:true});
}
function closeNoiIdeaDetail(){
  noiIdeaState.selectedId=null;
  const browse=document.getElementById('noiIdeaBrowse');
  const detail=document.getElementById('noiIdeaDetail');
  if(detail)detail.hidden=true;
  if(browse)browse.hidden=false;
  const living=document.querySelector('#bond .noi-living-section');
  if(living?.dataset)delete living.dataset.ideaDetail;
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
// Il ponte verso Ricordi: the gallery opens right away (R1) with the title as
// a suggested note, and the photo becomes this idea's memory (R6). Nothing is
// created until a photo is chosen.
function addNoiIdeaMemory(){
  const item=noiIdeaState.selectedId?noiIdeaFindItem(noiIdeaState.selectedId):null;
  if(!item||item.status!=='lived')return;
  const date=ricordiLocalISO(item.completed_at)||undefined;
  openMemoryComposer(item.title,{kind:'da_vivere',ref:item.id,date});
}
// The Ricordi composer over Ricordi with a suggested note (ideas, missions).
// pick() runs inside the tap so the phone lets it open the gallery.
function openMemoryComposer(caption,source=null){
  const composer=window.UsMomentComposer;
  go('moments',{nav:true});
  if(typeof composer?.pick==='function'){composer.pick(source?{caption,source}:{caption});return;}
  if(typeof composer?.open==='function')setTimeout(()=>composer.open({caption}),60);
}
window.openMemoryComposer=openMemoryComposer;
document.getElementById('noiIdeaDetailLived')?.addEventListener('click',markNoiIdeaLived);
document.getElementById('noiIdeaDetailMemoryAdd')?.addEventListener('click',addNoiIdeaMemory);
document.getElementById('noiIdeaDetailSchedule')?.addEventListener('click',scheduleNoiIdea);
document.getElementById('noiIdeaDetailOpenCalendar')?.addEventListener('click',openNoiIdeaCalendarEntry);
window.openNoiIdeaDetail=openNoiIdeaDetail;
window.closeNoiIdeaDetail=closeNoiIdeaDetail;

// ===== M9D · Noi sections =====
// Missioni (with "Le vostre idee" inside) opens as a Foglio over the Noi
// calendar (no new tab), Eventi as the "I nostri eventi" Foglio of events.js.
// The way back is navigation.js's 'noi-section' layer (the section bar is
// marked open), so the system Back works too.
const NOI_SECTIONS=['resonance','da-vivere','quest','eventi'];
function noiCanonicalPage(){return document.querySelector('#bond .noi-canonical-page');}
function noiSectionSheet(view){return view==='quest'?document.getElementById('noiQuestSheet'):null;}
function openNoiSection(view){
  const page=noiCanonicalPage();
  if(!page||!NOI_SECTIONS.includes(view))return;
  // Le vostre idee (once "Da vivere") is a part of Missioni.
  if(view==='da-vivere')view='quest';
  if(view==='eventi'){window.openEvents?.();return;}
  if(page.dataset.noiView===view)return;
  page.dataset.noiView=view;
  const bar=document.getElementById('noiSectionBar');if(bar)bar.hidden=false;
  const sheet=noiSectionSheet(view);
  if(sheet){
    window.UsUiFoundation?.cancelSurfaceExit?.(sheet);
    sheet.classList?.add?.('open');sheet.setAttribute?.('aria-hidden','false');
    const panel=sheet.querySelector?.('[data-us-modal-panel]');if(panel)panel.scrollTop=0;
  }else{
    scrollTo({top:0,behavior:'auto'});
    document.getElementById('noiSectionBack')?.focus({preventScroll:true});
  }
  if(view==='resonance'){window.hydrateResonanceHistory?.();window.USProgression?.hydrate?.({showUnlocks:true,force:true});}
  if(view==='quest'&&window.usProfile){hydrateBond();if(!noiIdeaState.loaded)hydrateNoiIdeas();}
}
function closeNoiSection(){
  const page=noiCanonicalPage();
  if(!page||!page.dataset.noiView||page.dataset.noiView==='hub')return;
  const from=page.dataset.noiView;
  page.dataset.noiView='hub';
  if(from==='quest'){closeNoiIdeaDetail();toggleNoiIdeaQuickForm(false);}
  const bar=document.getElementById('noiSectionBar');if(bar)bar.hidden=true;
  const sheet=noiSectionSheet(from);
  if(sheet){
    // The Foglio leaves with the shared sheet exit; focus returns to its tile.
    const done=()=>{sheet.classList?.remove?.('open');sheet.setAttribute?.('aria-hidden','true');};
    if(window.UsUiFoundation?.exitSurface)window.UsUiFoundation.exitSurface(sheet,done);else done();
    return;
  }
  if(document.getElementById('bond')?.classList.contains('active')){
    scrollTo({top:0,behavior:'auto'});
    document.querySelector(`#usNoiV2 [data-noi-open-link="${from}"]`)?.focus({preventScroll:true});
  }
}
window.openNoiSection=openNoiSection;
window.closeNoiSection=closeNoiSection;
document.getElementById('noiSectionBack')?.addEventListener('click',closeNoiSection);
document.getElementById('noiQuestSheet')?.addEventListener('click',(event)=>{if(event.target.closest('[data-noi-sheet-close]'))closeNoiSection();});
// "Settimane passate" folds open and closed, like the mockup's .fold.
document.getElementById('questRecentToggle')?.addEventListener('click',(event)=>{
  const root=document.getElementById('questRecent');if(!root)return;
  const open=root.dataset.open!=='true';
  root.dataset.open=String(open);event.currentTarget.setAttribute('aria-expanded',String(open));
});
document.addEventListener?.('keydown',(event)=>{if(event.key==='Escape'&&document.getElementById('noiQuestSheet')?.classList.contains('open')&&!document.querySelector('.us-cal-sheet-overlay.open,#usEventsOverlay.open,.us-confirm.open'))closeNoiSection();});
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
function partnerFromProfiles(profiles){const me=window.usProfile;return me?.couple_id?(profiles||[]).find(p=>p.couple_id===me.couple_id&&p.id!==me.id)||null:null;}
async function getCoupleProfiles(){
  const profile=window.usProfile,coupleId=profile?.couple_id;
  if(!profile||!coupleId)return [];
  if(window.usBondProfiles?.some(p=>p.id===profile.id&&p.couple_id===coupleId))return window.usBondProfiles.filter(p=>p.couple_id===coupleId);
  const {data,error}=await sb.from('profiles').select('id,display_name,role,couple_id').eq('couple_id',coupleId);
  if(window.usProfile!==profile||window.usProfile?.couple_id!==coupleId)return [];
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
  const identityProfile=window.usProfile,identityCouple=identityProfile?.couple_id;
  if(!identityProfile)return;
  const [profiles,{data:rows,error},{count,error:countError}]=await Promise.all([
    getCoupleProfiles(),
    sb.from('shared_messages').select('id,sender_id,recipient_id,kind,created_at').eq('kind','think').order('created_at',{ascending:false}).limit(60),
    sb.from('shared_messages').select('id',{count:'exact',head:true}).eq('kind','think').gte('created_at',new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString())
  ]);
  if(window.usProfile!==identityProfile||window.usProfile?.couple_id!==identityCouple)return;
  if(error){console.warn(error);return;}if(countError)console.warn(countError);
  const messageIds=(rows||[]).map(row=>row.id).filter(Boolean);
  let reactionRows=[];
  if(messageIds.length){
    const reactionResult=await sb.from('think_reactions').select('message_id,reaction,updated_at').in('message_id',messageIds);
    if(reactionResult.error)console.warn('[US Think] reactions',reactionResult.error);else reactionRows=reactionResult.data||[];
  }
  if(window.usProfile!==identityProfile||window.usProfile?.couple_id!==identityCouple)return;
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
  const monthEl=document.getElementById('thinkMonthCount');if(monthEl)monthEl.textContent=Number(count||0).toLocaleString((globalThis.UsI18n?.tag||'it-IT'));
  const live=document.getElementById('thinkLiveText');if(live&&received)live.textContent=`Ultimo segnale da ${partnerName} · ${relativeSignalAge(received.created_at)}`;
  if(sentReaction){
    const signature=`${sent.id}:${sentReaction.reaction}:${sentReaction.updated_at||''}`;
    if(usThinkKnownReactionSignature&&usThinkKnownReactionSignature!==signature)toast(`Ha reagito ${thinkReactionLabel(sentReaction.reaction)}`);
    usThinkKnownReactionSignature=signature;
  }
  window.UsTodayPriority?.refresh?.();
  window.UsWidgets?.publishThink?.({partnerName,lastReceivedAt:received?.created_at||'',lastSentAt:sent?.created_at||'',lastAnsweredAt:receivedReaction?.updated_at||''}).catch(()=>{});
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
  if(error){console.warn(error);window.UsFeedback?.error?.();toast('Non riesco a inviare il segnale');if(btn)btn.disabled=false;return false;}
  const result=Array.isArray(data)?data[0]:data;
  const messageId=result?.message_id;
  usThinkOperationId=null;
  if(messageId)sendWebPushEvent('think',messageId).catch(()=>{});
  // Mockup: the heart takes my colour for a moment and two sparks, mine and
  // theirs, fly out of it; then "Ti penso inviato a …".
  btn?.classList.add('sent');setTimeout(()=>btn?.classList.remove('sent'),2400);
  if(btn&&!result?.duplicate)thinkSparks(btn);
  window.UsFeedback?.action?.();
  if(result?.duplicate)toast('Già inviato',{quiet:true});
  else toast(`Ti penso inviato a ${partner.display_name||usIdentity().partnerName}`,{icon:'heart',quiet:false});
  await hydrateThink();
  setTimeout(()=>{if(btn)btn.disabled=false;},1800);
  return true;
}
window.sendThinkSignal=sendThinkSignal;
function thinkSparks(btn){
  if(dailyRitualReducedMotion()||typeof document.createElement!=='function')return;
  const r=btn.getBoundingClientRect?.();if(!r)return;
  const root=getComputedStyle(document.documentElement);
  [[root.getPropertyValue('--us-tu').trim()||'#ff7c96',-1],[root.getPropertyValue('--us-partner').trim()||'#a98bff',1]].forEach(([color,side],i)=>{
    const d=document.createElement('span');d.className='dc-oggi-spark';d.setAttribute('aria-hidden','true');
    d.style.background=color;d.style.left=`${r.left+r.width/2-6}px`;d.style.top=`${r.top+r.height/2-6}px`;
    document.body.appendChild(d);
    const a=d.animate?.([{translate:'0 0',opacity:1,scale:1},{translate:`${side*18}px 26px`,opacity:1,scale:1.1,offset:.35},{translate:`${130+side*8}px 8px`,opacity:0,scale:.5}],{duration:950,delay:i*70,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'});
    if(a)a.onfinish=()=>d.remove();else d.remove();
  });
}
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
      else ricordiCheckNew().catch(()=>{});
      window.refreshOpenMomentAlbum?.();
      return;
    }
    if(kind==='events'){
      if(document.getElementById('usEventsOverlay')?.classList.contains('open'))window.hydrateEvents?.();
      window.UsTodayPriority?.refresh?.({freshEvents:true});
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
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'couples',filter:`id=eq.${coupleId}`},payload=>{renderBondProgress(payload.new?.bond_xp||0);window.USProgression?.refreshAfterAction?.();})
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
  if(!window.todayQuestion||document.getElementById('todaySaveBtn')?.dataset.usTodayMode==='retry')return hydrateToday();
  if(!window.todayState||window.todayState.both_answered||todayAnswerIsSaving()||document.getElementById('todaySaveBtn')?.disabled)return;
  const v=document.getElementById('answer').value.trim();
  if(!v)return toast('Scrivi qualcosa prima');
  const viewerId=window.usProfile.id,coupleId=window.usProfile.couple_id,questionId=window.todayQuestion.id;
  const saving={viewerId,coupleId,questionId};usTodayAnswerSave=saving;
  const btn=document.getElementById('todaySaveBtn');btn.disabled=true;btn.textContent='Salvo…';
  let error;
  try{
    const result=await sb.from('daily_answers').upsert({
      question_id:questionId,user_id:viewerId,couple_id:coupleId,
      answer:v,updated_at:new Date().toISOString()
    },{onConflict:'question_id,user_id'});
    error=result.error;
  }catch(cause){error=cause;}
  if(usTodayAnswerSave!==saving)return;
  usTodayAnswerSave=null;
  if(window.usProfile?.id!==viewerId||window.usProfile?.couple_id!==coupleId||window.todayQuestion?.id!==questionId)return;
  btn.disabled=false;
  if(error){console.warn(error);btn.textContent='Riprova';return toast('Errore sync Today');}
  sendWebPushEvent('daily_answer',window.todayQuestion.id).catch(()=>{});
  // As in the approved mockup: while the other has not answered yet, the sheet
  // closes and, on Oggi, my circle of the card fills; elsewhere, or with
  // reduced motion, a short notice says it. If the other already answered,
  // the sheet stays and the two answers appear in it.
  const firstAnswer=!window.todayState?.my_answer;
  const theyAnswered=Boolean(window.todayState?.partner_has_answer);
  const onOggi=Boolean(document.getElementById('home')?.classList.contains('active'));
  usDailyRitualAnswerPending=firstAnswer&&!theyAnswered&&onOggi&&typeof dailyRitualReducedMotion==='function'&&!dailyRitualReducedMotion();
  if(!theyAnswered&&typeof closeToday==='function')closeToday();
  if(!usDailyRitualAnswerPending&&!(firstAnswer&&theyAnswered))toast('Risposta inviata',{icon:'check',quiet:false});
  await hydrateToday();
}
window.saveAnswer=saveAnswer;



// Global tab-swipe removed: Android edge-back and tab navigation remain native.
// Internal Ricordi carousel, dismiss and game swipe handlers are untouched.

async function refreshVisibleState(options={}){
  if(!window.usProfile||document.hidden)return;
  if(options.foreground)hydrateThink().catch(()=>{});
  const active=document.querySelector('.page.active')?.id;
  const todayOpen=document.getElementById('today')?.classList.contains('open');
  // M12A — returning to the foreground re-checks the location wherever the user lands.
  if(options.foreground)maybeAutoRefreshLocation('resume').catch(()=>{});
  if(options.foreground)hydrateProfileAvatars().catch(()=>{});
  if(active==='home'||todayOpen){
    if(options.foreground)hydrateHomePhoto(false).catch(()=>{});
    await hydrateToday();
    if(!options.foreground)hydrateDistance();
    return;
  }
  // Foregrounding must not invalidate valid signed media URLs. A failed image
  // already self-recovers through usRecoverPrivateImage().
  if(active==='moments'){await hydrateMoments();return;}
  if(active==='quiz'){await window.USGameV2?.refresh();return;}
  if(active==='bond'){await hydrateBondSummary();return;}
  if(active==='settings'){await window.hydrateUsSettings?.();}
}
setInterval(()=>refreshVisibleState(),60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&window.usProfile)refreshVisibleState({foreground:true});});
sb.auth.onAuthStateChange((event,_session)=>{
  if(event==='PASSWORD_RECOVERY' && window.usS31Auth?.onRecoverySession?.()){
    usInvalidateAuth();
    document.getElementById('authOverlay').classList.remove('hidden');
    return;
  }
  if(event==='SIGNED_OUT')window.usS31Auth?.reset?.();
  if(event==='INITIAL_SESSION'||event==='TOKEN_REFRESHED')return;
  if(event==='SIGNED_OUT'||(_session?.user?.id||'')!==usAuthUserId)usInvalidateAuth();
  setTimeout(initCloud,0);
});
const loginBtn=document.getElementById('loginBtn');
if(loginBtn) loginBtn.addEventListener('click', loginAccount);
const loginEnter=document.getElementById('loginEmail');
const passwordEnter=document.getElementById('loginPassword');
if(loginEnter) loginEnter.addEventListener('keydown',(e)=>{if(e.key==='Enter')loginAccount();});
if(passwordEnter) passwordEnter.addEventListener('keydown',(e)=>{if(e.key==='Enter')loginAccount();});

function normalizeAndroidNaturalTextInputs(root=document){
  if(!window.UsPlatform?.isNative||!document.documentElement.classList.contains('us-native-android'))return;
  const nodes=[];
  if(root?.matches?.('textarea,input'))nodes.push(root);
  root?.querySelectorAll?.('textarea,input')?.forEach?.(node=>nodes.push(node));
  for(const el of nodes){
    if(el.closest?.('.auth-overlay'))continue;
    const tag=el.tagName?.toLowerCase();
    const type=String(el.getAttribute?.('type')||'text').toLowerCase();
    const mode=String(el.getAttribute?.('inputmode')||'').toLowerCase();
    if(tag!=='textarea'&&type!=='text')continue;
    if(mode&&mode!=='text')continue;
    el.setAttribute('inputmode','text');
    el.setAttribute('autocapitalize','sentences');
    el.setAttribute('autocorrect','on');
    el.setAttribute('spellcheck','true');
  }
}
normalizeAndroidNaturalTextInputs();
if(window.UsPlatform?.isNative&&document.documentElement.classList.contains('us-native-android')&&typeof MutationObserver==='function'){
  new MutationObserver(records=>{
    for(const record of records)for(const node of record.addedNodes||[])if(node?.nodeType===1)normalizeAndroidNaturalTextInputs(node);
  }).observe(document.body,{childList:true,subtree:true});
}

initCloud();

if (canUseUsServiceWorker()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js",{updateViaCache:"none"}).catch((err) => {
      console.warn("US. service worker non registrato:", err);
    });
  });
}


document.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeToday();});
