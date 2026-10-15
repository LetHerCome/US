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
// O9 — a countdown lives until its day ("Ci siamo"); from the next day (Rome)
// Oggi goes back to "Insieme da" by itself. The stored choice is not touched.
function civilDay(at){const p=civil.formatToParts(at);const v=t=>p.find(e=>e.type===t).value;return dayNumber(`${v('year')}-${v('month')}-${v('day')}`);}
function passed(item,now=new Date()){
  if(!item)return false;
  if(item.mode==='days'){const day=dayNumber(item.target);return Number.isFinite(day)&&day<todayNumber(now);}
  if(item.mode!=='clock'||typeof item.target!=='string'||!item.target)return false;
  const at=new Date(item.target);
  return Number.isFinite(+at)&&civilDay(at)<todayNumber(now);
}
function available(id,progression){const s=STYLES.find(s=>s.id===id);return Boolean(s&&(!s.reward||progression?.rewards?.some(r=>r.id===s.reward&&r.unlocked)));}

function install(w){
  const d=w.document,$=id=>d.getElementById(id),hero=$('homeHero'),root=$('usCountdownSheet'),surface=$('usCountdownDisplay');
  if(!hero||!root||!surface)return;
  let state=null,owner='',generation=0,loading=null,busy=false,draft=null,timer=null,lastAttempt=0,suspendedOwner='';
  let originalInput='',originalTarget=null,originalMode='',lastClock='';
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
  function together(){
    const view=relationship(state?.started_on);
    return view?{id:'together',title:'Insieme da',style:state.together_style,view,together:true}:null;
  }
  function selected(){
    if(!state)return null;
    if(state.active_id==='together')return together();
    const e=state.items?.find(e=>e.id===state.active_id);
    if(!e)return null;
    return passed(e)?together():{...e,view:display(e)};
  }
  // Insieme da reads "430 giorni insieme" in the Oggi type (the tail only shows where the style asks for it).
  // own: the title is the one you wrote (not "Insieme da" or the editor's placeholder), kept as written.
  function markup(view,title,style,together=false,own=!together&&Boolean(title)){
    if(!view)return '';
    return `<span class="us-countdown-art" data-countdown-style="${esc(style)}" data-countdown-clock="${view.value.includes(':')}"${together?' data-countdown-kind="together"':''}><span class="us-countdown-deco" aria-hidden="true"><i></i></span><span class="us-countdown-title"${own?' translate="no"':''}>${esc(title)}</span><span class="us-countdown-number" aria-hidden="true">${[...view.value].map(c=>`<span class="us-countdown-digit${/\d/.test(c)?'':' is-sep'}">${esc(c)}</span>`).join('')}</span><span class="us-countdown-unit">${esc(view.unit)}</span>${together?'<span class="us-countdown-tail" aria-hidden="true">insieme</span>':''}<span class="us-countdown-sub">${esc(view.label)}</span></span>`;
  }
  function tick(){
    if(key()!==owner){clear();if(key())hydrate();return;}
    const e=selected(),view=e?.view;
    // O9 — the time stays on Oggi with or without a photo.
    const shown=Boolean(view&&available(e.style,progression()));
    surface.hidden=!shown;hero.toggleAttribute('data-us-countdown',shown);
    // Nothing on Oggi ("Nessuno in Oggi", or not ready yet): one quiet way back.
    const entry=$('usCountdownEntry');if(entry)entry.hidden=shown||!state;
    if(!shown)return;
    surface.setAttribute('aria-label',`${e.title}, ${view.value} ${view.unit} ${view.label}. Modifica countdown`);
    const signature=`${e.together?'together':state.active_id}:${e.style}:${view.value.length}:${e.title}`;
    if(surface.dataset.signature!==signature){surface.innerHTML=markup(view,e.title,e.style,Boolean(e.together));surface.dataset.signature=signature;}
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
  // The day each row counts to, as the list reads it: "Sabato 31 ottobre, 7:40".
  const tag=()=>w.UsI18n?.tag||'it-IT';
  const cap=v=>v?v.charAt(0).toLocaleUpperCase(tag())+v.slice(1):'';
  function when(e){
    try{
      if(e?.mode==='days'){const n=dayNumber(e.target);return Number.isFinite(n)?cap(new Date(n*86400000+43200000).toLocaleDateString(tag(),{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'})):'';}
      if(e?.mode==='clock'){const at=new Date(e.target);return Number.isFinite(+at)?`${cap(at.toLocaleDateString(tag(),{weekday:'long',day:'numeric',month:'long'}))}, ${at.toLocaleTimeString(tag(),{hour:'numeric',minute:'2-digit'})}`:'';}
    }catch(_){}
    return '';
  }
  function since(started){
    const n=dayNumber(started);if(!Number.isFinite(n))return '';
    try{return `Dal ${new Date(n*86400000+43200000).toLocaleDateString(tag(),{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})}`;}catch(_){return '';}
  }
  function paintList(){
    const together=relationship(state?.started_on);
    const entries=[{id:'together',title:'Insieme da',value:together?.value||'',unit:together?.unit||'',date:since(state?.started_on),detail:together?`${together.value} ${together.unit}`:'Imposta la data in Noi → Impostazioni',disabled:!together},...(state?.items||[]).map(e=>({id:e.id,title:e.title,value:display(e)?.value||'',unit:display(e)?.unit||'',date:when(e),detail:[display(e)?.value,display(e)?.unit].filter(Boolean).join(' ')}))];
    // The number leads the row (as on Oggi); the accessible name keeps the original reading order.
    $('usCountdownList').innerHTML=entries.map(e=>`<div class="us-countdown-row"><button type="button" data-countdown-select="${esc(e.id)}" aria-pressed="${state?.active_id===e.id}" aria-label="${esc(e.title)}, ${esc(e.detail)}" ${busy||e.disabled||!state?'disabled':''}><span class="us-countdown-check" aria-hidden="true">${state?.active_id===e.id?'●':'○'}</span>${e.value?`<strong class="us-countdown-value">${esc(e.value)}</strong>`:''}<span class="us-countdown-copy"><b${e.id==='together'?'':' translate="no"'}>${esc(e.title)}</b><small>${esc(e.value?(e.date||e.unit):e.detail)}</small>${state?.active_id===e.id?'<em>In Oggi</em>':''}</span></button><button type="button" class="us-countdown-edit" data-countdown-edit="${esc(e.id)}" aria-label="Modifica ${esc(e.title)}" ${busy||e.disabled||!state?'disabled':''}><span class="us-icon" data-us-icon="pencil" aria-hidden="true"></span></button></div>`).join('');
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
    // The preview sits on your Oggi photo, as the countdown will (mockup .cd-prev).
    const layer=d.querySelector('#homeHero .home-photo-layer.active'),photo=layer?w.getComputedStyle(layer).backgroundImage:'';
    if(photo&&photo!=='none')$('usCountdownPreview').style.setProperty('--us-cd-photo',photo);else $('usCountdownPreview').style.removeProperty('--us-cd-photo');
    $('usCountdownPreview').innerHTML=markup(view||{value:'12',unit:'giorni',label:''},title,draft.style,draft.id==='together',draft.id!=='together'&&Boolean(actualTitle));
    // Save waits only for a save in flight (mockup): what is missing is said on
    // submit. A Save greyed out until name AND date were both valid looked like
    // a stuck spinner (fix4 marks a disabled "Salva…" button busy) and said nothing.
    $('usCountdownSave').disabled=busy;
  }
  // Stile (mockup 033 .cd-styles): every style with its sample; one not yet
  // unlocked says from which Sintonia level. The choice travels in draft.style.
  function styleTiles(){
    const box=$('usCountdownStyles');if(!box||!draft)return;
    const p=progression();
    const note=(s,lock,on)=>lock?`<span class="us-icon" data-us-icon="lock-simple" aria-hidden="true"></span>Livello ${s.level}`:on?'Scelto':s.reward?'Sbloccato':'Incluso';
    const tiles=box.querySelectorAll('[data-countdown-style-pick]');
    // Built once; later only the state changes, so focus stays on the tile just tapped.
    if(tiles.length===STYLES.length){
      tiles.forEach((b,i)=>{const s=STYLES[i],lock=!available(s.id,p),on=draft.style===s.id;b.classList.toggle('is-locked',lock);b.setAttribute('aria-pressed',String(on));const small=b.querySelector('small'),html=note(s,lock,on);if(small.innerHTML!==html)small.innerHTML=html;});
      return;
    }
    box.innerHTML=STYLES.map(s=>{
      const lock=!available(s.id,p),on=draft.style===s.id;
      return `<button type="button" class="us-countdown-style${lock?' is-locked':''}" data-countdown-style-pick="${esc(s.id)}" aria-pressed="${on}"><span class="us-countdown-style-pv" aria-hidden="true">${markup({value:'430',unit:'giorni',label:''},'',s.id)}</span><b>${esc(s.name)}</b><small>${note(s,lock,on)}</small></button>`;
    }).join('');
  }
  // What is missing, said where the mockup says it (.form-err above Save).
  // Said, not forced: no focus jump (on a phone the keyboard would cover it), the line stays in view.
  function fieldError(message){
    const box=$('usCountdownError');if(!box)return;box.textContent=message||'';
    if(message)try{box.scrollIntoView?.({block:'nearest',behavior:reduced()?'auto':'smooth'});}catch(_){}
  }
  const reduced=()=>d.documentElement?.dataset?.usMotion==='reduced'||Boolean(w.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  // A step of the sheet (mockup UP.flow show): 28 px sideways and a fade, 340 ms.
  function step(el,dir){
    const panel=root.querySelector('[data-us-modal-panel]');if(panel)panel.scrollTop=0;
    if(!dir||!el||reduced()||typeof el.animate!=='function')return;
    el.animate([{opacity:0,translate:`${dir*28}px 0`},{opacity:1,translate:'0 0'}],{duration:340,easing:'cubic-bezier(.2,.8,.2,1)'});
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
      w.UsFeedback?.error?.();
      if(err?.code==='40001'||/countdown_conflict/.test(err?.message||'')){await hydrate();status('È cambiato sull’altro telefono. Le tue modifiche sono qui: controlla e salva di nuovo.');}
      else status('Non salvato. Controlla la connessione e riprova.');return false;
    }finally{
      if(token===generation){busy=false;root.removeAttribute('aria-busy');restoreControls();paintList();if(draft)preview();}
    }
  }
  function editor(id,dir=1){
    if(busy||!state)return;
    const e=state.items.find(e=>e.id===id);
    // A new one starts in the style Oggi shows (mockup), never in one still locked.
    const current=selected()?.style;
    draft=id==='together'?{id,style:state.together_style,mode:'days'}:e?{...e}:{id:w.crypto.randomUUID(),title:'',mode:'days',target:'',style:current&&available(current,progression())?current:'editorial'};
    const automatic=id==='together';
    $('usCountdownEditor').hidden=false;$('usCountdownCollection').hidden=true;
    $('usCountdownEditorHeading').textContent=automatic||e?'Modifica countdown':'Un momento da aspettare';
    $('usCountdownHeading').textContent=$('usCountdownEditorHeading').textContent;
    $('usCountdownFields').hidden=automatic;
    const lead=$('usCountdownTogetherNote');if(lead)lead.hidden=!automatic;
    $('usCountdownTitle').value=draft.title||'';
    $('usCountdownMode').value=draft.mode;modeSeg();
    dateField(draft.target);
    $('usCountdownDelete').hidden=!e;
    touched=false;
    styleTiles();fieldError('');const row=$('usCountdownStyles');if(row)row.scrollLeft=0;
    preview();status('');
    step($('usCountdownEditor'),dir);
  }
  function dateKind(){
    const input=$('usCountdownDate'),clock=draft?.mode==='clock';
    input.type=clock?'datetime-local':'date';input.min=clock?'2000-01-01T00:00':'2000-01-01';input.max=clock?'2100-12-31T23:59':'2100-12-31';
    $('usCountdownDateLabel').textContent=clock?'Data e ora · sul tuo telefono':'Data';
    return input;
  }
  function dateField(target){
    const input=dateKind(),clock=draft?.mode==='clock';
    if(clock&&target){const value=new Date(target);input.value=Number.isFinite(+value)?new Date(+value-value.getTimezoneOffset()*60000).toISOString().slice(0,16):'';}
    else input.value=target||'';
    originalInput=input.value;originalTarget=target||null;originalMode=draft.mode;lastClock=clock?input.value:'';
  }
  // Tempo: the two choices as a segmented control (mockup .seg2); the select stays the source.
  function modeSeg(){root.querySelectorAll('[data-countdown-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.countdownMode===$('usCountdownMode').value)));}
  function collection(dir=0){draft=null;$('usCountdownHeading').textContent='Countdown';$('usCountdownEditor').hidden=true;$('usCountdownCollection').hidden=false;paintList();status('');fieldError('');step($('usCountdownCollection'),dir);}
  async function open(mode='collection'){
    if(!key())return;
    if(key()!==owner)clear();
    w.UsUiFoundation?.cancelSurfaceExit?.(root);root.setAttribute('aria-hidden','false');root.classList.add('open');if(busy)return;
    if(mode==='active'&&state?.active_id)editor(state.active_id,0);else collection();
    const shown=draft;
    await Promise.all([hydrate(),w.USProgression?.hydrate?.({showUnlocks:false})]);
    if(opened()){
      paintList();
      // Only the surface this open() showed, still untouched, follows the
      // fresh state. If the user went back, started a new countdown or typed
      // meanwhile, the slow answer must not swap their draft for the stored one.
      if(mode==='active'&&state?.active_id&&draft===shown&&!touched)editor(state.active_id,0);
      else if(draft){styleTiles();preview();}
    }
  }
  // Native widgets: the same selection Oggi shows, as semantic data (never markup).
  // null = not known yet (state or rewards still loading): the widget keeps its last value.
  function widgetState(){
    if(!state)return null;
    const e=selected();
    if(!e||!e.view)return {active:false,style:e?.style||'editorial'};
    const premium=STYLES.find(s=>s.id===e.style)?.reward;
    if(premium&&!progression())return null;
    if(!available(e.style,progression()))return {active:false,style:e.style};
    if(e.together)return {active:true,kind:'together',title:'Insieme da',target:state.started_on||'',style:e.style||'editorial'};
    return {active:true,kind:e.mode==='clock'?'clock':'days',title:e.title||'Il nostro momento',target:e.target||'',style:e.style||'editorial'};
  }
  function activeStyle(){return selected()?.style||'';}
  function hasActive(){return Boolean(state?.active_id);}
  async function setStyle(styleId){
    if(!key())return false;
    if(key()!==owner)clear();
    if(!state)await hydrate();
    if(busy||!state||!state.active_id||!available(styleId,progression()))return false;
    const next=copy();
    if(next.active_id==='together'||selected()?.together)next.together_style=styleId;
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
  // Oggi's countdown opens the list, as in the mockup (#cdBtn): "Crea countdown"
  // is one tap away. It used to open the active editor, often "Insieme da" with
  // no fields at all, and a new countdown seemed impossible to add.
  $('usCountdownEntry')?.addEventListener('click',()=>open());surface.addEventListener('click',()=>open());
  root.querySelectorAll('[data-countdown-close]').forEach(e=>e.addEventListener('click',close));
  $('usCountdownBack').addEventListener('click',()=>collection(-1));
  $('usCountdownNew').addEventListener('click',()=>editor());
  $('usCountdownHide').addEventListener('click',async()=>{if(await persist({...copy(),active_id:null}))w.toast?.('Nessun countdown in Oggi',{quiet:true});});
  $('usCountdownRetry').addEventListener('click',()=>hydrate());
  $('usCountdownList').addEventListener('click',async event=>{
    const edit=event.target.closest('[data-countdown-edit]');if(edit)return editor(edit.dataset.countdownEdit);
    const select=event.target.closest('[data-countdown-select]');if(select&&!select.disabled&&await persist({...copy(),active_id:select.dataset.countdownSelect}))w.toast?.('In Oggi',{quiet:true,icon:'check'});
  });
  // Stile (mockup 033): a locked style says from which level; any other is the draft's.
  $('usCountdownStyles')?.addEventListener('click',event=>{
    const pick=event.target.closest('[data-countdown-style-pick]');if(!pick||!draft||busy)return;
    const s=STYLES.find(s=>s.id===pick.dataset.countdownStylePick);if(!s)return;
    if(!available(s.id,progression())){w.toast?.(`Si sblocca al livello ${s.level} di Sintonia`,{quiet:true,icon:'lock-simple'});return;}
    draft.style=s.id;touched=true;styleTiles();
    // Only the style changes: the sample keeps its markup (no rebuild, no style read) and pops (mockup).
    const art=$('usCountdownPreview').querySelector('.us-countdown-art');
    if(art)art.dataset.countdownStyle=s.id;else preview();
    if(art&&!reduced()&&typeof art.animate==='function')art.animate([{opacity:0,scale:.92},{opacity:1,scale:1}],{duration:320,easing:'cubic-bezier(.22,1.15,.36,1)'});
  });
  // Native date/time pickers (iOS wheels, Android dialogs) may report only
  // "change": both events keep the preview and the Save state in step.
  const edited=()=>{if(!draft)return;touched=true;fieldError('');preview();};
  for(const id of ['usCountdownTitle','usCountdownDate'])['input','change'].forEach(type=>$(id).addEventListener(type,edited));
  // Giorni <-> Ore, minuti, secondi keeps the day already chosen (it used to be
  // wiped, and Save went dead again with nothing said).
  $('usCountdownMode').addEventListener('change',()=>{
    modeSeg();if(!draft)return;
    const before=$('usCountdownDate').value,day=/^\d{4}-\d{2}-\d{2}/.test(before)?before.slice(0,10):'';
    if(draft.mode==='clock'&&before)lastClock=before;
    draft.mode=$('usCountdownMode').value;touched=true;
    const input=dateKind();
    input.value=!day?'':draft.mode==='clock'?(lastClock.startsWith(day)?lastClock:`${day}T00:00`):day;
    fieldError('');preview();
  });
  root.querySelectorAll('[data-countdown-mode]').forEach(b=>b.addEventListener('click',()=>{const select=$('usCountdownMode');if(select.disabled||select.value===b.dataset.countdownMode)return;select.value=b.dataset.countdownMode;select.dispatchEvent(new Event('change'));}));
  $('usCountdownForm').addEventListener('submit',async event=>{
    event.preventDefault();if(!draft||busy||!state)return;
    // A style not (or no longer) unlocked would be refused by the server: said here instead.
    const style=STYLES.find(s=>s.id===draft.style);
    if(style?.reward&&!available(style.id,progression()))return fieldError(`Si sblocca al livello ${style.level} di Sintonia`);
    let next=copy();
    if(draft.id==='together')next={...next,together_style:draft.style,active_id:'together'};
    else{
      // What is missing is said above Save (mockup .form-err), on the field to fix.
      const name=$('usCountdownTitle'),title=name.value.trim();
      if(!title)return fieldError('Dai un nome al countdown.');
      const target=editorTarget();
      if(!target)return fieldError(draft.mode==='clock'?'Scegli data e ora.':'Scegli la data.');
      const e={id:draft.id,mode:draft.mode,style:draft.style,title,target};
      const i=next.items.findIndex(e=>e.id===draft.id);if(i>=0)next.items[i]=e;else next.items.push(e);next.active_id=e.id;
    }
    fieldError('');
    if(!(await persist(next)))return;
    // Mockup: the sheet closes on the editor, "Salvato e in Oggi", and the time arrives on Oggi.
    // The next open() starts from the list again.
    draft=null;close();
    w.toast?.('Salvato e in Oggi',{quiet:false,icon:'check'});
    if(!surface.hidden&&!reduced()&&typeof surface.animate==='function')surface.animate([{opacity:0,scale:.9},{opacity:1,scale:1}],{duration:480,easing:'cubic-bezier(.22,1.15,.36,1)'});
  });
  $('usCountdownDelete').addEventListener('click',async()=>{
    if(!draft||busy)return;
    const token=generation,id=draft.id;
    const confirmed=await w.UsUiFoundation.confirm({title:'Eliminare questo countdown?',body:'Sparirà per entrambi.',confirmLabel:'Elimina',tone:'danger'});
    if(!confirmed||token!==generation||key()!==owner||!state)return;
    const next=copy();next.items=next.items.filter(e=>e.id!==id);if(next.active_id===id)next.active_id=null;
    if(await persist(next)){collection(-1);w.toast?.('Countdown eliminato',{quiet:true});}
  });
  d.addEventListener('visibilitychange',()=>{w.clearInterval(timer);timer=null;if(!d.hidden){tick();if(key())hydrate();startTimer();}});
  w.addEventListener('us:progression-updated',()=>{paint();if(draft&&opened()){styleTiles();preview();}});
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
  const api=w.USCountdown;api.open=open;api.close=close;api.refresh=hydrate;api.reset=()=>clear(true);api.setStyle=setStyle;api.activeStyle=activeStyle;api.hasActive=hasActive;api.widgetState=widgetState;
  // Shared sample used by the sheet tiles, the Sintonia collection and the unlock moment.
  api.previewMarkup=style=>STYLES.some(s=>s.id===style)?markup({value:'12',unit:'giorni',label:''},'',style):'';
  if(typeof sb!=='undefined')sb.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')clear(true);});
  if(key())hydrate();
}
return {STYLES,display,relationship,available,passed,install};
});
