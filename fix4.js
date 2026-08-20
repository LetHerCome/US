(() => {
  'use strict';

  const BUILD = document.querySelector('meta[name="us-build"]')?.content || 'fix4-unknown';
  const statusBar = document.getElementById('appStatusBar');
  const updateBar = document.getElementById('appUpdateBar');
  const updateBtn = document.getElementById('appUpdateBtn');
  const onlineBadge = document.getElementById('onlineBadge');
  const PROFILE_CACHE_KEY = 'us:fix4:last-profile';
  const IMPORTANT_ACTIONS = '#todaySaveBtn,#momentUploadBtn,#quizNext,#thinkButton,.quest-confirm,.quest-reroll,#pushEnableBtn,#pushDisableBtn';
  let statusTimer = null;
  let updateCheckTimer = null;
  let keyboardOpen = false;

  function setViewportHeight() {
    const viewport = window.visualViewport;
    const height = Math.max(320, Math.round(viewport?.height || window.innerHeight || document.documentElement.clientHeight));
    document.documentElement.style.setProperty('--us-viewport-height', `${height}px`);
    const focused = document.activeElement?.matches?.('input,textarea,select,[contenteditable="true"]');
    const reference = Math.max(window.innerHeight || height, document.documentElement.clientHeight || height);
    const nextKeyboardOpen = Boolean(focused && reference - height > 120);
    if (nextKeyboardOpen !== keyboardOpen) {
      keyboardOpen = nextKeyboardOpen;
      document.body.classList.toggle('us-keyboard-open', keyboardOpen);
    }
  }

  function keepFocusedControlVisible() {
    const active = document.activeElement;
    if (!active?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
    const viewportBottom = window.visualViewport?.height || window.innerHeight;
    const rect = active.getBoundingClientRect();
    if (rect.bottom > viewportBottom - 18 || rect.top < 8) {
      active.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }
  }

  function showStatus(message, kind = 'offline', timeout = 0) {
    if (!statusBar) return;
    if (statusTimer) clearTimeout(statusTimer);
    statusBar.dataset.kind = kind;
    statusBar.textContent = message;
    statusBar.hidden = false;
    if (timeout > 0) statusTimer = setTimeout(() => hideStatus(), timeout);
  }

  function hideStatus() {
    if (!statusBar) return;
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = null;
    statusBar.hidden = true;
  }

  function syncNetworkUi() {
    if (!navigator.onLine) {
      showStatus('Sei offline. Mantengo quello che è già visibile; salvataggi e sincronizzazione ripartono appena torni online.', 'offline');
      return;
    }
    if (onlineBadge?.classList.contains('warn')) {
      const detail = onlineBadge.textContent?.replace(/^●\s*/, '').trim() || 'Connessione in corso…';
      showStatus(detail, 'offline');
      return;
    }
    hideStatus();
  }

  function saveProfileSnapshot() {
    try {
      if (window.usProfile?.id && window.usProfile?.couple_id) {
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(window.usProfile));
        return true;
      }
    } catch (_) {}
    return false;
  }

  function rescueOfflineProfile() {
    if (navigator.onLine || window.usProfile) return;
    try {
      const cached = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || 'null');
      if (!cached?.id || !cached?.couple_id) return;
      window.usProfile = cached;
      document.getElementById('authOverlay')?.classList.add('hidden');
      if (typeof window.setCloudBadge === 'function') window.setCloudBadge(false, 'offline');
      showStatus('US è offline. Puoi consultare ciò che è già presente; le azioni che richiedono internet riprenderanno alla riconnessione.', 'offline');
    } catch (_) {}
  }

  function updateBusyElement(el) {
    if (!(el instanceof Element)) return;
    if (el.matches('button')) {
      const text = (el.textContent || '').trim();
      const busy = el.disabled && /salv|caric|attiv|aggiorn|invio|preparo|sincron/i.test(text);
      el.classList.toggle('us-action-busy', busy);
      if (busy) el.setAttribute('aria-busy', 'true'); else el.removeAttribute('aria-busy');
    }
    if (el.matches('.empty-state,.quiz-week-loading')) {
      const text = (el.textContent || '').toLowerCase();
      if (/caric|preparo|aggiorn|sincron/.test(text)) el.setAttribute('aria-busy', 'true'); else el.removeAttribute('aria-busy');
    }
  }

  function markBusyStates(root = document) {
    if (root instanceof Element) updateBusyElement(root);
    root.querySelectorAll?.('button,.empty-state,.quiz-week-loading').forEach(updateBusyElement);
  }

  const A11Y_LABELS = [
    ['.quiz-head .ghost', 'Torna alla Home'],
    ['.memory-refresh', 'Aggiorna il ricordo'],
    ['.moment-delete', 'Elimina ricordo'],
    ['.us-story-close', 'Chiudi storia'],
    ['.us-story-add-only', 'Aggiungi storia'],
    ['.us-camera-icon-btn', 'Azione fotocamera']
  ];
  function ensureAccessibility(root = document) {
    A11Y_LABELS.forEach(([selector, label]) => {
      if (root instanceof Element && root.matches(selector) && !root.getAttribute('aria-label')) root.setAttribute('aria-label', label);
      root.querySelectorAll?.(selector).forEach((el) => { if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', label); });
    });
  }

  function localizeRuntimeLabels() {
    if (typeof window.bondRankTitle === 'function') {
      window.bondRankTitle = (level) => {
        if (level <= 1) return 'Primo legame';
        if (level === 2) return 'Squadra formata';
        if (level === 3) return 'Risonanza';
        if (level === 4) return 'Anime sincronizzate';
        if (level <= 7) return 'Legame profondo';
        if (level <= 12) return 'Duo leggendario';
        if (level <= 20) return 'Legame mitico';
        return 'Legame eterno';
      };
    }
    if (typeof window.questCategoryLabel === 'function') {
      const map = { connection: 'Connessione', fun: 'Divertimento', adventure: 'Avventura', discover: 'Scoperta', memory: 'Ricordo', surprise: 'Sorpresa', chill: 'Relax' };
      window.questCategoryLabel = (category) => map[category] || category;
    }
  }

  function isImportantError(message) {
    return /errore|non riesco|non disponibile|offline|connessione non pronta|sync non pronta|permess|disattivat/i.test(message || '');
  }

  function wrapToast() {
    const original = window.toast;
    if (typeof original !== 'function' || original.__fix4Wrapped) return;
    const wrapped = function(message) {
      original(message);
      if (isImportantError(String(message || ''))) showStatus(String(message), 'error', 6500);
    };
    wrapped.__fix4Wrapped = true;
    window.toast = wrapped;
  }

  function preventRapidDoubleTap(event) {
    const button = event.target?.closest?.(IMPORTANT_ACTIONS);
    if (!button || button.disabled) return;
    const now = performance.now();
    const last = Number(button.dataset.usLastTap || 0);
    if (last && now - last < 650) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    button.dataset.usLastTap = String(now);
  }

  async function checkForUpdate() {
    if (!navigator.onLine || !updateBar) return;
    try {
      const response = await fetch(`/version.json?ts=${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload?.version && payload.version !== BUILD) updateBar.hidden = false;
    } catch (_) {}
  }

  async function applyUpdate() {
    if (!updateBtn) return;
    updateBtn.disabled = true;
    updateBtn.textContent = 'Aggiorno…';
    try {
      const registration = await navigator.serviceWorker?.getRegistration?.();
      await registration?.update?.();
      await fetch(`/?us-refresh=${Date.now()}`, { cache: 'reload' }).catch(() => null);
    } finally {
      location.reload();
    }
  }

  function setupUpdateChecks() {
    if (updateBtn) updateBtn.addEventListener('click', applyUpdate, { passive: true });
    checkForUpdate();
    if (updateCheckTimer) clearInterval(updateCheckTimer);
    updateCheckTimer = setInterval(() => { if (!document.hidden) checkForUpdate(); }, 5 * 60 * 1000);
  }

  function setupMutationObserver() {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.target === onlineBadge || onlineBadge?.contains(record.target)) syncNetworkUi();
        if (record.target instanceof Element) updateBusyElement(record.target);
        record.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          markBusyStates(node);
          ensureAccessibility(node);
        });
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'disabled'] });
  }

  window.addEventListener('online', () => {
    showStatus('Connessione ripristinata. Sincronizzo US…', 'online', 2200);
    setTimeout(() => {
      if (typeof window.hydrateCloud === 'function' && window.usProfile) window.hydrateCloud().catch?.(() => {});
      if (typeof window.refreshWebPushUi === 'function') window.refreshWebPushUi().catch?.(() => {});
      checkForUpdate();
    }, 250);
  });
  window.addEventListener('offline', () => { rescueOfflineProfile(); syncNetworkUi(); });
  window.addEventListener('resize', setViewportHeight, { passive: true });
  window.visualViewport?.addEventListener('resize', () => { setViewportHeight(); setTimeout(keepFocusedControlVisible, 60); }, { passive: true });
  window.visualViewport?.addEventListener('scroll', setViewportHeight, { passive: true });
  document.addEventListener('focusin', () => setTimeout(() => { setViewportHeight(); keepFocusedControlVisible(); }, 220));
  document.addEventListener('focusout', () => setTimeout(setViewportHeight, 120));
  document.addEventListener('click', preventRapidDoubleTap, true);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      setViewportHeight();
      saveProfileSnapshot();
      rescueOfflineProfile();
      checkForUpdate();
    }
  });

  setViewportHeight();
  localizeRuntimeLabels();
  wrapToast();
  ensureAccessibility();
  markBusyStates();
  setupMutationObserver();
  setupUpdateChecks();
  syncNetworkUi();

  let profileAttempts = 0;
  const profileTimer = setInterval(() => {
    profileAttempts += 1;
    if (saveProfileSnapshot() || profileAttempts > 40) clearInterval(profileTimer);
    if (!navigator.onLine) rescueOfflineProfile();
    wrapToast();
  }, 250);
})();
