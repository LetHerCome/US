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
  let currentProgressFrame = null;
  let storyPlaybackElapsedMs = 0;
  let storyPlaybackStartedAt = 0;
  let storyPlaybackDurationMs = 0;
  let storyPlaybackPaused = false;
  let storyPlaybackBackgroundPaused = false;
  let uploadBusy = false;
  let captureBusy = false;
  let pendingStoryBlob = null;
  let pendingDeleteStoryId = null;
  let storyLoadToken = 0;
  let initializedForUserId = null;
  let todayCloseTimer = null;
  let storySwipeStartY = null;
  let storySwipeStartX = null;
  let storySwipeEndY = null;
  let storySwipeEndX = null;

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
        <button type="button" class="us-story-add-only us-important-control us-premium-control" id="usStoryAdd" aria-label="Aggiungi una story"><span class="us-brand-icon us-brand-icon--stories" aria-hidden="true"><img class="us-brand-icon-off" src="/assets/icons/stories-off.svg" alt=""><img class="us-brand-icon-on" src="/assets/icons/stories-on.svg" alt=""></span></button>
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
        <div class="us-story-state" id="usStoryState" role="status" aria-live="polite">
          <span id="usStoryStateText">Carico…</span>
          <button type="button" class="us-story-retry" id="usStoryRetry" hidden>Riprova</button>
        </div>
        <img class="us-story-media" id="usStoryMedia" alt="Story privata" hidden>
        <div class="us-story-top"><div class="us-story-progress" id="usStoryProgress"></div><div class="us-story-author-row"><span class="us-story-author-text"><b id="usStoryAuthorName">US.</b><small id="usStoryTime"></small></span></div></div>
        <button type="button" class="us-story-close us-modal-close" id="usStoryClose" aria-label="Chiudi" data-us-modal-close>×</button>
        <button type="button" class="us-story-delete" id="usStoryDelete" aria-label="Elimina questa Story" hidden>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 9v8m4-8v8m4-8v8M5 6h14m-2 0-1 14H8L7 6m3-3h4l1 3H9z"/></svg>
        </button>
        <button type="button" class="us-story-zone prev" id="usStoryPrev" tabindex="-1" aria-label="Story precedente"></button>
        <button type="button" class="us-story-zone next" id="usStoryNext" tabindex="-1" aria-label="Story successiva"></button>
        <div class="us-story-caption" id="usStoryCaption" hidden></div>
      `;
      document.body.appendChild(viewer);
      document.getElementById('usStoryClose')?.addEventListener('click', closeStoryViewer);
      document.getElementById('usStoryPrev')?.addEventListener('click', previousStory);
      document.getElementById('usStoryNext')?.addEventListener('click', nextStory);
      document.getElementById('usStoryRetry')?.addEventListener('click', () => showStoryAt(currentViewerIndex));
      document.getElementById('usStoryDelete')?.addEventListener('click', openStoryDeleteConfirmation);
      wireStoryGestures();
    }

    if (!document.getElementById('usStoryDeleteConfirm')) {
      const confirmation = document.createElement('div');
      confirmation.id = 'usStoryDeleteConfirm';
      confirmation.className = 'us-story-delete-confirm';
      confirmation.setAttribute('aria-hidden','true');
      confirmation.setAttribute('data-us-modal','');
      confirmation.innerHTML = `
        <div class="us-story-delete-backdrop us-modal-backdrop" id="usStoryDeleteBackdrop"></div>
        <section class="us-story-delete-sheet" role="dialog" aria-modal="true" aria-labelledby="usStoryDeleteTitle" data-us-modal-panel>
          <h2 id="usStoryDeleteTitle">Eliminare questa Story?</h2>
          <p>Scomparirà subito dal vostro spazio condiviso.</p>
          <div class="us-story-delete-actions">
            <button type="button" class="ghost" id="usStoryDeleteCancel" data-us-modal-close>Annulla</button>
            <button type="button" class="us-story-delete-confirm-btn" id="usStoryDeleteConfirmBtn">Elimina</button>
          </div>
        </section>
      `;
      document.body.appendChild(confirmation);
      document.getElementById('usStoryDeleteBackdrop')?.addEventListener('click', closeStoryDeleteConfirmation);
      document.getElementById('usStoryDeleteCancel')?.addEventListener('click', closeStoryDeleteConfirmation);
      document.getElementById('usStoryDeleteConfirmBtn')?.addEventListener('click', confirmCurrentStoryDelete);
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
        <div class="us-camera-top"><button type="button" class="us-camera-icon-btn us-modal-close" id="usCameraClose" aria-label="Chiudi fotocamera" data-us-modal-close>×</button><div class="us-camera-title">Story privata · foto</div><button type="button" class="us-camera-manage" id="usCameraManage" aria-label="Gestisci le tue Stories" hidden><svg viewBox="0 0 18 6" aria-hidden="true"><circle cx="3" cy="3" r="2"/><circle cx="9" cy="3" r="2"/><circle cx="15" cy="3" r="2"/></svg></button></div>
        <div class="us-camera-feedback" role="status" aria-live="polite"><span id="usCameraStatus">Inquadra e scatta</span><button type="button" class="us-camera-retry" id="usCameraRetry" hidden>Riprova</button></div>
        <div class="us-camera-bottom"><span></span><button type="button" class="us-camera-capture" id="usCameraCapture" aria-label="Scatta foto"></button><button type="button" class="us-camera-flip" id="usCameraFlip" aria-label="Cambia fotocamera"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6.1 9a7 7 0 0 1 11.5-2.4L20 9M4 15l2.4 2.4A7 7 0 0 0 17.9 15"/></svg></button></div>
      `;
      document.body.appendChild(camera);
      document.getElementById('usCameraClose')?.addEventListener('click', closeStoryCamera);
      document.getElementById('usCameraCapture')?.addEventListener('click', captureStoryPhoto);
      document.getElementById('usCameraFlip')?.addEventListener('click', flipStoryCamera);
      document.getElementById('usCameraRetry')?.addEventListener('click', retryPendingStoryUpload);
      document.getElementById('usCameraManage')?.addEventListener('click', openOwnStoriesFromCamera);
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

  function storyPartnerLabel(partner, count) {
    const name = partner?.display_name || 'Il partner';
    if (!count) return name + ' non ha Stories attive';
    return count === 1 ? 'Apri la Story di ' + name : 'Apri le ' + count + ' Stories di ' + name;
  }

  function renderStoryRings() {
    if (!window.usProfile) return;
    const partner = getPartnerProfile();
    const partnerStories = partner ? storyRows.filter((s) => s.author_id === partner.id) : [];
    const partnerEl = document.getElementById('usStoryPartner');
    const partnerButton = document.getElementById('usStoryPartnerOpen');

    if (partnerEl) {
      const unseen = partnerStories.some((s) => !storyViews.has(s.id));
      partnerEl.classList.toggle('has-story', partnerStories.length > 0);
      partnerEl.classList.toggle('unseen', unseen);
      partnerEl.classList.toggle('seen', partnerStories.length > 0 && !unseen);
    }
    if (partnerButton) partnerButton.setAttribute('aria-label', storyPartnerLabel(partner, partnerStories.length));
  }

  let cameraStream = null;
  let cameraFacing = 'environment';

  function setCameraFeedback(message, options = {}) {
    const status = document.getElementById('usCameraStatus');
    const retry = document.getElementById('usCameraRetry');
    if (status) status.textContent = message;
    if (retry) retry.hidden = !options.retry;
  }

  function setCameraBusy(busy) {
    const capture = document.getElementById('usCameraCapture');
    const flip = document.getElementById('usCameraFlip');
    const retry = document.getElementById('usCameraRetry');
    if (capture) capture.disabled = busy;
    if (flip) flip.disabled = busy;
    if (retry) retry.disabled = busy;
  }

  async function publishStoryBlob(blob) {
    if (!window.usProfile || uploadBusy || !blob) return false;
    if (navigator.onLine === false) {
      setCameraFeedback('Sei offline. Riprova quando torni online.', { retry: true });
      return false;
    }
    uploadBusy = true;
    const plus = document.getElementById('usStoryAdd');
    plus?.classList.add('uploading');
    setCameraBusy(true);
    setCameraFeedback('Pubblico…');
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
      setCameraFeedback('Pubblicazione non riuscita.', { retry: true });
      return false;
    } finally {
      uploadBusy = false;
      plus?.classList.remove('uploading');
      setCameraBusy(false);
    }
  }

  async function retryPendingStoryUpload() {
    if (!pendingStoryBlob || uploadBusy) return false;
    const blob = pendingStoryBlob;
    const ok = await publishStoryBlob(blob);
    if (!ok) return false;
    pendingStoryBlob = null;
    closeStoryCamera();
    return true;
  }

  async function openStoryCamera() {
    if (!window.usProfile || uploadBusy) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('Fotocamera non disponibile su questo dispositivo');
      return;
    }
    const root = document.getElementById('usStoryCamera');
    const manage = document.getElementById('usCameraManage');
    root?.classList.add('open');
    root?.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';
    if (manage) manage.hidden = !storyRows.some((story) => story.author_id === window.usProfile.id);
    pendingStoryBlob = null;
    setCameraFeedback('Avvio fotocamera…');
    try {
      await startCameraStream();
      setCameraFeedback('Inquadra e scatta');
    } catch (error) {
      console.warn('[US Stories] camera', error);
      setCameraFeedback('Consenti l’accesso alla fotocamera nelle impostazioni');
      toast('Serve il permesso fotocamera');
    }
  }

  function openOwnStoriesFromCamera() {
    if (!window.usProfile || uploadBusy) return;
    closeStoryCamera();
    openStoriesFor(window.usProfile.id, true);
  }

  async function startCameraStream() {
    stopCameraStream();
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: cameraFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      const video = document.getElementById('usCameraVideo');
      if (video) {
        video.srcObject = cameraStream;
        await video.play();
      }
    } catch (error) {
      stopCameraStream();
      throw error;
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
    pendingStoryBlob = null;
    setCameraBusy(false);
    setCameraFeedback('Inquadra e scatta');
    document.body.style.overflow = '';
  }

  async function flipStoryCamera() {
    cameraFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFeedback('Cambio fotocamera…');
    try { await startCameraStream(); setCameraFeedback('Inquadra e scatta'); }
    catch (error) { console.warn(error); setCameraFeedback('Cambio fotocamera non riuscito.'); toast('Non riesco a cambiare fotocamera'); }
  }

  async function captureStoryPhoto() {
    if (uploadBusy || captureBusy) return;
    const video = document.getElementById('usCameraVideo');
    if (!video || !video.videoWidth || !video.videoHeight) return;
    captureBusy = true;
    setCameraBusy(true);
    try {
      setCameraFeedback('Preparo la foto…');
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
      if (!blob) { setCameraFeedback('Foto non acquisita.'); return; }
      pendingStoryBlob = blob;
      const ok = await publishStoryBlob(blob);
      if (ok) { pendingStoryBlob = null; closeStoryCamera(); }
    } finally {
      captureBusy = false;
      if (!uploadBusy) setCameraBusy(false);
    }
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
    window.UsUiFoundation?.cancelSurfaceExit?.(viewer);
    viewer?.classList.add('is-opening');
    viewer?.classList.add('open');
    viewer?.setAttribute('aria-hidden','false');
    requestAnimationFrame(() => viewer?.classList.remove('is-opening'));
    document.body.style.overflow = 'hidden';
    renderViewerHeader(author);
    await showStoryAt(currentViewerIndex);
  }

  async function renderViewerHeader(author) {
    const name = document.getElementById('usStoryAuthorName');
    if (name) name.textContent = author?.display_name || 'US.';
  }

  function clearStoryAdvance() {
    if (currentProgressFrame) cancelAnimationFrame(currentProgressFrame);
    currentProgressFrame = null;
    storyPlaybackElapsedMs = 0;
    storyPlaybackStartedAt = 0;
    storyPlaybackDurationMs = 0;
    storyPlaybackPaused = false;
    storyPlaybackBackgroundPaused = false;
  }

  function renderProgress(index, durationSeconds, running = false) {
    const root = document.getElementById('usStoryProgress');
    if (!root) return;
    root.innerHTML = currentViewerStories.map((_, i) => '<span class="us-story-progress-seg"><i data-i="' + i + '"></i></span>').join('');
    root.querySelectorAll('i').forEach((bar, i) => {
      bar.style.transition = 'none';
      bar.style.width = i < index ? '100%' : '0%';
    });
    const active = root.querySelector('i[data-i="' + index + '"]');
    if (active && running) active.style.width = '0%';
  }

  function isStoryReducedMotion() { return Boolean(window.UsUiFoundation?.isReducedMotion?.() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches); }
  function updateStoryProgress() {
    const active = document.querySelector('#usStoryProgress i[data-i="' + currentViewerIndex + '"]');
    if (active && storyPlaybackDurationMs) active.style.width = Math.min(100, (storyPlaybackElapsedMs / storyPlaybackDurationMs) * 100) + '%';
  }
  function runStoryPlayback() {
    if (storyPlaybackPaused || isStoryReducedMotion()) return;
    const tick = (now) => {
      if (storyPlaybackPaused || !storyPlaybackDurationMs) return;
      storyPlaybackElapsedMs = Math.min(storyPlaybackDurationMs, storyPlaybackElapsedMs + (now - storyPlaybackStartedAt));
      storyPlaybackStartedAt = now;
      updateStoryProgress();
      if (storyPlaybackElapsedMs >= storyPlaybackDurationMs) { currentProgressFrame = null; nextStory(); return; }
      currentProgressFrame = requestAnimationFrame(tick);
    };
    currentProgressFrame = requestAnimationFrame((now) => { storyPlaybackStartedAt = now; tick(now); });
  }
  function startStoryPlayback(durationSeconds) {
    storyPlaybackElapsedMs = 0;storyPlaybackDurationMs = durationSeconds * 1000;storyPlaybackStartedAt = performance.now();storyPlaybackPaused = false;
    if (isStoryReducedMotion()) return;
    runStoryPlayback();
  }
  function pauseStoryPlayback() {
    if (storyPlaybackPaused || !storyPlaybackDurationMs) return;
    storyPlaybackElapsedMs = Math.min(storyPlaybackDurationMs, storyPlaybackElapsedMs + (performance.now() - storyPlaybackStartedAt));
    storyPlaybackPaused = true;
    if (currentProgressFrame) cancelAnimationFrame(currentProgressFrame);
    currentProgressFrame = null;updateStoryProgress();
    document.getElementById('usStoryViewer')?.classList.add('is-paused');
  }
  function resumeStoryPlayback() {
    if (!storyPlaybackPaused || isStoryReducedMotion()) return;
    storyPlaybackPaused = false;document.getElementById('usStoryViewer')?.classList.remove('is-paused');runStoryPlayback();
  }
  function applyStoryMediaEntry(direction) {
    const media = document.getElementById('usStoryMedia');
    if (!media || !direction || isStoryReducedMotion()) return;
    media.classList.remove('us-story-enter-next','us-story-enter-prev');
    media.classList.add(direction > 0 ? 'us-story-enter-next' : 'us-story-enter-prev');
    requestAnimationFrame(() => media.classList.remove('us-story-enter-next','us-story-enter-prev'));
  }

  function setStoryViewerState(kind, message = '') {
    const state = document.getElementById('usStoryState');
    const text = document.getElementById('usStoryStateText');
    const retry = document.getElementById('usStoryRetry');
    if (state) {
      state.hidden = kind === 'ready';
      state.dataset.kind = kind;
    }
    if (text) text.textContent = message;
    if (retry) retry.hidden = kind !== 'error' && kind !== 'offline';
  }

  async function showStoryAt(index,direction=0) {
    clearStoryAdvance();
    if (index < 0) index = 0;
    if (index >= currentViewerStories.length) { closeStoryViewer(); return; }
    currentViewerIndex = index;
    const loadToken = ++storyLoadToken;
    const story = currentViewerStories[index];
    const duration = Math.min(STORY_SECONDS, Math.max(1, Number(story.duration_seconds || STORY_SECONDS)));
    renderProgress(index, duration, false);
    const media = document.getElementById('usStoryMedia');
    const caption = document.getElementById('usStoryCaption');
    const time = document.getElementById('usStoryTime');
    const deleteButton = document.getElementById('usStoryDelete');
    const viewer = document.getElementById('usStoryViewer');
    if (media) { media.hidden = true; media.removeAttribute('src'); }
    setStoryViewerState('loading', 'Carico la Story…');
    if (caption) {
      caption.hidden = !story.caption;
      caption.textContent = story.caption || '';
      caption.scrollTop = 0;
    }
    if (time) time.textContent = relativeStoryTime(story.created_at);
    if (deleteButton) deleteButton.hidden = story.author_id !== window.usProfile?.id;
    viewer?.classList.toggle('has-owner-actions', story.author_id === window.usProfile?.id);

    let storySignedUrl = null;
    try {
      if (typeof window.usGetSignedUrl === 'function') {
        storySignedUrl = await window.usGetSignedUrl(story.media_path, 600);
      } else {
        const { data, error } = await sb.storage.from('us-media').createSignedUrl(story.media_path, 600);
        if (error) console.warn('[US Stories] signed url', error);
        storySignedUrl = data?.signedUrl || null;
      }
    } catch (error) {
      console.warn('[US Stories] media url', error);
    }
    if (loadToken !== storyLoadToken) return;
    if (!storySignedUrl) {
      const offline = navigator.onLine === false;
      setStoryViewerState(offline ? 'offline' : 'error', offline ? 'Story non disponibile offline.' : 'Non riesco a caricare questa Story.');
      return;
    }
    if (!media) return;
    media.onload = () => {
      if (loadToken !== storyLoadToken || currentViewerStories[currentViewerIndex]?.id !== story.id) return;
      media.hidden = false;
      setStoryViewerState('ready');
      if (story.author_id !== window.usProfile?.id) markStorySeen(story.id);
      renderProgress(index, duration, true);
      applyStoryMediaEntry(direction);
      startStoryPlayback(duration);
    };
    media.onerror = () => {
      if (loadToken !== storyLoadToken) return;
      const offline = navigator.onLine === false;
      setStoryViewerState(offline ? 'offline' : 'error', offline ? 'Story non disponibile offline.' : 'La Story non si è caricata.');
    };
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
    showStoryAt(currentViewerIndex + 1,1);
  }

  function previousStory() {
    if (currentViewerIndex <= 0) {
      showStoryAt(0);
      return;
    }
    showStoryAt(currentViewerIndex - 1,-1);
  }

  async function deleteOwnStory(story) {
    const profile = window.usProfile;
    if (!profile || !story || story.author_id !== profile.id) return false;
    const { data, error } = await sb.from('stories')
      .delete()
      .eq('id', story.id)
      .eq('author_id', profile.id)
      .eq('couple_id', profile.couple_id)
      .select('id,media_path')
      .maybeSingle();
    if (error) throw error;
    if (!data) return false;
    if (data.media_path) {
      const { error: mediaError } = await sb.storage.from('us-media').remove([data.media_path]);
      if (mediaError) console.warn('[US Stories] delete media', mediaError);
    }
    return true;
  }

  function openStoryDeleteConfirmation() {
    const story = currentViewerStories[currentViewerIndex];
    if (!story || story.author_id !== window.usProfile?.id) return;
    clearStoryAdvance();
    pendingDeleteStoryId = story.id;
    const root = document.getElementById('usStoryDeleteConfirm');
    root?.classList.add('open');
    root?.setAttribute('aria-hidden','false');
  }

  function closeStoryDeleteConfirmation(options = {}) {
    const root = document.getElementById('usStoryDeleteConfirm');
    const shouldResume = options.resume !== false && pendingDeleteStoryId && document.getElementById('usStoryViewer')?.classList.contains('open');
    root?.classList.remove('open');
    root?.setAttribute('aria-hidden','true');
    pendingDeleteStoryId = null;
    if (shouldResume && currentViewerStories.length) showStoryAt(currentViewerIndex);
  }

  async function confirmCurrentStoryDelete() {
    const button = document.getElementById('usStoryDeleteConfirmBtn');
    if (button?.disabled) return;
    const deleteIndex = currentViewerStories.findIndex((row) => row.id === pendingDeleteStoryId);
    const story = currentViewerStories[deleteIndex];
    if (!story || story.author_id !== window.usProfile?.id) {
      closeStoryDeleteConfirmation({ resume: true });
      return;
    }
    if (button) { button.disabled = true; button.textContent = 'Elimino…'; }
    try {
      const deleted = await deleteOwnStory(story);
      if (!deleted) throw new Error('STORY_NOT_OWNED_OR_MISSING');
      closeStoryDeleteConfirmation({ resume: false });
      currentViewerStories.splice(deleteIndex, 1);
      storyRows = storyRows.filter((row) => row.id !== story.id);
      toast('Story eliminata');
      renderStoryRings();
      if (!currentViewerStories.length) closeStoryViewer();
      else {
        currentViewerIndex = Math.min(deleteIndex, currentViewerStories.length - 1);
        showStoryAt(currentViewerIndex);
      }
      refreshStories().catch(() => {});
    } catch (error) {
      console.warn('[US Stories] delete', error);
      toast('Non riesco a eliminare la Story');
    } finally {
      if (button) { button.disabled = false; button.textContent = 'Elimina'; }
    }
  }

  function resolveStoryGesture(startX, startY, endX, endY) {
    const dx = endX - startX;
    const dy = endY - startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (absX >= 64 && absX > absY * 1.15) return dx < 0 ? 'next' : 'previous';
    if (dy >= 72 && absY > absX * 1.15) return 'close';
    return null;
  }

  function shouldIgnoreStoryGestureTarget(target) {
    return Boolean(target?.closest?.('.us-story-caption,button,[data-us-story-gesture-ignore]'));
  }

  function wireStoryGestures() {
    const viewer = document.getElementById('usStoryViewer');
    if (!viewer || viewer.dataset.storyGestures === '1') return;
    viewer.dataset.storyGestures = '1';
    viewer.addEventListener('touchstart', (event) => {
      if (!viewer.classList.contains('open') || event.touches.length !== 1 || shouldIgnoreStoryGestureTarget(event.target)) return;
      storySwipeStartY = event.touches[0].clientY;
      storySwipeStartX = event.touches[0].clientX;
      storySwipeEndY = storySwipeStartY;
      storySwipeEndX = storySwipeStartX;
    }, { passive: true });
    viewer.addEventListener('touchmove', (event) => {
      if (storySwipeStartY === null || event.touches.length !== 1) return;
      storySwipeEndY = event.touches[0].clientY;
      storySwipeEndX = event.touches[0].clientX;
    }, { passive: true });
    const finish = (event) => {
      if (storySwipeStartY === null) return;
      const touch = event.changedTouches?.[0];
      if (touch) { storySwipeEndY = touch.clientY; storySwipeEndX = touch.clientX; }
      const action = resolveStoryGesture(storySwipeStartX, storySwipeStartY, storySwipeEndX, storySwipeEndY);
      storySwipeStartY = null; storySwipeStartX = null; storySwipeEndY = null; storySwipeEndX = null;
      if (action === 'close') {
        clearStoryAdvance();
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return closeStoryViewer();
        viewer.classList.add('story-swipe-closing');
        setTimeout(() => { viewer.classList.remove('story-swipe-closing'); closeStoryViewer(); }, 190);
      } else if (action === 'next') nextStory();
      else if (action === 'previous') previousStory();
    };
    viewer.addEventListener('touchend', finish, { passive: true });
    viewer.addEventListener('touchcancel', () => {
      storySwipeStartY = null; storySwipeStartX = null; storySwipeEndY = null; storySwipeEndX = null;
    }, { passive: true });
    viewer.addEventListener('pointerdown', (event) => {
      if (event.isPrimary && !shouldIgnoreStoryGestureTarget(event.target)) pauseStoryPlayback();
    });
    ['pointerup','pointercancel'].forEach(type => viewer.addEventListener(type, () => resumeStoryPlayback()));
  }

  function closeStoryViewer() {
    clearStoryAdvance();
    storyLoadToken += 1;
    closeStoryDeleteConfirmation({ resume: false });
    const viewer = document.getElementById('usStoryViewer');
    viewer?.classList.remove('open','story-swipe-closing');
    viewer?.classList.remove('is-opening','is-paused');
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

  function handleStoryKeydown(event) {
    if (event.key === 'Escape') {
      const surfaces = [
        ['usStoryDeleteConfirm', closeStoryDeleteConfirmation],
        ['usStoryCamera', closeStoryCamera],
        ['usStoryViewer', closeStoryViewer],
        ['usProfilePreview', closeProfilePreview]
      ];
      const active = surfaces.find(([id]) => document.getElementById(id)?.classList.contains('open'));
      if (!active) return;
      event.preventDefault();
      active[1]();
      return;
    }
    const viewerOpen = document.getElementById('usStoryViewer')?.classList.contains('open');
    if (!viewerOpen || shouldIgnoreStoryGestureTarget(event.target)) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); previousStory(); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); nextStory(); }
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
    injectUi();
    const timer = setInterval(async () => {
      if (await startForCurrentProfile()) clearInterval(timer);
    }, 450);
    setTimeout(() => startForCurrentProfile(), 100);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        closeStoryCamera();
        if (document.getElementById('usStoryViewer')?.classList.contains('open') && !storyPlaybackPaused) {
          pauseStoryPlayback();storyPlaybackBackgroundPaused = true;
        }
      }
      if (!document.hidden) {
        if (storyPlaybackBackgroundPaused) { storyPlaybackBackgroundPaused = false;resumeStoryPlayback(); }
        startForCurrentProfile();
        refreshStories({ refreshProfiles: true });
        scheduleTodayCloseIfNeeded();
      }
    });
    window.addEventListener('focus', () => refreshStories({ refreshProfiles: true }));
    document.addEventListener('keydown', handleStoryKeydown);
    sb.auth.onAuthStateChange(() => setTimeout(() => {
      initializedForUserId = null;
      startForCurrentProfile();
    }, 700));
    console.info('[US Stories] v19 partner bubble + swipe down');
  }

  boot();
})();
