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
(function(global,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  global.UsCoupleNotes=api;api.install(global);
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const COLS='id,couple_id,title,body,items,color,created_by,updated_by,created_at,updated_at,revision';
const LIMITS=Object.freeze({title:80,body:4000,items:100,item:200});
const COLORS=Object.freeze(['yellow','pink','blue','green']);
// The paper in the filters, and on the swatches of the post-it being written.
const PAPER=Object.freeze({yellow:['Giallo','Carta gialla'],pink:['Rosa','Carta rosa'],blue:['Azzurro','Carta azzurra'],green:['Verde','Carta verde']});
const ON_NOI=6;
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

function install(w){
  const d=w.document,$=id=>d.getElementById(id),root=$('usNotesSheet'),page=$('usNoiBoard');
  if(!root&&!page)return;
  const body=$('usNotesBody'),grid=$('usNoiBoardGrid'),allButton=$('usNoiBoardAll');
  let notes=[],loaded=false,loadedAt=0,owner='',token=0,filter='all';
  let editing=null,editHost='page',dirty=false,saving=false,again=false,timer=0,remote=null,noticeTimer=0,fields=null;
  const me=()=>w.usProfile?.id||'';
  const key=()=>w.usProfile?`${w.usProfile.id}:${w.usProfile.couple_id}`:'';
  const opened=()=>Boolean(root?.classList.contains('open'));
  const db=()=>typeof sb!=='undefined'?sb:null;
  const hostEl=h=>h==='sheet'?body:grid;
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

  // ---------------------------------------------------------------- post-its
  // Founder, 31/10/2026: every note is read without opening it, ticked on
  // the spot and written on by tapping it (it widens in place). What fits on
  // a post-it: four items, the ones still to do first; the count at the foot
  // ("1 di 7") says there are more. A list also takes a new item at the foot.
  const SHOWN=4;
  function tile(n){
    const s=summary(n),author=authorOf(n),who=author&&author===me()?'tu':'partner',title=String(n.title||'').trim();
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
  // «Da vivere», fixed on top: the ideas (app.js, UsDaVivere), ticked when
  // lived; a new idea at the foot. Tapping an idea opens its detail.
  function ideaLine(l){
    const note=l.state==='mine'?`aspetta ${partnerName()}`:l.state==='partner'?`${partnerName()} dice che l’avete vissuta`:'';
    return `<li class="is-${l.state}"><label class="us-notes-check is-small"><input type="checkbox" data-idea="${esc(l.id)}" data-state="${l.state}"${l.state==='lived'?' checked disabled':''} aria-label="${esc(l.title)}: vissuta"><span aria-hidden="true"></span></label><span class="us-postit-idea"><button type="button" class="us-postit-item" data-idea-open="${esc(l.id)}" translate="no">${esc(l.title)}</button>${note?`<small>${esc(note)}</small>`:''}</span></li>`;
  }
  function daVivere(host){
    const snap=w.UsDaVivere?.snapshot?.();
    if(!snap)return '';
    const onNoi=host==='page';
    const {lines,hidden}=ideaLines(snap,me(),onNoi?{limit:5,lived:1}:{lived:Infinity});
    const list=!snap.loaded
      ?`<p class="us-postit-text">${snap.error?'Non riesco a caricare le idee.':'Carico…'}</p>`
      :lines.length?`<ul class="us-postit-items">${lines.map(ideaLine).join('')}</ul>`:'<p class="us-postit-text">Le cose da fare insieme, un giorno.</p>';
    const more=onNoi&&hidden?`<button type="button" class="us-postit-more" data-board-all>e altre ${hidden}</button>`:'';
    return `<li class="us-postit is-pinned" data-davivere data-color="lilac">
      <h3 class="us-postit-heading">Da vivere</h3>
      ${list}${more}
      <input type="text" class="us-postit-add" data-davivere-add maxlength="120" placeholder="Aggiungi…" aria-label="Aggiungi a Da vivere" enterkeyhint="done">
      <small class="us-postit-by"><i class="us-notes-dot" data-who="noi" aria-hidden="true"></i><span>Insieme · fisso in cima</span></small>
    </li>`;
  }
  const addTile='<li><button type="button" class="us-postit-new" data-notes-new><span class="us-icon" data-us-icon="plus" aria-hidden="true"></span><span>Nuovo post-it</span></button></li>';
  const slot=()=>`<li class="us-postit is-editing" data-editor data-color="${colorOf(editing)}"></li>`;
  const skeleton='<li class="us-postits-loading"><div class="us-skeleton-rows" role="status"><span class="us-sr">Carico la bacheca…</span><i class="us-skeleton"></i><i class="us-skeleton"></i></div></li>';
  // A repaint keeps the field you were typing in (a new item, a new idea).
  function keepTyping(paint){
    const a=d.activeElement,kind=a?.matches?.('[data-add-item]')?'item':a?.matches?.('[data-davivere-add]')?'idea':'';
    const id=kind==='item'?a.closest('[data-note-id]')?.dataset.noteId:'',value=kind?a.value:'',inSheet=Boolean(kind&&root?.contains(a));
    paint();
    if(!kind)return;
    const scope=inSheet?body:grid;
    const next=kind==='idea'?scope?.querySelector('[data-davivere-add]'):scope?.querySelector(`.us-postit[data-note-id="${CSS.escape(id)}"] [data-add-item]`);
    if(next){next.value=value;next.focus({preventScroll:true});}
  }
  function paintPage(){
    if(!grid)return;
    if(!loaded){grid.innerHTML=daVivere('page')+skeleton;if(allButton)allButton.hidden=true;return;}
    const writingNew=editHost==='page'&&editing&&!editing.id;
    const board=boardNotes(notes,{max:ON_NOI-(writingNew?1:0)});
    grid.innerHTML=daVivere('page')+(writingNew?slot():'')+board.shown.map(n=>editHost==='page'&&editing?.id===n.id?slot():tile(n)).join('')+addTile;
    countAll();
    const host=grid.querySelector('[data-editor]');
    if(host)mountEditor(host);
  }
  function countAll(){
    if(!allButton)return;
    allButton.hidden=!(loaded&&notes.length>ON_NOI);
    const label=allButton.querySelector('span');
    if(label)label.textContent=`Tutti i post-it (${notes.length})`;
  }
  function paintSheet(){
    if(!body)return;
    const count=$('usNotesCount');
    if(count)count.textContent=loaded?`${notes.length} post-it · i più recenti in alto`:'';
    if(!loaded){body.innerHTML=`<ul class="us-postits">${skeleton}</ul>`;return;}
    const writingNew=editHost==='sheet'&&editing&&!editing.id;
    const list=sortNotes(byColor(notes,filter));
    const filters=`<div class="us-board-filters" role="group" aria-label="Filtra per colore">${['all',...COLORS].map(c=>`<button type="button" data-board-filter="${c}" aria-pressed="${filter===c}">${c==='all'?'Tutti':`<span class="us-board-swatch" data-color="${c}" aria-hidden="true"></span>${PAPER[c][0]}`}</button>`).join('')}</div>`;
    const empty=!list.length&&filter!=='all'?'<p class="us-notes-intro">Nessun post-it di questa carta.</p>':'';
    body.innerHTML=`${filters}<ul class="us-postits is-all">${filter==='all'?daVivere('sheet'):''}${writingNew?slot():addTile}${list.map(n=>editHost==='sheet'&&editing?.id===n.id?slot():tile(n)).join('')}</ul>${empty}`;
    const host=body.querySelector('[data-editor]');
    if(host)mountEditor(host);
  }
  // A host being written on is never rebuilt: only its other post-its are.
  function paint(){
    fields=editing?fields:null;
    if(!(editing&&editHost==='page'))keepTyping(paintPage);
    if(opened()&&!(editing&&editHost==='sheet'))keepTyping(paintSheet);
    countAll();
  }
  function repaintTile(id){
    const n=notes.find(x=>x.id===id);
    for(const scope of [grid,body]){
      const li=scope?.querySelector(`.us-postit[data-note-id="${CSS.escape(id)}"]`);
      if(li&&!li.classList.contains('is-editing'))keepTyping(()=>{n?li.outerHTML=tile(n):li.remove();});
    }
  }
  function repaintIdeas(){
    for(const [scope,host] of [[grid,'page'],[body,'sheet']]){
      const li=scope?.querySelector('[data-davivere]');
      if(li)keepTyping(()=>{li.outerHTML=daVivere(host)||'';});
    }
  }
  // Ticked on the post-it, saved at once.
  async function tick(noteId,itemId,done){
    const n=notes.find(x=>x.id===noteId),client=db();
    const item=n&&items(n).find(i=>i.id===itemId);
    if(!item||!client)return;
    item.done=done;repaintTile(noteId);
    const {data,error}=await client.from('couple_notes').update({items:payload(n).items}).eq('id',noteId).select(COLS).maybeSingle();
    if(error||!data){console.warn('[US Note] tick',error);item.done=!done;repaintTile(noteId);return;}
    notes=notes.map(x=>x.id===data.id?data:x);repaintTile(noteId);
  }
  // A new item written at the foot of a list, saved at once.
  async function addItem(noteId,text){
    const n=notes.find(x=>x.id===noteId),client=db(),clean=String(text||'').trim().slice(0,LIMITS.item);
    if(!n||!clean||!client||items(n).length>=LIMITS.items)return;
    const next={...n,items:[...items(n),{id:newId(),text:clean,done:false}]};
    notes=notes.map(x=>x.id===noteId?next:x);repaintTile(noteId);
    const {data,error}=await client.from('couple_notes').update({items:payload(next).items}).eq('id',noteId).select(COLS).maybeSingle();
    if(error||!data){console.warn('[US Note] add item',error);notes=notes.map(x=>x.id===noteId?n:x);repaintTile(noteId);w.toast?.('Non salvato. Riprova.');return;}
    notes=notes.map(x=>x.id===data.id?data:x);repaintTile(noteId);
  }
  async function load(){
    const client=db(),k=key();
    if(!client||!k)return;
    const mine=++token;
    const {data,error}=await client.from('couple_notes').select(COLS).eq('couple_id',w.usProfile.couple_id).order('updated_at',{ascending:false});
    if(mine!==token||key()!==k)return;
    if(error){
      console.warn('[US Note]',error);
      if(!loaded){
        const failed='<li class="us-notes-empty"><b>Non riesco a caricare la bacheca</b><button type="button" class="ghost" data-notes-retry>Riprova</button></li>';
        if(grid)grid.innerHTML=daVivere('page')+failed;
        if(body&&opened())body.innerHTML=`<ul class="us-postits">${failed}</ul>`;
      }
      return;
    }
    notes=data||[];loaded=true;loadedAt=Date.now();owner=k;
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
      <div class="us-postit-papers" role="group" aria-label="Carta"><span>Carta</span>${COLORS.map(c=>`<button type="button" data-paper="${c}" aria-label="${PAPER[c][1]}" aria-pressed="false"><i data-color="${c}"></i></button>`).join('')}</div>
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
    editHost=host;fields=null;
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
        res=await client.from('couple_notes').update(data).eq('id',target.id).select(COLS).maybeSingle();
        // Deleted meanwhile by the partner: kept, as a new note.
        if(!res.error&&!res.data){target.id=null;res=null;}
      }
      if(!res)res=await client.from('couple_notes').insert({...data,couple_id:w.usProfile.couple_id}).select(COLS).single();
      if(res.error)throw res.error;
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
    else{await save({keep:false});if(dirty){status('Non salvato: controlla la connessione');return false;}}
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
  // Ticking an idea means «vissuta»: the first tap proposes, the partner's
  // confirms (app.js); the confirmation that closes it asks once more.
  async function tickIdea(box){
    const id=box.dataset.idea,state=box.dataset.state;
    box.checked=state==='lived';
    if(state==='partner'){
      const ok=await w.UsUiFoundation?.confirm?.({title:'L’avete vissuta?',body:`${partnerName()} dice di sì. Poi resta tra le idee vissute.`,confirmLabel:'Sì, vissuta'});
      if(ok===false)return;
    }
    await w.UsDaVivere?.markLived?.(id);
  }
  async function addIdea(input){
    const text=input.value.trim();
    if(!text)return;
    input.value='';
    if(!await w.UsDaVivere?.add?.(text))input.value=text;
  }
  async function openIdea(id){
    if(opened())await close();
    w.openNoiIdeaDetail?.(id);
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
      if(editing?.id===gone){editing.id=null;paintMeta();notice('L’altra persona ha staccato questo post-it. Se continui a scrivere, lo salvo di nuovo.');}
    }
    if(row){
      notes=[row,...notes.filter(n=>n.id!==row.id)];
      if(editing?.id===row.id&&row.updated_by!==me()&&Number(row.revision)>Number(editing.revision)){
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
    token++;notes=[];loaded=false;loadedAt=0;owner='';editing=null;fields=null;dirty=false;remote=null;filter='all';clearTimeout(timer);
    if(opened()){root.classList.remove('open');root.setAttribute('aria-hidden','true');}
    paintPage();
  }

  function onClick(event,host){
    const t=event.target;
    if(host==='sheet'&&t.closest('[data-notes-close]'))return close();
    if(t.closest('[data-notes-retry]'))return load();
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
    if(t.matches?.('[data-idea]')){tickIdea(t);return;}
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
  for(const [el,host] of [[root,'sheet'],[page,'page']]){
    if(!el)continue;
    el.addEventListener('click',event=>onClick(event,host));
    el.addEventListener('change',onChangeEvent);
    el.addEventListener('input',onInput);
    el.addEventListener('keydown',onKeydown);
  }
  w.addEventListener('us-ideas-change',repaintIdeas);
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
  // Back (navigation.js): from a post-it to the board, from the board out.
  const back=()=>editing&&editHost==='sheet'?closeEditor():close();
  const api=w.UsCoupleNotes;api.open=open;api.close=close;api.back=back;api.reset=reset;api.onChange=onChange;api.refresh=()=>ensure({force:true});
}
return {when,isEmpty,closeVerdict,fullRow,summary,payload,sortNotes,boardNotes,byColor,tilt,ideaLines,colorOf,COLORS,LIMITS,install};
});
