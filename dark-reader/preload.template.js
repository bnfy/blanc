'use strict';
// Dark websites session preload. Main frames of http(s) pages only.
//
// It asks main once, synchronously, whether to darken this page, so the first
// paint is already dark. When the answer is no, the engine is never run. When
// it is yes, the pinned Dark Reader engine runs in its own isolated world with
// its own CSP: the page's CSP would otherwise block its injected styles, and
// a separate world keeps that exemption away from Blanc's other preloads.
// The only capability that world receives is fetching stylesheet text, which
// main validates and bounds (src/main/dark-websites-fetch.js).
//
// Sandboxed session preloads cannot require relative modules, so
// dark-reader/build.mjs writes the channel names and world id below from
// src/main/dark-websites.js.
if ((location.protocol === 'http:' || location.protocol === 'https:') && window === window.top) {
  const { contextBridge, ipcRenderer, webFrame } = require('electron');

  const WORLD_ID = __WORLD_ID__;
  const GET_CHANNEL = __GET_CHANNEL__;
  const UPDATE_CHANNEL = __UPDATE_CHANNEL__;
  const FETCH_CHANNEL = __FETCH_CHANNEL__;
  const WORLD_CSP = "style-src 'unsafe-inline' *; script-src 'unsafe-inline'";

  let booted = false;

  const boot = () => {
    if (booted) return true;
    try {
      contextBridge.exposeInIsolatedWorld(WORLD_ID, '__blancDarkWebsitesBridge', {
        fetchCss: (url) => ipcRenderer.invoke(FETCH_CHANNEL, String(url)),
      });
      webFrame.setIsolatedWorldInfo(WORLD_ID, {
        securityOrigin: location.origin,
        csp: WORLD_CSP,
        name: 'Blanc Dark websites',
      });
      webFrame.executeJavaScriptInIsolatedWorld(WORLD_ID, [{ code: engineSource() }]);
      booted = true;
    } catch {
      // A failure leaves the page exactly as the site drew it.
    }
    return booted;
  };

  const apply = (state) => {
    const on = !!(state && state.on === true);
    if (!booted && (!on || !boot())) return;
    webFrame.executeJavaScriptInIsolatedWorld(WORLD_ID, [{
      code: `globalThis.__blancDarkWebsites && globalThis.__blancDarkWebsites.apply({ on: ${on} });`,
    }]).catch(() => {});
  };

  let initial = null;
  try {
    initial = ipcRenderer.sendSync(GET_CHANNEL);
  } catch {}
  apply(initial);
  ipcRenderer.on(UPDATE_CHANNEL, (_event, state) => apply(state));
}

// Hoisted so the logic above stays readable; the pinned engine follows.
function engineSource() {
  return __ENGINE_WORLD_SOURCE__;
}
