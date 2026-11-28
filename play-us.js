// Play Us (founder, 28/11/2026; grill D1–D22, docs/missions/play-us-v1.md).
// The one mode of Gioca played together, live. One invites, the other has 3
// minutes; then 8 steps the server decides (public.play_us_*): quick questions,
// a photo, retouching the other's photo, «Quanto mi conosci», a voice note or a
// gesture, the maze, the reveal, the memory. One game a day per couple.
// Live: postgres_changes on play_us_* (the state), and the couple's private
// channel «us-couple:<couple>» for presence (green dot, «si è persa») and the
// maze scores (broadcast). Everything is drawn from the server's state.
(function () {
  'use strict';
  const w = window, d = document;
  const STEP_NAMES = ['Lobby', 'Domande lampo', 'Scatta', 'Ritocca', 'Quanto mi conosci', 'Un vocale o un gesto', 'La sfida', 'Scoprite', 'Il ricordo'];
  const PEGNI = ['Mi devi un caffè', 'Stasera il film lo scelgo io', 'Un vocale della buonanotte', 'Una foto di te al risveglio', 'Un massaggio di dieci minuti', 'La prossima pizza la offri tu'];
  const GESTURES = [['abbraccio', '🤗', 'Abbraccio'], ['bacio', '💋', 'Bacio'], ['cuore', '💗', 'Cuore']];
  const Q_MS = 12000, Q_ANSWER_MS = 10000;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const db = () => (typeof sb !== 'undefined' ? sb : null);
  const me = () => w.usProfile?.id || null;
  const cid = () => w.usProfile?.couple_id || null;
  // The real name, or «la tua persona» (lower case in the middle of a sentence; PN() at its start).
  const partnerName = () => { try { const n = w.UsIdentity?.current?.()?.partnerName; return n && n !== 'La tua persona' ? n : 'la tua persona'; } catch (_) { return 'la tua persona'; } };
  const PN = () => { const n = partnerName(); return n.charAt(0).toUpperCase() + n.slice(1); };
  const myRole = () => (w.usProfile?.role === 'beatrice' ? 'beatrice' : 'francesco');
  const otherRole = () => (myRole() === 'beatrice' ? 'francesco' : 'beatrice');
  const character = (role, size, reaction) => { try { return w.UsPersonaggi?.character?.(role, reaction ? { size, reaction } : { size }) || ''; } catch (_) { return ''; } };
  // Drawn on a canvas (maze, stickers) an SVG has no page CSS: its theme colours are written in.
  function solidSvg(svg) {
    const css = w.getComputedStyle?.(d.documentElement);
    return String(svg || '').replace(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/g, (all, name, fallback) => (css?.getPropertyValue(name) || '').trim() || (fallback || '').trim() || '#ff9f6e');
  }
  const feedback = (k) => { try { w.UsFeedback?.[k]?.(); } catch (_) {} };
  const toastMsg = (t) => { try { (w.toast || (() => {}))(t); } catch (_) {} };
  const reduced = () => Boolean(w.UsUiFoundation?.isReducedMotion?.() || w.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

  let today = null, session = null, offset = 0, partnerOnline = false, partnerSeenAt = 0;
  let live = null, couple = null, ticker = 0, lastAdvance = 0, refreshTimer = 0, view = null, maze = null, herLive = 0, lastSent = {}, dismissedInvite = '', busy = false, minimized = '', presenceReady = false;
  const now = () => Date.now() + offset;
  const moves = () => session?.moves || [];
  const move = (user, step, kind, slot = 0) => moves().find((m) => m.user_id === user && m.step === step && m.kind === kind && m.slot === slot) || null;
  const partnerId = () => { const ids = new Set(moves().map((m) => m.user_id)); ids.delete(me()); return [...ids][0] || (session && session.invited_by !== me() ? session.invited_by : null) || couplePartner; };
  let couplePartner = null;
  const deadline = () => (session?.step_started_at ? Date.parse(session.step_started_at) + (session.step_seconds || 0) * 1000 : 0);
  const stepStart = () => (session?.step_started_at ? Date.parse(session.step_started_at) : 0);

  async function rpc(name, args) {
    const client = db(); if (!client) throw new Error('no client');
    const { data, error } = await client.rpc(name, args || {});
    if (error) throw error;
    return data;
  }
  function adopt(state) {
    if (state?.server_now) offset = Date.parse(state.server_now) - Date.now();
    session = state || null;
  }
  async function refresh() {
    if (!me() || !cid() || !db()) return;
    try {
      today = await rpc('play_us_today');
      adopt(today.session);
      if (today?.server_now) offset = Date.parse(today.server_now) - Date.now();
    } catch (error) { console.warn('[US Play Us] today', error); return; }
    paintCard();
    syncScreens();
  }
  const scheduleRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 140); };

  // ---------------------------------------------------------------- live
  function startLive() {
    const client = db(); if (!client || !cid() || !me() || live) return;
    live = client.channel(`us-play-${me()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_us_sessions', filter: `couple_id=eq.${cid()}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_us_moves', filter: `couple_id=eq.${cid()}` }, scheduleRefresh)
      .subscribe();
    couple = client.channel(`us-couple:${cid()}`, { config: { private: true, presence: { key: me() } } })
      .on('presence', { event: 'sync' }, () => {
        const state = couple.presenceState?.() || {};
        const online = Object.keys(state).some((k) => k !== me());
        if (online) partnerSeenAt = Date.now();
        const first = !presenceReady; presenceReady = true;
        if (online !== partnerOnline || first) { partnerOnline = online; paintCard(); }
      })
      .on('broadcast', { event: 'score' }, ({ payload }) => { if (payload?.u && payload.u !== me()) { herLive = Number(payload.s) || 0; paintHerScore(); } })
      .subscribe((status) => { if (status === 'SUBSCRIBED' && !d.hidden) couple.track({ at: Date.now() }).catch?.(() => {}); });
  }
  function stopLive() {
    try { live && db()?.removeChannel(live); } catch (_) {}
    try { couple && db()?.removeChannel(couple); } catch (_) {}
    live = couple = null; partnerOnline = false; presenceReady = false;
  }
  d.addEventListener('visibilitychange', () => {
    if (!couple) return;
    // Presence follows at once; the server is reread only after a real absence (UsForeground.shortAway).
    try { if (d.hidden) couple.untrack(); else { couple.track({ at: Date.now() }); if (!w.UsForeground?.shortAway?.()) scheduleRefresh(); } } catch (_) {}
  });

  // ---------------------------------------------------------------- the card in Gioca
  function paintCard() {
    const slot = d.getElementById('usPlayUsCard');
    if (!slot) return;
    if (!today) { slot.innerHTML = ''; return; }
    const name = esc(partnerName());
    const s = session, mine = s && s.invited_by === me();
    let line = 'Insieme, adesso. 8 tappe in 6 minuti: domande lampo, una foto da ritoccare, una sfida.';
    let action = `<button type="button" class="us-play-btn" data-play="invite">Sfida ${name}</button>`;
    if (s?.status === 'invited' && mine) { line = `Invito mandato: ${name} ha 3 minuti per accettare.`; action = '<button type="button" class="us-play-btn is-ghost" data-play="open">Vedi l’invito</button>'; }
    else if (s?.status === 'invited') { line = `${esc(PN())} ti sfida a Play Us!`; action = '<button type="button" class="us-play-btn" data-play="accept">Accetta la sfida</button>'; }
    else if (s?.status === 'playing') { line = 'La vostra partita è in corso.'; action = '<button type="button" class="us-play-btn" data-play="open">Rientra</button>'; }
    else if (!today.can_invite) { line = 'Avete già giocato oggi. Domani un’altra partita.'; action = '<small class="us-play-plus">Con US Plus potrete giocarne di più</small>'; }
    // The green dot only once presence works (the couple's private channel); never a guess.
    const dot = !presenceReady ? '<span></span>' : partnerOnline ? `<span class="us-play-online"><i></i>${esc(PN())} è nell’app</span>` : `<span class="us-play-online is-off">${esc(PN())} non è nell’app ora</span>`;
    slot.innerHTML = `<section class="us-play-card" aria-labelledby="usPlayUsTitle">
      <div class="us-play-card-top">${dot}<span class="us-play-day">${today.can_invite ? '1 partita oggi' : 'Giocata oggi'}</span></div>
      <h3 id="usPlayUsTitle">Play Us</h3>
      <p>${line}</p>
      <div class="us-play-duo" aria-hidden="true">${character(myRole(), 58)}${character(otherRole(), 54)}</div>
      ${action}
    </section>`;
  }

  // ---------------------------------------------------------------- invite banner (anywhere)
  function paintInviteBanner() {
    const s = session;
    let el = d.getElementById('usPlayUsInvite');
    const show = s?.status === 'invited' && s.invited_by !== me() && dismissedInvite !== s.id && !isOpen() && Date.parse(s.invite_expires_at) > now();
    if (!show) { el?.remove(); return; }
    if (!el) {
      el = d.createElement('div'); el.id = 'usPlayUsInvite'; el.className = 'us-play-invite'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-label', 'Invito a Play Us');
      d.body.appendChild(el);
      feedback('attention');
    }
    el.innerHTML = `<span class="us-play-invite-char" aria-hidden="true">${character(otherRole(), 40, 'saluta')}</span><b>${esc(PN())} ti sfida a Play Us</b><button type="button" class="us-play-btn" data-play="accept">Gioca</button><button type="button" class="us-play-link" data-play="decline">Non ora</button>`;
  }

  // ---------------------------------------------------------------- the game sheet
  function root() {
    let el = d.getElementById('usPlayUs');
    if (!el) {
      el = d.createElement('div'); el.id = 'usPlayUs'; el.className = 'us-play'; el.hidden = true;
      el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Play Us');
      el.innerHTML = '<div class="us-play-shell"><header class="us-play-head"></header><main class="us-play-body"></main></div>';
      d.body.appendChild(el);
    }
    return el;
  }
  const isOpen = () => Boolean(d.getElementById('usPlayUs') && !d.getElementById('usPlayUs').hidden);
  function open() {
    minimized = '';
    const el = root(); el.hidden = false; d.documentElement.classList.add('us-play-open');
    view = null; clearInterval(ticker); ticker = setInterval(tick, 250);
    paintInviteBanner(); render(); tick();
  }
  function close() {
    // Reduced during a game: it stays closed until «Rientra» (never reopened by a refresh).
    if (session?.status === 'playing' || session?.status === 'invited') minimized = session.id;
    const el = d.getElementById('usPlayUs'); if (el) el.hidden = true;
    d.documentElement.classList.remove('us-play-open');
    clearInterval(ticker); ticker = 0; stopMaze(); view = null;
    paintCard(); paintInviteBanner();
  }
  function syncScreens() {
    paintInviteBanner();
    const s = session;
    if (!s) { if (isOpen()) close(); return; }
    // The game starts for both: the inviter is taken in when the other accepts.
    if (s.status === 'playing' && !isOpen() && minimized !== s.id && (s.invited_by === me() || view === 'joined')) open();
    if (isOpen()) {
      if ((s.status === 'expired' || s.status === 'declined') && s.invited_by === me()) { toastMsg(`${PN()} adesso non può: riprovate più tardi`); close(); return; }
      if (s.status === 'abandoned') { renderAbandoned(); return; }
      render();
    }
  }

  function hud(step) {
    const secs = session?.step_seconds || 0;
    return `<div class="us-play-steps" aria-label="Tappa ${step} di 8">${STEP_NAMES.slice(1).map((_, i) => `<i data-s="${i + 1 < step ? 'done' : i + 1 === step ? 'now' : ''}"></i>`).join('')}</div>
      <div class="us-play-hud"><div><span class="us-play-k">Tappa ${step} di 8</span><h2>${STEP_NAMES[step]}</h2></div>
      ${secs && step < 8 ? '<div class="us-play-ring" aria-hidden="true"><svg width="46" height="46" viewBox="0 0 46 46"><circle cx="23" cy="23" r="19"/><circle class="is-left" cx="23" cy="23" r="19"/></svg><b data-play-secs></b></div>' : ''}
      <button type="button" class="us-play-close" data-play="close" aria-label="Riduci Play Us">×</button></div>`;
  }
  function render() {
    const s = session; if (!s || !isOpen()) return;
    const el = root(), head = el.querySelector('.us-play-head'), body = el.querySelector('.us-play-body');
    let key;
    if (s.status === 'invited') key = 'wait';
    else if (s.status === 'playing' && now() < stepStart() && s.step === 1) key = 'lobby';
    else key = 'step' + s.step;
    if (view !== key) {
      stopMaze();
      view = key;
      head.innerHTML = key === 'wait' || key === 'lobby' ? '<div class="us-play-hud"><span class="us-play-k">Play Us</span><button type="button" class="us-play-close" data-play="close" aria-label="Riduci Play Us">×</button></div>' : hud(s.step);
      body.innerHTML = '';
      ({ wait: mountWait, lobby: mountLobby, step1: mountQuick, step2: mountPhoto, step3: mountEdit, step4: mountGuess, step5: mountSend, step6: mountMaze, step7: mountReveal, step8: mountEnd })[key]?.(body);
      body.scrollTop = 0;
      feedback(key === 'lobby' ? 'attention' : 'selection');
    }
    update();
  }
  function update() {
    const fn = ({ wait: updateWait, lobby: updateLobby, step1: updateQuick, step2: updateDoneLine, step3: updateDoneLine, step4: updateGuess, step5: updateDoneLine, step7: updateReveal, step8: updateEnd })[view];
    try { fn?.(); } catch (error) { console.warn('[US Play Us] update', error); }
  }

  // The clock: the ring, the sub-steps, and asking the server to move on.
  function tick() {
    const s = session; if (!s || !isOpen()) return;
    if (s.status === 'playing') {
      const left = Math.max(0, deadline() - now());
      const secs = root().querySelector('[data-play-secs]'), ring = root().querySelector('.us-play-ring .is-left');
      if (secs) secs.textContent = String(Math.ceil(left / 1000));
      if (ring) ring.style.strokeDashoffset = String(119.4 * (1 - left / Math.max(1, (s.step_seconds || 1) * 1000)));
      if (view === 'lobby') { if (now() >= stepStart()) render(); else updateLobby(); }
      if (view === 'step1') updateQuick();
      if (left <= 0 && Date.now() - lastAdvance > 1500) advance();
      // The other one is gone: 60 s, then the game closes and keeps what was done.
      if (!partnerOnline && partnerSeenAt && Date.now() - partnerSeenAt > 6000) paintMissing(Date.now() - partnerSeenAt);
      else paintMissing(0);
    } else if (s.status === 'invited') updateWait();
  }
  async function advance() {
    lastAdvance = Date.now();
    try { adopt(await rpc('play_us_advance', { p_session: session.id })); render(); } catch (error) { console.warn('[US Play Us] advance', error); }
  }
  async function send(step, kind, slot = 0, payload = {}) {
    const key = `${session?.id}:${step}:${kind}:${slot}`;
    try {
      adopt(await rpc('play_us_move', { p_session: session.id, p_step: step, p_kind: kind, p_slot: slot, p_payload: payload }));
      lastSent[key] = true;
      update();
      return true;
    } catch (error) {
      console.warn('[US Play Us] move', kind, error);
      if (!/time is up|not this step/.test(error?.message || '')) toastMsg('Non riesco a mandarlo. Riprova.');
      return false;
    }
  }
  async function done(step) {
    if (lastSent[`${session?.id}:${step}:done:0`]) return;
    await send(step, step === 7 ? 'ready' : 'done');
    if (move(partnerId(), step, step === 7 ? 'ready' : 'done')) advance();
  }
  function paintMissing(ms) {
    let el = root().querySelector('.us-play-missing');
    if (!ms) { el?.remove(); return; }
    const left = Math.max(0, 60 - Math.floor(ms / 1000));
    if (!el) { el = d.createElement('div'); el.className = 'us-play-missing'; el.setAttribute('role', 'status'); root().querySelector('.us-play-shell').appendChild(el); }
    el.textContent = `${PN()} non è più nell’app… aspettiamo ancora ${left} s`;
    if (left <= 0 && !busy) { busy = true; rpc('play_us_abandon', { p_session: session.id }).then((st) => { adopt(st); renderAbandoned(); }).catch(() => {}).finally(() => { busy = false; }); }
  }
  function renderAbandoned() {
    if (!isOpen()) return;
    view = 'abandoned';
    root().querySelector('.us-play-head').innerHTML = '<div class="us-play-hud"><span class="us-play-k">Play Us</span><button type="button" class="us-play-close" data-play="close" aria-label="Chiudi">×</button></div>';
    root().querySelector('.us-play-body').innerHTML = `<div class="us-play-center"><div class="us-play-duo">${character(myRole(), 70, 'sera')}</div><h2>La partita si è chiusa</h2><p>${session?.spent ? 'Quello che avete fatto è salvato. Domani un’altra partita.' : 'Non conta come la partita di oggi: potete riprovare.'}</p><button type="button" class="us-play-btn" data-play="close">Torna a Gioca</button></div>`;
  }

  // ---------------------------------------------------------------- wait + lobby
  function mountWait(body) {
    body.innerHTML = `<div class="us-play-center"><span class="us-play-k">Invito mandato</span><div class="us-play-duo">${character(myRole(), 84, 'saluta')}</div><h2>Aspettiamo ${esc(partnerName())}…</h2><p>A ${esc(partnerName())} è arrivato l’invito. Ha <b data-play-invite-left>3:00</b> per accettare.</p><button type="button" class="us-play-link" data-play="cancel">Annulla l’invito</button></div>`;
  }
  function updateWait() {
    const el = root().querySelector('[data-play-invite-left]'); if (!el || !session) return;
    const s = Math.max(0, Math.ceil((Date.parse(session.invite_expires_at) - now()) / 1000));
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (s <= 0) scheduleRefresh();
  }
  function mountLobby(body) {
    body.innerHTML = `<div class="us-play-center"><span class="us-play-k">Lobby</span><div class="us-play-duo is-big">${character(myRole(), 84)}${character(otherRole(), 80, 'cuore')}</div><h2>Ci siete tutti e due!</h2><div class="us-play-count" data-play-count>3</div></div>`;
  }
  function updateLobby() {
    const el = root().querySelector('[data-play-count]'); if (!el) return;
    const s = Math.max(1, Math.ceil((stepStart() - now()) / 1000));
    if (el.textContent !== String(s)) { el.textContent = String(s); feedback('tap'); }
  }

  // ---------------------------------------------------------------- 1 · quick questions
  function mountQuick(body) {
    body.innerHTML = `<div class="us-play-row"><span class="us-play-k">Intesa</span><div class="us-play-meter"><i data-play-meter></i></div></div><article class="us-play-q" data-play-q></article><div class="us-play-her" data-play-her></div>`;
  }
  function updateQuick() {
    const s = session; if (!s || view !== 'step1') return;
    const t = now() - stepStart(), k = Math.min(2, Math.max(0, Math.floor(t / Q_MS))), inQ = t - k * Q_MS;
    const item = s.items?.[k]; if (!item) return;
    const mine = move(me(), 1, 'answer', k), hers = move(partnerId(), 1, 'answer', k);
    const reveal = (mine && hers) || inQ >= Q_ANSWER_MS;
    const card = root().querySelector('[data-play-q]');
    const sig = `${k}:${mine?.payload?.i ?? '-'}:${hers ? 'h' : '-'}:${reveal ? 'r' : '-'}`;
    if (card && card.dataset.sig !== sig) {
      card.dataset.sig = sig;
      card.innerHTML = `<span class="us-play-k">Domanda ${k + 1} di 3</span><h3>${esc(item.q)}</h3><div class="us-play-opts">${(item.o || []).map((o, i) => {
        const cls = [mine?.payload?.i === i ? 'is-mine' : '', reveal && hers?.payload?.i === i ? 'is-hers' : ''].join(' ');
        return `<button type="button" class="us-play-opt ${cls}" data-play-answer="${i}" data-slot="${k}"${mine || reveal ? ' disabled' : ''}>${esc(o)}${reveal && hers?.payload?.i === i ? `<em>${esc(partnerName())}</em>` : ''}</button>`;
      }).join('')}</div>`;
      if (reveal && mine && hers && mine.payload.i === hers.payload.i && card.dataset.cheered !== String(k)) { card.dataset.cheered = String(k); feedback('success'); card.classList.remove('is-same'); void card.offsetWidth; card.classList.add('is-same'); }
    }
    const her = root().querySelector('[data-play-her]');
    if (her) her.innerHTML = `${character(otherRole(), 30, hers ? '' : 'sera')}<span>${hers ? (reveal ? `${esc(PN())} ha risposto` : `${esc(PN())} ha già risposto`) : `${esc(partnerName())} sta scegliendo…`}</span>`;
    const same = [0, 1, 2].filter((i) => { const a = move(me(), 1, 'answer', i), b = move(partnerId(), 1, 'answer', i); return a && b && a.payload.i === b.payload.i && (i < k || reveal); }).length;
    const meter = root().querySelector('[data-play-meter]'); if (meter) meter.style.width = `${(same / 3) * 100}%`;
    if (t >= 3 * Q_MS - 1000) done(1);
  }

  // ---------------------------------------------------------------- 2 · the photo
  const folder = () => `${cid()}/${me()}/play-us/${session.id}`;
  async function upload(blob, name, type) {
    const path = `${folder()}/${name}-${Date.now()}.${type === 'image/webp' ? 'webp' : type === 'audio/mp4' ? 'm4a' : 'webm'}`;
    const { error } = await db().storage.from('us-media').upload(path, blob, { contentType: type, upsert: false, cacheControl: '31536000' });
    if (error) throw error;
    return path;
  }
  function mountPhoto(body) {
    body.innerHTML = `<p class="us-play-lead">Scatta quello che hai davanti adesso. Arriva a ${esc(partnerName())}, che te lo ritocca.</p>
      <div class="us-play-photo" data-play-preview>${character(myRole(), 70, 'saluta')}<span>La fotocamera si apre qui sotto</span></div>
      <label class="us-play-btn" for="usPlayCam">Scatta</label><input id="usPlayCam" type="file" accept="image/*" capture="environment" hidden>
      <button type="button" class="us-play-link" data-play="skip-photo">Salta: ${esc(partnerName())} ritoccherà una vostra foto dai Ricordi</button>
      <p class="us-play-doneline" data-play-doneline></p>`;
    body.querySelector('#usPlayCam').addEventListener('change', async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      const box = body.querySelector('[data-play-preview]');
      try {
        box.innerHTML = `<img alt="La tua foto" src="${URL.createObjectURL(file)}">`;
        const blob = typeof compressImageFile === 'function' ? await compressImageFile(file, { maxDimension: 1080, quality: 0.8 }) : file;
        const path = await upload(blob, 'photo', 'image/webp');
        if (await send(2, 'photo', 0, { path })) { toastMsg(`Mandata a ${partnerName()} ✓`); feedback('success'); done(2); }
      } catch (error) { console.warn('[US Play Us] photo', error); toastMsg('Non riesco a mandare la foto. Riprova.'); }
    });
  }
  function updateDoneLine() {
    const el = root().querySelector('[data-play-doneline]'); if (!el || !session) return;
    const step = session.step, mine = lastSent[`${session.id}:${step}:done:0`] || move(me(), step, 'done'), hers = move(partnerId(), step, 'done');
    el.textContent = mine ? (hers ? 'Fatto tutti e due!' : `Fatto! Aspettiamo ${partnerName()}…`) : '';
  }

  // ---------------------------------------------------------------- 3 · retouch the other's photo
  const STICKERS = ['me', 'her', 'heart', 'star'];
  function stickerSvg(k, size) {
    if (k === 'heart') return `<svg viewBox="-12 -12 24 24" width="${size}" height="${size}"><path d="M0 8 C-12 -1 -9 -11 0 -4 C9 -11 12 -1 0 8Z" fill="#ff5a7a" stroke="#2a1220" stroke-width="1.6"/></svg>`;
    if (k === 'star') return `<svg viewBox="-12 -12 24 24" width="${size}" height="${size}"><path d="M0 -10 L3 -3 L10 -3 L4.5 1.5 L6.5 9 L0 4.5 L-6.5 9 L-4.5 1.5 L-10 -3 L-3 -3Z" fill="#f3d27a" stroke="#2a1220" stroke-width="1.4"/></svg>`;
    return character(k === 'me' ? myRole() : otherRole(), size);
  }
  const svgImage = (svg) => new Promise((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(null); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(String(svg).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')); });
  async function photoToEdit() {
    const theirs = move(partnerId(), 2, 'photo');
    let path = theirs?.payload?.path || '';
    if (!path) {
      try { const { data } = await db().from('moments').select('storage_path').eq('couple_id', cid()).order('created_at', { ascending: false }).limit(12); const list = (data || []).map((r) => r.storage_path).filter(Boolean); path = list[Math.floor(Math.random() * list.length)] || ''; } catch (_) { path = ''; }
    }
    return path ? await w.usGetSignedUrl?.(path) : '';
  }
  function mountEdit(body) {
    body.innerHTML = `<p class="us-play-lead">La foto di ${esc(partnerName())}. Ritoccala: la vedrà solo alla fine.</p>
      <div class="us-play-canvas"><canvas width="720" height="720" data-play-canvas aria-label="La foto da ritoccare"></canvas></div>
      <div class="us-play-tools"><button type="button" data-tool="st" aria-pressed="true">Adesivi</button><button type="button" data-tool="pen" aria-pressed="false">Pennarello</button><button type="button" data-tool="txt" aria-pressed="false">Scritta</button><span></span><button type="button" class="is-done" data-play="edit-done">Fatto</button></div>
      <div class="us-play-stickers" data-play-stickers>${STICKERS.map((k, i) => `<button type="button" data-st="${k}" aria-pressed="${i === 2}" aria-label="Adesivo">${stickerSvg(k, 34)}</button>`).join('')}</div>
      <div class="us-play-row" data-play-word hidden><input type="text" maxlength="24" placeholder="Scrivi e tocca la foto" value="ti amo" aria-label="La scritta"></div>
      <p class="us-play-doneline" data-play-doneline></p>`;
    const cv = body.querySelector('[data-play-canvas]'), g = cv.getContext('2d');
    g.fillStyle = '#2b1a29'; g.fillRect(0, 0, 720, 720);
    photoToEdit().then((url) => {
      if (!url) { g.fillStyle = '#f7efe9'; g.font = '600 34px Figtree, sans-serif'; g.textAlign = 'center'; g.fillText(`Disegna qualcosa per ${partnerName()} ♡`, 360, 370); return; }
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => { const k = Math.max(720 / im.width, 720 / im.height); g.drawImage(im, (720 - im.width * k) / 2, (720 - im.height * k) / 2, im.width * k, im.height * k); };
      im.src = url;
    });
    let tool = 'st', st = 'heart', drawing = false;
    body.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => { tool = b.dataset.tool; body.querySelectorAll('[data-tool]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); body.querySelector('[data-play-stickers]').hidden = tool !== 'st'; body.querySelector('[data-play-word]').hidden = tool !== 'txt'; }));
    body.querySelectorAll('[data-st]').forEach((b) => b.addEventListener('click', () => { st = b.dataset.st; body.querySelectorAll('[data-st]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * 720 / r.width, (e.clientY - r.top) * 720 / r.height]; };
    cv.addEventListener('pointerdown', async (e) => {
      const [x, y] = pos(e);
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      if (tool === 'st') { const im = await svgImage(solidSvg(stickerSvg(st, 130))); if (im) g.drawImage(im, x - 65, y - 65, 130, st === 'me' || st === 'her' ? 121 : 130); feedback('tap'); }
      else if (tool === 'txt') { const word = body.querySelector('[data-play-word] input').value.trim(); if (!word) return; g.font = 'italic 600 64px Fraunces, Georgia, serif'; g.textAlign = 'center'; g.lineWidth = 9; g.strokeStyle = '#2a1220'; g.strokeText(word, x, y); g.fillStyle = '#fff3c4'; g.fillText(word, x, y); feedback('tap'); }
      else { drawing = true; g.strokeStyle = '#ff7c96'; g.lineWidth = 14; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(x, y); }
    });
    cv.addEventListener('pointermove', (e) => { if (!drawing) return; const [x, y] = pos(e); g.lineTo(x, y); g.stroke(); });
    cv.addEventListener('pointerup', () => { drawing = false; });
    body.dataset.editing = '1';
  }
  async function saveEdit() {
    const body = root().querySelector('.us-play-body'), cv = body?.querySelector('[data-play-canvas]');
    if (!cv || body.dataset.saving === '1' || move(me(), 3, 'edit')) return;
    body.dataset.saving = '1';
    try {
      const blob = await new Promise((ok) => cv.toBlob(ok, 'image/webp', 0.82));
      const path = await upload(blob, 'edit', 'image/webp');
      if (await send(3, 'edit', 0, { path })) { toastMsg(`Fatto! ${PN()} lo vedrà alla fine`); feedback('success'); done(3); }
    } catch (error) { console.warn('[US Play Us] edit', error); toastMsg('Non riesco a salvare il ritocco.'); body.dataset.saving = '0'; }
  }

  // ---------------------------------------------------------------- 4 · quanto mi conosci
  const guessDraft = {};
  function mountGuess(body) { body.innerHTML = '<article class="us-play-q" data-play-guess></article><p class="us-play-doneline" data-play-doneline></p>'; }
  function updateGuess() {
    const s = session, card = root().querySelector('[data-play-guess]'); if (!s || !card) return;
    const slot = [0, 1].find((i) => !move(me(), 4, 'guess', i));
    if (slot === undefined) { card.innerHTML = `<div class="us-play-center"><div class="us-play-duo">${character(myRole(), 64)}</div><h3>Fatto! Alla fine scoprirai se hai indovinato.</h3></div>`; updateDoneLine(); done(4); return; }
    const item = s.items?.[3 + slot]; const draft = guessDraft[`${s.id}:${slot}`];
    const sig = `${slot}:${draft ?? '-'}`; if (card.dataset.sig === sig) return; card.dataset.sig = sig;
    const opts = (who) => (item.o || []).map((o, i) => `<button type="button" class="us-play-opt${who === 'self' && draft === i ? ' is-mine' : ''}" data-play-guess-${who}="${i}" data-slot="${slot}"${who === 'guess' && draft === undefined ? ' disabled' : ''}>${esc(o)}</button>`).join('');
    card.innerHTML = `<span class="us-play-k">Domanda ${slot + 1} di 2</span><h3>${esc(item.q)}</h3><p class="us-play-sub">Tu?</p><div class="us-play-opts">${opts('self')}</div><p class="us-play-sub">E ${esc(partnerName())}, secondo te?</p><div class="us-play-opts">${opts('guess')}</div>`;
  }

  // ---------------------------------------------------------------- 5 · a voice note or a gesture
  let rec = null;
  function mountSend(body) {
    body.innerHTML = `<p class="us-play-lead">Tieni premuto e di’ qualcosa a ${esc(partnerName())} per 5 secondi. Non puoi parlare? Manda un gesto.</p>
      <button type="button" class="us-play-mic" data-play-mic>Tieni<br>premuto</button><div class="us-play-wave" data-play-wave>${'<i></i>'.repeat(22)}</div>
      <div class="us-play-gest">${GESTURES.map(([k, e, n]) => `<button type="button" data-play-gesture="${k}"><span>${e}</span>${n}</button>`).join('')}</div>
      <p class="us-play-doneline" data-play-doneline></p>`;
    const mic = body.querySelector('[data-play-mic]'), bars = [...body.querySelectorAll('[data-play-wave] i')];
    let anim = 0, started = 0, timer = 0;
    const stopAnim = () => { clearInterval(anim); anim = 0; mic.classList.remove('is-rec'); bars.forEach((b) => { b.style.height = '6px'; }); };
    const finish = async (keep) => {
      clearTimeout(timer); stopAnim();
      const r = rec; rec = null; if (!r) return;
      const chunks = [];
      r.recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      r.recorder.onstop = async () => {
        r.stream.getTracks().forEach((t) => t.stop());
        if (!keep || !chunks.length) return;
        const type = (r.recorder.mimeType || 'audio/webm').split(';')[0];
        try { const path = await upload(new Blob(chunks, { type }), 'voice', type === 'audio/mp4' ? 'audio/mp4' : 'audio/webm'); if (await send(5, 'voice', 0, { path })) { toastMsg('Vocale mandato ✓'); feedback('success'); done(5); } }
        catch (error) { console.warn('[US Play Us] voice', error); toastMsg('Non riesco a mandare il vocale.'); }
      };
      try { r.recorder.stop(); } catch (_) {}
    };
    mic.addEventListener('pointerdown', async (e) => {
      e.preventDefault();
      if (rec || move(me(), 5, 'voice') || move(me(), 5, 'gesture')) return;
      const MR = w.MediaRecorder;
      if (!MR || !navigator.mediaDevices?.getUserMedia) { toastMsg('Da qui non si può mandare un vocale: manda un gesto'); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => { try { return MR.isTypeSupported?.(t); } catch (_) { return false; } });
        const recorder = type ? new MR(stream, { mimeType: type }) : new MR(stream);
        rec = { recorder, stream }; recorder.start(); started = Date.now();
        mic.classList.add('is-rec'); feedback('tap');
        anim = setInterval(() => bars.forEach((b) => { b.style.height = `${6 + Math.random() * 28}px`; }), 90);
        timer = setTimeout(() => finish(true), 5000);
      } catch (_) { toastMsg('Il microfono non è disponibile: manda un gesto'); }
    });
    const release = () => { if (!rec) return; const held = Date.now() - started; if (held < 5000) { if (held < 900) toastMsg('Tieni premuto un po’ di più'); finish(held >= 900); } };
    mic.addEventListener('pointerup', release); mic.addEventListener('pointerleave', release); mic.addEventListener('pointercancel', release);
  }

  // ---------------------------------------------------------------- 6 · the maze
  function mountMaze(body) {
    body.innerHTML = `<div class="us-play-scores"><div>${character(myRole(), 28)}<span>Tu</span><b data-play-score-me>0</b></div><div>${character(otherRole(), 26)}<span>${esc(partnerName())}</span><b data-play-score-her>0</b></div></div>
      <div class="us-play-canvas is-maze"><canvas width="520" height="520" data-play-maze aria-label="Labirinto: scorri per muoverti"></canvas></div>
      <div class="us-play-pad"><span></span><button type="button" data-play-dir="0,-1" aria-label="Su">▲</button><span></span><button type="button" data-play-dir="-1,0" aria-label="Sinistra">◀</button><button type="button" data-play-dir="0,1" aria-label="Giù">▼</button><button type="button" data-play-dir="1,0" aria-label="Destra">▶</button></div>
      <p class="us-play-sub">Scorri sul labirinto. Cuore +10 · Ti penso +20 e 3 s invincibile (+30 per ogni nuvoletta presa) · una nuvoletta ti toglie 5 punti.</p>`;
    herLive = 0;
    const M = w.UsPlayUsMaze; if (!M) return;
    let lastBroadcast = 0;
    maze = M.mount(body.querySelector('[data-play-maze]'), {
      seed: session.seed, reduced: reduced(),
      me: { normal: solidSvg(character(myRole(), 64)), love: solidSvg(character(myRole(), 64, 'cuore')) },
      onScore: (s) => {
        const el = root().querySelector('[data-play-score-me]'); if (el) el.textContent = String(s);
        if (Date.now() - lastBroadcast > 350) { lastBroadcast = Date.now(); try { couple?.send({ type: 'broadcast', event: 'score', payload: { u: me(), s } }); } catch (_) {} }
      },
      onEvent: (e) => { if (e === 'power' || e === 'cloud') feedback('success'); else if (e === 'hit') feedback('error'); }
    });
    // 45 s of game inside the 47 s of the step, then the score goes to the server.
    const endAt = stepStart() + 45000;
    const watch = setInterval(async () => {
      if (view !== 'step6') { clearInterval(watch); return; }
      if (now() >= endAt) { clearInterval(watch); const score = stopMaze(); await send(6, 'score', 0, { score }); feedback('reveal'); done(6); }
    }, 200);
  }
  function stopMaze() { if (!maze) return 0; const s = maze.stop(); maze = null; return s; }
  function paintHerScore() { const el = root().querySelector('[data-play-score-her]'); if (el) el.textContent = String(herLive); }

  // ---------------------------------------------------------------- 7 · reveal together
  function mountReveal(body) {
    const s = session, p = partnerId();
    const same = [0, 1, 2].filter((i) => { const a = move(me(), 1, 'answer', i), b = move(p, 1, 'answer', i); return a && b && a.payload.i === b.payload.i; }).length;
    const myGuessRight = [0, 1].filter((i) => { const a = move(me(), 4, 'guess', i), b = move(p, 4, 'guess', i); return a && b && a.payload.guess === b.payload.self; }).length;
    const myScore = move(me(), 6, 'score')?.payload?.score ?? 0, herScore = move(p, 6, 'score')?.payload?.score ?? herLive;
    const gesture = move(p, 5, 'gesture')?.payload?.g, voice = move(p, 5, 'voice')?.payload?.path;
    const g = GESTURES.find(([k]) => k === gesture);
    body.innerHTML = `<div class="us-play-duo">${character(myRole(), 64, 'cuore')}${character(otherRole(), 60, 'cuore')}</div>
      <div class="us-play-photos"><figure><img data-play-img="mine" alt="La foto di ${esc(partnerName())} ritoccata da te"><figcaption>La sua foto, ritoccata da te</figcaption></figure><figure><img data-play-img="hers" alt="La tua foto ritoccata da ${esc(partnerName())}"><figcaption>La tua, ritoccata da ${esc(partnerName())}</figcaption></figure></div>
      <ul class="us-play-list"><li>Domande lampo <span>${same} su 3 uguali</span></li><li>Quanto conosci ${esc(partnerName())} <span>${myGuessRight} su 2 indovinate</span></li>
      <li>Da ${esc(partnerName())} <span>${voice ? '<button type="button" class="us-play-link" data-play="voice">▶ il vocale</button>' : g ? `${g[1]} ${g[2]}` : 'niente, stavolta'}</span></li><li>La sfida <span>${myScore} a ${herScore}</span></li></ul>
      <button type="button" class="us-play-btn" data-play="ready">Avanti</button><p class="us-play-doneline" data-play-doneline></p>`;
    const mineEdit = move(me(), 3, 'edit')?.payload?.path, hersEdit = move(p, 3, 'edit')?.payload?.path;
    [['mine', mineEdit], ['hers', hersEdit]].forEach(async ([k, path]) => {
      const img = body.querySelector(`[data-play-img="${k}"]`); if (!img) return;
      if (!path) { img.closest('figure').classList.add('is-empty'); return; }
      img.src = (await w.usGetSignedUrl?.(path)) || '';
    });
    body.dataset.voice = voice || '';
    feedback('reveal');
  }
  function updateReveal() {
    const el = root().querySelector('[data-play-doneline]'); if (!el) return;
    const mine = move(me(), 7, 'ready'), hers = move(partnerId(), 7, 'ready');
    el.textContent = mine ? (hers ? '' : `Aspettiamo ${partnerName()}…`) : '';
  }

  // ---------------------------------------------------------------- 8 · the memory
  function mountEnd(body) { body.innerHTML = '<div data-play-end></div>'; }
  function updateEnd() {
    const s = session, box = root().querySelector('[data-play-end]'); if (!s || !box) return;
    const r = s.result || {}, winner = r.winner || null, pegno = moves().find((m) => m.kind === 'pegno')?.payload?.text || '';
    const sig = `${winner}:${pegno}:${r.finished_at ? 1 : 0}`; if (box.dataset.sig === sig) return; box.dataset.sig = sig;
    const scores = r.scores || {}, mine = scores[me()] ?? 0, hers = scores[partnerId()] ?? 0;
    const head = winner === me() ? 'Hai vinto la sfida!' : winner ? `Ha vinto ${esc(partnerName())}` : 'Pari! Niente pegno oggi';
    let pegnoHtml = '';
    if (winner === me() && !pegno) pegnoHtml = `<span class="us-play-k">Scegli il pegno di ${esc(partnerName())}</span><div class="us-play-pegni">${PEGNI.map((p) => `<button type="button" data-play-pegno="${esc(p)}">${esc(p)}</button>`).join('')}</div>`;
    else if (pegno) pegnoHtml = `<div class="us-play-postit">«${esc(pegno)}»<small>${winner === me() ? 'Tu' : esc(partnerName())} · sulla lavagna di Noi</small></div>`;
    else if (winner) pegnoHtml = `<p class="us-play-sub">${esc(PN())} sta scegliendo il tuo pegno…</p>`;
    box.innerHTML = `<section class="us-play-memory"><span class="us-play-k">Play Us · ${esc(new Date(s.day + 'T12:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }))}</span><h3>${head}</h3>
        <p>${r.intesa ?? 0} su 3 uguali · sfida ${mine}–${hers}</p></section>
      ${pegnoHtml}
      ${Number(r.xp) > 0 ? `<p class="us-play-center-line"><b>+${Number(r.xp)}</b> punti per il vostro livello${s.moment_id ? ' · salvato in Ricordi' : ''}</p>` : s.moment_id ? '<p class="us-play-center-line">Salvato in Ricordi</p>' : ''}
      <p class="us-play-sub us-play-center-line">Domani un’altra partita.<br><small>Con US Plus potrete giocarne di più</small></p>
      <button type="button" class="us-play-btn is-ghost" data-play="close">Torna a Gioca</button>`;
    if (pegno || !winner) feedback('success');
  }

  // ---------------------------------------------------------------- actions
  d.addEventListener('click', async (e) => {
    const t = e.target.closest?.('[data-play],[data-play-answer],[data-play-guess-self],[data-play-guess-guess],[data-play-gesture],[data-play-pegno],[data-play-dir]');
    if (!t) return;
    const act = t.dataset.play;
    if (t.dataset.playDir) { const [dx, dy] = t.dataset.playDir.split(',').map(Number); maze?.setDir(dx, dy); return; }
    if (t.dataset.playAnswer !== undefined) { t.disabled = true; feedback('tap'); await send(1, 'answer', Number(t.dataset.slot), { i: Number(t.dataset.playAnswer) }); updateQuick(); return; }
    if (t.dataset.playGuessSelf !== undefined) { guessDraft[`${session.id}:${t.dataset.slot}`] = Number(t.dataset.playGuessSelf); feedback('tap'); updateGuess(); return; }
    if (t.dataset.playGuessGuess !== undefined) { const slot = Number(t.dataset.slot); feedback('tap'); await send(4, 'guess', slot, { self: guessDraft[`${session.id}:${slot}`], guess: Number(t.dataset.playGuessGuess) }); root().querySelector('[data-play-guess]').dataset.sig = ''; updateGuess(); return; }
    if (t.dataset.playGesture) { if (await send(5, 'gesture', 0, { g: t.dataset.playGesture })) { toastMsg('Mandato ✓'); feedback('success'); done(5); } return; }
    if (t.dataset.playPegno) { await send(8, 'pegno', 0, { text: t.dataset.playPegno }); return; }
    if (busy && act !== 'close') return;
    try {
      busy = true;
      if (act === 'invite') {
        adopt(await rpc('play_us_invite'));
        try { w.sendWebPushEvent?.('play_invite', session.id)?.catch?.(() => {}); } catch (_) {}
        feedback('action'); open();
      } else if (act === 'accept') {
        const s = session; if (!s) return;
        adopt(await rpc('play_us_answer', { p_session: s.id, p_accept: true }));
        view = 'joined'; d.getElementById('usPlayUsInvite')?.remove(); open();
      } else if (act === 'decline') {
        const s = session; dismissedInvite = s?.id || '';
        d.getElementById('usPlayUsInvite')?.remove();
        if (s) adopt(await rpc('play_us_answer', { p_session: s.id, p_accept: false }));
        paintCard();
      } else if (act === 'cancel') {
        adopt(await rpc('play_us_abandon', { p_session: session.id })); close();
      } else if (act === 'open') open();
      else if (act === 'close') close();
      else if (act === 'skip-photo') { if (await send(2, 'photo', 0, { skipped: true })) done(2); }
      else if (act === 'edit-done') await saveEdit();
      else if (act === 'ready') { t.disabled = true; await done(7); }
      else if (act === 'voice') { const path = root().querySelector('.us-play-body')?.dataset.voice; const url = path ? await w.usGetSignedUrl?.(path) : ''; if (url) new Audio(url).play().catch(() => {}); }
    } catch (error) {
      const msg = error?.message || '';
      console.warn('[US Play Us]', act, error);
      toastMsg(/played today/.test(msg) ? 'Avete già giocato oggi. Domani un’altra partita.'
        : /game open/.test(msg) ? 'C’è già una partita aperta.'
        : /partner missing/.test(msg) ? 'Play Us si gioca in due: invita prima la tua persona.'
        : /invite closed/.test(msg) ? 'L’invito non c’è più.'
        : /not enough content/.test(msg) ? 'Le domande non sono pronte. Riprova più tardi.'
        : 'Non riesco adesso. Riprova.');
      scheduleRefresh();
    } finally { busy = false; }
  });
  // When the step time ends while retouching, what is on the canvas is sent.
  setInterval(() => { if (view === 'step3' && session?.status === 'playing' && deadline() - now() < 2500) saveEdit(); }, 500);

  // ---------------------------------------------------------------- boot
  async function boot() {
    if (!w.usProfile?.id || !w.usProfile?.couple_id || !db()) { setTimeout(boot, 1200); return; }
    try { const { data } = await db().from('profiles').select('id').eq('couple_id', cid()).neq('id', me()).limit(1); couplePartner = data?.[0]?.id || null; } catch (_) {}
    startLive();
    refresh();
  }
  w.addEventListener('us-identity-change', () => { stopLive(); today = session = null; boot(); });
  // After the first screen (UsAppReady), in an idle moment: Play Us never costs the opening.
  const start = () => { const go = () => (typeof w.requestIdleCallback === 'function' ? w.requestIdleCallback(() => boot(), { timeout: 3000 }) : setTimeout(boot, 1200)); Promise.resolve(w.UsAppReady?.whenReady).then(go, go); };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start, { once: true }); else start();
  w.UsPlayUs = { refresh, paintCard, open, close, isOpen, state: () => ({ today, session, partnerOnline }) };
})();
