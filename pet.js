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
// No approved PET asset exists yet (docs/missions/us-pet-asset-spec-v1.md), so
// the layer stays unmounted in production. Developers and real-device QA opt in
// with ?us-pet=preview (persisted on that device) and opt out with ?us-pet=off.
const PET_ASSET_STATUS='PLACEHOLDER';
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
// PLACEHOLDER — geometric stand-in for development only. Not a design proposal.
registerRenderer({
  id:'placeholder',
  mount(host){
    host.innerHTML='<span class="us-pet-shadow"></span><span class="us-pet-figure" data-pet-placeholder><span class="us-pet-body"></span><span class="us-pet-eye"></span><span class="us-pet-light"></span></span>';
    return {destroy(){host.innerHTML='';}};
  }
});

function previewRequested(w){
  try{
    const flag=new URL(w.location.href).searchParams.get('us-pet');
    if(flag==='preview')w.localStorage?.setItem(PREVIEW_KEY,'1');
    if(flag==='off')w.localStorage?.removeItem(PREVIEW_KEY);
    return flag==='preview'||(flag!=='off'&&w.localStorage?.getItem(PREVIEW_KEY)==='1');
  }catch(_){return false;}
}

function install(w){
  const d=w?.document,api=w?.USPet;
  if(!d?.getElementById||!api)return;
  const layer=d.getElementById('usPetLayer'),actor=layer?.querySelector('.us-pet-actor'),nav=d.querySelector('.nav');
  // The placeholder is never a production fallback: an approved asset needs its own renderer.
  const approved=PET_ASSET_STATUS==='APPROVED'&&renderers.has('sprite');
  api.enabled=Boolean(layer&&actor&&nav&&(approved||previewRequested(w)));
  if(!api.enabled)return; // zero cost: no timers, no observers, nothing painted
  let view=null,appearance={skin:'',accessory:''};
  const pet=createPet({
    schedule:(fn,ms)=>w.setTimeout(fn,ms),cancel:id=>w.clearTimeout(id),
    render({state,x,facing,duration,reason}){
      layer.dataset.petState=state;layer.dataset.petFacing=facing;
      if(reason)layer.dataset.petReason=reason;else delete layer.dataset.petReason;
      layer.style.setProperty('--us-pet-x',`${x}px`);
      layer.style.setProperty('--us-pet-move',`${duration}ms`);
      view?.setState?.(state,{facing,reason});
    }
  });
  function useRenderer(id){
    const renderer=renderers.get(id)||renderers.get('placeholder');
    view?.destroy?.();view=renderer.mount(actor)||{};
    layer.dataset.petRenderer=renderer.id;
    view.setAppearance?.(appearance);
  }
  function measure(){
    const rect=nav.getBoundingClientRect();
    if(!rect.width)return;
    layer.style.setProperty('--us-pet-track',`${Math.round(rect.width)}px`);
    layer.style.setProperty('--us-pet-nav-h',`${Math.round(rect.height)}px`);
    pet.setTrack(rect.width-28); // keep clear of the nav's rounded ends
  }
  function sync(){if(d.hidden)pet.stop();else pet.start();}
  useRenderer(approved?'sprite':'placeholder');
  layer.hidden=false;
  measure();
  if(typeof w.ResizeObserver==='function')new w.ResizeObserver(measure).observe(nav);
  w.addEventListener('resize',measure,{passive:true});
  const foundation=w.UsUiFoundation;
  pet.setReduced(foundation?.isReducedMotion?.()||false);
  foundation?.onMotionPreferenceChange?.(value=>pet.setReduced(value));
  d.addEventListener('visibilitychange',sync);
  w.addEventListener('pagehide',()=>pet.stop());
  w.addEventListener('pageshow',sync);
  // Event interface for features that live in other files.
  w.addEventListener('us:pet',event=>{if(event?.detail?.type==='react')pet.react(event.detail.reason);});
  api.react=reason=>pet.react(reason);
  api.useRenderer=useRenderer;
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
  PET_ASSET_STATUS,STATES,REASONS,TIMING,decide,createPet,registerRenderer,install,
  enabled:false,
  react:()=>false,
  useRenderer:()=>{},
  setAppearance:()=>{},
  snapshot:()=>null
};
});
