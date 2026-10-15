(function(global,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  global.USPet=api;api.install(global);
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
// Maudit 1.0 — exactly the approved mockup (design "Due colori, un Noi",
// core.js "Maudit"): the cat sits still in one home spot, just above the
// right end of the bottom bar, on every tab. It never walks, is never picked
// up or dragged. It only changes state:
//   idle    → sits, blinks, the tail sways;
//   sleep   → after 30 s without a touch anywhere: eyes shut, slow breath, z z;
//   curious → a touch anywhere (or on it) while it sleeps: head tilts, 1.2 s;
//   pet     → a tap on it: happy eyes, ears back, a purr, 1.6 s;
//   happy   → every third tap, and when something arrives for me (Ti penso,
//             Lasciato per te, a reward, the answers of the day): one small
//             hop and a heart, 1.7 s.
// It owns no data and only reacts to facts other authorities announce.
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
// OWNER-APPROVED PRODUCTION 1.0 — Maudit, the grey loaf seen from the front,
// with cream muzzle and paws. Approved with the design mockup on 2026-10-14.
// Source authority: assets/source/pet/us-pet-maudit-v1.svg. Poses in pet.css.
const MAUDIT_V1_SVG='<svg class="us-pet-maudit" viewBox="0 -8 100 100" width="40" height="40" aria-hidden="true" focusable="false"><g class="m-tail"><path d="M76 80C92 78 98 63 92 51C89 45 84 45 83 49" fill="none" stroke="#A7A2B2" stroke-width="8" stroke-linecap="round"/></g><g class="m-body"><path d="M14 80C12 60 26 46 50 46C74 46 88 60 86 80C86 86 82 88 76 88H24C18 88 14 86 14 80Z" fill="#A7A2B2"/><ellipse cx="50" cy="78" rx="17" ry="9" fill="#F7F0EA"/><g class="m-paw m-paw-l"><ellipse cx="37" cy="88" rx="8" ry="4" fill="#F7F0EA"/></g><g class="m-paw m-paw-r"><ellipse cx="63" cy="88" rx="8" ry="4" fill="#F7F0EA"/></g></g><g class="m-head"><g class="m-ear m-ear-l"><path d="M24 36L22 13Q23 9 26.5 11.5L44 24Z" fill="#A7A2B2" stroke="#A7A2B2" stroke-width="3" stroke-linejoin="round"/><path d="M27.5 30L26.5 17.5L37 25Z" fill="#FFB3C2"/></g><g class="m-ear m-ear-r"><path d="M76 36L78 13Q77 9 73.5 11.5L56 24Z" fill="#A7A2B2" stroke="#A7A2B2" stroke-width="3" stroke-linejoin="round"/><path d="M72.5 30L73.5 17.5L63 25Z" fill="#FFB3C2"/></g><path d="M20 44C20 27 34 19 50 19C66 19 80 27 80 44C80 60 67 68 50 68C33 68 20 60 20 44Z" fill="#A7A2B2"/><path class="m-face" d="M50 26C45 33 35 42 34 52C36 63 64 63 66 52C65 42 55 33 50 26Z" fill="#F7F0EA"/><g class="m-blush"><circle cx="32" cy="54" r="4.5" fill="#FF7C96" opacity=".35"/><circle cx="68" cy="54" r="4.5" fill="#FF7C96" opacity=".35"/></g><g class="m-eyes-open"><g class="m-pupils"><ellipse cx="38" cy="44" rx="4.8" ry="5.8" fill="#1A1020"/><ellipse cx="62" cy="44" rx="4.8" ry="5.8" fill="#1A1020"/><circle cx="39.7" cy="41.8" r="1.8" fill="#fff"/><circle cx="63.7" cy="41.8" r="1.8" fill="#fff"/></g></g><g class="m-eyes-happy" fill="none" stroke="#1A1020" stroke-width="2.6" stroke-linecap="round"><path d="M33.5 45.5Q38 39.5 42.5 45.5"/><path d="M57.5 45.5Q62 39.5 66.5 45.5"/></g><g class="m-eyes-closed" fill="none" stroke="#1A1020" stroke-width="2.4" stroke-linecap="round"><path d="M33.5 44Q38 48 42.5 44"/><path d="M57.5 44Q62 48 66.5 44"/></g><path class="m-nose" d="M50 55.6C46.6 53.4 46.8 50.6 48.6 50.6C49.5 50.6 50 51.3 50 51.8C50 51.3 50.5 50.6 51.4 50.6C53.2 50.6 53.4 53.4 50 55.6Z" fill="#FF7C96"/><path class="m-mouth" d="M46.5 58Q48.3 60 50 58Q51.7 60 53.5 58" fill="none" stroke="#1A1020" stroke-width="1.3" stroke-linecap="round" opacity=".7"/><g class="m-whiskers" stroke="#F7F0EA" stroke-width="1" opacity=".5" stroke-linecap="round"><path d="M30 55L18 53M30 58L19 60M70 55L82 53M70 58L81 60"/></g><g class="m-collar"><path d="M33 64.5Q50 72 67 64.5" fill="none" stroke="var(--us-noi,#d98be0)" stroke-width="3.6" stroke-linecap="round"/><circle cx="50" cy="70" r="2.6" fill="#F3D28B"/></g></g><g class="m-zz" fill="#F7EFE9" font-family="Figtree,system-ui,sans-serif" font-weight="700"><text x="80" y="22" font-size="12">z</text><text x="89" y="12" font-size="9">z</text></g><g class="m-purr" stroke="#FF7C96" stroke-width="2.2" stroke-linecap="round" fill="none"><path d="M9 50Q5 56 9 62"/><path d="M91 50Q95 56 91 62"/></g><g class="m-heart"><path d="M50 12C43 7.5 43 1 47.5 1C49 1 50 2 50 3C50 2 51 1 52.5 1C57 1 57 7.5 50 12Z" fill="#FF7C96"/></g></svg>';
function mountMauditV1(host){
  // As in the mockup: no shadow under the cat, the drawing alone.
  host.innerHTML='<span class="us-pet-figure" data-pet-production="maudit-v1">'+MAUDIT_V1_SVG+'</span>';
  return {destroy(){host.innerHTML='';}};
}
registerRenderer({
  id:'placeholder',
  mount(host){return mountKittenV0(host);}
});
registerRenderer({
  id:'sprite',
  mount(host){return mountMauditV1(host);}
});

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

const MAUDIT_KEYS=Object.freeze({enabled:'us:maudit:v1:enabled'});
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
  }

  function mount(){
    if(runtime||!available)return Boolean(runtime);
    const cleanups=[],timers=new Map();
    const on=(target,type,fn,options)=>{if(!target?.addEventListener)return;target.addEventListener(type,fn,options);cleanups.push(()=>target.removeEventListener?.(type,fn,options));};
    const later=(key,fn,ms)=>{if(timers.has(key))w.clearTimeout(timers.get(key));timers.set(key,w.setTimeout(()=>{timers.delete(key);fn();},ms));};
    const reduced=()=>{try{return Boolean(w.UsUiFoundation?.isReducedMotion?.());}catch(_){return false;}};
    let view=null,host=null,pageHidden=false,lastBeat=0;
    // The mockup's hop (on the whole cat) and heartPop (the small heart).
    function hop(){
      if(reduced()||!host)return;
      const figure=host.querySelector?.('.us-pet-figure');
      figure?.animate?.([{translate:'0 0',scale:'1 1'},{translate:'0 1px',scale:'1.08 .9',offset:.15},{translate:'0 -12px',scale:'.95 1.06',offset:.45},{translate:'0 0',scale:'1.06 .94',offset:.75},{translate:'0 0',scale:'1 1'}],{duration:TIMING.hop,easing:'ease-out'});
      const heart=host.querySelector?.('.m-heart');
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
    if(!useRenderer(preview?'placeholder':approved?'sprite':'placeholder'))return false;

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
    runtime={
      pet,react,useRenderer,glance,
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
    api.setAppearance=runtime?runtime.setAppearance:applyAppearance;
    api.snapshot=runtime?runtime.snapshot:()=>({state:'disabled',running:false});
    api.inspect=runtime?runtime.inspect:()=>({mounted:false,listeners:0,observers:0,timers:0,hit:Boolean(layer?.querySelector?.('.us-pet-hit'))});
  }
  // Settings → Maudit. Off unmounts everything: renderer, hit target, timers,
  // observers and listeners. On mounts it again in its home spot.
  api.isEnabled=preferred;
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
  PET_ASSET_STATUS,STATES,REASONS,TIMING,createPet,registerRenderer,canMount,computeBlockers:blockers,install,MAUDIT_KEYS,
  enabled:false,
  react:()=>false,
  useRenderer:()=>false,
  blockers:()=>[],
  glance:()=>false,
  setAppearance:()=>{},
  snapshot:()=>null
};
});
