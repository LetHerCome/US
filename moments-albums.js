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
    <div class="us-album-overlay" id="usAlbumOverlay" aria-hidden="true" data-us-modal>
      <div class="us-album-shell" role="dialog" aria-modal="true" aria-label="Album del Moment" data-us-modal-panel>
        <button type="button" class="us-album-close us-modal-close" id="usAlbumClose" aria-label="Chiudi album" data-us-modal-close>‹</button>
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
    <div class="us-album-lightbox" id="usAlbumLightbox" aria-hidden="true" role="dialog" aria-modal="true" aria-label="Foto del Moment" data-us-modal data-us-modal-panel>
      <button type="button" class="us-album-lightbox-close us-modal-close" id="usAlbumLightboxClose" aria-label="Chiudi foto" data-us-modal-close>×</button>
      <div class="us-album-lightbox-count" id="usAlbumLightboxCount"></div>
      <img id="usAlbumLightboxImg" alt="Foto del Moment">
      <div class="us-album-lightbox-info"><b id="usAlbumLightboxAuthor"></b><p id="usAlbumLightboxCaption"></p></div>
    </div>
  `);

  document.getElementById('usAlbumClose')?.addEventListener('click',closeAlbum);
  document.getElementById('usAlbumAddBtn')?.addEventListener('click',()=>document.getElementById('usAlbumFile')?.click());

  if(!document.getElementById('usAlbumFloatingAdd')){
    const floating=document.createElement('button');
    floating.type='button';
    floating.id='usAlbumFloatingAdd';
    floating.className='us-album-floating-add';
    floating.setAttribute('aria-label','Aggiungi una foto a questo Moment');
    floating.innerHTML='<span>＋</span><b>Aggiungi foto</b>';
    floating.addEventListener('click',()=>document.getElementById('usAlbumFile')?.click());
    document.getElementById('usAlbumOverlay')?.appendChild(floating);
  }
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
  const addBtn=document.getElementById('usAlbumAddBtn');
  if(addBtn){addBtn.hidden=false;addBtn.disabled=false;}
  if(cover){
    cover.src=currentAlbum.url;
    cover.onclick=()=>openLightbox(0);
    cover.setAttribute('role','button');
    cover.setAttribute('tabindex','0');
  }
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

  // One deterministic entry point for every Moment card.
  window.openMomentViewer=function(card){
    if(card?.matches?.('#momentsGrid .moment-card[data-moment-id]'))return openAlbum(card);
    if(card?.dataset?.momentId)return openAlbum(card);
    return legacyOpenMomentViewer?.(card);
  };
  window.openUsMomentAlbum=openAlbum;

  // Capture before legacy inline/click handlers. This removes the historical
  // split where some covers could still fall through to the old viewer.
  const grid=document.getElementById('momentsGrid');
  if(grid&&!grid.dataset.usAlbumCapture){
    grid.dataset.usAlbumCapture='1';
    grid.addEventListener('click',event=>{
      if(event.target.closest('.moment-delete'))return;
      const card=event.target.closest('.moment-card[data-moment-id]');
      if(!card)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openAlbum(card);
    },true);
    grid.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      if(event.target.closest('.moment-delete'))return;
      const card=event.target.closest('.moment-card[data-moment-id]');
      if(!card)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openAlbum(card);
    },true);
  }

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

/* ============================================================
   US · Moments Visual Fix
   UI-only enhancement. No DB/runtime ownership.
   ============================================================ */
(() => {
  'use strict';
  if (window.__usMomentsVisualFixInstalled) return;
  window.__usMomentsVisualFixInstalled = true;

  let pageReady = false;
  let albumReady = false;
  let composeWasPhoto = false;
  let albumSwipeStart = null;

  function initials(name) {
    const value = String(name || 'Noi').trim();
    if (!value) return '♡';
    return value.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || '♡';
  }

  function updateMomentCount() {
    const total = document.querySelectorAll('#momentsGrid .moment-card').length;
    const el = document.getElementById('usMomentsTotal');
    if (el) el.textContent = total ? `${total} ${total === 1 ? 'ricordo' : 'ricordi'}` : 'Nessun ricordo';
  }

  function openComposer() {
    const overlay = document.getElementById('usMomentComposeOverlay');
    if (!overlay) return;
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('us-moment-compose-open');
  }

  function closeComposer() {
    const overlay = document.getElementById('usMomentComposeOverlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('us-moment-compose-open');
  }

  function setupMomentsPage() {
    if (pageReady) return;
    const page = document.getElementById('moments');
    const section = page?.querySelector('.section');
    const compose = document.getElementById('momentCompose');
    const grid = document.getElementById('momentsGrid');
    const originalTitle = section?.querySelector(':scope > h2');
    if (!page || !section || !compose || !grid || !originalTitle) return;

    const head = document.createElement('div');
    head.className = 'us-moments-head';
    head.innerHTML = `
      <div class="us-moments-head-copy">
        <div class="us-moments-eyebrow">IL VOSTRO DIARIO</div>
        <h2>Moments</h2>
        <p>I vostri ricordi, un pezzo alla volta.</p>
      </div>
      <div class="us-moments-head-actions">
        <span class="us-moments-total" id="usMomentsTotal"></span>
        <button type="button" class="us-moments-add" id="usMomentsAdd" aria-label="Aggiungi un ricordo">＋</button>
      </div>
    `;
    section.insertBefore(head, originalTitle.nextSibling);

    const overlay = document.createElement('div');
    overlay.className = 'us-moment-compose-overlay';
    overlay.id = 'usMomentComposeOverlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('data-us-modal', '');
    overlay.innerHTML = `
      <div class="us-moment-compose-backdrop us-modal-backdrop" id="usMomentComposeBackdrop"></div>
      <section class="us-moment-compose-sheet" role="dialog" aria-modal="true" aria-label="Aggiungi un ricordo" data-us-modal-panel>
        <div class="us-moment-compose-grabber"></div>
        <div class="us-moment-compose-title">
          <div><small>NUOVO MOMENT</small><b>Aggiungi un ricordo</b></div>
          <button type="button" class="us-moment-compose-close us-modal-close" id="usMomentComposeClose" aria-label="Chiudi" data-us-modal-close>×</button>
        </div>
        <div id="usMomentComposeMount"></div>
      </section>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#usMomentComposeMount')?.appendChild(compose);

    document.getElementById('usMomentsAdd')?.addEventListener('click', openComposer);
    document.getElementById('usMomentComposeClose')?.addEventListener('click', closeComposer);
    document.getElementById('usMomentComposeBackdrop')?.addEventListener('click', closeComposer);

    composeWasPhoto = compose.classList.contains('has-photo');
    const composeObserver = new MutationObserver(() => {
      const hasPhoto = compose.classList.contains('has-photo');
      if (composeWasPhoto && !hasPhoto && overlay.classList.contains('show')) {
        setTimeout(closeComposer, 160);
      }
      composeWasPhoto = hasPhoto;
    });
    composeObserver.observe(compose, { attributes: true, attributeFilter: ['class'] });

    const gridObserver = new MutationObserver(updateMomentCount);
    gridObserver.observe(grid, { childList: true, subtree: false });
    updateMomentCount();
    pageReady = true;
  }

  function syncCoverBlur() {
    const cover = document.getElementById('usAlbumCover');
    const blur = document.querySelector('.us-album-cover-blur');
    if (!cover || !blur) return;
    const url = cover.currentSrc || cover.src || '';
    blur.style.backgroundImage = url ? `url("${url.replace(/"/g, '\\"')}")` : '';
  }

  function decorateAuthors(root = document) {
    root.querySelectorAll?.('.us-album-photo-copy small').forEach(small => {
      if (small.querySelector('.us-author-initial')) return;
      const name = small.textContent.trim() || 'Noi';
      const chip = document.createElement('span');
      chip.className = 'us-author-initial';
      chip.textContent = initials(name);
      small.prepend(chip);
    });

    const coverAuthor = document.getElementById('usAlbumCoverAuthor');
    if (coverAuthor && !coverAuthor.dataset.visualPolished) {
      coverAuthor.dataset.visualPolished = '1';
    }
  }

  function addAlbumTile() {
    const grid = document.getElementById('usAlbumGrid');
    if (!grid || document.getElementById('usAlbumAddTile')) return;
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.id = 'usAlbumAddTile';
    tile.className = 'us-album-add-tile';
    tile.innerHTML = '<span>＋</span> Aggiungi un altro pezzo di questo giorno';
    tile.addEventListener('click', () => document.getElementById('usAlbumFile')?.click());
    grid.insertAdjacentElement('afterend', tile);
  }

  function setupAlbum() {
    if (albumReady) return;
    const overlay = document.getElementById('usAlbumOverlay');
    const stage = overlay?.querySelector('.us-album-cover-stage');
    const cover = document.getElementById('usAlbumCover');
    const grid = document.getElementById('usAlbumGrid');
    const scroll = document.getElementById('usAlbumScroll');
    if (!overlay || !stage || !cover || !grid || !scroll) return;

    if (!stage.querySelector('.us-album-cover-blur')) {
      const blur = document.createElement('div');
      blur.className = 'us-album-cover-blur';
      stage.prepend(blur);
    }

    const title = overlay.querySelector('.us-album-section-head h3');
    const kicker = overlay.querySelector('.us-album-section-head .tiny');
    if (title) title.textContent = 'Altri pezzi di quel giorno';
    if (kicker) kicker.textContent = 'DENTRO QUESTO MOMENT';

    addAlbumTile();
    syncCoverBlur();
    decorateAuthors(overlay);

    const coverObserver = new MutationObserver(syncCoverBlur);
    coverObserver.observe(cover, { attributes: true, attributeFilter: ['src'] });
    cover.addEventListener('load', syncCoverBlur);

    const gridObserver = new MutationObserver(() => {
      decorateAuthors(grid);
      addAlbumTile();
    });
    gridObserver.observe(grid, { childList: true, subtree: true });

    // Natural "pull down to go back" when the album is already at the top.
    scroll.addEventListener('touchstart', event => {
      const t = event.touches?.[0];
      if (!t || scroll.scrollTop > 2) { albumSwipeStart = null; return; }
      albumSwipeStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });

    scroll.addEventListener('touchend', event => {
      if (!albumSwipeStart || scroll.scrollTop > 2) { albumSwipeStart = null; return; }
      const t = event.changedTouches?.[0];
      if (!t) { albumSwipeStart = null; return; }
      const dx = t.clientX - albumSwipeStart.x;
      const dy = t.clientY - albumSwipeStart.y;
      albumSwipeStart = null;
      if (dy > 88 && Math.abs(dy) > Math.abs(dx) * 1.25) {
        document.getElementById('usAlbumClose')?.click();
      }
    }, { passive: true });

    albumReady = true;
  }

  function boot() {
    setupMomentsPage();
    setupAlbum();
    if (!pageReady || !albumReady) setTimeout(boot, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  console.info('[US] Moments Visual Fix attivo');
})();
