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
  // Countdown left the widgets on 04/11/2026; the Post-it took its place.
  const KINDS = Object.freeze(['think', 'postit', 'noi', 'photo', 'daily', 'message', 'memories', 'status', 'lavagna']);
  const DESTINATIONS = Object.freeze({ think: 'home', countdown: 'home', noi: 'bond', 'noi-play': 'quiz', photo: 'home', daily: 'home', message: 'home', memories: 'moments', status: 'home', lavagna: 'bond', postit: 'bond' });
  // Messaggio opens the message itself: the Ti penso or the closed envelope.
  const MESSAGE_TARGETS = Object.freeze({ think: 'think', left: 'left_for_you' });
  const COUPLE_TTL_MS = 30 * 60 * 1000;
  const PHOTO_TTL_MS = 10 * 60 * 1000;
  const PHOTO_MAX_EDGE = 720;
  const MEMORIES_TTL_MS = 6 * 60 * 60 * 1000;

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
  let noiPortraitSignature = '';
  let noiPortraitSync = null;
  let noiRoundPreviewUrls = { me: '', partner: '' };
  let lastLink = { url: '', at: 0 };
  let pendingDestination = '';
  let pendingKind = '';

  const emptyThink = () => ({ partnerName: '', lastReceivedAt: '', lastSentAt: '', lastAnsweredAt: '', todayCount: 0, todayDate: '' });
  // Batteria del partner: level -1 = unknown (UsWidgetContract.java).
  // colors: each person's colour as the app shows it (Pastello widgets).
  const emptyCouple = () => ({ names: [], startedOn: '', frame: '', distanceText: '', distanceState: 'ready', distanceNear: false, distanceAt: '', batteryLevel: -1, batteryCharging: false, batteryAt: '', colors: { me: '', partner: '' } });
  const emptyCountdown = () => ({ active: false, kind: '', title: '', target: '', style: 'editorial' });
  // Foto & giorni: Oggi's photo of this hour, then of the next two (next).
  const emptyPhoto = () => ({ state: 'none', key: '', takenOn: '', label: '', hour: '', next: [] });
  // La domanda di oggi: the day, the shared question and whose turn it is. Never an answer.
  const emptyDaily = () => ({ date: '', question: '', state: 'none' });
  // Messaggio: the newest Lasciato per te still closed for me, kind and time only.
  const emptyLeft = () => ({ kind: '', at: '' });
  const LEFT_KINDS = Object.freeze(['text', 'photo', 'audio', 'video', 'music']);
  // Ricordi a pila: which memory the stack shows; the pictures are separate files.
  // Come stai: each one's state (one of twelve), the words' form and the server's times.
  const emptyStatusPerson = () => ({ status: '', form: '', at: '', until: '' });
  const emptyStatus = () => ({ me: emptyStatusPerson(), partner: emptyStatusPerson() });
  const emptyMemories = () => ({ state: 'none', label: '', anniversary: false, day: '', date: '', title: '', count: 0, stack: 0 });
  // Lavagna: whether there is a drawing, who drew last and when; the pictures are separate files.
  const emptyLavagna = () => ({ state: 'none', by: '', at: '' });
  // Post-it: the newest post-it of the board, its paper, who wrote it, how many others.
  const emptyPostit = () => ({ state: 'none', text: '', color: '', by: '', more: 0, at: '' });
  let think = emptyThink();
  let couple = emptyCouple();
  let countdown = emptyCountdown();
  let photo = emptyPhoto();
  let daily = emptyDaily();
  let left = emptyLeft();
  let memories = emptyMemories();
  let comeStai = emptyStatus();
  let lavagna = emptyLavagna();
  let postit = emptyPostit();
  let memoriesSyncedAt = 0;
  let memoriesSignature = '';
  let memoriesSync = null;

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
      couple: { ...couple, names: [...couple.names], colors: { ...couple.colors } },
      countdown: { ...countdown },
      photo: { ...photo, next: photo.next.map((item) => ({ ...item })) },
      daily: { ...daily },
      left: { ...left },
      memories: { ...memories },
      lavagna: { ...lavagna },
      postit: { ...postit },
      status: { me: { ...comeStai.me }, partner: { ...comeStai.partner } }
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
      lastAnsweredAt: isoInstant(next.lastAnsweredAt),
      // "12 volte che vi siete pensati oggi" on the Ti penso widget.
      todayCount: Number.isInteger(next.todayCount) ? Math.max(0, Math.min(999, next.todayCount)) : 0,
      todayDate: civilDate(next.todayDate)
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
        distanceNear: couple.distanceNear,
        distanceAt: couple.distanceAt,
        batteryLevel: couple.batteryLevel,
        batteryCharging: couple.batteryCharging,
        batteryAt: couple.batteryAt,
        colors: couple.colors
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
    // Distanza e batteria: "meno di 3 km" and how old the reading is.
    const distanceNear = next?.distanceNear === true;
    const distanceAt = isoInstant(next?.distanceAt);
    if (couple.distanceText === distanceText && couple.distanceState === distanceState
      && couple.distanceNear === distanceNear && couple.distanceAt === distanceAt) return Promise.resolve(false);
    couple = { ...couple, distanceText, distanceState, distanceNear, distanceAt };
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

  // Pastello (approved board, 02/11/2026): the real profile photo, round,
  // a see-through gap, then a ring in the person's colour. Without a photo,
  // the initial on that colour. Transparent, 192 px, so every widget scales it.
  async function composeRoundPortrait(url, colour, initial) {
    const size = 192, ring = 10, gap = 8, c = size / 2, radius = c - ring - gap;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('noi_round_canvas');
    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, radius, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, size, size);
    let painted = false;
    let bitmap;
    if (url) {
      try {
        const response = await fetch(url, { credentials: 'omit' });
        if (!response.ok) throw new Error('avatar_download');
        const blob = await response.blob();
        if (!/^image\//.test(blob.type || 'image/')) throw new Error('avatar_type');
        bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
        const scale = Math.max(radius * 2 / bitmap.width, radius * 2 / bitmap.height);
        const w = bitmap.width * scale, h = bitmap.height * scale;
        ctx.drawImage(bitmap, c - w / 2, c - h / 2, w, h);
        painted = true;
      } catch (error) { console.warn('[US Widget] avatar photo', error); }
      finally { bitmap?.close?.(); }
    }
    if (!painted) {
      ctx.fillStyle = '#1a1020';
      ctx.font = `400 ${Math.round(radius * 0.92)}px Fraunces, Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initial || '·', c, c + radius * 0.06);
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(c, c, c - ring / 2, 0, Math.PI * 2);
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

  // The two people by role (creator, partner): the colour each one shows
  // (rosa and lilla, or the one chosen: app tokens --us-rosa and --us-lilla)
  // and the initial. null while the couple is not known yet.
  function avatarPeople() {
    const identity = window.UsIdentity?.current?.();
    if (!identity?.initialForRole || !window.usProfile?.couple_id) return null;
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null;
    const colour = (token, fallback) => (style?.getPropertyValue(`--us-${token}`) || '').trim() || fallback;
    return [
      { colour: colour('rosa', '#ff7c96'), initial: identity.initialForRole('francesco') },
      { colour: colour('lilla', '#a98bff'), initial: identity.initialForRole('beatrice') }
    ];
  }

  // urls and people come by role (creator, partner); "me" is the viewer's own.
  async function writeRoundPortraits(urls, people, owner, token) {
    const mine = window.usProfile?.role === 'beatrice' ? 1 : 0;
    const previews = {};
    for (const [slot, index] of [['me', mine], ['partner', 1 - mine]]) {
      try {
        const image = await composeRoundPortrait(urls[index], people[index].colour, people[index].initial);
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
    const people = avatarPeople();
    // Without photos the avatars are the initials on each person's colour.
    if (!Array.isArray(urls) || !people) return Promise.resolve(false);
    const signature = [...urls, ...people.map((person) => `${person.colour}:${person.initial}`)].join('|');
    if (!force && signature === noiPortraitSignature) return Promise.resolve(false);
    const token=generation, owner=ownerHash;
    noiPortraitSync=(async()=>{
      try {
        await writeRoundPortraits(urls,people,owner,token);
        // The same colours for the widgets' dots and bars.
        const mine=window.usProfile?.role==='beatrice'?1:0;
        const hex=(value)=>(/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():'');
        const colors={me:hex(people[mine].colour),partner:hex(people[1-mine].colour)};
        if(token===generation&&JSON.stringify(colors)!==JSON.stringify(couple.colors)){couple={...couple,colors};scheduleWrite();}
        if(token!==generation)return false;
        noiPortraitSignature=signature;
        window.dispatchEvent(new Event('us:noi-widget-photo-updated'));
        return true;
      }catch(error){
        console.warn('[US Widget] Noi portrait',error);
        return false;
      }finally{noiPortraitSync=null;}
    })();
    return noiPortraitSync;
  }

  // Come stai (member-status.js): what the app shows, for the widget.
  function syncStatus() {
    if (!ownerHash) return Promise.resolve(false);
    const next = window.UsMemberStatus?.widgetState?.();
    if (!next) return Promise.resolve(false);
    const clean = (person) => ({ status: cleanText(person?.status, 16), form: person?.form === 'm' || person?.form === 'f' ? person.form : '', at: isoInstant(person?.at), until: isoInstant(person?.until) });
    const value = { me: clean(next.me), partner: clean(next.partner) };
    if (JSON.stringify(value) === JSON.stringify(comeStai)) return Promise.resolve(false);
    comeStai = value;
    return scheduleWrite();
  }

  // Post-it (couple-notes.js): the newest post-it, for the widget.
  function syncPostit() {
    if (!ownerHash) return Promise.resolve(false);
    const next = window.UsCoupleNotes?.widgetState?.();
    if (!next) return Promise.resolve(false);
    const value = next.state === 'ready' && cleanText(next.text, 120)
      ? { state: 'ready', text: cleanText(next.text, 120), color: ['yellow', 'pink', 'blue', 'green'].includes(next.color) ? next.color : 'yellow', by: next.by === 'me' || next.by === 'partner' ? next.by : '', more: Math.max(0, Math.min(99, Math.trunc(Number(next.more) || 0))), at: isoInstant(next.at) }
      : emptyPostit();
    if (JSON.stringify(value) === JSON.stringify(postit)) return Promise.resolve(false);
    postit = value;
    return scheduleWrite();
  }

  // ---------- Ricordi a pila ----------

  // The photos of this day in a past year ("Un anno fa", the oldest year
  // first, as Rivivi), or else the newest three. rows: newest first.
  function memoriesPick(rows, todayISO) {
    const civil = /^\d{4}-\d{2}-\d{2}$/;
    if (!civil.test(String(todayISO || ''))) return null;
    const photos = (Array.isArray(rows) ? rows : [])
      .filter((row) => row && civil.test(String(row.date || '')) && row.date <= todayISO && typeof row.path === 'string' && row.path)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    if (!photos.length) return null;
    const past = photos.filter((row) => row.date.slice(5) === todayISO.slice(5) && row.date < todayISO);
    const anniversary = past.length > 0;
    let stack;
    let label;
    if (anniversary) {
      const day = past[past.length - 1].date;
      const years = Number(todayISO.slice(0, 4)) - Number(day.slice(0, 4));
      stack = photos.filter((row) => row.date === day).slice(0, 3);
      label = years === 1 ? 'Un anno fa' : `${years} anni fa`;
    } else {
      stack = photos.slice(0, 3);
      label = 'I più recenti';
    }
    const top = stack[0];
    return {
      label,
      anniversary,
      day: todayISO,
      date: top.date,
      title: cleanText(top.place || top.caption || '', 60),
      count: photos.filter((row) => row.date === top.date).length,
      rows: stack
    };
  }

  // Foto protagonista (02/11/2026): up to three prints with a soft shadow,
  // transparent around them. 2x2 (176 x 176 dp): the newest memory fills the
  // widget and the other two peek from the top edge. 4x2 (220 x 176 dp): a
  // fan, the back ones turned, the top one with a white border. Drawn at 3x.
  const STACK_SMALL = { width: 176, height: 176, radius: 18, border: 0, cards: [
    { x: 88, y: 97, w: 176, h: 166, turn: 0 }, { x: 88, y: 44, w: 150, h: 80, turn: 3 }, { x: 88, y: 40, w: 130, h: 80, turn: -4 }] };
  const STACK_WIDE = { width: 220, height: 176, radius: 12, border: 3, cards: [
    { x: 112, y: 90, w: 112, h: 132, turn: 0 }, { x: 148, y: 84, w: 112, h: 132, turn: 5 }, { x: 78, y: 88, w: 112, h: 132, turn: -8 }] };
  const PRINT_FALLBACK = [['#ffd3a8', '#ff7c96', '#5a2f63'], ['#ffe0b0', '#f3b76e', '#8a4b3a'], ['#bfe3ff', '#6d8fd6', '#2e2a5a']];

  async function loadBitmap(url) {
    if (!url) return null;
    try {
      // The same signed URL Ricordi paints: the HTTP cache usually answers.
      const response = await fetch(url, { credentials: 'omit' });
      if (!response.ok) throw new Error(`memory_http_${response.status}`);
      const blob = await response.blob();
      if (!/^image\//.test(blob.type || 'image/')) throw new Error('memory_not_image');
      return await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch (error) {
      console.warn('[US Widget] memory photo', error);
      return null;
    }
  }

  async function composeStack(bitmaps, layout) {
    const S = 3;
    const canvas = document.createElement('canvas');
    canvas.width = layout.width * S;
    canvas.height = layout.height * S;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('memories_canvas');
    const rounded = (w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + r, -h / 2);
      ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, r);
      ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, r);
      ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r);
      ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r);
      ctx.closePath();
    };
    // Back to front: the third print, the second, then the top one.
    for (let i = bitmaps.length - 1; i >= 0; i--) {
      const card = layout.cards[i];
      const w = card.w * S, h = card.h * S, r = layout.radius * S;
      ctx.save();
      ctx.translate(card.x * S, card.y * S);
      ctx.rotate(card.turn * Math.PI / 180);
      ctx.shadowColor = i === 0 ? 'rgba(26,16,32,.28)' : 'rgba(26,16,32,.22)';
      ctx.shadowBlur = (i === 0 ? 20 : 16) * S;
      ctx.shadowOffsetY = (i === 0 ? 8 : 6) * S;
      rounded(w, h, r);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      // The top print of the fan has a white border; the 2x2 photo has none.
      const inset = i === 0 ? layout.border * S : 0;
      ctx.save();
      rounded(w - inset * 2, h - inset * 2, Math.max(0, r - inset));
      ctx.clip();
      const bitmap = bitmaps[i];
      if (bitmap) {
        const scale = Math.max((w - inset * 2) / bitmap.width, (h - inset * 2) / bitmap.height);
        const bw = bitmap.width * scale, bh = bitmap.height * scale;
        ctx.drawImage(bitmap, -bw / 2, -bh / 2, bw, bh);
      } else {
        const [a, b, c] = PRINT_FALLBACK[i];
        const glow = ctx.createRadialGradient(-w * 0.25, -h * 0.3, 0, -w * 0.25, -h * 0.3, Math.max(w, h));
        glow.addColorStop(0, a); glow.addColorStop(0.5, b); glow.addColorStop(1, c);
        ctx.fillStyle = glow;
        ctx.fillRect(-w / 2, -h / 2, w, h);
      }
      ctx.restore();
      ctx.restore();
    }
    let blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
    if (!blob || blob.type !== 'image/webp') blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('memories_encode');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
  }

  // Ricordi a pila: every few hours, on a new day, or when Ricordi changes.
  // The photos are drawn here; only the two pictures reach native.
  function syncMemories({ force = false } = {}) {
    if (!nativeEnabled || !ownerHash || !platform?.writeWidgetNoiPortrait) return Promise.resolve(false);
    if (memoriesSync) return memoriesSync;
    const api = window.UsWidgetDataApi;
    if (typeof api?.memories !== 'function' || typeof api?.memoryUrls !== 'function') return Promise.resolve(false);
    const fresh = Date.now() - memoriesSyncedAt < MEMORIES_TTL_MS;
    const token = generation, owner = ownerHash;
    memoriesSync = (async () => {
      const bitmaps = [];
      try {
        if (!force && fresh && memories.day === localDay()) return false;
        const data = await api.memories();
        if (token !== generation || !data) return false;
        const pick = memoriesPick(data.rows, data.today);
        memoriesSyncedAt = Date.now();
        if (!pick) {
          if (memories.state === 'none') return false;
          memories = emptyMemories();
          memoriesSignature = '';
          return scheduleWrite();
        }
        const next = { state: 'ready', label: pick.label, anniversary: pick.anniversary, day: pick.day, date: pick.date, title: pick.title, count: pick.count, stack: pick.rows.length };
        const signature = JSON.stringify([pick.rows.map((row) => [row.id, row.path]), next]);
        if (signature === memoriesSignature) return false;
        const urls = await api.memoryUrls(pick.rows.map((row) => row.path));
        if (token !== generation) return false;
        for (const url of urls) bitmaps.push(await loadBitmap(url));
        if (token !== generation) return false;
        const small = await composeStack(bitmaps, STACK_SMALL);
        const wide = await composeStack(bitmaps, STACK_WIDE);
        if (token !== generation) return false;
        const ok = await platform.writeWidgetNoiPortrait(owner, small, 'memories')
          && await platform.writeWidgetNoiPortrait(owner, wide, 'memories_wide');
        if (token !== generation || !ok) return false;
        memories = next;
        memoriesSignature = signature;
        return scheduleWrite();
      } catch (error) {
        console.warn('[US Widget] memories', error);
        return false;
      } finally {
        for (const bitmap of bitmaps) bitmap?.close?.();
        memoriesSync = null;
      }
    })();
    return memoriesSync;
  }

  // Lavagna: the drawing as US paints it, in Pastello and Midnight ink (two
  // transparent pictures), and who drew last, when. Never the strokes.
  async function syncLavagna(input = {}) {
    if (!nativeEnabled || !ownerHash || !platform?.writeWidgetNoiPortrait) return false;
    const token = generation, owner = ownerHash;
    const next = { state: input.state === 'ready' ? 'ready' : 'empty', by: ['me', 'partner'].includes(input.by) ? input.by : '', at: typeof input.at === 'string' ? input.at : '' };
    try {
      if (next.state === 'ready') {
        const ok = await platform.writeWidgetNoiPortrait(owner, input.light, 'lavagna')
          && await platform.writeWidgetNoiPortrait(owner, input.dark, 'lavagna_night');
        if (token !== generation || !ok) return false;
      }
      if (token !== generation) return false;
      lavagna = next;
      return scheduleWrite();
    } catch (error) {
      console.warn('[US Widget] lavagna', error);
      return false;
    }
  }

  function localDay() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
        const keyOf = async (item) => (await sha256Hex(`${owner}:${item.id}:${item.path}`)).slice(0, 32);
        const key = await keyOf(latest);
        const upcoming = await Promise.resolve(window.UsWidgetDataApi?.upcomingPhotos?.()).catch(() => []) || [];
        if (token !== generation) return false;
        const next = [];
        for (const item of upcoming.slice(0, 2)) {
          const nextKey = await keyOf(item);
          // A photo the widget already holds is not downloaded again.
          if (!photo.next.some((cached) => cached.key === nextKey) && nextKey !== photo.key) {
            try {
              const image = await encodePhoto(item.url);
              URL.revokeObjectURL(image.preview);
              if (token !== generation) return false;
              await platform.writeWidgetPhoto(owner, nextKey, image.base64);
            } catch (error) { console.warn('[US Widget] next photo', error); break; }
          }
          next.push({ key: nextKey, takenOn: civilDate(item.takenOn), label: cleanText(item.label, 60) });
        }
        const same = key === photo.key && photo.state === 'ready' && photoPreviewUrl
          && JSON.stringify(next.map((item) => item.key)) === JSON.stringify(photo.next.map((item) => item.key));
        if (same) return false;
        const encoded = await encodePhoto(latest.url);
        if (token !== generation) { URL.revokeObjectURL(encoded.preview); return false; }
        // Native already holds the private bytes after a process restart. The
        // photo of this hour is written last: it is the one Oggi shows now.
        if (key !== photo.key || photo.state !== 'ready') {
          await platform.writeWidgetPhoto(owner, key, encoded.base64);
        }
        if (token !== generation) { URL.revokeObjectURL(encoded.preview); return false; }
        setPreview(encoded.preview);
        photo = { state: 'ready', key, takenOn: civilDate(latest.takenOn), label: cleanText(latest.label, 60), hour: isoInstant(latest.hour), next };
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
      comeStai = { me: { ...emptyStatusPerson(), ...native.status?.me }, partner: { ...emptyStatusPerson(), ...native.status?.partner } };
      memories = native.memories?.state === 'ready' ? { ...emptyMemories(), ...native.memories } : emptyMemories();
      lavagna = ['ready', 'empty'].includes(native.lavagna?.state) ? { ...emptyLavagna(), ...native.lavagna } : emptyLavagna();
      postit = native.postit?.state === 'ready' ? { ...emptyPostit(), ...native.postit } : emptyPostit();
      photo = native.photo?.state === 'ready' && native.photo.key === seed.photoKey ? { ...emptyPhoto(), ...native.photo, next: Array.isArray(native.photo.next) ? native.photo.next : [] } : emptyPhoto();
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
      memories = emptyMemories();
      comeStai = emptyStatus();
      postit = emptyPostit();
      memoriesSyncedAt = 0;
      memoriesSignature = '';
      couple = emptyCouple();
      countdown = emptyCountdown();
      photo = emptyPhoto();
      daily = emptyDaily();
      coupleSyncedAt = 0;
      photoSyncedAt = 0;
      photoResyncRequested = false;
      noiPortraitSignature = '';
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
      syncMemories().catch(() => {});
      // The board is read once, so a placed Post-it widget is fresh without opening Noi.
      installed().then((placed) => { if (placed?.installed?.postit) window.UsCoupleNotes?.refresh?.(); }).catch(() => {});
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
    clearRoundPreviews();
    think = emptyThink();couple = emptyCouple();countdown = emptyCountdown();photo = emptyPhoto();daily = emptyDaily();left = emptyLeft();comeStai = emptyStatus();memories = emptyMemories();memoriesSyncedAt = 0;memoriesSignature = '';lavagna = emptyLavagna();postit = emptyPostit();
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
      // Lavagna opens the board itself, through the path of its notification.
      if (path === 'lavagna') return { kind: 'lavagna', target: 'lavagna', url: urlValue };
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
    // Come stai opens the twelve, in Oggi.
    if (link.kind === 'status' && window.usProfile) setTimeout(() => window.UsMemberStatus?.open?.('status'), 400);
    return Promise.resolve(true);
  }

  // ---------- Widget Hub support ----------

  function view() {
    return { snapshot: snapshot(), photoPreviewUrl, noiRoundPreviewUrls: { ...noiRoundPreviewUrls }, ready: Boolean(ownerHash) };
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
    if (kind === 'memories') await syncMemories({ force: true });
    if (kind === 'lavagna') await window.UsLavagna?.syncWidget?.({ force: true });
    if (kind === 'postit') { window.UsCoupleNotes?.refresh?.(); await syncPostit(); }
    return platform.requestWidgetPin(kind);
  }

  window.UsWidgets = Object.freeze({
    KINDS,
    authReady,
    publishThink,
    publishLeft,
    syncStatus,
    syncPostit,
    memoriesPick,
    syncMemories,
    syncLavagna,
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
        setTimeout(() => { openDestination(page); if (kind === 'daily') setTimeout(() => window.openToday?.(), 400); if (kind === 'status') setTimeout(() => window.UsMemberStatus?.open?.('status'), 1200); }, 60);
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
    // Ricordi changed (a photo added, moved or deleted): the stack follows.
    window.addEventListener('us:member-status-changed', () => { syncStatus().catch(() => {}); });
    window.addEventListener('us:moments-updated', () => { syncMemories({ force: true }).catch(() => {}); });
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
        syncMemories().catch(() => {});
      }, 2000);
    });
  }
})();
