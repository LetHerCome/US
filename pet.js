(function(global,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  global.USPet=api;api.install(global);
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
// US PET Foundation V1 — a quiet companion that lives on the rim of the bottom
// navigation. It never covers a tab and owns no data: it only reacts to facts
// other authorities announce.
//
// Maudit Interaction V1: the kitten is now Maudit. The layer itself stays
// pointer-transparent; only one bounded hit target on the cat takes input
// (tap = pet, hold or a sideways pull = pick up by the scruff). Released, it
// falls under gravity onto the first safe plane below it (a registered card rim,
// with the nav rim as the final floor). The user's spot is remembered only once
// the landing is complete.
//
// The owner-approved kitten v0 is the current production PET asset. The renderer
// contract stays replaceable so a later art pass can land without changing the
// scheduler/lifecycle architecture. ?us-pet=preview keeps the explicit QA renderer;
// ?us-pet=off is a one-load emergency kill switch.
const PET_ASSET_STATUS='APPROVED';
const PREVIEW_KEY='us:pet:v1:preview';
const STATES=Object.freeze(['idle','walk','rest','react','pet','held','fall','snap']);
const REASONS=Object.freeze(['think','left-for-you','reward','streak','daily-question']);
const TIMING=Object.freeze({
  idle:[2500,7000],   // a natural pause between decisions
  rest:[9000,22000],  // sitting down for a while
  react:1600,         // one short, non-looping gesture
  pet:1400,           // a stroke: lean in, eyes soften, tail answers
  snap:220,           // landing squash after gravity reaches a plane
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
    if(pending&&(state==='react'||state==='pet'||state==='snap')){const again=pending;pending=null;return apply({state:'react',x,reason:again,duration:TIMING.react});}
    apply(decide(state,{x,width,reduced,random}));
  }
  const maxX=()=>Math.max(TIMING.edge,width-TIMING.size-TIMING.edge);
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
      if(x>max||walk&&walk.to>max){
        x=clamp(position(),TIMING.edge,max);walk=null;
        // A held or settling Maudit belongs to the gesture, not to the scheduler.
        if(running&&state!=='held'&&state!=='fall'&&state!=='snap'){state='idle';emit(0);arm(between(random,TIMING.idle));}
      }
    },
    setReduced(next){
      reduced=Boolean(next);
      // Reduced motion never strolls: stop exactly where the pet is.
      if(reduced&&state==='walk'&&running){x=position();walk=null;state='idle';emit(0);arm(between(random,TIMING.idle));}
    },
    react(next){
      if(!running||!REASONS.includes(next))return false;
      // At most one queued reaction; a held/settling Maudit plays it once it lands.
      if(state==='react'||state==='held'||state==='fall'||state==='snap'){pending=next;return true;}
      x=position();walk=null;
      apply({state:'react',x,reason:next,duration:TIMING.react});
      return true;
    },
    // Tap: one affectionate reaction, never while held or settling.
    caress(){
      if(!running||state==='held'||state==='fall'||state==='snap')return false;
      x=position();walk=null;
      apply({state:'pet',x,duration:TIMING.pet});
      return true;
    },
    // Pickup: the autonomous scheduler stops completely while the cat is held.
    hold(){
      if(!running||state==='held'||state==='fall'||state==='snap')return false;
      x=position();walk=null;
      if(timer!==null)cancel(timer);timer=null;
      state='held';reason='';emit(0);
      return true;
    },
    // Legacy/direct settle path used when a drag is cancelled.
    release({x:next,duration=TIMING.snap}={}){
      if(state!=='held')return false;
      if(Number.isFinite(next))x=clamp(Math.round(next),TIMING.edge,maxX());
      state='snap';reason='';emit(0);
      if(running)arm(duration);
      return true;
    },
    // Gravity path: the DOM runtime owns the short airborne timer.
    fall(){
      if(state!=='held')return false;
      state='fall';reason='';emit(0);return true;
    },
    land({x:next,duration=TIMING.snap}={}){
      if(state!=='fall')return false;
      if(Number.isFinite(next))x=clamp(Math.round(next),TIMING.edge,maxX());
      state='snap';reason='';emit(0);
      if(running)arm(duration);
      return true;
    },
    // Restore/plane change: stand at x without strolling there.
    place(next){
      const was=state;
      x=clamp(Math.round(Number(next)||0),TIMING.edge,maxX());walk=null;
      if(was==='walk')state='idle';
      emit(0);
      if(running&&was==='walk')arm(between(random,TIMING.idle));
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

// ---------- Maudit V1: pure interaction rules (no DOM, unit-tested) ----------
const MAUDIT_KEYS=Object.freeze({enabled:'us:maudit:v1:enabled',placement:'us:maudit:v1:placement'});
const GRAVITY=Object.freeze({
  acceleration:2200,
  terminal:1500,
  frame:16,
  maxDt:.034
});
const GESTURE=Object.freeze({
  slop:10,         // px: below this a press is still a tap/hold, never a drag
  hold:260,        // ms: a still press this long picks Maudit up
  pullRatio:1.4,   // a sideways pull (|dx| > 1.4·|dy|) picks up at once; vertical is a scroll
  scruffX:20,      // where the finger holds the cat, in its 40px box
  scruffY:14,
  snapRadius:132,  // px: farther than this from any plane = back where it was
  edgeInset:12,    // keep clear of a card's rounded corners
  minRun:8         // a plane segment must leave at least this much room to stand
});
// Explicit registry: the only edges Maudit may stand on. The nav rim is the
// default; every other plane is the top rim of one stable card of one primary
// page. Geometry is always read from the live DOM, never from fixed pixels.
const PLANES=Object.freeze([
  {id:'nav',page:'',selector:'.nav'},
  {id:'oggi-daily-top',page:'home',selector:'#usDailyRitual'},
  {id:'oggi-priority-top',page:'home',selector:'#usTodayPriorityRegion'},
  {id:'noi-week-board-top',page:'bond',selector:'#noiWeekBoardOpen'},
  {id:'noi-sintonia-top',page:'bond',selector:'#noiHub .noi-hub-card--resonance'},
  {id:'noi-destinations-top',page:'bond',selector:'#noiHub .noi-hub-destinations'},
  {id:'ricordi-conservati-top',page:'moments',selector:'#conservatiEntry'},
  {id:'ricordi-month-top',page:'moments',selector:'#momentsGrid .ricordi-feature'},
  {id:'ricordi-chapters-top',page:'moments',selector:'#ricordiChapters .ricordi-chapter-row'},
  {id:'gioca-daily-top',page:'quiz',selector:'#quizHub .us-gv2-daily'},
  {id:'gioca-pervoi-top',page:'quiz',selector:'#quizHub .us-gv2-pervoi'},
  {id:'gioca-swipe-top',page:'quiz',selector:'#quizHub .us-gv2-game.is-swipe'},
  {id:'gioca-modes-top',page:'quiz',selector:'#quizHub .us-gv2-choose'}
]);
const PLANE_BY_ID=new Map(PLANES.map(plane=>[plane.id,plane]));

// What a press on Maudit has become so far: 'pending' | 'pet' | 'pickup' | 'scroll'.
function classifyPress({type='touch',dx=0,dy=0,elapsed=0,up=false}={}){
  if(Math.hypot(dx,dy)>=GESTURE.slop){
    if(type==='mouse')return 'pickup';
    return Math.abs(dx)>Math.abs(dy)*GESTURE.pullRatio?'pickup':'scroll';
  }
  if(elapsed>=GESTURE.hold)return 'pickup';
  return up?'pet':'pending';
}

// Placement is semantic: a plane id plus a 0..1 position along that plane.
function encodePlacement(plane,x){
  if(!PLANE_BY_ID.has(plane)||!Number.isFinite(x))return null;
  return JSON.stringify({v:1,plane,x:Math.round(clamp(x,0,1)*1000)/1000});
}
function decodePlacement(raw){
  try{
    const value=JSON.parse(raw);
    if(value&&value.v===1&&PLANE_BY_ID.has(value.plane)&&Number.isFinite(value.x))return {plane:value.plane,x:clamp(value.x,0,1)};
  }catch(_){/* corrupt or absent: no placement */}
  return null;
}

// Free standing positions along a rim. `free(x)` says whether a column is clear
// of text/controls; the actor (left edge p) needs its body columns clear.
function freeSegments({left,right,step=6,free,body=[2,38],min=GESTURE.minRun}){
  const runs=[];let run=null;
  const columns=new Map();
  const clearAt=x=>{if(!columns.has(x))columns.set(x,Boolean(free(x)));return columns.get(x);};
  for(let p=Math.ceil(left);p<=right-TIMING.size;p+=step){
    let ok=true;
    for(let c=p+body[0];c<=p+body[1]&&ok;c+=step)ok=clearAt(c);
    ok=ok&&clearAt(p+body[1]);
    if(ok){if(run)run[1]=p;else run=[p,p];}
    else if(run){runs.push(run);run=null;}
  }
  if(run)runs.push(run);
  return runs.filter(([a,b])=>b-a>=min);
}

// Predictable target: the nearest standing spot by weighted distance from
// where the cat's feet were released (vertical distance counts fully).
function choosePlane(foot,candidates,{radius=GESTURE.snapRadius}={}){
  let best=null;
  for(const candidate of candidates||[]){
    for(const [a,b] of candidate.segments||[]){
      const left=clamp(foot.x-TIMING.size/2,a,b);
      const score=Math.hypot((left+TIMING.size/2-foot.x)*.6,candidate.rim-foot.y);
      if(score<=radius&&(!best||score<best.score))best={id:candidate.id,a,b,left,rim:candidate.rim,score};
    }
  }
  return best;
}

function chooseFallPlane(foot,candidates,{epsilon=1}={}){
  const actorLeft=foot.x-TIMING.size/2;
  let best=null;
  for(const candidate of candidates||[]){
    if(!Number.isFinite(candidate?.rim)||candidate.rim<foot.y-epsilon)continue;
    for(const [a,b] of candidate.segments||[]){
      const direct=actorLeft>=a&&actorLeft<=b;
      if(!direct&&candidate.id!=='nav')continue;
      const left=direct?actorLeft:clamp(actorLeft,a,b);
      const drop=Math.max(0,candidate.rim-foot.y);
      if(!best||drop<best.drop||(drop===best.drop&&candidate.id!=='nav'&&best.id==='nav')){
        best={id:candidate.id,a,b,left,rim:candidate.rim,drop};
      }
    }
  }
  return best;
}

function install(w){
  const d=w?.document,api=w?.USPet;
  if(!d?.getElementById||!api)return;
  const layer=d.getElementById('usPetLayer'),actor=layer?.querySelector('.us-pet-actor'),nav=d.querySelector('.nav');
  // The placeholder is never a production fallback: an approved asset needs its own renderer.
  const approved=PET_ASSET_STATUS==='APPROVED'&&renderers.has('sprite');
  const preview=Boolean(layer&&actor&&nav)&&previewRequested(w);
  const disabled=Boolean(layer&&actor&&nav)&&disabledRequested(w);
  const available=Boolean(layer&&actor&&nav&&!disabled&&(approved||preview));
  // Device-local preference (Settings → Maudit). Same safe localStorage pattern
  // as the PET preview flag and UsFeedback: a blocked storage keeps the default.
  const store={
    get(key){try{return w.localStorage?.getItem(key)??null;}catch(_){return null;}},
    set(key,value){try{w.localStorage?.setItem(key,value);}catch(_){/* stays in memory */}}
  };
  const preferred=()=>store.get(MAUDIT_KEYS.enabled)!=='0';
  let runtime=null;
  const noop={react:()=>false,useRenderer:()=>false,blockers:()=>[]};
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
    const drop=key=>{if(timers.has(key)){w.clearTimeout(timers.get(key));timers.delete(key);}};
    const clock=()=>(typeof w.performance?.now==='function'?w.performance.now():Date.now());
    let view=null,host=null,facing='',pageHidden=false;
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
    if(!useRenderer(preview?'placeholder':approved?'sprite':'placeholder'))return false;

    // ---------- geometry ----------
    const viewport=()=>({w:d.documentElement?.clientWidth||w.innerWidth||0,h:w.innerHeight||0});
    const scrollY=()=>Number(w.scrollY)||0;
    const scrollX=()=>Number(w.scrollX)||0;
    const rectOf=node=>node?.getBoundingClientRect?.()||null;
    const cssPx=name=>{try{return parseFloat(w.getComputedStyle(d.documentElement).getPropertyValue(name))||0;}catch(_){return 0;}};
    // Between the top chrome and the nav: the only vertical space a card plane may
    // use. The top chrome scrolls with the content, the nav is fixed, so one
    // measurement (refreshed on every evaluation) serves every scroll event.
    let bandFrame=null;
    function measureBand(){
      const chrome=rectOf(d.querySelector('.top'));
      bandFrame={chromeDoc:chrome?chrome.bottom+scrollY():0,safeTop:cssPx('--us-safe-top'),navTop:rectOf(nav)?.top||viewport().h};
      return bandFrame;
    }
    function band(frame=measureBand()){
      return {top:Math.max(frame.chromeDoc-scrollY(),frame.safeTop)+2,bottom:frame.navTop-6};
    }
    const activePage=()=>d.querySelector?.('.page.active')?.id||'';
    function navGeometry(){
      const rect=rectOf(nav);
      if(!rect?.width)return null;
      const track=rect.width-28;
      return {rect,track,min:rect.left+14+TIMING.edge,max:rect.left+14+Math.max(TIMING.edge,track-TIMING.size-TIMING.edge),rim:rect.top+3};
    }
    function measure(){
      const rect=rectOf(nav);
      if(!rect?.width)return;
      layer.style.setProperty('--us-pet-track',`${Math.round(rect.width)}px`);
      layer.style.setProperty('--us-pet-nav-h',`${Math.round(rect.height)}px`);
      if(!current||current.kind==='nav')pet.setTrack(rect.width-28); // keep clear of the nav's rounded ends
    }
    // A sample point is free when nothing the user reads or taps is there:
    // no text, media, small control or small painted element. Large cards
    // (whole-card buttons) are surfaces. PET nodes are looked through.
    function sampler(){
      const {w:vw,h:vh}=viewport(),paint=new Map(),texts=new Map();
      const textRects=el=>{
        if(texts.has(el))return texts.get(el);
        const rects=[];
        for(const node of el.childNodes||[]){
          if(node.nodeType!==3||!node.nodeValue.trim())continue;
          try{const range=d.createRange();range.selectNodeContents(node);rects.push(...range.getClientRects());}catch(_){rects.push(rectOf(el));}
        }
        texts.set(el,rects);return rects;
      };
      const painted=el=>{
        if(paint.has(el))return paint.get(el);
        let value=false;
        try{const s=w.getComputedStyle(el);value=s.backgroundImage!=='none'||!/rgba\(.*,\s*0\)|transparent/.test(s.backgroundColor)||parseFloat(s.borderTopWidth)>0;}catch(_){}
        paint.set(el,value);return value;
      };
      return (x,y)=>{
        if(x<1||y<1||x>=vw-1||y>=vh-1)return false;
        let el=d.elementFromPoint?.(x,y);
        if(el&&layer.contains(el))el=[...(d.elementsFromPoint?.(x,y)||[])].find(node=>!layer.contains(node))||null;
        if(!el)return false;
        if(el===d.body||el===d.documentElement||el.classList?.contains('page'))return true;
        if(el.closest?.('.nav,.top,svg')||el.matches?.('img,svg,canvas,video,input,textarea,select,progress,[role="progressbar"]'))return false;
        // Text blocks only where its glyph lines are (padding beside a short line is free).
        if(textRects(el).some(r=>x>=r.left-6&&x<=r.right+6&&y>=r.top-4&&y<=r.bottom+4))return false;
        const box=rectOf(el);
        if(box&&box.width*box.height<6000&&painted(el))return false;
        const control=el.closest?.('button,a[href],label,[role="button"],[role="tab"],[role="switch"],[role="link"]');
        if(control){const r=rectOf(control);if(!r||r.width<160||r.height<56)return false;}
        return true;
      };
    }
    // Live geometry of one registered page plane, or null when it is not a
    // believable place to stand right now.
    function planeGeometry(def,free=sampler()){
      if(!def||!def.page||def.page!==activePage())return null;
      const page=d.getElementById(def.page),anchor=d.querySelector(def.selector);
      if(!page||!anchor||!page.contains(anchor)||anchor.closest?.('[hidden],[inert]'))return null;
      const rect=rectOf(anchor),{w:vw}=viewport(),b=band();
      if(!rect||rect.width<96||rect.height<24)return null;
      if(rect.top-TIMING.size<b.top||rect.top>b.bottom)return null;
      try{if(w.getComputedStyle(anchor).visibility!=='visible')return null;}catch(_){}
      // The rim itself must be what the user sees there (not covered by a notice or the nav).
      const seen=[...(d.elementsFromPoint?.(rect.left+rect.width/2,rect.top+4)||[])].find(node=>!layer.contains(node));
      if(seen&&!anchor.contains(seen))return null;
      const left=Math.max(rect.left+GESTURE.edgeInset,4),right=Math.min(rect.right-GESTURE.edgeInset,vw-4);
      if(right-left<TIMING.size+GESTURE.minRun)return null;
      // Rows every 5px through the cat's height: thin bars and labels are not missed.
      const ys=[4,9,14,19,24,29,34].map(dy=>rect.top-dy);
      const segments=freeSegments({left,right,free:x=>ys.every(y=>free(x,y))});
      if(!segments.length)return null;
      return {id:def.id,rim:rect.top,rimDoc:rect.top+scrollY(),left,right,segments};
    }

    // ---------- placement ----------
    let current=null; // {kind:'nav'} | {kind:'page',id,page,a,b,rimDoc,left,right}
    const readPlacement=()=>decodePlacement(store.get(MAUDIT_KEYS.placement));
    function navTarget(normalized){
      const geo=navGeometry();
      if(!geo)return {kind:'nav',actorLeft:null};
      const fallback=current?.kind==='nav'?geo.min+pet.snapshot().x-TIMING.edge:null;
      const actorLeft=Number.isFinite(normalized)?geo.min+(geo.max-geo.min)*normalized:fallback;
      return {kind:'nav',actorLeft:actorLeft===null?null:clamp(actorLeft,geo.min,geo.max)};
    }
    function pageTarget(geo,actorLeft){
      let pick=geo.segments[0],distance=Infinity;
      for(const seg of geo.segments){
        const value=actorLeft<seg[0]?seg[0]-actorLeft:actorLeft>seg[1]?actorLeft-seg[1]:0;
        if(value<distance){distance=value;pick=seg;}
      }
      const page=PLANE_BY_ID.get(geo.id).page;
      return {kind:'page',id:geo.id,page,a:pick[0],b:pick[1],rimDoc:geo.rimDoc,left:geo.left,right:geo.right,actorLeft:clamp(actorLeft,pick[0],pick[1])};
    }
    // Where Maudit should be right now: the saved plane when it belongs to the
    // active page and is valid; otherwise the nav rim (temporary, the saved
    // placement is left untouched).
    function resolve(){
      const saved=readPlacement();
      if(saved&&saved.plane!=='nav'){
        const geo=planeGeometry(PLANE_BY_ID.get(saved.plane));
        if(geo)return pageTarget(geo,geo.left+(geo.right-geo.left-TIMING.size)*saved.x);
      }
      return navTarget(saved?.plane==='nav'?saved.x:null);
    }
    function onScroll(){
      if(current?.kind!=='page')return;
      // No layout read here: cached band + scroll offset only.
      const rim=current.rimDoc-scrollY(),b=band(bandFrame||measureBand());
      const off=rim-TIMING.size<b.top||rim>b.bottom;
      if(off)layer.dataset.petOffstage='';else delete layer.dataset.petOffstage;
      if(off&&press&&!press.picked)endPress();
    }
    let scrollBound=false;
    const scrollListener=()=>onScroll();
    function bindScroll(next){
      if(next===scrollBound)return;
      scrollBound=next;
      if(next)w.addEventListener('scroll',scrollListener,{passive:true});else w.removeEventListener?.('scroll',scrollListener,{passive:true});
    }
    // Applies the layer frame for a target and returns the machine x for its actor left.
    function frame(target){
      current=target;
      if(target.kind==='nav'){
        layer.dataset.petPlane='nav';
        delete layer.dataset.petOffstage;
        ['--us-pet-plane-left','--us-pet-plane-top','--us-pet-plane-w'].forEach(name=>layer.style.removeProperty?.(name));
        bindScroll(false);
        measure();
        const geo=navGeometry();
        return target.actorLeft===null||!geo?pet.snapshot().x:target.actorLeft-geo.rect.left-14;
      }
      const track=target.b-target.a+TIMING.size+2*TIMING.edge;
      layer.dataset.petPlane=target.id;
      layer.style.setProperty('--us-pet-plane-left',`${Math.round(target.a-14-TIMING.edge+scrollX())}px`);
      layer.style.setProperty('--us-pet-plane-top',`${Math.round(target.rimDoc-TIMING.size)}px`);
      layer.style.setProperty('--us-pet-plane-w',`${Math.round(track+28)}px`);
      pet.setTrack(track);
      bindScroll(true);onScroll();
      return target.actorLeft-target.a+TIMING.edge;
    }
    // Viewport position of the actor's box for the current frame (no offsets).
    function actorBase(){
      const x=pet.snapshot().x;
      if(current?.kind==='page')return {left:current.a-TIMING.edge+x,top:current.rimDoc-TIMING.size-scrollY()};
      const geo=navGeometry();
      return geo?{left:geo.rect.left+14+x,top:geo.rect.top+3-TIMING.size}:{left:0,top:0};
    }
    function offset(dx,dy){
      layer.style.setProperty('--us-pet-dx',`${Math.round(dx)}px`);
      layer.style.setProperty('--us-pet-dy',`${Math.round(dy)}px`);
    }
    // FLIP: the actor keeps its on-screen position while its frame changes,
    // then travels the remaining offset with one short CSS transition.
    function flip(from){
      const to=actorBase();
      layer.dataset.petFlip='';
      offset(from.left-to.left,from.top-to.top);
      void layer.offsetWidth;
      delete layer.dataset.petFlip;
      offset(0,0);
    }
    function settle(target,from){
      const x=frame(target),state=pet.snapshot().state;
      if(state==='held')pet.release({x});
      else if(state==='fall')pet.land({x});
      else pet.place(x);
      if(from)flip(from);else offset(0,0);
    }
    function arrive(target){
      settle(target,null);
      delete layer.dataset.petArrive;void layer.offsetWidth;layer.dataset.petArrive='';
      later('arrive',()=>{delete layer.dataset.petArrive;},260);
    }
    const samePlace=(a,b)=>a&&b&&a.kind===b.kind&&(a.kind==='nav'||a.id===b.id&&a.a===b.a&&a.b===b.b&&Math.round(a.rimDoc)===Math.round(b.rimDoc));
    // Re-evaluated on page change, page resize and viewport resize only.
    function evaluate(){
      if(press?.picked||falling)return;
      measure();
      const target=resolve();
      if(samePlace(target,current))return;
      if(target.kind==='nav'&&current?.kind==='nav'&&target.actorLeft===null)return;
      if(current?.kind==='page'&&target.kind==='page'&&target.id===current.id){
        // Same card, its rim moved (content loaded above it): follow it quietly.
        const left=actorBase().left;
        settle({...target,actorLeft:left>=target.a&&left<=target.b?left:target.actorLeft},null);
        return;
      }
      if(target.kind==='nav'&&current?.kind==='nav')return;
      arrive(target);
    }

    // ---------- gesture: tap / hold / pull / drag ----------
    const hit=d.createElement('span');
    hit.className='us-pet-hit';
    let press=null,falling=null;
    function endPress(){
      drop('hold');
      const id=press?.id;press=null;
      if(id!==undefined){try{if(hit.hasPointerCapture?.(id))hit.releasePointerCapture(id);}catch(_){}}
    }
    function bounds(){
      const {w:vw,h:vh}=viewport(),navGeo=navGeometry();
      const viewportFloor=vh-Math.max(4,cssPx('--us-safe-bottom'))-TIMING.size;
      const navFloor=navGeo?navGeo.rim-TIMING.size:viewportFloor;
      return {left:4,right:vw-TIMING.size-4,top:Math.max(4,cssPx('--us-safe-top')+2),bottom:Math.min(viewportFloor,navFloor)};
    }
    function follow(px,py){
      const g=press.drag,b=g.bounds;
      const left=clamp(px-GESTURE.scruffX,b.left,b.right),top=clamp(py-GESTURE.scruffY,b.top,b.bottom);
      g.last={left,top};
      offset(left-g.base.left,top-(g.base.top-(current?.kind==='page'?scrollY()-g.scroll:0)));
    }
    function pickup(px,py){
      if(!press||press.picked)return;
      if(blockers(d,layer,{pageHidden}).length||!pet.hold()){endPress();return;}
      drop('hold');
      press.picked=true;
      try{hit.setPointerCapture?.(press.id);}catch(_){}
      press.drag={from:{...current,actorLeft:actorBase().left},base:actorBase(),scroll:scrollY(),bounds:bounds(),last:null};
      follow(px,py);
      w.UsFeedback?.tap?.();
    }
    function fallCandidates(){
      const free=sampler(),list=[],page=activePage();
      for(const def of PLANES){
        if(def.page!==page)continue;
        const geo=planeGeometry(def,free);
        if(geo)list.push({...geo,rim:geo.rim});
      }
      const navGeo=navGeometry();
      if(navGeo)list.push({id:'nav',rim:navGeo.rim,segments:[[navGeo.min,navGeo.max]]});
      return list;
    }
    function targetFromPick(pick,list){
      if(!pick)return null;
      if(pick.id==='nav')return {kind:'nav',actorLeft:pick.left};
      const geo=list.find(item=>item.id===pick.id);
      return geo?pageTarget({...geo,segments:[[pick.a,pick.b]]},pick.left):null;
    }
    function persistTarget(target){
      if(target?.kind==='nav'){
        const geo=navGeometry();
        if(geo)store.set(MAUDIT_KEYS.placement,encodePlacement('nav',(target.actorLeft-geo.min)/Math.max(1,geo.max-geo.min)));
      }else if(target?.kind==='page'){
        store.set(MAUDIT_KEYS.placement,encodePlacement(target.id,(target.actorLeft-target.left)/Math.max(1,target.right-target.left-TIMING.size)));
      }
    }
    function finishFall(){
      const f=falling;if(!f)return;
      drop('fall');falling=null;
      const x=frame(f.target);
      if(!pet.land({x}))pet.place(x);
      offset(0,0);
      persistTarget(f.target);
      w.UsFeedback?.landing?.();
    }
    function fallStep(){
      const f=falling;if(!f)return;
      if(blockers(d,layer,{pageHidden}).length){cancelFall({restore:false});pet.stop();return;}
      const now=clock(),dt=Math.min(GRAVITY.maxDt,Math.max(.001,(now-f.at)/1000));
      f.at=now;f.velocity=Math.min(GRAVITY.terminal,f.velocity+GRAVITY.acceleration*dt);
      f.top=Math.min(f.targetTop,f.top+f.velocity*dt);
      f.last={left:f.left,top:f.top};
      const base=actorBase();offset(f.left-base.left,f.top-base.top);
      if(f.top>=f.targetTop-.25){finishFall();return;}
      later('fall',fallStep,GRAVITY.frame);
    }
    function startFall(g,last){
      const foot={x:last.left+TIMING.size/2,y:last.top+TIMING.size};
      const list=fallCandidates(),pick=chooseFallPlane(foot,list);
      const target=targetFromPick(pick,list)||navTarget(null);
      if(!target||!pet.fall()){settle(restorable(g.from),last);return;}
      const rim=pick?.rim??navGeometry()?.rim??(last.top+TIMING.size);
      falling={from:g.from,target,left:last.left,top:last.top,targetTop:rim-TIMING.size,velocity:0,at:clock(),last:{...last}};
      if(pet.snapshot().reduced||falling.targetTop<=falling.top){falling.top=falling.targetTop;finishFall();return;}
      later('fall',fallStep,GRAVITY.frame);
    }
    function release(){
      const g=press.drag;endPress();
      const last=g.last||g.base;
      startFall(g,last);
    }
    function cancelFall({restore=true}={}){
      if(!falling)return;
      const f=falling;falling=null;drop('fall');
      if(restore&&pet.snapshot().state==='fall')settle(restorable(f.from),f.last);
      else offset(0,0);
    }
    // Where an interrupted drop goes back to: the previous plane when it still
    // exists, otherwise the nav rim.
    function restorable(from){
      if(from?.kind==='page'){
        const geo=planeGeometry(PLANE_BY_ID.get(from.id));
        if(geo)return pageTarget(geo,from.actorLeft);
      }
      return navTarget(null);
    }
    function cancelDrag({animate=false}={}){
      if(!press)return;
      const g=press.drag;endPress();
      if(!g)return;
      const target=restorable(g.from);
      settle(target,animate?(g.last||g.base):null);
    }
    function onDown(event){
      if(press||falling||event.isPrimary===false||event.pointerType==='mouse'&&event.button!==0)return;
      if(blockers(d,layer,{pageHidden}).length||!pet.snapshot().running||'petOffstage' in layer.dataset)return;
      if(event.pointerType==='mouse')event.preventDefault?.(); // no text selection, no native drag
      press={id:event.pointerId,type:event.pointerType||'touch',x:event.clientX,y:event.clientY,at:clock(),picked:false,drag:null};
      try{hit.setPointerCapture?.(press.id);}catch(_){}
      // The hold threshold itself: a still press that lasts GESTURE.hold picks up.
      later('hold',()=>{if(press&&!press.picked)pickup(press.x,press.y);},GESTURE.hold);
    }
    function onMove(event){
      if(!press||event.pointerId!==press.id)return;
      if(press.picked){follow(event.clientX,event.clientY);return;}
      const kind=classifyPress({type:press.type,dx:event.clientX-press.x,dy:event.clientY-press.y,elapsed:clock()-press.at});
      if(kind==='pickup')pickup(event.clientX,event.clientY);
      else if(kind==='scroll')endPress(); // vertical intent: the page scrolls, Maudit stays
    }
    function onUp(event){
      if(!press||event.pointerId!==press.id)return;
      if(press.picked){release();return;}
      const kind=classifyPress({type:press.type,dx:event.clientX-press.x,dy:event.clientY-press.y,elapsed:clock()-press.at,up:true});
      endPress();
      if(kind==='pet')pet.caress();
    }
    function onCancel(event){
      if(!press||event.pointerId!==press.id)return;
      if(press.picked)cancelDrag({animate:true});else endPress();
    }
    on(hit,'pointerdown',onDown);
    on(hit,'pointermove',onMove);
    on(hit,'pointerup',onUp);
    on(hit,'pointercancel',onCancel);
    on(hit,'lostpointercapture',onCancel);
    // The page swipe (app.js) must not see a gesture that started on Maudit,
    // and a held cat never scrolls the page.
    on(hit,'touchstart',event=>event.stopPropagation(),{passive:true});
    on(hit,'touchmove',event=>{event.stopPropagation();if(press?.picked&&event.cancelable)event.preventDefault();},{passive:false});
    on(hit,'contextmenu',event=>event.preventDefault());
    layer.appendChild?.(hit);

    // ---------- lifecycle ----------
    // start()/stop() are idempotent: repeated mutations restart at most once, and
    // stop() drops any queued reaction, so nothing accumulates while blocked.
    // A blocker during a drag ends it first: no capture, no held pose survives.
    function sync(){
      if(blockers(d,layer,{pageHidden}).length){cancelDrag();cancelFall({restore:false});pet.stop();}
      else pet.start();
    }
    layer.hidden=false;
    const observers=[];
    let pageId=activePage();
    let pageNode=null,watchPage=()=>{};
    if(typeof w.ResizeObserver==='function'){
      const navObserver=new w.ResizeObserver(()=>{if(falling)cancelFall();measure();if(current?.kind==='page')later('settle',evaluate,160);});
      navObserver.observe(nav);observers.push(navObserver);
      // Page content height (async loads, sections) can move a card rim.
      const pageObserver=new w.ResizeObserver(()=>{if(falling)cancelFall();later('settle',evaluate,160);});
      observers.push(pageObserver);
      watchPage=()=>{const next=d.getElementById(pageId);if(next===pageNode)return;if(pageNode)pageObserver.unobserve(pageNode);pageNode=next;if(next)pageObserver.observe(next);};
      watchPage();
    }
    on(w,'resize',()=>{cancelDrag();cancelFall();measure();later('settle',evaluate,160);},{passive:true});
    const foundation=w.UsUiFoundation;
    pet.setReduced(foundation?.isReducedMotion?.()||false);
    const unMotion=foundation?.onMotionPreferenceChange?.(value=>pet.setReduced(value));
    if(typeof unMotion==='function')cleanups.push(unMotion);
    on(d,'visibilitychange',sync);
    on(w,'pagehide',()=>{pageHidden=true;sync();});
    on(w,'pageshow',()=>{pageHidden=false;sync();});
    // Bounded observation: only the nodes and attributes the blockers read. No subtree, no polling.
    if(typeof w.MutationObserver==='function'){
      const observer=new w.MutationObserver(sync);
      const watch=(node,attributes)=>{if(node)observer.observe(node,{attributes:true,attributeFilter:attributes});};
      watch(d.body,['class','data-us-surface']);
      watch(layer,['inert']);
      watch(d.getElementById('homeHero'),['class']);
      (d.querySelectorAll?.('.auth-overlay')||[]).forEach(node=>watch(node,['class']));
      observers.push(observer);
      // Page changes: the class of the few primary <main class="page"> nodes only.
      const pages=[...(d.querySelectorAll?.('.page')||[])];
      if(pages.length){
        const pageObserver=new w.MutationObserver(()=>{
          const next=activePage();
          if(next===pageId)return;
          pageId=next;
          cancelDrag();
          cancelFall();
          watchPage();
          // The old page's card is gone: stand on the nav until the new page settles.
          if(current?.kind==='page')settle(navTarget(null),null);
          later('settle',evaluate,320);
        });
        pages.forEach(node=>pageObserver.observe(node,{attributes:true,attributeFilter:['class']}));
        observers.push(pageObserver);
      }
    }
    // Event interface for features that live in other files. Ignored while blocked.
    // The observer stops the scheduler asynchronously; reactions must not wait for
    // it, so the canonical decision is evaluated right here, before anything changes.
    function react(reason){
      if(blockers(d,layer,{pageHidden}).length)return false;
      return pet.react(reason);
    }
    on(w,'us:pet',event=>{if(event?.detail?.type==='react')react(event.detail.reason);});
    measure();
    settle(resolve(),null);
    runtime={
      pet,react,useRenderer,
      blockers:()=>blockers(d,layer,{pageHidden}),
      setAppearance(next={}){applyAppearance(next);view?.setAppearance?.(appearance);},
      snapshot:()=>pet.snapshot(),
      placement:()=>current&&{...current,saved:readPlacement()},
      planes:()=>{const free=sampler();return PLANES.filter(def=>def.page&&def.page===activePage()).map(def=>planeGeometry(def,free)).filter(Boolean);},
      inspect:()=>({mounted:true,listeners:cleanups.length+(scrollBound?1:0),observers:observers.length,timers:timers.size,pressing:Boolean(press),held:Boolean(press?.picked),falling:Boolean(falling),hit:hit.isConnected!==false&&Boolean(hit.parentNode)}),
      evaluate,
      destroy(){
        cancelDrag();
        cancelFall({restore:false});
        pet.stop();
        timers.forEach(id=>w.clearTimeout(id));timers.clear();
        observers.forEach(observer=>observer.disconnect?.());
        cleanups.splice(0).forEach(fn=>{try{fn();}catch(_){}});
        bindScroll(false);
        hit.remove?.();
        try{view?.destroy?.();}catch(error){console.warn('[US PET] renderer destroy',error);}
        host?.remove?.();view=null;host=null;
        layer.hidden=true;
        ['petState','petFacing','petReason','petRenderer','petPlane','petOffstage','petFlip','petArrive'].forEach(key=>delete layer.dataset[key]);
        ['--us-pet-x','--us-pet-move','--us-pet-dx','--us-pet-dy','--us-pet-plane-left','--us-pet-plane-top','--us-pet-plane-w'].forEach(name=>layer.style.removeProperty?.(name));
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
    api.setAppearance=runtime?runtime.setAppearance:applyAppearance;
    api.snapshot=runtime?runtime.snapshot:()=>({state:'disabled',running:false});
    api.placement=runtime?runtime.placement:()=>null;
    api.planes=runtime?runtime.planes:()=>[];
    api.inspect=runtime?runtime.inspect:()=>({mounted:false,listeners:0,observers:0,timers:0,pressing:false,held:false,falling:false,hit:Boolean(layer?.querySelector?.('.us-pet-hit'))});
    api.evaluate=runtime?runtime.evaluate:()=>{};
  }
  // Settings → Maudit. Off unmounts everything: renderer, hit target, timers,
  // observers and listeners. On mounts again and restores the saved spot.
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
  PET_ASSET_STATUS,STATES,REASONS,TIMING,decide,createPet,registerRenderer,canMount,computeBlockers:blockers,install,
  MAUDIT_KEYS,GRAVITY,GESTURE,PLANES,classifyPress,encodePlacement,decodePlacement,freeSegments,choosePlane,chooseFallPlane,
  enabled:false,
  react:()=>false,
  useRenderer:()=>false,
  blockers:()=>[],
  setAppearance:()=>{},
  snapshot:()=>null
};
});
