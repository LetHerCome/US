// Note condivise V1 — the couple's notes in Noi: a title, a text and an
// optional checklist, written and ticked by both. Saved by itself after a
// short pause and on close; last save wins, with a notice when the partner
// saves the note you have open (D8). The editor's fields are built once and
// never rebuilt while typing, so the keyboard keeps its state.
// Spec: docs/missions/note-condivise-v1.md.
(function(global,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports){module.exports=api;return;}
  global.UsCoupleNotes=api;api.install(global);
})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const COLS='id,couple_id,title,body,items,created_by,updated_by,created_at,updated_at,revision';
const LIMITS=Object.freeze({title:80,body:4000,items:100,item:200});
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
// The card under the title: the first line of the text, or the list.
function summary(n){
  const list=items(n).filter(i=>i.text.trim());
  const done=list.filter(i=>i.done).length;
  const line=String(n?.body||'').split('\n').map(s=>s.trim()).find(Boolean)||'';
  const preview=line||list.filter(i=>!i.done).map(i=>i.text.trim()).join(', ')||list.map(i=>i.text.trim()).join(', ');
  return {preview:preview.length>90?`${preview.slice(0,89)}…`:preview,progress:list.length?`${done} di ${list.length}`:''};
}
// What goes to the server: the lengths the table accepts; empty list items
// are dropped when the note is closed (keep:false).
function payload(n,{keep=true}={}){
  const list=items(n).slice(0,LIMITS.items).map(i=>({id:String(i.id||newId()).slice(0,40),text:i.text.slice(0,LIMITS.item),done:Boolean(i.done)}));
  return {title:String(n?.title||'').slice(0,LIMITS.title),body:String(n?.body||'').slice(0,LIMITS.body),items:keep?list:list.filter(i=>i.text.trim())};
}
function newId(){return Math.random().toString(36).slice(2,10)||'i';}
function sortNotes(list){return [...list].sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));}

function install(w){
  const d=w.document,$=id=>d.getElementById(id),root=$('usNotesSheet');
  if(!root)return;
  const body=$('usNotesBody');
  let notes=[],loaded=false,owner='',token=0,view='list';
  let editing=null,dirty=false,saving=false,again=false,timer=0,remote=null,noticeTimer=0,fields=null;
  const me=()=>w.usProfile?.id||'';
  const key=()=>w.usProfile?`${w.usProfile.id}:${w.usProfile.couple_id}`:'';
  const opened=()=>root.classList.contains('open');
  const db=()=>typeof sb!=='undefined'?sb:null;
  const nameOf=id=>{
    if(!id)return '';
    if(id===me())return 'Tu';
    try{
      const p=w.UsCoupleContext?.snapshot?.()?.profiles?.find(x=>x.id===id);
      return p?(w.usIdentity?.()?.nameForRole?.(p.role)||'La tua persona'):'';
    }catch(_){return '';}
  };
  const byLine=n=>[nameOf(n.updated_by),when(n.updated_at)].filter(Boolean).join(' · ');

  // ---------------------------------------------------------------- list
  function paintList(){
    view='list';fields=null;
    const add='<button type="button" class="us-notes-new" data-notes-new><span class="us-icon" data-us-icon="plus" aria-hidden="true"></span><span>Nuova nota</span></button>';
    if(!loaded){body.innerHTML='<div class="us-skeleton-rows" role="status"><span class="us-sr">Carico le note…</span><i class="us-skeleton"></i><i class="us-skeleton"></i></div>';return;}
    if(!notes.length){
      body.innerHTML=`<div class="us-notes-empty"><b>Le vostre note</b><span>Spesa, valigia, film da vedere: scrivetele qui, le vedete tutti e due.</span></div>${add}`;
      return;
    }
    body.innerHTML=`${add}<ul class="us-notes-list">${sortNotes(notes).map(n=>{
      const s=summary(n),who=n.updated_by===me()?'tu':'partner';
      const title=String(n.title||'').trim()||s.preview||'Nota';
      return `<li><button type="button" class="us-notes-card" data-note-id="${esc(n.id)}">
        <span class="us-notes-card-top"><b translate="no">${esc(title)}</b>${s.progress?`<span class="us-notes-progress">${esc(s.progress)}</span>`:''}</span>
        ${String(n.title||'').trim()&&s.preview?`<span class="us-notes-preview" translate="no">${esc(s.preview)}</span>`:''}
        <small class="us-notes-by"><i class="us-notes-dot" data-who="${who}" aria-hidden="true"></i>${esc(byLine(n))}</small>
      </button></li>`;}).join('')}</ul>`;
  }
  async function load(){
    const client=db(),k=key();
    if(!client||!k)return;
    const mine=++token;
    const {data,error}=await client.from('couple_notes').select(COLS).eq('couple_id',w.usProfile.couple_id).order('updated_at',{ascending:false});
    if(mine!==token||key()!==k)return;
    if(error){
      console.warn('[US Note]',error);
      if(!loaded&&view==='list')body.innerHTML='<div class="us-notes-empty"><b>Non riesco a caricare le note</b><button type="button" class="ghost" data-notes-retry>Riprova</button></div>';
      return;
    }
    notes=data||[];loaded=true;owner=k;
    if(view==='list')paintList();
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
  function openEditor(note){
    clearTimeout(timer);dirty=false;remote=null;
    editing=note?{...note,items:items(note).map(i=>({...i}))}:{id:null,title:'',body:'',items:[],revision:0,updated_by:me()};
    view='editor';
    body.innerHTML=`<div class="us-notes-editor">
      <div class="us-notes-bar"><button type="button" class="us-notes-back" data-notes-back><span class="us-icon" data-us-icon="caret-left" aria-hidden="true"></span><span>Note</span></button><small class="us-notes-status" role="status" aria-live="polite"></small></div>
      <p class="us-notes-notice" hidden><span></span><button type="button" class="ghost" data-notes-take hidden>Carica la sua versione</button></p>
      <input type="text" class="us-notes-title" maxlength="${LIMITS.title}" placeholder="Titolo" aria-label="Titolo" enterkeyhint="next">
      <textarea class="us-notes-text" maxlength="${LIMITS.body}" rows="3" placeholder="Scrivi qualcosa…" aria-label="Testo della nota"></textarea>
      <ul class="us-notes-items" aria-label="Lista"></ul>
      <button type="button" class="us-notes-add-item" data-notes-add-item><span class="us-icon" data-us-icon="plus" aria-hidden="true"></span><span>Aggiungi una voce</span></button>
      <div class="us-notes-foot"><small class="us-notes-meta"></small><button type="button" class="us-notes-delete" data-notes-delete hidden><span class="us-icon" data-us-icon="trash" aria-hidden="true"></span><span>Elimina</span></button></div>
    </div>`;
    const ed=body.firstElementChild;
    fields={title:ed.querySelector('.us-notes-title'),text:ed.querySelector('.us-notes-text'),list:ed.querySelector('.us-notes-items'),
      status:ed.querySelector('.us-notes-status'),notice:ed.querySelector('.us-notes-notice'),meta:ed.querySelector('.us-notes-meta'),del:ed.querySelector('[data-notes-delete]')};
    fields.title.value=editing.title||'';fields.text.value=editing.body||'';
    paintItems();paintMeta();
    if(!note)setTimeout(()=>fields?.title.focus({preventScroll:true}),60);
  }
  function paintMeta(){
    if(!fields)return;
    fields.del.hidden=!editing.id;
    const who=nameOf(editing.updated_by),at=when(editing.updated_at);
    fields.meta.textContent=!editing.id||!at?'':who?`Modificata da ${who==='Tu'?'te':who} · ${at}`:`Modificata ${at}`;
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
      if(editing===target){Object.assign(editing,{id:row.id,revision:row.revision,updated_by:row.updated_by,updated_at:row.updated_at,created_by:row.created_by});paintMeta();status('Salvata');}
      notes=[row,...notes.filter(n=>n.id!==row.id)];
    }catch(error){
      console.warn('[US Note] save',error);
      dirty=true;status('Non salvata, riprovo…');
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
    paintItems();paintMeta();
  }
  // Closing waits for the save; offline the note stays open, nothing lost.
  async function closeEditor(){
    if(!editing){paintList();return true;}
    syncFields();
    const target=editing;
    // Empty list items go when the note is closed.
    const kept=items(target).filter(i=>i.text.trim());
    if(kept.length!==items(target).length){target.items=kept;dirty=true;}
    for(let i=0;saving&&i<100;i++)await new Promise(r=>setTimeout(r,50));
    if(isEmpty(target)&&target.id){if(!await removeNote(target.id,{ask:false}))return false;}
    else{await save({keep:false});if(dirty){status('Non salvata: controlla la connessione');return false;}}
    editing=null;fields=null;
    paintList();
    return true;
  }
  async function removeNote(id,{ask=true}={}){
    if(ask){
      const ok=await w.UsUiFoundation?.confirm?.({title:'Eliminare la nota?',body:'Sparisce per voi due.',confirmLabel:'Elimina',tone:'danger'});
      if(!ok)return false;
    }
    const client=db();if(!client)return false;
    clearTimeout(timer);dirty=false;
    const {error}=await client.from('couple_notes').delete().eq('id',id);
    if(error){console.warn('[US Note] delete',error);status('Non riesco a eliminarla');return false;}
    notes=notes.filter(n=>n.id!==id);
    return true;
  }

  // ---------------------------------------------------------------- live
  // Realtime (app.js startUsRealtime): a change of the couple's notes.
  function onChange(event){
    if(!key()||key()!==owner)return;
    const row=event?.new&&event.new.id?event.new:null;
    const gone=event?.eventType==='DELETE'?event.old?.id:null;
    if(row&&row.couple_id!==w.usProfile.couple_id)return;
    if(gone){
      notes=notes.filter(n=>n.id!==gone);
      if(editing?.id===gone){editing.id=null;paintMeta();notice('L’altra persona ha eliminato questa nota. Se continui a scrivere, la salvo di nuovo.');}
    }
    if(row){
      notes=[row,...notes.filter(n=>n.id!==row.id)];
      if(editing?.id===row.id&&row.updated_by!==me()&&Number(row.revision)>Number(editing.revision)){
        const who=nameOf(row.updated_by)||'La tua persona';
        if(dirty||saving){remote=row;notice(`${who} l’ha appena modificata.`,{take:true});}
        else{take(row);notice(`Aggiornata da ${who}.`,{ttl:4000});}
      }
    }
    if(opened()&&view==='list')paintList();
  }

  // ---------------------------------------------------------------- shell
  function open(){
    if(!key())return;
    if(owner&&owner!==key())reset();
    w.UsUiFoundation?.cancelSurfaceExit?.(root);
    root.classList.add('open');root.setAttribute('aria-hidden','false');
    paintList();load();
  }
  async function close(){
    if(!opened())return;
    if(view==='editor'&&!await closeEditor())return;
    const finish=()=>{root.classList.remove('open');root.setAttribute('aria-hidden','true');};
    root.classList.remove('open');
    if(!w.UsUiFoundation?.exitSurface?.(root,finish))finish();
  }
  function reset(){token++;notes=[];loaded=false;owner='';editing=null;fields=null;dirty=false;remote=null;clearTimeout(timer);
    if(opened()){root.classList.remove('open');root.setAttribute('aria-hidden','true');}}

  root.addEventListener('click',event=>{
    const t=event.target;
    if(t.closest('[data-notes-close]'))return close();
    if(t.closest('[data-notes-retry]'))return load();
    if(t.closest('[data-notes-new]'))return openEditor(null);
    const card=t.closest('[data-note-id]');
    if(card){const n=notes.find(x=>x.id===card.dataset.noteId);if(n)openEditor(n);return;}
    if(t.closest('[data-notes-back]'))return closeEditor();
    if(t.closest('[data-notes-take]')){if(remote)take(remote);notice('');return;}
    if(t.closest('[data-notes-delete]')){
      const id=editing?.id;
      if(id)removeNote(id).then(ok=>{if(ok){editing=null;fields=null;paintList();}});
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
  });
  root.addEventListener('input',event=>{
    if(!fields||!editing)return;
    const t=event.target;
    if(t===fields.title||t===fields.text){syncFields();changed();return;}
    const row=t.closest('[data-item-id]');
    const item=row&&editing.items.find(i=>i.id===row.dataset.itemId);
    if(!item)return;
    if(t.type==='checkbox'){item.done=t.checked;row.classList.toggle('is-done',t.checked);changed(250);return;}
    item.text=t.value;changed();
  });
  root.addEventListener('keydown',event=>{
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
  });
  // Leaving the app: what is typed is saved now.
  d.addEventListener('visibilitychange',()=>{if(d.hidden&&dirty){syncFields();save();}});
  w.setInterval(()=>{if(owner&&key()!==owner)reset();},2000);
  // Back (navigation.js): from a note to the list, from the list out.
  const back=()=>view==='editor'?closeEditor():close();
  const api=w.UsCoupleNotes;api.open=open;api.close=close;api.back=back;api.reset=reset;api.onChange=onChange;
}
return {when,isEmpty,summary,payload,sortNotes,LIMITS,install};
});
