(() => {
  'use strict';
  if (window.UsNotifications) return;

  // US Native Notifications V1 — the native app's side of the US notification
  // domain (docs/native/NATIVE_NOTIFICATIONS_V1.md).
  //
  // The PWA never uses this module: Web Push stays in app.js + the service
  // worker. In the Capacitor app this module owns:
  //   * the OS permission, asked only from an explicit "Attiva";
  //   * the FCM (Android) / APNs (iOS) token of THIS installation, registered
  //     through register_native_push_device (identity from the session only);
  //   * logout / account recovery: only this installation is removed, with a
  //     retry if the phone is offline, and a new installation id afterwards;
  //   * taps: the payload is parsed against an allow-list (never a URL) and
  //     becomes ONE pending navigation, executed only after a paired session
  //     exists AND the app lock is open (UsAppLock.whenOpen).

  const platform = window.UsPlatform || null;
  const isNative = Boolean(platform?.isNative);
  const pluginFor = (name) => (isNative && platform.isPluginAvailable?.(name) ? platform.getNativePlugin(name) : null);
  const push = pluginFor('PushNotifications');
  const support = pluginFor('UsPushSupport');

  const TARGETS = Object.freeze(['home', 'today', 'think', 'left_for_you', 'quiz', 'bond', 'calendar']);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const TYPE = /^[a-z_]{1,40}$/;
  const FCM_TOKEN = /^[A-Za-z0-9_:-]+$/;
  const APNS_TOKEN = /^[0-9a-f]+$/;
  const STORE = Object.freeze({
    installation: 'us:notifications:v1:installation',
    owner: 'us:notifications:v1:owner',
    token: 'us:notifications:v1:token',
    retired: 'us:notifications:v1:retired',
    enabled: (userId) => `us:notifications:v1:enabled:${userId}`,
    synced: (userId) => `us:notifications:v1:synced:${userId}`
  });
  const PENDING_MAX_AGE_MS = 30 * 60 * 1000;
  const REGISTRATION_TIMEOUT_MS = 15000;
  const CALL_TIMEOUT_MS = 6000;

  // ---- Pure helpers (also exercised by tests) -----------------------------

  /** Payload → { type, target, ref } or null. Android: data keys; iOS: userInfo.us. */
  function parsePayload(data) {
    if (!data || typeof data !== 'object') return null;
    const source = data.us && typeof data.us === 'object' ? data.us : data;
    if (String(source.v ?? '') !== '1') return null;
    const target = typeof source.target === 'string' ? source.target : '';
    if (!TARGETS.includes(target)) return null;
    const type = typeof source.type === 'string' && TYPE.test(source.type) ? source.type : 'unknown';
    const ref = typeof source.ref === 'string' && UUID.test(source.ref) ? source.ref.toLowerCase() : null;
    return Object.freeze({ type, target, ref });
  }

  /** Native action event → navigation intent, or null (dismiss, malformed, unknown action). */
  function intentFromAction(event) {
    const actionId = typeof event?.actionId === 'string' ? event.actionId : 'tap';
    if (actionId !== 'tap' && actionId !== 'ricambia') return null;
    const payload = parsePayload(event?.notification?.data);
    if (!payload) return null;
    // "Ricambia" only exists on Ti penso: it opens the one-tap reaction sheet, it never reacts by itself.
    const action = actionId === 'ricambia' && payload.type === 'think' ? 'ricambia' : 'open';
    return Object.freeze({ ...payload, action });
  }

  function normalizeToken(platformName, raw) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (platformName === 'ios') {
      const hex = value.toLowerCase();
      return hex.length >= 64 && hex.length <= 200 && APNS_TOKEN.test(hex) ? hex : '';
    }
    return value.length >= 32 && value.length <= 4096 && FCM_TOKEN.test(value) ? value : '';
  }

  // ---- Small utilities ----------------------------------------------------

  function withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms);
      Promise.resolve(promise).then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error) => { clearTimeout(timer); reject(error); }
      );
    });
  }
  const read = (key) => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch (_) {} };
  const remove = (key) => { try { localStorage.removeItem(key); } catch (_) {} };
  function client() {
    // eslint-disable-next-line no-undef
    try { return sb; } catch (_) { return window.sb || null; }
  }
  function newUuid() {
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  function installationId({ create = true } = {}) {
    const current = read(STORE.installation);
    if (current && UUID.test(current)) return current;
    if (!create) return '';
    const fresh = newUuid();
    write(STORE.installation, fresh);
    return fresh;
  }
  function retired() {
    try {
      const list = JSON.parse(read(STORE.retired) || '[]');
      return Array.isArray(list) ? list.filter((entry) => typeof entry === 'string' ? UUID.test(entry) : entry && UUID.test(entry.id)) : [];
    } catch (_) { return []; }
  }
  function setRetired(list) {
    const unique = list.filter((entry, index) => list.findIndex((other) => JSON.stringify(other) === JSON.stringify(entry)) === index);
    if (unique.length) write(STORE.retired, JSON.stringify(unique));
    else remove(STORE.retired);
  }
  const isEnabledFor = (userId) => Boolean(userId) && read(STORE.enabled(userId)) === '1';

  // ---- Session --------------------------------------------------------------

  let session = { ready: false, userId: '' };
  let busy = false;
  let lastToken = '';
  let tokenWaiters = [];
  let resumeInFlight = null;
  let serverConfirmedFor = '';
  let cleanup = Promise.resolve();
  let authGeneration = 0;
  let registrationInFlight = Promise.resolve();
  // Serialize native owner retirement. A delayed A registration cannot
  // reactivate A after B logs in and the native epoch rotates.
  let nativeOwnerClear = Promise.resolve();
  function retireNativeOwner() {
    if (!support?.clearPushOwner) return Promise.resolve();
    const work = nativeOwnerClear.catch(() => {}).then(async () => {
      const result = await withTimeout(support.clearPushOwner(), CALL_TIMEOUT_MS);
      if (result?.cleared !== true) throw new Error('native_owner_clear_failed');
    });
    nativeOwnerClear = work;
    return work;
  }
  async function bindNativeOwner(status, installation, owner) {
    if (status.platform !== 'android') return;
    await nativeOwnerClear;
    assertOwner(owner);
    if (!UUID.test(status.bindingEpoch || '') || !support?.bindPushOwner) throw new Error('native_owner_gate_unavailable');
    const result = await withTimeout(support.bindPushOwner({
      ownerId: owner.userId,
      installationId: installation,
      expectedEpoch: status.bindingEpoch
    }), CALL_TIMEOUT_MS);
    assertOwner(owner);
    if (result?.bound !== true) throw new Error('native_owner_gate_stale');
  }
  const assertOwner = (owner) => { if (!session.ready || session !== owner) throw new Error('stale_session'); };
  function retireInstallation() {
    const id = installationId({ create: false });
    const userId = read(STORE.owner) || session.userId;
    if (id) setRetired([{ id, userId, token: read(STORE.token) || lastToken }, ...retired()]);
    remove(STORE.installation); remove(STORE.owner); remove(STORE.token);
    if (userId) { remove(STORE.enabled(userId)); remove(STORE.synced(userId)); }
    lastToken = '';
  }

  // ---- Native status ------------------------------------------------------

  async function nativeStatus() {
    if (!push || !support) return { available: false };
    try {
      const raw = await withTimeout(support.getStatus(), 2500);
      const platformName = raw?.platform === 'ios' ? 'ios' : 'android';
      return {
        available: true,
        platform: platformName,
        provider: platformName === 'ios' ? 'apns' : 'fcm',
        bindingEpoch: platformName === 'android' ? raw?.bindingEpoch : null,
        configured: raw?.configured === true,
        environment: platformName === 'ios' ? (raw?.environment === 'development' ? 'development' : 'production') : null,
        notificationsEnabled: raw?.notificationsEnabled !== false,
        channelBlocked: raw?.partnerBlocked === true || raw?.remindersBlocked === true
      };
    } catch (_) {
      return { available: false };
    }
  }

  async function permission() {
    try {
      const result = await withTimeout(push.checkPermissions(), 2500);
      return ['granted', 'denied', 'prompt', 'prompt-with-rationale'].includes(result?.receive) ? result.receive : 'prompt';
    } catch (_) { return 'prompt'; }
  }

  // ---- Token ----------------------------------------------------------------

  function settleToken(error, value) {
    const waiters = tokenWaiters;
    tokenWaiters = [];
    waiters.forEach((w) => (error ? w.reject(error) : w.resolve(value)));
  }

  async function requestToken() {
    // Obtaining a token also reactivates provider delivery (notably APNs).
    // Do not reactivate while a previous account still owns an unresolved row.
    if (retired().some(entry => typeof entry === 'string' || entry.userId !== session.userId)) throw new Error('previous_account_retirement_pending');
    const waiting = new Promise((resolve, reject) => tokenWaiters.push({ resolve, reject }));
    waiting.catch(() => {}); // logout can reject while the plugin call is pending
    await push.register();
    return withTimeout(waiting, REGISTRATION_TIMEOUT_MS);
  }

  async function registerToken(token, status, owner = session) {
    assertOwner(owner);
    const db = client();
    if (!db || !session.ready) throw new Error('no_session');
    const normalized = normalizeToken(status.platform, token);
    if (!normalized) throw new Error('token_invalid');
    const installation = installationId();
    if (retired().some((entry) => typeof entry === 'string' || !entry.token || entry.token === normalized)) throw new Error('retired_token');
    write(STORE.owner, owner.userId);
    write(STORE.token, normalized);
    const pendingRetired = null;
    const signature = JSON.stringify([installation, normalized, status.environment, new Date().toISOString().slice(0, 10)]);
    // On every cold app process, confirm the row with the server at least once.
    // This repairs a token row that may have been pruned remotely while the
    // device still has a valid provider token. Later resumes in the same
    // process stay cheap and use the local signature.
    if (!pendingRetired && serverConfirmedFor === session.userId && read(STORE.synced(session.userId)) === signature) {
      await bindNativeOwner(status, installation, owner);
      return true;
    }
    const request = db.rpc('register_native_push_device', {
      target_installation_id: installation,
      target_platform: status.platform,
      target_provider: status.provider,
      target_token: normalized,
      target_environment: status.environment,
      target_retired_installation_id: pendingRetired
    });
    registrationInFlight = Promise.resolve(request).catch(() => {});
    const { error } = await withTimeout(request, CALL_TIMEOUT_MS);
    if (error) throw error;
    assertOwner(owner);
    await bindNativeOwner(status, installation, owner);
    if (pendingRetired) setRetired(retired().filter((id) => id !== pendingRetired));
    write(STORE.synced(session.userId), signature);
    serverConfirmedFor = session.userId;
    return true;
  }

  async function onRegistration(event) {
    lastToken = typeof event?.value === 'string' ? event.value : '';
    settleToken(null, lastToken);
    // Token rotation while signed in and enabled on this installation.
    if (!session.ready || !isEnabledFor(session.userId) || busy) return;
    const owner = session;
    try {
      const status = await nativeStatus();
      if (status.available && status.configured) await registerToken(lastToken, status, owner);
    } catch (_) { /* retried at the next start */ }
  }

  // ---- Navigation queue -------------------------------------------------------

  let pending = null;
  let navigate = null;
  let flushing = null;

  function whenVisible() {
    if (!document.hidden) return Promise.resolve();
    return new Promise((resolve) => {
      const onVisible = () => {
        if (document.hidden) return;
        document.removeEventListener('visibilitychange', onVisible);
        resolve();
      };
      document.addEventListener('visibilitychange', onVisible);
    });
  }

  async function lockOpen() {
    const lock = window.UsAppLock;
    if (!lock) return true;
    if (typeof lock.whenOpen === 'function') return lock.whenOpen();
    return !lock.isLocked?.();
  }

  function flush() {
    if (flushing) return flushing;
    flushing = (async () => {
      while (pending && session.ready && typeof navigate === 'function') {
        await whenVisible();
        // Let the native resume events of the same tap (lockRequired) arrive first.
        await new Promise((resolve) => setTimeout(resolve, 120));
        const open = await lockOpen();
        if (!open) { pending = null; return; } // the lock ended in the account login
        if (!session.ready || !pending) return; // signed out meanwhile: dropped by signedOut()
        const intent = pending;
        pending = null;
        if (Date.now() - intent.at > PENDING_MAX_AGE_MS) continue;
        try { await navigate(intent); } catch (_) { /* a navigation error never breaks the queue */ }
      }
    })().finally(() => { flushing = null; });
    return flushing;
  }

  function queue(intent) {
    if (!intent) return;
    pending = { ...intent, at: Date.now() }; // the latest tap wins
    flush();
  }

  function onAction(event) {
    queue(intentFromAction(event));
  }

  function onForeground(notification) {
    const payload = parsePayload(notification?.data);
    if (!payload || !session.ready) return;
    // Nothing is shown on top of the lock screen.
    if (window.UsAppLock?.isLocked?.()) return;
    window.dispatchEvent(new CustomEvent('us-notification-received', { detail: payload }));
    window.UsFeedback?.attention?.();
  }

  // ---- Public API ---------------------------------------------------------------

  /** Settings / Oggi card state for THIS installation. */
  async function getState() {
    if (!push) return { supported: false };
    const status = await nativeStatus();
    if (!status.available) return { supported: true, kind: 'unavailable' };
    if (!status.configured) return { supported: true, kind: 'unavailable', platform: status.platform };
    const perm = await permission();
    const enabled = isEnabledFor(session.userId);
    if (perm === 'denied') return { supported: true, kind: 'denied', platform: status.platform, enabled };
    if (enabled && perm === 'granted' && (!status.notificationsEnabled || status.channelBlocked)) {
      return { supported: true, kind: 'settings', platform: status.platform, enabled };
    }
    if (enabled && perm === 'granted') return { supported: true, kind: 'active', platform: status.platform, enabled };
    return { supported: true, kind: 'inactive', platform: status.platform, enabled: false, permission: perm };
  }

  /** User-initiated only ("Attiva"): permission → token → registration. */
  async function enable() {
    if (!push || !session.ready) return { ok: false, kind: 'unavailable' };
    if (busy) return { ok: false, kind: 'busy' };
    busy = true;
    const owner = session;
    try {
      await cleanup; assertOwner(owner);
      const status = await nativeStatus();
      if (!status.available || !status.configured) return { ok: false, kind: 'unavailable' };
      let perm = await permission();
      if (perm === 'prompt' || perm === 'prompt-with-rationale') {
        const result = await push.requestPermissions();
        perm = result?.receive || 'denied';
      }
      if (perm !== 'granted') return { ok: false, kind: 'denied' };
      assertOwner(owner);
      const token = await requestToken();
      await registerToken(token, status, owner);
      assertOwner(owner);
      write(STORE.enabled(session.userId), '1');
      return { ok: true, kind: 'active' };
    } catch (_) {
      return { ok: false, kind: 'error' };
    } finally {
      busy = false;
    }
  }

  async function stopNativeDelivery(status) {
    // Android: never touch FirebaseMessaging without a Firebase configuration.
    if (status?.available && status.configured) {
      try { await withTimeout(push.unregister(), CALL_TIMEOUT_MS); } catch (_) {}
    }
  }

  /** Settings "Disattiva su questo dispositivo": only this installation, account untouched. */
  async function disable() {
    if (!push || !session.ready) return { ok: false };
    if (busy) return { ok: false, kind: 'busy' };
    busy = true;
    try {
      const installation = installationId({ create: false });
      if (installation) {
        const { error } = await withTimeout(client().rpc('unregister_native_push_device', { target_installation_id: installation }), CALL_TIMEOUT_MS);
        if (error) return { ok: false };
      }
      await retireNativeOwner();
      await stopNativeDelivery(await nativeStatus());
      remove(STORE.enabled(session.userId));
      remove(STORE.synced(session.userId));
      return { ok: true };
    } catch (_) {
      return { ok: false };
    } finally {
      busy = false;
    }
  }

  /**
   * Logout and app-lock account recovery, BEFORE signOut. Never throws, never
   * blocks the logout: if the server cannot be reached the installation id is
   * kept as "retired" and removed at the next authenticated start.
   */
  async function revokeDevice() {
    pending = null;
    if (!push) return;
    const userId = session.userId;
    // Native OS gate is retired before slow or offline server revoke.
    try { await retireNativeOwner(); } catch (_) { /* logout still proceeds */ }
    retireInstallation();
    session = { ready: false, userId };
    cleanup = (async () => {
      let settled = true;
      try { await withTimeout(registrationInFlight, CALL_TIMEOUT_MS); } catch (_) { settled = false; }
      // A timed-out registration may still commit later. Keep its token blocked.
      if (settled) await retryRetired(userId);
      await stopNativeDelivery(await nativeStatus());
      try { await withTimeout(push.removeAllDeliveredNotifications(), 2500); } catch (_) {}
      try { await withTimeout(support?.setBadge?.({ count: 0 }), 2500); } catch (_) {}
    })();
    await cleanup;
  }

  async function retryRetired(userId = session.userId) {
    const db = client();
    if (!db) return;
    try { await withTimeout(registrationInFlight, CALL_TIMEOUT_MS); } catch (_) { return; }
    const ownsSession = async () => {
      if (!db.auth?.getSession) return true;
      try { const result = await withTimeout(db.auth.getSession(), CALL_TIMEOUT_MS); return result?.data?.session?.user?.id === userId; } catch (_) { return false; }
    };
    for (const entry of retired()) {
      // UUID-only legacy entries have no provable owner and stay quarantined.
      if (typeof entry === 'string' || entry.userId !== userId) continue;
      try {
        if (!await ownsSession()) return;
        const { error } = await withTimeout(db.rpc('unregister_native_push_device', { target_installation_id: entry.id }), CALL_TIMEOUT_MS);
        if (!error && await ownsSession()) setRetired(retired().filter((x) => typeof x === 'string' || x.id !== entry.id));
      } catch (_) { return; }
    }
  }

  async function clearSeenNotifications() {
    if (!push || document.hidden) return;
    const open = await lockOpen();
    if (!open || document.hidden) return;
    // Android launchers derive their dot/count from delivered notifications;
    // iOS also has an explicit badge. Clearing both only after the private app
    // is actually open keeps lock-screen privacy intact.
    try { await withTimeout(push.removeAllDeliveredNotifications(), 2500); } catch (_) {}
    try { await withTimeout(support?.setBadge?.({ count: 0 }), 2500); } catch (_) {}
  }

  async function syncEnabledInstallation() {
    if (!push || !session.ready || !isEnabledFor(session.userId)) return;
    const owner = session;
    const status = await nativeStatus();
    if (!status.available || !status.configured || (await permission()) !== 'granted') return;
    if (session !== owner) return;
    try {
      const token = await requestToken();
      await registerToken(token, status, owner);
    } catch (_) { /* retry on the next foreground/cold start */ }
  }

  /**
   * Native foreground recovery. Safe to call repeatedly:
   * - retries retired installation cleanup;
   * - clears notifications/badge only once the app lock is open;
   * - asks the provider for the current token without re-prompting permission;
   * - re-confirms the server row once per cold process, then only on rotation/day change.
   */
  function resume() {
    if (resumeInFlight) return resumeInFlight;
    resumeInFlight = (async () => {
      if (!push || !session.ready || document.hidden) return;
      const owner = session;
      await retryRetired();
      if (session !== owner) return;
      if (!isEnabledFor(session.userId)) return;
      await clearSeenNotifications();
      await syncEnabledInstallation();
    })().finally(() => { resumeInFlight = null; });
    return resumeInFlight;
  }

  /** app.js: a paired profile is ready (after the app lock gate). */
  async function authReady(profile) {
    if (!profile?.id) return;
    if ((session.userId && session.userId !== profile.id) || (read(STORE.owner) && read(STORE.owner) !== profile.id)) signedOut();
    const generation = ++authGeneration;
    await cleanup;
    try { await nativeOwnerClear; } catch (_) { /* registration fails closed */ }
    if (generation !== authGeneration) return;
    session = { ready: true, userId: profile.id };
    flush();
    await resume();
  }

  /** app.js: no session on this phone. */
  function signedOut() {
    authGeneration++;
    // Forced account recovery must also invalidate the private OS gate.
    if (push) retireNativeOwner().catch(() => {});
    if (push && installationId({ create: false })) {
      retireInstallation();
      cleanup = cleanup.then(async () => {
        await stopNativeDelivery(await nativeStatus());
        try { await withTimeout(push.removeAllDeliveredNotifications(), 2500); } catch (_) {}
        try { await withTimeout(support?.setBadge?.({ count: 0 }), 2500); } catch (_) {}
      });
    }
    settleToken(new Error('signed_out'));
    session = { ready: false, userId: '' };
    serverConfirmedFor = '';
    pending = null;
  }

  function onNavigate(handler) {
    navigate = typeof handler === 'function' ? handler : null;
    flush();
  }

  async function openSettings() {
    try { return (await support?.openSettings?.())?.opened === true; } catch (_) { return false; }
  }

  if (push && typeof push.addListener === 'function') {
    const listen = (name, fn) => Promise.resolve(push.addListener(name, fn)).catch(() => {});
    listen('registration', onRegistration);
    listen('registrationError', () => settleToken(new Error('registration_failed')));
    listen('pushNotificationReceived', onForeground);
    // Retained by the native plugin until this listener exists: covers cold start.
    listen('pushNotificationActionPerformed', onAction);
  }

  document.addEventListener?.('visibilitychange', () => {
    if (!document.hidden) resume().catch(() => {});
  });

  window.UsNotifications = Object.freeze({
    supported: () => Boolean(push),
    getState,
    enable,
    disable,
    revokeDevice,
    authReady,
    signedOut,
    resume,
    onNavigate,
    openSettings,
    _test: Object.freeze({ parsePayload, intentFromAction, normalizeToken, pending: () => pending })
  });
})();
