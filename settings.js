(() => {
'use strict';
if(window.__usSettingsInstalled)return;
window.__usSettingsInstalled=true;
const $=id=>document.getElementById(id);const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function openModal(title,body,kicker='US.'){$('usSettingsModalTitle').textContent=title;$('usSettingsModalKicker').textContent=kicker;$('usSettingsModalBody').innerHTML=body;const root=$('usSettingsOverlay');root.classList.add('open');root.setAttribute('aria-hidden','false');document.body.classList.add('us-settings-modal-open');}
function closeModal(){const root=$('usSettingsOverlay');root?.classList.remove('open');root?.setAttribute('aria-hidden','true');document.body.classList.remove('us-settings-modal-open');}
window.closeUsSettingsModal=closeModal;
function currentBuild(){return document.querySelector('meta[name="us-build"]')?.content||'';}
async function locationState(){try{if(!navigator.geolocation)return 'unsupported';if(!navigator.permissions?.query)return 'unknown';const p=await navigator.permissions.query({name:'geolocation'});return p.state||'unknown';}catch(_){return 'unknown';}}
async function pushState(){if(!('Notification' in window))return {permission:'unsupported',active:false};const permission=Notification.permission;let active=false;if(permission==='granted'){try{active=Boolean(await getCurrentPushSubscription());}catch(_){}}return {permission,active};}
async function hydrateUsSettings(){
  if(!window.usProfile)return;const profile=$('usSettingsProfile');if(profile)profile.textContent=(window.usProfile.display_name||'?').trim().slice(0,1).toUpperCase();const build=$('usSettingsBuild');if(build)build.textContent=`US. · ${currentBuild()}`;const unit=localStorage.getItem('us:settings:distance-unit')||'km';$('usDistanceUnitValue').textContent=unit==='mi'?'miglia':'chilometri';
  const [loc,push,archive]=await Promise.all([locationState(),pushState(),sb.from('stories').select('id',{count:'exact',head:true}).eq('couple_id',window.usProfile.couple_id).lt('expires_at',new Date().toISOString())]);
  const locEl=$('usLocationState');if(locEl){locEl.className='us-setting-state';if(loc==='granted'){locEl.textContent='✓';locEl.classList.add('ok');}else if(loc==='denied'){locEl.textContent='×';locEl.classList.add('bad');}else{locEl.textContent='○';}}
  const pushEl=$('usNotificationsValue');if(pushEl)pushEl.textContent=push.active?'Attive':push.permission==='denied'?'Bloccate':'Non attive';const archiveEl=$('usStoryArchiveValue');if(archiveEl)archiveEl.textContent=archive.error?'':Number(archive.count||0)?String(archive.count):'';
}
window.hydrateUsSettings=hydrateUsSettings;
async function showStoryArchive(){
  openModal('Archivio storie','<div class="us-settings-loading">Carico le vostre storie…</div>','RICORDI');if(!window.usProfile)return;
  try{const [{data:stories,error},{data:profiles}]=await Promise.all([sb.from('stories').select('id,author_id,media_path,caption,created_at,expires_at').eq('couple_id',window.usProfile.couple_id).lt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(60),sb.from('profiles').select('id,display_name').eq('couple_id',window.usProfile.couple_id)]);if(error)throw error;if(!stories?.length){$('usSettingsModalBody').innerHTML='<div class="us-settings-empty"><b>Archivio ancora vuoto</b><p>Le Stories scadute compariranno qui.</p></div>';return;}const names=new Map((profiles||[]).map(p=>[p.id,p.display_name||'Noi']));const paths=stories.map(s=>s.media_path);const urls=await window.usGetSignedUrls?.(paths,21600)||new Map();$('usSettingsModalBody').innerHTML=`<div class="us-story-archive">${stories.map(s=>{const url=urls.get(s.media_path);if(!url)return '';const date=new Date(s.created_at).toLocaleDateString('it-IT',{day:'numeric',month:'short'});return `<article><img src="${esc(url)}" alt="Story archiviata" loading="lazy"><span><b>${esc(names.get(s.author_id)||'Noi')}</b><small>${esc(date)}</small></span>${s.caption?`<p>${esc(s.caption)}</p>`:''}</article>`;}).join('')}</div>`;}catch(error){console.warn('[US Settings] archive',error);$('usSettingsModalBody').innerHTML='<div class="us-settings-empty"><b>Archivio non disponibile</b><p>Riprova tra poco.</p></div>';}
}
function distanceModal(){const unit=localStorage.getItem('us:settings:distance-unit')||'km';openModal('Unità di distanza',`<div class="us-setting-choice"><button data-distance="km" class="${unit==='km'?'active':''}"><span>Chilometri</span><b>km</b></button><button data-distance="mi" class="${unit==='mi'?'active':''}"><span>Miglia</span><b>mi</b></button></div>`,'DISTANZA');$('usSettingsModalBody').querySelectorAll('[data-distance]').forEach(btn=>btn.addEventListener('click',()=>{localStorage.setItem('us:settings:distance-unit',btn.dataset.distance);window.hydrateDistance?.();hydrateUsSettings();closeModal();toast('Unità aggiornata');}));}
async function locationAction(){const state=await locationState();if(state==='denied'){openModal('Localizzazione','<div class="us-settings-copy"><p>La posizione è bloccata per US. Riattivala dalle informazioni del sito/app del telefono e poi torna qui.</p><p>US usa la posizione solo per calcolare la distanza tra voi due.</p></div>','PERMESSO');return;}await window.refreshMyLocation?.();setTimeout(hydrateUsSettings,500);}
async function notificationsModal(){const state=await pushState();const label=state.active?'Disattiva notifiche':'Attiva notifiche';openModal('Notifiche',`<div class="us-settings-copy"><p>${state.active?'Le notifiche Web Push sono attive su questo telefono.':'Attiva le notifiche per Today, Ti penso, Bond e il mesiversario.'}</p>${state.permission==='denied'?'<p class="warn">Il browser le ha bloccate. Devi riabilitarle dalle impostazioni del sito/app.</p>':''}</div><button type="button" class="primary us-settings-main-action" id="usSettingsPushAction" ${state.permission==='denied'?'disabled':''}>${label}</button>`,'NOTIFICHE');$('usSettingsPushAction')?.addEventListener('click',async()=>{const btn=$('usSettingsPushAction');btn.disabled=true;if(state.active)await window.disableWebPush?.();else await window.enableWebPush?.();await hydrateUsSettings();closeModal();});}
function widgetsModal(){openModal('Widget','<div class="us-settings-copy"><p><b>iPhone</b> · Scriptable</p><p><b>Android</b> · KWGT</p><p>Il bridge di US è già pronto. Abbiamo lasciato la configurazione dei widget in pausa e possiamo riprenderla quando vuoi.</p></div>','HOME SCREEN');}
function languageModal(){openModal('Lingua','<div class="us-setting-choice"><button class="active"><span>Italiano</span><b>✓</b></button></div><div class="us-settings-footnote">Per US 1.0 teniamo una sola lingua, così i testi restano coerenti.</div>','LINGUA');}
function aboutModal(){openModal('Chi siamo','<div class="us-settings-copy"><p><b>US.</b> è uno spazio privato condiviso da due persone: ricordi, domande, giochi, distanza, eventi e piccoli segnali.</p><p>Niente feed pubblico e niente profili da scoprire. Solo voi.</p></div>','US.');}
async function shareApp(){try{if(navigator.share)await navigator.share({title:'US.',text:'Il nostro spazio su US.',url:location.origin});else{await navigator.clipboard.writeText(location.origin);toast('Link copiato');}}catch(error){if(error?.name!=='AbortError')console.warn(error);}}
function privacyModal(){openModal('Consensi e privacy','<div class="us-settings-copy"><p><b>Posizione</b> · usata quando scegli di aggiornare la distanza.</p><p><b>Foto e fotocamera</b> · usate solo quando aggiungi Moments, Stories o foto profilo.</p><p><b>Notifiche</b> · opzionali e disattivabili da questo telefono.</p><p>I contenuti di US sono pensati per restare nello spazio privato della coppia.</p></div>','PRIVACY');}
function helpModal(){openModal('Aiuto','<div class="us-settings-copy"><p><b>Today</b> · una domanda al giorno, reveal dopo entrambe le risposte.</p><p><b>Moments</b> · album condivisi a cui potete aggiungere foto entrambi.</p><p><b>Quiz</b> · quiz e giochi settimanali che danno XP Bond.</p><p><b>♡</b> · il cuore flottante manda “Ti penso” da qualsiasi pagina.</p><p><b>Calendario</b> · eventi importanti, countdown e XP quando li segnate come fatti.</p></div>','AIUTO');}
async function logout(){if(!confirm('Scollegare questo telefono da US? Dovrai inserire di nuovo il codice privato per rientrare.'))return;try{localStorage.removeItem('us:fix4:last-profile');await sb.auth.signOut();location.reload();}catch(error){console.warn(error);toast('Non riesco a uscire');}}
async function action(name){if(name==='widgets')return widgetsModal();if(name==='story-archive')return showStoryArchive();if(name==='distance')return distanceModal();if(name==='location')return locationAction();if(name==='notifications')return notificationsModal();if(name==='language')return languageModal();if(name==='about')return aboutModal();if(name==='share')return shareApp();if(name==='privacy')return privacyModal();if(name==='help')return helpModal();if(name==='logout')return logout();}


/* US · Draggable Ti penso */
const US_THINK_POSITION_KEY='us:think-position:v1';
let usThinkDragCleanup=null;

function setupDraggableThink(){
  const heart=$('thinkButton');
  if(!heart||heart.dataset.draggableThink==='1')return;
  heart.dataset.draggableThink='1';

  let pointerId=null;
  let startX=0,startY=0,startLeft=0,startTop=0;
  let dragging=false;
  let suppressClickUntil=0;
  const threshold=7;

  function viewport(){
    const vv=window.visualViewport;
    return {
      width:vv?.width||window.innerWidth,
      height:vv?.height||window.innerHeight,
      offsetLeft:vv?.offsetLeft||0,
      offsetTop:vv?.offsetTop||0
    };
  }

  function bounds(){
    const vp=viewport();
    const rect=heart.getBoundingClientRect();
    const nav=document.querySelector('.nav');
    const navRect=nav?.getBoundingClientRect();
    const margin=12;
    const minX=vp.offsetLeft+margin;
    const maxX=Math.max(minX,vp.offsetLeft+vp.width-rect.width-margin);
    const minY=vp.offsetTop+Math.max(12,Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--us-safe-top'))||0)+8;
    const navTop=navRect?.top && navRect.top < vp.offsetTop+vp.height ? navRect.top : vp.offsetTop+vp.height;
    const maxY=Math.max(minY,navTop-rect.height-14);
    return {minX,maxX,minY,maxY,width:vp.width,height:vp.height};
  }

  function clamp(value,min,max){return Math.min(max,Math.max(min,value));}

  function apply(left,top,animate=false){
    const b=bounds();
    const x=clamp(left,b.minX,b.maxX);
    const y=clamp(top,b.minY,b.maxY);
    heart.classList.toggle('snap-moving',animate);
    heart.style.left=`${x}px`;
    heart.style.top=`${y}px`;
    heart.style.right='auto';
    heart.style.bottom='auto';
    if(animate)setTimeout(()=>heart.classList.remove('snap-moving'),220);
    return {x,y,b};
  }

  function savePosition(x,y,b){
    try{
      const center=x+heart.offsetWidth/2;
      const edge=center < b.width/2 ? 'left' : 'right';
      const yRange=Math.max(1,b.maxY-b.minY);
      localStorage.setItem(US_THINK_POSITION_KEY,JSON.stringify({
        edge,
        yRatio:clamp((y-b.minY)/yRange,0,1)
      }));
    }catch(_){}
  }

  function restorePosition(){
    let stored=null;
    try{stored=JSON.parse(localStorage.getItem(US_THINK_POSITION_KEY)||'null');}catch(_){}
    if(!stored)return;
    const b=bounds();
    const x=stored.edge==='right'?b.maxX:b.minX;
    const y=b.minY+clamp(Number(stored.yRatio)||0,0,1)*(b.maxY-b.minY);
    apply(x,y,false);
  }

  function snapAndSave(){
    const rect=heart.getBoundingClientRect();
    const b=bounds();
    const center=rect.left+rect.width/2;
    const x=center < b.width/2 ? b.minX : b.maxX;
    const pos=apply(x,rect.top,true);
    savePosition(pos.x,pos.y,pos.b);
  }

  function onPointerDown(event){
    if(event.button!==undefined&&event.button!==0)return;
    const rect=heart.getBoundingClientRect();
    pointerId=event.pointerId;
    startX=event.clientX;
    startY=event.clientY;
    startLeft=rect.left;
    startTop=rect.top;
    dragging=false;
    heart.setPointerCapture?.(pointerId);
  }

  function onPointerMove(event){
    if(pointerId===null||event.pointerId!==pointerId)return;
    const dx=event.clientX-startX;
    const dy=event.clientY-startY;

    if(!dragging&&Math.hypot(dx,dy)>=threshold){
      dragging=true;
      heart.classList.add('dragging');
    }
    if(!dragging)return;

    event.preventDefault();
    apply(startLeft+dx,startTop+dy,false);
  }

  function finishDrag(event){
    if(pointerId===null||event.pointerId!==pointerId)return;
    try{heart.releasePointerCapture?.(pointerId);}catch(_){}
    pointerId=null;

    if(dragging){
      suppressClickUntil=Date.now()+450;
      dragging=false;
      heart.classList.remove('dragging');
      snapAndSave();
    }
  }

  function blockAccidentalClick(event){
    if(Date.now()<suppressClickUntil){
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  heart.addEventListener('pointerdown',onPointerDown);
  heart.addEventListener('pointermove',onPointerMove,{passive:false});
  heart.addEventListener('pointerup',finishDrag);
  heart.addEventListener('pointercancel',finishDrag);
  heart.addEventListener('click',blockAccidentalClick,true);

  let resizeTimer=null;
  const onResize=()=>{
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(()=>{
      const rect=heart.getBoundingClientRect();
      if(heart.style.top) {
        const b=bounds();
        const pos=apply(rect.left,rect.top,false);
        savePosition(pos.x,pos.y,b);
      } else {
        restorePosition();
      }
    },100);
  };
  window.addEventListener('resize',onResize);
  window.visualViewport?.addEventListener('resize',onResize);

  requestAnimationFrame(()=>requestAnimationFrame(restorePosition));

  usThinkDragCleanup=()=>{
    heart.removeEventListener('pointerdown',onPointerDown);
    heart.removeEventListener('pointermove',onPointerMove);
    heart.removeEventListener('pointerup',finishDrag);
    heart.removeEventListener('pointercancel',finishDrag);
    heart.removeEventListener('click',blockAccidentalClick,true);
    window.removeEventListener('resize',onResize);
    window.visualViewport?.removeEventListener('resize',onResize);
  };
}

function boot(){setupDraggableThink();document.querySelectorAll('[data-us-setting]').forEach(row=>row.addEventListener('click',()=>action(row.dataset.usSetting)));document.querySelectorAll('[data-us-settings-close]').forEach(el=>el.addEventListener('click',closeModal));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('usSettingsOverlay')?.classList.contains('open'))closeModal();});const wait=setInterval(()=>{const heart=$('thinkButton');if(heart)heart.hidden=!window.usProfile;if(window.usProfile){clearInterval(wait);hydrateUsSettings();}},250);setTimeout(()=>clearInterval(wait),30000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.getElementById('settings')?.classList.contains('active'))hydrateUsSettings();});
console.info('[US Settings] pagina impostazioni attiva');
})();