(() => {
'use strict';
if(window.__usSettingsInstalled)return;
window.__usSettingsInstalled=true;

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let settingsSnapshot=null;
let logoutInFlight=false;
window.addEventListener('us-identity-change',event=>{
  if(!event.detail?.identityKey){
    settingsSnapshot=null;
    const avatars=$('usCoupleAvatars');if(avatars)avatars.innerHTML='<span class="us-couple-avatar"><b>US</b></span>';
    closeModal();
    const body=$('usSettingsModalBody');if(body)body.innerHTML='';
  }
});

function currentBuild(){return document.querySelector('meta[name="us-build"]')?.content||'';}

function openModal(title,body,kicker='US.'){
  const modalBody=$('usSettingsModalBody');
  $('usSettingsModalTitle').textContent=title;
  $('usSettingsModalKicker').textContent=kicker;
  modalBody.innerHTML=body;
  const root=$('usSettingsOverlay');
  window.UsUiFoundation?.cancelSurfaceExit?.(root);
  root.classList.add('open');
  root.setAttribute('aria-hidden','false');
  document.body.classList.add('us-settings-modal-open');
}
function closeModal(){
  const root=$('usSettingsOverlay');
  if(!root)return;
  const finalize=()=>{
    root.classList.remove('open');
    root.setAttribute('aria-hidden','true');
    document.body.classList.remove('us-settings-modal-open');
  };
  if(window.UsUiFoundation?.exitSurface)window.UsUiFoundation.exitSurface(root,finalize);else finalize();
}
window.closeUsSettingsModal=closeModal;

function bondLevel(totalXp=0){
  const total=Math.max(0,Number(totalXp)||0);
  let level=1,floor=0,needed=200;
  while(total>=floor+needed){
    floor+=needed;level+=1;needed=200+(level-1)*150;
    if(level>999)break;
  }
  return level;
}
function daysTogether(startedOn){
  if(!startedOn)return 0;
  const [y,m,d]=startedOn.split('-').map(Number);
  const start=Date.UTC(y,m-1,d);
  const now=new Date();
  const today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  return Math.max(0,Math.floor((today-start)/86400000));
}
function nextRelationshipLabel(startedOn){
  if(!startedOn)return '';
  const [,m,d]=startedOn.split('-').map(Number);
  const now=new Date();
  let target=new Date(now.getFullYear(),now.getMonth(),d,12);
  if(target<new Date(now.getFullYear(),now.getMonth(),now.getDate(),0))target=new Date(now.getFullYear(),now.getMonth()+1,d,12);
  const delta=Math.max(0,Math.ceil((target-new Date(now.getFullYear(),now.getMonth(),now.getDate(),0))/86400000));
  return delta===0?'mesiversario oggi':delta===1?'mesiversario domani':`prossimo mesiversario tra ${delta} giorni`;
}
function formatDate(value){
  if(!value)return '—';
  const [y,m,d]=value.split('-').map(Number);
  return new Date(y,m-1,d,12).toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'});
}
async function locationState(){
  try{
    if(!navigator.geolocation)return 'unsupported';
    if(!navigator.permissions?.query)return 'unknown';
    const p=await navigator.permissions.query({name:'geolocation'});
    return p.state||'unknown';
  }catch(_){return 'unknown';}
}
async function pushState(){
  if(window.UsNotifications?.supported?.()){
    // Native app: state of THIS installation (FCM on Android, APNs on iOS).
    const state=await window.UsNotifications.getState();
    return {native:true,kind:state.kind,active:state.kind==='active',permission:state.kind==='denied'?'denied':'native'};
  }
  if(!('Notification' in window))return {permission:'unsupported',active:false};
  const permission=Notification.permission;
  let active=false;
  if(permission==='granted'){
    try{active=Boolean(await getCurrentPushSubscription());}catch(_){}
  }
  return {permission,active};
}
function avatarMarkup(profile,url){
  const name=profile?.display_name||'?';
  if(url)return `<span class="us-couple-avatar"><img src="${esc(url)}" alt="${esc(name)}"></span>`;
  return `<span class="us-couple-avatar"><b>${esc(name.trim().slice(0,1).toUpperCase()||'?')}</b></span>`;
}

async function hydrateUsSettings(){
  if(!window.usProfile)return;
  const identityProfile=window.usProfile;
  const cid=identityProfile.couple_id;
  const unit=localStorage.getItem('us:settings:distance-unit')||'km';
  const [coupleRes,profilesRes,momentsRes,eventsRes,archiveRes,loc,push,prefsRes]=await Promise.all([
    sb.from('couples').select('started_on,bond_xp').eq('id',cid).maybeSingle(),
    sb.from('profiles').select('id,display_name,role,avatar_path').eq('couple_id',cid).order('created_at',{ascending:true}),
    sb.from('moments').select('id',{count:'exact',head:true}).eq('couple_id',cid),
    sb.from('shared_event_completions').select('event_id',{count:'exact',head:true}).eq('couple_id',cid),
    // Stories are retired on native (the archive row is stripped from the APK web bundle).
    window.UsPlatform?.isNative?Promise.resolve({count:0}):sb.from('stories').select('id',{count:'exact',head:true}).eq('couple_id',cid).lt('expires_at',new Date().toISOString()),
    locationState(),
    pushState(),
    sb.rpc('get_notification_preferences')
  ]);

  if(window.usProfile!==identityProfile||window.usProfile?.couple_id!==cid)return;
  const couple=coupleRes.data||{};
  const profiles=profilesRes.data||[];
  settingsSnapshot={couple,profiles,loc,push,prefs:prefsRes.data||{think:true,today:true,bond:true,relationship:true,left_for_you:true,games:true}};

  const names=profiles.map(p=>p.display_name).filter(Boolean);
  $('usCoupleNames').textContent=window.UsIdentity?.current().pairLabel || 'Voi due';
  const days=daysTogether(couple.started_on);
  $('usTogetherLine').textContent=couple.started_on?`insieme da ${days.toLocaleString('it-IT')} giorni · ${nextRelationshipLabel(couple.started_on)}`:'Imposta la data della relazione';
  $('usRelationshipDateValue').textContent=formatDate(couple.started_on);
  $('usSettingsBondLevel').textContent=`LV ${bondLevel(couple.bond_xp)}`;
  $('usSettingsMomentsCount').textContent=Number(momentsRes.count||0).toLocaleString('it-IT');
  $('usSettingsEventsCount').textContent=Number(eventsRes.count||0).toLocaleString('it-IT');
  const archiveValue=$('usStoryArchiveValue');if(archiveValue)archiveValue.textContent=Number(archiveRes.count||0)?String(archiveRes.count):'';
  $('usDistanceUnitValue').textContent=unit==='mi'?'miglia':'km';
  const feedbackValue=$('usFeedbackValue');if(feedbackValue)feedbackValue.textContent=feedbackSummary();
  syncMauditSetting();
  syncAppLockSetting().catch(()=>{});
  syncRicordiOptimizationSetting().catch(()=>{});
  $('usSettingsBuild').textContent=currentBuild();

  const locEl=$('usLocationState');
  locEl.className='us-setting-state';
  if(loc==='granted'){locEl.textContent='✓';locEl.classList.add('ok');}
  else if(loc==='denied'){locEl.textContent='×';locEl.classList.add('bad');}
  else locEl.textContent='○';

  const pushEl=$('usNotificationsValue');
  pushEl.textContent=push.native?({active:'Attive',inactive:'Non attive',denied:'Permesso negato',settings:'Da attivare',unavailable:'Non disponibili'}[push.kind]||'Non disponibili'):push.active?'Attive':push.permission==='denied'?'Bloccate':'Non attive';
  $('usSyncValue').textContent=navigator.onLine&&profiles.length>=2?'Tutto ok':navigator.onLine?'Parziale':'Offline';
  const dot=$('usSettingsDeviceDot');
  dot.classList.toggle('ok',Boolean(navigator.onLine&&profiles.length>=2));
  dot.classList.toggle('bad',!navigator.onLine);

  const avatarPaths=profiles.map(p=>p.avatar_path).filter(Boolean);
  let urls=new Map();
  if(avatarPaths.length&&window.usGetSignedUrls)urls=await window.usGetSignedUrls(avatarPaths,21600);
  if(window.usProfile!==identityProfile||window.usProfile?.couple_id!==cid)return;
  $('usCoupleAvatars').innerHTML=profiles.map(p=>avatarMarkup(p,p.avatar_path?urls.get(p.avatar_path):null)).join('')||'<span class="us-couple-avatar"><b>US</b></span>';
}
window.hydrateUsSettings=hydrateUsSettings;

function relationshipDateModal(valueOverride){
  const current=valueOverride||settingsSnapshot?.couple?.started_on||'';
  const today=new Date();
  const max=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  openModal('Data della relazione',`
    <div class="us-settings2-modal-copy">Questa data regola giorni insieme, mesiversario, anniversario e relativi XP.</div>
    <label class="us-settings2-field"><span>Insieme dal</span><input id="usRelationshipDateInput" type="date" max="${max}" value="${esc(current)}"></label>
    <button type="button" class="primary us-settings-main-action" id="usSaveRelationshipDate">Salva data</button>
  `,'NOI');
  $('usSaveRelationshipDate')?.addEventListener('click',()=>{
    const value=$('usRelationshipDateInput')?.value;
    if(!value)return;
    relationshipDateConfirmation(value);
  });
  if(valueOverride)$('usRelationshipDateInput')?.focus({preventScroll:true});
}

function relationshipDateConfirmation(value){
  openModal('Conferma data',`
    <div class="us-settings2-modal-copy">Impostare <b>${esc(formatDate(value))}</b> come data della relazione?</div>
    <div class="us-settings2-action-stack">
      <button type="button" class="ghost" id="usCancelRelationshipDate">Indietro</button>
      <button type="button" class="primary" id="usConfirmRelationshipDate">Conferma data</button>
    </div>
  `,'NOI');
  $('usCancelRelationshipDate')?.addEventListener('click',()=>relationshipDateModal(value));
  $('usConfirmRelationshipDate')?.addEventListener('click',async()=>{
    const btn=$('usConfirmRelationshipDate');btn.disabled=true;btn.textContent='Salvo…';
    const {error}=await sb.from('couples').update({started_on:value}).eq('id',window.usProfile.couple_id);
    if(!error)window.USCountdown?.refresh?.();
    if(error){console.warn(error);btn.disabled=false;btn.textContent='Conferma data';return toast('Non riesco a salvare la data');}
    await hydrateUsSettings();
    window.hydrateEvents?.();
    closeModal();
    toast('Data aggiornata ♡');
  });
  $('usCancelRelationshipDate')?.focus({preventScroll:true});
}

function homePhotoModal(){
  openModal('Foto Home',`
    <div class="us-settings2-modal-copy">La Home usa automaticamente le foto salvate nei vostri Moments e cambia ricordo nel tempo. Non serve mantenere una galleria separata.</div>
    <div class="us-settings2-action-stack">
      <button type="button" class="primary" id="usChangeHomeNow">Cambia foto adesso</button>
      <button type="button" class="ghost" id="usOpenMomentsFromSettings">Gestisci i Moments</button>
    </div>
  `,'HOME');
  $('usChangeHomeNow')?.addEventListener('click',async()=>{
    const btn=$('usChangeHomeNow');btn.disabled=true;btn.textContent='Cambio…';
    await window.hydrateHomePhoto?.(true);
    btn.textContent='Fatto ✓';
    setTimeout(()=>{closeModal();toast('Nuovo ricordo in Home');},250);
  });
  $('usOpenMomentsFromSettings')?.addEventListener('click',()=>{
    closeModal();window.go?.('moments');
  });
}

async function showStoryArchive(){
  openModal('Archivio Stories','<div class="us-settings-loading">Carico…</div>','RICORDI');
  try{
    const [{data:stories,error},{data:profiles}]=await Promise.all([
      sb.from('stories').select('id,author_id,media_path,caption,created_at,expires_at').eq('couple_id',window.usProfile.couple_id).lt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(60),
      sb.from('profiles').select('id,display_name').eq('couple_id',window.usProfile.couple_id)
    ]);
    if(error)throw error;
    if(!stories?.length){
      $('usSettingsModalBody').innerHTML='<div class="us-settings-empty"><b>Archivio vuoto</b></div>';return;
    }
    const names=new Map((profiles||[]).map(p=>[p.id,p.display_name||'Noi']));
    const paths=stories.map(s=>s.media_path);
    const urls=await window.usGetSignedUrls?.(paths,21600)||new Map();
    $('usSettingsModalBody').innerHTML=`<div class="us-story-archive">${stories.map(s=>{
      const url=urls.get(s.media_path);if(!url)return '';
      const date=new Date(s.created_at).toLocaleDateString('it-IT',{day:'numeric',month:'short'});
      return `<article><img src="${esc(url)}" alt="Story archiviata" loading="lazy"><span><b>${esc(names.get(s.author_id)||'Noi')}</b><small>${esc(date)}</small></span>${s.caption?`<p>${esc(s.caption)}</p>`:''}</article>`;
    }).join('')}</div>`;
  }catch(error){
    console.warn(error);
    $('usSettingsModalBody').innerHTML='<div class="us-settings-empty"><b>Archivio non disponibile</b><p>Riprova tra poco.</p></div>';
  }
}

function distanceModal(){
  const unit=localStorage.getItem('us:settings:distance-unit')||'km';
  openModal('Distanza',`<div class="us-setting-choice">
    <button data-distance="km" class="${unit==='km'?'active':''}"><span>Chilometri</span><b>km</b></button>
    <button data-distance="mi" class="${unit==='mi'?'active':''}"><span>Miglia</span><b>mi</b></button>
  </div>`,'QUESTO TELEFONO');
  $('usSettingsModalBody').querySelectorAll('[data-distance]').forEach(btn=>btn.addEventListener('click',()=>{
    localStorage.setItem('us:settings:distance-unit',btn.dataset.distance);
    window.hydrateDistance?.();hydrateUsSettings();closeModal();toast('Unità aggiornata');
  }));
}

async function locationAction(){
  const state=await locationState();
  if(state==='denied'){
    openModal('Posizione','<div class="us-settings-copy"><p>La posizione è bloccata dalle impostazioni del telefono.</p></div>','PERMESSO');
    return;
  }
  await window.refreshMyLocation?.();
  setTimeout(hydrateUsSettings,450);
  toast('Posizione aggiornata');
}

function preferenceToggle(key,label,checked){
  return `<button type="button" class="us-settings2-toggle-row" data-pref="${key}" aria-pressed="${checked?'true':'false'}">
    <span><b>${label}</b><small>${key==='think'?'Segnali Ti penso':key==='today'?'Risposte e reveal di Today':key==='bond'?'Conferme delle quest Bond':key==='left_for_you'?'Quando la tua persona ti lascia qualcosa':key==='games'?'Tocca a te, risposte pronte, domanda della settimana':'Mesiversari e anniversari'}</small></span>
    <i class="${checked?'on':''}"><u></u></i>
  </button>`;
}

// M12A — device-local feedback preferences (sound / haptics), owned by UsFeedback.
function feedbackSummary(){
  const prefs=window.UsFeedback?.getPreferences?.()||{sounds:true,haptics:true};
  return prefs.sounds&&prefs.haptics?'Attivi':!prefs.sounds&&!prefs.haptics?'Spenti':prefs.sounds?'Solo suoni':'Solo vibrazione';
}
function feedbackToggle(key,label,detail,checked){
  return `<button type="button" class="us-settings2-toggle-row" data-feedback="${key}" aria-pressed="${checked?'true':'false'}">
    <span><b>${label}</b><small>${detail}</small></span>
    <i class="${checked?'on':''}"><u></u></i>
  </button>`;
}
function feedbackModal(){
  const prefs=window.UsFeedback?.getPreferences?.()||{sounds:true,haptics:true};
  openModal('Suoni e vibrazione',`<div class="us-settings2-toggle-list">
    ${feedbackToggle('sounds','Suoni','Solo per conferme, Ti penso e momenti importanti',prefs.sounds)}
    ${feedbackToggle('haptics','Feedback aptico','Tocchi brevi e delicati sui gesti',prefs.haptics)}
  </div>
  <section class="us-feedback-preview" aria-label="Prova i feedback">
    <div class="us-feedback-preview-heading"><b>Prova i feedback</b><small>Ascolta e senti come risponde US</small></div>
    <div class="us-feedback-preview-grid">
      <button type="button" data-feedback-preview="action">Azione</button>
      <button type="button" data-feedback-preview="success">Completato</button>
      <button type="button" data-feedback-preview="attention">Ti penso</button>
      <button type="button" data-feedback-preview="reveal">Sblocco</button>
    </div>
  </section>
  <p class="us-feedback-preview-note">I tocchi ordinari sono silenziosi. Suoni e vibrazione seguono le preferenze di questo telefono.</p>`,'QUESTO TELEFONO');
  $('usSettingsModalBody').querySelectorAll('[data-feedback]').forEach(btn=>btn.addEventListener('click',()=>{
    const next=btn.getAttribute('aria-pressed')!=='true';
    if(btn.dataset.feedback==='sounds')window.UsFeedback?.setSoundsEnabled?.(next);
    else window.UsFeedback?.setHapticsEnabled?.(next);
    btn.setAttribute('aria-pressed',next?'true':'false');
    btn.querySelector('i')?.classList.toggle('on',next);
    const value=$('usFeedbackValue');if(value)value.textContent=feedbackSummary();
    if(next)window.UsFeedback?.[btn.dataset.feedback==='sounds'?'action':'selection']?.();
  }));
  $('usSettingsModalBody').querySelectorAll('[data-feedback-preview]').forEach(btn=>btn.addEventListener('click',()=>{
    const kind=btn.dataset.feedbackPreview;
    if(['action','success','attention','reveal'].includes(kind)) window.UsFeedback?.[kind]?.();
  }));
}

// Ricordi thumbnails: one-time native maintenance for legacy full-size Moments.
// It never replaces or deletes the originals; it only creates private derivatives.
async function syncRicordiOptimizationSetting(){
  const row=$('usOptimizeRicordiSetting');
  const value=$('usOptimizeRicordiValue');
  if(!row)return;
  if(!window.UsPlatform?.isNative||!window.UsRicordiThumbnails?.missingCount){
    row.hidden=true;
    return;
  }
  try{
    const count=await window.UsRicordiThumbnails.missingCount();
    row.hidden=count<=0;
    if(value)value.textContent=count>0?`${count} da fare`:'';
  }catch(error){
    console.warn('[US Settings] Ricordi optimization status',error);
    row.hidden=true;
  }
}
function ricordiOptimizationModal(){
  if(!window.UsPlatform?.isNative||!window.UsRicordiThumbnails?.optimizeLegacy)return;
  openModal('Ottimizza Ricordi',`
    <div class="us-settings-copy">
      <p>US creerà anteprime leggere dei Ricordi più vecchi per aprirli molto più velocemente.</p>
      <p><b>Le foto originali restano intatte.</b> L'operazione scarica temporaneamente le foto: falla una volta quando sei sotto Wi-Fi.</p>
    </div>
    <div class="us-settings2-action-stack">
      <button type="button" class="primary" id="usOptimizeRicordiStart">Ottimizza adesso</button>
      <button type="button" class="ghost" id="usOptimizeRicordiCancel">Più tardi</button>
    </div>
    <p class="us-settings2-modal-copy" id="usOptimizeRicordiProgress" role="status" aria-live="polite"></p>
  `,'QUESTO TELEFONO');
  $('usOptimizeRicordiCancel')?.addEventListener('click',closeModal);
  $('usOptimizeRicordiStart')?.addEventListener('click',async()=>{
    const btn=$('usOptimizeRicordiStart');
    const cancel=$('usOptimizeRicordiCancel');
    const progress=$('usOptimizeRicordiProgress');
    btn.disabled=true;if(cancel)cancel.disabled=true;
    btn.textContent='Ottimizzo…';
    const result=await window.UsRicordiThumbnails.optimizeLegacy({
      onProgress:state=>{
        if(!progress)return;
        const processed=Math.min(state.total,state.done+state.failed);
        progress.textContent=state.total?`${processed} / ${state.total}${state.failed?` · ${state.failed} da riprovare`:''}`:'Niente da ottimizzare';
      }
    }).catch(error=>({ok:false,code:'error',error}));
    if(result.code==='offline'){
      if(progress)progress.textContent='Serve una connessione. Riprova sotto Wi-Fi.';
      btn.disabled=false;if(cancel)cancel.disabled=false;btn.textContent='Riprova';
      return;
    }
    if(result.code==='data_saver'){
      if(progress)progress.textContent='Risparmio dati attivo. Disattivalo o usa il Wi-Fi e riprova.';
      btn.disabled=false;if(cancel)cancel.disabled=false;btn.textContent='Riprova';
      return;
    }
    if(result.code==='busy'){
      if(progress)progress.textContent='Ottimizzazione già in corso.';
      return;
    }
    if(result.failed>0){
      if(progress)progress.textContent=`${result.done} ottimizzati · ${result.failed} da riprovare.`;
      btn.disabled=false;if(cancel)cancel.disabled=false;btn.textContent='Riprova i rimanenti';
      await syncRicordiOptimizationSetting();
      return;
    }
    if(progress)progress.textContent=result.total?'Ricordi ottimizzati.':'Era già tutto ottimizzato.';
    window.UsFeedback?.success?.();
    await syncRicordiOptimizationSetting();
    setTimeout(()=>{closeModal();toast('Ricordi più leggeri ✓');hydrateUsSettings();},450);
  });
}

// Native Security V1 — device-local biometric protection, owned by UsAppLock
// (app-lock.js + native plugin). Never a couple setting, never synced.
let appLockBusy=false;
async function syncAppLockSetting(){
  const row=$('usAppLockSetting');
  if(!row||!window.UsAppLock?.supported?.())return;
  const state=await window.UsAppLock.settingState();
  row.hidden=!state.visible;
  if(!state.visible)return;
  row.setAttribute('aria-checked',state.enabled?'true':'false');
  row.classList.toggle('is-unavailable',!state.available&&!state.enabled);
  $('usAppLockSettingLabel').textContent=state.label;
  $('usAppLockSettingDetail').textContent=state.detail;
}
async function toggleAppLock(){
  if(appLockBusy||!window.UsAppLock?.supported?.())return;
  appLockBusy=true;
  try{
    const state=await window.UsAppLock.settingState();
    if(!state.enabled&&!state.available){toast(state.detail);return;}
    const result=state.enabled?await window.UsAppLock.disable():await window.UsAppLock.enable();
    if(result.ok){
      window.UsFeedback?.success?.();
      toast(state.enabled?'Protezione disattivata':'US è protetta su questo telefono');
    }else if(result.code==='lockout'||result.code==='lockout_permanent'){
      toast('Troppi tentativi. Riprova tra poco');
    }else if(result.code==='not_enrolled'||result.code==='unavailable'||result.code==='unsupported'){
      toast('Biometria non disponibile ora');
    }else if(result.code!=='cancelled'&&result.code!=='fallback'&&result.code!=='busy'&&result.code!=='invalidated'){
      toast('Non riesco a cambiarla adesso');
    }
  }finally{
    appLockBusy=false;
    syncAppLockSetting().catch(()=>{});
  }
}

// Maudit V1 — device-local On/Off, owned by USPet (pet.js). Off unmounts it.
function mauditEnabled(){
  if(typeof window.USPet?.isEnabled==='function')return window.USPet.isEnabled();
  try{return localStorage.getItem('us:maudit:v1:enabled')!=='0';}catch(_){return true;}
}
function syncMauditSetting(){
  const row=$('usMauditSetting');
  if(row)row.setAttribute('aria-checked',mauditEnabled()?'true':'false');
}
function toggleMaudit(){
  const next=!mauditEnabled();
  window.USPet?.setEnabled?.(next); // USPet owns the device-local preference
  syncMauditSetting();
}

// Native Notifications V1: what this phone can do, in the person's words.
const US_NATIVE_PUSH_COPY=Object.freeze({
  active:{title:'Attive su questo dispositivo',detail:'Anche a US chiusa.',action:'Disattiva su questo dispositivo',kind:'ghost'},
  inactive:{title:'Non attive',detail:'Ti penso, risposte e promemoria, anche a US chiusa.',action:'Attiva',kind:'primary'},
  denied:{title:'Permesso negato',detail:'Consentile a US nelle impostazioni del telefono.',action:'Apri impostazioni di sistema',kind:'primary'},
  settings:{title:'Da attivare nelle impostazioni',detail:'Le notifiche di US sono spente nel telefono.',action:'Apri impostazioni di sistema',kind:'primary'},
  unavailable:{title:'Configurazione non disponibile',detail:'Questa versione di US non può ancora ricevere notifiche.',action:'',kind:'ghost'}
});
function pushMasterMarkup(state){
  if(state.native){
    const copy=US_NATIVE_PUSH_COPY[state.kind]||US_NATIVE_PUSH_COPY.unavailable;
    return `<div class="us-settings2-push-master" data-push-state="${esc(state.kind||'unavailable')}">
      <span><b>${copy.title}</b><small>${copy.detail}</small></span>
      ${copy.action?`<button type="button" class="${copy.kind}" id="usSettingsPushAction">${copy.action}</button>`:''}
    </div>`;
  }
  return `<div class="us-settings2-push-master">
      <span><b>${state.active?'Notifiche attive':'Notifiche non attive'}</b><small>${state.permission==='denied'?'Bloccate dal telefono':''}</small></span>
      <button type="button" class="${state.active?'ghost':'primary'}" id="usSettingsPushAction" ${state.permission==='denied'?'disabled':''}>${state.active?'Disattiva':'Attiva'}</button>
    </div>`;
}
async function nativePushAction(state){
  const api=window.UsNotifications;
  if(state.kind==='active'){
    const result=await api.disable();
    toast(result.ok?'Notifiche disattivate su questo dispositivo':'Non riesco a disattivarle adesso');
    return;
  }
  if(state.kind==='denied'||state.kind==='settings'){await api.openSettings();return;}
  if(state.kind==='inactive')await window.enableWebPush?.();
}

async function notificationsModal(){
  const state=await pushState();
  const {data:prefs}=await sb.rpc('get_notification_preferences');
  const p=prefs||{think:true,today:true,bond:true,relationship:true,left_for_you:true,games:true};
  openModal('Notifiche',`
    ${pushMasterMarkup(state)}
    <div class="us-settings2-toggle-list">
      ${preferenceToggle('think','Ti penso',p.think!==false)}
      ${preferenceToggle('today','Today',p.today!==false)}
      ${preferenceToggle('bond','Bond',p.bond!==false)}
      ${preferenceToggle('relationship','Ricorrenze',p.relationship!==false)}
      ${preferenceToggle('left_for_you','Lasciato per te',p.left_for_you!==false)}
      ${preferenceToggle('games','Gioca',p.games!==false)}
    </div>
  `,'QUESTO TELEFONO');

  $('usSettingsPushAction')?.addEventListener('click',async()=>{
    const btn=$('usSettingsPushAction');btn.disabled=true;
    if(state.native)await nativePushAction(state);
    else if(state.active)await window.disableWebPush?.();else await window.enableWebPush?.();
    closeModal();setTimeout(()=>{hydrateUsSettings();notificationsModal();},250);
  });

  $('usSettingsModalBody').querySelectorAll('[data-pref]').forEach(btn=>btn.addEventListener('click',async()=>{
    const key=btn.dataset.pref;
    const next=btn.getAttribute('aria-pressed')!=='true';
    btn.disabled=true;
    const {data,error}=await sb.rpc('set_notification_preference',{target_key:key,target_value:next});
    btn.disabled=false;
    if(error){console.warn(error);return toast('Preferenza non salvata');}
    btn.setAttribute('aria-pressed',next?'true':'false');
    btn.querySelector('i')?.classList.toggle('on',next);
    if(settingsSnapshot)settingsSnapshot.prefs=data;
  }));
}

async function syncStatusModal(){
  openModal('Stato US','<div class="us-settings-loading">Controllo…</div>','SINCRONIZZAZIONE');
  const [loc,push,profilesRes]=await Promise.all([
    locationState(),
    pushState(),
    sb.from('profiles').select('id,display_name').eq('couple_id',window.usProfile.couple_id)
  ]);
  const profiles=profilesRes.data||[];
  const rows=[
    ['Rete',navigator.onLine?'Online':'Offline',navigator.onLine],
    ['Coppia',profiles.length>=2?`${profiles.length}/2 profili collegati`:`${profiles.length}/2 profili`,profiles.length>=2],
    ['Push',push.native?(US_NATIVE_PUSH_COPY[push.kind]||US_NATIVE_PUSH_COPY.unavailable).title:push.active?'Attive':push.permission==='denied'?'Bloccate':'Non attive',push.active],
    ['Posizione',loc==='granted'?'Consentita':loc==='denied'?'Bloccata':'Da chiedere',loc==='granted']
  ];
  $('usSettingsModalBody').innerHTML=`<div class="us-settings2-status-list">${rows.map(([label,value,ok])=>`
    <div><span><b>${label}</b><small>${value}</small></span><i class="${ok?'ok':''}">${ok?'✓':'○'}</i></div>
  `).join('')}</div><div class="us-settings2-build-detail">US 1.0<br><small>${esc(currentBuild())}</small></div>`;
}

function privacyModal(){
  openModal('Privacy e dati',`
    <div class="us-settings-copy">
      <p><b>Posizione</b> · salvata solo per la distanza tra voi.</p>
      <p><b>Foto</b> · restano nello spazio della coppia.</p>
      <p><b>Notifiche</b> · scegli tu quali ricevere.</p>
      <p><b>Questo telefono</b> · resta collegato finché non lo scolleghi.</p>
    </div>
  `,'DATI');
}

function logoutConfirmationModal(){
  openModal('Scollega questo telefono',`
    <div class="us-settings2-modal-copy">Dovrai inserire di nuovo il codice privato per rientrare in US.</div>
    <div class="us-settings2-action-stack">
      <button type="button" class="ghost" id="usCancelLogout">Annulla</button>
      <button type="button" class="us-settings2-disconnect" id="usConfirmLogout">Scollega questo telefono</button>
    </div>
  `,'QUESTO TELEFONO');
  $('usCancelLogout')?.addEventListener('click',closeModal);
  $('usConfirmLogout')?.addEventListener('click',logout);
}

async function logout(){
  if(logoutInFlight)return;
  logoutInFlight=true;
  const btn=$('usConfirmLogout');
  if(btn){btn.disabled=true;btn.textContent='Scollego…';}
  try{await window.revokeCurrentDevice?.();}catch(error){console.warn('[US Logout] device cleanup',error);}
  try{
    const {error}=await sb.auth.signOut();
    if(error)throw error;
    // Session gone: drop this phone's biometric protection record too.
    try{await window.UsAppLock?.reset?.();}catch(_e){}
    location.reload();
  }catch(error){logoutInFlight=false;if(btn){btn.disabled=false;btn.textContent='Scollega questo telefono';}console.warn(error);toast('Non riesco a scollegarlo');}
}

async function action(name){
  if(name==='relationship-date')return relationshipDateModal();
  if(name==='profile-photo'){closeModal();window.pickProfilePhoto?.();return;}
  if(name==='home-photo')return homePhotoModal();
  if(name==='story-archive')return showStoryArchive();
  if(name==='notifications')return notificationsModal();
  if(name==='distance')return distanceModal();
  if(name==='location')return locationAction();
  if(name==='feedback')return feedbackModal();
  if(name==='optimize-ricordi')return ricordiOptimizationModal();
  if(name==='maudit')return toggleMaudit();
  if(name==='app-lock')return toggleAppLock();
  if(name==='widgets')return window.UsWidgetHub?.open?.();
  if(name==='sync-status')return syncStatusModal();
  if(name==='privacy')return privacyModal();
  if(name==='logout')return logoutConfirmationModal();
}


// Settings is never the launch surface: pre-fill it after the first Home
// paint and its data instead of racing them. Opening Settings hydrates it on
// demand anyway (go('settings')).
function hydrateWhenHomeSettles(){
  if(document.getElementById('settings')?.classList.contains('active'))return hydrateUsSettings();
  const run=()=>hydrateUsSettings();
  setTimeout(()=>{
    if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:2000});
    else run();
  },1500);
}

function boot(){
  syncMauditSetting();
  syncAppLockSetting().catch(()=>{});
  document.querySelectorAll('[data-us-setting]').forEach(row=>row.addEventListener('click',()=>action(row.dataset.usSetting)));
  document.querySelectorAll('[data-us-settings-close]').forEach(el=>el.addEventListener('click',closeModal));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('usSettingsOverlay')?.classList.contains('open'))closeModal();});
  const wait=setInterval(()=>{
    const heart=$('thinkButton');if(heart)heart.hidden=!window.usProfile;
    if(window.usProfile){clearInterval(wait);hydrateWhenHomeSettles();}
  },250);
  setTimeout(()=>clearInterval(wait),30000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.getElementById('settings')?.classList.contains('active'))hydrateUsSettings();});
window.addEventListener('online',()=>{if(document.getElementById('settings')?.classList.contains('active'))hydrateUsSettings();});
window.addEventListener('offline',()=>{if(document.getElementById('settings')?.classList.contains('active'))hydrateUsSettings();});
console.info('[US Settings] Settings 2 attive');
})();
