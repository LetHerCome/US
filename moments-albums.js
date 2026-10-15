(() => {
'use strict';
if(window.__usMomentAlbumsInstalled)return;
window.__usMomentAlbumsInstalled=true;

const legacyOpenMomentViewer=window.openMomentViewer;
const legacyHydrateMoments=window.hydrateMoments;

let currentAlbum=null;
let albumRows=[];
let albumCarouselIndex=0;
let albumCarouselTouch=null;
let albumCarouselSuppressClickUntil=0;
let selectNewestAlbumPhoto=false;
let pendingFile=null;
let pendingPreviewUrl='';
let albumLoadSeq=0;
let lightboxItems=[];
let lightboxIndex=0;
let lightboxTouch=null;
let lightboxActiveLayer='A';
let lightboxRenderToken=0;
let lightboxSettleCancel=null;
let albumUploadBusy=false;
let albumLoaded=false;
// Ricordi delete-with-undo: at most one Moment waits in its grace period.
// Nothing is deleted until the grace expires; Annulla only cancels a timer.
const DELETE_GRACE_MS=4000;
let pendingDelete=null;

function esc(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function ensureUi(){
  if(document.getElementById('usAlbumOverlay'))return;
  document.body.insertAdjacentHTML('beforeend',`
    <div class="us-album-overlay" id="usAlbumOverlay" aria-hidden="true" data-us-modal data-us-motion-surface data-us-galleria>
      <div class="us-album-shell" role="dialog" aria-modal="true" aria-label="Album del ricordo" data-us-modal-panel>
        <button type="button" class="us-album-close us-modal-close is-on-media" id="usAlbumClose" aria-label="Chiudi album" data-us-modal-close><span class="us-icon" data-us-icon="x" aria-hidden="true"></span></button>
        <div class="us-album-scroll" id="usAlbumScroll">
          <div class="us-album-cover-stage" id="usAlbumCarousel" role="region" aria-label="Foto del ricordo" aria-roledescription="carosello" tabindex="0">
            <img id="usAlbumPeek" class="us-album-peek" alt="" loading="lazy" decoding="async" aria-hidden="true" hidden>
            <img id="usAlbumCover" alt="Foto principale del ricordo" decoding="async" onerror="usRecoverPrivateImage(this)">
            <span class="us-album-carousel-counter" id="usAlbumCarouselCounter" aria-live="polite" hidden></span>
            <span class="us-album-carousel-hint" id="usAlbumCarouselHint" aria-hidden="true" hidden>Scorri le foto</span>
          </div>
          <div class="us-album-info">
            <div class="us-album-meta-line"><b id="usAlbumDate"></b><span id="usAlbumCount">1 foto</span></div>
            <div class="us-album-caption-postit" id="usAlbumCoverNote" hidden><p id="usAlbumCoverCaption" translate="no"></p><small id="usAlbumCoverAuthor"></small></div>
            <div class="us-album-photo-actions">
              <button type="button" class="us-album-save-photo" id="usAlbumSavePhoto"><span class="us-icon" data-us-icon="download-simple" aria-hidden="true"></span><span>Salva sul telefono</span></button>
            </div>
            <p class="us-album-carousel-status" id="usAlbumCarouselStatus" role="status" aria-live="polite" hidden></p>
          </div>
          <header class="us-album-story" id="usAlbumStory">
            <small class="us-album-provenance" id="usAlbumProvenance"></small>
            <h2 class="us-album-title" id="usAlbumTitle" translate="no"></h2>
            <p class="us-album-byline" id="usAlbumByline"></p>
            <button type="button" class="us-album-ask" id="usAlbumAsk" hidden><span class="us-icon" data-us-icon="envelope" aria-hidden="true"></span><span id="usAlbumAskLabel"></span></button>
          </header>
          <div class="us-album-acts" id="usAlbumActs">
            <button type="button" class="us-album-carousel-arrow us-album-carousel-prev" id="usAlbumCarouselPrev" aria-label="Foto precedente" hidden><span class="us-icon" data-us-icon="caret-left" aria-hidden="true"></span></button>
            <button type="button" class="us-album-carousel-arrow us-album-carousel-next" id="usAlbumCarouselNext" aria-label="Foto successiva" hidden><span class="us-icon" data-us-icon="caret-right" aria-hidden="true"></span></button>
            <span class="us-album-acts-space" aria-hidden="true"></span>
            <button type="button" class="us-album-current-delete" id="usAlbumCurrentDelete" aria-label="Elimina questa foto" hidden><span class="us-icon" data-us-icon="trash" aria-hidden="true"></span></button>
            <div class="us-undo-delete" id="usAlbumDelete" data-state="idle" style="--us-undo-grace:${DELETE_GRACE_MS}ms" hidden>
              <button type="button" class="us-undo-delete-go" id="usAlbumDeleteGo" aria-label="Elimina questo ricordo per entrambi"><span class="us-icon" data-us-icon="trash" aria-hidden="true"></span><span class="us-undo-delete-go-label">Elimina</span></button>
              <span class="us-undo-delete-done" role="status" aria-live="polite"><span class="us-undo-delete-label">Eliminato</span><button type="button" class="us-undo-delete-undo" id="usAlbumDeleteUndo" tabindex="-1">Annulla</button></span>
              <i class="us-undo-delete-fuse" aria-hidden="true"></i>
            </div>
          </div>
          <section class="us-album-section">
            <div class="us-album-section-head">
              <div><div class="tiny">DENTRO QUESTO RICORDO</div><h3>Le vostre foto</h3></div>
              <button type="button" class="us-album-add" id="usAlbumAddBtn"><span class="us-icon" data-us-icon="plus" aria-hidden="true"></span> Aggiungi</button>
            </div>
            <input type="file" id="usAlbumFile" accept="image/jpeg,image/png,image/webp" hidden>
            <div class="us-album-composer" id="usAlbumComposer" hidden>
              <img class="us-album-composer-preview" id="usAlbumPreview" alt="Anteprima foto">
              <input type="text" maxlength="180" id="usAlbumCaption" placeholder="Descrizione (opzionale)">
              <div class="us-album-composer-actions">
                <button type="button" class="us-album-cancel" id="usAlbumCancel">Annulla</button>
                <button type="button" class="us-album-save" id="usAlbumSave">Aggiungi al ricordo</button>
              </div>
            </div>
            <div class="us-album-grid" id="usAlbumGrid"></div>
          </section>
        </div>
      </div>
    </div>
    <div class="us-album-lightbox" id="usAlbumLightbox" aria-hidden="true" role="dialog" aria-modal="true" aria-label="Foto del ricordo" data-us-modal data-us-motion-surface>
      <div class="us-album-lightbox-stage" data-us-modal-panel>
        <button type="button" class="us-album-lightbox-close us-modal-close is-on-media" id="usAlbumLightboxClose" aria-label="Chiudi foto" data-us-modal-close><span class="us-icon" data-us-icon="x" aria-hidden="true"></span></button>
        <div class="us-album-lightbox-count" id="usAlbumLightboxCount"></div>
        <button type="button" class="us-album-lightbox-save us-modal-close is-on-media" id="usAlbumLightboxSave" aria-label="Salva sul telefono"><span class="us-icon" data-us-icon="download-simple" aria-hidden="true"></span></button>
        <img class="us-album-lightbox-photo active" id="usAlbumLightboxImgA" alt="Foto del ricordo">
        <img class="us-album-lightbox-photo" id="usAlbumLightboxImgB" alt="">
        <div class="us-album-lightbox-info"><b id="usAlbumLightboxAuthor" translate="no"></b><p id="usAlbumLightboxCaption" translate="no"></p></div>
      </div>
    </div>
  `);

  document.getElementById('usAlbumClose')?.addEventListener('click',closeAlbum);
  document.getElementById('usAlbumDeleteGo')?.addEventListener('click',startMomentDelete);
  document.getElementById('usAlbumDeleteUndo')?.addEventListener('click',undoMomentDelete);
  document.getElementById('usAlbumAddBtn')?.addEventListener('click',()=>document.getElementById('usAlbumFile')?.click());

  if(!document.getElementById('usAlbumFloatingAdd')){
    const floating=document.createElement('button');
    floating.type='button';
    floating.id='usAlbumFloatingAdd';
    floating.className='us-album-floating-add';
    floating.setAttribute('aria-label','Aggiungi una foto a questo ricordo');
    floating.innerHTML='<span><span class="us-icon" data-us-icon="plus" aria-hidden="true"></span></span><b>Aggiungi</b>';
    floating.addEventListener('click',()=>document.getElementById('usAlbumFile')?.click());
    // 1.0 parity: the add pill sits in the design's action row, before the bin.
    const acts=document.getElementById('usAlbumActs');
    if(acts)acts.insertBefore(floating,document.getElementById('usAlbumCurrentDelete'));
    else document.getElementById('usAlbumOverlay')?.appendChild(floating);
  }
  document.getElementById('usAlbumCancel')?.addEventListener('click',resetComposer);
  document.getElementById('usAlbumSave')?.addEventListener('click',saveAlbumPhoto);
  document.getElementById('usAlbumFile')?.addEventListener('change',handleFileSelected);
  document.getElementById('usAlbumGrid')?.addEventListener('click',handleGridClick);
  document.getElementById('usAlbumCarouselPrev')?.addEventListener('click',()=>showAlbumPhoto(albumCarouselIndex-1,-1));
  document.getElementById('usAlbumCarouselNext')?.addEventListener('click',()=>showAlbumPhoto(albumCarouselIndex+1,1));
  document.getElementById('usAlbumCurrentDelete')?.addEventListener('click',()=>{
    const row=lightboxItems[albumCarouselIndex];
    if(row?.id&&row?.own)deleteAlbumPhoto(row.id,row.storage_path);
  });
  document.getElementById('usAlbumSavePhoto')?.addEventListener('click',()=>savePhotoToPhone(albumCarouselIndex));
  document.getElementById('usAlbumLightboxSave')?.addEventListener('click',event=>{event.stopPropagation();savePhotoToPhone(lightboxIndex);});
  document.getElementById('usAlbumAsk')?.addEventListener('click',askPartnerPhotos);
  const carousel=document.getElementById('usAlbumCarousel');
  carousel?.addEventListener('touchstart',event=>{
    if(lightboxItems.length<2||event.target.closest('button')){albumCarouselTouch=null;return;}
    const touch=event.touches?.[0];
    albumCarouselTouch=touch?{x:touch.clientX,y:touch.clientY}:null;
  },{passive:true});
  carousel?.addEventListener('touchend',event=>{
    if(!albumCarouselTouch)return;
    const touch=event.changedTouches?.[0],start=albumCarouselTouch;
    albumCarouselTouch=null;
    if(!touch)return;
    const dx=touch.clientX-start.x,dy=touch.clientY-start.y;
    if(Math.abs(dx)>=45&&Math.abs(dx)>Math.abs(dy)*1.3){
      albumCarouselSuppressClickUntil=Date.now()+450;
      showAlbumPhoto(albumCarouselIndex+(dx<0?1:-1),dx<0?1:-1);
    }
  },{passive:true});
  carousel?.addEventListener('keydown',event=>{
    if(lightboxItems.length<2)return;
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){
      event.preventDefault();
      const step=event.key==='ArrowRight'?1:-1;
      showAlbumPhoto(albumCarouselIndex+step,step);
    }
  });
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
      if(dx<0)showLightbox(lightboxIndex+1,1);
      else showLightbox(lightboxIndex-1,-1);
    }
  },{passive:true});

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      if(document.getElementById('usAlbumLightbox')?.classList.contains('show'))closeLightbox();
      else if(document.getElementById('usAlbumOverlay')?.classList.contains('show'))closeAlbum();
    }else if(document.getElementById('usAlbumLightbox')?.classList.contains('show')){
      if(e.key==='ArrowRight')showLightbox(lightboxIndex+1,1);
      if(e.key==='ArrowLeft')showLightbox(lightboxIndex-1,-1);
    }
  });
}

async function decorateMomentCards(){
  if(!window.usProfile)return;
  const cards=[...document.querySelectorAll('#momentsGrid .moment-card[data-moment-id]')];
  if(!cards.length)return;
  const ids=cards.map(card=>card.dataset.momentId).filter(Boolean);
  const {data,error}=await sb.from('moment_photos').select('id,moment_id,created_by,storage_path,caption,position,created_at').in('moment_id',ids);
  if(error){console.warn('[US Albums] counts',error);return;}
  const photosByMoment=new Map();
  for(const row of data||[]){
    if(!photosByMoment.has(row.moment_id))photosByMoment.set(row.moment_id,[]);
    photosByMoment.get(row.moment_id).push(row);
  }
  for(const card of cards){
    card.querySelector('.moment-album-count')?.remove();
    const secondaryRows=photosByMoment.get(card.dataset.momentId)||[];
    const secondary=secondaryRows.length;
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
    // Inline timeline carousel, distinct from the fullscreen Album viewer.
    // Only metadata is read here; its secondary images are signed near
    // viewport or on swipe (no eagerly loading every original at page boot).
    window.UsRicordiInline?.decorate?.(card,secondaryRows);
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

// One path for every album photo: compressed like the cover, stored under the
// memory's album folder, then its moment_photos row (the file is removed again
// if the row is refused). R1 uses it for the photos picked after the cover.
async function uploadAlbumPhoto(momentId,file,{caption='',position=1,onStage}={}){
  if(!momentId||!file||!window.usProfile)throw new Error('ALBUM_NOT_READY');
  const compressor=window.compressImageFile;
  if(typeof compressor!=='function')throw new Error('COMPRESSION_UNAVAILABLE');
  const compressed=await compressor(file,{maxDimension:1920,quality:.82});
  const path=`${window.usProfile.couple_id}/${window.usProfile.id}/moment-albums/${momentId}/${Date.now()}-${crypto.randomUUID()}.webp`;
  onStage?.('upload');
  const {error:uploadError}=await sb.storage.from('us-media').upload(path,compressed,{contentType:'image/webp',upsert:false,cacheControl:'31536000'});
  if(uploadError)throw uploadError;
  const {error:rowError}=await sb.from('moment_photos').insert({
    moment_id:momentId,
    couple_id:window.usProfile.couple_id,
    created_by:window.usProfile.id,
    storage_path:path,
    caption:caption||null,
    position:Math.max(1,Number(position)||1)
  });
  if(rowError){await sb.storage.from('us-media').remove([path]);throw rowError;}
  return true;
}
window.UsMomentAlbums=Object.freeze({
  uploadPhoto:async(momentId,file,options)=>{
    try{return await uploadAlbumPhoto(momentId,file,options);}
    catch(error){console.warn('[US Albums] upload',error);return false;}
  }
});

async function saveAlbumPhoto(){
  if(albumUploadBusy||!pendingFile||!currentAlbum||!window.usProfile)return;
  const save=document.getElementById('usAlbumSave');
  const caption=document.getElementById('usAlbumCaption')?.value.trim()||'';
  albumUploadBusy=true;if(save){save.disabled=true;save.textContent='Ottimizzo…';}
  try{
    const maxPosition=albumRows.reduce((max,row)=>Math.max(max,Number(row.position)||0),0);
    await uploadAlbumPhoto(currentAlbum.id,pendingFile,{caption,position:maxPosition+1,onStage:()=>{if(save)save.textContent='Carico…';}});
    resetComposer();
    toast('Foto aggiunta al ricordo');
    selectNewestAlbumPhoto=true;
    await loadAlbum(currentAlbum.id);
    await decorateMomentCards();
  }catch(error){
    console.warn('[US Albums] upload',error);
    toast(error?.message==='SOURCE_TOO_LARGE'?'Foto troppo grande: massimo 20 MB':'Non riesco ad aggiungere la foto');
  }finally{
    albumUploadBusy=false;if(save){save.disabled=false;save.textContent='Aggiungi al ricordo';}
  }
}

async function loadAlbum(momentId){
  const seq=++albumLoadSeq;
  albumLoaded=false;
  paintDeleteControl();
  const grid=document.getElementById('usAlbumGrid');
  const status=document.getElementById('usAlbumCarouselStatus');
  if(status)status.hidden=true;
  if(grid)grid.innerHTML='<div class="us-album-empty">Carico…</div>';
  const [{data:rows,error},{data:profiles,error:profilesError}]=await Promise.all([
    sb.from('moment_photos').select('id,moment_id,created_by,storage_path,caption,position,created_at').eq('moment_id',momentId).order('position',{ascending:true}).order('created_at',{ascending:true}),
    sb.from('profiles').select('id,display_name').eq('couple_id',window.usProfile.couple_id)
  ]);
  if(seq!==albumLoadSeq)return;
  if(error){
    console.warn('[US Albums] load',error);
    if(grid)grid.innerHTML='<div class="us-album-empty">Non riesco a caricare le altre foto. Riprova tra poco.</div>';
    if(status){status.textContent='Non riesco a caricare le altre foto. Riapri il ricordo per riprovare.';status.hidden=false;}
    return;
  }
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
  albumLoaded=(rows||[]).length===hydrated.length;
  renderAlbum();
}

// M8A — dettaglio immersivo: data lunga, titolo (la nota, o il giorno),
// autori reali (chi l'ha creato + chi ha aggiunto foto) e provenienza.
function albumLongDate(){
  const iso=currentAlbum?.iso;
  const d=iso?new Date(iso+'T12:00:00'):null;
  return d&&!Number.isNaN(d.getTime())?d.toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),{weekday:'long',day:'numeric',month:'long',year:'numeric'}):(currentAlbum?.date||'');
}
function albumDayMonth(){
  const iso=currentAlbum?.iso;
  const d=iso?new Date(iso+'T12:00:00'):null;
  if(!d||Number.isNaN(d.getTime()))return currentAlbum?.date||'';
  const sameYear=d.getFullYear()===new Date().getFullYear();
  return d.toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'),sameYear?{day:'numeric',month:'long'}:{day:'numeric',month:'long',year:'numeric'});
}
function renderAlbumStory(){
  if(!currentAlbum)return;
  const longDate=albumLongDate();
  const provenance=document.getElementById('usAlbumProvenance');
  const title=document.getElementById('usAlbumTitle');
  const byline=document.getElementById('usAlbumByline');
  if(provenance)provenance.textContent=`Ricordo · ${longDate}`;
  if(title)title.textContent=currentAlbum.caption||longDate;
  const others=[...new Set(albumRows.map(row=>row.author).filter(name=>name&&name!==currentAlbum.author))];
  // 1.0 parity: under the title, as in the design, "3 settembre · di Francesco".
  if(byline){
    byline.textContent=`${albumDayMonth()} · di ${currentAlbum.author}${others.length?` · con foto di ${others.join(' e ')}`:''}`;
    byline.dataset.owner=currentAlbum.owner&&currentAlbum.owner===window.usProfile?.id?'tu':'partner';
  }
  // R4 — the album is for two: ask the other one for their photos of that day.
  const ask=document.getElementById('usAlbumAsk');
  const label=document.getElementById('usAlbumAskLabel');
  const name=partnerName();
  const canAsk=Boolean(name&&typeof window.UsLeftForYou?.openComposer==='function');
  if(label)label.textContent=canAsk?`Chiedi a ${name} le sue foto di quel giorno`:'';
  if(ask)ask.hidden=!canAsk;
}
function partnerName(){
  const name=window.UsIdentity?.current?.()?.partnerName||'';
  return name&&name!=='La tua persona'?name:'';
}
function uiText(text,vars){
  if(typeof window.usT==='function')return window.usT(text,vars);
  return String(text).replace(/\{([a-z]+)\}/gi,(all,key)=>vars?.[key]??all);
}
// The request leaves through Lasciato per te, written and sent by the person.
function askPartnerPhotos(){
  if(!currentAlbum||typeof window.UsLeftForYou?.openComposer!=='function')return;
  const when=albumLongDate();
  const text=currentAlbum.caption
    ?uiText('Hai delle foto di {when}? Aggiungile al nostro ricordo «{title}» in Ricordi ♡',{when,title:currentAlbum.caption})
    :uiText('Hai delle foto di {when}? Aggiungile al nostro ricordo in Ricordi ♡',{when});
  closeAlbum();
  window.UsLeftForYou.openComposer({kind:'text',text});
}

// R3 — "Salva sul telefono", one photo at a time, always the full photo.
// Android app: the WebView cannot save files and US has no file plugin, so the
// photo opens in the phone's browser as a download (Download folder).
// iPhone (app or Safari): the share sheet, where "Salva immagine" puts it in
// Foto. Web elsewhere: a normal download of the file.
let savingPhoto=false;
function photoFileName(index){
  const iso=/^\d{4}-\d{2}-\d{2}$/.test(currentAlbum?.iso||'')?currentAlbum.iso:new Date().toISOString().slice(0,10);
  return `US-ricordo-${iso}${index>0?`-${index+1}`:''}.webp`;
}
function nativePlatform(){
  const runtime=window.UsCapacitorRuntime||window.Capacitor;
  return window.UsPlatform?.isNative?String(runtime?.getPlatform?.()||''):'';
}
function isApplePhone(){
  const ua=String(navigator.userAgent||'');
  return nativePlatform()==='ios'||/iP(hone|ad|od)/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
}
function openOutside(url){
  const link=document.createElement('a');
  link.href=url;link.target='_blank';link.rel='noopener noreferrer';
  document.body.appendChild(link);link.click();link.remove();
}
async function savePhotoToPhone(index){
  const item=lightboxItems[index];
  const path=item?.storage_path||'';
  if(!path||savingPhoto)return;
  savingPhoto=true;
  const name=photoFileName(index);
  try{
    const native=nativePlatform();
    if(native==='android'){
      const {data,error}=await sb.storage.from('us-media').createSignedUrl(path,300,{download:name});
      if(error||!data?.signedUrl)throw error||new Error('download_url_unavailable');
      openOutside(data.signedUrl);
      toast('La foto si scarica nei Download del telefono');
      return;
    }
    const response=await fetch(item.url,{credentials:'omit'});
    if(!response.ok)throw new Error('photo_download_failed');
    const blob=await response.blob();
    const file=new File([blob],name,{type:blob.type||'image/webp'});
    if(isApplePhone()&&navigator.canShare?.({files:[file]})){
      try{await navigator.share({files:[file]});}
      catch(error){if(error?.name!=='AbortError')throw error;}
      return;
    }
    if(native){
      const {data,error}=await sb.storage.from('us-media').createSignedUrl(path,300,{download:name});
      if(error||!data?.signedUrl)throw error||new Error('download_url_unavailable');
      openOutside(data.signedUrl);
      return;
    }
    const href=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=href;link.download=name;link.rel='noopener';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(href),60000);
    toast('Foto salvata');
  }catch(error){
    console.warn('[US Albums] save photo',error);
    toast('Non riesco a salvare la foto. Riprova.');
  }finally{savingPhoto=false;}
}
function renderAlbum(){
  if(!currentAlbum)return;
  renderAlbumStory();
  const count=albumRows.length+1;
  document.getElementById('usAlbumCount').textContent=count===1?'1 foto':`${count} foto`;
  const grid=document.getElementById('usAlbumGrid');
  // Keep the old mount for the composer and for existing hook compatibility.
  // Photo cards are no longer duplicated in a second grid below the hero.
  if(grid)grid.replaceChildren();
  lightboxItems=[
    {url:currentAlbum.url,author:currentAlbum.author,caption:currentAlbum.caption||'',date:currentAlbum.date||'',cover:true,storage_path:currentAlbum.path||''},
    ...albumRows
  ];
  if(selectNewestAlbumPhoto){
    albumCarouselIndex=lightboxItems.length-1;
    selectNewestAlbumPhoto=false;
  }
  showAlbumPhoto(Math.min(albumCarouselIndex,lightboxItems.length-1));
  paintDeleteControl();
}

// 1.0 parity (the design's Galleria): the photo on screen fades out in 160ms,
// the next one fades in over 260ms. A still copy of the old photo fades on top
// while the album already shows the new one, so state stays synchronous.
// The old photo stays on top until the new one is decoded, so a photo that is
// still downloading never shows as an empty frame.
let albumFadeToken=0;
function albumPhotoFade(cover,previousSrc){
  if(typeof cover.animate!=='function')return;
  const token=++albumFadeToken;
  cover.getAnimations?.().forEach(a=>a.cancel());
  document.querySelectorAll('.us-album-fade-ghost').forEach(n=>n.remove());
  let ghost=null;
  if(previousSrc&&cover.parentNode){
    ghost=document.createElement('img');
    ghost.className='us-album-fade-ghost';ghost.alt='';ghost.setAttribute('aria-hidden','true');ghost.src=previousSrc;
    cover.parentNode.insertBefore(ghost,cover.nextSibling);
  }
  const ready=typeof cover.decode==='function'
    ?Promise.race([cover.decode().catch(()=>{}),new Promise(r=>setTimeout(r,2500))])
    :Promise.resolve();
  ready.then(()=>{
    if(token!==albumFadeToken)return;
    if(ghost)ghost.animate([{opacity:1},{opacity:0}],{duration:160,fill:'forwards'}).finished.then(()=>ghost.remove(),()=>ghost.remove());
    cover.animate([{opacity:0},{opacity:0,offset:.38},{opacity:1}],{duration:420});
  });
}
// Single-image viewer is unchanged; multi-photo Memories rotate inside the
// existing album hero. Only this image and a lazy adjacent peek need decoding.
function showAlbumPhoto(index,direction=0){
  if(!lightboxItems.length)return;
  albumCarouselIndex=(index+lightboxItems.length)%lightboxItems.length;
  const item=lightboxItems[albumCarouselIndex];
  const cover=document.getElementById('usAlbumCover');
  const peek=document.getElementById('usAlbumPeek');
  const stage=document.getElementById('usAlbumCarousel');
  const multiple=lightboxItems.length>1;
  if(stage)stage.dataset.multiple=String(multiple);
  if(cover){
    const previousSrc=cover.currentSrc||cover.getAttribute('src')||'';
    const changed=cover.getAttribute('src')!==item.url;
    cover.src=item.url;
    if(item.storage_path)cover.setAttribute('data-us-media-path',item.storage_path);
    else cover.removeAttribute('data-us-media-path');
    cover.alt=`Foto ${albumCarouselIndex+1} di ${lightboxItems.length} del ricordo`;
    cover.classList.remove('us-ricordi-next','us-ricordi-prev');
    if(changed&&direction&&!window.UsUiFoundation?.isReducedMotion?.())albumPhotoFade(cover,previousSrc);
  }
  // R11 — the peek stays empty: the next full photo is fetched only when shown.
  if(peek){peek.hidden=true;peek.removeAttribute('src');}
  for(const id of ['usAlbumCarouselPrev','usAlbumCarouselNext','usAlbumCarouselCounter','usAlbumCarouselHint']){
    const node=document.getElementById(id);
    if(!node)continue;
    node.hidden=!multiple;
    if(id==='usAlbumCarouselCounter')node.textContent=`${albumCarouselIndex+1} di ${lightboxItems.length}`;
  }
  const note=document.getElementById('usAlbumCoverNote');
  const caption=document.getElementById('usAlbumCoverCaption');
  const author=document.getElementById('usAlbumCoverAuthor');
  // R4 — every photo of an album says who added it, with its note when there is
  // one (the cover's note is already the title above; a single photo is already
  // signed by the byline).
  const ownNote=item.cover?'':(item.caption||'');
  if(caption){caption.textContent=ownNote;caption.hidden=!ownNote;}
  if(author)author.textContent=`Aggiunto da ${item.author||'Noi'}`;
  if(note)note.hidden=!(multiple||ownNote);
  const del=document.getElementById('usAlbumCurrentDelete');
  if(del)del.hidden=!(albumCarouselIndex>0&&item.own&&item.id);
  const save=document.getElementById('usAlbumSavePhoto');
  if(save)save.hidden=!item.storage_path;
}

// ===== Ricordi · Elimina → conferma → Eliminato · Annulla =====
// R2 — only who created a memory can delete it, and only after a confirm that
// says it disappears for both of you, with every photo in its album. Then the
// in-place grace period (Annulla) still applies. Whole-memory deletion is done
// by the authenticated delete-moment Edge Function, which also cleans the media.
function canDeleteCurrentAlbum(){
  return Boolean(currentAlbum&&window.usProfile?.couple_id&&albumLoaded&&currentAlbum.owner&&currentAlbum.owner===window.usProfile.id);
}
function momentCardById(id){
  return [...document.querySelectorAll('#momentsGrid .moment-card[data-moment-id]')].find(card=>card.dataset.momentId===id)||null;
}
function paintDeleteControl(){
  const control=document.getElementById('usAlbumDelete');
  if(!control)return;
  const pendingHere=Boolean(pendingDelete&&currentAlbum&&pendingDelete.id===currentAlbum.id);
  control.hidden=!(pendingHere||canDeleteCurrentAlbum());
  control.dataset.state=pendingHere?(pendingDelete.committing?'committing':'done'):'idle';
  const undo=document.getElementById('usAlbumDeleteUndo');
  const go=document.getElementById('usAlbumDeleteGo');
  if(undo){undo.tabIndex=pendingHere?0:-1;undo.disabled=Boolean(pendingDelete?.committing);}
  if(go)go.tabIndex=pendingHere?-1:0;
  document.getElementById('usAlbumOverlay')?.classList.toggle('is-pending-delete',pendingHere);
}
function setMomentCardHidden(id,hidden){
  const card=momentCardById(id);
  if(card)card.classList.toggle('is-pending-delete',hidden);
}
async function commitPendingDelete(){
  const job=pendingDelete;
  if(!job||job.committing)return;
  clearTimeout(job.timer);
  job.committing=true;
  paintDeleteControl();
  let ok=false;
  try{ok=typeof window.usCommitMomentDeletion==='function'&&await window.usCommitMomentDeletion(job.id);}
  catch(error){console.warn('[US Albums] delete commit',error);}
  if(pendingDelete===job)pendingDelete=null;
  if(ok){
    if(currentAlbum?.id===job.id&&document.getElementById('usAlbumOverlay')?.classList.contains('show'))closeAlbum();
    else paintDeleteControl();
    return;
  }
  setMomentCardHidden(job.id,false);
  paintDeleteControl();
  toast('Non riesco a eliminare il ricordo. Riprova.');
}
let confirmingDelete=false;
async function startMomentDelete(){
  if(!canDeleteCurrentAlbum()||pendingDelete?.id===currentAlbum.id||confirmingDelete)return;
  const id=currentAlbum.id;
  confirmingDelete=true;
  let confirmed=false;
  try{
    confirmed=await usConfirm({title:'Eliminare questo ricordo?',body:'Sparisce per tutti e due, con tutte le foto del suo album.',confirmLabel:'Elimina',tone:'danger',icon:'trash'});
  }finally{confirmingDelete=false;}
  if(!confirmed||currentAlbum?.id!==id||!canDeleteCurrentAlbum()||pendingDelete?.id===id)return;
  // A second Moment deleted inside another's grace commits the first now.
  if(pendingDelete&&!pendingDelete.committing)commitPendingDelete();
  const job={id:currentAlbum.id,committing:false,timer:0};
  job.timer=setTimeout(commitPendingDelete,DELETE_GRACE_MS);
  pendingDelete=job;
  setMomentCardHidden(job.id,true);
  paintDeleteControl();
  window.UsFeedback?.action?.();
  document.getElementById('usAlbumDeleteUndo')?.focus({preventScroll:true});
}
function undoMomentDelete(){
  const job=pendingDelete;
  if(!job||job.committing)return;
  clearTimeout(job.timer);
  pendingDelete=null;
  setMomentCardHidden(job.id,false);
  paintDeleteControl();
  document.getElementById('usAlbumDeleteGo')?.focus({preventScroll:true});
}
window.USRicordiDelete=Object.freeze({
  start:startMomentDelete,
  undo:undoMomentDelete,
  commitNow:commitPendingDelete,
  pending:()=>pendingDelete?{id:pendingDelete.id,committing:pendingDelete.committing}:null,
  graceMs:DELETE_GRACE_MS
});

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
  if(!(await usConfirm({title:'Eliminare questa foto dal ricordo?',body:'Sparirà per entrambi.',confirmLabel:'Elimina',tone:'danger',icon:'trash'})))return;
  const {error:rowError}=await sb.from('moment_photos').delete().eq('id',id).eq('created_by',window.usProfile.id);
  if(rowError){console.warn('[US Albums] delete row',rowError);toast('Non riesco a eliminare la foto');return;}
  const {error:storageError}=await sb.storage.from('us-media').remove([path]);
  if(storageError)console.warn('[US Albums] storage cleanup',storageError);
  toast('Foto eliminata');
  await loadAlbum(currentAlbum.id);
  await decorateMomentCards();
}

// ===== Galleria: the photo opens from where you tapped it and returns there =====
// Presentation only (Web Animations), as the design's UP.galleria: the photo
// grows from the tapped thumbnail to the whole screen in 560ms (io curve, 20px
// corners to 0) while the night fades in over 420ms; the shade, the words and
// the controls rise 18px over 420ms after 380ms. Closing: chrome out in 150ms,
// the photo flies back in 480ms. The design animates left/top/width/height;
// here the same geometry is sampled into transform keyframes (a clipping frame
// scaled to the box, the photo counter-scaled so it stays "cover"), so the
// flight runs on the compositor and never lays out the page.
// Reduced motion, or a card that is no longer on screen: a plain fade.
const GALLERIA_EASE='cubic-bezier(.7,0,.2,1)',GALLERIA_OUT='cubic-bezier(.2,.8,.2,1)';
const GALLERIA_STEPS=30;
let galleriaSource=null;
let galleriaLeaving=null;
let galleriaLanding=null;
let galleriaBox=null;
function galleriaReduced(){
  return Boolean(window.UsUiFoundation?.isReducedMotion?.()||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}
function galleriaThumb(card){
  return card?.querySelector?.('.ricordi-inline-current')||card?.querySelector?.('img')||card||null;
}
function galleriaRect(el){
  if(!el?.isConnected||typeof el.getBoundingClientRect!=='function')return null;
  const r=el.getBoundingClientRect();
  const vw=window.innerWidth||document.documentElement.clientWidth||0;
  const vh=window.innerHeight||document.documentElement.clientHeight||0;
  if(!r.width||!r.height||r.bottom<=0||r.top>=vh||r.right<=0||r.left>=vw)return null;
  return {left:r.left,top:r.top,width:r.width,height:r.height};
}
// cubic-bezier(x1,y1,x2,y2) as a function of progress, for sampling keyframes.
function galleriaCurve(x1,y1,x2,y2){
  const cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;
  const X=t=>((ax*t+bx)*t+cx)*t,Y=t=>((ay*t+by)*t+cy)*t;
  return x=>{
    if(x<=0)return 0;if(x>=1)return 1;
    let lo=0,hi=1,t=x;
    for(let i=0;i<40;i++){const v=X(t);if(Math.abs(v-x)<1e-6)break;if(v<x)lo=t;else hi=t;t=(lo+hi)/2;}
    return Y(t);
  };
}
const galleriaIo=galleriaCurve(.7,0,.2,1);
// The flying photo: a frame the size of the landing box, clipped with round
// corners, holding the photo laid out as "cover" for that box.
function galleriaFlight(src,natural,box,parent){
  if(!src||!box?.width||!box?.height)return null;
  const frame=document.createElement('div');
  frame.className='us-galleria-ghost';
  frame.setAttribute('aria-hidden','true');
  const img=document.createElement('img');
  img.alt='';img.decoding='sync';img.src=src;
  const iw=natural?.width||box.width,ih=natural?.height||box.height;
  const fit=Math.max(box.width/iw,box.height/ih);
  const w=iw*fit,h=ih*fit;
  Object.assign(frame.style,{left:`${box.left}px`,top:`${box.top}px`,width:`${box.width}px`,height:`${box.height}px`});
  Object.assign(img.style,{left:`${(box.width-w)/2}px`,top:`${(box.height-h)/2}px`,width:`${w}px`,height:`${h}px`});
  frame.appendChild(img);
  parent.appendChild(frame);
  return {frame,img,box,iw,ih,fit};
}
// Sampled keyframes from rect a (radius ra) to rect b (radius rb), eased.
function galleriaFly(flight,a,b,ra,rb,duration){
  const {frame,img,box,iw,ih,fit}=flight;
  const move=[],zoom=[],round=[];
  for(let k=0;k<=GALLERIA_STEPS;k++){
    const offset=k/GALLERIA_STEPS,e=galleriaIo(offset);
    const l=a.left+(b.left-a.left)*e,t=a.top+(b.top-a.top)*e;
    const w=a.width+(b.width-a.width)*e,h=a.height+(b.height-a.height)*e;
    const r=ra+(rb-ra)*e;
    const sx=w/box.width,sy=h/box.height;
    const c=Math.max(w/iw,h/ih)/fit;
    move.push({offset,transform:`translate(${(l-box.left).toFixed(2)}px,${(t-box.top).toFixed(2)}px) scale(${sx.toFixed(5)},${sy.toFixed(5)})`});
    zoom.push({offset,transform:`scale(${(c/sx).toFixed(5)},${(c/sy).toFixed(5)})`});
    round.push({offset,borderRadius:`${(r/sx).toFixed(2)}px / ${(r/sy).toFixed(2)}px`});
  }
  const opts={duration,easing:'linear',fill:'forwards'};
  const main=frame.animate(move,opts);
  return [main,img.animate(zoom,opts),frame.animate(round,opts)];
}
function galleriaNatural(img){
  return img?.naturalWidth&&img?.naturalHeight?{width:img.naturalWidth,height:img.naturalHeight}:null;
}
// Where the photo lands: the full-bleed stage at the top of the Galleria.
function galleriaStageBox(){
  const vw=window.innerWidth||document.documentElement.clientWidth||0;
  const css=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--us-viewport-height'));
  const vh=css>0?css:(window.innerHeight||document.documentElement.clientHeight||0);
  return {left:0,top:0,width:vw,height:vh};
}
function galleriaChrome(overlay){
  // Story, info and photo actions are display:contents in the Galleria: their
  // children are what is drawn, so those are what rise and fade.
  return [...overlay.querySelectorAll('.us-album-close,.us-album-save-photo,.us-album-story>*,.us-album-info>:not(.us-album-photo-actions),.us-album-carousel-counter,.us-album-acts')];
}
function galleriaFade(overlay){
  overlay.animate([{opacity:0},{opacity:1}],{duration:galleriaReduced()?180:260,easing:'linear'});
}
// from: the thumbnail's box, read before the Galleria was shown.
function galleriaEnter(overlay,card,from,natural,box,onLand){
  galleriaSource=card||null;
  galleriaLanding?.(true);
  if(!overlay||typeof overlay.animate!=='function'){onLand?.();return;}
  const cover=document.getElementById('usAlbumCover');
  const stage=document.getElementById('usAlbumCarousel');
  const thumb=galleriaThumb(card);
  const src=thumb?.currentSrc||thumb?.src||'';
  const to=from?(box||galleriaStageBox()):null;
  galleriaBox=to;
  if(!from||!to?.width||!to?.height||!src){galleriaFade(overlay);onLand?.();return;}
  // The photo flies inside the Galleria, under its shade, words and controls.
  const flight=galleriaFlight(src,natural,to,overlay);
  if(!flight){galleriaFade(overlay);onLand?.();return;}
  if(cover)cover.style.visibility='hidden';
  overlay.classList.add('is-galleria-flying');
  const rise=[{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'none'}];
  for(const el of galleriaChrome(overlay))el.animate(rise,{duration:420,delay:380,easing:GALLERIA_OUT,fill:'backwards'});
  try{stage?.animate([{opacity:0},{opacity:1}],{duration:420,delay:380,easing:GALLERIA_OUT,fill:'backwards',pseudoElement:'::after'});}catch(_e){}
  const started=performance.now();
  const anims=galleriaFly(flight,from,to,20,0,560);
  // The flown copy stays on screen until the full photo underneath is decoded,
  // so the landing never shows an empty or half-loaded frame.
  let done=false;
  const land=(aborted=false)=>{
    if(done)return;done=true;
    if(galleriaLanding===land)galleriaLanding=null;
    if(cover)cover.style.visibility='';
    overlay.classList.remove('is-galleria-flying');
    flight.frame.remove();
    anims.forEach(a=>{try{a.cancel();}catch(_e){}});
    // Bookkeeping after the words have risen too (380+420ms): the restyle
    // then lands on a still screen.
    if(aborted!==true&&onLand){
      const wait=820-(performance.now()-started);
      if(wait>0)setTimeout(onLand,wait);else onLand();
    }
  };
  galleriaLanding=land;
  const ready=cover&&typeof cover.decode==='function'
    ?Promise.race([cover.decode().catch(()=>{}),new Promise(r=>setTimeout(r,6000))])
    :Promise.resolve();
  Promise.all([anims[0].finished.catch(()=>{}),ready]).then(()=>land(),()=>land());
}
// Returns true once it owns the close: finalize runs when the photo is back.
function galleriaLeave(overlay,finalize){
  if(galleriaLeaving)return true;
  if(!overlay.classList.contains('show')||typeof overlay.animate!=='function'){galleriaLanding?.(true);finalize();return true;}
  const reduced=galleriaReduced();
  const cover=document.getElementById('usAlbumCover');
  const landing=Boolean(galleriaLanding);
  const flying=overlay.querySelector(':scope>.us-galleria-ghost img');
  const target=reduced?null:galleriaRect(galleriaThumb(galleriaSource));
  // The landing box read at open (no style read here unless the screen turned).
  const from=galleriaBox&&galleriaBox.width===(window.innerWidth||0)?galleriaBox:galleriaStageBox();
  // Still landing (or the full photo not ready yet): the copy that flew in flies back.
  const src=landing?(flying?.currentSrc||flying?.getAttribute('src')||''):(cover?.currentSrc||cover?.getAttribute('src')||'');
  const natural=landing?galleriaNatural(flying):galleriaNatural(cover);
  galleriaLanding?.(true);
  const anims=[];
  let flight=null,timer=null;
  const job={finish:()=>{
    if(galleriaLeaving!==job)return;
    galleriaLeaving=null;
    clearTimeout(timer);
    flight?.frame.remove();
    if(cover)cover.style.visibility='';
    overlay.style.pointerEvents='';
    finalize();
    anims.forEach(a=>{try{a.cancel();}catch(_e){}});
    galleriaSource=null;
  }};
  galleriaLeaving=job;
  overlay.style.pointerEvents='none';
  if(target&&from.width&&src)flight=galleriaFlight(src,natural,from,document.body);
  if(flight){
    // The copy flies above the Galleria; the photo under it is hidden only
    // once the copy is painted, so the first frame never shows a hole.
    const hideCover=()=>requestAnimationFrame(()=>{if(galleriaLeaving===job&&cover)cover.style.visibility='hidden';});
    if(typeof flight.img.decode==='function')flight.img.decode().then(hideCover,hideCover);else hideCover();
    for(const el of galleriaChrome(overlay))anims.push(el.animate([{opacity:1},{opacity:0}],{duration:150,fill:'forwards'}));
    anims.push(overlay.animate([{opacity:1},{opacity:0}],{duration:420,easing:'linear',fill:'forwards'}));
    const back=galleriaFly(flight,from,target,0,20,480);
    anims.push(...back);
    back[0].finished.then(job.finish,job.finish);
    timer=setTimeout(job.finish,900);
  }else{
    const fade=overlay.animate([{opacity:1},{opacity:0}],{duration:reduced?180:240,easing:'linear',fill:'forwards'});
    anims.push(fade);
    fade.finished.then(job.finish,job.finish);
    timer=setTimeout(job.finish,500);
  }
  return true;
}

async function openAlbum(card,{focusDelete=false}={}){
  ensureUi();
  // A tap during the way back lands the previous close at once.
  galleriaLeaving?.finish();
  const id=card?.dataset?.momentId;
  if(!id){legacyOpenMomentViewer?.(card);return;}
  // Read the thumbnail before anything changes: no forced layout of the album.
  galleriaLanding?.(true);
  const thumb=galleriaThumb(card);
  const from=galleriaReduced()?null:galleriaRect(thumb);
  const natural=galleriaNatural(thumb);
  const stageBox=from?galleriaStageBox():null;
  // The photo the card is showing (its inline carousel may be past the cover).
  const inline=window.UsRicordiInline?.current?.(card);
  const startAt=inline&&inline.index>0&&inline.url?inline:null;
  const scroll=document.getElementById('usAlbumScroll');if(scroll&&scroll.scrollTop)scroll.scrollTop=0;
  currentAlbum={
    id,
    url:card.dataset.url||'',
    author:card.dataset.author||'Noi',
    date:card.dataset.date||'',
    iso:card.dataset.momentIso||'',
    owner:card.dataset.momentOwner||'',
    path:card.dataset.storagePath||'',
    caption:card.dataset.caption||''
  };
  albumRows=[];albumLoaded=false;albumCarouselIndex=0;selectNewestAlbumPhoto=false;albumCarouselTouch=null;resetComposer();
  const overlay=document.getElementById('usAlbumOverlay');
  const cover=document.getElementById('usAlbumCover');
  const addBtn=document.getElementById('usAlbumAddBtn');
  if(addBtn){addBtn.hidden=false;addBtn.disabled=false;}
  if(cover){
    cover.src=startAt?startAt.url:currentAlbum.url;
    cover.onclick=()=>{if(Date.now()>=albumCarouselSuppressClickUntil)openLightbox(albumCarouselIndex);};
    cover.onkeydown=event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();openLightbox(albumCarouselIndex);}
    };
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
  renderAlbumStory();
  overlay?.classList.add('show');
  // The modal bookkeeping (background inert, focus, page scroll lock) restyles
  // the whole page: it waits until the photo has landed, so the first frame of
  // the flight is not held back by it.
  const settle=()=>{
    if(!overlay?.classList.contains('show')||currentAlbum?.id!==id)return;
    overlay.setAttribute('aria-hidden','false');
    document.body.classList.add('us-album-open');
  };
  lightboxItems=startAt
    ?[{id:startAt.id,url:startAt.url,author:startAt.author,caption:startAt.caption||'',storage_path:startAt.path||''}]
    :[{url:currentAlbum.url,author:currentAlbum.author,caption:currentAlbum.caption,cover:true,storage_path:currentAlbum.path}];
  showAlbumPhoto(0);
  if(startAt)albumCarouselIndex=startAt.index;
  galleriaEnter(overlay,card,from,natural,stageBox,settle);
  window.UsRicordiNew?.markOpened?.(id);
  await loadAlbum(id);
  if(focusDelete&&currentAlbum?.id===id){
    const control=document.getElementById('usAlbumDelete');
    if(control&&!control.hidden){
      control.scrollIntoView({block:'center',behavior:'smooth'});
      document.getElementById('usAlbumDeleteGo')?.focus({preventScroll:true});
    }
  }
}
window.refreshOpenMomentAlbum=function(){
  if(currentAlbum?.id&&document.getElementById('usAlbumOverlay')?.classList.contains('show'))return loadAlbum(currentAlbum.id);
  return Promise.resolve();
};
function closeAlbum(){
  const overlay=document.getElementById('usAlbumOverlay');
  if(!overlay)return;
  const finalize=()=>{
    ++albumLoadSeq;resetComposer();
    overlay.classList.remove('show');overlay.setAttribute('aria-hidden','true');
    document.body.classList.remove('us-album-open');
    currentAlbum=null;albumRows=[];albumLoaded=false;albumCarouselTouch=null;
    paintDeleteControl();
  };
  closeLightbox();
  if(overlay.hasAttribute?.('data-us-galleria')&&galleriaLeave(overlay,finalize))return;
  if(window.UsUiFoundation?.exitSurface)window.UsUiFoundation.exitSurface(overlay,finalize);else finalize();
}
function openLightbox(index=0){
  if(!lightboxItems.length)return;
  ensureUi();
  const lb=document.getElementById('usAlbumLightbox');
  window.UsUiFoundation?.cancelSurfaceExit?.(lb);
  lb?.classList.add('show');lb?.setAttribute('aria-hidden','false');
  showLightbox(index);
}
function loadDecodedPhoto(url){
  return new Promise(resolve=>{
    if(!url){resolve(null);return;}
    const image=new Image();
    image.onload=async()=>{
      try{if(typeof image.decode==='function')await image.decode();}catch(_e){}
      resolve(url);
    };
    image.onerror=()=>resolve(null);
    image.src=url;
  });
}
function settleLightboxFrame(current,next){
  current?.removeAttribute('src');
  current?.classList.remove('active','us-lightbox-exit-next','us-lightbox-exit-prev');
  next?.classList.remove('us-lightbox-enter-next','us-lightbox-enter-prev');
}
function cancelLightboxSettle(){
  lightboxSettleCancel?.();lightboxSettleCancel=null;
}
function normalizeLightboxFrames(){
  const active=document.getElementById(`usAlbumLightboxImg${lightboxActiveLayer}`);
  const inactive=document.getElementById(`usAlbumLightboxImg${lightboxActiveLayer==='A'?'B':'A'}`);
  active?.classList.remove('is-preparing','us-lightbox-enter-next','us-lightbox-enter-prev','us-lightbox-exit-next','us-lightbox-exit-prev');
  active?.classList.add('active');
  inactive?.classList.remove('active','is-preparing','us-lightbox-enter-next','us-lightbox-enter-prev','us-lightbox-exit-next','us-lightbox-exit-prev');
  inactive?.removeAttribute('src');
}
async function showLightbox(index,direction=0){
  if(!lightboxItems.length)return;
  const nextIndex=(index+lightboxItems.length)%lightboxItems.length;
  const item=lightboxItems[nextIndex];
  const token=++lightboxRenderToken;
  cancelLightboxSettle();normalizeLightboxFrames();
  const url=await loadDecodedPhoto(item.url||'');
  const lb=document.getElementById('usAlbumLightbox');
  if(token!==lightboxRenderToken||!url||!lb?.classList.contains('show'))return;
  const current=document.getElementById(`usAlbumLightboxImg${lightboxActiveLayer}`);
  const nextKey=lightboxActiveLayer==='A'?'B':'A';
  const next=document.getElementById(`usAlbumLightboxImg${nextKey}`);
  if(!current||!next)return;
  lightboxIndex=nextIndex;
  next.src=url;
  document.getElementById('usAlbumLightboxCount').textContent=`${lightboxIndex+1} / ${lightboxItems.length}`;
  document.getElementById('usAlbumLightboxAuthor').textContent=item.author||'Noi';
  document.getElementById('usAlbumLightboxCaption').textContent=item.caption||'';
  const reduced=window.UsUiFoundation?.isReducedMotion?.();
  if(!current.getAttribute('src')||!direction||reduced){
    current.classList.remove('active','us-lightbox-exit-next','us-lightbox-exit-prev');
    next.classList.add('active');
    lightboxActiveLayer=nextKey;
    if(current!==next)current.removeAttribute('src');
    return;
  }
  const side=direction>0?'next':'prev';
  next.classList.add(`us-lightbox-enter-${side}`,'is-preparing');
  requestAnimationFrame(()=>{
    if(token!==lightboxRenderToken)return;
    next.classList.remove('is-preparing');next.classList.add('active');
    current.classList.add(`us-lightbox-exit-${side}`);
  });
  let settled=false;
  let fallback=null;
  const cancel=()=>{
    if(fallback)clearTimeout(fallback);
    current.removeEventListener('transitionend',onEnd);
  };
  const finish=()=>{
    if(settled||token!==lightboxRenderToken)return;
    settled=true;
    cancel();
    if(lightboxSettleCancel===cancel)lightboxSettleCancel=null;
    settleLightboxFrame(current,next);
  };
  const onEnd=event=>{if(event.target===current&&event.propertyName==='transform')finish();};
  current.addEventListener('transitionend',onEnd);
  fallback=setTimeout(finish,600);
  lightboxSettleCancel=cancel;
  lightboxActiveLayer=nextKey;
}
function closeLightbox(){
  const lb=document.getElementById('usAlbumLightbox');
  if(!lb?.classList.contains('show'))return;
  ++lightboxRenderToken;
  cancelLightboxSettle();
  const finalize=()=>{
    lb.classList.remove('show');lb.setAttribute('aria-hidden','true');
    ['A','B'].forEach(key=>{
      const img=document.getElementById(`usAlbumLightboxImg${key}`);
      img?.removeAttribute('src');img?.classList.remove('active','is-preparing','us-lightbox-enter-next','us-lightbox-enter-prev','us-lightbox-exit-next','us-lightbox-exit-prev');
    });
    document.getElementById('usAlbumLightboxImgA')?.classList.add('active');
    lightboxActiveLayer='A';
  };
  if(window.UsUiFoundation?.exitSurface)window.UsUiFoundation.exitSurface(lb,finalize);else finalize();
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
      // Arrow button clicks belong to the inline card carousel, never the
      // fullscreen album. Suppress synthesized clicks after touch swipes.
      if(event.target.closest('[data-ricordi-inline-step]'))return;
      if(window.UsRicordiInline?.shouldSuppressOpen?.(event.target)){
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if(event.target.closest('.moment-delete'))return;
      const card=event.target.closest('.moment-card[data-moment-id]');
      if(!card)return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openAlbum(card);
    },true);
    grid.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      if(event.target.closest('[data-ricordi-inline-step]'))return;
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
    window.UsUiFoundation?.cancelSurfaceExit?.(overlay);
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('us-moment-compose-open');
  }

  function closeComposer() {
    const overlay = document.getElementById('usMomentComposeOverlay');
    if (!overlay) return;
    const finalize = () => {
      overlay.classList.remove('show');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('us-moment-compose-open');
    };
    if (window.UsUiFoundation?.exitSurface) window.UsUiFoundation.exitSurface(overlay, finalize); else finalize();
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
        <h2>Ricordi</h2>
        <p>La vostra storia, foto dopo foto.</p>
      </div>
      <div class="us-moments-head-actions">
        <span class="us-moments-total" id="usMomentsTotal"></span>
        <button type="button" class="us-moments-add" id="usMomentsAdd" aria-label="Aggiungi un ricordo"><span class="us-icon" data-us-icon="plus" aria-hidden="true"></span></button>
      </div>
    `;
    section.insertBefore(head, originalTitle.nextSibling);

    const overlay = document.createElement('div');
    overlay.className = 'us-moment-compose-overlay';
    overlay.id = 'usMomentComposeOverlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('data-us-modal', '');
    overlay.setAttribute('data-us-motion-surface', '');
    overlay.innerHTML = `
      <div class="us-moment-compose-backdrop us-modal-backdrop" id="usMomentComposeBackdrop"></div>
      <section class="us-moment-compose-sheet us-sheet is-bottom" role="dialog" aria-modal="true" aria-label="Aggiungi un ricordo" data-us-modal-panel>
        <div class="us-moment-compose-grabber"></div>
        <div class="us-moment-compose-title">
          <div><small class="tiny us-moment-compose-kicker">Ricordi</small><b>Aggiungi un ricordo</b></div>
          <button type="button" class="us-moment-compose-close us-modal-close" id="usMomentComposeClose" aria-label="Chiudi" data-us-modal-close><span class="us-icon" data-us-icon="x" aria-hidden="true"></span></button>
        </div>
        <div id="usMomentComposeMount"></div>
      </section>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#usMomentComposeMount')?.appendChild(compose);

    // R1 — "+" opens the phone's gallery right away (several photos at once);
    // the sheet appears once photos are picked. With photos already waiting,
    // it reopens the sheet instead.
    const pick = ({ caption, source } = {}) => {
      if (compose.classList.contains('has-photo') && !source) { openComposer(); return; }
      const input = document.getElementById('momentCaption');
      if (input && caption && !input.value.trim()) input.value = String(caption).slice(0, 180);
      window.UsRicordiCompose?.setSource?.(source || null);
      window.pickMomentPhoto?.();
    };
    document.getElementById('usMomentsAdd')?.addEventListener('click', () => pick());
    // M7D — entry point for the Da vivere "Aggiungi un ricordo" bridge: the
    // same composer, a suggested note only if the field is still empty. The
    // couple still picks the photo; nothing is created automatically.
    window.UsMomentComposer = Object.freeze({
      open({ caption } = {}) {
        const input = document.getElementById('momentCaption');
        if (input && caption && !input.value.trim()) input.value = String(caption).slice(0, 180);
        openComposer();
      },
      // Straight to the gallery (call it from a tap). source: { kind:
      // 'da_vivere'|'shared_event_completion', ref, date } links the new
      // memory to that lived thing (R6).
      pick,
      show: openComposer,
    });
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
    tile.innerHTML = '<span><span class="us-icon" data-us-icon="plus" aria-hidden="true"></span></span> Aggiungi un altro pezzo di questo giorno';
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
    if (kicker) kicker.textContent = 'DENTRO QUESTO RICORDO';

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

/* ============================================================
   US · Conservati Surface (M5J)
   Read-only view over Conserva contributions and their original sources.
   ============================================================ */
(() => {
  'use strict';
  if (window.__usConservatiSurfaceInstalled) return;
  window.__usConservatiSurfaceInstalled = true;

  const PRIVATE_MEDIA_KINDS = new Set(['photo', 'audio', 'video']);
  const SUPPORTED_KINDS = new Set(['text', 'photo', 'audio', 'video', 'music']);
  let conservatiEntries = [];
  let conservatiRequestId = 0;

  function root() { return document.getElementById('conservatiOverlay'); }
  function setVisible(id, visible) { const el = document.getElementById(id); if (el) el.hidden = !visible; }
  function escapeConservati(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function showConservatiState(state) {
    setVisible('conservatiLoading', state === 'loading');
    setVisible('conservatiEmpty', state === 'empty');
    setVisible('conservatiError', state === 'error');
    setVisible('conservatiList', state === 'list');
    setVisible('conservatiDetail', state === 'detail');
  }

  function releaseConservatiDetailMedia() {
    const detail = document.getElementById('conservatiDetail');
    for (const media of detail?.querySelectorAll?.('audio, video') || []) {
      try { media.pause?.(); } catch (_) {}
      try { media.removeAttribute?.('src'); } catch (_) {}
      for (const source of media.querySelectorAll?.('source') || []) {
        try { source.removeAttribute?.('src'); } catch (_) {}
      }
      try { media.load?.(); } catch (_) {}
    }
  }

  // 1.0 parity: short, as in the design ("12 ott"); the year only when it is another one.
  function formatConservatiDate(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'Data non disponibile';
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString((globalThis.UsI18n?.tag||'it-IT'), sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
  }
  const CONSERVATI_ICON = { text: 'list-bullets', photo: 'image', music: 'music-note', video: 'video-camera', audio: 'microphone' };
  function setConservatiHead(kicker, title) {
    const k = document.getElementById('conservatiKicker');
    const t = document.getElementById('conservatiTitle');
    if (k) k.textContent = kicker;
    if (t) t.textContent = title;
  }

  function kindLabel(kind) {
    return window.UsLeftForYou?.labelForKind?.(kind) || 'Lasciato per voi';
  }

  function renderConservatiList(entries) {
    const list = document.getElementById('conservatiList');
    if (!list) return;
    list.innerHTML = entries.map(entry => {
      const preview = entry.source.body
        || (entry.source.kind === 'text' ? 'Un pensiero per voi.' : kindLabel(entry.source.kind));
      const owner = (entry.source.sender_id || entry.contribution.source_sender_id) === window.usProfile?.id ? 'tu' : 'partner';
      // R8/L9: a kept photo shows its own thumbnail right away; other kinds keep their mark.
      const thumb = entry.source.kind === 'photo' && entry.mediaUrl;
      const mark = thumb
        ? `<span class="conservati-card-mark conservati-card-thumb" aria-hidden="true"><img src="${escapeConservati(entry.mediaUrl)}" alt="" loading="lazy" decoding="async"></span>`
        : `<span class="conservati-card-mark" aria-hidden="true"><span class="us-icon" data-us-icon="${CONSERVATI_ICON[entry.source.kind] || 'heart'}" aria-hidden="true"></span></span>`;
      return `<button type="button" class="conservati-card" data-conservati-open="${escapeConservati(entry.contribution.id)}" data-owner="${owner}" aria-label="Apri ${escapeConservati(kindLabel(entry.source.kind))} lasciato da ${escapeConservati(entry.senderName)}">
        ${mark}
        <span class="conservati-card-copy"><b translate="no">${escapeConservati(entry.senderName)}</b><small>${escapeConservati(formatConservatiDate(entry.source.created_at))}</small><span${entry.source.body ? ' translate="no"' : ''}>${escapeConservati(preview)}</span></span>
        <span class="conservati-card-kind">${escapeConservati(kindLabel(entry.source.kind))}</span>
      </button>`;
    }).join('');
    setConservatiHead('RICORDI', 'Conservati');
    showConservatiState('list');
  }

  function renderConservatiDetail(entry) {
    const detail = document.getElementById('conservatiDetail');
    const renderer = window.UsLeftForYou?.renderItemMarkup;
    if (!detail || typeof renderer !== 'function') throw new Error('conservati_renderer_unavailable');
    const source = entry.source;
    const mediaUnavailable = PRIVATE_MEDIA_KINDS.has(source.kind) && !entry.mediaUrl;
    const content = mediaUnavailable
      ? '<p class="conservati-media-unavailable" role="status">Questo contenuto privato non è disponibile in questo momento.</p>'
      : renderer(source, entry.mediaUrl || '');
    // 1.0 parity: as in the design the sheet says what and from whom
    // ("Un pensiero · Da Beatrice"); the day closes the page.
    detail.innerHTML = `<button type="button" class="conservati-back" data-conservati-back aria-label="Torna ai Conservati"><span class="us-icon" data-us-icon="caret-left" aria-hidden="true"></span> <span>Conservati</span></button>
      <div class="conservati-item-content" data-kind="${escapeConservati(source.kind)}">${content}</div>
      <p class="conservati-provenance"><b class="conservati-provenance-from" translate="no">${escapeConservati(entry.senderName)}</b><time datetime="${escapeConservati(source.created_at)}">${escapeConservati(formatConservatiDate(source.created_at))}</time><span> · conservato nei Ricordi</span></p>`;
    setConservatiHead(kindLabel(source.kind), `Da ${entry.senderName}`);
    showConservatiState('detail');
  }

  async function loadConservati(requestId) {
    const coupleId = window.usProfile?.couple_id;
    let client;
    try { client = sb; } catch (_) { client = window.sb || null; }
    if (!coupleId || !client) throw new Error('conservati_sync_unavailable');

    const { data: contributions, error: contributionsError } = await client.from('conserva_contributions')
      .select('id,couple_id,source_item_id,source_sender_id,conserved_by,created_at')
      .eq('couple_id', coupleId)
      .order('created_at', { ascending: false });
    if (contributionsError) throw contributionsError;
    if (requestId !== conservatiRequestId || !root()?.classList.contains('show')) return;
    if (!contributions?.length) {
      conservatiEntries = [];
      showConservatiState('empty');
      return;
    }

    const sourceIds = [...new Set(contributions.map(row => row.source_item_id).filter(Boolean))];
    const [{ data: sources, error: sourcesError }, { data: profiles, error: profilesError }] = await Promise.all([
      client.from('left_for_you')
        .select('id,couple_id,sender_id,recipient_id,kind,body,media_path,created_at')
        .in('id', sourceIds)
        .eq('couple_id', coupleId),
      client.from('profiles')
        .select('id,display_name')
        .eq('couple_id', coupleId)
    ]);
    if (sourcesError) throw sourcesError;
    if (profilesError) throw profilesError;
    if (requestId !== conservatiRequestId || !root()?.classList.contains('show')) return;

    const sourceById = new Map((sources || []).map(source => [source.id, source]));
    const profileById = new Map((profiles || []).map(profile => [profile.id, profile]));
    const sourceRows = contributions.map(contribution => {
      const source = sourceById.get(contribution.source_item_id);
      if (!source || source.couple_id !== coupleId || !SUPPORTED_KINDS.has(source.kind)) {
        throw new Error('conservati_source_unavailable');
      }
      return { contribution, source };
    });
    const mediaPaths = sourceRows
      .filter(({ source }) => PRIVATE_MEDIA_KINDS.has(source.kind))
      .map(({ source }) => source.media_path)
      .filter(Boolean);
    let signedUrls = new Map();
    if (mediaPaths.length) {
      if (typeof window.usGetSignedUrls !== 'function') throw new Error('conservati_signed_media_unavailable');
      signedUrls = await window.usGetSignedUrls(mediaPaths, 21600);
      if (!(signedUrls instanceof Map)) throw new Error('conservati_signed_media_unavailable');
    }
    if (requestId !== conservatiRequestId || !root()?.classList.contains('show')) return;

    conservatiEntries = sourceRows.map(({ contribution, source }) => ({
      contribution,
      source,
      senderName: profileById.get(source.sender_id || contribution.source_sender_id)?.display_name || 'La tua persona',
      mediaUrl: PRIVATE_MEDIA_KINDS.has(source.kind) ? (signedUrls.get(source.media_path) || '') : ''
    }));
    renderConservatiList(conservatiEntries);
  }

  function retryConservati() {
    const requestId = ++conservatiRequestId;
    showConservatiState('loading');
    loadConservati(requestId).catch(error => {
      if (requestId !== conservatiRequestId || !root()?.classList.contains('show')) return;
      console.warn('[US Conservati] load', error);
      showConservatiState('error');
    });
  }

  function openConservati() {
    const modal = root();
    if (!modal) return;
    window.UsUiFoundation?.cancelSurfaceExit?.(modal);
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    retryConservati();
  }

  function closeConservati() {
    const modal = root();
    if (!modal) return;
    ++conservatiRequestId;
    releaseConservatiDetailMedia();
    const finalize = () => {
      modal.classList.remove('show');
      modal.setAttribute('aria-hidden', 'true');
      conservatiEntries = [];
      const list = document.getElementById('conservatiList');
      const detail = document.getElementById('conservatiDetail');
      if (list) list.replaceChildren();
      if (detail) detail.replaceChildren();
      setConservatiHead('RICORDI', 'Conservati');
      showConservatiState('loading');
    };
    if (window.UsUiFoundation?.exitSurface) window.UsUiFoundation.exitSurface(modal, finalize); else finalize();
  }

  document.getElementById('conservatiClose')?.addEventListener('click', closeConservati);
  document.getElementById('conservatiBackdrop')?.addEventListener('click', closeConservati);
  document.getElementById('conservatiRetry')?.addEventListener('click', retryConservati);
  document.getElementById('conservatiList')?.addEventListener('click', event => {
    const button = event.target.closest('[data-conservati-open]');
    if (!button) return;
    const entry = conservatiEntries.find(item => item.contribution.id === button.dataset.conservatiOpen);
    if (!entry) return;
    try { renderConservatiDetail(entry); }
    catch (error) { console.warn('[US Conservati] detail', error); showConservatiState('error'); }
  });
  document.getElementById('conservatiDetail')?.addEventListener('click', event => {
    if (event.target.closest('[data-conservati-back]')) {
      releaseConservatiDetailMedia();
      setConservatiHead('RICORDI', 'Conservati');
      showConservatiState('list');
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && root()?.classList.contains('show')) closeConservati();
  });

  // R8: the Conservati door stays hidden until the couple has kept something.
  let entryRequestId = 0;
  async function refreshConservatiEntry() {
    const entry = document.getElementById('conservatiEntry');
    const coupleId = window.usProfile?.couple_id;
    if (!entry || !coupleId) return;
    let client;
    try { client = sb; } catch (_) { client = window.sb || null; }
    if (!client) return;
    const requestId = ++entryRequestId;
    try {
      const { count, error } = await client.from('conserva_contributions')
        .select('id', { count: 'exact', head: true })
        .eq('couple_id', coupleId);
      if (error) throw error;
      if (requestId !== entryRequestId) return;
      const total = Number(count) || 0;
      entry.hidden = total < 1;
      const label = document.getElementById('conservatiCount');
      if (label) label.textContent = total > 0 ? String(total) : '';
    } catch (error) {
      console.warn('[US Conservati] entry', error);
    }
  }
  window.addEventListener?.('us:moments-updated', () => { refreshConservatiEntry(); });
  window.addEventListener?.('us:ricordi-shown', () => { refreshConservatiEntry(); });

  window.openConservati = openConservati;
  window.closeConservati = closeConservati;
  window.UsConservati = Object.freeze({ refreshEntry: refreshConservatiEntry });
})();
