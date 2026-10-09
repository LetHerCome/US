// US Noi V2 — visual calendar hub and Gioca/Sintonia tabs.
// Read-only month display: the shared Calendar/Events surfaces remain write authorities.
(() => {
'use strict';
if (window.__usNoiV2Installed) return;
window.__usNoiV2Installed = true;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const months = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const weekdays = ['L','M','M','G','V','S','D'];
const pad = n => String(n).padStart(2,'0');
const iso = (y,m,d) => `${y}-${pad(m+1)}-${pad(d)}`;
const today = () => {const d=new Date();return iso(d.getFullYear(),d.getMonth(),d.getDate());};
const dateOf = value => {const [y,m,d]=String(value).split('-').map(Number);return new Date(y,m-1,d,12);};
const currentMonth = () => {const d=new Date();return [d.getFullYear(),d.getMonth()];};
let [year,month] = currentMonth();
let selected = today();
let mode = 'calendar';
let snapshot = null;
let requestSeq = 0;
let pending = false;
let error = '';
let refreshedAt = 0;
let identity = null;
let giocaTab = 'giochi';

function identityKey() {
  const p=window.usProfile;
  return p ? `${p.id}:${p.couple_id}` : null;
}
function monthMatch(dateString) {
  const d=String(dateString||'');
  return d.startsWith(`${year}-${pad(month+1)}-`);
}
function recurringDate(event) {
  const raw=String(event.event_date||'');
  if (!raw) return '';
  if (!event.recurs_yearly) return monthMatch(raw) ? raw : '';
  const parts=raw.split('-').map(Number);
  if(parts.length!==3||parts[1]!==month+1) return '';
  return iso(year,month,Math.min(parts[2],new Date(year,month+1,0).getDate()));
}
function relationshipDate() {
  const raw=snapshot?.startedOn;
  if (!raw) return '';
  const parts=String(raw).split('-').map(Number);
  if(parts.length!==3||parts.some(n=>!Number.isInteger(n))||parts[0]>year||parts[1]!==month+1)return '';
  return iso(year,month,Math.min(parts[2],new Date(year,month+1,0).getDate()));
}
function itemsByDate() {
  const map=new Map();
  const push=(day,item)=>{
    if(!day)return;
    if(!map.has(day))map.set(day,[]);
    map.get(day).push(item);
  };
  for(const e of snapshot?.appointments||[]){
    for(const date of e.dates||[])push(date,{kind:'calendar',id:e.id,title:e.title||'Impegno',time:e.is_all_day?'Tutto il giorno':new Date(e.starts_at).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})});
  }
  for(const e of snapshot?.events||[]){
    const day=recurringDate(e);
    push(day,{kind:'event',id:e.id,title:e.title||'Evento',time:e.event_time?String(e.event_time).slice(0,5):'Una data speciale'});
  }
  const special=relationshipDate();
  if(special)push(special,{kind:'relationship',title:'Il nostro giorno',time:'La vostra storia'});
  return map;
}
function dayLabel(day){return dateOf(day).toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});}
function thumb(item) {
  const icon=item.kind==='calendar'?'calendar-dots':'heart';
  return `<span class="us-noi-v2-item-icon" data-type="${esc(item.kind)}" aria-hidden="true"><span class="us-icon" data-us-icon="${icon}"></span></span>`;
}
function itemMarkup(day,item) {
  const action=item.kind==='calendar'?'entry':item.kind==='event'?'event':'anniversary';
  return `<button type="button" class="us-noi-v2-item" data-noi-item="${action}" data-day="${esc(day)}" data-id="${esc(item.id||'')}">
    ${thumb(item)}<span class="us-noi-v2-item-copy"><b>${esc(item.title)}</b><small>${esc(item.time)}</small></span><span class="us-noi-v2-caret" aria-hidden="true">›</span>
  </button>`;
}
function calendarMarkup(index) {
  const first=new Date(year,month,1,12);
  const offset=(first.getDay()+6)%7;
  const count=new Date(year,month+1,0).getDate();
  const slots=42;
  const header=weekdays.map(day=>`<span class="us-noi-v2-weekday">${day}</span>`).join('');
  const days=Array.from({length:slots},(_,i)=>{
    const n=i-offset+1,valid=n>0&&n<=count;
    if(!valid)return '<span class="us-noi-v2-blank" aria-hidden="true"></span>';
    const day=iso(year,month,n),todayFlag=day===today(),active=day===selected;
    const marks=index.get(day)||[];
    const type=marks.some(x=>x.kind==='relationship')?'relationship':marks.some(x=>x.kind==='event')?'event':marks.length?'calendar':'none';
    return `<button type="button" class="us-noi-v2-day${active?' is-selected':''}${todayFlag?' is-today':''}" data-noi-day="${day}" aria-pressed="${active}" ${todayFlag?'aria-current="date"':''} aria-label="${esc(dayLabel(day))}, ${marks.length} momenti">
      <span class="us-noi-v2-day-number">${n}</span><span class="us-noi-v2-day-mark" data-kind="${type}" aria-hidden="true"></span>
    </button>`;
  }).join('');
  return `<div class="us-noi-v2-calendar" role="group" aria-label="Calendario del mese"><div class="us-noi-v2-weekdays">${header}</div><div class="us-noi-v2-grid">${days}</div></div>`;
}
function listMarkup(index) {
  const days=[...index.keys()].filter(monthMatch).sort();
  if(!days.length)return '<p class="us-noi-v2-empty">Nessun appuntamento o evento in questo mese. Potete aggiungerne uno quando volete.</p>';
  return `<div class="us-noi-v2-month-list">${days.map(day=>`<div class="us-noi-v2-month-day"><button type="button" class="us-noi-v2-list-date" data-noi-day="${day}">${esc(dayLabel(day))}</button>${index.get(day).map(item=>itemMarkup(day,item)).join('')}</div>`).join('')}</div>`;
}
function render(){
  const root=$('usNoiV2');
  if(!root)return;
  const label=$('usNoiV2Month');
  if(label)label.textContent=`${months[month][0].toUpperCase()+months[month].slice(1)} ${year}`;
  for(const type of ['calendar','list']){
    const btn=$(`usNoiV2Mode${type==='calendar'?'Calendar':'List'}`);
    if(btn){btn.setAttribute('aria-pressed',String(mode===type));btn.classList.toggle('is-active',mode===type);}
  }
  const container=$('usNoiV2Content'),detail=$('usNoiV2Detail');
  if(!container||!detail)return;
  if(pending&&!snapshot){container.innerHTML='<p class="us-noi-v2-empty" role="status">Carico il calendario…</p>';detail.innerHTML='';return;}
  if(error&&!snapshot){container.innerHTML=`<p class="us-noi-v2-empty" role="status">Calendario non disponibile. <button type="button" data-noi-retry>Riprova</button></p>`;detail.innerHTML='';return;}
  const index=itemsByDate();
  container.innerHTML=mode==='calendar'?calendarMarkup(index):listMarkup(index);
  const active=index.get(selected)||[];
  detail.innerHTML=`<div class="us-noi-v2-detail-head"><div><small>I VOSTRI MOMENTI</small><h3>${esc(dayLabel(selected))}</h3></div><button type="button" class="us-noi-v2-add" data-noi-add aria-label="Aggiungi un impegno" title="Aggiungi">+</button></div>
    ${active.length?`<div class="us-noi-v2-day-items">${active.map(item=>itemMarkup(selected,item)).join('')}</div>`:'<p class="us-noi-v2-empty-day">Ancora nessun evento in questo giorno. Lo spazio è vostro.</p>'}`;
}
async function refresh({force=false}={}){
  const key=identityKey();
  if(!key){identity=null;snapshot=null;error='';render();return;}
  if(key!==identity){snapshot=null;refreshedAt=0;identity=key;}
  if(pending&&!force)return;
  if(!force&&snapshot&&Date.now()-refreshedAt<60000){render();return;}
  const source=window.USNoiCalendarRead?.readMonth;
  if(typeof source!=='function')return;
  const token=++requestSeq, monthKey=`${year}-${month}`;
  pending=true;error='';render();
  try{
    const data=await source(year,month);
    if(token!==requestSeq||key!==identityKey()||monthKey!==`${year}-${month}`)return;
    if(data){snapshot=data;refreshedAt=Date.now();}
  }catch(e){
    if(token===requestSeq&&key===identityKey()){error='Non disponibile';console.warn('[US Noi V2] calendar read',e);}
  }finally{
    if(token===requestSeq){pending=false;render();}
  }
}
function shiftMonth(delta){
  const next=new Date(year,month+delta,1,12);year=next.getFullYear();month=next.getMonth();
  const now=today();selected=monthMatch(now)?now:iso(year,month,1);
  snapshot=null;refreshedAt=0;requestSeq++;pending=false;refresh({force:true});
}
function chooseDay(day) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;
  const d=dateOf(day);
  if(d.getFullYear()!==year||d.getMonth()!==month)return;
  selected=day;render();
}
function setTab(tab){
  giocaTab=tab==='sintonia'?'sintonia':'giochi';
  const game=$('usGiocaGames'),syn=$('usGiocaSintonia');
  if(!game||!syn)return;
  const active=giocaTab==='sintonia';
  game.hidden=active;syn.hidden=!active;
  $('usGiocaTabGames')?.setAttribute('aria-selected',String(!active));
  $('usGiocaTabSintonia')?.setAttribute('aria-selected',String(active));
  $('usGiocaTabGames')?.setAttribute('tabindex',active?'-1':'0');
  $('usGiocaTabSintonia')?.setAttribute('tabindex',active?'0':'-1');
  if(active){
    window.hydrateBond?.();
    window.hydrateResonanceHistory?.();
    window.USProgression?.hydrate?.({showUnlocks:true,force:true});
  }
}
function moveSintonia(){
  const target=$('usGiocaSintonia');
  if(!target||target.dataset.ready)return;
  const selectors=['.noi-resonance','.us-progression-next','.us-progression-rewards-section','.noi-resonance-history','.noi-resonance-guide'];
  for(const selector of selectors){
    const element=document.querySelector(`#bond .noi-canonical-page > ${selector}`);
    if(element)target.appendChild(element);
  }
  target.dataset.ready='1';
}
function boot(){
  moveSintonia();setTab('giochi');render();
  // Main-nav tap always returns to Giochi; explicit Sintonia deep links remain available.
  document.querySelector('.nav button[data-page="quiz"]')?.addEventListener('click',()=>setTab('giochi'),true);
  $('usGiocaTabGames')?.addEventListener('click',()=>setTab('giochi'));
  $('usGiocaTabSintonia')?.addEventListener('click',()=>{window.USGameV2?.showHub?.();setTab('sintonia');});
  $('usNoiV2ModeCalendar')?.addEventListener('click',()=>{mode='calendar';render();});
  $('usNoiV2ModeList')?.addEventListener('click',()=>{mode='list';render();});
  $('usNoiV2Prev')?.addEventListener('click',()=>shiftMonth(-1));
  $('usNoiV2Next')?.addEventListener('click',()=>shiftMonth(1));
  $('usNoiV2Today')?.addEventListener('click',()=>{[year,month]=currentMonth();selected=today();snapshot=null;refreshedAt=0;requestSeq++;pending=false;refresh({force:true});});
  $('usNoiV2First')?.addEventListener('click',async()=>{
    const start=snapshot?.startedOn;
    if(!start)return;
    const d=dateOf(start);year=d.getFullYear();month=d.getMonth();selected=start;
    snapshot=null;refreshedAt=0;requestSeq++;pending=false;refresh({force:true});
  });
  $('usNoiV2')?.addEventListener('click',e=>{
    const day=e.target.closest('[data-noi-day]');if(day){chooseDay(day.dataset.noiDay);return;}
    if(e.target.closest('[data-noi-retry]')){refresh({force:true});return;}
    if(e.target.closest('[data-noi-add]')){window.openCalendarSurface?.(selected);return;}
    const item=e.target.closest('[data-noi-item]');
    if(item){
      const kind=item.dataset.noiItem;
      if(kind==='entry'&&item.dataset.id)window.UsCalendarLinks?.openEntry?.(item.dataset.id);
      else if(kind==='event')window.openEvents?.();
      else window.openCalendarSurface?.(item.dataset.day);
      return;
    }
    if(e.target.closest('[data-noi-open-link]')){
      const link=e.target.closest('[data-noi-open-link]').dataset.noiOpenLink;
      if(link==='lavagna')window.openCalendarSurface?.(selected);
      if(link==='quest'||link==='eventi')window.openNoiSection?.(link);
    }
  });
  const bond=$('bond');
  if(bond){
    const observer=new MutationObserver(()=>{if(bond.classList.contains('active'))refresh();});
    observer.observe(bond,{attributes:true,attributeFilter:['class']});
  }
  for(const id of ['usCalendarOverlay','usEventsOverlay']){
    const overlay=$(id);
    if(overlay)new MutationObserver(()=>{if(overlay.getAttribute('aria-hidden')==='true'&&$('bond')?.classList.contains('active'))refresh({force:true});}).observe(overlay,{attributes:true,attributeFilter:['aria-hidden']});
  }
  window.addEventListener('us-identity-change',()=>{
    requestSeq++;pending=false;identity=null;snapshot=null;refreshedAt=0;error='';
    if($('bond')?.classList.contains('active'))refresh();else render();
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('bond')?.classList.contains('active'))refresh();});
  if($('bond')?.classList.contains('active'))refresh();
}
window.USNoiV2=Object.freeze({
  openGames:()=>setTab('giochi'),
  openSintonia:()=>{window.openQuizHub?.({nav:true});setTab('sintonia');},
  refresh:()=>refresh({force:true}),
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();
