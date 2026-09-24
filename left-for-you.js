((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UsLeftForYou = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  const kinds = new Set(['text', 'photo', 'audio', 'video', 'music']);
  let items = [];
  let currentIndex = 0;
  let busy = false;
  let profiles = new Map();

  // M5F — unified envelope state machine (ONE control, no parallel system).
  // State A closed: at least one unseen item. State B open: everything seen.
  // Until the first server answer resolves, the control stays neutral/loading
  // and is safely non-interactive (never exposes closed/open prematurely).
  let unseenCount = 0;
  let envelopeResolved = false;
  let lastRenderedItemId = null;
  let envelopeOpeningTimer = null;
  let realtimeChannel = null;

  // M5F sender composer state.
  const composer = {
    kind: 'text',
    sending: false,
    recordingState: 'idle',
    recording: null,
    mediaRecorder: null,
    mediaStream: null,
    recordingChunks: [],
    recordingDiscarded: false,
    recordingStartedAt: 0,
    cameraStream: null,
    cameraFacing: 'environment',
    cameraCapture: null,
    cameraOpen: false,
    cameraRequestId: 0,
  };

  function getClient() {
    try { return sb; } catch (_) { return window.sb || null; }
  }

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // M5H — Spotify track link canonicalization, shared by the composer's manual
  // fallback and the receiver's embed. Track links only: playlists/albums/
  // artists/arbitrary hosts are rejected so the receiver never embeds them.
  const SPOTIFY_TRACK_ID_RE = /^[0-9A-Za-z]{22}$/;
  function extractSpotifyTrackId(raw) {
    const value = String(raw || '').trim();
    if (!value) return null;
    const uriMatch = value.match(/^spotify:track:([0-9A-Za-z]{22})$/);
    if (uriMatch) return uriMatch[1];
    let url;
    try { url = new URL(value); } catch (_) { return null; }
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com') return null;
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length === 2 && segments[0] === 'track') {
      return SPOTIFY_TRACK_ID_RE.test(segments[1]) ? segments[1] : null;
    }
    if (segments.length === 3 && /^intl-[a-z]{2,5}$/i.test(segments[0]) && segments[1] === 'track') {
      return SPOTIFY_TRACK_ID_RE.test(segments[2]) ? segments[2] : null;
    }
    return null;
  }
  function canonicalSpotifyTrackUrl(id) { return `https://open.spotify.com/track/${id}`; }
  function spotifyEmbedUrl(id) { return `https://open.spotify.com/embed/track/${id}`; }

  const isUnseen = (item) => !item?.seen_at;
  const partner = () => profiles.get(items[0]?.sender_id) || [...profiles.values()].find((p) => p.id !== window.usProfile?.id) || null;
  const labelForKind = (kind) => ({ text: 'Un pensiero', photo: 'Una foto', audio: 'Una voce', video: 'Un momento', music: 'Musica' }[kind] || 'Lasciato per te');

  function renderItemMarkup(item, mediaUrl = '') {
    const kind = kinds.has(item?.kind) ? item.kind : 'text';
    const body = item?.body ? `<p class="left-for-you-note">${escapeHtml(item.body)}</p>` : '';
    let content = '';
    if (kind === 'text') content = `<div class="left-for-you-text">${escapeHtml(item?.body || 'Un pensiero per te.')}</div>`;
    if (kind === 'photo') content = `<img class="left-for-you-photo" src="${escapeHtml(mediaUrl)}" alt="Foto lasciata per te" loading="eager">${body}`;
    if (kind === 'audio') content = `<div class="left-for-you-media-shell"><span class="left-for-you-media-mark" aria-hidden="true">◖</span><audio controls preload="metadata" src="${escapeHtml(mediaUrl)}"></audio></div>${body}`;
    if (kind === 'video') content = `<video class="left-for-you-video" controls preload="metadata" playsinline src="${escapeHtml(mediaUrl)}"></video>${body}`;
    if (kind === 'music') {
      const trackId = extractSpotifyTrackId(item?.media_path || '');
      content = trackId
        ? `<div class="left-for-you-music-embed"><iframe src="${escapeHtml(spotifyEmbedUrl(trackId))}" width="100%" height="152" frameborder="0" allow="encrypted-media" loading="lazy" title="Brano Spotify"></iframe><a class="left-for-you-music-fallback" href="${escapeHtml(canonicalSpotifyTrackUrl(trackId))}" target="_blank" rel="noreferrer noopener">Apri su Spotify ↗</a></div>${body}`
        : `<a class="left-for-you-music" href="${escapeHtml(item?.media_path || '')}" target="_blank" rel="noreferrer noopener"><span class="left-for-you-music-mark" aria-hidden="true">♪</span><span><b>Apri il brano</b><small>${escapeHtml(item?.media_path || '')}</small></span><span aria-hidden="true">↗</span></a>${body}`;
    }
    return `<article class="left-for-you-item" data-left-kind="${kind}"><div class="left-for-you-kind">${labelForKind(kind)}</div>${content}</article>`;
  }

  function root() { return document.getElementById('leftForYouOverlay'); }
  function setStatus(message, kind = '') {
    const status = document.getElementById('leftForYouStatus');
    if (status) { status.textContent = message || ''; status.dataset.kind = kind; }
  }
  function setVisible(id, visible) { const el = document.getElementById(id); if (el) el.hidden = !visible; }
  function partnerName() { return partner()?.display_name || 'La tua persona'; }

  function envelopeEl() { return document.getElementById('leftForYouPartnerEntry'); }

  function applyEnvelopeState({ transition = false } = {}) {
    const el = envelopeEl();
    if (!el) return;
    if (!envelopeResolved) {
      el.classList.add('is-loading');
      el.classList.remove('is-closed');
      el.classList.remove('is-open');
      el.setAttribute('aria-label', 'Lasciato per te');
      el.setAttribute('aria-busy', 'true');
      return;
    }
    el.classList.remove('is-loading');
    el.removeAttribute('aria-busy');
    const closed = unseenCount > 0;
    const wasClosed = el.classList.contains('is-closed');
    el.classList.toggle('is-closed', closed);
    el.classList.toggle('is-open', !closed);
    const personName = partnerName();
    el.setAttribute('aria-label', closed ? `${personName} ti ha lasciato qualcosa` : `Lascia qualcosa a ${personName}`);
    if (transition && !closed && wasClosed) {
      el.classList.add('is-opening');
      clearTimeout(envelopeOpeningTimer);
      envelopeOpeningTimer = setTimeout(() => el.classList.remove('is-opening'), 400);
    }
  }

  function updateEntry(count = 0) {
    unseenCount = count;
    applyEnvelopeState({ transition: true });
  }

  // Pure state derivation: unseen >= 1 → closed (State A); zero → open (State B).
  function envelopeStateFor(count = 0) {
    return count > 0 ? 'closed' : 'open';
  }

  function envelopeIsResolved() {
    return envelopeResolved;
  }

  async function loadProfiles() {
    const client = getClient();
    if (!window.usProfile || !client) return;
    const { data, error } = await client.from('profiles').select('id,display_name,role,avatar_path').eq('couple_id', window.usProfile.couple_id);
    if (error) throw error;
    profiles = new Map((data || []).map((profile) => [profile.id, profile]));
    const other = [...profiles.values()].find((profile) => profile.id !== window.usProfile.id);
    const name = document.getElementById('leftForYouPartnerName');
    const fromName = document.getElementById('leftForYouFromName');
    if (name) name.textContent = other?.display_name || 'La tua persona';
    if (fromName) fromName.textContent = other?.display_name || 'la tua persona';
    setPartnerAwareComposerLabels();
    applyEnvelopeState();
  }

  async function fetchItems() {
    const client = getClient();
    if (!window.usProfile || !client) throw new Error('sync_unavailable');
    const { data, error } = await client.from('left_for_you')
      .select('id,sender_id,recipient_id,kind,body,media_path,created_at,seen_at')
      .eq('recipient_id', window.usProfile.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    items = (data || []).filter((item) => kinds.has(item.kind));
    envelopeResolved = true;
    updateEntry(items.filter(isUnseen).length);
    return items;
  }

  async function markSeen(item) {
    const client = getClient();
    if (!item || item.seen_at || !client) return;
    const { data, error } = await client.rpc('mark_left_item_seen', { target_item_id: item.id });
    if (error) throw error;
    item.seen_at = data?.seen_at || new Date().toISOString();
    updateEntry(items.filter(isUnseen).length);
  }

  async function mediaUrl(item) {
    if (!item?.media_path || item.kind === 'music') return '';
    if (typeof window.usGetSignedUrl !== 'function') return '';
    return window.usGetSignedUrl(item.media_path);
  }

  async function renderCurrent() {
    const item = items[currentIndex];
    const content = document.getElementById('leftForYouContent');
    const counter = document.getElementById('leftForYouCounter');
    const conserve = document.getElementById('leftForYouConserve');
    if (!item || !content) return;
    content.innerHTML = '<div class="left-for-you-loading-inline" aria-busy="true">Apro il tuo messaggio…</div>';
    const url = await mediaUrl(item);
    content.innerHTML = renderItemMarkup(item, url);
    lastRenderedItemId = item.id;
    if (counter) counter.textContent = items.length > 1 ? `${currentIndex + 1} di ${items.length}` : '';
    if (conserve) {
      conserve.disabled = false;
      conserve.classList.toggle('is-conserved', Boolean(item.conserved));
      conserve.innerHTML = item.conserved ? '✓ Conservato' : 'Conserva';
    }
    await markSeen(item);
  }

  function showState(state) {
    setVisible('leftForYouLoading', state === 'loading');
    setVisible('leftForYouEmpty', state === 'empty');
    setVisible('leftForYouError', state === 'error');
    setVisible('leftForYouCard', state === 'ready');
  }

  async function load() {
    showState('loading'); setStatus('');
    try {
      await loadProfiles();
      await fetchItems();
      if (!items.length) { showState('empty'); return; }
      const firstUnseen = items.findIndex(isUnseen);
      if (firstUnseen >= 0) currentIndex = firstUnseen;
      showState('ready');
      await renderCurrent();
    } catch (error) {
      console.warn('[US Left for You]', error);
      showState('error'); setStatus('Non riesco ad aprire questo messaggio.', 'error');
    }
  }

  async function open() {
    const modal = root();
    if (!modal) return;
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
    await load();
  }

  function close() {
    const modal = root();
    if (!modal) return;
    modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true');
  }

  async function conserve() {
    const item = items[currentIndex];
    const client = getClient();
    if (!item || busy || item.conserved || !client) return;
    busy = true; const button = document.getElementById('leftForYouConserve');
    if (button) { button.disabled = true; button.textContent = 'Conservo…'; }
    try {
      const { data, error } = await client.rpc('conserve_left_for_you', { target_item_id: item.id });
      if (error) throw error;
      item.conserved = true;
      if (button) { button.classList.add('is-conserved'); button.textContent = data?.status === 'existing' ? '✓ Già conservato' : '✓ Conservato'; }
      setStatus(data?.status === 'existing' ? 'Era già tra le cose da custodire.' : 'Conservato per voi.', 'success');
    } catch (error) {
      console.warn('[US Left for You] conserve', error);
      if (button) { button.disabled = false; button.textContent = 'Conserva'; }
      setStatus('Non riesco a conservarlo. Riprova.', 'error');
    } finally { busy = false; }
  }

  async function retry() { await load(); }

  // M5F — ONE tap dispatcher: loading → inert; closed → next unseen item; open → sender composer.
  function tap() {
    if (!envelopeResolved) return;
    if (unseenCount > 0) { open(); return; }
    openComposer();
  }

  function alignCurrentToRenderedItem() {
    if (!lastRenderedItemId) return;
    const index = items.findIndex((item) => item.id === lastRenderedItemId);
    if (index >= 0) currentIndex = index;
  }

  function handleIncoming() {
    const overlayOpen = Boolean(root()?.classList.contains('open'));
    return fetchItems().then(() => { if (overlayOpen) alignCurrentToRenderedItem(); }).catch(() => {});
  }

  function subscribeRealtime() {
    const client = getClient();
    const me = window.usProfile;
    if (!client || !me || typeof client.channel !== 'function') return;
    if (realtimeChannel) {
      try { client.removeChannel(realtimeChannel); } catch (_) { /* channel already gone */ }
      realtimeChannel = null;
    }
    realtimeChannel = client.channel(`us-left-for-you-${me.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'left_for_you',
        filter: `recipient_id=eq.${me.id}`,
      }, () => handleIncoming());
    realtimeChannel.subscribe();
  }

  // ---- M5F sender composer ----

  function composerRoot() { return document.getElementById('leftForYouComposerOverlay'); }
  function setComposerStatus(message, kind = '') {
    const status = document.getElementById('leftForYouComposerStatus');
    if (status) { status.textContent = message || ''; status.dataset.kind = kind; }
  }

  function composerPartnerName() {
    return partner()?.display_name || 'la tua persona';
  }

  function setPartnerAwareComposerLabels() {
    const name = composerPartnerName();
    const title = document.getElementById('leftForYouComposerTitle');
    const send = document.getElementById('leftForYouComposerSend');
    const audioRecord = document.getElementById('leftForYouComposerAudioRecord');
    if (title) title.textContent = `Lascia qualcosa a ${name}`;
    if (send && !composer.sending) send.textContent = `Lascia per ${name}`;
    if (audioRecord) audioRecord.setAttribute('aria-label', composer.recordingState === 'recording' ? 'Ferma la registrazione' : 'Registra la voce');
    updateComposerValidity();
  }

  function setComposerKind(kind) {
    if (!kinds.has(kind)) return;
    composer.kind = kind;
    document.querySelectorAll('[data-us-composer-kind]').forEach((tab) => {
      const active = tab.dataset.usComposerKind === kind;
      tab.classList.toggle('is-active', kind === tab.dataset.usComposerKind);
      tab.setAttribute('aria-selected', kind === tab.dataset.usComposerKind ? 'true' : 'false');
    });
    document.querySelectorAll('[data-us-composer-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.usComposerPanel !== kind;
    });
    updateComposerValidity();
  }

  function openComposer() {
    const overlay = document.getElementById('leftForYouComposerOverlay');
    if (!overlay) return;
    overlay.classList.add('open'); overlay.setAttribute('aria-hidden', 'false');
    setComposerStatus('');
    setPartnerAwareComposerLabels();
    updateComposerValidity();
    // The composer must be ready to send: make sure the recipient profile is known.
    if (!partner()) loadProfiles().catch(() => {});
  }

  function closeComposer() {
    const overlay = document.getElementById('leftForYouComposerOverlay');
    if (!overlay) return;
    closeCamera();
    discardRecording();
    resetMusicSearchUi();
    overlay.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true');
  }

  function selectedComposerFile(kind = composer.kind) {
    if (kind === 'photo' && composer.cameraCapture?.selected && composer.cameraCapture.file) return composer.cameraCapture.file;
    const id = { photo: 'leftForYouComposerPhotoFile', video: 'leftForYouComposerVideoFile' }[kind];
    return id ? document.getElementById(id)?.files?.[0] || null : null;
  }

  function validMusicLink() {
    const value = (document.getElementById('leftForYouComposerMusic')?.value || '').trim();
    return Boolean(extractSpotifyTrackId(value)) && value.length <= 512;
  }

  // ---- M5H Spotify search (composer "music" panel) ----

  const musicSearch = { requestId: 0, timer: null };

  function musicSearchStatusEl() { return document.getElementById('leftForYouMusicSearchStatus'); }
  function setMusicSearchStatus(message, kind = '') {
    const status = musicSearchStatusEl();
    if (status) { status.textContent = message || ''; status.dataset.kind = kind; }
  }

  function renderMusicResults(tracks) {
    const list = document.getElementById('leftForYouMusicResults');
    if (!list) return;
    if (!tracks || !tracks.length) { list.hidden = true; list.innerHTML = ''; return; }
    list.innerHTML = tracks.slice(0, 5).map((track) => {
      const secondary = [track.artist, track.album].filter(Boolean).join(' · ');
      const cover = track.imageUrl
        ? `<img src="${escapeHtml(track.imageUrl)}" alt="" loading="lazy">`
        : '<span class="left-for-you-music-result-fallback" aria-hidden="true">♪</span>';
      return `<li role="option" tabindex="0" class="left-for-you-music-result" data-spotify-id="${escapeHtml(track.id || '')}" data-spotify-title="${escapeHtml(track.title || '')}" data-spotify-artist="${escapeHtml(track.artist || '')}" data-spotify-url="${escapeHtml(track.spotifyUrl || '')}">${cover}<span class="left-for-you-music-result-info"><b>${escapeHtml(track.title || '')}</b><small>${escapeHtml(secondary)}</small></span></li>`;
    }).join('');
    list.hidden = false;
  }

  function setMusicSelection(url, label) {
    const musicInput = document.getElementById('leftForYouComposerMusic');
    if (musicInput) musicInput.value = url || '';
    const selected = document.getElementById('leftForYouMusicSelected');
    const selectedLabel = document.getElementById('leftForYouMusicSelectedLabel');
    if (selectedLabel) selectedLabel.textContent = label || '';
    if (selected) selected.hidden = !url;
    updateComposerValidity();
  }

  function selectMusicResult(el) {
    const url = el?.dataset?.spotifyUrl;
    if (!url) return;
    const title = el.dataset.spotifyTitle || '';
    const artist = el.dataset.spotifyArtist || '';
    setMusicSelection(url, artist ? `${title} — ${artist}` : title);
    const list = document.getElementById('leftForYouMusicResults');
    if (list) { list.hidden = true; list.innerHTML = ''; }
    const search = document.getElementById('leftForYouMusicSearch');
    if (search) search.value = '';
    setMusicSearchStatus('');
    setComposerStatus('');
  }

  function clearMusicSelection() {
    setMusicSelection('', '');
  }

  function resetMusicSearchUi() {
    musicSearch.requestId += 1;
    clearTimeout(musicSearch.timer);
    musicSearch.timer = null;
    renderMusicResults([]);
    setMusicSearchStatus('');
  }

  // M5H — bounded, privacy-safe status text. Reads only the small {error:"code"}
  // body the Edge Function returns (never raw diagnostics); any parsing failure
  // safely falls back to the ordinary rate-limit copy.
  async function musicSearchErrorMessage(error) {
    const status = error?.context?.status;
    if (status !== 429) return 'Ricerca non disponibile ora. Puoi incollare il link.';
    let code = null;
    if (typeof error?.context?.json === 'function') {
      try { code = (await error.context.json())?.error || null; } catch (_) { code = null; }
    }
    if (code === 'quota_exceeded') return 'Hai esaurito le ricerche Spotify per ora. Riprova più tardi.';
    return 'Troppe ricerche su Spotify, riprova tra poco.';
  }

  async function runMusicSearch(query) {
    const client = getClient();
    const requestId = ++musicSearch.requestId;
    setMusicSearchStatus('Cerco…', 'loading');
    if (!client?.functions?.invoke) { setMusicSearchStatus('Ricerca non disponibile ora. Puoi incollare il link.', 'error'); return; }
    try {
      const { data, error } = await client.functions.invoke('spotify-search', { body: { query } });
      if (requestId !== musicSearch.requestId) return; // a newer search superseded this one
      if (error) {
        setMusicSearchStatus(await musicSearchErrorMessage(error), 'error');
        renderMusicResults([]);
        return;
      }
      const tracks = Array.isArray(data?.tracks) ? data.tracks.slice(0, 5) : [];
      setMusicSearchStatus(tracks.length ? '' : 'Nessun brano trovato.');
      renderMusicResults(tracks);
    } catch (error) {
      if (requestId !== musicSearch.requestId) return;
      console.warn('[US Left for You] spotify search', error);
      setMusicSearchStatus('Ricerca non disponibile ora. Puoi incollare il link.', 'error');
      renderMusicResults([]);
    }
  }

  function scheduleMusicSearch(rawValue) {
    const trimmed = String(rawValue || '').trim();
    clearTimeout(musicSearch.timer);
    if (trimmed.length < 2) {
      musicSearch.requestId += 1;
      musicSearch.timer = null;
      renderMusicResults([]);
      setMusicSearchStatus('');
      return;
    }
    musicSearch.timer = setTimeout(() => runMusicSearch(trimmed), 350);
  }

  function composerCanSend() {
    if (composer.sending) return false;
    if (composer.kind === 'text') return Boolean((document.getElementById('leftForYouComposerText')?.value || '').trim());
    if (composer.kind === 'photo' || composer.kind === 'video') return Boolean(selectedComposerFile());
    if (composer.kind === 'audio') return Boolean(composer.recording?.ready && composer.recording.file);
    if (composer.kind === 'music') return validMusicLink();
    return false;
  }

  function updateComposerValidity() {
    const button = document.getElementById('leftForYouComposerSend');
    if (button) button.disabled = !composerCanSend();
    updateRecorderUi();
    return composerCanSend();
  }

  function releaseCameraStream(stream = composer.cameraStream) {
    for (const track of stream?.getTracks?.() || stream?.tracks || []) {
      try { track.stop?.(); } catch (_) { /* already stopped */ }
    }
    if (!stream || stream === composer.cameraStream) composer.cameraStream = null;
    const preview = document.getElementById('leftForYouCameraPreview');
    if (preview && (!stream || preview.srcObject === stream)) preview.srcObject = null;
  }

  function setCameraStatus(message, kind = '') {
    const status = document.getElementById('leftForYouCameraStatus');
    if (status) { status.textContent = message || ''; status.dataset.kind = kind; }
  }

  function updateCameraUi() {
    const overlay = document.getElementById('leftForYouCameraOverlay');
    const preview = document.getElementById('leftForYouCameraPreview');
    const captured = document.getElementById('leftForYouCameraCaptured');
    const capture = document.getElementById('leftForYouCameraCapture');
    const use = document.getElementById('leftForYouCameraUse');
    const retake = document.getElementById('leftForYouCameraRetake');
    const switcher = document.getElementById('leftForYouCameraSwitch');
    const hasCapture = Boolean(composer.cameraCapture);
    if (overlay) { overlay.classList.toggle('open', composer.cameraOpen); overlay.setAttribute('aria-hidden', composer.cameraOpen ? 'false' : 'true'); }
    if (preview) preview.hidden = hasCapture;
    if (captured) { captured.hidden = !hasCapture; if (hasCapture && composer.cameraCapture.url) captured.src = composer.cameraCapture.url; }
    if (capture) capture.hidden = hasCapture;
    if (use) use.hidden = !hasCapture;
    if (retake) retake.hidden = !hasCapture;
    if (switcher) switcher.hidden = hasCapture || switcher.disabled;
  }

  async function requestCameraStream(facing = composer.cameraFacing) {
    const mediaDevices = window.navigator?.mediaDevices;
    if (!mediaDevices?.getUserMedia) throw new Error('camera_unavailable');
    const requestId = ++composer.cameraRequestId;
    releaseCameraStream();
    try {
      const stream = await mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
      if (!composer.cameraOpen || requestId !== composer.cameraRequestId) { releaseCameraStream(stream); return null; }
      composer.cameraStream = stream;
      composer.cameraFacing = facing;
      const preview = document.getElementById('leftForYouCameraPreview');
      if (preview) { preview.srcObject = stream; try { await preview.play?.(); } catch (_) { /* autoplay policy */ } }
      updateCameraUi();
      return stream;
    } catch (error) {
      if (facing === 'environment' && !['NotAllowedError', 'SecurityError'].includes(error?.name)) {
        try { return await requestCameraStream('user'); } catch (_) { /* report below */ }
      }
      throw error;
    }
  }

  async function openCamera() {
    if (composer.cameraOpen) return;
    composer.cameraOpen = true;
    discardCameraCapture();
    composer.cameraFacing = 'environment';
    updateCameraUi();
    try {
      const devices = await window.navigator?.mediaDevices?.enumerateDevices?.();
      const switcher = document.getElementById('leftForYouCameraSwitch');
      if (switcher) switcher.hidden = (devices || []).filter((device) => device.kind === 'videoinput').length < 2;
      await requestCameraStream('environment');
    } catch (error) {
      composer.cameraOpen = false;
      releaseCameraStream();
      updateCameraUi();
      setComposerStatus(error?.name === 'NotAllowedError' ? 'La fotocamera non è disponibile. Controlla i permessi e riprova.' : 'Non riesco ad aprire la fotocamera su questo dispositivo.', 'error');
    }
  }

  function closeCamera() {
    composer.cameraOpen = false;
    ++composer.cameraRequestId;
    releaseCameraStream();
    if (composer.cameraCapture?.url && typeof window.URL?.revokeObjectURL === 'function') window.URL.revokeObjectURL(composer.cameraCapture.url);
    composer.cameraCapture = null;
    updateCameraUi();
    updateComposerValidity();
  }

  async function switchCamera() {
    if (!composer.cameraOpen || composer.cameraCapture) return;
    const next = composer.cameraFacing === 'environment' ? 'user' : 'environment';
    try { await requestCameraStream(next); } catch (_) { setCameraStatus('Questa fotocamera non è disponibile.', 'error'); }
  }

  function retakeCameraPhoto() {
    if (!composer.cameraOpen) return;
    if (composer.cameraCapture?.url && typeof window.URL?.revokeObjectURL === 'function') window.URL.revokeObjectURL(composer.cameraCapture.url);
    composer.cameraCapture = null;
    setCameraStatus('');
    updateCameraUi();
    requestCameraStream(composer.cameraFacing).catch(() => setCameraStatus('Non riesco a riaprire la fotocamera.', 'error'));
  }

  function useCameraPhoto() {
    if (!composer.cameraCapture) return;
    composer.cameraCapture.selected = true;
    composer.cameraOpen = false;
    ++composer.cameraRequestId;
    releaseCameraStream();
    updateCameraUi();
    updateComposerValidity();
  }

  async function captureCameraPhoto() {
    if (!composer.cameraOpen || !composer.cameraStream) return;
    const preview = document.getElementById('leftForYouCameraPreview');
    const width = preview.videoWidth || preview.clientWidth || 1280;
    const height = preview.videoHeight || preview.clientHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d')?.drawImage(preview, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) { setCameraStatus('Non riesco a catturare la foto. Riprova.', 'error'); return; }
    const file = typeof File === 'function' ? new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' }) : blob;
    const url = typeof window.URL?.createObjectURL === 'function' ? window.URL.createObjectURL(blob) : '';
    composer.cameraCapture = { file, url, selected: false };
    releaseCameraStream();
    updateCameraUi();
    updateComposerValidity();
  }

  function discardCameraCapture() {
    if (composer.cameraCapture?.url && typeof window.URL?.revokeObjectURL === 'function') window.URL.revokeObjectURL(composer.cameraCapture.url);
    composer.cameraCapture = null;
    updateComposerValidity();
  }

  function recordingMimeType() {
    const MediaRecorderCtor = window.MediaRecorder;
    if (!MediaRecorderCtor) return '';
    const candidates = ['audio/webm', 'audio/mp4'];
    return candidates.find((type) => typeof MediaRecorderCtor.isTypeSupported !== 'function' || MediaRecorderCtor.isTypeSupported(type)) || '';
  }

  function releaseMediaStream() {
    for (const track of composer.mediaStream?.getTracks?.() || composer.mediaStream?.tracks || []) {
      try { track.stop(); } catch (_) { /* stream already released */ }
    }
    composer.mediaStream = null;
  }

  function clearRecordingTimer() {
    if (composer.recordingTimer) clearInterval(composer.recordingTimer);
    composer.recordingTimer = null;
  }

  function formatRecordingDuration(seconds) {
    const safe = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
  }

  function updateRecordingTimer() {
    const timer = document.getElementById('leftForYouComposerAudioTimer');
    if (!timer || composer.recordingState !== 'recording') return;
    timer.textContent = formatRecordingDuration((Date.now() - composer.recordingStartedAt) / 1000);
  }

  function updateRecorderUi() {
    const record = document.getElementById('leftForYouComposerAudioRecord');
    const timer = document.getElementById('leftForYouComposerAudioTimer');
    const preview = document.getElementById('leftForYouComposerAudioPreview');
    const retry = document.getElementById('leftForYouComposerAudioRetry');
    const remove = document.getElementById('leftForYouComposerAudioDelete');
    if (!record) return;
    const state = composer.recordingState;
    record.setAttribute('aria-label', state === 'recording' ? 'Ferma la registrazione' : 'Registra la voce');
    record.classList.toggle('is-recording', state === 'recording');
    record.hidden = state === 'ready';
    record.disabled = composer.sending || state === 'starting';
    if (timer) {
      timer.hidden = state !== 'recording';
      if (state === 'idle') timer.textContent = '00:00';
    }
    if (preview) {
      preview.hidden = state !== 'ready';
      if (state === 'ready' && composer.recording?.url) preview.src = composer.recording.url;
      if (state !== 'ready') preview.removeAttribute('src');
    }
    if (retry) retry.hidden = state !== 'ready';
    if (remove) remove.hidden = state !== 'ready';
  }

  function makeRecordedFile(blob) {
    const extension = String(blob?.type || '').includes('mp4') ? 'm4a' : 'webm';
    try { Object.defineProperty(blob, 'name', { value: `voce-${Date.now()}.${extension}` }); } catch (_) { /* Blob remains uploadable */ }
    return blob;
  }

  function discardRecording() {
    composer.recordingDiscarded = true;
    clearRecordingTimer();
    const recorder = composer.mediaRecorder;
    if (recorder && recorder.state === 'recording') {
      try { recorder.stop(); } catch (_) { /* recorder already stopped */ }
    }
    releaseMediaStream();
    composer.mediaRecorder = null;
    composer.recordingChunks = [];
    if (composer.recording?.url && typeof window.URL?.revokeObjectURL === 'function') window.URL.revokeObjectURL(composer.recording.url);
    composer.recording = null;
    composer.recordingState = 'idle';
    updateRecorderUi();
    updateComposerValidity();
  }

  async function startRecording() {
    if (composer.sending || composer.recordingState === 'recording' || composer.recordingState === 'starting') return;
    const mediaDevices = window.navigator?.mediaDevices;
    const MediaRecorderCtor = window.MediaRecorder;
    if (!mediaDevices?.getUserMedia || !MediaRecorderCtor) {
      setComposerStatus('La registrazione vocale non è disponibile in questo browser.', 'error');
      return;
    }
    discardRecording();
    composer.recordingDiscarded = false;
    composer.recordingState = 'starting';
    updateRecorderUi();
    try {
      const stream = await mediaDevices.getUserMedia({ audio: true });
      if (composer.recordingState !== 'starting') {
        for (const track of stream.getTracks?.() || stream.tracks || []) track.stop?.();
        return;
      }
      composer.mediaStream = stream;
      composer.recordingChunks = [];
      const mimeType = recordingMimeType();
      const recorder = mimeType ? new MediaRecorderCtor(stream, { mimeType }) : new MediaRecorderCtor(stream);
      composer.mediaRecorder = recorder;
      composer.recordingState = 'recording';
      composer.recordingStartedAt = Date.now();
      recorder.ondataavailable = (event) => { if (event.data?.size) composer.recordingChunks.push(event.data); };
      recorder.onerror = () => {
        setComposerStatus('Non riesco a registrare la voce. Riprova.', 'error');
        discardRecording();
      };
      recorder.onstop = () => {
        const ignored = composer.recordingDiscarded;
        const chunks = composer.recordingChunks;
        clearRecordingTimer();
        releaseMediaStream();
        composer.mediaRecorder = null;
        composer.recordingChunks = [];
        if (ignored || !chunks.length) {
          composer.recordingState = 'idle';
          composer.recording = null;
          updateRecorderUi();
          updateComposerValidity();
          return;
        }
        const BlobCtor = window.Blob || globalThis.Blob;
        const blob = new BlobCtor(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' });
        const file = makeRecordedFile(blob);
        const url = typeof window.URL?.createObjectURL === 'function' ? window.URL.createObjectURL(blob) : '';
        composer.recording = { ready: true, file, url, duration: (Date.now() - composer.recordingStartedAt) / 1000 };
        composer.recordingState = 'ready';
        updateRecorderUi();
        updateComposerValidity();
      };
      recorder.start();
      composer.recordingTimer = typeof setInterval === 'function' ? setInterval(updateRecordingTimer, 250) : null;
      updateRecorderUi();
    } catch (error) {
      console.warn('[US Left for You] recorder', error);
      releaseMediaStream();
      composer.mediaRecorder = null;
      composer.recordingState = 'idle';
      updateRecorderUi();
      setComposerStatus(error?.name === 'NotAllowedError' ? 'Il microfono non è disponibile. Controlla i permessi e riprova.' : 'Non riesco ad avviare la registrazione. Riprova.', 'error');
      updateComposerValidity();
    }
  }

  function stopRecording() {
    if (composer.recordingState !== 'recording') return;
    const recorder = composer.mediaRecorder;
    if (!recorder) return;
    try { recorder.stop(); } catch (error) {
      console.warn('[US Left for You] recorder stop', error);
      discardRecording();
    }
    releaseMediaStream();
  }

  function fileExtension(file) {
    const fromName = String(file?.name || '').match(/\.([a-z0-9]{1,8})$/i);
    if (fromName) return fromName[1].toLowerCase();
    const fromType = String(file?.type || '').split('/')[1];
    return (fromType || 'bin').replace(/[^a-z0-9]/gi, '') || 'bin';
  }

  async function uploadComposerMedia(file, kind) {
    const client = getClient();
    const me = window.usProfile;
    if (!client || !me) throw new Error('sync_unavailable');
    let payload = file;
    let ext = fileExtension(file);
    if (kind === 'photo' && typeof compressImageFile === 'function') {
      try {
        payload = await compressImageFile(file, { maxDimension: 1920, quality: 0.82 });
        ext = 'webp';
      } catch (_) { /* fall back to the original file */ }
    }
    const path = `${me.couple_id}/${me.id}/left/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const { error } = await client.storage.from('us-media').upload(path, payload, {
      contentType: ext === 'webp' ? 'image/webp' : (payload.type || 'application/octet-stream'),
      upsert: false,
      cacheControl: '3600',
    });
    if (error) throw error;
    return path;
  }

  function setComposerBusy(isBusy) {
    composer.sending = isBusy;
    const button = document.getElementById('leftForYouComposerSend');
    if (button) {
      button.disabled = isBusy;
      button.textContent = isBusy ? `Lascio per ${composerPartnerName()}…` : `Lascia per ${composerPartnerName()}`;
    }
    updateRecorderUi();
    if (!isBusy) updateComposerValidity();
  }

  function resetComposerInputs() {
    closeCamera();
    discardRecording();
    discardCameraCapture();
    const text = document.getElementById('leftForYouComposerText');
    if (text) text.value = '';
    document.querySelectorAll('[data-us-composer-panel] input[type="file"]').forEach((input) => { input.value = ''; });
    const music = document.getElementById('leftForYouComposerMusic');
    if (music) music.value = '';
    const musicSearchInput = document.getElementById('leftForYouMusicSearch');
    if (musicSearchInput) musicSearchInput.value = '';
    resetMusicSearchUi();
    clearMusicSelection();
    ['Photo', 'Audio', 'Video'].forEach((kind) => {
      const slot = document.getElementById(`leftForYouComposer${kind}Name`);
      if (slot) slot.textContent = '';
    });
    updateComposerValidity();
  }

  async function send() {
    if (composer.sending) return;
    const client = getClient();
    const me = window.usProfile;
    const other = partner();
    const personName = composerPartnerName();
    if (!client || !me || !other || other.id === me.id) {
      setComposerStatus('Non so ancora a chi lasciarlo. Riprova.', 'error');
      return;
    }
    const kind = composer.kind;
    let body = null;
    let mediaPath = null;
    let file = null;
    if (kind === 'text') {
      body = (document.getElementById('leftForYouComposerText')?.value || '').trim();
      if (!body) { setComposerStatus(`Scrivi qualcosa per ${personName}.`, 'error'); return; }
      if (body.length > 1000) { setComposerStatus('Il pensiero è troppo lungo (massimo 1000 caratteri).', 'error'); return; }
    } else if (kind === 'music') {
      const rawMusic = (document.getElementById('leftForYouComposerMusic')?.value || '').trim();
      const trackId = extractSpotifyTrackId(rawMusic);
      if (!trackId) {
        setComposerStatus('Cerca un brano o incolla un link Spotify valido.', 'error');
        return;
      }
      mediaPath = canonicalSpotifyTrackUrl(trackId);
    } else if (kind === 'audio') {
      file = composer.recording?.file;
      if (!file) { setComposerStatus('Registra una voce prima di lasciarla.', 'error'); return; }
      if (file.size > 25 * 1024 * 1024) { setComposerStatus('Il file è troppo grande (massimo 25 MB).', 'error'); return; }
    } else {
      file = selectedComposerFile(kind);
      if (!file) { setComposerStatus('Scegli qualcosa da lasciare.', 'error'); return; }
      const maxBytes = kind === 'video' ? 40 * 1024 * 1024 : 25 * 1024 * 1024;
      const maxLabel = kind === 'video' ? '40 MB' : '25 MB';
      if (file.size > maxBytes) { setComposerStatus(`Il file è troppo grande (massimo ${maxLabel}).`, 'error'); return; }
    }
    if (!composerCanSend()) {
      setComposerStatus('Completa il contenuto prima di lasciarlo.', 'error');
      return;
    }
    setComposerBusy(true);
    setComposerStatus('');
    try {
      if (kind === 'photo' || kind === 'audio' || kind === 'video') {
        mediaPath = await uploadComposerMedia(file, kind);
      }
      const { data: inserted, error } = await client.from('left_for_you').insert({
        couple_id: me.couple_id,
        sender_id: me.id,
        recipient_id: other.id,
        kind,
        body,
        media_path: mediaPath,
      }).select('id').single();
      if (error) throw error;
      if (inserted?.id) window.sendWebPushEvent?.('left_for_you', inserted.id).catch?.(() => {});
      setComposerStatus(`Lasciato per ${personName} ♡`, 'success');
      resetComposerInputs();
      setTimeout(() => { if (!composer.sending) closeComposer(); }, 900);
    } catch (error) {
      console.warn('[US Left for You] send', error);
      setComposerStatus(`Non riesco a lasciarlo a ${personName} ora. Riprova, è ancora qui.`, 'error');
    } finally {
      setComposerBusy(false);
    }
  }

  function bindComposer() {
    document.getElementById('leftForYouComposerClose')?.addEventListener('click', closeComposer);
    const composerBackdrop = document.getElementById('leftForYouComposerBackdrop');
    composerBackdrop?.addEventListener('click', (event) => {
      if (event.target !== composerBackdrop) return;
      if (composer.cameraOpen) return;
      closeComposer();
    });
    document.getElementById('leftForYouComposerSend')?.addEventListener('click', send);
    document.querySelectorAll('[data-us-composer-kind]').forEach((tab) => {
      tab.addEventListener('click', () => setComposerKind(tab.dataset.usComposerKind));
    });
    const pickBindings = [
      ['leftForYouComposerPhotoPick', 'leftForYouComposerPhotoFile', 'leftForYouComposerPhotoName'],
      ['leftForYouComposerVideoPick', 'leftForYouComposerVideoFile', 'leftForYouComposerVideoName'],
    ];
    for (const [pickId, fileId, nameId] of pickBindings) {
      const pick = document.getElementById(pickId);
      const file = document.getElementById(fileId);
      pick?.addEventListener('click', () => file?.click());
      file?.addEventListener('change', () => {
        if (fileId === 'leftForYouComposerPhotoFile' && file.files?.[0]) discardCameraCapture();
        const slot = document.getElementById(nameId);
        if (slot) slot.textContent = file.files?.[0]?.name || '';
        updateComposerValidity();
      });
    }
    document.getElementById('leftForYouComposerText')?.addEventListener('input', updateComposerValidity);
    document.getElementById('leftForYouComposerText')?.addEventListener('change', updateComposerValidity);
    document.getElementById('leftForYouComposerMusic')?.addEventListener('input', updateComposerValidity);
    document.getElementById('leftForYouComposerMusic')?.addEventListener('change', (event) => {
      const trackId = extractSpotifyTrackId(event.target.value);
      if (trackId) setMusicSelection(canonicalSpotifyTrackUrl(trackId), 'Link Spotify pronto');
      updateComposerValidity();
    });
    document.getElementById('leftForYouMusicSearch')?.addEventListener('input', (event) => scheduleMusicSearch(event.target.value));
    document.getElementById('leftForYouMusicResults')?.addEventListener('click', (event) => {
      const item = event.target.closest('[data-spotify-id]');
      if (item) selectMusicResult(item);
    });
    document.getElementById('leftForYouMusicResults')?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const item = event.target.closest('[data-spotify-id]');
      if (!item) return;
      event.preventDefault();
      selectMusicResult(item);
    });
    document.getElementById('leftForYouMusicClear')?.addEventListener('click', clearMusicSelection);
    document.getElementById('leftForYouComposerPhotoCamera')?.addEventListener('click', openCamera);
    const cameraOverlay = document.getElementById('leftForYouCameraOverlay');
    const cameraBackdrop = document.getElementById('leftForYouCameraBackdrop');
    cameraOverlay?.addEventListener('click', (event) => {
      if (event.target === cameraOverlay) closeCamera();
    });
    cameraBackdrop?.addEventListener('click', (event) => {
      if (event.target === cameraBackdrop) closeCamera();
    });
    document.getElementById('leftForYouCameraClose')?.addEventListener('click', closeCamera);
    document.getElementById('leftForYouCameraSwitch')?.addEventListener('click', switchCamera);
    document.getElementById('leftForYouCameraCapture')?.addEventListener('click', captureCameraPhoto);
    document.getElementById('leftForYouCameraUse')?.addEventListener('click', useCameraPhoto);
    document.getElementById('leftForYouCameraRetake')?.addEventListener('click', retakeCameraPhoto);
    document.getElementById('leftForYouComposerAudioRecord')?.addEventListener('click', () => {
      if (composer.recordingState === 'recording') stopRecording();
      else startRecording();
    });
    document.getElementById('leftForYouComposerAudioRetry')?.addEventListener('click', startRecording);
    document.getElementById('leftForYouComposerAudioDelete')?.addEventListener('click', discardRecording);
    updateComposerValidity();
  }

  function boot() {
    document.getElementById('leftForYouClose')?.addEventListener('click', close);
    document.getElementById('leftForYouBackdrop')?.addEventListener('click', close);
    document.getElementById('leftForYouRetry')?.addEventListener('click', retry);
    document.getElementById('leftForYouConserve')?.addEventListener('click', conserve);
    document.getElementById('leftForYouNext')?.addEventListener('click', async () => {
      if (currentIndex >= items.length - 1) return;
      currentIndex += 1; await renderCurrent();
    });
    bindComposer();
    window.addEventListener('us-auth-resolved', (event) => {
      if (event.detail?.paired) {
        fetchItems().catch(() => {});
        loadProfiles().catch(() => {});
        subscribeRealtime();
      }
    });
    window.addEventListener('left-for-you-refresh', () => { if (root()?.classList.contains('open')) load(); else fetchItems().catch(() => {}); });
    if (window.usProfile) { fetchItems().catch(() => {}); loadProfiles().catch(() => {}); subscribeRealtime(); }
    applyEnvelopeState();
    window.usEnvelopeTap = tap;
  }

  const api = {
    isUnseen, renderItemMarkup, labelForKind, open, close, load, conserve, retry, boot,
    tap, applyEnvelopeState, updateEntry, envelopeStateFor, envelopeIsResolved, subscribeRealtime, handleIncoming, alignCurrentToRenderedItem,
    setComposerKind, openComposer, closeComposer, send, updateComposerValidity, composerCanSend,
    startRecording, stopRecording, discardRecording, openCamera, closeCamera, switchCamera, captureCameraPhoto, useCameraPhoto, retakeCameraPhoto, discardCameraCapture, composer,
    extractSpotifyTrackId, canonicalSpotifyTrackUrl, spotifyEmbedUrl,
    renderMusicResults, selectMusicResult, clearMusicSelection, resetMusicSearchUi, runMusicSearch, scheduleMusicSearch, musicSearch, musicSearchErrorMessage,
  };
  if (typeof window !== 'undefined') window.openLeftForYou = open;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  }
  return api;
});