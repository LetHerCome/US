import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics } from '@capacitor/haptics';

globalThis.UsCapacitorRuntime = Object.freeze({
  isNativePlatform: () => Capacitor.isNativePlatform(),
  isPluginAvailable: (name) => Capacitor.isPluginAvailable(name),
  registerPlugin,
  app: App,
  haptics: Haptics
});
