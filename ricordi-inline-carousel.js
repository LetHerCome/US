/* US Ricordi inline carousel V2 — only the main Ricordi timeline.
   Album/lightbox are untouched. Metadata is read by moments-albums.js; signed
   media is requested only for cards as they approach the viewport or on swipe. */
(() => {
  'use strict';
  if (window.UsRicordiInline) return;
  const states = new WeakMap();
  const urlCache = new Map();
  const urlRequests = new Map();
  const observer = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          const card = entry.target.closest('.moment-card[data-moment-id]');
          if (card) prime(card);
        });
      }, {rootMargin:'220px 0px'}) : null;

  function requestedPhotoUrl(storagePath) {
    if (!storagePath) return Promise.resolve(null);
    if (urlCache.has(storagePath)) return Promise.resolve(urlCache.get(storagePath));
    if (urlRequests.has(storagePath)) return urlRequests.get(storagePath);
    const request = Promise.resolve().then(async () => {
      if (typeof window.usGetSignedUrls !== 'function') return null;
      const urls = await window.usGetSignedUrls([storagePath],21600);
      const url = urls instanceof Map ? urls.get(storagePath) : null;
      if (url) urlCache.set(storagePath,url);
      return url || null;
    }).catch(error => {
      console.warn('[US Ricordi inline] private photo',error);
      return null;
    }).finally(() => urlRequests.delete(storagePath));
    urlRequests.set(storagePath,request);
    return request;
  }

  function createButton(direction) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = direction < 0 ? 'ricordi-inline-control ricordi-inline-prev' : 'ricordi-inline-control ricordi-inline-next';
    button.dataset.ricordiInlineStep = String(direction);
    button.setAttribute('aria-label',direction < 0 ? 'Foto precedente nel ricordo' : 'Foto successiva nel ricordo');
    button.textContent = direction < 0 ? '‹' : '›';
    return button;
  }

  function setupStage(card) {
    const img = card.querySelector(':scope > img');
    if (!img) return null;
    const meta = card.querySelector(':scope > .moment-meta');
    if (!meta) return null;
    const stage = document.createElement('div');
    stage.className = 'ricordi-inline-stage';
    stage.setAttribute('role','group');
    stage.setAttribute('aria-roledescription','carosello');
    stage.tabIndex = 0;
    stage.dataset.ricordiInlineStage = '';
    img.before(stage);
    img.classList.add('ricordi-inline-current');
    stage.appendChild(img);
    const peek = document.createElement('img');
    peek.className = 'ricordi-inline-peek';
    peek.alt = '';
    peek.setAttribute('aria-hidden','true');
    peek.loading = 'lazy';
    peek.decoding = 'async';
    stage.prepend(peek);
    const counter = document.createElement('span');
    counter.className = 'ricordi-inline-counter';
    counter.setAttribute('aria-live','polite');
    const prev = createButton(-1);
    const next = createButton(1);
    stage.append(counter,prev,next);
    const captionNode = meta.querySelector(':scope > p') || document.createElement('p');
    if (!captionNode.isConnected) meta.appendChild(captionNode);
    captionNode.classList.add('ricordi-inline-caption');
    const authorNode = meta.querySelector('.moment-by');
    const state = {
      card,stage,img,peek,counter,prev,next,captionNode,authorNode,
      photos:[],index:0,token:0,touch:null,suppressUntil:0,
      originalUrl:img.getAttribute('src')||card.dataset.url||'',
      originalPath:img.dataset.usMediaPath||card.dataset.storagePath||'',
      originalCaption:card.dataset.caption||'',
      originalAuthor:authorNode?.textContent||card.dataset.author||'Noi'
    };
    states.set(card,state);
    stage.addEventListener('touchstart',event=>{
      const point=event.touches?.[0];
      state.touch=point?{x:point.clientX,y:point.clientY}:null;
    },{passive:true});
    stage.addEventListener('touchcancel',()=>{state.touch=null;},{passive:true});
    stage.addEventListener('touchend',event=>{
      if (!state.touch) return;
      const end=event.changedTouches?.[0],start=state.touch;
      state.touch=null;
      if (!end) return;
      const dx=end.clientX-start.x,dy=end.clientY-start.y;
      if (Math.abs(dx)<36||Math.abs(dx)<Math.abs(dy)*1.3) return;
      state.suppressUntil=Date.now()+650;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      void select(card,state.index+(dx<0?1:-1),dx<0?1:-1);
    },{passive:false});
    stage.addEventListener('click',event=>{
      const control=event.target.closest('[data-ricordi-inline-step]');
      if (!control) return;
      event.preventDefault();
      event.stopPropagation();
      void select(card,state.index+Number(control.dataset.ricordiInlineStep),Number(control.dataset.ricordiInlineStep));
    });
    stage.addEventListener('keydown',event=>{
      if (event.key!=='ArrowLeft'&&event.key!=='ArrowRight') return;
      event.preventDefault();
      event.stopPropagation();
      const step=event.key==='ArrowRight'?1:-1;
      void select(card,state.index+step,step);
    });
    return state;
  }

  function paint(state,direction=0) {
    const photo=state.photos[state.index];
    if (!photo) return;
    const src=photo.url||state.originalUrl;
    state.img.src=src;
    if (photo.path) state.img.dataset.usMediaPath=photo.path;
    else state.img.removeAttribute('data-us-media-path');
    state.img.alt=`Foto ${state.index+1} di ${state.photos.length} del ricordo`;
    state.counter.textContent=`${state.index+1} / ${state.photos.length}`;
    state.stage.setAttribute('aria-label',`Foto ${state.index+1} di ${state.photos.length}. Scorri lateralmente per cambiare foto.`);
    state.captionNode.textContent=photo.caption||'';
    state.captionNode.hidden=!photo.caption;
    if (state.authorNode) state.authorNode.textContent=photo.author;
    const next=state.photos[(state.index+1)%state.photos.length];
    // The already-decoded current image doubles as the rear photo until the
    // next signed photo is available; never request whole albums up front.
    state.peek.src=next?.url||src;
    if (direction && !window.UsUiFoundation?.isReducedMotion?.()) {
      state.img.classList.remove('ricordi-inline-enter-next','ricordi-inline-enter-prev');
      void state.img.offsetWidth;
      state.img.classList.add(direction>0?'ricordi-inline-enter-next':'ricordi-inline-enter-prev');
    }
    void prime(state.card);
  }

  async function prime(card) {
    const state=states.get(card);
    if (!state||!card.isConnected||state.photos.length<2) return;
    const active=state.index;
    const nextIndex=(active+1)%state.photos.length;
    const next=state.photos[nextIndex];
    if (next.url||next.cover) {
      if (state.index===active&&next.url) state.peek.src=next.url;
      return;
    }
    const url=await requestedPhotoUrl(next.path);
    if (!url||!card.isConnected||states.get(card)!==state) return;
    next.url=url;
    if (state.index===active) state.peek.src=url;
  }

  async function select(card,index,direction=0) {
    const state=states.get(card);
    if (!state||state.photos.length<2) return false;
    const dest=(index%state.photos.length+state.photos.length)%state.photos.length;
    if (dest===state.index) return true;
    const photo=state.photos[dest];
    const token=++state.token;
    state.stage.setAttribute('aria-busy','true');
    const url=photo.cover ? state.originalUrl : photo.url||await requestedPhotoUrl(photo.path);
    if (token!==state.token||!card.isConnected) return false;
    state.stage.removeAttribute('aria-busy');
    if (!url) return false;
    photo.url=url;
    state.index=dest;
    paint(state,direction);
    return true;
  }

  function removeStage(card) {
    const state=states.get(card);
    if (!state) return;
    ++state.token;
    observer?.unobserve(state.stage);
    state.img.src=state.originalUrl;
    state.img.dataset.usMediaPath=state.originalPath;
    state.img.alt='Ricordo condiviso';
    state.img.classList.remove('ricordi-inline-current','ricordi-inline-enter-next','ricordi-inline-enter-prev');
    state.stage.before(state.img);
    state.stage.remove();
    state.authorNode && (state.authorNode.textContent=state.originalAuthor);
    state.captionNode.textContent=state.originalCaption;
    state.captionNode.hidden=!state.originalCaption;
    state.captionNode.classList.remove('ricordi-inline-caption');
    states.delete(card);
  }

  function decorate(card,secondaryRows) {
    if (!card?.dataset?.momentId) return;
    const sorted=[...(secondaryRows||[])].filter(row=>row.storage_path).sort((a,b)=>
      (Number(a.position)||0)-(Number(b.position)||0)||
      String(a.created_at||'').localeCompare(String(b.created_at||''))||
      String(a.id||'').localeCompare(String(b.id||'')));
    if (!sorted.length) {removeStage(card);return;}
    const state=states.get(card)||setupStage(card);
    if (!state) return;
    const ids=sorted.map(row=>String(row.id||row.storage_path)).join('|');
    if (state.ids===ids) return;
    state.ids=ids;
    state.index=0;
    state.photos=[
      {cover:true,url:state.originalUrl,path:state.originalPath,caption:state.originalCaption,author:state.originalAuthor},
      ...sorted.map(row=>({
        cover:false,id:row.id,path:row.storage_path,url:urlCache.get(row.storage_path)||'',
        caption:row.caption||'',
        author:row.created_by===window.usProfile?.id?'Da te':'Dalla tua persona'
      }))
    ];
    paint(state);
    if (observer) observer.observe(state.stage);
    else void prime(card);
  }

  function shouldSuppressOpen(target) {
    const stage=target?.closest?.('.ricordi-inline-stage');
    if (!stage) return false;
    const card=stage.closest('.moment-card[data-moment-id]');
    const state=card&&states.get(card);
    return Boolean(state&&Date.now()<state.suppressUntil);
  }

  window.UsRicordiInline=Object.freeze({decorate,select,shouldSuppressOpen});
})();
