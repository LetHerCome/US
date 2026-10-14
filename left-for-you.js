((root, factory) => {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.UsLeftForYou = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  const kinds = new Set(['text', 'photo', 'audio', 'video', 'music']);
  // Bencho voice-note interaction, adapted to the real US recorder/player.
  // Tap once to start, tap the same control again to stop: no hold gesture.
  const VOICE_NOTE_BARS = 28;
  const VOICE_SAMPLE_MS = 70;
  const VOICE_MIN_MS = 500;
  const VOICE_MAX_MS = 30000;
  // Video in 1.0: up to 30 seconds and 20 MB, checked before anything is uploaded.
  const VIDEO_MAX_BYTES = 20 * 1024 * 1024;
  const VIDEO_MAX_SECONDS = 30;
  const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
  const RECEIVER_AUDIO_STEPS = 5;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  let activeAudioPlayer = null;
  let items = [];
  let currentIndex = 0;
  let activeItem = null;
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
    recordingTimer: null,
    recordingVisualizer: null,
    recordingMaxTimer: null,
    recordingLevels: [],
    recordingAudioContext: null,
    recordingAnalyser: null,
    recordingAnalyserData: null,
    recordingSource: null,
    previewRaf: 0,
    previewScrubbing: false,
    cameraStream: null,
    cameraFacing: 'environment',
    cameraCapture: null,
    cameraOpen: false,
    cameraRequestId: 0,
    photoPreview: null,
  };
  // Captions are optional and only for a photo or a vocale (the server keeps
  // up to 280 characters for media kinds).
  const CAPTION_MAX = 280;
  const CAPTION_FIELDS = { photo: 'leftForYouComposerPhotoCaption', audio: 'leftForYouComposerAudioCaption' };

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

  // ---- Bencho Step Player adapted to real received audio ----
  const AUDIO_PLAY_L = [6.5, 4, 13.25, 8, 13.25, 16, 6.5, 20];
  const AUDIO_PAUSE_L = [6, 4, 10, 4, 10, 20, 6, 20];
  const AUDIO_PLAY_R = [13.25, 8, 20, 12, 20, 12, 13.25, 16];
  const AUDIO_PAUSE_R = [14, 4, 18, 4, 18, 20, 14, 20];

  function audioQuad(a, b, t) {
    let d = '';
    for (let i = 0; i < 8; i += 2) {
      const x = a[i] + (b[i] - a[i]) * t;
      const y = a[i + 1] + (b[i + 1] - a[i + 1]) * t;
      d += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return `${d}Z`;
  }

  function reducedMotion() {
    return Boolean(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  }

  function renderAudioStepPlayerMarkup(mediaUrl) {
    const src = escapeHtml(mediaUrl || '');
    const steps = Array.from({ length: RECEIVER_AUDIO_STEPS }, (_, index) =>
      `<button type="button" class="left-for-you-spl-dot" data-left-audio-step="${index}" aria-label="Vai al tratto ${index + 1}"${index === 0 ? ' aria-current="step"' : ''}><i class="left-for-you-spl-ink"></i></button>`
    ).join('');
    const left = audioQuad(AUDIO_PLAY_L, AUDIO_PAUSE_L, 0);
    const right = audioQuad(AUDIO_PLAY_R, AUDIO_PAUSE_R, 0);
    return `<div class="left-for-you-step-player" data-left-audio-player data-playing="false">
      <audio data-left-audio-el preload="metadata" src="${src}" hidden></audio>
      <div class="left-for-you-spl-row">
        <div class="left-for-you-spl-slab"><div class="left-for-you-spl-track">${steps}</div></div>
        <div class="left-for-you-spl-slab left-for-you-spl-tool">
          <button type="button" class="left-for-you-spl-go" data-left-audio-toggle aria-label="Riproduci">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path data-left-audio-mark-l d="${left}"></path><path data-left-audio-mark-r d="${right}"></path></svg>
          </button>
        </div>
      </div>
      <span class="left-for-you-spl-time" data-left-audio-time>0:00</span>
    </div>`;
  }

  function morphAudioPlayerMark(player, playing) {
    if (!player) return;
    const left = player.querySelector('[data-left-audio-mark-l]');
    const right = player.querySelector('[data-left-audio-mark-r]');
    if (!left || !right) return;
    const target = playing ? 1 : 0;
    const from = Number(player.dataset.markT || 0);
    if (reducedMotion()) {
      player.dataset.markT = String(target);
      left.setAttribute('d', audioQuad(AUDIO_PLAY_L, AUDIO_PAUSE_L, target));
      right.setAttribute('d', audioQuad(AUDIO_PLAY_R, AUDIO_PAUSE_R, target));
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      const u = Math.min(1, (now - start) / 260);
      const eased = 1 - Math.pow(1 - u, 4);
      const t = from + (target - from) * eased;
      player.dataset.markT = String(t);
      left.setAttribute('d', audioQuad(AUDIO_PLAY_L, AUDIO_PAUSE_L, t));
      right.setAttribute('d', audioQuad(AUDIO_PLAY_R, AUDIO_PAUSE_R, t));
      if (u < 1 && player.isConnected) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function wakeAudioSteps(player, from, to) {
    if (!player || reducedMotion() || from === to || from < 0) return;
    const dots = [...player.querySelectorAll('[data-left-audio-step]')];
    const direction = to > from ? 1 : -1;
    let order = 0;
    for (let i = from + direction; direction > 0 ? i <= to : i >= to; i += direction) {
      const dot = dots[i];
      if (!dot) continue;
      dot.classList.remove('is-wake');
      dot.style.setProperty('--wake-delay', `${order * 52}ms`);
      void dot.offsetWidth;
      dot.classList.add('is-wake');
      setTimeout(() => dot.classList.remove('is-wake'), 520 + order * 52);
      order += 1;
    }
  }

  function paintAudioStepPlayer(player) {
    if (!player?.isConnected) return;
    const audio = player.querySelector('[data-left-audio-el]');
    const dots = [...player.querySelectorAll('[data-left-audio-step]')];
    const time = player.querySelector('[data-left-audio-time]');
    if (!audio || !dots.length) return;
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    const ratio = duration ? clamp(audio.currentTime / duration, 0, 1) : 0;
    const scaled = ratio * dots.length;
    const step = ratio >= 1 ? dots.length - 1 : Math.min(dots.length - 1, Math.floor(scaled));
    const local = ratio >= 1 ? 1 : clamp(scaled - step, 0, 1);
    const previous = Number(player.dataset.stepIndex ?? -1);
    if (previous !== step) {
      wakeAudioSteps(player, previous, step);
      player.dataset.stepIndex = String(step);
    }
    dots.forEach((dot, index) => {
      const current = index === step;
      const done = index < step || ratio >= 1;
      dot.setAttribute('aria-current', current ? 'step' : 'false');
      dot.dataset.state = done && !current ? 'done' : current ? 'current' : 'next';
      dot.style.setProperty('--fill', String(done && !current ? 1 : current ? local : 0));
    });
    if (time) {
      const current = formatRecordingDuration(audio.currentTime || 0);
      const total = duration ? formatRecordingDuration(duration) : '0:00';
      time.textContent = `${current} / ${total}`;
    }
  }

  function stopActiveAudioPlayer() {
    const player = activeAudioPlayer;
    if (!player) return;
    if (player._raf) cancelAnimationFrame(player._raf);
    player._raf = 0;
    const audio = player.querySelector?.('[data-left-audio-el]');
    if (audio && !audio.paused) audio.pause();
    activeAudioPlayer = null;
  }

  function runAudioPlayer(player) {
    if (!player) return;
    if (player._raf) cancelAnimationFrame(player._raf);
    const tick = () => {
      paintAudioStepPlayer(player);
      const audio = player.querySelector('[data-left-audio-el]');
      if (audio && !audio.paused && !audio.ended && player.isConnected) player._raf = requestAnimationFrame(tick);
      else player._raf = 0;
    };
    player._raf = requestAnimationFrame(tick);
  }

  function bindAudioStepPlayer(scope) {
    stopActiveAudioPlayer();
    const player = scope?.querySelector?.('[data-left-audio-player]');
    if (!player) return;
    const audio = player.querySelector('[data-left-audio-el]');
    const toggle = player.querySelector('[data-left-audio-toggle]');
    const dots = [...player.querySelectorAll('[data-left-audio-step]')];
    if (!audio || !toggle) return;
    activeAudioPlayer = player;
    player.dataset.stepIndex = '-1';
    player.dataset.markT = '0';

    const setPlaying = (playing) => {
      player.dataset.playing = playing ? 'true' : 'false';
      toggle.setAttribute('aria-label', playing ? 'Pausa' : 'Riproduci');
      morphAudioPlayerMark(player, playing);
      if (playing) runAudioPlayer(player);
      else paintAudioStepPlayer(player);
    };

    toggle.addEventListener('click', async () => {
      if (audio.paused || audio.ended) {
        if (audio.ended) audio.currentTime = 0;
        try { await audio.play(); } catch (error) { console.warn('[US Left for You] audio play', error); }
      } else audio.pause();
    });
    audio.addEventListener('loadedmetadata', () => paintAudioStepPlayer(player));
    audio.addEventListener('play', () => setPlaying(true));
    audio.addEventListener('pause', () => setPlaying(false));
    audio.addEventListener('ended', () => { setPlaying(false); paintAudioStepPlayer(player); });
    dots.forEach((dot, index) => dot.addEventListener('click', () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const from = Number(player.dataset.stepIndex ?? 0);
      audio.currentTime = (index / dots.length) * audio.duration;
      wakeAudioSteps(player, from, index);
      paintAudioStepPlayer(player);
    }));
    paintAudioStepPlayer(player);
  }

  const isUnseen = (item) => !item?.seen_at;
  const createdTime = (item) => { const time = Date.parse(item?.created_at || ''); return Number.isFinite(time) ? time : 0; };
  const oldestFirst = (list) => list.slice().sort((a, b) => createdTime(a) - createdTime(b));
  const partner = () => profiles.get(items[0]?.sender_id) || [...profiles.values()].find((p) => p.id !== window.usProfile?.id) || null;
  const labelForKind = (kind) => ({ text: 'Un pensiero', photo: 'Una foto', audio: 'Un vocale', video: 'Un momento', music: 'Musica' }[kind] || 'Lasciato per te');

  function renderItemMarkup(item, mediaUrl = '') {
    const kind = kinds.has(item?.kind) ? item.kind : 'text';
    const body = item?.body ? `<p class="left-for-you-note" translate="no">${escapeHtml(item.body)}</p>` : '';
    let content = '';
    if (kind === 'text') content = `<div class="left-for-you-text"${item?.body ? ' translate="no"' : ''}>${escapeHtml(item?.body || 'Un pensiero per te.')}</div>`;
    if (kind === 'photo') content = `<img class="left-for-you-photo" src="${escapeHtml(mediaUrl)}" data-us-media-path="${escapeHtml(item?.media_path||'')}" onerror="usRecoverPrivateImage(this)" alt="Foto lasciata per te" loading="eager">${body}`;
    if (kind === 'audio') content = `${renderAudioStepPlayerMarkup(mediaUrl)}${body}`;
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
  const PARTNER_FALLBACK = 'La tua persona';
  function partnerName() { return window.UsIdentity?.current().partnerName || PARTNER_FALLBACK; }
  // The real name when the app has it, otherwise '' so sentences can say
  // "la tua persona" in lower case and with the right article.
  function knownPartnerName() {
    const name = partnerName();
    return name && name !== PARTNER_FALLBACK ? name : '';
  }

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
      el.dataset.usAttention = 'off';
      return;
    }
    el.classList.remove('is-loading');
    el.removeAttribute('aria-busy');
    const closed = unseenCount > 0;
    const wasClosed = el.classList.contains('is-closed');
    el.classList.toggle('is-closed', closed);
    el.classList.toggle('is-open', !closed);
    // M10E.1 — personal attention: ON iff THIS recipient has unseen items
    // (unseenCount comes from left_for_you where recipient_id = me). The
    // partner's own unread state never reaches this control.
    el.dataset.usAttention = unseenCount > 0 ? 'on' : 'off';
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
    const viewer=window.usProfile,coupleId=viewer?.couple_id;
    if (!viewer || !client) return;
    const { data, error } = await client.from('profiles').select('id,display_name,role,avatar_path,couple_id').eq('couple_id', coupleId);
    if(window.usProfile!==viewer||window.usProfile?.couple_id!==coupleId)return;
    if (error) throw error;
    profiles = new Map((data || []).filter(p=>p.couple_id===coupleId).map((profile) => [profile.id, profile]));
    const other = [...profiles.values()].find((profile) => profile.id !== window.usProfile.id);
    const name = document.getElementById('leftForYouPartnerName');
    const fromName = document.getElementById('leftForYouFromName');
    if (name) name.textContent = partnerName();
    if (fromName) fromName.textContent = partnerName();
    setPartnerAwareComposerLabels();
    applyEnvelopeState();
  }

  async function fetchItems({ preserveActive = false } = {}) {
    const client = getClient();
    if (!window.usProfile || !client) throw new Error('sync_unavailable');
    // Oldest first: things left one after the other are read in the order
    // they were left.
    const { data, error } = await client.from('left_for_you')
      .select('id,sender_id,recipient_id,kind,body,media_path,created_at,seen_at')
      .eq('recipient_id', window.usProfile.id)
      .is('seen_at', null)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const pending = oldestFirst((data || []).filter((item) => kinds.has(item.kind)));
    if (preserveActive && activeItem) {
      // While the viewer is open its order and counter stay put: what is
      // already in this opening keeps its place, new arrivals join the end.
      const opened = items.some((item) => item.id === activeItem.id) ? items : [activeItem];
      const known = new Set(opened.map((item) => item.id));
      items = [...opened, ...pending.filter((item) => !known.has(item.id))];
      currentIndex = Math.max(0, items.findIndex((item) => item.id === activeItem.id));
      updateViewerControls();
    } else {
      items = pending;
      currentIndex = 0;
      activeItem = null;
    }
    envelopeResolved = true;
    updateEntry(pending.length);
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

  // A photo, a vocale or a video counts as opened only once its media has
  // really loaded here. Text and music are on screen as soon as they are drawn.
  const SEEN_WHEN_LOADED = {
    photo: { selector: 'img', events: ['load'], ready: (media) => media.complete && media.naturalWidth > 0 },
    audio: { selector: 'audio', events: ['loadedmetadata', 'loadeddata', 'canplay', 'play'], ready: (media) => media.readyState >= 1 },
    video: { selector: 'video', events: ['loadeddata', 'canplay', 'play'], ready: (media) => media.readyState >= 2 },
  };

  function markSeenWhenShown(item, content) {
    const rule = SEEN_WHEN_LOADED[item?.kind];
    if (!rule) return markSeen(item);
    const media = content?.querySelector?.(rule.selector);
    if (!media || typeof media.addEventListener !== 'function') return undefined;
    let done = false;
    const onLoaded = () => {
      if (done) return;
      done = true;
      rule.events.forEach((name) => media.removeEventListener?.(name, onLoaded));
      // Skipped, replaced or closed before it loaded: it stays waiting.
      if (lastRenderedItemId !== item.id || media.isConnected === false || !root()?.classList.contains('open')) return;
      markSeen(item).catch((error) => console.warn('[US Left for You] seen', error));
    };
    rule.events.forEach((name) => media.addEventListener(name, onLoaded));
    if (rule.ready(media)) onLoaded();
    return undefined;
  }

  function updateViewerControls() {
    const item = items[currentIndex];
    const counter = document.getElementById('leftForYouCounter');
    const next = document.getElementById('leftForYouNext');
    const once = document.getElementById('leftForYouOnce');
    if (counter) counter.textContent = items.length > 1 ? `${currentIndex + 1} di ${items.length}` : '';
    if (next) next.hidden = currentIndex >= items.length - 1;
    if (once) once.hidden = !item || Boolean(item.conserved);
  }

  async function renderCurrent() {
    const item = items[currentIndex];
    const content = document.getElementById('leftForYouContent');
    const conserve = document.getElementById('leftForYouConserve');
    if (!item || !content) return;
    activeItem = item;
    content.innerHTML = '<div class="left-for-you-loading-inline" aria-busy="true">Un attimo…</div>';
    const url = await mediaUrl(item);
    stopActiveAudioPlayer();
    content.innerHTML = renderItemMarkup(item, url);
    if (item.kind === 'audio') bindAudioStepPlayer(content);
    lastRenderedItemId = item.id;
    updateViewerControls();
    if (conserve) {
      conserve.disabled = false;
      conserve.classList.toggle('is-conserved', Boolean(item.conserved));
      conserve.innerHTML = item.conserved ? '✓ Conservato' : 'Conserva';
    }
    await markSeenWhenShown(item, content);
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
    if (!items.length) {
      close();
      openComposer();
    }
  }

  function close() {
    const modal = root();
    if (!modal) return;
    stopActiveAudioPlayer();
    modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true');
    activeItem = null;
    items = [];
    currentIndex = 0;
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
      if (items[currentIndex] === item) updateViewerControls();
      setStatus('Conservato nei Ricordi.', 'success');
    } catch (error) {
      console.warn('[US Left for You] conserve', error);
      if (button) { button.disabled = false; button.textContent = 'Conserva'; }
      setStatus('Non riesco a conservarlo. Riprova.', 'error');
    } finally { busy = false; }
  }

  async function retry() { await load(); }

  // Rispondi: the viewer gives way to the composer, already addressed to the
  // partner who left this (the only person the composer ever writes to).
  function reply() {
    close();
    openComposer({ kind: 'text' });
  }

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
    return fetchItems({ preserveActive: overlayOpen }).catch(() => {});
  }

  function subscribeRealtime() {
    const client = getClient();
    const me = window.usProfile;
    if (!client || !me || typeof client.channel !== 'function') return;
    if (realtimeChannel) {
      try { client.removeChannel(realtimeChannel); } catch (_) { /* channel already gone */ }
      realtimeChannel = null;
    }
    const receiveChange = () => handleIncoming();
    realtimeChannel = client.channel(`us-left-for-you-${me.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'left_for_you',
        filter: `recipient_id=eq.${me.id}`,
      }, receiveChange)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'left_for_you',
        filter: `recipient_id=eq.${me.id}`,
      }, receiveChange)
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'left_for_you',
        filter: `recipient_id=eq.${me.id}`,
      }, receiveChange);
    realtimeChannel.subscribe();
  }

  // ---- M5F sender composer ----

  function setComposerStatus(message, kind = '') {
    const status = document.getElementById('leftForYouComposerStatus');
    if (status) { status.textContent = message || ''; status.dataset.kind = kind; }
  }

  // "per Bea" / "per la tua persona".
  function composerPartnerName() {
    return knownPartnerName() || 'la tua persona';
  }

  // "a Bea" / "alla tua persona".
  function toPartner() {
    const name = knownPartnerName();
    return name ? `a ${name}` : 'alla tua persona';
  }

  function setPartnerAwareComposerLabels() {
    const title = document.getElementById('leftForYouComposerTitle');
    const send = document.getElementById('leftForYouComposerSend');
    const audioRecord = document.getElementById('leftForYouComposerAudioRecord');
    if (title) title.textContent = `Lascia qualcosa ${toPartner()}`;
    if (send && !composer.sending) send.textContent = `Lascia per ${composerPartnerName()}`;
    if (audioRecord) audioRecord.setAttribute('aria-label', composer.recordingState === 'recording' ? 'Ferma la registrazione' : 'Registra un vocale');
    updateComposerValidity();
  }

  // ---- L3: what happened to the last thing I left ----
  // The sender may read their own rows (RLS) and the couple's Conserva rows.
  // Opened, not kept items are deleted 30 days after opening, so a row older
  // than 30 days may no longer be the last one: then the line stays hidden.
  const LAST_OUTCOME_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  let lastOutcomeRequest = 0;

  function localeTag() {
    return globalThis.UsI18n?.tag || 'it-IT';
  }

  function dayStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  // "oggi alle 21:40", "ieri alle 21:40", "lunedì alle 21:40", "il 3 ottobre alle 21:40".
  function openedWhen(value, now = new Date()) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const tag = localeTag();
    const time = date.toLocaleTimeString(tag, { hour: 'numeric', minute: '2-digit' });
    const days = Math.round((dayStart(now) - dayStart(date)) / 86400000);
    if (days <= 0) return `oggi alle ${time}`;
    if (days === 1) return `ieri alle ${time}`;
    if (days < 7) return `${date.toLocaleDateString(tag, { weekday: 'long' })} alle ${time}`;
    return `il ${date.toLocaleDateString(tag, { day: 'numeric', month: 'long' })} alle ${time}`;
  }

  function lastOutcomeText(last, { conserved = false, now = new Date() } = {}) {
    if (!last?.created_at) return '';
    const created = Date.parse(last.created_at);
    if (!Number.isFinite(created) || now.getTime() - created > LAST_OUTCOME_MAX_AGE_MS) return '';
    let outcome = 'ancora da aprire';
    if (conserved) outcome = 'conservata';
    else if (last.seen_at) {
      const when = openedWhen(last.seen_at, now);
      outcome = when ? `aperta ${when}` : 'aperta';
    }
    return `L'ultima cosa che hai lasciato ${toPartner()}: ${outcome}.`;
  }

  async function refreshLastOutcome() {
    const line = document.getElementById('leftForYouComposerLast');
    if (!line) return;
    const client = getClient();
    const me = window.usProfile;
    const request = ++lastOutcomeRequest;
    const show = (text) => {
      if (request !== lastOutcomeRequest) return;
      line.textContent = text || '';
      line.hidden = !text;
    };
    if (!client || !me?.id || !me.couple_id) { show(''); return; }
    try {
      const { data, error } = await client.from('left_for_you')
        .select('id,created_at,seen_at')
        .eq('sender_id', me.id)
        .eq('couple_id', me.couple_id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const rows = oldestFirst(Array.isArray(data) ? data : data ? [data] : []);
      const last = rows[rows.length - 1] || null;
      let conserved = false;
      if (last?.seen_at) {
        const { data: kept, error: keptError } = await client.from('conserva_contributions')
          .select('id')
          .eq('source_item_id', last.id)
          .limit(1);
        if (keptError) throw keptError;
        conserved = Array.isArray(kept) ? kept.length > 0 : Boolean(kept);
      }
      if (window.usProfile !== me) { show(''); return; }
      show(lastOutcomeText(last, { conserved }));
    } catch (_) {
      // Only a courtesy line: when it cannot be read it simply is not shown.
      show('');
    }
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

  // Public: window.UsLeftForYou.openComposer(options).
  // options (optional): { kind?: 'text'|'photo'|'voice'|'video'|'music', text?: string }.
  // With text, the text composer opens with it already written (it replaces
  // what was in the box). With only kind, that tab opens. With no argument
  // the composer opens exactly as it was left.
  const COMPOSER_KIND_NAMES = { text: 'text', photo: 'photo', voice: 'audio', audio: 'audio', video: 'video', music: 'music' };
  function applyComposerOptions(options) {
    if (!options || typeof options !== 'object') return;
    if (typeof options.text === 'string') {
      setComposerKind('text');
      const text = document.getElementById('leftForYouComposerText');
      if (text) text.value = options.text.slice(0, 1000);
      return;
    }
    const kind = COMPOSER_KIND_NAMES[options.kind];
    if (kind) setComposerKind(kind);
  }

  function openComposer(options) {
    const overlay = document.getElementById('leftForYouComposerOverlay');
    if (!overlay) return;
    applyComposerOptions(options);
    overlay.classList.add('open'); overlay.setAttribute('aria-hidden', 'false');
    refreshLastOutcome();
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

  function composerCaption(kind = composer.kind) {
    const id = CAPTION_FIELDS[kind];
    const value = id ? String(document.getElementById(id)?.value || '').trim() : '';
    return value || null;
  }

  // ---- L6: the chosen photo is shown, not just its file name ----
  function releasePhotoPreview() {
    const preview = composer.photoPreview;
    composer.photoPreview = null;
    if (preview?.owned && preview.url && typeof window.URL?.revokeObjectURL === 'function') window.URL.revokeObjectURL(preview.url);
  }

  function updatePhotoPreview() {
    const file = selectedComposerFile('photo');
    if (composer.photoPreview?.file !== file) {
      releasePhotoPreview();
      if (file) {
        const fromCamera = Boolean(composer.cameraCapture?.selected && composer.cameraCapture.file === file);
        let url = fromCamera ? composer.cameraCapture.url || '' : '';
        let owned = false;
        if (!url && typeof Blob !== 'undefined' && file instanceof Blob && typeof window.URL?.createObjectURL === 'function') {
          try { url = window.URL.createObjectURL(file); owned = Boolean(url); } catch (_) { url = ''; }
        }
        composer.photoPreview = { file, url, owned };
      }
    }
    const url = composer.photoPreview?.url || '';
    const wrap = document.getElementById('leftForYouComposerPhotoPreview');
    const image = document.getElementById('leftForYouComposerPhotoPreviewImage');
    const actions = document.getElementById('leftForYouComposerPhotoActions');
    const name = document.getElementById('leftForYouComposerPhotoName');
    if (image) { if (url) { if (image.getAttribute?.('src') !== url) image.src = url; } else image.removeAttribute?.('src'); }
    if (wrap) wrap.hidden = !url;
    if (actions) actions.hidden = Boolean(url);
    // Without a preview (a browser that cannot show it) the name still says what was chosen.
    if (name) name.textContent = file && !url ? (file.name || '') : '';
  }

  function clearPhotoChoice() {
    const input = document.getElementById('leftForYouComposerPhotoFile');
    if (input) { try { input.value = ''; } catch (_) { /* read-only in some test shims */ } }
    discardCameraCapture();
    updateComposerValidity();
  }

  // ---- L8: a refused camera or microphone says where to turn it back on ----
  function isPermissionDenied(error) {
    return error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError';
  }

  function permissionPlace() {
    if (!window.UsPlatform?.isNative) return 'dalle impostazioni del browser per questo sito';
    if (document.documentElement?.classList?.contains('us-native-ios')) return 'da Impostazioni del telefono › US';
    return 'da Impostazioni del telefono › App › US › Autorizzazioni';
  }

  function permissionDeniedText(device) {
    const what = device === 'camera' ? 'la fotocamera' : 'il microfono';
    return `Manca il permesso per ${what}. Attivalo ${permissionPlace()}.`;
  }

  // Reads only the video's metadata. Unknown (a format the browser cannot
  // read, or no answer in time) is not a refusal: the 20 MB limit still holds.
  function readVideoSeconds(file) {
    return new Promise((resolve) => {
      if (typeof Blob === 'undefined' || !(file instanceof Blob) || typeof URL?.createObjectURL !== 'function') { resolve(null); return; }
      let url = '';
      let probe = null;
      let done = false;
      let timer = null;
      const finish = (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { probe?.removeAttribute('src'); probe?.load?.(); } catch (_) { /* nothing to release */ }
        if (url) URL.revokeObjectURL(url);
        resolve(Number.isFinite(value) && value > 0 ? value : null);
      };
      try {
        probe = document.createElement('video');
        probe.preload = 'metadata';
        probe.muted = true;
        probe.addEventListener('loadedmetadata', () => finish(probe.duration), { once: true });
        probe.addEventListener('error', () => finish(null), { once: true });
        timer = setTimeout(() => finish(null), 8000);
        url = URL.createObjectURL(file);
        probe.src = url;
      } catch (_) {
        finish(null);
      }
    });
  }

  async function videoProblem(file) {
    if (!file) return '';
    if (file.type && !VIDEO_TYPES.has(file.type)) return 'Questo video non si può inviare. Scegli un video MP4 o MOV.';
    if (file.size > VIDEO_MAX_BYTES) return 'Il video è troppo grande (massimo 20 MB).';
    const seconds = await readVideoSeconds(file);
    if (seconds !== null && seconds > VIDEO_MAX_SECONDS + 0.5) return 'Il video è troppo lungo (massimo 30 secondi).';
    return '';
  }

  // Checked as soon as a video is chosen, so a long one is refused before Send.
  async function checkChosenVideo(input) {
    const file = input?.files?.[0];
    if (!file) return;
    const problem = await videoProblem(file);
    if (!problem || input.files?.[0] !== file) return;
    try { input.value = ''; } catch (_) { /* some test shims keep files read-only */ }
    const slot = document.getElementById('leftForYouComposerVideoName');
    if (slot) slot.textContent = '';
    setComposerStatus(problem, 'error');
    updateComposerValidity();
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
      const title = escapeHtml(track.title || '');
      const url = escapeHtml(track.spotifyUrl || '');
      return `<li class="left-for-you-music-result"><button type="button" class="left-for-you-music-result-select" data-spotify-id="${escapeHtml(track.id || '')}" data-spotify-title="${title}" data-spotify-artist="${escapeHtml(track.artist || '')}" data-spotify-url="${url}">${cover}<span class="left-for-you-music-result-info" translate="no"><b>${title}</b><small>${escapeHtml(secondary)}</small></span></button><a class="left-for-you-music-result-link" href="${url}" target="_blank" rel="noreferrer noopener" aria-label="Apri ${title} su Spotify">↗</a></li>`;
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
    updatePhotoPreview();
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
      setComposerStatus(isPermissionDenied(error) ? permissionDeniedText('camera') : 'Non riesco ad aprire la fotocamera su questo dispositivo.', 'error');
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
    if (composer.recordingMaxTimer) clearTimeout(composer.recordingMaxTimer);
    composer.recordingMaxTimer = null;
  }

  function formatRecordingDuration(seconds) {
    const safe = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
  }

  function voiceResample(source, count = VOICE_NOTE_BARS) {
    const src = Array.isArray(source) ? source : [];
    if (!src.length) return Array(count).fill(0.04);
    return Array.from({ length: count }, (_, index) => {
      const a = Math.floor((index * src.length) / count);
      const b = Math.max(a + 1, Math.floor(((index + 1) * src.length) / count));
      let peak = 0;
      for (let i = a; i < b && i < src.length; i += 1) peak = Math.max(peak, Number(src[i]) || 0);
      return clamp(peak, 0.04, 1);
    });
  }

  function paintVoiceWave(element, levels, progress = null) {
    if (!element) return;
    const sampled = voiceResample(levels, VOICE_NOTE_BARS);
    element.innerHTML = sampled.map((level, index) =>
      `<i class="left-for-you-vn-bar" style="--level:${clamp(level, 0.04, 1).toFixed(3)}" data-played="${progress != null && index / sampled.length <= progress ? 'true' : 'false'}"></i>`
    ).join('');
  }

  function voiceHintText(state) {
    if (state === 'starting') return 'Un attimo…';
    if (state === 'recording') return `Tocca per fermare · massimo ${formatRecordingDuration(VOICE_MAX_MS / 1000)}`;
    if (state === 'ready') return '';
    return 'Tocca per registrare';
  }

  function stopRecordingVisualizer() {
    if (composer.recordingVisualizer) clearInterval(composer.recordingVisualizer);
    composer.recordingVisualizer = null;
    try { composer.recordingSource?.disconnect?.(); } catch (_) { /* already disconnected */ }
    composer.recordingSource = null;
    composer.recordingAnalyser = null;
    composer.recordingAnalyserData = null;
    const ctx = composer.recordingAudioContext;
    composer.recordingAudioContext = null;
    if (ctx?.close) Promise.resolve(ctx.close()).catch(() => {});
  }

  function sampleRecordingLevel() {
    const analyser = composer.recordingAnalyser;
    const data = composer.recordingAnalyserData;
    if (!analyser || !data || composer.recordingState !== 'recording') return;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const centered = (data[i] - 128) / 128;
      sum += centered * centered;
    }
    const rms = Math.sqrt(sum / Math.max(1, data.length));
    const level = clamp(0.04 + rms * 6.8, 0.04, 1);
    composer.recordingLevels.push(level);
    const recent = composer.recordingLevels.slice(-VOICE_NOTE_BARS);
    paintVoiceWave(document.getElementById('leftForYouComposerAudioWave'), recent);
  }

  function startRecordingVisualizer(stream) {
    stopRecordingVisualizer();
    composer.recordingLevels = [];
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioContextCtor) {
      try {
        const ctx = new AudioContextCtor();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.68;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        composer.recordingAudioContext = ctx;
        composer.recordingAnalyser = analyser;
        composer.recordingSource = source;
        composer.recordingAnalyserData = new Uint8Array(analyser.fftSize);
        Promise.resolve(ctx.resume?.()).catch(() => {});
      } catch (error) {
        console.warn('[US Left for You] voice analyser', error);
      }
    }
    paintVoiceWave(document.getElementById('leftForYouComposerAudioWave'), []);
    composer.recordingVisualizer = typeof setInterval === 'function' ? setInterval(() => {
      if (composer.recordingAnalyser) sampleRecordingLevel();
      else if (composer.recordingState === 'recording') {
        composer.recordingLevels.push(0.08);
        paintVoiceWave(document.getElementById('leftForYouComposerAudioWave'), composer.recordingLevels.slice(-VOICE_NOTE_BARS));
      }
    }, VOICE_SAMPLE_MS) : null;
  }

  function updateRecordingTimer() {
    const timer = document.getElementById('leftForYouComposerAudioTimer');
    if (!timer || composer.recordingState !== 'recording') return;
    timer.textContent = formatRecordingDuration((Date.now() - composer.recordingStartedAt) / 1000);
  }

  function stopComposerPreview() {
    if (composer.previewRaf) cancelAnimationFrame(composer.previewRaf);
    composer.previewRaf = 0;
    const preview = document.getElementById('leftForYouComposerAudioPreview');
    if (preview && !preview.paused && typeof preview.pause === 'function') preview.pause();
  }

  function paintComposerPreview() {
    const preview = document.getElementById('leftForYouComposerAudioPreview');
    const wave = document.getElementById('leftForYouComposerAudioClipWave');
    const time = document.getElementById('leftForYouComposerAudioPreviewTime');
    const toggle = document.getElementById('leftForYouComposerAudioPreviewToggle');
    if (!preview || !composer.recording) return;
    const duration = Number.isFinite(preview.duration) && preview.duration > 0 ? preview.duration : Number(composer.recording.duration) || 0;
    const progress = duration ? clamp(preview.currentTime / duration, 0, 1) : 0;
    paintVoiceWave(wave, composer.recording.levels || [], progress);
    if (time) time.textContent = formatRecordingDuration(preview.currentTime > 0 ? preview.currentTime : duration);
    if (toggle) {
      toggle.dataset.playing = preview.paused ? 'false' : 'true';
      toggle.setAttribute('aria-label', preview.paused ? 'Riproduci la registrazione' : 'Pausa');
    }
  }

  function runComposerPreview() {
    if (composer.previewRaf) cancelAnimationFrame(composer.previewRaf);
    const tick = () => {
      paintComposerPreview();
      const preview = document.getElementById('leftForYouComposerAudioPreview');
      if (preview && !preview.paused && !preview.ended) composer.previewRaf = requestAnimationFrame(tick);
      else composer.previewRaf = 0;
    };
    composer.previewRaf = requestAnimationFrame(tick);
  }

  async function toggleComposerPreview() {
    const preview = document.getElementById('leftForYouComposerAudioPreview');
    if (!preview || composer.recordingState !== 'ready') return;
    if (preview.paused || preview.ended) {
      if (preview.ended) preview.currentTime = 0;
      try { await preview.play(); } catch (error) { console.warn('[US Left for You] preview play', error); }
    } else preview.pause();
  }

  function seekComposerPreview(clientX) {
    const preview = document.getElementById('leftForYouComposerAudioPreview');
    const wave = document.getElementById('leftForYouComposerAudioClipWave');
    if (!preview || !wave || !Number.isFinite(preview.duration) || preview.duration <= 0) return;
    const box = wave.getBoundingClientRect();
    preview.currentTime = clamp((clientX - box.left) / Math.max(1, box.width), 0, 1) * preview.duration;
    paintComposerPreview();
  }

  function updateRecorderUi() {
    const record = document.getElementById('leftForYouComposerAudioRecord');
    const idle = document.getElementById('leftForYouComposerAudioIdle');
    const rec = document.getElementById('leftForYouComposerAudioRecording');
    const clip = document.getElementById('leftForYouComposerAudioClip');
    const remove = document.getElementById('leftForYouComposerAudioDelete');
    const hint = document.getElementById('leftForYouComposerAudioHint');
    const preview = document.getElementById('leftForYouComposerAudioPreview');
    if (!record) return;
    const state = composer.recordingState;
    record.hidden = false;
    const recording = state === 'recording' || state === 'starting';
    const ready = state === 'ready';
    record.dataset.phase = ready ? 'clip' : recording ? 'rec' : 'idle';
    record.setAttribute('aria-disabled', composer.sending || state === 'starting' ? 'true' : 'false');
    if (ready) {
      record.removeAttribute('role');
      record.tabIndex = -1;
      record.removeAttribute('aria-label');
    } else {
      record.setAttribute('role', 'button');
      record.tabIndex = 0;
      record.setAttribute('aria-label', recording ? 'Registrazione in corso. Tocca per fermare.' : 'Tocca per registrare un vocale');
    }
    record.setAttribute('aria-pressed', recording ? 'true' : 'false');
    if (idle) idle.hidden = state !== 'idle';
    if (rec) rec.hidden = !recording;
    if (clip) clip.hidden = !ready;
    if (remove) remove.hidden = !ready;
    if (hint) {
      const text = voiceHintText(state);
      hint.textContent = text;
      hint.dataset.phase = record.dataset.phase;
      hint.hidden = !text;
    }
    if (preview) {
      if (ready && composer.recording?.url && preview.src !== composer.recording.url) {
        preview.src = composer.recording.url;
        preview.currentTime = 0;
        preview.load?.();
      } else if (!ready) {
        preview.removeAttribute('src');
      }
    }
    if (ready) paintComposerPreview();
    if (state === 'idle') {
      const timer = document.getElementById('leftForYouComposerAudioTimer');
      if (timer) timer.textContent = '0:00';
    }
  }

  function makeRecordedFile(blob) {
    const extension = String(blob?.type || '').includes('mp4') ? 'm4a' : 'webm';
    try { Object.defineProperty(blob, 'name', { value: `voce-${Date.now()}.${extension}` }); } catch (_) { /* Blob remains uploadable */ }
    return blob;
  }

  function discardRecording() {
    composer.recordingDiscarded = true;
    clearRecordingTimer();
    stopComposerPreview();
    stopRecordingVisualizer();
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
    composer.recordingLevels = [];
    updateRecorderUi();
    updateComposerValidity();
  }

  async function startRecording() {
    if (composer.sending || composer.recordingState === 'recording' || composer.recordingState === 'starting') return;
    const mediaDevices = window.navigator?.mediaDevices;
    const MediaRecorderCtor = window.MediaRecorder;
    if (!mediaDevices?.getUserMedia || !MediaRecorderCtor) {
      setComposerStatus('I vocali non si possono registrare su questo dispositivo.', 'error');
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
        composer.recordingState = 'idle';
        updateRecorderUi();
        return;
      }
      composer.mediaStream = stream;
      composer.recordingChunks = [];
      const mimeType = recordingMimeType();
      const recorder = mimeType ? new MediaRecorderCtor(stream, { mimeType }) : new MediaRecorderCtor(stream);
      composer.mediaRecorder = recorder;
      composer.recordingState = 'recording';
      composer.recordingStartedAt = Date.now();
      startRecordingVisualizer(stream);
      recorder.ondataavailable = (event) => { if (event.data?.size) composer.recordingChunks.push(event.data); };
      recorder.onerror = () => {
        setComposerStatus('Non riesco a registrare il vocale. Riprova.', 'error');
        discardRecording();
      };
      recorder.onstop = () => {
        const ignored = composer.recordingDiscarded;
        const chunks = composer.recordingChunks;
        const tookMs = Date.now() - composer.recordingStartedAt;
        const levels = composer.recordingLevels.slice();
        clearRecordingTimer();
        stopRecordingVisualizer();
        releaseMediaStream();
        composer.mediaRecorder = null;
        composer.recordingChunks = [];
        if (ignored || !chunks.length || tookMs < VOICE_MIN_MS) {
          composer.recordingState = 'idle';
          composer.recording = null;
          composer.recordingLevels = [];
          updateRecorderUi();
          updateComposerValidity();
          return;
        }
        const BlobCtor = window.Blob || globalThis.Blob;
        const blob = new BlobCtor(chunks, { type: recorder.mimeType || chunks[0]?.type || 'audio/webm' });
        const file = makeRecordedFile(blob);
        const url = typeof window.URL?.createObjectURL === 'function' ? window.URL.createObjectURL(blob) : '';
        composer.recording = { ready: true, file, url, duration: tookMs / 1000, levels };
        composer.recordingState = 'ready';
        composer.recordingLevels = levels;
        updateRecorderUi();
        updateComposerValidity();
      };
      recorder.start();
      composer.recordingTimer = typeof setInterval === 'function' ? setInterval(updateRecordingTimer, 200) : null;
      composer.recordingMaxTimer = setTimeout(() => {
        if (composer.recordingState === 'recording') stopRecording();
      }, VOICE_MAX_MS);
      updateRecordingTimer();
      updateRecorderUi();
    } catch (error) {
      console.warn('[US Left for You] recorder', error);
      stopRecordingVisualizer();
      releaseMediaStream();
      composer.mediaRecorder = null;
      composer.recordingState = 'idle';
      updateRecorderUi();
      setComposerStatus(isPermissionDenied(error) ? permissionDeniedText('microphone') : 'Non riesco ad avviare la registrazione. Riprova.', 'error');
      updateComposerValidity();
    }
  }

  function stopRecording() {
    if (composer.recordingState !== 'recording') return;
    const recorder = composer.mediaRecorder;
    if (!recorder) return;
    clearRecordingTimer();
    stopRecordingVisualizer();
    try { recorder.stop(); } catch (error) {
      console.warn('[US Left for You] recorder stop', error);
      discardRecording();
    }
  }

  // One control, two taps: idle -> recording -> (tap) -> preview. While the
  // microphone permission is pending the control ignores taps; a tap while
  // recording always stops (never discards), so the take is kept for preview.
  function toggleVoiceRecording(event) {
    if (event?.target?.closest?.('#leftForYouComposerAudioClip')) return;
    if (composer.sending) return;
    if (composer.recordingState === 'idle') startRecording();
    else if (composer.recordingState === 'recording') stopRecording();
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
    Object.values(CAPTION_FIELDS).forEach((id) => {
      const caption = document.getElementById(id);
      if (caption) caption.value = '';
    });
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
    releasePhotoPreview();
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
      if (!file) { setComposerStatus('Registra un vocale prima di lasciarlo.', 'error'); return; }
      if (file.size > 25 * 1024 * 1024) { setComposerStatus('Il file è troppo grande (massimo 25 MB).', 'error'); return; }
    } else {
      file = selectedComposerFile(kind);
      if (!file) { setComposerStatus('Scegli qualcosa da lasciare.', 'error'); return; }
      if (kind === 'video') {
        const problem = await videoProblem(file);
        if (problem) { setComposerStatus(problem, 'error'); return; }
      } else if (file.size > 25 * 1024 * 1024) { setComposerStatus('Il file è troppo grande (massimo 25 MB).', 'error'); return; }
    }
    if (CAPTION_FIELDS[kind]) {
      body = composerCaption(kind);
      if (body && body.length > CAPTION_MAX) { setComposerStatus('La didascalia è troppo lunga (massimo 280 caratteri).', 'error'); return; }
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
      refreshLastOutcome();
      setTimeout(() => { if (!composer.sending) closeComposer(); }, 900);
    } catch (error) {
      console.warn('[US Left for You] send', error);
      setComposerStatus(`Non riesco a lasciarlo ${toPartner()} ora. Riprova, è ancora qui.`, 'error');
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
        // The photo shows itself (preview); the video keeps its file name.
        const slot = document.getElementById(nameId);
        if (slot && fileId !== 'leftForYouComposerPhotoFile') slot.textContent = file.files?.[0]?.name || '';
        if (fileId === 'leftForYouComposerVideoFile') setComposerStatus('');
        updateComposerValidity();
        if (fileId === 'leftForYouComposerVideoFile') checkChosenVideo(file);
      });
    }
    document.getElementById('leftForYouComposerPhotoChange')?.addEventListener('click', clearPhotoChoice);
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
    const voiceRecord = document.getElementById('leftForYouComposerAudioRecord');
    voiceRecord?.addEventListener('click', toggleVoiceRecording);
    voiceRecord?.addEventListener('contextmenu', (event) => event.preventDefault());
    voiceRecord?.addEventListener('keydown', (event) => {
      if (event.target !== voiceRecord) return;
      if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
        event.preventDefault();
        toggleVoiceRecording(event);
      } else if (event.key === 'Escape' && composer.recordingState === 'recording') {
        event.preventDefault();
        discardRecording();
      }
    });
    document.getElementById('leftForYouComposerAudioDelete')?.addEventListener('click', (event) => {
      event.stopPropagation();
      discardRecording();
    });
    document.getElementById('leftForYouComposerAudioPreviewToggle')?.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleComposerPreview();
    });
    const previewAudio = document.getElementById('leftForYouComposerAudioPreview');
    previewAudio?.addEventListener('play', runComposerPreview);
    previewAudio?.addEventListener('pause', paintComposerPreview);
    previewAudio?.addEventListener('loadedmetadata', paintComposerPreview);
    previewAudio?.addEventListener('ended', paintComposerPreview);
    const previewWave = document.getElementById('leftForYouComposerAudioClipWave');
    previewWave?.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      composer.previewScrubbing = true;
      try { previewWave.setPointerCapture?.(event.pointerId); } catch (_) { /* scripted pointer */ }
      seekComposerPreview(event.clientX);
    });
    previewWave?.addEventListener('pointermove', (event) => { if (composer.previewScrubbing) seekComposerPreview(event.clientX); });
    previewWave?.addEventListener('pointerup', (event) => {
      composer.previewScrubbing = false;
      try { previewWave.releasePointerCapture?.(event.pointerId); } catch (_) { /* not captured */ }
    });
    previewWave?.addEventListener('pointercancel', () => { composer.previewScrubbing = false; });
    updateComposerValidity();
  }

  function boot() {
    window.addEventListener('us-identity-change', event=>{
      if(!event.detail?.identityKey){profiles.clear();items=[];activeItem=null;close();closeComposer();refreshLastOutcome();}
      for(const id of ['leftForYouPartnerName','leftForYouFromName']){
        const label=document.getElementById(id);if(label)label.textContent=partnerName();
      }
      setPartnerAwareComposerLabels();applyEnvelopeState();
    });
    document.getElementById('leftForYouClose')?.addEventListener('click', close);
    document.getElementById('leftForYouBackdrop')?.addEventListener('click', close);
    document.getElementById('leftForYouRetry')?.addEventListener('click', retry);
    document.getElementById('leftForYouConserve')?.addEventListener('click', conserve);
    document.getElementById('leftForYouReply')?.addEventListener('click', reply);
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
    isUnseen, renderItemMarkup, labelForKind, open, close, load, conserve, retry, reply, boot,
    refreshLastOutcome, lastOutcomeText, openedWhen,
    tap, applyEnvelopeState, updateEntry, envelopeStateFor, envelopeIsResolved, subscribeRealtime, handleIncoming, alignCurrentToRenderedItem,
    setComposerKind, openComposer, closeComposer, send, updateComposerValidity, composerCanSend,
    startRecording, stopRecording, discardRecording, toggleVoiceRecording,
    bindAudioStepPlayer, paintAudioStepPlayer, stopActiveAudioPlayer,
    openCamera, closeCamera, switchCamera, captureCameraPhoto, useCameraPhoto, retakeCameraPhoto, discardCameraCapture, composer,
    extractSpotifyTrackId, canonicalSpotifyTrackUrl, spotifyEmbedUrl,
    renderMusicResults, selectMusicResult, clearMusicSelection, resetMusicSearchUi, runMusicSearch, scheduleMusicSearch, musicSearch, musicSearchErrorMessage,
  };
  const rendererOnly = typeof window !== 'undefined' && window.__US_LEFT_FOR_YOU_RENDERER_ONLY__ === true;
  if (typeof window !== 'undefined' && !rendererOnly) window.openLeftForYou = open;
  if (typeof document !== 'undefined' && !rendererOnly) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
  }
  return api;
});
