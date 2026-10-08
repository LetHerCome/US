(() => {
  'use strict';
  if (window.UsAppLock) return;

  // US Native Security V1 — app lock domain (native app only).
  //
  // Biometrics never replace the account: they only gate access to a Supabase
  // session that already exists on this phone. The native plugin (UsAppLock)
  // owns the biometric prompt, the Keystore/Keychain protection record and the
  // lifecycle policy (locked on cold start and after 60 s in background).
  // This module owns the lock screen and the order of events:
  //   1. native shell boots with html.us-app-lock-pending (nothing private paints);
  //   2. app.js resolves the local session, then calls gate();
  //   3. protection off → open; on → lock screen + biometric prompt, and the
  //      session is re-checked before anything private is shown.
  // Recovery is always the normal email + password login: the local session
  // is destroyed first, then the protection record.

  const root = document.documentElement;
  const platform = window.UsPlatform || null;
  const plugin = platform?.isNative && platform.isPluginAvailable?.('UsAppLock')
    ? platform.getNativePlugin('UsAppLock')
    : null;

  const PENDING = 'us-app-lock-pending';
  const LOCKED = 'us-app-locked';
  const configuredTimeout = Number(window.__US_APP_LOCK_STATUS_TIMEOUT_MS__);
  const STATUS_TIMEOUT_MS = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 2500;
  const ERROR_CODES = new Set(['cancelled', 'fallback', 'failed', 'lockout', 'lockout_permanent', 'not_enrolled',
    'unavailable', 'unsupported', 'invalidated', 'not_enabled', 'busy', 'invalid_argument', 'error']);
  const KINDS = new Set(['faceId', 'touchId', 'fingerprint', 'face', 'biometric', 'none']);
  const REASONS = new Set(['ok', 'not_enrolled', 'unsupported', 'unavailable', 'locked_out', 'security_update', 'denied']);

  const COPY = Object.freeze({
    title: 'US è bloccata',
    account: "Usa l’accesso con account",
    accountPrimary: 'Accedi con email e password',
    confirm: 'Uscirai da US su questo telefono. Per rientrare userai email e password.',
    confirmGo: 'Continua',
    confirmBack: 'Annulla',
    retry: 'Riprova',
    failed: 'Non riconosciuto. Riprova.',
    lockout: "Troppi tentativi. Riprova tra poco o usa l’accesso con account.",
    lockoutPermanent: 'La biometria è bloccata su questo telefono.',
    unavailable: 'La biometria ora non è disponibile su questo telefono.',
    invalidated: 'La biometria di questo telefono è cambiata. Per sicurezza, accedi di nuovo.',
    corrupted: 'Per sicurezza, accedi di nuovo con email e password.',
    statusError: 'Non riesco a verificare la protezione di US.',
    expired: 'La sessione è scaduta. Accedi di nuovo.',
    logoutFailed: 'Non riesco a uscire adesso. Riprova.',
    error: 'Qualcosa non ha funzionato. Riprova.'
  });

  let status = null;
  let statusError = false;
  let phase = plugin ? 'booting' : 'off'; // off | booting | open | locked
  let mode = 'pending'; // pending | locked | account | confirm | error
  let message = '';
  let working = false;
  let promptBusy = false;
  let sessionCheck = null;
  let waiters = [];
  let inertObserver = null;
  const hooks = { verifySession: null, accountLogin: null, reload: () => window.location.reload() };

  function normalizeStatus(raw) {
    const b = raw?.biometry || {};
    const p = raw?.protection || {};
    const reason = REASONS.has(b.reason) ? b.reason : 'unavailable';
    const enabled = p.enabled === true;
    const ownerHash = typeof p.ownerHash === 'string' && /^[a-f0-9]{64}$/.test(p.ownerHash) ? p.ownerHash : '';
    let state = 'off';
    if (enabled) state = ['ok', 'invalidated'].includes(p.state) && ownerHash ? p.state : 'corrupted';
    return {
      biometry: { available: b.available === true && reason === 'ok', kind: KINDS.has(b.kind) ? b.kind : 'biometric', reason },
      protection: { enabled, ownerHash, state },
      // Fail closed: only an explicit `locked: false` from native skips the prompt.
      locked: enabled && raw?.locked !== false
    };
  }

  function errorCode(error) {
    const code = typeof error?.code === 'string' ? error.code : (typeof error?.message === 'string' ? error.message : '');
    return ERROR_CODES.has(code) ? code : 'error';
  }

  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms);
      Promise.resolve(promise).then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error) => { clearTimeout(timer); reject(error); }
      );
    });
  }

  async function ownerHashFor(userId) {
    const id = String(userId || '');
    if (!id || !window.crypto?.subtle) return '';
    const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(id));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  // ---- UI -----------------------------------------------------------------

  const $ = (id) => document.getElementById(id);

  function unlockLabel(kind = status?.biometry?.kind) {
    if (kind === 'faceId') return 'Sblocca con Face ID';
    if (kind === 'touchId') return 'Sblocca con Touch ID';
    if (kind === 'fingerprint') return "Sblocca con l’impronta";
    if (kind === 'face') return 'Sblocca con il volto';
    return 'Sblocca';
  }

  function settingLabel(kind = status?.biometry?.kind) {
    if (kind === 'faceId') return 'Proteggi US con Face ID';
    if (kind === 'touchId') return 'Proteggi US con Touch ID';
    if (kind === 'fingerprint') return "Proteggi US con l’impronta";
    if (kind === 'face') return 'Proteggi US con il volto';
    return 'Proteggi US con la biometria';
  }

  function render() {
    const shell = $('usAppLock');
    if (!shell) return;
    shell.dataset.mode = mode;
    shell.setAttribute('aria-hidden', phase === 'locked' ? 'false' : 'true');
    const title = $('usAppLockTitle');
    const copy = $('usAppLockCopy');
    const primary = $('usAppLockPrimary');
    const secondary = $('usAppLockSecondary');
    const note = $('usAppLockStatus');
    if (title) title.textContent = COPY.title;
    let copyText = '';
    let primaryText = unlockLabel();
    let secondaryText = COPY.account;
    if (mode === 'account') {
      copyText = message;
      primaryText = COPY.accountPrimary;
      secondaryText = '';
    } else if (mode === 'confirm') {
      copyText = COPY.confirm;
      primaryText = COPY.confirmGo;
      secondaryText = COPY.confirmBack;
    } else if (mode === 'error') {
      copyText = COPY.statusError;
      primaryText = COPY.retry;
    }
    if (copy) { copy.textContent = copyText; copy.hidden = !copyText; }
    if (primary) { primary.textContent = primaryText; primary.disabled = working || (promptBusy && mode === 'locked'); }
    if (secondary) { secondary.textContent = secondaryText; secondary.hidden = !secondaryText; secondary.disabled = working; }
    if (note) note.textContent = mode === 'locked' ? message : '';
  }

  function setInert(on) {
    const body = document.body;
    if (!body) return;
    const apply = (el) => {
      if (!el || el.id === 'usAppLock' || el.nodeType !== 1) return;
      if (on && !el.hasAttribute('inert')) {
        el.setAttribute('inert', '');
        el.dataset.usAppLockInert = '1';
      } else if (!on && el.dataset?.usAppLockInert) {
        el.removeAttribute('inert');
        delete el.dataset.usAppLockInert;
      }
    };
    [...body.children].forEach(apply);
    if (on && !inertObserver && typeof MutationObserver === 'function') {
      inertObserver = new MutationObserver((records) => records.forEach((r) => [...r.addedNodes].forEach(apply)));
      inertObserver.observe(body, { childList: true });
    } else if (!on && inertObserver) {
      inertObserver.disconnect();
      inertObserver = null;
    }
  }

  function releaseCover() {
    if (!plugin?.releaseCover) return;
    const run = () => Promise.resolve(plugin.releaseCover()).catch(() => {});
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(run));
    else setTimeout(run, 0);
  }

  function showLock(nextMode, nextMessage = '') {
    phase = 'locked';
    window.dispatchEvent(new CustomEvent('us-app-lock-change', { detail: { locked: true } }));
    mode = nextMode;
    message = nextMessage;
    root.classList.add(LOCKED);
    root.classList.remove(PENDING);
    setInert(true);
    render();
    releaseCover();
    if (nextMode === 'locked' || nextMode === 'error') $('usAppLockPrimary')?.focus?.({ preventScroll: true });
  }

  function settle(result) {
    const pending = waiters;
    waiters = [];
    pending.forEach((resolve) => resolve(result));
  }

  function openApp() {
    phase = 'open';
    mode = 'pending';
    message = '';
    sessionCheck = null;
    root.classList.remove(LOCKED, PENDING);
    setInert(false);
    render();
    releaseCover();
    settle('open');
    window.dispatchEvent(new CustomEvent('us-app-lock-change', { detail: { locked: false } }));
  }

  function waitForOpen() {
    return new Promise((resolve) => waiters.push(resolve));
  }

  function setWorking(on) {
    working = on;
    render();
  }

  // ---- Native status ------------------------------------------------------

  async function loadStatus() {
    try {
      status = normalizeStatus(await withTimeout(plugin.getStatus(), STATUS_TIMEOUT_MS));
      statusError = false;
    } catch (_) {
      status = null;
      statusError = true;
    }
    if (status && !status.protection.enabled && phase === 'booting') openApp();
    return status;
  }

  let statusReady = plugin ? loadStatus() : Promise.resolve(null);

  async function refreshStatus() {
    if (!plugin) return null;
    try {
      status = normalizeStatus(await withTimeout(plugin.getStatus(), STATUS_TIMEOUT_MS));
      statusError = false;
    } catch (_) {}
    return status;
  }

  async function resetNative() {
    try { status = normalizeStatus(await plugin.reset()); }
    catch (_) { status = status ? { ...status, protection: { enabled: false, ownerHash: '', state: 'off' }, locked: false } : null; }
  }

  // ---- Session ------------------------------------------------------------

  function checkSession() {
    if (typeof hooks.verifySession !== 'function') return Promise.resolve('unknown');
    return Promise.resolve()
      .then(() => hooks.verifySession())
      .then((verdict) => (['valid', 'invalid', 'unknown'].includes(verdict) ? verdict : 'unknown'))
      .catch(() => 'unknown');
  }

  function startSessionCheck() {
    const check = checkSession();
    sessionCheck = check;
    // A dead session needs no biometrics: go straight to the account login.
    check.then((verdict) => {
      if (verdict === 'invalid' && sessionCheck === check && phase === 'locked' && !promptBusy) {
        accountLogin(COPY.expired).catch(() => {});
      }
    });
    return check;
  }

  // ---- Actions ------------------------------------------------------------

  function promptOptions(title) {
    return { title, cancel: 'Annulla', fallback: "Usa l’account" };
  }

  function handleUnlockError(code) {
    if (code === 'cancelled' || code === 'busy') { message = ''; render(); return; }
    if (code === 'fallback') { mode = 'confirm'; message = ''; render(); return; }
    if (code === 'invalidated') { showLock('account', COPY.invalidated); return; }
    if (code === 'lockout_permanent') { showLock('account', COPY.lockoutPermanent); return; }
    if (code === 'failed') message = COPY.failed;
    else if (code === 'lockout') message = COPY.lockout;
    else if (['not_enrolled', 'unavailable', 'unsupported'].includes(code)) message = COPY.unavailable;
    else message = COPY.error;
    mode = 'locked';
    render();
  }

  async function unlock() {
    if (!plugin || phase !== 'locked' || promptBusy || mode !== 'locked') return false;
    promptBusy = true;
    message = '';
    render();
    try {
      status = normalizeStatus(await plugin.unlock(promptOptions(unlockLabel())));
      const verdict = await (sessionCheck || checkSession());
      if (verdict === 'invalid') {
        promptBusy = false;
        await accountLogin(COPY.expired);
        return false;
      }
      if (verdict !== 'valid') {
        showLock('error');
        return false;
      }
      window.UsFeedback?.success?.();
      openApp();
      return true;
    } catch (error) {
      handleUnlockError(errorCode(error));
      return false;
    } finally {
      promptBusy = false;
      render();
    }
  }

  // Destroy the local session first, then the protection record, then restart
  // US on the normal email + password login. Never the other way around.
  async function accountLogin(reason = '') {
    if (!plugin || working) return false;
    setWorking(true);
    let destroyed = false;
    try {
      destroyed = typeof hooks.accountLogin === 'function' ? (await hooks.accountLogin()) !== false : false;
    } catch (_) {
      destroyed = false;
    }
    if (!destroyed) {
      setWorking(false);
      showLock(mode === 'account' ? 'account' : 'locked', mode === 'account' ? (reason || message) : COPY.logoutFailed);
      return false;
    }
    await resetNative();
    settle('account-login');
    phase = 'open';
    root.classList.remove(LOCKED);
    setInert(false);
    setWorking(false);
    hooks.reload();
    return true;
  }

  function onPrimary() {
    if (mode === 'locked') return unlock();
    if (mode === 'confirm' || mode === 'account') return accountLogin();
    if (mode === 'error') return retryBoot();
    return null;
  }

  function onSecondary() {
    if (mode === 'confirm') { mode = 'locked'; message = ''; render(); return; }
    mode = 'confirm';
    message = '';
    render();
  }

  async function retryBoot() {
    setWorking(true);
    statusReady = loadStatus();
    await statusReady;
    setWorking(false);
    if (!statusError && gateArgs) evaluate(gateArgs);
    else render();
  }

  function autoPrompt() {
    const run = () => { if (phase === 'locked' && mode === 'locked') unlock(); };
    if (!document.hidden) { setTimeout(run, 0); return; }
    const onVisible = () => {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', onVisible);
      run();
    };
    document.addEventListener('visibilitychange', onVisible);
  }

  // ---- Gate ---------------------------------------------------------------

  let gateArgs = null;

  async function evaluate({ userId }) {
    if (statusError || !status) { showLock('error'); return; }
    const owner = await ownerHashFor(userId);
    const protection = status.protection;
    if (!protection.enabled) { openApp(); return; }
    // Another account on this phone never inherits this protection record.
    if (protection.ownerHash && owner && protection.ownerHash !== owner) {
      await resetNative();
      openApp();
      return;
    }
    if (protection.state !== 'ok') {
      showLock('account', protection.state === 'invalidated' ? COPY.invalidated : COPY.corrupted);
      return;
    }
    if (!status.locked) { openApp(); return; }
    showLock('locked');
    startSessionCheck();
    autoPrompt();
  }

  /** app.js: called once a local session exists, before anything private renders. */
  async function gate({ userId } = {}) {
    if (!plugin) return 'open';
    await statusReady;
    if (phase === 'off' || phase === 'open') return 'open';
    if (phase === 'locked') return waitForOpen();
    gateArgs = { userId };
    const result = waitForOpen();
    await evaluate(gateArgs);
    return result;
  }

  /** app.js: no session on this phone. Nothing left to protect. */
  async function signedOut() {
    if (!plugin) return;
    await statusReady;
    if (status?.protection?.enabled) await resetNative();
    if (phase !== 'open' && phase !== 'off') {
      phase = 'open';
      root.classList.remove(LOCKED, PENDING);
      setInert(false);
      render();
      releaseCover();
      settle('account-login');
    }
  }

  async function lockForResume() {
    await refreshStatus();
    if (phase === 'locked') return;
    if (!status?.protection?.enabled) { releaseCover(); return; }
    if (status.protection.state !== 'ok') {
      showLock('account', status.protection.state === 'invalidated' ? COPY.invalidated : COPY.corrupted);
      return;
    }
    showLock('locked');
    startSessionCheck();
    autoPrompt();
  }

  // One resume lock at a time: the native event and whenOpen() can both see it.
  let resumeLocking = null;
  function resumeLock() {
    if (!resumeLocking) resumeLocking = lockForResume().catch(() => {}).finally(() => { resumeLocking = null; });
    return resumeLocking;
  }

  if (plugin && typeof plugin.addListener === 'function') {
    Promise.resolve(plugin.addListener('lockRequired', () => {
      if (phase === 'open') resumeLock();
      else releaseCover();
    })).catch(() => {});
  }

  /**
   * Native Notifications V1: resolves true only once US is open for the person
   * (protection off, or unlocked after the session check); false if the lock
   * ended in the account login instead. A notification tap can arrive before
   * the native "lockRequired" event of the same resume, so the native lock
   * state is re-read first: navigation never runs behind a lock that is about
   * to appear.
   */
  async function whenOpen() {
    if (!plugin) return true;
    await statusReady;
    if (phase === 'open') {
      await refreshStatus();
      if (phase === 'open' && status?.protection?.enabled && status.locked) await resumeLock();
    }
    if (phase === 'booting' || phase === 'locked') return (await waitForOpen()) === 'open';
    return phase === 'open' || phase === 'off';
  }

  // ---- Settings -----------------------------------------------------------

  async function settingState() {
    if (!plugin) return { visible: false };
    await statusReady;
    await refreshStatus();
    if (!status) return { visible: false };
    const { biometry, protection } = status;
    const visible = biometry.reason !== 'unsupported' || protection.enabled;
    let detail = 'Solo su questo telefono';
    if (!biometry.available && !protection.enabled) {
      detail = biometry.reason === 'not_enrolled'
        ? 'Prima configurala nelle impostazioni del telefono'
        : biometry.reason === 'denied' ? 'Consentila a US nelle impostazioni del telefono' : 'Non disponibile ora';
    }
    return {
      visible,
      enabled: protection.enabled,
      available: biometry.available,
      label: settingLabel(biometry.kind),
      detail
    };
  }

  async function enable() {
    if (!plugin) return { ok: false, code: 'unsupported' };
    const owner = await ownerHashFor(window.usProfile?.id);
    if (!owner) return { ok: false, code: 'invalid_argument' };
    try {
      status = normalizeStatus(await plugin.enable({ ownerHash: owner, ...promptOptions('Proteggi US') }));
      return { ok: status.protection.enabled, code: status.protection.enabled ? '' : 'error' };
    } catch (error) {
      return { ok: false, code: errorCode(error) };
    }
  }

  async function disable() {
    if (!plugin) return { ok: false, code: 'unsupported' };
    try {
      status = normalizeStatus(await plugin.disable(promptOptions('Disattiva la protezione')));
      return { ok: !status.protection.enabled, code: status.protection.enabled ? 'error' : '' };
    } catch (error) {
      const code = errorCode(error);
      if (code === 'invalidated') showLock('account', COPY.invalidated);
      return { ok: false, code };
    }
  }

  /** Settings logout: call only after the session has been signed out. */
  async function reset() {
    if (!plugin) return;
    await statusReady;
    await resetNative();
  }

  function configure(next = {}) {
    if (typeof next.verifySession === 'function') hooks.verifySession = next.verifySession;
    if (typeof next.accountLogin === 'function') hooks.accountLogin = next.accountLogin;
    if (typeof next.reload === 'function') hooks.reload = next.reload;
  }

  function bindUi() {
    $('usAppLockPrimary')?.addEventListener('click', () => { onPrimary(); });
    $('usAppLockSecondary')?.addEventListener('click', () => { onSecondary(); });
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindUi, { once: true });
  else bindUi();

  if (!plugin) root.classList.remove(PENDING);

  window.UsAppLock = Object.freeze({
    supported: () => Boolean(plugin),
    gate,
    signedOut,
    configure,
    settingState,
    enable,
    disable,
    reset,
    unlock,
    accountLogin,
    whenOpen,
    isLocked: () => phase === 'locked' || phase === 'booting',
    labels: Object.freeze({ unlockLabel, settingLabel }),
    _state: () => ({ phase, mode, message, working })
  });
})();
