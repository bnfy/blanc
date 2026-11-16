// Blanc for Android's page adapter, loaded first in every page but the Start Page at
// chrome://blanc/<page>.html. A port of the iPhone's PagesBridge user script:
// it defines window.bowserPages with the members browser-api/bridges.json
// grants the page, posts each call to the browser with chrome.send, and marks
// the document for the phone layout. tools/android-pages.mjs fills in
// __BLANC_MEMBERS__ and writes android-pages-adapter.js; don't edit that copy.
(function () {
  const MEMBERS = __BLANC_MEMBERS__;
  const PAGES = __BLANC_PAGES__;
  const page = /^\/([a-z]+)\.html$/.exec(location.pathname);
  if (location.protocol !== 'chrome:' || location.host !== 'blanc' || !page || PAGES.indexOf(page[1]) === -1) return;
  // The Start Page is the desktop fork's, with its own adapter (android-start.js, start/newtab-adapter.js).
  if (page[1] === 'newtab') return;
  const host = page[1];
  const pending = new Map();
  const listeners = new Map();
  let seq = 0;
  window.__blancResolve = function (id, ok, payload) {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    ok ? p.resolve(payload) : p.reject(new Error(payload));
  };
  window.__blancEmit = function (name, payload) {
    for (const fn of (listeners.get(name) || []).slice()) {
      try { fn(payload); } catch (e) { console.error(e); }
    }
  };
  function call(group, method, args) {
    return new Promise(function (resolve, reject) {
      const id = ++seq;
      pending.set(id, { resolve: resolve, reject: reject });
      chrome.send('blancPages', [id, group, method, args]);
    });
  }
  const api = {};
  for (const m of MEMBERS) {
    if (m.hosts.indexOf(host) === -1) continue;
    const parts = m.name.split('.');
    const method = parts.pop();
    const group = parts.length ? parts.join('.') : null;
    let target = api;
    for (const part of parts) target = target[part] || (target[part] = {});
    if (m.kind === 'event') {
      const name = m.name;
      target[method] = function (fn) {
        if (typeof fn !== 'function') return function () {};
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(fn);
        return function () {
          const list = listeners.get(name) || [];
          const i = list.indexOf(fn);
          if (i !== -1) list.splice(i, 1);
        };
      };
    } else {
      target[method] = function () {
        return call(group, method, Array.prototype.slice.call(arguments));
      };
    }
  }
  window.bowserPages = api;

  // Shipping pages link to blanc://<page>/. The served ones open here; the
  // rest (Settings, Downloads, tab import) aren't pages on Android.
  function pageUrl(href) {
    const link = /^blanc:\/\/([a-z-]+)\/?([?#].*)?$/.exec(href);
    if (!link) return undefined;
    return PAGES.indexOf(link[1]) === -1 ? null : 'chrome://blanc/' + link[1] + '.html' + (link[2] || '');
  }
  window.__blancPageUrl = pageUrl;
  document.addEventListener('click', function (event) {
    const anchor = event.target && event.target.closest && event.target.closest('a[href^="blanc:"]');
    if (!anchor) return;
    const url = pageUrl(anchor.getAttribute('href'));
    event.preventDefault();
    if (!url) return;
    if (anchor.target === '_blank') window.open(url, '_blank');
    else location.assign(url);
  }, true);

  const viewport = () => {
    const meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
    return meta;
  };
  const stylesheet = href => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = href;
    return link;
  };
  // The utility pages open as ordinary tabs, not desktop's card over a scrim.
  // Marked before any page script runs: sheet.js and history.js read the
  // mark, ios-pages.css draws the page.
  if (['history', 'bookmarks', 'shortcuts'].indexOf(host) !== -1) {
    const root = document.documentElement;
    root.dataset.platform = 'ios';
    root.append(viewport(), stylesheet('ios-pages.css'));
  }
})();
