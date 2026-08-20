(() => {
'use strict';
if(window.__usMomentAlbumsInstalled)return;
window.__usMomentAlbumsInstalled=true;

const legacyOpenMomentViewer=window.openMomentViewer;
const legacyHydrateMoments=window.hydrateMoments;

let currentAlbum=null;
let albumRows=[];
let pendingFile=null;
let pendingPreviewUrl='';
let albumLoadSeq=0;
let lightboxItems=[];
let lightboxIndex=0;
let lightboxTouch=null;
let albumUploadBusy=false;

function esc(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function ensureUi(){
  if(document.getElementById('usAlbumOverlay'))return;
  document.body.insertAdjacentHTML('beforeend',`
    <div class="us-album-overlay" id="usAlbumOverlay" aria-hidden="true">
      <div class="us-album-shell">
        <button type="button" class="us-album-close" id="usAlbumClose" aria-label="Chiudi album">‹</button>
        <div class="us-album-scroll" id="usAlbumScroll">
          <div class="us-album-cover-stage"><img id="usAlbumCover" alt="Foto principale del Moment"></div>
          <div class="us-album-info">
            <div class="us-album-meta-line"><b id="usAlbumDate"></b><span id="usAlbumCount">1 foto</span></div>
            <div class="us-album-caption-postit" id="usAlbumCoverNote" hidden><p id="usAlbumCoverCaption"></p><small id="usAlbumCoverAuthor"></small></div>
          </div>
          <section class="us-album-section">
            <div class="us-album-section-head">
              <div><div class="tiny">DENTRO QUESTO MOMENTO</div><h3>Le vostre foto</h3></div>
              <button type="button" class="us-album-add" id="usAlbumAddBtn">＋ Aggiungi</button>
            </div>
            <input type="file" id="usAlbumFile" accept="image/jpeg,image/png,image/webp" hidden>
            <div class="us-album-composer" id="usAlbumComposer" hidden>
              <img class="us-album-composer-preview" id="usAlbumPreview" alt="Anteprima foto">
              <input type="text" maxlength="180" id="usAlbumCaption" placeholder="Una piccola descrizione… (opzionale)">
              <div class="us-album-composer-actions">
                <button type="button" class="us-album-cancel" id="usAlbumCancel">Annulla</button>
                <button type="button" class="us-album-save" id="usAlbumSave">Aggiungi al momento</button>
              </div>
            </div>
            <div class="us-album-grid" id="usAlbumGrid"></div>
          </section>
        </div>
      </div>
    </div>
    <div class="us-album-lightbox" id="usAlbumLightbox" aria-hidden="true">
      <button type="button" class="us-album-lightbox-close" id="usAlbumLightboxClose" aria-label="Chiudi foto">×</button>
      <div class="us-album-lightbox-count" id="usAlbumLightboxCount"></div>
      <img id="usAlbumLightboxImg" alt="Foto del Moment">
      <div class="us-album-lightbox-info"><b id="usAlbumLightboxAuthor"></b><p id="usAlbumLightboxCaption"></p></div>
    </div>
  `);

  document.getElementById('usAlbumClose')?.addEventListener('click',closeAlbum);
  document.getElementById('usAlbumAddBtn')?.addEventListener('click',()=>document.getElementById('usAlbumFile')?.click());
  document.getElementById('usAlbumCancel')?.addEventListener('click',resetComposer);
  document.getElementById('usAlbumSave')?.addEventListener('click',saveAlbumPhoto);
  document.getElementById('usAlbumFile')?.addEventListener('change',handleFileSelected);
  document.getElementById('usAlbumGrid')?.addEventListener('click',handleGridClick);
  document.getElementById('usAlbumLightboxClose')?.addEventListener('click',closeLightbox);
  document.getElementById('usAlbumLightbox')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closeLightbox()});

  const lb=document.getElementById('usAlbumLightbox');
  lb?.addEventListener('touchstart',e=>{
    const t=e.touches?.[0];if(!t)return;
    lightboxTouch={x:t.clientX,y:t.clientY};
  },{passive:true});
  lb?.addEventListener('touchend',e=>{
    if(!lightboxTouch)return;
    const t=e.changedTouches?.[0];if(!t){lightboxTouch=null;return;}
    const dx=t.clientX-lightboxTouch.x,dy=t.clientY-lightboxTouch.y;
    lightboxTouch=null;
    if(dy>70&&Math.abs(dy)>Math.abs(dx)){closeLightbox();return;}
    if(Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)){
      if(dx<0)showLightbox(lightboxIndex+1);
      else showLightbox(lightboxIndex-1);
    }
  },{passive:true});

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      if(document.getElementById('usAlbumLightbox')?.classList.contains('show'))closeLightbox();
      else if(document.getElementById('usAlbumOverlay')?.classList.contains('show'))closeAlbum();
    }else if(document.getElementById('usAlbumLightbox')?.classList.contains('show')){
      if(e.key==='ArrowRight')showLightbox(lightboxIndex+1);
      if(e.key==='ArrowLeft')showLightbox(lightboxIndex-1);
    }
  });
}

async function decorateMomentCards(){
  if(!window.usProfile)return;
  const cards=[...document.querySelectorAll('#momentsGrid .moment-card[data-moment-id]')];
  if(!cards.length)return;
  const ids=cards.map(card=>card.dataset.momentId).filter(Boolean);
  const {data,error}=await sb.from('moment_photos').select('moment_id').in('moment_id',ids);
  if(error){console.warn('[US Albums] counts',error);return;}
  const counts=new Map();
  for(const row of data||[])counts.set(row.moment_id,(counts.get(row.moment_id)||0)+1);
  for(const card of cards){
    card.querySelector('.moment-album-count')?.remove();
    const secondary=counts.get(card.dataset.momentId)||0;
    const del=card.querySelector('.moment-delete');
    if(secondary>0){
      card.classList.add('has-album');
      if(del)del.hidden=true;
      const badge=document.createElement('span');
      badge.className='moment-album-count';
      badge.textContent=`${secondary+1} foto`;
      card.appendChild(badge);
    }else{
      card.classList.remove('has-album');
      if(del)del.hidden=false;
    }
  }
}

function resetComposer(){
  if(pendingPreviewUrl)URL.revokeObjectURL(pendingPreviewUrl);
  pendingPreviewUrl='';pendingFile=null;
  const input=document.getElementById('usAlbumFile');if(input)input.value='';
  const caption=document.getElementById('usAlbumCaption');if(caption)caption.value='';
  const composer=document.getElementById('usAlbumComposer');if(composer)composer.hidden=true;
}
function handleFileSelected(event){
  const file=event.target.files?.[0];if(!file)return;
  if(!/^image\/(jpeg|png|webp)$/i.test(file.type||'')){toast('Scegli una foto JPG, PNG o WebP');event.target.value='';return;}
  if(pendingPreviewUrl)URL.revokeObjectURL(pendingPreviewUrl);
  pendingFile=file;pendingPreviewUrl=URL.createObjectURL(file);
  const preview=document.getElementById('usAlbumPreview');if(preview)preview.src=pendingPreviewUrl;
  const composer=document.getElementById('usAlbumComposer');if(composer)composer.hidden=false;
  document.getElementById('usAlbumCaption')?.focus({preventScroll:true});
  setTimeout(()=>composer?.scrollIntoView({behavior:'smooth',block:'nearest'}),60);
}

async function saveAlbumPhoto(){
  if(albumUploadBusy||!pendingFile||!currentAlbum||!window.usProfile)return;
  const save=document.getElementById('usAlbumSave');
  const caption=document.getElementById('usAlbumCaption')?.value.trim()||'';
  albumUploadBusy=true;if(save){save.disabled=true;save.textContent='Ottimizzo…';}
  let path='';
  try{
    const compressor=window.compressImageFile;
    if(typeof compressor!=='function')throw new Error('COMPRESSION_UNAVAILABLE');
    const compressed=await compressor(pendingFile,{maxDimension:1920,quality:.82});
    path=`${window.usProfile.couple_id}/${window.usProfile.id}/moment-albums/${currentAlbum.id}/${Date.now()}-${crypto.randomUUID()}.webp`;
    if(save)save.textContent='Carico…';
    const {error:uploadError}=await sb.storage.from('us-media').upload(path,compressed,{contentType:'image/webp',upsert:false,cacheControl:'3600'});
    if(uploadError)throw uploadError;
    const maxPosition=albumRows.reduce((max,row)=>Math.max(max,Number(row.position)||0),0);
    const {error:rowError}=await sb.from('moment_photos').insert({
      moment_id:currentAlbum.id,
      couple_id:window.usProfile.couple_id,
      created_by:window.usProfile.id,
      storage_path:path,
      caption:caption||null,
      position:maxPosition+1
    });
    if(rowError){await sb.storage.from('us-media').remove([path]);throw rowError;}
    resetComposer();
    toast('Foto aggiunta al momento');
    await loadAlbum(currentAlbum.id);
    await decorateMomentCards();
  }catch(error){
    console.warn('[US Albums] upload',error);
    toast(error?.message==='SOURCE_TOO_LARGE'?'Foto troppo grande: massimo 20 MB':'Non riesco ad aggiungere la foto');
  }finally{
    albumUploadBusy=false;if(save){save.disabled=false;save.textContent='Aggiungi al momento';}
  }
}

async function loadAlbum(momentId){
  const seq=++albumLoadSeq;
  const grid=document.getElementById('usAlbumGrid');
  if(grid)grid.innerHTML='<div class="us-album-empty">Carico le foto del momento…</div>';
  const [{data:rows,error},{data:profiles,error:profilesError}]=await Promise.all([
    sb.from('moment_photos').select('id,moment_id,created_by,storage_path,caption,position,created_at').eq('moment_id',momentId).order('position',{ascending:true}).order('created_at',{ascending:true}),
    sb.from('profiles').select('id,display_name').eq('couple_id',window.usProfile.couple_id)
  ]);
  if(seq!==albumLoadSeq)return;
  if(error){console.warn('[US Albums] load',error);if(grid)grid.innerHTML='<div class="us-album-empty">Non riesco a caricare le altre foto. Riprova tra poco.</div>';return;}
  if(profilesError)console.warn(profilesError);
  const names=new Map((profiles||[]).map(p=>[p.id,p.display_name||'Noi']));
  const paths=(rows||[]).map(row=>row.storage_path);
  let signedUrls=new Map();
  if(typeof window.usGetSignedUrls==='function')signedUrls=await window.usGetSignedUrls(paths,21600);
  else{
    const fallback=await Promise.all(paths.map(async path=>{
      const {data,error}=await sb.storage.from('us-media').createSignedUrl(path,21600);
      return [path,error?null:data?.signedUrl||null];
    }));
    signedUrls=new Map(fallback.filter(([,url])=>url));
  }
  if(seq!==albumLoadSeq)return;
  const hydrated=[];
  for(const row of rows||[]){
    const signedUrl=signedUrls.get(row.storage_path);
    if(!signedUrl)continue;
    hydrated.push({...row,url:signedUrl,author:names.get(row.created_by)||'Noi',own:row.created_by===window.usProfile.id});
  }
  albumRows=hydrated;
  renderAlbum();
}

function renderAlbum(){
  if(!currentAlbum)return;
  const count=albumRows.length+1;
  document.getElementById('usAlbumCount').textContent=`${count} ${count===1?'foto':'foto'}`;
  const grid=document.getElementById('usAlbumGrid');
  if(!grid)return;
  if(!albumRows.length){
    grid.innerHTML='<div class="us-album-empty">Per ora c’è solo la foto principale.<br>Aggiungete qui altri pezzi dello stesso ricordo.</div>';
  }else{
    grid.innerHTML=albumRows.map((row,index)=>`
      <article class="us-album-photo-card" role="button" tabindex="0" data-album-index="${index+1}" aria-label="Apri foto aggiunta da ${esc(row.author)}">
        <img src="${esc(row.url)}" alt="Foto aggiunta al Moment" loading="lazy">
        ${row.own?`<button type="button" class="us-album-photo-delete" data-album-delete="${esc(row.id)}" data-storage-path="${esc(row.storage_path)}" aria-label="Elimina questa foto">×</button>`:''}
        <div class="us-album-photo-copy">
          ${row.caption?`<p>${esc(row.caption)}</p>`:'<p> </p>'}
          <small>${esc(row.author)}</small>
        </div>
      </article>
    `).join('');
  }
  lightboxItems=[
    {url:currentAlbum.url,author:currentAlbum.author,caption:currentAlbum.caption||'',date:currentAlbum.date||'',cover:true},
    ...albumRows
  ];
}

async function handleGridClick(event){
  const deleteButton=event.target.closest('[data-album-delete]');
  if(deleteButton){
    event.stopPropagation();
    await deleteAlbumPhoto(deleteButton.dataset.albumDelete,deleteButton.dataset.storagePath);
    return;
  }
  const card=event.target.closest('.us-album-photo-card[data-album-index]');
  if(card)openLightbox(Number(card.dataset.albumIndex)||1);
}
async function deleteAlbumPhoto(id,path){
  if(!id||!window.usProfile)return;
  if(!confirm('Eliminare questa foto dal momento?'))return;
  const {error:rowError}=await sb.from('moment_photos').delete().eq('id',id).eq('created_by',window.usProfile.id);
  if(rowError){console.warn('[US Albums] delete row',rowError);toast('Non riesco a eliminare la foto');return;}
  const {error:storageError}=await sb.storage.from('us-media').remove([path]);
  if(storageError)console.warn('[US Albums] storage cleanup',storageError);
  toast('Foto eliminata');
  await loadAlbum(currentAlbum.id);
  await decorateMomentCards();
}

async function openAlbum(card){
  ensureUi();
  const id=card?.dataset?.momentId;
  if(!id){legacyOpenMomentViewer?.(card);return;}
  currentAlbum={
    id,
    url:card.dataset.url||'',
    author:card.dataset.author||'Noi',
    date:card.dataset.date||'',
    caption:card.dataset.caption||''
  };
  albumRows=[];resetComposer();
  const overlay=document.getElementById('usAlbumOverlay');
  const cover=document.getElementById('usAlbumCover');
  if(cover)cover.src=currentAlbum.url;
  document.getElementById('usAlbumDate').textContent=currentAlbum.date;
  document.getElementById('usAlbumCount').textContent='1 foto';
  const note=document.getElementById('usAlbumCoverNote');
  const caption=document.getElementById('usAlbumCoverCaption');
  const author=document.getElementById('usAlbumCoverAuthor');
  if(caption)caption.textContent=currentAlbum.caption;
  if(author)author.textContent=currentAlbum.caption?`Aggiunto da ${currentAlbum.author}`:currentAlbum.author;
  if(note)note.hidden=!currentAlbum.caption;
  overlay?.classList.add('show');overlay?.setAttribute('aria-hidden','false');
  document.body.classList.add('us-album-open');
  const scroll=document.getElementById('usAlbumScroll');if(scroll)scroll.scrollTop=0;
  lightboxItems=[{url:currentAlbum.url,author:currentAlbum.author,caption:currentAlbum.caption,cover:true}];
  await loadAlbum(id);
}
window.refreshOpenMomentAlbum=function(){
  if(currentAlbum?.id&&document.getElementById('usAlbumOverlay')?.classList.contains('show'))return loadAlbum(currentAlbum.id);
  return Promise.resolve();
};
function closeAlbum(){
  ++albumLoadSeq;resetComposer();
  document.getElementById('usAlbumOverlay')?.classList.remove('show');
  document.getElementById('usAlbumOverlay')?.setAttribute('aria-hidden','true');
  document.body.classList.remove('us-album-open');
  closeLightbox();
  currentAlbum=null;albumRows=[];
}
function openLightbox(index=0){
  if(!lightboxItems.length)return;
  ensureUi();
  const lb=document.getElementById('usAlbumLightbox');
  lb?.classList.add('show');lb?.setAttribute('aria-hidden','false');
  showLightbox(index);
}
function showLightbox(index){
  if(!lightboxItems.length)return;
  lightboxIndex=(index+lightboxItems.length)%lightboxItems.length;
  const item=lightboxItems[lightboxIndex];
  const img=document.getElementById('usAlbumLightboxImg');if(img)img.src=item.url||'';
  document.getElementById('usAlbumLightboxCount').textContent=`${lightboxIndex+1} / ${lightboxItems.length}`;
  document.getElementById('usAlbumLightboxAuthor').textContent=item.author||'Noi';
  document.getElementById('usAlbumLightboxCaption').textContent=item.caption||'';
}
function closeLightbox(){
  const lb=document.getElementById('usAlbumLightbox');
  lb?.classList.remove('show');lb?.setAttribute('aria-hidden','true');
  const img=document.getElementById('usAlbumLightboxImg');if(img)img.removeAttribute('src');
}

function installHooks(){
  ensureUi();
  window.openMomentViewer=function(card){
    if(card?.dataset?.momentId)return openAlbum(card);
    return legacyOpenMomentViewer?.(card);
  };
  if(typeof legacyHydrateMoments==='function'){
    window.hydrateMoments=async function(...args){
      const result=await legacyHydrateMoments.apply(this,args);
      try{await decorateMomentCards();}catch(error){console.warn('[US Albums] decorate',error);}
      return result;
    };
  }
}
installHooks();
setTimeout(()=>decorateMomentCards().catch(()=>{}),900);
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&window.usProfile){
    if(document.getElementById('moments')?.classList.contains('active'))decorateMomentCards().catch(()=>{});
    if(currentAlbum)loadAlbum(currentAlbum.id).catch(()=>{});
  }
});
console.info('[US] Moments Albums attivo');
})();