const CACHE_NAME = "us-shell-v15";

const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png"
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
  if (window.__usFastRefreshInstalled) return;
  window.__usFastRefreshInstalled = true;

  let fastTimer = null;
  let profileTick = 0;

  async function runFastRefresh() {
    if (!window.usProfile || document.hidden) return;

    try {
      if (typeof hydrateToday === 'function') await hydrateToday();
    } catch (_) {}

    try {
      if (typeof updateHomeStatus === 'function') await updateHomeStatus();
    } catch (_) {}

    try {
      if (typeof refreshQuizState === 'function') await refreshQuizState();
    } catch (_) {}

    try {
      if (typeof hydrateDistance === 'function') await hydrateDistance();
    } catch (_) {}

    try {
      if (typeof hydrateBondSummary === 'function') await hydrateBondSummary();
    } catch (_) {}

    const activePage = document.querySelector('.page.active')?.id;

    if (activePage === 'moments') {
      try {
        if (typeof hydrateMoments === 'function') await hydrateMoments();
      } catch (_) {}
    }

    if (activePage === 'bond') {
      try {
        if (typeof hydrateBond === 'function') await hydrateBond();
      } catch (_) {}
    }

    if (activePage === 'think') {
      try {
        if (typeof hydrateThink === 'function') await hydrateThink();
      } catch (_) {}
    }

    profileTick++;
    if (profileTick >= 4) {
      profileTick = 0;
      try {
        if (typeof hydrateProfileAvatars === 'function') await hydrateProfileAvatars();
      } catch (_) {}
      try {
        if (typeof hydrateHomePhoto === 'function') await hydrateHomePhoto();
      } catch (_) {}
    }
  }

  function startFastRefresh() {
    if (fastTimer) clearInterval(fastTimer);
    fastTimer = setInterval(runFastRefresh, 3000);
    setTimeout(runFastRefresh, 500);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) runFastRefresh();
  });

  window.addEventListener('focus', runFastRefresh);
  window.addEventListener('online', runFastRefresh);

  startFastRefresh();

  console.info('[US Sync] Refresh rapido attivo: 3s');
})();
`;

const STORIES_BOOTSTRAP = "(() => {\n  if (window.__usStoriesV15Installed) return;\n  window.__usStoriesV15Installed = true;\n\n  const STORY_SECONDS = 10;\n  const STORY_LIFETIME_HOURS = 24;\n  const MAX_BATCH = 10;\n  const STORY_REFRESH_MS = 4000;\n  const PROFILE_REFRESH_MS = 20000;\n\n  let storyRows = [];\n  let storyViews = new Set();\n  let coupleProfiles = [];\n  let storyRealtimeChannel = null;\n  let storyRefreshTimer = null;\n  let profileRefreshTimer = null;\n  let currentViewerStories = [];\n  let currentViewerIndex = 0;\n  let currentViewerAuthor = null;\n  let storyAdvanceTimer = null;\n  let currentProgressFrame = null;\n  let uploadBusy = false;\n  let initializedForUserId = null;\n  let todayCloseTimer = null;\n\n  function addStyles() {\n    if (document.getElementById('usStoriesV15Styles')) return;\n    const style = document.createElement('style');\n    style.id = 'usStoriesV15Styles';\n    style.textContent = `\n      .us-stories-strip{display:flex;gap:18px;align-items:flex-start;padding:15px 18px 13px;margin:0 0 10px;overflow-x:auto;scrollbar-width:none}\n      .us-stories-strip::-webkit-scrollbar{display:none}\n      .us-story-person{position:relative;display:flex;flex-direction:column;align-items:center;gap:7px;min-width:74px}\n      .us-story-avatar-btn{appearance:none;border:0;background:transparent;padding:0;position:relative;display:grid;place-items:center;cursor:pointer}\n      .us-story-ring{width:68px;height:68px;border-radius:50%;padding:3px;display:grid;place-items:center;background:rgba(255,255,255,.11);transition:transform .16s ease,background .18s ease,opacity .18s ease}\n      .us-story-person.has-story .us-story-ring{background:linear-gradient(145deg,#ffffff 0%,#cfd6ff 38%,#ffb7cf 72%,#ffffff 100%)}\n      .us-story-person.unseen .us-story-ring{box-shadow:0 0 0 1px rgba(255,255,255,.15),0 0 22px rgba(199,206,255,.20)}\n      .us-story-person.seen .us-story-ring{background:rgba(255,255,255,.20);opacity:.78}\n      .us-story-avatar-btn:active .us-story-ring{transform:scale(.95)}\n      .us-story-avatar{width:62px;height:62px;border-radius:50%;overflow:hidden;background:#171a22;display:grid;place-items:center;border:2px solid #0d0f14;position:relative}\n      .us-story-avatar img{width:100%;height:100%;object-fit:cover;display:block}\n      .us-story-avatar .fallback{font-weight:750;font-size:22px;color:#f4f5f8}\n      .us-story-name{max-width:74px;font-size:12px;color:rgba(255,255,255,.74);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center}\n      .us-story-plus{position:absolute;right:0;top:48px;width:23px;height:23px;border-radius:50%;border:2px solid #0d0f14;background:#f4f5f8;color:#11131a;display:grid;place-items:center;font-size:18px;line-height:1;font-weight:600;z-index:3;box-shadow:0 3px 12px rgba(0,0,0,.24)}\n      .us-story-plus.uploading{opacity:.55;pointer-events:none}\n      .us-story-badge{position:absolute;left:50%;top:53px;transform:translateX(-50%);font-size:9px;font-weight:800;letter-spacing:.05em;background:rgba(13,15,20,.88);border:1px solid rgba(255,255,255,.12);padding:2px 5px;border-radius:999px;color:#fff;display:none}\n      .us-story-person.unseen .us-story-badge{display:block}\n\n      .us-story-viewer,.us-profile-preview{position:fixed;inset:0;z-index:10050;background:#05060a;display:none;align-items:center;justify-content:center;overflow:hidden}\n      .us-story-viewer.open,.us-profile-preview.open{display:flex}\n      .us-story-media{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#05060a}\n      .us-story-top{position:absolute;z-index:5;left:0;right:0;top:0;padding:calc(env(safe-area-inset-top,0px) + 12px) 14px 12px;background:linear-gradient(to bottom,rgba(0,0,0,.64),rgba(0,0,0,0));pointer-events:none}\n      .us-story-progress{display:flex;gap:4px;height:2px;margin-bottom:12px}\n      .us-story-progress-seg{flex:1;background:rgba(255,255,255,.32);overflow:hidden;border-radius:99px}\n      .us-story-progress-seg>i{display:block;width:0;height:100%;background:#fff;border-radius:99px}\n      .us-story-author-row{display:flex;align-items:center;gap:9px;color:#fff;min-height:34px;padding-right:48px}\n      .us-story-author-avatar{width:31px;height:31px;border-radius:50%;object-fit:cover;background:#191c25;border:1px solid rgba(255,255,255,.25)}\n      .us-story-author-fallback{width:31px;height:31px;border-radius:50%;display:grid;place-items:center;background:#191c25;border:1px solid rgba(255,255,255,.25);font-size:12px;font-weight:750}\n      .us-story-author-text b{display:block;font-size:13px;line-height:1.15}.us-story-author-text small{font-size:10px;opacity:.68}\n      .us-story-close{position:absolute;z-index:8;right:12px;top:calc(env(safe-area-inset-top,0px) + 31px);width:38px;height:38px;border:0;border-radius:50%;background:rgba(0,0,0,.28);color:white;font-size:28px;line-height:1;display:grid;place-items:center;backdrop-filter:blur(8px)}\n      .us-story-zone{position:absolute;z-index:4;top:92px;bottom:0;width:45%;border:0;background:transparent;padding:0}.us-story-zone.prev{left:0}.us-story-zone.next{right:0}\n      .us-story-caption{position:absolute;z-index:6;left:22px;right:22px;bottom:calc(env(safe-area-inset-bottom,0px) + 32px);color:#fff;text-align:center;font-size:14px;text-shadow:0 2px 10px rgba(0,0,0,.8);pointer-events:none}\n      .us-story-loading{position:absolute;z-index:2;color:rgba(255,255,255,.78);font-size:13px;letter-spacing:.02em}\n\n      .us-profile-preview{flex-direction:column;padding:30px;background:radial-gradient(circle at 50% 30%,#242838 0,#0b0d13 48%,#05060a 100%)}\n      .us-profile-preview-photo{width:min(78vw,360px);aspect-ratio:1;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,.88);box-shadow:0 22px 70px rgba(0,0,0,.5)}\n      .us-profile-preview-fallback{width:min(78vw,360px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:#171a24;border:3px solid rgba(255,255,255,.5);font-size:92px;font-weight:800;color:#fff}\n      .us-profile-preview-name{margin-top:22px;color:white;font-size:22px;font-weight:750}\n      .us-profile-preview-sub{margin-top:5px;color:rgba(255,255,255,.58);font-size:12px}\n      .us-profile-preview-close{position:absolute;right:14px;top:calc(env(safe-area-inset-top,0px) + 14px);width:42px;height:42px;border:0;border-radius:50%;background:rgba(255,255,255,.1);color:white;font-size:28px}\n\n      .us-today-autoclose{margin-top:10px;padding:9px 11px;border:1px solid rgba(255,255,255,.10);border-radius:12px;background:rgba(255,255,255,.04);font-size:11px;color:rgba(255,255,255,.62);text-align:center}\n      @media (min-width:700px){.us-stories-strip{justify-content:center}.us-story-ring{width:74px;height:74px}.us-story-avatar{width:68px;height:68px}}\n    `;\n    document.head.appendChild(style);\n  }\n\n  function injectUi() {\n    if (!document.getElementById('usStoriesStrip')) {\n      const strip = document.createElement('section');\n      strip.className = 'us-stories-strip';\n      strip.id = 'usStoriesStrip';\n      strip.setAttribute('aria-label','Stories private');\n      strip.innerHTML = `\n        <div class=\"us-story-person\" id=\"usStoryMe\">\n          <button type=\"button\" class=\"us-story-avatar-btn\" id=\"usStoryMeOpen\" aria-label=\"Le tue stories\">\n            <span class=\"us-story-ring\"><span class=\"us-story-avatar\"><img id=\"usStoryMeImg\" alt=\"La tua foto profilo\" hidden><span class=\"fallback\" id=\"usStoryMeFallback\">♡</span></span></span>\n            <span class=\"us-story-badge\">NUOVA</span>\n          </button>\n          <button type=\"button\" class=\"us-story-plus\" id=\"usStoryAdd\" aria-label=\"Aggiungi una story\">+</button>\n          <span class=\"us-story-name\" id=\"usStoryMeName\">Tu</span>\n        </div>\n        <div class=\"us-story-person\" id=\"usStoryPartner\">\n          <button type=\"button\" class=\"us-story-avatar-btn\" id=\"usStoryPartnerOpen\" aria-label=\"Stories del partner\">\n            <span class=\"us-story-ring\"><span class=\"us-story-avatar\"><img id=\"usStoryPartnerImg\" alt=\"Foto profilo partner\" hidden><span class=\"fallback\" id=\"usStoryPartnerFallback\">♡</span></span></span>\n            <span class=\"us-story-badge\">NUOVA</span>\n          </button>\n          <span class=\"us-story-name\" id=\"usStoryPartnerName\">Partner</span>\n        </div>\n        <input id=\"usStoryFiles\" type=\"file\" accept=\"image/jpeg,image/png,image/webp\" multiple hidden>\n      `;\n      const hero = document.querySelector('#home .hero');\n      if (hero) hero.insertAdjacentElement('afterend', strip);\n      else document.getElementById('home')?.prepend(strip);\n\n      document.getElementById('usStoryAdd')?.addEventListener('click', (event) => {\n        event.stopPropagation();\n        if (!uploadBusy) document.getElementById('usStoryFiles')?.click();\n      });\n      document.getElementById('usStoryMeOpen')?.addEventListener('click', () => openStoriesFor(window.usProfile?.id, true));\n      document.getElementById('usStoryPartnerOpen')?.addEventListener('click', () => {\n        const partner = getPartnerProfile();\n        if (partner) openStoriesFor(partner.id, false);\n      });\n      document.getElementById('usStoryFiles')?.addEventListener('change', handleStoryUpload);\n    }\n\n    if (!document.getElementById('usStoryViewer')) {\n      const viewer = document.createElement('div');\n      viewer.id = 'usStoryViewer';\n      viewer.className = 'us-story-viewer';\n      viewer.setAttribute('aria-hidden','true');\n      viewer.innerHTML = `\n        <div class=\"us-story-loading\" id=\"usStoryLoading\">Carico…</div>\n        <img class=\"us-story-media\" id=\"usStoryMedia\" alt=\"Story privata\" hidden>\n        <div class=\"us-story-top\">\n          <div class=\"us-story-progress\" id=\"usStoryProgress\"></div>\n          <div class=\"us-story-author-row\">\n            <img class=\"us-story-author-avatar\" id=\"usStoryAuthorImg\" alt=\"\" hidden>\n            <span class=\"us-story-author-fallback\" id=\"usStoryAuthorFallback\">♡</span>\n            <span class=\"us-story-author-text\"><b id=\"usStoryAuthorName\">US.</b><small id=\"usStoryTime\"></small></span>\n          </div>\n        </div>\n        <button type=\"button\" class=\"us-story-close\" id=\"usStoryClose\" aria-label=\"Chiudi\">×</button>\n        <button type=\"button\" class=\"us-story-zone prev\" id=\"usStoryPrev\" aria-label=\"Story precedente\"></button>\n        <button type=\"button\" class=\"us-story-zone next\" id=\"usStoryNext\" aria-label=\"Story successiva\"></button>\n        <div class=\"us-story-caption\" id=\"usStoryCaption\" hidden></div>\n      `;\n      document.body.appendChild(viewer);\n      document.getElementById('usStoryClose')?.addEventListener('click', closeStoryViewer);\n      document.getElementById('usStoryPrev')?.addEventListener('click', previousStory);\n      document.getElementById('usStoryNext')?.addEventListener('click', nextStory);\n    }\n\n    if (!document.getElementById('usProfilePreview')) {\n      const preview = document.createElement('div');\n      preview.id = 'usProfilePreview';\n      preview.className = 'us-profile-preview';\n      preview.setAttribute('aria-hidden','true');\n      preview.innerHTML = `\n        <button type=\"button\" class=\"us-profile-preview-close\" id=\"usProfilePreviewClose\" aria-label=\"Chiudi\">×</button>\n        <img class=\"us-profile-preview-photo\" id=\"usProfilePreviewImg\" alt=\"Foto profilo\" hidden>\n        <div class=\"us-profile-preview-fallback\" id=\"usProfilePreviewFallback\" hidden>♡</div>\n        <div class=\"us-profile-preview-name\" id=\"usProfilePreviewName\"></div>\n        <div class=\"us-profile-preview-sub\">solo voi due ♡</div>\n      `;\n      document.body.appendChild(preview);\n      preview.addEventListener('click', (event) => { if (event.target === preview) closeProfilePreview(); });\n      document.getElementById('usProfilePreviewClose')?.addEventListener('click', closeProfilePreview);\n    }\n  }\n\n  function getPartnerProfile() {\n    return coupleProfiles.find((p) => p.id !== window.usProfile?.id) || null;\n  }\n\n  async function loadProfiles() {\n    if (!window.usProfile) return;\n    const { data, error } = await sb.from('profiles')\n      .select('id,display_name,role,avatar_path')\n      .eq('couple_id', window.usProfile.couple_id);\n    if (error) { console.warn('[US Stories] profiles', error); return; }\n    coupleProfiles = data || [];\n    await renderStoryProfiles();\n  }\n\n  async function setStoryAvatar(imgId, fallbackId, profile) {\n    const img = document.getElementById(imgId);\n    const fallback = document.getElementById(fallbackId);\n    if (!img || !fallback || !profile) return;\n    fallback.textContent = (profile.display_name || '?').slice(0,1).toUpperCase();\n    let url = null;\n    try {\n      if (typeof signedAvatarUrl === 'function') url = await signedAvatarUrl(profile.avatar_path);\n    } catch (_) {}\n    if (url) {\n      img.src = url;\n      img.hidden = false;\n      fallback.style.display = 'none';\n    } else {\n      img.removeAttribute('src');\n      img.hidden = true;\n      fallback.style.display = 'grid';\n    }\n  }\n\n  async function renderStoryProfiles() {\n    if (!window.usProfile) return;\n    const me = coupleProfiles.find((p) => p.id === window.usProfile.id) || window.usProfile;\n    const partner = getPartnerProfile();\n    const meName = document.getElementById('usStoryMeName');\n    const partnerName = document.getElementById('usStoryPartnerName');\n    if (meName) meName.textContent = 'Tu';\n    if (partnerName) partnerName.textContent = partner?.display_name || 'Partner';\n    await setStoryAvatar('usStoryMeImg','usStoryMeFallback',me);\n    if (partner) await setStoryAvatar('usStoryPartnerImg','usStoryPartnerFallback',partner);\n  }\n\n  async function refreshStories(options = {}) {\n    if (!window.usProfile || document.hidden) return;\n    const now = new Date().toISOString();\n    const { data: rows, error } = await sb.from('stories')\n      .select('id,couple_id,author_id,media_path,caption,duration_seconds,created_at,expires_at')\n      .eq('couple_id', window.usProfile.couple_id)\n      .gt('expires_at', now)\n      .order('created_at', { ascending: true });\n    if (error) { console.warn('[US Stories] refresh', error); return; }\n    storyRows = rows || [];\n\n    const ids = storyRows.map((s) => s.id);\n    storyViews = new Set();\n    if (ids.length) {\n      const { data: views, error: viewError } = await sb.from('story_views')\n        .select('story_id,viewer_id,viewed_at')\n        .eq('viewer_id', window.usProfile.id)\n        .in('story_id', ids);\n      if (viewError) console.warn('[US Stories] views', viewError);\n      else (views || []).forEach((v) => storyViews.add(v.story_id));\n    }\n    renderStoryRings();\n    if (options.refreshProfiles) await loadProfiles();\n  }\n\n  function renderStoryRings() {\n    if (!window.usProfile) return;\n    const partner = getPartnerProfile();\n    const meStories = storyRows.filter((s) => s.author_id === window.usProfile.id);\n    const partnerStories = partner ? storyRows.filter((s) => s.author_id === partner.id) : [];\n    const meEl = document.getElementById('usStoryMe');\n    const partnerEl = document.getElementById('usStoryPartner');\n\n    if (meEl) {\n      meEl.classList.toggle('has-story', meStories.length > 0);\n      meEl.classList.remove('unseen','seen');\n    }\n    if (partnerEl) {\n      const unseen = partnerStories.some((s) => !storyViews.has(s.id));\n      partnerEl.classList.toggle('has-story', partnerStories.length > 0);\n      partnerEl.classList.toggle('unseen', unseen);\n      partnerEl.classList.toggle('seen', partnerStories.length > 0 && !unseen);\n    }\n  }\n\n  async function handleStoryUpload(event) {\n    if (!window.usProfile || uploadBusy) return;\n    const input = event.currentTarget;\n    const files = Array.from(input.files || []).slice(0, MAX_BATCH);\n    input.value = '';\n    if (!files.length) return;\n    uploadBusy = true;\n    const plus = document.getElementById('usStoryAdd');\n    plus?.classList.add('uploading');\n    let uploaded = 0;\n    try {\n      for (const file of files) {\n        if (!['image/jpeg','image/png','image/webp'].includes(file.type)) continue;\n        if (file.size > 20 * 1024 * 1024) { toast('Una foto supera 20 MB'); continue; }\n        let blob = file;\n        if (typeof compressImageFile === 'function') {\n          blob = await compressImageFile(file, { maxDimension: 1600, quality: .84 });\n        }\n        const path = window.usProfile.couple_id + '/' + window.usProfile.id + '/story-' + Date.now() + '-' + crypto.randomUUID() + '.webp';\n        const { error: uploadError } = await sb.storage.from('us-media').upload(path, blob, {\n          contentType: blob.type || file.type || 'image/webp', upsert: false, cacheControl: '3600'\n        });\n        if (uploadError) { console.warn(uploadError); continue; }\n        const expires = new Date(Date.now() + STORY_LIFETIME_HOURS * 3600000).toISOString();\n        const { error: rowError } = await sb.from('stories').insert({\n          couple_id: window.usProfile.couple_id,\n          author_id: window.usProfile.id,\n          media_path: path,\n          duration_seconds: STORY_SECONDS,\n          expires_at: expires\n        });\n        if (rowError) {\n          console.warn(rowError);\n          await sb.storage.from('us-media').remove([path]);\n          continue;\n        }\n        uploaded++;\n      }\n      if (uploaded) {\n        navigator.vibrate?.([28,18,38]);\n        toast(uploaded === 1 ? 'Story pubblicata ♡' : uploaded + ' stories pubblicate ♡');\n        await refreshStories();\n      } else {\n        toast('Non riesco a pubblicare la story');\n      }\n    } catch (error) {\n      console.warn('[US Stories] upload', error);\n      toast('Errore durante il caricamento');\n    } finally {\n      uploadBusy = false;\n      plus?.classList.remove('uploading');\n    }\n  }\n\n  async function openStoriesFor(authorId, own) {\n    if (!window.usProfile || !authorId) return;\n    await refreshStories();\n    const rows = storyRows.filter((s) => s.author_id === authorId);\n    const author = coupleProfiles.find((p) => p.id === authorId) || null;\n    if (!rows.length) {\n      if (own) document.getElementById('usStoryFiles')?.click();\n      else if (author) openProfilePreview(author);\n      return;\n    }\n    currentViewerStories = rows;\n    currentViewerAuthor = author;\n    const firstUnseen = own ? -1 : rows.findIndex((s) => !storyViews.has(s.id));\n    currentViewerIndex = firstUnseen >= 0 ? firstUnseen : 0;\n    const viewer = document.getElementById('usStoryViewer');\n    viewer?.classList.add('open');\n    viewer?.setAttribute('aria-hidden','false');\n    document.body.style.overflow = 'hidden';\n    renderViewerHeader(author);\n    await showStoryAt(currentViewerIndex);\n  }\n\n  async function renderViewerHeader(author) {\n    const name = document.getElementById('usStoryAuthorName');\n    const img = document.getElementById('usStoryAuthorImg');\n    const fallback = document.getElementById('usStoryAuthorFallback');\n    if (name) name.textContent = author?.display_name || 'US.';\n    if (fallback) fallback.textContent = (author?.display_name || '?').slice(0,1).toUpperCase();\n    let url = null;\n    try { if (author && typeof signedAvatarUrl === 'function') url = await signedAvatarUrl(author.avatar_path); } catch (_) {}\n    if (img && fallback) {\n      if (url) { img.src = url; img.hidden = false; fallback.style.display = 'none'; }\n      else { img.hidden = true; fallback.style.display = 'grid'; }\n    }\n  }\n\n  function clearStoryAdvance() {\n    if (storyAdvanceTimer) clearTimeout(storyAdvanceTimer);\n    storyAdvanceTimer = null;\n    if (currentProgressFrame) cancelAnimationFrame(currentProgressFrame);\n    currentProgressFrame = null;\n  }\n\n  function renderProgress(index, durationSeconds) {\n    const root = document.getElementById('usStoryProgress');\n    if (!root) return;\n    root.innerHTML = currentViewerStories.map((_, i) => '<span class=\"us-story-progress-seg\"><i data-i=\"' + i + '\"></i></span>').join('');\n    root.querySelectorAll('i').forEach((bar, i) => {\n      bar.style.transition = 'none';\n      bar.style.width = i < index ? '100%' : '0%';\n    });\n    const active = root.querySelector('i[data-i=\"' + index + '\"]');\n    if (active) {\n      currentProgressFrame = requestAnimationFrame(() => {\n        currentProgressFrame = requestAnimationFrame(() => {\n          active.style.transition = 'width ' + durationSeconds + 's linear';\n          active.style.width = '100%';\n        });\n      });\n    }\n  }\n\n  async function showStoryAt(index) {\n    clearStoryAdvance();\n    if (index < 0) index = 0;\n    if (index >= currentViewerStories.length) { closeStoryViewer(); return; }\n    currentViewerIndex = index;\n    const story = currentViewerStories[index];\n    const duration = Math.min(STORY_SECONDS, Math.max(1, Number(story.duration_seconds || STORY_SECONDS)));\n    renderProgress(index, duration);\n    const media = document.getElementById('usStoryMedia');\n    const loading = document.getElementById('usStoryLoading');\n    const caption = document.getElementById('usStoryCaption');\n    const time = document.getElementById('usStoryTime');\n    if (media) { media.hidden = true; media.removeAttribute('src'); }\n    if (loading) loading.hidden = false;\n    if (caption) {\n      caption.hidden = !story.caption;\n      caption.textContent = story.caption || '';\n    }\n    if (time) time.textContent = relativeStoryTime(story.created_at);\n\n    if (story.author_id !== window.usProfile?.id) markStorySeen(story.id);\n\n    const { data, error } = await sb.storage.from('us-media').createSignedUrl(story.media_path, 600);\n    if (error || !data?.signedUrl) {\n      console.warn('[US Stories] signed url', error);\n      nextStory();\n      return;\n    }\n    if (!media) return;\n    media.onload = () => {\n      if (currentViewerStories[currentViewerIndex]?.id !== story.id) return;\n      media.hidden = false;\n      if (loading) loading.hidden = true;\n      storyAdvanceTimer = setTimeout(nextStory, duration * 1000);\n    };\n    media.onerror = () => nextStory();\n    media.src = data.signedUrl;\n  }\n\n  async function markStorySeen(storyId) {\n    if (!window.usProfile || storyViews.has(storyId)) return;\n    storyViews.add(storyId);\n    renderStoryRings();\n    const { error } = await sb.from('story_views').insert({ story_id: storyId, viewer_id: window.usProfile.id });\n    if (error && error.code !== '23505') console.warn('[US Stories] mark seen', error);\n  }\n\n  function nextStory() {\n    if (currentViewerIndex + 1 >= currentViewerStories.length) {\n      closeStoryViewer();\n      refreshStories().catch(() => {});\n      return;\n    }\n    showStoryAt(currentViewerIndex + 1);\n  }\n\n  function previousStory() {\n    if (currentViewerIndex <= 0) {\n      showStoryAt(0);\n      return;\n    }\n    showStoryAt(currentViewerIndex - 1);\n  }\n\n  function closeStoryViewer() {\n    clearStoryAdvance();\n    const viewer = document.getElementById('usStoryViewer');\n    viewer?.classList.remove('open');\n    viewer?.setAttribute('aria-hidden','true');\n    const media = document.getElementById('usStoryMedia');\n    if (media) { media.removeAttribute('src'); media.hidden = true; }\n    document.body.style.overflow = '';\n    currentViewerStories = [];\n    currentViewerAuthor = null;\n  }\n\n  async function openProfilePreview(profile) {\n    const root = document.getElementById('usProfilePreview');\n    const img = document.getElementById('usProfilePreviewImg');\n    const fallback = document.getElementById('usProfilePreviewFallback');\n    const name = document.getElementById('usProfilePreviewName');\n    if (!root || !img || !fallback || !name) return;\n    name.textContent = profile.display_name || 'Partner';\n    fallback.textContent = (profile.display_name || '?').slice(0,1).toUpperCase();\n    let url = null;\n    try { if (typeof signedAvatarUrl === 'function') url = await signedAvatarUrl(profile.avatar_path); } catch (_) {}\n    if (url) { img.src = url; img.hidden = false; fallback.hidden = true; }\n    else { img.hidden = true; fallback.hidden = false; }\n    root.classList.add('open');\n    root.setAttribute('aria-hidden','false');\n    document.body.style.overflow = 'hidden';\n  }\n\n  function closeProfilePreview() {\n    const root = document.getElementById('usProfilePreview');\n    root?.classList.remove('open');\n    root?.setAttribute('aria-hidden','true');\n    document.body.style.overflow = '';\n  }\n\n  function relativeStoryTime(dateString) {\n    const ms = Math.max(0, Date.now() - new Date(dateString).getTime());\n    const mins = Math.floor(ms / 60000);\n    if (mins < 1) return 'ora';\n    if (mins < 60) return mins + ' min';\n    const hrs = Math.floor(mins / 60);\n    return hrs + (hrs === 1 ? ' ora' : ' ore');\n  }\n\n  async function cleanupOwnExpiredStories() {\n    if (!window.usProfile) return;\n    const now = new Date().toISOString();\n    const { data, error } = await sb.from('stories')\n      .select('id,media_path')\n      .eq('author_id', window.usProfile.id)\n      .lte('expires_at', now)\n      .limit(50);\n    if (error || !data?.length) return;\n    const paths = data.map((row) => row.media_path).filter(Boolean);\n    if (paths.length) await sb.storage.from('us-media').remove(paths);\n    await sb.from('stories').delete().in('id', data.map((row) => row.id));\n  }\n\n  function startStoryRealtime() {\n    if (!window.usProfile) return;\n    if (storyRealtimeChannel) sb.removeChannel(storyRealtimeChannel);\n    const coupleId = window.usProfile.couple_id;\n    const userId = window.usProfile.id;\n    storyRealtimeChannel = sb.channel('us-stories-' + userId)\n      .on('postgres_changes', { event: '*', schema: 'public', table: 'stories', filter: 'couple_id=eq.' + coupleId }, () => refreshStories())\n      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'story_views', filter: 'viewer_id=eq.' + userId }, () => refreshStories())\n      .subscribe();\n  }\n\n  function startStoryPolling() {\n    if (storyRefreshTimer) clearInterval(storyRefreshTimer);\n    storyRefreshTimer = setInterval(() => {\n      if (!document.hidden && window.usProfile) refreshStories();\n    }, STORY_REFRESH_MS);\n    if (profileRefreshTimer) clearInterval(profileRefreshTimer);\n    profileRefreshTimer = setInterval(() => {\n      if (!document.hidden && window.usProfile) loadProfiles();\n    }, PROFILE_REFRESH_MS);\n  }\n\n  function wireTodayAutoClose() {\n    if (window.__usTodayAutoCloseV15 || typeof hydrateToday !== 'function') return;\n    window.__usTodayAutoCloseV15 = true;\n    const originalHydrateToday = hydrateToday;\n    const wrapped = async function() {\n      const result = await originalHydrateToday.apply(this, arguments);\n      scheduleTodayCloseIfNeeded();\n      return result;\n    };\n    try { hydrateToday = wrapped; } catch (_) {}\n    window.hydrateToday = wrapped;\n  }\n\n  function scheduleTodayCloseIfNeeded() {\n    if (!window.usProfile || !window.todayState?.both_answered) return;\n    if (!document.getElementById('today')?.classList.contains('active')) return;\n    const d = new Date();\n    const dateKey = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');\n    const key = 'us-today-reveal-autoclosed:' + window.usProfile.id + ':' + dateKey;\n    try { if (localStorage.getItem(key) === '1') return; } catch (_) {}\n    if (todayCloseTimer) return;\n    const reveal = document.getElementById('todayReveal');\n    if (reveal && !document.getElementById('usTodayAutoCloseHint')) {\n      const hint = document.createElement('div');\n      hint.id = 'usTodayAutoCloseHint';\n      hint.className = 'us-today-autoclose';\n      hint.textContent = 'Reveal visto ♡ · torno alla Home tra pochi secondi';\n      reveal.appendChild(hint);\n    }\n    todayCloseTimer = setTimeout(() => {\n      todayCloseTimer = null;\n      if (!document.getElementById('today')?.classList.contains('active')) return;\n      try { localStorage.setItem(key, '1'); } catch (_) {}\n      if (typeof go === 'function') go('home');\n      if (typeof toast === 'function') toast('Today completato ♡');\n    }, 10000);\n  }\n\n  function connectExistingProfileAvatars() {\n    for (const profile of coupleProfiles) {\n      const slotId = profile.role === 'beatrice' ? 'pairAvatarBeatrice' : profile.role === 'francesco' ? 'pairAvatarFrancesco' : null;\n      if (!slotId) continue;\n      const slot = document.getElementById(slotId);\n      if (!slot || slot.dataset.storyConnected === profile.id) continue;\n      slot.dataset.storyConnected = profile.id;\n      slot.style.cursor = 'pointer';\n      slot.onclick = () => openStoriesFor(profile.id, profile.id === window.usProfile?.id);\n    }\n  }\n\n  async function startForCurrentProfile() {\n    if (!window.usProfile?.id) return false;\n    if (initializedForUserId === window.usProfile.id) return true;\n    initializedForUserId = window.usProfile.id;\n    injectUi();\n    wireTodayAutoClose();\n    await loadProfiles();\n    connectExistingProfileAvatars();\n    await cleanupOwnExpiredStories();\n    await refreshStories();\n    startStoryRealtime();\n    startStoryPolling();\n    return true;\n  }\n\n  function boot() {\n    addStyles();\n    injectUi();\n    const timer = setInterval(async () => {\n      if (await startForCurrentProfile()) clearInterval(timer);\n    }, 450);\n    setTimeout(() => startForCurrentProfile(), 100);\n    document.addEventListener('visibilitychange', () => {\n      if (!document.hidden) {\n        startForCurrentProfile();\n        refreshStories({ refreshProfiles: true });\n        scheduleTodayCloseIfNeeded();\n      }\n    });\n    window.addEventListener('focus', () => refreshStories({ refreshProfiles: true }));\n    document.addEventListener('keydown', (event) => {\n      if (event.key === 'Escape') { closeStoryViewer(); closeProfilePreview(); }\n    });\n    sb.auth.onAuthStateChange(() => setTimeout(() => {\n      initializedForUserId = null;\n      startForCurrentProfile();\n    }, 700));\n    console.info('[US Stories] v15 pronta');\n  }\n\n  boot();\n})();\n";

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
