// Note condivise V1 — the couple's notes in Noi: a title, a text and an
// optional checklist, written and ticked by both. Saved by itself after a
// short pause and on close; last save wins, with a notice when the partner
// saves the note you have open (D8). The editor's fields are built once and
// never rebuilt while typing, so the keyboard keeps its state.
// Spec: docs/missions/note-condivise-v1.md.
//
// Noi nuova (founder, 03/11/2026, docs/DECISIONS.md; tavole Main.dc.html e
// Bacheca.dc.html): the notes are post-its. On the Noi page, under the
// calendar, the fixed «Da vivere» post-it (the couple's ideas, app.js) and at
// most six post-its, written and ticked on the spot; «Tutti i post-it (n)»
// opens the whole board (the Foglio #usNotesSheet) with the colour filters.
// Every post-it has its paper (yellow, pink, blue, green) and its author.
//
// Noi, Fase B (founder, 24/11/2026, D4/D11/D12; tavola «US · Noi, il vostro
// tempo», boards Main and Lavagna): the post-its sit on La lavagna, over the
// drawing. In Noi the three newest, in the full-screen lavagna six, where
// they move with a finger (board_x/board_y, 20261125120000); «Le vostre
// idee» pinned in the top-right corner. Tapped, a post-it comes forward
// (#usPostitFocus) to be written on. Its paper is the colour of who wrote it.
(function(global,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  global.UsCoupleNotes=api;api.install(global);
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const COLS_BASE='id,couple_id,title,body,items,color,created_by,updated_by,created_at,updated_at,revision';
const COLS=`${COLS_BASE},board_x,board_y`;
const LIMITS=Object.freeze({title:80,body:4000,items:100,item:200});
const COLORS=Object.freeze(['yellow','pink','blue','green']);
// On Noi the three newest over the drawing; on the full-screen lavagna six.
const ON_NOI=3,ON_BOARD=6;
// Where the post-its never moved go, in the order they were written (their
// centre, a share of the board): two loose columns under the ideas' corner.
const SPOTS=Object.freeze([[.3,.22],[.7,.36],[.3,.5],[.72,.62],[.3,.78],[.7,.88]]);
// In Noi the lavagna is a small window (wider than tall): its three post-its
// have their own places around the ideas' corner; where they were left counts
// on the full-screen lavagna.
const NOI_SPOTS=Object.freeze([[.36,.3],[.64,.68],[.2,.74]]);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const romeDay=at=>{try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome'}).format(new Date(at));}catch(_){return '';}};

// "adesso", "5 min fa", "oggi", "ieri", then the date.
function when(at,now=Date.now()){
  const t=Date.parse(at||'');
  if(!Number.isFinite(t))return '';
  const min=Math.floor(Math.max(0,now-t)/60000);
  if(min<1)return 'adesso';
  if(min<60)return `${min} min fa`;
  const day=romeDay(t),today=romeDay(now);
  if(day===today)return 'oggi';
  if(day===romeDay(now-864e5))return 'ieri';
  const sameYear=day.slice(0,4)===today.slice(0,4);
  try{return new Date(t).toLocaleDateString('it-IT',{day:'numeric',month:'long',...(sameYear?{}:{year:'numeric'}),timeZone:'Europe/Rome'});}catch(_){return day;}
}
const items=n=>Array.isArray(n?.items)?n.items.filter(i=>i&&typeof i.text==='string'):[];
function isEmpty(n){
  return !String(n?.title||'').trim()&&!String(n?.body||'').trim()&&!items(n).some(i=>i.text.trim());
}
// Closing a post-it (04/11/2026, the «ciao» that vanished on staging): with
// something written it is saved; empty, it goes by itself only if it was
// never filled (new in this opening, never on the server); one on the board
// asks first, even one written a moment ago.
function closeVerdict(n){
  if(!isEmpty(n))return 'save';
  return n?.id?'ask':'drop';
}
// A Realtime row is a note only with its title, text and list: Supabase
// leaves out the values over 64 bytes when a change is too big to send.
const fullRow=r=>Boolean(r)&&['title','body','items'].every(k=>r[k]!=null);
// The card under the title: the first line of the text, or the list.
function summary(n){
  const list=items(n).filter(i=>i.text.trim());
  const done=list.filter(i=>i.done).length;
  const line=String(n?.body||'').split('\n').map(s=>s.trim()).find(Boolean)||'';
  const preview=line||list.filter(i=>!i.done).map(i=>i.text.trim()).join(', ')||list.map(i=>i.text.trim()).join(', ');
  return {preview:preview.length>90?`${preview.slice(0,89)}…`:preview,progress:list.length?`${done} di ${list.length}`:''};
}
// A paper the table knows, yellow otherwise (the default of the column).
const colorOf=n=>COLORS.includes(n?.color)?n.color:'yellow';
// What goes to the server: the lengths the table accepts; empty list items
// are dropped when the note is closed (keep:false).
function payload(n,{keep=true}={}){
  const list=items(n).slice(0,LIMITS.items).map(i=>({id:String(i.id||newId()).slice(0,40),text:i.text.slice(0,LIMITS.item),done:Boolean(i.done)}));
  return {title:String(n?.title||'').slice(0,LIMITS.title),body:String(n?.body||'').slice(0,LIMITS.body),items:keep?list:list.filter(i=>i.text.trim()),color:colorOf(n)};
}
function newId(){return Math.random().toString(36).slice(2,10)||'i';}
function sortNotes(list){return [...list].sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));}
// On Noi: the most recent post-its, at most six; the others on the board.
function boardNotes(list,{max=ON_NOI}={}){
  const sorted=sortNotes(list||[]);
  return {shown:sorted.slice(0,max),total:sorted.length,more:sorted.length>max};
}
const clamp01=v=>Math.min(1,Math.max(0,v));
const placed=n=>n?.board_x!=null&&n?.board_y!=null&&Number.isFinite(Number(n.board_x))&&Number.isFinite(Number(n.board_y));
// The place of every post-it: its own when moved, else the next free spot.
function placesFor(list){
  const out=new Map();let i=0;
  const loose=[...(list||[])].filter(n=>!placed(n)).sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')));
  for(const n of list||[])if(placed(n))out.set(n.id,{x:clamp01(Number(n.board_x)),y:clamp01(Number(n.board_y)),moved:true});
  for(const n of loose){const s=SPOTS[i++%SPOTS.length];out.set(n.id,{x:s[0],y:s[1],moved:false});}
  return out;
}
// A place to save: shares to a thousandth, inside the board.
const placePayload=(x,y)=>({board_x:Math.round(clamp01(x)*1000)/1000,board_y:Math.round(clamp01(y)*1000)/1000});
// A change that moved the post-it and nothing else: no «just changed it».
const sameWords=(a,b)=>Boolean(a&&b)&&String(a.title||'')===String(b.title||'')&&String(a.body||'')===String(b.body||'')&&JSON.stringify(items(a))===JSON.stringify(items(b))&&colorOf(a)===colorOf(b);
const missingPlace=e=>/board_[xy]/.test(String(e?.message||''))||e?.code==='42703'||e?.code==='PGRST204';
// The whole board by who wrote it: all, yours, your person's.
function byAuthor(list,who,me){
  if(who!=='me'&&who!=='partner')return [...(list||[])];
  return (list||[]).filter(n=>((n.created_by||n.updated_by)===me)===(who==='me'));
}
function byColor(list,color){return color&&color!=='all'?(list||[]).filter(n=>colorOf(n)===color):[...(list||[])];}
// Each post-it leans a little, left or right by 1°…2° as in the tavola (at
// 0° or half a degree they looked straight), always the same way for the
// same note.
function tilt(id){
  let h=0;
  for(const c of String(id||''))h=(h*31+c.charCodeAt(0))>>>0;
  const lean=1+(h>>>1)%6/5;
  return h&1?-lean:lean;
}
// «Da vivere»: the ideas still to live, each with who said it was lived
// (todo, mine: I said it, partner: they said it), then the last ones lived.
function ideaLines(snap,me,{limit=Infinity,lived=2}={}){
  if(!snap?.loaded)return {lines:[],hidden:0};
  const state=i=>i.status==='lived'?'lived':!i.lived_proposed_by?'todo':i.lived_proposed_by===me?'mine':'partner';
  const active=(snap.active||[]).map(i=>({id:i.id,title:i.title,state:state(i)}));
  const all=snap.lived||[];
  const done=[...all].sort((a,b)=>String(b.completed_at||'').localeCompare(String(a.completed_at||''))).slice(0,lived).map(i=>({id:i.id,title:i.title,state:'lived'}));
  const lines=[...active,...done].slice(0,limit);
  return {lines,hidden:active.length+all.length-lines.length};
}

// Noi, Fase B.2 (D13): the day of a commitment made from an idea, as Rome
// sees it (the last day, for one lasting several days).
function entryDay(e){
  if(!e)return '';
  const d=e.end_date||e.start_date;
  if(d)return String(d).slice(0,10);
  return e.ends_at||e.starts_at?romeDay(e.ends_at||e.starts_at):'';
}
const dayGap=(a,b)=>Math.round((Date.parse(`${b}T12:00:00Z`)-Date.parse(`${a}T12:00:00Z`))/864e5);
// «L'avete fatto?»: the first idea fixed on a day already gone (at most a
// week ago), not yet said lived by me, never asked before. Once only.
function dueDone(snap,entryOf,me,today,asked){
  if(!snap?.loaded)return null;
  for(const i of snap.active||[]){
    if(i.status!=='scheduled'||!i.calendar_entry_id||i.lived_proposed_by===me||asked(i.id))continue;
    const day=entryDay(entryOf(i.id));
    if(!day||day>=today||dayGap(day,today)>7)continue;
    return {id:i.id,title:String(i.title||''),day,entryId:i.calendar_entry_id,partnerSaid:Boolean(i.lived_proposed_by)};
  }
  return null;
}
// How an idea stands on the board: to fix (Scegli il giorno), fixed, said
// lived by me (waiting) or by my person (to confirm).
function ideaState(i,me){
  if(i.lived_proposed_by)return i.lived_proposed_by===me?'mine':'partner';
  return i.status==='scheduled'?'fixed':'todo';
}

function install(w){
  const d=w.document,$=id=>d.getElementById(id),root=$('usNotesSheet'),page=$('usNoiBoard');
  if(!root&&!page)return;
  const body=$('usNotesBody'),grid=$('usNoiBoardGrid'),allButton=$('usNoiBoardAll');
  const focusRoot=$('usPostitFocus'),focusList=$('usPostitFocusList');
  let notes=[],loaded=false,loadedAt=0,owner='',token=0,filter='all';
  // placeless: the server has no board_x/board_y yet (a database before
  // 20261125120000); the post-its are read without them and move only here.
  let placeless=false,focusIdeas=false,drag=null,dragEnded=0;
  const cols=()=>placeless?COLS_BASE:COLS;
  let editing=null,editHost='page',dirty=false,saving=false,again=false,timer=0,remote=null,noticeTimer=0,fields=null;
  const me=()=>w.usProfile?.id||'';
  const key=()=>w.usProfile?`${w.usProfile.id}:${w.usProfile.couple_id}`:'';
  const opened=()=>Boolean(root?.classList.contains('open'));
  const db=()=>typeof sb!=='undefined'?sb:null;
  const nameOf=id=>{
    if(!id)return '';
    if(id===me())return 'Tu';
    try{
      const p=w.UsCoupleContext?.snapshot?.()?.profiles?.find(x=>x.id===id);
      return p?(w.usIdentity?.()?.nameForRole?.(p.role)||'La tua persona'):'';
    }catch(_){return '';}
  };
  const partnerName=()=>{try{return w.usIdentity?.()?.partnerName||'La tua persona';}catch(_){return 'La tua persona';}};
  // The author at the bottom of the post-it, and when it last changed.
  const authorOf=n=>n.created_by||n.updated_by||'';
  const byLine=n=>[nameOf(authorOf(n)),when(n.updated_at)].filter(Boolean).join(' · ');
  // D12: the paper is the colour of who wrote it («tu», or your person).
  const whoOf=n=>{const a=n&&authorOf(n);return !a||a===me()?'tu':'partner';};

  // ---------------------------------------------------------------- post-its
  // Founder, 31/10/2026: every note is read without opening it, ticked on
  // the spot and written on by tapping it (it widens in place). What fits on
  // a post-it: four items, the ones still to do first; the count at the foot
  // ("1 di 7") says there are more. A list also takes a new item at the foot.
  // Since Fase B this is the post-it of «Tutti i post-it»; on the lavagna
  // the post-its are pinned (pin()) and come forward to be written on.
  const SHOWN=4;
  function tile(n){
    const s=summary(n),who=whoOf(n),title=String(n.title||'').trim();
    const list=items(n).filter(i=>i.text.trim()),shown=[...list.filter(i=>!i.done),...list.filter(i=>i.done)].slice(0,SHOWN);
    const content=list.length
      ?`<ul class="us-postit-items">${shown.map(i=>`<li class="${i.done?'is-done':''}"><label class="us-notes-check is-small"><input type="checkbox" data-tick="${esc(i.id)}"${i.done?' checked':''} aria-label="${esc(i.text)}"><span aria-hidden="true"></span></label><span class="us-postit-item" data-focus="item:${esc(i.id)}" translate="no">${esc(i.text)}</span></li>`).join('')}</ul>
        <input type="text" class="us-postit-add" data-add-item maxlength="${LIMITS.item}" placeholder="Aggiungi…" aria-label="Aggiungi a ${esc(title||'questo post-it')}" enterkeyhint="done">`
      :`<p class="us-postit-text" data-focus="text" translate="no">${esc(String(n.body||'').trim())}</p>`;
    return `<li class="us-postit" data-note-id="${esc(n.id)}" data-color="${colorOf(n)}" data-who="${who}" style="--tilt:${tilt(n.id)}deg">
      ${title?`<button type="button" class="us-postit-title" data-focus="title" aria-label="Scrivi sul post-it ${esc(title)}"><span translate="no">${esc(title)}</span></button>`:''}
      ${content}
      <small class="us-postit-by"><i class="us-notes-dot" data-who="${who}" aria-hidden="true"></i><span>${esc(byLine(n))}</span>${s.progress?`<b>${esc(s.progress)}</b>`:''}</small>
    </li>`;
  }
  // On the lavagna (board Lavagna): the words in Fraunces, «tu · adesso» at
  // the foot, where it was left. Tapped, it comes forward; on the full-screen
  // lavagna it is also dragged.
  function pin(n,p){
    const s=summary(n),who=whoOf(n),title=String(n.title||'').trim(),words=title||s.preview||'Un post-it';
    const by=[who==='tu'?'tu':(nameOf(authorOf(n))||partnerName()),when(n.updated_at)].filter(Boolean).join(' · ');
    return `<li class="us-postit is-pin" data-note-id="${esc(n.id)}" data-who="${who}" style="--x:${p.x};--y:${p.y};--tilt:${(tilt(n.id)*2.6).toFixed(1)}deg">
      <button type="button" class="us-postit-pin" data-focus="${title?'title':'text'}" aria-label="Post-it: ${esc(words)}"><span class="us-postit-words" translate="no">${esc(words)}</span>${s.progress?`<b class="us-postit-count">${esc(s.progress)}</b>`:''}</button>
      <small class="us-postit-by"><span translate="no">${esc(by)}</span></small>
    </li>`;
  }
  // «Le vostre idee», pinned in the top-right corner (D11): how many are
  // still to live; tapped, the ideas come forward.
  function ideasPin(big){
    const snap=w.UsDaVivere?.snapshot?.();
    if(!snap)return '';
    const todo=snap.loaded?(snap.active||[]):[];
    const first=big?todo.slice(0,2).map(i=>i.title):[];
    const lines=!snap.loaded?'':first.length
      ?`${first.map(t=>`<span translate="no">${esc(t)}</span>`).join('')}${todo.length>first.length?`<span>+${todo.length-first.length} ${todo.length-first.length===1?'altra':'altre'}</span>`:''}`
      :`<span>${todo.length?`${todo.length} da vivere`:'Le cose da fare insieme'}</span>`;
    return `<li class="us-postit is-pinned is-ideas" data-ideas-pin>
      <button type="button" class="us-postit-pin" data-ideas-open aria-label="Le vostre idee${todo.length?`: ${todo.length} da vivere`:''}"><b class="us-postit-heading">Le vostre idee</b><span class="us-postit-lines">${lines}</span></button>
    </li>`;
  }
  // «Le vostre idee» (board Idee, D13): each idea with the colour of who
  // had it; «Scegli il giorno» picks the day in the calendar of Noi and makes
  // it a commitment («Fissata», with its day). Tapping the title opens its
  // detail. Lived ones are counted at the foot.
  function ideaRow(i){
    const state=ideaState(i,me()),who=!i.created_by?'noi':i.created_by===me()?'tu':'partner';
    const when=state==='fixed'?(w.UsDaVivere?.when?.(i.id)||''):'';
    const sub=state==='fixed'?(when?`${when.split(',')[0]}, in calendario`:'In calendario'):state==='mine'?`aspetta ${partnerName()}`:state==='partner'?`${partnerName()} dice che l’avete fatto`:'';
    const action=state==='todo'?`<button type="button" class="us-idea-go" data-idea-pick="${esc(i.id)}">Scegli il giorno</button>`
      :state==='fixed'?'<span class="us-idea-chip">Fissata</span>'
      :state==='partner'?`<button type="button" class="us-idea-go" data-idea-confirm="${esc(i.id)}">Sì, fatto</button>`:'';
    return `<li class="us-idea-row is-${state}"><i class="us-notes-dot" data-who="${who}" aria-hidden="true"></i><span class="us-idea-main"><button type="button" class="us-idea-title" data-idea-open="${esc(i.id)}" translate="no">${esc(i.title)}</button>${sub?`<small>${esc(sub)}</small>`:''}</span>${action}</li>`;
  }
  function daVivere(host){
    const snap=w.UsDaVivere?.snapshot?.();
    if(!snap)return '';
    const active=snap.loaded?(snap.active||[]):[],lived=snap.loaded?(snap.lived||[]).length:0;
    const list=!snap.loaded
      ?`<p class="us-postit-text">${snap.error?'Non riesco a caricare le idee.':'Carico…'}</p>`
      :active.length?`<ul class="us-idea-rows">${active.map(ideaRow).join('')}</ul>`:'<p class="us-postit-text">Ancora nessuna idea: scrivete la prima.</p>';
    const close=host==='focus'?'<button type="button" class="us-idea-close" data-focus-close aria-label="Chiudi le vostre idee"><span class="us-icon" data-us-icon="x" aria-hidden="true"></span></button>':'';
    return `<li class="us-postit is-pinned is-ideas" data-davivere>
      <div class="us-idea-head"><h3 class="us-postit-heading">Le vostre idee</h3>${close}</div>
      <p class="us-idea-intro">Le cose da fare insieme, un giorno. Quando decidete quando, diventano un impegno.</p>
      ${list}
      <label class="us-idea-new"><span>Un’idea nuova</span><input type="text" class="us-idea-input" data-davivere-add maxlength="120" placeholder="Che cosa vi piacerebbe fare?" enterkeyhint="done"></label>
      ${lived?`<small class="us-postit-by"><span>${lived===1?'1 già fatta':`${lived} già fatte`}, con un ricordo in Ricordi</span></small>`:''}
    </li>`;
  }
  // «L'avete fatto?» (board Fatto, D13): the morning after, once, the two
  // characters ask; yes says it lived (the two-person rule of the ideas)
  // and offers a photo in Ricordi; «not yet» opens the commitment to move it.
  let fatto=null;
  const ASKED=()=>`us:fatto:v1:${me()}`;
  const askedList=()=>{try{return JSON.parse(w.localStorage?.getItem(ASKED())||'[]');}catch(_){return [];}};
  const asked=id=>askedList().includes(id);
  function markAsked(id){try{w.localStorage?.setItem(ASKED(),JSON.stringify([...askedList().filter(x=>x!==id),id].slice(-60)));}catch(_){}}
  function fattoMarkup(){
    const f=fatto,today=romeDay(Date.now()),yesterday=romeDay(Date.now()-864e5);
    let label='Ieri';
    if(f.day!==yesterday){try{label=new Date(`${f.day}T12:00:00Z`).toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',timeZone:'Europe/Rome'});label=label.charAt(0).toUpperCase()+label.slice(1);}catch(_){label=f.day;}}
    const duo=w.UsPersonaggi?.character?['francesco','beatrice'].map(r=>w.UsPersonaggi.character(r,{size:72,reaction:f.step==='photo'?'cuore':undefined})).join(''):'';
    void today;
    if(f.step==='photo')return `<li class="us-fatto" data-fatto>
      <span class="us-fatto-grab" aria-hidden="true"></span>
      <div class="us-fatto-duo" aria-hidden="true">${duo}</div>
      <h2 class="us-fatto-title">Che bello</h2>
      <p class="us-fatto-q">Aggiungete una foto di «${esc(f.title)}» in Ricordi?</p>
      <div class="us-fatto-actions"><button type="button" class="us-fatto-yes" data-fatto-photo>Aggiungi una foto</button><button type="button" class="us-fatto-no" data-focus-close>Più tardi</button></div>
    </li>`;
    return `<li class="us-fatto" data-fatto>
      <span class="us-fatto-grab" aria-hidden="true"></span>
      <div class="us-fatto-duo" aria-hidden="true">${duo}</div>
      <h2 class="us-fatto-title" translate="no">${esc(label)}, ${esc(f.title)}</h2>
      <p class="us-fatto-q">${f.partnerSaid?`L’avete fatto? ${esc(partnerName())} dice di sì.`:'L’avete fatto?'}</p>
      <div class="us-fatto-actions"><button type="button" class="us-fatto-yes" data-fatto-yes>Sì, l’abbiamo fatto</button><button type="button" class="us-fatto-no" data-fatto-later>Non ancora, scegliamo un altro giorno</button></div>
      <p class="us-fatto-note">Con un sì l’idea diventa fatta e vi propone una foto in Ricordi. Ve lo chiede una volta sola.</p>
    </li>`;
  }
  let askTimer=0;
  function maybeAskDone(){
    clearTimeout(askTimer);
    askTimer=setTimeout(()=>{
      if(!key()||fatto||editing||focusOpen()||opened()||d.hidden)return;
      if(!$('bond')?.classList.contains('active')||d.body?.getAttribute?.('data-us-surface')==='open')return;
      const due=dueDone(w.UsDaVivere?.snapshot?.(),id=>w.UsDaVivere?.entry?.(id),me(),romeDay(Date.now()),asked);
      if(!due)return;
      markAsked(due.id);
      fatto={...due,step:'ask'};paintFocus();
    },700);
  }
  async function fattoYes(){
    const f=fatto;if(!f)return;
    const ok=await w.UsDaVivere?.markLived?.(f.id);
    if(fatto!==f)return;
    if(ok===false){fatto=null;paintFocus();return;}
    fatto={...f,step:'photo'};
    if(focusList)focusList.innerHTML='';
    paintFocus();
  }
  function fattoLater(){
    const f=fatto;fatto=null;paintFocus();
    if(f?.entryId)w.UsCalendarLinks?.openEntry?.(f.entryId);
  }
  function fattoPhoto(){
    const f=fatto;fatto=null;paintFocus();
    if(f)w.openMemoryComposer?.(f.title,{kind:'da_vivere',ref:f.id,date:f.day});
  }
  // «Scegli il giorno»: what is over Noi goes, then the calendar of Noi asks
  // for the day (the same pick as the idea's detail).
  async function pickIdeaDay(id){
    if(focusIdeas){focusIdeas=false;paintFocus();}
    w.UsLavagna?.close?.();
    if(opened())await close();
    w.UsDaVivere?.schedule?.(id);
  }
  async function confirmIdea(id){
    const ok=await w.UsUiFoundation?.confirm?.({title:'L’avete fatto?',body:`${partnerName()} dice di sì: se confermi, va tra le idee fatte.`,confirmLabel:'Sì, fatto'});
    if(ok===false)return;
    await w.UsDaVivere?.markLived?.(id);
  }
  const addTile='<li><button type="button" class="us-postit-new" data-notes-new><span class="us-icon" data-us-icon="plus" aria-hidden="true"></span><span>Nuovo post-it</span></button></li>';
  const slot=()=>`<li class="us-postit is-editing" data-editor data-color="${colorOf(editing)}" data-who="${whoOf(editing)}"></li>`;
  const skeleton='<li class="us-postits-loading"><div class="us-skeleton-rows" role="status"><span class="us-sr">Carico i post-it…</span><i class="us-skeleton"></i><i class="us-skeleton"></i></div></li>';
  // A repaint keeps the field you were typing in (a new item, a new idea).
  function keepTyping(paint){
    const a=d.activeElement,kind=a?.matches?.('[data-add-item]')?'item':a?.matches?.('[data-davivere-add]')?'idea':'';
    const id=kind==='item'?a.closest('[data-note-id]')?.dataset.noteId:'',value=kind?a.value:'';
    const scope=kind?[body,focusList,grid].find(s=>s?.contains(a)):null;
    paint();
    if(!kind||!scope)return;
    const next=kind==='idea'?scope.querySelector('[data-davivere-add]'):scope.querySelector(`.us-postit[data-note-id="${CSS.escape(id)}"] [data-add-item]`);
    if(next&&next!==a){next.value=value;next.focus({preventScroll:true});}
  }
  // The post-its pinned on a lavagna: Noi (three) or the full screen (six).
  function pinsMarkup(max,big){
    if(!loaded)return ideasPin(big);
    const places=placesFor(notes);
    return ideasPin(big)+boardNotes(notes,{max}).shown.map((n,i)=>pin(n,big?places.get(n.id):{x:NOI_SPOTS[i][0],y:NOI_SPOTS[i][1]})).join('');
  }
  function paintPins(){
    if(grid)grid.innerHTML=pinsMarkup(ON_NOI,false);
    paintBoard();
    countAll();
  }
  // The full-screen lavagna (lavagna.js builds #usLavagnaNotes on its board).
  function paintBoard(){
    const list=$('usLavagnaNotes');
    if(!list)return;
    bindBoard(list);
    if(drag)return;
    list.innerHTML=pinsMarkup(ON_BOARD,true);
  }
  function paintPage(){paintPins();paintFocus();}
  function countAll(){
    if(!allButton)return;
    allButton.hidden=!(loaded&&notes.length>ON_NOI);
    const label=allButton.querySelector('span');
    if(label)label.textContent=`Tutti i post-it (${notes.length})`;
  }
  // In front (#usPostitFocus): the post-it being written on from a lavagna,
  // or «Le vostre idee». Built once per opening, never while typing.
  const focusOpen=()=>Boolean(focusRoot?.classList.contains('open'));
  function paintFocus(){
    if(!focusRoot||!focusList)return;
    const writing=editing&&editHost==='page';
    focusRoot.classList.toggle('is-sheet',Boolean(fatto&&!writing));
    if(!writing&&!focusIdeas&&!fatto){
      if(focusOpen()){focusRoot.classList.remove('open');focusRoot.setAttribute('aria-hidden','true');focusList.innerHTML='';}
      return;
    }
    if(fatto&&!writing){
      if(!focusList.querySelector('[data-fatto]'))focusList.innerHTML=fattoMarkup();
    }else if(writing){
      if(!focusList.querySelector('[data-editor]')){focusList.innerHTML=slot();mountEditor(focusList.firstElementChild);}
    }else if(!focusList.querySelector('[data-davivere]'))focusList.innerHTML=daVivere('focus');
    focusRoot.classList.add('open');focusRoot.setAttribute('aria-hidden','false');
  }
  function paintSheet(){
    if(!body)return;
    const count=$('usNotesCount');
    if(count)count.textContent=loaded?`${notes.length} post-it · i più recenti in alto`:'';
    if(!loaded){body.innerHTML=`<ul class="us-postits">${skeleton}</ul>`;return;}
    const writingNew=editHost==='sheet'&&editing&&!editing.id;
    const list=sortNotes(byAuthor(notes,filter,me()));
    const who=[['all','Tutti'],['me','Tuoi'],['partner',partnerName()]];
    const filters=`<div class="us-board-filters" role="group" aria-label="Filtra per chi l’ha scritto">${who.map(([k,label])=>`<button type="button" data-board-filter="${k}" aria-pressed="${filter===k}">${k==='all'?'':`<i class="us-notes-dot" data-who="${k==='me'?'tu':'partner'}" aria-hidden="true"></i>`}<span translate="no">${esc(label)}</span></button>`).join('')}</div>`;
    const empty=!list.length&&filter!=='all'?'<p class="us-notes-intro">Nessun post-it qui.</p>':'';
    body.innerHTML=`${filters}<ul class="us-postits is-all">${filter==='all'?daVivere('sheet'):''}${writingNew?slot():addTile}${list.map(n=>editHost==='sheet'&&editing?.id===n.id?slot():tile(n)).join('')}</ul>${empty}`;
    const host=body.querySelector('[data-editor]');
    if(host)mountEditor(host);
  }
  // A host being written on is never rebuilt: only its other post-its are.
  // The pins never hold the editor, so they are always repainted.
  function paint(){
    fields=editing?fields:null;
    keepTyping(paintPins);
    paintFocus();
    if(opened()&&!(editing&&editHost==='sheet'))keepTyping(paintSheet);
    countAll();
    w.UsWidgets?.syncPostit?.()?.catch?.(()=>{});
  }
  // The Post-it widget (04/11/2026): the newest post-it with words on it, its
  // paper, who wrote it and how many others, and the one after it; null until the board is read.
  function widgetState(){
    if(!loaded||owner!==key())return null;
    const written=sortNotes(notes).filter(n=>!isEmpty(n));
    const n=written[0];
    if(!n)return {state:'none'};
    const title=String(n.title||'').trim();
    // Widget del redesign (26/11/2026): the 4x2 shows two, one each when both wrote.
    const s2=written.slice(1).find(x=>authorOf(x)!==authorOf(n))||written[1];
    const second=s2?{text:String(s2.title||'').trim()||summary(s2).preview,color:colorOf(s2),by:authorOf(s2)===me()?'me':'partner'}:null;
    return {state:'ready',text:title||summary(n).preview,color:colorOf(n),by:authorOf(n)===me()?'me':'partner',more:written.length-1,at:n.updated_at||'',second};
  }
  function repaintTile(id){
    const n=notes.find(x=>x.id===id);
    const li=body?.querySelector(`.us-postit[data-note-id="${CSS.escape(id)}"]`);
    if(li&&!li.classList.contains('is-editing'))keepTyping(()=>{n?li.outerHTML=tile(n):li.remove();});
    paintPins();
  }
  function repaintIdeas(){
    for(const [scope,host] of [[body,'sheet'],[focusList,'focus']]){
      const li=scope?.querySelector('[data-davivere]');
      if(li)keepTyping(()=>{li.outerHTML=daVivere(host)||'';});
    }
    for(const [scope,big] of [[grid,false],[$('usLavagnaNotes'),true]]){
      const li=scope?.querySelector('[data-ideas-pin]');
      if(li)li.outerHTML=ideasPin(big)||'';
    }
  }

  // ---------------------------------------------------------------- moving
  // The full-screen lavagna: a post-it follows the finger after 6 px (less is
  // a tap) and stays where it is let go, for both (board_x/board_y).
  function bindBoard(list){
    if(list.dataset.notesBound)return;
    list.dataset.notesBound='1';
    list.addEventListener('click',event=>{
      if(Date.now()-dragEnded<450&&event.target.closest('.us-postit')){event.preventDefault();return;}
      onClick(event,'page');
    });
    list.addEventListener('pointerdown',event=>{
      const li=event.target.closest?.('.us-postit.is-pin[data-note-id]');
      if(!li||drag||(event.pointerType==='mouse'&&event.button!==0))return;
      const r=list.getBoundingClientRect(),c=li.getBoundingClientRect();
      drag={id:li.dataset.noteId,li,pid:event.pointerId,sx:event.clientX,sy:event.clientY,dx:event.clientX-(c.left+c.width/2),dy:event.clientY-(c.top+c.height/2),r,moved:false,x:0,y:0};
      try{li.setPointerCapture(event.pointerId);}catch(_){}
    });
    list.addEventListener('pointermove',event=>{
      if(!drag||event.pointerId!==drag.pid)return;
      if(!drag.moved&&Math.hypot(event.clientX-drag.sx,event.clientY-drag.sy)<6)return;
      drag.moved=true;drag.li.classList.add('is-dragging');
      drag.x=clamp01((event.clientX-drag.dx-drag.r.left)/drag.r.width);
      drag.y=clamp01((event.clientY-drag.dy-drag.r.top)/drag.r.height);
      drag.li.style.setProperty('--x',drag.x.toFixed(4));drag.li.style.setProperty('--y',drag.y.toFixed(4));
      event.preventDefault();
    });
    const lift=event=>{
      if(!drag||event.pointerId!==drag.pid)return;
      const done=drag;drag=null;
      done.li.classList.remove('is-dragging');
      if(!done.moved)return;
      dragEnded=Date.now();
      if(event.type==='pointercancel'){paintBoard();return;}
      move(done.id,done.x,done.y);
    };
    list.addEventListener('pointerup',lift);
    list.addEventListener('pointercancel',lift);
  }
  async function move(id,x,y){
    const n=notes.find(v=>v.id===id),client=db();
    if(!n)return;
    const place=placePayload(x,y),before={board_x:n.board_x??null,board_y:n.board_y??null};
    notes=notes.map(v=>v.id===id?{...v,...place}:v);paintPins();
    if(placeless||!client)return;
    const {data,error}=await client.from('couple_notes').update(place).eq('id',id).select(cols()).maybeSingle();
    if(error){
      if(missingPlace(error)){placeless=true;return;}
      console.warn('[US Note] move',error);
      notes=notes.map(v=>v.id===id?{...v,...before}:v);paintPins();w.toast?.('Non spostato. Riprova.');return;
    }
    if(data){notes=notes.map(v=>v.id===data.id?data:v);if(editing?.id===data.id)editing.revision=data.revision;}
  }

  // Ticked on the post-it, saved at once.
  async function tick(noteId,itemId,done){
    const n=notes.find(x=>x.id===noteId),client=db();
    const item=n&&items(n).find(i=>i.id===itemId);
    if(!item||!client)return;
    item.done=done;repaintTile(noteId);
    const {data,error}=await client.from('couple_notes').update({items:payload(n).items}).eq('id',noteId).select(cols()).maybeSingle();
    if(error||!data){console.warn('[US Note] tick',error);item.done=!done;repaintTile(noteId);return;}
    notes=notes.map(x=>x.id===data.id?data:x);repaintTile(noteId);
  }
  // A new item written at the foot of a list, saved at once.
  async function addItem(noteId,text){
    const n=notes.find(x=>x.id===noteId),client=db(),clean=String(text||'').trim().slice(0,LIMITS.item);
    if(!n||!clean||!client||items(n).length>=LIMITS.items)return;
    const next={...n,items:[...items(n),{id:newId(),text:clean,done:false}]};
    notes=notes.map(x=>x.id===noteId?next:x);repaintTile(noteId);
    const {data,error}=await client.from('couple_notes').update({items:payload(next).items}).eq('id',noteId).select(cols()).maybeSingle();
    if(error||!data){console.warn('[US Note] add item',error);notes=notes.map(x=>x.id===noteId?n:x);repaintTile(noteId);w.toast?.('Non salvato. Riprova.');return;}
    notes=notes.map(x=>x.id===data.id?data:x);repaintTile(noteId);
  }
  async function load(){
    const client=db(),k=key();
    if(!client||!k)return;
    const mine=++token;
    const {data,error}=await client.from('couple_notes').select(cols()).eq('couple_id',w.usProfile.couple_id).order('updated_at',{ascending:false});
    if(mine!==token||key()!==k)return;
    if(error){
      // A database without the places yet: read again without them.
      if(!placeless&&missingPlace(error)){placeless=true;return load();}
      console.warn('[US Note]',error);
      if(!loaded){
        const failed='<li class="us-notes-empty"><b>Non riesco a caricare i post-it</b><button type="button" class="ghost" data-notes-retry>Riprova</button></li>';
        if(grid)grid.innerHTML=ideasPin(false)+failed;
        if(body&&opened())body.innerHTML=`<ul class="us-postits">${failed}</ul>`;
      }
      return;
    }
    const before=new Set(notes.map(n=>n.id));
    notes=data||[];loaded=true;loadedAt=Date.now();owner=k;
    // Couple sync (05/11): the partner's deletion now arrives as a reload, not
    // as a DELETE event; the post-it open here says so, as onChange does.
    if(editing?.id&&before.has(editing.id)&&!notes.some(n=>n.id===editing.id)){editing.id=null;paintMeta();notice('La tua persona ha staccato questo post-it. Se continui a scrivere, lo salvo di nuovo.');}
    if(!editing)paint();
    else{paint();notes.forEach(n=>repaintTile(n.id));}
  }
  // Noi open: the board is read once a minute at most (Realtime keeps it
  // fresh meanwhile), and the ideas once.
  function ensure({force=false}={}){
    if(!key())return;
    if(owner&&owner!==key())reset();
    if(force||!loaded||Date.now()-loadedAt>60000)load();
    const ideas=w.UsDaVivere?.snapshot?.();
    if(ideas&&!ideas.loaded)w.UsDaVivere?.hydrate?.();
    else maybeAskDone();
  }

  // ---------------------------------------------------------------- editor
  function itemRow(i){
    return `<li class="us-notes-item${i.done?' is-done':''}" data-item-id="${esc(i.id)}">
      <label class="us-notes-check"><input type="checkbox"${i.done?' checked':''} aria-label="Fatto"><span aria-hidden="true"></span></label>
      <input type="text" class="us-notes-item-text" maxlength="${LIMITS.item}" value="${esc(i.text)}" placeholder="Voce" enterkeyhint="next">
      <button type="button" class="us-notes-item-x" data-notes-remove aria-label="Togli la voce"><span class="us-icon" data-us-icon="x" aria-hidden="true"></span></button>
    </li>`;
  }
  function paintItems(){if(fields)fields.list.innerHTML=editing.items.map(itemRow).join('');}
  function paintPaper(){
    if(!fields)return;
    const c=colorOf(editing);
    fields.host.dataset.color=c;
    fields.papers.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.paper===c)));
  }
  // The open post-it: it widens in place and takes the fields. Built once
  // per opening, never while typing.
  function mountEditor(host){
    host.dataset.noteId=editing.id||'';
    host.innerHTML=`<div class="us-notes-editor">
      <p class="us-notes-notice" hidden><span></span><button type="button" class="ghost" data-notes-take hidden>Carica la sua versione</button></p>
      <input type="text" class="us-notes-title" maxlength="${LIMITS.title}" placeholder="Titolo" aria-label="Titolo" enterkeyhint="next">
      <textarea class="us-notes-text" maxlength="${LIMITS.body}" rows="2" placeholder="Scrivi qualcosa…" aria-label="Testo del post-it"></textarea>
      <ul class="us-notes-items" aria-label="Lista"></ul>
      <button type="button" class="us-notes-add-item" data-notes-add-item><span class="us-icon" data-us-icon="plus" aria-hidden="true"></span><span>Aggiungi una voce</span></button>
      <div class="us-notes-foot"><small class="us-notes-meta"></small><small class="us-notes-status" role="status" aria-live="polite"></small></div>
      <div class="us-notes-actions"><button type="button" class="us-notes-delete" data-notes-delete hidden><span class="us-icon" data-us-icon="trash" aria-hidden="true"></span><span>Elimina</span></button><button type="button" class="us-notes-done" data-notes-done>Fatto</button></div>
    </div>`;
    const ed=host.firstElementChild;
    fields={host,title:ed.querySelector('.us-notes-title'),text:ed.querySelector('.us-notes-text'),list:ed.querySelector('.us-notes-items'),papers:[...ed.querySelectorAll('[data-paper]')],
      status:ed.querySelector('.us-notes-status'),notice:ed.querySelector('.us-notes-notice'),meta:ed.querySelector('.us-notes-meta'),del:ed.querySelector('[data-notes-delete]')};
    fields.title.value=editing.title||'';fields.text.value=editing.body||'';
    paintItems();paintMeta();paintPaper();
  }
  // focus: "title", "text" or "item:<id>", where the post-it was touched;
  // host: the page or the whole board, where it was touched.
  async function openEditor(note,focus='title',host='page'){
    if(editing&&!await closeEditor({repaint:false}))return;
    clearTimeout(timer);dirty=false;remote=null;
    editing=note?{...note,items:items(note).map(i=>({...i}))}:{id:null,title:'',body:'',items:[],color:'yellow',revision:0,updated_by:me()};
    editHost=host;fields=null;focusIdeas=false;
    // From a lavagna the post-it comes forward; a fresh editor every time.
    if(host==='page'&&focusList)focusList.innerHTML='';
    if(host==='sheet')paintSheet();else paintPage();
    if(!fields)return;
    const target=focus.startsWith('item:')?fields.list.querySelector(`[data-item-id="${CSS.escape(focus.slice(5))}"] .us-notes-item-text`):focus==='text'?fields.text:fields.title;
    const el=target||fields.title;
    el.focus({preventScroll:true});
    if(typeof el.setSelectionRange==='function'){const end=el.value.length;try{el.setSelectionRange(end,end);}catch(_){}}
    el.closest('.us-postit')?.scrollIntoView?.({block:'nearest',behavior:w.UsUiFoundation?.isReducedMotion?.()?'auto':'smooth'});
  }
  function paintMeta(){
    if(!fields)return;
    fields.del.hidden=!editing.id;
    const who=nameOf(editing.updated_by),at=when(editing.updated_at);
    fields.meta.textContent=!editing.id||!at?'':who?`Modificato da ${who==='Tu'?'te':who} · ${at}`:`Modificato ${at}`;
  }
  const status=t=>{if(fields)fields.status.textContent=t;};
  function notice(text,{take=false,ttl=0}={}){
    if(!fields)return;
    clearTimeout(noticeTimer);
    fields.notice.querySelector('span').textContent=text;
    fields.notice.querySelector('[data-notes-take]').hidden=!take;
    fields.notice.hidden=!text;
    if(ttl)noticeTimer=setTimeout(()=>{if(fields)fields.notice.hidden=true;},ttl);
  }
  function changed(delay=700){dirty=true;status('');clearTimeout(timer);timer=setTimeout(save,delay);}
  async function save({keep=true}={}){
    clearTimeout(timer);
    const client=db();
    if(!editing||!dirty||!client)return;
    if(saving){again=true;return;}
    const target=editing;
    if(isEmpty(target)){dirty=false;return;}
    saving=true;dirty=false;status('Salvo…');
    const data=payload(target,{keep});
    try{
      let res;
      if(target.id){
        res=await client.from('couple_notes').update(data).eq('id',target.id).select(cols()).maybeSingle();
        // Deleted meanwhile by the partner: kept, as a new note.
        if(!res.error&&!res.data){target.id=null;res=null;}
      }
      let created=false;
      if(!res){res=await client.from('couple_notes').insert({...data,couple_id:w.usProfile.couple_id}).select(cols()).single();created=true;}
      if(res.error)throw res.error;
      // Noi, Fase B.3 (D15): a new post-it tells your person once it is closed.
      if(created)target.fresh=true;
      const row=res.data;
      if(editing===target){Object.assign(editing,{id:row.id,revision:row.revision,updated_by:row.updated_by,updated_at:row.updated_at,created_by:row.created_by});if(fields)fields.host.dataset.noteId=row.id;paintMeta();status('Salvato');}
      notes=[row,...notes.filter(n=>n.id!==row.id)];
      countAll();
    }catch(error){
      console.warn('[US Note] save',error);
      dirty=true;status('Non salvato, riprovo…');
      timer=setTimeout(save,4000);
    }finally{
      saving=false;
      if(again){again=false;if(dirty)save();}
    }
  }
  function syncFields(){
    if(!fields||!editing)return;
    editing.title=fields.title.value;editing.body=fields.text.value;
  }
  function take(row){
    editing={...row,items:items(row).map(i=>({...i}))};
    dirty=false;remote=null;clearTimeout(timer);
    if(!fields)return;
    fields.title.value=row.title||'';fields.text.value=row.body||'';
    paintItems();paintMeta();paintPaper();
  }
  // Closing waits for the save; offline the note stays open, nothing lost.
  // An empty post-it on the board goes only on «Stacca»; «Tienilo» leaves it
  // as it was (an empty post-it is never saved). One never filled just closes.
  async function closeEditor({repaint=true}={}){
    if(!editing){if(repaint)paint();return true;}
    syncFields();
    const target=editing;
    // Empty list items go when the note is closed.
    const kept=items(target).filter(i=>i.text.trim());
    if(kept.length!==items(target).length){target.items=kept;dirty=true;}
    for(let i=0;saving&&i<100;i++)await new Promise(r=>setTimeout(r,50));
    const verdict=closeVerdict(target);
    if(verdict==='ask'){
      const ok=await w.UsUiFoundation?.confirm?.({title:'Staccare il post-it?',body:'L’hai svuotato: se lo stacchi, sparisce per voi due.',confirmLabel:'Stacca',cancelLabel:'Tienilo',tone:'danger'});
      if(ok===true){if(!await removeNote(target.id,{ask:false}))return false;}
      else{clearTimeout(timer);dirty=false;}
    }
    else if(verdict==='drop'){clearTimeout(timer);dirty=false;}
    else{await save({keep:false});if(dirty){status('Non salvato: controlla la connessione');return false;}
      // «X ti ha lasciato un post-it» (send-web-push decides: the same 2 hours and switch as the lavagna).
      if(target.fresh&&target.id&&!isEmpty(target)){target.fresh=false;try{w.sendWebPushEvent?.('postit',target.id)?.catch?.(()=>{});}catch(_){}}}
    editing=null;fields=null;
    if(repaint)paint();
    return true;
  }
  async function removeNote(id,{ask=true}={}){
    if(ask){
      const ok=await w.UsUiFoundation?.confirm?.({title:'Staccare il post-it?',body:'Sparisce per voi due.',confirmLabel:'Elimina',tone:'danger'});
      if(!ok)return false;
    }
    const client=db();if(!client)return false;
    clearTimeout(timer);dirty=false;
    const {error}=await client.from('couple_notes').delete().eq('id',id);
    if(error){console.warn('[US Note] delete',error);status('Non riesco a eliminarlo');return false;}
    notes=notes.filter(n=>n.id!==id);
    return true;
  }

  // ---------------------------------------------------------------- ideas
  // A new idea, written at the foot of «Le vostre idee».
  async function addIdea(input){
    const text=input.value.trim();
    if(!text)return;
    input.value='';
    if(!await w.UsDaVivere?.add?.(text))input.value=text;
  }
  // An idea opens its detail on Noi: what is over Noi goes first.
  async function openIdea(id){
    if(focusIdeas){focusIdeas=false;paintFocus();}
    w.UsLavagna?.close?.();
    if(opened())await close();
    w.openNoiIdeaDetail?.(id);
  }
  // «Le vostre idee» in front, from the corner of a lavagna.
  async function openIdeas(){
    if(editing&&!await closeEditor({repaint:false}))return;
    focusIdeas=true;fatto=null;
    if(focusList)focusList.innerHTML='';
    ensure();paintFocus();
  }
  // Closing what is in front: the post-it (saved first) or the ideas.
  async function closeFocus(){
    if(editing&&editHost==='page')return closeEditor();
    focusIdeas=false;fatto=null;paintFocus();
    return true;
  }

  // ---------------------------------------------------------------- live
  // Realtime (app.js startUsRealtime): a change of the couple's notes.
  function onChange(event){
    if(!key()||key()!==owner)return;
    const row=event?.new&&event.new.id?event.new:null;
    const gone=event?.eventType==='DELETE'?event.old?.id:null;
    if(row&&row.couple_id!==w.usProfile.couple_id)return;
    // Without its text the row is not the note: the board is read again.
    if(row&&!fullRow(row)){load();return;}
    if(gone){
      notes=notes.filter(n=>n.id!==gone);
      if(editing?.id===gone){editing.id=null;paintMeta();notice('La tua persona ha staccato questo post-it. Se continui a scrivere, lo salvo di nuovo.');}
    }
    if(row){
      const was=notes.find(n=>n.id===row.id);
      notes=[row,...notes.filter(n=>n.id!==row.id)];
      // Only moved on the lavagna: the words are the same, nothing to say.
      if(editing?.id===row.id&&was&&sameWords(row,was))editing.revision=Math.max(Number(editing.revision)||0,Number(row.revision)||0);
      else if(editing?.id===row.id&&row.updated_by!==me()&&Number(row.revision)>Number(editing.revision)){
        const who=nameOf(row.updated_by)||'La tua persona';
        if(dirty||saving){remote=row;notice(`${who} l’ha appena modificato.`,{take:true});}
        else{take(row);notice(`Aggiornato da ${who}.`,{ttl:4000});}
      }
    }
    if(!editing)paint();
    else{for(const id of [gone,row?.id])if(id&&id!==editing.id)repaintTile(id);countAll();}
  }

  // ---------------------------------------------------------------- shell
  // The whole board: a Foglio over Noi.
  async function open(){
    if(!key()||!root)return;
    if(owner&&owner!==key())reset();
    if(editing&&editHost==='page'&&!await closeEditor())return;
    w.UsUiFoundation?.cancelSurfaceExit?.(root);
    root.classList.add('open');root.setAttribute('aria-hidden','false');
    paintSheet();ensure();
  }
  async function close(){
    if(!opened())return;
    if(editing&&editHost==='sheet'&&!await closeEditor({repaint:false}))return;
    const finish=()=>{root.classList.remove('open');root.setAttribute('aria-hidden','true');};
    root.classList.remove('open');
    if(!w.UsUiFoundation?.exitSurface?.(root,finish))finish();
    paintPage();
  }
  function reset(){
    token++;notes=[];loaded=false;loadedAt=0;owner='';editing=null;fields=null;dirty=false;remote=null;filter='all';focusIdeas=false;fatto=null;drag=null;clearTimeout(timer);
    if(opened()){root.classList.remove('open');root.setAttribute('aria-hidden','true');}
    paintPage();
  }

  function onClick(event,host){
    const t=event.target;
    if(host==='sheet'&&t.closest('[data-notes-close]'))return close();
    if(t.closest('[data-notes-retry]'))return load();
    if(t.closest('[data-focus-close]'))return closeFocus();
    if(t.closest('[data-ideas-open]'))return openIdeas();
    const pick=t.closest('[data-idea-pick]');
    if(pick)return pickIdeaDay(pick.dataset.ideaPick);
    const sure=t.closest('[data-idea-confirm]');
    if(sure)return confirmIdea(sure.dataset.ideaConfirm);
    if(t.closest('[data-fatto-yes]'))return fattoYes();
    if(t.closest('[data-fatto-later]'))return fattoLater();
    if(t.closest('[data-fatto-photo]'))return fattoPhoto();
    if(t.closest('[data-lav-board-open]'))return w.UsLavagna?.open?.();
    if(t.closest('[data-board-all]'))return open();
    if(t.closest('[data-board-new],[data-notes-new]'))return openEditor(null,'title',host);
    const paper=t.closest('[data-board-filter]');
    if(paper){filter=paper.dataset.boardFilter;paintSheet();return;}
    const idea=t.closest('[data-idea-open]');
    if(idea)return openIdea(idea.dataset.ideaOpen);
    const square=t.closest('.us-postit[data-note-id]:not(.is-editing)');
    if(square){
      // The box ticks and the foot takes a new item; anywhere else you write there.
      if(t.closest('.us-notes-check,[data-add-item]'))return;
      const n=notes.find(x=>x.id===square.dataset.noteId);
      if(n)openEditor(n,t.closest('[data-focus]')?.dataset.focus||'text',host);
      return;
    }
    if(!fields||host!==editHost)return;
    const swatch=t.closest('[data-paper]');
    if(swatch){editing.color=swatch.dataset.paper;paintPaper();changed(250);return;}
    if(t.closest('[data-notes-done]'))return closeEditor();
    if(t.closest('[data-notes-take]')){if(remote)take(remote);notice('');return;}
    if(t.closest('[data-notes-delete]')){
      const id=editing?.id;
      if(id)removeNote(id).then(ok=>{if(ok){editing=null;fields=null;paint();}});
      return;
    }
    if(t.closest('[data-notes-add-item]')){
      syncFields();
      const item={id:newId(),text:'',done:false};
      editing.items.push(item);paintItems();
      fields.list.querySelector(`[data-item-id="${item.id}"] .us-notes-item-text`)?.focus();
      return;
    }
    const remove=t.closest('[data-notes-remove]');
    if(remove&&editing){
      const id=remove.closest('[data-item-id]')?.dataset.itemId;
      editing.items=editing.items.filter(i=>i.id!==id);paintItems();changed();
    }
  }
  function onChangeEvent(event){
    const t=event.target;
    const box=t.closest?.('[data-tick]');
    const square=box?.closest('.us-postit[data-note-id]:not(.is-editing)');
    if(square){tick(square.dataset.noteId,box.dataset.tick,box.checked);return;}
    // A new item or idea: Enter or leaving the field (both fire "change").
    if(t.matches?.('[data-add-item]')){const id=t.closest('[data-note-id]')?.dataset.noteId,text=t.value;t.value='';addItem(id,text);return;}
    if(t.matches?.('[data-davivere-add]'))addIdea(t);
  }
  function onInput(event){
    if(!fields||!editing)return;
    const t=event.target;
    if(t===fields.title||t===fields.text){syncFields();changed();return;}
    const row=t.closest('[data-item-id]');
    const item=row&&editing.items.find(i=>i.id===row.dataset.itemId);
    if(!item)return;
    if(t.type==='checkbox'){item.done=t.checked;row.classList.toggle('is-done',t.checked);changed(250);return;}
    item.text=t.value;changed();
  }
  function onKeydown(event){
    if(!fields||!editing)return;
    const t=event.target;
    if(t===fields.title&&event.key==='Enter'){event.preventDefault();fields.text.focus();return;}
    const row=t.classList?.contains('us-notes-item-text')&&t.closest('[data-item-id]');
    if(!row)return;
    const at=editing.items.findIndex(i=>i.id===row.dataset.itemId);
    // Enter: a new item under this one. Backspace on an empty item: it goes.
    if(event.key==='Enter'&&!event.isComposing){
      event.preventDefault();
      const item={id:newId(),text:'',done:false};
      editing.items.splice(at+1,0,item);paintItems();
      fields.list.querySelector(`[data-item-id="${item.id}"] .us-notes-item-text`)?.focus();
    }else if(event.key==='Backspace'&&!t.value&&editing.items.length){
      event.preventDefault();
      editing.items.splice(at,1);paintItems();changed();
      const inputs=fields.list.querySelectorAll('.us-notes-item-text');
      (inputs[Math.max(0,at-1)]||fields.text).focus();
    }
  }
  for(const [el,host] of [[root,'sheet'],[page,'page'],[focusRoot,'page']]){
    if(!el)continue;
    el.addEventListener('click',event=>onClick(event,host));
    el.addEventListener('change',onChangeEvent);
    el.addEventListener('input',onInput);
    el.addEventListener('keydown',onKeydown);
  }
  focusRoot?.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&focusOpen()){event.preventDefault();closeFocus();}});
  w.addEventListener('us-ideas-change',()=>{repaintIdeas();maybeAskDone();});
  // Noi open, coming back to the app: read what changed meanwhile.
  const bond=$('bond');
  if(bond&&typeof w.MutationObserver==='function'){
    new w.MutationObserver(()=>{
      if(bond.classList.contains('active'))ensure();
      else if(dirty){syncFields();save();}
    }).observe(bond,{attributes:true,attributeFilter:['class']});
  }
  d.addEventListener('visibilitychange',()=>{
    // Leaving the app: what is typed is saved now.
    if(d.hidden){if(dirty){syncFields();save();}return;}
    if(bond?.classList.contains('active'))ensure();
  });
  w.setInterval(()=>{if(owner&&key()!==owner)reset();},2000);
  paintPage();
  if(bond?.classList.contains('active'))ensure();
  // Back (navigation.js): what is in front first, then from a post-it to the
  // board, from the board out.
  const back=()=>focusOpen()?closeFocus():editing&&editHost==='sheet'?closeEditor():close();
  const api=w.UsCoupleNotes;api.open=open;api.close=close;api.back=back;api.reset=reset;api.onChange=onChange;api.refresh=()=>ensure({force:true});api.widgetState=widgetState;
  // The full-screen lavagna (lavagna.js): its post-its, and «+ Post-it» there.
  api.showBoard=()=>{ensure();paintBoard();};api.write=()=>openEditor(null,'title','page');api.focusOpen=focusOpen;
  // «Le vostre idee» in front, from Il vostro angolo (Per crescere insieme).
  api.ideas=openIdeas;
}
return {entryDay,dueDone,ideaState,when,isEmpty,closeVerdict,fullRow,summary,payload,sortNotes,boardNotes,byColor,byAuthor,tilt,ideaLines,colorOf,placesFor,placePayload,sameWords,missingPlace,COLORS,LIMITS,ON_NOI,ON_BOARD,SPOTS,NOI_SPOTS,install};
});
