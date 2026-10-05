(function(global,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  global.USPet=api;api.install(global);
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
// US PET Foundation V1 — a quiet companion that lives on the rim of the bottom
// navigation. It never receives input (pointer-events:none), never covers a tab,
// and owns no data: it only reacts to facts other authorities announce.
//
// The owner-approved kitten v0 is the current production PET asset. The renderer
// contract stays replaceable so a later art pass can land without changing the
// scheduler/lifecycle architecture. ?us-pet=preview keeps the explicit QA renderer;
// ?us-pet=off is a one-load emergency kill switch.
const PET_ASSET_STATUS='APPROVED';
const PREVIEW_KEY='us:pet:v1:preview';
const STATES=Object.freeze(['idle','walk','rest','react']);
const REASONS=Object.freeze(['think','left-for-you','reward','streak','daily-question']);
const TIMING=Object.freeze({
  idle:[2500,7000],   // a natural pause between decisions
  rest:[9000,22000],  // sitting down for a while
  react:1600,         // one short, non-looping gesture
  speed:26,           // px per second: a stroll, never a run
  minStep:36,         // walks shorter than this look like jitter
  walkMin:900,
  walkMax:9000,
  size:40,            // logical box, see the asset requirement
  edge:6
});
const between=(random,[min,max])=>Math.round(min+(max-min)*random());
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

// Pure decision: what comes after `state`. Kept free of timers/DOM for tests.
function decide(state,{x=0,width=0,reduced=false,random=Math.random}={}){
  const max=Math.max(TIMING.edge,width-TIMING.size-TIMING.edge);
  if(state==='idle'){
    const roll=random();
    if(!reduced&&max-TIMING.edge>=TIMING.minStep&&roll<.55){
      let target=x;
      for(let i=0;i<4&&Math.abs(target-x)<TIMING.minStep;i++)target=Math.round(TIMING.edge+(max-TIMING.edge)*random());
      if(Math.abs(target-x)>=TIMING.minStep){
        const duration=clamp(Math.round(Math.abs(target-x)/TIMING.speed*1000),TIMING.walkMin,TIMING.walkMax);
        return {state:'walk',x:target,duration,facing:target<x?'left':'right'};
      }
    }
    if(roll<.78)return {state:'rest',x,duration:between(random,TIMING.rest)};
    return {state:'idle',x,duration:between(random,TIMING.idle)};
  }
  // walk (arrived), rest (woke up) and react (done) all settle into idle.
  return {state:'idle',x:clamp(x,TIMING.edge,max),duration:between(random,TIMING.idle)};
}

// The machine owns timers only while running; it renders through a callback.
function createPet({schedule=setTimeout,cancel=clearTimeout,now=Date.now,random=Math.random,render=()=>{}}={}){
  let state='idle',x=TIMING.edge,facing='right',width=0,reduced=false,running=false,timer=null;
  let walk=null,pending=null,reason='';
  const emit=(duration=0)=>render({state,x,facing,duration,reason});
  function arm(duration){if(timer!==null)cancel(timer);timer=schedule(step,duration);}
  function position(){
    // Walks are linear, so the visual position mid-walk is exact.
    if(!walk)return x;
    const t=clamp((now()-walk.start)/walk.duration,0,1);
    return Math.round(walk.from+(walk.to-walk.from)*t);
  }
  function apply(next){
    const from=position();
    state=next.state;reason=next.reason||'';
    if(next.facing)facing=next.facing;
    walk=state==='walk'?{from,to:next.x,start:now(),duration:next.duration}:null;
    x=next.x;
    emit(state==='walk'?next.duration:0);
    arm(next.duration);
  }
  function step(){
    timer=null;if(!running)return;
    if(state==='react'&&pending){const again=pending;pending=null;return apply({state:'react',x,reason:again,duration:TIMING.react});}
    apply(decide(state,{x,width,reduced,random}));
  }
  return {
    start(){if(running)return false;running=true;apply({state:'idle',x:clamp(x,TIMING.edge,Math.max(TIMING.edge,width-TIMING.size-TIMING.edge)),duration:between(random,TIMING.idle)});return true;},
    stop(){
      if(!running)return false;
      x=position();walk=null;running=false;pending=null;
      if(timer!==null)cancel(timer);timer=null;
      state='idle';reason='';emit(0);return true;
    },
    setTrack(next){
      width=Math.max(0,Number(next)||0);
      const max=Math.max(TIMING.edge,width-TIMING.size-TIMING.edge);
      if(x>max||walk&&walk.to>max){x=clamp(position(),TIMING.edge,max);walk=null;if(running){state='idle';emit(0);arm(between(random,TIMING.idle));}}
    },
    setReduced(next){
      reduced=Boolean(next);
      // Reduced motion never strolls: stop exactly where the pet is.
      if(reduced&&state==='walk'&&running){x=position();walk=null;state='idle';emit(0);arm(between(random,TIMING.idle));}
    },
    react(next){
      if(!running||!REASONS.includes(next))return false;
      if(state==='react'){pending=next;return true;} // at most one queued reaction
      x=position();walk=null;
      apply({state:'react',x,reason:next,duration:TIMING.react});
      return true;
    },
    snapshot:()=>({state,x:position(),facing,width,reduced,running,reason,pending})
  };
}

// ---------- renderers: the only part that changes when the approved asset lands ----------
const renderers=new Map();
function registerRenderer(renderer){
  if(!renderer||typeof renderer.id!=='string'||typeof renderer.mount!=='function')throw new TypeError('invalid_pet_renderer');
  renderers.set(renderer.id,renderer);
  return renderer.id;
}
// OWNER-APPROVED PRODUCTION V0 — white/gray kitten with blue eyes.
// The same drawing is also available through the explicit placeholder renderer
// for QA. Source authority: assets/source/pet/us-pet-kitten-base-v0.svg.
const KITTEN_V0_SVG='<svg class="us-pet-kitten" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" focusable="false"><defs><linearGradient id="usPetKWhite" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf8f4"/><stop offset="1" stop-color="#e2dbd3"/></linearGradient><linearGradient id="usPetKGray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a7acb5"/><stop offset="1" stop-color="#7c818b"/></linearGradient><radialGradient id="usPetKIris" cx="45%" cy="38%" r="70%"><stop offset="0" stop-color="#b4dcff"/><stop offset=".55" stop-color="#5e9ce0"/><stop offset="1" stop-color="#3a6cab"/></radialGradient></defs><g class="k-tail"><path d="M9.2 29.2C4.6 28.4 2.6 23.6 4.2 18.6" fill="none" stroke="url(#usPetKGray)" stroke-width="3.2" stroke-linecap="round"/></g><g class="k-leg k-leg-hind-far"><rect x="10.4" y="31" width="3" height="7.2" rx="1.5" fill="#757a84"/></g><g class="k-leg k-leg-front-far"><rect x="21.4" y="31" width="3" height="7.2" rx="1.5" fill="#d6cfc7"/></g><g class="k-body"><ellipse cx="17" cy="29.6" rx="10" ry="6.2" fill="url(#usPetKWhite)"/><path d="M7.3 28.6C7.8 24 12.4 23.1 17 23.3C20.6 23.5 23.1 24.6 24.6 26.5C21 27.7 16 28.3 11.5 30.3C9.5 31.1 7.9 30.7 7.3 28.6Z" fill="url(#usPetKGray)"/></g><g class="k-leg k-leg-hind-near"><rect x="13.2" y="31.4" width="3.2" height="7.2" rx="1.6" fill="url(#usPetKGray)"/><ellipse cx="14.8" cy="38.1" rx="1.9" ry="1" fill="#f4efe9"/></g><g class="k-leg k-leg-front-near"><rect x="24.2" y="31.4" width="3.2" height="7.2" rx="1.6" fill="url(#usPetKWhite)"/><ellipse cx="25.8" cy="38.1" rx="1.9" ry="1" fill="#fbf8f4"/></g><g class="k-head"><g class="k-ear k-ear-far"><path d="M22.2 15.2L23.4 6.6L28.2 12Z" fill="#878c95"/><path d="M23.3 13.5L24 8.8L26.7 12Z" fill="#dea0aa"/></g><g class="k-ear k-ear-near"><path d="M29.6 11.6L34.8 5.8L35.8 14.6Z" fill="url(#usPetKGray)"/><path d="M31 11.7L34.2 8.3L34.8 13.1Z" fill="#e8a7b0"/></g><circle cx="29.2" cy="19.6" r="8.3" fill="url(#usPetKGray)"/><path class="k-face" d="M30 12.6C30.5 15.1 31.2 17.6 32.2 20.3C33.6 21.1 35.6 21.4 36.4 23.1C37 25.5 34.6 27.9 30.8 28.1C27 28.3 24 26.9 23.6 24.7C23.4 23.1 25.6 21.3 27.8 20.5C28.8 17.6 29.5 15.1 30 12.6Z" fill="url(#usPetKWhite)"/><ellipse class="k-blush" cx="34.7" cy="24.4" rx="1.3" ry=".8" fill="#f1b6bf" opacity=".45"/><g class="k-eyes-open"><g class="k-eye k-eye-far"><ellipse cx="26.2" cy="19.5" rx="1.35" ry="1.7" fill="url(#usPetKIris)"/><ellipse cx="26.35" cy="19.6" rx=".45" ry="1.15" fill="#1c2230"/><circle cx="25.85" cy="18.9" r=".4" fill="#fff"/></g><g class="k-eye k-eye-near"><ellipse cx="34" cy="19.4" rx="1.6" ry="1.95" fill="url(#usPetKIris)"/><ellipse cx="34.2" cy="19.5" rx=".52" ry="1.3" fill="#1c2230"/><circle cx="33.6" cy="18.7" r=".45" fill="#fff"/></g></g><g class="k-eyes-closed" fill="none" stroke="#4a505a" stroke-width=".7" stroke-linecap="round"><path d="M24.9 19.9q1.3.9 2.6 0"/><path d="M32.5 19.8q1.5 1 3 0"/></g><path class="k-nose" d="M30.4 22.6h1.9l-.95 1.15Z" fill="#e39aa6" stroke="#e39aa6" stroke-width=".3" stroke-linejoin="round"/><path class="k-mouth" d="M31.35 23.8v.6M31.35 24.4c-.35.55-1.1.55-1.4.1M31.35 24.4c.35.55 1.1.55 1.4.1" fill="none" stroke="#9c8a8d" stroke-width=".42" stroke-linecap="round"/><g class="k-collar"><path d="M23.8 25.6C26.6 28.5 32.4 28.9 35.5 26.4" fill="none" stroke="var(--us-color-accent-strong,#ef9bc1)" stroke-width="1.4" stroke-linecap="round"/><circle cx="29.6" cy="28.5" r="1" fill="#f3d28b"/></g></g></svg>';
function mountKittenV0(host,{preview=false}={}){
  const marker=preview?' data-pet-placeholder data-pet-preview="kitten-v0"':' data-pet-production="kitten-v0"';
  host.innerHTML='<span class="us-pet-shadow"></span><span class="us-pet-figure"'+marker+'>'+KITTEN_V0_SVG+'</span>';
  return {destroy(){host.innerHTML='';}};
}
registerRenderer({
  id:'placeholder',
  mount(host){return mountKittenV0(host,{preview:true});}
});
registerRenderer({
  id:'sprite',
  mount(host){return mountKittenV0(host);}
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

// The one runtime decision on whether the PET may live right now. Notices
// (toast, Daily nudge, offline/online status, the update bar) and the Ti penso
// arrival are deliberately NOT blockers: they sit below the PET's ambient layer
// (see the layer ladder in ui-foundation.css). The update bar can stay up for
// hours, a status line appears on every reconnect or error toast: hiding for
// them made the PET vanish "at random". Only states that own the whole screen
// or the keyboard stop it: background, keyboard, an exclusive sheet/viewer
// (body[data-us-surface], kept by ui-foundation), Focus Photo, the front door.
function blockers(d,layer,{pageHidden=false}={}){
  const body=d.body,has=(node,name)=>Boolean(node?.classList?.contains?.(name));
  const list=[];
  if(d.hidden||pageHidden)list.push('hidden');
  if(has(body,'us-keyboard-open'))list.push('keyboard');
  if(layer?.hasAttribute?.('inert'))list.push('inert');
  if(body?.getAttribute?.('data-us-surface')==='open')list.push('surface');
  if(has(d.getElementById('homeHero'),'us-oggi-focus'))list.push('focus');
  if([...(d.querySelectorAll?.('.auth-overlay')||[])].some(node=>!has(node,'hidden')))list.push('auth');
  return list;
}

function install(w){
  const d=w?.document,api=w?.USPet;
  if(!d?.getElementById||!api)return;
  const layer=d.getElementById('usPetLayer'),actor=layer?.querySelector('.us-pet-actor'),nav=d.querySelector('.nav');
  // The placeholder is never a production fallback: an approved asset needs its own renderer.
  const approved=PET_ASSET_STATUS==='APPROVED'&&renderers.has('sprite');
  const preview=Boolean(layer&&actor&&nav)&&previewRequested(w);
  const disabled=Boolean(layer&&actor&&nav)&&disabledRequested(w);
  api.enabled=Boolean(layer&&actor&&nav&&!disabled&&(approved||preview));
  if(!api.enabled)return; // zero cost: no timers, no observers, nothing painted
  let view=null,host=null,appearance={skin:'',accessory:''},facing='',pageHidden=false;
  const pet=createPet({
    schedule:(fn,ms)=>w.setTimeout(fn,ms),cancel:id=>w.clearTimeout(id),
    render({state,x,facing:nextFacing,duration,reason}){
      layer.dataset.petState=state;layer.dataset.petFacing=nextFacing;
      if(reason)layer.dataset.petReason=reason;else delete layer.dataset.petReason;
      layer.style.setProperty('--us-pet-x',`${x}px`);
      layer.style.setProperty('--us-pet-move',`${duration}ms`);
      if(nextFacing!==facing){facing=nextFacing;view?.setFacing?.(facing);}
      view?.setState?.(state,{reason});
    }
  });
  // Renderer contract: mount(host) → { setState(state,{reason}), setFacing(facing), setAppearance(appearance), destroy() }.
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
    facing=snap.facing;
    view.setFacing?.(facing);
    view.setState?.(snap.state,{reason:snap.reason});
    view.setAppearance?.(appearance);
    return true;
  }
  function measure(){
    const rect=nav.getBoundingClientRect();
    if(!rect.width)return;
    layer.style.setProperty('--us-pet-track',`${Math.round(rect.width)}px`);
    layer.style.setProperty('--us-pet-nav-h',`${Math.round(rect.height)}px`);
    pet.setTrack(rect.width-28); // keep clear of the nav's rounded ends
  }
  // start()/stop() are idempotent: repeated mutations restart at most once, and
  // stop() drops any queued reaction, so nothing accumulates while blocked.
  function sync(){if(blockers(d,layer,{pageHidden}).length)pet.stop();else pet.start();}
  if(!useRenderer(preview?'placeholder':approved?'sprite':'placeholder')){api.enabled=false;return;}
  layer.hidden=false;
  measure();
  if(typeof w.ResizeObserver==='function')new w.ResizeObserver(measure).observe(nav);
  w.addEventListener('resize',measure,{passive:true});
  const foundation=w.UsUiFoundation;
  pet.setReduced(foundation?.isReducedMotion?.()||false);
  foundation?.onMotionPreferenceChange?.(value=>pet.setReduced(value));
  d.addEventListener('visibilitychange',sync);
  w.addEventListener('pagehide',()=>{pageHidden=true;sync();});
  w.addEventListener('pageshow',()=>{pageHidden=false;sync();});
  // Bounded observation: only the nodes and attributes the blockers read. No subtree, no polling.
  if(typeof w.MutationObserver==='function'){
    const observer=new w.MutationObserver(sync);
    const watch=(node,attributes)=>{if(node)observer.observe(node,{attributes:true,attributeFilter:attributes});};
    watch(d.body,['class','data-us-surface']);
    watch(layer,['inert']);
    watch(d.getElementById('homeHero'),['class']);
    (d.querySelectorAll?.('.auth-overlay')||[]).forEach(node=>watch(node,['class']));
  }
  // Event interface for features that live in other files. Ignored while blocked.
  // The observer stops the scheduler asynchronously; reactions must not wait for
  // it, so the canonical decision is evaluated right here, before anything changes.
  function react(reason){
    if(blockers(d,layer,{pageHidden}).length)return false;
    return pet.react(reason);
  }
  w.addEventListener('us:pet',event=>{if(event?.detail?.type==='react')react(event.detail.reason);});
  api.react=react;
  api.useRenderer=useRenderer;
  api.blockers=()=>blockers(d,layer,{pageHidden});
  api.setAppearance=(next={})=>{
    appearance={skin:String(next.skin||'').replace(/[^a-z0-9_-]/g,''),accessory:String(next.accessory||'').replace(/[^a-z0-9_-]/g,'')};
    if(appearance.skin)layer.dataset.petSkin=appearance.skin;else delete layer.dataset.petSkin;
    if(appearance.accessory)layer.dataset.petAccessory=appearance.accessory;else delete layer.dataset.petAccessory;
    view?.setAppearance?.(appearance);
  };
  api.snapshot=()=>pet.snapshot();
  sync();
}

// Before install (or when disabled) every entry point is a safe no-op.
return {
  PET_ASSET_STATUS,STATES,REASONS,TIMING,decide,createPet,registerRenderer,canMount,computeBlockers:blockers,install,
  enabled:false,
  react:()=>false,
  useRenderer:()=>false,
  blockers:()=>[],
  setAppearance:()=>{},
  snapshot:()=>null
};
});
