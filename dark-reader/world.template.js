// Runs inside Blanc's Dark websites isolated world (DARK_WEBSITES_WORLD_ID),
// never in the page's own world, so pages cannot see or call the engine.
// dark-reader/build.mjs replaces the engine marker below with the pinned
// Dark Reader API build and embeds the result in the generated preload.
(function () {
  'use strict';
  if (globalThis.__blancDarkWebsites) return;

  var DarkReader = (function () {
    // Hide CommonJS/AMD so the UMD build attaches to this world's global.
    var exports, module, define;
    /*__DARK_READER_ENGINE__*/
    return globalThis.DarkReader;
  })();

  // The preload exposes only this one-method bridge into this world.
  var bridge = globalThis.__blancDarkWebsitesBridge;

  // Dark Reader reads cross-origin stylesheets through this hook, ahead of
  // its extension messaging path. Only stylesheet text is ever requested.
  globalThis.DarkReader = {
    Plugins: {
      fetch: function (request) {
        if (!bridge || !request || request.responseType !== 'text' || request.mimeType !== 'text/css') {
          return Promise.reject(new Error('unavailable'));
        }
        return bridge.fetchCss(String(request.url)).then(function (text) {
          if (typeof text !== 'string') throw new Error('unavailable');
          return text;
        });
      },
    },
  };

  var latest = { on: false };
  var started = false;

  function render() {
    if (!started) return;
    if (latest.on) DarkReader.enable({}, null);
    else DarkReader.disable();
  }

  function apply(state) {
    latest = { on: !!(state && state.on === true) };
    render();
  }

  // A session preload runs before the parser creates <head>, and the engine
  // needs it. Start the moment it exists so the first paint is already dark.
  function start() {
    if (started) return;
    started = true;
    render();
  }

  globalThis.__blancDarkWebsites = Object.freeze({ apply: apply });

  if (document.head) {
    start();
  } else {
    var observer = new MutationObserver(function () {
      if (!document.head) return;
      observer.disconnect();
      start();
    });
    observer.observe(document, { childList: true, subtree: true });
  }
})();
