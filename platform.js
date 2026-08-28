(() => {
  'use strict';

  const runtime = window.UsCapacitorRuntime || window.Capacitor || null;
  const isNative = Boolean(runtime?.isNativePlatform?.());
  const plugins = new Map();

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

  window.UsPlatform = Object.freeze({
    isNative,
    canUseServiceWorker: !isNative,
    canUseWebPush: !isNative,
    canUsePwaUpdates: !isNative,
    canUsePrivateWebMediaCache: !isNative,
    isPluginAvailable,
    getNativePlugin
  });
})();
