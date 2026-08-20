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
const US_THINK_POSITION_KEY='us:think-position:v2';
let usThinkDragCleanup=null;

function setupDraggableThink(){
  const heart=$('thinkButton');
  if(!heart||heart.dataset.draggableThink==='2')return;
  heart.dataset.draggableThink='2';

  let pointerId=null;
  let startX=0,startY=0,startLeft=0,startTop=0;
  let dragging=false;
  let suppressClickUntil=0;
  let samples=[];
  let physicsFrame=0;
  let posX=0,posY=0;
  let velocityX=0,velocityY=0;
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
    const minY=vp.offsetTop+12;
    const navTop=navRect?.top&&navRect.top<vp.offsetTop+vp.height?navRect.top:vp.offsetTop+vp.height;
    const maxY=Math.max(minY,navTop-rect.height-14);
    return {minX,maxX,minY,maxY,width:vp.width,height:vp.height};
  }

  function clamp(value,min,max){return Math.min(max,Math.max(min,value));}

  function setPosition(x,y){
    const b=bounds();
    posX=clamp(x,b.minX,b.maxX);
    posY=clamp(y,b.minY,b.maxY);
    heart.style.left=`${posX}px`;
    heart.style.top=`${posY}px`;
    heart.style.right='auto';
    heart.style.bottom='auto';
    return b;
  }

  function savePosition(){
    const b=bounds();
    const center=posX+heart.offsetWidth/2;
    const edge=center<b.width/2?'left':'right';
    const yRange=Math.max(1,b.maxY-b.minY);
    try{
      localStorage.setItem(US_THINK_POSITION_KEY,JSON.stringify({
        edge,
        yRatio:clamp((posY-b.minY)/yRange,0,1)
      }));
    }catch(_){}
  }

  function restorePosition(){
    let stored=null;
    try{stored=JSON.parse(localStorage.getItem(US_THINK_POSITION_KEY)||'null');}catch(_){}
    if(!stored){
      const rect=heart.getBoundingClientRect();
      posX=rect.left;posY=rect.top;
      return;
    }
    const b=bounds();
    const x=stored.edge==='right'?b.maxX:b.minX;
    const y=b.minY+clamp(Number(stored.yRatio)||0,0,1)*(b.maxY-b.minY);
    setPosition(x,y);
  }

  function stopPhysics(){
    if(physicsFrame)cancelAnimationFrame(physicsFrame);
    physicsFrame=0;
    heart.classList.remove('inertia');
  }

  function snapToNearestEdge(){
    const b=bounds();
    const targetX=(posX+heart.offsetWidth/2)<b.width/2?b.minX:b.maxX;
    const start=posX;
    const delta=targetX-start;
    const began=performance.now();
    const duration=210;

    heart.classList.add('snap-moving');
    function frame(now){
      const t=Math.min(1,(now-began)/duration);
      const eased=1-Math.pow(1-t,3);
      setPosition(start+delta*eased,posY);
      if(t<1){
        physicsFrame=requestAnimationFrame(frame);
      }else{
        physicsFrame=0;
        heart.classList.remove('snap-moving');
        savePosition();
      }
    }
    physicsFrame=requestAnimationFrame(frame);
  }

  function launch(vx,vy){
    stopPhysics();
    velocityX=vx;
    velocityY=vy;

    // px/ms -> px/frame-ish scale. Cap violent throws.
    velocityX=clamp(velocityX,-1.8,1.8);
    velocityY=clamp(velocityY,-1.8,1.8);

    let last=performance.now();
    heart.classList.add('inertia');

    function tick(now){
      const dt=Math.min(32,Math.max(8,now-last));
      last=now;
      const b=bounds();

      posX+=velocityX*dt;
      posY+=velocityY*dt;

      // Soft bounce against safe bounds; loses energy like a weighted object.
      if(posX<b.minX){
        posX=b.minX;
        velocityX=Math.abs(velocityX)*0.46;
      }else if(posX>b.maxX){
        posX=b.maxX;
        velocityX=-Math.abs(velocityX)*0.46;
      }

      if(posY<b.minY){
        posY=b.minY;
        velocityY=Math.abs(velocityY)*0.42;
      }else if(posY>b.maxY){
        posY=b.maxY;
        velocityY=-Math.abs(velocityY)*0.42;
      }

      setPosition(posX,posY);

      // Time-based friction: approximately stable across 60/90/120 Hz.
      const friction=Math.pow(0.918,dt/16.67);
      velocityX*=friction;
      velocityY*=friction;

      const speed=Math.hypot(velocityX,velocityY);
      if(speed>0.055){
        physicsFrame=requestAnimationFrame(tick);
      }else{
        physicsFrame=0;
        heart.classList.remove('inertia');
        snapToNearestEdge();
      }
    }

    physicsFrame=requestAnimationFrame(tick);
  }

  function addSample(x,y,time){
    samples.push({x,y,time});
    while(samples.length>6||samples[0]?.time<time-110)samples.shift();
  }

  function releaseVelocity(){
    if(samples.length<2)return {vx:0,vy:0};
    const first=samples[0],last=samples[samples.length-1];
    const dt=Math.max(1,last.time-first.time);
    return {
      vx:(last.x-first.x)/dt,
      vy:(last.y-first.y)/dt
    };
  }

  function onPointerDown(event){
    if(event.button!==undefined&&event.button!==0)return;
    stopPhysics();
    const rect=heart.getBoundingClientRect();
    pointerId=event.pointerId;
    startX=event.clientX;
    startY=event.clientY;
    startLeft=rect.left;
    startTop=rect.top;
    posX=rect.left;
    posY=rect.top;
    dragging=false;
    samples=[{x:event.clientX,y:event.clientY,time:performance.now()}];
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
    setPosition(startLeft+dx,startTop+dy);
    addSample(event.clientX,event.clientY,performance.now());
  }

  function finishDrag(event){
    if(pointerId===null||event.pointerId!==pointerId)return;
    try{heart.releasePointerCapture?.(pointerId);}catch(_){}
    pointerId=null;

    if(dragging){
      addSample(event.clientX,event.clientY,performance.now());
      suppressClickUntil=Date.now()+500;
      dragging=false;
      heart.classList.remove('dragging');

      const {vx,vy}=releaseVelocity();
      const speed=Math.hypot(vx,vy);

      if(speed>0.22)launch(vx,vy);
      else snapToNearestEdge();
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
      stopPhysics();
      const rect=heart.getBoundingClientRect();
      setPosition(rect.left,rect.top);
      snapToNearestEdge();
    },100);
  };

  window.addEventListener('resize',onResize);
  window.visualViewport?.addEventListener('resize',onResize);

  requestAnimationFrame(()=>requestAnimationFrame(restorePosition));

  usThinkDragCleanup=()=>{
    stopPhysics();
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