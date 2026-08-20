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
function formatDate(value,long=true){if(!value)return '';const d=parseISO(value),y=d.getFullYear();return d.toLocaleDateString('it-IT',long?{weekday:'long',day:'numeric',month:'long',year:y!==new Date().getFullYear()?'numeric':undefined}:{day:'numeric',month:'short'});}
function monthShort(value){return parseISO(value).toLocaleDateString('it-IT',{month:'short'}).replace('.','');}
function countdown(days){if(days===0)return 'Oggi';if(days===1)return 'Domani';return `Tra ${days} giorni`;}
function detailLine(row){const bits=[];if(row.event_time)bits.push(String(row.event_time).slice(0,5));if(row.location)bits.push(row.location);if(row.recurs_yearly)bits.push('ogni anno');return bits.length?bits.join(' · '):countdown(row.days_left);}
function createdDate(row){return localISOFromDate(row.created_at)||row.event_date;}
function previewXp(row,occurrenceDate){if(row.recurs_yearly)return 60;const lead=Math.max(0,daysBetween(createdDate(row),occurrenceDate));return lead>=7?50:lead>=2?35:25;}

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
  const kind=months%12===0?'anniversary':'monthiversary';const xp=kind==='anniversary'?200:60;
  const awarded=milestones.find(item=>item.milestone_date===date);
  return {system:true,id:`relationship-${date}`,title:kind==='anniversary'?'Anniversario ♡':'Mesiversario ♡',effective_date:date,days_left:daysBetween(today,date),months,xp,kind,awarded};
}
function upcomingRows(){
  const eventRows=rows.map(occurrence).filter(Boolean);const relationship=nextRelationshipMilestone();if(relationship)eventRows.push(relationship);
  return eventRows.sort((a,b)=>a.effective_date.localeCompare(b.effective_date)||String(a.event_time||'23:59:59').localeCompare(String(b.event_time||'23:59:59')));
}
function dueRows(){
  const today=localTodayISO();return rows.map(row=>{const date=previousOccurrence(row);if(!date||date>=today||completionFor(row.id,date))return null;return {...row,effective_date:date,days_left:daysBetween(today,date)};}).filter(Boolean).sort((a,b)=>b.effective_date.localeCompare(a.effective_date));
}
function completedRows(){
  const byId=new Map(rows.map(r=>[r.id,r]));return completions.map(c=>{const row=byId.get(c.event_id);return row?{...row,effective_date:c.occurrence_date,completion:c}:null;}).filter(Boolean).sort((a,b)=>String(b.completion.completed_at).localeCompare(String(a.completion.completed_at))).slice(0,6);
}
function eventButton(row,{due=false,done=false}={}){
  const day=Number(row.effective_date.slice(-2));const comp=row.completion||completionFor(row.id,row.effective_date);const xp=comp?.xp_awarded||previewXp(row,row.effective_date);
  return `<button type="button" class="us-event-item ${due?'is-due':''} ${done?'is-done':''}" data-id="${esc(row.id)}" data-occurrence="${esc(row.effective_date)}">
    <span class="us-event-datebox"><small>${esc(monthShort(row.effective_date))}</small><b>${day}</b></span>
    <span class="us-event-main"><b>${esc(row.title)}</b><small>${done?`Completato · +${xp} XP`:due?`Da segnare · +${xp} XP`:esc(detailLine(row))}</small></span>
    <span class="us-event-chevron">${done?'✓':'›'}</span>
  </button>`;
}
function relationshipButton(row){
  const subtitle=row.awarded?`Festeggiato · +${row.awarded.xp_awarded} XP`:`${row.months} ${row.months===1?'mese':'mesi'} insieme · +${row.xp} XP`;
  return `<div class="us-event-item us-event-system"><span class="us-event-datebox us-event-heart-date"><small>${esc(monthShort(row.effective_date))}</small><b>♡</b></span><span class="us-event-main"><b>${esc(row.title)}</b><small>${esc(subtitle)}</small></span><span class="us-event-chevron">✦</span></div>`;
}
function render(){
  const upcoming=upcomingRows(),due=dueRows(),done=completedRows();const list=$('usEventsList'),count=$('usEventsCount'),card=$('usNextEventCard'),dot=$('usCalendarDot');
  if(count)count.textContent=upcoming.length?`${upcoming.length} ${upcoming.length===1?'evento':'eventi'}`:'';
  if(dot)dot.hidden=!(upcoming[0]&&upcoming[0].days_left<=7);
  if(!upcoming.length){if(card)card.hidden=true;if(list)list.innerHTML='<div class="us-events-empty"><b>Niente in programma per ora.</b><br>Aggiungete solo le date che vale davvero la pena aspettare insieme.</div>';}
  else{
    const next=upcoming[0];if(card){card.hidden=false;card.classList.toggle('us-next-relationship',Boolean(next.system));card.dataset.id=next.system?'':next.id;card.onclick=next.system?null:()=>editEvent(next.id,next.effective_date);$('usNextEventTitle').textContent=next.title;$('usNextEventDate').textContent=formatDate(next.effective_date)+(next.event_time?` · ${String(next.event_time).slice(0,5)}`:'');$('usNextEventCountdown').textContent=next.system?(next.awarded?`+${next.awarded.xp_awarded} XP ricevuti`:countdown(next.days_left)+` · +${next.xp} XP`):countdown(next.days_left);}
    if(list)list.innerHTML=upcoming.map(row=>row.system?relationshipButton(row):eventButton(row)).join('');
    list?.querySelectorAll('.us-event-item[data-id]').forEach(btn=>btn.addEventListener('click',()=>editEvent(btn.dataset.id,btn.dataset.occurrence)));
  }
  const dueSection=$('usEventsDueSection'),dueList=$('usEventsDueList');if(dueSection)dueSection.hidden=!due.length;if(dueList)dueList.innerHTML=due.map(row=>eventButton(row,{due:true})).join('');dueList?.querySelectorAll('[data-id]').forEach(btn=>btn.addEventListener('click',()=>editEvent(btn.dataset.id,btn.dataset.occurrence)));
  const doneSection=$('usEventsDoneSection'),doneList=$('usEventsDoneList');if(doneSection)doneSection.hidden=!done.length;if(doneList)doneList.innerHTML=done.map(row=>eventButton(row,{done:true})).join('');doneList?.querySelectorAll('[data-id]').forEach(btn=>btn.addEventListener('click',()=>editEvent(btn.dataset.id,btn.dataset.occurrence)));
}
async function hydrateEvents(){
  if(!window.usProfile)return;const list=$('usEventsList');
  try{
    const [eventsRes,completionRes,coupleRes,milestoneRes]=await Promise.all([
      sb.from('shared_events').select('id,couple_id,created_by,title,event_date,event_time,location,note,recurs_yearly,created_at,updated_at').eq('couple_id',window.usProfile.couple_id).order('event_date',{ascending:true}),
      sb.from('shared_event_completions').select('id,event_id,occurrence_date,completed_by,xp_awarded,completed_at').eq('couple_id',window.usProfile.couple_id).order('completed_at',{ascending:false}),
      sb.from('couples').select('started_on').eq('id',window.usProfile.couple_id).maybeSingle(),
      sb.from('relationship_milestones').select('milestone_date,kind,months_together,xp_awarded,awarded_at').eq('couple_id',window.usProfile.couple_id).order('milestone_date',{ascending:false}).limit(24)
    ]);
    if(eventsRes.error)throw eventsRes.error;if(completionRes.error)throw completionRes.error;if(coupleRes.error)throw coupleRes.error;if(milestoneRes.error)throw milestoneRes.error;
    rows=eventsRes.data||[];completions=completionRes.data||[];coupleStartedOn=coupleRes.data?.started_on||null;milestones=milestoneRes.data||[];render();
  }catch(error){console.warn('[US Events] load',error);if(list)list.innerHTML='<div class="us-events-empty">Non riesco a caricare gli eventi. Controlla la connessione e riprova.</div>';}
}
function showBrowse(){$('usEventsBrowse').hidden=false;$('usEventForm').hidden=true;editingId=null;editingOccurrenceDate=null;}
function showForm(){$('usEventsBrowse').hidden=true;$('usEventForm').hidden=false;setTimeout(()=>$('usEventTitleInput')?.focus({preventScroll:true}),80);}
function resetForm(){$('usEventForm')?.reset();$('usEventStatus').textContent='';$('usEventDeleteBtn').hidden=true;$('usEventCompleteBtn').hidden=true;$('usEventCompleteBtn').disabled=false;$('usEventSaveBtn').textContent='Salva evento';$('usEventFormKicker').textContent='NUOVO EVENTO';$('usEventFormTitle').textContent='Aggiungi qualcosa da aspettare insieme';}
function beginAddEvent(){editingId=null;editingOccurrenceDate=null;resetForm();$('usEventDateInput').value=localTodayISO();showForm();}
function editEvent(id,occurrenceDate=null){
  const row=rows.find(item=>item.id===id);if(!row)return;editingId=id;editingOccurrenceDate=occurrenceDate||previousOccurrence(row)||row.event_date;resetForm();$('usEventFormKicker').textContent='EVENTO';$('usEventFormTitle').textContent=row.title;$('usEventTitleInput').value=row.title||'';$('usEventDateInput').value=row.event_date||'';$('usEventTimeInput').value=row.event_time?String(row.event_time).slice(0,5):'';$('usEventLocationInput').value=row.location||'';$('usEventNoteInput').value=row.note||'';$('usEventRecurringInput').checked=Boolean(row.recurs_yearly);$('usEventSaveBtn').textContent='Salva modifiche';
  const comp=completionFor(row.id,editingOccurrenceDate);const canComplete=editingOccurrenceDate&&editingOccurrenceDate<=localTodayISO();const completeBtn=$('usEventCompleteBtn');
  if(comp){completeBtn.hidden=false;completeBtn.disabled=true;completeBtn.textContent=`✓ Completato · +${comp.xp_awarded} XP`;}
  else if(canComplete){completeBtn.hidden=false;completeBtn.disabled=false;completeBtn.textContent=`✓ Segna come fatto · +${previewXp(row,editingOccurrenceDate)} XP`;}
  const hasAnyCompletion=completions.some(c=>c.event_id===row.id);$('usEventDeleteBtn').hidden=hasAnyCompletion?true:false;if(hasAnyCompletion)$('usEventStatus').textContent='Gli eventi già completati restano nello storico.';else $('usEventDeleteBtn').hidden=false;showForm();
}
function cancelEventEdit(){resetForm();showBrowse();}
async function completeEvent(){
  if(!editingId||!editingOccurrenceDate||busy||!window.usProfile)return;if(!navigator.onLine)return toast('Sei offline. Riprova quando torni online.');
  busy=true;const btn=$('usEventCompleteBtn');btn.disabled=true;btn.textContent='Segno…';
  try{const {data,error}=await sb.rpc('complete_shared_event',{target_event_id:editingId,target_occurrence_date:editingOccurrenceDate});if(error)throw error;await hydrateEvents();await window.hydrateBondSummary?.();cancelEventEdit();if(data?.already_completed)toast(`Già completato · +${data.xp_awarded||0} XP`);
else if(window.usCelebrateXp)window.usCelebrateXp(Number(data?.xp_awarded||0),'Evento vissuto');
else toast(`+${data?.xp_awarded||0} XP Bond ✦`);}catch(error){console.warn('[US Events] complete',error);$('usEventStatus').textContent='Non riesco a completarlo. Controlla la data e riprova.';}finally{busy=false;btn.disabled=false;}
}
async function saveEvent(event){
  event.preventDefault();if(busy||!window.usProfile)return;if(!navigator.onLine)return toast('Sei offline. Riprova quando torni online.');const title=$('usEventTitleInput').value.trim(),date=$('usEventDateInput').value;if(!title||!date)return;
  const payload={title,event_date:date,event_time:$('usEventTimeInput').value||null,location:$('usEventLocationInput').value.trim()||null,note:$('usEventNoteInput').value.trim()||null,recurs_yearly:$('usEventRecurringInput').checked};busy=true;const saveBtn=$('usEventSaveBtn');saveBtn.disabled=true;$('usEventStatus').textContent='Salvo…';
  try{let result;if(editingId)result=await sb.from('shared_events').update(payload).eq('id',editingId);else result=await sb.from('shared_events').insert({...payload,couple_id:window.usProfile.couple_id,created_by:window.usProfile.id});if(result.error)throw result.error;const wasEditing=Boolean(editingId);await hydrateEvents();cancelEventEdit();toast(wasEditing?'Evento aggiornato':'Evento aggiunto');}catch(error){console.warn('[US Events] save',error);$('usEventStatus').textContent='Non riesco a salvarlo. Riprova.';}finally{busy=false;saveBtn.disabled=false;}
}
async function deleteEvent(){
  if(!editingId||busy||!window.usProfile)return;if(completions.some(c=>c.event_id===editingId))return toast('Un evento completato resta nello storico');if(!confirm('Eliminare questo evento per entrambi?'))return;if(!navigator.onLine)return toast('Sei offline. Riprova quando torni online.');busy=true;const btn=$('usEventDeleteBtn');btn.disabled=true;$('usEventStatus').textContent='Elimino…';
  try{const {error}=await sb.from('shared_events').delete().eq('id',editingId);if(error)throw error;await hydrateEvents();cancelEventEdit();toast('Evento eliminato');}catch(error){console.warn('[US Events] delete',error);$('usEventStatus').textContent='Non riesco a eliminarlo. Riprova.';}finally{busy=false;btn.disabled=false;}
}
async function openEvents(){const overlay=$('usEventsOverlay');if(!overlay)return;overlay.classList.add('open');overlay.setAttribute('aria-hidden','false');document.body.classList.add('us-events-open');showBrowse();if(!window.usProfile){$('usEventsList').innerHTML='<div class="us-events-empty">Aspetto la sincronizzazione di US…</div>';return;}await hydrateEvents();}
function closeEvents(){if(busy)return;const overlay=$('usEventsOverlay');overlay?.classList.remove('open');overlay?.setAttribute('aria-hidden','true');document.body.classList.remove('us-events-open');resetForm();showBrowse();}
function captureDeepLink(){try{const url=new URL(location.href);deepLinkPending=url.searchParams.get('open')==='events';if(!deepLinkPending)return;url.searchParams.delete('open');history.replaceState(history.state||{},'',url.pathname+url.search+url.hash);}catch(_){}}
function flushDeepLink(){if(deepLinkPending&&window.usProfile){deepLinkPending=false;openEvents();}}
window.openEvents=openEvents;window.closeEvents=closeEvents;window.beginAddEvent=beginAddEvent;window.editEvent=editEvent;window.cancelEventEdit=cancelEventEdit;window.hydrateEvents=hydrateEvents;window.completeEvent=completeEvent;
$('usEventForm')?.addEventListener('submit',saveEvent);$('usEventDeleteBtn')?.addEventListener('click',deleteEvent);$('usEventCompleteBtn')?.addEventListener('click',completeEvent);document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('usEventsOverlay')?.classList.contains('open'))closeEvents();});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&$('usEventsOverlay')?.classList.contains('open'))hydrateEvents();});window.addEventListener('online',()=>{if($('usEventsOverlay')?.classList.contains('open'))hydrateEvents();});
captureDeepLink();const bootTimer=setInterval(()=>{flushDeepLink();if(window.usProfile)clearInterval(bootTimer);},300);setTimeout(()=>clearInterval(bootTimer),30000);setInterval(()=>{if(!document.hidden&&$('usEventsOverlay')?.classList.contains('open')&&window.usProfile)hydrateEvents();},60000);
console.info('[US Events] calendario + XP + ricorrenze attivi');
})();