import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics } from '@capacitor/haptics';
import { installAppLinks } from './app-links.mjs';

globalThis.UsCapacitorRuntime = Object.freeze({
  isNativePlatform: () => Capacitor.isNativePlatform(),
  isPluginAvailable: (name) => Capacitor.isPluginAvailable(name),
  getPlatform: () => Capacitor.getPlatform(),
  registerPlugin,
  app: App,
  haptics: Haptics
});

if (Capacitor.isNativePlatform()) installAppLinks({ app: App, target: globalThis });
