// Prototype compatibility rule: suppress only the Store's Chrome-download callout.
(() => {
  if (location.origin !== 'https://chromewebstore.google.com' || window !== top) return;
  if (globalThis.__blancStorePromotionObserver) return;
  function suppress() {
    for (const link of document.querySelectorAll('a[href]')) {
      let url;
      try { url = new URL(link.href); } catch { continue; }
      if (url.origin !== 'https://www.google.com' && url.origin !== 'https://google.com') continue;
      if (url.pathname !== '/chrome/' || url.searchParams.get('utm_medium') !== 'material-callout' ||
          url.searchParams.get('utm_campaign') !== 'cws') continue;
      // Find the smallest callout containing its heading and dismiss button.
      // Never suppress a page, installation control, or generic dialog.
      for (let box = link.parentElement; box && box !== document.body; box = box.parentElement) {
        if (box.textContent.length > 1200) break;
        if (!box.querySelector('h1,h2,h3,[role="heading"]') || !box.querySelector('button')) continue;
        if (box.querySelector('input,select,textarea') || box.querySelectorAll('a[href]').length !== 1) break;
        box.style.setProperty('display', 'none', 'important');
        break;
      }
    }
  }
  suppress();
  globalThis.__blancStorePromotionObserver = new MutationObserver(suppress);
  globalThis.__blancStorePromotionObserver.observe(document.documentElement, { childList: true, subtree: true });
})();
