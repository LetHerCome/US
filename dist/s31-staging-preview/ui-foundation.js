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
  let activeAurora = () => false;
  let activePlayOnce = () => false;
  const AURORA_REACT_MS = 800;

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
        // Ambient decoration (the PET) takes no input and is aria-hidden:
        // it decides its own visibility instead of being frozen by a modal.
        if (sibling !== current && !sibling.hasAttribute?.('data-us-ambient')) background.add(sibling);
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

    // M12A — the shell aurora is ONE system: an ambient drift in CSS plus a
    // short reaction (intensity + travelling highlight) driven from here.
    let auroraTimer;
    const auroraBar = () => documentRef.querySelector?.('.top.us-premium-top') || null;
    const auroraPulse = () => {
      const bar = auroraBar();
      if (!bar || reducedMotion || documentRef.hidden) return false;
      bar.removeAttribute('data-us-aurora');
      void bar.offsetWidth;
      bar.setAttribute('data-us-aurora', 'react');
      if (auroraTimer !== undefined) cancelSchedule(auroraTimer);
      auroraTimer = schedule(() => { bar.removeAttribute('data-us-aurora'); auroraTimer = undefined; }, AURORA_REACT_MS);
      return true;
    };
    activeAurora = auroraPulse;
    const AttentionObserver = environment.MutationObserver;
    const attentionObserver = AttentionObserver ? new AttentionObserver((records) => {
      for (const record of records) {
        const target = record.target;
        if (target?.getAttribute?.('data-us-attention') !== 'on' || record.oldValue === 'on') continue;
        if (target.closest?.('.top.us-premium-top')) {
          // One generic reaction for any shell control: aurora + attention feedback.
          auroraPulse();
          try { environment.UsFeedback?.attention?.(); } catch (_) { /* feedback is never essential */ }
          break;
        }
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

    // Every tap answers (the mockup's core.js press/release, literally): on
    // pointerdown the control goes to scale .95 in 110 ms (ease out) and
    // stays there; on release it springs back from .95 in 420 ms. It runs on
    // the independent `scale` property, so a control's own transform (a
    // centring translate, a carousel offset) is untouched. A feature :active
    // rule that also scales (an older pressed state) is held at its resting
    // value while the press plays, so nothing presses twice. A drag (more
    // than 8 px) releases at once. Never under reduced motion.
    const PRESS_SELECTOR = 'button, [role="button"], [role="tab"], [role="switch"], a[href], summary, label[for], [data-us-tile], .tap';
    const PRESS_DOWN = [{ scale: 1 }, { scale: 0.95 }];
    const PRESS_UP = [{ scale: 0.95 }, { scale: 1 }];
    const pressed = new Map();
    const pureScale = (value) => /^matrix\(([-\d.e]+), 0, 0, \1, 0, 0\)$/.test(String(value || '').trim());
    const pressTarget = (event) => {
      const target = event.target?.closest?.(PRESS_SELECTOR);
      if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return null;
      if (target.closest('[data-us-motion-tap="off"]')) return null;
      return typeof target.animate === 'function' ? target : null;
    };
    const press = (target, event) => {
      if (reducedMotion) return;
      const previous = pressed.get(target);
      previous?.down?.cancel();
      previous?.hold?.cancel();
      const state = { down: null, hold: null, x: event?.clientX ?? 0, y: event?.clientY ?? 0, id: event?.pointerId };
      // Now and one frame later (when :active surely applies): if it scales
      // the control, keep the resting transform while our press plays.
      const raf = environment.requestAnimationFrame || ((fn) => schedule(fn, 16));
      const holdActive = () => {
        if (state.hold || (pressed.get(target) !== state && !state.released)) return;
        try {
          const view = target.ownerDocument?.defaultView || environment;
          const current = view.getComputedStyle?.(target)?.transform;
          if (current && current !== 'none' && pureScale(current)) {
            state.hold = target.animate([{ transform: 'none' }, { transform: 'none' }], { duration: Infinity });
            if (state.released) schedule(() => state.hold?.cancel(), 420);
          }
        } catch (_) { /* a press is never essential */ }
      };
      state.down = target.animate(PRESS_DOWN, { duration: 110, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
      pressed.set(target, state);
      holdActive();
      raf(holdActive);
    };
    const release = (target) => {
      const state = pressed.get(target);
      if (!state) return;
      pressed.delete(target);
      state.released = true;
      if (!reducedMotion) target.animate(PRESS_UP, { duration: 420, easing: 'cubic-bezier(.34,1.56,.64,1)' });
      state.down.cancel();
      if (state.hold) schedule(() => state.hold?.cancel(), 420);
    };
    const releaseAll = () => Array.from(pressed.keys()).forEach(release);
    const onPressDown = (event) => {
      if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const target = pressTarget(event);
      if (target) press(target, event);
    };
    const onPressMove = (event) => {
      pressed.forEach((state, target) => {
        if (state.id !== undefined && event.pointerId !== state.id) return;
        if (Math.hypot((event.clientX ?? 0) - state.x, (event.clientY ?? 0) - state.y) > 8) release(target);
      });
    };
    documentRef.addEventListener('pointerdown', onPressDown, { capture: true, passive: true });
    documentRef.addEventListener('pointermove', onPressMove, { capture: true, passive: true });
    ['pointerup', 'pointercancel'].forEach((type) => documentRef.addEventListener(type, releaseAll, { capture: true, passive: true }));
    environment.addEventListener?.('blur', releaseAll);

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
        // One public fact for ambient layers: is an exclusive surface (any
        // modal not marked data-us-transient) owning the screen right now?
        const exclusive = openModals.some(({ modal }) => !modal.hasAttribute('data-us-transient'));
        if (exclusive) documentRef.body.setAttribute?.('data-us-surface', 'open');
        else documentRef.body.removeAttribute?.('data-us-surface');

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
        documentRef.removeEventListener('pointerdown', onPressDown, { capture: true });
        documentRef.removeEventListener('pointermove', onPressMove, { capture: true });
        ['pointerup', 'pointercancel'].forEach((type) => documentRef.removeEventListener(type, releaseAll, { capture: true }));
        environment.removeEventListener?.('blur', releaseAll);
        releaseAll();
        if (motionQuery?.removeEventListener) motionQuery.removeEventListener('change', onMotionChange);
        else motionQuery?.removeListener?.(onMotionChange);
        motionSubscribers.clear();
        attentionObserver?.disconnect();
        documentRef.removeEventListener?.('visibilitychange', applyVisibility);
        if (auroraTimer !== undefined) cancelSchedule(auroraTimer);
        oneShotTimers.forEach((timer) => cancelSchedule(timer));
        oneShotTimers.clear();
        if (activeAurora === auroraPulse) activeAurora = () => false;
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
        documentRef.body.removeAttribute?.('data-us-surface');
      },
      isReducedMotion: motion.isReducedMotion,
      onMotionPreferenceChange: motion.onChange,
      cancelSurfaceExit,
      exitSurface
    };
  }

  // M12A — US feedback engine: the ONE place that vibrates or makes a sound.
  // Progressive enhancement only: missing vibrate / AudioContext / storage is
  // harmless, nothing ever carries essential meaning, and nothing fires while
  // the document is hidden, before the first user gesture (no cold-launch
  // sound) or when the user switched that channel off. Web push sound on a
  // closed PWA is the OS/browser's, not ours.
  const FEEDBACK_KEYS = { sounds: 'us:feedback:sounds', haptics: 'us:feedback:haptics' };
  // US SONIC IDENTITY V1 — Apple-inspired interaction grammar, NOT Apple
  // copyrighted recordings. Short platform haptics, no long vibration motifs.
  // Web vibrate is only a graceful fallback; native uses Capacitor Haptics.
  const HAPTIC_PROFILES = Object.freeze({
    // Android needs a perceptible impact, while the native bridge keeps iOS
    // selection feedback subtle. No long buzz or repeated impacts.
    tap: ['light', [16]],
    selection: ['selection', [12]],
    action: ['medium', [22]],
    success: ['success', [16, 30, 20]],
    error: ['error', [22, 30, 22]],
    attention: ['medium', [14, 32, 16]],
    reveal: ['success', [18, 34, 24]],
    landing: ['light', [14]]
  });
  // Original Apple-inspired UI cues [Hz, start s, duration s, peak, wave].
  // Audible short clicks for ordinary controls; a slightly richer tone only
  // for meaningful results. No proprietary Apple sound assets.
  const SOUND_PROFILES = Object.freeze({
    tap: [[930, 0, 0.035, 0.035, 'sine']],
    selection: [[750, 0, 0.035, 0.028, 'sine']],
    action: [[659.26, 0, 0.095, 0.048, 'sine'], [988, 0.015, 0.055, 0.012, 'sine']],
    success: [[587.33, 0, 0.13, 0.035, 'sine'], [783.99, 0.065, 0.21, 0.050, 'sine'], [1174.66, 0.075, 0.12, 0.007, 'sine']],
    attention: [[783.99, 0, 0.14, 0.039, 'sine'], [1046.50, 0.065, 0.21, 0.048, 'sine']],
    reveal: [[587.33, 0, 0.16, 0.035, 'sine'], [783.99, 0.090, 0.20, 0.042, 'sine'], [987.77, 0.19, 0.24, 0.050, 'sine']]
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
    // Building the AudioContext costs a long frame (~40 ms on a phone), so the
    // first tap does not pay for it: it is built in the next idle moment after
    // the first gesture (or by the first meaningful sound), and every later
    // gesture only resumes it, which is cheap and is what iOS needs.
    let warming = false;
    function warmUp() {
      if (warming || context || !preferences.sounds) return;
      warming = true;
      const build = () => { warming = false; if (preferences.sounds && !context) audioContext(); };
      const idle = environment.requestIdleCallback;
      if (typeof idle === 'function') {
        const started = now();
        const wait = (deadline) => {
          if (deadline?.didTimeout || (deadline?.timeRemaining?.() ?? 50) >= 40 || now() - started > 4000) build();
          else idle.call(environment, wait, { timeout: 4000 });
        };
        idle.call(environment, wait, { timeout: 4000 });
      } else {
        timers.set(build, 0);
      }
    }
    function resumeInGesture() {
      if (!unlocked || !preferences.sounds || !context || context.state === 'running') return;
      try { context.resume?.()?.catch?.(() => {}); } catch (_) { /* stays suspended */ }
    }
    function unlock() {
      if (unlocked) return;
      unlocked = true;
      warmUp(); // nothing is allocated while muted
    }
    function playTones(ctx, tones) {
      const now = ctx.currentTime || 0;
      tones.forEach(([frequency, start, duration, peak, wave]) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = wave;
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.exponentialRampToValueAtTime(peak, now + start + Math.min(0.009, duration / 3));
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(now + start);
        oscillator.stop(now + start + duration + 0.02);
      });
    }
    function sound(kind) {
      if (!preferences.sounds || !visible() || !unlocked) return false;
      const tones = SOUND_PROFILES[kind];
      if (!tones) return false; // errors and Maudit landing stay haptic-only
      // A routine tick never builds the audio session in the middle of a
      // transition: until the idle build, it stays silent.
      if (!context && (kind === 'tap' || kind === 'selection')) { warmUp(); return false; }
      const ctx = audioContext();
      if (!ctx) return false;
      try {
        if (ctx.state === 'running') { playTones(ctx, tones); return true; }
        // Android WebView can suspend its context until the first interaction,
        // including when sound was enabled in Settings just now.
        // Retry exactly this user cue after resume, never stale background audio.
        const requestedAt = now();
        Promise.resolve(ctx.resume?.()).then(() => {
          if (ctx.state === 'running' && visible() && preferences.sounds &&
            now() - requestedAt < 250) playTones(ctx, tones);
        }).catch(() => {});
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
    const SAME_CUE_GAP_MS = 95; // capture and click handlers must not double-fire
    let pendingTap = null;
    let lastAttentionAt = -Infinity;
    let lastCueKind = null;
    let lastCueAt = -Infinity;
    const cancelPendingTap = () => { if (pendingTap !== null) { timers.clear(pendingTap); pendingTap = null; } };
    const emit = (kind) => {
      if (kind !== 'tap') cancelPendingTap();
      if (kind === 'attention') {
        // The same arrival can be announced by more than one generic path: one event.
        const at = now();
        if (at - lastAttentionAt < ATTENTION_GAP_MS) return false;
        lastAttentionAt = at;
      }
      const at = now();
      if (kind !== 'tap' && kind !== 'selection' && kind === lastCueKind && at - lastCueAt < SAME_CUE_GAP_MS) return false;
      lastCueKind = kind;
      lastCueAt = at;
      const played = sound(kind); const vibrated = vibrate(kind); return played || vibrated;
    };
    const deferTap = () => {
      if (pendingTap !== null) return;
      pendingTap = timers.set(() => { pendingTap = null; emit('tap'); }, 0);
    };
    const api = {
      tap: () => emit('tap'),
      selection: () => emit('selection'),
      action: () => emit('action'),
      success: () => emit('success'),
      error: () => emit('error'),
      attention: () => emit('attention'),
      reveal: () => emit('reveal'),
      landing: () => emit('landing'),
      testHaptic: () => { cancelPendingTap(); return vibrate('action'); },
      getPreferences: () => ({ ...preferences }),
      setSoundsEnabled(enabled) {
        preferences.sounds = Boolean(enabled);
        write(FEEDBACK_KEYS.sounds, preferences.sounds ? '1' : '0');
        // Called from an actual Settings button: resume inside that gesture
        // instead of silently losing the first preview after enabling sounds.
        if (preferences.sounds && unlocked) {
          try { audioContext()?.resume?.()?.catch?.(() => {}); } catch (_) {}
        }
        listeners.forEach((l) => l({ ...preferences }));
      },
      setHapticsEnabled(enabled) { preferences.haptics = Boolean(enabled); write(FEEDBACK_KEYS.haptics, preferences.haptics ? '1' : '0'); listeners.forEach((l) => l({ ...preferences })); },
      onPreferenceChange(listener) { if (typeof listener !== 'function') return () => {}; listeners.add(listener); return () => listeners.delete(listener); },
      unlock
    };

    // Audio is allowed only after a real gesture; one delegated listener also
    // gives declarative feedback: [data-us-feedback="tap|action|..."].
    if (documentRef?.addEventListener) {
      ['pointerdown', 'keydown', 'touchend'].forEach((type) => documentRef.addEventListener(type, unlock, { capture: true, passive: true, once: true }));
      ['pointerdown', 'keydown', 'touchend', 'click'].forEach((type) => documentRef.addEventListener(type, resumeInGesture, { capture: true, passive: true }));
      documentRef.addEventListener('click', (event) => {
        if (event.isTrusted === false) return; // programmatic click(): not a user gesture
        const target = event.target;
        if (!target?.closest) return;
        const control = target.closest(INTERACTIVE_SELECTOR);
        const declared = target.closest('[data-us-feedback]');
        // Only an interactive control (or a declared, focusable one) is a tap target.
        const host = control || (declared?.hasAttribute?.('tabindex') ? declared : null);
        if (!host || !isFeedbackEligible(host)) return;
        // The nearest declaration wins. Tabs/switches/menu choices use the OS selection tick.
        const role = host.getAttribute?.('role');
        const automatic = role === 'tab' || role === 'switch' || role === 'menuitem' ? 'selection' : 'tap';
        const kind = declared ? declared.getAttribute('data-us-feedback') : automatic;
        if (kind === 'off') return;
        if (!HAPTIC_PROFILES[kind]) return;
        if (kind === 'tap') deferTap(); else api[kind]();
      }, true);
    }
    return api;
  }

  // The one US confirmation (the Conferma form): a small sheet docked at the
  // bottom on the shared scrim and material, the choice first and the safe
  // choice under it, focus on the safe choice, Escape / backdrop / Annulla
  // cancel. tone:'danger' is only for what cannot be undone (red). `icon`
  // names one of the shared Phosphor icons (data-us-icon); the default is
  // trash for tone:'danger' and info otherwise.
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
      const danger = options.tone === 'danger';
      root.className = danger ? 'us-confirm is-danger' : 'us-confirm';
      root.setAttribute('data-us-modal', '');
      root.setAttribute('data-us-motion-surface', '');
      root.setAttribute('aria-hidden', 'false');
      const tone = danger ? 'us-btn-danger' : 'primary';
      root.innerHTML = `<div class="us-modal-backdrop" data-us-confirm="cancel"></div>
        <section class="us-sheet us-confirm-sheet" role="alertdialog" aria-modal="true" aria-labelledby="${id}T" aria-describedby="${id}B" data-us-modal-panel>
          <span class="us-confirm-icon" aria-hidden="true" hidden><span class="us-icon"></span></span><span class="us-eyebrow"></span><h3 id="${id}T"></h3><p id="${id}B"></p>
          <div class="us-confirm-actions"><button type="button" class="${tone}" data-us-confirm="ok"></button><button type="button" class="ghost" data-us-confirm="cancel" data-us-modal-close></button></div>
        </section>`;
      // As in the mockup every Conferma carries an icon: trash when it cannot
      // be undone, info otherwise, unless the caller names one (icon:'' = none).
      const iconName = options.icon === undefined ? (danger ? 'trash' : 'info') : text(options.icon);
      if (iconName) {
        const icon = root.querySelector('.us-confirm-icon');
        icon.firstElementChild.setAttribute('data-us-icon', iconName);
        icon.hidden = false;
      }
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

  // Fluidità 2 — the «fatto!» of a small shared action (docs/missions/fluidita-2.md):
  // the cue, a short pop of what was touched and the Sintonia sparks around it.
  // With reduced motion only the cue stays (if the cues are on in Settings).
  const DONE_EASE = 'cubic-bezier(.2,.8,.2,1)';
  const SPARK_COLORS = ['var(--us-rosa)', 'var(--us-lilla)', 'var(--us-noi)'];
  function done(element, { feel = 'success', sparks = 6 } = {}) {
    const scope = typeof window !== 'undefined' ? window : globalThis;
    scope.UsFeedback?.[feel]?.();
    const d = element?.ownerDocument;
    if (!element?.getBoundingClientRect || !d?.body || activeMotion.isReducedMotion()) return false;
    if (typeof element.animate === 'function') element.animate([{ scale: 1 }, { scale: 1.06, offset: 0.4 }, { scale: 1 }], { duration: 260, easing: DONE_EASE });
    const r = element.getBoundingClientRect();
    if (!r.width && !r.height) return true;
    for (let i = 0; i < sparks; i++) {
      const s = d.createElement('span');
      s.className = 'us-spark';
      s.setAttribute('aria-hidden', 'true');
      s.style.background = SPARK_COLORS[i % 3];
      s.style.left = `${r.left + r.width / 2 - 6}px`;
      s.style.top = `${r.top + r.height / 2 - 6}px`;
      d.body.appendChild(s);
      if (typeof s.animate !== 'function') { s.remove(); continue; }
      const a = (i / sparks) * 6.283 - 1.57;
      const dist = 30 + Math.random() * 16;
      const anim = s.animate([
        { transform: 'translate(0px,0px) scale(1)', opacity: 1 },
        { transform: `translate(${(Math.cos(a) * dist).toFixed(1)}px,${(Math.sin(a) * dist).toFixed(1)}px) scale(.3)`, opacity: 0 }
      ], { duration: 520, easing: DONE_EASE });
      anim.onfinish = () => s.remove();
      anim.oncancel = () => s.remove();
    }
    return true;
  }
  // A new item (a memory, an idea) arrives in its list once: a short fade and rise.
  function enter(element) {
    if (!element || typeof element.animate !== 'function' || activeMotion.isReducedMotion()) return false;
    element.animate([{ opacity: 0, transform: 'translateY(8px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: DONE_EASE });
    return true;
  }

  return {
    install,
    createFeedback,
    done,
    enter,
    auroraPulse: () => activeAurora(),
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
