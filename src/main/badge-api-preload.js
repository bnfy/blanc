'use strict';

const { contextBridge } = require('electron');

// A browser window hosts unrelated sites under one app icon. Keep page scripts
// from treating Blanc's shared Dock/launcher badge as if it belonged to their
// origin. Service workers are deliberately excluded: Electron's isolated
// service-worker preload realm has a known full-GC crash path. The main process
// guard clears the native badge if a service worker writes it instead.
contextBridge.executeInMainWorld({
  func: () => {
    const noBadge = async () => undefined;
    const navigatorPrototype = Object.getPrototypeOf(navigator);
    Object.defineProperties(navigatorPrototype, {
      setAppBadge: {
        configurable: true,
        writable: true,
        value: noBadge,
      },
      clearAppBadge: {
        configurable: true,
        writable: true,
        value: noBadge,
      },
    });
  },
});
