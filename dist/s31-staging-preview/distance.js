// Accoglienza V1 — one question for the couple: "vi vedete spesso o vivete
// lontani?". The answer (couples.distance_mode: near or far) chooses the
// weekly missions when the two locations are not shared. It is asked once
// on Oggi and can be changed in Settings › Voi. Spec: docs/missions/accoglienza-v1.md.
(function(global,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  global.UsDistance=api;api.install(global);
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const MODES=Object.freeze(['near','far']);
const VALUE=Object.freeze({near:'Spesso',far:'A distanza'});

// Oggi asks once, while the couple has not answered and this member has not opened it.
function todayPriority(state,seen){
  if(!state?.known||state.mode||seen)return null;
  return {id:'distance:ask',factKey:'distance:ask',arrivalType:'distance',category:'waiting_for_me',attention:true,
    title:'Una domanda per voi',detail:'Vi vedete spesso o vivete lontani?',action:'distance',actionLabel:'Rispondi'};
}
const settingValue=mode=>VALUE[mode]||'Da scegliere';

function install(w){
  const d=w.document,$=id=>d.getElementById(id),root=$('usDistanceSheet');
  if(!root)return;
  let state={known:false,mode:null},owner='',token=0,saving=false;
  const key=()=>w.usProfile?`${w.usProfile.id}:${w.usProfile.couple_id}`:'';
  const seenKey=()=>`us:distance:v1:asked:${key()}`;
  const seen=()=>{try{return w.localStorage.getItem(seenKey())==='1';}catch(_){return false;}};
  const markSeen=()=>{try{w.localStorage.setItem(seenKey(),'1');}catch(_){}};
  const opened=()=>root.classList.contains('open');
  function paint(){
    const value=$('usDistanceValue');if(value)value.textContent=settingValue(state.mode);
    root.querySelectorAll('[data-distance]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.distance===state.mode?'true':'false'));
  }
  async function hydrate(){
    if(!key()||typeof sb==='undefined')return;
    owner=key();const mine=++token;
    try{
      const {data,error}=await sb.from('couples').select('distance_mode').eq('id',w.usProfile.couple_id).maybeSingle();
      if(mine!==token||key()!==owner)return;
      if(error)throw error;
      state={known:true,mode:MODES.includes(data?.distance_mode)?data.distance_mode:null};
      paint();w.UsTodayPriority?.refresh?.();
    }catch(err){if(mine===token)console.warn('[US Accoglienza]',err);}
  }
  function open(){
    if(!key())return;
    markSeen();paint();
    w.UsUiFoundation?.cancelSurfaceExit?.(root);root.setAttribute('aria-hidden','false');root.classList.add('open');
  }
  function close(){
    const finish=()=>{root.classList.remove('open');root.setAttribute('aria-hidden','true');};
    if(!opened())return;root.classList.remove('open');
    if(!w.UsUiFoundation?.exitSurface?.(root,finish))finish();
    w.UsTodayPriority?.refresh?.();
  }
  async function choose(mode,button){
    if(!MODES.includes(mode)||saving||!key()||typeof sb==='undefined')return false;
    saving=true;const mine=key();
    try{
      const {error}=await sb.from('couples').update({distance_mode:mode}).eq('id',w.usProfile.couple_id);
      if(key()!==mine)return false;
      if(error)throw error;
      state={known:true,mode};paint();
      w.UsUiFoundation?.done?.(button);
      w.toast?.('Grazie: le missioni ora sono pensate per voi',{icon:'check',quiet:false});
      w.setTimeout(close,420);
      return true;
    }catch(err){
      console.warn('[US Accoglienza]',err);w.UsFeedback?.error?.();
      w.toast?.('Non riesco a salvarlo. Riprova.');
      return false;
    }finally{saving=false;}
  }
  function reset(){token++;state={known:false,mode:null};owner='';close();paint();}
  root.addEventListener('click',event=>{
    if(event.target.closest('[data-distance-close]'))return close();
    const pick=event.target.closest('[data-distance]');
    if(pick)choose(pick.dataset.distance,pick);
  });
  w.setInterval(()=>{if(key()!==owner){state={known:false,mode:null};if(key())hydrate();}},2000);
  // The partner may have answered meanwhile.
  d.addEventListener('visibilitychange',()=>{if(!d.hidden&&key())hydrate();});
  if(key())hydrate();
  const api=w.UsDistance;
  api.open=open;api.close=close;api.reset=reset;api.refresh=hydrate;api.choose=choose;
  api.todayPriority=()=>todayPriority(state,seen());
  api.current=()=>state.mode;
}
return {MODES,todayPriority,settingValue,install};
});
