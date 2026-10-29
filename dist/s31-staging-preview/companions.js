// Compagni V1 — at the start nobody sits above the bar; the companions arrive
// with the couple's Sintonia level (get_companions_v1): Maudit at 3, the owl
// at 5, the goat at 8, the dragon at 11. They never grow. Each member
// chooses, on this phone, which unlocked companion sits above the bar
// (pet.js), among the unlockables of Sintonia (progression.js). A new
// arrival is told once on Oggi. Spec: docs/missions/companions-v1.md.
(function(global,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  global.UsCompanions=api;api.install(global);
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const CATALOG=Object.freeze([
  {id:'maudit',name:'Maudit',arrived:'È arrivato Maudit',level:3},
  {id:'owl',name:'Milo',arrived:'È arrivato Milo',level:5},
  {id:'goat',name:'Bea',arrived:'È arrivata Bea',level:8},
  {id:'dragon',name:'Firix',arrived:'È arrivato Firix',level:11}
]);
const byId=id=>CATALOG.find(c=>c.id===id);
const awake=id=>{const v=id==='maudit'?'v2':'v1';return `/assets/derived/pet/us-pet-${id}-awake-${v}.webp`;};

// The server answer, reduced to what the catalog knows.
function normalize(data){
  const rows=Array.isArray(data?.companions)?data.companions:[];
  return CATALOG.map(c=>{const r=rows.find(x=>x?.id===c.id);return {id:c.id,unlocked:r?.unlocked===true,unlocked_at:r?.unlocked_at||null};});
}
// Who sits above the bar on this phone: the chosen one while it is unlocked,
// otherwise Maudit once it has arrived, otherwise nobody.
function companionFor(list,current){
  const open=id=>(list||[]).some(c=>c.id===id&&c.unlocked);
  if(current!=='none'&&open(current))return current;
  return open('maudit')?'maudit':'none';
}
// The first arrival this member has not been told about yet.
function todayPriority(list,seen){
  const next=(list||[]).filter(c=>c.unlocked&&!seen?.has?.(c.id))
    .sort((a,b)=>String(a.unlocked_at||'').localeCompare(String(b.unlocked_at||'')))[0];
  if(!next)return null;
  const c=byId(next.id);
  return {id:`companion:${c.id}`,factKey:`companion:${c.id}`,arrivalType:'companion',category:'celebration',attention:true,
    title:c.arrived,detail:'Un nuovo compagno, in Sintonia',action:'companion',actionLabel:'Guardalo'};
}
function install(w){
  const d=w.document;
  let list=normalize(null),owner='',token=0,ready=false;
  const key=()=>w.usProfile?`${w.usProfile.id}:${w.usProfile.couple_id}`:'';
  const seenKey=()=>`us:companions:v1:seen:${key()}`;
  function seen(){try{return new Set(JSON.parse(w.localStorage.getItem(seenKey())||'[]'));}catch(_){return new Set();}}
  function markSeen(ids){try{w.localStorage.setItem(seenKey(),JSON.stringify([...new Set([...seen(),...ids])]));}catch(_){}}
  const current=()=>w.USPet?.companion?.()||'none';
  const announce=()=>{try{w.dispatchEvent(new w.CustomEvent('us:companions-updated'));}catch(_){}};
  // The chosen companion must still be unlocked for this couple (a new couple starts with nobody).
  function enforce(){
    const id=current(),next=companionFor(list,id);
    if(next!==id)w.USPet?.setCompanion?.(next);
  }
  async function hydrate(){
    if(!key()||typeof sb==='undefined')return;
    owner=key();const mine=++token;
    try{
      const {data,error}=await sb.rpc('get_companions_v1');
      if(mine!==token||key()!==owner)return;
      // Only a real answer may send the chosen companion back.
      if(error||!Array.isArray(data?.companions))throw error||new Error('invalid_companions');
      list=normalize(data);ready=true;
      // A phone that never stored a choice already showed Maudit: it is not news there.
      let fresh=false;try{fresh=w.localStorage.getItem('us:pet:v1:companion')===null;}catch(_){}
      if(fresh&&list.some(c=>c.id==='maudit'&&c.unlocked))markSeen(['maudit']);
      enforce();announce();
      w.UsTodayPriority?.refresh?.();
    }catch(err){if(mine===token)console.warn('[US Compagni]',err);}
  }
  // Sintonia (progression.js) shows them among the unlockables; a tap chooses.
  function choose(id){
    if(!list.some(c=>c.id===id&&c.unlocked))return false;
    const ok=w.USPet?.setCompanion?.(id)!==false;
    if(ok){markSeen([id]);announce();}
    return ok;
  }
  // The arrival on Oggi opens Gioca > Sintonia on the Compagni group.
  function open(){
    markSeen(list.filter(c=>c.unlocked).map(c=>c.id));
    w.USNoiV2?.openSintonia?.();
    w.setTimeout(()=>{w.USProgression?.showCategory?.('companion');d.getElementById('usProgressionRewards')?.scrollIntoView?.({block:'center'});},120);
  }
  function reset(){token++;list=normalize(null);ready=false;owner='';announce();}
  w.setInterval(()=>{
    if(key()!==owner){list=normalize(null);ready=false;announce();if(key())hydrate();}
  },2000);
  // A level reached while US was in the background shows up on the way back.
  d.addEventListener('visibilitychange',()=>{if(!d.hidden&&key())hydrate();});
  // A new Sintonia level can bring a companion: ask again only when the level changes.
  let level=0;
  w.addEventListener?.('us:progression-updated',()=>{const now=Number(w.USProgression?.getState?.()?.level)||0;if(now&&now!==level){const before=level;level=now;if(before&&key())hydrate();}});
  if(key())hydrate();
  const api=w.UsCompanions;
  api.open=open;api.reset=reset;api.refresh=hydrate;api.choose=choose;
  api.list=()=>ready?list.map(row=>({...byId(row.id),...row,art:awake(row.id)})):[];
  api.current=current;
  api.todayPriority=()=>ready?todayPriority(list,seen()):null;
}
return {CATALOG,normalize,companionFor,todayPriority,install};
});
