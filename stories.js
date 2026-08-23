(() => {
  if (window.__usStoriesV19Installed) return;
  window.__usStoriesV19Installed = true;

  const STORY_SECONDS = 10;
  const STORY_LIFETIME_HOURS = 24;
  const MAX_BATCH = 10;
  const STORY_REFRESH_MS = 30000;
  const PROFILE_REFRESH_MS = 120000;

  let storyRows = [];
  let storyViews = new Set();
  let coupleProfiles = [];
  let storyRealtimeChannel = null;
  let storyRefreshTimer = null;
  let profileRefreshTimer = null;
  let currentViewerStories = [];
  let currentViewerIndex = 0;
  let currentViewerAuthor = null;
  let storyAdvanceTimer = null;
  let currentProgressFrame = null;
  let uploadBusy = false;
  let initializedForUserId = null;
  let todayCloseTimer = null;
  let storySwipeStartY = 0;
  let storySwipeStartX = 0;
  let storySwipeDy = 0;
  let storySwipeActive = false;

  function addStyles() {
    if (document.getElementById('usStoriesV19Styles')) return;
    const old = document.getElementById('usStoriesV17Styles') || document.getElementById('usStoriesV15Styles');
    old?.remove();
    const style = document.createElement('style');
    style.id = 'usStoriesV19Styles';
    style.textContent = `
      #usStoriesStrip{display:none!important}
      .us-top-profiles{display:flex;align-items:center;gap:7px;margin-left:3px}
      .us-top-story{position:relative;width:38px;height:38px;flex:0 0 38px}
      .us-top-story-btn{appearance:none;border:0;background:transparent;padding:2px;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;cursor:pointer;position:relative}
      .us-top-story-ring{width:36px;height:36px;border-radius:50%;padding:2px;display:grid;place-items:center;background:rgba(255,255,255,.11);transition:transform .16s ease,opacity .18s ease,background .18s ease}
      .us-top-story.has-story .us-top-story-ring{background:linear-gradient(145deg,#fff 0%,#cfd6ff 40%,#ffb7cf 72%,#fff 100%)}
      .us-top-story.seen .us-top-story-ring{background:rgba(255,255,255,.24);opacity:.78}
      .us-top-story.unseen .us-top-story-ring{box-shadow:0 0 0 1px rgba(255,255,255,.14),0 0 14px rgba(199,206,255,.22)}
      .us-top-story-btn:active .us-top-story-ring{transform:scale(.94)}
      .us-top-story-avatar{width:32px;height:32px;border-radius:50%;overflow:hidden;background:#181b24;border:2px solid #0d0f14;display:grid;place-items:center;color:#fff;font-size:12px;font-weight:800}
      .us-top-story-avatar img{width:100%;height:100%;object-fit:cover;display:block}
      .us-top-story-plus{position:absolute;right:-3px;bottom:-2px;width:18px;height:18px;border-radius:50%;border:2px solid #0d0f14;background:#f4f5f8;color:#11131a;display:grid;place-items:center;font-size:14px;line-height:1;font-weight:800;z-index:5;padding:0}
      .us-top-story-plus.uploading{opacity:.55;pointer-events:none}
      .us-top-story-dot{position:absolute;right:0;top:0;width:8px;height:8px;border-radius:50%;background:#fff;border:2px solid #0d0f14;display:none;z-index:4}
      .us-top-story.unseen .us-top-story-dot{display:block}
      .us-story-add-only{appearance:none;width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;display:grid;place-items:center;font-size:20px;line-height:1;padding:0;cursor:pointer}
      .us-story-add-only:active{transform:scale(.94)}
      .us-story-add-only.uploading{opacity:.55;pointer-events:none}
      #profileAvatarBtn{display:none!important}

      .us-story-viewer,.us-profile-preview,.us-camera-viewer{position:fixed;inset:0;z-index:10050;background:#05060a;display:none;align-items:center;justify-content:center;overflow:hidden}
      .us-story-viewer.open,.us-profile-preview.open,.us-camera-viewer.open{display:flex}
      .us-story-viewer{transition:transform .22s cubic-bezier(.22,.78,.24,1),opacity .22s ease;touch-action:none;will-change:transform,opacity}
      .us-story-viewer.story-swipe-closing{transform:translate3d(0,100vh,0)!important;opacity:0!important}
      .us-story-media{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#05060a}
      .us-story-top{position:absolute;z-index:5;left:0;right:0;top:0;padding:calc(env(safe-area-inset-top,0px) + 12px) 14px 12px;background:linear-gradient(to bottom,rgba(0,0,0,.64),rgba(0,0,0,0));pointer-events:none}
      .us-story-progress{display:flex;gap:4px;height:2px;margin-bottom:12px}.us-story-progress-seg{flex:1;background:rgba(255,255,255,.32);overflow:hidden;border-radius:99px}.us-story-progress-seg>i{display:block;width:0;height:100%;background:#fff;border-radius:99px}
      .us-story-author-row{display:flex;align-items:center;gap:9px;color:#fff;min-height:34px;padding-right:48px}.us-story-author-avatar{width:31px;height:31px;border-radius:50%;object-fit:cover;background:#191c25;border:1px solid rgba(255,255,255,.25)}.us-story-author-fallback{width:31px;height:31px;border-radius:50%;display:grid;place-items:center;background:#191c25;border:1px solid rgba(255,255,255,.25);font-size:12px;font-weight:750}.us-story-author-text b{display:block;font-size:13px;line-height:1.15}.us-story-author-text small{font-size:10px;opacity:.68}
      .us-story-close{position:absolute;z-index:8;right:12px;top:calc(env(safe-area-inset-top,0px) + 31px);width:38px;height:38px;border:0;border-radius:50%;background:rgba(0,0,0,.28);color:white;font-size:28px;line-height:1;display:grid;place-items:center;backdrop-filter:blur(8px)}
      .us-story-zone{position:absolute;z-index:4;top:92px;bottom:0;width:45%;border:0;background:transparent;padding:0}.us-story-zone.prev{left:0}.us-story-zone.next{right:0}.us-story-caption{position:absolute;z-index:6;left:22px;right:22px;bottom:calc(env(safe-area-inset-bottom,0px) + 32px);color:#fff;text-align:center;font-size:14px;text-shadow:0 2px 10px rgba(0,0,0,.8);pointer-events:none}.us-story-loading{position:absolute;z-index:2;color:rgba(255,255,255,.78);font-size:13px;letter-spacing:.02em}

      .us-camera-viewer{background:#000;flex-direction:column}
      .us-camera-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000}
      .us-camera-shade{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.32),transparent 22%,transparent 70%,rgba(0,0,0,.52));pointer-events:none}
      .us-camera-top{position:absolute;left:0;right:0;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;padding:calc(env(safe-area-inset-top,0px) + 14px) 16px 12px;color:#fff}
      .us-camera-title{font-size:13px;font-weight:750;letter-spacing:.02em;text-shadow:0 1px 7px rgba(0,0,0,.5)}
      .us-camera-icon-btn{width:40px;height:40px;border-radius:50%;border:0;background:rgba(0,0,0,.34);color:#fff;font-size:22px;display:grid;place-items:center;backdrop-filter:blur(8px)}
      .us-camera-bottom{position:absolute;left:0;right:0;bottom:0;z-index:6;padding:18px 20px calc(env(safe-area-inset-bottom,0px) + 20px);display:grid;grid-template-columns:48px 1fr 48px;align-items:center}
      .us-camera-capture{justify-self:center;width:74px;height:74px;border-radius:50%;border:4px solid rgba(255,255,255,.96);background:rgba(255,255,255,.20);padding:5px;box-shadow:0 5px 24px rgba(0,0,0,.35)}
      .us-camera-capture::after{content:'';display:block;width:100%;height:100%;border-radius:50%;background:#fff}
      .us-camera-capture:active{transform:scale(.94)}
      .us-camera-status{position:absolute;left:20px;right:20px;bottom:calc(env(safe-area-inset-bottom,0px) + 112px);z-index:7;color:#fff;text-align:center;font-size:12px;text-shadow:0 2px 8px rgba(0,0,0,.7)}
      .us-camera-flip{grid-column:3;width:44px;height:44px;border-radius:50%;border:0;background:rgba(0,0,0,.34);color:#fff;font-size:22px;display:grid;place-items:center;backdrop-filter:blur(8px)}

      .us-profile-preview{flex-direction:column;padding:30px;background:radial-gradient(circle at 50% 30%,#242838 0,#0b0d13 48%,#05060a 100%)}
      .us-profile-preview-photo{width:min(78vw,360px);aspect-ratio:1;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.88);box-shadow:0 22px 70px rgba(0,0,0,.5)}.us-profile-preview-fallback{width:min(78vw,360px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:#171a24;border:3px solid rgba(255,255,255,.5);font-size:92px;font-weight:800;color:#fff}.us-profile-preview-name{margin-top:22px;color:white;font-size:22px;font-weight:750}.us-profile-preview-sub{margin-top:5px;color:rgba(255,255,255,.58);font-size:12px}.us-profile-preview-close{position:absolute;right:14px;top:calc(env(safe-area-inset-top,0px) + 14px);width:42px;height:42px;border:0;border-radius:50%;background:rgba(255,255,255,.1);color:white;font-size:28px}
      .us-today-autoclose{margin-top:10px;padding:9px 11px;border:1px solid rgba(255,255,255,.10);border-radius:12px;background:rgba(255,255,255,.04);font-size:11px;color:rgba(255,255,255,.62);text-align:center}
    `;
    document.head.appendChild(style);
  }

  function injectUi() {
    document.getElementById('usStoriesStrip')?.remove();

    if (!document.getElementById('usTopProfiles')) {
      const root = document.createElement('div');
      root.id = 'usTopProfiles';
      root.className = 'us-top-profiles';
      root.innerHTML = `
        <div class="us-top-story" id="usStoryPartner">
          <button type="button" class="us-top-story-btn us-important-control" id="usStoryPartnerOpen" aria-label="Stories del partner">
            <span class="us-top-story-ring"><span class="us-top-story-avatar"><img id="usStoryPartnerImg" alt="Foto profilo partner" hidden><span class="fallback" id="usStoryPartnerFallback">♡</span></span></span>
            <span class="us-top-story-dot" aria-hidden="true"></span>
          </button>
        </div>
        <button type="button" class="us-story-add-only us-important-control" id="usStoryAdd" aria-label="Aggiungi una story">+</button>
      `;
      const actions = document.querySelector('.top .top-actions');
      if (actions) actions.appendChild(root);
      else document.querySelector('.top')?.appendChild(root);

      document.getElementById('usStoryAdd')?.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!uploadBusy) openStoryCamera();
      });
      document.getElementById('usStoryPartnerOpen')?.addEventListener('click', () => {
        const partner = getPartnerProfile();
        if (partner) openStoriesFor(partner.id, false);
      });
    }

    if (!document.getElementById('usStoryViewer')) {
      const viewer = document.createElement('div');
      viewer.id = 'usStoryViewer';
      viewer.className = 'us-story-viewer';
      viewer.setAttribute('aria-hidden','true');
      viewer.setAttribute('role','dialog');
      viewer.setAttribute('aria-modal','true');
      viewer.setAttribute('aria-label','Stories private');
      viewer.setAttribute('data-us-modal','');
      viewer.setAttribute('data-us-modal-panel','');
      viewer.innerHTML = `
        <div class="us-story-loading" id="usStoryLoading">Carico…</div>
        <img class="us-story-media" id="usStoryMedia" alt="Story privata" hidden>
        <div class="us-story-top"><div class="us-story-progress" id="usStoryProgress"></div><div class="us-story-author-row"><span class="us-story-author-text"><b id="usStoryAuthorName">US.</b><small id="usStoryTime"></small></span></div></div>
        <button type="button" class="us-story-close us-modal-close" id="usStoryClose" aria-label="Chiudi" data-us-modal-close>×</button>
        <button type="button" class="us-story-zone prev" id="usStoryPrev" aria-label="Story precedente"></button>
        <button type="button" class="us-story-zone next" id="usStoryNext" aria-label="Story successiva"></button>
        <div class="us-story-caption" id="usStoryCaption" hidden></div>
      `;
      document.body.appendChild(viewer);
      document.getElementById('usStoryClose')?.addEventListener('click', closeStoryViewer);
      document.getElementById('usStoryPrev')?.addEventListener('click', previousStory);
      document.getElementById('usStoryNext')?.addEventListener('click', nextStory);
      wireStorySwipeDown();
    }

    if (!document.getElementById('usStoryCamera')) {
      const camera = document.createElement('div');
      camera.id = 'usStoryCamera';
      camera.className = 'us-camera-viewer';
      camera.setAttribute('aria-hidden','true');
      camera.setAttribute('role','dialog');
      camera.setAttribute('aria-modal','true');
      camera.setAttribute('aria-label','Fotocamera Story');
      camera.setAttribute('data-us-modal','');
      camera.setAttribute('data-us-modal-panel','');
      camera.innerHTML = `
        <video class="us-camera-video" id="usCameraVideo" playsinline autoplay muted></video>
        <div class="us-camera-shade"></div>
        <div class="us-camera-top"><button type="button" class="us-camera-icon-btn us-modal-close" id="usCameraClose" aria-label="Chiudi fotocamera" data-us-modal-close>×</button><div class="us-camera-title">Story privata · foto</div><span style="width:40px"></span></div>
        <div class="us-camera-status" id="usCameraStatus">Inquadra e scatta</div>
        <div class="us-camera-bottom"><span></span><button type="button" class="us-camera-capture" id="usCameraCapture" aria-label="Scatta foto"></button><button type="button" class="us-camera-flip" id="usCameraFlip" aria-label="Cambia fotocamera">↻</button></div>
      `;
      document.body.appendChild(camera);
      document.getElementById('usCameraClose')?.addEventListener('click', closeStoryCamera);
      document.getElementById('usCameraCapture')?.addEventListener('click', captureStoryPhoto);
      document.getElementById('usCameraFlip')?.addEventListener('click', flipStoryCamera);
    }

    if (!document.getElementById('usProfilePreview')) {
      const preview = document.createElement('div');
      preview.id = 'usProfilePreview';
      preview.className = 'us-profile-preview';
      preview.setAttribute('aria-hidden','true');
      preview.setAttribute('role','dialog');
      preview.setAttribute('aria-modal','true');
      preview.setAttribute('aria-label','Anteprima profilo');
      preview.setAttribute('data-us-modal','');
      preview.setAttribute('data-us-modal-panel','');
      preview.innerHTML = `<button type="button" class="us-profile-preview-close us-modal-close" id="usProfilePreviewClose" aria-label="Chiudi" data-us-modal-close>×</button><img class="us-profile-preview-photo" id="usProfilePreviewImg" alt="Foto profilo" hidden><div class="us-profile-preview-fallback" id="usProfilePreviewFallback" hidden>♡</div><div class="us-profile-preview-name" id="usProfilePreviewName"></div><div class="us-profile-preview-sub">solo voi due ♡</div>`;
      document.body.appendChild(preview);
      preview.addEventListener('click', (event) => { if (event.target === preview) closeProfilePreview(); });
      document.getElementById('usProfilePreviewClose')?.addEventListener('click', closeProfilePreview);
    }
  }

  function getPartnerProfile() {
    return coupleProfiles.find((p) => p.id !== window.usProfile?.id) || null;
  }

  async function loadProfiles() {
    if (!window.usProfile) return;
    const { data, error } = await sb.from('profiles')
      .select('id,display_name,role,avatar_path')
      .eq('couple_id', window.usProfile.couple_id);
    if (error) { console.warn('[US Stories] profiles', error); return; }
    coupleProfiles = data || [];
    await renderStoryProfiles();
  }

  async function setStoryAvatar(imgId, fallbackId, profile) {
    const img = document.getElementById(imgId);
    const fallback = document.getElementById(fallbackId);
    if (!img || !fallback || !profile) return;
    fallback.textContent = (profile.display_name || '?').slice(0,1).toUpperCase();
    let url = null;
    try {
      if (typeof signedAvatarUrl === 'function') url = await signedAvatarUrl(profile.avatar_path);
    } catch (_) {}
    if (url) {
      img.src = url;
      img.hidden = false;
      fallback.style.display = 'none';
    } else {
      img.removeAttribute('src');
      img.hidden = true;
      fallback.style.display = 'grid';
    }
  }

  async function renderStoryProfiles() {
    if (!window.usProfile) return;
    const partner = getPartnerProfile();
    if (partner) await setStoryAvatar('usStoryPartnerImg','usStoryPartnerFallback',partner);
  }

  async function refreshStories(options = {}) {
    if (!window.usProfile || document.hidden) return;
    const now = new Date().toISOString();
    const { data: rows, error } = await sb.from('stories')
      .select('id,couple_id,author_id,media_path,caption,duration_seconds,created_at,expires_at')
      .eq('couple_id', window.usProfile.couple_id)
      .gt('expires_at', now)
      .order('created_at', { ascending: true });
    if (error) { console.warn('[US Stories] refresh', error); return; }
    storyRows = rows || [];

    const ids = storyRows.map((s) => s.id);
    storyViews = new Set();
    if (ids.length) {
      const { data: views, error: viewError } = await sb.from('story_views')
        .select('story_id,viewer_id,viewed_at')
        .eq('viewer_id', window.usProfile.id)
        .in('story_id', ids);
      if (viewError) console.warn('[US Stories] views', viewError);
      else (views || []).forEach((v) => storyViews.add(v.story_id));
    }
    renderStoryRings();
    if (options.refreshProfiles) await loadProfiles();
  }

  function renderStoryRings() {
    if (!window.usProfile) return;
    const partner = getPartnerProfile();
    const partnerStories = partner ? storyRows.filter((s) => s.author_id === partner.id) : [];
    const partnerEl = document.getElementById('usStoryPartner');

    if (partnerEl) {
      const unseen = partnerStories.some((s) => !storyViews.has(s.id));
      partnerEl.classList.toggle('has-story', partnerStories.length > 0);
      partnerEl.classList.toggle('unseen', unseen);
      partnerEl.classList.toggle('seen', partnerStories.length > 0 && !unseen);
    }
  }

  let cameraStream = null;
  let cameraFacing = 'environment';

  async function publishStoryBlob(blob) {
    if (!window.usProfile || uploadBusy || !blob) return false;
    uploadBusy = true;
    const plus = document.getElementById('usStoryAdd');
    plus?.classList.add('uploading');
    try {
      let mediaBlob = blob;
      if (typeof compressImageFile === 'function' && blob instanceof File) {
        mediaBlob = await compressImageFile(blob, { maxDimension: 1600, quality: .84 });
      }
      const path = window.usProfile.couple_id + '/' + window.usProfile.id + '/story-' + Date.now() + '-' + crypto.randomUUID() + '.webp';
      const { error: uploadError } = await sb.storage.from('us-media').upload(path, mediaBlob, { contentType: mediaBlob.type || 'image/webp', upsert: false, cacheControl: '3600' });
      if (uploadError) throw uploadError;
      const expires = new Date(Date.now() + STORY_LIFETIME_HOURS * 3600000).toISOString();
      const { error: rowError } = await sb.from('stories').insert({ couple_id: window.usProfile.couple_id, author_id: window.usProfile.id, media_path: path, duration_seconds: STORY_SECONDS, expires_at: expires });
      if (rowError) { await sb.storage.from('us-media').remove([path]); throw rowError; }
      navigator.vibrate?.([28,18,38]);
      toast('Story pubblicata ♡');
      await refreshStories();
      return true;
    } catch (error) {
      console.warn('[US Stories] camera upload', error);
      toast('Non riesco a pubblicare la story');
      return false;
    } finally {
      uploadBusy = false;
      plus?.classList.remove('uploading');
    }
  }

  async function openStoryCamera() {
    if (!window.usProfile || uploadBusy) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('Fotocamera non disponibile su questo dispositivo');
      return;
    }
    const root = document.getElementById('usStoryCamera');
    const status = document.getElementById('usCameraStatus');
    root?.classList.add('open');
    root?.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';
    if (status) status.textContent = 'Avvio fotocamera…';
    try {
      await startCameraStream();
      if (status) status.textContent = 'Inquadra e scatta';
    } catch (error) {
      console.warn('[US Stories] camera', error);
      if (status) status.textContent = 'Consenti l’accesso alla fotocamera nelle impostazioni';
      toast('Serve il permesso fotocamera');
    }
  }

  async function startCameraStream() {
    stopCameraStream();
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: cameraFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    const video = document.getElementById('usCameraVideo');
    if (video) {
      video.srcObject = cameraStream;
      await video.play();
    }
  }

  function stopCameraStream() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    const video = document.getElementById('usCameraVideo');
    if (video) video.srcObject = null;
  }

  function closeStoryCamera() {
    stopCameraStream();
    const root = document.getElementById('usStoryCamera');
    root?.classList.remove('open');
    root?.setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
  }

  async function flipStoryCamera() {
    cameraFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    const status = document.getElementById('usCameraStatus');
    if (status) status.textContent = 'Cambio fotocamera…';
    try { await startCameraStream(); if (status) status.textContent = 'Inquadra e scatta'; }
    catch (error) { console.warn(error); toast('Non riesco a cambiare fotocamera'); }
  }

  async function captureStoryPhoto() {
    if (uploadBusy) return;
    const video = document.getElementById('usCameraVideo');
    const status = document.getElementById('usCameraStatus');
    if (!video || !video.videoWidth || !video.videoHeight) return;
    if (status) status.textContent = 'Pubblico…';
    const max = 1600;
    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext('2d');
    if (cameraFacing === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', .86));
    if (!blob) { if (status) status.textContent = 'Riprova'; return; }
    const ok = await publishStoryBlob(blob);
    if (ok) closeStoryCamera();
    else if (status) status.textContent = 'Riprova';
  }

  async function openStoriesFor(authorId, own) {
    if (!window.usProfile || !authorId) return;
    await refreshStories();
    const rows = storyRows.filter((s) => s.author_id === authorId);
    const author = coupleProfiles.find((p) => p.id === authorId) || null;
    if (!rows.length) {
      if (own) openStoryCamera();
      else if (typeof toast === 'function') toast((author?.display_name || 'Il partner') + ' non ha stories attive');
      return;
    }
    currentViewerStories = rows;
    currentViewerAuthor = author;
    const firstUnseen = own ? -1 : rows.findIndex((s) => !storyViews.has(s.id));
    currentViewerIndex = firstUnseen >= 0 ? firstUnseen : 0;
    const viewer = document.getElementById('usStoryViewer');
    viewer?.classList.add('open');
    viewer?.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';
    renderViewerHeader(author);
    await showStoryAt(currentViewerIndex);
  }

  async function renderViewerHeader(author) {
    const name = document.getElementById('usStoryAuthorName');
    if (name) name.textContent = author?.display_name || 'US.';
  }

  function clearStoryAdvance() {
    if (storyAdvanceTimer) clearTimeout(storyAdvanceTimer);
    storyAdvanceTimer = null;
    if (currentProgressFrame) cancelAnimationFrame(currentProgressFrame);
    currentProgressFrame = null;
  }

  function renderProgress(index, durationSeconds) {
    const root = document.getElementById('usStoryProgress');
    if (!root) return;
    root.innerHTML = currentViewerStories.map((_, i) => '<span class="us-story-progress-seg"><i data-i="' + i + '"></i></span>').join('');
    root.querySelectorAll('i').forEach((bar, i) => {
      bar.style.transition = 'none';
      bar.style.width = i < index ? '100%' : '0%';
    });
    const active = root.querySelector('i[data-i="' + index + '"]');
    if (active) {
      currentProgressFrame = requestAnimationFrame(() => {
        currentProgressFrame = requestAnimationFrame(() => {
          active.style.transition = 'width ' + durationSeconds + 's linear';
          active.style.width = '100%';
        });
      });
    }
  }

  async function showStoryAt(index) {
    clearStoryAdvance();
    if (index < 0) index = 0;
    if (index >= currentViewerStories.length) { closeStoryViewer(); return; }
    currentViewerIndex = index;
    const story = currentViewerStories[index];
    const duration = Math.min(STORY_SECONDS, Math.max(1, Number(story.duration_seconds || STORY_SECONDS)));
    renderProgress(index, duration);
    const media = document.getElementById('usStoryMedia');
    const loading = document.getElementById('usStoryLoading');
    const caption = document.getElementById('usStoryCaption');
    const time = document.getElementById('usStoryTime');
    if (media) { media.hidden = true; media.removeAttribute('src'); }
    if (loading) loading.hidden = false;
    if (caption) {
      caption.hidden = !story.caption;
      caption.textContent = story.caption || '';
    }
    if (time) time.textContent = relativeStoryTime(story.created_at);

    if (story.author_id !== window.usProfile?.id) markStorySeen(story.id);

    let storySignedUrl = null;
    if (typeof window.usGetSignedUrl === 'function') {
      storySignedUrl = await window.usGetSignedUrl(story.media_path, 600);
    } else {
      const { data, error } = await sb.storage.from('us-media').createSignedUrl(story.media_path, 600);
      if (error) console.warn('[US Stories] signed url', error);
      storySignedUrl = data?.signedUrl || null;
    }
    if (!storySignedUrl) {
      nextStory();
      return;
    }
    if (!media) return;
    media.onload = () => {
      if (currentViewerStories[currentViewerIndex]?.id !== story.id) return;
      media.hidden = false;
      if (loading) loading.hidden = true;
      storyAdvanceTimer = setTimeout(nextStory, duration * 1000);
    };
    media.onerror = () => nextStory();
    media.src = storySignedUrl;
  }

  async function markStorySeen(storyId) {
    if (!window.usProfile || storyViews.has(storyId)) return;
    storyViews.add(storyId);
    renderStoryRings();
    const { error } = await sb.from('story_views').insert({ story_id: storyId, viewer_id: window.usProfile.id });
    if (error && error.code !== '23505') console.warn('[US Stories] mark seen', error);
  }

  function nextStory() {
    if (currentViewerIndex + 1 >= currentViewerStories.length) {
      closeStoryViewer();
      refreshStories().catch(() => {});
      return;
    }
    showStoryAt(currentViewerIndex + 1);
  }

  function previousStory() {
    if (currentViewerIndex <= 0) {
      showStoryAt(0);
      return;
    }
    showStoryAt(currentViewerIndex - 1);
  }

  function wireStorySwipeDown() {
    const viewer = document.getElementById('usStoryViewer');
    if (!viewer || viewer.dataset.swipeDown === '1') return;
    viewer.dataset.swipeDown = '1';
    viewer.addEventListener('touchstart', (event) => {
      if (!viewer.classList.contains('open') || event.touches.length !== 1) return;
      storySwipeStartY = event.touches[0].clientY;
      storySwipeStartX = event.touches[0].clientX;
      storySwipeDy = 0; storySwipeActive = false;
      viewer.style.transition = 'none';
    }, { passive: true });
    viewer.addEventListener('touchmove', (event) => {
      if (!storySwipeStartY || event.touches.length !== 1) return;
      const dy = event.touches[0].clientY - storySwipeStartY;
      const dx = event.touches[0].clientX - storySwipeStartX;
      if (dy <= 0 || Math.abs(dy) < Math.abs(dx) * 1.15) return;
      storySwipeActive = true; storySwipeDy = dy;
      clearStoryAdvance();
      event.preventDefault();
      const travel = Math.min(dy, 280);
      viewer.style.transform = 'translate3d(0,' + travel + 'px,0)';
      viewer.style.opacity = String(Math.max(.38, 1 - travel / 430));
    }, { passive: false });
    const finish = () => {
      if (!storySwipeStartY) return;
      const shouldClose = storySwipeActive && storySwipeDy > 92;
      storySwipeStartY = 0; storySwipeStartX = 0;
      viewer.style.transition = '';
      if (shouldClose) {
        viewer.classList.add('story-swipe-closing');
        setTimeout(() => { viewer.classList.remove('story-swipe-closing'); closeStoryViewer(); }, 190);
      } else {
        viewer.style.transform = ''; viewer.style.opacity = '';
        if (storySwipeActive && currentViewerStories.length) showStoryAt(currentViewerIndex);
      }
      storySwipeDy = 0; storySwipeActive = false;
    };
    viewer.addEventListener('touchend', finish, { passive: true });
    viewer.addEventListener('touchcancel', finish, { passive: true });
  }

  function closeStoryViewer() {
    clearStoryAdvance();
    const viewer = document.getElementById('usStoryViewer');
    viewer?.classList.remove('open','story-swipe-closing');
    if (viewer) { viewer.style.transform=''; viewer.style.opacity=''; viewer.style.transition=''; }
    viewer?.setAttribute('aria-hidden','true');
    const media = document.getElementById('usStoryMedia');
    if (media) { media.removeAttribute('src'); media.hidden = true; }
    document.body.style.overflow = '';
    currentViewerStories = [];
    currentViewerAuthor = null;
  }

  async function openProfilePreview(profile) {
    const root = document.getElementById('usProfilePreview');
    const img = document.getElementById('usProfilePreviewImg');
    const fallback = document.getElementById('usProfilePreviewFallback');
    const name = document.getElementById('usProfilePreviewName');
    if (!root || !img || !fallback || !name) return;
    name.textContent = profile.display_name || 'Partner';
    fallback.textContent = (profile.display_name || '?').slice(0,1).toUpperCase();
    let url = null;
    try { if (typeof signedAvatarUrl === 'function') url = await signedAvatarUrl(profile.avatar_path); } catch (_) {}
    if (url) { img.src = url; img.hidden = false; fallback.hidden = true; }
    else { img.hidden = true; fallback.hidden = false; }
    root.classList.add('open');
    root.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';
  }

  function closeProfilePreview() {
    const root = document.getElementById('usProfilePreview');
    root?.classList.remove('open');
    root?.setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
  }

  function relativeStoryTime(dateString) {
    const ms = Math.max(0, Date.now() - new Date(dateString).getTime());
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'ora';
    if (mins < 60) return mins + ' min';
    const hrs = Math.floor(mins / 60);
    return hrs + (hrs === 1 ? ' ora' : ' ore');
  }

  async function cleanupOwnExpiredStories() {
    if (!window.usProfile) return;
    const now = new Date().toISOString();
    const { data, error } = await sb.from('stories')
      .select('id,media_path')
      .eq('author_id', window.usProfile.id)
      .lte('expires_at', now)
      .limit(50);
    if (error || !data?.length) return;
    const paths = data.map((row) => row.media_path).filter(Boolean);
    if (paths.length) await sb.storage.from('us-media').remove(paths);
    await sb.from('stories').delete().in('id', data.map((row) => row.id));
  }

  function startStoryRealtime() {
    if (!window.usProfile) return;
    if (storyRealtimeChannel) sb.removeChannel(storyRealtimeChannel);
    const coupleId = window.usProfile.couple_id;
    const userId = window.usProfile.id;
    storyRealtimeChannel = sb.channel('us-stories-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories', filter: 'couple_id=eq.' + coupleId }, () => refreshStories())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'story_views', filter: 'viewer_id=eq.' + userId }, () => refreshStories())
      .subscribe();
  }

  function startStoryPolling() {
    if (storyRefreshTimer) clearInterval(storyRefreshTimer);
    storyRefreshTimer = setInterval(() => {
      if (!document.hidden && window.usProfile) refreshStories();
    }, STORY_REFRESH_MS);
    if (profileRefreshTimer) clearInterval(profileRefreshTimer);
    profileRefreshTimer = setInterval(() => {
      if (!document.hidden && window.usProfile) loadProfiles();
    }, PROFILE_REFRESH_MS);
  }

  function wireTodayAutoClose() {
    if (window.__usTodayAutoCloseV15 || typeof hydrateToday !== 'function') return;
    window.__usTodayAutoCloseV15 = true;
    const originalHydrateToday = hydrateToday;
    const wrapped = async function() {
      const result = await originalHydrateToday.apply(this, arguments);
      scheduleTodayCloseIfNeeded();
      return result;
    };
    try { hydrateToday = wrapped; } catch (_) {}
    window.hydrateToday = wrapped;
  }

  function scheduleTodayCloseIfNeeded() {
    if (!window.usProfile || !window.todayState?.both_answered) return;
    if (!document.getElementById('today')?.classList.contains('active')) return;
    const d = new Date();
    const dateKey = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const key = 'us-today-reveal-autoclosed:' + window.usProfile.id + ':' + dateKey;
    try { if (localStorage.getItem(key) === '1') return; } catch (_) {}
    if (todayCloseTimer) return;
    const reveal = document.getElementById('todayReveal');
    if (reveal && !document.getElementById('usTodayAutoCloseHint')) {
      const hint = document.createElement('div');
      hint.id = 'usTodayAutoCloseHint';
      hint.className = 'us-today-autoclose';
      hint.textContent = 'Reveal visto ♡ · torno alla Home tra pochi secondi';
      reveal.appendChild(hint);
    }
    todayCloseTimer = setTimeout(() => {
      todayCloseTimer = null;
      if (!document.getElementById('today')?.classList.contains('active')) return;
      try { localStorage.setItem(key, '1'); } catch (_) {}
      if (typeof go === 'function') go('home');
      if (typeof toast === 'function') toast('Today completato ♡');
    }, 10000);
  }

  function connectExistingProfileAvatars() {
    // Le Stories hanno un solo punto di ingresso: il pallino del partner in alto.
  }

  async function startForCurrentProfile() {
    if (!window.usProfile?.id) return false;
    if (initializedForUserId === window.usProfile.id) return true;
    initializedForUserId = window.usProfile.id;
    injectUi();
    wireTodayAutoClose();
    await loadProfiles();
    connectExistingProfileAvatars();
    await cleanupOwnExpiredStories();
    await refreshStories();
    startStoryRealtime();
    startStoryPolling();
    return true;
  }

  function boot() {
    addStyles();
    injectUi();
    const timer = setInterval(async () => {
      if (await startForCurrentProfile()) clearInterval(timer);
    }, 450);
    setTimeout(() => startForCurrentProfile(), 100);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) closeStoryCamera();
      if (!document.hidden) {
        startForCurrentProfile();
        refreshStories({ refreshProfiles: true });
        scheduleTodayCloseIfNeeded();
      }
    });
    window.addEventListener('focus', () => refreshStories({ refreshProfiles: true }));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { closeStoryViewer(); closeProfilePreview(); closeStoryCamera(); }
    });
    sb.auth.onAuthStateChange(() => setTimeout(() => {
      initializedForUserId = null;
      startForCurrentProfile();
    }, 700));
    console.info('[US Stories] v19 partner bubble + swipe down');
  }

  boot();
})();
