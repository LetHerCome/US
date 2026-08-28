import { Capacitor, registerPlugin } from '@capacitor/core';

globalThis.UsCapacitorRuntime = Object.freeze({
  isNativePlatform: () => Capacitor.isNativePlatform(),
  isPluginAvailable: (name) => Capacitor.isPluginAvailable(name),
  registerPlugin
});
