(function initUsUiFoundation(globalScope, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
    return;
  }
  globalScope.UsUiFoundation = api;
  api.install(globalScope.document, globalScope);
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

    return {
      sync,
      destroy() {
        observer?.disconnect();
        documentRef.removeEventListener('keydown', onKeydown);
        if (motionQuery?.removeEventListener) motionQuery.removeEventListener('change', onMotionChange);
        else motionQuery?.removeListener?.(onMotionChange);
        motionSubscribers.clear();
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

  return {
    install,
    isReducedMotion: () => activeMotion.isReducedMotion(),
    onMotionPreferenceChange: (listener) => activeMotion.onChange(listener),
    cancelSurfaceExit: (root) => activeSurfaceMotion.cancelExit(root),
    exitSurface: (root, finalize) => activeSurfaceMotion.exit(root, finalize)
  };
});
