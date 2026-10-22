// Weekly check-in V1 («Il punto della settimana»). Once a week each of you
// answers alone: closeness, energy, appreciation, support. The server keeps
// the answers sealed until both answered (get_weekly_checkin_state); this
// module only shows what it returns. No XP, no streak, no score.
// Spec: docs/missions/weekly-checkin-v1.md.
(function(global,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  global.UsWeeklyCheckin=api;api.install(global);
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
// Levels 1..5 as the server stores them, said in words (never as a number).
const CLOSENESS=Object.freeze(['Lontani','Un po’ distanti','A metà','Vicini','Vicinissimi']);
const ENERGY=Object.freeze(['Scarica','Bassa','Così così','Buona','Piena']);
const SUPPORT_LAST=Object.freeze({1:'Sì',2:'In parte',3:'Non ancora'});
const PROMPTS=Object.freeze({
  distant:['Cosa ci ha tenuti lontani?','Cosa ti è mancato di più?','Cosa potrebbe avvicinarci?'],
  middle:['Cosa ha funzionato, cosa meno?','Un momento di vicinanza?','Cosa vorresti di più?'],
  close:['Cosa ci ha fatto sentire così vicini?','Un momento da ricordare?','Cosa vorresti rifare?']
});
const APPRECIATION_HINTS=Object.freeze(['Un gesto piccolo che ti ha fatto bene','Una cosa fatta senza che gliela chiedessi','Un momento in cui ti ha capito']);
const REACTIONS=Object.freeze([['heart','Metti un cuore'],['cry','Mi hai commosso']]);
const STEPS=4;
const FIELDS=Object.freeze(['closeness','closeness_note','energy','energy_note','appreciation','support_last','support_request']);

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// A text people wrote: escaped and never translated.
const own=v=>`<span translate="no">${esc(v)}</span>`;

function phase(state){
  if(!state)return 'loading';
  if(state.revealed)return 'ready';
  if(state.me)return 'waiting';
  return state.partner_submitted?'your_turn':'todo';
}
function levelLabel(kind,value){
  const list=kind==='energy'?ENERGY:CLOSENESS;
  return Number.isInteger(value)&&value>=1&&value<=5?list[value-1]:'';
}
function closenessPrompts(value){
  if(Number.isInteger(value)&&value<=2)return PROMPTS.distant;
  if(Number.isInteger(value)&&value>=4)return PROMPTS.close;
  return PROMPTS.middle;
}
// Oggi's one priority card: only when something waits for me.
function todayPriority(state,partnerName,{seen}={}){
  const p=phase(state),week=state?.week_start||'',name=partnerName||'La tua persona';
  if(p==='your_turn')return {id:`checkin:${week}:turn`,factKey:`checkin:${week}:turn`,arrivalType:'checkin',category:'waiting_for_me',attention:true,
    title:`${name} ha fatto il punto della settimana`,detail:'Ora tocca a te',action:'checkin',actionLabel:'Rispondi'};
  if(p==='ready'&&!seen?.has?.(week))return {id:`checkin:${week}:ready`,factKey:`checkin:${week}:ready`,arrivalType:'checkin',category:'answers_ready',attention:true,
    title:'Il punto della settimana è pronto',detail:`Guarda cosa ha scritto ${name}`,action:'checkin',actionLabel:'Guarda'};
  return null;
}
function noiLine(state,partnerName){
  if(!state)return null;
  const name=partnerName||'La tua persona',p=phase(state);
  const detail={todo:'Quattro domande, due minuti. Rispondi quando vuoi.',your_turn:`${name} ha già risposto. Tocca a te.`,
    waiting:`Hai risposto. Aspettiamo ${name}.`,ready:'Pronto: guardatelo insieme.'}[p];
  const request=p==='ready'?state.partner?.support_request||null:null;
  // The request itself is written by the other: shown on its own, never translated.
  return {phase:p,title:'Il punto della settimana',detail:request?`Questa settimana ${name} ti chiede`:detail,request};
}
const text=v=>{const s=typeof v==='string'?v.trim():'';return s?s:null;};
const level=(v,max)=>{const n=Number(v);return v!==null&&v!==''&&Number.isInteger(n)&&n>=1&&n<=max?n:null;};
function payload(draft={},{previousRequest=true}={}){
  return {closeness:level(draft.closeness,5),closeness_note:text(draft.closeness_note),energy:level(draft.energy,5),energy_note:text(draft.energy_note),
    appreciation:text(draft.appreciation),support_last:previousRequest?level(draft.support_last,3):null,support_request:text(draft.support_request)};
}
function validate(p){
  if(!p.appreciation)return 'Scrivi cosa hai apprezzato: è la parte che arriva all’altra persona.';
  if(p.appreciation.length>500)return 'Massimo 500 caratteri.';
  for(const k of ['closeness_note','energy_note','support_request'])if(p[k]&&p[k].length>280)return 'Massimo 280 caratteri.';
  return '';
}
function distantTwice(history){
  const w=history?.weeks;if(!Array.isArray(w)||w.length<2)return false;
  return w.slice(-2).every(x=>x.me===1&&x.partner===1);
}
const fill=(s,name)=>s.replace('{name}',name);

// ---------------------------------------------------------------- rendering
function sliderStep(kind,draft,name){
  const value=level(draft[kind],5)??3,label=levelLabel(kind,value);
  const q=kind==='closeness'?fill('Quanta vicinanza hai sentito con {name} questa settimana?',name):'Come stai di energia?';
  const sub=kind==='closeness'?'Per voi due, non per giudicare.':'Riguarda te: aiuta l’altra persona a capire la tua settimana.';
  const note=`${kind}_note`,prompts=kind==='closeness'?closenessPrompts(value):['Cosa ti ha dato energia?','Cosa te l’ha tolta?','Di cosa avresti bisogno?'];
  return `<h3 class="us-checkin-q">${esc(q)}</h3><p class="us-checkin-sub">${esc(sub)}</p>
    <output class="us-checkin-level" id="usCheckinLevel" for="usCheckinRange" aria-live="polite">${esc(label)}</output>
    <input class="us-checkin-range" id="usCheckinRange" type="range" min="1" max="5" step="1" value="${value}" data-checkin-field="${kind}" data-checkin-kind="${kind}" aria-label="${esc(q)}" aria-valuetext="${esc(label)}">
    <div class="us-checkin-scale" aria-hidden="true"><span>${esc(levelLabel(kind,1))}</span><span>${esc(levelLabel(kind,5))}</span></div>
    <label class="us-checkin-note"><span>Vuoi dire perché? <small>Facoltativo</small></span><textarea rows="2" maxlength="280" data-checkin-field="${note}" placeholder="${esc(prompts[0])}">${esc(draft[note]||'')}</textarea></label>`;
}
function renderStep(draft={},step=1,ctx={}){
  const name=ctx.partnerName||'La tua persona',prev=ctx.state?.previous_request;
  let body='';
  if(step===1)body=sliderStep('closeness',draft,name);
  else if(step===2)body=sliderStep('energy',draft,name);
  else if(step===3)body=`<h3 class="us-checkin-q">${esc(fill('Cosa ha fatto {name} questa settimana che hai apprezzato?',name))}</h3>
    <p class="us-checkin-sub">Arriva a ${esc(name)} quando avete risposto tutti e due.</p>
    <label class="us-checkin-note is-main"><span class="us-checkin-sr">La tua risposta</span><textarea rows="4" maxlength="500" data-checkin-field="appreciation" placeholder="${esc(APPRECIATION_HINTS[0])}">${esc(draft.appreciation||'')}</textarea></label>
    <ul class="us-checkin-hints">${APPRECIATION_HINTS.slice(1).map(h=>`<li>${esc(h)}</li>`).join('')}</ul>`;
  else{
    const last=prev?`<div class="us-checkin-prev"><p>La settimana scorsa ${esc(name)} ti aveva chiesto:</p><blockquote>${own(prev.text)}</blockquote><p class="us-checkin-prev-q">Ce l’hai fatta?</p>
      <div class="us-checkin-choices" role="group" aria-label="Ce l’hai fatta?">${[1,2,3].map(v=>`<button type="button" data-checkin-support="${v}" aria-pressed="${level(draft.support_last,3)===v}">${esc(SUPPORT_LAST[v])}</button>`).join('')}</div></div>`:'';
    body=`${last}<h3 class="us-checkin-q">${esc(fill('Questa settimana ti aiuterebbe se {name}…',name))}</h3>
      <p class="us-checkin-sub">Facoltativo. ${esc(name)} lo vedrà per tutta la settimana.</p>
      <label class="us-checkin-note is-main"><span class="us-checkin-sr">La tua richiesta</span><textarea rows="3" maxlength="280" data-checkin-field="support_request" placeholder="mi ricordasse di staccare la sera">${esc(draft.support_request||'')}</textarea></label>`;
  }
  const skip=step!==3?'<button type="button" class="ghost" data-checkin-skip>Salta</button>':'';
  return `<div class="us-checkin-step" data-checkin-step="${step}">
    <div class="us-checkin-progress" aria-label="Passo ${step} di ${STEPS}"><span class="us-checkin-dots" aria-hidden="true">${Array.from({length:STEPS},(_,i)=>`<i${i<step?' class="is-on"':''}></i>`).join('')}</span><small>${step} di ${STEPS}</small></div>
    ${body}
    <p class="us-checkin-error" id="usCheckinError" aria-live="polite"></p>
    <div class="us-checkin-actions">${step>1?'<button type="button" class="ghost" data-checkin-back>Indietro</button>':''}${skip}<button type="button" class="primary" data-checkin-next>${step===STEPS?'Invia':'Avanti'}</button></div>
  </div>`;
}
function renderIntro(state,ctx={}){
  const name=ctx.partnerName||'La tua persona',turn=phase(state)==='your_turn';
  return `<div class="us-checkin-intro">
    ${turn?`<p class="us-checkin-badge">${esc(name)} ha già risposto</p>`:''}
    <p class="us-checkin-lead">Quattro domande, due minuti. Rispondete ognuno per conto suo: vedrete le risposte insieme, quando avete finito tutti e due.</p>
    <ol class="us-checkin-list"><li>Quanta vicinanza hai sentito</li><li>Come stai di energia</li><li>Cosa hai apprezzato</li><li>Di cosa avresti bisogno</li></ol>
    <div class="us-checkin-actions"><button type="button" class="primary" data-checkin-start>Inizia</button></div>
  </div>`;
}
function renderWaiting(state,ctx={}){
  const name=ctx.partnerName||'La tua persona';
  return `<div class="us-checkin-waiting">
    <span class="us-checkin-seal" aria-hidden="true"><span class="us-icon" data-us-icon="envelope"></span></span>
    <h3 class="us-checkin-q">Hai fatto il tuo punto</h3>
    <p class="us-checkin-lead">Lo vedrete insieme quando risponde anche ${esc(name)}. Fino ad allora puoi ancora cambiarlo.</p>
    <div class="us-checkin-actions"><button type="button" class="ghost" data-checkin-edit>Modifica</button><button type="button" class="primary" data-checkin-close>Chiudi</button></div>
  </div>`;
}
function trend(history,name){
  const weeks=(history?.weeks||[]).filter(w=>Number.isInteger(w.me)&&Number.isInteger(w.partner));
  if(weeks.length<2)return '';
  return `<div class="us-checkin-trend" data-checkin-trend role="img" aria-label="${esc(`Vicinanza delle ultime ${weeks.length} settimane`)}">
    ${weeks.map(w=>`<span class="us-checkin-week"><i class="is-me" style="--h:${w.me*20}%"></i><i class="is-partner" style="--h:${w.partner*20}%"></i></span>`).join('')}
  </div><p class="us-checkin-trend-key" aria-hidden="true"><span class="is-me">Tu</span><span class="is-partner">${esc(name)}</span><span>ultime ${weeks.length} settimane</span></p>`;
}
function pair(kind,me,partner,name){
  const row=(who,cls,r)=>`<div class="us-checkin-pair-row ${cls}"><span class="us-checkin-who">${esc(who)}</span><b>${esc(levelLabel(kind,r?.[kind])||'—')}</b>${r?.[`${kind}_note`]?`<p>${own(r[`${kind}_note`])}</p>`:''}</div>`;
  return row('Tu','is-me',me)+row(name,'is-partner',partner);
}
function renderResults(state,ctx={}){
  const name=ctx.partnerName||'La tua persona',me=state?.me||{},partner=state?.partner||{};
  const reacted=me.appreciation_reaction;
  const reactions=REACTIONS.map(([id,label])=>`<button type="button" class="us-checkin-react" data-checkin-react="${id}" aria-pressed="${reacted===id}" aria-label="${esc(label)}">${id==='heart'?`<span class="us-icon" data-us-icon="${reacted===id?'heart-fill':'heart'}" aria-hidden="true"></span>`:esc(label)}</button>`).join('');
  const keep=state?.kept?'<span class="us-checkin-kept" data-checkin-kept><span class="us-icon" data-us-icon="check" aria-hidden="true"></span>In Ricordi</span>'
    :'<button type="button" class="ghost us-checkin-keep" data-checkin-keep>Conserva in Ricordi</button>';
  const theirReaction=partner.appreciation_reaction==='heart'?`${name} ha messo ♥ a quello che hai scritto`:partner.appreciation_reaction==='cry'?`${name} ha risposto: Mi hai commosso`:'';
  const support=[
    partner.support_last?`<p class="us-checkin-line">Alla tua richiesta della settimana scorsa: <b>${esc(SUPPORT_LAST[partner.support_last])}</b></p>`:'',
    partner.support_request?`<div class="us-checkin-ask"><span>Questa settimana ${esc(name)} ti chiede</span><p>${own(partner.support_request)}</p></div>`:'',
    me.support_request?`<div class="us-checkin-ask is-me"><span>Tu hai chiesto</span><p>${own(me.support_request)}</p></div>`:''
  ].join('');
  return `<div class="us-checkin-results">
    <section class="us-checkin-block"><h3>Vicinanza</h3>${pair('closeness',me,partner,name)}${trend(ctx.history,name)}
      ${distantTwice(ctx.history)?'<p class="us-checkin-calm">Due settimane lontani, per tutti e due. Vale la pena parlarne di persona, con calma.</p>':''}</section>
    <section class="us-checkin-block"><h3>Energia</h3>${pair('energy',me,partner,name)}</section>
    <section class="us-checkin-block us-checkin-gift"><h3>${esc(name)} ha apprezzato</h3><blockquote>${own(partner.appreciation)}</blockquote>
      <div class="us-checkin-gift-actions"><div class="us-checkin-reactions" role="group" aria-label="La tua reazione">${reactions}</div>${keep}</div>
      <details class="us-checkin-mine"><summary>Quello che hai scritto tu</summary><p>${own(me.appreciation)}</p>${theirReaction?`<small>${esc(theirReaction)}</small>`:''}</details></section>
    ${support?`<section class="us-checkin-block"><h3>Supporto</h3>${support}</section>`:''}
    <p class="us-checkin-next">Il prossimo punto da lunedì.</p>
  </div>`;
}

// ------------------------------------------------------------------ runtime
function install(w){
  const d=w.document,$=id=>d.getElementById(id),root=$('usCheckinSheet');
  if(!root)return;
  const body=$('usCheckinBody'),row=$('noiCheckinRow');
  let state=null,history=null,owner='',generation=0,loading=null,busy=false,draft=null,step=0,lastAttempt=0,unavailable=false;
  const key=()=>w.usProfile?`${w.usProfile.id}:${w.usProfile.couple_id}`:'';
  const opened=()=>root.classList.contains('open');
  const partnerName=()=>{try{return (typeof w.usIdentity==='function'?w.usIdentity().partnerName:'')||'La tua persona';}catch(_){return 'La tua persona';}};
  const status=m=>{const s=$('usCheckinStatus');if(s)s.textContent=m||'';const r=$('usCheckinRetry');if(r)r.hidden=!m;};
  const reduced=()=>Boolean(w.UsUiFoundation?.isReducedMotion?.());
  // Per-viewer convenience only (which results you already opened): a lost
  // value just shows the "pronto" card once more.
  const seenKey=()=>`us:checkin:seen:${w.usProfile?.id||''}`;
  function seen(){try{return new Set(JSON.parse(w.localStorage.getItem(seenKey())||'[]'));}catch(_){return new Set();}}
  function markSeen(week){try{const s=[...seen(),week].slice(-12);w.localStorage.setItem(seenKey(),JSON.stringify([...new Set(s)]));}catch(_){}}
  function clear(){generation++;state=null;history=null;owner=key();loading=null;busy=false;draft=null;step=0;lastAttempt=0;unavailable=false;close();paintNoi();}
  function notifyOggi(){try{w.refreshTodayPriorities?.();}catch(_){}}
  function paintNoi(){
    if(!row)return;
    const line=!unavailable&&noiLine(state,partnerName());
    row.hidden=!line;if(!line)return;
    row.dataset.checkinPhase=line.phase;
    $('noiCheckinDetail').textContent=line.detail;
    const ask=$('noiCheckinRequest');
    if(ask){ask.hidden=!line.request;ask.textContent=line.request||'';}
  }
  const missingRpc=e=>['PGRST202','42883','PGRST205'].includes(e?.code);
  async function hydrate(){
    if(!key()||typeof sb==='undefined')return null;
    if(key()!==owner)clear();
    if(loading)return loading;
    lastAttempt=Date.now();
    const token=generation,identity=owner;
    const task=(async()=>{
      try{
        const [s,h]=await Promise.all([sb.rpc('get_weekly_checkin_state',{p_week_start:null}),sb.rpc('get_weekly_checkin_history',{p_weeks:8})]);
        if(token!==generation||key()!==identity)return null;
        if(missingRpc(s.error)){unavailable=true;paintNoi();return null;}
        if(s.error||!s.data?.week_start)throw s.error||new Error('invalid_checkin_state');
        state=s.data;history=h.error?history:h.data;unavailable=false;status('');
        paintNoi();notifyOggi();if(opened()&&!draft)paintView();
        return state;
      }catch(err){
        if(token===generation&&key()===identity){console.warn('[US Check-in]',err);if(opened())status('Non riesco a caricare il punto della settimana. Riprova.');}
        return null;
      }
    })();
    loading=task;try{return await task;}finally{if(loading===task)loading=null;}
  }
  function show(html,dir=0){
    body.innerHTML=html;
    const panel=root.querySelector('[data-us-modal-panel]');if(panel)panel.scrollTop=0;
    const el=body.firstElementChild;
    if(dir&&el&&!reduced()&&typeof el.animate==='function')el.animate([{opacity:0,translate:`${dir*28}px 0`},{opacity:1,translate:'0 0'}],{duration:320,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
  function paintView(dir=0){
    const ctx={partnerName:partnerName(),state,history};
    if(draft&&step)return show(renderStep(draft,step,ctx),dir);
    const p=phase(state);
    if(p==='loading')return show('<p class="us-checkin-lead">Un attimo…</p>');
    if(p==='ready'){markSeen(state.week_start);notifyOggi();return show(renderResults(state,ctx),dir);}
    if(p==='waiting')return show(renderWaiting(state,ctx),dir);
    return show(renderIntro(state,ctx),dir);
  }
  function startDraft(){
    const m=state?.me||{};draft={};for(const f of FIELDS)draft[f]=m[f]??null;step=1;paintView(1);
    const t=body.querySelector('textarea,input');if(t&&!('ontouchstart' in w))t.focus?.({preventScroll:true});
  }
  // The open step's fields, read into the draft before moving on.
  function collect(){
    if(!draft)return;
    body.querySelectorAll('[data-checkin-field]').forEach(el=>{draft[el.dataset.checkinField]=el.value;});
  }
  function error(m){const e=$('usCheckinError');if(e)e.textContent=m||'';}
  async function submit(){
    if(busy||!state)return;
    const p=payload(draft,{previousRequest:Boolean(state.previous_request)}),problem=validate(p);
    if(problem){step=3;paintView(-1);return error(problem);}
    busy=true;root.setAttribute('aria-busy','true');
    const token=generation,identity=owner,week=state.week_start;
    body.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{
      const {data,error:err}=await sb.rpc('submit_weekly_checkin',{p_payload:p,p_expected_version:state.me?.version||0});
      if(token!==generation||key()!==identity)return;
      if(err)throw err;
      state=data;draft=null;step=0;w.UsFeedback?.success?.();
      paintView(1);paintNoi();notifyOggi();
      w.toast?.(state.revealed?'Fatto: ecco il vostro punto':'Inviato',{icon:'check',quiet:false});
      // The other is told by the server, which checks the round (send-web-push).
      w.sendWebPushEvent?.('weekly_checkin_answer',week)?.catch?.(()=>{});
      hydrate();
    }catch(err){
      if(token!==generation||key()!==identity)return;
      w.UsFeedback?.error?.();
      const m=String(err?.message||'');
      if(/weekly_checkin_sealed/.test(m)){draft=null;step=0;await hydrate();paintView();status(`Nel frattempo ha risposto anche ${partnerName()}: le risposte ora sono chiuse.`);}
      else if(/weekly_checkin_conflict/.test(m)){await hydrate();status('È cambiato su un altro telefono. Controlla e invia di nuovo.');}
      else if(/weekly_checkin_partner_required/.test(m))status('Serve la tua persona nella coppia per fare il punto.');
      else if(/weekly_checkin_invalid/.test(m))error('Qualcosa non va in una risposta: controlla e riprova.');
      else status('Non inviato. Controlla la connessione e riprova.');
    }finally{
      if(token===generation){busy=false;root.removeAttribute('aria-busy');body.querySelectorAll('button').forEach(b=>b.disabled=false);}
    }
  }
  async function call(rpc,args,apply){
    if(busy||!state)return;
    busy=true;const token=generation,identity=owner;
    try{
      const {data,error:err}=await sb.rpc(rpc,args);
      if(token!==generation||key()!==identity)return;
      if(err)throw err;
      apply(data);w.UsFeedback?.success?.();paintView();
    }catch(err){
      if(token===generation&&key()===identity){w.UsFeedback?.error?.();console.warn('[US Check-in]',err);status('Non salvato. Riprova tra poco.');}
    }finally{if(token===generation)busy=false;}
  }
  function open(){
    if(!key())return;
    if(key()!==owner)clear();
    w.UsUiFoundation?.cancelSurfaceExit?.(root);root.setAttribute('aria-hidden','false');root.classList.add('open');
    status('');if(!draft)paintView();
    hydrate();
  }
  function close(){
    const finish=()=>{root.classList.remove('open');root.setAttribute('aria-hidden','true');};
    if(!opened())return;root.classList.remove('open');
    if(draft){collect();}
    if(!w.UsUiFoundation?.exitSurface?.(root,finish))finish();
  }
  root.querySelectorAll('[data-checkin-close]').forEach(e=>e.addEventListener('click',close));
  $('usCheckinRetry')?.addEventListener('click',()=>{status('');hydrate();});
  row?.addEventListener('click',open);
  body.addEventListener('input',event=>{
    const el=event.target;
    if(el?.dataset?.checkinKind){
      const v=Number(el.value),label=levelLabel(el.dataset.checkinKind,v);
      el.setAttribute('aria-valuetext',label);const out=$('usCheckinLevel');if(out)out.textContent=label;
      if(el.dataset.checkinKind==='closeness'){const note=body.querySelector('[data-checkin-field="closeness_note"]');if(note)note.placeholder=closenessPrompts(v)[0];}
    }
    if(el?.closest?.('.us-checkin-step'))error('');
  });
  body.addEventListener('click',event=>{
    const t=event.target.closest?.('button');if(!t||t.disabled)return;
    if(t.hasAttribute('data-checkin-close'))return close();
    if(t.hasAttribute('data-checkin-start')||t.hasAttribute('data-checkin-edit'))return startDraft();
    if(t.hasAttribute('data-checkin-back')){collect();step=Math.max(1,step-1);return paintView(-1);}
    if(t.hasAttribute('data-checkin-skip')){
      collect();
      if(step===1){draft.closeness=null;draft.closeness_note=null;}
      if(step===2){draft.energy=null;draft.energy_note=null;}
      if(step===4){draft.support_request=null;return submit();}
      step++;return paintView(1);
    }
    if(t.hasAttribute('data-checkin-next')){
      collect();
      if(step===3&&!text(draft.appreciation))return error('Scrivi cosa hai apprezzato: è la parte che arriva all’altra persona.');
      if(step<STEPS){step++;return paintView(1);}
      return submit();
    }
    if(t.dataset.checkinSupport){
      const v=Number(t.dataset.checkinSupport);draft.support_last=level(draft.support_last,3)===v?null:v;
      body.querySelectorAll('[data-checkin-support]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.checkinSupport)===draft.support_last)));
      return;
    }
    if(t.dataset.checkinReact){
      const r=t.dataset.checkinReact,next=state?.me?.appreciation_reaction===r?null:r;
      return call('set_weekly_checkin_reaction',{p_week_start:state.week_start,p_reaction:next},data=>{state=data;});
    }
    if(t.hasAttribute('data-checkin-keep'))return call('keep_weekly_appreciation',{p_week_start:state.week_start},()=>{
      state={...state,kept:true};w.toast?.('Conservato in Ricordi',{icon:'check',quiet:false});
      // Ricordi already drawn: read it again, as after keeping a Daily Question.
      if($('momentsGrid')?.dataset.loaded==='1')Promise.resolve(w.hydrateMoments?.()).catch(()=>{});
    });
  });
  // The other may answer while US is open: re-read at most once a minute,
  // only while Oggi or Noi is on screen. Identity changes reset at once.
  w.setInterval(()=>{
    if(key()!==owner){clear();if(key())hydrate();return;}
    if(d.hidden||!key()||busy||draft)return;
    const onScreen=$('home')?.classList.contains('active')||$('bond')?.classList.contains('active')||opened();
    if(onScreen&&Date.now()-lastAttempt>60000)hydrate();
  },1500);
  d.addEventListener('visibilitychange',()=>{if(!d.hidden&&key()&&Date.now()-lastAttempt>15000)w.setTimeout(()=>hydrate(),1200);});
  if(typeof sb!=='undefined')sb.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')clear();});
  const api=w.UsWeeklyCheckin;
  api.open=open;api.close=close;api.refresh=hydrate;api.reset=clear;
  api.todayPriority=()=>unavailable?null:todayPriority(state,partnerName(),{seen:seen()});
  if(key())hydrate();
}
return {CLOSENESS,ENERGY,SUPPORT_LAST,phase,levelLabel,closenessPrompts,todayPriority,noiLine,payload,validate,distantTwice,renderStep,renderIntro,renderWaiting,renderResults,install};
});
