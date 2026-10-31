// US Noi V2 — visual calendar hub and Gioca/Sintonia tabs.
// Read-only month display: the shared Calendar/Events surfaces remain write authorities.
(() => {
'use strict';
if (window.__usNoiV2Installed) return;
window.__usNoiV2Installed = true;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Italian is written out; another language (i18n.js) gets its own names from Intl.
const tag = globalThis.UsI18n?.tag || 'it-IT';
const named = (count, date, options) => Array.from({length:count}, (_, i) => date(i).toLocaleDateString(tag, {timeZone:'UTC', ...options}));
const months = tag === 'it-IT' ? ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre']
  : named(12, i => new Date(Date.UTC(2024, i, 1, 12)), {month:'long'});
const weekdays = tag === 'it-IT' ? [['L','lunedì'],['M','martedì'],['M','mercoledì'],['G','giovedì'],['V','venerdì'],['S','sabato'],['D','domenica']]
  : named(7, i => new Date(Date.UTC(2024, 0, 1 + i, 12)), {weekday:'narrow'}).map((short, i) => [short, new Date(Date.UTC(2024, 0, 1 + i, 12)).toLocaleDateString(tag, {weekday:'long', timeZone:'UTC'})]);
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
// The month grid and "La nostra settimana" reach into the month before and
// after, so dates are worked out for those three months, never only this one.
function nearMonths(){
  return [-1,0,1].map(delta=>{const d=new Date(year,month+delta,1,12);return [d.getFullYear(),d.getMonth()];});
}
// A 29th, 30th or 31st counts on the last day of a shorter month (as in Eventi).
const clampedDay=(y,m,day)=>iso(y,m,Math.min(day,new Date(y,m+1,0).getDate()));
const dateParts=value=>{const parts=String(value||'').split('-').map(Number);return parts.length===3&&parts.every(Number.isInteger)?parts:null;};
function eventDates(event){
  const parts=dateParts(event.event_date);
  if(!parts)return [];
  if(!event.recurs_yearly)return [String(event.event_date)];
  return nearMonths().filter(([y,m])=>m===parts[1]-1&&y>=parts[0]).map(([y,m])=>clampedDay(y,m,parts[2]));
}
// Il nostro giorno, then every mesiversario and anniversario after it.
function relationshipDates(){
  const parts=dateParts(snapshot?.startedOn);
  if(!parts)return [];
  const [sy,sm,sd]=parts;
  return nearMonths().map(([y,m])=>({y,m,months:(y-sy)*12+m-(sm-1)})).filter(x=>x.months>=0).map(({y,m,months})=>({day:clampedDay(y,m,sd),months}));
}
// Traguardi dei giorni (29/10/2026): every 100 days together in the months on
// screen, as Eventi has them (they open Eventi, like a mesiversario).
function daysMilestoneItems(){
  const D=window.UsCalendarDomain,start=snapshot?.startedOn;
  if(!D?.daysTogether||!dateParts(start))return [];
  const [first,,last]=nearMonths();
  const from=D.daysTogether(start,iso(first[0],first[1],1)),to=D.daysTogether(start,iso(last[0],last[1],new Date(last[0],last[1]+1,0).getDate()));
  if(from===null||to===null||to<100)return [];
  const [sy,sm,sd]=dateParts(start),out=[];
  for(let days=Math.max(100,Math.ceil(from/100)*100);days<=to;days+=100){
    const day=new Date(Date.UTC(sy,sm-1,sd)+days*864e5).toISOString().slice(0,10);
    out.push({day,item:{kind:'relationship',months:-1,days,title:D.daysMilestoneTitle(days),time:D.daysMilestoneLine(days),sort:'00:00'}});
  }
  return out;
}
function relationshipItem(months){
  const base={kind:'relationship',months,sort:'00:00'};
  if(months===0)return {...base,title:'Il nostro giorno',time:'Dove è iniziato tutto'};
  if(months%12===0){const years=months/12;return {...base,title:'Anniversario',time:years===1?'Un anno insieme':`${years} anni insieme`};}
  return {...base,title:'Mesiversario',time:months===1?'Un mese insieme':`${months} mesi insieme`};
}
// User/couple names are never hardcoded; no other couple's profiles are read.
function ownerLabel(entry){
  const profiles=Array.isArray(snapshot?.profiles)?snapshot.profiles:[];
  const names=profiles.map(p=>String(p.display_name||'').trim()).filter(Boolean);
  const together=names.length>=2?names.slice(0,2).join(' e '):'Entrambi';
  if(entry.kind==='relationship'||entry.kind==='event')return together;
  if(entry.entryType==='shared')return together;
  if(!entry.ownerId)return 'Impegno personale';
  const owner=profiles.find(p=>p.id===entry.ownerId);
  return owner?.display_name?.trim()||'Impegno personale';
}
function itemsByDate() {
  const map=new Map();
  const push=(day,item)=>{
    if(!day)return;
    if(!map.has(day))map.set(day,[]);
    map.get(day).push(item);
  };
  for(const {day,months} of relationshipDates())push(day,relationshipItem(months));
  for(const {day,item} of daysMilestoneItems())push(day,item);
  for(const e of snapshot?.events||[]){
    const time=e.event_time?String(e.event_time).slice(0,5):'';
    for(const day of eventDates(e))push(day,{kind:'event',id:e.id,title:e.title||'Evento',time:time||(e.recurs_yearly?'Ogni anno':'Una data speciale'),sort:time||'00:01'});
  }
  for(const e of snapshot?.appointments||[]){
    const time=e.is_all_day?'':new Date(e.starts_at).toLocaleTimeString((globalThis.UsI18n?.tag||'it-IT'),{hour:'2-digit',minute:'2-digit'});
    for(const date of e.dates||[])push(date,{kind:'calendar',id:e.id,title:e.title||'Impegno',entryType:e.entry_type,ownerId:e.owner_id,time:time||'Tutto il giorno',sort:time||'00:02'});
  }
  for(const list of map.values())list.sort((a,b)=>a.sort.localeCompare(b.sort));
  return map;
}
function dayLabel(day){return dateOf(day).toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{weekday:'long',day:'numeric',month:'long'});}
// The chosen day's heading carries the year only outside this year.
function dayTitle(day){
  const d=dateOf(day);
  return d.toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{weekday:'long',day:'numeric',month:'long',...(d.getFullYear()!==dateOf(today()).getFullYear()?{year:'numeric'}:{})});
}
// Oggi, Domani, Ieri; a day of yours (Il nostro giorno, a mesiversario) is
// "I vostri momenti"; any other day is named by its month, as in the mockup.
function relativeLabel(day,items=[]){
  const delta=Math.round((dateOf(day)-dateOf(today()))/86400000);
  if(delta===0)return 'OGGI';
  if(delta===1)return 'DOMANI';
  if(delta===-1)return 'IERI';
  if(items.some(item=>item.kind==='relationship'))return 'I VOSTRI MOMENTI';
  return months[dateOf(day).getMonth()].toUpperCase();
}
// Due colori: whose it is, as a colour. Mine --us-tu, theirs --us-partner,
// shared entries, couple Events and Il nostro giorno --us-noi. Presentation
// only: derived from the same entry_type/owner_id the calendar already reads.
function ownerOf(item){
  if(item.kind!=='calendar'||item.entryType==='shared'||!item.ownerId)return 'noi';
  const viewer=typeof window==='undefined'?null:window.usProfile;
  return item.ownerId===viewer?.id?'tu':'partner';
}
// Two people, one overlap: the couple mark from the design, not an icon.
const VENN='<svg class="us-noi-v2-venn" viewBox="0 0 58 36" width="58" height="36" aria-hidden="true" focusable="false"><circle cx="20" cy="18" r="15" style="fill:var(--us-rosa)"/><circle cx="38" cy="18" r="15" style="fill:var(--us-lilla)"/><path d="M29 6a15 15 0 0 1 0 24 15 15 0 0 1 0-24z" style="fill:var(--us-noi)"/></svg>';
const clockOf=value=>/^\d{2}:\d{2}$/.test(String(value||''))?String(value):'';
function itemAction(item){return item.kind==='calendar'?'entry':item.kind==='event'?'event':'anniversary';}
function itemMarkup(day,item) {
  const action=itemAction(item);
  // Il nostro giorno: the couple mark and how long ago it all began.
  if(item.kind==='relationship'&&item.months===0){
    const ago=Math.round((dateOf(today())-dateOf(day))/86400000);
    const since=ago>1?`${ago} giorni fa`:ago===1?'Un giorno fa':'';
    return `<button type="button" class="us-noi-v2-item us-noi-v2-ourday" data-noi-item="${action}" data-day="${esc(day)}" data-id="" data-months="${item.months}" data-owner="noi">
    ${VENN}<span class="us-noi-v2-item-copy"><b>${esc(item.title)}</b><small class="us-noi-v2-item-meta"><span>${esc(item.time)}</span>${since?`<span>${esc(since)}</span>`:''}<span class="us-noi-v2-owner" data-owner-type="relationship" hidden>${esc(ownerLabel(item))}</span></small></span>
  </button>`;
  }
  const clock=clockOf(item.time);
  if(item.kind==='relationship')return `<button type="button" class="us-noi-v2-item" data-noi-item="${action}" data-day="${esc(day)}" data-id="" data-months="${item.months}" data-owner="noi">
    <span class="us-noi-v2-item-time" aria-hidden="true">—</span><span class="us-noi-v2-item-copy"><b>${esc(item.title)}</b><small class="us-noi-v2-item-meta"><span>${esc(item.time)}</span><span class="us-noi-v2-owner" data-owner-type="relationship">${esc(ownerLabel(item))}</span></small></span><i class="us-noi-v2-item-dot" aria-hidden="true"></i>
  </button>`;
  return `<button type="button" class="us-noi-v2-item" data-noi-item="${action}" data-day="${esc(day)}" data-id="${esc(item.id||'')}" data-owner="${ownerOf(item)}">
    <span class="us-noi-v2-item-time"${clock?'':' aria-hidden="true"'}>${clock||'—'}</span><span class="us-noi-v2-item-copy"><b translate="no">${esc(item.title)}</b><small class="us-noi-v2-item-meta">${clock?'':`<span>${esc(item.time)}</span>`}<span class="us-noi-v2-owner" data-owner-type="${esc(item.entryType||item.kind)}">${esc(ownerLabel(item))}</span></small></span><i class="us-noi-v2-item-dot" aria-hidden="true"></i>
  </button>`;
}
// La nostra settimana: one chip per commitment, in the colour of whose it is.
function chipMarkup(day,item){
  const label=item.kind==='relationship'?esc(item.title):`<span translate="no">${esc(item.title)} · </span>${esc(item.time)}`;
  return `<button type="button" class="us-noi-v2-chip" data-noi-item="${itemAction(item)}" data-day="${esc(day)}" data-id="${esc(item.id||'')}"${item.kind==='relationship'?` data-months="${item.months}"`:''} data-owner="${ownerOf(item)}" aria-label="${esc(item.title)}, ${esc(ownerLabel(item))}, ${esc(item.time)}">${label}</button>`;
}
// The small key under the month: the real names, never hardcoded.
function legendMarkup(){
  const profiles=Array.isArray(snapshot?.profiles)?snapshot.profiles:[];
  const me=window.usProfile?.id;
  const name=p=>String(p?.display_name||'').trim();
  const known=window.UsIdentity?.current?.();
  const own=name(profiles.find(p=>p.id===me))||known?.ownName||'Tu';
  const partner=name(profiles.find(p=>p.id&&p.id!==me))||known?.partnerName||'La tua persona';
  const people=[['tu',own],['partner',partner]];
  if(window.usProfile?.role==='beatrice')people.reverse();
  people.push(['noi','Insieme']);
  return `<p class="us-noi-v2-legend" aria-hidden="true">${people.map(([owner,label])=>`<span${owner==='noi'?'':' translate="no"'}><i data-owner="${owner}"></i>${esc(label)}</span>`).join('')}</p>`;
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
    const owners=['tu','partner','noi'].filter(owner=>marks.some(x=>ownerOf(x)===owner));
    const dots=owners.map(owner=>`<i data-owner="${owner}"></i>`).join('');
    const moments=marks.length===1?'1 momento':marks.length?`${marks.length} momenti`:'nessun momento';
    return `<button type="button" class="us-noi-v2-day${active?' is-selected':''}${todayFlag?' is-today':''}${day<now?' is-past':''}" data-noi-day="${day}" aria-pressed="${active}" ${todayFlag?'aria-current="date"':''} aria-label="${esc(dayLabel(day))}${todayFlag?', oggi':''}, ${moments}">
      <span class="us-noi-v2-day-number">${n}</span><span class="us-noi-v2-day-marks" aria-hidden="true">${dots}</span>
    </button>`;
  }).join('');
  return `<div class="us-noi-v2-calendar" role="group" aria-label="Calendario di ${months[month]} ${year}"><div class="us-noi-v2-weekdays" aria-hidden="true">${header}</div><div class="us-noi-v2-grid" data-weeks="${slots/7}"><span class="us-noi-v2-sel" aria-hidden="true" hidden></span>${days}</div>${legendMarkup()}</div>`;
}
// Elenco: what is still to come this month (a whole other month as it is),
// each day as "Mercoledì 14".
function listDayLabel(day){return dateOf(day).toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{weekday:'long',day:'numeric'});}
function listMarkup(index) {
  const now=today();
  const days=[...index.keys()].filter(monthMatch).filter(day=>!monthMatch(now)||day>=now).sort();
  if(!days.length)return `<div class="us-noi-v2-empty-month">${VENN.replace('class="us-noi-v2-venn"','class="us-noi-v2-venn is-big"')}<b>Un mese ancora da scrivere</b><button type="button" class="us-noi-v2-text-action" data-noi-add>Aggiungi un impegno</button></div>`;
  return `<div class="us-noi-v2-month-list">${days.map(day=>`<section class="us-noi-v2-month-day${day===today()?' is-today':''}" aria-label="${esc(dayLabel(day))}"><button type="button" class="us-noi-v2-list-date" data-noi-day="${day}" data-noi-focus-list aria-label="${esc(dayLabel(day))}"><span>${esc(listDayLabel(day))}</span>${day===today()?'<em>Oggi</em>':''}</button>${index.get(day).map(item=>itemMarkup(day,item)).join('')}</section>`).join('')}</div>`;
}
function weekDays(){
  const date=dateOf(selected);
  const monday=new Date(date.getFullYear(),date.getMonth(),date.getDate()-((date.getDay()+6)%7),12);
  return Array.from({length:7},(_,i)=>{const when=new Date(monday.getFullYear(),monday.getMonth(),monday.getDate()+i,12);return {when,day:iso(when.getFullYear(),when.getMonth(),when.getDate())};});
}
// Free evenings of both of you, from today on: the "Liberi insieme" rules of
// the Calendar (calendar.js), fed with this snapshot. Nothing is read again.
function freeEvenings(index,days){
  const reader=window.USNoiCalendarRead?.freeEvenings;
  if(typeof reader!=='function'||!snapshot)return new Set();
  const now=today(),dates=days.filter(day=>day>=now),eventTimesByDate={};
  for(const day of dates)eventTimesByDate[day]=(index.get(day)||[]).filter(item=>item.kind==='event'&&clockOf(item.time)).map(item=>item.time);
  try{return new Set(reader({appointments:snapshot.appointments||[],profiles:snapshot.profiles||[],dates,eventTimesByDate}));}
  catch(e){console.warn('[US Noi V2] free evenings',e);return new Set();}
}
function weekSummary(count){
  if(!snapshot||count<0)return '';
  const copy=count===0?'Nessuna sera libera per tutti e due':count===1?'Una sera libera per tutti e due':`${count} sere libere per tutti e due`;
  return `<p class="us-noi-v2-week-summary">${icon('heart')}<span>${esc(copy)}</span></p>`;
}
// On the board each day reads you, then your person, then the two of you; by time inside each.
const BOARD_ORDER={tu:0,partner:1,noi:2};
function sortedForBoard(items){return items.map((item,i)=>({item,i})).sort((a,b)=>(BOARD_ORDER[ownerOf(a.item)]??3)-(BOARD_ORDER[ownerOf(b.item)]??3)||a.i-b.i).map(x=>x.item);}
function weekMarkup(index) {
  const days=weekDays();
  const free=freeEvenings(index,days.map(d=>d.day));
  const rows=days.map(({when,day})=>{
    const items=index.get(day)||[];
    const active=day===selected,isToday=day===today();
    const evening=free.has(day)?'<span class="us-noi-v2-chip us-noi-v2-free" data-owner="noi">Sera libera</span>':'';
    const lane=items.length||evening?sortedForBoard(items).map(item=>chipMarkup(day,item)).join('')+evening:'<small class="us-noi-v2-week-empty">Libero</small>';
    return `<section class="us-noi-v2-week-row${active?' is-selected':''}${isToday?' is-today':''}">
      <button type="button" class="us-noi-v2-list-date" data-noi-day="${day}" aria-pressed="${active}" aria-label="${esc(dayLabel(day))}${isToday?', oggi':''}"><b>${when.getDate()}</b><small>${esc(weekdays[(when.getDay()+6)%7][1].slice(0,3))}</small></button>
      <div class="us-noi-v2-week-lane">${lane}</div>
    </section>`;
  }).join('');
  // Lavagna (the mockup's Foglio): the key, the days, then the free evenings
  // of both of you and how to see a day.
  return `${legendMarkup()}<div class="us-noi-v2-week-list" role="group" aria-label="La nostra settimana">${rows}</div>${weekSummary(days.some(d=>d.day>=today())?free.size:-1)}<p class="us-noi-v2-week-note">Tocca un giorno nel calendario per vedere i dettagli.</p>`;
}
function weekTitle(){
  const days=weekDays(),now=today();
  if(days.some(d=>d.day===now))return 'Questa settimana';
  const monday=days[0].when;
  return `Settimana del ${monday.getDate()} ${months[monday.getMonth()]}`;
}
// The Lavagna Foglio opens over the month while the week mode is on, and
// leaves (with the shared sheet exit) when it is off.
let weekSheetDirection=0;
function renderWeekSheet(index){
  const sheet=$('usNoiLavagna'),body=$('usNoiV2Week');
  if(!sheet||!body)return;
  const open=mode==='week';
  if(open){
    const title=$('usNoiLavagnaTitle');if(title)title.textContent=weekTitle();
    body.innerHTML=weekMarkup(index);
    window.UsUiFoundation?.cancelSurfaceExit?.(sheet);
    sheet.classList.add('open');sheet.setAttribute('aria-hidden','false');
    const direction=weekSheetDirection;weekSheetDirection=0;
    // A new week slides in like a step of the mockup's flow.
    if(direction&&!reducedMotion())body.animate?.([{opacity:0,translate:`${direction*28}px 0`},{opacity:1,translate:'0 0'}],{duration:340,easing:'cubic-bezier(.2,.8,.2,1)'});
    return;
  }
  if(!sheet.classList.contains('open'))return;
  const done=()=>{sheet.classList.remove('open');sheet.setAttribute('aria-hidden','true');};
  if(window.UsUiFoundation?.exitSurface)window.UsUiFoundation.exitSurface(sheet,done);else done();
}
function detailMarkup(index) {
  const active=index.get(selected)||[];
  const head=`<div class="us-noi-v2-detail-head"><div><small>${relativeLabel(selected,active)}</small><h3>${esc(dayTitle(selected))}</h3></div></div>`;
  if(active.length)return `${head}<div class="us-noi-v2-day-items">${active.map(item=>itemMarkup(selected,item)).join('')}</div>`;
  if(pending&&!snapshot)return `${head}<div class="us-skeleton-rows" role="status"><span class="us-sr">Carico i vostri momenti…</span><i class="us-skeleton"></i><i class="us-skeleton"></i></div>`;
  return `${head}<p class="us-noi-v2-empty-day">Nessun momento in questo giorno. Lo spazio è vostro.</p>`;
}
function syncStatus(){
  const status=$('usNoiV2Sync');
  if(!status)return;
  const text=pending?'Aggiorno…':error&&snapshot?'Non aggiornato':'';
  status.textContent=text;
  status.dataset.state=pending?'loading':error?'error':'idle';
}
// Motion, from the mockup (noi.js): the month slides 30px out (200ms, in)
// and the next one in (320ms, out); the selected day's disc springs to the
// new day; the day's title and moments rise 8px one after the other.
const EASE_OUT='cubic-bezier(.2,.8,.2,1)',EASE_IN='cubic-bezier(.4,0,1,1)',EASE_SPRING='cubic-bezier(.34,1.56,.64,1)';
let entering=null,leaving=null,selFrom=null;
function playEnter(container,direction){
  if(!direction||reducedMotion())return;
  entering={direction,start:performance.now()};
  continueEnter(container);
}
// The month is drawn again when its data arrives: the slide goes on from
// where it was instead of starting over or stopping.
function continueEnter(container){
  if(!entering)return;
  const elapsed=performance.now()-entering.start;
  if(elapsed>=320||reducedMotion()){entering=null;return;}
  const area=container.querySelector('.us-noi-v2-calendar,.us-noi-v2-month-list,.us-noi-v2-empty-month');
  area?.animate?.([{opacity:0,translate:`${entering.direction*30}px 0`},{opacity:1,translate:'0 0'}],{duration:320,delay:-elapsed,easing:EASE_OUT});
}
function flushLeaving(){
  if(!leaving)return;
  const {anim,apply}=leaving;leaving=null;anim.cancel();apply();
}
function selectionPos(){
  const grid=$('usNoiV2Content')?.querySelector('.us-noi-v2-grid');
  const disc=grid?.querySelector('.us-noi-v2-sel');
  return disc&&!disc.hidden?disc.style.translate:null;
}
function placeSelection(){
  const grid=$('usNoiV2Content')?.querySelector('.us-noi-v2-grid');
  const disc=grid?.querySelector('.us-noi-v2-sel');
  if(!disc)return;
  const day=grid.querySelector(`[data-noi-day="${selected}"]`);
  const from=selFrom;selFrom=null;
  if(!day){disc.hidden=true;return;}
  const to=`${day.offsetLeft+day.offsetWidth/2-20}px ${day.offsetTop+day.offsetHeight/2-20}px`;
  disc.hidden=false;disc.style.translate=to;
  if(from&&from!==to&&!reducedMotion())disc.animate?.([{translate:from,scale:1},{scale:.86,offset:.4},{translate:to,scale:1}],{duration:520,easing:EASE_SPRING});
}
function riseDetail(){
  if(reducedMotion())return;
  const detail=$('usNoiV2Detail');
  if(!detail)return;
  [...detail.querySelectorAll('.us-noi-v2-detail-head h3,.us-noi-v2-day-items>*,.us-noi-v2-empty-day')].forEach((el,i)=>el.animate?.([{opacity:0,translate:'0 8px'},{opacity:1,translate:'0 0'}],{duration:320,delay:i*50,easing:EASE_OUT,fill:'backwards'}));
}
function setMode(next){
  if(mode===next)return;
  mode=next;render();
  const shown=$('usNoiV2Content')?.querySelector(next==='list'?'.us-noi-v2-month-list,.us-noi-v2-empty-month':'.us-noi-v2-calendar');
  if(shown&&!reducedMotion())shown.animate?.([{opacity:0,translate:'0 10px'},{opacity:1,translate:'0 0'}],{duration:320,easing:EASE_OUT});
}
function render(){
  const root=$('usNoiV2');
  if(!root)return;
  root.dataset.mode=mode;
  const label=$('usNoiV2Month');
  if(label)label.innerHTML=`${months[month][0].toUpperCase()+months[month].slice(1)} <span class="us-noi-v2-year">${year}</span>`;
  const weekBack=$('usNoiV2WeekBack');if(weekBack)weekBack.hidden=mode!=='week';
  $('usNoiV2AddTop')?.setAttribute('aria-label',`Aggiungi un impegno il ${dayLabel(selected)}`);
  const pick=$('usNoiV2IdeaPick');
  if(pick){pick.hidden=!ideaPick;const name=$('usNoiV2IdeaTitle');if(name)name.textContent=ideaPick?.title||'La vostra idea';}
  for(const type of ['calendar','list']){
    const btn=$(`usNoiV2Mode${type==='calendar'?'Calendar':'List'}`);
    if(btn){btn.setAttribute('aria-pressed',String(mode===type));btn.classList.toggle('is-active',mode===type);}
  }
  // One chip, as in the mockup: "Il nostro giorno" in this month, "Torna a
  // oggi" in any other month.
  const [nowYear,nowMonth]=currentMonth();
  const thisMonth=year===nowYear&&month===nowMonth;
  const todayButton=$('usNoiV2Today');
  if(todayButton)todayButton.hidden=thisMonth;
  const first=$('usNoiV2First');
  if(first)first.hidden=!snapshot?.startedOn||!thisMonth;
  syncStatus();
  const container=$('usNoiV2Content'),detail=$('usNoiV2Detail');
  if(!container||!detail)return;
  const index=itemsByDate();
  const direction=enterDirection;
  enterDirection=0;
  const notice=error&&!snapshot?`<p class="us-noi-v2-notice" role="alert">${icon('arrows-clockwise')}<span>Calendario non raggiungibile.</span><button type="button" data-noi-retry>Riprova</button></p>`:'';
  container.dataset.state=pending&&!snapshot?'loading':error&&!snapshot?'error':'ready';
  container.innerHTML=notice+(mode==='list'?listMarkup(index):calendarMarkup(index));
  placeSelection();
  if(direction&&mode!=='week')playEnter(container,direction);else continueEnter(container);
  renderWeekSheet(index);
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
// A repaint of a month already on screen waits for the colour between tabs
// to finish (at once otherwise).
function afterMotion(fn){if(window.UsDueColori?.afterMotion)window.UsDueColori.afterMotion(fn);else fn();}
function goToMonth(y,m,day,direction){
  flushLeaving();
  const apply=()=>{
    year=y;month=m;
    selected=day||(monthMatch(today())?today():iso(year,month,1));
    enterDirection=direction;
    snapshot=null;refreshedAt=0;requestSeq++;pending=false;refresh({force:true});
  };
  const area=mode==='calendar'&&direction?$('usNoiV2Content')?.querySelector('.us-noi-v2-calendar'):null;
  if(!area||typeof area.animate!=='function'||reducedMotion()){apply();return;}
  const anim=area.animate([{opacity:1,translate:'0 0'},{opacity:0,translate:`${-direction*30}px 0`}],{duration:200,easing:EASE_IN,fill:'forwards'});
  leaving={anim,apply};
  anim.finished.then(()=>{if(leaving?.anim===anim){leaving=null;apply();}},()=>{});
}
function shiftMonth(delta){
  flushLeaving();
  if(mode==='week'){
    const now=dateOf(selected);
    const next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+7*delta,12);
    weekSheetDirection=delta;
    goToMonth(next.getFullYear(),next.getMonth(),iso(next.getFullYear(),next.getMonth(),next.getDate()),delta);
    window.UsFeedback?.selection?.();
    return;
  }
  const next=new Date(year,month+delta,1,12);
  goToMonth(next.getFullYear(),next.getMonth(),'',delta);
  window.UsFeedback?.selection?.();
}
function chooseDay(day,{fromList=false,fromWeek=false}={}) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return;
  const d=dateOf(day);
  const differentMonth=d.getFullYear()!==year||d.getMonth()!==month;
  if(differentMonth&&mode!=='week')return;
  selected=day;
  if(fromWeek&&!ideaPick)mode='calendar';
  if(ideaPick){
    const picker=window.UsCalendarLinks?.createForIdeaDate;
    if(picker)Promise.resolve(picker(day)).then(ok=>{if(ok){ideaPick=null;render();}});
    return;
  }
  if(differentMonth){goToMonth(d.getFullYear(),d.getMonth(),day,Math.sign(d.getFullYear()*12+d.getMonth()-(year*12+month)));return;}
  if(fromList)mode='calendar';
  else if(mode==='calendar')selFrom=selectionPos();
  render();
  riseDetail();
  window.UsFeedback?.selection?.();
  if(fromList)$('usNoiV2Detail')?.scrollIntoView?.({block:'nearest',behavior:reducedMotion()?'auto':'smooth'});
}
let tabOrder=0;
function setTab(tab){
  giocaTab=tab==='sintonia'?'sintonia':'giochi';
  const game=$('usGiocaGames'),syn=$('usGiocaSintonia');
  if(!game||!syn)return;
  const active=giocaTab==='sintonia';
  $('usGiocaTabGames')?.setAttribute('aria-selected',String(!active));
  $('usGiocaTabSintonia')?.setAttribute('aria-selected',String(active));
  game.hidden=active;syn.hidden=!active;
  $('usGiocaTabs')?.setAttribute('data-active',giocaTab);
  // The roving tabindex once the panel is on screen: the tapped tab has
  // focus, and a tabindex change on it makes the browser check focusability
  // at once, a whole style pass in the middle of the tap.
  const roving=()=>{
    $('usGiocaTabGames')?.setAttribute('tabindex',active?'-1':'0');
    $('usGiocaTabSintonia')?.setAttribute('tabindex',active?'0':'-1');
  };
  const order=++tabOrder;
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>setTimeout(()=>{if(order===tabOrder)roving();},0));
  else roving();
  if(active){
    window.hydrateBond?.();
    window.hydrateResonanceHistory?.();
    window.USProgression?.hydrate?.({showUnlocks:true,force:true});
  }
}
function moveSintonia(){
  const target=$('usGiocaSintonia');
  if(!target||target.dataset.ready)return;
  const selectors=['.noi-resonance','.us-progression-rhythm','.us-progression-next','.us-progression-rewards-section','.noi-resonance-history','.noi-resonance-guide'];
  for(const selector of selectors){
    const element=document.querySelector(`#bond .noi-canonical-page > ${selector}`);
    if(element)target.appendChild(element);
  }
  target.dataset.ready='1';
}
function openLink(link){
  // Lavagna is the Noi calendar in its week view, both of you side by side,
  // shown as a Foglio over the month. Missioni and Eventi open their sheets.
  if(link==='lavagna'){mode='week';render();}
  if(link==='quest'||link==='eventi')window.openNoiSection?.(link);
  // Note condivise (couple-notes.js): their own Foglio.
  if(link==='note')window.UsCoupleNotes?.open?.();
}
// Back (navigation.js) and leaving Noi bring the week view back to the month.
function closeWeek(){
  if(mode!=='week')return;
  mode='calendar';render();
}
// The "+" form's "Data speciale" choice: the Eventi editor for that day, which
// returns to this calendar when it is saved or closed.
function addSpecialDate({date,title='',time=''}={}){
  const day=/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))?date:selected;
  window.openEventEditor?.(null,null,{from:'calendar',date:day,title,time});
}
function openItem(item){
  const kind=item.dataset.noiItem;
  if(kind==='entry'&&item.dataset.id){window.UsCalendarLinks?.openEntry?.(item.dataset.id,{inPlace:true});return;}
  // An Eventi date opens that event, on the occurrence that was tapped.
  if(kind==='event'&&item.dataset.id){window.openEventEditor?.(item.dataset.id,item.dataset.day,{from:'calendar'});return;}
  // Mesiversari and anniversari live in Eventi; the first day only selects itself.
  if(kind==='anniversary'&&item.dataset.months!=='0'){window.openNoiSection?.('eventi');return;}
  chooseDay(item.dataset.day);
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
  $('usNoiV2ModeCalendar')?.addEventListener('click',()=>setMode('calendar'));
  $('usNoiV2WeekBack')?.addEventListener('click',closeWeek);
  $('usNoiV2IdeaCancel')?.addEventListener('click',()=>{ideaPick=null;window.UsCalendarLinks?.cancelIdeaPick?.();render();});
  $('usNoiV2ModeList')?.addEventListener('click',()=>setMode('list'));
  $('usNoiV2Prev')?.addEventListener('click',()=>shiftMonth(-1));
  $('usNoiV2Next')?.addEventListener('click',()=>shiftMonth(1));
  $('usNoiV2Today')?.addEventListener('click',()=>{
    const [y,m]=currentMonth();
    const direction=y*12+m-(year*12+month);
    if(direction===0){selFrom=mode==='calendar'?selectionPos():null;selected=today();render();riseDetail();return;}
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
      return;
    }
    const item=e.target.closest('[data-noi-item]');
    if(item){openItem(item);return;}
    const link=e.target.closest('[data-noi-open-link]');
    if(link)openLink(link.dataset.noiOpenLink);
  });
  if(typeof ResizeObserver==='function'&&$('usNoiV2Content'))new ResizeObserver(()=>placeSelection()).observe($('usNoiV2Content'));
  const lavagna=$('usNoiLavagna');
  lavagna?.addEventListener('click',e=>{
    if(e.target.closest('[data-noi-week-close]')){closeWeek();return;}
    const day=e.target.closest('[data-noi-day]');if(day){chooseDay(day.dataset.noiDay,{fromWeek:true});return;}
    const item=e.target.closest('[data-noi-item]');if(item)openItem(item);
  });
  // A sideways swipe on the board moves one week, as the arrows did.
  let swipe=null;
  $('usNoiV2Week')?.addEventListener('pointerdown',e=>{swipe={x:e.clientX,y:e.clientY};});
  $('usNoiV2Week')?.addEventListener('pointerup',e=>{
    if(!swipe||mode!=='week')return;
    const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y;swipe=null;
    if(Math.abs(dx)>56&&Math.abs(dx)>Math.abs(dy)*1.5)shiftMonth(dx<0?1:-1);
  });
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape'||mode!=='week'||document.querySelector('.us-cal-sheet-overlay.open:not(#usNoiLavagna),#usEventsOverlay.open'))return;
    closeWeek();
  });
  const bond=$('bond');
  if(bond){
    // Noi opens under the colour between tabs (due-colori.js): a first read
    // starts at once, under the colour; a month already read (same content)
    // only re-renders once the page is fully open.
    const observer=new MutationObserver(()=>{
      if(!bond.classList.contains('active')){closeWeek();return;}
      if(!snapshot)refresh();else afterMotion(()=>{if(bond.classList.contains('active'))refresh();});
    });
    observer.observe(bond,{attributes:true,attributeFilter:['class']});
  }
  // A tap on the Noi tab while already in Noi also returns to the month.
  document.querySelector('.nav button[data-page="bond"]')?.addEventListener('click',()=>{if($('bond')?.classList.contains('active'))closeWeek();},true);
  const events=$('usEventsOverlay');
  if(events)new MutationObserver(()=>{if(events.getAttribute('aria-hidden')==='true'&&$('bond')?.classList.contains('active'))refresh({force:true});}).observe(events,{attributes:true,attributeFilter:['aria-hidden']});
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
  closeWeek,
  addSpecialDate,
  openGames:()=>setTab('giochi'),
  openSintonia:()=>{window.openQuizHub?.({nav:true});setTab('sintonia');},
  refresh:()=>refresh({force:true}),
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else boot();
})();
