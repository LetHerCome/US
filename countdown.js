(function(global,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  global.USCountdown=api;api.install(global);
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const STYLES=Object.freeze([
  // Ids are validated by save_countdown_oggi_v1: names and art may evolve, ids may not.
  {id:'editorial',name:'Editoriale',note:'Il tempo, in copertina.'},
  {id:'signal',name:'Partenze',note:'Come un tabellone in stazione.'},
  {id:'glass',name:'Vetro',note:'Una lente sulla vostra foto.'},
  {id:'aurora',name:'Aurora',note:'La luce dentro le cifre.',reward:'frame_aurora',level:4},
  {id:'orbit',name:'Orbita',note:'Un giro di luce ogni minuto.',reward:'ring_orbit',level:9},
  {id:'chrome',name:'Cromo',note:'Il tempo diventa materia.',reward:'frame_chrome',level:12}
]);
const civil=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'});
function dayNumber(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return NaN;
  const date=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+date)&&date.toISOString().slice(0,10)===value?+date/86400000:NaN;
}
function todayNumber(now){const p=civil.formatToParts(now);const v=t=>p.find(e=>e.type===t).value;return dayNumber(`${v('year')}-${v('month')}-${v('day')}`);}
function relationship(started,now=new Date()){
  const days=todayNumber(now)-dayNumber(started);
  return Number.isFinite(days)&&days>=0?{value:String(days),unit:days===1?'giorno':'giorni',label:''}:null;
}
function display(item,now=new Date()){
  if(!item)return null;
  if(item.mode==='days'){
    const delta=dayNumber(item.target)-todayNumber(now);if(!Number.isFinite(delta))return null;
    const n=Math.max(0,delta);return {value:String(n),unit:n===1?'giorno':'giorni',label:delta<=0?'Ci siamo':''};
  }
  if(item.mode!=='clock'||typeof item.target!=='string'||!item.target)return null;
  const delta=+new Date(item.target)-(+now);if(!Number.isFinite(delta))return null;
  const seconds=Math.max(0,Math.ceil(delta/1000)),days=Math.floor(seconds/86400);
  const pad=n=>String(n).padStart(2,'0');const clock=`${pad(Math.floor(seconds/3600)%24)}:${pad(Math.floor(seconds/60)%60)}:${pad(seconds%60)}`;
  return days?{value:String(days),unit:days===1?'giorno':'giorni',label:clock}:{value:clock,unit:'',label:delta<=0?'Ci siamo':''};
}
function available(id,progression){const s=STYLES.find(s=>s.id===id);return Boolean(s&&(!s.reward||progression?.rewards?.some(r=>r.id===s.reward&&r.unlocked)));}

function install(w){
  const d=w.document,$=id=>d.getElementById(id),hero=$('homeHero'),root=$('usCountdownSheet'),surface=$('usCountdownDisplay');
  if(!hero||!root||!surface)return;
  let state=null,owner='',generation=0,loading=null,busy=false,draft=null,timer=null,lastAttempt=0,suspendedOwner='';
  let originalInput='',originalTarget=null,originalMode='';
  let pendingControls=null;
  // True once the user changed anything in the open editor. A late server
  // answer may refresh an untouched editor, never replace the user's edits.
  let touched=false;
  const key=()=>w.usProfile?`${w.usProfile.id}:${w.usProfile.couple_id}`:'';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const progression=()=>w.USProgression?.getState?.();
  const opened=()=>root.classList.contains('open');
  const status=message=>{$('usCountdownStatus').textContent=message;};
  const copy=()=>({items:(state?.items||[]).map(e=>({...e})),active_id:state?.active_id??null,together_style:state?.together_style||'editorial'});
  function restoreControls(){pendingControls?.forEach((disabled,control)=>control.disabled=disabled);pendingControls=null;}
  function clear(suspend=false){generation++;restoreControls();owner=key();suspendedOwner=suspend?owner:'';state=null;loading=null;busy=false;draft=null;lastAttempt=0;root.removeAttribute('aria-busy');close();paint();}
  function selected(){
    if(!state)return null;
    if(state.active_id==='together')return relationship(state.started_on)?{title:'Insieme da',style:state.together_style,view:relationship(state.started_on)}:null;
    const e=state.items?.find(e=>e.id===state.active_id);return e?{...e,view:display(e)}:null;
  }
  function markup(view,title,style){
    if(!view)return '';
    return `<span class="us-countdown-art" data-countdown-style="${esc(style)}" data-countdown-clock="${view.value.includes(':')}"><span class="us-countdown-deco" aria-hidden="true"><i></i></span><span class="us-countdown-title">${esc(title)}</span><span class="us-countdown-number" aria-hidden="true">${[...view.value].map(c=>`<span class="us-countdown-digit${/\d/.test(c)?'':' is-sep'}">${esc(c)}</span>`).join('')}</span><span class="us-countdown-unit">${esc(view.unit)}</span><span class="us-countdown-sub">${esc(view.label)}</span></span>`;
  }
  function tick(){
    if(key()!==owner){clear();if(key())hydrate();return;}
    const e=selected(),view=e?.view;
    const shown=Boolean(view&&available(e.style,progression())&&!hero.classList.contains('is-empty'));
    surface.hidden=!shown;hero.toggleAttribute('data-us-countdown',shown);
    if(!shown)return;
    surface.setAttribute('aria-label',`${e.title}, ${view.value} ${view.unit} ${view.label}. Modifica countdown`);
    const signature=`${state.active_id}:${e.style}:${view.value.length}:${e.title}`;
    if(surface.dataset.signature!==signature){surface.innerHTML=markup(view,e.title,e.style);surface.dataset.signature=signature;}
    else{
      const digits=surface.querySelectorAll('.us-countdown-digit');
      [...view.value].forEach((c,i)=>{if(digits[i].textContent!==c){digits[i].textContent=c;w.UsUiFoundation?.playOnce?.(digits[i],'is-changing',380);}});
      surface.querySelector('.us-countdown-unit').textContent=view.unit;
      surface.querySelector('.us-countdown-sub').textContent=view.label;
    }
    const art=surface.querySelector('.us-countdown-art');if(art){art.dataset.countdownClock=String(view.value.includes(':'));if(e.style==='orbit')sweep(art);}
  }
  // Orbita: the light advances one tick per real second. Any jump (first paint,
  // return from background, hour wrap) is applied without a transition.
  function sweep(art){const s=Math.floor(Date.now()/1000)%3600,prev=Number(art.dataset.sweep);art.toggleAttribute('data-sweep-jump',s!==prev+1);art.dataset.sweep=String(s);art.style.setProperty('--us-cd-sweep',`${s*6}deg`);}
  function paintList(){
    const together=relationship(state?.started_on);
    const entries=[{id:'together',title:'Insieme da',detail:together?`${together.value} ${together.unit}`:'Imposta la data in Noi → Impostazioni',disabled:!together},...(state?.items||[]).map(e=>({id:e.id,title:e.title,detail:[display(e)?.value,display(e)?.unit].filter(Boolean).join(' ')}))];
    $('usCountdownList').innerHTML=entries.map(e=>`<div class="us-countdown-row"><button type="button" data-countdown-select="${esc(e.id)}" aria-pressed="${state?.active_id===e.id}" ${busy||e.disabled||!state?'disabled':''}><span><b>${esc(e.title)}</b><small>${esc(e.detail)}</small></span><span class="us-countdown-check" aria-hidden="true">${state?.active_id===e.id?'●':'○'}</span></button><button type="button" class="us-countdown-edit" data-countdown-edit="${esc(e.id)}" aria-label="Modifica ${esc(e.title)}" ${busy||e.disabled||!state?'disabled':''}><span class="us-icon" data-us-icon="pencil" aria-hidden="true"></span></button></div>`).join('');
    $('usCountdownHide').setAttribute('aria-pressed',String(state?.active_id===null));
    $('usCountdownNew').disabled=busy||!state||state.items.length>=12;
    $('usCountdownHide').disabled=busy||!state;
  }
  function editorTarget(){
    const input=$('usCountdownDate'),value=input.value;
    if(!value||!input.validity.valid)return null;
    // Preserve the exact server instant when only title/style changed: a local
    // datetime cannot encode a DST fold offset and the input omits seconds.
    if(value===originalInput&&draft.mode===originalMode&&originalTarget)return originalTarget;
    if(draft.mode==='days')return Number.isFinite(dayNumber(value))?value:null;
    const parsed=new Date(value);if(!Number.isFinite(+parsed))return null;
    const local=new Date(+parsed-parsed.getTimezoneOffset()*60000).toISOString().slice(0,16);
    if(local!==value.slice(0,16))return null; // nonexistent civil time in a DST gap
    return parsed.toISOString();
  }
  function preview(){
    if(!draft)return;
    const target=editorTarget();
    const view=draft.id==='together'?relationship(state?.started_on):display({...draft,target});
    const actualTitle=draft.id==='together'?'Insieme da':$('usCountdownTitle').value.trim();
    const title=actualTitle||'Il nostro momento';
    $('usCountdownPreview').innerHTML=markup(view||{value:'12',unit:'giorni',label:''},title,draft.style);
    $('usCountdownSave').disabled=busy||!view||!actualTitle||!available(draft.style,progression());
  }
  function paint(){tick();if(opened())paintList();}
  async function hydrate(){
    if(!key()||key()===suspendedOwner||typeof sb==='undefined')return null;
    if(key()!==owner)clear();
    if(loading)return loading;
    lastAttempt=Date.now();
    const token=generation,identity=owner;
    const task=(async()=>{
      try{const {data,error:err}=await sb.rpc('get_countdown_oggi_v1');
        if(token!==generation||key()!==identity)return null;
        if(err||!data||!Array.isArray(data.items))throw err||new Error('invalid_countdown_state');
        if(state&&data.version<state.version)return state;
        state=data;status('');paint();w.dispatchEvent?.(new CustomEvent('us:countdown-updated'));return data;
      }catch(err){if(token===generation&&key()===identity){status('Countdown non disponibile ora. Riprova.');paint();}return null;}
    })();loading=task;try{return await task;}finally{if(loading===task)loading=null;}
  }
  async function persist(next){
    if(busy||!state||key()!==owner)return false;
    busy=true;const token=generation,identity=owner;status('');root.setAttribute('aria-busy','true');
    const controls=new Map();
    root.querySelectorAll('button,input,select').forEach(control=>{
      if(control.hasAttribute('data-us-modal-close'))return;
      controls.set(control,control.disabled);control.disabled=true;
    });
    pendingControls=controls;
    try{
      const {data,error:err}=await sb.rpc('save_countdown_oggi_v1',{next_state:next,expected_version:state.version});
      if(token!==generation||key()!==identity)return false;
      if(err)throw err;if(!data||!Array.isArray(data.items))throw new Error('invalid_countdown_state');
      state=data;lastAttempt=Date.now();w.UsFeedback?.success?.();paint();w.dispatchEvent?.(new CustomEvent('us:countdown-updated'));return true;
    }catch(err){
      if(token!==generation||key()!==identity)return false;
      if(err?.code==='40001'||/countdown_conflict/.test(err?.message||'')){await hydrate();status('È cambiato sull’altro telefono. Le tue modifiche sono qui: controlla e salva di nuovo.');}
      else status('Non salvato. Controlla la connessione e riprova.');return false;
    }finally{
      if(token===generation){busy=false;root.removeAttribute('aria-busy');restoreControls();paintList();if(draft)preview();}
    }
  }
  function editor(id){
    if(busy||!state)return;
    const e=state.items.find(e=>e.id===id);
    draft=id==='together'?{id,style:state.together_style,mode:'days'}:e?{...e}:{id:w.crypto.randomUUID(),title:'',mode:'days',target:'',style:selected()?.style||'editorial'};
    const automatic=id==='together';
    $('usCountdownEditor').hidden=false;$('usCountdownCollection').hidden=true;
    $('usCountdownEditorHeading').textContent=automatic?'Il vostro tempo':e?'Modifica countdown':'Un momento da aspettare';
    $('usCountdownFields').hidden=automatic;
    $('usCountdownTitle').value=draft.title||'';
    $('usCountdownMode').value=draft.mode;
    dateField(draft.target);
    $('usCountdownDelete').hidden=!e;
    touched=false;
    preview();status('');
  }
  function dateField(target){
    const input=$('usCountdownDate'),clock=draft?.mode==='clock';
    input.type=clock?'datetime-local':'date';input.min=clock?'2000-01-01T00:00':'2000-01-01';input.max=clock?'2100-12-31T23:59':'2100-12-31';
    if(clock&&target){const value=new Date(target);input.value=Number.isFinite(+value)?new Date(+value-value.getTimezoneOffset()*60000).toISOString().slice(0,16):'';}
    else input.value=target||'';
    originalInput=input.value;originalTarget=target||null;originalMode=draft.mode;
    $('usCountdownDateLabel').textContent=clock?'Data e ora · sul tuo telefono':'Data';
  }
  function collection(){draft=null;$('usCountdownEditor').hidden=true;$('usCountdownCollection').hidden=false;paintList();status('');}
  async function open(mode='collection'){
    if(!key())return;
    if(key()!==owner)clear();
    w.UsUiFoundation?.cancelSurfaceExit?.(root);root.setAttribute('aria-hidden','false');root.classList.add('open');if(busy)return;
    if(mode==='active'&&state?.active_id)editor(state.active_id);else collection();
    const shown=draft;
    await Promise.all([hydrate(),w.USProgression?.hydrate?.({showUnlocks:false})]);
    if(opened()){
      paintList();
      // Only the surface this open() showed, still untouched, follows the
      // fresh state. If the user went back, started a new countdown or typed
      // meanwhile, the slow answer must not swap their draft for the stored one.
      if(mode==='active'&&state?.active_id&&draft===shown&&!touched)editor(state.active_id);
      else if(draft)preview();
    }
  }
  function activeStyle(){return selected()?.style||'';}
  function hasActive(){return Boolean(state?.active_id);}
  async function setStyle(styleId){
    if(!key())return false;
    if(key()!==owner)clear();
    if(!state)await hydrate();
    if(busy||!state||!state.active_id||!available(styleId,progression()))return false;
    const next=copy();
    if(next.active_id==='together')next.together_style=styleId;
    else{
      const index=next.items.findIndex(item=>item.id===next.active_id);
      if(index<0)return false;
      next.items[index]={...next.items[index],style:styleId};
    }
    return persist(next);
  }

  function close(){
    const finish=()=>{root.classList.remove('open');root.setAttribute('aria-hidden','true');};
    if(!opened())return;root.classList.remove('open');
    if(!w.UsUiFoundation?.exitSurface?.(root,finish))finish();
  }
  $('usCountdownEntry')?.addEventListener('click',()=>open());surface.addEventListener('click',()=>open('active'));
  root.querySelectorAll('[data-countdown-close]').forEach(e=>e.addEventListener('click',close));
  $('usCountdownBack').addEventListener('click',collection);
  $('usCountdownNew').addEventListener('click',()=>editor());
  $('usCountdownHide').addEventListener('click',()=>persist({...copy(),active_id:null}));
  $('usCountdownRetry').addEventListener('click',()=>hydrate());
  $('usCountdownList').addEventListener('click',async event=>{
    const edit=event.target.closest('[data-countdown-edit]');if(edit)return editor(edit.dataset.countdownEdit);
    const select=event.target.closest('[data-countdown-select]');if(select&&!select.disabled)await persist({...copy(),active_id:select.dataset.countdownSelect});
  });
  // Native date/time pickers (iOS wheels, Android dialogs) may report only
  // "change": both events keep the preview and the Save state in step.
  const edited=()=>{if(!draft)return;touched=true;preview();};
  for(const id of ['usCountdownTitle','usCountdownDate'])['input','change'].forEach(type=>$(id).addEventListener(type,edited));
  $('usCountdownMode').addEventListener('change',()=>{if(!draft)return;draft.mode=$('usCountdownMode').value;touched=true;dateField('');preview();});
  $('usCountdownForm').addEventListener('submit',async event=>{
    event.preventDefault();if(!draft||busy||!state||$('usCountdownSave').disabled)return;
    let next=copy();
    if(draft.id==='together')next={...next,together_style:draft.style,active_id:'together'};
    else{
      const target=editorTarget();if(!target)return;
      const e={id:draft.id,mode:draft.mode,style:draft.style,title:$('usCountdownTitle').value.trim(),target};
      const i=next.items.findIndex(e=>e.id===draft.id);if(i>=0)next.items[i]=e;else next.items.push(e);next.active_id=e.id;
    }
    if(await persist(next))collection();
  });
  $('usCountdownDelete').addEventListener('click',async()=>{
    if(!draft||busy)return;
    const token=generation,id=draft.id;
    const confirmed=await w.UsUiFoundation.confirm({title:'Eliminare questo countdown?',body:draft.title,confirmLabel:'Elimina',tone:'danger'});
    if(!confirmed||token!==generation||key()!==owner||!state)return;
    const next=copy();next.items=next.items.filter(e=>e.id!==id);if(next.active_id===id)next.active_id=null;
    if(await persist(next))collection();
  });
  d.addEventListener('visibilitychange',()=>{w.clearInterval(timer);timer=null;if(!d.hidden){tick();if(key())hydrate();startTimer();}});
  w.addEventListener('us:progression-updated',()=>{paint();if(draft&&opened())preview();});
  // Reconcile partner changes at most once per minute, only while Oggi is visible.
  // Identity changes clear immediately on the next lifecycle tick. No private local storage.
  function startTimer(){if(timer||d.hidden)return;timer=w.setInterval(()=>{
    if(key()!==owner){clear();if(key())hydrate();}
    if(d.hidden)return;
    if($('home')?.classList.contains('active')||opened()){
      tick();if(key()&&Date.now()-lastAttempt>60000&&!busy&&!draft)hydrate();
    }
  },1000);}
  startTimer();
  const api=w.USCountdown;api.open=open;api.close=close;api.refresh=hydrate;api.reset=()=>clear(true);api.setStyle=setStyle;api.activeStyle=activeStyle;api.hasActive=hasActive;
  // Shared sample used by the sheet tiles, the Sintonia collection and the unlock moment.
  api.previewMarkup=style=>STYLES.some(s=>s.id===style)?markup({value:'12',unit:'giorni',label:''},'',style):'';
  if(typeof sb!=='undefined')sb.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')clear(true);});
  if(key())hydrate();
}
return {STYLES,display,relationship,available,install};
});
