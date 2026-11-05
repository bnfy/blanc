'use strict';
// The utility sheet's bridge (S1.5, F16). Shipping's Favorites, History and
// Downloads pages run in a frame of the Island host, which answers their
// window.bowserPages from Chromium's own models (host.js sheetBridge).
// Shipping's main decides where a click in the sheet goes and closes it on
// Escape before the page sees the key; here the host does both, so the
// frame never navigates itself.
(() => {
  const host = window.parent !== window ? window.parent.BlancPrototypeHost : null;
  const page = /^\/pages\/([a-z]+)\.html$/.exec(location.pathname)?.[1];
  const bridge = page && host?.sheetBridge ? host.sheetBridge(window, page) : null;
  if (!bridge) return;
  window.bowserPages = bridge;
  const follow = (event) => {
    if (event.defaultPrevented || event.button !== (event.type === 'auxclick' ? 1 : 0)) return;
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link) return;
    event.preventDefault();
    host.sheetLink(window, link.href);
  };
  window.addEventListener('click', follow);
  window.addEventListener('auxclick', follow);
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    host.sheetEscape(window);
  }, true);
})();
// Bring Your Tabs (F40) arrives with S3; its page isn't in the fork yet.
document.addEventListener('DOMContentLoaded', () => {
  const bringTabs = document.getElementById('bringTabsBtn');
  if (bringTabs) bringTabs.style.display = 'none';
});
