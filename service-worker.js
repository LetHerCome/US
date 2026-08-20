const CACHE_NAME = "us-shell-fix5-1";

const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/fix4.css",
  "/fix4.js",
  "/fix5.css",
  "/fix5.js",
  "/version.json",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon-32.png",
  "/favicon.svg"
];

const AUTH_BOOTSTRAP = `
(() => {
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.warn('[US Auth] Supabase non disponibile');
    return;
  }

  const DB_NAME = 'us-pwa-auth';
  const STORE_NAME = 'sessions';
  let dbPromise = null;

  function openDb() {
    if (!('indexedDB' in window)) {
      return Promise.reject(new Error('IndexedDB unavailable'));
    }

    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || new Error('IndexedDB open failed'));
    });

    return dbPromise;
  }

  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () =>
        reject(request.error || new Error('IndexedDB read failed'));
    });
  }

  async function idbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error || new Error('IndexedDB write failed'));
      tx.onabort = () =>
        reject(tx.error || new Error('IndexedDB write aborted'));
    });
  }

  async function idbRemove(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error || new Error('IndexedDB delete failed'));
      tx.onabort = () =>
        reject(tx.error || new Error('IndexedDB delete aborted'));
    });
  }

  const durableAuthStorage = {
    async getItem(key) {
      try {
        const value = await idbGet(key);
        if (value !== null) return value;
      } catch (_) {}

      try {
        const legacyValue = window.localStorage.getItem(key);
        if (legacyValue !== null) {
          idbSet(key, legacyValue).catch(() => {});
          return legacyValue;
        }
      } catch (_) {}

      return null;
    },

    async setItem(key, value) {
      let persisted = false;

      try {
        await idbSet(key, value);
        persisted = true;
      } catch (_) {}

      try {
        window.localStorage.setItem(key, value);
        persisted = true;
      } catch (_) {}

      if (!persisted) {
        throw new Error('Unable to persist US auth session');
      }
    },

    async removeItem(key) {
      try { await idbRemove(key); } catch (_) {}
      try { window.localStorage.removeItem(key); } catch (_) {}
    }
  };

  const originalCreateClient =
    window.supabase.createClient.bind(window.supabase);

  window.supabase.createClient = (url, key, options = {}) => {
    return originalCreateClient(url, key, {
      ...options,
      auth: {
        ...(options.auth || {}),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: durableAuthStorage
      }
    });
  };

  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }

  console.info('[US Auth] Persistenza PWA attiva');
})();
`;


const FAST_REFRESH_BOOTSTRAP = `
(() => {
  if (window.__usFastRefreshV19Installed) return;
  window.__usFastRefreshV19Installed = true;

  let fastTimer = null;
  let running = false;

  async function runFastRefresh() {
    if (running || !window.usProfile || document.hidden) return;
    running = true;
    try {
      try { if (typeof hydrateToday === 'function') await hydrateToday(); } catch (_) {}
      try { if (typeof updateHomeStatus === 'function') await updateHomeStatus(); } catch (_) {}
      try { if (typeof refreshQuizState === 'function') await refreshQuizState(); } catch (_) {}
      try { if (typeof hydrateDistance === 'function') await hydrateDistance(); } catch (_) {}
      try { if (typeof hydrateBondSummary === 'function') await hydrateBondSummary(); } catch (_) {}

      const activePage = document.querySelector('.page.active')?.id;
      if (activePage === 'moments') {
        try { if (typeof hydrateMoments === 'function') await hydrateMoments(); } catch (_) {}
      }
      if (activePage === 'bond') {
        try { if (typeof hydrateBond === 'function') await hydrateBond(); } catch (_) {}
      }
      if (activePage === 'think') {
        try { if (typeof hydrateThink === 'function') await hydrateThink(); } catch (_) {}
      }
    } finally {
      running = false;
    }
  }

  function startFastRefresh() {
    if (fastTimer) clearInterval(fastTimer);
    fastTimer = setInterval(runFastRefresh, 3000);
    setTimeout(runFastRefresh, 500);
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) runFastRefresh(); });
  window.addEventListener('focus', runFastRefresh);
  window.addEventListener('online', runFastRefresh);

  startFastRefresh();
  console.info('[US Sync] v19 refresh dati 3s senza rerender immagini');
})();
`;

const STORIES_BOOTSTRAP = "(() => {\n  if (window.__usStoriesV19Installed) return;\n  window.__usStoriesV19Installed = true;\n\n  const STORY_SECONDS = 10;\n  const STORY_LIFETIME_HOURS = 24;\n  const MAX_BATCH = 10;\n  const STORY_REFRESH_MS = 4000;\n  const PROFILE_REFRESH_MS = 20000;\n\n  let storyRows = [];\n  let storyViews = new Set();\n  let coupleProfiles = [];\n  let storyRealtimeChannel = null;\n  let storyRefreshTimer = null;\n  let profileRefreshTimer = null;\n  let currentViewerStories = [];\n  let currentViewerIndex = 0;\n  let currentViewerAuthor = null;\n  let storyAdvanceTimer = null;\n  let currentProgressFrame = null;\n  let uploadBusy = false;\n  let initializedForUserId = null;\n  let todayCloseTimer = null;\n  let storySwipeStartY = 0;\n  let storySwipeStartX = 0;\n  let storySwipeDy = 0;\n  let storySwipeActive = false;\n\n  function addStyles() {\n    if (document.getElementById('usStoriesV19Styles')) return;\n    const old = document.getElementById('usStoriesV17Styles') || document.getElementById('usStoriesV15Styles');\n    old?.remove();\n    const style = document.createElement('style');\n    style.id = 'usStoriesV19Styles';\n    style.textContent = `\n      #usStoriesStrip{display:none!important}\n      .us-top-profiles{display:flex;align-items:center;gap:7px;margin-left:3px}\n      .us-top-story{position:relative;width:38px;height:38px;flex:0 0 38px}\n      .us-top-story-btn{appearance:none;border:0;background:transparent;padding:2px;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;cursor:pointer;position:relative}\n      .us-top-story-ring{width:36px;height:36px;border-radius:50%;padding:2px;display:grid;place-items:center;background:rgba(255,255,255,.11);transition:transform .16s ease,opacity .18s ease,background .18s ease}\n      .us-top-story.has-story .us-top-story-ring{background:linear-gradient(145deg,#fff 0%,#cfd6ff 40%,#ffb7cf 72%,#fff 100%)}\n      .us-top-story.seen .us-top-story-ring{background:rgba(255,255,255,.24);opacity:.78}\n      .us-top-story.unseen .us-top-story-ring{box-shadow:0 0 0 1px rgba(255,255,255,.14),0 0 14px rgba(199,206,255,.22)}\n      .us-top-story-btn:active .us-top-story-ring{transform:scale(.94)}\n      .us-top-story-avatar{width:32px;height:32px;border-radius:50%;overflow:hidden;background:#181b24;border:2px solid #0d0f14;display:grid;place-items:center;color:#fff;font-size:12px;font-weight:800}\n      .us-top-story-avatar img{width:100%;height:100%;object-fit:cover;display:block}\n      .us-top-story-plus{position:absolute;right:-3px;bottom:-2px;width:18px;height:18px;border-radius:50%;border:2px solid #0d0f14;background:#f4f5f8;color:#11131a;display:grid;place-items:center;font-size:14px;line-height:1;font-weight:800;z-index:5;padding:0}\n      .us-top-story-plus.uploading{opacity:.55;pointer-events:none}\n      .us-top-story-dot{position:absolute;right:0;top:0;width:8px;height:8px;border-radius:50%;background:#fff;border:2px solid #0d0f14;display:none;z-index:4}\n      .us-top-story.unseen .us-top-story-dot{display:block}\n      .us-story-add-only{appearance:none;width:30px;height:30px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.08);color:#fff;display:grid;place-items:center;font-size:20px;line-height:1;padding:0;cursor:pointer}\n      .us-story-add-only:active{transform:scale(.94)}\n      .us-story-add-only.uploading{opacity:.55;pointer-events:none}\n      #profileAvatarBtn{display:none!important}\n\n      .us-story-viewer,.us-profile-preview,.us-camera-viewer{position:fixed;inset:0;z-index:10050;background:#05060a;display:none;align-items:center;justify-content:center;overflow:hidden}\n      .us-story-viewer.open,.us-profile-preview.open,.us-camera-viewer.open{display:flex}\n      .us-story-viewer{transition:transform .22s cubic-bezier(.22,.78,.24,1),opacity .22s ease;touch-action:none;will-change:transform,opacity}\n      .us-story-viewer.story-swipe-closing{transform:translate3d(0,100vh,0)!important;opacity:0!important}\n      .us-story-media{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#05060a}\n      .us-story-top{position:absolute;z-index:5;left:0;right:0;top:0;padding:calc(env(safe-area-inset-top,0px) + 12px) 14px 12px;background:linear-gradient(to bottom,rgba(0,0,0,.64),rgba(0,0,0,0));pointer-events:none}\n      .us-story-progress{display:flex;gap:4px;height:2px;margin-bottom:12px}.us-story-progress-seg{flex:1;background:rgba(255,255,255,.32);overflow:hidden;border-radius:99px}.us-story-progress-seg>i{display:block;width:0;height:100%;background:#fff;border-radius:99px}\n      .us-story-author-row{display:flex;align-items:center;gap:9px;color:#fff;min-height:34px;padding-right:48px}.us-story-author-avatar{width:31px;height:31px;border-radius:50%;object-fit:cover;background:#191c25;border:1px solid rgba(255,255,255,.25)}.us-story-author-fallback{width:31px;height:31px;border-radius:50%;display:grid;place-items:center;background:#191c25;border:1px solid rgba(255,255,255,.25);font-size:12px;font-weight:750}.us-story-author-text b{display:block;font-size:13px;line-height:1.15}.us-story-author-text small{font-size:10px;opacity:.68}\n      .us-story-close{position:absolute;z-index:8;right:12px;top:calc(env(safe-area-inset-top,0px) + 31px);width:38px;height:38px;border:0;border-radius:50%;background:rgba(0,0,0,.28);color:white;font-size:28px;line-height:1;display:grid;place-items:center;backdrop-filter:blur(8px)}\n      .us-story-zone{position:absolute;z-index:4;top:92px;bottom:0;width:45%;border:0;background:transparent;padding:0}.us-story-zone.prev{left:0}.us-story-zone.next{right:0}.us-story-caption{position:absolute;z-index:6;left:22px;right:22px;bottom:calc(env(safe-area-inset-bottom,0px) + 32px);color:#fff;text-align:center;font-size:14px;text-shadow:0 2px 10px rgba(0,0,0,.8);pointer-events:none}.us-story-loading{position:absolute;z-index:2;color:rgba(255,255,255,.78);font-size:13px;letter-spacing:.02em}\n\n      .us-camera-viewer{background:#000;flex-direction:column}\n      .us-camera-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000}\n      .us-camera-shade{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.32),transparent 22%,transparent 70%,rgba(0,0,0,.52));pointer-events:none}\n      .us-camera-top{position:absolute;left:0;right:0;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;padding:calc(env(safe-area-inset-top,0px) + 14px) 16px 12px;color:#fff}\n      .us-camera-title{font-size:13px;font-weight:750;letter-spacing:.02em;text-shadow:0 1px 7px rgba(0,0,0,.5)}\n      .us-camera-icon-btn{width:40px;height:40px;border-radius:50%;border:0;background:rgba(0,0,0,.34);color:#fff;font-size:22px;display:grid;place-items:center;backdrop-filter:blur(8px)}\n      .us-camera-bottom{position:absolute;left:0;right:0;bottom:0;z-index:6;padding:18px 20px calc(env(safe-area-inset-bottom,0px) + 20px);display:grid;grid-template-columns:48px 1fr 48px;align-items:center}\n      .us-camera-capture{justify-self:center;width:74px;height:74px;border-radius:50%;border:4px solid rgba(255,255,255,.96);background:rgba(255,255,255,.20);padding:5px;box-shadow:0 5px 24px rgba(0,0,0,.35)}\n      .us-camera-capture::after{content:'';display:block;width:100%;height:100%;border-radius:50%;background:#fff}\n      .us-camera-capture:active{transform:scale(.94)}\n      .us-camera-status{position:absolute;left:20px;right:20px;bottom:calc(env(safe-area-inset-bottom,0px) + 112px);z-index:7;color:#fff;text-align:center;font-size:12px;text-shadow:0 2px 8px rgba(0,0,0,.7)}\n      .us-camera-flip{grid-column:3;width:44px;height:44px;border-radius:50%;border:0;background:rgba(0,0,0,.34);color:#fff;font-size:22px;display:grid;place-items:center;backdrop-filter:blur(8px)}\n\n      .us-profile-preview{flex-direction:column;padding:30px;background:radial-gradient(circle at 50% 30%,#242838 0,#0b0d13 48%,#05060a 100%)}\n      .us-profile-preview-photo{width:min(78vw,360px);aspect-ratio:1;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.88);box-shadow:0 22px 70px rgba(0,0,0,.5)}.us-profile-preview-fallback{width:min(78vw,360px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:#171a24;border:3px solid rgba(255,255,255,.5);font-size:92px;font-weight:800;color:#fff}.us-profile-preview-name{margin-top:22px;color:white;font-size:22px;font-weight:750}.us-profile-preview-sub{margin-top:5px;color:rgba(255,255,255,.58);font-size:12px}.us-profile-preview-close{position:absolute;right:14px;top:calc(env(safe-area-inset-top,0px) + 14px);width:42px;height:42px;border:0;border-radius:50%;background:rgba(255,255,255,.1);color:white;font-size:28px}\n      .us-today-autoclose{margin-top:10px;padding:9px 11px;border:1px solid rgba(255,255,255,.10);border-radius:12px;background:rgba(255,255,255,.04);font-size:11px;color:rgba(255,255,255,.62);text-align:center}\n    `;\n    document.head.appendChild(style);\n  }\n\n  function injectUi() {\n    document.getElementById('usStoriesStrip')?.remove();\n\n    if (!document.getElementById('usTopProfiles')) {\n      const root = document.createElement('div');\n      root.id = 'usTopProfiles';\n      root.className = 'us-top-profiles';\n      root.innerHTML = `\n        <div class=\"us-top-story\" id=\"usStoryPartner\">\n          <button type=\"button\" class=\"us-top-story-btn\" id=\"usStoryPartnerOpen\" aria-label=\"Stories del partner\">\n            <span class=\"us-top-story-ring\"><span class=\"us-top-story-avatar\"><img id=\"usStoryPartnerImg\" alt=\"Foto profilo partner\" hidden><span class=\"fallback\" id=\"usStoryPartnerFallback\">♡</span></span></span>\n            <span class=\"us-top-story-dot\" aria-hidden=\"true\"></span>\n          </button>\n        </div>\n        <button type=\"button\" class=\"us-story-add-only\" id=\"usStoryAdd\" aria-label=\"Aggiungi una story\">+</button>\n      `;\n      const actions = document.querySelector('.top .top-actions');\n      if (actions) actions.appendChild(root);\n      else document.querySelector('.top')?.appendChild(root);\n\n      document.getElementById('usStoryAdd')?.addEventListener('click', (event) => {\n        event.stopPropagation();\n        if (!uploadBusy) openStoryCamera();\n      });\n      document.getElementById('usStoryPartnerOpen')?.addEventListener('click', () => {\n        const partner = getPartnerProfile();\n        if (partner) openStoriesFor(partner.id, false);\n      });\n    }\n\n    if (!document.getElementById('usStoryViewer')) {\n      const viewer = document.createElement('div');\n      viewer.id = 'usStoryViewer';\n      viewer.className = 'us-story-viewer';\n      viewer.setAttribute('aria-hidden','true');\n      viewer.innerHTML = `\n        <div class=\"us-story-loading\" id=\"usStoryLoading\">Carico…</div>\n        <img class=\"us-story-media\" id=\"usStoryMedia\" alt=\"Story privata\" hidden>\n        <div class=\"us-story-top\"><div class=\"us-story-progress\" id=\"usStoryProgress\"></div><div class=\"us-story-author-row\"><span class=\"us-story-author-text\"><b id=\"usStoryAuthorName\">US.</b><small id=\"usStoryTime\"></small></span></div></div>\n        <button type=\"button\" class=\"us-story-close\" id=\"usStoryClose\" aria-label=\"Chiudi\">×</button>\n        <button type=\"button\" class=\"us-story-zone prev\" id=\"usStoryPrev\" aria-label=\"Story precedente\"></button>\n        <button type=\"button\" class=\"us-story-zone next\" id=\"usStoryNext\" aria-label=\"Story successiva\"></button>\n        <div class=\"us-story-caption\" id=\"usStoryCaption\" hidden></div>\n      `;\n      document.body.appendChild(viewer);\n      document.getElementById('usStoryClose')?.addEventListener('click', closeStoryViewer);\n      document.getElementById('usStoryPrev')?.addEventListener('click', previousStory);\n      document.getElementById('usStoryNext')?.addEventListener('click', nextStory);\n      wireStorySwipeDown();\n    }\n\n    if (!document.getElementById('usStoryCamera')) {\n      const camera = document.createElement('div');\n      camera.id = 'usStoryCamera';\n      camera.className = 'us-camera-viewer';\n      camera.setAttribute('aria-hidden','true');\n      camera.innerHTML = `\n        <video class=\"us-camera-video\" id=\"usCameraVideo\" playsinline autoplay muted></video>\n        <div class=\"us-camera-shade\"></div>\n        <div class=\"us-camera-top\"><button type=\"button\" class=\"us-camera-icon-btn\" id=\"usCameraClose\" aria-label=\"Chiudi fotocamera\">×</button><div class=\"us-camera-title\">Story privata · foto</div><span style=\"width:40px\"></span></div>\n        <div class=\"us-camera-status\" id=\"usCameraStatus\">Inquadra e scatta</div>\n        <div class=\"us-camera-bottom\"><span></span><button type=\"button\" class=\"us-camera-capture\" id=\"usCameraCapture\" aria-label=\"Scatta foto\"></button><button type=\"button\" class=\"us-camera-flip\" id=\"usCameraFlip\" aria-label=\"Cambia fotocamera\">↻</button></div>\n      `;\n      document.body.appendChild(camera);\n      document.getElementById('usCameraClose')?.addEventListener('click', closeStoryCamera);\n      document.getElementById('usCameraCapture')?.addEventListener('click', captureStoryPhoto);\n      document.getElementById('usCameraFlip')?.addEventListener('click', flipStoryCamera);\n    }\n\n    if (!document.getElementById('usProfilePreview')) {\n      const preview = document.createElement('div');\n      preview.id = 'usProfilePreview';\n      preview.className = 'us-profile-preview';\n      preview.setAttribute('aria-hidden','true');\n      preview.innerHTML = `<button type=\"button\" class=\"us-profile-preview-close\" id=\"usProfilePreviewClose\" aria-label=\"Chiudi\">×</button><img class=\"us-profile-preview-photo\" id=\"usProfilePreviewImg\" alt=\"Foto profilo\" hidden><div class=\"us-profile-preview-fallback\" id=\"usProfilePreviewFallback\" hidden>♡</div><div class=\"us-profile-preview-name\" id=\"usProfilePreviewName\"></div><div class=\"us-profile-preview-sub\">solo voi due ♡</div>`;\n      document.body.appendChild(preview);\n      preview.addEventListener('click', (event) => { if (event.target === preview) closeProfilePreview(); });\n      document.getElementById('usProfilePreviewClose')?.addEventListener('click', closeProfilePreview);\n    }\n  }\n\n  function getPartnerProfile() {\n    return coupleProfiles.find((p) => p.id !== window.usProfile?.id) || null;\n  }\n\n  async function loadProfiles() {\n    if (!window.usProfile) return;\n    const { data, error } = await sb.from('profiles')\n      .select('id,display_name,role,avatar_path')\n      .eq('couple_id', window.usProfile.couple_id);\n    if (error) { console.warn('[US Stories] profiles', error); return; }\n    coupleProfiles = data || [];\n    await renderStoryProfiles();\n  }\n\n  async function setStoryAvatar(imgId, fallbackId, profile) {\n    const img = document.getElementById(imgId);\n    const fallback = document.getElementById(fallbackId);\n    if (!img || !fallback || !profile) return;\n    fallback.textContent = (profile.display_name || '?').slice(0,1).toUpperCase();\n    let url = null;\n    try {\n      if (typeof signedAvatarUrl === 'function') url = await signedAvatarUrl(profile.avatar_path);\n    } catch (_) {}\n    if (url) {\n      img.src = url;\n      img.hidden = false;\n      fallback.style.display = 'none';\n    } else {\n      img.removeAttribute('src');\n      img.hidden = true;\n      fallback.style.display = 'grid';\n    }\n  }\n\n  async function renderStoryProfiles() {\n    if (!window.usProfile) return;\n    const partner = getPartnerProfile();\n    if (partner) await setStoryAvatar('usStoryPartnerImg','usStoryPartnerFallback',partner);\n  }\n\n  async function refreshStories(options = {}) {\n    if (!window.usProfile || document.hidden) return;\n    const now = new Date().toISOString();\n    const { data: rows, error } = await sb.from('stories')\n      .select('id,couple_id,author_id,media_path,caption,duration_seconds,created_at,expires_at')\n      .eq('couple_id', window.usProfile.couple_id)\n      .gt('expires_at', now)\n      .order('created_at', { ascending: true });\n    if (error) { console.warn('[US Stories] refresh', error); return; }\n    storyRows = rows || [];\n\n    const ids = storyRows.map((s) => s.id);\n    storyViews = new Set();\n    if (ids.length) {\n      const { data: views, error: viewError } = await sb.from('story_views')\n        .select('story_id,viewer_id,viewed_at')\n        .eq('viewer_id', window.usProfile.id)\n        .in('story_id', ids);\n      if (viewError) console.warn('[US Stories] views', viewError);\n      else (views || []).forEach((v) => storyViews.add(v.story_id));\n    }\n    renderStoryRings();\n    if (options.refreshProfiles) await loadProfiles();\n  }\n\n  function renderStoryRings() {\n    if (!window.usProfile) return;\n    const partner = getPartnerProfile();\n    const partnerStories = partner ? storyRows.filter((s) => s.author_id === partner.id) : [];\n    const partnerEl = document.getElementById('usStoryPartner');\n\n    if (partnerEl) {\n      const unseen = partnerStories.some((s) => !storyViews.has(s.id));\n      partnerEl.classList.toggle('has-story', partnerStories.length > 0);\n      partnerEl.classList.toggle('unseen', unseen);\n      partnerEl.classList.toggle('seen', partnerStories.length > 0 && !unseen);\n    }\n  }\n\n  let cameraStream = null;\n  let cameraFacing = 'environment';\n\n  async function publishStoryBlob(blob) {\n    if (!window.usProfile || uploadBusy || !blob) return false;\n    uploadBusy = true;\n    const plus = document.getElementById('usStoryAdd');\n    plus?.classList.add('uploading');\n    try {\n      let mediaBlob = blob;\n      if (typeof compressImageFile === 'function' && blob instanceof File) {\n        mediaBlob = await compressImageFile(blob, { maxDimension: 1600, quality: .84 });\n      }\n      const path = window.usProfile.couple_id + '/' + window.usProfile.id + '/story-' + Date.now() + '-' + crypto.randomUUID() + '.webp';\n      const { error: uploadError } = await sb.storage.from('us-media').upload(path, mediaBlob, { contentType: mediaBlob.type || 'image/webp', upsert: false, cacheControl: '3600' });\n      if (uploadError) throw uploadError;\n      const expires = new Date(Date.now() + STORY_LIFETIME_HOURS * 3600000).toISOString();\n      const { error: rowError } = await sb.from('stories').insert({ couple_id: window.usProfile.couple_id, author_id: window.usProfile.id, media_path: path, duration_seconds: STORY_SECONDS, expires_at: expires });\n      if (rowError) { await sb.storage.from('us-media').remove([path]); throw rowError; }\n      navigator.vibrate?.([28,18,38]);\n      toast('Story pubblicata ♡');\n      await refreshStories();\n      return true;\n    } catch (error) {\n      console.warn('[US Stories] camera upload', error);\n      toast('Non riesco a pubblicare la story');\n      return false;\n    } finally {\n      uploadBusy = false;\n      plus?.classList.remove('uploading');\n    }\n  }\n\n  async function openStoryCamera() {\n    if (!window.usProfile || uploadBusy) return;\n    if (!navigator.mediaDevices?.getUserMedia) {\n      toast('Fotocamera non disponibile su questo dispositivo');\n      return;\n    }\n    const root = document.getElementById('usStoryCamera');\n    const status = document.getElementById('usCameraStatus');\n    root?.classList.add('open');\n    root?.setAttribute('aria-hidden','false');\n    document.body.style.overflow = 'hidden';\n    if (status) status.textContent = 'Avvio fotocamera…';\n    try {\n      await startCameraStream();\n      if (status) status.textContent = 'Inquadra e scatta';\n    } catch (error) {\n      console.warn('[US Stories] camera', error);\n      if (status) status.textContent = 'Consenti l’accesso alla fotocamera nelle impostazioni';\n      toast('Serve il permesso fotocamera');\n    }\n  }\n\n  async function startCameraStream() {\n    stopCameraStream();\n    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: cameraFacing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });\n    const video = document.getElementById('usCameraVideo');\n    if (video) {\n      video.srcObject = cameraStream;\n      await video.play();\n    }\n  }\n\n  function stopCameraStream() {\n    if (cameraStream) {\n      cameraStream.getTracks().forEach((track) => track.stop());\n      cameraStream = null;\n    }\n    const video = document.getElementById('usCameraVideo');\n    if (video) video.srcObject = null;\n  }\n\n  function closeStoryCamera() {\n    stopCameraStream();\n    const root = document.getElementById('usStoryCamera');\n    root?.classList.remove('open');\n    root?.setAttribute('aria-hidden','true');\n    document.body.style.overflow = '';\n  }\n\n  async function flipStoryCamera() {\n    cameraFacing = cameraFacing === 'environment' ? 'user' : 'environment';\n    const status = document.getElementById('usCameraStatus');\n    if (status) status.textContent = 'Cambio fotocamera…';\n    try { await startCameraStream(); if (status) status.textContent = 'Inquadra e scatta'; }\n    catch (error) { console.warn(error); toast('Non riesco a cambiare fotocamera'); }\n  }\n\n  async function captureStoryPhoto() {\n    if (uploadBusy) return;\n    const video = document.getElementById('usCameraVideo');\n    const status = document.getElementById('usCameraStatus');\n    if (!video || !video.videoWidth || !video.videoHeight) return;\n    if (status) status.textContent = 'Pubblico…';\n    const max = 1600;\n    const scale = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));\n    const canvas = document.createElement('canvas');\n    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));\n    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));\n    const ctx = canvas.getContext('2d');\n    if (cameraFacing === 'user') {\n      ctx.translate(canvas.width, 0);\n      ctx.scale(-1, 1);\n    }\n    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);\n    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', .86));\n    if (!blob) { if (status) status.textContent = 'Riprova'; return; }\n    const ok = await publishStoryBlob(blob);\n    if (ok) closeStoryCamera();\n    else if (status) status.textContent = 'Riprova';\n  }\n\n  async function openStoriesFor(authorId, own) {\n    if (!window.usProfile || !authorId) return;\n    await refreshStories();\n    const rows = storyRows.filter((s) => s.author_id === authorId);\n    const author = coupleProfiles.find((p) => p.id === authorId) || null;\n    if (!rows.length) {\n      if (own) openStoryCamera();\n      else if (typeof toast === 'function') toast((author?.display_name || 'Il partner') + ' non ha stories attive');\n      return;\n    }\n    currentViewerStories = rows;\n    currentViewerAuthor = author;\n    const firstUnseen = own ? -1 : rows.findIndex((s) => !storyViews.has(s.id));\n    currentViewerIndex = firstUnseen >= 0 ? firstUnseen : 0;\n    const viewer = document.getElementById('usStoryViewer');\n    viewer?.classList.add('open');\n    viewer?.setAttribute('aria-hidden','false');\n    document.body.style.overflow = 'hidden';\n    renderViewerHeader(author);\n    await showStoryAt(currentViewerIndex);\n  }\n\n  async function renderViewerHeader(author) {\n    const name = document.getElementById('usStoryAuthorName');\n    if (name) name.textContent = author?.display_name || 'US.';\n  }\n\n  function clearStoryAdvance() {\n    if (storyAdvanceTimer) clearTimeout(storyAdvanceTimer);\n    storyAdvanceTimer = null;\n    if (currentProgressFrame) cancelAnimationFrame(currentProgressFrame);\n    currentProgressFrame = null;\n  }\n\n  function renderProgress(index, durationSeconds) {\n    const root = document.getElementById('usStoryProgress');\n    if (!root) return;\n    root.innerHTML = currentViewerStories.map((_, i) => '<span class=\"us-story-progress-seg\"><i data-i=\"' + i + '\"></i></span>').join('');\n    root.querySelectorAll('i').forEach((bar, i) => {\n      bar.style.transition = 'none';\n      bar.style.width = i < index ? '100%' : '0%';\n    });\n    const active = root.querySelector('i[data-i=\"' + index + '\"]');\n    if (active) {\n      currentProgressFrame = requestAnimationFrame(() => {\n        currentProgressFrame = requestAnimationFrame(() => {\n          active.style.transition = 'width ' + durationSeconds + 's linear';\n          active.style.width = '100%';\n        });\n      });\n    }\n  }\n\n  async function showStoryAt(index) {\n    clearStoryAdvance();\n    if (index < 0) index = 0;\n    if (index >= currentViewerStories.length) { closeStoryViewer(); return; }\n    currentViewerIndex = index;\n    const story = currentViewerStories[index];\n    const duration = Math.min(STORY_SECONDS, Math.max(1, Number(story.duration_seconds || STORY_SECONDS)));\n    renderProgress(index, duration);\n    const media = document.getElementById('usStoryMedia');\n    const loading = document.getElementById('usStoryLoading');\n    const caption = document.getElementById('usStoryCaption');\n    const time = document.getElementById('usStoryTime');\n    if (media) { media.hidden = true; media.removeAttribute('src'); }\n    if (loading) loading.hidden = false;\n    if (caption) {\n      caption.hidden = !story.caption;\n      caption.textContent = story.caption || '';\n    }\n    if (time) time.textContent = relativeStoryTime(story.created_at);\n\n    if (story.author_id !== window.usProfile?.id) markStorySeen(story.id);\n\n    const { data, error } = await sb.storage.from('us-media').createSignedUrl(story.media_path, 600);\n    if (error || !data?.signedUrl) {\n      console.warn('[US Stories] signed url', error);\n      nextStory();\n      return;\n    }\n    if (!media) return;\n    media.onload = () => {\n      if (currentViewerStories[currentViewerIndex]?.id !== story.id) return;\n      media.hidden = false;\n      if (loading) loading.hidden = true;\n      storyAdvanceTimer = setTimeout(nextStory, duration * 1000);\n    };\n    media.onerror = () => nextStory();\n    media.src = data.signedUrl;\n  }\n\n  async function markStorySeen(storyId) {\n    if (!window.usProfile || storyViews.has(storyId)) return;\n    storyViews.add(storyId);\n    renderStoryRings();\n    const { error } = await sb.from('story_views').insert({ story_id: storyId, viewer_id: window.usProfile.id });\n    if (error && error.code !== '23505') console.warn('[US Stories] mark seen', error);\n  }\n\n  function nextStory() {\n    if (currentViewerIndex + 1 >= currentViewerStories.length) {\n      closeStoryViewer();\n      refreshStories().catch(() => {});\n      return;\n    }\n    showStoryAt(currentViewerIndex + 1);\n  }\n\n  function previousStory() {\n    if (currentViewerIndex <= 0) {\n      showStoryAt(0);\n      return;\n    }\n    showStoryAt(currentViewerIndex - 1);\n  }\n\n  function wireStorySwipeDown() {\n    const viewer = document.getElementById('usStoryViewer');\n    if (!viewer || viewer.dataset.swipeDown === '1') return;\n    viewer.dataset.swipeDown = '1';\n    viewer.addEventListener('touchstart', (event) => {\n      if (!viewer.classList.contains('open') || event.touches.length !== 1) return;\n      storySwipeStartY = event.touches[0].clientY;\n      storySwipeStartX = event.touches[0].clientX;\n      storySwipeDy = 0; storySwipeActive = false;\n      viewer.style.transition = 'none';\n    }, { passive: true });\n    viewer.addEventListener('touchmove', (event) => {\n      if (!storySwipeStartY || event.touches.length !== 1) return;\n      const dy = event.touches[0].clientY - storySwipeStartY;\n      const dx = event.touches[0].clientX - storySwipeStartX;\n      if (dy <= 0 || Math.abs(dy) < Math.abs(dx) * 1.15) return;\n      storySwipeActive = true; storySwipeDy = dy;\n      clearStoryAdvance();\n      event.preventDefault();\n      const travel = Math.min(dy, 280);\n      viewer.style.transform = 'translate3d(0,' + travel + 'px,0)';\n      viewer.style.opacity = String(Math.max(.38, 1 - travel / 430));\n    }, { passive: false });\n    const finish = () => {\n      if (!storySwipeStartY) return;\n      const shouldClose = storySwipeActive && storySwipeDy > 92;\n      storySwipeStartY = 0; storySwipeStartX = 0;\n      viewer.style.transition = '';\n      if (shouldClose) {\n        viewer.classList.add('story-swipe-closing');\n        setTimeout(() => { viewer.classList.remove('story-swipe-closing'); closeStoryViewer(); }, 190);\n      } else {\n        viewer.style.transform = ''; viewer.style.opacity = '';\n        if (storySwipeActive && currentViewerStories.length) showStoryAt(currentViewerIndex);\n      }\n      storySwipeDy = 0; storySwipeActive = false;\n    };\n    viewer.addEventListener('touchend', finish, { passive: true });\n    viewer.addEventListener('touchcancel', finish, { passive: true });\n  }\n\n  function closeStoryViewer() {\n    clearStoryAdvance();\n    const viewer = document.getElementById('usStoryViewer');\n    viewer?.classList.remove('open','story-swipe-closing');\n    if (viewer) { viewer.style.transform=''; viewer.style.opacity=''; viewer.style.transition=''; }\n    viewer?.setAttribute('aria-hidden','true');\n    const media = document.getElementById('usStoryMedia');\n    if (media) { media.removeAttribute('src'); media.hidden = true; }\n    document.body.style.overflow = '';\n    currentViewerStories = [];\n    currentViewerAuthor = null;\n  }\n\n  async function openProfilePreview(profile) {\n    const root = document.getElementById('usProfilePreview');\n    const img = document.getElementById('usProfilePreviewImg');\n    const fallback = document.getElementById('usProfilePreviewFallback');\n    const name = document.getElementById('usProfilePreviewName');\n    if (!root || !img || !fallback || !name) return;\n    name.textContent = profile.display_name || 'Partner';\n    fallback.textContent = (profile.display_name || '?').slice(0,1).toUpperCase();\n    let url = null;\n    try { if (typeof signedAvatarUrl === 'function') url = await signedAvatarUrl(profile.avatar_path); } catch (_) {}\n    if (url) { img.src = url; img.hidden = false; fallback.hidden = true; }\n    else { img.hidden = true; fallback.hidden = false; }\n    root.classList.add('open');\n    root.setAttribute('aria-hidden','false');\n    document.body.style.overflow = 'hidden';\n  }\n\n  function closeProfilePreview() {\n    const root = document.getElementById('usProfilePreview');\n    root?.classList.remove('open');\n    root?.setAttribute('aria-hidden','true');\n    document.body.style.overflow = '';\n  }\n\n  function relativeStoryTime(dateString) {\n    const ms = Math.max(0, Date.now() - new Date(dateString).getTime());\n    const mins = Math.floor(ms / 60000);\n    if (mins < 1) return 'ora';\n    if (mins < 60) return mins + ' min';\n    const hrs = Math.floor(mins / 60);\n    return hrs + (hrs === 1 ? ' ora' : ' ore');\n  }\n\n  async function cleanupOwnExpiredStories() {\n    if (!window.usProfile) return;\n    const now = new Date().toISOString();\n    const { data, error } = await sb.from('stories')\n      .select('id,media_path')\n      .eq('author_id', window.usProfile.id)\n      .lte('expires_at', now)\n      .limit(50);\n    if (error || !data?.length) return;\n    const paths = data.map((row) => row.media_path).filter(Boolean);\n    if (paths.length) await sb.storage.from('us-media').remove(paths);\n    await sb.from('stories').delete().in('id', data.map((row) => row.id));\n  }\n\n  function startStoryRealtime() {\n    if (!window.usProfile) return;\n    if (storyRealtimeChannel) sb.removeChannel(storyRealtimeChannel);\n    const coupleId = window.usProfile.couple_id;\n    const userId = window.usProfile.id;\n    storyRealtimeChannel = sb.channel('us-stories-' + userId)\n      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories', filter: 'couple_id=eq.' + coupleId }, () => refreshStories())\n      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'story_views', filter: 'viewer_id=eq.' + userId }, () => refreshStories())\n      .subscribe();\n  }\n\n  function startStoryPolling() {\n    if (storyRefreshTimer) clearInterval(storyRefreshTimer);\n    storyRefreshTimer = setInterval(() => {\n      if (!document.hidden && window.usProfile) refreshStories();\n    }, STORY_REFRESH_MS);\n    if (profileRefreshTimer) clearInterval(profileRefreshTimer);\n    profileRefreshTimer = setInterval(() => {\n      if (!document.hidden && window.usProfile) loadProfiles();\n    }, PROFILE_REFRESH_MS);\n  }\n\n  function wireTodayAutoClose() {\n    if (window.__usTodayAutoCloseV15 || typeof hydrateToday !== 'function') return;\n    window.__usTodayAutoCloseV15 = true;\n    const originalHydrateToday = hydrateToday;\n    const wrapped = async function() {\n      const result = await originalHydrateToday.apply(this, arguments);\n      scheduleTodayCloseIfNeeded();\n      return result;\n    };\n    try { hydrateToday = wrapped; } catch (_) {}\n    window.hydrateToday = wrapped;\n  }\n\n  function scheduleTodayCloseIfNeeded() {\n    if (!window.usProfile || !window.todayState?.both_answered) return;\n    if (!document.getElementById('today')?.classList.contains('active')) return;\n    const d = new Date();\n    const dateKey = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');\n    const key = 'us-today-reveal-autoclosed:' + window.usProfile.id + ':' + dateKey;\n    try { if (localStorage.getItem(key) === '1') return; } catch (_) {}\n    if (todayCloseTimer) return;\n    const reveal = document.getElementById('todayReveal');\n    if (reveal && !document.getElementById('usTodayAutoCloseHint')) {\n      const hint = document.createElement('div');\n      hint.id = 'usTodayAutoCloseHint';\n      hint.className = 'us-today-autoclose';\n      hint.textContent = 'Reveal visto ♡ · torno alla Home tra pochi secondi';\n      reveal.appendChild(hint);\n    }\n    todayCloseTimer = setTimeout(() => {\n      todayCloseTimer = null;\n      if (!document.getElementById('today')?.classList.contains('active')) return;\n      try { localStorage.setItem(key, '1'); } catch (_) {}\n      if (typeof go === 'function') go('home');\n      if (typeof toast === 'function') toast('Today completato ♡');\n    }, 10000);\n  }\n\n  function connectExistingProfileAvatars() {\n    // Le Stories hanno un solo punto di ingresso: il pallino del partner in alto.\n  }\n\n  async function startForCurrentProfile() {\n    if (!window.usProfile?.id) return false;\n    if (initializedForUserId === window.usProfile.id) return true;\n    initializedForUserId = window.usProfile.id;\n    injectUi();\n    wireTodayAutoClose();\n    await loadProfiles();\n    connectExistingProfileAvatars();\n    await cleanupOwnExpiredStories();\n    await refreshStories();\n    startStoryRealtime();\n    startStoryPolling();\n    return true;\n  }\n\n  function boot() {\n    addStyles();\n    injectUi();\n    const timer = setInterval(async () => {\n      if (await startForCurrentProfile()) clearInterval(timer);\n    }, 450);\n    setTimeout(() => startForCurrentProfile(), 100);\n    document.addEventListener('visibilitychange', () => {\n      if (document.hidden) closeStoryCamera();\n      if (!document.hidden) {\n        startForCurrentProfile();\n        refreshStories({ refreshProfiles: true });\n        scheduleTodayCloseIfNeeded();\n      }\n    });\n    window.addEventListener('focus', () => refreshStories({ refreshProfiles: true }));\n    document.addEventListener('keydown', (event) => {\n      if (event.key === 'Escape') { closeStoryViewer(); closeProfilePreview(); closeStoryCamera(); }\n    });\n    sb.auth.onAuthStateChange(() => setTimeout(() => {\n      initializedForUserId = null;\n      startForCurrentProfile();\n    }, 700));\n    console.info('[US Stories] v19 partner bubble + swipe down');\n  }\n\n  boot();\n})();\n";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {
    try { data = { body: event.data?.text?.() || "Hai qualcosa di nuovo su US. ♡" }; } catch (_e) {}
  }
  const title = data.title || "US.";
  const options = {
    body: data.body || "Hai qualcosa di nuovo su US. ♡",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag: data.tag || "us-notification",
    renotify: false,
    data: {
      target: data.target || "home",
      url: data.url || "/?open=home&from=push"
    }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.target || "home";
  const targetUrl = new URL(data.url || `/?open=${encodeURIComponent(target)}&from=push`, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.focus();
        client.postMessage({ type: "US_PUSH_NAVIGATE", target });
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});

async function transformedAppJs(request) {
  try {
    const networkResponse = await fetch(request, { cache: "no-store" });

    if (!networkResponse.ok) throw new Error("app.js network error");

    const originalJs = await networkResponse.text();
    const combinedJs = AUTH_BOOTSTRAP + "\n\n" + originalJs + "\n\n" + FAST_REFRESH_BOOTSTRAP + "\n\n" + STORIES_BOOTSTRAP;

    const response = new Response(combinedJs, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });

    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());

    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/app.js") {
    event.respondWith(transformedAppJs(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) =>
            cache.put("/index.html", copy)
          );
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) =>
          cache.put(request, copy)
        );
        return response;
      })
      .catch(() => caches.match(request))
  );
});
