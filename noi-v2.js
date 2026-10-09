// US Noi V2 — visual calendar hub and Gioca/Sintonia tabs.
// Read-only month display: the shared Calendar/Events surfaces remain write authorities.
(() => {
'use strict';
if (window.__usNoiV2Installed) return;
window.__usNoiV2Installed = true;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const months = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const weekdays = [['L','lunedì'],['M','martedì'],['M','mercoledì'],['G','giovedì'],['V','venerdì'],['S','sabato'],['D','domenica']];
const pad = n => String(n).padStart(2,'0');
const iso = (y,m,d) => `${y}-${pad(m+1)}-${pad(d)}`;
const today = () => {const d=new Date();return iso(d.getFullYear(),d.getMonth(),d.getDate());};
const dateOf = value => {const [y,m,d]=String(value).split('-').map(Number);return new Date(y,m-1,d,12);};
const currentMonth = () => {const d=new Date();return [d.getFullYear(),d.getMonth()];};
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const icon = name => `<span class="us-icon" data-us-icon="${name}" aria-hidden="true"></span>`;
let [year,month] = currentMonth();
let selected = today();
let mode = 'calendar'; // calendar | list | week — one calendar in Noi
let ideaPick = null;
let snapshot = null;
let requestSeq = 0;
let pending = false;
let error = '';
let refreshedAt = 0;
let identity = null;
let giocaTab = 'giochi';
let enterDirection = 0;

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
  if(parts.length!==3||parts[1]!==month+1||parts[0]>year) return '';
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
  const special=relationshipDate();
  if(special)push(special,{kind:'relationship',title:'Il nostro giorno',time:special===snapshot?.startedOn?'Dove è iniziato tutto':'Anniversario',sort:'00:00'});
  for(const e of snapshot?.events||[]){
    const day=recurringDate(e);
    const time=e.event_time?String(e.event_time).slice(0,5):'';
    push(day,{kind:'event',id:e.id,title:e.title||'Evento',time:time||(e.recurs_yearly?'Ogni anno':'Una data speciale'),sort:time||'00:01'});
  }
  for(const e of snapshot?.appointments||[]){
    const time=e.is_all_day?'':new Date(e.starts_at).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
    for(const date of e.dates||[])push(date,{kind:'calendar',id:e.id,title:e.title||'Impegno',time:time||'Tutto il giorno',sort:time||'00:02'});
  }
  for(const list of map.values())list.sort((a,b)=>a.sort.localeCompare(b.sort));
  return map;
}
function dayLabel(day){return dateOf(day).toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});}
function relativeLabel(day){
  const delta=Math.round((dateOf(day)-dateOf(today()))/86400000);
  return delta===0?'OGGI':delta===1?'DOMANI':delta===-1?'IERI':'I VOSTRI MOMENTI';
}
function thumb(item) {
  const name=item.kind==='calendar'?'calendar-dots':item.kind==='relationship'?'heart-fill':'calendar-heart';
  return `<span class="us-noi-v2-item-icon" data-type="${esc(item.kind)}" aria-hidden="true">${icon(name)}</span>`;
}
function itemMarkup(day,item) {
  const action=item.kind==='calendar'?'entry':item.kind==='event'?'event':'anniversary';
  return `<button type="button" class="us-noi-v2-item" data-noi-item="${action}" data-day="${esc(day)}" data-id="${esc(item.id||'')}">
    ${thumb(item)}<span class="us-noi-v2-item-copy"><b>${esc(item.title)}</b><small>${esc(item.time)}</small></span><span class="us-noi-v2-caret" aria-hidden="true">${icon('caret-right')}</span>
  </button>`;
}
// Only the weeks this month actually spans: 4–6 rows, never an empty sixth row.
function calendarMarkup(index) {
  const first=new Date(year,month,1,12);
  const offset=(first.getDay()+6)%7;
  const count=new Date(year,month+1,0).getDate();
  const slots=Math.ceil((offset+count)/7)*7;
  const now=today();
  const header=weekdays.map(([short,long])=>`<abbr class="us-noi-v2-weekday" title="${long}">${short}</abbr>`).join('');
  const days=Array.from({length:slots},(_,i)=>{
    const n=i-offset+1,valid=n>0&&n<=count;
    if(!valid)return '<span class="us-noi-v2-blank" aria-hidden="true"></span>';
    const day=iso(year,month,n),todayFlag=day===now,active=day===selected;
    const marks=index.get(day)||[];
    const kinds=['relationship','event','calendar'].filter(kind=>marks.some(x=>x.kind===kind));
    const dots=kinds.map(kind=>`<i data-kind="${kind}"></i>`).join('');
    const moments=marks.length===1?'1 momento':marks.length?`${marks.length} momenti`:'nessun momento';
    return `<button type="button" class="us-noi-v2-day${active?' is-selected':''}${todayFlag?' is-today':''}${day<now?' is-past':''}" data-noi-day="${day}" aria-pressed="${active}" ${todayFlag?'aria-current="date"':''} aria-label="${esc(dayLabel(day))}${todayFlag?', oggi':''}, ${moments}">
      <span class="us-noi-v2-day-number">${n}</span><span class="us-noi-v2-day-marks" aria-hidden="true">${dots}</span>
    </button>`;
  }).join('');
  return `<div class="us-noi-v2-calendar" role="group" aria-label="Calendario di ${months[month]} ${year}"><div class="us-noi-v2-weekdays" aria-hidden="true">${header}</div><div class="us-noi-v2-grid" data-weeks="${slots/7}">${days}</div></div>`;
}
function listMarkup(index) {
  const days=[...index.keys()].filter(monthMatch).sort();
  if(!days.length)return `<div class="us-noi-v2-empty-month">${icon('calendar-heart')}<b>Un mese ancora da scrivere</b><small>Nessun impegno o evento a ${months[month]}.</small><button type="button" class="us-noi-v2-text-action" data-noi-add>Aggiungi un impegno</button></div>`;
  return `<div class="us-noi-v2-month-list">${days.map(day=>`<section class="us-noi-v2-month-day${day===today()?' is-today':''}" aria-label="${esc(dayLabel(day))}"><button type="button" class="us-noi-v2-list-date" data-noi-day="${day}" data-noi-focus-list><span>${esc(dayLabel(day))}</span>${day===today()?'<em>Oggi</em>':''}</button>${index.get(day).map(item=>itemMarkup(day,item)).join('')}</section>`).join('')}</div>`;
}
function weekMarkup(index) {
  const date = dateOf(selected);
  const monday = new Date(date.getFullYear(),date.getMonth(),date.getDate()-((date.getDay()+6)%7),12);
  const days=Array.from({length:7},(_,i)=>{
    const when=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+i,12);
    const day=iso(when.getFullYear(),when.getMonth(),when.getDate());
    const items=index.get(day)||[];
    const active=day===selected;
    return `<section class="us-noi-v2-week-row${active?' is-selected':''}">
      <button type="button" class="us-noi-v2-list-date" data-noi-day="${day}" aria-pressed="${active}">${esc(dayLabel(day))}${day===today()?'<em>Oggi</em>':''}</button>
      ${items.length?items.map(item=>itemMarkup(day,item)).join(''):'<small class="us-noi-v2-week-empty">Nessun impegno</small>'}
    </section>`;
  }).join('');
  return `<div class="us-noi-v2-week-list" role="group" aria-label="La vostra settimana">${days}</div>`;
}
function detailMarkup(index) {
  const active=index.get(selected)||[];
  const head=`<div class="us-noi-v2-detail-head"><div><small>${relativeLabel(selected)}</small><h3>${esc(dayLabel(selected))}</h3></div></div>`;
  if(active.length)return `${head}<div class="us-noi-v2-day-items">${active.map(item=>itemMarkup(selected,item)).join('')}</div>`;
  const copy=pending&&!snapshot?'Carico i vostri momenti…':'Nessun momento in questo giorno. Lo spazio è vostro.';
  return `${head}<p class="us-noi-v2-empty-day">${copy}</p>`;
}
function syncStatus(){
  const status=$('usNoiV2Sync');
  if(!status)return;
  const text=pending?'Aggiorno…':error&&snapshot?'Non aggiornato':'';
  status.textContent=text;
  status.dataset.state=pending?'loading':error?'error':'idle';
}
// One light slide+fade on month change; never while reduced motion is requested.
function playEnter(container,direction){
  if(!direction||reducedMotion())return;
  const grid=container.querySelector('.us-noi-v2-grid,.us-noi-v2-month-list,.us-noi-v2-empty-month');
  if(!grid)return;
  grid.classList.add(direction>0?'is-entering-next':'is-entering-prev');
  grid.addEventListener('animationend',()=>grid.classList.remove('is-entering-next','is-entering-prev'),{once:true});
}
function render(){
  const root=$('usNoiV2');
  if(!root)return;
  root.dataset.mode=mode;
  const label=$('usNoiV2Month');
  if(label){
    if(mode==='week'){
      const d=dateOf(selected);const monday=new Date(d.getFullYear(),d.getMonth(),d.getDate()-((d.getDay()+6)%7),12);
      label.textContent=`Settimana del ${monday.getDate()} ${months[monday.getMonth()]}`;
    }else label.textContent=`${months[month][0].toUpperCase()+months[month].slice(1)} ${year}`;
  }
  const weekBack=$('usNoiV2WeekBack');if(weekBack)weekBack.hidden=mode!=='week';
  $('usNoiV2AddTop')?.setAttribute('aria-label',`Aggiungi un impegno il ${dayLabel(selected)}`);
  const pick=$('usNoiV2IdeaPick');
  if(pick){pick.hidden=!ideaPick;const name=$('usNoiV2IdeaTitle');if(name)name.textContent=ideaPick?.title||'La vostra idea';}
  for(const type of ['calendar','list']){
    const btn=$(`usNoiV2Mode${type==='calendar'?'Calendar':'List'}`);
    if(btn){btn.setAttribute('aria-pressed',String(mode===type));btn.classList.toggle('is-active',mode===type);}
  }
  const [nowYear,nowMonth]=currentMonth();
  const onToday=year===nowYear&&month===nowMonth&&selected===today();
  const todayButton=$('usNoiV2Today');
  if(todayButton)todayButton.hidden=onToday;
  const first=$('usNoiV2First');
  if(first)first.hidden=!snapshot?.startedOn;
  syncStatus();
  const container=$('usNoiV2Content'),detail=$('usNoiV2Detail');
  if(!container||!detail)return;
  const index=itemsByDate();
  const direction=enterDirection;
  enterDirection=0;
  const notice=error&&!snapshot?`<p class="us-noi-v2-notice" role="alert">${icon('arrows-clockwise')}<span>Calendario non raggiungibile.</span><button type="button" data-noi-retry>Riprova</button></p>`:'';
  container.dataset.state=pending&&!snapshot?'loading':error&&!snapshot?'error':'ready';
  container.innerHTML=notice+(mode==='calendar'?calendarMarkup(index):mode==='week'?weekMarkup(index):listMarkup(index));
  playEnter(container,direction);
  detail.hidden=mode==='list';
  detail.innerHTML=mode==='list'?'':detailMarkup(index);
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
function goToMonth(y,m,day,direction){
  year=y;month=m;
  selected=day||(monthMatch(today())?today():iso(year,month,1));
  enterDirection=direction;
  snapshot=null;refreshedAt=0;requestSeq++;pending=false;refresh({force:true});
}
function shiftMonth(delta){
  if(mode==='week'){
    const now=dateOf(selected);
    const next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+7*delta,12);
    goToMonth(next.getFullYear(),next.getMonth(),iso(next.getFullYear(),next.getMonth(),next.getDate()),delta);
    window.UsFeedback?.selection?.();
    return;
  }
  const next=new Date(year,month+delta,1,12);
  goToMonth(next.getFullYear(),next.getMonth(),'',delta);
  window.UsFeedback?.selection?.();
}
function chooseDay(day,{fromList=false}={}) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;
  const d=dateOf(day);
  const differentMonth=d.getFullYear()!==year||d.getMonth()!==month;
  if(differentMonth&&mode!=='week')return;
  selected=day;
  if(ideaPick){
    const picker=window.UsCalendarLinks?.createForIdeaDate;
    if(picker)Promise.resolve(picker(day)).then(ok=>{if(ok){ideaPick=null;render();}});
    return;
  }
  if(differentMonth){goToMonth(d.getFullYear(),d.getMonth(),day,Math.sign(d.getFullYear()*12+d.getMonth()-(year*12+month)));return;}
  if(fromList)mode='calendar';
  render();
  window.UsFeedback?.selection?.();
  if(fromList)$('usNoiV2Detail')?.scrollIntoView?.({block:'nearest',behavior:reducedMotion()?'auto':'smooth'});
}
function setTab(tab){
  giocaTab=tab==='sintonia'?'sintonia':'giochi';
  const game=$('usGiocaGames'),syn=$('usGiocaSintonia');
  if(!game||!syn)return;
  const active=giocaTab==='sintonia';
  game.hidden=active;syn.hidden=!active;
  $('usGiocaTabs')?.setAttribute('data-active',giocaTab);
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
function openLink(link){
  // Lavagna is "la nostra settimana": the existing Calendar in its Week view,
  // both of you side by side. Quest and Eventi keep their existing Noi subviews.
  if(link==='lavagna'){mode='week';render();$('usNoiV2Content')?.scrollIntoView?.({block:'nearest',behavior:reducedMotion()?'auto':'smooth'});}
  if(link==='quest'||link==='eventi')window.openNoiSection?.(link);
}
function boot(){
  moveSintonia();setTab('giochi');render();
  // Main-nav tap always returns to Giochi; explicit Sintonia deep links remain available.
  document.querySelector('.nav button[data-page="quiz"]')?.addEventListener('click',()=>setTab('giochi'),true);
  $('usGiocaTabGames')?.addEventListener('click',()=>setTab('giochi'));
  $('usGiocaTabSintonia')?.addEventListener('click',()=>{window.USGameV2?.showHub?.();setTab('sintonia');});
  $('usGiocaTabs')?.addEventListener('keydown',e=>{
    if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
    e.preventDefault();
    const next=giocaTab==='giochi'?'sintonia':'giochi';
    if(next==='sintonia')window.USGameV2?.showHub?.();
    setTab(next);
    $(next==='sintonia'?'usGiocaTabSintonia':'usGiocaTabGames')?.focus();
  });
  $('usNoiV2ModeCalendar')?.addEventListener('click',()=>{if(mode!=='calendar'){mode='calendar';render();}});
  $('usNoiV2WeekBack')?.addEventListener('click',()=>{mode='calendar';render();});
  $('usNoiV2IdeaCancel')?.addEventListener('click',()=>{ideaPick=null;window.UsCalendarLinks?.cancelIdeaPick?.();render();});
  $('usNoiV2ModeList')?.addEventListener('click',()=>{if(mode!=='list'){mode='list';render();}});
  $('usNoiV2Prev')?.addEventListener('click',()=>shiftMonth(-1));
  $('usNoiV2Next')?.addEventListener('click',()=>shiftMonth(1));
  $('usNoiV2Today')?.addEventListener('click',()=>{
    const [y,m]=currentMonth();
    const direction=y*12+m-(year*12+month);
    if(direction===0){selected=today();render();return;}
    goToMonth(y,m,today(),Math.sign(direction));
  });
  $('usNoiV2First')?.addEventListener('click',()=>{
    const start=snapshot?.startedOn;
    if(!start)return;
    const d=dateOf(start);
    goToMonth(d.getFullYear(),d.getMonth(),start,-1);
  });
  $('usNoiV2')?.addEventListener('click',e=>{
    const day=e.target.closest('[data-noi-day]');if(day){chooseDay(day.dataset.noiDay,{fromList:day.hasAttribute('data-noi-focus-list')});return;}
    if(e.target.closest('[data-noi-retry]')){refresh({force:true});return;}
    if(e.target.closest('[data-noi-add]')){
      if(ideaPick){
        Promise.resolve(window.UsCalendarLinks?.createForIdeaDate?.(selected)).then(ok=>{if(ok){ideaPick=null;render();}});
        return;
      }
      if(window.UsCalendarLinks?.createForDate)window.UsCalendarLinks.createForDate(selected);
      else window.openCalendarSurface?.(selected);
      return;
    }
    const item=e.target.closest('[data-noi-item]');
    if(item){
      const kind=item.dataset.noiItem;
      if(kind==='entry'&&item.dataset.id)window.UsCalendarLinks?.openEntry?.(item.dataset.id);
      else if(kind==='event')window.openEvents?.();
      else window.openCalendarSurface?.(item.dataset.day);
      return;
    }
    const link=e.target.closest('[data-noi-open-link]');
    if(link)openLink(link.dataset.noiOpenLink);
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
    [year,month]=currentMonth();selected=today();ideaPick=null;
    if($('bond')?.classList.contains('active'))refresh();else render();
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('bond')?.classList.contains('active'))refresh();});
  if($('bond')?.classList.contains('active'))refresh();
}
function openMainCalendar(dateISO,requestedMode='calendar'){
  window.go?.('bond',{nav:true});
  window.closeNoiSection?.();
  if(dateISO&&/^\d{4}-\d{2}-\d{2}$/.test(dateISO)){
    const d=dateOf(dateISO);
    if(Number.isFinite(d.getTime())&&iso(d.getFullYear(),d.getMonth(),d.getDate())===dateISO){
      const delta=d.getFullYear()*12+d.getMonth()-(year*12+month);
      year=d.getFullYear();month=d.getMonth();selected=dateISO;
      if(delta){snapshot=null;refreshedAt=0;requestSeq++;pending=false;}
    }
  }
  mode=requestedMode==='week'?'week':'calendar';
  render();refresh();
}
window.USNoiV2=Object.freeze({
  openCalendar:({date,mode:requestedMode}={})=>openMainCalendar(date,requestedMode),
  beginIdeaPick:(idea)=>{ideaPick=idea;openMainCalendar(null,'calendar');},
  clearIdeaPick:()=>{ideaPick=null;render();},
  getSelectedDate:()=>selected,
  openGames:()=>setTab('giochi'),
  openSintonia:()=>{window.openQuizHub?.({nav:true});setTab('sintonia');},
  refresh:()=>refresh({force:true}),
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();
