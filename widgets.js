(() => {
  'use strict';

  // US widgets — the one widget-state system (Android today, iOS/WidgetKit later).
  //
  //   US domain state → sanitized semantic snapshot → native private storage → providers
  //
  // The snapshot carries meaning (names, dates, the Countdown selected on Oggi),
  // never rendered strings, URLs, Supabase sessions or raw account ids. The send
  // credential and the cached photo travel on their own narrow bridge calls.
  if (window.__usWidgetsInstalled) return;
  window.__usWidgetsInstalled = true;

  const platform = window.UsPlatform;
  const nativeEnabled = Boolean(platform?.isNative && platform?.hasWidgetBridge?.() !== false);
  const KINDS = Object.freeze(['think', 'countdown', 'noi', 'photo']);
  const DESTINATIONS = Object.freeze({ think: 'home', countdown: 'home', noi: 'bond', photo: 'moments' });
  const COUPLE_TTL_MS = 30 * 60 * 1000;
  const PHOTO_TTL_MS = 10 * 60 * 1000;
  const PHOTO_MAX_EDGE = 720;

  let ownerHash = '';
  let deviceIdHash = '';
  let generation = 0;
  let authRequest = 0;
  let activeCoupleId = '';
  let credentialProvisionInFlight = null;
  let writeChain = Promise.resolve(true);
  let writeTimer = null;
  let pendingWrite = null;
  let coupleSyncedAt = 0;
  let photoSyncedAt = 0;
  let photoSync = null;
  let photoPreviewUrl = '';
  let lastLink = { url: '', at: 0 };
  let pendingDestination = '';

  const emptyThink = () => ({ partnerName: '', lastReceivedAt: '', lastSentAt: '', lastAnsweredAt: '' });
  const emptyCouple = () => ({ names: [], startedOn: '', frame: '' });
  const emptyCountdown = () => ({ active: false, kind: '', title: '', target: '', style: 'editorial' });
  const emptyPhoto = () => ({ state: 'none', key: '', takenOn: '' });
  let think = emptyThink();
  let couple = emptyCouple();
  let countdown = emptyCountdown();
  let photo = emptyPhoto();

  async function sha256Hex(value) {
    const bytes = new TextEncoder().encode(String(value || ''));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function isoInstant(value) {
    if (!value) return '';
    const time = new Date(value);
    return Number.isFinite(+time) ? time.toISOString() : '';
  }

  const civilDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '');
  const cleanText = (value, max) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

  function snapshot() {
    return {
      schemaVersion: 2,
      ownerHash,
      updatedAt: new Date().toISOString(),
      think: { ...think },
      couple: { ...couple, names: [...couple.names] },
      countdown: { ...countdown },
      photo: { ...photo }
    };
  }

  // Coalesce bursts (auth + countdown + progression land together) into one write.
  // Every caller in the burst shares the one pending write, so none is left waiting.
  function scheduleWrite() {
    if (!nativeEnabled || !ownerHash) return Promise.resolve(false);
    clearTimeout(writeTimer);
    if (!pendingWrite) {
      let resolve;
      pendingWrite = { promise: new Promise((done) => { resolve = done; }), resolve };
    }
    const pending = pendingWrite;
    writeTimer = setTimeout(() => {
      pendingWrite = null;
      pending.resolve(writeNow());
    }, 120);
    return pending.promise;
  }

  function flushPendingWrite(value) {
    clearTimeout(writeTimer);
    const pending = pendingWrite;
    pendingWrite = null;
    pending?.resolve(value);
  }

  function writeNow() {
    const token = generation;
    writeChain = writeChain.catch(() => false).then(async () => {
      if (token !== generation || !ownerHash) return false;
      try { return await platform.writeWidgetSnapshot(snapshot()); }
      catch (error) { console.warn('[US Widget] snapshot write', error); return false; }
    });
    return writeChain;
  }

  // ---------- domain → semantic state ----------

  async function publishThink(next = {}) {
    think = {
      partnerName: cleanText(next.partnerName || think.partnerName, 40),
      lastReceivedAt: isoInstant(next.lastReceivedAt),
      lastSentAt: isoInstant(next.lastSentAt),
      lastAnsweredAt: isoInstant(next.lastAnsweredAt)
    };
    return scheduleWrite();
  }

  // null: Oggi does not know yet (still loading); keep what the widget shows.
  function countdownFromOggi() {
    const next = window.USCountdown?.widgetState?.();
    if (!next) return null;
    if (next.active !== true) return { ...emptyCountdown(), style: next.style || 'editorial' };
    const kind = ['together', 'days', 'clock'].includes(next.kind) ? next.kind : '';
    const target = kind === 'clock' ? isoInstant(next.target) : civilDate(next.target);
    if (!kind || !target) return emptyCountdown();
    return { active: true, kind, title: cleanText(next.title, 60), target, style: String(next.style || 'editorial') };
  }

  function syncCountdown() {
    if (!ownerHash) return Promise.resolve(false);
    const next = countdownFromOggi();
    if (!next || JSON.stringify(next) === JSON.stringify(countdown)) return Promise.resolve(false);
    countdown = next;
    return scheduleWrite();
  }

  function equippedFrame() {
    const state = window.USProgression?.getState?.();
    const id = state?.preferences?.frame_reward_id;
    const token = id ? (state.rewards || []).find((reward) => reward.id === id && reward.unlocked)?.token : '';
    const value = String(token || '').startsWith('frame_') ? String(token).slice(6) : '';
    return /^[a-z0-9_]{1,24}$/.test(value) ? value : '';
  }

  async function syncCouple({ force = false } = {}) {
    if (!ownerHash) return false;
    const frame = equippedFrame();
    const fresh = Date.now() - coupleSyncedAt < COUPLE_TTL_MS;
    if (fresh && !force) {
      if (frame === couple.frame) return false;
      couple = { ...couple, frame };
      return scheduleWrite();
    }
    const token = generation;
    try {
      const data = await window.UsWidgetDataApi?.couple?.();
      if (token !== generation || !data) return false;
      couple = {
        names: (data.names || []).map((name) => cleanText(name, 40)).filter(Boolean).slice(0, 2),
        startedOn: civilDate(data.startedOn),
        frame
      };
      coupleSyncedAt = Date.now();
      return scheduleWrite();
    } catch (error) {
      console.warn('[US Widget] couple', error);
      return false;
    }
  }

  // The latest photo Ricordo, downscaled in the WebView and handed to native
  // as bytes. The signed URL never leaves this page; the widget never fetches.
  async function encodePhoto(url) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error(`photo_http_${response.status}`);
    const blob = await response.blob();
    if (!/^image\//.test(blob.type || 'image/')) throw new Error('photo_not_image');
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    try {
      const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.84));
      if (!jpeg) throw new Error('photo_encode_failed');
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(jpeg);
      });
      return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), preview: URL.createObjectURL(jpeg) };
    } finally {
      bitmap.close?.();
    }
  }

  function syncPhoto({ force = false } = {}) {
    if (!ownerHash) return Promise.resolve(false);
    if (photoSync) return photoSync;
    if (!force && Date.now() - photoSyncedAt < PHOTO_TTL_MS) return Promise.resolve(false);
    const token = generation;
    const owner = ownerHash;
    photoSync = (async () => {
      try {
        const latest = await window.UsWidgetDataApi?.latestPhoto?.();
        if (token !== generation) return false;
        photoSyncedAt = Date.now();
        if (!latest) {
          if (photo.state === 'none') return false;
          photo = emptyPhoto();
          setPreview('');
          return scheduleWrite();
        }
        const key = (await sha256Hex(`${owner}:${latest.id}:${latest.path}`)).slice(0, 32);
        if (key === photo.key && photo.state === 'ready') return false;
        const encoded = await encodePhoto(latest.url);
        if (token !== generation) { URL.revokeObjectURL(encoded.preview); return false; }
        await platform.writeWidgetPhoto(owner, key, encoded.base64);
        if (token !== generation) { URL.revokeObjectURL(encoded.preview); return false; }
        setPreview(encoded.preview);
        photo = { state: 'ready', key, takenOn: civilDate(latest.takenOn) };
        return scheduleWrite();
      } catch (error) {
        console.warn('[US Widget] photo', error);
        return false;
      } finally {
        photoSync = null;
      }
    })();
    return photoSync;
  }

  function setPreview(url) {
    if (photoPreviewUrl) try { URL.revokeObjectURL(photoPreviewUrl); } catch (_) {}
    photoPreviewUrl = url;
  }

  // ---------- account ----------

  async function provisionCredential(targetOwnerHash, token) {
    if (!deviceIdHash || !window.UsWidgetCredentialApi?.issue) return false;
    try {
      const issued = await window.UsWidgetCredentialApi.issue(deviceIdHash);
      if (!issued?.token) throw new Error('credential_not_issued');
      if (token !== generation) throw new Error('account_changed');
      const stored = await platform.storeWidgetActionCredential(targetOwnerHash, issued.token, issued.expiresAt || '');
      if (!stored) throw new Error('credential_not_stored');
      return true;
    } catch (error) {
      console.warn('[US Widget] credential provision', error);
      try { await window.UsWidgetCredentialApi.revoke(deviceIdHash); } catch (_) {}
      if (token === generation) try { await platform.clearWidgetActionCredential?.(); } catch (_) {}
      return false;
    }
  }

  // Binds native storage to this account (a different account wipes it) and
  // reports whether the device-scoped send credential is ready.
  async function activate() {
    const target = ownerHash;
    if (!target) return 'missing';
    try {
      const identity = await platform.getWidgetDeviceIdentity?.();
      if (identity?.deviceId) deviceIdHash = await sha256Hex(identity.deviceId);
    } catch (_) {}
    try { return (await platform.activateWidgetAccount(target))?.credential || 'missing'; }
    catch (error) { console.warn('[US Widget] account activation', error); return 'error'; }
  }

  // Provision only when needed (missing, about to expire, or rejected by the
  // server): not one new credential per app launch.
  async function ensureCredential(knownStatus) {
    if (!ownerHash) return false;
    const token = generation;
    const target = ownerHash;
    const status = knownStatus || await activate();
    if (status === 'ready' || status === 'error' || token !== generation) return status === 'ready';
    const previous = credentialProvisionInFlight;
    const task = Promise.resolve(previous).catch(() => false).then(() => (token === generation ? provisionCredential(target, token) : false));
    credentialProvisionInFlight = task;
    try { return await task; }
    finally { if (credentialProvisionInFlight === task) credentialProvisionInFlight = null; }
  }

  // Start from what the widgets already show for this account, so the first
  // write after a launch never blanks them (or drops the cached photo).
  async function seedFromNative() {
    try {
      const seed = await platform.readWidgetSnapshot?.();
      const native = seed?.snapshot;
      if (!native || native.ownerHash !== ownerHash) return false;
      think = { ...emptyThink(), ...native.think, partnerName: '' };
      couple = { ...emptyCouple(), ...native.couple, names: [] };
      countdown = { ...emptyCountdown(), ...native.countdown };
      photo = native.photo?.state === 'ready' && native.photo.key === seed.photoKey ? { ...native.photo } : emptyPhoto();
      return true;
    } catch (_) {
      return false;
    }
  }

  async function authReady(profile) {
    if (!nativeEnabled || !profile?.id) return false;
    const request=++authRequest;
    const nextHash = await sha256Hex(profile.id);
    if(request!==authRequest)return false;
    if (nextHash !== ownerHash || activeCoupleId !== (profile.couple_id || '')) {
      generation += 1;
      think = emptyThink();
      couple = emptyCouple();
      countdown = emptyCountdown();
      photo = emptyPhoto();
      coupleSyncedAt = 0;
      photoSyncedAt = 0;
      setPreview('');
    }
    activeCoupleId=profile.couple_id || '';
    ownerHash = nextHash;
    const status = await activate();
    if(request!==authRequest)return false;
    await seedFromNative();
    if(request!==authRequest)return false;
    countdown = countdownFromOggi() || countdown;
    await Promise.all([syncCouple({ force: true }), scheduleWrite(), ensureCredential(status)]);
    // The photo is the only heavy step: after the first paint, never before it.
    setTimeout(() => { syncPhoto({ force: true }); }, 2500);
    return true;
  }

  async function clear() {
    const request=++authRequest;
    activeCoupleId='';
    generation += 1;
    flushPendingWrite(false);
    const revokeHash = deviceIdHash;
    ownerHash = '';
    deviceIdHash = '';
    coupleSyncedAt = 0;
    photoSyncedAt = 0;
    think = emptyThink();couple = emptyCouple();countdown = emptyCountdown();photo = emptyPhoto();
    setPreview('');
    const provisioning = credentialProvisionInFlight;
    if (provisioning) try { await provisioning; } catch (_) {}
    if(request!==authRequest)return false;
    if (nativeEnabled && revokeHash && window.UsWidgetCredentialApi?.revoke) {
      try { await window.UsWidgetCredentialApi.revoke(revokeHash); }
      catch (error) { console.warn('[US Widget] credential revoke', error); }
    }
    if(request!==authRequest)return false;
    if (!nativeEnabled) return false;
    try { return await platform.clearWidgets(); }
    catch (error) { console.warn('[US Widget] clear', error); return false; }
  }

  // ---------- deep links ----------

  function parseLink(value) {
    const urlValue = typeof value === 'string' ? value : value?.url;
    if (!urlValue) return null;
    try {
      const url = new URL(urlValue);
      if (url.protocol !== 'us:' || url.hostname !== 'widget') return null;
      const kind = url.pathname.replace(/^\/+/, '').split('/')[0];
      return KINDS.includes(kind) ? { kind, url: urlValue } : null;
    } catch (_) { return null; }
  }

  function openDestination(page) {
    if (typeof window.go !== 'function') return false;
    window.go(page);
    return true;
  }

  function acceptUrl(value) {
    const link = parseLink(value);
    if (!link) return Promise.resolve(false);
    // Cold start delivers the same tap twice (launch URL + appUrlOpen).
    const now = Date.now();
    if (lastLink.url === link.url && now - lastLink.at < 1500) return Promise.resolve(true);
    lastLink = { url: link.url, at: now };
    const page = DESTINATIONS[link.kind];
    pendingDestination = window.usProfile ? '' : page;
    openDestination(page);
    return Promise.resolve(true);
  }

  // ---------- Widget Hub support ----------

  function view() {
    return { snapshot: snapshot(), photoPreviewUrl, ready: Boolean(ownerHash) };
  }

  async function installed() {
    if (!nativeEnabled) return { installed: {}, pinSupported: false, vendor: 'web' };
    try { return await platform.getInstalledWidgets(); }
    catch (_) { return { installed: {}, pinSupported: false, vendor: 'android' }; }
  }

  async function requestPin(kind) {
    if (!nativeEnabled || !KINDS.includes(kind)) return { supported: false, requested: false };
    // The widget must render real content the moment it lands.
    const write = writeNow();
    flushPendingWrite(write);
    await write;
    if (kind === 'photo') await syncPhoto({ force: true });
    return platform.requestWidgetPin(kind);
  }

  window.UsWidgets = Object.freeze({
    KINDS,
    authReady,
    publishThink,
    syncCountdown,
    syncCouple,
    syncPhoto,
    clear,
    view,
    installed,
    requestPin,
    openSettings: () => platform?.openWidgetSettings?.() ?? Promise.resolve(false),
    isAvailable: () => nativeEnabled
  });

  if (nativeEnabled) {
    platform.listenForNativeAppUrl?.((event) => acceptUrl(event));
    Promise.resolve(platform.getNativeLaunchUrl?.()).then(acceptUrl).catch(() => {});
    platform.listenForWidgetPinned?.((event) => {
      window.dispatchEvent(new CustomEvent('us:widget-pinned', { detail: { kind: event?.kind || '', placed: event?.placed === true } }));
    });
    window.addEventListener('us-auth-resolved', (event) => {
      // A widget opened US on a cold start: land there once the shell is ready.
      if (pendingDestination && event?.detail?.paired) setTimeout(() => openDestination(pendingDestination), 60);
      pendingDestination = '';
    });
    window.addEventListener('us:countdown-updated', () => { syncCountdown().catch(() => {}); });
    window.addEventListener('us:progression-updated', () => { syncCountdown().catch(() => {}); syncCouple().catch(() => {}); });
    window.addEventListener('us:moments-updated', () => { syncPhoto({ force: true }).catch(() => {}); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !ownerHash) return;
      ensureCredential().catch(() => {});
      syncCountdown().catch(() => {});
      syncCouple().catch(() => {});
      syncPhoto().catch(() => {});
    });
  }
})();
