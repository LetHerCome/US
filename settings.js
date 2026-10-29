(() => {
'use strict';
if(window.__usSettingsInstalled)return;
window.__usSettingsInstalled=true;

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let settingsSnapshot=null;
let logoutInFlight=false;
let accountDeletionDone=false;
window.addEventListener('us-identity-change',event=>{
  if(!event.detail?.identityKey){
    settingsSnapshot=null;
    const avatars=$('usCoupleAvatars');if(avatars)avatars.innerHTML='<span class="us-couple-avatar"><b>US</b></span>';
    // After an account deletion the "Account eliminato" screen stays until reload.
    if(accountDeletionDone)return;
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
  return delta===0?'mesiversario oggi':delta===1?'mesiversario domani':`mesiversario tra ${delta} giorni`;
}
function formatDate(value){
  if(!value)return '—';
  const [y,m,d]=value.split('-').map(Number);
  return new Date(y,m-1,d,12).toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{day:'numeric',month:'short',year:'numeric'});
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
  const [coupleRes,profilesRes,momentsRes,eventsRes,archiveRes,loc,push,prefsRes,plusRes]=await Promise.all([
    sb.from('couples').select('started_on,bond_xp').eq('id',cid).maybeSingle(),
    sb.from('profiles').select('id,display_name,role,avatar_path,person_color').eq('couple_id',cid).order('created_at',{ascending:true}),
    sb.from('moments').select('id',{count:'exact',head:true}).eq('couple_id',cid),
    sb.from('shared_event_completions').select('event_id',{count:'exact',head:true}).eq('couple_id',cid),
    // Stories are retired on native (the archive row is stripped from the APK web bundle).
    window.UsPlatform?.isNative?Promise.resolve({count:0}):sb.from('stories').select('id',{count:'exact',head:true}).eq('couple_id',cid).lt('expires_at',new Date().toISOString()),
    locationState(),
    pushState(),
    sb.rpc('get_notification_preferences'),
    // Colori a scelta: only while the couple has US Plus (D4); unreadable = hidden.
    sb.rpc('get_couple_plus')
  ]);

  if(window.usProfile!==identityProfile||window.usProfile?.couple_id!==cid)return;
  const couple=coupleRes.data||{};
  const profiles=profilesRes.data||[];
  settingsSnapshot={couple,profiles,loc,push,prefs:prefsRes.data||{think:true,today:true,bond:true,relationship:true,left_for_you:true,games:true}};
  // Colori a scelta (founder, 29/10): with Plus the colour; without it the
  // row stays, locked, to show that Plus unlocks it.
  const plusActive=plusRes?.data?.active===true;
  settingsSnapshot.plusActive=plusActive;
  const colorRow=$('usPersonColorSetting');
  if(colorRow){colorRow.hidden=Boolean(plusRes?.error)||!plusRes?.data;colorRow.dataset.locked=plusActive?'false':'true';}
  const colorValue=$('usPersonColorValue');
  if(colorValue)colorValue.textContent=plusActive?(window.UsPersonColors?.nameOf?.(profiles,identityProfile.id)||''):'US Plus';

  const names=profiles.map(p=>p.display_name).filter(Boolean);
  // Mockup: "Francesco e Beatrice" — the names stay as written, "e" follows the language.
  const identity=window.UsIdentity?.current();const pair=$('usCoupleNames');
  if(identity&&identity.pairLabel!=='Voi due'){pair.innerHTML=`<span translate="no">${esc(identity.nameForRole('francesco'))}</span> e <span translate="no">${esc(identity.nameForRole('beatrice'))}</span>`;pair.translate=true;}
  else pair.textContent=identity?.pairLabel || 'Voi due';
  const days=daysTogether(couple.started_on);
  $('usTogetherLine').textContent=couple.started_on?`Insieme da ${days===1?'1 giorno':`${days.toLocaleString((globalThis.UsI18n?.tag||'it-IT'))} giorni`} · ${nextRelationshipLabel(couple.started_on)}`:'Imposta la data della relazione';
  $('usRelationshipDateValue').textContent=formatDate(couple.started_on);
  $('usSettingsBondLevel').textContent=String(bondLevel(couple.bond_xp));
  $('usSettingsMomentsCount').textContent=Number(momentsRes.count||0).toLocaleString((globalThis.UsI18n?.tag||'it-IT'));
  $('usSettingsEventsCount').textContent=Number(eventsRes.count||0).toLocaleString((globalThis.UsI18n?.tag||'it-IT'));
  const archiveValue=$('usStoryArchiveValue');if(archiveValue)archiveValue.textContent=Number(archiveRes.count||0)?String(archiveRes.count):'';
  $('usDistanceUnitValue').textContent=unit==='mi'?'Miglia':'Chilometri';
  const photoDetail=$('usProfilePhotoDetail');if(photoDetail)photoDetail.textContent=`La vede anche ${window.UsIdentity?.current().partnerName||'la tua persona'}`;
  const feedbackValue=$('usFeedbackValue');if(feedbackValue)feedbackValue.textContent=feedbackSummary();
  // Mockup "1 attivo": the widgets already on this phone's Home (native only).
  const widgetsValue=$('usWidgetsValue');if(widgetsValue&&window.UsWidgets?.isAvailable?.())Promise.resolve(window.UsWidgets.installed?.()).then(device=>{const n=Object.values(device?.installed||{}).reduce((sum,count)=>sum+(Number(count)||0),0);widgetsValue.textContent=n===1?'1 attivo':n?`${n} attivi`:'Nessuno';}).catch(()=>{});
  syncMauditSetting();
  syncAppLockSetting().catch(()=>{});
  syncRicordiOptimizationSetting().catch(()=>{});
  $('usSettingsBuild').textContent=currentBuild();

  const locEl=$('usLocationState');
  locEl.className='us-setting-state';
  const sharing=Boolean(window.UsLocation?.isSharing?.());
  if(sharing&&loc!=='denied'){locEl.textContent='Consentita';locEl.classList.add('ok');}
  else if(loc==='denied'){locEl.textContent='Bloccata';locEl.classList.add('bad');}
  else locEl.textContent='Non attiva';

  const pushEl=$('usNotificationsValue');
  pushEl.textContent=push.native?({active:'Attive',inactive:'Non attive',denied:'Permesso negato',settings:'Da attivare',unavailable:'Non disponibili'}[push.kind]||'Non disponibili'):push.active?'Attive':push.permission==='denied'?'Bloccate':'Non attive';
  $('usSyncValue').textContent=navigator.onLine&&profiles.length>=2?'Tutto ok':navigator.onLine?'Parziale':'Offline';
  const dot=$('usSettingsDeviceDot');
  dot.classList.toggle('ok',Boolean(navigator.onLine&&profiles.length>=2));
  dot.classList.toggle('bad',!navigator.onLine);
  const syncLabel=$('usSettingsSyncLabel');if(syncLabel)syncLabel.textContent=navigator.onLine&&profiles.length>=2?'Sincronizzato':navigator.onLine?'Parziale':'Offline';

  const avatarPaths=profiles.map(p=>p.avatar_path).filter(Boolean);
  let urls=new Map();
  if(avatarPaths.length&&window.usGetSignedUrls)urls=await window.usGetSignedUrls(avatarPaths,window.US_MEDIA_URL_TTL_S);
  if(window.usProfile!==identityProfile||window.usProfile?.couple_id!==cid)return;
  $('usCoupleAvatars').innerHTML=profiles.map(p=>avatarMarkup(p,p.avatar_path?urls.get(p.avatar_path):null)).join('')||'<span class="us-couple-avatar"><b>US</b></span>';
}
window.hydrateUsSettings=hydrateUsSettings;

function relationshipDateModal(valueOverride){
  const current=valueOverride||settingsSnapshot?.couple?.started_on||'';
  const today=new Date();
  const max=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  openModal('Data della relazione',`
    <div class="us-settings2-modal-copy">Questa data regola giorni insieme, mesiversario, anniversario e i relativi punti Sintonia.</div>
    <label class="us-settings2-field"><span>Insieme dal</span><input id="usRelationshipDateInput" type="date" max="${max}" value="${esc(current)}"></label>
    <button type="button" class="primary us-settings-main-action" id="usSaveRelationshipDate">Salva data</button>
  `,'VOI');
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
  `,'VOI');
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

// Mockup set-foto-home: the photo Oggi shows now, changed in place.
function homePhotoModal(){
  openModal('Foto Home',`
    <div class="us-settings2-modal-copy">La foto di Oggi arriva dai vostri Ricordi.</div>
    <div class="us-settings2-photo" id="usHomePhotoPreview" aria-hidden="true"></div>
    <div class="us-settings2-action-stack">
      <button type="button" class="primary" id="usChangeHomeNow">Cambia foto adesso</button>
      <button type="button" class="ghost" id="usOpenMomentsFromSettings">Apri i Ricordi</button>
    </div>
  `,'OGGI');
  const paint=()=>{const preview=$('usHomePhotoPreview');if(preview)preview.style.backgroundImage=document.querySelector('#homeHero .home-photo-layer.active')?.style.backgroundImage||'';};
  paint();
  $('usChangeHomeNow')?.addEventListener('click',async()=>{
    const btn=$('usChangeHomeNow');btn.disabled=true;btn.textContent='Cambio…';
    window.addEventListener('us:home-photo-changed',paint,{once:true});
    await window.hydrateHomePhoto?.(true);
    paint();
    btn.innerHTML='<span class="us-icon" data-us-icon="check" aria-hidden="true"></span> Fatto';
    setTimeout(()=>{btn.disabled=false;btn.textContent='Cambia foto adesso';},900);
  });
  $('usOpenMomentsFromSettings')?.addEventListener('click',()=>{
    closeModal();window.go?.('moments',{nav:true});
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
    const urls=await window.usGetSignedUrls?.(paths,window.US_MEDIA_URL_TTL_S)||new Map();
    $('usSettingsModalBody').innerHTML=`<div class="us-settings2-modal-copy">Le Stories che avete condiviso, solo per voi.</div><div class="us-story-archive">${stories.map(s=>{
      const url=urls.get(s.media_path);if(!url)return '';
      const date=new Date(s.created_at).toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{day:'numeric',month:'short'});
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

// Colori a scelta (US Plus, 29/10/2026): one of 8, never the other person's;
// the server checks Plus and the colour again (set_my_color).
// Without Plus: the 8 colours, locked. Nothing to buy while Plus is not on
// sale (D4: the closed test sees no payments).
function personColorLockedModal(){
  const list=window.UsPersonColors?.choices?.(settingsSnapshot?.profiles||[],window.usProfile?.id)||[];
  openModal('Il tuo colore',`<p class="us-person-color-locked">Si sblocca con US Plus: ognuno di voi sceglie il suo colore tra 8, e lo vedete tutti e due.</p><div class="us-setting-choice us-person-colors is-locked">${list.map(c=>`<button type="button" aria-disabled="true" data-person-color-locked><span><i class="us-person-swatch" style="background:${esc(c.hex)}" aria-hidden="true"></i>${esc(c.name)}</span><b>${c.mine?'Il tuo':''}</b></button>`).join('')}</div>`,'US PLUS');
  $('usSettingsModalBody').querySelectorAll('[data-person-color-locked]').forEach(btn=>btn.addEventListener('click',()=>toast('Si sblocca con US Plus')));
}
function personColorModal(){
  const profiles=settingsSnapshot?.profiles||[],meId=window.usProfile?.id;
  const me=profiles.find(p=>p.id===meId),partner=profiles.find(p=>p.id!==meId)?.display_name||'la tua persona';
  const list=window.UsPersonColors?.choices?.(profiles,meId)||[];
  openModal('Il tuo colore',`<div class="us-setting-choice us-person-colors">${list.map(c=>`<button data-person-color="${esc(c.id)}" class="${c.mine?'active':''}"${c.taken?' disabled':''}><span><i class="us-person-swatch" style="background:${esc(c.hex)}" aria-hidden="true"></i>${esc(c.name)}</span><b>${c.mine?'Il tuo':c.taken?esc(partner):''}</b></button>`).join('')}</div>${me?.person_color?'<button type="button" class="us-ob-link us-person-color-reset" data-person-color="">Torna al colore di sempre</button>':''}`,'US PLUS');
  $('usSettingsModalBody').querySelectorAll('[data-person-color]').forEach(btn=>btn.addEventListener('click',async()=>{
    if(btn.disabled)return;
    const color=btn.dataset.personColor||null;
    const {error}=await sb.rpc('set_my_color',{p_color:color});
    if(error){toast(/partner color/.test(error.message||'')?`È il colore di ${partner}`:'Non riesco a cambiare il colore. Riprova.');return;}
    if(me)me.person_color=color;
    window.UsPersonColors?.applyCoupleColors?.(profiles);
    closeModal();hydrateUsSettings();toast('Colore aggiornato ♡');
  }));
}

// Location A: explanation before the permission, "Smetti e cancella" when shared.
// Mockup set-posizione / set-posizione-bloccata: a status row, why it is
// there, the way out; an amber banner when the phone blocks it.
function locationAgeLabel(){
  const at=typeof usLocationRuntime!=='undefined'?Date.parse(usLocationRuntime?.mineUpdatedAt||''):NaN;
  if(!Number.isFinite(at))return 'Solo la distanza tra voi';
  const minutes=Math.max(0,Math.floor((Date.now()-at)/60000));
  if(minutes<1)return 'Aggiornata ora';
  if(minutes<60)return minutes===1?'Aggiornata 1 minuto fa':`Aggiornata ${minutes} minuti fa`;
  const hours=Math.floor(minutes/60);
  if(hours<24)return hours===1?'Aggiornata 1 ora fa':`Aggiornata ${hours} ore fa`;
  const days=Math.floor(hours/24);
  return days===1?'Aggiornata 1 giorno fa':`Aggiornata ${days} giorni fa`;
}
async function locationAction(){
  const state=await locationState();
  const sharing=Boolean(window.UsLocation?.isSharing?.());
  if(state==='denied'&&!sharing){
    openModal('Posizione','<div class="us-settings2-push-master is-warn"><span><b>Bloccata</b><small>La posizione è bloccata dalle impostazioni del telefono.</small></span></div>','PERMESSO');
    return;
  }
  if(sharing&&window.UsLocation?.stop){
    openModal('Posizione',`
      <div class="us-settings2-status-list"><div><span><b>Consentita</b><small>${esc(locationAgeLabel())}</small></span><i class="ok">✓</i></div></div>
      <div class="us-settings2-modal-copy">Serve solo per mostrare la distanza tra voi in Oggi. Se smetti, la posizione salvata viene cancellata subito.</div>
      <div class="us-settings2-action-stack"><button type="button" class="ghost is-danger" id="usStopLocationSharing">Smetti e cancella</button></div>
    `,'PRIVACY');
    $('usStopLocationSharing')?.addEventListener('click',async()=>{
      const btn=$('usStopLocationSharing');if(btn)btn.disabled=true;
      const stopped=await window.UsLocation.stop();
      if(stopped)closeModal();else if(btn)btn.disabled=false;
      setTimeout(hydrateUsSettings,450);
    });
    return;
  }
  await window.UsLocation?.openSettings?.();
  setTimeout(hydrateUsSettings,450);
}

function preferenceToggle(key,label,checked){
  return `<button type="button" class="us-settings2-toggle-row" data-pref="${key}" aria-pressed="${checked?'true':'false'}">
    <span><b>${label}</b><small>${key==='think'?'Quando la tua persona ti pensa':key==='today'?'Quando arriva e quando le risposte sono pronte':key==='bond'?'Missioni, nuovi livelli e sblocchi':key==='left_for_you'?'Quando trovi qualcosa nella busta':key==='games'?'Quando tocca a te':'Mesiversario, anniversario ed eventi'}</small></span>
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
    ${feedbackToggle('haptics','Vibrazione','Tocchi brevi e delicati sui gesti',prefs.haptics)}
  </div>
  <section class="us-feedback-preview" aria-label="Prova i feedback">
    <div class="us-feedback-preview-heading"><b>Prova i feedback</b></div>
    <div class="us-feedback-preview-grid">
      <button type="button" data-us-feedback="off" data-feedback-preview="action">Azione</button>
      <button type="button" data-us-feedback="off" data-feedback-preview="success">Completato</button>
      <button type="button" data-us-feedback="off" data-feedback-preview="attention">Ti penso</button>
      <button type="button" data-us-feedback="off" data-feedback-preview="reveal">Sblocco</button>
      <button type="button" data-us-feedback="off" data-feedback-preview="haptic-test">Test vibrazione</button>
    </div>
  </section>
  <p class="us-feedback-preview-note" id="usFeedbackPreviewStatus" role="status" aria-live="polite">${prefs.sounds || prefs.haptics ? "" : "Attiva suoni o vibrazione per provare."}</p>`,'QUESTO TELEFONO');
  $('usSettingsModalBody').querySelectorAll('[data-feedback]').forEach(btn=>btn.addEventListener('click',()=>{
    const next=btn.getAttribute('aria-pressed')!=='true';
    if(btn.dataset.feedback==='sounds')window.UsFeedback?.setSoundsEnabled?.(next);
    else window.UsFeedback?.setHapticsEnabled?.(next);
    btn.setAttribute('aria-pressed',next?'true':'false');
    btn.querySelector('i')?.classList.toggle('on',next);
    const value=$('usFeedbackValue');if(value)value.textContent=feedbackSummary();
    const previewStatus=$('usFeedbackPreviewStatus');
    const enabled=window.UsFeedback?.getPreferences?.();
    if(previewStatus&&enabled)previewStatus.textContent=enabled.sounds||enabled.haptics?'':'Attiva suoni o vibrazione per provare.';
    if(next)window.UsFeedback?.[btn.dataset.feedback==='sounds'?'action':'selection']?.();
  }));
  $('usSettingsModalBody').querySelectorAll('[data-feedback-preview]').forEach(btn=>btn.addEventListener('click',()=>{
    const kind=btn.dataset.feedbackPreview;
    // Mockup set-suoni: a ring in my colour leaves the button (600 ms, E.out).
    if(!window.UsUiFoundation?.isReducedMotion?.())btn.animate?.([{boxShadow:`0 0 0 0 ${getComputedStyle(document.documentElement).getPropertyValue('--us-tu').trim()||'#ff7c96'}`},{boxShadow:'0 0 0 10px transparent'}],{duration:600,easing:'cubic-bezier(.2,.8,.2,1)'});
    const enabled=window.UsFeedback?.getPreferences?.();
    const status=$('usFeedbackPreviewStatus');
    if(kind==='haptic-test'){
      if(!enabled?.haptics){
        if(status)status.textContent='Attiva Vibrazione qui sopra per provarla.';
        return;
      }
      window.UsFeedback?.testHaptic?.();
      if(status)status.textContent='Impulso richiesto. Se non lo senti, controlla le impostazioni di vibrazione del telefono.';
      return;
    }
    if(!['action','success','attention','reveal'].includes(kind))return;
    if(enabled && !enabled.sounds && !enabled.haptics){
      if(status)status.textContent='Attiva suoni o vibrazione per provare.';
      return;
    }
    window.UsFeedback?.[kind]?.();
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
  // Mockup set-ottimizza: lead, an amber progress bar with "n / total", two buttons.
  openModal('Ottimizza Ricordi',`
    <div class="us-settings2-modal-copy">Creo anteprime leggere dei vostri ricordi, così si aprono prima e occupano meno spazio. Gli originali restano intatti.</div>
    <div class="us-settings2-progress"><div class="us-settings2-bar-track"><i id="usOptimizeRicordiBar"></i></div><p id="usOptimizeRicordiProgress" role="status" aria-live="polite"></p></div>
    <div class="us-settings2-action-stack">
      <button type="button" class="primary" id="usOptimizeRicordiStart">Ottimizza adesso</button>
      <button type="button" class="ghost" id="usOptimizeRicordiCancel">Più tardi</button>
    </div>
    <p class="us-settings2-note">L'operazione scarica temporaneamente le foto: falla una volta quando sei sotto Wi-Fi.</p>
  `,'QUESTO TELEFONO');
  window.UsRicordiThumbnails.missingCount?.().then(count=>{const progress=$('usOptimizeRicordiProgress');if(progress&&!progress.textContent&&count>0)progress.textContent=`0 / ${count}`;}).catch(()=>{});
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
        const bar=$('usOptimizeRicordiBar');if(bar)bar.style.width=state.total?`${Math.round(processed/state.total*100)}%`:'100%';
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
// Mockup set-notifiche / set-notifiche-negate: a banner in my colour with a
// small button; when the phone blocks US, an amber banner, the way out and
// one full-width button (only where the system settings can be opened).
const US_NATIVE_PUSH_COPY=Object.freeze({
  active:{title:'Attive su questo telefono',detail:'Ricevi i Ti penso anche a US chiusa.',action:'Disattiva',kind:'ghost'},
  inactive:{title:'Non attive',detail:'Non ricevi niente quando US è chiusa.',action:'Attiva',kind:'primary'},
  denied:{title:'Permesso negato',detail:'Il telefono blocca le notifiche di US.',action:'Apri impostazioni di sistema',kind:'primary',warn:true},
  settings:{title:'Da attivare nelle impostazioni',detail:'Le notifiche di US sono spente nel telefono.',action:'Apri impostazioni di sistema',kind:'primary',warn:true},
  unavailable:{title:'Configurazione non disponibile',detail:'Questa versione di US non può ancora ricevere notifiche.',action:'',kind:'ghost',warn:true}
});
const US_PUSH_BLOCKED_LEAD='<div class="us-settings2-modal-copy">Per ricevere i Ti penso anche a US chiusa, consenti le notifiche dalle impostazioni del telefono.</div>';
function pushMasterMarkup(state){
  if(state.native){
    const copy=US_NATIVE_PUSH_COPY[state.kind]||US_NATIVE_PUSH_COPY.unavailable;
    if(copy.warn)return `<div class="us-settings2-push-master is-warn" data-push-state="${esc(state.kind||'unavailable')}">
      <span><b>${copy.title}</b><small>${copy.detail}</small></span>
    </div>${copy.action?`${US_PUSH_BLOCKED_LEAD}<div class="us-settings2-action-stack"><button type="button" class="${copy.kind}" id="usSettingsPushAction">${copy.action}</button></div>`:''}`;
    return `<div class="us-settings2-push-master" data-push-state="${esc(state.kind||'unavailable')}">
      <span><b>${copy.title}</b><small>${copy.detail}</small></span>
      ${copy.action?`<button type="button" class="${copy.kind}" id="usSettingsPushAction">${copy.action}</button>`:''}
    </div>`;
  }
  if(state.permission==='denied')return `<div class="us-settings2-push-master is-warn" data-push-state="denied">
      <span><b>${US_NATIVE_PUSH_COPY.denied.title}</b><small>${US_NATIVE_PUSH_COPY.denied.detail}</small></span>
    </div>${US_PUSH_BLOCKED_LEAD}`;
  const copy=state.active?US_NATIVE_PUSH_COPY.active:US_NATIVE_PUSH_COPY.inactive;
  return `<div class="us-settings2-push-master">
      <span><b>${copy.title}</b><small>${copy.detail}</small></span>
      <button type="button" class="${copy.kind}" id="usSettingsPushAction">${copy.action}</button>
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
    <p class="us-settings2-group-label">Cosa ricevere</p>
    <div class="us-settings2-toggle-list">
      ${preferenceToggle('think','Ti penso',p.think!==false)}
      ${preferenceToggle('today','Domanda di oggi',p.today!==false)}
      ${preferenceToggle('bond','Sintonia',p.bond!==false)}
      ${preferenceToggle('relationship','Ricorrenze',p.relationship!==false)}
      ${preferenceToggle('left_for_you','Lasciato per te',p.left_for_you!==false)}
      ${preferenceToggle('games','Gioca',p.games!==false)}
    </div>
    <p class="us-settings2-note">Valgono per il tuo account, su ogni telefono.</p>
  `,state.native?(state.kind==='denied'||state.kind==='settings'?'PERMESSO':'NOTIFICHE'):state.permission==='denied'?'PERMESSO':'NOTIFICHE');

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
  // Mockup set-stato: four checks and "Tutto aggiornato · US 1.0".
  const rows=[
    ['Rete',navigator.onLine?'Online':'Offline',navigator.onLine],
    ['Coppia',`${profiles.length} di 2 profili collegati`,profiles.length>=2],
    ['Notifiche',push.native?({active:'Attive',inactive:'Non attive',denied:'Permesso negato',settings:'Da attivare',unavailable:'Non disponibili'}[push.kind]||'Non disponibili'):push.active?'Attive':push.permission==='denied'?'Bloccate':'Non attive',push.active],
    ['Posizione',loc==='denied'?'Bloccata':window.UsLocation?.isSharing?.()?'Consentita':'Non attiva',loc!=='denied'&&Boolean(window.UsLocation?.isSharing?.())]
  ];
  $('usSettingsModalBody').innerHTML=`<div class="us-settings2-status-list">${rows.map(([label,value,ok])=>`
    <div><span><b>${label}</b><small>${value}</small></span><i class="${ok?'ok':''}">${ok?'✓':'○'}</i></div>
  `).join('')}</div><p class="us-settings2-build-detail" title="${esc(currentBuild())}">${rows.every(row=>row[2])?'Tutto aggiornato · ':''}US 1.0</p>`;
}

async function privacyModal(){
  // The support address lives in account-deletion.js (loaded on demand).
  let api=null;
  try{api=await loadAccountDeletion();}catch(_){}
  // Public legal pages (privacy.html, termini.html), in the app's language.
  const en=/^en/i.test(document.documentElement.lang||'');
  const legal=page=>`https://us-a33.pages.dev/${page}${en?'-en':''}`;
  openModal('Privacy e dati',`
    <div class="us-settings-copy">
      <p><b>Posizione</b><span>Solo approssimativa e solo se la attivi: la tua persona vede la distanza, mai dove sei. Puoi smettere e cancellarla da Posizione.</span></p>
      <p><b>Foto</b><span>Restano nello spazio della coppia.</span></p>
      <p><b>Notifiche</b><span>Scegli tu quali ricevere.</span></p>
      <p><b>Questo telefono</b><span>Resta collegato finché non lo scolleghi.</span></p>
      <p class="us-settings-legal"><a href="${legal('privacy')}" target="_blank" rel="noopener noreferrer">Privacy</a> · <a href="${legal('termini')}" target="_blank" rel="noopener noreferrer">Termini</a></p>
    </div>
    ${api?`<div class="us-settings-copy">
      <p><b>Una copia dei tuoi dati</b> · scrivi a <b>${esc(api.US_SUPPORT_EMAIL)}</b> dall’email del tuo account.</p>
    </div>`:''}
    <div class="us-settings2-action-stack">
      <button type="button" class="ghost" id="usOpenLeaveCouple">Esci dalla coppia</button>
      <button type="button" class="us-settings2-disconnect" id="usOpenAccountDeletion">Elimina account</button>
    </div>
  `,'DATI');
  $('usOpenLeaveCouple')?.addEventListener('click',leaveCoupleModal);
  $('usOpenAccountDeletion')?.addEventListener('click',accountDeletionModal);
}

// S3.2 — account deletion (Policy A v1). Immediate and irreversible after
// confirmation; the Edge `delete-account` decides what is deleted and what
// stays for the partner. The password is never logged or stored: it only goes
// to the fresh Supabase Auth password check and the field is cleared right after.
// Shared logic + support placeholder live in account-deletion.js (loaded on demand).
let accountDeletionLoader=null;
let accountDeletionInFlight=false;
let accountDeletionMode=null;
function loadAccountDeletion(){
  if(window.UsAccountDeletion)return Promise.resolve(window.UsAccountDeletion);
  if(!accountDeletionLoader)accountDeletionLoader=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=`/account-deletion.js?v=${encodeURIComponent(currentBuild())}`;
    script.async=true;
    script.onload=()=>window.UsAccountDeletion?resolve(window.UsAccountDeletion):reject(new Error('account deletion module missing'));
    script.onerror=()=>{accountDeletionLoader=null;reject(new Error('account deletion module unavailable'));};
    document.head.appendChild(script);
  });
  return accountDeletionLoader;
}

// Accesso con Google (25/10/2026): an account without a password confirms
// deletion and leaving with Google again (google-auth.js, Android only).
async function accountReauthMode(){
  let user=null;
  try{const {data}=await sb.auth.getSession();user=data?.session?.user||null;}catch(_){}
  const google=Boolean(user&&window.UsGoogleAuth?.usesGoogle?.(user)&&!window.UsGoogleAuth?.hasPassword?.(user));
  const available=!google||Boolean(window.usGoogleAuth?.native&&window.usGoogleAuth?.supported?.());
  return {user,google,available,client:google&&available?window.usGoogleAuth:null};
}
function reauthField(mode,id,support){
  if(!mode.google)return `<label class="us-settings2-field"><span>Password del tuo account</span><input id="${id}" type="password" autocomplete="current-password" required></label>`;
  return mode.available
    ?'<p class="us-settings2-modal-copy">Accedi con Google: per confermare ti chiederemo di scegliere di nuovo il tuo account Google.</p>'
    :`<p class="us-settings2-modal-copy">Accedi con Google: per confermare usa US sul telefono Android, oppure scrivi a <b>${support}</b>.</p>`;
}

async function accountDeletionModal(){
  let api=null;
  try{api=await loadAccountDeletion();}catch(_){}
  if(!api){
    openModal('Elimina account','<div class="us-settings2-modal-copy">Non riesco ad aprire l’eliminazione adesso. Controlla la connessione e riprova.</div>','ACCOUNT');
    return;
  }
  const support=esc(api.US_SUPPORT_EMAIL);
  const mode=await accountReauthMode();
  accountDeletionMode=mode;
  openModal('Elimina account',`
    <div class="us-settings-copy us-account-delete-copy">
      <p><b>È definitivo.</b> Dopo la conferma non si può annullare: l’eliminazione parte subito e si completa entro 30 giorni.</p>
      <p><b>Cosa viene eliminato</b> · il tuo account e il profilo, la foto profilo, le tue risposte di Oggi, l’umore e le risposte ai giochi, la posizione, le preferenze di notifica e i dispositivi collegati, le Stories, i tuoi impegni personali, i Lasciato per te che la tua persona non ha conservato e i messaggi programmati non ancora consegnati.</p>
      <p><b>Cosa resta alla tua persona</b> · i ricordi condivisi che hai creato: Momenti e foto, messaggi già consegnati, impegni ed eventi condivisi, desideri, ricordi delle risposte create insieme e ciò che ha scelto di conservare. Restano senza il tuo nome. Non riceverà una notifica e lo spazio di coppia viene chiuso: nessun altro potrà entrarci.</p>
      <p>Se nella coppia ci sei solo tu, viene eliminato tutto lo spazio di coppia, foto comprese.</p>
      <p><b>Vuoi una copia dei tuoi dati?</b> Prima di eliminare scrivi a <b>${support}</b>: la ricevi entro 30 giorni.</p>
    </div>
    <form id="usAccountDeleteForm" novalidate>
      ${reauthField(mode,'usAccountDeletePassword',support)}
      <label class="us-settings2-field"><span>Scrivi ${esc(api.CONFIRM_WORD)} per confermare</span><input id="usAccountDeleteConfirm" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" required></label>
      <p class="us-settings2-modal-copy us-account-delete-status" id="usAccountDeleteStatus" role="status" aria-live="polite" hidden></p>
      <div class="us-settings2-action-stack">
        <button type="button" class="ghost" id="usAccountDeleteCancel">Annulla</button>
        <button type="submit" class="us-settings2-disconnect" id="usAccountDeleteSubmit" disabled>Elimina definitivamente</button>
      </div>
    </form>
  `,'ACCOUNT');
  const password=$('usAccountDeletePassword');
  const confirm=$('usAccountDeleteConfirm');
  const submit=$('usAccountDeleteSubmit');
  const sync=()=>{if(submit&&!accountDeletionInFlight)submit.disabled=!(mode.available&&api.canSubmit({password:password?.value,confirm:confirm?.value,google:Boolean(mode.client)}));};
  password?.addEventListener('input',sync);
  confirm?.addEventListener('input',sync);
  $('usAccountDeleteCancel')?.addEventListener('click',()=>{if(password)password.value='';closeModal();});
  $('usAccountDeleteForm')?.addEventListener('submit',event=>{event.preventDefault();submitAccountDeletion(api);});
  (password||confirm)?.focus({preventScroll:true});
}

function accountDeletionStatus(text){
  const status=$('usAccountDeleteStatus');
  if(!status)return;
  status.hidden=!text;
  status.textContent=text||'';
}

async function submitAccountDeletion(api){
  if(accountDeletionInFlight)return;
  const passwordInput=$('usAccountDeletePassword');
  const confirmInput=$('usAccountDeleteConfirm');
  const submit=$('usAccountDeleteSubmit');
  const cancel=$('usAccountDeleteCancel');
  const password=passwordInput?.value||'';
  const mode=accountDeletionMode||{};
  if(!api.canSubmit({password,confirm:confirmInput?.value,google:Boolean(mode.client)}))return;
  accountDeletionInFlight=true;
  if(passwordInput)passwordInput.value='';
  if(submit){submit.disabled=true;submit.textContent='Elimino…';}
  if(cancel)cancel.disabled=true;
  accountDeletionStatus('Elimino il tuo account…');
  let result;
  try{
    let email='';
    try{const {data}=await sb.auth.getSession();email=data?.session?.user?.email||'';}catch(_){}
    // Fresh password sign-in first (the Edge requires it), then delete-account.
    result=await api.reauthenticateAndDelete({
      client:sb,
      email,
      password,
      google:mode.client,
      user:mode.user,
      channel:'app',
      supabaseUrl:typeof SB_URL==='string'?SB_URL:'',
      apiKey:typeof SB_KEY==='string'?SB_KEY:''
    });
  }catch(_){
    result={kind:'deletion_failed',done:false};
  }
  if(result.done){
    accountDeletionDone=true;
    accountDeletedScreen(api,result.kind,clearDeviceAfterAccountDeletion());
    return;
  }
  accountDeletionInFlight=false;
  if(submit){submit.textContent='Elimina definitivamente';submit.disabled=true;}
  if(cancel)cancel.disabled=false;
  accountDeletionStatus(api.message(result.kind,api.US_SUPPORT_EMAIL,'app'));
  (passwordInput||confirmInput)?.focus({preventScroll:true});
}

// The server already removed sessions, devices and push/widget tokens: this is
// only the local mirror of logout (logout()), and no failure here may block
// the outcome. Every step is best-effort and time-bounded.
const usBounded=(work,ms)=>Promise.race([Promise.resolve(work),new Promise(resolve=>setTimeout(resolve,ms))]);
async function clearDeviceAfterAccountDeletion(){
  try{await usBounded(window.revokeCurrentDevice?.(),6000);}catch(_){}
}
// Local sign-out last, right before the reload, so the signed-out screen does
// not cover the "Account eliminato" confirmation.
async function signOutLocallyAfterAccountDeletion(){
  try{await usBounded(sb.auth.signOut({scope:'local'}),4000);}catch(_){}
  try{await window.usDurableAuthStorage?.removeItem?.(sb.auth.storageKey);}catch(_){}
  // Session gone: drop this phone's biometric protection record too (as logout()).
  try{await usBounded(window.UsAppLock?.reset?.(),3000);}catch(_){}
}

function accountDeletedScreen(api,kind,cleanup){
  openModal('Account eliminato',`
    <div class="us-settings2-modal-copy" role="status" aria-live="polite">${esc(api.message(kind,api.US_SUPPORT_EMAIL))} <span>Grazie per aver usato US.</span></div>
    <div class="us-settings2-action-stack">
      <button type="button" class="primary" id="usAccountDeletedDone">Chiudi</button>
    </div>
  `,'ACCOUNT');
  let finishing=null;
  const finish=()=>finishing||(finishing=(async()=>{
    const btn=$('usAccountDeletedDone');if(btn)btn.disabled=true;
    try{await cleanup;}catch(_){}
    await signOutLocallyAfterAccountDeletion();
    location.reload();
  })());
  $('usAccountDeletedDone')?.addEventListener('click',finish);
  $('usAccountDeletedDone')?.focus({preventScroll:true});
  setTimeout(finish,8000);
}

// Esci dalla coppia (1.0, founder decision 3): closes the couple space like a
// deletion (the partner keeps the shared memories, without your name) but
// keeps the account; after it the app reopens on onboarding. Same password
// rules as the deletion: never logged or stored, field cleared at once.
let leaveCoupleInFlight=false;
let leaveCoupleMode=null;
async function leaveCoupleModal(){
  let api=null;
  try{api=await loadAccountDeletion();}catch(_){}
  if(!api){
    openModal('Esci dalla coppia','<div class="us-settings2-modal-copy">Non riesco ad aprire questa schermata adesso. Controlla la connessione e riprova.</div>','COPPIA');
    return;
  }
  const mode=await accountReauthMode();
  leaveCoupleMode=mode;
  openModal('Esci dalla coppia',`
    <div class="us-settings-copy us-account-delete-copy">
      <p><b>Lo spazio di coppia si chiude.</b> Dopo la conferma non si può annullare. Il tuo account resta: potrai creare un nuovo spazio o accettare un invito.</p>
      <p><b>Cosa viene eliminato</b> · il tuo profilo in questa coppia e la foto profilo, le tue risposte di Oggi, l’umore e le risposte ai giochi, la posizione, i dispositivi collegati, le Stories, i tuoi impegni personali, i Lasciato per te che la tua persona non ha conservato e i messaggi programmati non ancora consegnati.</p>
      <p><b>Cosa resta alla tua persona</b> · i ricordi condivisi che hai creato: Momenti e foto, messaggi già consegnati, impegni ed eventi condivisi, desideri e ciò che ha scelto di conservare. Restano senza il tuo nome. Nessun altro potrà entrare in questo spazio.</p>
      <p>Se nella coppia ci sei solo tu, viene eliminato tutto lo spazio di coppia, foto comprese.</p>
      <p><b>Vuoi una copia dei tuoi dati?</b> Prima di uscire scrivi a <b>${esc(api.US_SUPPORT_EMAIL)}</b>.</p>
    </div>
    <form id="usLeaveCoupleForm" novalidate>
      ${reauthField(mode,'usLeaveCouplePassword',esc(api.US_SUPPORT_EMAIL))}
      <label class="us-settings2-field"><span>Scrivi ${esc(api.LEAVE_WORD)} per confermare</span><input id="usLeaveCoupleConfirm" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" required></label>
      <p class="us-settings2-modal-copy us-account-delete-status" id="usLeaveCoupleStatus" role="status" aria-live="polite" hidden></p>
      <div class="us-settings2-action-stack">
        <button type="button" class="ghost" id="usLeaveCoupleCancel">Annulla</button>
        <button type="submit" class="us-settings2-disconnect" id="usLeaveCoupleSubmit" disabled>Esci dalla coppia</button>
      </div>
    </form>
  `,'COPPIA');
  const password=$('usLeaveCouplePassword');
  const confirm=$('usLeaveCoupleConfirm');
  const submit=$('usLeaveCoupleSubmit');
  const sync=()=>{if(submit&&!leaveCoupleInFlight)submit.disabled=!(mode.available&&api.canLeave({password:password?.value,confirm:confirm?.value,google:Boolean(mode.client)}));};
  password?.addEventListener('input',sync);
  confirm?.addEventListener('input',sync);
  $('usLeaveCoupleCancel')?.addEventListener('click',()=>{if(password)password.value='';closeModal();});
  $('usLeaveCoupleForm')?.addEventListener('submit',event=>{event.preventDefault();submitLeaveCouple(api);});
  (password||confirm)?.focus({preventScroll:true});
}

function leaveCoupleStatus(text){
  const status=$('usLeaveCoupleStatus');
  if(!status)return;
  status.hidden=!text;
  status.textContent=text||'';
}

async function submitLeaveCouple(api){
  if(leaveCoupleInFlight)return;
  const passwordInput=$('usLeaveCouplePassword');
  const confirmInput=$('usLeaveCoupleConfirm');
  const submit=$('usLeaveCoupleSubmit');
  const cancel=$('usLeaveCoupleCancel');
  const password=passwordInput?.value||'';
  const mode=leaveCoupleMode||{};
  if(!api.canLeave({password,confirm:confirmInput?.value,google:Boolean(mode.client)}))return;
  leaveCoupleInFlight=true;
  if(passwordInput)passwordInput.value='';
  if(submit){submit.disabled=true;submit.textContent='Esco…';}
  if(cancel)cancel.disabled=true;
  leaveCoupleStatus('Chiudo lo spazio di coppia…');
  let result;
  try{
    let email='';
    try{const {data}=await sb.auth.getSession();email=data?.session?.user?.email||'';}catch(_){}
    result=await api.reauthenticateAndLeave({
      client:sb,
      email,
      password,
      google:mode.client,
      user:mode.user,
      supabaseUrl:typeof SB_URL==='string'?SB_URL:'',
      apiKey:typeof SB_KEY==='string'?SB_KEY:''
    });
  }catch(_){
    result={kind:'leave_failed',done:false};
  }
  if(result.done){
    // Server side the profile, devices and push tokens are gone; this phone
    // drops its copies (push, widgets, cached couple data) and keeps the session.
    leftCoupleScreen(api,result.kind,usBounded(window.revokeCurrentDevice?.(),6000));
    return;
  }
  leaveCoupleInFlight=false;
  if(submit){submit.textContent='Esci dalla coppia';submit.disabled=true;}
  if(cancel)cancel.disabled=false;
  leaveCoupleStatus(api.leaveMessage(result.kind,api.US_SUPPORT_EMAIL));
  (passwordInput||confirmInput)?.focus({preventScroll:true});
}

function leftCoupleScreen(api,kind,cleanup){
  openModal('Spazio di coppia chiuso',`
    <div class="us-settings2-modal-copy" role="status" aria-live="polite">${esc(api.leaveMessage(kind,api.US_SUPPORT_EMAIL))}</div>
    <div class="us-settings2-action-stack">
      <button type="button" class="primary" id="usLeftCoupleDone">Continua</button>
    </div>
  `,'COPPIA');
  let finishing=null;
  const finish=()=>finishing||(finishing=(async()=>{
    const btn=$('usLeftCoupleDone');if(btn)btn.disabled=true;
    try{await cleanup;}catch(_){}
    location.reload();
  })());
  $('usLeftCoupleDone')?.addEventListener('click',finish);
  $('usLeftCoupleDone')?.focus({preventScroll:true});
  setTimeout(finish,8000);
}

// Segnala un problema o un contenuto (1.0, Play UGC): goes to the US team
// only, never to the partner. Moderation: docs/store/US_MODERATION_PROCEDURE.md.
let reportInFlight=false;
async function reportModal(){
  let api=null;
  try{api=await loadAccountDeletion();}catch(_){}
  if(!api){
    openModal('Segnala','<div class="us-settings2-modal-copy">Non riesco ad aprire le segnalazioni adesso. Controlla la connessione e riprova.</div>','SUPPORTO');
    return;
  }
  openModal('Segnala un problema o un contenuto',`
    <div class="us-settings-copy">
      <p>La segnalazione arriva solo al team di US: la tua persona non la vede. Se qualcuno è in pericolo chiama subito il 112.</p>
    </div>
    <form id="usReportForm" novalidate>
      <fieldset class="us-settings2-field us-report-categories">
        <legend>Cosa vuoi segnalare?</legend>
        ${api.REPORT_CATEGORIES.map(c=>`<label class="us-report-option"><input type="radio" name="usReportCategory" value="${esc(c.key)}"> <span>${esc(c.label)}</span></label>`).join('')}
      </fieldset>
      <label class="us-settings2-field"><span>Cosa è successo?</span><textarea id="usReportDetails" rows="5" maxlength="${api.REPORT_MAX_LENGTH}" placeholder="Scrivi dove lo hai visto e quando, così lo troviamo subito."></textarea></label>
      <p class="us-settings2-modal-copy us-account-delete-status" id="usReportStatus" role="status" aria-live="polite" hidden></p>
      <div class="us-settings2-action-stack">
        <button type="button" class="ghost" id="usReportCancel">Annulla</button>
        <button type="submit" class="primary" id="usReportSubmit" disabled>Invia segnalazione</button>
      </div>
    </form>
  `,'SUPPORTO');
  const details=$('usReportDetails');
  const submit=$('usReportSubmit');
  const category=()=>$('usReportForm')?.querySelector('input[name="usReportCategory"]:checked')?.value||'';
  const sync=()=>{if(submit&&!reportInFlight)submit.disabled=!api.canReport({category:category(),details:details?.value});};
  details?.addEventListener('input',sync);
  $('usReportForm')?.querySelectorAll('input[name="usReportCategory"]').forEach(input=>input.addEventListener('change',sync));
  $('usReportCancel')?.addEventListener('click',closeModal);
  $('usReportForm')?.addEventListener('submit',async event=>{
    event.preventDefault();
    if(reportInFlight||!api.canReport({category:category(),details:details?.value}))return;
    reportInFlight=true;
    if(submit){submit.disabled=true;submit.textContent='Invio…';}
    let result;
    try{result=await api.submitReport({client:sb,category:category(),details:details?.value});}
    catch(_){result={kind:'failed',done:false};}
    reportInFlight=false;
    if(result.done){
      openModal('Segnalazione inviata',`
        <div class="us-settings2-modal-copy" role="status" aria-live="polite">${esc(api.reportMessage('received',api.US_SUPPORT_EMAIL))}</div>
        <div class="us-settings2-action-stack"><button type="button" class="primary" id="usReportDone">Chiudi</button></div>
      `,'SUPPORTO');
      $('usReportDone')?.addEventListener('click',closeModal);
      return;
    }
    if(submit){submit.textContent='Invia segnalazione';sync();}
    const status=$('usReportStatus');
    if(status){status.hidden=false;status.textContent=api.reportMessage(result.kind,api.US_SUPPORT_EMAIL);}
  });
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
  // Which sheet is open: dc-settings.css gives each one the mockup's blocks.
  const overlay=$('usSettingsOverlay');if(overlay?.dataset&&name!=='maudit'&&name!=='app-lock')overlay.dataset.usSettingsSheet=name;
  if(name==='relationship-date')return relationshipDateModal();
  if(name==='together-mode')return window.UsDistance?.open?.();
  if(name==='person-color'){if(!settingsSnapshot?.plusActive)return personColorLockedModal();return personColorModal();}
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
  if(name==='oggi-theme')return window.USOggiLook?.openGallery?.({tab:'theme'});
  if(name==='oggi-effect')return window.USOggiLook?.openGallery?.({tab:'effect'});
  if(name==='sync-status')return syncStatusModal();
  if(name==='privacy')return privacyModal();
  if(name==='leave-couple')return leaveCoupleModal();
  if(name==='report')return reportModal();
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
// A new profile photo (Foto profilo) shows on the couple card at once.
window.addEventListener('us:noi-portraits-ready',()=>{if(document.getElementById('settings')?.classList.contains('active'))hydrateUsSettings();});
window.addEventListener('offline',()=>{if(document.getElementById('settings')?.classList.contains('active'))hydrateUsSettings();});
console.info('[US Settings] Settings 2 attive');
})();
