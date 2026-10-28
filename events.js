(() => {
'use strict';
if(window.__usSharedEventsInstalled)return;
window.__usSharedEventsInstalled=true;

let rows=[];
let completions=[];
let milestones=[];
let coupleStartedOn=null;
let editingId=null;
let editingOccurrenceDate=null;
let busy=false;
let deepLinkPending=false;

const $=id=>document.getElementById(id);
const esc=(value='')=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function localTodayISO(){const n=new Date();return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;}
function localISOFromDate(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function parseISO(value){const [y,m,d]=String(value||'').split('-').map(Number);return new Date(y,m-1,d,12);}
function daysBetween(a,b){const [ay,am,ad]=a.split('-').map(Number),[by,bm,bd]=b.split('-').map(Number);return Math.round((Date.UTC(by,bm-1,bd)-Date.UTC(ay,am-1,ad))/86400000);}
function addMonthsDay(year,monthIndex,day){const last=new Date(year,monthIndex+1,0).getDate();const d=Math.min(day,last);return `${year}-${String(monthIndex+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
function completionFor(eventId,date){return completions.find(c=>c.event_id===eventId&&c.occurrence_date===date)||null;}
// Dates follow the app language (i18n.js sets UsI18n.tag); Italian otherwise.
function dateTag(){return globalThis.UsI18n?.tag||'it-IT';}
function formatDate(value,long=true){if(!value)return '';const d=parseISO(value),y=d.getFullYear();return d.toLocaleDateString(dateTag(),long?{weekday:'long',day:'numeric',month:'long',year:y!==new Date().getFullYear()?'numeric':undefined}:{day:'numeric',month:'short'});}
function monthShort(value){return parseISO(value).toLocaleDateString('it-IT',{month:'short'}).replace('.','');}
function countdown(days){if(days===0)return 'Oggi';if(days===1)return 'Domani';return `Tra ${days} giorni`;}
// The mockup writes the countdown in lower case after a date: "sabato 31 ottobre · tra 18 giorni".
function countdownLower(days){if(days===0)return 'oggi';if(days===1)return 'domani';return `tra ${days} giorni`;}
// A list row shows day and month only; the countdown beside it says how far.
function rowDay(value){return parseISO(value).toLocaleDateString(dateTag(),{day:'numeric',month:'long'});}
function capFirst(text){const value=String(text||'');return value?value.charAt(0).toLocaleUpperCase(dateTag())+value.slice(1):value;}
function listLine(row){const bits=[countdownLower(row.days_left)];if(row.event_time)bits.push(String(row.event_time).slice(0,5));if(row.recurs_yearly)bits.push('ogni anno');return bits.join(' · ');}
// Step motion of the mockup's Foglio flow: 28px sideways and a fade, 340ms.
const EASE_OUT='cubic-bezier(.2,.8,.2,1)';
function reducedMotion(){return document.documentElement?.dataset?.usMotion==='reduced'||Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);}
function stepIn(el,dir){if(!el||!dir||reducedMotion()||typeof el.animate!=='function')return;el.animate([{opacity:0,transform:`translateX(${dir*28}px)`},{opacity:1,transform:'none'}],{duration:340,easing:EASE_OUT});}
function setHead(kicker,title){const k=$('usEventsKicker'),t=$('usEventsTitle');if(k)k.textContent=kicker;if(t)t.textContent=title;}
function scrollSheetTop(){const panel=$('usEventsOverlay')?.querySelector?.('[data-us-modal-panel]');if(panel)panel.scrollTop=0;}
function detailLine(row){const bits=[];if(row.event_time)bits.push(String(row.event_time).slice(0,5));if(row.location)bits.push(row.location);if(row.recurs_yearly)bits.push('ogni anno');return bits.length?bits.join(' · '):countdown(row.days_left);}
function createdDate(row){return localISOFromDate(row.created_at)||row.event_date;}
// "Da segnare" keeps only what happened in the last 30 days.
const DUE_WINDOW_DAYS=30;
// Why a lived event brought no points (xp_reason of complete_shared_event).
const NO_XP_COPY={same_day:'Evento vissuto ♡ La Sintonia cresce con gli eventi programmati in anticipo',before_creation:'Evento vissuto ♡ La Sintonia cresce con gli eventi programmati in anticipo',daily_limit:'Evento vissuto ♡ Oggi un evento ha già fatto crescere la Sintonia'};

function occurrence(row){
  const today=localTodayISO(),raw=row.event_date;if(!raw)return null;
  if(!row.recurs_yearly){if(raw<today||completionFor(row.id,raw))return null;return {...row,effective_date:raw,days_left:daysBetween(today,raw)};}
  const [,month,day]=raw.split('-').map(Number);const year=Number(today.slice(0,4));let effective=addMonthsDay(year,month-1,day);
  if(effective<today||completionFor(row.id,effective)||effective<createdDate(row))effective=addMonthsDay(year+1,month-1,day);
  return {...row,effective_date:effective,days_left:daysBetween(today,effective)};
}
function previousOccurrence(row){
  const today=localTodayISO(),raw=row.event_date;if(!raw)return null;
  if(!row.recurs_yearly)return raw<=today?raw:null;
  const [,month,day]=raw.split('-').map(Number),year=Number(today.slice(0,4));let candidate=addMonthsDay(year,month-1,day);
  if(candidate>today)candidate=addMonthsDay(year-1,month-1,day);
  return candidate>=createdDate(row)?candidate:null;
}
function nextRelationshipMilestone(){
  if(!coupleStartedOn)return null;
  const [sy,sm,sd]=coupleStartedOn.split('-').map(Number);if(!sy||!sm||!sd)return null;
  const today=localTodayISO(),now=parseISO(today);let y=now.getFullYear(),m=now.getMonth();let date=addMonthsDay(y,m,sd);
  if(date<today){m++;if(m>11){m=0;y++;}date=addMonthsDay(y,m,sd);}
  const [cy,cm]=date.split('-').map(Number);const months=(cy-sy)*12+(cm-sm);if(months<=0)return null;
  const kind=months%12===0?'anniversary':'monthiversary';
  const awarded=milestones.find(item=>item.milestone_date===date&&item.kind!=='days');
  return {system:true,id:`relationship-${date}`,title:kind==='anniversary'?'Anniversario ♡':'Mesiversario ♡',effective_date:date,days_left:daysBetween(today,date),months,kind,awarded};
}
// Traguardi dei giorni (29/10/2026): the next 100 days together (1000: Mille
// giorni), one at a time, celebrated on the day like a mesiversario.
function nextDaysMilestoneRow(){
  const next=coupleStartedOn&&window.UsCalendarDomain?.nextDaysMilestone?.(coupleStartedOn,localTodayISO());
  if(!next)return null;
  const awarded=milestones.find(item=>item.milestone_date===next.date&&item.kind==='days');
  return {system:true,id:`days-${next.date}`,title:window.UsCalendarDomain.daysMilestoneTitle(next.days),effective_date:next.date,days_left:next.days_left,months:0,days:next.days,kind:'days',awarded};
}
function upcomingRows(){
  const eventRows=rows.map(occurrence).filter(Boolean);const relationship=nextRelationshipMilestone();if(relationship)eventRows.push(relationship);
  const days=nextDaysMilestoneRow();if(days)eventRows.push(days);
  return eventRows.sort((a,b)=>a.effective_date.localeCompare(b.effective_date)
    ||String(a.event_time||'23:59:59').localeCompare(String(b.event_time||'23:59:59'))
    ||String(b.updated_at||b.created_at||'').localeCompare(String(a.updated_at||a.created_at||''))
    ||String(a.id).localeCompare(String(b.id)));
}
function dueRows(){
  const today=localTodayISO();return rows.map(row=>{const date=previousOccurrence(row);if(!date||date>=today||daysBetween(date,today)>DUE_WINDOW_DAYS||completionFor(row.id,date))return null;return {...row,effective_date:date,days_left:daysBetween(today,date)};}).filter(Boolean).sort((a,b)=>b.effective_date.localeCompare(a.effective_date));
}
function completedRows(){
  const byId=new Map(rows.map(r=>[r.id,r]));return completions.map(c=>{const row=byId.get(c.event_id);return row?{...row,effective_date:c.occurrence_date,completion:c}:null;}).filter(Boolean).sort((a,b)=>String(b.completion.completed_at).localeCompare(String(a.completion.completed_at))).slice(0,6);
}
// The mockup's .ev row: the day, the title with one quiet line, and a tag or a check.
function eventButton(row,{due=false,done=false}={}){
  const tail=done?'<i class="us-event-ok" aria-hidden="true"><span class="us-icon" data-us-icon="check"></span></i>':due?'<em class="us-event-tag">Da segnare</em>':'';
  return `<button type="button" class="us-event-item ${due?'is-due':''} ${done?'is-done':''}" data-id="${esc(row.id)}" data-occurrence="${esc(row.effective_date)}">
    <time class="us-event-datebox" datetime="${esc(row.effective_date)}">${esc(rowDay(row.effective_date))}</time>
    <span class="us-event-main"><b translate="no">${esc(row.title)}</b><small>${done?'Festeggiato':due?'Da segnare':esc(listLine(row))}</small></span>${tail}
  </button>`;
}
function monthsTogether(months){return months===1?'Un mese insieme':months%12===0?(months===12?'Un anno insieme':`${months/12} anni insieme`):`${months} mesi insieme`;}
const togetherLine=row=>row.kind==='days'?window.UsCalendarDomain.daysMilestoneLine(row.days):monthsTogether(row.months);
// Mesiversario and anniversario open the Noi calendar on their day.
function relationshipButton(row){
  const subtitle=row.awarded?'Festeggiato':togetherLine(row);
  return `<button type="button" class="us-event-item us-event-system" data-relationship-date="${esc(row.effective_date)}"><time class="us-event-datebox" datetime="${esc(row.effective_date)}">${esc(rowDay(row.effective_date))}</time><span class="us-event-main"><b>${esc(row.title)}</b><small>${esc(subtitle)} · ${esc(countdownLower(row.days_left))}</small></span></button>`;
}
function openRelationshipDay(date){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date||'')))return;
  editorReturn=null;
  const overlay=$('usEventsOverlay');
  const go=()=>window.USNoiV2?.openCalendar?.({date});
  if(overlay?.classList.contains('open')){closeEvents();afterHistorySettles(go);}else go();
}
// M12A.1 — Eventi as a Noi surface. A presentation layer over the SAME data
// (upcomingRows / dueRows / completedRows): no new table, no second source of
// truth. PROSSIMI = the next occurrences, QUESTO PERIODO = what is nearby
// (still to mark + coming within two months), VISSUTI = completed events.
const SURFACE_NEXT=3,SURFACE_PERIOD_DAYS=60;
let loadedAt=0,surfaceSignature='';
function evIcon(row){return row.system?'heart':row.recurs_yearly?'arrows-clockwise':row.location?'map-pin':'calendar-heart';}
function evDay(value){const d=parseISO(value);return d.toLocaleDateString('it-IT',{day:'numeric',month:'long',year:d.getFullYear()!==new Date().getFullYear()?'numeric':undefined});}
function evDateLine(row){const bits=[evDay(row.effective_date)];if(row.event_time)bits.push(String(row.event_time).slice(0,5));return bits.join(' · ');}
function evIconChip(row){return `<span class="noi-ev-icon" aria-hidden="true"><span class="us-icon" data-us-icon="${evIcon(row)}"></span></span>`;}
function evCard(row,i){
  const main=`<span class="noi-ev-main"><b>${esc(row.title)}</b><small>${row.system?`<span>${esc(evDateLine(row))}</span> · <span>${esc(togetherLine(row))}</span>`:esc(evDateLine(row))}</small></span><span class="noi-ev-count">${esc(countdown(row.days_left))}</span>`;
  if(row.system)return `<button type="button" class="noi-ev-card is-system" style="--i:${i}" data-relationship-date="${esc(row.effective_date)}">${evIconChip(row)}${main}</button>`;
  return `<button type="button" class="noi-ev-card" style="--i:${i}" data-id="${esc(row.id)}" data-occurrence="${esc(row.effective_date)}">${evIconChip(row)}${main}</button>`;
}
function evRow(row,i,state){
  const day=Number(row.effective_date.slice(-2));
  const note=state==='soon'?detailLine(row):evDay(row.effective_date);
  const tail=state==='lived'?'<span class="us-icon" data-us-icon="check" aria-hidden="true"></span>':state==='due'?'<span class="noi-ev-chip">Da segnare</span>':'';
  const inner=`<span class="noi-ev-when"><small>${esc(monthShort(row.effective_date))}</small><b>${day}</b></span><span class="noi-ev-main"><b>${esc(row.title)}</b><small>${esc(note)}</small></span>${tail}`;
  const cls=`noi-ev-row is-${state}`;
  if(row.system)return `<button type="button" class="${cls} is-system" style="--i:${i}" data-relationship-date="${esc(row.effective_date)}">${inner}</button>`;
  return `<button type="button" class="${cls}" style="--i:${i}" data-id="${esc(row.id)}" data-occurrence="${esc(row.effective_date)}">${inner}</button>`;
}
function surfaceModel(upcoming,due,done){
  const next=upcoming.slice(0,SURFACE_NEXT);
  const nearby=upcoming.slice(SURFACE_NEXT).filter(row=>row.days_left<=SURFACE_PERIOD_DAYS);
  return {next,period:[...due.slice().reverse().map(row=>({row,state:'due'})),...nearby.map(row=>({row,state:'soon'}))],lived:done};
}
function renderSurface(upcoming,due,done){
  const body=$('noiEventsBody');
  if(!body)return;
  const model=surfaceModel(upcoming,due,done);
  const group=(label,content)=>`<section class="noi-ev-group"><div class="tiny noi-ev-label">${label}</div>${content}</section>`;
  let html='';
  let i=0;
  if(model.next.length)html+=group('Prossimi',`<div class="noi-ev-cards">${model.next.map(row=>evCard(row,i++)).join('')}</div>`);
  if(model.period.length)html+=group('Questo periodo',`<div class="noi-ev-timeline">${model.period.map(({row,state})=>evRow(row,i++,state)).join('')}</div>`);
  if(model.lived.length)html+=group('Vissuti',`<div class="noi-ev-timeline">${model.lived.map(row=>evRow(row,i++,'lived')).join('')}</div>`);
  if(!html)html='<div class="us-events-empty"><b>Niente in programma</b></div>';
  // Identical output is not re-written, so the soft entrance never replays.
  if(surfaceSignature===html)return;
  surfaceSignature=html;
  body.innerHTML=html;
}
// The existing editor sheet is reused. Opened from the Eventi surface it
// returns there when it is saved, cancelled or closed; opened from the Noi
// calendar (a tapped event, or "+" > Data speciale) it returns to the calendar.
let editorReturn=null; // 'surface' | 'calendar' | null
async function openEventEditor(id,occurrenceDate,{from='surface',date='',title='',time=''}={}){
  if(!$('usEventsOverlay'))return;
  editorReturn=from==='calendar'?'calendar':'surface';
  const opening=openEvents();
  if(!id){beginAddEvent({date,title,time});return;}
  if(!rows.some(row=>row.id===id))await opening;
  if(!$('usEventsOverlay')?.classList.contains('open'))return;
  editEvent(id,occurrenceDate);
}
function hydrateNoiEvents(){
  if(!window.usProfile)return Promise.resolve();
  if(loadedAt&&Date.now()-loadedAt<30000){render();return Promise.resolve();}
  return hydrateEvents();
}
function bindSurface(){
  const body=$('noiEventsBody');
  body?.addEventListener('click',event=>{
    const day=event.target.closest('[data-relationship-date]');if(day&&body.contains(day)){openRelationshipDay(day.dataset.relationshipDate);return;}
    const item=event.target.closest('[data-id]');if(item&&body.contains(item))openEventEditor(item.dataset.id,item.dataset.occurrence);
  });
  $('noiEventsAdd')?.addEventListener('click',()=>openEventEditor(null));
}
function render(){
  const upcoming=upcomingRows(),due=dueRows(),done=completedRows();const list=$('usEventsList'),count=$('usEventsCount'),card=$('usNextEventCard'),dot=$('usCalendarDot');
  if(count)count.textContent=upcoming.length?`${upcoming.length} ${upcoming.length===1?'evento':'eventi'}`:'';
  if(dot)dot.hidden=!(upcoming[0]&&upcoming[0].days_left<=7);
  if(!upcoming.length){if(card)card.hidden=true;if(list)list.innerHTML='<div class="us-events-empty"><b>Niente in programma</b></div>';}
  else{
    const next=upcoming[0];if(card){card.hidden=false;card.classList.toggle('us-next-relationship',Boolean(next.system));card.dataset.id=next.system?'':next.id;card.onclick=next.system?null:()=>editEvent(next.id,next.effective_date);$('usNextEventTitle').textContent=next.title;$('usNextEventDate').textContent=capFirst(formatDate(next.effective_date))+(next.event_time?` · ${String(next.event_time).slice(0,5)}`:'');$('usNextEventCountdown').textContent=next.system&&next.awarded?'Festeggiato':countdownLower(next.days_left);}
    if(list)list.innerHTML=upcoming.map(row=>row.system?relationshipButton(row):eventButton(row)).join('');
    list?.querySelectorAll('.us-event-item[data-id]').forEach(btn=>btn.addEventListener('click',()=>editEvent(btn.dataset.id,btn.dataset.occurrence)));
    list?.querySelectorAll('[data-relationship-date]').forEach(btn=>btn.addEventListener('click',()=>openRelationshipDay(btn.dataset.relationshipDate)));
  }
  renderSurface(upcoming,due,done);
  const dueSection=$('usEventsDueSection'),dueList=$('usEventsDueList');if(dueSection)dueSection.hidden=!due.length;if(dueList)dueList.innerHTML=due.map(row=>eventButton(row,{due:true})).join('');dueList?.querySelectorAll('[data-id]').forEach(btn=>btn.addEventListener('click',()=>editEvent(btn.dataset.id,btn.dataset.occurrence)));
  const doneSection=$('usEventsDoneSection'),doneList=$('usEventsDoneList');if(doneSection)doneSection.hidden=!done.length;if(doneList)doneList.innerHTML=done.map(row=>eventButton(row,{done:true})).join('');doneList?.querySelectorAll('[data-id]').forEach(btn=>btn.addEventListener('click',()=>editEvent(btn.dataset.id,btn.dataset.occurrence)));
}
async function loadEventsData(){
  if(!window.usProfile)return false;
  const [eventsRes,completionRes,coupleRes,milestoneRes]=await Promise.all([
    sb.from('shared_events').select('id,couple_id,created_by,title,event_date,event_time,location,note,recurs_yearly,created_at,updated_at').eq('couple_id',window.usProfile.couple_id).order('event_date',{ascending:true}),
    sb.from('shared_event_completions').select('id,event_id,occurrence_date,completed_by,xp_awarded,completed_at').eq('couple_id',window.usProfile.couple_id).order('completed_at',{ascending:false}),
    sb.from('couples').select('started_on').eq('id',window.usProfile.couple_id).maybeSingle(),
    sb.from('relationship_milestones').select('milestone_date,kind,months_together,days_together,xp_awarded,awarded_at').eq('couple_id',window.usProfile.couple_id).order('milestone_date',{ascending:false}).limit(24)
  ]);
  if(eventsRes.error)throw eventsRes.error;if(completionRes.error)throw completionRes.error;if(coupleRes.error)throw coupleRes.error;if(milestoneRes.error)throw milestoneRes.error;
  rows=eventsRes.data||[];loadedAt=Date.now();completions=completionRes.data||[];coupleStartedOn=coupleRes.data?.started_on||null;milestones=milestoneRes.data||[];
  return true;
}
async function hydrateEvents(){
  if(!window.usProfile)return;const list=$('usEventsList');
  try{await loadEventsData();render();}
  catch(error){console.warn('[US Events] load',error);const failed='<div class="us-events-empty">Non riesco a caricare gli eventi. Controlla la connessione e riprova.</div>';if(list)list.innerHTML=failed;const surface=$('noiEventsBody');if(surface&&!loadedAt){surfaceSignature='';surface.innerHTML=failed;}}
}
// Oggi refreshes that land together (Daily, Ti penso, foreground) share one
// in-flight read; a realtime Events change always asks for a fresh one.
let prioritySourceLoad=null;
async function getTodayEventPrioritySource({fresh=false}={}){
  if(!window.usProfile)return null;
  let load=prioritySourceLoad;
  if(fresh||!load){
    load=loadEventsData();prioritySourceLoad=load;
    const release=()=>{if(prioritySourceLoad===load)prioritySourceLoad=null;};
    load.then(release,release);
  }
  await load;
  return upcomingRows().find(row=>row.days_left>=0&&row.days_left<=2)||null;
}
// Oggi's "Prossimo impegno" pill follows a save, a delete or a "Fatto" at once,
// from the rows just read (no second read).
function refreshOggiNextFromEvents(){if(loadedAt)window.UsOggiNext?.refresh?.({event:upcomingRows().find(row=>row.days_left>=0&&row.days_left<=2)||null});}
function showBrowse(){const back=$('usEventForm')&&!$('usEventForm').hidden;$('usEventsBrowse').hidden=false;$('usEventForm').hidden=true;editingId=null;editingOccurrenceDate=null;setHead('Noi due','I nostri eventi');if(back){scrollSheetTop();stepIn($('usEventsBrowse'),-1);}}
// The form shows one event's detail (mode "detail") or its fields (mode "edit").
function setFormMode(mode){const form=$('usEventForm');if(form?.dataset)form.dataset.mode=mode;const edit=$('usEventEditBtn');if(edit)edit.hidden=mode!=='detail';}
function showForm({focus=true}={}){const from=$('usEventForm')?.hidden===false?0:1;$('usEventsBrowse').hidden=true;$('usEventForm').hidden=false;setHead($('usEventFormKicker').textContent,$('usEventFormTitle').textContent);scrollSheetTop();stepIn($('usEventForm'),from||1);if(focus)setTimeout(()=>$('usEventTitleInput')?.focus({preventScroll:true}),80);}
function resetForm(){$('usEventForm')?.reset();$('usEventStatus').textContent='';$('usEventDeleteBtn').hidden=true;$('usEventCompleteBtn').hidden=true;$('usEventCompleteBtn').disabled=false;$('usEventSaveBtn').textContent='Salva evento';$('usEventFormKicker').textContent='Noi due';$('usEventFormTitle').textContent='Nuovo evento';setFormMode('edit');}
// A new event starts today, or on the day chosen in the Noi calendar with what
// was already typed there.
function beginAddEvent({date='',title='',time=''}={}){editingId=null;editingOccurrenceDate=null;resetForm();$('usEventDateInput').value=/^\d{4}-\d{2}-\d{2}$/.test(String(date||''))?date:localTodayISO();if(title)$('usEventTitleInput').value=title;if(/^\d{2}:\d{2}$/.test(String(time||'')))$('usEventTimeInput').value=time;setFormMode('edit');showForm();}
function editEvent(id,occurrenceDate=null){
  const row=rows.find(item=>item.id===id);if(!row)return;editingId=id;editingOccurrenceDate=occurrenceDate||previousOccurrence(row)||row.event_date;resetForm();$('usEventTitleInput').value=row.title||'';$('usEventDateInput').value=row.event_date||'';$('usEventTimeInput').value=row.event_time?String(row.event_time).slice(0,5):'';$('usEventLocationInput').value=row.location||'';$('usEventNoteInput').value=row.note||'';$('usEventRecurringInput').checked=Boolean(row.recurs_yearly);$('usEventSaveBtn').textContent='Salva modifiche';
  const comp=completionFor(row.id,editingOccurrenceDate);const canComplete=editingOccurrenceDate&&editingOccurrenceDate<=localTodayISO();const completeBtn=$('usEventCompleteBtn');
  // The mockup's detail: when and where, one line on what can be done, then the actions.
  const state=comp?'done':canComplete?'due':'next';
  $('usEventFormKicker').textContent=state==='done'?'Vissuto':state==='due'?'Da segnare':'In arrivo';$('usEventFormTitle').textContent=row.title;
  const when=$('usEventDetailWhen');if(when)when.textContent=capFirst(formatDate(editingOccurrenceDate))+(row.event_time?` · ${String(row.event_time).slice(0,5)}`:'');
  const where=$('usEventDetailWhere');if(where)where.textContent=[row.location||'Luogo da decidere',state==='next'?countdownLower(daysBetween(localTodayISO(),editingOccurrenceDate)):''].filter(Boolean).join(' · ');
  const note=$('usEventDetailNote');if(note){note.textContent=row.note||'';note.hidden=!row.note;}
  const lead=$('usEventDetailLead');if(lead)lead.textContent=state==='done'?'Festeggiato insieme ♡':state==='due'?"L'avete vissuto? Segnatelo: vale per la vostra Sintonia.":'Quando arriva il giorno potrete segnarlo come vissuto.';
  if(!comp&&canComplete){completeBtn.hidden=false;completeBtn.disabled=false;completeBtn.innerHTML='<span class="us-icon" data-us-icon="check" aria-hidden="true"></span><span>Segna come fatto</span>';}
  const hasAnyCompletion=completions.some(c=>c.event_id===row.id);$('usEventDeleteBtn').hidden=hasAnyCompletion?true:false;if(hasAnyCompletion)$('usEventStatus').textContent='Gli eventi già completati restano nello storico.';else $('usEventDeleteBtn').hidden=false;
  setFormMode('detail');showForm({focus:false});
}
// Modifica: the same event, now as the form.
function editEventFields(){
  if(!editingId)return;const row=rows.find(item=>item.id===editingId);
  $('usEventFormKicker').textContent='Modifica';if(row)$('usEventFormTitle').textContent=row.title;
  setFormMode('edit');showForm();
}
// navigation.js pops one history entry per closed layer and, on each pop, closes
// every open layer that is not the landing one. The surface -> sheet -> form
// stack is three deep, so the pops must be taken one at a time, and the Noi
// page is put back afterwards if the pops closed it underneath the sheet.
function afterHistorySettles(fn){
  let done=false,fallback=null;
  const finish=()=>{if(done)return;done=true;window.removeEventListener('popstate',finish);clearTimeout(fallback);setTimeout(fn,0);};
  window.addEventListener('popstate',finish);
  fallback=setTimeout(finish,400);
}
function closeEditorToSurface(){afterHistorySettles(()=>closeEvents());}
function restoreSurface(){
  const page=document.querySelector('#bond .noi-canonical-page');
  if(page&&$('bond')?.classList.contains('active')&&page.dataset.noiView!=='eventi')window.openNoiSection?.('eventi');
}
function cancelEventEdit(){resetForm();showBrowse();if(editorReturn)closeEditorToSurface();}
async function completeEvent(){
  if(!editingId||!editingOccurrenceDate||busy||!window.usProfile)return;if(!navigator.onLine)return toast('Sei offline. Riprova quando torni online.');
  busy=true;const btn=$('usEventCompleteBtn');btn.disabled=true;btn.textContent='Segno…';
  try{const {data,error}=await sb.rpc('complete_shared_event',{target_event_id:editingId,target_occurrence_date:editingOccurrenceDate});if(error)throw error;await hydrateEvents();refreshOggiNextFromEvents();await window.hydrateBondSummary?.();cancelEventEdit();const xp=Math.max(0,Number(data?.xp_awarded)||0);if(data?.already_completed)toast('Già completato');
else if(!xp)toast(NO_XP_COPY[data?.xp_reason]||'Evento vissuto ♡');
else if(!window.usCelebrateXp?.(xp,'Evento vissuto'))toast('Evento vissuto ♡');}catch(error){console.warn('[US Events] complete',error);$('usEventStatus').textContent='Non riesco a completarlo. Controlla la data e riprova.';}finally{busy=false;btn.disabled=false;}
}
async function saveEvent(event){
  event.preventDefault();if(busy||!window.usProfile)return;if(!navigator.onLine)return toast('Sei offline. Riprova quando torni online.');const title=$('usEventTitleInput').value.trim(),date=$('usEventDateInput').value;if(!title||!date)return;
  const payload={title,event_date:date,event_time:$('usEventTimeInput').value||null,location:$('usEventLocationInput').value.trim()||null,note:$('usEventNoteInput').value.trim()||null,recurs_yearly:$('usEventRecurringInput').checked};busy=true;const saveBtn=$('usEventSaveBtn');saveBtn.disabled=true;$('usEventStatus').textContent='Salvo…';
  try{let result;if(editingId)result=await sb.from('shared_events').update(payload).eq('id',editingId);else result=await sb.from('shared_events').insert({...payload,couple_id:window.usProfile.couple_id,created_by:window.usProfile.id});if(result.error)throw result.error;const wasEditing=Boolean(editingId);await hydrateEvents();refreshOggiNextFromEvents();cancelEventEdit();toast(wasEditing?'Evento aggiornato':'Evento aggiunto');}catch(error){console.warn('[US Events] save',error);$('usEventStatus').textContent='Non riesco a salvarlo. Riprova.';}finally{busy=false;saveBtn.disabled=false;}
}
async function deleteEvent(){
  if(!editingId||busy||!window.usProfile)return;if(completions.some(c=>c.event_id===editingId))return toast('Un evento completato resta nello storico');if(!(await usConfirm({kicker:'I NOSTRI EVENTI',title:'Eliminare questo evento?',body:'Sparirà per voi due.',confirmLabel:'Elimina',tone:'danger'})))return;if(!navigator.onLine)return toast('Sei offline. Riprova quando torni online.');busy=true;const btn=$('usEventDeleteBtn');btn.disabled=true;$('usEventStatus').textContent='Elimino…';
  try{const {error}=await sb.from('shared_events').delete().eq('id',editingId);if(error)throw error;await hydrateEvents();refreshOggiNextFromEvents();cancelEventEdit();toast('Evento eliminato');}catch(error){console.warn('[US Events] delete',error);$('usEventStatus').textContent='Non riesco a eliminarlo. Riprova.';}finally{busy=false;btn.disabled=false;}
}
async function openEvents(){const overlay=$('usEventsOverlay');if(!overlay)return;window.UsUiFoundation?.cancelSurfaceExit?.(overlay);overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');document.body.classList.add('us-events-open');showBrowse();if(!window.usProfile){$('usEventsList').innerHTML='<div class="us-events-empty">Un attimo…</div>';return;}await hydrateEvents();}
function closeEvents(){if(busy)return;const overlay=$('usEventsOverlay');if(!overlay)return;const finalize=()=>{const fromSurface=editorReturn==='surface';editorReturn=null;if(fromSurface)afterHistorySettles(restoreSurface);overlay.classList.remove('open');overlay.setAttribute('aria-hidden','true');document.body.classList.remove('us-events-open');resetForm();showBrowse();};if(window.UsUiFoundation?.exitSurface)window.UsUiFoundation.exitSurface(overlay,finalize);else finalize();}
function captureDeepLink(){try{const url=new URL(location.href);deepLinkPending=url.searchParams.get('open')==='events';if(!deepLinkPending)return;url.searchParams.delete('open');history.replaceState(history.state||{},'',url.pathname+url.search+url.hash);}catch(_){}}
function flushDeepLink(){if(deepLinkPending&&window.usProfile){deepLinkPending=false;openEvents();}}
window.hydrateNoiEvents=hydrateNoiEvents;window.openEventEditor=openEventEditor;window.openEvents=openEvents;window.closeEvents=closeEvents;window.beginAddEvent=beginAddEvent;window.editEvent=editEvent;window.cancelEventEdit=cancelEventEdit;window.hydrateEvents=hydrateEvents;window.getTodayEventPrioritySource=getTodayEventPrioritySource;window.completeEvent=completeEvent;
$('usEventForm')?.addEventListener('submit',saveEvent);$('usEventDeleteBtn')?.addEventListener('click',deleteEvent);$('usEventEditBtn')?.addEventListener('click',editEventFields);$('usEventCompleteBtn')?.addEventListener('click',completeEvent);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('usEventsOverlay')?.classList.contains('open'))closeEvents();});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('usEventsOverlay')?.classList.contains('open'))hydrateEvents();});window.addEventListener('online',()=>{if($('usEventsOverlay')?.classList.contains('open'))hydrateEvents();});
bindSurface();captureDeepLink();const bootTimer=setInterval(()=>{flushDeepLink();if(window.usProfile)clearInterval(bootTimer);},300);setTimeout(()=>clearInterval(bootTimer),30000);setInterval(()=>{if(!document.hidden&&$('usEventsOverlay')?.classList.contains('open')&&window.usProfile)hydrateEvents();},60000);
console.info('[US Events] eventi e ricorrenze attivi');
})();
