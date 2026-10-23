// Compagni V1 — at the start nobody sits above the bar; the companions arrive
// with the couple's Sintonia level (get_companions_v1): Maudit at 3, the owl
// at 5, the goat at 8, the dragon at 11. They never grow. Each member
// chooses, on this phone, which unlocked companion sits above the bar
// (pet.js). A new arrival is told once on Oggi. Spec: docs/missions/companions-v1.md.
(function(global,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  global.UsCompanions=api;api.install(global);
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CATALOG=Object.freeze([
  {id:'maudit',name:'Maudit',arrived:'È arrivato Maudit',hint:'Arriva al livello 3 di Sintonia'},
  {id:'owl',name:'Il gufetto',arrived:'È arrivato il gufetto',hint:'Arriva al livello 5 di Sintonia'},
  {id:'goat',name:'La capretta',arrived:'È arrivata la capretta',hint:'Arriva al livello 8 di Sintonia'},
  {id:'dragon',name:'Il draghetto',arrived:'È arrivato il draghetto',hint:'Arriva al livello 11 di Sintonia'}
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
    title:c.arrived,detail:'Un nuovo compagno per voi',action:'companion',actionLabel:'Guardalo'};
}
function renderGrid(list,current){
  return (list||[]).map(row=>{
    const c=byId(row.id);if(!c)return '';
    if(!row.unlocked)return `<li class="us-companion is-locked"><span class="us-companion-art" aria-hidden="true"><img src="${awake(c.id)}" alt="" draggable="false"></span><span class="us-companion-copy"><b>${esc(c.name)}</b><small>${esc(c.hint)}</small></span><span class="us-companion-mark" aria-hidden="true"><span class="us-icon" data-us-icon="lock-simple"></span></span></li>`;
    const on=c.id===current;
    return `<li class="us-companion${on?' is-on':''}"><button type="button" data-companion="${esc(c.id)}" aria-pressed="${on?'true':'false'}"><span class="us-companion-art" aria-hidden="true"><img src="${awake(c.id)}" alt="" draggable="false"></span><span class="us-companion-copy"><b>${esc(c.name)}</b><small>${on?'È con te':'Tocca per sceglierlo'}</small></span><span class="us-companion-mark" aria-hidden="true">${on?'<span class="us-icon" data-us-icon="check"></span>':''}</span></button></li>`;
  }).join('');
}

function install(w){
  const d=w.document,$=id=>d.getElementById(id),root=$('usCompanionsSheet');
  if(!root)return;
  const grid=$('usCompanionsGrid'),row=$('noiCompanionsRow');
  let list=normalize(null),owner='',token=0,ready=false;
  const key=()=>w.usProfile?`${w.usProfile.id}:${w.usProfile.couple_id}`:'';
  const seenKey=()=>`us:companions:v1:seen:${key()}`;
  function seen(){try{return new Set(JSON.parse(w.localStorage.getItem(seenKey())||'[]'));}catch(_){return new Set();}}
  function markSeen(ids){try{w.localStorage.setItem(seenKey(),JSON.stringify([...new Set([...seen(),...ids])]));}catch(_){}}
  const current=()=>w.USPet?.companion?.()||'none';
  const opened=()=>root.classList.contains('open');
  function paint(){grid.innerHTML=renderGrid(list,current());w.UsUiFoundation?.hydrateIcons?.(grid);}
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
      // Only a real answer may send the chosen companion back to Maudit.
      if(error||!Array.isArray(data?.companions))throw error||new Error('invalid_companions');
      list=normalize(data);ready=true;enforce();
      if(opened())paint();
      w.UsTodayPriority?.refresh?.();
    }catch(err){if(mine===token)console.warn('[US Compagni]',err);}
  }
  function open(){
    if(!key())return;
    w.UsUiFoundation?.cancelSurfaceExit?.(root);root.setAttribute('aria-hidden','false');root.classList.add('open');
    markSeen(list.filter(c=>c.unlocked).map(c=>c.id));
    paint();hydrate();
  }
  function close(){
    const finish=()=>{root.classList.remove('open');root.setAttribute('aria-hidden','true');};
    if(!opened())return;root.classList.remove('open');
    if(!w.UsUiFoundation?.exitSurface?.(root,finish))finish();
  }
  function reset(){token++;list=normalize(null);ready=false;owner='';close();}
  root.addEventListener('click',event=>{
    if(event.target.closest('[data-companions-close]'))return close();
    const pick=event.target.closest('[data-companion]');
    if(!pick)return;
    const id=pick.dataset.companion;
    if(!list.some(c=>c.id===id&&c.unlocked))return;
    w.USPet?.setCompanion?.(id);w.UsFeedback?.tap?.();paint();
  });
  row?.addEventListener('click',open);
  const showRow=()=>{if(row)row.hidden=!key();};
  showRow();
  w.setInterval(()=>{
    if(key()!==owner){if(opened())close();list=normalize(null);ready=false;if(key())hydrate();}
    showRow();
  },2000);
  // A level reached while US was in the background shows up on the way back.
  d.addEventListener('visibilitychange',()=>{if(!d.hidden&&key())hydrate();});
  if(key())hydrate();
  const api=w.UsCompanions;
  api.open=open;api.close=close;api.reset=reset;api.refresh=hydrate;
  api.todayPriority=()=>ready?todayPriority(list,seen()):null;
}
return {CATALOG,normalize,companionFor,todayPriority,renderGrid,install};
});
