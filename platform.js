(() => {
  'use strict';

  const runtime = window.UsCapacitorRuntime || window.Capacitor || null;
  const isNative = Boolean(runtime?.isNativePlatform?.());
  const plugins = new Map();
  let nativeBackListener = null;
  let nativeAppUrlListener = null;

  function isPluginAvailable(name) {
    if (!isNative || !name || typeof runtime?.isPluginAvailable !== 'function') return false;
    try { return Boolean(runtime.isPluginAvailable(name)); }
    catch (_) { return false; }
  }

  function getNativePlugin(name) {
    if (!isPluginAvailable(name) || typeof runtime?.registerPlugin !== 'function') return null;
    if (!plugins.has(name)) plugins.set(name, runtime.registerPlugin(name));
    return plugins.get(name) || null;
  }

  function getNativeApp() {
    if (!isNative) return null;
    if (runtime?.app && typeof runtime.app.addListener === 'function') return runtime.app;
    return getNativePlugin('App');
  }

  function vibrateFallback(pattern) {
    try {
      return typeof window.navigator?.vibrate === 'function'
        ? window.navigator.vibrate(pattern)
        : false;
    } catch (_) {
      return false;
    }
  }

  const NATIVE_HAPTIC_KINDS = Object.freeze({
    success: ['notification', 'SUCCESS'],
    warning: ['notification', 'WARNING'],
    error: ['notification', 'ERROR'],
    light: ['impact', 'LIGHT'],
    medium: ['impact', 'MEDIUM'],
    heavy: ['impact', 'HEAVY'],
    selection: ['selection', '']
  });

  function haptic(kind, fallbackPattern) {
    const haptics = isNative ? (runtime?.haptics || getNativePlugin('Haptics')) : null;
    const profile = NATIVE_HAPTIC_KINDS[kind];
    let call = null;
    if (profile?.[0] === 'notification' && typeof haptics?.notification === 'function') {
      call = () => haptics.notification({ type: profile[1] });
    } else if (profile?.[0] === 'impact' && typeof haptics?.impact === 'function') {
      call = () => haptics.impact({ style: profile[1] });
    } else if (profile?.[0] === 'selection' && typeof haptics?.selectionChanged === 'function') {
      call = () => haptics.selectionChanged();
    }
    if (!call) return Promise.resolve(vibrateFallback(fallbackPattern));
    return Promise.resolve(call()).catch(() => vibrateFallback(fallbackPattern));
  }

  function listenForNativeBackButton(handler) {
    if (!isNative || typeof handler !== 'function') return Promise.resolve(null);
    if (nativeBackListener) return nativeBackListener;

    const app = getNativeApp();
    if (!app || typeof app.addListener !== 'function') return Promise.resolve(null);

    nativeBackListener = Promise.resolve(app.addListener('backButton', (event) => handler(event)))
      .catch(() => {
        nativeBackListener = null;
        return null;
      });
    return nativeBackListener;
  }

  async function exitNativeApp() {
    const app = getNativeApp();
    if (!app || typeof app.exitApp !== 'function') return false;
    await app.exitApp();
    return true;
  }

  function widgetBridge() {
    return getNativePlugin('UsWidgetBridge');
  }

  function hasWidgetBridge() {
    return isPluginAvailable('UsWidgetBridge');
  }

  function validOwnerHash(value) {
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : '';
  }

  function safeInstant(value) {
    return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) ? value : '';
  }

  function safeCivilDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  }

  function safeText(value, max) {
    return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
  }

  // Widget snapshot contract v2 (mirrored natively by UsWidgetContract.java).
  // Allow-list only: whatever else a caller passes (tokens, URLs, ids) is dropped.
  function normalizeWidgetSnapshot(input = {}) {
    const think = input?.think || {};
    const couple = input?.couple || {};
    const countdown = input?.countdown || {};
    const photo = input?.photo || {};
    const kind = ['together', 'days', 'clock'].includes(countdown.kind) ? countdown.kind : '';
    const target = kind === 'clock' ? safeInstant(countdown.target) : kind ? safeCivilDate(countdown.target) : '';
    const active = countdown.active === true && Boolean(kind && target);
    const style = /^(editorial|signal|glass|aurora|orbit|chrome)$/.test(countdown.style || '') ? countdown.style : 'editorial';
    const photoKey = typeof photo.key === 'string' && /^[a-f0-9]{32}$/.test(photo.key) ? photo.key : '';
    const photoReady = photo.state === 'ready' && Boolean(photoKey);
    return {
      schemaVersion: 2,
      ownerHash: validOwnerHash(input.ownerHash),
      updatedAt: safeInstant(input.updatedAt),
      think: {
        partnerName: safeText(think.partnerName, 40),
        lastReceivedAt: safeInstant(think.lastReceivedAt),
        lastSentAt: safeInstant(think.lastSentAt),
        lastAnsweredAt: safeInstant(think.lastAnsweredAt)
      },
      couple: {
        names: (Array.isArray(couple.names) ? couple.names : []).map((name) => safeText(name, 40)).filter(Boolean).slice(0, 2),
        startedOn: safeCivilDate(couple.startedOn),
        frame: typeof couple.frame === 'string' && /^[a-z0-9_]{1,24}$/.test(couple.frame) ? couple.frame : ''
      },
      countdown: {
        active,
        kind: active ? kind : '',
        title: active ? safeText(countdown.title, 60) : '',
        target: active ? target : '',
        style
      },
      photo: {
        state: photoReady ? 'ready' : 'none',
        key: photoReady ? photoKey : '',
        takenOn: photoReady ? safeCivilDate(photo.takenOn) : ''
      }
    };
  }

  async function activateWidgetAccount(ownerHash) {
    const plugin = widgetBridge();
    const safeHash = validOwnerHash(ownerHash);
    if (!plugin || !safeHash || typeof plugin.activateAccount !== 'function') return null;
    const result = await plugin.activateAccount({ ownerHash: safeHash });
    const credential = ['missing', 'ready', 'renew'].includes(result?.credential) ? result.credential : 'missing';
    return { credential };
  }

  async function writeWidgetSnapshot(snapshot) {
    const plugin = widgetBridge();
    if (!plugin || typeof plugin.writeSnapshot !== 'function') return false;
    const safeSnapshot = normalizeWidgetSnapshot(snapshot);
    if (!safeSnapshot.ownerHash) return false;
    await plugin.writeSnapshot({ snapshot: safeSnapshot });
    return true;
  }

  // The native copy of the last snapshot for the active account (seed for a fresh WebView).
  async function readWidgetSnapshot() {
    const plugin = widgetBridge();
    if (!plugin || typeof plugin.readSnapshot !== 'function') return null;
    const result = await plugin.readSnapshot();
    const snapshot = result?.snapshot ? normalizeWidgetSnapshot(result.snapshot) : null;
    const photoKey = typeof result?.photoKey === 'string' && /^[a-f0-9]{32}$/.test(result.photoKey) ? result.photoKey : '';
    return { snapshot: snapshot?.ownerHash ? snapshot : null, photoKey };
  }

  // A downscaled JPEG as base64, for the account in ownerHash. Never a URL.
  async function writeWidgetPhoto(ownerHash, key, base64) {
    const plugin = widgetBridge();
    const safeHash = validOwnerHash(ownerHash);
    const safeKey = typeof key === 'string' && /^[a-f0-9]{32}$/.test(key) ? key : '';
    const data = typeof base64 === 'string' && /^[A-Za-z0-9+/=]+$/.test(base64) && base64.length <= 2_800_000 ? base64 : '';
    if (!plugin || !safeHash || !safeKey || !data || typeof plugin.writePhoto !== 'function') return false;
    await plugin.writePhoto({ ownerHash: safeHash, key: safeKey, data });
    return true;
  }

  // Logout: snapshot, action state, cached photo and send credential.
  async function clearWidgets() {
    const plugin = widgetBridge();
    if (!plugin) return false;
    if (typeof plugin.clearAll === 'function') await plugin.clearAll();
    else if (typeof plugin.clearSnapshot === 'function') await plugin.clearSnapshot();
    else return false;
    return true;
  }

  async function getWidgetDeviceIdentity() {
    const plugin = widgetBridge();
    if (!plugin || typeof plugin.getDeviceIdentity !== 'function') return null;
    const result = await plugin.getDeviceIdentity();
    const deviceId = typeof result?.deviceId === 'string' ? result.deviceId : '';
    return /^[0-9a-f-]{36}$/i.test(deviceId) ? { deviceId } : null;
  }

  async function storeWidgetActionCredential(ownerHash, token, expiresAt = '') {
    const plugin = widgetBridge();
    const safeHash = validOwnerHash(ownerHash);
    const safeToken = typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : '';
    if (!plugin || !safeHash || !safeToken || typeof plugin.setActionCredential !== 'function') return false;
    await plugin.setActionCredential({ ownerHash: safeHash, token: safeToken, expiresAt: safeInstant(expiresAt) });
    return true;
  }

  async function clearWidgetActionCredential() {
    const plugin = widgetBridge();
    if (!plugin || typeof plugin.clearActionCredential !== 'function') return false;
    await plugin.clearActionCredential();
    return true;
  }

  const WIDGET_KINDS = ['think', 'countdown', 'noi', 'photo'];

  async function getInstalledWidgets() {
    const plugin = widgetBridge();
    if (!plugin || typeof plugin.getInstalledWidgets !== 'function') return { installed: {}, pinSupported: false, vendor: 'web' };
    const result = await plugin.getInstalledWidgets();
    const installed = {};
    for (const kind of WIDGET_KINDS) installed[kind] = Math.max(0, Number(result?.installed?.[kind]) || 0);
    return {
      installed,
      pinSupported: result?.pinSupported === true,
      vendor: ['xiaomi', 'samsung', 'android'].includes(result?.vendor) ? result.vendor : 'android'
    };
  }

  async function requestWidgetPin(kind) {
    const plugin = widgetBridge();
    if (!plugin || !WIDGET_KINDS.includes(kind) || typeof plugin.requestPin !== 'function') return { supported: false, requested: false };
    try {
      const result = await plugin.requestPin({ kind });
      return { supported: result?.supported === true, requested: result?.requested === true };
    } catch (_) {
      return { supported: false, requested: false };
    }
  }

  async function openWidgetSettings() {
    const plugin = widgetBridge();
    if (!plugin || typeof plugin.openWidgetSettings !== 'function') return false;
    try { return (await plugin.openWidgetSettings())?.opened !== 'none'; }
    catch (_) { return false; }
  }

  function listenForWidgetPinned(handler) {
    const plugin = widgetBridge();
    if (!plugin || typeof plugin.addListener !== 'function' || typeof handler !== 'function') return Promise.resolve(null);
    return Promise.resolve(plugin.addListener('widgetPinned', handler)).catch(() => null);
  }

  async function getNativeLaunchUrl() {
    const app = getNativeApp();
    if (!app || typeof app.getLaunchUrl !== 'function') return null;
    try { return await app.getLaunchUrl(); }
    catch (_) { return null; }
  }

  function listenForNativeAppUrl(handler) {
    if (!isNative || typeof handler !== 'function') return Promise.resolve(null);
    if (nativeAppUrlListener) return nativeAppUrlListener;
    const app = getNativeApp();
    if (!app || typeof app.addListener !== 'function') return Promise.resolve(null);
    nativeAppUrlListener = Promise.resolve(app.addListener('appUrlOpen', handler)).catch(() => {
      nativeAppUrlListener = null;
      return null;
    });
    return nativeAppUrlListener;
  }

  window.UsPlatform = Object.freeze({
    isNative,
    canUseServiceWorker: !isNative,
    canUseWebPush: !isNative,
    canUsePwaUpdates: !isNative,
    canUsePrivateWebMediaCache: !isNative,
    isPluginAvailable,
    getNativePlugin,
    haptic,
    listenForNativeBackButton,
    exitNativeApp,
    hasWidgetBridge,
    activateWidgetAccount,
    writeWidgetSnapshot,
    readWidgetSnapshot,
    writeWidgetPhoto,
    clearWidgets,
    getWidgetDeviceIdentity,
    storeWidgetActionCredential,
    clearWidgetActionCredential,
    getInstalledWidgets,
    requestWidgetPin,
    openWidgetSettings,
    listenForWidgetPinned,
    getNativeLaunchUrl,
    listenForNativeAppUrl
  });
})();
