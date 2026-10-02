(function initUsUiFoundation(globalScope, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    return;
  }
  globalScope.UsUiFoundation = api;
  api.install(globalScope.document, globalScope);
  if (!globalScope.UsFeedback) globalScope.UsFeedback = api.createFeedback(globalScope);
})(typeof window !== 'undefined' ? window : globalThis, function createUsUiFoundation() {
  'use strict';

  let activeMotion = {
    isReducedMotion: () => false,
    onChange: () => () => {}
  };
  let activeSurfaceMotion = {
    cancelExit: () => {},
    exit: (_root, finalize) => finalize?.()
  };
  let activePlayOnce = () => false;
  let activeIsland = null;

  const FOCUSABLE = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');
  // Safety only: normal completion comes from the panel's real transform transition.
  const SURFACE_EXIT_FALLBACK_MS = 1000;

  function isOpen(modal) {
    return !modal.hidden && modal.getAttribute('aria-hidden') !== 'true';
  }

  function canFocus(element) {
    if (!element || element.hidden || element.disabled || element.getAttribute('aria-hidden') === 'true') return false;
    if (element.getAttribute('tabindex') === '-1') return false;
    if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) return false;
    for (let current = element.parentElement; current; current = current.parentElement) {
      if (current.hidden || current.hasAttribute('inert') || current.getAttribute('aria-hidden') === 'true') return false;
    }
    return true;
  }

  function focusables(modal) {
    const panel = modal.querySelector('[data-us-modal-panel]') || modal;
    return Array.from(panel.querySelectorAll(FOCUSABLE)).filter(canFocus);
  }

  function backgroundFor(modal, body) {
    const background = new Set();
    let current = modal;
    while (current && current !== body) {
      const parent = current.parentElement;
      if (!parent) break;
      Array.from(parent.children).forEach((sibling) => {
        if (sibling !== current) background.add(sibling);
      });
      current = parent;
    }
    return background;
  }

  function install(documentRef, environment = {}) {
    if (!documentRef?.body) return { sync() {}, destroy() {} };

    const motionSubscribers = new Set();
    const motionQuery = typeof environment.matchMedia === 'function'
      ? environment.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    let reducedMotion = Boolean(motionQuery?.matches);
    const applyMotionPreference = (next, notify = true) => {
      reducedMotion = Boolean(next);
      documentRef.documentElement?.setAttribute('data-us-motion', reducedMotion ? 'reduced' : 'full');
      if (notify) motionSubscribers.forEach((listener) => listener(reducedMotion));
    };
    const onMotionChange = (event) => applyMotionPreference(event.matches);
    if (motionQuery?.addEventListener) motionQuery.addEventListener('change', onMotionChange);
    else motionQuery?.addListener?.(onMotionChange);
    applyMotionPreference(reducedMotion, false);
    const motion = {
      isReducedMotion: () => reducedMotion,
      onChange(listener) {
        if (typeof listener !== 'function') return () => {};
        motionSubscribers.add(listener);
        return () => motionSubscribers.delete(listener);
      }
    };
    activeMotion = motion;
    const surfaceExits = new Map();
    const schedule = environment.setTimeout || setTimeout;
    const cancelSchedule = environment.clearTimeout || clearTimeout;
    const cancelSurfaceExit = (root) => {
      const exit = surfaceExits.get(root);
      if (exit) {
        exit.cancelled = true;
        if (exit.fallback !== undefined) cancelSchedule(exit.fallback);
        exit.surface.removeEventListener('transitionend', exit.onTransitionEnd);
      }
      surfaceExits.delete(root);
      root?.removeAttribute('data-us-motion-exiting');
    };
    const exitSurface = (root, finalize) => {
      if (!root || typeof finalize !== 'function') return false;
      if (surfaceExits.has(root)) return true;
      if (reducedMotion) {
        finalize();
        return true;
      }
      const surface = root.querySelector('[data-us-modal-panel]') || root;
      const exit = { surface, fallback: undefined, cancelled: false, onTransitionEnd: null };
      const complete = () => {
        if (exit.cancelled || surfaceExits.get(root) !== exit) return;
        exit.cancelled = true;
        if (exit.fallback !== undefined) cancelSchedule(exit.fallback);
        surface.removeEventListener('transitionend', exit.onTransitionEnd);
        surfaceExits.delete(root);
        root.removeAttribute('data-us-motion-exiting');
        finalize();
      };
      exit.onTransitionEnd = (event) => {
        if (event.target === surface && event.propertyName === 'transform') complete();
      };
      surfaceExits.set(root, exit);
      surface.addEventListener('transitionend', exit.onTransitionEnd);
      root.setAttribute('data-us-motion-exiting', '');
      exit.fallback = schedule(complete, SURFACE_EXIT_FALLBACK_MS);
      return true;
    };
    activeSurfaceMotion = { cancelExit: cancelSurfaceExit, exit: exitSurface };

    // M12A — document visibility drives decorative motion (CSS pauses ambient
    // animation while hidden); no JS animation loop exists anywhere.
    const applyVisibility = () => documentRef.documentElement?.setAttribute('data-us-visibility', documentRef.hidden ? 'hidden' : 'visible');
    documentRef.addEventListener?.('visibilitychange', applyVisibility);
    applyVisibility();

    // HUMAN-UI-03 — the shell's personal attention lives on the Island: any
    // island control turning "on" gives ONE event-bound reaction (a single
    // glint + the attention feedback); the compact island keeps a static cue.
    let island = null;
    const AttentionObserver = environment.MutationObserver;
    const attentionObserver = AttentionObserver ? new AttentionObserver((records) => {
      let react = false;
      let touched = false;
      for (const record of records) {
        const target = record.target;
        // Only the island's own controls count (the host mirrors them).
        if (!target?.closest?.('.us-island') || target.classList?.contains('us-island')) continue;
        touched = true;
        if (target.getAttribute?.('data-us-attention') === 'on' && record.oldValue !== 'on') react = true;
      }
      if (touched) island?.syncAttention();
      if (react) {
        island?.glint();
        try { environment.UsFeedback?.attention?.(); } catch (_) { /* feedback is never essential */ }
      }
    }) : null;
    attentionObserver?.observe(documentRef.body, { subtree: true, attributes: true, attributeFilter: ['data-us-attention'], attributeOldValue: true });

    // One-shot decoration: add a class, drop it when it has played. Never
    // under reduced motion, so the final state is always simply "there".
    const oneShotTimers = new Map();
    const playOnce = (element, className, duration = 900) => {
      if (!element || !className || reducedMotion) return false;
      const previous = oneShotTimers.get(element);
      if (previous !== undefined) cancelSchedule(previous);
      element.classList.remove(className);
      void element.offsetWidth;
      element.classList.add(className);
      oneShotTimers.set(element, schedule(() => { element.classList.remove(className); oneShotTimers.delete(element); }, duration));
      return true;
    };
    activePlayOnce = playOnce;

    const modalState = new Map();
    const inertState = new Map();
    let order = 0;
    let activeModal = null;
    let syncing = false;

    function setInert(elements) {
      inertState.forEach((wasInert, element) => {
        if (elements.has(element)) return;
        if (!wasInert) element.removeAttribute('inert');
        if ('inert' in element) element.inert = wasInert;
        inertState.delete(element);
      });
      elements.forEach((element) => {
        if (inertState.has(element)) return;
        const wasInert = element.hasAttribute('inert') || Boolean(element.inert);
        inertState.set(element, wasInert);
        element.setAttribute('inert', '');
        if ('inert' in element) element.inert = true;
      });
    }

    function syncNavigation() {
      Array.from(documentRef.querySelectorAll('.nav button')).forEach((button) => {
        if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      });
    }

    function sync() {
      if (syncing) return;
      syncing = true;
      try {
        const modals = Array.from(documentRef.querySelectorAll('[data-us-modal]'));
        const openModals = [];

        modals.forEach((modal) => {
          const open = isOpen(modal);
          const state = modalState.get(modal) || { open: false, opener: null, order: 0 };
          if (open && !state.open) {
            state.open = true;
            state.opener = documentRef.activeElement && !modal.contains(documentRef.activeElement)
              ? documentRef.activeElement
              : null;
            state.order = ++order;
          } else if (!open && state.open) {
            state.open = false;
          }
          modalState.set(modal, state);
          if (open) openModals.push({ modal, state });
        });

        openModals.sort((left, right) => left.state.order - right.state.order);
        const nextActive = openModals.length ? openModals[openModals.length - 1].modal : null;
        setInert(nextActive ? backgroundFor(nextActive, documentRef.body) : new Set());

        const previousActive = activeModal;
        if (nextActive && nextActive !== previousActive && !nextActive.contains(documentRef.activeElement)) {
          const previousOpener = previousActive ? modalState.get(previousActive)?.opener : null;
          const close = nextActive.querySelector('[data-us-modal-close]');
          const target = previousOpener && nextActive.contains(previousOpener) && canFocus(previousOpener)
            ? previousOpener
            : (canFocus(close) ? close : focusables(nextActive)[0]);
          target?.focus({ preventScroll: true });
        } else if (!nextActive && previousActive) {
          const opener = modalState.get(previousActive)?.opener;
          if (canFocus(opener)) opener.focus({ preventScroll: true });
        }
        activeModal = nextActive;
        syncNavigation();
      } finally {
        syncing = false;
      }
    }

    function onKeydown(event) {
      if (event.key !== 'Tab' || !activeModal) return;
      const items = focusables(activeModal);
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!activeModal.contains(documentRef.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
      } else if (event.shiftKey && documentRef.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && documentRef.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }

    const Observer = environment.MutationObserver;
    const observer = Observer ? new Observer(sync) : null;
    observer?.observe(documentRef.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-hidden', 'class', 'hidden']
    });
    documentRef.addEventListener('keydown', onKeydown);
    sync();

    island = createIsland(documentRef, environment, {
      isReducedMotion: () => reducedMotion,
      hasOpenModal: () => Boolean(activeModal),
      playOnce,
      schedule,
      cancelSchedule
    });
    activeIsland = island;

    return {
      sync,
      destroy() {
        observer?.disconnect();
        documentRef.removeEventListener('keydown', onKeydown);
        if (motionQuery?.removeEventListener) motionQuery.removeEventListener('change', onMotionChange);
        else motionQuery?.removeListener?.(onMotionChange);
        motionSubscribers.clear();
        attentionObserver?.disconnect();
        documentRef.removeEventListener?.('visibilitychange', applyVisibility);
        island?.destroy();
        if (activeIsland === island) activeIsland = null;
        oneShotTimers.forEach((timer) => cancelSchedule(timer));
        oneShotTimers.clear();
        if (activePlayOnce === playOnce) activePlayOnce = () => false;
        surfaceExits.forEach((exit) => {
          exit.cancelled = true;
          if (exit.fallback !== undefined) cancelSchedule(exit.fallback);
          exit.surface.removeEventListener('transitionend', exit.onTransitionEnd);
        });
        surfaceExits.clear();
        if (activeMotion === motion) {
          activeMotion = {
            isReducedMotion: () => false,
            onChange: () => () => {}
          };
        }
        if (activeSurfaceMotion.exit === exitSurface) {
          activeSurfaceMotion = {
            cancelExit: () => {},
            exit: (_root, finalize) => finalize?.()
          };
        }
        setInert(new Set());
      },
      isReducedMotion: motion.isReducedMotion,
      onMotionPreferenceChange: motion.onChange,
      cancelSurfaceExit,
      exitSurface
    };
  }

  // HUMAN-UI-03 — US Island: the ONE top shell object. Four presentation
  // states, all memory-only (never persisted, never a second source of
  // product state): COMPACT shows the US mark, EXPANDED shows the existing
  // Per voi / Lasciato per te controls around it, NOTICE / ACTION_NOTICE let
  // an existing in-app arrival morph the island for a few seconds. The
  // island never navigates on its own: only a user activation runs the
  // notice's existing destination.
  const ISLAND_STATES = Object.freeze({ COMPACT: 'compact', EXPANDED: 'expanded', NOTICE: 'notice', ACTION_NOTICE: 'action-notice' });
  const ISLAND_TIMING = Object.freeze({ morph: 280, notice: 4200, actionNotice: 5200, hold: 1600, gap: 360, queue: 3 });
  const ISLAND_ICONS = new Set(['heart', 'envelope', 'sparkle']);

  // Bounded, de-duplicated, latest-valid queue: a key replaces its older
  // copy, the oldest entry drops beyond the limit, and an entry whose own
  // source state stopped being true is skipped when its turn comes.
  function createNoticeQueue(limit = ISLAND_TIMING.queue) {
    let items = [];
    return {
      push(notice) {
        items = items.filter((item) => item.key !== notice.key);
        items.push(notice);
        while (items.length > limit) items.shift();
        return items.length;
      },
      next() {
        while (items.length) {
          const item = items.shift();
          if (typeof item.isValid !== 'function' || item.isValid()) return item;
        }
        return null;
      },
      clear() { items = []; },
      get size() { return items.length; }
    };
  }

  function normalizeNotice(input) {
    const text = typeof input?.text === 'string' ? input.text.trim() : '';
    if (!text) return null;
    const onAction = typeof input.onAction === 'function' ? input.onAction : null;
    return {
      key: String(input.key || text),
      text,
      icon: ISLAND_ICONS.has(input.icon) ? input.icon : 'heart',
      actionLabel: onAction ? String(input.actionLabel || 'Apri') : '',
      onAction,
      isValid: typeof input.isValid === 'function' ? input.isValid : null,
      announce: input.announce !== false
    };
  }

  function createIsland(documentRef, environment = {}, deps = {}) {
    const byId = (id) => documentRef?.getElementById?.(id) || null;
    const host = byId('usIsland');
    const shell = byId('usIslandShell');
    const trigger = byId('usIslandTrigger');
    const noticeEl = byId('usIslandNotice');
    if (!host || !shell || !trigger || !noticeEl) return null;
    const live = byId('usIslandLive');
    const schedule = deps.schedule || environment.setTimeout || setTimeout;
    const cancel = deps.cancelSchedule || environment.clearTimeout || clearTimeout;
    const reduced = () => Boolean(deps.isReducedMotion?.());
    const modalOpen = () => Boolean(deps.hasOpenModal?.());
    const queue = createNoticeQueue();
    let state = ISLAND_STATES.COMPACT;
    let current = null;
    let held = false;
    let busy = false;
    let dwellTimer;
    let morphTimer;
    let pumpTimer;

    const actions = () => Array.from(host.querySelectorAll('.us-island-action'));
    const focusInside = () => Boolean(documentRef.activeElement && host.contains(documentRef.activeElement));
    const attentionOn = () => actions().some((el) => el.getAttribute('data-us-attention') === 'on');
    const clearTimer = (timer) => { if (timer !== undefined) cancel(timer); return undefined; };

    function syncTrigger() {
      const expanded = state === ISLAND_STATES.EXPANDED;
      trigger.setAttribute('aria-expanded', String(expanded));
      trigger.setAttribute('aria-label', expanded ? 'Chiudi menu US' : (attentionOn() ? 'Apri menu US, c’è qualcosa per te' : 'Apri menu US'));
    }
    function syncAttention() {
      const value = attentionOn() ? 'on' : 'off';
      if (host.getAttribute('data-us-attention') !== value) host.setAttribute('data-us-attention', value);
      syncTrigger();
    }

    // The morph needs no library: measure the natural width of the next
    // state, then let the CSS width transition run between the two numbers.
    // Reduced motion (or a hidden document) simply switches state.
    function setState(next) {
      if (state === next) return;
      const animate = !reduced() && !documentRef.hidden && typeof shell.getBoundingClientRect === 'function';
      const from = animate ? shell.getBoundingClientRect().width : 0;
      state = next;
      host.setAttribute('data-us-island', next);
      syncTrigger();
      morphTimer = clearTimer(morphTimer);
      shell.style.width = '';
      if (!animate) { host.removeAttribute('data-us-island-motion'); return; }
      const to = shell.getBoundingClientRect().width;
      if (!from || !to || Math.abs(to - from) < 1) return;
      host.setAttribute('data-us-island-motion', to > from ? 'grow' : 'shrink');
      shell.style.transition = 'none';
      shell.style.width = `${from}px`;
      void shell.offsetWidth;
      shell.style.transition = '';
      shell.style.width = `${to}px`;
      morphTimer = schedule(() => { shell.style.width = ''; morphTimer = undefined; }, ISLAND_TIMING.morph + 60);
    }

    function renderNotice(notice) {
      const icon = noticeEl.querySelector('.us-island-notice-icon');
      const text = noticeEl.querySelector('.us-island-notice-text');
      const action = noticeEl.querySelector('.us-island-notice-action');
      icon?.setAttribute('data-us-notice-icon', notice.icon);
      if (text) text.textContent = notice.text;
      if (action) { action.textContent = notice.actionLabel; action.hidden = !notice.onAction; }
      noticeEl.setAttribute('aria-label', notice.onAction ? `${notice.text}. ${notice.actionLabel}` : `${notice.text}. Chiudi avviso`);
      noticeEl.setAttribute('data-us-notice-kind', notice.onAction ? 'action' : 'passive');
      noticeEl.tabIndex = notice.onAction ? 0 : -1;
      noticeEl.removeAttribute('aria-busy');
    }

    function pumpLater() {
      if (pumpTimer === undefined) pumpTimer = schedule(() => { pumpTimer = undefined; pump(); }, ISLAND_TIMING.gap);
    }
    // One notice at a time, only from the resting compact island: an open
    // menu, keyboard focus inside the island or a modal defer it.
    function pump() {
      if (pumpTimer !== undefined || current || state !== ISLAND_STATES.COMPACT || focusInside() || modalOpen()) return false;
      const next = queue.next();
      if (!next) return false;
      current = next;
      renderNotice(next);
      setState(next.onAction ? ISLAND_STATES.ACTION_NOTICE : ISLAND_STATES.NOTICE);
      deps.playOnce?.(host, 'us-island-arrive', 700);
      if (next.announce && live) live.textContent = next.onAction ? `${next.text}. ${next.actionLabel}` : next.text;
      startDwell();
      return true;
    }
    function startDwell(ms) {
      dwellTimer = clearTimer(dwellTimer);
      if (!current || held || busy || documentRef.hidden) return;
      dwellTimer = schedule(() => { dwellTimer = undefined; endNotice(); }, ms ?? (current.onAction ? ISLAND_TIMING.actionNotice : ISLAND_TIMING.notice));
    }
    function endNotice() {
      if (!current) return false;
      dwellTimer = clearTimer(dwellTimer);
      const hadFocus = documentRef.activeElement === noticeEl;
      current = null;
      held = false;
      busy = false;
      setState(ISLAND_STATES.COMPACT);
      if (live) live.textContent = '';
      if (hadFocus) trigger.focus?.({ preventScroll: true });
      pumpLater();
      return true;
    }

    function notify(input) {
      const notice = normalizeNotice(input);
      if (!notice || modalOpen()) return false;
      if (current && current.key === notice.key) {
        current = notice;
        renderNotice(notice);
        startDwell();
        return true;
      }
      queue.push(notice);
      pump();
      return true;
    }
    function expand() {
      if (state !== ISLAND_STATES.COMPACT) return false;
      setState(ISLAND_STATES.EXPANDED);
      return true;
    }
    function collapse() {
      if (state === ISLAND_STATES.EXPANDED) {
        setState(ISLAND_STATES.COMPACT);
        pumpLater();
        return true;
      }
      return endNotice();
    }
    const toggle = () => (state === ISLAND_STATES.EXPANDED ? collapse() : expand());

    // A passive notice only closes; an action notice runs its existing
    // destination and stays until that action has completed.
    async function activateNotice() {
      const notice = current;
      if (!notice || busy) return;
      if (!notice.onAction) { endNotice(); return; }
      busy = true;
      dwellTimer = clearTimer(dwellTimer);
      noticeEl.setAttribute('aria-busy', 'true');
      try { await notice.onAction(); } catch (error) { environment.console?.warn?.('[US Island] notice action', error); }
      if (current === notice) endNotice();
    }

    const onTrigger = () => { toggle(); };
    // An island action already ran its own handler for this click; the
    // island only folds back (focus stays on the island for keyboard users).
    const onHostClick = (event) => {
      if (state !== ISLAND_STATES.EXPANDED || !event.target?.closest?.('.us-island-action')) return;
      const refocus = focusInside();
      setState(ISLAND_STATES.COMPACT);
      if (refocus) trigger.focus?.({ preventScroll: true });
      pumpLater();
    };
    // An outside click folds the menu without consuming the click: the page
    // under it still receives its normal action. Touch scrolling produces no
    // click, so beginning or completing a scroll never folds the Island.
    const onOutside = (event) => {
      if (state === ISLAND_STATES.EXPANDED && !host.contains(event.target)) collapse();
    };
    const onKey = (event) => {
      if (event.key !== 'Escape' || modalOpen()) return;
      if (state === ISLAND_STATES.EXPANDED) {
        const refocus = focusInside();
        collapse();
        if (refocus) trigger.focus?.({ preventScroll: true });
      } else if (current) {
        endNotice();
      } else return;
      event.preventDefault?.();
    };
    const onFocusOut = (event) => {
      const next = event.relatedTarget;
      if (next && host.contains(next)) return;
      if (next && state === ISLAND_STATES.EXPANDED) collapse();
      pumpLater();
    };
    const hold = () => { if (!current) return; held = true; dwellTimer = clearTimer(dwellTimer); };
    const release = () => { if (!current || !held) return; held = false; startDwell(ISLAND_TIMING.hold); };
    const onVisibility = () => { if (!documentRef.hidden && current && dwellTimer === undefined) startDwell(); };

    trigger.addEventListener('click', onTrigger);
    host.addEventListener('click', onHostClick);
    host.addEventListener('focusout', onFocusOut);
    noticeEl.addEventListener('click', activateNotice);
    noticeEl.addEventListener('pointerenter', hold);
    noticeEl.addEventListener('focus', hold);
    noticeEl.addEventListener('pointerleave', release);
    noticeEl.addEventListener('blur', release);
    documentRef.addEventListener('click', onOutside, true);
    documentRef.addEventListener('keydown', onKey);
    documentRef.addEventListener('visibilitychange', onVisibility);
    host.setAttribute('data-us-island', state);
    syncAttention();

    return {
      state: () => state,
      expand,
      collapse,
      toggle,
      notify,
      dismiss: endNotice,
      syncAttention,
      glint: () => Boolean(deps.playOnce?.(host, 'us-island-glint', 900)),
      destroy() {
        dwellTimer = clearTimer(dwellTimer);
        morphTimer = clearTimer(morphTimer);
        pumpTimer = clearTimer(pumpTimer);
        queue.clear();
        trigger.removeEventListener('click', onTrigger);
        host.removeEventListener('click', onHostClick);
        host.removeEventListener('focusout', onFocusOut);
        noticeEl.removeEventListener('click', activateNotice);
        noticeEl.removeEventListener('pointerenter', hold);
        noticeEl.removeEventListener('focus', hold);
        noticeEl.removeEventListener('pointerleave', release);
        noticeEl.removeEventListener('blur', release);
        documentRef.removeEventListener('click', onOutside, true);
        documentRef.removeEventListener('keydown', onKey);
        documentRef.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }

  // M12A — US feedback engine: the ONE place that vibrates or makes a sound.
  // Progressive enhancement only: missing vibrate / AudioContext / storage is
  // harmless, nothing ever carries essential meaning, and nothing fires while
  // the document is hidden, before the first user gesture (no cold-launch
  // sound) or when the user switched that channel off. Web push sound on a
  // closed PWA is the OS/browser's, not ours.
  const FEEDBACK_KEYS = { sounds: 'us:feedback:sounds', haptics: 'us:feedback:haptics' };
  // Haptic profiles: [native kind, vibrate pattern (ms)]. Never longer than ~160ms.
  const HAPTIC_PROFILES = Object.freeze({
    tap: ['light', [8]],
    action: ['medium', [14]],
    success: ['success', [14, 40, 22]],
    attention: ['light', [10, 50, 10]],
    reveal: ['success', [12, 55, 18, 55, 26]]
  });
  // Sound profiles: short locally generated tones [frequency Hz, start s, duration s, peak gain, wave].
  const SOUND_PROFILES = Object.freeze({
    tap: [[2093, 0, 0.05, 0.03, 'sine'], [1397, 0.004, 0.06, 0.02, 'sine']],
    action: [[523.25, 0, 0.09, 0.05, 'triangle'], [659.25, 0.07, 0.12, 0.05, 'triangle']],
    success: [[523.25, 0, 0.08, 0.045, 'triangle'], [659.25, 0.06, 0.08, 0.045, 'triangle'], [783.99, 0.12, 0.16, 0.05, 'triangle']],
    attention: [[880, 0, 0.36, 0.035, 'sine'], [1318.5, 0.04, 0.3, 0.018, 'sine']],
    reveal: [[392, 0, 0.14, 0.04, 'sine'], [587.33, 0.1, 0.16, 0.045, 'sine'], [880, 0.22, 0.3, 0.05, 'sine'], [1760, 0.24, 0.26, 0.012, 'sine']]
  });

  // Ordinary user interactions get a tap by default; data-us-feedback is only
  // an override ("action", "success", ...) or an opt-out ("off").
  const INTERACTIVE_SELECTOR = 'button, a[href], [role="button"], [role="tab"], [role="switch"], [role="menuitem"], summary';
  function isFeedbackEligible(element) {
    if (!element) return false;
    if (element.disabled) return false;
    const attr = (name) => element.getAttribute?.(name);
    if (attr('aria-disabled') === 'true') return false;
    if (element.hidden) return false;
    if (element.closest?.('[inert], [hidden]')) return false;
    return true;
  }

  function createFeedback(environment = {}) {
    const navigatorRef = environment.navigator;
    const documentRef = environment.document;
    const platform = environment.UsPlatform;
    const AudioContextClass = environment.AudioContext || environment.webkitAudioContext;
    const storage = (() => { try { return environment.localStorage || null; } catch (_) { return null; } })();
    const read = (key) => { try { return storage?.getItem(key); } catch (_) { return null; } };
    const write = (key, value) => { try { storage?.setItem(key, value); } catch (_) { /* preference stays in memory */ } };
    const preferences = { sounds: read(FEEDBACK_KEYS.sounds) !== '0', haptics: read(FEEDBACK_KEYS.haptics) !== '0' };
    const listeners = new Set();
    let context = null;
    let unlocked = false;

    const visible = () => !documentRef?.hidden;
    function vibrate(kind) {
      if (!preferences.haptics || !visible()) return false;
      const [nativeKind, pattern] = HAPTIC_PROFILES[kind];
      try {
        if (typeof platform?.haptic === 'function') { platform.haptic(nativeKind, pattern); return true; }
        if (typeof navigatorRef?.vibrate === 'function') return Boolean(navigatorRef.vibrate(pattern));
      } catch (_) { /* unsupported: silently nothing */ }
      return false;
    }

    function audioContext() {
      if (context) return context;
      if (typeof AudioContextClass !== 'function') return null;
      try { context = new AudioContextClass(); } catch (_) { context = null; }
      return context;
    }
    function unlock() {
      if (unlocked) return;
      unlocked = true;
      const ctx = audioContext();
      try { ctx?.resume?.()?.catch?.(() => {}); } catch (_) { /* stays suspended */ }
    }
    function playTones(ctx, tones) {
      const now = ctx.currentTime || 0;
      tones.forEach(([frequency, start, duration, peak, wave]) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = wave;
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.exponentialRampToValueAtTime(peak, now + start + Math.min(0.012, duration / 3));
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(now + start);
        oscillator.stop(now + start + duration + 0.02);
      });
    }
    function sound(kind) {
      if (!preferences.sounds || !visible() || !unlocked) return false;
      const ctx = audioContext();
      if (!ctx) return false;
      try {
        if (ctx.state === 'running') { playTones(ctx, SOUND_PROFILES[kind]); return true; }
        // Suspended (autoplay policy): try to wake it, never queue the sound.
        ctx.resume?.()?.catch?.(() => {});
      } catch (_) { /* a failed tone is never an error */ }
      return false;
    }

    // A tap is deferred by one task so that an explicit, stronger feedback from
    // the same gesture (action/success/reveal/attention) replaces it instead of
    // stacking on top of it. Confirmed async results arrive later and play.
    const timers = {
      set: environment.setTimeout ? environment.setTimeout.bind(environment) : globalThis.setTimeout,
      clear: environment.clearTimeout ? environment.clearTimeout.bind(environment) : globalThis.clearTimeout
    };
    const now = typeof environment.now === 'function' ? environment.now : () => Date.now();
    const ATTENTION_GAP_MS = 1500;
    let pendingTap = null;
    let lastAttentionAt = -Infinity;
    const cancelPendingTap = () => { if (pendingTap !== null) { timers.clear(pendingTap); pendingTap = null; } };
    const emit = (kind) => {
      if (kind !== 'tap') cancelPendingTap();
      if (kind === 'attention') {
        // The same arrival can be announced by more than one generic path: one event.
        const at = now();
        if (at - lastAttentionAt < ATTENTION_GAP_MS) return false;
        lastAttentionAt = at;
      }
      const played = sound(kind); const vibrated = vibrate(kind); return played || vibrated;
    };
    const deferTap = () => {
      if (pendingTap !== null) return;
      pendingTap = timers.set(() => { pendingTap = null; emit('tap'); }, 0);
    };
    const api = {
      tap: () => emit('tap'),
      action: () => emit('action'),
      success: () => emit('success'),
      attention: () => emit('attention'),
      reveal: () => emit('reveal'),
      getPreferences: () => ({ ...preferences }),
      setSoundsEnabled(enabled) { preferences.sounds = Boolean(enabled); write(FEEDBACK_KEYS.sounds, preferences.sounds ? '1' : '0'); listeners.forEach((l) => l({ ...preferences })); },
      setHapticsEnabled(enabled) { preferences.haptics = Boolean(enabled); write(FEEDBACK_KEYS.haptics, preferences.haptics ? '1' : '0'); listeners.forEach((l) => l({ ...preferences })); },
      onPreferenceChange(listener) { if (typeof listener !== 'function') return () => {}; listeners.add(listener); return () => listeners.delete(listener); },
      unlock
    };

    // Audio is allowed only after a real gesture; one delegated listener also
    // gives declarative feedback: [data-us-feedback="tap|action|..."].
    if (documentRef?.addEventListener) {
      ['pointerdown', 'keydown', 'touchend'].forEach((type) => documentRef.addEventListener(type, unlock, { capture: true, passive: true, once: true }));
      documentRef.addEventListener('click', (event) => {
        if (event.isTrusted === false) return; // programmatic click(): not a user gesture
        const target = event.target;
        if (!target?.closest) return;
        const control = target.closest(INTERACTIVE_SELECTOR);
        const declared = target.closest('[data-us-feedback]');
        // The nearest declaration wins; a control inside an "off" subtree stays silent.
        const kind = declared ? declared.getAttribute('data-us-feedback') : 'tap';
        if (kind === 'off') return;
        // Only an interactive control (or a declared, focusable one) is a tap target.
        const host = control || (declared?.hasAttribute?.('tabindex') ? declared : null);
        if (!host || !isFeedbackEligible(host)) return;
        if (!HAPTIC_PROFILES[kind]) return;
        if (kind === 'tap') deferTap(); else api[kind]();
      }, true);
    }
    return api;
  }

  // The one US confirmation: a small floating sheet on the shared scrim and
  // material, focus on the safe choice, Escape / backdrop / Annulla cancel.
  // Resolves true only for the explicit confirm button. Without a DOM (or if
  // building it fails) it degrades to the platform confirm.
  let openConfirm = null;
  function confirmSurface(options = {}, environment = globalThis) {
    const documentRef = environment.document;
    const text = (value) => String(value ?? '');
    const fallback = () => Promise.resolve(Boolean(environment.confirm?.(text(options.title || options.body))));
    if (!documentRef?.body || typeof documentRef.createElement !== 'function') return fallback();
    if (openConfirm) openConfirm(false);
    return new Promise((resolve) => {
      const id = `usConfirm${Date.now().toString(36)}`;
      const root = documentRef.createElement('div');
      root.className = 'us-confirm';
      root.setAttribute('data-us-modal', '');
      root.setAttribute('data-us-motion-surface', '');
      root.setAttribute('aria-hidden', 'false');
      const tone = options.tone === 'danger' ? 'us-btn-danger' : options.single ? 'ghost' : 'primary';
      root.innerHTML = `<div class="us-modal-backdrop" data-us-confirm="cancel"></div>
        <section class="us-sheet us-confirm-sheet" role="alertdialog" aria-modal="true" aria-labelledby="${id}T" aria-describedby="${id}B" data-us-modal-panel>
          <span class="us-eyebrow"></span><h3 id="${id}T"></h3><p id="${id}B"></p>
          <div class="us-confirm-actions"><button type="button" class="ghost" data-us-confirm="cancel" data-us-modal-close></button><button type="button" class="${tone}" data-us-confirm="ok"></button></div>
        </section>`;
      root.querySelector('.us-eyebrow').textContent = text(options.kicker || 'US');
      root.querySelector('h3').textContent = text(options.title);
      const body = root.querySelector('p');
      if (options.body) body.textContent = text(options.body); else body.remove();
      const cancelButton = root.querySelector('[data-us-confirm="cancel"].ghost');
      if (options.single) cancelButton.remove(); else cancelButton.textContent = text(options.cancelLabel || 'Annulla');
      root.querySelector('[data-us-confirm="ok"]').textContent = text(options.confirmLabel || (options.single ? 'Chiudi' : 'Conferma'));
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        openConfirm = null;
        documentRef.removeEventListener('keydown', onKey, true);
        root.classList.remove('open');
        const remove = () => { root.setAttribute('aria-hidden', 'true'); root.remove(); };
        if (!activeSurfaceMotion.exit(root, remove)) remove();
        resolve(value);
      };
      const onKey = (event) => { if (event.key === 'Escape') { event.preventDefault(); finish(false); } };
      root.addEventListener('click', (event) => {
        const choice = event.target.closest?.('[data-us-confirm]')?.getAttribute('data-us-confirm');
        if (choice) finish(choice === 'ok');
      });
      documentRef.addEventListener('keydown', onKey, true);
      openConfirm = finish;
      documentRef.body.appendChild(root);
      const show = () => root.classList.add('open');
      if (typeof environment.requestAnimationFrame === 'function') environment.requestAnimationFrame(() => environment.requestAnimationFrame(show));
      else show();
    });
  }

  return {
    install,
    createFeedback,
    ISLAND_STATES,
    ISLAND_TIMING,
    createNoticeQueue,
    createIsland,
    // Presentation-only facade over the installed Island (memory only, never
    // persisted). notify() returns false when the island cannot present right
    // now (no island, or a modal owns the screen): the caller keeps its own
    // existing feedback (toast) in that case.
    island: {
      state: () => activeIsland?.state() || null,
      expand: () => Boolean(activeIsland?.expand()),
      collapse: () => Boolean(activeIsland?.collapse()),
      toggle: () => Boolean(activeIsland?.toggle()),
      notify: (notice) => Boolean(activeIsland?.notify(notice)),
      dismiss: () => Boolean(activeIsland?.dismiss())
    },
    playOnce: (element, className, duration) => activePlayOnce(element, className, duration),
    confirm: (options) => confirmSurface(options),
    // A one-button information sheet on the same canonical surface.
    notice: (options) => confirmSurface({ ...options, single: true }),
    isReducedMotion: () => activeMotion.isReducedMotion(),
    onMotionPreferenceChange: (listener) => activeMotion.onChange(listener),
    cancelSurfaceExit: (root) => activeSurfaceMotion.cancelExit(root),
    exitSurface: (root, finalize) => activeSurfaceMotion.exit(root, finalize)
  };
});
