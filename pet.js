(function(global,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  global.USPet=api;api.install(global);
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
// The companion (Maudit, or the goat, the owl, the dragon of Compagni V1)
// sits in one home spot, just above the right end of the bottom bar, on every
// tab. It never walks, is never picked up or dragged; only the dragon flies a
// short loop and always lands back on the same spot. It only changes state:
//   idle    → sits, blinks, the tail sways;
//   sleep   → after 30 s without a touch anywhere: eyes shut, slow breath, z z;
//   curious → a touch anywhere (or on it) while it sleeps: head tilts, 1.2 s;
//   pet     → a tap on it: happy eyes, ears back, a purr, 1.6 s;
//   happy   → every third tap, and when something arrives for me (Ti penso,
//             Lasciato per te, a reward, the answers of the day): one small
//             hop and a heart, 1.7 s.
// It owns no data and only reacts to facts other authorities announce; which
// companion shows is a device-local choice (companions.js checks the unlocks).
// ?us-pet=preview keeps the explicit QA renderer (the earlier kitten v0);
// ?us-pet=off is a one-load emergency kill switch.
const PET_ASSET_STATUS='APPROVED';
const PREVIEW_KEY='us:pet:v1:preview';
const STATES=Object.freeze(['idle','sleep','curious','pet','happy']);
const REASONS=Object.freeze(['think','left-for-you','reward','streak','daily-question']);
// Copied from the mockup (core.js): maudit(state, ms) timings and armSleep.
const TIMING=Object.freeze({
  sleep:30000,   // armSleep: no touch for 30 s
  curious:1200,
  pet:1600,
  happy:1600,    // the third tap
  react:1700,    // UP.maudit('happy') default
  glance:1400,   // pupils follow a tab tap
  hop:620,
  heart:1100,
  flight:6200,   // the dragon's loop over the bar
  flightEvery:Object.freeze([25000,45000]), // and how often it takes off alone
  width:54,      // .maudit-home box
  height:48
});

// The machine owns its two timers (state → idle, idle → sleep) and renders
// through a callback. Pure: no DOM, unit-tested.
function createPet({schedule=setTimeout,cancel=clearTimeout,render=()=>{}}={}){
  let state='idle',reason='',running=false,stateTimer=null,sleepTimer=null,pets=0,beat=0;
  const emit=()=>render({state,reason,beat});
  function clearState(){if(stateTimer!==null)cancel(stateTimer);stateTimer=null;}
  function armSleep(){
    if(sleepTimer!==null)cancel(sleepTimer);sleepTimer=null;
    if(!running)return;
    sleepTimer=schedule(()=>{sleepTimer=null;if(!running)return;state='sleep';reason='';emit();},TIMING.sleep);
  }
  // mockup maudit(state, ms): set the state, back to idle after ms, re-arm the sleep.
  function set(next,ms,why=''){
    state=next;reason=why;
    if(next==='happy')beat+=1;
    emit();
    clearState();
    if(next!=='sleep'&&ms>0)stateTimer=schedule(()=>{stateTimer=null;if(!running)return;state='idle';reason='';emit();},ms);
    armSleep();
  }
  return {
    start(){if(running)return false;running=true;state='idle';reason='';emit();armSleep();return true;},
    stop(){
      if(!running)return false;
      running=false;clearState();
      if(sleepTimer!==null)cancel(sleepTimer);sleepTimer=null;
      state='idle';reason='';emit();return true;
    },
    // Something arrived for me: the happy hop with its heart.
    react(next){
      if(!running||!REASONS.includes(next))return false;
      set('happy',TIMING.react,next);
      return true;
    },
    // A tap on Maudit (mockup #mauditHome click).
    caress(){
      if(!running)return false;
      pets+=1;
      if(state==='sleep'){set('curious',TIMING.curious);return true;}
      set(pets%3===0?'happy':'pet',pets%3===0?TIMING.happy:TIMING.pet);
      return true;
    },
    // A touch anywhere else on the screen: wakes a sleeping Maudit, otherwise
    // only postpones the sleep.
    touch(){
      if(!running)return false;
      if(state==='sleep'){set('curious',TIMING.curious);return true;}
      armSleep();return false;
    },
    snapshot:()=>({state,reason,running,pets,beat,timers:(stateTimer!==null?1:0)+(sleepTimer!==null?1:0)})
  };
}

// ---------- renderers: the only part that changes when the approved asset lands ----------
const renderers=new Map();
function registerRenderer(renderer){
  if(!renderer||typeof renderer.id!=='string'||typeof renderer.mount!=='function')throw new TypeError('invalid_pet_renderer');
  renderers.set(renderer.id,renderer);
  return renderer.id;
}
// OWNER-APPROVED V0 — white/gray kitten with blue eyes. Production until the
// 1.0 design; now only the explicit placeholder renderer for QA.
// Source authority: assets/source/pet/us-pet-kitten-base-v0.svg.
const KITTEN_V0_SVG='<svg class="us-pet-kitten" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" focusable="false"><defs><linearGradient id="usPetKWhite" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf8f4"/><stop offset="1" stop-color="#e2dbd3"/></linearGradient><linearGradient id="usPetKGray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a7acb5"/><stop offset="1" stop-color="#7c818b"/></linearGradient><radialGradient id="usPetKIris" cx="45%" cy="38%" r="70%"><stop offset="0" stop-color="#b4dcff"/><stop offset=".55" stop-color="#5e9ce0"/><stop offset="1" stop-color="#3a6cab"/></radialGradient></defs><g class="k-tail"><path d="M9.2 29.2C4.6 28.4 2.6 23.6 4.2 18.6" fill="none" stroke="url(#usPetKGray)" stroke-width="3.2" stroke-linecap="round"/></g><g class="k-leg k-leg-hind-far"><rect x="10.4" y="31" width="3" height="7.2" rx="1.5" fill="#757a84"/></g><g class="k-leg k-leg-front-far"><rect x="21.4" y="31" width="3" height="7.2" rx="1.5" fill="#d6cfc7"/></g><g class="k-body"><ellipse cx="17" cy="29.6" rx="10" ry="6.2" fill="url(#usPetKWhite)"/><path d="M7.3 28.6C7.8 24 12.4 23.1 17 23.3C20.6 23.5 23.1 24.6 24.6 26.5C21 27.7 16 28.3 11.5 30.3C9.5 31.1 7.9 30.7 7.3 28.6Z" fill="url(#usPetKGray)"/></g><g class="k-leg k-leg-hind-near"><rect x="13.2" y="31.4" width="3.2" height="7.2" rx="1.6" fill="url(#usPetKGray)"/><ellipse cx="14.8" cy="38.1" rx="1.9" ry="1" fill="#f4efe9"/></g><g class="k-leg k-leg-front-near"><rect x="24.2" y="31.4" width="3.2" height="7.2" rx="1.6" fill="url(#usPetKWhite)"/><ellipse cx="25.8" cy="38.1" rx="1.9" ry="1" fill="#fbf8f4"/></g><g class="k-head"><g class="k-ear k-ear-far"><path d="M22.2 15.2L23.4 6.6L28.2 12Z" fill="#878c95"/><path d="M23.3 13.5L24 8.8L26.7 12Z" fill="#dea0aa"/></g><g class="k-ear k-ear-near"><path d="M29.6 11.6L34.8 5.8L35.8 14.6Z" fill="url(#usPetKGray)"/><path d="M31 11.7L34.2 8.3L34.8 13.1Z" fill="#e8a7b0"/></g><circle cx="29.2" cy="19.6" r="8.3" fill="url(#usPetKGray)"/><path class="k-face" d="M30 12.6C30.5 15.1 31.2 17.6 32.2 20.3C33.6 21.1 35.6 21.4 36.4 23.1C37 25.5 34.6 27.9 30.8 28.1C27 28.3 24 26.9 23.6 24.7C23.4 23.1 25.6 21.3 27.8 20.5C28.8 17.6 29.5 15.1 30 12.6Z" fill="url(#usPetKWhite)"/><ellipse class="k-blush" cx="34.7" cy="24.4" rx="1.3" ry=".8" fill="#f1b6bf" opacity=".45"/><g class="k-eyes-open"><g class="k-eye k-eye-far"><ellipse cx="26.2" cy="19.5" rx="1.35" ry="1.7" fill="url(#usPetKIris)"/><ellipse cx="26.35" cy="19.6" rx=".45" ry="1.15" fill="#1c2230"/><circle cx="25.85" cy="18.9" r=".4" fill="#fff"/></g><g class="k-eye k-eye-near"><ellipse cx="34" cy="19.4" rx="1.6" ry="1.95" fill="url(#usPetKIris)"/><ellipse cx="34.2" cy="19.5" rx=".52" ry="1.3" fill="#1c2230"/><circle cx="33.6" cy="18.7" r=".45" fill="#fff"/></g></g><g class="k-eyes-closed" fill="none" stroke="#4a505a" stroke-width=".7" stroke-linecap="round"><path d="M24.9 19.9q1.3.9 2.6 0"/><path d="M32.5 19.8q1.5 1 3 0"/></g><path class="k-nose" d="M30.4 22.6h1.9l-.95 1.15Z" fill="#e39aa6" stroke="#e39aa6" stroke-width=".3" stroke-linejoin="round"/><path class="k-mouth" d="M31.35 23.8v.6M31.35 24.4c-.35.55-1.1.55-1.4.1M31.35 24.4c.35.55 1.1.55 1.4.1" fill="none" stroke="#9c8a8d" stroke-width=".42" stroke-linecap="round"/><g class="k-collar"><path d="M23.8 25.6C26.6 28.5 32.4 28.9 35.5 26.4" fill="none" stroke="var(--us-color-accent-strong,#ef9bc1)" stroke-width="1.4" stroke-linecap="round"/><circle cx="29.6" cy="28.5" r="1" fill="#f3d28b"/></g></g></svg>';
function mountKittenV0(host){
  host.innerHTML='<span class="us-pet-shadow"></span><span class="us-pet-figure" data-pet-placeholder data-pet-preview="kitten-v0">'+KITTEN_V0_SVG+'</span>';
  return {destroy(){host.innerHTML='';}};
}
// OWNER-PROVIDED ART (2026-10-22) — Maudit 2.0 and the three companions,
// cut from the owner's sheets into a shared 192 px frame per companion: the
// awake body, the parts that move (tail, ears, wings), the asleep and happy
// poses. Source authority: assets/source/pet/us-pet-*-sheet-*.webp; the cut
// pieces are the derived assets in assets/derived/pet/. Poses in pet.css.
// Frame geometry (px of the 192 px frame): parts pivot where they join the
// body; eyes are covered by a lid in the fur colour for the blink. Maudit
// blinks with its own asleep pose, the same body with the eyes closed.
const PET_ART='/assets/derived/pet/';
const COMPANIONS=Object.freeze({
  maudit:{v:'v2',size:[200,192],parts:{tail:[162.7,166.9]},behind:true,blink:'pose',eyes:[]},
  goat:{v:'v1',size:[211,192],parts:{'ear-l':[48.7,88.7],'ear-r':[162.3,88.7]},behind:false,eyes:[[64.6,70.7,88.9,99.1,'#fdeeda'],[125.6,68.6,150.6,97,'#fcf1e0']]},
  owl:{v:'v1',size:[228,192],parts:{'wing-l':[49.5,83.5],'wing-r':[183.1,83.5]},behind:true,eyes:[[60.9,49.3,99.6,91.8,'#fce1c1'],[125.4,48.6,164.8,91.8,'#fceace']]},
  dragon:{v:'v1',size:[222,192],parts:{'wing-l':[62.5,122.8],'wing-r':[153.4,132.3]},behind:true,flies:true,eyes:[[68.6,67.8,91.7,97.7,'#73dbc3'],[133,70.6,156.1,100.4,'#76dcc5']]}
});
const COMPANION_IDS=Object.freeze(Object.keys(COMPANIONS));
// Before the couple has unlocked any companion, nothing sits above the bar.
const NO_COMPANION='none';
const art=(id,name)=>PET_ART+'us-pet-'+id+'-'+name+'-'+COMPANIONS[id].v+'.webp';
function companionMarkup(id){
  const c=COMPANIONS[id],[W,H]=c.size;
  const img=(cls,name,style='')=>'<img class="'+cls+'" src="'+art(id,name)+'" alt="" draggable="false" decoding="async"'+style+'>';
  const parts=Object.entries(c.parts).map(([name,[x,y]])=>img('us-pet-part us-pet-'+name,name,' style="transform-origin:'+(x/W*100).toFixed(2)+'% '+(y/H*100).toFixed(2)+'%"')).join('');
  const body=img('us-pet-body','body');
  const lids=c.eyes.map(([x0,y0,x1,y1,fur])=>{
    const cx=(x0+x1)/2,cy=(y0+y1)/2,rx=(x1-x0)/2+1.8,ry=(y1-y0)/2+1.8,r=n=>n.toFixed(1);
    return '<ellipse cx="'+r(cx)+'" cy="'+r(cy)+'" rx="'+r(rx)+'" ry="'+r(ry)+'" fill="'+fur+'"/><path d="M'+r(cx-rx*.8)+' '+r(cy+ry*.1)+'Q'+r(cx)+' '+r(cy+ry*.65)+' '+r(cx+rx*.8)+' '+r(cy+ry*.1)+'" fill="none" stroke="#1A1020" stroke-width="'+r(Math.max(2.6,rx*.24))+'" stroke-linecap="round"/>';
  }).join('');
  const blink=c.blink==='pose'?img('us-pet-blink','sleep'):'<svg class="us-pet-lids" viewBox="0 0 '+W+' '+H+'" aria-hidden="true" focusable="false">'+lids+'</svg>';
  // Premi Sintonia V2: the accessory rides on each pose (pet.css places it).
  const acc=pose=>'<span class="us-pet-acc-pose us-pet-acc-'+pose+'" aria-hidden="true"><i class="us-pet-acc"></i></span>';
  return '<span class="us-pet-rig us-pet-'+id+'" style="aspect-ratio:'+W+'/'+H+'">'
    +'<span class="us-pet-awake">'+(c.behind?parts+body:body+parts)+blink+acc('awake')+'</span>'
    +img('us-pet-pose us-pet-pose-sleep','sleep')+acc('sleep')+img('us-pet-pose us-pet-pose-happy','happy')+acc('happy')
    +'<span class="us-pet-zz"><i>z</i><i>z</i></span><span class="us-pet-heart"></span></span>';
}
// The dragon's flight: a short loop over the bar, back to its spot.
const FLIGHT=Object.freeze([
  {translate:'0 0',rotate:'0deg'},{translate:'-10px -34px',rotate:'-6deg',offset:.06},{translate:'-60px -72px',rotate:'-8deg',offset:.18},
  {translate:'-120px -86px',rotate:'-2deg',offset:.34},{translate:'-160px -54px',rotate:'5deg',offset:.5},{translate:'-120px -22px',rotate:'9deg',offset:.66},
  {translate:'-40px -42px',rotate:'5deg',offset:.84},{translate:'0 -10px',rotate:'0deg',offset:.96},{translate:'0 0',rotate:'0deg'}
]);
function mountCompanion(host,id){
  host.innerHTML='<span class="us-pet-figure" data-pet-production="'+id+'">'+companionMarkup(id)+'</span>';
  const figure=host.querySelector?.('.us-pet-figure'),w=host.ownerDocument?.defaultView;
  let state='idle',timer=null,flight=null;
  const reduced=()=>{try{return Boolean(w?.UsUiFoundation?.isReducedMotion?.()||w?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);}catch(_){return false;}};
  const clear=()=>{if(timer!==null)w?.clearTimeout(timer);timer=null;};
  function land(){flight=null;if(figure?.dataset)delete figure.dataset.petFlying;arm();}
  function fly(){
    if(!COMPANIONS[id].flies||flight||reduced()||!figure?.animate||!figure.dataset)return false;
    clear();figure.dataset.petFlying='';
    flight=figure.animate(FLIGHT,{duration:TIMING.flight,easing:'ease-in-out'});
    flight.onfinish=land;flight.oncancel=land;
    return true;
  }
  // Now and then, awake, the dragon takes off on its own.
  function arm(){
    clear();
    if(!COMPANIONS[id].flies||state!=='idle'||!w)return;
    const [min,max]=TIMING.flightEvery;
    timer=w.setTimeout(()=>{timer=null;if(state==='idle')fly();},min+Math.random()*(max-min));
  }
  return {
    fly,
    setState(next){
      state=next;
      if(next==='sleep'&&flight)flight.cancel();
      if(next==='idle')arm();else clear();
    },
    destroy(){clear();if(flight)flight.cancel();host.innerHTML='';}
  };
}
registerRenderer({
  id:'placeholder',
  mount(host){return mountKittenV0(host);}
});
// 'sprite' is the production renderer: Maudit. Each companion has its own.
registerRenderer({
  id:'sprite',
  mount(host){return mountCompanion(host,'maudit');}
});
for(const id of COMPANION_IDS.filter(name=>name!=='maudit'))registerRenderer({id,mount(host){return mountCompanion(host,id);}});
const rendererOf=id=>id==='maudit'?'sprite':id;

function previewRequested(w){
  try{
    const flag=new URL(w.location.href).searchParams.get('us-pet');
    if(flag==='preview')w.localStorage?.setItem(PREVIEW_KEY,'1');
    if(flag==='off')w.localStorage?.removeItem(PREVIEW_KEY);
    return flag==='preview'||(flag!=='off'&&w.localStorage?.getItem(PREVIEW_KEY)==='1');
  }catch(_){return false;}
}

function disabledRequested(w){
  try{return new URL(w.location.href).searchParams.get('us-pet')==='off';}
  catch(_){return false;}
}

// Renderer selection fails closed: the placeholder exists only for explicit
// preview mode, and an unknown id never replaces a valid renderer.
function canMount(id,{preview=false}={}){
  return renderers.has(id)&&(id!=='placeholder'||preview===true);
}

// The one runtime decision on whether Maudit may live right now. As in the
// mockup it stays on every tab and under every popup (a sheet's scrim simply
// covers it, it keeps reacting underneath). Only what owns the whole screen
// or the keyboard stops it and sends it away: background, the keyboard, an
// inert shell, Focus Photo (the photo alone), the front door.
function blockers(d,layer,{pageHidden=false}={}){
  const body=d.body,has=(node,name)=>Boolean(node?.classList?.contains?.(name));
  const list=[];
  if(d.hidden||pageHidden)list.push('hidden');
  if(has(body,'us-keyboard-open'))list.push('keyboard');
  if(layer?.hasAttribute?.('inert'))list.push('inert');
  if(has(d.getElementById('homeHero'),'us-oggi-focus'))list.push('focus');
  if([...(d.querySelectorAll?.('.auth-overlay')||[])].some(node=>!has(node,'hidden')))list.push('auth');
  return list;
}

const MAUDIT_KEYS=Object.freeze({enabled:'us:maudit:v1:enabled',companion:'us:pet:v1:companion'});
// Removed with the walking Maudit: the remembered spot on a card rim.
const RETIRED_KEYS=Object.freeze(['us:maudit:v1:placement']);
const OUT='cubic-bezier(.2,.8,.2,1)';
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

function install(w){
  const d=w?.document,api=w?.USPet;
  if(!d?.getElementById||!api)return;
  const layer=d.getElementById('usPetLayer'),actor=layer?.querySelector('.us-pet-actor'),nav=d.querySelector('.nav');
  // The placeholder is never a production fallback: an approved asset needs its own renderer.
  const approved=PET_ASSET_STATUS==='APPROVED'&&renderers.has('sprite');
  const preview=Boolean(layer&&actor&&nav)&&previewRequested(w);
  const disabled=Boolean(layer&&actor&&nav)&&disabledRequested(w);
  const available=Boolean(layer&&actor&&nav&&!disabled&&(approved||preview));
  // Device-local preference (Settings → Maudit). A blocked storage keeps the default.
  const store={
    get(key){try{return w.localStorage?.getItem(key)??null;}catch(_){return null;}},
    set(key,value){try{w.localStorage?.setItem(key,value);}catch(_){/* stays in memory */}},
    remove(key){try{w.localStorage?.removeItem(key);}catch(_){/* nothing to clean */}}
  };
  RETIRED_KEYS.forEach(key=>store.remove(key));
  const preferred=()=>store.get(MAUDIT_KEYS.enabled)!=='0';
  let runtime=null;
  const noop={react:()=>false,useRenderer:()=>false,blockers:()=>[],glance:()=>false};
  let appearance={skin:'',accessory:''};
  function applyAppearance(next={}){
    appearance={skin:String(next.skin||'').replace(/[^a-z0-9_-]/g,''),accessory:String(next.accessory||'').replace(/[^a-z0-9_-]/g,'')};
    if(!layer)return;
    if(appearance.skin)layer.dataset.petSkin=appearance.skin;else delete layer.dataset.petSkin;
    if(appearance.accessory)layer.dataset.petAccessory=appearance.accessory;else delete layer.dataset.petAccessory;
    // Premi Sintonia V2: the accessory picture, fetched only when worn (pet.css places it).
    if(appearance.accessory)layer.style.setProperty('--acc-img','url("/assets/derived/rewards/us-acc-'+appearance.accessory+'-v1.webp")');else layer.style.removeProperty('--acc-img');
  }

  // The companion stored on this phone: one of COMPANION_IDS, 'none', or Maudit by default.
  const stored=()=>{const id=store.get(MAUDIT_KEYS.companion);return id===NO_COMPANION||COMPANION_IDS.includes(id)?id:'maudit';};
  function mount(){
    if(runtime||!available)return Boolean(runtime);
    if(stored()===NO_COMPANION&&!preview)return false;
    const cleanups=[],timers=new Map();
    const on=(target,type,fn,options)=>{if(!target?.addEventListener)return;target.addEventListener(type,fn,options);cleanups.push(()=>target.removeEventListener?.(type,fn,options));};
    const later=(key,fn,ms)=>{if(timers.has(key))w.clearTimeout(timers.get(key));timers.set(key,w.setTimeout(()=>{timers.delete(key);fn();},ms));};
    const reduced=()=>{try{return Boolean(w.UsUiFoundation?.isReducedMotion?.());}catch(_){return false;}};
    let view=null,host=null,pageHidden=false,lastBeat=0;
    // The mockup's hop (on the whole figure) and heartPop (the small heart).
    // The dragon flies its loop instead.
    function hop(){
      if(reduced()||!host)return;
      if(view?.fly?.())return;
      const figure=host.querySelector?.('.us-pet-figure');
      figure?.animate?.([{translate:'0 0',scale:'1 1'},{translate:'0 1px',scale:'1.08 .9',offset:.15},{translate:'0 -12px',scale:'.95 1.06',offset:.45},{translate:'0 0',scale:'1.06 .94',offset:.75},{translate:'0 0',scale:'1 1'}],{duration:TIMING.hop,easing:'ease-out'});
      const heart=host.querySelector?.('.us-pet-heart');
      heart?.animate?.([{opacity:0,translate:'0 4px',scale:.5},{opacity:1,translate:'0 -10px',scale:1,offset:.4},{opacity:0,translate:'0 -22px',scale:.9}],{duration:TIMING.heart,easing:OUT});
    }
    const pet=createPet({
      schedule:(fn,ms)=>w.setTimeout(fn,ms),cancel:id=>w.clearTimeout(id),
      render({state,reason,beat}){
        layer.dataset.petState=state;
        if(reason)layer.dataset.petReason=reason;else delete layer.dataset.petReason;
        view?.setState?.(state,{reason});
        if(state==='happy'&&beat!==lastBeat){lastBeat=beat;hop();}
      }
    });
    // Renderer contract: mount(host) → { setState(state,{reason}), setAppearance(appearance), destroy() }.
    // Atomic replacement: the candidate mounts into its own detached host. The
    // current renderer, its host and its live nodes are untouched until the
    // candidate has mounted successfully; a failing candidate is simply dropped.
    function useRenderer(id){
      if(!canMount(id,{preview}))return false;
      const stage=d.createElement('span');
      stage.className='us-pet-renderer';
      let next;
      try{next=renderers.get(id).mount(stage)||{};}
      catch(error){console.warn('[US PET] renderer',error);return false;}
      const previous=view,previousHost=host;
      if(previous){try{previous.destroy?.();}catch(error){console.warn('[US PET] renderer destroy',error);}}
      previousHost?.remove?.();
      actor.appendChild(stage);
      view=next;host=stage;
      layer.dataset.petRenderer=id;
      const snap=pet.snapshot();
      view.setState?.(snap.state,{reason:snap.reason});
      view.setAppearance?.(appearance);
      return true;
    }
    if(!useRenderer(preview?'placeholder':approved?rendererOf(stored()):'placeholder'))return false;

    // ---------- touch: a tap pets it, a touch elsewhere wakes it ----------
    // The layer stays pointer-transparent; this one target on the cat takes the
    // tap. The whole cat is the pressed control (the shared .tap press, as the
    // mockup's #mauditHome button).
    const hit=d.createElement('span');
    hit.className='us-pet-hit';
    layer.classList?.add?.('tap');
    layer.appendChild?.(hit);
    on(hit,'click',()=>{if(!blockers(d,layer,{pageHidden}).length)pet.caress();});
    on(hit,'contextmenu',event=>event.preventDefault());
    on(d,'pointerdown',event=>{if(!hit.contains?.(event?.target))pet.touch();},{capture:true,passive:true});

    // Glance: the pupils turn towards a tapped tab for a moment.
    function glance(x){
      const pupils=host?.querySelector?.('.m-pupils');
      if(!pupils||!Number.isFinite(x))return false;
      const r=actor.getBoundingClientRect();
      const dx=clamp((x-(r.left+r.width/2))/90,-1.6,1.6);
      pupils.style.translate=`${dx}px 0.4px`;
      later('glance',()=>{pupils.style.translate='';},TIMING.glance);
      return true;
    }

    // ---------- lifecycle ----------
    // start()/stop() are idempotent: repeated mutations restart at most once.
    function sync(){
      if(blockers(d,layer,{pageHidden}).length)pet.stop();
      else pet.start();
    }
    layer.hidden=false;
    const observers=[];
    on(d,'visibilitychange',sync);
    on(w,'pagehide',()=>{pageHidden=true;sync();});
    on(w,'pageshow',()=>{pageHidden=false;sync();});
    // Bounded observation: only the nodes and attributes the blockers read. No subtree, no polling.
    if(typeof w.MutationObserver==='function'){
      const observer=new w.MutationObserver(sync);
      const watch=(node,attributes)=>{if(node)observer.observe(node,{attributes:true,attributeFilter:attributes});};
      watch(d.body,['class']);
      watch(layer,['inert']);
      watch(d.getElementById('homeHero'),['class']);
      (d.querySelectorAll?.('.auth-overlay')||[]).forEach(node=>watch(node,['class']));
      observers.push(observer);
    }
    // Event interface for features that live in other files. Ignored while blocked.
    // The observer stops the machine asynchronously; reactions must not wait for
    // it, so the canonical decision is evaluated right here, before anything changes.
    function react(reason){
      if(blockers(d,layer,{pageHidden}).length)return false;
      return pet.react(reason);
    }
    on(w,'us:pet',event=>{if(event?.detail?.type==='react')react(event.detail.reason);});
    // The companion on this phone. companions.js only offers the unlocked ones.
    function setCompanion(id){
      if(id===NO_COMPANION){store.set(MAUDIT_KEYS.companion,id);if(!preview)unmount();return true;}
      if(!COMPANION_IDS.includes(id))return false;
      store.set(MAUDIT_KEYS.companion,id);
      if(preview)return true;
      return useRenderer(rendererOf(id));
    }
    runtime={
      pet,react,useRenderer,glance,setCompanion,
      blockers:()=>blockers(d,layer,{pageHidden}),
      setAppearance(next={}){applyAppearance(next);view?.setAppearance?.(appearance);},
      snapshot:()=>pet.snapshot(),
      inspect:()=>({mounted:true,listeners:cleanups.length,observers:observers.length,timers:timers.size+pet.snapshot().timers,hit:hit.isConnected!==false&&Boolean(hit.parentNode)}),
      destroy(){
        pet.stop();
        timers.forEach(id=>w.clearTimeout(id));timers.clear();
        observers.forEach(observer=>observer.disconnect?.());
        cleanups.splice(0).forEach(fn=>{try{fn();}catch(_){}});
        hit.remove?.();
        layer.classList?.remove?.('tap');
        try{view?.destroy?.();}catch(error){console.warn('[US PET] renderer destroy',error);}
        host?.remove?.();view=null;host=null;
        layer.hidden=true;
        ['petState','petReason','petRenderer'].forEach(key=>delete layer.dataset[key]);
      }
    };
    expose();
    sync();
    return true;
  }
  function unmount(){
    if(!runtime)return false;
    const live=runtime;runtime=null;
    live.destroy();
    expose();
    return true;
  }
  function expose(){
    const live=runtime||noop;
    api.enabled=Boolean(runtime);
    api.react=live.react;
    api.useRenderer=live.useRenderer;
    api.blockers=live.blockers;
    api.glance=live.glance;
    api.setCompanion=runtime?runtime.setCompanion:(id=>{
      if(id!==NO_COMPANION&&!COMPANION_IDS.includes(id))return false;
      store.set(MAUDIT_KEYS.companion,id);
      // The first companion arrives: it appears, unless Maudit is switched off in Settings.
      if(id!==NO_COMPANION&&preferred())mount();
      return true;
    });
    api.setAppearance=runtime?runtime.setAppearance:applyAppearance;
    api.snapshot=runtime?runtime.snapshot:()=>({state:'disabled',running:false});
    api.inspect=runtime?runtime.inspect:()=>({mounted:false,listeners:0,observers:0,timers:0,hit:Boolean(layer?.querySelector?.('.us-pet-hit'))});
  }
  // Settings → Maudit. Off unmounts everything: renderer, hit target, timers,
  // observers and listeners. On mounts it again in its home spot.
  api.isEnabled=preferred;
  api.companion=stored;
  api.setEnabled=next=>{
    store.set(MAUDIT_KEYS.enabled,next?'1':'0');
    if(next)mount();else unmount();
    return preferred();
  };
  expose();
  if(!available||!preferred())return; // zero cost: no timers, no observers, nothing painted
  mount();
}

// Before install (or when disabled) every entry point is a safe no-op.
return {
  PET_ASSET_STATUS,STATES,REASONS,TIMING,COMPANIONS,COMPANION_IDS,NO_COMPANION,createPet,registerRenderer,canMount,computeBlockers:blockers,install,MAUDIT_KEYS,
  enabled:false,
  react:()=>false,
  useRenderer:()=>false,
  blockers:()=>[],
  glance:()=>false,
  setCompanion:()=>false,
  companion:()=>'maudit',
  setAppearance:()=>{},
  snapshot:()=>null
};
});
