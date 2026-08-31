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

  function haptic(kind, fallbackPattern) {
    const haptics = isNative ? (runtime?.haptics || getNativePlugin('Haptics')) : null;
    let call = null;
    if (kind === 'success' && typeof haptics?.notification === 'function') {
      call = () => haptics.notification({ type: 'SUCCESS' });
    } else if (kind === 'light' && typeof haptics?.impact === 'function') {
      call = () => haptics.impact({ style: 'LIGHT' });
    } else if (kind === 'medium' && typeof haptics?.impact === 'function') {
      call = () => haptics.impact({ style: 'MEDIUM' });
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

  function validOwnerHash(value) {
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : '';
  }

  function safeTimestamp(value) {
    return typeof value === 'string' && value.length <= 40 ? value : '';
  }

  function normalizeWidgetSnapshot(input = {}) {
    const think = input?.modules?.think || {};
    const allowedStatus = new Set(['idle', 'sending', 'sent', 'failed']);
    return {
      schemaVersion: 1,
      ownerHash: validOwnerHash(input.ownerHash),
      updatedAt: safeTimestamp(input.updatedAt),
      modules: {
        think: {
          partnerName: typeof think.partnerName === 'string' ? think.partnerName.slice(0, 80) : '',
          lastReceivedAt: safeTimestamp(think.lastReceivedAt),
          lastSentAt: safeTimestamp(think.lastSentAt),
          lastActionStatus: allowedStatus.has(think.lastActionStatus) ? think.lastActionStatus : 'idle',
          lastActionAt: safeTimestamp(think.lastActionAt)
        }
      }
    };
  }

  async function activateWidgetAccount(ownerHash) {
    const plugin = widgetBridge();
    const safeHash = validOwnerHash(ownerHash);
    if (!plugin || !safeHash || typeof plugin.activateAccount !== 'function') return false;
    await plugin.activateAccount({ ownerHash: safeHash });
    return true;
  }

  async function writeWidgetSnapshot(snapshot) {
    const plugin = widgetBridge();
    if (!plugin || typeof plugin.writeSnapshot !== 'function') return false;
    const safeSnapshot = normalizeWidgetSnapshot(snapshot);
    if (!safeSnapshot.ownerHash) return false;
    await plugin.writeSnapshot({ snapshot: safeSnapshot });
    return true;
  }

  async function clearWidgetSnapshot() {
    const plugin = widgetBridge();
    if (!plugin || typeof plugin.clearSnapshot !== 'function') return false;
    await plugin.clearSnapshot();
    return true;
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
    activateWidgetAccount,
    writeWidgetSnapshot,
    clearWidgetSnapshot,
    getNativeLaunchUrl,
    listenForNativeAppUrl
  });
})();
