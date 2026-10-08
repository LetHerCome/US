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
    { kind: 'countdown', name: 'Countdown', copy: 'Lo stesso Countdown che hai scelto su Oggi.', shape: 'square' },
    { kind: 'noi', name: 'Noi', copy: 'Voi due e i giorni insieme.', shape: 'wide' },
    { kind: 'photo', name: 'Foto & Noi', copy: 'La fotografia che vedi su Oggi, con i giorni insieme.', shape: 'square' }
  ]);
  window.UsWidgetCatalog = CATALOG;

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12,21.35L10.55,20.03C5.4,15.36 2,12.28 2,8.5C2,5.42 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.09C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.42 22,8.5C22,12.28 18.6,15.36 13.45,20.04L12,21.35Z"/></svg>';
  const IMAGE = '<svg viewBox="0 0 256 256" aria-hidden="true"><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40Zm0,16V158.75l-26.07-26.06a16,16,0,0,0-22.63,0l-20,20-44-44a16,16,0,0,0-22.62,0L40,149.37V56ZM40,172l52-52,80,80H40Zm176,28H194.63l-36-36,20-20L216,181.38V200ZM144,100a12,12,0,1,1,12,12A12,12,0,0,1,144,100Z"/></svg>';

  let device = { installed: {}, pinSupported: false, vendor: 'android' };
  const status = {};
  let manualNeeded = false;
  let pending = null;
  let pollTimer = null;

  const widgets = () => window.UsWidgets;
  const isOpen = () => $('usWidgetHub')?.classList.contains('open');

  // ---------- previews (same semantic snapshot the native widgets render) ----------

  function together(startedOn) {
    return startedOn ? window.USCountdown?.relationship?.(startedOn) || null : null;
  }

  function thinkPreview(snapshot) {
    const think = snapshot.think || {};
    const partner = window.UsIdentity?.current().partnerName || 'La tua persona';
    const received = Date.parse(think.lastReceivedAt || '') || 0;
    const answered = Math.max(Date.parse(think.lastSentAt || '') || 0, Date.parse(think.lastAnsweredAt || '') || 0);
    const ricambia = received && received > answered;
    const message = ricambia ? `${partner} ti sta pensando` : `Pensa a ${partner}`;
    return `<div class="us-wp-think"><b>${esc(message)}</b><i>${HEART}</i><small>${ricambia ? 'Ricambia' : 'Ti penso'}</small></div>`;
  }

  function countdownPreview(snapshot) {
    const c = snapshot.countdown || {};
    if (!c.active) return '<div class="us-wp-countdown" data-style="editorial"><p>Scegli un Countdown su Oggi</p></div>';
    let view = null;
    if (c.kind === 'together') view = together(c.target);
    else view = window.USCountdown?.display?.({ mode: c.kind, target: c.target });
    if (!view) view = { value: '12', unit: 'giorni', label: '' };
    const clock = view.value.includes(':');
    return `<div class="us-wp-countdown" data-style="${esc(c.style || 'editorial')}"><span class="us-wp-cd-title">${esc(c.title)}</span><b${clock ? ' class="is-clock"' : ''}>${esc(view.value)}</b>${view.unit ? `<span class="us-wp-cd-unit">${esc(view.unit)}</span>` : ''}${view.label && !clock ? `<span class="us-wp-cd-sub">${esc(view.label)}</span>` : ''}</div>`;
  }

  function daysLine(snapshot) {
    const view = together(snapshot.couple?.startedOn);
    return view ? { value: view.value, unit: Number(view.value) === 1 ? 'giorno insieme' : 'giorni insieme' } : null;
  }

  function noiPreview(snapshot) {
    const names = window.UsIdentity?.current().pairLabel || 'Voi due';
    const days = daysLine(snapshot);
    return `<div class="us-wp-noi" data-frame="${esc(snapshot.couple?.frame || '')}"><span><i></i>${esc(names)}</span><b>${esc(days?.value || '—')}<small>${esc(days?.unit || 'giorni insieme')}</small></b></div>`;
  }

  function photoPreview(snapshot, previewUrl) {
    const days = daysLine(snapshot);
    const line = days ? `<span class="us-wp-photo-days"><b>${esc(days.value)}</b><small>${esc(days.unit)}</small></span>` : '';
    if (snapshot.photo?.state === 'ready' && previewUrl) {
      return `<div class="us-wp-photo has-photo"><img src="${esc(previewUrl)}" alt="">${line}</div>`;
    }
    return `<div class="us-wp-photo"><p>${IMAGE}<span>La foto di Oggi apparirà qui</span></p>${line}</div>`;
  }

  function preview(kind, view) {
    const snapshot = view.snapshot || {};
    if (kind === 'think') return thinkPreview(snapshot);
    if (kind === 'countdown') return countdownPreview(snapshot);
    if (kind === 'noi') return noiPreview(snapshot);
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
    const manual = $('usWidgetHubManual');
    if (manual) {
      manual.hidden = !(manualNeeded || device.pinSupported === false);
      $('usWidgetHubVendor').hidden = device.vendor !== 'xiaomi';
    }
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
      status[kind] = 'Non è comparso? Aggiungilo a mano qui sotto.';
      manualNeeded = true;
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
      manualNeeded = true;
      status[kind] = result.supported ? 'Il telefono non ha aperto la richiesta. Aggiungilo a mano qui sotto.' : 'Su questo telefono si aggiunge a mano: guarda qui sotto.';
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
    // The preview shows the real latest photo when it is cheap to have it.
    widgets().syncPhoto?.().then(() => { if (isOpen()) render(); }).catch(() => {});
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
