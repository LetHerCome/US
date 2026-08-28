(() => {
  'use strict';

  const runtime = window.UsCapacitorRuntime || window.Capacitor || null;
  const isNative = Boolean(runtime?.isNativePlatform?.());
  const plugins = new Map();
  let nativeBackListener = null;

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
    exitNativeApp
  });
})();
