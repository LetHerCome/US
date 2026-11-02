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
  const KINDS = Object.freeze(['think', 'countdown', 'noi', 'photo', 'daily', 'message', 'days']);
  const DESTINATIONS = Object.freeze({ think: 'home', countdown: 'home', noi: 'bond', 'noi-play': 'quiz', photo: 'home', daily: 'home', message: 'home', days: 'bond' });
  // Messaggio opens the message itself: the Ti penso or the closed envelope.
  const MESSAGE_TARGETS = Object.freeze({ think: 'think', left: 'left_for_you' });
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
  let photoResyncRequested = false;
  let photoPreviewUrl = '';
  let noiPortraitPreviewUrl = '';
  let noiPortraitSignature = '';
  let noiPortraitSync = null;
  let noiRoundPreviewUrls = { me: '', partner: '' };
  let lastLink = { url: '', at: 0 };
  let pendingDestination = '';
  let pendingKind = '';

  const emptyThink = () => ({ partnerName: '', lastReceivedAt: '', lastSentAt: '', lastAnsweredAt: '' });
  // Batteria del partner: level -1 = unknown (UsWidgetContract.java).
  const emptyCouple = () => ({ names: [], startedOn: '', frame: '', distanceText: '', distanceState: 'ready', batteryLevel: -1, batteryCharging: false, batteryAt: '' });
  const emptyCountdown = () => ({ active: false, kind: '', title: '', target: '', style: 'editorial' });
  const emptyPhoto = () => ({ state: 'none', key: '', takenOn: '' });
  // La domanda di oggi: the day, the shared question and whose turn it is. Never an answer.
  const emptyDaily = () => ({ date: '', question: '', state: 'none' });
  // Messaggio: the newest Lasciato per te still closed for me, kind and time only.
  const emptyLeft = () => ({ kind: '', at: '' });
  const LEFT_KINDS = Object.freeze(['text', 'photo', 'audio', 'video', 'music']);
  let think = emptyThink();
  let couple = emptyCouple();
  let countdown = emptyCountdown();
  let photo = emptyPhoto();
  let daily = emptyDaily();
  let left = emptyLeft();

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
      photo: { ...photo },
      daily: { ...daily },
      left: { ...left }
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

  // From Oggi's own state of the question (app.js hydrateToday); null while unknown.
  function dailyFromToday() {
    const question = window.todayQuestion, state = window.todayState;
    if (!question?.id || !state) return null;
    const date = civilDate(question.question_date);
    const text = cleanText(question.question, 240);
    if (!date || !text) return emptyDaily();
    const turn = state.both_answered ? 'ready' : state.my_answer != null ? 'waiting' : state.partner_has_answer ? 'your_turn' : 'todo';
    return { date, question: text, state: turn };
  }

  function syncDaily() {
    if (!ownerHash) return Promise.resolve(false);
    const next = dailyFromToday();
    if (!next || JSON.stringify(next) === JSON.stringify(daily)) return Promise.resolve(false);
    daily = next;
    return scheduleWrite();
  }

  // Oggi's unseen Lasciato per te rows (app.js loadOggiLeftItems): never the
  // words, the photo or the link, only what kind the newest is and when.
  function publishLeft(items) {
    if (!ownerHash || !Array.isArray(items)) return Promise.resolve(false);
    const newest = items
      .filter((item) => LEFT_KINDS.includes(item?.kind) && isoInstant(item?.created_at))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
    const next = newest ? { kind: newest.kind, at: isoInstant(newest.created_at) } : emptyLeft();
    if (next.kind === left.kind && next.at === left.at) return Promise.resolve(false);
    left = next;
    return scheduleWrite();
  }

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
        frame,
        distanceText: couple.distanceText,
        distanceState: couple.distanceState,
        batteryLevel: couple.batteryLevel,
        batteryCharging: couple.batteryCharging,
        batteryAt: couple.batteryAt
      };
      coupleSyncedAt = Date.now();
      return scheduleWrite();
    } catch (error) {
      console.warn('[US Widget] couple', error);
      return false;
    }
  }

  // Presentation-only distance, already calculated for Noi in the WebView.
  // Never store coordinates or initiate location requests from a widget.
  function syncNoiDistance() {
    if (!ownerHash) return Promise.resolve(false);
    const next = window.UsWidgetDataApi?.noiDistance?.();
    const distanceText = cleanText(next?.distanceText || '', 24);
    const distanceState = next?.distanceState === 'stale' ? 'stale' : 'ready';
    if (couple.distanceText === distanceText && couple.distanceState === distanceState) return Promise.resolve(false);
    couple = { ...couple, distanceText, distanceState };
    return scheduleWrite();
  }

  // Batteria del partner: the last reading Noi shows (partner-battery.js). The
  // widget itself makes it quieter after an hour and drops it after a day.
  function syncNoiBattery() {
    if (!ownerHash) return Promise.resolve(false);
    const next = window.UsPartnerBattery?.widgetState?.();
    if (next === undefined) return Promise.resolve(false);
    const batteryLevel = Number.isInteger(next?.level) ? next.level : -1;
    const batteryAt = batteryLevel >= 0 ? isoInstant(next.at) : '';
    const battery = batteryAt
      ? { batteryLevel, batteryCharging: next.charging === true, batteryAt }
      : { batteryLevel: -1, batteryCharging: false, batteryAt: '' };
    if (couple.batteryLevel === battery.batteryLevel && couple.batteryCharging === battery.batteryCharging && couple.batteryAt === battery.batteryAt) return Promise.resolve(false);
    couple = { ...couple, ...battery };
    return scheduleWrite();
  }

  // "Due colori": the creator's portrait ringed in rosa, the partner's in
  // lilla, overlapping like the US mark, on a transparent PNG so it sits on
  // the widget's night card. 64x44dp at 4.5x; rings 2.5dp; the second
  // portrait is cut out of the first by a ring of the card colour.
  async function composeNoiPortrait(urls) {
    const S = 4.5, W = Math.round(64 * S), H = Math.round(44 * S);
    const ring = 2.5 * S, gap = 2.5 * S, cy = H / 2, radius = cy - ring;
    const centers = [radius + ring, W - radius - ring];
    const colours = ['#ff7c96', '#a98bff'];
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('noi_portrait_canvas');
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < 2; i++) {
      const cx = centers[i];
      if (i === 1) {
        // Cut the first portrait where the second overlaps it.
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath(); ctx.arc(cx, cy, radius + ring + gap, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = '#2a2232';
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      if (urls[i]) {
        let bitmap;
        try {
          const response = await fetch(urls[i], { credentials: 'omit' });
          if (!response.ok) throw new Error('avatar_download');
          const blob = await response.blob();
          if (!/^image\//.test(blob.type || 'image/')) throw new Error('avatar_type');
          bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
          const scale = Math.max(radius * 2 / bitmap.width, radius * 2 / bitmap.height);
          const w = bitmap.width * scale, h = bitmap.height * scale;
          ctx.drawImage(bitmap, cx - w / 2, cy - h / 2, w, h);
        } catch (error) { console.warn('[US Widget] avatar paint', error); }
        finally { bitmap?.close?.(); }
      }
      ctx.restore();
      ctx.beginPath(); ctx.arc(cx, cy, radius + ring / 2, 0, Math.PI * 2);
      ctx.strokeStyle = colours[i]; ctx.lineWidth = ring; ctx.stroke();
    }
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('noi_portrait_encode');
    const base64 = await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
      reader.onerror=reject;
      reader.readAsDataURL(png);
    });
    return {base64, preview: URL.createObjectURL(png)};
  }

  // Noi stile mappa: one round portrait per person (same ring colours), 56dp
  // at 3x, transparent. The widget puts me on the left, the partner on the right.
  async function composeRoundPortrait(url, colour) {
    const S = 3, size = Math.round(56 * S), ring = 2.5 * S, c = size / 2, radius = c - ring;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('noi_round_canvas');
    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, radius, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#2a2232';
    ctx.fillRect(0, 0, size, size);
    let bitmap;
    try {
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok) throw new Error('avatar_download');
      const blob = await response.blob();
      if (!/^image\//.test(blob.type || 'image/')) throw new Error('avatar_type');
      bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      const scale = Math.max(radius * 2 / bitmap.width, radius * 2 / bitmap.height);
      const w = bitmap.width * scale, h = bitmap.height * scale;
      ctx.drawImage(bitmap, c - w / 2, c - h / 2, w, h);
    } finally { bitmap?.close?.(); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(c, c, radius + ring / 2, 0, Math.PI * 2);
    ctx.strokeStyle = colour; ctx.lineWidth = ring; ctx.stroke();
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('noi_round_encode');
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(png);
    });
    return { base64, preview: URL.createObjectURL(png) };
  }

  // urls come by role (creator, partner); "me" is the viewer's own.
  async function writeRoundPortraits(urls, owner, token) {
    const mine = window.usProfile?.role === 'beatrice' ? 1 : 0;
    const colours = ['#ff7c96', '#a98bff'];
    const previews = {};
    for (const [slot, index] of [['me', mine], ['partner', 1 - mine]]) {
      if (!urls[index]) continue;
      try {
        const image = await composeRoundPortrait(urls[index], colours[index]);
        if (token !== generation || !(await platform.writeWidgetNoiPortrait(owner, image.base64, slot))) { URL.revokeObjectURL(image.preview); continue; }
        previews[slot] = image.preview;
      } catch (error) { console.warn('[US Widget] Noi round portrait', error); }
    }
    for (const slot of ['me', 'partner']) {
      if (!previews[slot]) continue;
      if (noiRoundPreviewUrls[slot]) URL.revokeObjectURL(noiRoundPreviewUrls[slot]);
      noiRoundPreviewUrls[slot] = previews[slot];
    }
  }

  function clearRoundPreviews() {
    for (const slot of ['me', 'partner']) if (noiRoundPreviewUrls[slot]) URL.revokeObjectURL(noiRoundPreviewUrls[slot]);
    noiRoundPreviewUrls = { me: '', partner: '' };
  }

  function syncNoiPortrait({ force = false } = {}) {
    if (!nativeEnabled || !ownerHash || !platform?.writeWidgetNoiPortrait) return Promise.resolve(false);
    if (noiPortraitSync) return noiPortraitSync;
    const urls = window.UsWidgetDataApi?.noiAvatarSources?.();
    if (!Array.isArray(urls) || !urls.some(Boolean)) return Promise.resolve(false);
    const signature = urls.join('|');
    if (!force && signature === noiPortraitSignature && noiPortraitPreviewUrl) return Promise.resolve(false);
    const token=generation, owner=ownerHash;
    noiPortraitSync=(async()=>{
      let image=null;
      try {
        image=await composeNoiPortrait(urls);
        if(token!==generation){URL.revokeObjectURL(image.preview);return false;}
        const ok=await platform.writeWidgetNoiPortrait(owner,image.base64,'pair');
        if(token!==generation || !ok){URL.revokeObjectURL(image.preview);return false;}
        await writeRoundPortraits(urls,owner,token);
        if(token!==generation){URL.revokeObjectURL(image.preview);return false;}
        if(noiPortraitPreviewUrl) URL.revokeObjectURL(noiPortraitPreviewUrl);
        noiPortraitPreviewUrl=image.preview;
        noiPortraitSignature=signature;
        window.dispatchEvent(new Event('us:noi-widget-photo-updated'));
        return true;
      }catch(error){
        if(image?.preview)URL.revokeObjectURL(image.preview);
        console.warn('[US Widget] Noi portrait',error);
        return false;
      }finally{noiPortraitSync=null;}
    })();
    return noiPortraitSync;
  }

  // Oggi's currently visible hero photo, downscaled in the WebView and
  // handed to native as bytes. The signed URL never leaves this page.
  // Android refreshes the cached photo on launch and while US is active;
  // RemoteViews cannot download a new private image while US is closed.
  async function encodePhoto(url) {
    // The same signed URL Oggi just painted: the HTTP cache answers, no second download.
    const response = await fetch(url, { credentials: 'omit' });
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
    if (photoSync) {
      if (force) photoResyncRequested = true;
      return photoSync.then(() => {
        if (!photoResyncRequested) return false;
        photoResyncRequested = false;
        return syncPhoto({ force: true });
      });
    }
    if (!force && Date.now() - photoSyncedAt < PHOTO_TTL_MS) return Promise.resolve(false);
    const token = generation;
    const owner = ownerHash;
    photoSync = (async () => {
      try {
        const latest = await window.UsWidgetDataApi?.latestPhoto?.();
        if (token !== generation) return false;
        // undefined = Oggi has not resolved its hero yet. Keep the last
        // valid cached image rather than blanking the home-screen widget.
        if (latest === undefined) return false;
        photoSyncedAt = Date.now();
        if (!latest) {
          if (photo.state === 'none') return false;
          photo = emptyPhoto();
          setPreview('');
          return scheduleWrite();
        }
        const key = (await sha256Hex(`${owner}:${latest.id}:${latest.path}`)).slice(0, 32);
        if (key === photo.key && photo.state === 'ready' && photoPreviewUrl) return false;
        const encoded = await encodePhoto(latest.url);
        if (token !== generation) { URL.revokeObjectURL(encoded.preview); return false; }
        // Native already holds the private bytes after a process restart.
        if (key !== photo.key || photo.state !== 'ready') {
          await platform.writeWidgetPhoto(owner, key, encoded.base64);
        }
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
      // The widget sends to the Edge of this build (staging or production).
      const stored = await platform.storeWidgetActionCredential(targetOwnerHash, issued.token, issued.expiresAt || '', {
        functionsUrl: window.UsWidgetCredentialApi.functionsUrl || ''
      });
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
      daily = { ...emptyDaily(), ...native.daily };
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
      left = emptyLeft();
      couple = emptyCouple();
      countdown = emptyCountdown();
      photo = emptyPhoto();
      daily = emptyDaily();
      coupleSyncedAt = 0;
      photoSyncedAt = 0;
      photoResyncRequested = false;
      noiPortraitSignature = '';
      if (noiPortraitPreviewUrl) URL.revokeObjectURL(noiPortraitPreviewUrl);
      noiPortraitPreviewUrl = '';
      clearRoundPreviews();
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
    await syncNoiDistance();
    await syncNoiBattery();
    // The portrait and Oggi photo only sync after first UI paint.
    setTimeout(() => {
      syncPhoto({ force: true }).catch(() => {});
      syncNoiPortrait({ force: true }).catch(() => {});
    }, 2500);
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
    photoResyncRequested = false;
    noiPortraitSignature = '';
    if (noiPortraitPreviewUrl) URL.revokeObjectURL(noiPortraitPreviewUrl);
    noiPortraitPreviewUrl = '';
    clearRoundPreviews();
    think = emptyThink();couple = emptyCouple();countdown = emptyCountdown();photo = emptyPhoto();daily = emptyDaily();left = emptyLeft();
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
      const path = url.pathname.replace(/^\/+/, '');
      if (path === 'noi/play') return { kind: 'noi-play', url: urlValue };
      const message = path.match(/^message\/(think|left)$/);
      if (message) return { kind: 'message', target: MESSAGE_TARGETS[message[1]], url: urlValue };
      const kind = path.split('/')[0];
      return KINDS.includes(kind) ? { kind, url: urlValue } : null;
    } catch (_) { return null; }
  }

  function openDestination(page) {
    if (page === 'quiz' && typeof window.openQuizHub === 'function') {
      window.openQuizHub();
      return true;
    }
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
    // The Ti penso or the envelope: the same path as their notifications,
    // which also waits for the sign-in on a cold start.
    if (link.target && typeof window.UsPushNavigation?.open === 'function') {
      window.UsPushNavigation.open(link.target);
      return Promise.resolve(true);
    }
    const page = DESTINATIONS[link.kind];
    pendingDestination = window.usProfile ? '' : page;
    pendingKind = window.usProfile ? '' : link.kind;
    openDestination(page);
    // La domanda di oggi opens the question itself.
    if (link.kind === 'daily' && window.usProfile) setTimeout(() => window.openToday?.(), 120);
    return Promise.resolve(true);
  }

  // ---------- Widget Hub support ----------

  function view() {
    return { snapshot: snapshot(), photoPreviewUrl, noiPortraitPreviewUrl, noiRoundPreviewUrls: { ...noiRoundPreviewUrls }, ready: Boolean(ownerHash) };
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
    if (kind === 'noi') await syncNoiPortrait({ force: true });
    return platform.requestWidgetPin(kind);
  }

  window.UsWidgets = Object.freeze({
    KINDS,
    authReady,
    publishThink,
    publishLeft,
    syncCountdown,
    syncDaily,
    syncCouple,
    syncNoiDistance,
    syncNoiBattery,
    syncNoiPortrait,
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
      if (pendingDestination && event?.detail?.paired) {
        const kind = pendingKind;
        const page = pendingDestination;
        setTimeout(() => { openDestination(page); if (kind === 'daily') setTimeout(() => window.openToday?.(), 400); }, 60);
      }
      pendingDestination = '';
      pendingKind = '';
    });
    window.addEventListener('us:countdown-updated', () => { syncCountdown().catch(() => {}); });
    window.addEventListener('us:progression-updated', () => { syncCountdown().catch(() => {}); syncCouple().catch(() => {}); });
    // Ricordi changes may cause Oggi to select a new image. Only the
    // painted Oggi event is authoritative for the widget photo.
    window.addEventListener('us:home-photo-changed', () => { syncPhoto({ force: true }).catch(() => {}); });
    window.addEventListener('us:distance-changed', () => { syncNoiDistance().catch(() => {}); });
    window.addEventListener('us:partner-battery-changed', () => { syncNoiBattery().catch(() => {}); });
    window.addEventListener('us:noi-portraits-ready', () => { syncNoiPortrait().catch(() => {}); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden || !ownerHash) return;
      // The phone's widgets are not on screen while US is: they refresh just
      // after the page in front of the person (app.js usAfterForeground).
      (window.usAfterForeground || ((task) => task()))(() => {
        if (document.hidden || !ownerHash) return;
        ensureCredential().catch(() => {});
        syncCountdown().catch(() => {});
        syncDaily().catch(() => {});
        syncCouple().catch(() => {});
        syncNoiDistance().catch(() => {});
        syncNoiPortrait().catch(() => {});
        syncPhoto().catch(() => {});
      }, 2000);
    });
  }
})();
