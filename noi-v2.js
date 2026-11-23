// US Noi V2 — visual calendar hub and Gioca/Sintonia tabs.
// Read-only month display: the shared Calendar/Events surfaces remain write authorities.
// Noi nuova (founder, 03/11/2026, tavola Main.dc.html): the calendar is the
// protagonist. Big squares, every commitment a label in the colour of whoever
// put it, a day with a Ricordo is its photo; the views «Mese» and «Prossimi».
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
// «Prossimi»: its own read, from today to the same day next year.
let upcoming = null;
let upcomingAt = 0;
let upcomingKey = '';
let upcomingSeq = 0;
let upcomingPending = false;
let upcomingError = '';
const UPCOMING_MAX = 30;
const BAR_MAX = 2;

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
// «Prossimi»: from today (included) to the same day next year (excluded),
// and the months those days fall in.
function yearAhead(){
  const d=dateOf(today()),end=new Date(d.getFullYear()+1,d.getMonth(),d.getDate()+1,12);
  return iso(end.getFullYear(),end.getMonth(),end.getDate());
}
function monthsBetween(from,to){
  const out=[],a=dateOf(from),b=dateOf(to);
  for(let d=new Date(a.getFullYear(),a.getMonth(),1,12);d<=b;d=new Date(d.getFullYear(),d.getMonth()+1,1,12))out.push([d.getFullYear(),d.getMonth()]);
  return out;
}
// A 29th, 30th or 31st counts on the last day of a shorter month (as in Eventi).
const clampedDay=(y,m,day)=>iso(y,m,Math.min(day,new Date(y,m+1,0).getDate()));
const dateParts=value=>{const parts=String(value||'').split('-').map(Number);return parts.length===3&&parts.every(Number.isInteger)?parts:null;};
function eventDates(event,span=nearMonths()){
  const parts=dateParts(event.event_date);
  if(!parts)return [];
  if(!event.recurs_yearly)return [String(event.event_date)];
  return span.filter(([y,m])=>m===parts[1]-1&&y>=parts[0]).map(([y,m])=>clampedDay(y,m,parts[2]));
}
// Il nostro giorno, then every mesiversario and anniversario after it.
function relationshipDates(data=snapshot,span=nearMonths()){
  const parts=dateParts(data?.startedOn);
  if(!parts)return [];
  const [sy,sm,sd]=parts;
  return span.map(([y,m])=>({y,m,months:(y-sy)*12+m-(sm-1)})).filter(x=>x.months>=0).map(({y,m,months})=>({day:clampedDay(y,m,sd),months}));
}
// Traguardi dei giorni (29/10/2026): every 100 days together in the months on
// screen, as Eventi has them (they open Eventi, like a mesiversario).
function daysMilestoneItems(data=snapshot,span=nearMonths()){
  const D=window.UsCalendarDomain,start=data?.startedOn;
  if(!D?.daysTogether||!dateParts(start))return [];
  const first=span[0],last=span[span.length-1];
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
  if(months===0)return {...base,title:'Il nostro giorno',time:'Da qui è iniziato tutto'};
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
  const name=owner?.display_name?.trim();
  return name?`Solo ${name}`:'Impegno personale';
}
// The name on an agenda row and under a Ricordo: you, your person, or both.
function personName(id){
  const profiles=Array.isArray(snapshot?.profiles)?snapshot.profiles:[];
  const me=window.usProfile?.id,known=window.UsIdentity?.current?.();
  const own=id===me;
  return String(profiles.find(p=>p.id===id)?.display_name||'').trim()||(own?known?.ownName:known?.partnerName)||(own?'Tu':'La tua persona');
}
function whoName(owner){
  if(owner==='noi')return 'Insieme';
  const profiles=Array.isArray(snapshot?.profiles)?snapshot.profiles:[];
  const me=window.usProfile?.id;
  return personName(owner==='tu'?me:profiles.find(p=>p.id&&p.id!==me)?.id);
}
function itemsByDate(data=snapshot,span=nearMonths()) {
  const map=new Map();
  const push=(day,item)=>{
    if(!day)return;
    if(!map.has(day))map.set(day,[]);
    map.get(day).push(item);
  };
  for(const {day,months} of relationshipDates(data,span))push(day,relationshipItem(months));
  for(const {day,item} of daysMilestoneItems(data,span))push(day,item);
  for(const e of data?.events||[]){
    const time=e.event_time?String(e.event_time).slice(0,5):'';
    for(const day of eventDates(e,span))push(day,{kind:'event',id:e.id,title:e.title||'Evento',time:time||(e.recurs_yearly?'Ogni anno':'Una data speciale'),sort:time||'00:01'});
  }
  for(const e of data?.appointments||[]){
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
// «Prossimi»: a day far ahead says its month, and its year outside this one.
function upcomingDayLabel(day){
  const d=dateOf(day);
  return d.toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{weekday:'long',day:'numeric',month:'long',...(d.getFullYear()!==dateOf(today()).getFullYear()?{year:'numeric'}:{})});
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
// Whose it is, at the end of an agenda row: the name in that person's colour.
function whoChip(item){
  const owner=ownerOf(item);
  return `<span class="us-noi-v2-who" data-owner="${owner}"${owner==='noi'?'':' translate="no"'}>${esc(whoName(owner))}</span>`;
}
function itemMarkup(day,item) {
  const action=itemAction(item);
  // Il nostro giorno: the couple mark and how long ago it all began.
  if(item.kind==='relationship'&&item.months===0){
    const ago=Math.round((dateOf(today())-dateOf(day))/86400000);
    const since=ago>1?`${ago} giorni fa`:ago===1?'Ieri':'';
    return `<button type="button" class="us-noi-v2-item us-noi-v2-ourday" data-noi-item="${action}" data-day="${esc(day)}" data-id="" data-months="${item.months}" data-owner="noi">
    ${VENN}<span class="us-noi-v2-item-copy"><b>${esc(item.title)}</b><small class="us-noi-v2-item-meta"><span>${esc(item.time)}</span>${since?`<span>${esc(since)}</span>`:''}<span class="us-noi-v2-owner" data-owner-type="relationship" hidden>${esc(ownerLabel(item))}</span></small></span>
  </button>`;
  }
  const clock=clockOf(item.time);
  // A hundred days: «4100 giorni ♡» says it all, its line would repeat it.
  // No hour: a mark, never a dash (founder, 04/11/2026). A heart for our
  // dates, the calendar for a whole-day plan.
  if(item.kind==='relationship')return `<button type="button" class="us-noi-v2-item" data-noi-item="${action}" data-day="${esc(day)}" data-id="" data-months="${item.months}" data-owner="noi">
    <span class="us-noi-v2-item-time is-mark" aria-hidden="true">${icon('heart')}</span><span class="us-noi-v2-item-copy"><b>${esc(item.title)}</b><small class="us-noi-v2-item-meta">${item.days?'':`<span>${esc(item.time)}</span>`}<span class="us-noi-v2-owner" data-owner-type="relationship">${esc(ownerLabel(item))}</span></small></span>${whoChip(item)}
  </button>`;
  return `<button type="button" class="us-noi-v2-item" data-noi-item="${action}" data-day="${esc(day)}" data-id="${esc(item.id||'')}" data-owner="${ownerOf(item)}">
    <span class="us-noi-v2-item-time${clock?'':' is-mark'}"${clock?'':' aria-hidden="true"'}>${clock||icon('calendar-blank')}</span><span class="us-noi-v2-item-copy"><b translate="no">${esc(item.title)}</b><small class="us-noi-v2-item-meta">${clock?'':`<span>${esc(item.time)}</span>`}<span class="us-noi-v2-owner" data-owner-type="${esc(item.entryType||item.kind)}">${esc(ownerLabel(item))}</span></small></span>${whoChip(item)}
  </button>`;
}
// La nostra settimana: one chip per commitment, in the colour of whose it is.
function chipMarkup(day,item){
  const label=item.kind==='relationship'?esc(item.title):`<span translate="no">${esc(item.title)} · </span>${esc(item.time)}`;
  return `<button type="button" class="us-noi-v2-chip" data-noi-item="${itemAction(item)}" data-day="${esc(day)}" data-id="${esc(item.id||'')}"${item.kind==='relationship'?` data-months="${item.months}"`:''} data-owner="${ownerOf(item)}" aria-label="${esc(item.title)}, ${esc(ownerLabel(item))}, ${esc(item.time)}">${label}</button>`;
}
// The Ricordi of the month (calendar.js readNoiMonth), by day.
function ricordiByDay(data=snapshot){
  const map=new Map();
  for(const m of Array.isArray(data?.moments)?data.moments:[]){
    if(!m?.id||!/^\d{4}-\d{2}-\d{2}$/.test(String(m.day||'')))continue;
    if(!map.has(m.day))map.set(m.day,[]);
    map.get(m.day).push(m);
  }
  return map;
}
// In a square the couple's dates say how much, on two lines if needed
// (staging, 04/11/2026: «Mesiversario» became «Mesi…»); the agenda says the rest.
function cellLabel(item){
  if(item.kind!=='relationship')return item.title;
  if(item.days)return `${item.days} giorni`;
  if(item.months===0)return 'Inizio';
  if(item.months%12===0){const years=item.months/12;return years===1?'1 anno':`${years} anni`;}
  return item.months===1?'1 mese':`${item.months} mesi`;
}
// Only the weeks this month actually spans: 4–6 rows, never an empty sixth row.
// A day is a square: its number, then a label per commitment (at most two,
// then "+n") in the colour of whoever put it; a day with a Ricordo is its photo.
function calendarMarkup(index) {
  const first=new Date(year,month,1,12);
  const offset=(first.getDay()+6)%7;
  const count=new Date(year,month+1,0).getDate();
  const slots=Math.ceil((offset+count)/7)*7;
  const now=today(),ricordi=ricordiByDay();
  const header=weekdays.map(([short,long])=>`<abbr class="us-noi-v2-weekday" title="${long}">${short}</abbr>`).join('');
  const days=Array.from({length:slots},(_,i)=>{
    const n=i-offset+1,valid=n>0&&n<=count;
    if(!valid)return '<span class="us-noi-v2-blank" aria-hidden="true"></span>';
    const day=iso(year,month,n),todayFlag=day===now,active=day===selected;
    const items=index.get(day)||[];
    const photo=(ricordi.get(day)||[]).find(m=>m.thumb);
    const bars=items.slice(0,BAR_MAX).map(item=>`<span class="us-noi-v2-bar${item.kind==='relationship'?' is-milestone':''}" data-owner="${ownerOf(item)}"${item.kind==='relationship'?'':' translate="no"'}>${esc(cellLabel(item))}</span>`).join('');
    const more=items.length>BAR_MAX?`<span class="us-noi-v2-more">+${items.length-BAR_MAX}</span>`:'';
    const plans=items.length===1?'1 impegno':items.length?`${items.length} impegni`:'niente in programma';
    return `<button type="button" class="us-noi-v2-day${active?' is-selected':''}${photo?' has-photo':''}${todayFlag?' is-today':''}${day<now?' is-past':''}" data-noi-day="${day}" aria-pressed="${active}" ${todayFlag?'aria-current="date"':''} aria-label="${esc(dayLabel(day))}${todayFlag?', oggi':''}${photo?', con un Ricordo':''}, ${plans}">
      ${photo?`<img class="us-noi-v2-day-photo" src="${esc(photo.thumb)}" alt="" loading="lazy" decoding="async">`:''}<span class="us-noi-v2-day-number">${n}</span><span class="us-noi-v2-day-bars" aria-hidden="true">${bars}${more}</span>
    </button>`;
  }).join('');
  return `<div class="us-noi-v2-calendar" role="group" aria-label="Calendario di ${months[month]} ${year}"><div class="us-noi-v2-weekdays" aria-hidden="true">${header}</div><div class="us-noi-v2-grid" data-weeks="${slots/7}">${days}</div></div>`;
}
// «Prossimi»: what is coming from today, a year ahead, with the dates that
// come back every year (birthdays, mesiversari, the anniversary); the first
// UPCOMING_MAX commitments, day by day.
function upcomingMarkup() {
  if(!upcoming){
    if(upcomingError)return `<p class="us-noi-v2-notice" role="alert">${icon('arrows-clockwise')}<span>Calendario non raggiungibile.</span><button type="button" data-noi-retry>Riprova</button></p>`;
    return '<div class="us-skeleton-rows" role="status"><span class="us-sr">Carico i prossimi impegni…</span><i class="us-skeleton"></i><i class="us-skeleton"></i><i class="us-skeleton"></i></div>';
  }
  const from=today(),to=yearAhead();
  const index=itemsByDate(upcoming,monthsBetween(from,to));
  const days=[...index.keys()].filter(day=>day>=from&&day<to).sort();
  let left=UPCOMING_MAX;
  const sections=[];
  for(const day of days){
    if(left<=0)break;
    const items=index.get(day).slice(0,left);left-=items.length;
    sections.push(`<section class="us-noi-v2-month-day${day===from?' is-today':''}" aria-label="${esc(upcomingDayLabel(day))}"><button type="button" class="us-noi-v2-list-date" data-noi-day="${day}" data-noi-focus-list aria-label="${esc(upcomingDayLabel(day))}"><span>${esc(upcomingDayLabel(day))}</span>${day===from?'<em>Oggi</em>':''}</button>${items.map(item=>itemMarkup(day,item)).join('')}</section>`);
  }
  if(!sections.length)return `<div class="us-noi-v2-empty-month">${VENN.replace('class="us-noi-v2-venn"','class="us-noi-v2-venn is-big"')}<b>Niente in arrivo</b><button type="button" class="us-noi-v2-text-action" data-noi-add>Aggiungi un impegno</button></div>`;
  return `<div class="us-noi-v2-month-list">${sections.join('')}</div>`;
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
  // Lavagna (the mockup's Foglio): the days, then the free evenings of both
  // of you and how to see a day. No key: the names say whose (03/11/2026).
  return `<div class="us-noi-v2-week-list" role="group" aria-label="La nostra settimana">${rows}</div>${weekSummary(days.some(d=>d.day>=today())?free.size:-1)}<p class="us-noi-v2-week-note">Tocca un giorno nel calendario per vedere i dettagli.</p>`;
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
// A Ricordo of the chosen day: its photo, its words and who took it. It opens
// in its album (moments-albums.js) like a card of Ricordi.
function ricordoMarkup(m){
  const author=m.created_by?personName(m.created_by):'';
  const title=String(m.caption||'').trim()||'Un ricordo';
  const date=dateOf(m.day).toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{day:'numeric',month:'long',year:'numeric'});
  return `<button type="button" class="us-noi-v2-ricordo" data-noi-ricordo data-moment-id="${esc(m.id)}" data-storage-path="${esc(m.storage_path||'')}" data-moment-iso="${esc(m.day)}" data-moment-owner="${esc(m.created_by||'')}" data-caption="${esc(m.caption||'')}" data-author="${esc(author)}" data-date="${esc(date)}">${m.thumb?`<img src="${esc(m.thumb)}" alt="" loading="lazy" decoding="async">`:'<span class="us-noi-v2-ricordo-blank" aria-hidden="true"></span>'}<span class="us-noi-v2-ricordo-copy"><small>Ricordo</small><b translate="no">${esc(title)}</b>${author?`<span>di ${esc(author)}</span>`:''}</span></button>`;
}
// The chosen day: its Ricordi, its commitments with time and whose, and the
// one way to add to it (the calendar editor, which also offers Eventi).
function detailMarkup(index) {
  const active=index.get(selected)||[];
  const ricordi=ricordiByDay().get(selected)||[];
  const head=`<div class="us-noi-v2-detail-head"><h3>${esc(dayTitle(selected))}</h3>${selected===today()?'<span class="us-noi-v2-today-pill">Oggi</span>':''}</div>`;
  const add='<button type="button" class="us-noi-v2-add-day" data-noi-add><span class="us-icon" data-us-icon="plus" aria-hidden="true"></span><span>Aggiungi a questo giorno</span></button>';
  if(active.length||ricordi.length)return `${head}<div class="us-noi-v2-day-items">${ricordi.map(ricordoMarkup).join('')}${active.map(item=>itemMarkup(selected,item)).join('')}</div>${add}`;
  if(pending&&!snapshot)return `${head}<div class="us-skeleton-rows" role="status"><span class="us-sr">Carico i vostri momenti…</span><i class="us-skeleton"></i><i class="us-skeleton"></i></div>`;
  return `${head}<p class="us-noi-v2-empty-day">Niente in programma. Un giorno libero, tutto vostro.</p>${add}`;
}
function syncStatus(){
  const status=$('usNoiV2Sync');
  if(!status)return;
  const text=pending?'Aggiorno…':error&&snapshot?'Non aggiornato':'';
  status.textContent=text;
  status.dataset.state=pending?'loading':error?'error':'idle';
}
// Motion, from the mockup (noi.js): the month slides 30px out (200ms, in)
// and the next one in (320ms, out); the day's title and moments rise 8px one
// after the other. The chosen day is framed in place (no moving disc).
const EASE_OUT='cubic-bezier(.2,.8,.2,1)',EASE_IN='cubic-bezier(.4,0,1,1)';
let entering=null,leaving=null;
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
function riseDetail(){
  if(reducedMotion())return;
  const detail=$('usNoiV2Detail');
  if(!detail)return;
  [...detail.querySelectorAll('.us-noi-v2-detail-head h3,.us-noi-v2-day-items>*,.us-noi-v2-empty-day')].forEach((el,i)=>el.animate?.([{opacity:0,translate:'0 8px'},{opacity:1,translate:'0 0'}],{duration:320,delay:i*50,easing:EASE_OUT,fill:'backwards'}));
}
function setMode(next){
  if(mode===next)return;
  mode=next;render();
  if(next==='list')refreshUpcoming();
  const shown=$('usNoiV2Content')?.querySelector(next==='list'?'.us-noi-v2-month-list,.us-noi-v2-empty-month,.us-skeleton-rows':'.us-noi-v2-calendar');
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
  // "Torna a oggi" in any other month (Il nostro giorno lives in Impostazioni).
  const [nowYear,nowMonth]=currentMonth();
  const thisMonth=year===nowYear&&month===nowMonth;
  const todayButton=$('usNoiV2Today');
  if(todayButton)todayButton.hidden=thisMonth||mode==='list';
  syncStatus();
  const container=$('usNoiV2Content'),detail=$('usNoiV2Detail');
  if(!container||!detail)return;
  const index=itemsByDate();
  const direction=enterDirection;
  enterDirection=0;
  if(mode==='list'){
    container.dataset.state=upcoming?'ready':upcomingError?'error':'loading';
    container.innerHTML=upcomingMarkup();
  }else{
    const notice=error&&!snapshot?`<p class="us-noi-v2-notice" role="alert">${icon('arrows-clockwise')}<span>Calendario non raggiungibile.</span><button type="button" data-noi-retry>Riprova</button></p>`:'';
    container.dataset.state=pending&&!snapshot?'loading':error&&!snapshot?'error':'ready';
    container.innerHTML=notice+calendarMarkup(index);
  }
  if(direction&&mode!=='week')playEnter(container,direction);else continueEnter(container);
  renderWeekSheet(index);
  detail.hidden=mode==='list';
  detail.innerHTML=mode==='list'?'':detailMarkup(index);
}
// «Prossimi» reads a year from today (calendar.js readNoiRange), once a
// minute at most; a change in Eventi or the editor forces it like the month.
async function refreshUpcoming({force=false}={}){
  const key=identityKey();
  if(!key){upcoming=null;upcomingKey='';return;}
  if(key!==upcomingKey){upcoming=null;upcomingAt=0;upcomingError='';upcomingKey=key;}
  if(upcomingPending&&!force)return;
  if(!force&&upcoming&&Date.now()-upcomingAt<60000)return;
  const source=window.USNoiCalendarRead?.readRange;
  if(typeof source!=='function')return;
  const token=++upcomingSeq;
  upcomingPending=true;upcomingError='';
  try{
    const data=await source(today(),yearAhead());
    if(token!==upcomingSeq||key!==identityKey())return;
    if(data){upcoming=data;upcomingAt=Date.now();}
  }catch(e){
    if(token===upcomingSeq&&key===identityKey()){upcomingError='Non disponibile';console.warn('[US Noi V2] upcoming read',e);}
  }finally{
    if(token===upcomingSeq){upcomingPending=false;if(mode==='list')render();}
  }
}
async function refresh({force=false}={}){
  const key=identityKey();
  if(!key){identity=null;snapshot=null;error='';render();return;}
  if(key!==identity){snapshot=null;refreshedAt=0;identity=key;}
  if(mode==='list')refreshUpcoming({force});
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
  // The grid only picks its own month; «Prossimi» and the week reach any.
  if(differentMonth&&mode==='calendar')return;
  selected=day;
  if(fromWeek&&!ideaPick)mode='calendar';
  if(ideaPick){
    const picker=window.UsCalendarLinks?.createForIdeaDate;
    if(picker)Promise.resolve(picker(day)).then(ok=>{if(ok){ideaPick=null;render();}});
    return;
  }
  if(fromList)mode='calendar';
  if(differentMonth){goToMonth(d.getFullYear(),d.getMonth(),day,Math.sign(d.getFullYear()*12+d.getMonth()-(year*12+month)));return;}
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
    if(direction===0){selected=today();render();riseDetail();return;}
    goToMonth(y,m,today(),Math.sign(direction));
  });
  $('usNoiV2')?.addEventListener('click',e=>{
    const day=e.target.closest('[data-noi-day]');if(day){chooseDay(day.dataset.noiDay,{fromList:day.hasAttribute('data-noi-focus-list')});return;}
    if(e.target.closest('[data-noi-retry]')){refresh({force:true});return;}
    // A Ricordo of the day opens in its album, like a card of Ricordi.
    const ricordo=e.target.closest('[data-noi-ricordo]');
    if(ricordo){window.openMomentViewer?.(ricordo);return;}
    if(e.target.closest('[data-noi-add]')){
      if(ideaPick){
        Promise.resolve(window.UsCalendarLinks?.createForIdeaDate?.(selected)).then(ok=>{if(ok){ideaPick=null;render();}});
        return;
      }
      if(window.UsCalendarLinks?.createForDate)window.UsCalendarLinks.createForDate(selected);
      return;
    }
    const item=e.target.closest('[data-noi-item]');
    if(item)openItem(item);
  });
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
    upcomingSeq++;upcomingPending=false;upcoming=null;upcomingAt=0;upcomingKey='';upcomingError='';
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
