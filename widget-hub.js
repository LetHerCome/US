(() => {
  'use strict';

  // Widget Hub — Impostazioni → Widget. Lists the US widgets with a live
  // preview of what each one shows now, whether it is already on the Home
  // screen, and one action: "Aggiungi alla Home" (requestPinAppWidget). The
  // manual route is shown only when the launcher refuses or never confirms.
  //
  // The catalog is platform-neutral (ids, copy, destinations, previews); only
  // installed()/requestPin()/openSettings() come from the platform adapter
  // (UsWidgets → UsPlatform), so an iOS/WidgetKit adapter can reuse the UX.
  if (window.__usWidgetHubInstalled) return;
  window.__usWidgetHubInstalled = true;

  const CATALOG = Object.freeze([
    { kind: 'think', name: 'Ti penso', copy: 'Un pensiero con un tocco, anche con US chiusa.', shape: 'square' },
    // 04/11/2026: the Countdown left the widgets; the Post-it took its place.
    { kind: 'postit', name: 'Post-it', copy: 'L’ultimo post-it della vostra bacheca. Toccalo per aprirla.', shape: 'square' },
    { kind: 'noi', name: 'Distanza e batteria', copy: 'La distanza tra voi e la batteria della tua persona. Mai dove siete.', shape: 'wide' },
    { kind: 'photo', name: 'Foto & Noi', copy: 'La foto di Oggi, che cambia ogni ora, con i giorni insieme.', shape: 'square' },
    { kind: 'daily', name: 'La domanda di oggi', copy: 'La domanda di oggi e a chi tocca rispondere. Mai le risposte.', shape: 'wide' },
    { kind: 'message', name: 'Lasciato per te', copy: 'Il Lasciato per te ancora chiuso: solo che cosa è e quando.', shape: 'square' },
    { kind: 'memories', name: 'Ricordi a pila', copy: 'Le vostre foto di questo giorno, un anno fa. Altrimenti le più recenti.', shape: 'square' },
    { kind: 'status', name: 'Come stai', copy: 'Come state tu e la tua persona: i vostri personaggi con la faccia del momento. Dura 12 ore.', shape: 'wide' },
    { kind: 'lavagna', name: 'Lavagna', copy: 'L’ultimo disegno sulla vostra lavagna. Toccalo per disegnare.', shape: 'square' }
  ]);
  window.UsWidgetCatalog = CATALOG;

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const IMAGE = '<svg viewBox="0 0 256 256" aria-hidden="true"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V158.75l-26.07-26.06a16,16,0,0,0-22.63,0l-20,20-44-44a16,16,0,0,0-22.62,0L40,149.37V56ZM40,172l52-52,80,80H40Zm176,28H194.63l-36-36,20-20L216,181.38V200ZM144,100a12,12,0,1,1,12,12A12,12,0,0,1,144,100Z"/></svg>';

  let device = { installed: {}, pinSupported: false, vendor: 'android' };
  const status = {};
  let pending = null;
  let pollTimer = null;

  window.addEventListener('us:noi-widget-photo-updated', () => { if (isOpen()) render(); });
  const widgets = () => window.UsWidgets;
  const isOpen = () => $('usWidgetHub')?.classList.contains('open');

  // ---------- previews (same semantic snapshot the native widgets render) ----------

  function together(startedOn) {
    return startedOn ? window.USCountdown?.relationship?.(startedOn) || null : null;
  }

  // Widget del redesign (founder, 26/11/2026): the tiles speak like the
  // widgets, on the warm night or the Quaderno's paper with the app, the
  // characters as personaggi.js draws them (shape, colour, look, Come stai).
  const meRole = () => (window.usProfile?.role === 'beatrice' ? 'beatrice' : 'francesco');
  const themRole = () => (meRole() === 'beatrice' ? 'francesco' : 'beatrice');
  const who = (role, options = {}) => window.UsPersonaggi?.character?.(role, { size: 28, ...options }) || '';
  // The heart from your colour to theirs: the only place where the two blend.
  const BLENDED = '<svg viewBox="0 0 256 256" aria-hidden="true"><defs><linearGradient id="usWpHeart" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--us-tu)"/><stop offset="1" style="stop-color:var(--us-partner)"/></linearGradient></defs><path d="M128,224S24,168,24,102A54,54,0,0,1,128,81.4,54,54,0,0,1,232,102C232,168,128,224,128,224Z" fill="url(#usWpHeart)"/></svg>';

  function thinkPreview(snapshot) {
    const think = snapshot.think || {};
    const partner = window.UsIdentity?.current().partnerName || 'La tua persona';
    const received = Date.parse(think.lastReceivedAt || '') || 0;
    const answered = Math.max(Date.parse(think.lastSentAt || '') || 0, Date.parse(think.lastAnsweredAt || '') || 0);
    const ricambia = received && received > answered;
    const message = ricambia ? `${partner} ti sta pensando` : `Pensa a ${partner}`;
    return `<div class="us-wp-think" aria-label="${esc(message)}"><i>${BLENDED}</i></div>`;
  }

  function daysLine(snapshot) {
    const view = together(snapshot.couple?.startedOn);
    return view ? { value: view.value, unit: Number(view.value) === 1 ? 'giorno insieme' : 'giorni insieme' } : null;
  }

  // Distanza e batteria: the two colours, the distance, never a map.
  function noiPreview(snapshot) {
    const known=snapshot.couple?.distanceNear || snapshot.couple?.distanceText;
    const distance=snapshot.couple?.distanceNear ? 'meno di 3 km' : snapshot.couple?.distanceText || 'Distanza non nota';
    const sub=known
      ? (snapshot.couple?.distanceState === 'stale' ? 'ULTIMA DISTANZA' : 'TRA VOI')
      : 'APRI NOI';
    return `<div class="us-wp-noi us-wp-noi-light" aria-label="${esc(sub)}">
      <b>${esc(distance)}</b>
      <span class="us-wp-duo">${who(meRole(), { size: 22 })}${who(themRole(), { size: 22 })}</span>
    </div>`;
  }

  const DAILY_STATUS = Object.freeze({ todo: 'Rispondi quando vuoi', your_turn: 'Tocca a te', waiting: 'Hai risposto', ready: 'Le vostre risposte sono pronte' });
  function dailyPreview(snapshot) {
    const d = snapshot.daily || {};
    const shown = d.state && d.state !== 'none' && d.question;
    // Their character, waving once they answered (personaggi.js reactionOf).
    return `<div class="us-wp-daily" aria-label="${esc(shown ? DAILY_STATUS[d.state] || '' : 'Apri US per la domanda nuova')}">${who(themRole(), { size: 34, reaction: d.state === 'your_turn' ? 'saluta' : '' })}</div>`;
  }

  // Lasciato per te: the paper envelope with the ceralacca seal, its edge in their colour.
  function messagePreview() {
    return `<div class="us-wp-message"><span class="us-wp-envelope"></span></div>`;
  }

  function photoPreview(snapshot, previewUrl) {
    const days = daysLine(snapshot);
    const line = days ? `<span class="us-wp-photo-days"><b>${esc(days.value)}</b><small>${esc(days.unit)}</small></span>` : '';
    if (snapshot.photo?.state === 'ready' && previewUrl) {
      return `<div class="us-wp-photo has-photo"><img src="${esc(previewUrl)}" alt="">${line}</div>`;
    }
    return `<div class="us-wp-photo"><p>${IMAGE}<span>La foto di Oggi apparirà qui</span></p>${line}</div>`;
  }

  // Ricordi a pila: the memory it shows now, never the photos here.
  function memoriesPreview(snapshot) {
    const m = snapshot.memories || {};
    const text = m.state === 'ready' ? [m.label, m.title].filter(Boolean).join(' · ') : 'I vostri ricordi appariranno qui';
    // A polaroid, as in Ricordi; never the photos here.
    return `<div class="us-wp-memories" aria-label="${esc(text)}"><i></i></div>`;
  }

  // Lavagna: the drawing as the board shows it now, or the empty board.
  function lavagnaPreview(snapshot) {
    const url = window.UsLavagna?.preview?.() || '';
    const label = url || snapshot.lavagna?.state === 'ready' ? 'La vostra lavagna' : 'La lavagna è vuota';
    return `<div class="us-wp-lavagna" aria-label="${esc(label)}">${url ? `<img src="${esc(url)}" alt="">` : ''}</div>`;
  }

  // Post-it: the newest post-it of the board, on its paper.
  function postitPreview(snapshot) {
    const p = snapshot.postit || {};
    const ready = p.state === 'ready' && p.text;
    return `<div class="us-wp-postit" data-color="${esc(ready ? p.color || 'yellow' : 'yellow')}"><b translate="no">${esc(ready ? p.text : 'Scrivi il primo post-it')}</b>${ready && p.more ? `<small>+${esc(p.more)}</small>` : ''}</div>`;
  }

  // Come stai, «Voi due»: your characters with the faces of your Come stai.
  function statusPreview() {
    return `<div class="us-wp-status"><span class="us-wp-duo">${who(meRole(), { size: 30 })}${who(themRole(), { size: 28 })}</span></div>`;
  }

  function preview(kind, view) {
    const snapshot = view.snapshot || {};
    if (kind === 'think') return thinkPreview(snapshot);
    if (kind === 'postit') return postitPreview(snapshot);
    if (kind === 'noi') return noiPreview(snapshot);
    if (kind === 'daily') return dailyPreview(snapshot);
    if (kind === 'message') return messagePreview();
    if (kind === 'memories') return memoriesPreview(snapshot);
    if (kind === 'status') return statusPreview();
    if (kind === 'lavagna') return lavagnaPreview(snapshot);
    return photoPreview(snapshot, view.photoPreviewUrl);
  }

  // ---------- render ----------

  function render() {
    const list = $('usWidgetHubList');
    if (!list || !widgets()) return;
    const view = widgets().view();
    list.innerHTML = CATALOG.map((item) => {
      const count = Number(device.installed?.[item.kind]) || 0;
      const chip = count ? `<span class="us-widget-hub-chip">Sulla Home${count > 1 ? ` · ${count}` : ''}</span>` : '';
      const line = status[item.kind] || '';
      return `<article class="us-widget-hub-card" data-widget-kind="${item.kind}">
        <div class="us-widget-hub-preview is-${item.shape}" aria-hidden="true">${preview(item.kind, view)}</div>
        <div class="us-widget-hub-copy">
          <div class="us-widget-hub-title"><b>${esc(item.name)}</b>${chip}</div>
          <p>${esc(item.copy)}</p>
          <button type="button" class="us-widget-hub-add" data-widget-add="${item.kind}" ${pending?.kind === item.kind ? 'disabled' : ''}>Aggiungi alla Home</button>
          <small class="us-widget-hub-status" role="status" aria-live="polite">${esc(line)}</small>
        </div>
      </article>`;
    }).join('');

  }

  async function refreshDevice() {
    if (!widgets()) return;
    device = await widgets().installed();
    if (isOpen()) render();
  }

  // ---------- add to Home ----------

  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function settle(kind, placed) {
    if (!pending || pending.kind !== kind) return;
    stopPolling();
    pending = null;
    if (placed) {
      status[kind] = 'Aggiunto alla Home';
      window.UsFeedback?.success?.();
    } else {
      status[kind] = 'Non aggiunto. Riprova oppure usa la sezione Widget della Home Android.';
    }
    render();
  }

  async function checkPending() {
    if (!pending) return;
    await refreshDevice();
    if (!pending) return;
    const count = Number(device.installed?.[pending.kind]) || 0;
    if (count > pending.before) settle(pending.kind, true);
    else if (Date.now() - pending.at > 20000) settle(pending.kind, false);
  }

  async function add(kind) {
    if (!widgets() || pending) return;
    const before = Number(device.installed?.[kind]) || 0;
    status[kind] = 'Preparo il widget…';
    pending = { kind, before, at: Date.now() };
    render();
    let result = { supported: false, requested: false };
    try { result = await widgets().requestPin(kind); } catch (_) {}
    if (!result.requested) {
      pending = null;
      status[kind] = result.supported ? 'Il telefono non ha aperto la richiesta. Riprova.' : (result.steps || 'Questo telefono non aggiunge widget da solo. Usa i widget della Home.');
      render();
      return;
    }
    status[kind] = 'Conferma sulla schermata che si è aperta.';
    render();
    stopPolling();
    pollTimer = setInterval(() => { checkPending().catch(() => {}); }, 1500);
  }

  // ---------- surface ----------

  function open() {
    const root = $('usWidgetHub');
    if (!root || !widgets()?.isAvailable()) return;
    window.UsUiFoundation?.cancelSurfaceExit?.(root);
    root.classList.add('open');
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('us-settings-modal-open');
    render();
    refreshDevice().catch(() => {});
    // Preview uses Oggi's currently painted photo, not the latest Ricordo.
    widgets().syncPhoto?.().then(() => { if (isOpen()) render(); }).catch(() => {});
    widgets().syncNoiPortrait?.().then(() => { if (isOpen()) render(); }).catch(() => {});
  }

  function close() {
    const root = $('usWidgetHub');
    if (!root || !root.classList.contains('open')) return;
    stopPolling();
    pending = null;
    const finalize = () => {
      root.classList.remove('open');
      root.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('us-settings-modal-open');
    };
    if (window.UsUiFoundation?.exitSurface) window.UsUiFoundation.exitSurface(root, finalize);
    else finalize();
  }

  function boot() {
    const row = document.querySelector('[data-us-setting="widgets"]');
    const available = Boolean(widgets()?.isAvailable());
    if (row) row.hidden = !available;
    if (!available) return;
    $('usWidgetHubList')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-widget-add]');
      if (button && !button.disabled) add(button.dataset.widgetAdd);
    });
    document.querySelectorAll('[data-us-widget-hub-close]').forEach((el) => el.addEventListener('click', close));
    $('usWidgetHubPermissions')?.addEventListener('click', () => { widgets().openSettings(); });
    window.addEventListener('us:widget-pinned', (event) => {
      const kind = event.detail?.kind;
      refreshDevice().then(() => settle(kind, true)).catch(() => {});
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && isOpen()) {
        if (pending) checkPending().catch(() => {});
        else refreshDevice().catch(() => {});
      }
    });
  }

  window.UsWidgetHub = Object.freeze({ open, close, catalog: CATALOG });
  window.closeUsWidgetHub = close;
  window.addEventListener('us-identity-change',()=>{if(isOpen())render();});

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
