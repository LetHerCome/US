(() => {
'use strict';
if(window.__usSettingsInstalled)return;
window.__usSettingsInstalled=true;

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let settingsSnapshot=null;
let logoutInFlight=false;
let scriptableSetupCodeOpen=false;
let settingsModalGeneration=0;
let scriptableSetupCode='';

function currentBuild(){return document.querySelector('meta[name="us-build"]')?.content||'';}

function openModal(title,body,kicker='US.'){
  settingsModalGeneration+=1;
  const modalBody=$('usSettingsModalBody');
  if(scriptableSetupCodeOpen){modalBody.innerHTML='';scriptableSetupCodeOpen=false;}
  scriptableSetupCode='';
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
  settingsModalGeneration+=1;
  if(scriptableSetupCodeOpen){$('usSettingsModalBody').innerHTML='';scriptableSetupCodeOpen=false;}
  scriptableSetupCode='';
  const finalize=()=>{
    root.classList.remove('open');
    root.setAttribute('aria-hidden','true');
    document.body.classList.remove('us-settings-modal-open');
  };
  if(window.UsUiFoundation?.exitSurface)window.UsUiFoundation.exitSurface(root,finalize);else finalize();
}
function isCurrentSettingsModal(generation){
  const root=$('usSettingsOverlay');
  return generation===settingsModalGeneration&&Boolean(root&&root.classList.contains('open'));
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
  const cid=window.usProfile.couple_id;
  const unit=localStorage.getItem('us:settings:distance-unit')||'km';
  const [coupleRes,profilesRes,momentsRes,eventsRes,archiveRes,loc,push,prefsRes]=await Promise.all([
    sb.from('couples').select('started_on,bond_xp').eq('id',cid).maybeSingle(),
    sb.from('profiles').select('id,display_name,role,avatar_path').eq('couple_id',cid).order('created_at',{ascending:true}),
    sb.from('moments').select('id',{count:'exact',head:true}).eq('couple_id',cid),
    sb.from('shared_event_completions').select('event_id',{count:'exact',head:true}).eq('couple_id',cid),
    sb.from('stories').select('id',{count:'exact',head:true}).eq('couple_id',cid).lt('expires_at',new Date().toISOString()),
    locationState(),
    pushState(),
    sb.rpc('get_notification_preferences')
  ]);

  const couple=coupleRes.data||{};
  const profiles=profilesRes.data||[];
  settingsSnapshot={couple,profiles,loc,push,prefs:prefsRes.data||{think:true,today:true,bond:true,relationship:true,left_for_you:true}};

  const names=profiles.map(p=>p.display_name).filter(Boolean);
  $('usCoupleNames').textContent=names.length?names.join(' + '):'Il vostro US';
  const days=daysTogether(couple.started_on);
  $('usTogetherLine').textContent=couple.started_on?`insieme da ${days.toLocaleString('it-IT')} giorni · ${nextRelationshipLabel(couple.started_on)}`:'Imposta la data della relazione';
  $('usRelationshipDateValue').textContent=formatDate(couple.started_on);
  $('usSettingsBondLevel').textContent=`LV ${bondLevel(couple.bond_xp)}`;
  $('usSettingsMomentsCount').textContent=Number(momentsRes.count||0).toLocaleString('it-IT');
  $('usSettingsEventsCount').textContent=Number(eventsRes.count||0).toLocaleString('it-IT');
  $('usStoryArchiveValue').textContent=Number(archiveRes.count||0)?String(archiveRes.count):'';
  $('usDistanceUnitValue').textContent=unit==='mi'?'miglia':'km';
  $('usSettingsBuild').textContent=currentBuild();

  try{
      const {data:{user}}=await sb.auth.getUser();
      const upgradeRow=$('usAccountUpgradeRow');
      if(upgradeRow){
        const pending=window.readPendingAccountUpgrade?.();
        const pendingMine=pending&&user?pending.expectedUserId===user.id:false;
        // Visible while anonymous OR while a pending upgrade belongs to this
        // (now email-confirmed) UID, so it does not disappear after confirmation.
        upgradeRow.hidden=!(Boolean(user?.is_anonymous)||(pending&&pendingMine));
      }
    }catch(_){/* row stays hidden on session errors */}

  const locEl=$('usLocationState');
  locEl.className='us-setting-state';
  if(loc==='granted'){locEl.textContent='✓';locEl.classList.add('ok');}
  else if(loc==='denied'){locEl.textContent='×';locEl.classList.add('bad');}
  else locEl.textContent='○';

  const pushEl=$('usNotificationsValue');
  pushEl.textContent=push.active?'Attive':push.permission==='denied'?'Bloccate':'Non attive';
  $('usSyncValue').textContent=navigator.onLine&&profiles.length>=2?'Tutto ok':navigator.onLine?'Parziale':'Offline';
  const dot=$('usSettingsDeviceDot');
  dot.classList.toggle('ok',Boolean(navigator.onLine&&profiles.length>=2));
  dot.classList.toggle('bad',!navigator.onLine);

  const avatarPaths=profiles.map(p=>p.avatar_path).filter(Boolean);
  let urls=new Map();
  if(avatarPaths.length&&window.usGetSignedUrls)urls=await window.usGetSignedUrls(avatarPaths,21600);
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
  openModal('Archivio Stories','<div class="us-settings-loading">Carico le vostre Stories…</div>','RICORDI');
  try{
    const [{data:stories,error},{data:profiles}]=await Promise.all([
      sb.from('stories').select('id,author_id,media_path,caption,created_at,expires_at').eq('couple_id',window.usProfile.couple_id).lt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(60),
      sb.from('profiles').select('id,display_name').eq('couple_id',window.usProfile.couple_id)
    ]);
    if(error)throw error;
    if(!stories?.length){
      $('usSettingsModalBody').innerHTML='<div class="us-settings-empty"><b>Archivio ancora vuoto</b><p>Le Stories scadute compariranno qui.</p></div>';return;
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
    openModal('Posizione','<div class="us-settings-copy"><p>La posizione è bloccata dalle impostazioni del telefono/browser.</p><p>US la usa soltanto quando aggiorni la distanza tra voi due.</p></div>','PERMESSO');
    return;
  }
  await window.refreshMyLocation?.();
  setTimeout(hydrateUsSettings,450);
  toast('Posizione aggiornata');
}

function preferenceToggle(key,label,checked){
  return `<button type="button" class="us-settings2-toggle-row" data-pref="${key}" aria-pressed="${checked?'true':'false'}">
    <span><b>${label}</b><small>${key==='think'?'Segnali Ti penso':key==='today'?'Risposte e reveal di Today':key==='bond'?'Conferme delle quest Bond':key==='left_for_you'?'Quando la tua persona ti lascia qualcosa':'Mesiversari e anniversari'}</small></span>
    <i class="${checked?'on':''}"><u></u></i>
  </button>`;
}

async function notificationsModal(){
  const state=await pushState();
  const {data:prefs}=await sb.rpc('get_notification_preferences');
  const p=prefs||{think:true,today:true,bond:true,relationship:true,left_for_you:true};
  openModal('Notifiche',`
    <div class="us-settings2-push-master">
      <span><b>${state.active?'Notifiche attive':'Notifiche non attive'}</b><small>${state.permission==='denied'?'Bloccate dal telefono/browser':'Le preferenze sotto sono personali'}</small></span>
      <button type="button" class="${state.active?'ghost':'primary'}" id="usSettingsPushAction" ${state.permission==='denied'?'disabled':''}>${state.active?'Disattiva':'Attiva'}</button>
    </div>
    <div class="us-settings2-toggle-list">
      ${preferenceToggle('think','Ti penso',p.think!==false)}
      ${preferenceToggle('today','Today',p.today!==false)}
      ${preferenceToggle('bond','Bond',p.bond!==false)}
      ${preferenceToggle('relationship','Ricorrenze',p.relationship!==false)}
      ${preferenceToggle('left_for_you','Lasciato per te',p.left_for_you!==false)}
    </div>
    <div class="us-settings2-footnote">Questi interruttori regolano realmente cosa il server invia al tuo profilo.</div>
  `,'QUESTO TELEFONO');

  $('usSettingsPushAction')?.addEventListener('click',async()=>{
    const btn=$('usSettingsPushAction');btn.disabled=true;
    if(state.active)await window.disableWebPush?.();else await window.enableWebPush?.();
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

async function scriptableWidgetsModal(){
  openModal('Widget US','<div class="us-settings-loading">Controllo accesso Scriptable…</div>','QUESTO TELEFONO');
  const body=$('usSettingsModalBody');
  const modalGeneration=settingsModalGeneration;
  const refreshStatus=async()=>{
    const {data,error}=await sb.functions.invoke('widget-scriptable-setup',{body:{operation:'status'}});
    if(error)throw error;
    return data||{active:false,installations:0};
  };
  const render=async()=>{
    try{
      const status=await refreshStatus();
      if(!isCurrentSettingsModal(modalGeneration))return;
      body.innerHTML=`
        <div class="us-settings2-modal-copy">Scriptable usa due credenziali separate: la prima è read-only e, per Scriptable, restituisce solo nomi, data e giorni insieme e Foto Home selezionata; la seconda può inviare soltanto Ti penso. I token permanenti non vengono mostrati qui.</div>
        <div class="us-settings2-status-list"><div><span><b>Accesso Scriptable</b><small>${status.stateActive?'Stato attivo':'Stato non attivo'} · ${status.thinkActive?'Ti penso attivo':'Ti penso da rinnovare'}</small></span><i class="${status.active?'ok':''}">${status.active?'✓':'○'}</i></div></div>
        <div class="us-settings2-action-stack">${status.active?'':'<button type="button" class="primary" id="usScriptableIssue">Configura Scriptable</button>'}${status.active?'<button type="button" class="ghost" id="usScriptableRevoke">Revoca accesso Scriptable</button>':''}</div>
        <div class="us-settings2-modal-copy" id="usScriptableStatus" role="status" aria-live="polite">Il codice di collegamento è monouso e scade dopo 10 minuti.</div>`;
      $('usScriptableIssue')?.addEventListener('click',async()=>{
        const button=$('usScriptableIssue');const statusEl=$('usScriptableStatus');
        button.disabled=true;button.textContent='Creo il codice…';statusEl.textContent='';
        const {data,error}=await sb.functions.invoke('widget-scriptable-setup',{body:{operation:'issue'}});
        if(!isCurrentSettingsModal(modalGeneration))return;
        if(error||!data?.setupCode){button.disabled=false;button.textContent='Riprova';statusEl.textContent='Non riesco a creare il codice. Riprova.';return;}
        scriptableSetupCode=data.setupCode;
        scriptableSetupCodeOpen=true;
        body.innerHTML=`<div class="us-settings2-modal-copy"><b>Incolla questo codice una sola volta in Scriptable.</b><br>Scade tra 10 minuti. È un codice di scambio monouso, non i token permanenti dei widget.</div><label class="us-settings2-field"><span>Codice monouso</span><input id="usScriptableSetupCode" type="text" readonly value="${esc(scriptableSetupCode)}" autocomplete="off" spellcheck="false"></label><div class="us-settings2-action-stack"><button type="button" class="primary" id="usScriptableCopyCode">Copia il codice</button><button type="button" class="ghost" id="usScriptableCodeDone">Fatto</button></div><div class="us-settings2-modal-copy" id="usScriptableStatus" role="status" aria-live="polite">Dopo lo scambio, US non mostrerà nuovamente questo codice.</div>`;
        $('usScriptableCopyCode')?.addEventListener('click',async()=>{
          const codeToCopy=scriptableSetupCode;
          try{
            await navigator.clipboard.writeText(codeToCopy);
            if(!isCurrentSettingsModal(modalGeneration))return;
            $('usScriptableStatus').textContent='Codice copiato. Torna in Scriptable e incollalo nel primo widget.';
          }catch(_){
            if(!isCurrentSettingsModal(modalGeneration))return;
            const input=$('usScriptableSetupCode');input.focus();input.select();$('usScriptableStatus').textContent='Seleziona e copia il codice, poi incollalo in Scriptable.';
          }
        });
        $('usScriptableCodeDone')?.addEventListener('click',closeModal);
      });
      $('usScriptableRevoke')?.addEventListener('click',()=>{
        body.innerHTML='<div class="us-settings2-modal-copy">Revocare Scriptable? Entrambi i widget smetteranno di leggere lo stato e inviare Ti penso. Potrai collegarli di nuovo con un nuovo codice.</div><div class="us-settings2-action-stack"><button type="button" class="ghost" id="usCancelScriptableRevoke">Annulla</button><button type="button" class="us-settings2-disconnect" id="usConfirmScriptableRevoke">Revoca accesso</button></div><div class="us-settings2-modal-copy" id="usScriptableStatus" role="status" aria-live="polite"></div>';
        $('usCancelScriptableRevoke')?.addEventListener('click',render);
        $('usConfirmScriptableRevoke')?.addEventListener('click',async()=>{
          const button=$('usConfirmScriptableRevoke');button.disabled=true;button.textContent='Revoco…';
          const {error}=await sb.functions.invoke('widget-scriptable-setup',{body:{operation:'revoke'}});
          if(!isCurrentSettingsModal(modalGeneration))return;
          if(error){button.disabled=false;button.textContent='Riprova';$('usScriptableStatus').textContent='Revoca non riuscita. Riprova.';return;}
          await render();
        });
      });
    }catch(error){
      if(!isCurrentSettingsModal(modalGeneration))return;
      console.warn('[US Scriptable] status unavailable',error);
      body.innerHTML='<div class="us-settings-empty"><b>Widget US non disponibile</b><p>Riprova quando la connessione è attiva.</p></div><button type="button" class="ghost" id="usScriptableRetry">Riprova</button>';
      $('usScriptableRetry')?.addEventListener('click',render);
    }
  };
  await render();
}

async function syncStatusModal(){
  openModal('Stato US','<div class="us-settings-loading">Controllo US…</div>','SINCRONIZZAZIONE');
  const [loc,push,profilesRes]=await Promise.all([
    locationState(),
    pushState(),
    sb.from('profiles').select('id,display_name').eq('couple_id',window.usProfile.couple_id)
  ]);
  const profiles=profilesRes.data||[];
  const rows=[
    ['Rete',navigator.onLine?'Online':'Offline',navigator.onLine],
    ['Coppia',profiles.length>=2?`${profiles.length}/2 profili collegati`:`${profiles.length}/2 profili`,profiles.length>=2],
    ['Push',push.active?'Attive':push.permission==='denied'?'Bloccate':'Non attive',push.active],
    ['Posizione',loc==='granted'?'Consentita':loc==='denied'?'Bloccata':'Da chiedere',loc==='granted']
  ];
  $('usSettingsModalBody').innerHTML=`<div class="us-settings2-status-list">${rows.map(([label,value,ok])=>`
    <div><span><b>${label}</b><small>${value}</small></span><i class="${ok?'ok':''}">${ok?'✓':'○'}</i></div>
  `).join('')}</div><div class="us-settings2-build-detail">US 1.0<br><small>${esc(currentBuild())}</small></div>`;
}

function privacyModal(){
  openModal('Privacy e dati',`
    <div class="us-settings-copy">
      <p><b>Posizione</b> · viene salvata solo per calcolare la distanza tra voi.</p>
      <p><b>Foto</b> · Moments, Stories e profili restano nello spazio della coppia.</p>
      <p><b>Notifiche</b> · puoi decidere quali categorie ricevere dal tuo profilo.</p>
      <p><b>Questo telefono</b> · la sessione resta collegata finché non scegli “Scollega questo telefono”.</p>
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

// Two-phase in-place account upgrade for anonymous sessions (never creates a
// new auth user). Phase 1: request the confirmation email exactly once and show
// ONLY "controlla la tua email" — no password field yet. Phase 2 (after the
// email link is confirmed and the app is reopened): verify the ORIGINAL UID
// saved before the upgrade, then allow the password set. Passwords and emails
// are entered directly by the user and never logged or persisted.
function accountUpgradeModal(){
  openModal('Proteggi il tuo account',`
    <div class="us-settings2-modal-copy" id="usAccountUpgradeBody">
      <p>Aggiungo un'email a questo account, senza cambiare identità o dati. Ti mando un solo link di conferma.</p>
      <input id="usUpgradeEmail" type="email" inputmode="email" autocomplete="email" placeholder="tua@email.com" style="width:100%">
      <div class="us-settings2-action-stack">
        <button type="button" class="ghost" id="usCancelUpgrade">Annulla</button>
        <button type="button" class="primary" id="usSendUpgrade" style="width:100%">Invia email di conferma</button>
      </div>
      <div class="auth-status" id="usUpgradeStatus" role="status" aria-live="polite"></div>
    </div>
  `,'ACCOUNT');
  const body=document.getElementById('usAccountUpgradeBody');
  $('usCancelUpgrade')?.addEventListener('click',closeModal);
  $('usSendUpgrade')?.addEventListener('click',async()=>{
    const btn=$('usSendUpgrade');
    const st=$('usUpgradeStatus');
    // A pending upgrade for this account is the UI authority: no second send,
    // even after a reload that recreated this modal.
    if(window.readPendingAccountUpgrade?.()){
      btn.disabled=true;
      st.textContent='Una richiesta di upgrade è già in corso per questo account.';
      return;
    }
    btn.disabled=true;
    st.textContent='';
    try{
          await window.requestAccountEmailUpgrade(document.getElementById('usUpgradeEmail').value);
          // Phase boundary: after the email request only "check your email" is shown.
          // The password field appears ONLY after the email is confirmed and the
          // pending original-UID state matches the current session.
          btn.disabled=true;
          btn.textContent='Email inviata';
          st.textContent='Controlla la tua email: apri il link di conferma su questo telefono. Torna qui dopo la conferma per impostare la password.';
        }catch(err){
          const msg=String(err?.message||'invio non riuscito');
          btn.disabled=true; // single attempt: no retry path
          if(/rate|too many/i.test(msg)){
            // Pending state survives as admin_fallback_required (original UID kept);
            // no second email attempt, the email button stays disabled/hidden.
            btn.hidden=true;
            const emailInput=$('usUpgradeEmail');if(emailInput)emailInput.hidden=true;
            st.textContent='Supabase ha bloccato l\'invio (rate limit): fallback admin richiesto sullo stesso UID. Il bottone email resta disabilitato: nessun secondo invio.';
          }else{
            // Generic error: clear any pending state (never show a false "sent").
            window.clearPendingAccountUpgrade?.();
            st.textContent='Errore: '+msg;
          }
        }
      });
  // The pending upgrade is the UI authority on reopen: decide the phase.
  resumeAccountUpgradePhase();
}

async function resumeAccountUpgradePhase(){
  const body=document.getElementById('usAccountUpgradeBody');
  if(!body)return;
  const pending=window.readPendingAccountUpgrade?.();
  if(!pending)return;
  const {data:{user}}=await sb.auth.getUser();
  if(!user){window.clearPendingAccountUpgrade();return;}
  if(user.id!==pending.expectedUserId){
    // Pending state of a different UID: ignore and remove it safely.
    window.clearPendingAccountUpgrade();
    return;
  }
  // Same UID with a pending upgrade: the email request phase can never come
  // back — hide/disable it regardless of the pending phase.
  const emailInput=$('usUpgradeEmail');
  if(emailInput){emailInput.disabled=true;emailInput.hidden=true;}
  const sendBtn=$('usSendUpgrade');
  if(sendBtn){sendBtn.disabled=true;sendBtn.hidden=true;}
  const cancelBtn=$('usCancelUpgrade');
  if(cancelBtn){cancelBtn.disabled=true;cancelBtn.hidden=true;}
  if(user.is_anonymous||!user.email||!user.email_confirmed_at){
    if(pending.phase==='admin_fallback_required'){
      $('usUpgradeStatus').textContent='Serve il fallback admin sullo stesso account: l\'invio email è stato bloccato. Nessun secondo invio è possibile da qui.';
    }else{
      $('usUpgradeStatus').textContent='Controlla la tua email: apri il link di conferma su questo telefono, poi torna qui.';
    }
    return;
  }
  // Same UID, confirmed: straight to the password phase (normal confirmation
  // or admin fallback are both acceptable).
    // Resume confirmed: hide the email request phase entirely.
    $('usUpgradeEmail')?.setAttribute('hidden','');

    body.insertAdjacentHTML('beforeend',`
    <p>Sei entrata dall'email. Ora scegli una password per questo account.</p>
    <input id="usUpgradePassword" type="password" autocomplete="new-password" placeholder="Nuova password (min 6)" style="width:100%;margin-top:10px">
    <div class="us-settings2-action-stack"><button type="button" class="primary" id="usSetPassword" style="width:100%">Imposta password</button></div>`);
  $('usSetPassword')?.addEventListener('click',async()=>{
    const btn=$('usSetPassword');
    const st=$('usUpgradeStatus');
    const pending=window.readPendingAccountUpgrade?.();
    btn.disabled=true;
    // The pending expectedUserId (original anonymous UID) is the authority;
    // passing the freshly-read session user.id here would be self-referential.
    if(!pending){st.textContent='Nessuna richiesta di upgrade attiva.';return;}
    try{
      await window.setPasswordFromActiveSession(document.getElementById('usUpgradePassword').value,pending.expectedUserId);
      window.clearPendingAccountUpgrade();
      st.textContent='Account protetto ✓ Da ora puoi entrare anche con email e password.';
      closeModal();
      toast('Account protetto ♡');
    }catch(err){st.textContent='Errore: '+String(err?.message||'impostazione non riuscita');}
  });
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
  if(name==='sync-status')return syncStatusModal();
  if(name==='scriptable-widgets')return scriptableWidgetsModal();
  if(name==='account-upgrade')return accountUpgradeModal();
  if(name==='privacy')return privacyModal();
  if(name==='logout')return logoutConfirmationModal();
}


function boot(){
  document.querySelectorAll('[data-us-setting]').forEach(row=>row.addEventListener('click',()=>action(row.dataset.usSetting)));
  document.querySelectorAll('[data-us-settings-close]').forEach(el=>el.addEventListener('click',closeModal));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('usSettingsOverlay')?.classList.contains('open'))closeModal();});
  const wait=setInterval(()=>{
    const heart=$('thinkButton');if(heart)heart.hidden=!window.usProfile;
    if(window.usProfile){clearInterval(wait);hydrateUsSettings();}
  },250);
  setTimeout(()=>clearInterval(wait),30000);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.getElementById('settings')?.classList.contains('active'))hydrateUsSettings();});
window.addEventListener('online',()=>{if(document.getElementById('settings')?.classList.contains('active'))hydrateUsSettings();});
window.addEventListener('offline',()=>{if(document.getElementById('settings')?.classList.contains('active'))hydrateUsSettings();});
console.info('[US Settings] Settings 2 attive');
})();
